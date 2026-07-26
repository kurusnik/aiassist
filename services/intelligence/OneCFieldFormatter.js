const SKIP_PREFIXES = [
  'uid', 'uuid', 'ref', 'ссылка', 'id', 'код',
];

const SKIP_FIELDS = [
  'uid', 'uuid', 'ref', 'id', 'recorder',
  'recorderorder', 'period', 'actuality',
];

const TECHNICAL_TYPES = [
  'УникальныйИдентификатор',
  'UUID',
  'Ссылка',
];

function isFieldTechnical(fieldName) {
  const lower = fieldName.toLowerCase();
  if (SKIP_FIELDS.includes(lower)) return true;
  if (SKIP_PREFIXES.some(p => lower.startsWith(p))) return true;
  return false;
}

function formatDate(value) {
  if (!value) return '';
  const str = String(value);
  if (/^\d{8}$/.test(str)) {
    const d = str.slice(6, 8);
    const m = str.slice(4, 6);
    const y = str.slice(0, 4);
    return `${d}.${m}.${y}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const parts = str.slice(0, 10).split('-');
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  if (value instanceof Date) {
    const d = String(value.getDate()).padStart(2, '0');
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const y = value.getFullYear();
    return `${d}.${m}.${y}`;
  }
  return str;
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  const parts = num.toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return parts[1] === '00' ? parts[0] : parts.join(',');
}

function format1CRef(value) {
  if (!value) return '';
  const str = String(value);
  const refMatch = str.match(/\.([^(]+)\.Ref\(/);
  if (refMatch) return refMatch[1].trim();
  const guidMatch = str.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  if (guidMatch) return '';
  return str;
}

function guessFieldType(fieldName, sampleValue) {
  const lower = fieldName.toLowerCase();
  if (lower.includes('дата') || lower.includes('date')) return 'date';
  if (lower.includes('сумма') || lower.includes('цена') || lower.includes('количество')
    || lower.includes('сум') || lower.includes('кол') || lower.includes('цен')) return 'number';
  if (sampleValue !== undefined && sampleValue !== null) {
    if (typeof sampleValue === 'string' && /^\d{8}$/.test(sampleValue)) return 'date';
    if (typeof sampleValue === 'string' && /^\d{4}-\d{2}-\d{2}/.test(sampleValue)) return 'date';
    const num = Number(sampleValue);
    if (Number.isFinite(num)) return 'number';
  }
  return 'string';
}

function formatField(fieldName, value) {
  if (isFieldTechnical(fieldName)) return null;
  const type = guessFieldType(fieldName, value);
  let formatted = value;
  if (type === 'date') formatted = formatDate(value);
  else if (type === 'number') formatted = formatNumber(value);
  else formatted = format1CRef(value);
  return { field: fieldName, formatted, type };
}

function formatRows(rows, fields) {
  if (!rows || !Array.isArray(rows) || rows.length === 0) return { rows: [], fields: [] };
  const detectedFields = fields || Object.keys(rows[0]);
  const visibleFields = detectedFields.filter(f => !isFieldTechnical(f));
  const formattedRows = rows.map(row => {
    const formatted = {};
    for (const field of visibleFields) {
      const raw = row[field];
      const formattedField = formatField(field, raw);
      if (formattedField) {
        formatted[field] = formattedField.formatted;
      }
    }
    return formatted;
  });
  return { rows: formattedRows, fields: visibleFields };
}

module.exports = {
  isFieldTechnical,
  formatDate,
  formatNumber,
  format1CRef,
  guessFieldType,
  formatField,
  formatRows,
  TECHNICAL_TYPES,
  SKIP_FIELDS,
  SKIP_PREFIXES,
};