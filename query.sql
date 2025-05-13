SELECT 
    shipmentName,
    totalAmount,
    CAST(REPLACE(REPLACE(totalAmount, '$', ''), ',', '') AS REAL) as numeric_total
FROM shipments 
WHERE totalAmount IS NOT NULL 
AND totalAmount != ''
ORDER BY numeric_total DESC 
LIMIT 1; 