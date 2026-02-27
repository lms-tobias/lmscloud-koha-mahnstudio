/**
 * Template-Liste für Mahnschreiben.
 * Weitere Templates: neuen Ordner unter examples/ anlegen, hier importieren und in templates pushen.
 */
import baseHtml from '../templates/basehtml.html?raw';
import baseCss from '../templates/basecss.css?raw';
import balingenHtml from '../examples/Balingen/template_balingen.html?raw';
import balingenCss from '../examples/Balingen/balingen.css?raw';
import uetersenHtml from '../examples/Uetersen/template_uetersen.html?raw';
import uetersenCss from '../examples/Uetersen/uetersen-css.css?raw';

export const templates = [
  { id: 'base', name: 'Basis (leer)', html: baseHtml, css: baseCss },
  { id: 'balingen', name: 'Balingen', html: balingenHtml, css: balingenCss },
  { id: 'uetersen', name: 'Uetersen', html: uetersenHtml, css: uetersenCss },
];
