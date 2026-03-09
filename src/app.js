import { basicSetup, EditorView } from 'codemirror';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { templates } from './templates.config.js';
import {
  lineWrapping,
  kohaPlaceholderHighlight,
  kohaPlaceholderAutocomplete,
  germanPhrasesExtension,
  htmlLintExtension,
  reindentKeymap,
  reindentKeymapHTML,
  reindentSelectionHTML,
  runHtmlDomCheck,
} from './codemirror-extensions.js';
import { processDocument } from './placeholders.js';
import { getDefaultSampleData } from './sample-data.js';

const DEBOUNCE_MS = 400;
const ITEM_COUNT_MIN = 1;
const ITEM_COUNT_MAX = 25;
const LETTER_COUNT_MIN = 1;
const LETTER_COUNT_MAX = 5;
const BRANCH_STORAGE_KEY = 'mahnstudio.branches';

const BRANCH_FIELD_IDS = [
  'branchname', 'branchaddress1', 'branchaddress2', 'branchzip', 'branchcity',
  'branchphone', 'branchreplyto', 'branchurl', 'opac_info',
];

let editorHtmlView;
let editorCssView;
let debounceTimer = null;

/** Manuell gepflegte Bibliotheksdaten (über Branch-UI). Überschreibt Defaults in der Vorschau. */
let currentBranches = {};

function loadBranchesFromStorage() {
  try {
    const raw = localStorage.getItem(BRANCH_STORAGE_KEY);
    if (raw) currentBranches = { ...currentBranches, ...JSON.parse(raw) };
  } catch (_) {}
}

function getCurrentBranches() {
  return { ...currentBranches };
}

function setCurrentBranches(obj, persist = false) {
  currentBranches = { ...currentBranches, ...obj };
  if (persist) {
    try {
      localStorage.setItem(BRANCH_STORAGE_KEY, JSON.stringify(currentBranches));
    } catch (_) {}
  }
}

function getHtmlContent() {
  return editorHtmlView ? editorHtmlView.state.doc.toString() : '';
}

function getCssContent() {
  return editorCssView ? editorCssView.state.doc.toString() : '';
}

function getItemCount() {
  const input = document.getElementById('itemCountInput');
  const slider = document.getElementById('itemCountSlider');
  const v = input ? parseInt(input.value, 10) : (slider ? parseInt(slider.value, 10) : 3);
  return Math.max(ITEM_COUNT_MIN, Math.min(ITEM_COUNT_MAX, isNaN(v) ? 3 : v));
}

function setItemCount(value) {
  const n = Math.max(ITEM_COUNT_MIN, Math.min(ITEM_COUNT_MAX, Math.floor(Number(value)) || ITEM_COUNT_MIN));
  const input = document.getElementById('itemCountInput');
  const slider = document.getElementById('itemCountSlider');
  if (input) input.value = n;
  if (slider) slider.value = n;
  return n;
}

function getLetterCount() {
  const input = document.getElementById('letterCountInput');
  const slider = document.getElementById('letterCountSlider');
  const v = input ? parseInt(input.value, 10) : (slider ? parseInt(slider.value, 10) : 1);
  return Math.max(LETTER_COUNT_MIN, Math.min(LETTER_COUNT_MAX, isNaN(v) ? 1 : v));
}

function setLetterCount(value) {
  const n = Math.max(LETTER_COUNT_MIN, Math.min(LETTER_COUNT_MAX, Math.floor(Number(value)) || LETTER_COUNT_MIN));
  const input = document.getElementById('letterCountInput');
  const slider = document.getElementById('letterCountSlider');
  if (input) input.value = n;
  if (slider) slider.value = n;
  return n;
}

