console.log("--- Executing server.js: Line 1 ---");

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const multer = require('multer'); // For handling file uploads
const fs = require('fs'); // For reading file content if multer saves to disk (not used with memoryStorage)
const { parse } = require('csv-parse/sync'); // Import the synchronous parser
const axios = require('axios'); // Added for making HTTP requests to Python service
const { Client } = require('@notionhq/client'); // Add Notion Client

console.log('Starting server.js...');

// Initialize Notion client
// IMPORTANT: Replace 'YOUR_NOTION_API_KEY' with your actual Notion API key.
// It's highly recommended to use an environment variable for this in production.
const notion = new Client({ auth: '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' });

const app = express();
const port = process.env.PORT || 3001;

// --- Temporary storage for CSV processing report ---
let lastCsvProcessingReport = { status: "No CSV processed yet." };
// --- End temporary storage ---

// Serve static files (index.html, script.js, style.css) from the current directory
app.use(express.static(__dirname)); 
// console.log(`Serving static files from ${__dirname}`); // Optional: for debugging

// Multer setup for CSV file upload (in-memory storage)
const storage = multer.memoryStorage(); // Stores file in memory as a Buffer
const upload = multer({ storage: storage });

// Middleware
app.use(cors());
app.use(express.json());

console.log('Middleware configured.');

// Database setup
const DB_PATH = './shipping_data.db';
console.log(`Attempting to connect to database at: ${DB_PATH}`);

const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
        console.error("Error connecting to the SQLite database:", err.message);
        return;
    }
    console.log("Successfully connected to the SQLite database.");

    // Create shipments table if it doesn't exist
    // Adjusted to use correct camelCased column names and appropriate types
    db.run(`CREATE TABLE IF NOT EXISTS shipments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shipmentName TEXT,
        oblNo TEXT,
        status TEXT,
        contractNo TEXT,
        piNo TEXT,
        piValue TEXT, 
        invoiceNo TEXT,
        fclsGoods TEXT,
        shippingLine TEXT,
        etd TEXT, 
        eta TEXT, 
        sPrice TEXT, 
        grossWeight TEXT, 
        contractQuantityMt TEXT, 
        totalAmount TEXT, 
        provisionalInvoiceValue TEXT, 
        finalInvoiceBalance TEXT, 
        polZnPercent TEXT, 
        podZnPercent TEXT, 
        polMoisture TEXT, 
        podMoisture TEXT, 
        lmePi TEXT, 
        lmePol TEXT, 
        lmePod TEXT, 
        trackingNo TEXT, 
        dueDate TEXT, 
        laboratoryReport TEXT,
        shippingDocsProvisional TEXT,
        shippingDocsFinalDocs TEXT,
        lastEditedTime TEXT DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) {
            console.error("Error creating shipments table:", err.message);
            return;
        }
        console.log("Shipments table successfully checked/created.");

        // New Diagnostic Query: Inspect ETD values and their conversion by date()
        // const diagnosticSqlInspect = `
        //     SELECT id, status, etd, date(etd) as converted_etd
        //     FROM shipments
        //     WHERE LOWER(status) = 'done'
        //     ORDER BY id DESC
        //     LIMIT 10;
        // `;
        // db.all(diagnosticSqlInspect, [], (err, rows) => {
        //     if (err) {
        //         console.error("Error running ETD inspection query:", err.message);
        //     } else {
        //         console.log("---- ETD INSPECTION ----");
        //         console.log("Query: Last 10 'done' shipments - showing etd & date(etd):");
        //         if (rows && rows.length > 0) {
        //             rows.forEach(row => {
        //                 console.log(`ID: ${row.id}, Status: ${row.status}, ETD: '${row.etd}', date(ETD): '${row.converted_etd}'`);
        //             });
        //         } else {
        //             console.log("No matching 'done' shipments found for ETD inspection.");
        //         }
        //         console.log("-------------------------");
        //     }
        // });
    });
});

console.log('Database setup initiated.');

// Basic route to check if server is up
// app.get('/', (req, res) => { // This will now be handled by express.static if index.html exists
//     console.log('GET / request received - (now likely for static index.html)');
//     // res.send('Shipping Dashboard Backend is running!'); // No longer needed if index.html is served
// });

// API endpoint to get all shipments
app.get('/api/shipments', (req, res) => {
    console.log('GET /api/shipments request received');
    
    // Set no-cache headers
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');

    db.all("SELECT * FROM shipments ORDER BY id DESC", [], (err, rows) => {
        if (err) {
            console.error('Error fetching shipments:', err.message);
            res.status(500).json({error: err.message});
            return;
        }
        // console.log('Shipments fetched:', rows);
        res.json(rows);
    });
});

