/**
 * CodeMirror-Erweiterungen für MahnStudio:
 * Zeilenumbruch, Hervorhebung von <<...>>, Autocomplete für Koha-Platzhalter,
 * HTML-Lint (fehlende/falsche schließende Tags).
 */
import { EditorState } from '@codemirror/state';
import { Decoration, ViewPlugin, EditorView, keymap } from '@codemirror/view';
import { autocompletion, insertCompletionText, pickedCompletion } from '@codemirror/autocomplete';
import { html, htmlCompletionSource } from '@codemirror/lang-html';
import { syntaxTree, indentRange, getIndentUnit, indentString, ensureSyntaxTree } from '@codemirror/language';
import { parser as lezerHtmlParser } from '@lezer/html';
import { linter, lintGutter } from '@codemirror/lint';

/** 1. Zeilenumbruch */
export const lineWrapping = EditorView.lineWrapping;

/** Einrückung korrigieren: nutzt die Sprach-Indent-Logik (HTML/CSS) für den gewählten Bereich oder die aktuelle Zeile. */
function reindentSelection(view) {
  const state = view.state;
  const { from, to } = state.selection.main;
  const lineFrom = state.doc.lineAt(from);
  const lineTo = state.doc.lineAt(to);
  const rangeFrom = lineFrom.from;
  const rangeTo = lineTo.to;
  const changes = indentRange(state, rangeFrom, rangeTo);
  if (changes.empty) return false;
  view.dispatch({
    changes,
    selection: state.selection.map(changes),
  });
  return true;
}

/** Tastenkombination: Mod-Shift-i (Ctrl-Shift-i / Cmd-Shift-i) = Einrückung korrigieren */
export const reindentKeymap = keymap.of([
  { key: 'Mod-Shift-i', run: reindentSelection },
]);

/** HTML: Stack-basierte Einrückung (überspringt <<...>>, Kommentare, Attributwerte). Liefert den neuen Stack nach der Zeile. */
function htmlIndentStackAfterLine(lineText, stack) {
  const line = lineText;
  let i = 0;
  const newStack = [...stack];
  while (i < line.length) {
    if (line.slice(i, i + 2) === '<<') {
      const end = line.indexOf('>>', i + 2);
      i = end === -1 ? i + 2 : end + 2;
      continue;
    }
    if (line.slice(i, i + 4) === '<!--') {
      const end = line.indexOf('-->', i + 4);
      i = end === -1 ? line.length : end + 3;
      continue;
    }
    if (line.slice(i, i + 2) === '</') {
      const close = line.indexOf('>', i + 2);
      if (close !== -1) {
        const closeTagName = line.slice(i + 2, close).trim().toLowerCase().replace(/\/.*$/, '');
        // Pop bis zum passenden Tag (hilft bei falscher Reihenfolge oder Tippfehlern wie <td> statt </td>)
        while (newStack.length > 0 && newStack[newStack.length - 1] !== closeTagName) {
          newStack.pop();
        }
        if (newStack.length > 0) newStack.pop();
        i = close + 1;
      } else i += 1;
      continue;
    }
    if (line[i] === '<' && /[a-zA-Z]/.test(line[i + 1])) {
      let j = i + 1;
      while (j < line.length && /[a-zA-Z0-9]/.test(line[j])) j++;
      const tagName = line.slice(i + 1, j).toLowerCase();
      if (tagName && !SELF_CLOSING_TAGS.has(tagName)) newStack.push(tagName);
      const tagEnd = line.indexOf('>', j);
      i = tagEnd === -1 ? line.length : tagEnd + 1;
      continue;
    }
    if (line[i] === '"' || line[i] === "'") {
      const q = line[i];
      const qEnd = line.indexOf(q, i + 1);
      i = qEnd === -1 ? line.length : qEnd + 1;
      continue;
    }
    i += 1;
  }
  return newStack;
}

