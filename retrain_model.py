# retrain_model.py — robust & notebook-aligned
import os
import json
import pickle
import time
import signal
import psycopg2
import pandas as pd
import numpy as np
import re
import unicodedata
from contextlib import contextmanager
from tensorflow.keras.preprocessing.text import Tokenizer
from tensorflow.keras.preprocessing.sequence import pad_sequences
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Embedding, Bidirectional, LSTM, Dense, Dropout, BatchNormalization, Input
from tensorflow.keras.utils import to_categorical
from sklearn.model_selection import train_test_split
from dotenv import load_dotenv

# =======================
# ENV & CONSTANTS
# =======================
load_dotenv()
CSV_DATA_PATH = os.environ.get("CSV_DATA_PATH", "classification_dataset.csv")
MODEL_JSON_PATH = os.environ.get("MODEL_JSON", "sentiment.json")
MODEL_H5_PATH = os.environ.get("MODEL_H5", "sentiments.h5")
MODEL_WEIGHTS_PATH = os.environ.get("MODEL_WEIGHTS", "sentiment.weights.h5")
TOKENIZER_PATH = os.environ.get("TOKENIZER", "tokenizer.pkl")
MODEL_METRICS_PATH = os.environ.get("MODEL_METRICS_PATH", "model_metrics.json")
TRAINING_LOCK = os.environ.get("TRAINING_LOCK", "training.lock")

MAX_SEQ_LEN = int(os.environ.get("MAX_SEQ_LEN", 18))            # notebook uses 18
MAX_NUM_WORDS = int(os.environ.get("MAX_NUM_WORDS", 10000))
EMBEDDING_DIM = int(os.environ.get("EMBEDDING_DIM", 128))       # notebook uses 128
EPOCHS = int(os.environ.get("EPOCHS", 20))                       # notebook used 20
BATCH_SIZE = int(os.environ.get("BATCH_SIZE", 32))
VAL_SPLIT = float(os.environ.get("VAL_SPLIT", 0.1))
RANDOM_STATE = int(os.environ.get("RANDOM_STATE", 42))

LABELS = {"benign": 0, "suspicious": 1, "critical": 2}
VALID_LABELS = set(LABELS.keys())

# DB (prefer discrete vars; fallback to DATABASE_URL)
DB_HOST = os.getenv("DB_HOST", "database.cluster-cdoawqaiof2t.ap-south-1.rds.amazonaws.com")
DB_PORT = os.getenv("DB_PORT", 5432)
DB_NAME = os.getenv("DB_NAME", "textintel")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASS = os.getenv("DB_PASS", "7KcoRnJsJJQ1lzYPNPqx")
DB_SSLMODE = os.getenv("DB_SSLMODE")  # optional: e.g., "require"

DATABASE_URL = os.getenv("DATABASE_URL")


# =======================
# UTILS
# =======================
def _parse_database_url(url: str):
    from urllib.parse import urlparse
    parsed = urlparse(url)
    return {
        "host": parsed.hostname,
        "port": parsed.port or 5432,
        "dbname": parsed.path.lstrip("/"),
        "user": parsed.username,
        "password": parsed.password,
    }

def _require_db_params():
    global DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS
    if all([DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS]):
        return
    if DATABASE_URL:
        cfg = _parse_database_url(DATABASE_URL)
        DB_HOST = DB_HOST or cfg["host"]
        DB_PORT = DB_PORT or cfg["port"]
        DB_NAME = DB_NAME or cfg["dbname"]
        DB_USER = DB_USER or cfg["user"]
        DB_PASS = DB_PASS or cfg["password"]
    missing = [k for k, v in dict(DB_HOST=DB_HOST, DB_PORT=DB_PORT, DB_NAME=DB_NAME, DB_USER=DB_USER, DB_PASS=DB_PASS).items() if not v]
    if missing:
        raise RuntimeError(f"Missing DB env vars: {', '.join(missing)}")

@contextmanager
def db_conn():
    _require_db_params()
    params = dict(host=DB_HOST, port=DB_PORT, dbname=DB_NAME, user=DB_USER, password=DB_PASS)
    if DB_SSLMODE:  # only pass if set, so we don't break existing setups
        params["sslmode"] = DB_SSLMODE
    conn = psycopg2.connect(**params)
    try:
        yield conn
    finally:
        try:
            conn.close()
        except Exception:
            pass

