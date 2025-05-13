console.log("Shipping Dashboard Script Loaded"); 

let selectedRowElement = null; // Remains for now, HIVE might use selected_row_data if SQLite source was active
let selectedRowDataForHive = null; // Remains for now
let hiveChatHistory = []; 

let dataSource = 'mcp'; // Default data source set to MCP

/* Utility function to format numbers for display - Potentially used by HIVE table rendering too
function util_formatNumberForDisplay(number, isCurrency = false) {
    if (number === null || number === undefined || isNaN(parseFloat(number))) {
        return number; 
    }
    const num = parseFloat(number);
    const hasSignificantFraction = Math.abs(num - Math.floor(num)) > 0.0001; 

    let options = {};
    if (isCurrency || hasSignificantFraction) {
        options = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    } else {
        options = { minimumFractionDigits: 0, maximumFractionDigits: 0 };
    }

    let formattedNumber = num.toLocaleString(undefined, options);

    if (isCurrency) {
        formattedNumber = "$" + formattedNumber;
    }
    return formattedNumber;
}
*/

let shipmentData = []; // Main table data - will not be actively used for display in this version
let hiveFilteredDataSnapshot = null; // Main table related - will not be actively used for display in this version
let filteredData = []; // Main table related - will not be actively used for display in this version
let sortColumn = -1; 
let sortDirection = 'asc';

/* Column Resizing Functions - Main Table Specific
let currentlyResizingTh = null;
let startX, startWidth;

function handleMouseDown(e) {
    currentlyResizingTh = e.target.parentElement; 
    startX = e.pageX;
    startWidth = currentlyResizingTh.offsetWidth;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    currentlyResizingTh.classList.add('th-resizing'); 
    document.body.style.userSelect = 'none'; 
    document.body.style.webkitUserSelect = 'none'; 
}

function handleMouseMove(e) {
    if (!currentlyResizingTh) return;
    const deltaX = e.pageX - startX;
    const currentWidth = startWidth + deltaX;
    const finalWidth = Math.max(50, currentWidth); 
    currentlyResizingTh.style.width = finalWidth + 'px'; 
    delete currentlyResizingTh.dataset.previousWidth; 
}

function handleMouseUp() {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    if (currentlyResizingTh) { 
        currentlyResizingTh.classList.remove('th-resizing');
    }
    document.body.style.userSelect = ''; 
    document.body.style.webkitUserSelect = '';
    currentlyResizingTh = null;
}

function handleDoubleClick(e) {
    const th = e.target.parentElement; 
    const previousWidth = th.dataset.previousWidth;

    if (previousWidth) {
        th.style.width = previousWidth;
        delete th.dataset.previousWidth; 
    } else {
        const columnIndex = Array.from(th.parentNode.children).indexOf(th);
        const tableBody = document.getElementById("shipmentTableBody");
        if (!tableBody) return; // Guard clause if table is not present
        let maxWidth = th.scrollWidth; 
        const padding = 18; 

        Array.from(tableBody.rows).forEach(row => {
            const cell = row.cells[columnIndex];
            if (cell) {
                maxWidth = Math.max(maxWidth, cell.scrollWidth);
            }
        });
        th.dataset.previousWidth = th.style.width || (th.offsetWidth + 'px'); 
        th.style.width = (maxWidth + padding) + 'px';
    }
}
*/

