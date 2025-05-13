import sqlite3

def compare_provisional_to_total():
    conn = sqlite3.connect('shipping_data.db')
    cursor = conn.cursor()

    # Sum of provisional invoice value
    query_provisional = """
    SELECT SUM(CAST(REPLACE(REPLACE(provisionalInvoiceValue, '$', ''), ',', '') AS REAL))
    FROM shipments
    WHERE provisionalInvoiceValue IS NOT NULL AND provisionalInvoiceValue != '';
    """
    cursor.execute(query_provisional)
    sum_provisional = cursor.fetchone()[0] or 0

    # Sum of total amount
    query_total = """
    SELECT SUM(CAST(REPLACE(REPLACE(totalAmount, '$', ''), ',', '') AS REAL))
    FROM shipments
    WHERE totalAmount IS NOT NULL AND totalAmount != '';
    """
    cursor.execute(query_total)
    sum_total = cursor.fetchone()[0] or 0

    if sum_total != 0:
        percent = (sum_provisional / sum_total) * 100
    else:
        percent = 0

    print("\nComparison of Provisional Invoice Value to Total Amount (All Shipments):")
    print("-" * 60)
    print(f"Sum of Provisional Invoice Value: ${sum_provisional:,.2f}")
    print(f"Sum of Total Amount: ${sum_total:,.2f}")
    print(f"Provisional as Percent of Total: {percent:.2f}%")
    print(f"Difference: ${sum_provisional - sum_total:,.2f}")
    print("-" * 60)

    conn.close()

if __name__ == "__main__":
    compare_provisional_to_total() 