/**
 * Koha-Platzhalter: <<entity.field>> bzw. <<entity.field|filter>> ersetzen.
 * Fallback: Kein Wert → Platzhalter unverändert lassen.
 * <item>...</item> wird mit konfigurierbar vielen Einträgen aus items[] expandiert.
 */

function flatten(obj, prefix = '') {
  if (obj == null || typeof obj !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}${k}` : k;
    if (v != null && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) {
      Object.assign(out, flatten(v, `${key}.`));
    } else {
      out[key] = v;
    }
  }
  return out;
}

/**
 * Flaches Objekt für Ersetzung: entity.field → Wert.
 * itemIndex: wenn >= 0, wird für diese Zeile items[i], biblio[i], biblioitems[i], issues[i] ergänzt.
 */
export function getFlatData(sampleData, itemIndex = undefined) {
  const data = {};
  if (sampleData.branches) Object.assign(data, flatten(sampleData.branches, 'branches.'));
  if (sampleData.borrowers) Object.assign(data, flatten(sampleData.borrowers, 'borrowers.'));
  if (sampleData.fines !== undefined) data.fines = sampleData.fines;
  if (sampleData.total_fines !== undefined) data.total_fines = sampleData.total_fines;
  if (sampleData.today !== undefined) data.today = sampleData.today;

  if (typeof itemIndex === 'number' && sampleData.items && sampleData.items[itemIndex] != null) {
    const i = sampleData.items[itemIndex];
    Object.assign(data, flatten(i, 'items.'));
    if (sampleData.biblio && sampleData.biblio[itemIndex] != null) {
      Object.assign(data, flatten(sampleData.biblio[itemIndex], 'biblio.'));
    }
    if (sampleData.biblioitems && sampleData.biblioitems[itemIndex] != null) {
      Object.assign(data, flatten(sampleData.biblioitems[itemIndex], 'biblioitems.'));
    }
    if (sampleData.issues && sampleData.issues[itemIndex] != null) {
      Object.assign(data, flatten(sampleData.issues[itemIndex], 'issues.'));
    }
  }
  return data;
}

function applyFilter(value, filterName) {
  if (value == null || value === '') return value;
  if (filterName === 'dateonly') {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  }
  return value;
}

const PLACEHOLDER_REGEX = /<<([^>|]+)(?:\|([^>]+))?>>/g;

/**
 * Ersetzt alle <<key>> und <<key|filter>> durch Werte aus flatData.
 * Fehlt der Wert oder ist leer: Platzhalter bleibt unverändert (Fallback).
 */
export function replacePlaceholders(html, flatData) {
  return html.replace(PLACEHOLDER_REGEX, (match, key, filter) => {
    const rawKey = key.trim();
    let value = flatData[rawKey];
    if (value === undefined || value === null || value === '') return match;
    if (filter) value = applyFilter(value, filter.trim());
    return String(value);
  });
}

const ITEM_BLOCK_REGEX = /<item\s*>([\s\S]*?)<\/item>/gi;

/**
 * Ersetzt <item>...</item> durch itemCount Zeilen; pro Zeile werden Platzhalter mit items[i] usw. ersetzt.
 */
export function expandItemBlocks(html, sampleData, itemCount) {
  const count = Math.max(0, Math.min(100, Math.floor(Number(itemCount) || 0)));
  return html.replace(ITEM_BLOCK_REGEX, (match, inner) => {
    let result = '';
    for (let i = 0; i < count; i++) {
      const flatData = getFlatData(sampleData, i);
      result += replacePlaceholders(inner, flatData);
    }
    return result;
  });
}

/**
 * Vollständige Verarbeitung: zuerst <item>-Blöcke expandieren, dann alle Platzhalter ersetzen.
 */
export function processDocument(html, sampleData, itemCount) {
  let out = expandItemBlocks(html, sampleData, itemCount);
  const flatData = getFlatData(sampleData);
  out = replacePlaceholders(out, flatData);
  return out;
}