/** Einrückung korrigieren für HTML: immer stackbasiert (Parser scheitert an <<...>>). */
function reindentSelectionHTML(view) {
  const state = view.state;
  const { from, to } = state.selection.main;
  const lineFrom = state.doc.lineAt(from);
  const lineTo = state.doc.lineAt(to);
  const rangeFrom = lineFrom.from;
  const rangeTo = lineTo.to;

  const changesFallback = [];
  let stack = [];
  const unit = getIndentUnit(state);
  const indentStr = (cols) => indentString(state, cols);

  for (let pos = 0; pos <= rangeTo; ) {
    const line = state.doc.lineAt(pos);
    const stackBefore = stack;
    stack = htmlIndentStackAfterLine(line.text, stack);
    const stackAfter = stack;
    // Schließende Tags auf Ebene des öffnenden Tags (stack nach dem Schließen)
    const desiredIndent = stackAfter.length < stackBefore.length ? stackAfter.length : stackBefore.length;
    const currentLead = /^\s*/.exec(line.text)[0];
    const desiredLead = indentStr(desiredIndent * unit);
    const lineInSelection = line.from >= rangeFrom && line.from <= lineTo.from;
    if (lineInSelection && currentLead !== desiredLead) {
      changesFallback.push({ from: line.from, to: line.from + currentLead.length, insert: desiredLead });
    }
    pos = line.to + 1;
  }

  if (changesFallback.length === 0) return false;
  const changeSet = state.changes(changesFallback);
  view.dispatch({
    changes: changeSet,
    selection: state.selection.map(changeSet),
  });
  return true;
}

/** Wie reindentKeymap, aber mit HTML-Fallback für Koha-Platzhalter (nur im HTML-Editor verwenden). */
export const reindentKeymapHTML = keymap.of([
  { key: 'Mod-Shift-i', run: reindentSelectionHTML },
]);

/** Für Button-Aufruf: Einrückung im HTML-Editor korrigieren (view = editorHtmlView). */
export { reindentSelectionHTML };

/** Koha-Platzhalter für Autocomplete und Hervorhebung */
const PLACEHOLDERS = [
  'today',
  'fines',
  'total_fines',
  'branches.branchname',
  'branches.branchaddress1',
  'branches.branchaddress2',
  'branches.branchzip',
  'branches.branchcity',
  'branches.branchphone',
  'branches.branchreplyto',
  'branches.branchurl',
  'branches.opac_info',
  'borrowers.title',
  'borrowers.firstname',
  'borrowers.surname',
  'borrowers.address',
  'borrowers.streetnumber',
  'borrowers.address2',
  'borrowers.zipcode',
  'borrowers.city',
  'borrowers.cardnumber',
  'items.barcode',
  'items.enumchron',
  'items.fine',
  'biblio.title',
  'biblioitems.volume',
  'biblioitems.number',
  'issues.date_due',
];
const PLACEHOLDER_REGEX = /<<[^>]+>>/g;

/** 2. + 4. Hervorhebung für <<...>> (eigene Klasse) */
const placeholderDeco = Decoration.mark({ class: 'cm-koha-placeholder' });

export const kohaPlaceholderHighlight = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = this.buildDecos(view);
    }
    update(update) {
      if (update.docChanged) this.decorations = this.buildDecos(update.view);
    }
    buildDecos(view) {
      const ranges = [];
      const text = view.state.doc.toString();
      let m;
      PLACEHOLDER_REGEX.lastIndex = 0;
      while ((m = PLACEHOLDER_REGEX.exec(text)) !== null) {
        const from = m.index;
        const to = from + m[0].length;
        ranges.push(placeholderDeco.range(from, to));
      }
      return Decoration.set(ranges, true);
    }
  },
  { decorations: (v) => v.decorations }
);

