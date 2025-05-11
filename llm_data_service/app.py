from flask import Flask, request, jsonify
import os
import sqlite3 # For SQLite interaction
from dotenv import load_dotenv # To load .env file
import anthropic # Import the Anthropic SDK
import re # Import the re module for regular expressions
import urllib.parse # For URL decoding PDF paths
import pdfplumber # For PDF text extraction

load_dotenv() # Load environment variables from .env, including ANTHROPIC_API_KEY

app = Flask(__name__)

# Determine project root (one level up from llm_data_service directory)
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DATABASE_PATH = os.path.join(PROJECT_ROOT, 'shipping_data.db') # Adjusted to use PROJECT_ROOT

PDF_PATH_OVERRIDES = {
    "LC VIETNAM 74 Phuc Hung Colorful Metal Joint Stock Company/ELC2500000046/ EXP. 15/4/2025": {
        "laboratoryReport": "LABORATORY REPORT",
        "provisionalDocs": "Shipping Docs: provisional", 
        "finalDocs": "Shipping Docs: FINAL Docs"
    },
    "XIN SHENG ENVIRONMENTAL (M) SDN BHD /79/villingota": {
        "laboratoryReport": "LABORATORY REPORT",
        "provisionalDocs": "Shipping Docs: provisional",
        "finalDocs": "Shipping Docs: FINAL Docs"
    }
    # Add more overrides as needed, using the exact shipmentName from the DB as the key.
}

# Initialize Anthropic Client
# Ensure ANTHROPIC_API_KEY is set in your .env file
anthropic_client = None
try:
    if os.getenv("ANTHROPIC_API_KEY"):
        anthropic_client = anthropic.Anthropic()
    else:
        app.logger.warning("ANTHROPIC_API_KEY not found. LLM functionality will be limited.")
except Exception as e:
    app.logger.error(f"Error initializing Anthropic client: {e}")

def sanitize_folder_name(name):
    """Sanitizes a name to be used as a folder name.
       Replaces / with _ to match user's current directory structure.
    """
    # Replace / with _ as per user's directory naming convention
    sanitized = name.replace('/', '_')
    # Add other common sanitizations if needed, e.g., for : \ * ? " < > |
    # For now, only / -> _ is implemented based on current need.
    return sanitized

