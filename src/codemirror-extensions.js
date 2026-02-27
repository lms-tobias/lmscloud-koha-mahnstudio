/**
 * CodeMirror-Erweiterungen für MahnStudio:
 * Zeilenumbruch, Hervorhebung von <<...>>, Autocomplete für Koha-Platzhalter,
 * HTML-Lint (fehlende/falsche schließende Tags).
 */
import { EditorState } from '@codemirror/state';
import { Decoration, ViewPlugin, EditorView } from '@codemirror/view';
import { autocompletion, insertCompletionText, pickedCompletion } from '@codemirror/autocomplete';
import { htmlCompletionSource } from '@codemirror/lang-html';
import { syntaxTree } from '@codemirror/language';
import { linter, lintGutter } from '@codemirror/lint';

/** 1. Zeilenumbruch */
export const lineWrapping = EditorView.lineWrapping;

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

function htmlLintSource(view) {
  const diagnostics = [];
  const tree = syntaxTree(view.state);
  const doc = view.state.doc.toString();

  tree.cursor().iterate({
    enter(node) {
      const name = node.type.name;
      if (!HTML_ERROR_NODES.has(name)) return;
      const from = node.from;
      const to = node.to;
      const snippet = doc.slice(from, to).replace(/\n/g, ' ').slice(0, 40);
      const message = HTML_LINT_MESSAGES[name] || name;
      diagnostics.push({
        from,
        to,
        severity: 'warning',
        message: `${message}${snippet ? `: „${snippet}${snippet.length >= 40 ? '…' : ''}"` : ''}`,
        source: 'html',
      });
    },
  });

  return diagnostics;
}

/** Lint-Extension für den HTML-Editor: Anzeige von Tag-Fehlern + Gutter-Marker */
export const htmlLintExtension = [
  linter(htmlLintSource, { delay: 400 }),
  lintGutter(),
];

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
