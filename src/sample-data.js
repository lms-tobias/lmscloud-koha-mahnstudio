/**
 * Standard-SampleData für die Vorschau (ohne Zufallsgenerator).
 * Wird später um „Zufallsdaten erzeugen“ ergänzt.
 */

/** Beispieltitel in unterschiedlichen Längen für realistische Tabellenvorschau. */
const SAMPLE_TITLES = [
  'Goethe',
  'Die Leiden des jungen Werthers',
  'Grundlagen der Katalogisierung: Ein Handbuch für Bibliotheken und Öffentliche Einrichtungen',
  'Handbuch Bibliothek',
  'Bibliotheksmanagement: Strategie, Organisation, Personal und Technik in Öffentlichen und Wissenschaftlichen Bibliotheken',
  'Kurz',
  'Einführung in die systematische Bibliothekswissenschaft',
  'Lexikon des gesamten Buchwesens. Band 1: A–Buch',
  'Bd.',
  'Praktische Anleitung zur Erstellung von Mahnschreiben in Bibliotheken unter besonderer Berücksichtigung langer Medientitel',
  'IT',
  'Die Verwendung von Platzhaltern in Koha-Notices: <<biblio.title>> und verwandte Felder',
  'Roman',
];

function formatDate(d) {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${d.getFullYear()}`;
}

/**
 * Liefert SampleData mit genau count Einträgen in items/biblio/biblioitems/issues.
 * branches/borrowers/fines/total_fines/today mit Platzhalterwerten.
 */
export function getDefaultSampleData(count = 3) {
  const n = Math.max(0, Math.min(25, Math.floor(Number(count) || 0))) || 1;
  const items = [];
  const biblio = [];
  const biblioitems = [];
  const issues = [];

  for (let i = 0; i < n; i++) {
    const due = new Date();
    due.setDate(due.getDate() - 7 - i);
    items.push({
      barcode: `MED-${1000 + i}`,
      enumchron: i === 0 ? '' : `Bd. ${i}`,
      fine: `${(1.5 + i * 0.5).toFixed(2)} €`,
    });
    biblio.push({ title: SAMPLE_TITLES[i % SAMPLE_TITLES.length] });
    biblioitems.push({ volume: '', number: '' });
    issues.push({ date_due: due.toISOString().slice(0, 10) });
  }

  const finesSum = items.reduce((sum, it) => sum + parseFloat((it.fine || '0').replace(',', '.').replace(/[^\d.]/g, '')) || 0, 0);
  const finesStr = `${finesSum.toFixed(2)} €`;
  const totalFines = (finesSum + 2.5).toFixed(2) + ' €';

  return {
    branches: {
      branchname: 'Musterbibliothek',
      branchaddress1: 'Zentralbibliothek',
      branchaddress2: 'Musterstraße 1',
      branchzip: '12345',
      branchcity: 'Musterstadt',
      branchphone: '0123 / 456789',
      branchreplyto: 'info@example.com',
      branchurl: 'https://opac.example.com',
      opac_info: 'Öffnungszeiten: Mo–Fr 10–18 Uhr',
    },
    borrowers: {
      title: 'Herr',
      firstname: 'Max',
      surname: 'Mustermann',
      address: 'Leserstraße',
      streetnumber: '42',
      address2: '',
      zipcode: '54321',
      city: 'Leserstadt',
      cardnumber: 'L-12345',
    },
    items,
    biblio,
    biblioitems,
    issues,
    fines: finesStr,
    total_fines: totalFines,
    today: formatDate(new Date()),
  };
}
