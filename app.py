from fastapi import FastAPI
from pydantic import BaseModel
import tensorflow as tf
import numpy as np
import pickle
from tensorflow.keras.models import model_from_json
import spacy
from spacy.matcher import PhraseMatcher

nlp = spacy.load("en_core_web_md")

# Weapon list for rule-based matching
weapon_list = ["AK-47", "grenade", "RPG-7", "missile", "sniper rifle",
               "pistol", "bomb", "mortar", "machine gun","gun"]

# Create matcher
matcher = PhraseMatcher(nlp.vocab, attr="LOWER")
patterns = [nlp.make_doc(w) for w in weapon_list]
matcher.add("WEAPON", patterns)

# Categories to include from spaCy model
categories = ["PERSON", "GPE", "TIME"]
# ---------- Load Model and Tokenizer ----------
with open("sentiment.json", "r") as json_file:
    model_json = json_file.read()

model = model_from_json(model_json)

# Load weights
model.load_weights("sentiment.h5")

# Compile (important if not saved with compile info)
model.compile(optimizer="adam", loss="categorical_crossentropy", metrics=["accuracy"])

# Load tokenizer
with open("classify_tokenizer.pkl", "rb") as f:
    tokenizer = pickle.load(f)

# ---------- FastAPI Setup ----------
app = FastAPI()

class TextInput(BaseModel):
    text: str
class_labels = ["benign", "suspicious", "critical"]

# ---------- Endpoint ----------
@app.post("/classify")
async def classify_text(data: TextInput):
    seq = tokenizer.texts_to_sequences([data.text])
    padded = tf.keras.preprocessing.sequence.pad_sequences(seq, maxlen=100, padding="post")
    prediction = model.predict(padded)
    predicted_class = class_labels[np.argmax(prediction)]
    return {
        "input_text": data.text,
        "predicted_class": predicted_class,
        "confidence": float(np.max(prediction))
    }

class SentenceInput(BaseModel):
    sentence: str

@app.post("/ner")
def extract_entities(data: SentenceInput):
    doc = nlp(data.sentence)
    entities = [(ent.text, ent.label_) for ent in doc.ents if ent.label_ in categories]
    matches = matcher(doc)
    for match_id, start, end in matches:
        span = doc[start:end]
        entities.append((span.text, "WEAPON"))
    result = [{"text": text, "label": label} for text, label in entities]
    return {"entities": result}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