/** 3. Autocomplete: bei << Vorschläge für Platzhalter (apply per Transaktion, damit kein Konflikt mit HTML) */
export function kohaPlaceholderCompletion(context) {
  const match = context.matchBefore(/<<([^>|]*)(?:\|[^>]*)?$/);
  if (!match) return null;
  const partial = (match[1] || '').trim().toLowerCase();
  const from = match.from;
  const to = context.pos;
  const options = PLACEHOLDERS.filter(
    (p) => !partial || p.toLowerCase().includes(partial) || p.toLowerCase().startsWith(partial)
  ).map((label) => ({
    label,
    type: 'variable',
    detail: 'Koha',
    boost: 99,
    apply: (view, completion, fromPos, toPos) => {
      const text = `<<${completion.label}>>`;
      view.dispatch({
        ...insertCompletionText(view.state, text, fromPos, toPos),
        annotations: pickedCompletion.of(completion),
      });
    },
  }));
  if (options.length === 0) return null;
  return { from, to, options };
}

/** Extension: Koha + HTML – beide Quellen, Koha-Optionen zuerst (boost). */
export const kohaPlaceholderAutocomplete = autocompletion({
  override: [kohaPlaceholderCompletion, htmlCompletionSource],
  activateOnTyping: true,
});

/** HTML-Lint: Fehler aus dem Lezer-Syntaxbaum (fehlende/falsche schließende Tags etc.) */
const HTML_ERROR_NODES = new Set([
  '⚠',                    // allgemeiner Parser-Fehler
  'MismatchedCloseTag',   // schließendes Tag passt nicht zum öffnenden
  'IncompleteTag',        // unvollständiges Tag
  'IncompleteCloseTag',   // unvollständiges schließendes Tag
]);

const HTML_LINT_MESSAGES = {
  '⚠': 'HTML-Syntaxfehler',
  'MismatchedCloseTag': 'Schließendes Tag passt nicht zum öffnenden Tag',
  'IncompleteTag': 'Unvollständiges Tag',
  'IncompleteCloseTag': 'Unvollständiges schließendes Tag',
};

/** Zeichen nach einem Platzhalter, in denen Parser-Folgefehler (z. B. beim nächsten <) unterdrückt werden. */
const PLACEHOLDER_SUPPRESS_TAIL = 300;

/** Liefert alle [from, to]-Bereiche von Koha-Platzhaltern im Dokument (to inkl. Suppress-Tail). */
function getPlaceholderRanges(doc) {
  const ranges = [];
  const text = typeof doc === 'string' ? doc : doc.toString();
  let m;
  PLACEHOLDER_REGEX.lastIndex = 0;
  while ((m = PLACEHOLDER_REGEX.exec(text)) !== null) {
    const end = m.index + m[0].length;
    ranges.push([m.index, Math.min(end + PLACEHOLDER_SUPPRESS_TAIL, text.length)]);
  }
  return ranges;
}

/** Prüft, ob [from, to] mit einem Koha-Platzhalter (inkl. Nachlauf) überlappt. */
function overlapsPlaceholder(from, to, placeholderRanges) {
  return placeholderRanges.some(([pFrom, pTo]) => from < pTo && to > pFrom);
}

/** HTML-Tags, die kein schließendes Tag haben (self-closing / void). */
const SELF_CLOSING_TAGS = new Set([
  'area', 'base', 'br', 'col', 'command', 'embed', 'frame', 'hr', 'img', 'input',
  'keygen', 'link', 'meta', 'param', 'source', 'track', 'wbr', 'menuitem',
]);

/** Liest den Tag-Namen aus dem Dokument bei einer OpenTag-Node (<tagname ...). */
function getOpenTagName(doc, from, to) {
  let end = from + 1;
  while (end < to && !/[\s/>]/.test(doc[end])) end++;
  return doc.slice(from + 1, end).toLowerCase();
}

/** Liest den Tag-Namen aus dem Dokument bei einer CloseTag-Node (</tagname>). */
function getCloseTagName(doc, from, to) {
  const closeBracket = doc.indexOf('>', from);
  if (closeBracket === -1) return '';
  return doc.slice(from + 2, closeBracket).trim().toLowerCase();
}

