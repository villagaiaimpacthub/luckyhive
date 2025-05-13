# HIVE Project Checklist

## Phase 1: Robust PDF Querying (Completed - 2024-07-27)

-   [x] **Core PDF Text Extraction:**
    -   [x] Integrate `pdfplumber` for text extraction from PDFs.
    -   [x] Implement `util_extract_text_from_pdf` function.
-   [x] **Dynamic PDF Path & Filename Handling:**
    -   [x] Develop `PDF_PATH_OVERRIDES` mechanism.
    -   [x] Implement `sanitize_folder_name` for directory matching.
    -   [x] Add logic to try filename variants (spaces/underscores).
-   [x] **LLM Workflow for PDF Queries:**
    -   [x] Define `--PDF_LOOKUP\n` SQL prefix convention.
    -   [x] Update SQL-generating LLM prompt to use the prefix for document-related questions.
    -   [x] Implement heuristic retry in `handle_query` if prefix is missing.
    -   [x] Develop `answer_question_from_text_with_llm` with specialized QA prompt.
        -   [x] Instruct QA LLM to assume PDF relevance and focus on content.
        -   [x] Define structured output format for QA LLM.
-   [x] **Follow-up Question Handling for PDFs:**
    -   [x] Update SQL-generating LLM prompt to re-issue original `--PDF_LOOKUP` SQL for follow-ups.
    -   [x] Ensure `handle_query` correctly processes re-issued PDF lookups.
    -   [x] Resolve "execute one statement at a time" errors.
-   [x] **SQL Generation & Cleaning Stability:**
    -   [x] Refactor `generate_sql_with_llm` for robust prefix detection and application.
    -   [x] Improve cleaning of LLM-generated SQL (wrappers, structural newlines, literals).
    -   [x] Stabilize semicolon and trailing character cleanup.
-   [x] **Error Handling & Logging:**
    -   [x] Add specific error messages for PDF lookup failures (e.g., `#PDF_LOOKUP_EMPTY_BODY#`).
    -   [x] Enhance logging throughout the PDF query lifecycle.
-   [x] **Testing & Validation:**
    -   [x] Successfully tested initial PDF queries.
    -   [x] Successfully tested follow-up PDF queries.
    -   [x] Confirmed resolution of major SQL execution errors related to PDF lookups.
-   [x] **Documentation:**
    -   [x] Created initial `prd.md` and `checklist.md`.
    -   [x] Updated `README.md` with PDF querying features and patterns.

## Phase 2: (To Be Defined)
-   [ ] Item 1
-   [ ] Item 2 