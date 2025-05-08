const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const multer = require('multer'); // For handling file uploads
const fs = require('fs'); // For reading file content if multer saves to disk (not used with memoryStorage)

console.log('Starting server.js...');

const app = express();
const port = process.env.PORT || 3000;

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
        contractQuantity TEXT,
        totalAmount TEXT
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
    if (!req.file) {
        console.log('No file uploaded.');
        return res.status(400).send('No file uploaded.');
    }

    console.log('File received:', req.file.originalname, 'Size:', req.file.size);

    // File content is in req.file.buffer
    const csvData = req.file.buffer.toString('utf8');
    const lines = csvData.split(/\r?\n/); // Split by newline, handling Windows and Unix endings

    if (lines.length <= 1) {
        console.log('CSV file is empty or has only a header.');
        return res.status(400).send('CSV file is empty or has only a header.');
    }

    // Assume first line is the header
    const headers = lines[0].split(',').map(h => h.trim());
    // These are the expected DB column names (excluding id)
    const dbColumns = [
        'shipmentName', 'oblNo', 'status', 'contractNo', 'piNo', 'piValue',
        'invoiceNo', 'fclsGoods', 'shippingLine', 'etd', 'eta', 'sPrice',
        'grossWeight', 'contractQuantity', 'totalAmount'
    ];

    // Basic validation: check if headers roughly match (can be improved)
    if (headers.length < dbColumns.length * 0.8) { // Heuristic: at least 80% of columns should be there
        console.warn('CSV headers do not seem to match expected columns. Headers:', headers);
        // return res.status(400).send('CSV headers do not match expected format.');
    }

    const dataRows = lines.slice(1).filter(line => line.trim() !== ''); // Skip header, remove empty lines

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

            let successfullyInsertedCount = 0;
            console.log('---- BEGIN CSV ROW PROCESSING ----');
            for (const row of dataRows) {
                const values = row.split(',').map(v => v.trim());
                const rowValuesForDb = dbColumns.map((col, index) => values[index] || null);
                
                // Detailed log for each row to be inserted
                console.log(`Preparing to insert:`);
                dbColumns.forEach((colName, idx) => {
                    console.log(`  ${colName} (CSV Col ${idx+1}): ${rowValuesForDb[idx]} (Original CSV value: ${values[idx]})`);
                });

                stmt.run(rowValuesForDb, function(err) {
                    if (err) {
                        console.warn(`Error inserting row: ${rowValuesForDb}, Error: ${err.message}`);
                        // Decide if you want to stop on error or continue
                    } else {
                        successfullyInsertedCount++;
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
                    console.log(`Successfully inserted ${successfullyInsertedCount} rows from CSV.`);
                    res.send(`Successfully uploaded and processed ${successfullyInsertedCount} rows from ${req.file.originalname}.`);
                });
            });
        });
    });
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