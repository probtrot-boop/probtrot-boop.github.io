/* ============================================================================
   pdf.js – Rider als PDF (2 Seiten A4, Vektor, Schriften eingebettet)
   ----------------------------------------------------------------------------
   Zweck:     Zeichnet beide Seiten frisch (ohne Auswahlrahmen) in einen
              unsichtbaren Container und überträgt sie mit svg2pdf in jsPDF.
   Annahmen:  lib/jspdf.umd.min.js (jsPDF 4.2.1) und lib/svg2pdf.umd.min.js
              (svg2pdf.js 2.9.0) liegen als eigene Dateien im Artefakt und
              werden erst beim ersten Export geladen.
   Einheiten: PDF in pt; A4 = 595.28 x 841.89 pt; Seiten-SVG 793.7 x 1122.5
              CSS-px -> Faktor 0.75 pt/px (svg2pdf skaliert über width/height).
   ========================================================================== */
'use strict';

/* Schriftdateien für jsPDF: [Datei, Familienname wie im SVG, Stil] */
const PDF_FONTS = [
  ['RiderText-Regular.ttf', 'RiderText', 'normal'],
  ['RiderText-Bold.ttf',    'RiderText', 'bold'],
  ['RiderPlan-Regular.ttf', 'RiderPlan', 'normal'],
  ['RiderPlan-Bold.ttf',    'RiderPlan', 'bold']
];
const A4_PT = { w:595.28, h:841.89 };                      // A4 in Punkt

/* ===== Laden: Skript einmalig nachladen ===== */
function loadScriptOnce(src){
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-src="${src}"]`)) return resolve();   // schon geladen
    const s = document.createElement('script');
    s.src = src; s.dataset.src = src;                     // Quelle merken
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Bibliothek nicht ladbar: ' + src));
    document.head.appendChild(s);                         // Laden starten
  });
}
/* ===== Laden: Schriftdatei als base64 (jsPDF braucht base64-TTF) ===== */
async function fontAsBase64(file){
  const r = await fetch('fonts/' + file);
  if (!r.ok) throw new Error('Schrift fehlt: ' + file);
  const bytes = new Uint8Array(await r.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); // in Blöcken (Stapelgrenze)
  return btoa(bin);
}

/* ===== Erzeugen: PDF aus einem Stand -> Blob ===== */
async function buildRiderPdf(st){
  await loadScriptOnce('lib/jspdf.umd.min.js');
  await loadScriptOnce('lib/svg2pdf.umd.min.js');
  const jsPDF = window.jspdf && window.jspdf.jsPDF;
  const svg2pdf = window.svg2pdf && (window.svg2pdf.svg2pdf || window.svg2pdf);
  if (!jsPDF || typeof svg2pdf !== 'function') throw new Error('PDF-Bibliothek nicht verfügbar');

  const doc = new jsPDF({ unit:'pt', format:'a4', orientation:'portrait', compress:true });
  for (const [file, fam, style] of PDF_FONTS) {
    doc.addFileToVFS(file, await fontAsBase64(file));     // Schrift in den virtuellen Speicher
    doc.addFont(file, fam, style);                         // unter SVG-Familiennamen registrieren
  }
  /* Unsichtbarer Container: Seiten neu zeichnen, ohne Auswahl/Trefferflächen */
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-20000px;top:0;width:794px;pointer-events:none';
  document.body.appendChild(host);
  try {
    const mk = () => el('svg', { xmlns:SVGNS, width:PAGE.w, height:PAGE.h }, host);
    const s1 = mk(); renderPage1(s1, st);
    const s2 = mk(); renderPage2(s2, st, { interactive:false });
    await svg2pdf(s1, doc, { x:0, y:0, width:A4_PT.w, height:A4_PT.h });   // Seite 1
    doc.addPage('a4', 'portrait');
    await svg2pdf(s2, doc, { x:0, y:0, width:A4_PT.w, height:A4_PT.h });   // Seite 2
  } finally {
    host.remove();                                         // Container immer entfernen
  }
  doc.setProperties({ title:`${st.meta.band} – ${st.meta.subtitle}`, subject:`Stand ${st.meta.stand}`, creator:'Rider-Editor' });
  return doc.output('blob');
}

/* Dateiname: Bandname + Datum (JJJJ-MM-TT) */
function pdfFileName(st){
  const d = new Date();
  const ymd = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const band = String(st.meta.band || 'Rider').replace(/[^\wÄÖÜäöüéè-]+/g, '_').replace(/^_+|_+$/g, '');
  return `${band}_Technischer_Rider_${ymd}.pdf`;
}
