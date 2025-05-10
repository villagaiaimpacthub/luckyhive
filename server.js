console.log("--- Executing server.js: Line 1 ---");

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const multer = require('multer'); // For handling file uploads
const fs = require('fs'); // For reading file content if multer saves to disk (not used with memoryStorage)
const { parse } = require('csv-parse/sync'); // Import the synchronous parser
const axios = require('axios'); // Added for making HTTP requests to Python service

console.log('Starting server.js...');

const app = express();
const port = process.env.PORT || 3000;

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

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
        // Optionally, exit if DB connection fails critically, though app.listen might still try
        // process.exit(1);
        return; // Prevent further DB operations if connection failed
    } 
    console.log('Successfully connected to the SQLite database.');
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
        contractQuantityMT TEXT,
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
        lastEditedTime TEXT
    )`, (err) => {
        if (err) {
            console.error("Error creating shipments table", err.message);
        } else {
            console.log("Shipments table successfully checked/created.");
        }
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
            currentProcessingReport.parsedHeaders = Object.keys(records[0]);
            console.log("Headers found by csv-parse from CSV's first row:", currentProcessingReport.parsedHeaders);
        }
        currentProcessingReport.firstFewRawRecords = records.slice(0, 3); // Store first 3 raw records

        // Define expected DB column names (ALL 30 based on CSV headers)
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

        const normalizeKey = (key) => {
            if (typeof key !== 'string') return '';
            return key.replace(/^\uFEFF/, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
        };

        // More explicit mapping for problematic CSV headers to DB column names
        // DB Column Name (from dbColumns) : Expected Normalized CSV Header
        const explicitHeaderMappings = {
            'polZnPercent': 'polzn', // ' POL ZN%' normalizes to 'polzn'
            'podZnPercent': 'podzn', // 'POD ZN%' normalizes to 'podzn'
            'trackingNo': 'tracking',  // 'Tracking # ' normalizes to 'tracking'
            'shippingDocsProvisional': 'shippingdocsprovisionalhippingdocsprovisional' 
            // '  Shipping Docs/ provisional hipping Docs/ provisional ' normalizes to 'shippingdocsprovisionalhippingdocsprovisional'
            // This will now map to the DB column 'shippingDocsProvisional'. 
            // If the intent was that 'shippingDocsProvisional' DB column should ONLY get data from a simple 'Shipping Docs Provisional' CSV header,
            // then this mapping might be too greedy. However, it addresses the complex header.
        };

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
                for (const record of records) {
                    const rowValuesForDb = dbColumns.map(dbColName => {
                        let value = null;
                        const normalizedDbColName = normalizeKey(dbColName);
                        
                        // Check for an explicit mapping first
                        const explicitTargetNormalizedCsvKey = explicitHeaderMappings[dbColName];

                        let foundCsvHeaderKey;
                        if (explicitTargetNormalizedCsvKey) {
                            foundCsvHeaderKey = Object.keys(record).find(csvHeader => 
                                normalizeKey(csvHeader) === explicitTargetNormalizedCsvKey
                            );
                        } else {
                            // Standard matching: normalized CSV header matches normalized DB column name
                            foundCsvHeaderKey = Object.keys(record).find(csvHeader => 
                                normalizeKey(csvHeader) === normalizedDbColName
                            );
                        }
                        
                        if (foundCsvHeaderKey) {
                            value = record[foundCsvHeaderKey];
                        }
                        return value || null;
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
    const { question } = req.body;

    if (!question) {
        return res.status(400).json({ error: 'Missing \'question\' in request body' });
    }

    const pythonServiceUrl = 'http://localhost:5001/query'; // URL of your Python Flask service

    try {
        console.log(`Forwarding question to Python service: ${question}`);
        const pythonResponse = await axios.post(pythonServiceUrl, {
            question: question
        });

        // Relay the Python service's response back to the client
        console.log('Received response from Python service.');
        res.json(pythonResponse.data);

    } catch (error) {
        console.error('Error calling Python service:', error.message);
        let errorMsg = 'Error communicating with the LLM data service.';
        let statusCode = 500;

        if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            console.error('Python service responded with error:', error.response.data);
            errorMsg = error.response.data.error || errorMsg; // Use error from Python service if available
            statusCode = error.response.status || statusCode;
        } else if (error.request) {
            // The request was made but no response was received
            console.error('No response received from Python service:', error.request);
            errorMsg = 'No response from LLM data service. Ensure it is running.';
        } else {
            // Something happened in setting up the request that triggered an Error
            console.error('Error setting up request to Python service:', error.message);
        }
        res.status(statusCode).json({ error: errorMsg, details: error.message });
    }
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