def util_extract_text_from_pdf(db_column_value, shipment_name_from_db, doc_column_name):
    """Constructs the PDF path using overrides and extracts text.
    Args:
        db_column_value (str): The raw value from the DB document column (e.g., a filename or partial path).
        shipment_name_from_db (str): The shipmentName from the DB.
        doc_column_name (str): The name of the database column (e.g., 'labReport', 'provisionalDocs').
    """
    if not db_column_value or not shipment_name_from_db or not doc_column_name:
        app.logger.warning("DB column value, shipment name, or doc column name is missing for PDF extraction.")
        return None
    try:
        shipment_override_config = PDF_PATH_OVERRIDES.get(shipment_name_from_db)
        
        if not shipment_override_config:
            app.logger.warning(f"No PDF path override found for shipment: '{shipment_name_from_db}'. Cannot determine subfolder.")
            return None
            
        doc_type_subfolder = shipment_override_config.get(doc_column_name)
        if not doc_type_subfolder:
            app.logger.warning(f"No subfolder override for doc type '{doc_column_name}' in shipment '{shipment_name_from_db}'.")
            return None

        # Extract base filename from the db_column_value
        potential_path_segment = urllib.parse.unquote(db_column_value)
        base_filename_from_db = os.path.basename(potential_path_segment)
        
        if not base_filename_from_db and db_column_value: # If unquoting led to an empty basename (e.g. path ended with /), try original
            base_filename_from_db = os.path.basename(db_column_value)

        if not base_filename_from_db: # If still no filename, cannot proceed
             app.logger.error(f"Could not determine base filename from DB value: '{db_column_value}' for shipment '{shipment_name_from_db}'.")
             return None
        
        shipment_folder_name_sanitized = sanitize_folder_name(shipment_name_from_db)
        pdf_base_dir = os.path.join(PROJECT_ROOT, 'pdf')
        
        # List of filenames to try to handle space/underscore inconsistencies
        filenames_to_try = [
            base_filename_from_db, # Original
            base_filename_from_db.replace('_', ' '), # Underscores to spaces
            base_filename_from_db.replace(' ', '_')  # Spaces to underscores
        ]
        # Remove duplicates if the original filename had neither spaces nor underscores, or if replacements result in same string
        filenames_to_try = list(dict.fromkeys(filenames_to_try)) 

        absolute_pdf_path = None
        found_pdf_file = False
        
        for filename_variant in filenames_to_try:
            current_path_to_check = os.path.join(pdf_base_dir, shipment_folder_name_sanitized, doc_type_subfolder, filename_variant)
            app.logger.info(f"Attempting to locate PDF with variant: {current_path_to_check}")
            if os.path.exists(current_path_to_check):
                absolute_pdf_path = current_path_to_check
                found_pdf_file = True
                app.logger.info(f"PDF file found at: {absolute_pdf_path}")
                break
        
        if not found_pdf_file:
            app.logger.error(f"PDF file not found after trying variants for base: '{base_filename_from_db}'. Searched in dir: '{os.path.join(pdf_base_dir, shipment_folder_name_sanitized, doc_type_subfolder)}'. Variants tried: {filenames_to_try}")
            # Fallback logging from before is removed as this is more comprehensive
            return None

        text = ""
        with pdfplumber.open(absolute_pdf_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
        app.logger.info(f"Extracted text from PDF (first 200 chars): {text[:200]}...")
        return text
    except Exception as e:
        app.logger.error(f"Error extracting text from PDF. Shipment: '{shipment_name_from_db}', DB Value: '{db_column_value}', Column: '{doc_column_name}'. Error: {e}")
        return None

def get_db_connection():
    """Establishes a connection to the SQLite database."""
    if not os.path.exists(DATABASE_PATH):
        # This case should ideally not happen if the main Node server is running and has created the DB
        raise FileNotFoundError(f"Database file not found at {DATABASE_PATH}")
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row # Access columns by name
    return conn

def get_table_schema(table_name="shipments"):
    """Retrieves the schema (column names and types) for a given table."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(f"PRAGMA table_info({table_name});")
        columns_data = cursor.fetchall()
        conn.close()

        # Log the raw column data retrieved from PRAGMA table_info
        app.logger.info(f"Raw columns_data from PRAGMA table_info for '{table_name}': {columns_data}")

        if not columns_data:
            # Log if no column data is found
            app.logger.warning(f"No columns found for table '{table_name}' during schema retrieval.")
            return None
        
        schema_parts = [f"{col['name']} ({col['type']})" for col in columns_data]
        final_schema_str = f"Table '{table_name}' columns: {', '.join(schema_parts)}."
        
        # Log the final schema string being sent to the LLM
        app.logger.info(f"Generated schema string for LLM for table '{table_name}': {final_schema_str}")
        
        return final_schema_str
    except Exception as e:
        app.logger.error(f"Error getting table schema for '{table_name}': {e}")
        raise

def execute_sql_query(sql_query):
    """Executes a SQL query and returns the results."""
    # A more robust check: ensure the main operation is SELECT.
    # This allows other keywords if they are part of a subquery or string literal in a SELECT.
    # It's still not foolproof but better than a simple keyword check.
    disallowed_keywords = ['DROP', 'DELETE', 'INSERT', 'UPDATE', 'CREATE', 'ALTER', 'TRUNCATE']
    normalized_sql_for_check = sql_query.strip().upper()
    if not normalized_sql_for_check.startswith("SELECT"):
        for keyword in disallowed_keywords:
            if re.search(r'\\b' + keyword + r'\\b', normalized_sql_for_check):
                app.logger.warning(f"Potentially unsafe SQL query blocked: {sql_query}")
                raise ValueError("Query type not allowed. Only SELECT statements are permitted for the main operation.")

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(sql_query)
        
        # For SELECT queries, fetch results
        if sql_query.strip().upper().startswith("SELECT"):
            results = cursor.fetchall() # list of sqlite3.Row objects
            # Convert list of Row objects to list of dicts for JSON serialization
            results_as_dicts = [dict(row) for row in results]
        else:
            conn.commit() # For DML/DDL if we were to allow them
            results_as_dicts = f"Command executed successfully (no data returned for non-SELECT)."
            if cursor.rowcount != -1: # If rowcount is available (e.g. for UPDATE/DELETE)
                results_as_dicts += f" Rows affected: {cursor.rowcount}."
        
        conn.close()
        return results_as_dicts
    except sqlite3.Error as e:
        app.logger.error(f"SQLite error executing query '{sql_query}': {e}")
        raise ValueError(f"Error executing SQL: {e}") # Raise a more specific error to be caught
    except Exception as e:
        app.logger.error(f"Unexpected error executing query '{sql_query}': {e}")
        raise

def generate_sql_with_llm(question, schema, selected_row_data=None, chat_history=None):
    """Uses an LLM to generate SQL from a natural language question, table schema, selected row data, and chat history."""
    if not anthropic_client:
        return "# LLM client not initialized."

    if chat_history is None:
        chat_history = []

    system_prompt_parts = [
        "You are an AI assistant that generates ONLY SQLite SQL queries for a table named 'shipments'.",
        "VERY HIGH PRIORITY RULE FOR PDF FOLLOW-UPS: If the user's current question is short and seems like a direct follow-up to details offered from a PDF in the immediately preceding assistant turn in chat_history (e.g., user says 'yes', 'tell me more', 'what are the values?', 'give me the percentages'):",
        "  1. Your primary goal is to re-generate the *original* `--PDF_LOOKUP` SQL query that was used to fetch that PDF. This original query can be inferred from the earlier user question in the chat_history that initially led to the PDF offer.",
        "  2. The re-generated SQL MUST be for retrieving the *document path columns* (e.g., `laboratoryReport`, `shipmentName`) again. Do NOT try to query for the specific details (like percentages) directly from database table columns.",
        "  3. Example: If assistant offered details from a lab report for 'LC VIETNAM' and user says 'yes, tell me the values', you should regenerate: `--PDF_LOOKUP\\nSELECT laboratoryReport, shipmentName FROM shipments WHERE LOWER(shipmentName) LIKE '%lc vietnam%' LIMIT 1;`",
        "  If you absolutely cannot determine the original SQL for the PDF lookup from history for such a follow-up, then return ONLY `#CANNOT_DETERMINE_PDF_FOLLOWUP_SQL#`.",
        f"The table schema is: {schema}",
        "CRITICALLY IMPORTANT FOR DOCUMENT QUERIES (Initial PDF identification): If the user's question asks about the content of a document (and it's NOT a simple follow-up as described above) AND the schema includes document columns like `laboratoryReport`, `provisionalDocs`, or `finalDocs`:",
        "   1. YOU MUST prefix your SQL query with the exact comment: '--PDF_LOOKUP\\n' (the newline is VITAL).",
        "   2. The SQL after this prefix MUST select the correct document column (CHOOSE FROM: `laboratoryReport`, `provisionalDocs`, `finalDocs`) AND the `shipmentName` column.",
        "   3. Example: '--PDF_LOOKUP\\nSELECT laboratoryReport, shipmentName FROM shipments WHERE LOWER(shipmentName) LIKE '%vietnam%' LIMIT 1;'.",
        "   4. The system will then use this to fetch the PDF and answer the question. Do NOT try to answer the PDF content question yourself in this step. Your ONLY job is the correctly prefixed SQL.",
        "   5. If the question is NOT about document content, do NOT use the --PDF_LOOKUP prefix.",
        "ALL OTHER QUERIES: For all other questions not about document content, generate a direct SQLite SQL query.",
        "ALWAYS return ONLY the raw SQL query. No explanations, no markdown like ```sql ... ```.",
        "When comparing string values for most columns, use `LOWER(column) = 'value'` (lowercase the user's value in the SQL).",
        "SHIPMENT NAME MATCHING: If the user refers to a shipment by a partial name in any query (including document queries), use `LOWER(shipmentName) LIKE '%partial_name_lowercase%'` to find it. If they provide what seems like a full, specific shipmentName, you can use `LOWER(shipmentName) = 'full_name_lowercase'`.",
        "Example (partial shipmentName): User: 'status for LC Vietnam shipment' -> SQL: `SELECT status FROM shipments WHERE LOWER(shipmentName) LIKE '%lc vietnam%'`",
        "Example (general string): User: 'status is Done' -> SQL: `LOWER(status) = 'done'`.",
        "Example (goods): User: 'goods are EAFD' -> SQL: `LOWER(fclsGoods) = 'eafd'`.",
        "For non-empty string checks, use `LENGTH(TRIM(column_name)) > 0` or (`column_name <> '' AND column_name IS NOT NULL`).",
        "Avoid newlines (\\n, \\r) in SQL string literals.",
        "CURRENCY/NUMERIC HANDLING: For calculations (SUM, AVG, MAX etc.) or numeric sorting on columns like 'piValue', 'totalAmount', use `CAST(REPLACE(REPLACE(column, '$', ''), ',', '') AS REAL)`.",
        "DATE HANDLING: 'etd', 'eta', 'dueDate' are 'Month Day, Year' (e.g., 'January 26, 2025'). SQLite's `date()` needs 'YYYY-MM-DD'. You MUST convert these columns using the full `PRINTF` expression provided below before comparing with `date('YYYY-MM-DD')` formatted dates.",
        "   `PRINTF('%s-%02d-%02d', SUBSTR(column_name, INSTR(column_name, ', ') + 2), CASE SUBSTR(column_name, 1, INSTR(column_name, ' ') - 1) WHEN 'January' THEN 1 WHEN 'February' THEN 2 WHEN 'March' THEN 3 WHEN 'April' THEN 4 WHEN 'May' THEN 5 WHEN 'June' THEN 6 WHEN 'July' THEN 7 WHEN 'August' THEN 8 WHEN 'September' THEN 9 WHEN 'October' THEN 10 WHEN 'November' THEN 11 WHEN 'December' THEN 12 END, CAST(REPLACE(SUBSTR(column_name, INSTR(column_name, ' ') + 1), ',', '') AS INTEGER))`",
        "   Example ETD after Jan 1 2025: `date(PRINTF-EXPRESSION-FOR-etd) > date('2025-01-01')`.",
        "   For 'this month' queries, use `strftime('%Y-%m-01', 'now')` and `strftime('%Y-%m-%d', 'now', 'start of month', '+1 month', '-1 day')`. Apply PRINTF to the column.",
        "ROW DISPLAY HANDLING: If asked for specific columns but intent is to filter/view rows in a table (e.g., 'contract number for this month shipments'), use `SELECT * FROM shipments WHERE ...` to allow main table update. If purely analytical (e.g., 'list unique contract numbers') then select specific columns. If in doubt, prefer `SELECT *`.",
        "FOLLOW-UP QUERIES: Combine conditions from previous SQL (from chat history) with new conditions using AND. Apply aggregates to the already filtered dataset.",
        "AGGREGATES WITH ROW DISPLAY: If asked to *see rows* for an aggregate (e.g., 'show shipments with highest PI'), use `SELECT * ... WHERE ... column = (SELECT MAX(column) ... )`. Re-apply context filters in subquery.",
        "If question cannot be answered with SQL, return ONLY: '# Cannot generate SQL for this question.'"
    ]

    if selected_row_data:
        row_details = ", ".join([f"{key}: '{value}'" for key, value in selected_row_data.items() if value is not None])
        selected_row_context = f"For additional context, the user has currently selected the following row in their table view: {{ {row_details} }}. If their question refers to 'this item', 'this contract', etc., use this selected row context. Otherwise, rely on the broader chat history and current question."
        system_prompt_parts.insert(2, selected_row_context)
    
    final_system_prompt = "\\n".join(system_prompt_parts)
    messages_for_llm = list(chat_history)
    messages_for_llm.append({"role": "user", "content": question})

    app.logger.info(f"LLM System Prompt:\\n{final_system_prompt}")
    app.logger.info(f"LLM Messages:\\n{messages_for_llm}")

    raw_llm_output = ""
    cleaned_sql = "# SQL generation failed."
    pdf_lookup_prefix = "--PDF_LOOKUP\n"  #Canonical prefix WITH newline
    pdf_lookup_marker = "--PDF_LOOKUP"    #Just the marker

    try:
        completion = anthropic_client.messages.create(
            model="claude-3-haiku-20240307",
            max_tokens=1024,
            system=final_system_prompt,
            messages=messages_for_llm
        )
        raw_llm_output = completion.content[0].text.strip()
        app.logger.info(f"Raw SQL query from LLM: {raw_llm_output}")

        # Determine LLM's intent for PDF lookup from raw output
        raw_llm_output_stripped_for_marker_check = raw_llm_output.strip()
        llm_intended_pdf_lookup = raw_llm_output_stripped_for_marker_check.startswith(pdf_lookup_marker)

        sql_body_to_clean = raw_llm_output # Default: clean the whole raw output
        if llm_intended_pdf_lookup:
            # LLM indicated PDF lookup, so isolate the body after the marker for cleaning
            if raw_llm_output_stripped_for_marker_check.startswith(pdf_lookup_prefix): # Check if it had the newline
                sql_body_to_clean = raw_llm_output_stripped_for_marker_check[len(pdf_lookup_prefix):].strip()
            else: # It had the marker, but not the marker + newline
                sql_body_to_clean = raw_llm_output_stripped_for_marker_check[len(pdf_lookup_marker):].strip()
            app.logger.info(f"LLM intended PDF lookup. Raw SQL body for cleaning: '{sql_body_to_clean}' (from raw_llm_output: '{raw_llm_output}')")
        
        current_sql_to_clean = sql_body_to_clean # This is what all subsequent cleaning steps will operate on

        # Replace actual newline characters in the SQL body.
        # The regex for string literals later handles newlines *represented as \\n* if they appear inside SQL strings.
        current_sql_to_clean = current_sql_to_clean.replace('\r\n', ' ') # Order matters: \r\n first
        current_sql_to_clean = current_sql_to_clean.replace('\n', ' ')
        current_sql_to_clean = current_sql_to_clean.replace('\r', ' ')

        # The found_prefix_in_raw variable is no longer needed with this approach.
        # Its role is replaced by llm_intended_pdf_lookup.

        sql_keywords = ["SELECT ", "UPDATE ", "INSERT ", "DELETE ", "WITH "] # NO --PDF_LOOKUP HERE ANYMORE
        processed_for_keywords = False
        # temp_cleaned_sql_body logic before loop is simplified as current_sql_to_clean is already the body
        
        temp_body_for_keyword_search = current_sql_to_clean # Use the (potentially isolated) body

        for keyword in sql_keywords:
            # if keyword == "--PDF_LOOKUP" ...: # This whole case is removed
            try:
                # Search in the temp_body_for_keyword_search
                start_index = temp_body_for_keyword_search.upper().index(keyword)
                # Update current_sql_to_clean to be the part from the keyword onwards
                current_sql_to_clean = temp_body_for_keyword_search[start_index:]
                processed_for_keywords = True
                app.logger.info(f"Keyword '{keyword}' found. SQL body after keyword strip: '{current_sql_to_clean}'")
                break
            except ValueError:
                continue
        
        if not processed_for_keywords and not current_sql_to_clean.startswith("#"):
            # Only warn if no keyword found AND it's not a comment.
            # If llm_intended_pdf_lookup was true, current_sql_to_clean might be an empty string
            # or something not starting with a keyword, which can be valid for a PDF lookup body (e.g. if LLM only sent prefix)
            if llm_intended_pdf_lookup and not current_sql_to_clean:
                app.logger.info(f"LLM intended PDF lookup, and the SQL body after prefix is empty. Raw: '{raw_llm_output}'")
            elif not llm_intended_pdf_lookup : # Standard query, no keyword found
                app.logger.warning(f"Could not find a standard SQL starting keyword in LLM output: '{current_sql_to_clean}' (Raw LLM: '{raw_llm_output}')")
            # else: PDF lookup intended, body is non-empty but no keyword (e.g. malformed SQL by LLM) - covered by later execution error

        common_wrappers = [
            "```sql", "```", "SQL:", "Here is the SQL:",
            "The SQL query is:", "Generated SQL:"
        ]
        for wrapper in common_wrappers:
            if current_sql_to_clean.lower().startswith(wrapper.lower()):
                current_sql_to_clean = current_sql_to_clean[len(wrapper):].strip()
            if wrapper == "```" and current_sql_to_clean.endswith(wrapper):
                 current_sql_to_clean = current_sql_to_clean[:-len(wrapper)].strip()

        def replace_newlines_in_literals_cb(match):
            return match.group(1) + match.group(2).replace('\\n', ' ').replace('\\r', ' ') + match.group(3)
        
        current_sql_to_clean = re.sub(
            r"(['\"])((?:\\\1|(?:(?!\1).))*?)(\1)",
            replace_newlines_in_literals_cb,
            current_sql_to_clean
        )
        
        def lowercase_value_in_LOWER_comparison_cb(match):
            return f"LOWER({match.group(1)}) {match.group(2)} {match.group(3)}{match.group(4).lower()}{match.group(5)}"
        current_sql_to_clean = re.sub(
            r"LOWER\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)\s*(=|LIKE|<>|!=)\s*(['\"])((?:(?!\3).)*?)(\3)",
            lowercase_value_in_LOWER_comparison_cb,
            current_sql_to_clean,
            flags=re.IGNORECASE
        )

        current_sql_to_clean = re.sub(r"(strftime\s*\([^)]*?'\))\s*;$", r"\\1);", current_sql_to_clean, flags=re.IGNORECASE)
        current_sql_to_clean = re.sub(r"(date\s*\(PRINTF\([^)]*?'\))\s*;$", r"\\1);", current_sql_to_clean, flags=re.IGNORECASE)

        temp_sql = current_sql_to_clean.strip()
        iterations = 0
        while iterations < 10:
            made_change_in_iteration = False
            original_length = len(temp_sql)

            # Specific cleanup for "LIMIT 1;';" style errors
            if temp_sql.endswith("LIMIT 1;';") or temp_sql.endswith("LIMIT 1;\\\";"): # Checking for quote then semicolon
                temp_sql = temp_sql[:-3] + "LIMIT 1" # Remove ;'; or ;";
                made_change_in_iteration = True
            elif temp_sql.endswith("LIMIT 1;'") or temp_sql.endswith("LIMIT 1;\\\""): # Checking for just quote
                temp_sql = temp_sql[:-2] + "LIMIT 1" # Remove ;' or ;"
                made_change_in_iteration = True
            
            if temp_sql.endswith(');'):
                temp_sql = temp_sql[:-1].strip()
                made_change_in_iteration = True
            while temp_sql.endswith(';;'):
                temp_sql = temp_sql[:-1].strip()
                made_change_in_iteration = True
            if temp_sql.endswith(')') and temp_sql.count(')') > temp_sql.count('('):
                temp_sql = temp_sql[:-1].strip()
                made_change_in_iteration = True
            if temp_sql.endswith(';') and (temp_sql.startswith("#") or len(temp_sql) == 1): # or if it's just a semicolon by itself
                temp_sql = temp_sql[:-1].strip()
                made_change_in_iteration = True
            
            if not made_change_in_iteration and len(temp_sql) == original_length:
                break
            iterations += 1
        current_sql_to_clean = temp_sql

        # Logic for deciding if the final SQL output needs the --PDF_LOOKUP\n prefix
        is_simple_follow_up = question.strip().lower() in ["yes", "ok", "sure", "tell me more", "what are the values?", "give me the percentages", "i would like to know the values"]
        
        assistant_had_successful_pdf_answer_previously = False
        if chat_history and len(chat_history) >= 1:
            last_message = chat_history[-1]
            if last_message.get('role') == 'assistant' and not last_message.get('content', '').startswith("Error:"):
                pdf_answer_keywords = ["report no", "date reported", "elements listed", "document states", "text contains", "analysis shows"]
                if any(keyword in last_message.get('content', '').lower() for keyword in pdf_answer_keywords):
                    assistant_had_successful_pdf_answer_previously = True
                elif len(chat_history) >= 2: 
                    user_q_before_assistant_ans = chat_history[-2]
                    if user_q_before_assistant_ans.get('role') == 'user':
                        pdf_trigger_keywords_for_prior_q = ["elements in", "content of", "details from", "summarize report", "what does the pdf say", "what does the document say", "lab report shows", "in the lab report", "in the document", "from the pdf", "test results"]
                        if any(keyword in user_q_before_assistant_ans.get('content','').lower() for keyword in pdf_trigger_keywords_for_prior_q):
                             assistant_had_successful_pdf_answer_previously = True
        
        # Determine if the final SQL output should have the canonical prefix
        # llm_intended_pdf_lookup was determined from raw_llm_output at the beginning
        final_sql_should_have_prefix = llm_intended_pdf_lookup or \
                                       (is_simple_follow_up and assistant_had_successful_pdf_answer_previously)

        final_sql_output = current_sql_to_clean # This is the cleaned body

        if final_sql_should_have_prefix:
            if not final_sql_output.startswith("#"): # Don't prefix comments like #CANNOT_DETERMINE_PDF_FOLLOWUP_SQL#
                # If the body is empty (e.g. LLM only sent marker), and it was an intended PDF lookup, log a warning.
                # An empty body for a PDF lookup means no actual SQL to run for path, which is an issue.
                if not final_sql_output.strip() and llm_intended_pdf_lookup:
                    app.logger.warning(f"LLM intended PDF lookup but the SQL body was empty after cleaning. Raw LLM: '{raw_llm_output}'. Returning special comment.")
                    final_sql_output = "#PDF_LOOKUP_EMPTY_BODY#" # Special comment for handle_query
                else:
                    final_sql_output = pdf_lookup_prefix + final_sql_output # pdf_lookup_prefix has the \n
                    log_message_prefix_application = "Applied PDF_LOOKUP prefix."
                    if not llm_intended_pdf_lookup and (is_simple_follow_up and assistant_had_successful_pdf_answer_previously):
                        log_message_prefix_application = "Heuristically ADDED PDF_LOOKUP prefix."
                    elif llm_intended_pdf_lookup:
                        log_message_prefix_application = "Applied PDF_LOOKUP prefix based on LLM intent (ensured format)."
                    app.logger.info(f"{log_message_prefix_application} Raw LLM: '{raw_llm_output}'. Final SQL: {final_sql_output}")
            # If final_sql_output starts with "#", it's a comment from earlier (e.g. LLM returned #Cannot...), keep it as is.
        
        cleaned_sql = final_sql_output
        
        # Final Semicolon for SELECT/WITH or cleanup for comments
        if cleaned_sql and not cleaned_sql.startswith("#"):
            sql_body_for_semicolon_check = cleaned_sql
            if cleaned_sql.startswith(pdf_lookup_prefix): # pdf_lookup_prefix has the \n
                sql_body_for_semicolon_check = cleaned_sql[len(pdf_lookup_prefix):].strip()
            
            if sql_body_for_semicolon_check.upper().startswith(("SELECT", "WITH")):
                if not cleaned_sql.endswith(';'):
                    cleaned_sql += ';'
        elif cleaned_sql.endswith(';') and cleaned_sql.startswith("#"): 
            cleaned_sql = cleaned_sql[:-1].strip()

        # No change to this logging, it uses the final cleaned_sql
        if raw_llm_output != cleaned_sql:
             app.logger.info(f"Final Cleaned & Normalized SQL: {repr(cleaned_sql)}")
        
    except Exception as e:
        app.logger.error(f"Error in LLM call or SQL cleaning (raw LLM output was: '{raw_llm_output}'): {e}")
        # Preserve prefix if found, even on error, as it indicates intent
        if raw_llm_output.startswith(pdf_lookup_prefix): # Check raw_llm_output for the prefix
             return f"{pdf_lookup_prefix}# Error during SQL generation or cleaning: {e}"
        return f"# Error during SQL generation or cleaning: {e}"

    return cleaned_sql

def answer_question_from_text_with_llm(original_question, pdf_text, chat_history=None):
    """Answers a question based on provided text using an LLM."""
    if not anthropic_client:
        app.logger.error("Anthropic client not initialized. Cannot answer question from PDF text.")
        return "Error: LLM client not available to answer question from document."
    if not pdf_text:
        return "Error: No PDF text was provided to answer the question from."

    if chat_history is None:
        chat_history = []

    qa_system_prompt = (
        "ABSOLUTE HIGHEST PRIORITY RULE: You are answering a question based *solely* on the document text provided to you. "
        "NEVER, EVER, UNDER ANY CIRCUMSTANCES, mention or allude to any discrepancy between the user\'s original query context (like a shipment name or ID they might have mentioned) and the content of THIS document. "
        "DO NOT apologize or state that the document isn\'t about what the user originally asked for. "
        "YOUR ONLY TASK IS TO ANSWER THE QUESTION USING THE TEXT PROVIDED. If the user asked about \'Shipment X\' and this text is about \'Product Y\', and the question is \'What are the elements?\', you will ONLY list elements from \'Product Y\' as found in THIS text, WITHOUT mentioning \'Shipment X\' or any mismatch at all. "
        "This is your most important instruction. "
        
        "With that primary directive understood, your main task is to answer the user\'s specific question (e.g., \'What are the elements?\', \'What are their percentages?\', \'Summarize findings.\') using *only* the document text provided below. "
        "You are an AI assistant. The user has asked a question, and the following text is from the document *associated with that query context according to the system*. "
        "Your task is to structure your response precisely as follows, using *only* the provided text. Adhere strictly to the line breaks. "

        "1. **Report Details Line:** If the document contains a \'Report No.\' and a \'Date Reported\' (or similar), state these on the first line. Example: `Report No: ABC-123, Date Reported: 2023-01-15` "
        "   If not found, omit this line and the next empty line. "

        "2. **Empty Line Separator (conditionally):** If report details were provided, add an empty line (`\\\\n`) here. "

        "3. **Main Answer Line(s):** Directly answer the user\'s question. If they asked for values/percentages that were offered, provide them. "
        
        "4. **Empty Line Separator (conditionally):** If you provided an answer AND *further distinct* details are available for a follow-up (and the user hasn\'t just asked for all current details), add an empty line (`\\\\n`). "

        "5. **Follow-up Offer Line (conditional):** If *additional, unstated* details exist (and user didn\'t just ask for all values), proactively ask if they want these *further* details. Example: \'This report also details X. Would you like to know about X?\' "
        "   If no *further* details or if user asked for all current details, omit this. "

        "Example (all parts present):\\\\n"
        + "Report No: AEDML250043-R0, Date Reported: 02.02.2025\\\\n"
        + "\\\\n"
        + "The elements listed are: Moisture, Zinc as Zn, Iron as Fe, Water Soluble Chloride as Cl, Cadmium as Cd.\\\\n"
        + "\\\\n"
        + "The report also includes X, Y, Z. Would you like to know about those?"

        "Example (user asks for values after offer - no further offer needed):\\\\n"
        + "Report No: AEDML250043-R0, Date Reported: 02.02.2025\\\\n"
        + "\\\\n"
        + "The percentages are: Moisture 14.29%, Zinc as Zn 22.42%, etc."
        # (No further offer here if all offered details were given)

        "If specific info (e.g., \'elements\') isn\'t in this document, state that clearly (e.g., \'The requested information about elements is not available in this document.\'). Still provide Report No./Date if available. "
        "Strictly follow this structure."
    )
    
    messages_for_qa = [
        {
            "role": "user", 
            "content": f"Here is the text from a document:\\n\\n---\\n{pdf_text}\\n---\\n\\nBased on the text above, please answer this question: {original_question}"
        }
    ]

    app.logger.info(f"QA System Prompt: {qa_system_prompt}")
    app.logger.info(f"Messages for QA LLM (question part only): {original_question}, PDF text length: {len(pdf_text)}")

    try:
        completion = anthropic_client.messages.create(
            model="claude-3-haiku-20240307",
            max_tokens=1024,
            system=qa_system_prompt,
            messages=messages_for_qa
        )
        answer = completion.content[0].text.strip()
        app.logger.info(f"LLM QA Answer: {answer}")
        return answer
    except Exception as e:
        app.logger.error(f"Error calling LLM for QA from text: {e}")
        return f"Error processing document content with LLM: {e}"

@app.route('/health', methods=['GET'])
def health_check():
    """
    A simple health check endpoint.
    """
    return jsonify({"status": "healthy", "message": "LLM Data Service is running!"}), 200

@app.route('/query', methods=['POST'])
def handle_query():
    """
    Main endpoint to handle natural language queries.
    """
    db_results = None
    natural_answer = "Query processed."
    generated_sql = "# SQL generation not attempted."

    try:
        data = request.get_json()
        if not data or 'question' not in data:
            return jsonify({"error": "Missing 'question' in request body"}), 400

        question = data['question']
        selected_row_data = data.get('selected_row_data')
        chat_history = data.get('chat_history', [])

        app.logger.info(f"Received question: {question}")
        if selected_row_data: app.logger.info(f"Received selected_row_data: {selected_row_data}")
        if chat_history: app.logger.info(f"Received chat_history length: {len(chat_history)}")
        
        table_schema = get_table_schema()
        if not table_schema:
             return jsonify({"error": "Could not retrieve schema for table 'shipments'. Database might be empty or table missing."}), 500

        pdf_lookup_prefix_marker = "--PDF_LOOKUP"

        if not anthropic_client:
            app.logger.warning("LLM client not available for SQL generation.")
            natural_answer = "LLM client not available. Cannot generate SQL or process query further."
        else:
            generated_sql = generate_sql_with_llm(question, table_schema, selected_row_data, chat_history)
            app.logger.info(f"Initial SQL from LLM: {generated_sql}")

        pdf_content_keywords = ["elements in", "content of", "details from", "summarize report", "what does the pdf say", "what does the document say", "lab report shows", "in the lab report", "in the document", "from the pdf"]
        question_lower = question.lower()
        is_pdf_question_heuristic = any(keyword in question_lower for keyword in pdf_content_keywords)

        if generated_sql == "#CANNOT_DETERMINE_PDF_FOLLOWUP_SQL#":
            natural_answer = "I understand you're asking for more details from the document, but I couldn't determine the specific document you're referring to from our conversation. Could you please clarify or re-ask your initial question about the document?"
            db_results = None
        elif generated_sql == "#PDF_LOOKUP_EMPTY_BODY#":
            natural_answer = "I tried to look up the document, but the request was incomplete. Could you please try rephrasing your question about the document?"
            db_results = None
            app.logger.warning(f"LLM generated PDF_LOOKUP intent but with an empty SQL body for question: {question}")
        elif is_pdf_question_heuristic and not generated_sql.strip().startswith(pdf_lookup_prefix_marker) and not generated_sql.startswith("#"):
            app.logger.warning(f"Heuristic detected PDF question, but {pdf_lookup_prefix_marker} prefix is missing. Original SQL: '{generated_sql}'. Forcing a retry for PDF path.")
            forced_pdf_question = (
                f"The user asked: '{question}'. This question requires looking inside a document. "
                f"Your task is ONLY to generate the SQL to retrieve the document path and shipmentName. "
                f"You MUST prefix your SQL with '{pdf_lookup_prefix_marker}\n'. Select the most relevant document column (e.g., labReport) and shipmentName."
            )
            generated_sql = generate_sql_with_llm(forced_pdf_question, table_schema, selected_row_data, [])
            app.logger.info(f"SQL from PDF-forced retry: {generated_sql}")

        # Check for the PDF_LOOKUP_MARKER robustly
        if generated_sql.strip().startswith(pdf_lookup_prefix_marker):
            app.logger.info(f"PDF Lookup detected. SQL for path: {generated_sql}")
            # Remove the prefix and any leading/trailing whitespace from the actual SQL part
            sql_after_prefix = generated_sql.strip()[len(pdf_lookup_prefix_marker):].strip()
            if not sql_after_prefix:
                natural_answer = "PDF Lookup specified, but no SQL query followed the prefix."
                app.logger.error(f"PDF Lookup error: No SQL after prefix. Original generated_sql: {generated_sql}")
            else:
                actual_sql_for_path = sql_after_prefix 
                try:
                    pdf_path_results = execute_sql_query(actual_sql_for_path)
                    if pdf_path_results and isinstance(pdf_path_results, list) and len(pdf_path_results) > 0:
                        first_result_row = pdf_path_results[0]
                        pdf_path_segment_from_db = None
                        shipment_name_for_folder = None
                        doc_column_name_used_in_sql = None
                        
                        if 'shipmentName' not in first_result_row:
                            natural_answer = "Could not find 'shipmentName' in query result for PDF lookup."
                            app.logger.error("'shipmentName' column was not returned by the PDF lookup SQL query.")
                        else:
                            shipment_name_for_folder = first_result_row['shipmentName']
                            for key, value in first_result_row.items():
                                if key.lower() != 'shipmentname':
                                    pdf_path_segment_from_db = value
                                    doc_column_name_used_in_sql = key
                                    break
                            
                            if not pdf_path_segment_from_db:
                                natural_answer = "Could not determine PDF path column in query result."
                            elif not shipment_name_for_folder:
                                natural_answer = "Shipment name is missing, cannot construct PDF path."
                            elif not doc_column_name_used_in_sql:
                                natural_answer = "Could not determine document type column name from SQL result."
                            else:
                                app.logger.info(f"Retrieved PDF DB value: '{pdf_path_segment_from_db}', Shipment name: '{shipment_name_for_folder}', DocColumn: '{doc_column_name_used_in_sql}'")
                                pdf_text = util_extract_text_from_pdf(pdf_path_segment_from_db, shipment_name_for_folder, doc_column_name_used_in_sql)
                                if pdf_text:
                                    natural_answer = answer_question_from_text_with_llm(question, pdf_text, chat_history)
                                    db_results = None 
                                    app.logger.info("Successfully processed PDF text with LLM for an answer.")
                                else:
                                    natural_answer = "Could not extract text from the identified PDF."
                    else:
                        natural_answer = "Could not find a relevant PDF path for your question."
                        app.logger.warning(f"PDF path query returned no results or unexpected format: {pdf_path_results}")
                except ValueError as ve:
                    app.logger.error(f"Error executing PDF path SQL: {ve}")
                    natural_answer = f"Error finding PDF: {ve}"
                except Exception as e:
                    app.logger.error(f"Unexpected error during PDF path retrieval/parsing: {e}")
                    natural_answer = "An unexpected error occurred while trying to process the PDF."
        
        elif generated_sql.startswith("#") or not generated_sql.strip().upper().startswith("SELECT"):
            app.logger.warning(f"LLM returned non-executable SQL or a comment: {generated_sql}")
            natural_answer = f"Could not generate a valid SQL query for your question. LLM said: {generated_sql}"
        else:
            try:
                db_results = execute_sql_query(generated_sql)
                natural_answer = "Query executed successfully. Returning data."
            except ValueError as ve:
                app.logger.error(f"Error executing generated SQL: {ve}")
                natural_answer = f"Error executing the generated SQL query: {ve}"
            except Exception as e:
                app.logger.error(f"Unexpected error during SQL execution: {e}")
                natural_answer = f"An unexpected error occurred while executing the SQL query."

        response_data = {
            "received_question": question,
            "received_selected_row": selected_row_data,
            "received_chat_history": chat_history,
            "table_schema_for_llm": table_schema,
            "sql_query_generated": generated_sql,
            "answer": natural_answer,
            "data_from_db": db_results
        }
        return jsonify(response_data), 200

    except FileNotFoundError as e:
        app.logger.error(f"Error in /query: {str(e)}")
        return jsonify({"error": "Database file not found. Ensure the main application has initialized it.", "details": str(e)}), 500
    except sqlite3.Error as e:
        app.logger.error(f"SQLite error in /query: {str(e)}")
        return jsonify({"error": "A database error occurred.", "details": str(e)}), 500
    except Exception as e:
        app.logger.error(f"Critical error in /query handler: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": "An critical internal server error occurred", "details": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True) 