const PREVIEW_PAGE_GUIDE_STYLE = `
/* Mehrseitige Vorschau: sichtbare Seitenumbrüche (A4-Höhe 297mm) */
body.mahnstudio-preview { position: relative; min-height: 297mm; }
/* Simulierter Seitenumbruch: jeder Brief mindestens eine A4-Seite hoch; Bezug für Header/Footer */
.mahnstudio-preview-page { position: relative; min-height: 297mm; }
/* In der Vorschau: Header/Footer pro Seite (nicht fixed ans Ende), über der Seitenlinie */
body.mahnstudio-preview .page-header {
  position: absolute; top: 0; left: 0; right: 0; z-index: 10000;
}
body.mahnstudio-preview .page-footer {
  position: absolute; bottom: 15.1mm; left: 0; right: 0; z-index: 10000;
}
body.mahnstudio-preview::after {
  content: '';
  position: absolute;
  top: 0; bottom: 0;
  left: 0;
  width: 100vw;
  pointer-events: none;
  z-index: 9999;
  background: linear-gradient(to bottom,
    transparent 296mm,
    rgba(0,0,0,0.12) 296mm,
    rgba(0,0,0,0.12) 297mm,
    transparent 297mm);
  background-size: 100% 297mm;
  background-repeat: repeat-y;
}
`;

