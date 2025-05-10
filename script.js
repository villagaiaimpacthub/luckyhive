// Future JavaScript for dynamic data loading and interactions
console.log("Shipping Dashboard Script Loaded"); 

let selectedRowElement = null; // Added for row selection

// Sample data for the shipping schedule - Will be replaced by backend data
// const initialShipmentData = [
//     {
//         shipmentName: "LC VIETNAM 74 Phuc Hung Colorful Metal Joint Stock Company/ELC2500000046/ EXP. 15/4/2025",
//         oblNo: "GQL0381525",
//         status: "Done",
//         contractNo: "633ZN/2024",
//         piNo: "47PI-2024",
//         piValue: "$76,969.50",
//         invoiceNo: "04ZND/2025",
//         fclsGoods: "Zinc Concentrate Powder",
//         shippingLine: "CMA",
//         etd: "January 26, 202...",
//         eta: "March 16, 202...",
//         sPrice: "160",
//         grossWeight: "532.111",
//         contractQuantity: "500",
//         totalAmount: "85,014.24"
//     },
    // ... other initial data objects ...
// ];

let shipmentData = []; // Will be populated from backend
let hiveFilteredDataSnapshot = null; // Holds data from the last HIVE query that returned a table
let filteredData = []; // Data currently displayed in the main table, after all filters
let sortColumn = -1; // -1 means no sort, or use a default like 0 for first column
let sortDirection = 'asc'; // 'asc' or 'desc'

let currentlyResizingTh = null;
let startX, startWidth;

function handleMouseDown(e) {
    currentlyResizingTh = e.target.parentElement; // The TH element
    startX = e.pageX;
    startWidth = currentlyResizingTh.offsetWidth;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    // Add resizing class
    currentlyResizingTh.classList.add('th-resizing'); 
    // Prevent text selection during drag
    document.body.style.userSelect = 'none'; 
    document.body.style.webkitUserSelect = 'none'; 
}

function handleMouseMove(e) {
    if (!currentlyResizingTh) return;
    const deltaX = e.pageX - startX;
    const currentWidth = startWidth + deltaX;
    const finalWidth = Math.max(50, currentWidth); // Apply min width constraint
    console.log(`Resizing: startX=${startX}, pageX=${e.pageX}, deltaX=${deltaX}, startWidth=${startWidth}, newWidth=${finalWidth}`);
    currentlyResizingTh.style.width = finalWidth + 'px'; 
    // Clear previous width state on manual resize
    delete currentlyResizingTh.dataset.previousWidth; 
}

function handleMouseUp() {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    // Remove resizing class
    if (currentlyResizingTh) { 
        currentlyResizingTh.classList.remove('th-resizing');
    }
    // Restore text selection
    document.body.style.userSelect = ''; 
    document.body.style.webkitUserSelect = '';
    currentlyResizingTh = null;
}

function handleDoubleClick(e) {
    const th = e.target.parentElement; // The TH element
    const previousWidth = th.dataset.previousWidth;

    if (previousWidth) {
        // Restore previous width
        console.log(`Restoring previous width: ${previousWidth}`);
        th.style.width = previousWidth;
        delete th.dataset.previousWidth; // Remove the stored state
    } else {
        // Auto-fit to content
        const columnIndex = Array.from(th.parentNode.children).indexOf(th);
        const tableBody = document.getElementById("shipmentTableBody");
        let maxWidth = th.scrollWidth; // Start with header width
        const padding = 18; // Estimate padding

        console.log(`Auto-sizing column ${columnIndex}`);
        Array.from(tableBody.rows).forEach(row => {
            const cell = row.cells[columnIndex];
            if (cell) {
                maxWidth = Math.max(maxWidth, cell.scrollWidth);
            }
        });

        console.log(`Max content width found: ${maxWidth}`);
        // Store current width before applying auto-fit
        th.dataset.previousWidth = th.style.width || (th.offsetWidth + 'px'); // Store current style or computed width
        console.log(`Stored previous width: ${th.dataset.previousWidth}`);
        // Apply auto-fit width 
        th.style.width = (maxWidth + padding) + 'px';
    }
}

