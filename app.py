import os
import json
import csv
import logging
import pickle
import numpy as np
import tensorflow as tf
import uvicorn
import psycopg2
from keras.models import load_model
import spacy
from spacy.matcher import PhraseMatcher
from fastapi.responses import RedirectResponse
from fastapi import FastAPI, HTTPException, BackgroundTasks, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import subprocess
import fitz

# Logging setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# FastAPI initialization
app = FastAPI(title="TextIntel API")

# Enable CORS for local development
origins = [ "https://textintel.onrender.com", "https://65.0.197.48:8080", "http://65.0.197.48:8080", "https://65.0.197.48", "http://65.0.197.48",]

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
MAX_SEQ_LEN = int(os.environ.get("MAX_SEQ_LEN", 18))
MODEL_PATH = "sentiments.h5"
TOKENIZER_PATH = "tokenizer.pkl"

# Globals
model = None
tokenizer = None
MAX_SEQ_LEN = 18
nlp = spacy.load(SPACY_MODEL)

# Rule-based weapon matcher
weapon_list = [
    "AK-47", "grenade", "RPG-7", "missile", "sniper rifle", "pistol", 
    "bomb", "mortar", "machine gun", "gun", "rifle", "ammunition", 
    "explosive", "IED", "rocket", "launcher", "knife", "weapon",
    "attack", "AWM", "knife", "revolver" "assault", "strike", "raid", "ambush"
]
matcher = PhraseMatcher(nlp.vocab, attr="LOWER")
patterns = [nlp.make_doc(w) for w in weapon_list]
matcher.add("WEAPON", patterns)

# Expanded categories for better entity extraction
CATEGORIES = [
    "PERSON",      # People, names
    "GPE",         # Countries, cities, states
    "ORG",         # Organizations, companies, agencies
    "TIME",        # Dates, times
    "DATE",        # Specific dates
    "LOCATION",    # Locations
    "FACILITY",    # Buildings, facilities
    "PRODUCT",     # Objects, vehicles, products
    "EVENT",       # Named hurricanes, battles, wars, sports events
    "MONEY",       # Monetary values
    "QUANTITY",    # Measurements, quantities
    "CARDINAL",    # Numbers
    "ORDINAL"      # First, second, etc.
]

# Location/military keywords for pattern matching
military_keywords = [
    "base", "camp", "outpost", "checkpoint", "border", "headquarters",
    "position", "coordinates", "target", "objective", "zone", "sector",
    "command", "post", "station", "facility", "compound", "bunker"
]
military_matcher = PhraseMatcher(nlp.vocab, attr="LOWER")
military_patterns = [nlp.make_doc(k) for k in military_keywords]
military_matcher.add("MILITARY", military_patterns)

# Reload model/tokenizer function

def load_model_and_tokenizer():
    """Loads the model and tokenizer once"""
    global model, tokenizer
    
    if tokenizer is None:
        with open(TOKENIZER_PATH, "rb") as f:
            tokenizer = pickle.load(f)

    if model is None:
        model = tf.keras.models.load_model(MODEL_PATH)
        model.compile(optimizer="adam",
                      loss="categorical_crossentropy",
                      metrics=["accuracy"])
        print("✅ Model and tokenizer loaded successfully")

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

@app.get("/warmup")
def warmup(redirect: str = "https://textintel.onrender.com"):
    return RedirectResponse(url=redirect)

# Classification logic (can be reused internally)
def classify_logic(text: str):
    """Classifies input text into categories"""
    global model, tokenizer

    # Ensure model is loaded
    if model is None or tokenizer is None:
        load_model_and_tokenizer()

    # Preprocess
    seq = tokenizer.texts_to_sequences([text])
    padded = tf.keras.preprocessing.sequence.pad_sequences(
        seq, maxlen=MAX_SEQ_LEN, padding="post", truncating="post"
    )

    # Predict
    prediction = model.predict(padded)
    idx = int(np.argmax(prediction, axis=1)[0])

    return {
        "input_text": text,
        "predicted_class": class_labels[idx],
        "confidence": float(np.max(prediction))
    }

# Classification endpoint
@app.post("/classify")
async def classify_text(data: TextInput):
    text = data.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Empty text provided.")
    try:
        return classify_logic(text)
    except Exception as e:
        logger.exception("Error during classification: %s", e)
        raise HTTPException(status_code=500, detail="Classification error.")

