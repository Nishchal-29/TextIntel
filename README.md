# 🛡️ NLP-Based Threat Classification & Intelligence Dashboard

## 📌 Problem Statement
Defense analysts and security agencies receive vast amounts of communication data (messages, reports, transcripts) daily.  
Manually analyzing them for threats is slow, error-prone, and limited by human capacity — especially in **multilingual environments** (English, Hindi, Hinglish).  
We need an **AI-powered, secure, multi-role platform** that:
- Automatically classifies threats.
- Extracts key entities.
- Allows analysts, commanders, and admins to perform their roles efficiently.
- Continuously improves through user feedback.

---

## 💡 Solution Overview
We developed a **secure, multilingual NLP-based threat intelligence system** with:
- **Machine Learning models** for threat classification.
- **Named Entity Recognition (NER)** for detecting people, locations, weapons, and time references.
- **PDF analysis** for uploaded intelligence reports.
- **Three role-specific portals** (User, Commander, Admin).
- **One-click model retraining** using user feedback.
[View Video on Google Drive](https://drive.google.com/file/d/1s6WAg5mRFipQoZhpucZVqjVFYVscr0_q/view?usp=sharing)


---

## 🚀 Features

### 🔹 Threat Classification
- Classifies inputs into:
  - Benign
  - Suspicious
  - Critical
- Combines supervised ML with rule-based entity detection.

### 🔹 Named Entity Recognition
- Detects:
  - People
  - Locations
  - Weapons
  - Dates & Times
- Displays entities in a **highlighted format**.

### 🔹 PDF Analysis
- Upload PDF intelligence reports.
- Extracts text automatically.
- Runs classification & NER on extracted content.

### 🔹 Multi-Role Portals
#### **User Portal**
- Uploads text/PDF for classification.
- Views results and entities.
- Gives feedback on classification accuracy.

#### **Commander Portal**
- Views all reports.
- Monitors **which user searched for what**.
- Cannot retrain the model.

#### **Admin Portal**
- Monitors all user activity.
- Retrains the ML model with a **single click** using collected feedback.
- Manages datasets and system settings.
- Access to security and audit logs.

### 🔹 Model Feedback Loop
- Feedback from users is stored.
- Admin retrains model instantly for better accuracy.

### 🔹 Search & Data Storage
- Stores all reports in **PostgreSQL**.
- Supports search and sort filter over classified messages.
- Tracks search history with **user attribution**.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React.js, Bootstrap, React Router, react-hook-form, Axios |
| **Backend** | FastAPI (Python), Node.js |
| **ML/NLP** | TensorFlow , spaCy |
| **Database** | PostgreSQL |
| **Authentication** | JWT |
| **PDF Processing** | PyMuPDF, pdfplumber |

---

## 🏗️ System Architecture
           ┌──────────────────────────┐
           │     User Portal           │
           ├──────────────────────────┤
           │ Upload Text / PDF         │
           │ View Results & Entities   │
           │ Give Feedback              │
           └───────────┬──────────────┘
                       │
           ┌───────────▼──────────────┐
           │    Commander Portal       │
           ├──────────────────────────┤
           │ View All Reports          │
           │ Monitor User Searches     │
           └───────────┬──────────────┘
                       │
           ┌───────────▼──────────────┐
           │      Admin Portal         │
           ├──────────────────────────┤
           │ Full User Activity Logs   │
           │ One-Click Model Retrain   │
           │ Dataset Management        │
           └───────────┬──────────────┘
                       │
                       ▼
    ┌───────────────────────────────────────────┐
    │         Backend API (FastAPI / Node.js)    │
    ├───────────────────────────────────────────┤
    │  ML Model (Classification + NER)           │
    │  PDF Text Extraction Module                 │
    │  Feedback Processing Module                 │
    └─────────────┬─────────────────────────────┘
                  │
   ┌──────────────▼───────────────────────┐
   │       Database (PostgreSQL / MongoDB) │
   │  Threat Reports, User Activity,       │
   │  Feedback, Search History, Entities   │
   └──────────────────────────────────────┘
