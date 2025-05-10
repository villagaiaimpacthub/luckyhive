from flask import Flask, request, jsonify
import os
import sqlite3 # For SQLite interaction
from dotenv import load_dotenv # To load .env file
import anthropic # Import the Anthropic SDK

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
    # Basic protection against obviously harmful commands (very simplistic)
    # A more robust solution would involve query parsing/validation or read-only DB user if possible.
    disallowed_keywords = ['DROP', 'DELETE', 'INSERT', 'UPDATE', 'CREATE', 'ALTER', 'TRUNCATE']
    if any(keyword in sql_query.upper() for keyword in disallowed_keywords) and not sql_query.upper().startswith("SELECT"):
        # Allow SELECT even if other keywords are in comments or strings within the SELECT.
        # This is still not perfectly safe for complex scenarios.
        # For now, we are mostly expecting SELECT queries from the LLM.
        if not sql_query.strip().upper().startswith("SELECT"):
             app.logger.warning(f"Potentially unsafe SQL query blocked: {sql_query}")
             raise ValueError("Query type not allowed. Only SELECT statements are permitted.")

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

def generate_sql_with_llm(question, schema):
    """Uses an LLM to generate SQL from a natural language question and table schema."""
    if not anthropic_client:
        return "# LLM client not initialized."

    # More sophisticated prompt engineering can be done here.
    # Forcing SQLite dialect is important.
    prompt = (
        f"{anthropic.HUMAN_PROMPT}\n"
        f"Given the following SQLite table schema for a table named 'shipments':\n{schema}\n\n"
        f"And the user's question: '{question}'\n\n"
        f"Please generate a syntactically correct SQLite SQL query to answer the question. "
        f"Only return the SQL query itself and nothing else. Do not include any explanations or markdown formatting. "
        f"When comparing string values in a WHERE clause, use the LOWER() function on both the column and the value to ensure case-insensitive matching (e.g., LOWER(column_name) = LOWER('value')). "
        f"If the question cannot be answered with a SQL query, is ambiguous, or requires modification of data (UPDATE, INSERT, DELETE), "
        f"then return only the text: '# Cannot generate SQL for this question.'"
        f"{anthropic.AI_PROMPT}"
    )

    try:
        completion = anthropic_client.messages.create(
            model="claude-3-haiku-20240307", # Or claude-3-opus-20240229 / claude-3-sonnet-20240229
            max_tokens=1024,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )
        # The response structure is a bit different for messages API
        # Assuming the SQL is in the first content block of the response
        sql_query = completion.content[0].text.strip()
        return sql_query
    except Exception as e:
        app.logger.error(f"Error calling Anthropic API: {e}")
        return f"# Error during SQL generation: {e}"

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
        
        # 1. Get schema from shipping_data.db
        table_schema = get_table_schema()
        if not table_schema:
             return jsonify({"error": f"Could not retrieve schema for table 'shipments'. Database might be empty or table missing."}), 500

        if not anthropic_client:
            app.logger.warning("LLM client not available for SQL generation.")
            natural_answer = "LLM client not available. Cannot generate SQL or process query further."
        else:
            generated_sql = generate_sql_with_llm(question, table_schema)
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