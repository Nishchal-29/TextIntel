# retrain_model.py  -- updated to match classify.ipynb exactly
import os
import json
import pickle
import psycopg2
import pandas as pd
import numpy as np
from tensorflow.keras.preprocessing.text import Tokenizer
from tensorflow.keras.preprocessing.sequence import pad_sequences
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Embedding, Bidirectional, LSTM, Dense, Dropout, BatchNormalization, Input
from tensorflow.keras.utils import to_categorical
from sklearn.model_selection import train_test_split

# ====== CONFIG (matches notebook) ======
CSV_DATA_PATH = "classification_dataset.csv"
MODEL_JSON_PATH = os.environ.get("MODEL_JSON", "sentiment.json")        # notebook uses sentiment.json
MODEL_H5_PATH = os.environ.get("MODEL_H5", "sentiments.h5")            # notebook uses sentiments.h5
MODEL_WEIGHTS_PATH = os.environ.get("MODEL_WEIGHTS", "sentiment.weights.h5")
TOKENIZER_PATH = os.environ.get("TOKENIZER", "tokenizer.pkl")
MODEL_METRICS_PATH = "model_metrics.json"

MAX_SEQ_LEN = int(os.environ.get("MAX_SEQ_LEN", 18))   # notebook uses 18
MAX_NUM_WORDS = int(os.environ.get("MAX_NUM_WORDS", 10000))
EMBEDDING_DIM = int(os.environ.get("EMBEDDING_DIM", 128))  # notebook uses 128

EPOCHS = int(os.environ.get("EPOCHS", 20))   # notebook used 20
BATCH_SIZE = int(os.environ.get("BATCH_SIZE", 32))

# DB Connection from environment variables
DB_HOST = os.environ.get("DB_HOST")
DB_PORT = os.environ.get("DB_PORT")
DB_NAME = os.environ.get("DB_NAME")
DB_USER = os.environ.get("DB_USER")
DB_PASS = os.environ.get("DB_PASS")

# Label mapping (must match notebook)
LABELS = {"benign": 0, "suspicious": 1, "critical": 2}
VALID_LABELS = set(LABELS.keys())

# ====== DB HELPERS ======
def get_db_conn():
    return psycopg2.connect(
        host=DB_HOST, port=DB_PORT, dbname=DB_NAME, user=DB_USER, password=DB_PASS
    )

def ensure_checked_column():
    # ensure we have a checked boolean to mark processed rows
    try:
        conn = get_db_conn()
        with conn.cursor() as cur:
            cur.execute("ALTER TABLE classified_messages ADD COLUMN IF NOT EXISTS checked BOOLEAN DEFAULT FALSE;")
        conn.commit()
        conn.close()
    except Exception as e:
        print("[WARN] could not ensure 'checked' column exists:", e)

def fetch_untrained_db_rows():
    """
    Fetch rows that are not yet trained (trained IS FALSE OR trained IS NULL)
    and have a valid classification label.
    """
    try:
        ensure_checked_column()
        conn = get_db_conn()
        query = """
            SELECT id, text, classification
            FROM classified_messages
            WHERE (trained IS FALSE OR trained IS NULL)
              AND classification IN ('benign', 'suspicious', 'critical');
        """
        df = pd.read_sql(query, conn)
        conn.close()
        print(f"[DB] Retrieved {len(df)} untrained rows")
        return df
    except Exception as e:
        print("[ERROR] Failed to fetch from DB:", e)
        return pd.DataFrame(columns=["id", "text", "classification"])

def mark_db_rows_trained(ids):
    """
    Mark DB rows as trained=True and checked=True for given ids.
    """
    if not ids:
        return
    try:
        conn = get_db_conn()
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE classified_messages SET trained = TRUE, checked = TRUE WHERE id = ANY(%s);",
                (ids,)
            )
        conn.commit()
        conn.close()
        print(f"[DB] Marked {len(ids)} rows as trained and checked.")
    except Exception as e:
        print("[ERROR] Failed to mark DB rows as trained:", e)

# ====== CSV helpers ======
def load_csv_data():
    if os.path.exists(CSV_DATA_PATH):
        df = pd.read_csv(CSV_DATA_PATH)
        # Accept "label" as alias for "classification"
        if "label" in df.columns and "classification" not in df.columns:
            df = df.rename(columns={"label": "classification"})
        if "text" not in df.columns or "classification" not in df.columns:
            raise ValueError("CSV dataset must contain 'text' and 'classification' columns.")
        print(f"[CSV] Loaded {len(df)} samples from CSV")
        return df[["text", "classification"]].copy()
    else:
        print("[CSV] No CSV found — creating empty dataset.")
        return pd.DataFrame(columns=["text", "classification"])