// Function to make a cell editable
function makeCellEditable(cell, item, propertyName) {
    cell.addEventListener('dblclick', function() {
        if (cell.querySelector('input')) return; // Already in edit mode

        const originalValue = cell.textContent;
        const originalHtml = cell.innerHTML; // Store original HTML (for status span)
        
        // For status, we need to handle the span differently
        let valueToEdit = originalValue;
        if (propertyName === 'status' && cell.querySelector('.status-done')) {
            valueToEdit = cell.querySelector('.status-done').textContent;
        }

        cell.innerHTML = ''; // Clear current content

        if (propertyName === 'status') {
            const select = document.createElement('select');
            select.className = 'inline-edit-select';
            const statusOptions = ['Pending', 'Done', 'In Progress', 'On Hold', 'Cancelled'];
            
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
                cell.innerHTML = ''; // Clear select
                const statusSpan = document.createElement("span");
                if (newValue.toLowerCase() === "done") {
                    statusSpan.className = "status-done";
                }
                statusSpan.textContent = newValue;
                cell.appendChild(statusSpan);
            };

            select.addEventListener('blur', saveStatusChanges);
            select.addEventListener('change', saveStatusChanges); // Save on change as well for immediate feedback

            select.addEventListener('keydown', function(event) {
                if (event.key === 'Enter') {
                    select.blur(); // Trigger save
                } else if (event.key === 'Escape') {
                    cell.innerHTML = originalHtml; // Restore original span
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
            
            // Try to set input width similar to cell content
            const tempSpan = document.createElement('span');
            tempSpan.style.visibility = 'hidden';
            tempSpan.style.position = 'absolute';
            tempSpan.style.font = window.getComputedStyle(cell).font;
            tempSpan.textContent = valueToEdit;
            document.body.appendChild(tempSpan);
            const textWidth = tempSpan.offsetWidth;
            document.body.removeChild(tempSpan);
            input.style.width = Math.max(50, textWidth + 20) + 'px'; // Minimum width 50px

            const saveChanges = () => {
                const newValue = input.value;
                item[propertyName] = newValue; // Update data source (item directly refers to object in shipmentData or filteredData)
                
                // If it was status, re-create the span structure
                if (propertyName === 'status') {
                    cell.innerHTML = ''; // Clear input
                    const statusSpan = document.createElement("span");
                    if (newValue.toLowerCase() === "done") {
                        statusSpan.className = "status-done";
                    }
                    statusSpan.textContent = newValue;
                    cell.appendChild(statusSpan);
                } else {
                    cell.textContent = newValue;
                }
                // TODO: Future: if filteredData !== shipmentData, ensure item in shipmentData is also updated if 'item' came from filteredData
                // This is implicitly handled if 'item' is a direct reference.
            };

            input.addEventListener('blur', saveChanges);

            input.addEventListener('keydown', function(event) {
                if (event.key === 'Enter') {
                    input.blur();
                } else if (event.key === 'Escape') {
                    // Restore original content (HTML for status, text for others)
                    if (propertyName === 'status') {
                        cell.innerHTML = originalHtml;
                    } else {
                        cell.textContent = originalValue;
                    }
                    // Remove the input if it's still there (e.g., if blur didn't fire)
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

// Function to render the table rows
function renderTable() {
    const tableBody = document.getElementById("shipmentTableBody");
    tableBody.innerHTML = ""; // Clear existing rows
    console.log('renderTable: Starting to render main table with filteredData (count: ' + (filteredData ? filteredData.length : 0) + '):', JSON.parse(JSON.stringify(filteredData || [])));

    if (!filteredData || filteredData.length === 0) {
        console.log('No data to render in table.');
        // Optionally, display a message in the table like "No data available"
        const row = tableBody.insertRow();
        const cell = row.insertCell();
        cell.colSpan = 16; // Number of columns in your table
        cell.textContent = 'No data to display.';
        cell.style.textAlign = 'center';
        return;
    }

    filteredData.forEach(item => { 
        const row = tableBody.insertRow();
        const originalItemIndexInShipmentData = shipmentData.findIndex(sd => sd === item); // Find original item for updates

        // Row selection
        row.addEventListener('click', function() {
            if (selectedRowElement) {
                selectedRowElement.classList.remove('selected-row');
            }
            row.classList.add('selected-row');
            selectedRowElement = row;
        });

        // Data cells
        const cellShipmentName = row.insertCell();
        cellShipmentName.textContent = item.shipmentName;
        makeCellEditable(cellShipmentName, item, 'shipmentName');

        const cellOblNo = row.insertCell();
        cellOblNo.textContent = item.oblNo;
        makeCellEditable(cellOblNo, item, 'oblNo');
        
        const statusCell = row.insertCell();
        const statusSpan = document.createElement("span");
        
        const currentStatus = item.status || ""; // Default to empty string if null/undefined
        statusSpan.textContent = currentStatus;
        statusSpan.className = 'status-bubble'; // Base class for padding, border-radius etc.

        // Add specific class based on status text (case-insensitive check)
        const lowerCaseStatus = currentStatus.toLowerCase();

        if (lowerCaseStatus === "done") {
            statusSpan.classList.add("status-done");
        } else if (lowerCaseStatus.includes("in progress")) { // Catch variations
            statusSpan.classList.add("status-in-progress");
        } else if (lowerCaseStatus === "not started") {
            statusSpan.classList.add("status-not-started");
        } else if (lowerCaseStatus === "pending") {
            statusSpan.classList.add("status-pending");
        } else if (lowerCaseStatus === "on hold") {
            statusSpan.classList.add("status-on-hold");
        } else if (lowerCaseStatus === "cancelled") {
            statusSpan.classList.add("status-cancelled");
        } // Add more conditions if needed
        
        statusCell.appendChild(statusSpan);
        makeCellEditable(statusCell, item, 'status');

        const cellContractNo = row.insertCell();
        cellContractNo.textContent = item.contractNo;
        makeCellEditable(cellContractNo, item, 'contractNo');

        const cellPiNo = row.insertCell();
        cellPiNo.textContent = item.piNo;
        makeCellEditable(cellPiNo, item, 'piNo');

        const cellPiValue = row.insertCell();
        cellPiValue.textContent = item.piValue;
        makeCellEditable(cellPiValue, item, 'piValue');

        const cellInvoiceNo = row.insertCell();
        cellInvoiceNo.textContent = item.invoiceNo;
        makeCellEditable(cellInvoiceNo, item, 'invoiceNo');

        const cellFclsGoods = row.insertCell();
        cellFclsGoods.textContent = item.fclsGoods;
        makeCellEditable(cellFclsGoods, item, 'fclsGoods');

        const cellShippingLine = row.insertCell();
        cellShippingLine.textContent = item.shippingLine;
        makeCellEditable(cellShippingLine, item, 'shippingLine');

        const cellEtd = row.insertCell();
        cellEtd.textContent = item.etd;
        makeCellEditable(cellEtd, item, 'etd');

        const cellEta = row.insertCell();
        cellEta.textContent = item.eta;
        makeCellEditable(cellEta, item, 'eta');

        const cellSPrice = row.insertCell();
        cellSPrice.textContent = item.sPrice;
        makeCellEditable(cellSPrice, item, 'sPrice');

        const cellGrossWeight = row.insertCell();
        cellGrossWeight.textContent = item.grossWeight;
        makeCellEditable(cellGrossWeight, item, 'grossWeight');

        const cellContractQuantity = row.insertCell();
        cellContractQuantity.textContent = item.contractQuantityMT;
        makeCellEditable(cellContractQuantity, item, 'contractQuantityMT');
        
        const cellTotalAmount = row.insertCell();
        cellTotalAmount.textContent = item.totalAmount;
        makeCellEditable(cellTotalAmount, item, 'totalAmount');

        // Add cells for the remaining 15 columns
        row.insertCell().textContent = item.provisionalInvoiceValue;
        row.insertCell().textContent = item.finalInvoiceBalance;
        row.insertCell().textContent = item.polZnPercent;
        row.insertCell().textContent = item.podZnPercent;
        row.insertCell().textContent = item.polMoisture;
        row.insertCell().textContent = item.podMoisture;
        row.insertCell().textContent = item.lmePi;
        row.insertCell().textContent = item.lmePol;
        row.insertCell().textContent = item.lmePod;
        row.insertCell().textContent = item.trackingNo;
        row.insertCell().textContent = item.dueDate;
        row.insertCell().textContent = item.laboratoryReport;
        row.insertCell().textContent = item.shippingDocsProvisional;
        row.insertCell().textContent = item.shippingDocsFinalDocs;
        row.insertCell().textContent = item.lastEditedTime;
        // Add makeCellEditable for these new cells if needed later

        // Actions cell (for delete button)
        const actionsCell = row.insertCell();
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '🗑️';
        deleteBtn.className = 'delete-row-btn';
        deleteBtn.addEventListener('click', function(event) {
            event.stopPropagation(); // Prevent row selection click event
            
            // Find the item in both filteredData and shipmentData for removal
            const itemIndexInFilteredData = filteredData.indexOf(item);
            if (itemIndexInFilteredData > -1) {
                filteredData.splice(itemIndexInFilteredData, 1);
            }

            const itemIndexInShipmentData = shipmentData.indexOf(item);
            if (itemIndexInShipmentData > -1) {
                shipmentData.splice(itemIndexInShipmentData, 1);
            }
            
            renderTable(); // Re-render the table
            if (row === selectedRowElement) { // If deleted row was selected
                 selectedRowElement = null;
            }
        });
        actionsCell.appendChild(deleteBtn);
    });
}

// Function to fetch shipments from the backend and render the table
async function fetchShipmentsAndRender() {
    console.log('Fetching shipment data from backend...');
    try {
        const response = await fetch('/api/shipments?t=' + new Date().getTime(), {
            cache: 'no-store' 
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
        }
        const data = await response.json();
        console.log('Data received from backend:', data);
        shipmentData = data; 
        hiveFilteredDataSnapshot = null; // Reset HIVE snapshot on full fetch
        // No need to set filteredData directly here, performSearch will handle it.
        performSearch(); 
    } catch (error) {
        console.error("Could not fetch shipments:", error);
        shipmentData = []; 
        hiveFilteredDataSnapshot = null;
        filteredData = [];
        renderTable(); 
    }
}

// Function to sort the table
function sortTable(columnIndex) {
    let newSortDirection = 'asc';
    let previousSortColumn = sortColumn; // Keep track of previous sort

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
        // Sort reset: Re-render the *current* filteredData without applying a new sort.
        // We might need to revert to the original order if the user expects that.
        // For now, just re-render the currently filtered, unsorted data.
        console.log("Resetting sort. Re-rendering current filtered data.");
        renderTable(); // Render the existing filteredData as is
        updateSortIndicators(); // Clear indicators
        return; // Exit function early
    }
    
    console.log(`Sorting column ${sortColumn} ${sortDirection}`);
    
    // Find the data key using the data-column-key attribute
    const headers = document.querySelectorAll("th");
    const key = headers[columnIndex]?.dataset.columnKey;

    if (!key) {
        console.warn(`Cannot sort column index ${columnIndex}, no data-column-key found.`);
        // Optionally revert sort state if key not found
        sortColumn = previousSortColumn; 
        updateSortIndicators();
        return; // Cannot sort this column
    }

    filteredData.sort((a, b) => {
        let valA = a[key];
        let valB = b[key];

        // --- Existing sorting logic for types --- 
        if (key === 'sPrice' || key === 'grossWeight' || key === 'contractQuantityMT' || key === 'totalAmount' || key === 'piValue') {
            valA = parseFloat(String(valA).replace(/[^\d.-]/g, '')) || 0;
            valB = parseFloat(String(valB).replace(/[^\d.-]/g, '')) || 0;
        } else if (key === 'etd' || key === 'eta') {
            // Placeholder date sort
        }

        valA = valA === null || valA === undefined ? '' : valA;
        valB = valB === null || valB === undefined ? '' : valB;

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
    document.querySelectorAll("th").forEach((th, index) => {
        th.classList.remove('sort-asc', 'sort-desc');
        // Only add indicator if a column is actively sorted
        if (index === sortColumn && sortColumn !== -1) { 
            th.classList.add(sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });
}

// Function to add a new shipment (placeholder for now)
function addShipment() {
    const newShipment = {
        shipmentName: "New Shipment - Click to Edit",
        oblNo: "",
        status: "Pending", // Default status
        contractNo: "",
        piNo: "",
        piValue: "",
        invoiceNo: "",
        fclsGoods: "",
        shippingLine: "",
        etd: "",
        eta: "",
        sPrice: "",
        grossWeight: "",
        contractQuantity: "",
        totalAmount: ""
    };
    shipmentData.push(newShipment);
    performSearch(); // Re-filter and render after adding new item
}

// Function to perform search
function performSearch() {
    const searchInput = document.getElementById("searchInput");
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : "";
    console.log(`Performing search with term: '${searchTerm}'`);

    let baseData = hiveFilteredDataSnapshot ? [...hiveFilteredDataSnapshot] : [...shipmentData];
    console.log('performSearch: Using baseData count:', baseData.length, 'Is HIVE snapshot active?', !!hiveFilteredDataSnapshot);

    if (!searchTerm) {
        filteredData = baseData;
    } else {
        filteredData = baseData.filter(item => {
            return Object.values(item).some(value => {
                if (value === null || value === undefined) {
                    return false;
                }
                const stringValue = String(value).toLowerCase();
                const searchTermLower = searchTerm; 

                if (stringValue.includes(searchTermLower)) {
                    return true;
                }
                const normalizedValue = stringValue.replace(/,/g, '');
                const normalizedSearch = searchTermLower.replace(/,/g, '');
                if (normalizedSearch.length === 0 && searchTermLower.length > 0) {
                    return false;
                }
                if (normalizedValue.includes(normalizedSearch)) {
                    return true;
                }
                return false; 
            });
        });
    }
    console.log('Filtered data after search logic:', JSON.parse(JSON.stringify(filteredData)));

    if (sortColumn !== -1) {
        const currentSortCol = sortColumn;
        const currentSortDir = sortDirection;
        // Apply sort to the newly filteredData
        // Directly call sort logic instead of sortTable to avoid sortColumn/direction side effects here
        const key = document.querySelectorAll("th")[currentSortCol]?.dataset.columnKey;
        if (key) {
            filteredData.sort((a, b) => {
                let valA = a[key];
                let valB = b[key];
                if (key === 'sPrice' || key === 'grossWeight' || key === 'contractQuantityMT' || key === 'totalAmount' || key === 'piValue') {
                    valA = parseFloat(String(valA).replace(/[^\d.-]/g, '')) || 0;
                    valB = parseFloat(String(valB).replace(/[^\d.-]/g, '')) || 0;
                }
                valA = valA === null || valA === undefined ? '' : valA;
                valB = valB === null || valB === undefined ? '' : valB;
                if (typeof valA === 'string') valA = valA.toLowerCase();
                if (typeof valB === 'string') valB = valB.toLowerCase();
                if (valA < valB) return currentSortDir === 'asc' ? -1 : 1;
                if (valA > valB) return currentSortDir === 'asc' ? 1 : -1;
                return 0;
            });
        }
    } 
    renderTable(); 
    updateSortIndicators();
}

// Event listeners
document.addEventListener("DOMContentLoaded", () => {
    fetchShipmentsAndRender(); // Fetch data and render on page load

    const newButton = document.querySelector(".new-btn");
    if (newButton) {
        newButton.addEventListener("click", addShipment);
    }

    const searchInput = document.getElementById("searchInput");
    if (searchInput) {
        searchInput.addEventListener("input", performSearch);
    }

    const tableHeaders = document.querySelectorAll("th");
    tableHeaders.forEach((th, index) => {
        // Add sort listener
        th.addEventListener("click", (event) => {
            // Only sort if the click wasn't on the resize handle
            if (!event.target.classList.contains('resize-handle')) {
                sortTable(index);
            }
        });

        // Add resize handle (except for the last header)
        if (index < tableHeaders.length - 1) {
            const handle = document.createElement('div');
            handle.className = 'resize-handle';
            handle.addEventListener('mousedown', handleMouseDown);
            handle.addEventListener('dblclick', handleDoubleClick); // Add dblclick listener
            th.appendChild(handle);
        }
    });

    const moreOptionsBtn = document.getElementById("moreOptionsBtn");
    const moreOptionsMenu = document.getElementById("moreOptionsMenu");
    const exportCsvBtn = document.getElementById("exportCsvBtn");
    const filterBtn = document.getElementById("filterBtn"); // Get filter button
    const filterMenu = document.getElementById("filterMenu"); // Get filter menu
    const showAllBtn = document.querySelector(".show-all-btn"); // Get Show All button

    if (moreOptionsBtn && moreOptionsMenu) {
        moreOptionsBtn.addEventListener("click", (event) => {
            event.stopPropagation(); // Prevent click from bubbling to document
            moreOptionsMenu.classList.toggle("hidden");
        });
    }

    // Listener for Filter button
    if (filterBtn && filterMenu) {
        filterBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            // Hide more options menu if open
            if (moreOptionsMenu && !moreOptionsMenu.classList.contains("hidden")) {
                 moreOptionsMenu.classList.add("hidden");
            }
            filterMenu.classList.toggle("hidden");
        });
    }

    // Listener for clicks within the filter menu
    if (filterMenu) {
        filterMenu.addEventListener('click', (event) => {
            if (event.target.tagName === 'A') {
                event.preventDefault();
                const filterType = event.target.dataset.filterType;
                const filterValue = event.target.dataset.filterValue;
                console.log(`Filter selected - Type: ${filterType}, Value: ${filterValue}`);
                // TODO: Implement actual filtering logic here
                // - Update a global filter state variable
                // - Call a function (e.g., applyFiltersAndSearch) that modifies filteredData
                // - Re-render the table
                filterMenu.classList.add('hidden'); // Hide menu after selection
            }
        });
    }

    // Hide dropdowns if clicked outside
    document.addEventListener("click", (event) => { 
        // Hide More Options Menu
        if (moreOptionsMenu && !moreOptionsMenu.classList.contains("hidden")) {
            if (!moreOptionsBtn.contains(event.target) && !moreOptionsMenu.contains(event.target)) {
                 moreOptionsMenu.classList.add("hidden");
            }
        }
        // Hide Filter Menu
        if (filterMenu && !filterMenu.classList.contains("hidden")) {
            if (!filterBtn.contains(event.target) && !filterMenu.contains(event.target)) {
                 filterMenu.classList.add("hidden");
            }
        }
    });

    if (exportCsvBtn) {
        exportCsvBtn.addEventListener("click", (event) => {
            event.preventDefault(); // Prevent default link behavior
            exportToCSV();
            moreOptionsMenu.classList.add("hidden"); // Hide menu after click
        });
    }

    // Add listener for CSV Upload Button
    const uploadCsvButton = document.getElementById('uploadCsvButton');
    const csvFileInput = document.getElementById('csvFile');

    if (uploadCsvButton && csvFileInput) {
        uploadCsvButton.addEventListener('click', async () => {
            if (csvFileInput.files.length === 0) {
                alert('Please select a CSV file first.');
                return;
            }
            const file = csvFileInput.files[0];
            const formData = new FormData();
            formData.append('csvfile', file); // Match the name expected by multer

            console.log(`Uploading ${file.name}...`);
            try {
                // Use relative URL
                const response = await fetch('/api/upload-csv', {
                    method: 'POST',
                    body: formData,
                });

                const responseText = await response.text(); // Read response text
                console.log('Upload response:', responseText);

                if (!response.ok) {
                    throw new Error(`Upload failed: ${response.status} - ${responseText}`);
                }

                alert('CSV uploaded successfully! Refreshing data...');
                await fetchShipmentsAndRender(); // Re-fetch data and re-render the table

            } catch (error) {
                console.error('Error uploading CSV:', error);
                alert(`Error uploading CSV: ${error.message}`);
            }
        });
    }

    // Listener for Show All button
    if (showAllBtn) {
        showAllBtn.addEventListener('click', () => {
            console.log('Show All clicked');
            if (searchInput) {
                searchInput.value = ''; // Clear search term
            }
            sortColumn = -1; // Reset sort
            sortDirection = 'asc';
            hiveFilteredDataSnapshot = null; // Clear HIVE snapshot
            // performSearch will now use full shipmentData because hiveFilteredDataSnapshot is null and searchTerm is empty
            performSearch(); 
        });
    }

    // --- HIVE Query Section ---
    const hiveQuestionInput = document.getElementById('hiveQuestionInput');
    const askHiveButton = document.getElementById('askHiveButton');
    const hiveResultsArea = document.getElementById('hiveResultsArea');

    function displayUserQuestion(question) {
        const userMessageDiv = document.createElement('div');
        userMessageDiv.classList.add('chat-message', 'user-question');
        userMessageDiv.textContent = question;
        hiveResultsArea.appendChild(userMessageDiv);
        hiveResultsArea.scrollTop = hiveResultsArea.scrollHeight; // Scroll to bottom
    }

    function renderHiveQueryResults(data) {
        const hiveResponseDiv = document.createElement('div');
        hiveResponseDiv.classList.add('chat-message', 'hive-response');

        let content = '';
        let hasDataTable = data.data_from_db && Array.isArray(data.data_from_db) && data.data_from_db.length > 0;

        if (data.answer && (!hasDataTable || data.answer.toLowerCase().includes("error") || (data.sql_query_generated && data.sql_query_generated.startsWith("# Cannot generate SQL")) || data.answer.includes("LLM client not available"))) {
            content += `<h4>HIVE Says:</h4><p>${escapeHtml(data.answer)}</p>`;
        }

        if (data.sql_query_generated && data.sql_query_generated !== "# SQL generation not attempted." && !(data.sql_query_generated && data.sql_query_generated.startsWith("# Cannot generate SQL"))) {
            content += `<h4>Generated SQL:</h4><pre>${escapeHtml(data.sql_query_generated)}</pre>`;
        }

        if (hasDataTable) {
            content += `<h4>Data from Database (${data.data_from_db.length} rows):</h4>`;
            content += '<table class="hive-data-table data-table">';
            content += '<thead><tr>';

            // Get main table header keys and display names for consistent ordering
            const mainTableHeaders = document.querySelectorAll("#shipmentTableBody")[0].closest('table').querySelectorAll('thead th');
            const mainTableHeaderKeys = [];
            const mainTableHeaderDisplayNames = [];
            mainTableHeaders.forEach(th => {
                const key = th.dataset.columnKey;
                if (key) { // Only consider headers with a data-column-key (excludes Actions column)
                    mainTableHeaderKeys.push(key);
                    mainTableHeaderDisplayNames.push(th.textContent || key); // Use textContent or key as fallback
                }
            });

            // Build HIVE table headers based on main table's header order and display names
            mainTableHeaderDisplayNames.forEach(displayName => {
                content += `<th>${escapeHtml(displayName)}</th>`;
            });
            content += '</tr></thead><tbody>';

            // Build HIVE table body using the main table's key order
            data.data_from_db.forEach(row => {
                content += '<tr>';
                mainTableHeaderKeys.forEach(key => {
                    // HIVE data might come with different casing or structure for keys,
                    // so we need to find the HIVE key that matches our mainTableHeaderKey (case-insensitive)
                    let hiveRowKey = Object.keys(row).find(k => k.toLowerCase() === key.toLowerCase());
                    const val = hiveRowKey ? row[hiveRowKey] : ''; // Get value if key found, else empty
                    content += `<td>${escapeHtml(val === null || val === undefined ? '' : val)}</td>`;
                });
                content += '</tr>';
            });
            content += '</tbody></table>';

            hiveFilteredDataSnapshot = data.data_from_db;
            console.log("HIVE provided data. Updated hiveFilteredDataSnapshot. Triggering performSearch to update main table.");
            performSearch(); 
        } else {
            if (data.data_from_db === null && data.answer && data.answer.includes("Query executed successfully") && !content.includes("HIVE Says")) {
                 content += `<p>Query executed, but no data was returned from the database.</p>`;
            }
            // If HIVE did not return a table, do not change hiveFilteredDataSnapshot or re-call performSearch for main table here.
            // The main table will retain its previous state.
        }

        hiveResponseDiv.innerHTML = content;
        hiveResultsArea.appendChild(hiveResponseDiv);
        hiveResultsArea.scrollTop = hiveResultsArea.scrollHeight;
    }

    askHiveButton.addEventListener('click', async () => {
        const question = hiveQuestionInput.value.trim();
        if (!question) {
            alert('Please enter a question for HIVE.');
            return;
        }

        displayUserQuestion(question);
        hiveQuestionInput.value = ''; // Clear input after displaying question

        // Add a temporary "HIVE is thinking..." message
        const thinkingMsg = document.createElement('div');
        thinkingMsg.classList.add('chat-message', 'hive-response');
        thinkingMsg.innerHTML = '<em>HIVE is thinking...</em>';
        hiveResultsArea.appendChild(thinkingMsg);
        hiveResultsArea.scrollTop = hiveResultsArea.scrollHeight;

        try {
            const response = await fetch('/api/llm-query', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ question: question })
            });

            hiveResultsArea.removeChild(thinkingMsg); // Remove "thinking" message

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response.', details: `HTTP error! status: ${response.status}` }));
                const errorResponseDiv = document.createElement('div');
                errorResponseDiv.classList.add('chat-message', 'hive-response');
                errorResponseDiv.innerHTML = `<h4>Error:</h4><p>${escapeHtml(errorData.error || 'Unknown error')}</p>${errorData.details ? `<p><small>${escapeHtml(errorData.details)}</small></p>` : ''}`;
                hiveResultsArea.appendChild(errorResponseDiv);
            } else {
                const data = await response.json();
                console.log('askHiveButton: Data received from /api/llm-query to be passed to renderHiveQueryResults:', JSON.parse(JSON.stringify(data)));
                renderHiveQueryResults(data);
            }
        } catch (error) {
            if (hiveResultsArea.contains(thinkingMsg)) {
                 hiveResultsArea.removeChild(thinkingMsg); // Remove "thinking" message if it's still there
            }
            console.error('Error querying HIVE:', error);
            const errorResponseDiv = document.createElement('div');
            errorResponseDiv.classList.add('chat-message', 'hive-response');
            errorResponseDiv.innerHTML = `<h4>Network/Request Error:</h4><p>${escapeHtml(error.message)}</p><p><small>Check the console for more details. Ensure the backend and Python LLM service are running.</small></p>`;
            hiveResultsArea.appendChild(errorResponseDiv);
        }
        hiveResultsArea.scrollTop = hiveResultsArea.scrollHeight; // Scroll to bottom one last time
    });

    // Add event listener for Enter key on the input field
    hiveQuestionInput.addEventListener('keypress', function(event) {
        if (event.key === 'Enter') {
            event.preventDefault(); // Prevent default action (like form submission if it were in a form)
            askHiveButton.click(); // Programmatically click the button
        }
    });

    // Simple HTML escape function (incomplete, but good for basic cases)
    function escapeHtml(unsafe) {
        if (unsafe === null || unsafe === undefined) return '';
        if (typeof unsafe !== 'string') unsafe = String(unsafe);
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }
});

function exportToCSV() {
    const headers = Object.keys(filteredData[0] || initialShipmentData[0]);
    let csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n";

    filteredData.forEach(item => {
        const row = headers.map(header => {
            let cellData = item[header] === null || item[header] === undefined ? '' : item[header];
            // Escape commas and quotes in cell data
            cellData = String(cellData).replace(/"/g, '""'); // Escape double quotes
            if (String(cellData).includes(",")) {
                cellData = `"${cellData}"`; // Enclose in double quotes if it contains a comma
            }
            return cellData;
        });
        csvContent += row.join(",") + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "shipping_schedule.csv");
    document.body.appendChild(link); // Required for Firefox
    link.click();
    document.body.removeChild(link);
}

console.log("Shipping Dashboard Script Loaded and Enhanced with Search, Sort, and Export"); 