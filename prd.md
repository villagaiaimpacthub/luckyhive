# Product Requirements Document - HIVE Dashboard

## Version: 1.0

## 1. Introduction
(To be filled: Overall project vision, goals, target users)

## 2. Core Features
(To be filled: High-level feature list)

## 3. Accomplishments (as of 2024-07-27)

### 3.1 Enhanced PDF Document Querying (HIVE Feature - Phase 1)
The HIVE system can now accurately answer user questions based on the content of PDF documents linked within the `shipments` table. This involved significant development in the Python-based `llm_data_service`.

**Key Capabilities Achieved:**

*   **PDF Text Extraction:**
    *   Successfully integrated the `pdfplumber` library to extract text from PDF files specified in database columns (e.g., `laboratoryReport`, `provisionalDocs`, `finalDocs`).
*   **Dynamic PDF Path Resolution:**
    *   Implemented robust logic (`util_extract_text_from_pdf`) to construct absolute paths to PDF documents.
    *   Utilizes `PDF_PATH_OVERRIDES` for shipment-specific subfolder naming conventions.
    *   Employs `sanitize_folder_name` to handle special characters in shipment names for folder matching.
    *   Includes filename variant checking (handling underscores vs. spaces) to improve file location success.
*   **LLM-Driven PDF Query Workflow:**
    *   **Prefix-Based Trigger:** The primary LLM (for SQL generation) is prompted to use a `--PDF_LOOKUP\n` prefix when a user's question indicates a need to consult a document.
    *   **Heuristic Retry for Prefix:** `handle_query` in `app.py` includes a heuristic to re-trigger SQL generation with a PDF-specific prompt if the initial LLM response lacks the prefix but the question implies document content.
    *   **Dedicated QA LLM:** A second LLM (`answer_question_from_text_with_llm`) is used to answer questions based *solely* on the extracted PDF text. This LLM is prompted to:
        *   Assume the provided PDF is the correct one, regardless of name discrepancies.
        *   Structure its answer with report details (number, date) and a clear response to the user's query.
        *   Offer follow-up details if present in the PDF.
*   **Robust Follow-up Question Handling:**
    *   The system now correctly handles simple follow-up questions (e.g., "What is the Cadmium percentage?") after an initial PDF query.
    *   The SQL-generating LLM is prompted to re-issue the original `--PDF_LOOKUP` SQL, ensuring the same PDF context is re-fetched for the QA LLM.
    *   Resolved "execute one statement at a time" SQL errors that previously plagued follow-up queries.
*   **SQL Generation & Cleaning Refinements:**
    *   Significantly refactored the `generate_sql_with_llm` function for more reliable SQL cleaning, normalization, and correct handling of the `--PDF_LOOKUP\n` prefix.
    *   Improved logic for isolating the SQL body from the prefix for cleaning operations.
    *   Ensured correct replacement of structural newlines in LLM-generated SQL to prevent parsing errors.

**Issues Addressed & Resolved during this Phase:**
*   Initial failures of LLM to add `--PDF_LOOKUP` prefix.
*   Various PDF text extraction failures due to import errors, incorrect column names in SQL/prompts, path override key mismatches, and folder name sanitization issues.
*   Filename space/underscore mismatches preventing PDF location.
*   SQL generation errors for PDF follow-ups (typos, incorrect `shipmentName` matching, malformed SQL).
*   Linter errors introduced during complex code edits.

## 4. Non-Functional Requirements
(To be filled)

## 5. Future Enhancements / Next Steps
(To be filled - This is where we'll put the *actual* next steps later)

--- 