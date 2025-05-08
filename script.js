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
let filteredData = []; // Will be populated from backend or based on shipmentData
let sortColumn = -1; // -1 means no sort, or use a default like 0 for first column
let sortDirection = 'asc'; // 'asc' or 'desc'

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
        // Gracefully handle null or undefined status
        const currentStatus = item.status || ""; // Default to empty string if null/undefined
        if (typeof currentStatus === 'string' && currentStatus.toLowerCase() === "done") {
            statusSpan.className = "status-done";
        }
        statusSpan.textContent = currentStatus;
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
        cellContractQuantity.textContent = item.contractQuantity;
        makeCellEditable(cellContractQuantity, item, 'contractQuantity');
        
        const cellTotalAmount = row.insertCell();
        cellTotalAmount.textContent = item.totalAmount;
        makeCellEditable(cellTotalAmount, item, 'totalAmount');

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
        // Added cache-busting query parameter and no-store cache option
        const response = await fetch('http://localhost:3000/api/shipments?t=' + new Date().getTime(), {
            cache: 'no-store' 
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
        }
        const data = await response.json();
        console.log('Data received from backend:', data);
        shipmentData = data; // Populate with data from server
        // Initial filter/sort state after fetching data
        performSearch(); // This will set filteredData and call renderTable with current sort
    } catch (error) {
        console.error("Could not fetch shipments:", error);
        // Optionally, display an error message to the user on the page
        // For now, table might just appear empty or with old data if any
        shipmentData = []; // Ensure it's empty on error
        filteredData = [];
        renderTable(); // Render an empty or error state table
    }
}

// Function to sort the table
function sortTable(columnIndex) {
    if (sortColumn === columnIndex) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = columnIndex;
        sortDirection = 'asc';
    }

    filteredData.sort((a, b) => {
        // Get values to compare. Adjust keys based on your data structure and column index
        const keys = Object.keys(initialShipmentData[0]); // Assumes all items have same keys
        const key = keys[columnIndex];
        
        let valA = a[key];
        let valB = b[key];

        // Basic numeric sort for columns that look like numbers or currency
        if (key === 'sPrice' || key === 'grossWeight' || key === 'contractQuantity' || key === 'totalAmount' || key === 'piValue') {
            valA = parseFloat(String(valA).replace(/[^\d.-]/g, '')) || 0;
            valB = parseFloat(String(valB).replace(/[^\d.-]/g, '')) || 0;
        }
        // Basic date sort (very simplified, assumes consistent M D, YYYY format prefix)
        else if (key === 'etd' || key === 'eta') {
             // This is a placeholder. Proper date sorting is complex.
             // For simplicity, we'll compare as strings for now.
             // To do this properly, parse dates into Date objects.
        }

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
        if (index === sortColumn) {
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
    const searchTerm = document.getElementById("searchInput").value.toLowerCase();
    if (!searchTerm) {
        filteredData = [...shipmentData];
    } else {
        filteredData = shipmentData.filter(item => 
            item.shipmentName.toLowerCase().includes(searchTerm) ||
            item.oblNo.toLowerCase().includes(searchTerm) ||
            item.contractNo.toLowerCase().includes(searchTerm) ||
            item.fclsGoods.toLowerCase().includes(searchTerm)
        );
    }
    // If a sort column is set, re-apply sort after search
    if (sortColumn !== -1) {
        // Temporarily store current sort to re-apply to new filteredData
        const currentSortCol = sortColumn;
        const currentSortDir = sortDirection;
        sortColumn = -1; // Reset before calling sortTable to avoid toggling direction unintentionally
        sortTable(currentSortCol);
        sortDirection = currentSortDir; // Restore original direction if sortTable reset it
    } else {
        renderTable(); // Re-render the table with search results (no sort)
    }
     updateSortIndicators(); // Also update indicators after search
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

    document.querySelectorAll("th").forEach((th, index) => {
        th.addEventListener("click", () => {
            sortTable(index);
        });
    });
    renderTable(); // Initial render
    updateSortIndicators(); // Initial indicator setup

    const moreOptionsBtn = document.getElementById("moreOptionsBtn");
    const moreOptionsMenu = document.getElementById("moreOptionsMenu");
    const exportCsvBtn = document.getElementById("exportCsvBtn");

    if (moreOptionsBtn && moreOptionsMenu) {
        moreOptionsBtn.addEventListener("click", (event) => {
            event.stopPropagation(); // Prevent click from bubbling to document
            moreOptionsMenu.classList.toggle("hidden");
        });
    }

    // Hide dropdown if clicked outside
    document.addEventListener("click", (event) => { // Added event parameter
        if (moreOptionsMenu && !moreOptionsMenu.classList.contains("hidden")) {
            // Check if the click was outside the moreOptionsBtn and moreOptionsMenu
            if (!moreOptionsBtn.contains(event.target) && !moreOptionsMenu.contains(event.target)) {
                 moreOptionsMenu.classList.add("hidden");
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