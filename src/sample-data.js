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

/** Beispiel-Benutzer für mehrere Briefe (unterscheidbar in der Vorschau). */
const SAMPLE_BORROWERS = [
  { title: 'Herr', firstname: 'Max', surname: 'Mustermann', address: 'Leserstraße', streetnumber: '42', address2: '', zipcode: '54321', city: 'Leserstadt', cardnumber: 'L-12345' },
  { title: 'Frau', firstname: 'Anna', surname: 'Beispiel', address: 'Büchergasse', streetnumber: '7', address2: '', zipcode: '54322', city: 'Leserstadt', cardnumber: 'L-12346' },
  { title: 'Herr', firstname: 'Peter', surname: 'Test', address: 'Medienweg', streetnumber: '15', address2: '2. OG', zipcode: '54323', city: 'Musterstadt', cardnumber: 'L-12347' },
  { title: 'Frau', firstname: 'Lisa', surname: 'Muster', address: 'Bibliotheksplatz', streetnumber: '1', address2: '', zipcode: '54324', city: 'Musterstadt', cardnumber: 'L-12348' },
  { title: 'Herr', firstname: 'Thomas', surname: 'Leser', address: 'Buchstraße', streetnumber: '99', address2: '', zipcode: '54325', city: 'Leserstadt', cardnumber: 'L-12349' },
];

/**
 * Erzeugt die Daten für einen einzelnen Brief (items/biblio/borrowers/fines usw.).
 */
function buildLetterData(itemCount, borrowerIndex) {
  const n = Math.max(0, Math.min(25, Math.floor(Number(itemCount) || 0))) || 1;
  const items = [];
  const biblio = [];
  const biblioitems = [];
  const issues = [];

  for (let i = 0; i < n; i++) {
    const due = new Date();
    due.setDate(due.getDate() - 7 - i);
    items.push({
      barcode: `MED-${1000 + borrowerIndex * 100 + i}`,
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

  const borrower = SAMPLE_BORROWERS[borrowerIndex % SAMPLE_BORROWERS.length];

  return {
    borrowers: { ...borrower },
    items,
    biblio,
    biblioitems,
    issues,
    fines: finesStr,
    total_fines: totalFines,
    today: formatDate(new Date()),
  };
}

/**
 * Liefert SampleData mit branches und letters: [ letterData1, letterData2, ... ].
 * Jedes letterData hat borrowers, items, biblio, biblioitems, issues, fines, total_fines, today.
 * count = Anzahl Medien pro Brief, letterCount = Anzahl Briefe (Benutzer).
 */
export function getDefaultSampleData(count = 3, letterCount = 1) {
  const numLetters = Math.max(1, Math.min(10, Math.floor(Number(letterCount) || 0))) || 1;
  const letters = [];

  for (let i = 0; i < numLetters; i++) {
    letters.push(buildLetterData(count, i));
  }

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
    letters,
  };
}
