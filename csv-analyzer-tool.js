/**
 * CSV Analyzer Tool
 * 
 * A flexible utility for analyzing CSV files and answering questions about the data.
 * This tool can handle various CSV structures and answer different types of analytical questions.
 */

const fs = require('fs');
const path = require('path');
const Papa = require('papaparse'); // Make sure to install with: npm install papaparse

class CSVAnalyzer {
  constructor() {
    this.data = null;
    this.headers = [];
    this.filePath = '';
  }

  /**
   * Load and parse a CSV file
   * @param {string} filePath - Path to the CSV file
   * @returns {Promise<Object>} - Parsed data
   */
  async loadCSV(filePath) {
    try {
      this.filePath = filePath;
      const fileContent = fs.readFileSync(filePath, 'utf8');
      
      return new Promise((resolve, reject) => {
        Papa.parse(fileContent, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          trimHeaders: true,
          complete: (results) => {
            this.data = results.data;
            this.headers = results.meta.fields;
            console.log(`CSV loaded successfully. Found ${this.data.length} rows and ${this.headers.length} columns.`);
            resolve(results);
          },
          error: (error) => {
            reject(error);
          }
        });
      });
    } catch (error) {
      console.error(`Error loading CSV file: ${error.message}`);
      throw error;
    }
  }

  /**
   * Find the closest matching column name for a query
   * @param {string} query - The column name to search for
   * @returns {string|null} - The closest matching column name
   */
  findColumn(query) {
    if (!this.headers || this.headers.length === 0) {
      return null;
    }

    // Try exact match first
    const exactMatch = this.headers.find(header => 
      header.toLowerCase() === query.toLowerCase()
    );
    
    if (exactMatch) {
      return exactMatch;
    }

    // Try partial match
    const partialMatch = this.headers.find(header => 
      header.toLowerCase().includes(query.toLowerCase()) || 
      query.toLowerCase().includes(header.toLowerCase())
    );
    
    return partialMatch || null;
  }

  /**
   * Extract date components from various date formats
   * @param {string} dateStr - Date string to parse
   * @returns {Object|null} - Extracted date components or null if parsing failed
   */
  parseDateString(dateStr) {
    if (!dateStr) return null;
    
    // Handle full month name format (e.g., "January 26, 2025")
    const fullMonthPattern = /([a-z]+)\s+(\d{1,2})(?:,?\s+)(\d{4})/i;
    const fullMonthMatch = dateStr.match(fullMonthPattern);
    
    if (fullMonthMatch) {
      const months = {
        january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
        july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
      };
      
      const monthName = fullMonthMatch[1].toLowerCase();
      const month = months[monthName];
      const day = parseInt(fullMonthMatch[2], 10);
      const year = parseInt(fullMonthMatch[3], 10);
      
      if (month && !isNaN(day) && !isNaN(year)) {
        return { month, day, year };
      }
    }
    
    // Handle MM/DD/YYYY format
    const slashPattern = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;
    const slashMatch = dateStr.match(slashPattern);
    
    if (slashMatch) {
      const month = parseInt(slashMatch[1], 10);
      const day = parseInt(slashMatch[2], 10);
      const year = parseInt(slashMatch[3], 10);
      
      if (!isNaN(month) && !isNaN(day) && !isNaN(year)) {
        return { month, day, year };
      }
    }
    
    // Handle DD-MM-YYYY format
    const dashPattern = /(\d{1,2})-(\d{1,2})-(\d{4})/;
    const dashMatch = dateStr.match(dashPattern);
    
    if (dashMatch) {
      const day = parseInt(dashMatch[1], 10);
      const month = parseInt(dashMatch[2], 10);
      const year = parseInt(dashMatch[3], 10);
      
      if (!isNaN(month) && !isNaN(day) && !isNaN(year)) {
        return { month, day, year };
      }
    }
    
    // Handle YYYY-MM-DD format
    const isoPattern = /(\d{4})-(\d{1,2})-(\d{1,2})/;
    const isoMatch = dateStr.match(isoPattern);
    
    if (isoMatch) {
      const year = parseInt(isoMatch[1], 10);
      const month = parseInt(isoMatch[2], 10);
      const day = parseInt(isoMatch[3], 10);
      
      if (!isNaN(month) && !isNaN(day) && !isNaN(year)) {
        return { month, day, year };
      }
    }
    
    return null;
  }

  /**
   * Parse numeric values from various formats
   * @param {string} valueStr - Value string to parse
   * @returns {number} - Parsed numeric value or 0 if parsing failed
   */
  parseNumericValue(valueStr) {
    if (valueStr === null || valueStr === undefined) return 0;
    
    // If it's already a number, return it
    if (typeof valueStr === 'number') return valueStr;
    
    // Clean the string and convert to number
    const cleanedStr = String(valueStr).replace(/[^0-9.-]+/g, '');
    const number = parseFloat(cleanedStr);
    
    return isNaN(number) ? 0 : number;
  }

  /**
   * Format a number as currency
   * @param {number} amount - Amount to format
   * @param {string} currency - Currency code (default: USD)
   * @returns {string} - Formatted currency string
   */
  formatCurrency(amount, currency = 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }

  /**
   * Get data for a specific time period (day, month, year)
   * @param {string} dateColumn - Column name containing date information
   * @param {number} year - Year to filter by
   * @param {number} month - Month to filter by (1-12), optional
   * @param {number} day - Day to filter by (1-31), optional
   * @returns {Array} - Filtered data
   */
  getDataForPeriod(dateColumn, year, month = null, day = null) {
    if (!this.data || !dateColumn) {
      return [];
    }

    // Find the actual column name in the CSV
    const actualDateColumn = this.findColumn(dateColumn);
    if (!actualDateColumn) {
      console.error(`Date column "${dateColumn}" not found.`);
      return [];
    }

    return this.data.filter(row => {
      const dateStr = row[actualDateColumn];
      if (!dateStr) return false;
      
      const dateInfo = this.parseDateString(dateStr);
      if (!dateInfo) return false;
      
      const yearMatch = dateInfo.year === year;
      const monthMatch = month === null || dateInfo.month === month;
      const dayMatch = day === null || dateInfo.day === day;
      
      return yearMatch && monthMatch && dayMatch;
    });
  }

  /**
   * Calculate total for a specified column for a given time period
   * @param {string} valueColumn - Column name containing values to sum
   * @param {string} dateColumn - Column name containing date information
   * @param {number} year - Year to filter by
   * @param {number} month - Month to filter by (1-12), optional
   * @param {number} day - Day to filter by (1-31), optional
   * @returns {number} - Total sum
   */
  calculateTotalForPeriod(valueColumn, dateColumn, year, month = null, day = null) {
    if (!this.data) {
      return 0;
    }

    // Find the actual column names in the CSV
    const actualValueColumn = this.findColumn(valueColumn);
    if (!actualValueColumn) {
      console.error(`Value column "${valueColumn}" not found.`);
      return 0;
    }

    const filteredData = this.getDataForPeriod(dateColumn, year, month, day);
    
    return filteredData.reduce((total, row) => {
      const value = this.parseNumericValue(row[actualValueColumn]);
      return total + value;
    }, 0);
  }

  /**
   * Compare totals between two time periods
   * @param {string} valueColumn - Column name containing values to sum
   * @param {string} dateColumn - Column name containing date information
   * @param {Object} period1 - First period {year, month, day}
   * @param {Object} period2 - Second period {year, month, day}
   * @returns {Object} - Comparison results
   */
  comparePeriods(valueColumn, dateColumn, period1, period2) {
    const total1 = this.calculateTotalForPeriod(
      valueColumn, 
      dateColumn, 
      period1.year, 
      period1.month, 
      period1.day
    );
    
    const total2 = this.calculateTotalForPeriod(
      valueColumn, 
      dateColumn, 
      period2.year, 
      period2.month, 
      period2.day
    );
    
    const difference = total2 - total1;
    const percentageChange = total1 === 0 ? null : (difference / total1) * 100;
    
    return {
      period1: {
        year: period1.year,
        month: period1.month,
        day: period1.day,
        total: total1,
        formattedTotal: this.formatCurrency(total1)
      },
      period2: {
        year: period2.year,
        month: period2.month,
        day: period2.day,
        total: total2,
        formattedTotal: this.formatCurrency(total2)
      },
      difference: difference,
      formattedDifference: this.formatCurrency(difference),
      percentageChange: percentageChange !== null ? percentageChange.toFixed(2) + '%' : 'N/A'
    };
  }

  /**
   * Get month name from month number
   * @param {number} monthNum - Month number (1-12)
   * @returns {string} - Month name
   */
  getMonthName(monthNum) {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    return months[monthNum - 1] || '';
  }

  /**
   * Process a question about the CSV data
   * @param {string} question - The question to process
   * @returns {string} - Answer to the question
   */
  async answerQuestion(question) {
    // Check if data is loaded
    if (!this.data || this.data.length === 0) {
      return "Please load a CSV file first.";
    }

    // Convert question to lowercase for easier matching
    const lowerQuestion = question.toLowerCase();

    try {
      // Compare two months
      if (lowerQuestion.includes('compare') || 
          (lowerQuestion.includes('vs') || lowerQuestion.includes('versus')) ||
          lowerQuestion.includes('difference between')) {
        
        // Extract month information
        const monthNames = [
          'january', 'february', 'march', 'april', 'may', 'june',
          'july', 'august', 'september', 'october', 'november', 'december',
          'jan', 'feb', 'mar', 'apr', 'may', 'jun',
          'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
        ];
        
        let months = [];
        let year = null;
        
        // Extract year
        const yearMatch = lowerQuestion.match(/\b(20\d{2})\b/);
        if (yearMatch) {
          year = parseInt(yearMatch[1], 10);
        }
        
        // Extract months
        for (const monthName of monthNames) {
          if (lowerQuestion.includes(monthName)) {
            let monthNum;
            if (monthName.length <= 3) {
              // Convert abbreviated month name to number
              const index = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 
                            'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(monthName);
              monthNum = index + 1;
            } else {
              // Convert full month name to number
              const index = [
                'january', 'february', 'march', 'april', 'may', 'june',
                'july', 'august', 'september', 'october', 'november', 'december'
              ].indexOf(monthName);
              monthNum = index + 1;
            }
            
            if (monthNum > 0 && !months.includes(monthNum)) {
              months.push(monthNum);
            }
          }
        }
        
        // If we found two months and a year, compare them
        if (months.length >= 2 && year) {
          // Find the value column (looking for amount, total, sum, etc.)
          const valueColumnKeywords = ['amount', 'total', 'sum', 'value', 'price', 'revenue', 'sales'];
          let valueColumn = null;
          
          for (const keyword of valueColumnKeywords) {
            const foundColumn = this.findColumn(keyword);
            if (foundColumn) {
              valueColumn = foundColumn;
              break;
            }
          }
          
          if (!valueColumn) {
            // If no specific value column is found, try to find any numeric column
            for (const header of this.headers) {
              if (this.data[0] && typeof this.parseNumericValue(this.data[0][header]) === 'number') {
                valueColumn = header;
                break;
              }
            }
          }
          
          // Find the date column
          const dateColumnKeywords = ['date', 'time', 'etd', 'eta', 'created', 'modified', 'period'];
          let dateColumn = null;
          
          for (const keyword of dateColumnKeywords) {
            const foundColumn = this.findColumn(keyword);
            if (foundColumn) {
              dateColumn = foundColumn;
              break;
            }
          }
          
          if (valueColumn && dateColumn) {
            const comparison = this.comparePeriods(
              valueColumn,
              dateColumn,
              { year, month: months[0] },
              { year, month: months[1] }
            );
            
            // Count number of records in each period
            const period1Data = this.getDataForPeriod(dateColumn, year, months[0]);
            const period2Data = this.getDataForPeriod(dateColumn, year, months[1]);
            
            // Format the response
            return `
Comparison between ${this.getMonthName(months[0])} ${year} and ${this.getMonthName(months[1])} ${year}:

${this.getMonthName(months[0])} ${year} Total: ${comparison.period1.formattedTotal}
Number of shipments: ${period1Data.length}

${this.getMonthName(months[1])} ${year} Total: ${comparison.period2.formattedTotal}
Number of shipments: ${period2Data.length}

Difference: ${comparison.formattedDifference}
Percentage Change: ${comparison.percentageChange}
            `.trim();
          } else {
            return "Could not identify appropriate date or value columns for comparison.";
          }
        } else {
          return "Could not identify two months and/or a year to compare. Please specify the months and year clearly.";
        }
      }
      
      // Get total for a specific month
      else if (lowerQuestion.includes('total') || lowerQuestion.includes('sum')) {
        // Extract month information
        const monthNames = [
          'january', 'february', 'march', 'april', 'may', 'june',
          'july', 'august', 'september', 'october', 'november', 'december',
          'jan', 'feb', 'mar', 'apr', 'may', 'jun',
          'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
        ];
        
        let month = null;
        let year = null;
        
        // Extract year
        const yearMatch = lowerQuestion.match(/\b(20\d{2})\b/);
        if (yearMatch) {
          year = parseInt(yearMatch[1], 10);
        }
        
        // Extract month
        for (const monthName of monthNames) {
          if (lowerQuestion.includes(monthName)) {
            let monthNum;
            if (monthName.length <= 3) {
              // Convert abbreviated month name to number
              const index = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 
                            'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(monthName);
              monthNum = index + 1;
            } else {
              // Convert full month name to number
              const index = [
                'january', 'february', 'march', 'april', 'may', 'june',
                'july', 'august', 'september', 'october', 'november', 'december'
              ].indexOf(monthName);
              monthNum = index + 1;
            }
            
            if (monthNum > 0) {
              month = monthNum;
              break;
            }
          }
        }
        
        if (month && year) {
          // Find the value column (looking for amount, total, sum, etc.)
          const valueColumnKeywords = ['amount', 'total', 'sum', 'value', 'price', 'revenue', 'sales'];
          let valueColumn = null;
          
          for (const keyword of valueColumnKeywords) {
            const foundColumn = this.findColumn(keyword);
            if (foundColumn) {
              valueColumn = foundColumn;
              break;
            }
          }
          
          // Find the date column
          const dateColumnKeywords = ['date', 'time', 'etd', 'eta', 'created', 'modified', 'period'];
          let dateColumn = null;
          
          for (const keyword of dateColumnKeywords) {
            const foundColumn = this.findColumn(keyword);
            if (foundColumn) {
              dateColumn = foundColumn;
              break;
            }
          }
          
          if (valueColumn && dateColumn) {
            const total = this.calculateTotalForPeriod(valueColumn, dateColumn, year, month);
            const formattedTotal = this.formatCurrency(total);
            
            // Count number of records
            const periodData = this.getDataForPeriod(dateColumn, year, month);
            
            return `
Total for ${this.getMonthName(month)} ${year}: ${formattedTotal}
Number of entries: ${periodData.length}
            `.trim();
          } else {
            return "Could not identify appropriate date or value columns for calculation.";
          }
        } else {
          return "Could not identify a specific month and year. Please specify them clearly.";
        }
      }
      
      // Default response for unrecognized questions
      return `I'm not sure how to answer that question about the CSV data. Try asking about comparing periods (e.g., "Compare January 2025 vs February 2025") or getting totals for specific periods (e.g., "What's the total for March 2025?").`;
    } catch (error) {
      console.error(`Error answering question: ${error.message}`);
      return `An error occurred while processing your question: ${error.message}`;
    }
  }
}

/**
 * Example usage of the CSV Analyzer
 */
async function analyzeCSV(filePath, question) {
  const analyzer = new CSVAnalyzer();
  
  try {
    await analyzer.loadCSV(filePath);
    const answer = await analyzer.answerQuestion(question);
    return answer;
  } catch (error) {
    console.error(`Error in analyzeCSV: ${error.message}`);
    return `Error analyzing CSV: ${error.message}`;
  }
}

// Example command-line usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: node csv-analyzer.js <csv-file-path> "<question>"');
    console.log('Example: node csv-analyzer.js data.csv "What was the total in January 2025 vs February 2025?"');
    process.exit(1);
  }
  
  const filePath = args[0];
  const question = args[1];
  
  analyzeCSV(filePath, question)
    .then(answer => {
      console.log('\nAnswer:');
      console.log(answer);
    })
    .catch(error => {
      console.error(`Error: ${error.message}`);
    });
}

// Export functions for modular use
module.exports = {
  CSVAnalyzer,
  analyzeCSV
};
