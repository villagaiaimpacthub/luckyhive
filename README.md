# HIVE Dashboard - LLM Enhanced Shipping Data Management

This project provides an intelligent dashboard for managing shipping data, enhanced with Large Language Model (LLM) capabilities for natural language querying and document analysis.

## Features

*   **Natural Language Querying:** Ask questions in plain English to retrieve and analyze data from the `shipments` table.
*   **PDF Document Querying:** The HIVE feature can answer questions based on the content of PDF documents linked in the `shipments` table (e.g., `laboratoryReport`, `provisionalDocs`, `finalDocs` columns).

## Patterns & Technologies

### PDF Querying System

*   **`pdfplumber` Library:** Used in the Python `llm_data_service` (`app.py`) to extract text from PDF documents.
    *   **Reason:** Chosen for its robustness, ease of use in Python for text extraction, and ability to handle various PDF layouts.
*   **`--PDF_LOOKUP` SQL Prefix Pattern:** User questions about document content trigger the LLM to generate SQL prefixed with `--PDF_LOOKUP\n`.
    *   **Reason:** This prefix acts as a signal for the `llm_data_service` to initiate a specialized PDF processing workflow instead of a standard database query.
*   **Two-LLM System for PDF Analysis:**
    1.  **SQL Generation LLM:** Generates the `--PDF_LOOKUP` prefixed SQL to retrieve the correct document path and `shipmentName` from the database.
    2.  **PDF Content QA LLM (`answer_question_from_text_with_llm`):** A separate LLM instance, prompted with specific instructions to answer questions based *solely* on the extracted text from the identified PDF document.
    *   **Reason:** This separation of concerns allows for precise prompting. The first LLM focuses on identifying the correct document via SQL, while the second specializes in accurately extracting information from the document's text without being influenced by the broader database schema or chat history context beyond the current PDF task.

*   **Dynamic PDF Path Construction & Filename Variant Handling:**
    *   The system uses `PDF_PATH_OVERRIDES` and `sanitize_folder_name` to construct absolute PDF paths.
    *   It attempts to find PDF files by trying filename variants (original, spaces to underscores, underscores to spaces) to accommodate inconsistencies between database entries and actual filenames.
    *   **Reason:** Enhances robustness in locating PDF files despite potential naming variations or special characters in shipment names.

### Backend & LLM Service

*   **Node.js with Express.js:** Main backend server (`server.js`) handling API requests, CSV uploads, and communication with the Python LLM service.
*   **Python with Flask:** Microservice (`llm_data_service/app.py`) dedicated to LLM interactions (SQL generation, PDF text analysis) and SQLite database operations.
*   **Anthropic Claude 3 Haiku Model:** Used for both SQL generation and PDF content analysis.
*   **SQLite:** Database for storing shipment data.

## Project Structure (Simplified)

```
/dashboard
|-- llm_data_service/
|   |-- app.py             # Python Flask service for LLM and DB operations
|   |-- requirements.txt   # Python dependencies
|   |-- .env               # Environment variables (e.g., API keys) - NOT COMMITTED
|-- pdf/                   # Contains subfolders for shipment-specific PDFs
|   |-- [Shipment_Name_Subfolder]/
|       |-- [Document_Type_Subfolder]/
|           |-- some_document.pdf
|-- public/                # Frontend static assets (HTML, CSS, JS)
|-- views/                 # EJS templates
|-- package.json
|-- server.js              # Main Node.js backend
|-- shipping_data.db       # SQLite database file - NOT COMMITTED typically
|-- prd.md                 # Product Requirements Document (See prd.md v1.0 for full requirements)
|-- README.md              # This file
```

## Setup & Running

(To be filled in with detailed setup instructions if not already present)

---

See [prd.md](prd.md) v1.0 for full requirements. 