def graceful_lock_cleanup(_signum=None, _frame=None):
    try:
        if os.path.exists(TRAINING_LOCK):
            os.remove(TRAINING_LOCK)
    finally:
        # If called from signal, exit fast
        if _signum is not None:
            raise SystemExit(1)

def touch_training_lock():
    with open(TRAINING_LOCK, "w") as f:
        f.write(str(time.time()))

def remove_training_lock():
    graceful_lock_cleanup()

def ensure_schema():
    """
    Make sure required columns exist and helpful indexes are present.
    Safe to run on every retrain.
    """
    try:
        with db_conn() as conn, conn.cursor() as cur:
            # Columns
            cur.execute("ALTER TABLE classified_messages ADD COLUMN IF NOT EXISTS trained BOOLEAN DEFAULT FALSE;")
            cur.execute("ALTER TABLE classified_messages ADD COLUMN IF NOT EXISTS checked BOOLEAN DEFAULT FALSE;")
            # Indexes (accelerate filters)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_cm_trained ON classified_messages (trained);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_cm_classification ON classified_messages (classification);")
            conn.commit()
    except Exception as e:
        print(f"[WARN] ensure_schema failed: {e}")

def fetch_untrained_db_rows():
    """
    Get rows with NOT trained (false or null) and valid classification.
    Returns DataFrame with columns: id, text, classification
    """
    ensure_schema()
    try:
        with db_conn() as conn:
            query = """
                SELECT id, text, classification
                FROM classified_messages
                WHERE (trained IS FALSE OR trained IS NULL)
                  AND classification IN ('benign','suspicious','critical');
            """
            df = pd.read_sql_query(query, conn)

        # 🔥 sanitize here immediately
        if not df.empty:
            df["text"] = df["text"].map(sanitize_text)

        print(f"[DB] Retrieved {len(df)} untrained rows")
        return df
    except Exception as e:
        print(f"[ERROR] Failed fetching untrained rows: {e}")
        return pd.DataFrame(columns=["id", "text", "classification"])

def mark_db_rows_trained(ids):
    """
    Mark given ids as trained=True, checked=True.
    """
    if not ids:
        return
    try:
        with db_conn() as conn, conn.cursor() as cur:
            # psycopg2 can bind Python list into ANY(%s)
            cur.execute(
                "UPDATE classified_messages SET trained = TRUE, checked = TRUE, updated_at = NOW() WHERE id = ANY(%s);",
                (ids,)
            )
            conn.commit()
        print(f"[DB] Marked {len(ids)} rows as trained+checked.")
    except Exception as e:
        print(f"[ERROR] Failed to mark rows trained: {e}")

def _normalize_label(s):
    return str(s).strip().lower()

def _ensure_csv_header_exists(path):
    if not os.path.exists(path):
        with open(path, "w", encoding="utf-8", newline="") as f:
            f.write("text,classification\n")

def sanitize_text(text: str) -> str:
    if not isinstance(text, str):
        text = str(text)

    # normalize unicode (so fancy characters collapse into normal form)
    text = unicodedata.normalize("NFKC", text)

    # remove control characters
    text = "".join(ch for ch in text if unicodedata.category(ch)[0] != "C")

    # 🔥 keep only letters, numbers, spaces, and full stop `.`
    text = re.sub(r"[^a-zA-Z0-9\s.]", "", text)

    # collapse multiple spaces
    text = re.sub(r"\s+", " ", text).strip()

    return text

def load_csv_data():
    """
    Load CSV. Accepts 'label' alias → 'classification'.
    Enforces valid labels only.
    """
    _ensure_csv_header_exists(CSV_DATA_PATH)
    try:
        df = pd.read_csv(CSV_DATA_PATH, encoding="utf-8")
    except Exception:
        df = pd.read_csv(CSV_DATA_PATH, encoding="utf-8", on_bad_lines="skip")
    if "label" in df.columns and "classification" not in df.columns:
        df = df.rename(columns={"label": "classification"})

    needed = {"text", "classification"}
    if not needed.issubset(set(df.columns)):
        raise ValueError("CSV dataset must contain 'text' and 'classification' columns (or 'text' and 'label').")

    df["text"] = df["text"].astype(str)
    df["classification"] = df["classification"].map(_normalize_label)
    df = df[df["classification"].isin(VALID_LABELS)].dropna(subset=["text", "classification"])
    print(f"[CSV] Loaded {len(df)} samples from CSV")
    return df[["text", "classification"]].copy()