# PDF upload endpoint -> Extract text -> Classify
@app.post("/upload-pdf")
async def upload_pdf(file: UploadFile = File(...)):
    try:
        pdf_bytes = await file.read()
        pdf_doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        text = "".join([page.get_text() for page in pdf_doc]).strip()

        if not text:
            raise HTTPException(status_code=400, detail="No text found in PDF.")

        # Directly call classification logic without HTTP request
        return classify_logic(text)
    except Exception as e:
        logger.exception("Error processing PDF: %s", e)
        raise HTTPException(status_code=500, detail="PDF processing error.")

# NER & weapon extraction endpoint
@app.post("/ner")
def extract_entities(data: SentenceInput):
    sentence = data.sentence.strip()
    if not sentence:
        raise HTTPException(status_code=400, detail="Empty sentence provided.")
    
    try:
        doc = nlp(sentence)
        entities = []
        
        # Extract standard NER entities (with expanded categories)
        for ent in doc.ents:
            if ent.label_ in CATEGORIES:
                entities.append((ent.text.strip(), ent.label_))
        
        # Extract weapon mentions
        weapon_matches = matcher(doc)
        for _, start, end in weapon_matches:
            span = doc[start:end]
            entities.append((span.text.strip(), "WEAPON"))
        
        # Extract military location/facility mentions
        military_matches = military_matcher(doc)
        for _, start, end in military_matches:
            span = doc[start:end]
            entities.append((span.text.strip(), "MILITARY"))
        
        # Remove duplicates while preserving order
        seen = set()
        unique_entities = []
        for text, label in entities:
            key = (text.lower(), label)
            if key not in seen and len(text.strip()) > 1:  # Avoid single characters
                seen.add(key)
                unique_entities.append({"text": text, "label": label})
        
        logger.info(f"Extracted {len(unique_entities)} entities from text: {sentence[:50]}...")
        logger.info(f"Entities found: {unique_entities}")
        
        return {"entities": unique_entities}
        
    except Exception as e:
        logger.exception("Error extracting entities: %s", e)
        raise HTTPException(status_code=500, detail=f"NER error: {str(e)}")

# Retraining endpoint
@app.post("/api/model/retrain")
async def retrain_model(background_tasks: BackgroundTasks):
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
    accuracy = None
    metrics_path = "model_metrics.json"
    if os.path.exists(metrics_path):
        try:
            with open(metrics_path, "r") as f:
                metrics = json.load(f)
                accuracy = metrics.get("val_accuracy")
        except Exception as e:
            logger.error("Failed to read model metrics: %s", e)
    return {"status": "retraining_started", "val_accuracy": accuracy}

@app.get("/api/model/metrics")
def get_model_metrics():
    metrics_path = "model_metrics.json"
    metrics = {}
    new_db_examples = 0
    training = False
    trained_examples = 0

    # Read metrics from file
    if os.path.exists(metrics_path):
        try:
            with open(metrics_path, "r") as f:
                metrics = json.load(f)
                trained_examples = metrics.get("trained_examples")
        except Exception as e:
            logger.error("Failed to read model metrics: %s", e)
    if not trained_examples:
        dataset_path = "classification_dataset.csv"
        if os.path.exists(dataset_path):
            try:
                with open(dataset_path, "r") as f:
                    reader = csv.reader(f)
                    next(reader, None)  # skip header row
                    trained_examples = sum(1 for _ in reader)
            except Exception as e:
                logger.error("Failed to count dataset examples: %s", e)
                trained_examples = 0
    
    training_flag = "training.lock"
    if os.path.exists(training_flag):
        training = True

    # Count new examples in DB (not yet used for training)
    try:
        conn = psycopg2.connect(
            host=os.environ.get("DB_HOST"),
            port=os.environ.get("DB_PORT"),
            dbname=os.environ.get("DB_NAME"),
            user=os.environ.get("DB_USER"),
            password=os.environ.get("DB_PASS"),
        )
        query = "SELECT COUNT(*) FROM classified_messages WHERE trained IS FALSE OR trained IS NULL;"
        with conn.cursor() as cur:
            cur.execute(query)
            new_db_examples = cur.fetchone()[0]
        conn.close()
    except Exception as e:
        logger.error("Failed to count new DB examples: %s", e)
        new_db_examples = 0

    return {
        "val_accuracy": metrics.get("val_accuracy"),
        "trained_examples": trained_examples,
        "new_db_examples": new_db_examples,
        "training": training
    }

# Run with: python app.py
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))  # use PORT (Render sets this)
    uvicorn.run("app:app", host="0.0.0.0", port=port)
