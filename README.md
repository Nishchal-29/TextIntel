
# NLP-Based Threat Classification & Intelligence Dashboard

## 📌 Overview
This project is a **secure, multilingual NLP-based threat detection system** designed for defense analysts to classify text communications into risk categories, extract critical entities, and assist in decision-making.  
The system integrates **machine learning, named entity recognition (NER), and an interactive dashboard** with role-based access for different users.

---

## 🚀 Features

### 1. NLP-Based Threat Classification
- Classifies documents, messages, or transcripts into **Benign**, **Suspicious**, or **Critical**.
- Uses **supervised learning** with keyword/entity detection for high accuracy.
- Real-time predictions via the integrated ML model.

### 2. Named Entity Recognition (NER)
- Detects and highlights:
  - **People**
  - **Locations**
  - **Weapons**
  - **Dates & Time**
- Helps human analysts quickly spot relevant information.

### 3. PDF Analysis & Extraction
- Upload PDF files containing intelligence reports or transcripts.
- **Automatic text extraction** from PDFs.
- Supports classification and entity recognition directly from PDF content.

### 4. Interactive Dashboard
- Secure web-based interface for uploading text or PDFs.
- Displays:
  - Classification results with **visual alerts**.
  - Extracted entities.
  - Historical logs for past intelligence reports.
- Provides **search and filter** options for past threat data.

### 5. Role-Based Access Control (RBAC)
- **Analyst**: Can upload inputs, view analysis, and provide feedback.
- **Commander**: Can view aggregated intelligence and approve or reject flagged reports.
- Access restrictions for classified data.

### 6. Model Feedback Loop
- Analysts can mark **false positives** or **reclassify** threats.
- Feedback is stored for retraining the model and improving accuracy.

### 7. Multilingual & Code-Mixed Support
- Supports **English**, **Hindi**, and **Hinglish** (code-mixed text).
- Uses **multilingual embeddings** or transformer-based models.

### 8. Data Storage & Search
- All classified reports are stored in a database (**PostgreSQL / MongoDB Atlas**).
- Indexed for **fast lookup** and similarity search using vector embeddings.

---

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| **Frontend** | React.js, Bootstrap, React Router, react-hook-form, Axios |
| **Backend** | FastAPI (Python), Node.js |
| **ML/NLP** | TensorFlow / PyTorch, spaCy, Transformers (Hugging Face) |
| **Database** | PostgreSQL, MongoDB Atlas |
| **Authentication** | JWT-based auth, Google Login |
| **PDF Processing** | PyMuPDF / pdfplumber |
| **Search** | Vector similarity search (FAISS / ElasticSearch) |

---

## 📂 Project Structure