/* Cell Editing Functions - Main Table Specific
function makeCellEditable(cell, item, propertyName) {
    cell.addEventListener('dblclick', function() {
        if (cell.querySelector('input') || cell.querySelector('select')) return; 

        const originalValue = cell.textContent;
        const originalHtml = cell.innerHTML; 
        
        let valueToEdit = originalValue;
        if (propertyName === 'status' && cell.querySelector('.status-bubble')) { // Adjusted to class used
            valueToEdit = cell.querySelector('.status-bubble').textContent;
        }

        cell.innerHTML = ''; 

        if (propertyName === 'status') {
            const select = document.createElement('select');
            select.className = 'inline-edit-select';
            const statusOptions = ['Pending', 'Done', 'In Progress', 'On Hold', 'Cancelled', 'Not Started']; // Added Not Started
            
            statusOptions.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt;
                option.textContent = opt;
                if (opt === valueToEdit) {
                    option.selected = true;
                }
                select.appendChild(option);
            });

            const saveStatusChanges = () => {
                const newValue = select.value;
                item[propertyName] = newValue;
                cell.innerHTML = ''; 
                const statusSpan = document.createElement("span");
                statusSpan.className = 'status-bubble'; // Base class
                const lowerCaseStatus = newValue.toLowerCase();
                if (lowerCaseStatus === "done") statusSpan.classList.add("status-done");
                else if (lowerCaseStatus.includes("in progress")) statusSpan.classList.add("status-in-progress");
                else if (lowerCaseStatus === "not started") statusSpan.classList.add("status-not-started");
                else if (lowerCaseStatus === "pending") statusSpan.classList.add("status-pending");
                else if (lowerCaseStatus === "on hold") statusSpan.classList.add("status-on-hold");
                else if (lowerCaseStatus === "cancelled") statusSpan.classList.add("status-cancelled");
                statusSpan.textContent = newValue;
                cell.appendChild(statusSpan);
            };

            select.addEventListener('blur', saveStatusChanges);
            select.addEventListener('change', saveStatusChanges); 

            select.addEventListener('keydown', function(event) {
                if (event.key === 'Enter') {
                    select.blur(); 
                } else if (event.key === 'Escape') {
                    cell.innerHTML = originalHtml; 
                    if (select.parentNode === cell) {
                        cell.removeChild(select);
                    }
                }
            });

            cell.appendChild(select);
            select.focus();
        } else {
            const input = document.createElement('input');
            input.type = 'text';
            input.value = valueToEdit;
            input.className = 'inline-edit-input';
            
            const tempSpan = document.createElement('span');
            tempSpan.style.visibility = 'hidden';
            tempSpan.style.position = 'absolute';
            tempSpan.style.font = window.getComputedStyle(cell).font;
            tempSpan.textContent = valueToEdit;
            document.body.appendChild(tempSpan);
            const textWidth = tempSpan.offsetWidth;
            document.body.removeChild(tempSpan);
            input.style.width = Math.max(50, textWidth + 20) + 'px'; 

            const saveChanges = () => {
                const newValue = input.value;
                item[propertyName] = newValue; 
                
                if (propertyName === 'status') {
                    cell.innerHTML = ''; 
                    const statusSpan = document.createElement("span");
                    // ... (logic to re-create status span as above)
                    statusSpan.textContent = newValue;
                    cell.appendChild(statusSpan);
                } else {
                    cell.textContent = newValue;
                }
            };

            input.addEventListener('blur', saveChanges);

            input.addEventListener('keydown', function(event) {
                if (event.key === 'Enter') {
                    input.blur();
                } else if (event.key === 'Escape') {
                    if (propertyName === 'status') {
                        cell.innerHTML = originalHtml;
                    } else {
                        cell.textContent = originalValue;
                    }
                    if(input.parentNode === cell) {
                        cell.removeChild(input);
                    }
                }
            });

            cell.appendChild(input);
            input.focus();
            input.select();
        }
    });
}
*/

