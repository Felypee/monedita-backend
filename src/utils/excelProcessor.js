/**
 * Excel Processor
 * Parses Excel/CSV files and extracts expense data
 */

import * as XLSX from 'xlsx';

// Common column name mappings (case-insensitive)
const COLUMN_MAPPINGS = {
  amount: ['amount', 'monto', 'valor', 'value', 'total', 'precio', 'price', 'importe', 'cantidad'],
  date: ['date', 'fecha', 'data', 'when', 'dia', 'day'],
  description: ['description', 'descripcion', 'descrição', 'desc', 'concepto', 'detalle', 'detail', 'nota', 'note', 'item'],
  category: ['category', 'categoria', 'type', 'tipo', 'rubro', 'clasificacion'],
};

// Maximum rows to process
const MAX_ROWS = 500;

/**
 * Parse Excel/CSV buffer and extract expenses
 * @param {Buffer} buffer - File buffer
 * @param {string} mimeType - MIME type of the file
 * @param {string} userCurrency - User's currency for validation
 * @returns {{success: boolean, expenses: Array, errors: Array, preview: string}}
 */
export function parseExcelFile(buffer, mimeType, userCurrency = 'COP') {
  try {
    // Parse the workbook
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });

    // Get first sheet
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return { success: false, expenses: [], errors: ['No sheets found in file'], preview: '' };
    }

    const sheet = workbook.Sheets[sheetName];

    // Convert to JSON (array of objects with headers as keys)
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (data.length < 2) {
      return { success: false, expenses: [], errors: ['File is empty or has no data rows'], preview: '' };
    }

    // First row is headers
    const headers = data[0].map(h => String(h).toLowerCase().trim());
    const rows = data.slice(1);

    // Detect column indices
    const columnMap = detectColumns(headers);

    if (!columnMap.amount) {
      return {
        success: false,
        expenses: [],
        errors: [`Could not find amount column. Found headers: ${headers.join(', ')}`],
        preview: ''
      };
    }

    // Parse rows into expenses
    const expenses = [];
    const errors = [];
    const now = new Date();

    for (let i = 0; i < Math.min(rows.length, MAX_ROWS); i++) {
      const row = rows[i];
      const rowNum = i + 2; // 1-indexed, +1 for header

      // Skip empty rows
      if (!row || row.every(cell => cell === '' || cell === null || cell === undefined)) {
        continue;
      }

      // Extract amount
      const rawAmount = columnMap.amount !== null ? row[columnMap.amount] : null;
      const amount = parseAmount(rawAmount, userCurrency);

      if (!amount || amount <= 0) {
        errors.push(`Row ${rowNum}: Invalid amount "${rawAmount}"`);
        continue;
      }

      // Extract date (optional, defaults to today)
      let date = now;
      if (columnMap.date !== null) {
        const rawDate = row[columnMap.date];
        const parsedDate = parseDate(rawDate);
        if (parsedDate) {
          // Reject future dates
          if (parsedDate > now) {
            errors.push(`Row ${rowNum}: Future date not allowed "${rawDate}"`);
            continue;
          }
          date = parsedDate;
        }
      }

      // Extract description (optional)
      const description = columnMap.description !== null
        ? String(row[columnMap.description] || '').trim().substring(0, 200)
        : '';

      // Extract category (optional)
      const category = columnMap.category !== null
        ? String(row[columnMap.category] || '').trim().toLowerCase()
        : null;

      expenses.push({
        amount,
        date,
        description,
        category,
        rowNum,
      });
    }

    // Generate preview
    const preview = generatePreview(expenses, userCurrency);

    // Add warning if truncated
    if (rows.length > MAX_ROWS) {
      errors.push(`File has ${rows.length} rows, only first ${MAX_ROWS} will be imported`);
    }

    return {
      success: true,
      expenses,
      errors,
      preview,
      totalRows: rows.length,
      processedRows: expenses.length,
    };

  } catch (error) {
    console.error('[excelProcessor] Error parsing file:', error);
    return {
      success: false,
      expenses: [],
      errors: [`Error parsing file: ${error.message}`],
      preview: ''
    };
  }
}

/**
 * Detect column indices from headers
 */
function detectColumns(headers) {
  const result = {
    amount: null,
    date: null,
    description: null,
    category: null,
  };

  for (const [field, aliases] of Object.entries(COLUMN_MAPPINGS)) {
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i];
      if (aliases.some(alias => header.includes(alias))) {
        result[field] = i;
        break;
      }
    }
  }

  return result;
}

/**
 * Parse amount from various formats
 * Handles: 1000, 1.000, 1,000, $1,000.00, 1.000,50, etc.
 */
function parseAmount(value, currency) {
  if (value === null || value === undefined || value === '') return null;

  // If already a number, return it
  if (typeof value === 'number') return value;

  let str = String(value).trim();

  // Remove currency symbols and spaces
  str = str.replace(/[$€£¥₹]/g, '').trim();
  str = str.replace(/\s/g, '');

  // Detect format: European (1.000,50) vs US (1,000.50)
  const hasCommaDecimal = /\d,\d{1,2}$/.test(str);
  const hasDotDecimal = /\d\.\d{1,2}$/.test(str);

  if (hasCommaDecimal) {
    // European format: 1.000,50 -> 1000.50
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (hasDotDecimal) {
    // US format: 1,000.50 -> 1000.50
    str = str.replace(/,/g, '');
  } else {
    // No decimals, remove all separators
    str = str.replace(/[.,]/g, '');
  }

  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

/**
 * Parse date from various formats
 */
function parseDate(value) {
  if (!value) return null;

  // If already a Date object
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  // If number (Excel serial date)
  if (typeof value === 'number') {
    // Excel dates are days since 1899-12-30
    const date = new Date((value - 25569) * 86400 * 1000);
    return isNaN(date.getTime()) ? null : date;
  }

  const str = String(value).trim();

  // Try ISO format first
  let date = new Date(str);
  if (!isNaN(date.getTime())) return date;

  // Try DD/MM/YYYY format
  const ddmmyyyy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(date.getTime())) return date;
  }

  // Try YYYY-MM-DD format
  const yyyymmdd = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (yyyymmdd) {
    const [, year, month, day] = yyyymmdd;
    date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(date.getTime())) return date;
  }

  return null;
}

/**
 * Generate preview string for user confirmation
 */
function generatePreview(expenses, currency) {
  if (expenses.length === 0) return 'No expenses detected';

  const sample = expenses.slice(0, 5);
  const lines = sample.map((e, i) => {
    const dateStr = e.date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
    const amountStr = e.amount.toLocaleString('es-CO');
    const desc = e.description ? ` - ${e.description.substring(0, 30)}` : '';
    const cat = e.category ? ` [${e.category}]` : '';
    return `${i + 1}. ${dateStr}: $${amountStr}${desc}${cat}`;
  });

  if (expenses.length > 5) {
    lines.push(`... y ${expenses.length - 5} más`);
  }

  return lines.join('\n');
}

export default { parseExcelFile };
