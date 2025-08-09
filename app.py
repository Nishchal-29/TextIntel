import os
import logging
import pickle
import numpy as np
import tensorflow as tf
from tensorflow.keras.models import model_from_json
import spacy
from spacy.matcher import PhraseMatcher
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import subprocess

# Logging setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# FastAPI initialization
app = FastAPI(title="TextIntel API")

# Enable CORS for local development
origins = ["http://127.0.0.1:5173", "http://localhost:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configurable file paths
MODEL_JSON_PATH = os.environ.get("MODEL_JSON", "sentiment.json")
MODEL_WEIGHTS_PATH = os.environ.get("MODEL_WEIGHTS", "sentiment.weights.h5")
TOKENIZER_PATH = os.environ.get("TOKENIZER", "tokenizer.pkl")
SPACY_MODEL = os.environ.get("SPACY_MODEL", "en_core_web_md")
MAX_SEQ_LEN = int(os.environ.get("MAX_SEQ_LEN", 100))

# Globals for model and tokenizer
model = None
tokenizer = None

# Load spaCy model
try:
    nlp = spacy.load(SPACY_MODEL)
except Exception as e:
    logger.error("spaCy model '%s' not found. Please run: python -m spacy download %s", SPACY_MODEL, SPACY_MODEL)
    raise

# Rule-based weapon matcher
weapon_list = ["AK-47", "grenade", "RPG-7", "missile", "sniper rifle", "pistol", "bomb", "mortar", "machine gun", "gun"]
matcher = PhraseMatcher(nlp.vocab, attr="LOWER")
patterns = [nlp.make_doc(w) for w in weapon_list]
matcher.add("WEAPON", patterns)
CATEGORIES = ["PERSON", "GPE", "TIME"]

# Reload model/tokenizer function
def load_model_and_tokenizer():
    global model, tokenizer
    with open(TOKENIZER_PATH, "rb") as f:
        tokenizer = pickle.load(f)
    with open(MODEL_JSON_PATH, "r") as jf:
        model_json = jf.read()
    loaded_model = model_from_json(model_json)
    loaded_model.load_weights(MODEL_WEIGHTS_PATH)
    loaded_model.compile(optimizer="adam", loss="categorical_crossentropy", metrics=["accuracy"])
    model = loaded_model
    logger.info("Model and tokenizer reloaded successfully.")

# Initial load at startup
@app.on_event("startup")
def startup_event():
    load_model_and_tokenizer()

# Pydantic models
class TextInput(BaseModel):
    text: str

class SentenceInput(BaseModel):
    sentence: str

class_labels = ["benign", "suspicious", "critical"]

# Health-check endpoint
@app.get("/health")
def health():
    return {"status": "ok"}

# Classification endpoint
@app.post("/classify")
async def classify_text(data: TextInput):
    text = data.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Empty text provided.")
    try:
        seq = tokenizer.texts_to_sequences([text])
        padded = tf.keras.preprocessing.sequence.pad_sequences(seq, maxlen=MAX_SEQ_LEN, padding="post")
        prediction = model.predict(padded)
        idx = int(np.argmax(prediction, axis=1)[0])
        return {
            "input_text": text,
            "predicted_class": class_labels[idx],
            "confidence": float(np.max(prediction))
        }
    except Exception as e:
        logger.exception("Error during classification: %s", e)
        raise HTTPException(status_code=500, detail="Classification error.")

# NER & weapon extraction endpoint
@app.post("/ner")
def extract_entities(data: SentenceInput):
    sentence = data.sentence.strip()
    if not sentence:
        raise HTTPException(status_code=400, detail="Empty sentence provided.")
    try:
        doc = nlp(sentence)
        entities = [(ent.text, ent.label_) for ent in doc.ents if ent.label_ in CATEGORIES]
        for _, start, end in matcher(doc):
            span = doc[start:end]
            entities.append((span.text, "WEAPON"))
        return {"entities": [{"text": t, "label": l} for t, l in entities]}
    except Exception as e:
        logger.exception("Error extracting entities: %s", e)
        raise HTTPException(status_code=500, detail="NER error.")

# Retraining endpoint
@app.post("/api/model/retrain")
async def retrain_model(background_tasks: BackgroundTasks):
    """Retrain the model in the background and reload it."""
    def run_retrain():
        logger.info("Starting model retraining...")
        result = subprocess.run(
            ["python", "retrain_model.py"],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            logger.info("Retraining finished successfully.")
            load_model_and_tokenizer()
        else:
            logger.error("Retraining failed: %s", result.stderr)

    background_tasks.add_task(run_retrain)
    return {"status": "retraining_started"}

# Run with: python app.py
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("FASTAPI_PORT", 8000))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=True)