/* Main Table Rendering Function - Not used in this version
function renderTable() {
    const tableBody = document.getElementById("shipmentTableBody");
    if (!tableBody) {
        console.warn('shipmentTableBody not found. Main table will not be rendered.');
        return;
    }
    tableBody.innerHTML = ""; 

    if (!filteredData || filteredData.length === 0) {
        const row = tableBody.insertRow();
        const cell = row.insertCell();
        // Determine colspan dynamically based on visible headers if table were present
        const mainTableHeaders = document.querySelectorAll("#shipmentTable thead th");
        cell.colSpan = mainTableHeaders.length > 0 ? mainTableHeaders.length : 1;
        cell.textContent = 'No data to display.';
        cell.style.textAlign = 'center';
        return;
    }

    filteredData.forEach(item => { 
        const row = tableBody.insertRow();

        row.addEventListener('click', function() {
            if (selectedRowElement) {
                selectedRowElement.classList.remove('selected-row');
            }
            row.classList.add('selected-row');
            selectedRowElement = row;
            selectedRowDataForHive = item; 
        });

        // Example cells - this would need to be built out for all columns if table was active
        const cellShipmentName = row.insertCell();
        cellShipmentName.textContent = item.shipmentName;
        // makeCellEditable(cellShipmentName, item, 'shipmentName');

        const cellOblNo = row.insertCell();
        cellOblNo.textContent = item.oblNo;
        // makeCellEditable(cellOblNo, item, 'oblNo');
        
        const statusCell = row.insertCell();
        const statusSpan = document.createElement("span");
        const currentStatus = item.status || "";
        statusSpan.textContent = currentStatus;
        statusSpan.className = 'status-bubble';
        const lowerCaseStatus = currentStatus.toLowerCase();
        if (lowerCaseStatus === "done") statusSpan.classList.add("status-done");
        else if (lowerCaseStatus.includes("in progress")) statusSpan.classList.add("status-in-progress");
        else if (lowerCaseStatus === "not started") statusSpan.classList.add("status-not-started");
        else if (lowerCaseStatus === "pending") statusSpan.classList.add("status-pending");
        else if (lowerCaseStatus === "on hold") statusSpan.classList.add("status-on-hold");
        else if (lowerCaseStatus === "cancelled") statusSpan.classList.add("status-cancelled");
        statusCell.appendChild(statusSpan);
        // makeCellEditable(statusCell, item, 'status');

        // ... Add other cells similarly based on your data keys and desired display order ...
        // Example for contractNo, piNo, piValue
        row.insertCell().textContent = item.contractNo; 
        row.insertCell().textContent = item.piNo;
        row.insertCell().textContent = item.piValue;

        const actionsCell = row.insertCell();
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '🗑️';
        deleteBtn.className = 'delete-row-btn';
        deleteBtn.addEventListener('click', function(event) {
            event.stopPropagation(); 
            const itemIndexInFilteredData = filteredData.indexOf(item);
            if (itemIndexInFilteredData > -1) {
                filteredData.splice(itemIndexInFilteredData, 1);
            }
            const itemIndexInShipmentData = shipmentData.indexOf(item);
            if (itemIndexInShipmentData > -1) {
                shipmentData.splice(itemIndexInShipmentData, 1);
            }
            renderTable(); 
            if (row === selectedRowElement) { 
                 selectedRowElement = null;
                 selectedRowDataForHive = null; 
            }
        });
        actionsCell.appendChild(deleteBtn);
    });
}
*/

/* Main Table Data Fetching - Not used in this version
async function fetchShipmentsAndRender() {
    console.log('Fetching shipment data from backend (currently disabled for chat-only version)...');
    // try {
    //     const response = await fetch('/api/shipments?t=' + new Date().getTime(), {
    //         cache: 'no-store' 
    //     });
    //     if (!response.ok) {
    //         throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
    //     }
    //     const data = await response.json();
    //     shipmentData = data; 
    //     hiveFilteredDataSnapshot = null; 
    //     performSearch(); 
    // } catch (error) {
    //     console.error("Could not fetch shipments:", error);
    //     shipmentData = []; 
    //     hiveFilteredDataSnapshot = null;
    //     filteredData = [];
    //     renderTable(); 
    // }
    return; // Explicitly do nothing for now
}
*/

/* Main Table Sorting - Not used in this version
function sortTable(columnIndex) {
    let newSortDirection = 'asc';
    let previousSortColumn = sortColumn; 

    if (sortColumn === columnIndex) {
        if (sortDirection === 'asc') {
            newSortDirection = 'desc';
        } else {
            sortColumn = -1; 
            newSortDirection = 'asc';
        }
    } else {
        sortColumn = columnIndex;
        newSortDirection = 'asc';
    }
    sortDirection = newSortDirection;

    if (sortColumn === -1) {
        renderTable(); 
        updateSortIndicators(); 
        return; 
    }
    
    const headers = document.querySelectorAll("th"); // This would fail if table is not in DOM
    if (!headers || headers.length === 0) return;
    const key = headers[columnIndex]?.dataset.columnKey;

    if (!key) {
        sortColumn = previousSortColumn; 
        updateSortIndicators();
        return; 
    }

    filteredData.sort((a, b) => {
        let valA = a[key];
        let valB = b[key];

        // Simplified sort for this example, original script has more complex type handling
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    renderTable();
    updateSortIndicators();
}

function updateSortIndicators() {
    const tableHeaders = document.querySelectorAll("th"); // This would fail
    if (!tableHeaders || tableHeaders.length === 0) return;
    tableHeaders.forEach((th, index) => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (index === sortColumn && sortColumn !== -1) { 
            th.classList.add(sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });
}
*/

