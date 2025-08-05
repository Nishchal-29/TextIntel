# app.py
from fastapi import FastAPI
from pydantic import BaseModel
import tensorflow as tf
import numpy as np
import pickle
from tensorflow.keras.models import model_from_json

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

# Request body schema
class TextInput(BaseModel):
    text: str

# Class mapping (change according to your labels)
class_labels = ["benign", "suspicious", "critical"]

# ---------- Endpoint ----------
@app.post("/classify")
async def classify_text(data: TextInput):
    # Preprocess
    seq = tokenizer.texts_to_sequences([data.text])
    padded = tf.keras.preprocessing.sequence.pad_sequences(seq, maxlen=100, padding="post")
    
    # Predict
    prediction = model.predict(padded)
    predicted_class = class_labels[np.argmax(prediction)]

    return {
        "input_text": data.text,
        "predicted_class": predicted_class,
        "confidence": float(np.max(prediction))
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