/** Wert wie "20mm" oder "0.1mm" in Zahl (mm) umrechnen. */
function parseMm(value) {
  if (!value || typeof value !== 'string') return 0;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Liest aus dem Template-CSS die @page-Margins aus und liefert Padding-String sowie
 * die passende Body-Breite (210mm − links − rechts), damit der Inhaltsbereich korrekt bleibt.
 */
function getPreviewPaddingFromPageMargins(cssContent) {
  const pageMatch = cssContent.match(/@page\s*\{([^}]+)\}/s);
  if (!pageMatch) return null;
  const block = pageMatch[1];
  let top = null, right = null, bottom = null, left = null;

  const longhand = (name) => {
    const m = block.match(new RegExp(`${name}\\s*:\\s*([^;]+)`, 'i'));
    return m ? m[1].trim().replace(/\s*\/\*.*?\*\//g, '').trim() : null;
  };
  top = longhand('margin-top');
  right = longhand('margin-right');
  bottom = longhand('margin-bottom');
  left = longhand('margin-left');

  if (!top || !right || !bottom || !left) {
    const shorthand = block.match(/margin\s*:\s*([^;]+)/i);
    if (shorthand) {
      const parts = shorthand[1]
        .replace(/\s*\/\*.*?\*\//g, '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      if (parts.length === 4) {
        top = parts[0]; right = parts[1]; bottom = parts[2]; left = parts[3];
      } else if (parts.length === 3) {
        top = parts[0]; left = right = parts[1]; bottom = parts[2];
      } else if (parts.length === 2) {
        top = bottom = parts[0]; left = right = parts[1];
      } else if (parts.length === 1) {
        top = right = bottom = left = parts[0];
      }
    }
  }

  if (!top || !right || !bottom || !left) return null;

  const padding = `${top} ${right} ${bottom} ${left}`;
  const leftMm = parseMm(left);
  const rightMm = parseMm(right);
  const topMm = parseMm(top);
  const bottomMm = parseMm(bottom);
  // Basis-Template: @page left=0, body ist 170mm → Breite = 210−rechts, damit Inhalt 170mm bleibt.
  // Andere Templates: volle Seitenbreite, Padding bildet die Ränder.
  const widthMm = leftMm === 0 ? 210 - rightMm : 210;
  // Footer in der Vorschau: Abstand unten = margin-bottom + margin-top (wie Druckseite)
  const footerBottomOffsetMm = topMm + bottomMm;
  return { padding, widthMm, footerBottomOffsetMm };
}

function buildPreviewDocument(htmlContent, cssContent) {
  const escapedCss = cssContent
    .replace(/<\/style>/gi, '\\3C/style>')
    .replace(/<!--/g, '\\3C!--');

  const pageStyle = getPreviewPaddingFromPageMargins(cssContent);
  const previewPaddingStyle =
    pageStyle
      ? `body.mahnstudio-preview { width: ${pageStyle.widthMm}mm; padding: ${pageStyle.padding}; box-sizing: border-box; }\nbody.mahnstudio-preview .page-footer { bottom: ${pageStyle.footerBottomOffsetMm}mm; }\n`
      : '';

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8"/>
  <style>${escapedCss}</style>
  <style>${previewPaddingStyle.replace(/<\/style>/gi, '\\3C/style>')}${PREVIEW_PAGE_GUIDE_STYLE.replace(/<\/style>/gi, '\\3C/style>')}</style>
</head>
<body class="mahnstudio-preview">${htmlContent}</body>
</html>`;
}

function updatePreview() {
  const iframe = document.getElementById('previewFrame');
  if (!iframe) return;
  const rawHtml = getHtmlContent();
  const itemCount = getItemCount();
  const letterCount = getLetterCount();
  const sampleData = getDefaultSampleData(itemCount, letterCount);
  sampleData.branches = { ...sampleData.branches, ...getCurrentBranches() };
  let processedHtml = '';
  for (let i = 0; i < letterCount; i++) {
    const letterData = { branches: sampleData.branches, ...sampleData.letters[i] };
    const letterHtml = processDocument(rawHtml, letterData, itemCount);
    processedHtml += `<div class="mahnstudio-preview-page">${letterHtml}</div>`;
  }
  const doc = buildPreviewDocument(processedHtml, getCssContent());

  const onLoad = () => {
    iframe.removeEventListener('load', onLoad);
    try {
      const docEl = iframe.contentDocument?.documentElement;
      if (docEl) {
        iframe.style.height = `${docEl.scrollHeight}px`;
      }
    } catch (_) {}
  };
  iframe.addEventListener('load', onLoad);
  iframe.srcdoc = doc;
}

function openPrintDialog() {
  const rawHtml = getHtmlContent();
  const itemCount = getItemCount();
  const letterCount = getLetterCount();
  const sampleData = getDefaultSampleData(itemCount, letterCount);
  sampleData.branches = { ...sampleData.branches, ...getCurrentBranches() };
  let processedHtml = '';
  for (let i = 0; i < letterCount; i++) {
    const letterData = { branches: sampleData.branches, ...sampleData.letters[i] };
    processedHtml += processDocument(rawHtml, letterData, itemCount);
  }
  let doc = buildPreviewDocument(processedHtml, getCssContent());
  doc = doc.replace(/\s*class="mahnstudio-preview"/, '');

  const w = window.open('', '_blank');
  if (!w) return;
  w.document.open();
  w.document.write(doc);
  w.document.close();
  w.focus();
  w.print();
  w.onafterprint = () => w.close();
}

function schedulePreview() {
  const live = document.getElementById('livePreview');
  if (live && !live.checked) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(updatePreview, DEBOUNCE_MS);
}

function setEditorContent(view, content) {
  if (!view) return;
  const len = view.state.doc.length;
  view.dispatch({ changes: { from: 0, to: len, insert: content } });
}

function loadTemplate(template) {
  if (!template) return;
  setEditorContent(editorHtmlView, template.html);
  setEditorContent(editorCssView, template.css);
  updatePreview();
}

function switchTab(tabName) {
  document.querySelectorAll('.editors-tabs .tab').forEach((t) => t.classList.remove('active'));
  document.querySelectorAll('.editor-wrap').forEach((w) => w.classList.remove('active'));
  const tab = document.querySelector(`.editors-tabs .tab[data-tab="${tabName}"]`);
  const wrap = document.getElementById(`wrap${tabName === 'html' ? 'Html' : 'Css'}`);
  if (tab) tab.classList.add('active');
  if (wrap) wrap.classList.add('active');
}

function setupTabs() {
  document.querySelectorAll('.editors-tabs .tab[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function setupEditors() {
  const parentHtml = document.getElementById('editorHtml');
  const parentCss = document.getElementById('editorCss');
  if (!parentHtml || !parentCss) return;

  const initialHtml = templates.length > 0 ? templates[0].html : '<p>Kein Template geladen.</p>';
  const initialCss = templates.length > 0 ? templates[0].css : '';

  editorHtmlView = new EditorView({
    doc: initialHtml,
    parent: parentHtml,
    extensions: [
      germanPhrasesExtension,
      basicSetup,
      html(),
      lineWrapping,
      htmlLintExtension,
      reindentKeymapHTML,
      kohaPlaceholderHighlight,
      kohaPlaceholderAutocomplete,
      EditorView.updateListener.of((u) => {
        if (u.docChanged) schedulePreview();
      }),
    ],
  });

  editorCssView = new EditorView({
    doc: initialCss,
    parent: parentCss,
    extensions: [
      germanPhrasesExtension,
      basicSetup,
      css(),
      lineWrapping,
      reindentKeymap,
      kohaPlaceholderHighlight,
      EditorView.updateListener.of((u) => {
        if (u.docChanged) schedulePreview();
      }),
    ],
  });
}

function setupTemplateSelect() {
  const select = document.getElementById('templateSelect');
  if (!select) return;

  templates.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    select.appendChild(opt);
  });

  let previousTemplateId = select.value;

  select.addEventListener('change', () => {
    const newId = select.value;
    const t = templates.find((tpl) => tpl.id === newId);
    if (!t) return;

    const overwrite = window.confirm(
      'Template wechseln? Der aktuelle HTML- und CSS-Inhalt in den Editoren wird überschrieben und geht verloren.'
    );
    if (!overwrite) {
      select.value = previousTemplateId;
      return;
    }

    previousTemplateId = newId;
    loadTemplate(t);
  });
}

function setupItemCountSync() {
  const slider = document.getElementById('itemCountSlider');
  const input = document.getElementById('itemCountInput');
  if (!slider || !input) return;

  const syncFromSlider = () => {
    setItemCount(slider.value);
    schedulePreview();
  };
  const syncFromInput = () => {
    const n = setItemCount(input.value);
    if (slider) slider.value = n;
    schedulePreview();
  };

  slider.addEventListener('input', syncFromSlider);
  input.addEventListener('change', syncFromInput);
  input.addEventListener('input', syncFromInput);
}

function setupLetterCountSync() {
  const slider = document.getElementById('letterCountSlider');
  const input = document.getElementById('letterCountInput');
  if (!slider || !input) return;

  const syncFromSlider = () => {
    setLetterCount(slider.value);
    schedulePreview();
  };
  const syncFromInput = () => {
    const n = setLetterCount(input.value);
    if (slider) slider.value = n;
    schedulePreview();
  };

  slider.addEventListener('input', syncFromSlider);
  input.addEventListener('change', syncFromInput);
  input.addEventListener('input', syncFromInput);
}

function setupBranchDialog() {
  const btn = document.getElementById('btnBranch');
  const dialog = document.getElementById('branchDialog');
  const form = document.getElementById('branchForm');
  const cancelBtn = document.getElementById('branchCancel');
  if (!btn || !dialog || !form) return;

  function fillForm() {
    const defaults = getDefaultSampleData(1, 1).branches;
    const data = { ...defaults, ...getCurrentBranches() };
    BRANCH_FIELD_IDS.forEach((id) => {
      const input = form.elements.namedItem(id);
      if (input) input.value = data[id] ?? '';
    });
    const persist = form.elements.namedItem('persist');
    if (persist) persist.checked = true;
  }

  btn.addEventListener('click', () => {
    fillForm();
    dialog.showModal();
  });

  cancelBtn.addEventListener('click', () => dialog.close());

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const obj = {};
    BRANCH_FIELD_IDS.forEach((id) => {
      const input = form.elements.namedItem(id);
      if (input) obj[id] = input.value.trim();
    });
    const persist = !!form.elements.namedItem('persist')?.checked;
    setCurrentBranches(obj, persist);
    updatePreview();
    dialog.close();
  });
}

function copyCurrentEditorContent() {
  const activeTab = document.querySelector('.editors-tabs .tab.active');
  if (!activeTab) return;

  const isHtmlTab = activeTab.dataset.tab === 'html';
  const content = isHtmlTab ? getHtmlContent() : getCssContent();

  if (!content) return;

  navigator.clipboard.writeText(content).then(() => {
    const toast = document.createElement('div');
    toast.className = 'copy-toast';
    toast.textContent = isHtmlTab ? 'HTML kopiert!' : 'CSS kopiert!';
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 2000);
  }).catch((err) => {
    console.error('Kopieren fehlgeschlagen:', err);
    alert('Kopieren in Zwischenablage fehlgeschlagen. Bitte manuell kopieren.');
  });
}

function setupHeaderActions() {
  const btn = document.getElementById('btnRefreshPreview');
  if (btn) btn.addEventListener('click', updatePreview);
  const printBtn = document.getElementById('btnPrint');
  if (printBtn) printBtn.addEventListener('click', openPrintDialog);

  const btnCopyCode = document.getElementById('btnCopyCode');
  if (btnCopyCode) {
    btnCopyCode.addEventListener('click', copyCurrentEditorContent);
  }

  const btnReindentHtml = document.getElementById('btnReindentHtml');
  if (btnReindentHtml && editorHtmlView) {
    btnReindentHtml.addEventListener('click', () => {
      reindentSelectionHTML(editorHtmlView);
    });
  }

  const btnHtmlCheck = document.getElementById('btnHtmlCheck');
  const htmlCheckDialog = document.getElementById('htmlCheckDialog');
  const htmlCheckSummary = document.getElementById('htmlCheckSummary');
  const htmlCheckList = document.getElementById('htmlCheckList');
  const htmlCheckClose = document.getElementById('htmlCheckClose');
  if (btnHtmlCheck && htmlCheckDialog && htmlCheckSummary && htmlCheckList && htmlCheckClose) {
    btnHtmlCheck.addEventListener('click', () => {
      const html = getHtmlContent();
      const { diagnostics } = runHtmlDomCheck(html);
      htmlCheckSummary.textContent =
        diagnostics.length === 0
          ? 'Keine Probleme gefunden.'
          : `${diagnostics.length} ${diagnostics.length === 1 ? 'Hinweis' : 'Hinweise'} (bereinigtes HTML):`;
      htmlCheckList.innerHTML = '';
      diagnostics.forEach(({ line, message }) => {
        const li = document.createElement('li');
        li.textContent = `Zeile ${line}: ${message}`;
        htmlCheckList.appendChild(li);
      });
      htmlCheckDialog.showModal();
    });
    htmlCheckClose.addEventListener('click', () => htmlCheckDialog.close());
  }
}

function setupPrintShortcut() {
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
      e.preventDefault();
      openPrintDialog();
    }
  });
}

const SPLIT_STORAGE_KEY = 'mahnstudio.splitEditorWidth';

function setupResizer() {
  const main = document.getElementById('appMain');
  const resizer = document.getElementById('resizer');
  if (!main || !resizer) return;

  const minPct = 20;
  const maxPct = 85;

  try {
    const saved = localStorage.getItem(SPLIT_STORAGE_KEY);
    if (saved) {
      const pct = parseFloat(saved);
      if (!Number.isNaN(pct) && pct >= minPct && pct <= maxPct) {
        main.style.setProperty('--split-editor-width', `${pct}%`);
      }
    }
  } catch (_) {}

  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = main.offsetWidth;
    const startPct = (main.querySelector('.panel-editors').offsetWidth / startWidth) * 100;

    const onMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const pct = Math.min(maxPct, Math.max(minPct, startPct + (dx / startWidth) * 100));
      main.style.setProperty('--split-editor-width', `${pct}%`);
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      try {
        const pct = (main.querySelector('.panel-editors').offsetWidth / main.offsetWidth) * 100;
        localStorage.setItem(SPLIT_STORAGE_KEY, String(pct));
      } catch (_) {}
    };

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

export function initApp() {
  loadBranchesFromStorage();
  setupTabs();
  setupTemplateSelect();
  setupEditors();
  setupItemCountSync();
  setupLetterCountSync();
  setupResizer();
  setupBranchDialog();
  setupHeaderActions();
  setupPrintShortcut();
  updatePreview();
}