def append_db_rows_to_csv(db_df):
    """
    Append db entries to CSV, avoid duplicates by text.
    Return list of db ids that were actually appended (so we can mark them trained).
    """
    if db_df.empty:
        return []

    db_df = db_df.dropna(subset=["text", "classification"])
    db_df = db_df[db_df["classification"].isin(VALID_LABELS)].copy()
    if db_df.empty:
        return []

    db_df = db_df[["id", "text", "classification"]].copy()
    csv_df = load_csv_data()
    csv_texts_before = set(csv_df["text"].astype(str).tolist())

    # Merge and dedupe by text
    merged = pd.concat([csv_df, db_df[["text", "classification"]]], ignore_index=True)
    merged.drop_duplicates(subset=["text"], inplace=True)
    merged.dropna(subset=["text", "classification"], inplace=True)
    merged.to_csv(CSV_DATA_PATH, index=False)
    print(f"[CSV] Merged dataset saved ({len(merged)} rows).")

    # identify which DB rows were newly added
    newly_mask = ~db_df["text"].astype(str).isin(csv_texts_before)
    appended_ids = db_df.loc[newly_mask, "id"].astype(int).tolist()
    print(f"[CSV] {len(appended_ids)} DB rows appended to CSV.")
    return appended_ids

# ====== MODEL (exactly as in classify.ipynb) ======
def build_model_notebook_style(max_length, tokenizer):
    model = Sequential()
    model.add(Input(shape=(max_length,)))
    model.add(Embedding(input_dim=len(tokenizer.word_index) + 1, output_dim=EMBEDDING_DIM, input_length=max_length))
    # First BiLSTM
    model.add(Bidirectional(LSTM(64, return_sequences=True)))
    model.add(BatchNormalization())
    model.add(Dropout(0.5))
    # Second BiLSTM
    model.add(Bidirectional(LSTM(32)))
    model.add(Dropout(0.5))
    # FC layers
    model.add(Dense(64, activation='relu'))
    model.add(BatchNormalization())
    model.add(Dropout(0.3))
    # Output
    model.add(Dense(len(LABELS), activation='softmax'))
    model.compile(optimizer="adam", loss="categorical_crossentropy", metrics=["accuracy"])
    return model

# ====== PREPROCESS (match notebook tokenizer usage) ======
def preprocess_data_and_tokenizer(df, existing_tokenizer=None):
    texts = df["text"].astype(str).tolist()
    labels = df["classification"].astype(str).tolist()
    label_idxs = [LABELS[l] for l in labels]

    if existing_tokenizer is None:
        tokenizer = Tokenizer(num_words=MAX_NUM_WORDS, oov_token="<OOV>")
        tokenizer.fit_on_texts(texts)
    else:
        tokenizer = existing_tokenizer

    sequences = tokenizer.texts_to_sequences(texts)
    padded = pad_sequences(sequences, maxlen=MAX_SEQ_LEN, padding="post")
    y = to_categorical(np.array(label_idxs), num_classes=len(LABELS))
    return padded, y, tokenizer

# ====== MAIN ======
def main():
    # 1) fetch untrained rows from DB
    db_untrained = fetch_untrained_db_rows()
    appended_db_ids = append_db_rows_to_csv(db_untrained)

    # 2) load merged CSV for training
    df = load_csv_data()
    if df.empty:
        print("[ERROR] No data to train on.")
        return

    # 3) preprocess and fit tokenizer (not reusing external tokenizer)
    X, y, tokenizer = preprocess_data_and_tokenizer(df, existing_tokenizer=None)

    # 4) split
    X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.1, random_state=42)
    print(f"[TRAIN] train={len(X_train)}, val={len(X_val)}")

    # 5) build model (notebook architecture)
    model = build_model_notebook_style(MAX_SEQ_LEN, tokenizer)

    # 6) train
    try:
        print("[TRAIN] Starting training...")
        model.fit(X_train, y_train, epochs=EPOCHS, batch_size=BATCH_SIZE,
                  validation_data=(X_val, y_val), verbose=1)
        val_loss, val_acc = model.evaluate(X_val, y_val, verbose=0)
        print(f"[TRAIN] Validation accuracy: {val_acc:.4f}")
    except Exception as e:
        print("[ERROR] Training failed:", e)
        return

    # 7) save metrics
    try:
        with open(MODEL_METRICS_PATH, "w") as f:
            json.dump({"val_accuracy": float(val_acc)}, f)
        print(f"[INFO] metrics saved -> {MODEL_METRICS_PATH}")
    except Exception as e:
        print("[WARN] could not save metrics:", e)

    # 8) Save tokenizer and model exactly like notebook
    try:
        # tokenizer
        with open(TOKENIZER_PATH, "wb") as f:
            pickle.dump(tokenizer, f)
        # model JSON
        model_json = model.to_json()
        with open(MODEL_JSON_PATH, "w") as json_file:
            json_file.write(model_json)
        # weights and full model
        model.save_weights(MODEL_WEIGHTS_PATH)
        model.save(MODEL_H5_PATH)
        print(f"[INFO] Saved tokenizer -> {TOKENIZER_PATH}")
        print(f"[INFO] Saved model JSON -> {MODEL_JSON_PATH}")
        print(f"[INFO] Saved model weights -> {MODEL_WEIGHTS_PATH}")
        print(f"[INFO] Saved full model -> {MODEL_H5_PATH}")
    except Exception as e:
        print("[ERROR] Failed to save model/tokenizer:", e)
        return

    # 9) mark DB rows that were appended as trained+checked
    try:
        mark_db_rows_trained(appended_db_ids)
    except Exception as e:
        print("[WARN] Failed to mark DB rows:", e)

    print("[DONE] Retrain finished.")

if __name__ == "__main__":
    main()
