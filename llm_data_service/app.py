from flask import Flask, request, jsonify
import os
import sqlite3 # For SQLite interaction
from dotenv import load_dotenv # To load .env file
import anthropic # Import the Anthropic SDK
import re # Import the re module for regular expressions

load_dotenv() # Load environment variables from .env, including ANTHROPIC_API_KEY

app = Flask(__name__)

# Construct the absolute path to the database
# __file__ is the path to the current script (app.py)
# os.path.dirname(__file__) is the directory of app.py (llm_data_service)
# os.path.join(..., '..', 'shipping_data.db') goes up one level and then to shipping_data.db
DATABASE_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'shipping_data.db'))

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
        f"You are an AI assistant that helps users query a SQLite database table named 'shipments'.",
        f"The table schema is as follows:\n{schema}",
        "Your primary goal is to generate a syntactically correct SQLite SQL query to answer the user's question.",
        "IMPORTANT: You MUST return ONLY the raw SQL query. Do NOT include any surrounding text, explanations, or markdown formatting like ```sql ... ``` or phrases like 'Here is the SQL:' or 'Query executed successfully. Returning data.'. Only the SQL statement itself, starting directly with SELECT, INSERT, UPDATE, DELETE, etc.",
        "When comparing string values in a WHERE clause, always use the LOWER() function on the database column.",
        "For the value part of the comparison, if the user provides 'Value', your SQL should be `LOWER(column) = \'value\'` (i.e., you must put the lowercase version of the user's value directly into the SQL string literal).",
        "Example: User asks for 'status is Done' -> SQL: `LOWER(status) = \'done\'`.",
        "Example: User asks for 'goods are EAFD' -> SQL: `LOWER(fclsGoods) = \'eafd\'`.",
        "If checking for non-empty strings, use `LENGTH(TRIM(column_name)) > 0` or (`column_name <> \'\' AND column_name IS NOT NULL`).",
        "Avoid using newline characters (\\n, \\r) within SQL string literals. For example, `LOWER(piNo) <> \'\'` is correct, not `LOWER(piNo) <> \'\\n\'`.",
        "When performing calculations (e.g., MAX, MIN, SUM, AVG, or when sorting numerically) on columns that might contain currency symbols (like '$') or commas (like in fields named 'piValue', 'totalAmount', 'sPrice', 'provisionalInvoiceValue', 'finalInvoiceBalance'), you MUST strip these characters before casting to a numeric type (REAL or DECIMAL for SQLite). Use nested REPLACE functions. For example, to treat 'piValue' as a number, the expression should be CAST(REPLACE(REPLACE(piValue, '$', ''), ',', '') AS REAL). Apply this to any relevant numeric column in SELECT, WHERE, OR ORDER BY clauses if it contains such characters.",
        "DATE HANDLING: The 'etd', 'eta', and 'dueDate' columns store dates as text in the format 'Month Day, Year' (e.g., 'January 26, 2025'). SQLite's date() function will NOT correctly interpret this format directly and will return NULL (e.g., date('January 26, 2025') is NULL). To perform date comparisons on these columns, you MUST use the following SQLite expression pattern to first convert the column's string value into the 'YYYY-MM-DD' format. Let this conversion be represented by `convert_to_YYYYMMDD(column_name)` which expands to: " +
        "`PRINTF('%s-%02d-%02d', SUBSTR(column_name, INSTR(column_name, ', ') + 2), CASE SUBSTR(column_name, 1, INSTR(column_name, ' ') - 1) WHEN 'January' THEN 1 WHEN 'February' THEN 2 WHEN 'March' THEN 3 WHEN 'April' THEN 4 WHEN 'May' THEN 5 WHEN 'June' THEN 6 WHEN 'July' THEN 7 WHEN 'August' THEN 8 WHEN 'September' THEN 9 WHEN 'October' THEN 10 WHEN 'November' THEN 11 WHEN 'December' THEN 12 END, CAST(REPLACE(SUBSTR(column_name, INSTR(column_name, ' ') + 1), ',', '') AS INTEGER))`" +
        ". Example: A user query 'ETD after January 1, 2025' should translate to SQL like: `date(PRINTF('%s-%02d-%02d', SUBSTR(etd, INSTR(etd, ', ') + 2), CASE SUBSTR(etd, 1, INSTR(etd, ' ') - 1) WHEN 'January' THEN 1 WHEN 'February' THEN 2 WHEN 'March' THEN 3 WHEN 'April' THEN 4 WHEN 'May' THEN 5 WHEN 'June' THEN 6 WHEN 'July' THEN 7 WHEN 'August' THEN 8 WHEN 'September' THEN 9 WHEN 'October' THEN 10 WHEN 'November' THEN 11 WHEN 'December' THEN 12 END, CAST(REPLACE(SUBSTR(etd, INSTR(etd, ' ') + 1), ',', '') AS INTEGER))) > date('2025-01-01')`. " +
        "Always apply this `convert_to_YYYYMMDD(column_name)` pattern for `etd`, `eta`, or `dueDate` columns when they are part of a date comparison. For the user-provided date value in the comparison (e.g., 'January 1, 2025' or 'March 2025'), ensure it is correctly formatted using `date('YYYY-MM-DD')` (e.g., `date('2025-01-01')` for 'January 1, 2025' or `date('2025-03-31')` for 'after March 2025').",
        "If a user provides a general term for filtering (e.g., 'pending', 'eafd') without specifying a column, infer the most relevant column (like status, fclsGoods, shipmentName) based on the term and schema.",
        "If the user's question appears to be a follow-up to a previous query (e.g., using phrases like 'of those', 'and also', 'now filter by'), you should try to combine the conditions from the previous successful SQL query (look for an assistant message in the chat history that includes 'Generated SQL: ...') with the new conditions from the current question. If the previous query in history was a SELECT query, its WHERE clause is a good starting point to append new conditions using AND. Prioritize the most recent user questions and any relevant generated SQL from the immediate preceding assistant message in history. Ensure correct SQL syntax when combining conditions, especially with AND/OR operators and parentheses.",
        "Furthermore, if the user asks for an aggregate value (e.g., 'what is the total ...', 'count them', 'highest value', 'average price') as a follow-up to a filtered view, apply the aggregate function to the dataset defined by the WHERE clause of the most recent relevant query in the chat history. For example, if history implies a filter of 'LOWER(status) = \'done\'', and the user asks 'what is the total pi value?', the query should be something like 'SELECT SUM(CAST(REPLACE(REPLACE(piValue, \'$\', \'\'), \',\', \'\') AS REAL)) FROM shipments WHERE LOWER(status) = \'done\';'.",
        "If the user's question explicitly or implicitly asks to *see the rows* or *show the items* that correspond to an aggregate (e.g., 'show me the shipments with the highest PI value', 'which items have the minimum quantity?'), you should generate a SQL query that returns all standard columns for those rows (e.g., using 'SELECT *'). This typically involves using the aggregate function in a subquery within the WHERE clause. For instance, to 'show items with the highest piValue' from a contextual filter of 'status is done', the query should be like: SELECT * FROM shipments WHERE LOWER(status) = 'done' AND CAST(REPLACE(REPLACE(piValue, \'$\', \'\'), \',\', \'\') AS REAL) = (SELECT MAX(CAST(REPLACE(REPLACE(piValue, \'$\', \'\'), \',\', \'\') AS REAL)) FROM shipments WHERE LOWER(status) = 'done'); Make sure to re-apply all relevant contextual filters from chat history in both the main query and the subquery.",
        "If the question cannot be answered with a SQL query (e.g., it's conversational, too ambiguous, or requires data modification like UPDATE, INSERT, DELETE), then return only the text: '# Cannot generate SQL for this question.'"
    ]

    if selected_row_data:
        row_details = ", ".join([f"{key}: '{value}'" for key, value in selected_row_data.items() if value is not None]) # Filter out None values for clarity
        selected_row_context = f"For additional context, the user has currently selected the following row in their table view: {{ {row_details} }}. If their question refers to 'this item', 'this contract', etc., use this selected row context. Otherwise, rely on the broader chat history and current question."
        system_prompt_parts.insert(2, selected_row_context) # Insert after schema but before main instructions
    
    final_system_prompt = "\n".join(system_prompt_parts)

    messages_for_llm = list(chat_history) 
    messages_for_llm.append({"role": "user", "content": question})

    app.logger.info(f"LLM System Prompt:\n{final_system_prompt}")
    app.logger.info(f"LLM Messages:\n{messages_for_llm}")

    sql_query_from_llm = ""
    cleaned_sql = "" 

    try:
        completion = anthropic_client.messages.create(
            model="claude-3-haiku-20240307",
            max_tokens=1024,
            system=final_system_prompt, 
            messages=messages_for_llm
        )
        sql_query_from_llm = completion.content[0].text.strip()
        app.logger.info(f"Raw SQL query from LLM: {sql_query_from_llm}")

        # Aggressively replace all newlines and carriage returns with a space first
        sql_query_from_llm = sql_query_from_llm.replace('\n', ' ').replace('\r', ' ')

        cleaned_sql = sql_query_from_llm 

        # Attempt to find the start of the actual SQL statement (e.g., SELECT, UPDATE, INSERT, DELETE)
        # This is to strip potential leading conversational text from the LLM.
        sql_keywords = ["SELECT ", "UPDATE ", "INSERT ", "DELETE ", "WITH "] # Added WITH for CTEs
        found_sql_start = False
        for keyword in sql_keywords:
            try:
                # Case-insensitive search for the keyword
                start_index = cleaned_sql.upper().index(keyword)
                cleaned_sql = cleaned_sql[start_index:]
                found_sql_start = True
                break # Found the keyword, no need to check others
            except ValueError:
                continue # Keyword not found
        
        if not found_sql_start and not cleaned_sql.startswith("#"):
            # If no major SQL keyword is found and it's not a comment, this might be an issue.
            # However, the function might return an error message like "# Cannot generate..."
            # The existing check in handle_query for `generated_sql.startswith("#")` will catch those.
            app.logger.warning(f"Could not find a standard SQL starting keyword in LLM output: {cleaned_sql}")

        common_wrappers = [
            "```sql", "```", "SQL:", "Here is the SQL:", 
            "The SQL query is:", "Generated SQL:"
        ]
        for wrapper in common_wrappers:
            if cleaned_sql.lower().startswith(wrapper.lower()):
                cleaned_sql = cleaned_sql[len(wrapper):].strip()
            if wrapper == "```" and cleaned_sql.endswith(wrapper): 
                 cleaned_sql = cleaned_sql[:-len(wrapper)].strip()
        
        def replace_newlines_in_literals(match):
            # Group 1: opening quote, Group 2: content, Group 3: closing quote
            return match.group(1) + match.group(2).replace('\n', ' ').replace('\r', ' ') + match.group(3)
        
        # Regex: Group 1 is the quote char, Group 2 is the content, Group 3 is the closing quote char (same as G1)
        cleaned_sql = re.sub(
            r"('|\")((?:\\\1|(?:(?!\1).))*?)(\1)", 
            replace_newlines_in_literals, 
            cleaned_sql
        )
        
        def lowercase_value_in_LOWER_comparison(match):
            # Group 1: column_name, Group 2: operator, Group 3: opening_quote, Group 4: value, Group 5: closing_quote
            return f"LOWER({match.group(1)}) {match.group(2)} {match.group(3)}{match.group(4).lower()}{match.group(5)}"
        
        cleaned_sql = re.sub(
            r"LOWER\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)\s*(=|LIKE|<>|!=)\s*(['\"])((?:(?!\3).)*?)(\3)", 
            lowercase_value_in_LOWER_comparison, 
            cleaned_sql, 
            flags=re.IGNORECASE
        )

        # Robust semicolon handling:
        # 1. Remove all trailing semicolons.
        original_cleaned_sql_for_logging = cleaned_sql # For logging if changes occur
        temp_stripped_sql = cleaned_sql.strip()
        
        # Remove all trailing semicolons first
        while temp_stripped_sql.endswith(';'):
            temp_stripped_sql = temp_stripped_sql[:-1].strip()
        
        # If it's a SELECT or WITH statement, and it doesn't already end with a semicolon (after initial cleaning/stripping), add one.
        if temp_stripped_sql and not temp_stripped_sql.startswith("#") and \
           temp_stripped_sql.strip().upper().startswith(("SELECT", "WITH")) and \
           not original_cleaned_sql_for_logging.strip().endswith(';'): # Check original before stripping all for this condition
            cleaned_sql = temp_stripped_sql + ';'
        else:
            cleaned_sql = temp_stripped_sql # Use the version with all trailing semicolons removed if not adding one back

        if original_cleaned_sql_for_logging != cleaned_sql and sql_query_from_llm != cleaned_sql : # Avoid double logging if no change here
            app.logger.info(f"SQL after semicolon normalization: \"{cleaned_sql}\"")
        elif sql_query_from_llm != cleaned_sql : # Log if only initial cleaning changed it
            app.logger.info(f"Cleaned & Normalized SQL: \"{cleaned_sql}\"")
        
    except Exception as e:
        app.logger.error(f"Error in LLM processing or SQL cleaning (raw LLM output was: '{sql_query_from_llm}'): {e}")
        # Return the error marker string directly if an exception occurs in the try block
        return f"# Error during SQL generation: {e}"

    # If the try block completed successfully, return the cleaned_sql
    return cleaned_sql

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
        selected_row_data = data.get('selected_row_data') # Get selected_row_data, defaults to None if not present
        chat_history = data.get('chat_history', []) # Get chat_history, defaults to empty list

        app.logger.info(f"Received question: {question}")
        if selected_row_data:
            app.logger.info(f"Received selected_row_data: {selected_row_data}")
        if chat_history:
            app.logger.info(f"Received chat_history length: {len(chat_history)}")
        
        # 1. Get schema from shipping_data.db
        table_schema = get_table_schema()
        if not table_schema:
             return jsonify({"error": f"Could not retrieve schema for table 'shipments'. Database might be empty or table missing."}), 500

        if not anthropic_client:
            app.logger.warning("LLM client not available for SQL generation.")
            natural_answer = "LLM client not available. Cannot generate SQL or process query further."
        else:
            generated_sql = generate_sql_with_llm(question, table_schema, selected_row_data, chat_history)
            if generated_sql.startswith("#") or not generated_sql.strip().upper().startswith("SELECT"):
                app.logger.warning(f"LLM returned non-executable SQL or a comment: {generated_sql}")
                natural_answer = f"Could not generate a valid SQL query for your question. LLM said: {generated_sql}"
            else:
                try:
                    db_results = execute_sql_query(generated_sql)
                    natural_answer = "Query executed successfully. Returning data."
                    # Here, one could optionally send db_results back to the LLM for summarization
                except ValueError as ve: # Catch errors from execute_sql_query
                    app.logger.error(f"Error executing generated SQL: {ve}")
                    natural_answer = f"Error executing the generated SQL query: {ve}"
                    # Potentially include the problematic SQL in the error if safe to do so
                except Exception as e: # Catch any other unexpected errors during execution
                    app.logger.error(f"Unexpected error during SQL execution: {e}")
                    natural_answer = f"An unexpected error occurred while executing the SQL query."

        # --- TODO ---
        # 2. Call LLM with question + schema to get SQL
        # 3. Execute SQL on shipping_data.db
        # 4. (Optional) Call LLM to summarize results
        # 5. Return results
        # ------------

        # Placeholder response for now, including the schema
        response_data = {
            "received_question": question,
            "received_selected_row": selected_row_data, # Include received selected row data
            "received_chat_history": chat_history, # Include received chat history
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
        traceback.print_exc() # For detailed debugging in development
        return jsonify({"error": "An critical internal server error occurred", "details": str(e)}), 500

if __name__ == '__main__':
    # For development, Flask's built-in server is fine.
    # For production, use a proper WSGI server like Gunicorn.
    app.run(host='0.0.0.0', port=5001, debug=True) # Using port 5001 to avoid conflict with Node server (3000) 