/** Sammelt alle geöffneten, aber nicht geschlossenen Tags aus dem Syntaxbaum. */
function findUnclosedTags(tree, doc) {
  const stack = [];
  const cursor = tree.cursor();
  cursor.iterate((node) => {
    const typeName = node.type.name;
    if (typeName === 'OpenTag') {
      const tagName = getOpenTagName(doc, node.from, node.to);
      if (tagName && !SELF_CLOSING_TAGS.has(tagName)) {
        stack.push({ tagName, from: node.from, to: node.to });
      }
    } else if (typeName === 'CloseTag' || typeName === 'MismatchedCloseTag' || typeName === 'NoMatchCloseTag') {
      const tagName = getCloseTagName(doc, node.from, node.to);
      if (!tagName) return;
      while (stack.length > 0 && stack[stack.length - 1].tagName !== tagName) {
        stack.pop();
      }
      if (stack.length > 0 && stack[stack.length - 1].tagName === tagName) {
        stack.pop();
      }
    }
  });
  return stack;
}

/** Prüft, ob im Dokument nach Position start ein schließendes Tag </tagname> vorkommt (Fallback bei unvollständigem Parser-Baum). */
function hasClosingTagInDoc(doc, tagName, start) {
  const re = new RegExp('</' + tagName + '\\s*>', 'i');
  return re.test(doc.slice(start));
}

/**
 * Einfache suche nach ungeschlossenen Tags per Scan (Fallback, wenn Lezer nichts liefert).
 * Ein Durchlauf: nächste "<" finden, dann öffnendes oder schließendes Tag erkennen.
 * @returns { Array<{ tagName: string, line: number }> }
 */
function findUnclosedTagsByRegex(doc) {
  const stack = [];
  const tagNameRe = /^[a-zA-Z][a-zA-Z0-9-]*/;
  let pos = 0;
  while (pos < doc.length) {
    const open = doc.indexOf('<', pos);
    if (open === -1) break;
    if (doc[open + 1] === '/') {
      const match = doc.slice(open + 2).match(tagNameRe);
      if (match) {
        const tagName = match[0].toLowerCase();
        while (stack.length > 0 && stack[stack.length - 1].tagName !== tagName) stack.pop();
        if (stack.length > 0 && stack[stack.length - 1].tagName === tagName) stack.pop();
      }
      const close = doc.indexOf('>', open + 2);
      pos = close === -1 ? doc.length : close + 1;
      continue;
    }
    if (doc[open + 1] === '!' || doc[open + 1] === '?') {
      const close = doc.indexOf('>', open + 2);
      pos = close === -1 ? doc.length : close + 1;
      continue;
    }
    const match = doc.slice(open + 1).match(tagNameRe);
    if (match) {
      const tagName = match[0].toLowerCase();
      const rest = doc.slice(open + 1 + match[0].length);
      const isSelfClose = /^\s*\/\s*>/.test(rest) || SELF_CLOSING_TAGS.has(tagName);
      if (!isSelfClose) stack.push({ tagName, index: open });
    }
    pos = open + 1;
  }
  return stack.map(({ tagName, index }) => ({
    tagName,
    line: doc.slice(0, index).split('\n').length,
  }));
}