/* Main Table "New Shipment" - Not used in this version
function addShipment() {
    const newShipment = {
        shipmentName: "New Shipment - Click to Edit",
        oblNo: "",
        status: "Pending", 
        // ... other default fields
    };
    shipmentData.push(newShipment);
    performSearch(); 
}
*/

/* Main Table Search - Not used in this version
function performSearch() {
    const searchInput = document.getElementById("searchInput");
    if (!searchInput) { // Guard clause if search input is not present
        console.warn('Search input not found. Main table search disabled.');
        // If we intended to filter original shipmentData, we might do it here
        // but since renderTable is also commented, this has no visual effect.
        // filteredData = [...shipmentData]; 
        return;
    }
    const searchTerm = searchInput.value.toLowerCase().trim();

    let baseData = hiveFilteredDataSnapshot ? [...hiveFilteredDataSnapshot] : [...shipmentData];

    if (!searchTerm) {
        filteredData = baseData;
    } else {
        filteredData = baseData.filter(item => {
            return Object.values(item).some(value => {
                if (value === null || value === undefined) return false;
                const stringValue = String(value).toLowerCase();
                return stringValue.includes(searchTerm);
            });
        });
    }

    if (sortColumn !== -1) {
        // Re-apply sort to newly filtered data (simplified)
        const currentSortCol = sortColumn;
        const currentSortDir = sortDirection;
        const headers = document.querySelectorAll("th");
        if(headers && headers.length > currentSortCol) {
            const key = headers[currentSortCol]?.dataset.columnKey;
            if (key) {
                filteredData.sort((a, b) => {
                    let valA = a[key];
                    let valB = b[key];
                    if (typeof valA === 'string') valA = valA.toLowerCase();
                    if (typeof valB === 'string') valB = valB.toLowerCase();
                    if (valA < valB) return currentSortDir === 'asc' ? -1 : 1;
                    if (valA > valB) return currentSortDir === 'asc' ? 1 : -1;
                    return 0;
                });
            }
        }
    } 
    renderTable(); 
    updateSortIndicators();
}
*/

