/**
 * Marker-Format: <!-- BEGIN id --> ... <!-- END id --> (id alphanumerisch).
 * parseMarkerRegions: findet alle Marker-Paare und extrahiert den Inhalt.
 * injectContentIntoBaseHtml: ersetzt die Inhalte zwischen den Markern durch regionContents[id].
 */

const BEGIN_RE = /<!--\s*BEGIN\s+([A-Za-z0-9]+)\s*-->/g;
const END_RE = /<!--\s*END\s+([A-Za-z0-9]+)\s*-->/g;

/**
 * Findet alle Marker-Paare im HTML.
 * @param {string} html
 * @returns {{ id: string, content: string, startIndex: number, beginEnd: number, endStart: number, endIndex: number }[]}
 */
export function parseMarkerRegions(html) {
  const begins = [];
  let m;
  BEGIN_RE.lastIndex = 0;
  while ((m = BEGIN_RE.exec(html)) !== null) {
    begins.push({ id: m[1], startIndex: m.index, beginEnd: m.index + m[0].length });
  }
  const ends = [];
  END_RE.lastIndex = 0;
  while ((m = END_RE.exec(html)) !== null) {
    ends.push({ id: m[1], endStart: m.index, endIndex: m.index + m[0].length - 1 });
  }
  const regions = [];
  for (const b of begins) {
    const end = ends.find((e) => e.id === b.id && e.endStart >= b.beginEnd);
    if (!end) continue;
    const content = html.slice(b.beginEnd, end.endStart);
    regions.push({
      id: b.id,
      content,
      startIndex: b.startIndex,
      beginEnd: b.beginEnd,
      endStart: end.endStart,
      endIndex: end.endIndex,
    });
  }
  return regions;
}

/**
 * Ersetzt in baseHtml die Inhalte zwischen den Markern durch die Einträge aus regionContents.
 * @param {string} baseHtml
 * @param {Record<string, string>} regionContents - Schlüssel = Marker-id, Wert = neuer Inhalt
 * @returns {string}
 */
export function injectContentIntoBaseHtml(baseHtml, regionContents) {
  const regions = parseMarkerRegions(baseHtml);
  if (regions.length === 0) return baseHtml;
  const sorted = [...regions].sort((a, b) => a.startIndex - b.startIndex);
  let result = '';
  let lastEnd = 0;
  for (const r of sorted) {
    result += baseHtml.slice(lastEnd, r.startIndex);
    result += baseHtml.slice(r.startIndex, r.beginEnd);
    result += (regionContents[r.id] ?? r.content);
    result += baseHtml.slice(r.endStart, r.endIndex + 1);
    lastEnd = r.endIndex + 1;
  }
  result += baseHtml.slice(lastEnd);
  return result;
}

/**
 * Liest die aktuellen Regionen-Inhalte aus dem Basis-HTML als Objekt id -> content.
 * @param {string} html
 * @returns {Record<string, string>}
 */
export function getRegionContentsFromHtml(html) {
  const regions = parseMarkerRegions(html);
  const out = {};
  for (const r of regions) {
    out[r.id] = r.content;
  }
  return out;
}