def dedupe_key(s: str) -> str:
    return sanitize_text(s).lower()

def append_db_rows_to_csv(db_df):
    """
    Append DB entries to CSV after:
      - sanitizing text (remove only '.')
      - filtering to valid labels
      - dropping duplicates ONLY from the *new* batch vs existing CSV
      - not touching/removing any existing CSV rows
    Returns the list of DB ids actually appended (so we can mark them trained).
    """
    if db_df.empty:
        print("[CSV] No DB rows to append.")
        return []

    # Keep only valid rows
    db_df = db_df.dropna(subset=["text", "classification"]).copy()
    db_df["classification"] = db_df["classification"].map(_normalize_label)
    db_df = db_df[db_df["classification"].isin(VALID_LABELS)]
    if db_df.empty:
        print("[CSV] All DB rows invalid after filtering.")
        return []

    # Sanitize new texts (remove only '.')
    db_df["text"] = db_df["text"].map(sanitize_text)

    # Load current CSV (without altering existing data)
    _ensure_csv_header_exists(CSV_DATA_PATH)
    try:
        csv_df = pd.read_csv(CSV_DATA_PATH, encoding="utf-8")
    except Exception:
        # fallback if file contains stray bytes
        csv_df = pd.read_csv(CSV_DATA_PATH, encoding="utf-8", on_bad_lines="skip")

    if "label" in csv_df.columns and "classification" not in csv_df.columns:
        csv_df = csv_df.rename(columns={"label": "classification"})

    if not {"text", "classification"}.issubset(csv_df.columns):
        # If CSV is empty or malformed, reset to proper header
        csv_df = pd.DataFrame(columns=["text", "classification"])

    # Build dedupe set from EXISTING CSV (use sanitizer for matching, but don't modify old rows)
    existing_keys = set(csv_df["text"].astype(str).map(dedupe_key).tolist())

    # Compute keys for new rows
    db_df["_key"] = db_df["text"].map(dedupe_key)

    # Drop duplicates WITHIN the new batch (same _key)
    db_df = db_df.drop_duplicates(subset=["_key"])

    # Keep only rows whose key is NOT already in existing CSV
    to_append = db_df[~db_df["_key"].isin(existing_keys)].copy()

    if to_append.empty:
        print("[CSV] All new DB rows are duplicates of existing CSV. Nothing appended.")
        return []

    # Append to CSV (do not rewrite/merge; only append)
    # Save only the two required columns
    to_write = to_append[["text", "classification"]].copy()
    # If CSV is empty (only header), write header; else append without header
    write_header = not os.path.exists(CSV_DATA_PATH) or csv_df.empty
    to_write.to_csv(CSV_DATA_PATH, mode="a", index=False, header=write_header, encoding="utf-8")

    appended_ids = to_append["id"].astype(int).tolist()
    print(f"[CSV] Appended {len(appended_ids)} new rows to CSV (kept all symbols except '.').")
    return appended_ids

def build_model_notebook_style(max_length, tokenizer):
    model = Sequential()
    model.add(Input(shape=(max_length,)))
    model.add(Embedding(input_dim=len(tokenizer.word_index) + 1,
                        output_dim=EMBEDDING_DIM,
                        input_length=max_length))
    # BiLSTM #1
    model.add(Bidirectional(LSTM(64, return_sequences=True)))
    model.add(BatchNormalization())
    model.add(Dropout(0.5))
    # BiLSTM #2
    model.add(Bidirectional(LSTM(32)))
    model.add(Dropout(0.5))
    # Dense stack
    model.add(Dense(64, activation='relu'))
    model.add(BatchNormalization())
    model.add(Dropout(0.3))
    # Output
    model.add(Dense(len(LABELS), activation='softmax'))
    model.compile(optimizer="adam", loss="categorical_crossentropy", metrics=["accuracy"])
    return model