function htmlLintSource(view) {
  const diagnostics = [];
  const doc = view.state.doc.toString();
  const docLength = doc.length;
  const tree = ensureSyntaxTree(view.state, docLength, 250) ?? syntaxTree(view.state);
  const placeholderRanges = getPlaceholderRanges(doc);

  if (tree.length === 0) return diagnostics;

  tree.cursor().iterate((node) => {
    const name = node.type.name;
    if (!HTML_ERROR_NODES.has(name)) return;
    const from = node.from;
    const to = node.to;
    if (overlapsPlaceholder(from, to, placeholderRanges)) return;
    const snippet = doc.slice(from, to).replace(/\n/g, ' ').slice(0, 40);
    const message = HTML_LINT_MESSAGES[name] || name;
    diagnostics.push({
      from,
      to,
      severity: 'warning',
      message: `${message}${snippet ? `: „${snippet}${snippet.length >= 40 ? '…' : ''}"` : ''}`,
      source: 'html',
    });
  });

  const unclosed = findUnclosedTags(tree, doc);
  const hasPlaceholders = placeholderRanges.length > 0;
  for (const { tagName, from, to } of unclosed) {
    if (overlapsPlaceholder(from, to, placeholderRanges)) continue;
    if (hasPlaceholders && hasClosingTagInDoc(doc, tagName, to)) continue;
    diagnostics.push({
      from,
      to,
      severity: 'warning',
      message: `Fehlendes schließendes Tag </${tagName}>`,
      source: 'html',
    });
  }

  return diagnostics;
}

/** Lint-Extension für den HTML-Editor: Anzeige von Tag-Fehlern + Gutter-Marker */
export const htmlLintExtension = [
  linter(htmlLintSource, { delay: 400 }),
  lintGutter(),
];

/**
 * HTML/DOM-Check per Button: Platzhalter entfernen, dann Lint mit Lezer-Parser direkt.
 * Gibt Meldungen mit Zeilennummer (im bereinigten HTML) zurück.
 * @param {string} htmlString - Rohes HTML (mit <<...>>)
 * @returns {{ diagnostics: Array<{ line: number, message: string, severity: string }> }}
 */
export function runHtmlDomCheck(htmlString) {
  const stripped = (htmlString || '').replace(PLACEHOLDER_REGEX, '');
  const tree = lezerHtmlParser.parse(stripped);
  const diagnostics = [];
  const doc = stripped;

  tree.cursor().iterate((node) => {
    const name = node.type.name;
    if (!HTML_ERROR_NODES.has(name)) return;
    const from = node.from;
    const to = node.to;
    const line = doc.slice(0, from).split('\n').length;
    const snippet = doc.slice(from, to).replace(/\n/g, ' ').slice(0, 40);
    const message = HTML_LINT_MESSAGES[name] || name;
    diagnostics.push({
      line,
      message: `${message}${snippet ? `: „${snippet}${snippet.length >= 40 ? '…' : ''}"` : ''}`,
      severity: 'warning',
    });
  });

  const unclosed = findUnclosedTags(tree, doc);
  for (const { tagName, from } of unclosed) {
    const line = doc.slice(0, from).split('\n').length;
    diagnostics.push({
      line,
      message: `Fehlendes schließendes Tag </${tagName}>`,
      severity: 'warning',
    });
  }

  if (diagnostics.length === 0) {
    const unclosedRegex = findUnclosedTagsByRegex(doc);
    for (const { tagName, line } of unclosedRegex) {
      diagnostics.push({
        line,
        message: `Fehlendes schließendes Tag </${tagName}>`,
        severity: 'warning',
      });
    }
  }

  return { diagnostics };
}

/** Deutsche Phrasen für Such-Panel und andere CodeMirror-UI */
const germanPhrases = {
  'Go to line': 'Springe zu Zeile',
  'go': 'OK',
  'Find': 'Suchen',
  'Replace': 'Ersetzen',
  'next': 'nächste',
  'previous': 'vorherige',
  'all': 'alle',
  'match case': 'Groß-/Kleinschreibung',
  'regexp': 'Regulärer Ausdruck',
  'by word': 'Ganze Wörter',
  'replace': 'Ersetzen',
  'replace all': 'Alle ersetzen',
  'close': 'Schließen',
  'current match': 'Aktueller Treffer',
  'replaced $ matches': '$ Treffer ersetzt',
  'replaced match on line $': 'Treffer auf Zeile $ ersetzt',
  'on line': 'auf Zeile',
};

export const germanPhrasesExtension = EditorState.phrases.of(germanPhrases);