// Event listeners
document.addEventListener("DOMContentLoaded", () => {
    // fetchShipmentsAndRender(); // Main table data fetch - NOT CALLED

    /* Event listeners for Main Table - Not used in this version
    const newButton = document.querySelector(".new-btn");
    if (newButton) {
        newButton.addEventListener("click", addShipment);
    }

    const searchInput = document.getElementById("searchInput");
    if (searchInput) {
        searchInput.addEventListener("input", performSearch);
    }

    const tableHeaders = document.querySelectorAll("th"); // This would fail if table not in DOM
    if (tableHeaders && tableHeaders.length > 0) {
        tableHeaders.forEach((th, index) => {
            if (index < tableHeaders.length - 1) { // Exclude last header (often actions)
                const handle = document.createElement('div');
                handle.className = 'resize-handle';
                handle.addEventListener('mousedown', handleMouseDown);
                handle.addEventListener('dblclick', handleDoubleClick); 
                th.appendChild(handle);
            }
            th.addEventListener("click", (event) => {
                if (!event.target.classList.contains('resize-handle')) {
                    sortTable(index);
                }
            });
        });
    }

    const moreOptionsBtn = document.getElementById("moreOptionsBtn");
    const moreOptionsMenu = document.getElementById("moreOptionsMenu");
    const exportCsvBtn = document.getElementById("exportCsvBtn");
    // const filterBtn = document.getElementById("filterBtn"); 
    // const filterMenu = document.getElementById("filterMenu");
    const showAllBtn = document.querySelector(".show-all-btn"); 

    if (moreOptionsBtn && moreOptionsMenu) {
        moreOptionsBtn.addEventListener("click", (event) => {
            event.stopPropagation(); 
            moreOptionsMenu.classList.toggle("hidden");
        });
    }

    // if (filterBtn && filterMenu) { ... }

    document.addEventListener("click", (event) => { 
        if (moreOptionsMenu && !moreOptionsMenu.classList.contains("hidden")) {
            if (!moreOptionsBtn || !moreOptionsBtn.contains(event.target) && !moreOptionsMenu.contains(event.target)) {
                 moreOptionsMenu.classList.add("hidden");
            }
        }
        // if (filterMenu && !filterMenu.classList.contains("hidden")) { ... }
    });

    if (exportCsvBtn) {
        exportCsvBtn.addEventListener("click", (event) => {
            event.preventDefault(); 
            exportToCSV(); // exportToCSV might need adjustment if filteredData isn't populated
            if(moreOptionsMenu) moreOptionsMenu.classList.add("hidden"); 
        });
    }
    
    // CSV Upload button functionality - also commented as it related to the main table data
    // const uploadCsvButton = document.getElementById('uploadCsvButton');
    // const csvFileInput = document.getElementById('csvFile');
    // if (uploadCsvButton && csvFileInput) { ... }

    if (showAllBtn) {
        showAllBtn.addEventListener('click', () => {
            if (searchInput) searchInput.value = ''; 
            sortColumn = -1; 
            sortDirection = 'asc';
            hiveFilteredDataSnapshot = null; 
            selectedRowDataForHive = null; 
            performSearch(); 
        });
    }
    */

    // --- HIVE Query Section (Remains Active) ---
    const hiveQuestionInput = document.getElementById('hiveQuestionInput');
    const askHiveButton = document.getElementById('askHiveButton');
    const hiveResultsArea = document.getElementById('hiveResultsArea');

    // Define the SVG icons (These are used by HIVE response copy buttons)
    const defaultCopySVGIcon = `<?xml version="1.0" encoding="utf-8"?><svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 115.77 122.88" style="enable-background:new 0 0 115.77 122.88" xml:space="preserve"><style type="text/css">.st0{fill-rule:evenodd;clip-rule:evenodd;}</style><g><path class="st0" d="M89.62,13.96v7.73h12.19h0.01v0.02c3.85,0.01,7.34,1.57,9.86,4.1c2.5,2.51,4.06,5.98,4.07,9.82h0.02v0.02 v73.27v0.01h-0.02c-0.01,3.84-1.57,7.33-4.1,9.86c-2.51,2.5-5.98,4.06-9.82,4.07v0.02h-0.02h-61.7H40.1v-0.02 c-3.84-0.01-7.34-1.57-9.86-4.1c-2.5-2.51-4.06-5.98-4.07-9.82h-0.02v-0.02V92.51H13.96h-0.01v-0.02c-3.84-0.01-7.34-1.57-9.86-4.1 c-2.5-2.51-4.06-5.98-4.07-9.82H0v-0.02V13.96v-0.01h0.02c0.01-3.85,1.58-7.34,4.1-9.86c2.51-2.5,5.98-4.06,9.82-4.07V0h0.02h61.7 h0.01v0.02c3.85,0.01,7.34,1.57,9.86,4.1c2.5,2.51,4.06,5.98,4.07,9.82h0.02V13.96L89.62,13.96z M79.04,21.69v-7.73v-0.02h0.02 c0-0.91-0.39-1.75-1.01-2.37c-0.61-0.61-1.46-1-2.37-1v0.02h-0.01h-61.7h-0.02v-0.02c-0.91,0-1.75,0.39-2.37,1.01 c-0.61,0.61-1,1.46-1,2.37h0.02v0.01v64.59v0.02h-0.02c0,0.91,0.39,1.75,1.01,2.37c0.61,0.61,1.46,1,2.37,1v-0.02h0.01h12.19V35.65 v-0.01h0.02c0.01-3.85,1.58-7.34,4.1-9.86c2.51-2.5,5.98-4.06,9.82-4.07v-0.02h0.02H79.04L79.04,21.69z M105.18,108.92V35.65v-0.02 h0.02c0-0.91-0.39-1.75-1.01-2.37c-0.61-0.61-1.46-1-2.37-1v0.02h-0.01h-61.7h-0.02v-0.02c-0.91,0-1.75,0.39-2.37,1.01 c-0.61,0.61-1,1.46-1,2.37h0.02v0.01v73.27v0.02h-0.02c0,0.91,0.39,1.75,1.01,2.37c0.61,0.61,1.46,1,2.37,1v-0.02h0.01h61.7h0.02 v0.02c0.91,0,1.75-0.39,2.37-1.01c0.61-0.61,1-1.46,1-2.37h-0.02V108.92L105.18,108.92z"/></g></svg>`;
    const successCopySVGIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
                                  <path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01 1.05L7.88 12.01a.733.733 0 0 1-1.065.02L3.217 8.384a.757.757 0 0 1 0-1.06.733.733 0 0 1 1.047 0l3.052 3.093 5.4-6.425a.247.247 0 0 1 .02-.022Z"/>
                                </svg>`;
    const errorCopySVGIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
                                <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z"/>
                              </svg>`;

    function displayUserQuestion(question) {
        const userMessageDiv = document.createElement('div');
        userMessageDiv.classList.add('chat-message', 'user-question');
        userMessageDiv.textContent = question;
        if (hiveResultsArea) hiveResultsArea.appendChild(userMessageDiv);
        hiveChatHistory.push({ role: 'user', content: question }); 
        if (hiveResultsArea) hiveResultsArea.scrollTop = hiveResultsArea.scrollHeight; 
    }

    function escapeHtml(unsafe) {
        if (unsafe === null || unsafe === undefined) return '';
        if (typeof unsafe !== 'string') unsafe = String(unsafe);
        let safe = unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
        return safe.replace(/\n/g, '<br>');
    }

    function renderHiveQueryResults(data) {
        if (!hiveResultsArea) return;
        const hiveResponseDiv = document.createElement('div');
        hiveResponseDiv.classList.add('chat-message', 'hive-response');
        let content = '';
        let textToCopy = null; 

        if (data.answer) {
            content += `<p><strong>HIVE Says:</strong> ${escapeHtml(data.answer)}</p>`;
            textToCopy = data.answer; 
        }

        if (data.sql_query_generated && 
            data.sql_query_generated !== "# SQL generation not attempted." && 
            !data.sql_query_generated.startsWith("# Cannot generate SQL") && 
            !data.sql_query_generated.startsWith("# Error during SQL generation") &&
            !data.sql_query_generated.startsWith("# LLM client not initialized.")) {
            content += `<p><strong>Generated SQL:</strong></p><pre class="sql-highlight"><code>${escapeHtml(data.sql_query_generated)}</code></pre>`;
            textToCopy = textToCopy ? textToCopy + "\n\nGenerated SQL:\n" + data.sql_query_generated : "Generated SQL:\n" + data.sql_query_generated;
        } else if (data.sql_query_generated) { 
             content += `<p><strong>SQL Generation Note:</strong> ${escapeHtml(data.sql_query_generated)}</p>`;
        }

        if (data.data_from_db && Array.isArray(data.data_from_db) && data.data_from_db.length > 0) {
            content += `<p><strong>Data from Database (${data.data_from_db.length} row${data.data_from_db.length > 1 ? 's' : ''}):</strong></p>`;
            const hiveTable = document.createElement('table');
            hiveTable.classList.add('hive-results-table'); 
            // Basic table rendering for HIVE results if they are tabular
            const headers = Object.keys(data.data_from_db[0]);
            const trHead = hiveTable.insertRow();
            headers.forEach(headerText => {
                const th = document.createElement("th");
                th.textContent = headerText;
                trHead.appendChild(th);
            });
            data.data_from_db.forEach(item => {
                const tr = hiveTable.insertRow();
                headers.forEach(header => {
                    const td = tr.insertCell();
                    td.textContent = item[header] === null || item[header] === undefined ? '' : String(item[header]);
                });
            });
            content += hiveTable.outerHTML; 
            // For copy purposes, might want to stringify this table data or add a separate copy mechanism for it.
            // For now, textToCopy primarily handles .answer and .sql_query_generated
        } else if (data.data_from_db) { 
             content += `<p>No data returned from the database for this query.</p>`;
        }
        
        hiveResponseDiv.innerHTML = content;
        hiveResultsArea.appendChild(hiveResponseDiv);

        if (textToCopy) {
            const copyButton = document.createElement('button');
            copyButton.className = 'hive-copy-btn';
            copyButton.innerHTML = defaultCopySVGIcon;
            copyButton.addEventListener('click', () => {
                navigator.clipboard.writeText(textToCopy).then(() => {
                    copyButton.innerHTML = successCopySVGIcon;
                    copyButton.classList.add('hive-copy-btn--success');
                    setTimeout(() => {
                        copyButton.innerHTML = defaultCopySVGIcon;
                        copyButton.classList.remove('hive-copy-btn--success');
                    }, 2000);
                }).catch(err => {
                    console.error('Failed to copy: ', err);
                    copyButton.innerHTML = errorCopySVGIcon;
                    copyButton.classList.add('hive-copy-btn--error');
                     setTimeout(() => {
                        copyButton.innerHTML = defaultCopySVGIcon;
                        copyButton.classList.remove('hive-copy-btn--error');
                    }, 2000);
                });
            });
            hiveResponseDiv.appendChild(copyButton);
        }

        let assistantResponseForHistory = data.answer || "No textual answer provided by LLM.";
        if (data.sql_query_generated && 
            data.sql_query_generated !== "# SQL generation not attempted." && 
            !data.sql_query_generated.startsWith("# Cannot generate SQL") && 
            !data.sql_query_generated.startsWith("# Error during SQL generation") &&
            !data.sql_query_generated.startsWith("# LLM client not initialized.")) {
            assistantResponseForHistory += ` (Generated SQL: ${data.sql_query_generated})`;
        }
        hiveChatHistory.push({ role: 'assistant', content: assistantResponseForHistory });
        
        console.log('Updated HIVE Chat History (after assistant response):', JSON.parse(JSON.stringify(hiveChatHistory)));
        hiveResultsArea.scrollTop = hiveResultsArea.scrollHeight;
    }

    if (askHiveButton && hiveQuestionInput && hiveResultsArea) { // Ensure HIVE elements exist
        askHiveButton.addEventListener('click', async () => {
            const question = hiveQuestionInput.value.trim();
            if (!question) {
                alert('Please enter a question for HIVE.');
                return;
            }
            displayUserQuestion(question);
            hiveQuestionInput.value = '';
            const thinkingMsg = document.createElement('div');
            thinkingMsg.classList.add('chat-message', 'hive-response');
            thinkingMsg.innerHTML = '<em>HIVE is thinking...</em>';
            hiveResultsArea.appendChild(thinkingMsg);
            hiveResultsArea.scrollTop = hiveResultsArea.scrollHeight;

            try {
                let endpoint = 'https://yannik.app.n8n.cloud/webhook/ba6e92f2-5bc4-476e-abab-4a4df36cc426'; 
                let payload = { question: question }; 
                let fetchOptions = {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload)
                };
                console.log('Sending to n8n webhook for Notion processing:', payload);
                
                const response = await fetch(endpoint, fetchOptions);
                if (hiveResultsArea.contains(thinkingMsg)) {
                    hiveResultsArea.removeChild(thinkingMsg);
                }

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response.', details: `HTTP error! status: ${response.status}` }));
                    const errorText = errorData.error || 'Unknown error';
                    const errorDetails = errorData.details ? `<p><small>${escapeHtml(errorData.details)}</small></p>` : '';
                    const errorResponseDiv = document.createElement('div');
                    errorResponseDiv.classList.add('chat-message', 'hive-response', 'hive-error-response');
                    errorResponseDiv.innerHTML = `<h4>Error from backend:</h4><p>${escapeHtml(errorText)}</p>${errorDetails}`;
                    hiveResultsArea.appendChild(errorResponseDiv);

                    const copyErrorButton = document.createElement('button');
                    copyErrorButton.className = 'hive-copy-btn';
                    copyErrorButton.innerHTML = defaultCopySVGIcon;
                    copyErrorButton.addEventListener('click', () => {
                        const fullErrorText = `Error: ${errorText}${errorData.details ? '\nDetails: ' + errorData.details : ''}`;
                        navigator.clipboard.writeText(fullErrorText).then(() => {
                            copyErrorButton.innerHTML = successCopySVGIcon;
                            copyErrorButton.classList.add('hive-copy-btn--success');
                            setTimeout(() => {
                                copyErrorButton.innerHTML = defaultCopySVGIcon;
                                copyErrorButton.classList.remove('hive-copy-btn--success');
                            }, 2000);
                        }).catch(err => {
                            console.error('Failed to copy error: ', err);
                            copyErrorButton.innerHTML = errorCopySVGIcon;
                            copyErrorButton.classList.add('hive-copy-btn--error');
                            setTimeout(() => {
                                copyErrorButton.innerHTML = defaultCopySVGIcon;
                                copyErrorButton.classList.remove('hive-copy-btn--error');
                            }, 2000);
                        });
                    });
                    errorResponseDiv.appendChild(copyErrorButton);
                } else {
                    const data = await response.json();
                    console.log(`Data received from mcp backend:`, data);
                    renderHiveQueryResults(data);
                }
            } catch (error) {
                if (hiveResultsArea.contains(thinkingMsg)) {
                     hiveResultsArea.removeChild(thinkingMsg); 
                }
                console.error(`Error querying HIVE (mcp backend):`, error);
                const errorResponseDiv = document.createElement('div');
                errorResponseDiv.classList.add('chat-message', 'hive-response', 'hive-error-response');
                const rawErrorText = error.message;
                errorResponseDiv.innerHTML = `<h4>Network/Request Error:</h4><p>${escapeHtml(rawErrorText)}</p><p><small>Check the console and ensure the backend service is running.</small></p>`;
                hiveResultsArea.appendChild(errorResponseDiv);

                const copyNetErrorButton = document.createElement('button');
                copyNetErrorButton.className = 'hive-copy-btn';
                copyNetErrorButton.innerHTML = defaultCopySVGIcon;
                copyNetErrorButton.addEventListener('click', () => {
                    navigator.clipboard.writeText(`Network/Request Error: ${rawErrorText}`).then(() => {
                        copyNetErrorButton.innerHTML = successCopySVGIcon;
                        copyNetErrorButton.classList.add('hive-copy-btn--success');
                        setTimeout(() => {
                            copyNetErrorButton.innerHTML = defaultCopySVGIcon;
                            copyNetErrorButton.classList.remove('hive-copy-btn--success');
                        }, 2000);
                    }).catch(err => {
                        console.error('Failed to copy net error: ', err);
                        copyNetErrorButton.innerHTML = errorCopySVGIcon;
                        copyNetErrorButton.classList.add('hive-copy-btn--error');
                        setTimeout(() => {
                            copyNetErrorButton.innerHTML = defaultCopySVGIcon;
                            copyNetErrorButton.classList.remove('hive-copy-btn--error');
                        }, 2000);
                    });
                });
                errorResponseDiv.appendChild(copyNetErrorButton);
            }
            hiveResultsArea.scrollTop = hiveResultsArea.scrollHeight; 
        });

        hiveQuestionInput.addEventListener('keypress', function(event) {
            if (event.key === 'Enter') {
                event.preventDefault(); 
                askHiveButton.click(); 
            }
        });
    } else {
        console.warn("HIVE chat interface elements (hiveQuestionInput, askHiveButton, or hiveResultsArea) not found. Chat functionality may be limited.");
    }
    
    // Automatically focus the HIVE question input on page load
    if (hiveQuestionInput) {
        setTimeout(() => {
            hiveQuestionInput.focus();
            console.log('HIVE question input focused via setTimeout on page load.');
        }, 50); 
    }
});

/* Export to CSV - Might be used by HIVE if it returns table data and we add a button for it
function exportToCSV() {
    // This function would need to be adapted to use data specifically from a HIVE response if used.
    // For now, it assumes `filteredData` (from the main table) which is no longer populated.
    // If HIVE provides data_from_db, that would be the target for export.
    
    // Placeholder: const dataToExport = hiveChatHistory.lastResponse?.data_from_db || [];
    const dataToExport = []; // Default to empty if no clear source from HIVE output

    if (!dataToExport || dataToExport.length === 0) {
        alert("No data available to export from HIVE output.");
        return;
    }

    const headers = Object.keys(dataToExport[0]);
    let csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n";

    dataToExport.forEach(item => {
        const row = headers.map(header => {
            let cellData = item[header] === null || item[header] === undefined ? '' : item[header];
            cellData = String(cellData).replace(/"/g, '""'); 
            if (String(cellData).includes(",")) {
                cellData = `"${cellData}"`; 
            }
            return cellData;
        });
        csvContent += row.join(",") + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "hive_export.csv");
    document.body.appendChild(link); 
    link.click();
    document.body.removeChild(link);
}
*/

console.log("Shipping Dashboard Script Modified for Chat-Only Interface"); 