// Utility function to convert string to camelCase
function util_camelCase(str) {
    if (typeof str !== 'string') return '';
    // Trim whitespace, then replace non-alphanumeric sequences (keeping spaces for now) with a single space
    str = str.trim().replace(/[^a-zA-Z0-9\s\/().%-]/g, ''); // Allow specific symbols like / ( ) . % -
    // Handle cases like "POL Zn%" -> "polZnPercent" or "OBL No. " -> "oblNo"
    // Special handling for "%" -> "Percent"
    str = str.replace(/%/g, 'Percent');

    return str
        .replace(/\s*\(\s*/g, ' ') // Convert " (" to " "
        .replace(/\s*\)\s*/g, ' ') // Convert ") " to " "
        .replace(/\s*\/\s*/g, ' ') // Convert " / " to " "
        .replace(/\s*-\s*/g, ' ') // Convert " - " to " "
        .replace(/\s*\.\s*/g, ' ') // Convert " . " to " "
        .split(/\s+/) // Split by one or more spaces
        .map((word, index) => {
            if (word.length === 0) return '';
            // If it's the first word, lowercase it.
            // Otherwise, capitalize the first letter and lowercase the rest.
            if (index === 0) {
                return word.toLowerCase();
            }
            // If a word is all caps (like "PI" or "NO" or "ZN"), keep it as is if it's short (2-3 chars), otherwise capitalize first and lower rest
            if (word.toUpperCase() === word && word.length <= 3) {
                 // If previous word ended a sentence (e.g. "oblNo", not "oblNO")
                // For now, let's just capitalize first letter if not first word
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            }
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join('')
        // Post-join cleanup for specific known patterns
        .replace(/No(\b|(?=[A-Z]))/g, 'No'); // Retain "No" e.g. in "oblNo", "piNo"
}

// API endpoint for CSV Upload
app.post('/api/upload-csv', upload.single('csvfile'), (req, res) => {
    console.log('POST /api/upload-csv request received');
    // Reset report for current upload
    currentProcessingReport = {
        fileName: req.file ? req.file.originalname : 'N/A',
        fileSize: req.file ? req.file.size : 'N/A',
        timestamp: new Date().toISOString(),
        status: 'Processing',
        parsedHeaders: [],
        firstFewRawRecords: [],
        firstFewMappedRows: [],
        insertedRowCount: 0,
        errors: []
    };

    if (!req.file) {
        console.log('No file uploaded.');
        currentProcessingReport.status = 'Error: No file uploaded.';
        currentProcessingReport.errors.push('No file was received by the server.');
        lastCsvProcessingReport = currentProcessingReport;
        return res.status(400).send('No file uploaded.');
    }

    console.log('File received:', req.file.originalname, 'Size:', req.file.size);

    try {
        const fileContent = req.file.buffer.toString('utf8');
        const records = parse(fileContent, {
            columns: true, // Treat the first row as column headers
            skip_empty_lines: true,
            trim: true,
        });

        if (!records || records.length === 0) {
            console.log('CSV file is empty or contains no data rows after parsing.');
            currentProcessingReport.status = 'Error: CSV empty or no data rows after parsing.';
            lastCsvProcessingReport = currentProcessingReport;
            return res.status(400).send('CSV file is empty or contains no data rows.');
        }

        if (records.length > 0) {
            // Get original headers from the first parsed CSV record
            const originalCsvHeaders = Object.keys(records[0]);
            console.log("Original CSV Headers (from csv-parse library):", originalCsvHeaders);

            // Create a map from original CSV header to cleaned, camelCased header
            // And also an array of cleaned headers in order
            const cleanedCamelCasedHeaders = [];
            const headerMapToCleaned = {}; // originalHeader: cleanedCamelCaseHeader

            originalCsvHeaders.forEach(originalHeader => {
                const cleanedHeader = util_camelCase(originalHeader);
                headerMapToCleaned[originalHeader] = cleanedHeader;
                if (!cleanedCamelCasedHeaders.includes(cleanedHeader)) { // Avoid duplicates if cleaning leads to same name
                    cleanedCamelCasedHeaders.push(cleanedHeader);
                }
            });
            
            currentProcessingReport.parsedHeaders = cleanedCamelCasedHeaders; // Report the cleaned headers
            console.log("Cleaned (camelCased) Headers:", currentProcessingReport.parsedHeaders);
            console.log("Header Map (Original CSV Header -> Cleaned DB Header Name):", headerMapToCleaned);

        }
        currentProcessingReport.firstFewRawRecords = records.slice(0, 3);

        // Define expected DB column names (ALL 30 based on CSV headers) - these should be the TARGET clean names
        const dbColumns = [
            'shipmentName', 'oblNo', 'status', 'contractNo', 'piNo', 'piValue',
            'invoiceNo', 'fclsGoods', 'shippingLine', 'etd', 'eta', 'sPrice',
            'grossWeight', 'contractQuantityMT', 'totalAmount',
            'provisionalInvoiceValue', 'finalInvoiceBalance', 
            'polZnPercent',
            'podZnPercent',
            'polMoisture', 'podMoisture', 'lmePi', 'lmePol', 'lmePod',
            'trackingNo',
            'dueDate', 'laboratoryReport', 
            'shippingDocsProvisional', 
            'shippingDocsFinalDocs', 'lastEditedTime'
        ];

        // Explicit mappings: CSV Original Header String (after basic trim perhaps) -> Target DB Column Name (from dbColumns)
        // This is for cases where util_camelCase might not perfectly match dbColumns for some tricky original headers.
        // Example: '  Shipping Docs/ provisional hipping Docs/ provisional ': 'shippingDocsProvisional'
        // We will try to rely mostly on util_camelCase and direct matching with dbColumns.
        // This map can be used if a cleaned header STILL doesn't match a dbColumn name.
        const manualHeaderCorrectionMap = {
            // 'Original CSV Header String (exactly as parsed or slightly pre-cleaned)': 'targetDbColumnName',
            // Example: if 'Shipping Docs/ FINAL Docs' becomes 'shippingDocsFINALDocs' via camelCase,
            // but dbColumn is 'shippingDocsFinalDocs', we could map:
            // 'Shipping Docs/ FINAL Docs': 'shippingDocsFinalDocs'
            // OR, ensure util_camelCase handles it.
            // Let's make util_camelCase robust. For now, this map can be empty or used for very specific overrides.
             'shippingdocsprovisionalhippingdocsprovisional': 'shippingDocsProvisional', // If camelCase of a complex header results in this
             'polzn': 'polZnPercent',
             'podzn': 'podZnPercent',
             'tracking': 'trackingNo'
        };
        // Get the cleaned headers again to be used for mapping, derived from the first record processed by csv-parse.
        const firstRecordKeys = records.length > 0 ? Object.keys(records[0]) : [];
        const cleanedHeaderMapForRecord = {}; // originalCSVKeyFromRecord : cleanedCamelCaseKey
        firstRecordKeys.forEach(originalKey => {
            cleanedHeaderMapForRecord[originalKey] = util_camelCase(originalKey);
        });

        db.serialize(() => {
            db.run("BEGIN TRANSACTION;");
            db.run("DELETE FROM shipments;", (err) => {
                if (err) {
                    console.error('Error deleting old shipments:', err.message);
                    db.run("ROLLBACK;");
                    return res.status(500).send('Error clearing old data.');
                }
                console.log('Old shipments deleted.');

                const stmt = db.prepare(`INSERT INTO shipments (
                    ${dbColumns.join(', ')}
                ) VALUES (${dbColumns.map(() => '?').join(', ')})`);

                console.log('---- BEGIN CSV ROW PROCESSING (using csv-parse) ----');
                for (const record of records) { // record uses original CSV headers as keys
                    const cleanedRecord = {};
                    for (const originalCsvKey in record) {
                        if (Object.prototype.hasOwnProperty.call(record, originalCsvKey)) {
                            const cleanedKey = cleanedHeaderMapForRecord[originalCsvKey] || util_camelCase(originalCsvKey); // Fallback just in case
                            cleanedRecord[cleanedKey] = record[originalCsvKey];
                        }
                    }

                    const rowValuesForDb = dbColumns.map(dbColName => {
                        // dbColName is the target clean/camelCased name, e.g., 'shipmentName'
                        let value = cleanedRecord[dbColName]; // Directly use the dbColName to get value from cleanedRecord

                        // If direct lookup fails, check manualHeaderCorrectionMap
                        // This might be needed if cleanedRecord's key, despite util_camelCase, isn't an exact match for dbColName
                        if (value === undefined) {
                            for (const correctedKey in manualHeaderCorrectionMap) {
                                if (manualHeaderCorrectionMap[correctedKey] === dbColName) {
                                     // correctedKey is what util_camelCase might have produced, 
                                     // manualHeaderCorrectionMap[correctedKey] is the actual dbColName
                                    if (cleanedRecord[correctedKey] !== undefined) {
                                        value = cleanedRecord[correctedKey];
                                        break;
                                    }
                                }
                            }
                        }
                         // Special handling for specific DB columns if values need transformation
                        if (dbColName === 'piValue' || dbColName === 'totalAmount' || dbColName === 'provisionalInvoiceValue' || dbColName === 'finalInvoiceBalance' || dbColName === 'sPrice') {
                            if (typeof value === 'string') {
                                // Remove currency symbols and extraneous spaces for storage, but keep commas for numbers.
                                // The database stores them as TEXT, so this cleaning is for consistency.
                                // The LLM prompt handles conversion to REAL for querying.
                                // Frontend formatting handles display.
                                // value = value.replace(/\$/g, '').trim(); 
                                // Keep $, frontend will handle it. LLM also handles it with REPLACE.
                            }
                        }

                        return value !== undefined ? value : null; // Ensure null if value is still undefined
                    });

                    if (currentProcessingReport.firstFewMappedRows.length < 3) {
                        let mappedDetail = {};
                        dbColumns.forEach((colName, idx) => mappedDetail[colName] = rowValuesForDb[idx]);
                        currentProcessingReport.firstFewMappedRows.push(mappedDetail);
                    }
                    
                    stmt.run(rowValuesForDb, function(err) {
                        if (err) {
                            console.warn(`Error inserting row: ${rowValuesForDb}, Error: ${err.message}`);
                            currentProcessingReport.errors.push({ Erorr: err.message, values: rowValuesForDb });
                        } else {
                            currentProcessingReport.insertedRowCount++;
                        }
                    });
                }
                console.log('---- END CSV ROW PROCESSING ----');

                stmt.finalize((err) => {
                    if (err) {
                        console.error('Error finalizing statement:', err.message);
                        db.run("ROLLBACK;");
                        return res.status(500).send('Error finalizing data insertion.');
                    }
                    db.run("COMMIT;", (commitErr) => {
                        if (commitErr) {
                            console.error('Error committing transaction:', commitErr.message);
                            return res.status(500).send('Error committing data.');
                        }
                        currentProcessingReport.status = 'Success';
                        lastCsvProcessingReport = currentProcessingReport;
                        console.log(`Successfully inserted ${currentProcessingReport.insertedRowCount} rows from CSV.`);
                        res.send(`Successfully uploaded and processed ${currentProcessingReport.insertedRowCount} rows from ${req.file.originalname}.`);
                    });
                });
            });
        });
    } catch (parseError) {
        console.error('Error parsing CSV:', parseError.message);
        currentProcessingReport.status = 'Error: CSV Parsing Failed.';
        currentProcessingReport.errors.push({ error: parseError.message, details: parseError.toString()});
        lastCsvProcessingReport = currentProcessingReport;
        res.status(400).send(`Error parsing CSV: ${parseError.message}`);
    }
});

// API endpoint for LLM Querying - delegates to Python service
app.post('/api/llm-query', async (req, res) => {
    console.log('POST /api/llm-query request received');
    const { question, selected_row_data, chat_history } = req.body;

    console.log('Forwarding to Python service:', { question, selected_row_data, chat_history: chat_history ? chat_history.map(turn => ({...turn, content: turn.content.slice(0,100) + (turn.content.length > 100 ? '...' : '')})) : [] }); // Log truncated history

    // Filter chat_history before sending to Python
    const filteredChatHistory = (chat_history || []).filter(turn => {
        if (turn.role === 'assistant') {
            // Filter out assistant messages that are just data dumps or standard processing messages
            const content = turn.content || "";
            if (content.startsWith('Query executed successfully. Returning data.') ||
                content.startsWith('Extracted text from PDF to answer question') ||
                content.startsWith("Could not generate a valid SQL query for your question. LLM said: # Cannot generate SQL") ||
                content.includes("Generated SQL:")) { // More general filter for SQL outputs
                return false; // Exclude this turn
            }
        }
        return true; // Keep user turns and other assistant turns
    });
    
    // Log the filtered history to see what's actually being sent
    console.log('Filtered chat_history being sent to Python:', filteredChatHistory.map(turn => ({...turn, content: turn.content.slice(0,100) + (turn.content.length > 100 ? '...' : '')})) );

    const pythonServiceUrl = 'http://localhost:5001/query';
    const response = await axios.post(pythonServiceUrl, 
        { question, selected_row_data, chat_history: filteredChatHistory }, 
        {
            headers: {
                'Content-Type': 'application/json'
            }
        }
    );

    // Relay the Python service's response back to the client
    console.log('Received response from Python service.');
    res.json(response.data);
});

// New endpoint for CSV processing diagnostics
app.get('/api/csv-processing-report', (req, res) => {
    console.log('GET /api/csv-processing-report request received');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store'); // Ensure fresh report
    res.json(lastCsvProcessingReport);
});

// Route to serve a simple HTML form for testing CSV upload
app.get('/test-upload-form', (req, res) => {
    console.log('GET /test-upload-form request received');
    res.setHeader('Content-Type', 'text/html');
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Test CSV Upload</title>
            <style>
                body { font-family: sans-serif; margin: 20px; background-color: #f4f4f4; color: #333; }
                h1 { color: #333; }
                form { background-color: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                input[type="file"] { display: block; margin-bottom: 10px; }
                button { padding: 10px 15px; background-color: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
                button:hover { background-color: #0056b3; }
            </style>
        </head>
        <body>
            <h1>Test CSV File Upload</h1>
            <p>This form will POST to <code>/api/upload-csv</code>.</p>
            <form action="http://localhost:3000/api/upload-csv" method="POST" enctype="multipart/form-data">
                <div>
                    <label for="csvfile">Choose a CSV file:</label>
                    <input type="file" id="csvfile" name="csvfile" accept=".csv" required>
                </div>
                <br>
                <button type="submit">Upload CSV</button>
            </form>
        </body>
        </html>
    `);
});

// New API endpoint for Notion queries
app.post('/api/ask-notion', async (req, res) => {
    console.log('POST /api/ask-notion request received');
    const { question } = req.body;

    if (!question) {
        return res.status(400).json({ error: 'Question is required' });
    }

    try {
        const databaseId = '1f07de8bc79380fb8707e21d30b710db'; // Your provided Database ID
        console.log(`Querying Notion Database ID: ${databaseId} (Ignoring user question for this step)`);

        // Query the specific database
        // We are not using the user's 'question' to filter the database yet.
        // This is to first retrieve entries and understand their structure.
        const databaseQueryResponse = await notion.databases.query({
            database_id: databaseId,
        });

        console.log(`Notion database query returned ${databaseQueryResponse.results.length} results.`);

        // Helper function to extract the value from a Notion property object
        function util_getNotionPropertyValue(property) {
            if (!property) return null;
            switch (property.type) {
                case 'title':
                    return property.title[0]?.plain_text || null;
                case 'rich_text':
                    return property.rich_text[0]?.plain_text || null;
                case 'number':
                    return property.number;
                case 'select':
                    return property.select?.name || null;
                case 'multi_select':
                    return property.multi_select.map(option => option.name);
                case 'date':
                    return property.date?.start || null;
                case 'checkbox':
                    return property.checkbox;
                case 'url':
                    return property.url;
                case 'email':
                    return property.email;
                case 'phone_number':
                    return property.phone_number;
                case 'files':
                    return property.files.map(file => file.name);
                // Add other types as needed: formula, relation, rollup, people, created_by, created_time, last_edited_by, last_edited_time
                case 'formula':
                    switch (property.formula.type) {
                        case 'string': return property.formula.string;
                        case 'number': return property.formula.number;
                        case 'boolean': return property.formula.boolean;
                        case 'date': return property.formula.date?.start;
                        default: return null;
                    }
                case 'created_time':
                    return property.created_time;
                case 'last_edited_time':
                    return property.last_edited_time;
                default:
                    console.warn(`Unsupported Notion property type: ${property.type}`);
                    return null;
            }
        }

        // Transform the results into a simpler array of objects
        const simplifiedResults = databaseQueryResponse.results.map(page => {
            const simplifiedPage = { id: page.id };
            for (const propertyName in page.properties) {
                // Normalize propertyName for cleaner keys in our simplified object (e.g., remove leading/trailing spaces, camelCase)
                // For now, let's just trim, as camelCasing might obscure the original Notion name too much for initial debugging
                const cleanName = propertyName.trim(); 
                simplifiedPage[cleanName] = util_getNotionPropertyValue(page.properties[propertyName]);
            }
            return simplifiedPage;
        });
        
        res.json({
            answer: `Successfully queried database ${databaseId}. Found ${simplifiedResults.length} item(s). User question "${question}" not yet processed. Displaying simplified results. Full processing TBD.`,
            originalQuestion: question,
            notionResponse: simplifiedResults // Send the simplified results
        });

    } catch (error) {
        console.error('Error querying Notion API:', error);
        res.status(500).json({ error: 'Failed to query Notion API', details: error.message });
    }
});

console.log('Default route / configured.');

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});

console.log('app.listen called.');

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('SIGINT received, closing database connection.');
    db.close((err) => {
        if (err) {
            console.error('Error closing the database',err.message);
            process.exit(1);
        }
        console.log('Database connection closed successfully.');
        process.exit(0);
    });
});

console.log('SIGINT handler set up.'); 