def preprocess_data_and_tokenizer(df, existing_tokenizer=None):
    """
    Fit tokenizer (if not provided) on ALL texts like the notebook.
    """
    texts = df["text"].astype(str).tolist()
    labels = df["classification"].astype(str).tolist()
    idxs = [LABELS[l] for l in labels]

    if existing_tokenizer is None:
        tokenizer = Tokenizer(num_words=MAX_NUM_WORDS, oov_token="<OOV>")
        tokenizer.fit_on_texts(texts)
    else:
        tokenizer = existing_tokenizer

    seqs = tokenizer.texts_to_sequences(texts)
    padded = pad_sequences(seqs, maxlen=MAX_SEQ_LEN, padding="post")
    y = to_categorical(np.array(idxs), num_classes=len(LABELS))
    return padded, y, tokenizer

def save_artifacts(model, tokenizer, val_acc, trained_examples_count):
    # metrics file (so the API can at least show cached val_accuracy/trained_examples)
    try:
        with open(MODEL_METRICS_PATH, "w") as f:
            json.dump({"val_accuracy": float(val_acc), "trained_examples": int(trained_examples_count)}, f)
        print(f"[INFO] metrics saved -> {MODEL_METRICS_PATH}")
    except Exception as e:
        print(f"[WARN] could not save metrics: {e}")

    # tokenizer + model like in notebook
    try:
        with open(TOKENIZER_PATH, "wb") as f:
            pickle.dump(tokenizer, f)
        model_json = model.to_json()
        with open(MODEL_JSON_PATH, "w", encoding="utf-8") as jf:
            jf.write(model_json)
        model.save_weights(MODEL_WEIGHTS_PATH)
        model.save(MODEL_H5_PATH)
        print(f"[INFO] Saved tokenizer -> {TOKENIZER_PATH}")
        print(f"[INFO] Saved model JSON -> {MODEL_JSON_PATH}")
        print(f"[INFO] Saved model weights -> {MODEL_WEIGHTS_PATH}")
        print(f"[INFO] Saved full model -> {MODEL_H5_PATH}")
    except Exception as e:
        print(f"[ERROR] Failed to save model/tokenizer: {e}")
        raise

def main():
    # Lock handling
    signal.signal(signal.SIGINT, graceful_lock_cleanup)
    signal.signal(signal.SIGTERM, graceful_lock_cleanup)
    touch_training_lock()

    try:
        # 1) Pull untrained rows from DB
        db_untrained = fetch_untrained_db_rows()

        # 2) Append to CSV & capture which ids truly added
        appended_ids = append_db_rows_to_csv(db_untrained)

        # 3) Load merged CSV for training
        df = load_csv_data()
        if df.empty:
            print("[ERROR] No data to train on.")
            return

        # 4) Preprocess (tokenizer on full corpus, notebook-style)
        X, y, tokenizer = preprocess_data_and_tokenizer(df)

        # 5) Split
        X_train, X_val, y_train, y_val = train_test_split(
            X, y, test_size=VAL_SPLIT, random_state=RANDOM_STATE, shuffle=True
        )
        print(f"[TRAIN] train={len(X_train)}, val={len(X_val)}")

        # 6) Build model + train
        model = build_model_notebook_style(MAX_SEQ_LEN, tokenizer)
        print("[TRAIN] Starting training...")
        model.fit(
            X_train, y_train,
            epochs=EPOCHS,
            batch_size=BATCH_SIZE,
            validation_data=(X_val, y_val),
            verbose=1
        )
        val_loss, val_acc = model.evaluate(X_val, y_val, verbose=0)
        print(f"[TRAIN] Validation accuracy: {val_acc:.4f}")

        # 7) Save artifacts
        save_artifacts(model, tokenizer, val_acc, trained_examples_count=len(df))

        # 8) Mark appended DB rows as trained+checked
        try:
            mark_db_rows_trained(appended_ids)
        except Exception as e:
            print(f"[WARN] Could not mark DB rows trained: {e}")

        print("[DONE] Retrain finished successfully.")

    except Exception as e:
        print(f"[FATAL] Retrain failed: {e}")
        raise
    finally:
        remove_training_lock()


if __name__ == "__main__":
    main()
