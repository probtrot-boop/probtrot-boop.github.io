/* ============================================================================
   editor.js – Bedienung des Rider-Editors
   ----------------------------------------------------------------------------
   Zweck:     Auswahl und Verschieben von Bühnenelementen (Maus + Finger),
              Instrumente an/aus, Eigenschaften, Texte, Rückgängig,
              Speichern (Artefakt-Datei data/rider.json), Entwurf (lokal),
              Import/Export (JSON), PDF-Download.
   Annahmen:  - core.js und pdf.js sind vorher geladen.
              - Im Claude-Artefakt: claude.use('artifact') speichert
                data/rider.json (Dateiform, Seite lädt nicht neu);
                claude.use('downloads') bietet Dateien zum Download an.
              - Ausserhalb (lokal) gibt es nur den Entwurf im Browser und
                normale Downloads.
              - Datenquelle (Auswahlstelle in loadState): data/rider.json
                (Klartext, privates Artefakt) -> sonst data/rider.enc.json
                (verschlüsselt, GitHub; Passwortabfrage) -> sonst Standard.
   Neu v2.1:  Leere Bühnenfläche antippen (ohne Auswahl) öffnet dasselbe Menü
              direkt an dieser Stelle; das Element wird genau dort eingefügt.
   Neu v2:    «＋ Hinzufügen» direkt über dem Bühnenplan (fügt in der sichtbaren
              Planmitte ein), 🎧-Knopf in der Auswahlleiste (In-Ear aus/Funk/
              wired je Musiker), Personen-Nr. im Panel, Besetzung automatisch.
   Umfang:    Alle Bedien-Panels; Darstellung selbst in core.js.
   ========================================================================== */
'use strict';

/* ===== ZUSTAND ===== */
let state = clone(DEFAULT_STATE);      // aktueller Rider-Stand
let selectedId = null;                 // gewähltes Bühnenelement
let savedJSON = '';                    // Stand der Datei data/rider.json (für "ungespeichert")
let savedAt = null;                    // Zeitpunkt der letzten Speicherung (aus der Datei)
const undoStack = [], redoStack = [];  // Schnappschüsse als JSON-Text (max. 100)
let capArtifact = null;                // Speichern im Artefakt (null = nicht verfügbar)
let capDownloads = null;               // Downloads im Artefakt (null = nicht verfügbar)
let inClaude = false;                  // läuft als Claude-Artefakt?
let readOnly = false;                  // Speichern verweigert (nur Lesezugriff)
let drag = null;                       // laufender Zieh-Vorgang
let dataMode = 'default';              // Datenquelle: 'plain' (Artefakt) | 'enc' (GitHub, Passwort) | 'default'
let encKey = null, encSalt = null, encIter = ENC_ITER; // Schlüssel des verschlüsselten Stands (nur im Speicher)
let downOnItem = false;                // letzter Druck traf ein Element (Klick danach nicht als 'leere Fläche' werten)
const DRAFT_KEY = 'watm-rider-draft-v1';
const GRID = 5;                        // Raster in Planeinheiten (PE)
const STAGE_CENTER = { x:355, y:400 }; // Einfügepunkt neuer Elemente (PE)
let viewMode = window.innerWidth < 700 ? 'stage' : 'page';   // Ansicht Bühnenplan: Handy startet mit 'Bühne'
/* Ausschnitt 'Bühne' in Seiten-px: Bühnenplan 87..706 x 103..811 plus Rand */
const STAGE_VIEWBOX = '80 98 634 718';

/* ===== KLEINHELFER ===== */
function clone(o){ return JSON.parse(JSON.stringify(o)); }
function $(sel){ return document.querySelector(sel); }
function h(tag, props, ...kids){                            // HTML-Element bauen
  const e = document.createElement(tag);
  for (const k in (props || {})) {
    if (k === 'class') e.className = props[k];
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), props[k]);   // Ereignis anhängen
    else if (k in e && k !== 'list') e[k] = props[k];                         // Eigenschaft setzen
    else e.setAttribute(k, props[k]);                                         // sonst Attribut
  }
  kids.flat().forEach(c => { if (c != null) e.append(c.nodeType ? c : document.createTextNode(String(c))); });
  return e;
}
function sj(){ return JSON.stringify(state); }
function getItem(id){ return state.stage.find(i => i.id === id); }
function newId(prefix){ return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
function toast(msg, ms){
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms || 2600);   // ausblenden
}
function itemName(it){
  if (!it) return '';
  if (it.type === 'label') return (it.lines && it.lines[0]) || 'Beschriftung';
  const ins = it.group && findInstr(state, it.group);
  return (TYPE_NAMES[it.type] || it.type) + (ins ? ' · ' + ins.name : '');
}
/* Zweistufiger Knopf (statt confirm, das im Artefakt gesperrt ist) */
function armButton(btn, armedText, action){
  btn.addEventListener('click', () => {
    if (btn.classList.contains('armed')) { btn.classList.remove('armed'); btn.textContent = btn.dataset.txt; action(); return; }
    btn.dataset.txt = btn.textContent; btn.textContent = armedText; btn.classList.add('armed');   // erst "scharf" schalten
    setTimeout(() => { if (btn.classList.contains('armed')) { btn.classList.remove('armed'); btn.textContent = btn.dataset.txt; } }, 4000);
  });
}

/* ===== STAND PRÜFEN: fehlende Felder aus dem Standard ergänzen ===== */
function normalize(d){
  const s = clone(DEFAULT_STATE);
  if (!d || typeof d !== 'object') return s;               // stiller Fallback: Standardstand
  s.meta = Object.assign(s.meta, d.meta || {});
  s.hint = Object.assign(s.hint, d.hint || {});
  s.powerNote = Object.assign(s.powerNote, d.powerNote || {});
  if (Array.isArray(d.instruments)) s.instruments = d.instruments;
  if (Array.isArray(d.drumSetup)) s.drumSetup = d.drumSetup;
  if (Array.isArray(d.stage)) s.stage = d.stage.map(it => Object.assign({ r:0, s:1, group:null }, it)); // Pflichtwerte setzen
  if (Array.isArray(d.contacts)) s.contacts = d.contacts;
  /* Migration v1 -> v2: Textzeilen «Funk/wired In-Ear» (+ folgende «XLR…»-Zeile) werden zur Eigenschaft inEar */
  s.stage.forEach(it => {
    if (it.type !== 'label' || it.inEar !== undefined || !Array.isArray(it.lines)) return;   // schon umgestellt / keine Karte
    const i = it.lines.findIndex(t => /^(funk|wired)\s*in-?ear$/i.test(String(t).trim()));
    if (i < 1) return;                                     // Zeile 0 = Titel bleibt immer
    it.inEar = /^funk/i.test(String(it.lines[i]).trim()) ? 'funk' : 'wired';
    const n = (it.lines[i + 1] && /^xlr/i.test(String(it.lines[i + 1]).trim())) ? 2 : 1;  // XLR-Zeile gehört dazu
    it.lines.splice(i, n);                                 // Zeilen entfernen (werden automatisch gezeichnet)
  });
  /* Stände ohne Personen-Nr.: Standardnummern nach Karten-ID setzen (stiller Fallback, nur bekannte IDs) */
  if (!s.stage.some(it => it.person > 0)) s.stage.forEach(it => { if (it.type === 'label' && DEFAULT_PERSON[it.id]) it.person = DEFAULT_PERSON[it.id]; });
  s.version = DEFAULT_STATE.version;                       // Stand gilt ab jetzt als v2
  return s;
}

/* ============================================================================
   ÄNDERN + RÜCKGÄNGIG
   ========================================================================== */
/* Änderung ausführen; bei Unterschied Schnappschuss für Rückgängig ablegen */
function mutate(fn, opts){
  const before = sj();
  fn();                                                    // Änderung am Stand
  if (sj() === before) { renderPages(); return; }
  undoStack.push(before); if (undoStack.length > 100) undoStack.shift();  // Verlauf begrenzen
  redoStack.length = 0;                                    // Wiederholen verfällt
  afterChange(opts);
}
/* Nach jeder Änderung: Status, Entwurf, Darstellung */
function afterChange(opts){
  saveDraft();
  renderPages();
  if (!opts || opts.panels !== false) renderPanels();      // Panels nur neu, wenn nicht gerade getippt wird
}
function undo(){
  if (!undoStack.length) return;
  redoStack.push(sj()); state = JSON.parse(undoStack.pop());   // Stand zurückholen
  if (selectedId && !getItem(selectedId)) selectedId = null;    // Auswahl gelöscht? -> aufheben
  afterChange();
}
function redo(){
  if (!redoStack.length) return;
  undoStack.push(sj()); state = JSON.parse(redoStack.pop());
  if (selectedId && !getItem(selectedId)) selectedId = null;
  afterChange();
}

/* ============================================================================
   DARSTELLUNG
   ========================================================================== */
function renderPages(){
  renderPage2($('#page2'), state, { interactive:true, selectedId });
  if (viewMode !== 'page') $('#page2').setAttribute('viewBox', STAGE_VIEWBOX);   // nur Bühnenausschnitt zeigen
  renderPage1($('#page1'), state);
  renderChips();
  renderSelbar();
  renderStatus();
}
function renderPanels(){
  renderSelPane(); renderInstrPane(); renderDrumPane(); renderTextPane(); renderDataPane(); renderHelpPane();
}
function renderAll(){ renderPages(); renderPanels(); }

/* Statuszeile in der Kopfleiste */
function renderStatus(){
  const st = $('#status');
  const dirty = sj() !== savedJSON;
  st.classList.toggle('dirty', dirty);
  const when = savedAt ? new Date(savedAt).toLocaleString('de-CH', { dateStyle:'short', timeStyle:'short' }) : null;
  if (dataMode === 'enc') st.textContent = dirty ? '● eigene Änderungen (nur in diesem Browser)' : 'offizieller Stand' + (when ? ' vom ' + when : ' · ' + state.meta.stand);
  else if (dirty) st.textContent = inClaude && !readOnly ? '● ungespeicherte Änderungen' : '● lokaler Entwurf (nicht im Artefakt gespeichert)';
  else st.textContent = when ? 'gespeichert ' + when : 'Stand ' + state.meta.stand;
  $('#bUndo').disabled = !undoStack.length;
  $('#bRedo').disabled = !redoStack.length;
}

/* Instrument-Chips: Antippen schaltet an/aus */
function renderChips(){
  const box = $('#chips'); box.textContent = '';
  state.instruments.forEach(ins => box.append(h('button', {
    class:'chip' + (ins.on ? '' : ' off'), type:'button', title: ins.on ? 'eingeschaltet – antippen zum Abwählen' : 'abgewählt – antippen zum Einschalten',
    onclick: () => mutate(() => { ins.on = !ins.on; })     // Schalter umlegen
  }, ins.name)));
}

/* Leiste unten für das gewählte Element */
function renderSelbar(){
  const it = getItem(selectedId);
  $('#selbar').hidden = !it;
  if (!it) return;
  $('#selName').textContent = itemName(it);
  const ml = musicianLabel(it), b = $('#selInEar');        // Karte des Musikers (bei Symbolen über das Instrument)
  b.hidden = !ml;                                          // ohne zugehörige Karte kein In-Ear
  if (ml) {
    const ie = IN_EAR[ml.inEar];
    b.textContent = '🎧 ' + (ie ? ie.name : 'aus');        // aktueller Zustand sichtbar
    b.classList.toggle('on', !!ie);
    b.title = 'In-Ear für «' + labelTitle(ml) + '» – antippen: aus → Funk → wired';
  }
}
/* Karte des Musikers zu einem Element: die Karte selbst oder die erste Karte desselben Instruments */
function musicianLabel(it){
  if (!it) return null;
  if (it.type === 'label') return it;
  if (!it.group) return null;                              // allgemeines Element (z.B. Monitor ohne Instrument)
  return state.stage.find(x => x.type === 'label' && x.group === it.group) || null;
}
/* Nächste freie Personen-Nr. */
function nextPerson(){ return state.stage.reduce((m, x) => Math.max(m, x.person > 0 ? x.person : 0), 0) + 1; }

/* ============================================================================
   PANEL: Element hinzufügen
   ========================================================================== */
const ADD_TYPES = [
  ['monitor','Monitor'], ['mic','Mikrofon'], ['power','Strom'], ['amp','Verstärker'], ['di','DI-Box'],
  ['label','Beschriftung'], ['violin','Violine'], ['guitar','Gitarre'], ['accordion','Akkordeon'], ['drums','Schlagzeug']
];
function initAddPane(){
  const box = $('#addBtns');
  ADD_TYPES.forEach(([type, name]) => box.append(h('button', { type:'button', onclick: () => addFromMenu(type, name) }, name)));
}
/* Menü «＋ Hinzufügen» direkt über dem Bühnenplan */
function initAddMenu(){
  const menu = $('#addMenu'), btn = $('#bAdd');
  const close = () => { menu.hidden = true; btn.classList.remove('on'); btn.setAttribute('aria-expanded', 'false'); };
  ADD_TYPES.forEach(([type, name]) => menu.append(h('button', { type:'button', onclick: () => { close(); addFromMenu(type, name); } }, name)));
  btn.addEventListener('click', () => {
    addAt = null; menu.style.left = menu.style.top = menu.style.right = '';   // Knopf: Standardlage, Einfügen in Planmitte
    const open = menu.hidden;                              // Zustand umschalten
    menu.hidden = !open; btn.classList.toggle('on', open); btn.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('pointerdown', e => { if (!menu.hidden && !e.target.closest('#addMenu, #bAdd')) close(); });  // Tippen daneben schliesst
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) close(); });
}
/* Einfügen aus Menü/Panel: in der sichtbaren Mitte des Plans, Element ist danach gewählt */
let addAt = null;                                          // Einfügepunkt aus Tipp auf die Bühne (PE) oder null
let menuOpenAtDown = false;                                // Menü war beim Drücken offen (Tipp schliesst nur)
function addFromMenu(type, name){
  if (addAt) {                                             // Auswahlstelle: Tipp-Punkt hat Vorrang
    addItem(type, null, null, addAt); addAt = null;
    toast(name + ' hier eingefügt.');
    return;
  }
  addItem(type, null, null, freeSpot(viewCenter()));     // nicht genau auf ein bestehendes Element legen
  toast(name + ' eingefügt – an den Platz ziehen.');
}
/* Menü an der Tipp-Stelle öffnen (Position relativ zu .a-stage in CSS-px) */
function openAddMenuAt(evt){
  const menu = $('#addMenu'), box = document.querySelector('.a-stage').getBoundingClientRect();
  const p = toStage(evt);
  addAt = { x: Math.min(690, Math.max(20, snap(p.x))), y: Math.min(765, Math.max(45, snap(p.y))) };   // im Bühnenrahmen halten (PE)
  const w = Math.min(340, window.innerWidth - 24);         // Menübreite wie CSS
  menu.style.left = Math.max(0, Math.min(evt.clientX - box.left - w / 2, box.width - w)) + 'px';
  menu.style.right = 'auto';
  menu.style.top = (evt.clientY - box.top + 12) + 'px';    // knapp unter dem Finger
  menu.hidden = false; $('#bAdd').classList.add('on'); $('#bAdd').setAttribute('aria-expanded', 'true');
}
/* Mitte des sichtbaren Planausschnitts in PE (Ansicht «Bühne 2×» und Scrollen berücksichtigt) */
function viewCenter(){
  const root = document.getElementById('stageRoot'); if (!root) return STAGE_CENTER;
  const r = $('#stageSheet').getBoundingClientRect();
  const x0 = Math.max(r.left, 0), x1 = Math.min(r.right, window.innerWidth);       // sichtbarer Teil (Bildschirm-px)
  const y0 = Math.max(r.top, 56), y1 = Math.min(r.bottom, window.innerHeight);     // 56 px = Kopfleiste
  if (x1 - x0 < 40 || y1 - y0 < 40) return STAGE_CENTER;   // stiller Fallback: Plan nicht im Bild -> Bühnenmitte
  const p = toStage({ clientX:(x0 + x1) / 2, clientY:(y0 + y1) / 2 });
  return { x: Math.min(660, Math.max(50, snap(p.x))), y: Math.min(740, Math.max(70, snap(p.y))) };   // innerhalb des Bühnenrahmens halten
}
/* Freie Stelle nahe c: prüft Ringe im Abstand 50 PE, bis kein sichtbares Element näher als 45 PE liegt */
function freeSpot(c){
  const centers = state.stage.filter(it => isVisible(state, it)).map(it =>
    it.type === 'label' ? { x: it.x + (it.w || 90) / 2, y: it.y + 23 } : { x: it.x, y: it.y });   // Karte: Mitte ungefähr (Breite, 2 Zeilen)
  const free = p => p.x >= 50 && p.x <= 660 && p.y >= 70 && p.y <= 740 && centers.every(q => Math.hypot(q.x - p.x, q.y - p.y) >= 45);
  for (let ring = 0; ring <= 3; ring++) {                  // 0 = Ausgangspunkt, dann 50/100/150 PE entfernt
    const d = ring * 50;
    const cand = ring ? [[0,-d],[d,0],[0,d],[-d,0],[d,-d],[d,d],[-d,d],[-d,-d]] : [[0,0]];
    for (const [dx, dy] of cand) { const p = { x:c.x + dx, y:c.y + dy }; if (free(p)) return p; }
  }
  return c;                                                // stiller Fallback: alles belegt -> Ausgangspunkt
}
/* Neues Element (Standard: Bühnenmitte); wird gleich ausgewählt */
function addItem(type, group, extra, at){
  const c = at || STAGE_CENTER;                            // Einfügepunkt PE
  const it = Object.assign({ id:newId(type), type, x:c.x, y:c.y, r:0, s:1, group: group || null }, extra || {});
  if (type === 'label') { it.lines = it.lines || ['Neu', 'Details']; it.w = it.w || 90; it.x -= 45; it.y -= 23; }  // Label: linke obere Ecke
  if (type === 'amp') { it.w = 60; it.h = 40; }
  if (type === 'violin') it.s = 0.8;
  mutate(() => { state.stage.push(it); selectedId = it.id; });
  return it;
}

/* ============================================================================
   PANEL: Ausgewähltes Element
   ========================================================================== */
function renderSelPane(){
  const pane = $('#selPane'); pane.textContent = '';
  const it = getItem(selectedId);
  if (!it) { pane.append(h('p', { class:'muted' }, 'Kein Element gewählt. Element im Bühnenplan antippen.')); return; }
  pane.append(h('p', { class:'muted' }, 'Typ: ' + (TYPE_NAMES[it.type] || it.type)));
  /* Zugehörigkeit zu einem Instrument (steuert Ein-/Ausblenden) */
  const sel = h('select', { onchange: e => mutate(() => { it.group = e.target.value || null; }) },
    h('option', { value:'' }, '– allgemein (immer sichtbar) –'),
    state.instruments.map(i => h('option', { value:i.id, selected: it.group === i.id }, i.name)));
  pane.append(h('label', { class:'f' }, 'Gehört zu Instrument'), sel);
  /* In-Ear des Musikers (bei Symbolen: Karte desselben Instruments) */
  const ml = musicianLabel(it);
  if (ml) {
    const ieSel = h('select', { onchange: e => mutate(() => { if (e.target.value) ml.inEar = e.target.value; else delete ml.inEar; }) },
      h('option', { value:'', selected: !IN_EAR[ml.inEar] }, 'kein In-Ear'),
      Object.entries(IN_EAR).map(([k, v]) => h('option', { value:k, selected: ml.inEar === k }, v.name + ' In-Ear  (' + v.lines.join(' / ') + ')')));
    pane.append(h('label', { class:'f' }, 'In-Ear' + (ml !== it ? ' – Karte «' + labelTitle(ml) + '»' : '')), ieSel);
  }
  /* Personen-Nr. (gleiche Nr. = gleiche Person) */
  if (it.type === 'label') {
    const pn = bindEdit(h('input', { type:'text', inputMode:'numeric', placeholder:'leer = keine' }), () => it.person || '',
      v => { const n = parseInt(v, 10); if (n > 0) it.person = n; else delete it.person; });   // ungültig/leer -> Nr. entfernen
    pane.append(h('label', { class:'f' }, 'Personen-Nr. (gleiche Nr. = gleiche Person)'), pn);
  }
  /* Typabhängige Felder */
  if (it.type === 'label') {
    pane.append(h('label', { class:'f' }, 'Text (1. Zeile fett, je Zeile eine Angabe)'),
      fieldArea(() => (it.lines || []).join('\n'), v => { it.lines = v.split('\n').map(s => s.trimEnd()).filter((s, i, a) => s || i < a.length - 1); }));
    pane.append(h('label', { class:'f' }, 'Mindestbreite (Planeinheiten)'), fieldNum(() => it.w || 90, v => { it.w = Math.max(30, v); }));
  }
  if (it.type === 'monitor') pane.append(h('label', { class:'f' }, 'Aufschrift'), fieldText(() => it.text || 'Monitor', v => { it.text = v; }));
  if (it.type === 'amp') {
    pane.append(h('label', { class:'f' }, 'Aufschrift (optional)'), fieldText(() => it.text || '', v => { it.text = v; }));
    pane.append(h('div', { class:'row' },
      h('div', {}, h('label', { class:'f' }, 'Breite'), fieldNum(() => it.w, v => { it.w = Math.max(5, v); })),
      h('div', {}, h('label', { class:'f' }, 'Höhe'), fieldNum(() => it.h, v => { it.h = Math.max(5, v); }))));
  }
  /* Lage */
  pane.append(h('div', { class:'row' },
    h('div', {}, h('label', { class:'f' }, 'X'), fieldNum(() => +it.x.toFixed(1), v => { it.x = v; })),
    h('div', {}, h('label', { class:'f' }, 'Y'), fieldNum(() => +it.y.toFixed(1), v => { it.y = v; }))));
  pane.append(h('div', { class:'row' },
    h('div', {}, h('label', { class:'f' }, 'Drehung °'), fieldNum(() => it.r || 0, v => { it.r = normAngle(v); })),
    h('div', {}, h('label', { class:'f' }, 'Grösse %'), fieldNum(() => Math.round((it.s || 1) * 100), v => { it.s = Math.min(4, Math.max(0.2, v / 100)); }))));
  /* Reihenfolge und Aktionen */
  pane.append(h('div', { class:'row', style:'margin-top:10px' },
    h('button', { type:'button', onclick: () => moveLayer(it.id, +1) }, 'nach vorne'),
    h('button', { type:'button', onclick: () => moveLayer(it.id, -1) }, 'nach hinten')));
  const del = h('button', { type:'button', class:'danger' }, 'Element löschen');
  armButton(del, 'Wirklich löschen?', () => deleteItem(it.id));
  pane.append(h('div', { class:'row', style:'margin-top:6px' }, h('button', { type:'button', onclick: () => duplicateItem(it.id) }, 'Duplizieren'), del));
}
/* Ebene ändern (Position in der Zeichenreihenfolge) */
function moveLayer(id, dir){
  mutate(() => {
    const a = state.stage, i = a.findIndex(x => x.id === id), j = i + dir;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];                           // mit Nachbar tauschen
  });
}
function deleteItem(id){ mutate(() => { state.stage = state.stage.filter(x => x.id !== id); if (selectedId === id) selectedId = null; }); }
function duplicateItem(id){
  const src = getItem(id); if (!src) return;
  const cp = Object.assign(clone(src), { id:newId(src.type), x:src.x + 20, y:src.y + 20 });   // 20 PE versetzt
  if (cp.type === 'label' && cp.person > 0) cp.person = nextPerson();                       // Kopie = neue Person (Nr. im Panel änderbar)
  mutate(() => { state.stage.push(cp); selectedId = cp.id; });
}

/* ===== Eingabefelder mit Rückgängig pro Feld (Schnappschuss beim Fokus) ===== */
function bindEdit(input, get, set, parse){
  let before = null;
  input.value = get();
  input.addEventListener('focus', () => { before = sj(); });                 // Stand vor dem Tippen merken
  input.addEventListener('input', () => {
    const v = parse ? parse(input.value) : input.value;
    if (parse && !isFinite(v)) return;                     // ungültige Zahl: ignorieren
    set(v); saveDraft(); renderPages();                    // live in die Seiten übernehmen
  });
  input.addEventListener('change', () => {
    if (before !== null && before !== sj()) { undoStack.push(before); redoStack.length = 0; }  // ein Schritt pro Feldbearbeitung
    before = sj(); renderStatus();
  });
  return input;
}
function fieldText(get, set){ return bindEdit(h('input', { type:'text' }), get, set); }
function fieldArea(get, set){ return bindEdit(h('textarea', {}), get, set); }
function fieldNum(get, set){ return bindEdit(h('input', { type:'number', step:'any', inputMode:'decimal' }), get, set, v => parseFloat(String(v).replace(',', '.'))); }
function fieldPath(path, area){                            // Feld für einen Pfad im Stand, z.B. 'meta.stand'
  const ks = path.split('.');
  const get = () => ks.reduce((o, k) => o == null ? '' : o[k], state) ?? '';
  const set = v => { const last = ks[ks.length - 1]; ks.slice(0, -1).reduce((o, k) => o[k], state)[last] = v; };
  return area ? fieldArea(get, set) : fieldText(get, set);
}

/* ============================================================================
   PANEL: Instrumente verwalten
   ========================================================================== */
function renderInstrPane(){
  const pane = $('#instrPane'); pane.textContent = '';
  pane.append(h('p', { class:'muted' }, 'Haken = im Rider. «Tabellenzeile» fasst Instrumente in der Übersicht zusammen (z.B. Vocal 1–3 → «Vocals 3»). Reihenfolge = Reihenfolge der Tabelle.'));
  const dl = h('datalist', { id:'tableNames' }, [...new Set(state.instruments.map(i => i.table))].map(t => h('option', { value:t })));
  pane.append(dl);
  const list = h('div', { class:'list' });
  state.instruments.forEach((ins, idx) => {
    const n = state.stage.filter(x => x.group === ins.id).length;      // zugeordnete Bühnenelemente
    const del = h('button', { type:'button', class:'danger fix', title:'Instrument mit seinen Bühnenelementen löschen' }, '🗑');
    armButton(del, 'löschen?', () => mutate(() => {
      state.instruments = state.instruments.filter(x => x.id !== ins.id);  // Instrument entfernen
      state.stage = state.stage.filter(x => x.group !== ins.id);           // seine Elemente entfernen
      if (selectedId && !getItem(selectedId)) selectedId = null;
    }));
    const chk = h('input', { type:'checkbox', checked:ins.on, title:'im Rider', onchange: e => mutate(() => { ins.on = e.target.checked; }) });
    const tbl = fieldText(() => ins.table, v => { ins.table = v; }); tbl.setAttribute('list', 'tableNames'); tbl.placeholder = 'Tabellenzeile';
    list.append(h('div', { class:'irow' },
      chk, fieldText(() => ins.name, v => { ins.name = v; }), del,
      h('div', { class:'sub row' }, tbl,
        h('button', { type:'button', class:'fix', title:'nach oben', disabled: idx === 0, onclick: () => mutate(() => swap(state.instruments, idx, idx - 1)) }, '↑'),
        h('button', { type:'button', class:'fix', title:'nach unten', disabled: idx === state.instruments.length - 1, onclick: () => mutate(() => swap(state.instruments, idx, idx + 1)) }, '↓')),
      h('div', { class:'sub muted' }, n + ' Element(e) im Bühnenplan')));
  });
  pane.append(list, h('hr', { class:'sep' }));
  /* Neues Instrument: legt Beschriftung (+ optional Symbol) in Bühnenmitte an */
  const nName = h('input', { type:'text', placeholder:'z.B. Cello' });
  const nTable = h('input', { type:'text', placeholder:'Tabellenzeile (leer = Name)' }); nTable.setAttribute('list', 'tableNames');
  const nDetail = h('input', { type:'text', placeholder:'z.B. DI-Box / Mikrofon' });
  const nSym = h('select', {}, h('option', { value:'' }, 'nur Beschriftung'), ADD_TYPES.filter(t => t[0] !== 'label').map(([t, n]) => h('option', { value:t }, '+ ' + n)));
  pane.append(h('b', {}, 'Instrument hinzufügen'),
    h('label', { class:'f' }, 'Name'), nName,
    h('label', { class:'f' }, 'Tabellenzeile'), nTable,
    h('label', { class:'f' }, 'Zweite Zeile im Bühnenplan'), nDetail,
    h('label', { class:'f' }, 'Symbol'), nSym,
    h('button', { type:'button', class:'primary', style:'margin-top:10px;width:100%', onclick: () => {
      const name = nName.value.trim();
      if (!name) { toast('Bitte einen Namen eingeben.'); nName.focus(); return; }
      const id = newId('ins');
      mutate(() => {
        state.instruments.push({ id, name, table: nTable.value.trim() || name, on:true });     // Instrument anlegen
        const lab = { id:newId('label'), type:'label', x:STAGE_CENTER.x - 45, y:STAGE_CENTER.y + 30, r:0, s:1, group:id, w:90, person:nextPerson(),
          lines: nDetail.value.trim() ? [name, nDetail.value.trim()] : [name] };
        if (nSym.value) state.stage.push({ id:newId(nSym.value), type:nSym.value, x:STAGE_CENTER.x, y:STAGE_CENTER.y, r:0, s: nSym.value === 'violin' ? 0.8 : 1, group:id,
          ...(nSym.value === 'amp' ? { w:60, h:40 } : {}) });                                    // optionales Symbol
        state.stage.push(lab); selectedId = lab.id;        // Beschriftung zuoberst und gewählt
      });
      toast('«' + name + '» in Bühnenmitte eingefügt – an den Platz ziehen.');
    } }, 'Hinzufügen'));
}
function swap(a, i, j){ if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; }

/* ============================================================================
   PANEL: Schlagzeug-Setup
   ========================================================================== */
function renderDrumPane(){
  const pane = $('#drumPane'); pane.textContent = '';
  pane.append(h('p', { class:'muted' }, 'Erscheint auf Seite 1, solange das Schlagzeug eingeschaltet ist.'));
  const list = h('div', { class:'list' });
  state.drumSetup.forEach((row, i) => {
    const del = h('button', { type:'button', class:'danger', title:'Zeile löschen', onclick: () => mutate(() => { state.drumSetup.splice(i, 1); }) }, '✕');
    list.append(h('div', { class:'drow' },
      fieldText(() => row[0], v => { row[0] = v; }),
      fieldNum(() => row[1], v => { row[1] = Math.max(0, Math.round(v)); }), del));
  });
  pane.append(list, h('button', { type:'button', style:'margin-top:8px', onclick: () => mutate(() => { state.drumSetup.push(['Neu', 1]); }) }, '+ Zeile'));
}

/* ============================================================================
   PANEL: Texte & Kontakte
   ========================================================================== */
function renderTextPane(){
  const pane = $('#textPane'); pane.textContent = '';
  const F = (lbl, path, area) => pane.append(h('label', { class:'f' }, lbl), fieldPath(path, area));
  F('Kopf: Kicker', 'meta.kicker'); F('Bandname', 'meta.band'); F('Untertitel', 'meta.subtitle');
  const auto = state.meta.besetzungAuto !== false, ps = personSummary(state);
  pane.append(h('label', { class:'row', style:'margin-top:10px' },
    h('input', { type:'checkbox', class:'chk fix', checked:auto, onchange: e => mutate(() => { state.meta.besetzungAuto = e.target.checked; }) }),
    h('span', {}, 'Besetzung automatisch aus den Personen-Nr. im Plan')));
  if (auto && ps) pane.append(h('p', { class:'muted', style:'margin:4px 0 0' }, 'Besetzung: ' + ps.text));
  else F('Besetzung (eigener Text)', 'meta.besetzung');     // von Hand oder keine Nr. vergeben
  F('Stromnorm', 'meta.strom'); F('Stand', 'meta.stand');
  pane.append(h('hr', { class:'sep' }),
    h('label', { class:'row' }, h('input', { type:'checkbox', class:'chk fix', checked: state.hint.on, onchange: e => mutate(() => { state.hint.on = e.target.checked; }) }), h('b', {}, 'Hinweisbox unter dem Kopf (Seite 1)')));
  F('Hinweis: Titel', 'hint.title'); F('Hinweis: Text', 'hint.text', true);
  pane.append(h('hr', { class:'sep' }));
  F('Stromhinweis: Titel', 'powerNote.title'); F('Stromhinweis: Text', 'powerNote.text', true);
  pane.append(h('hr', { class:'sep' }), h('b', {}, 'Kontakte (Seite 2 unten)'));
  state.contacts.forEach((c, i) => {
    const del = h('button', { type:'button', class:'danger fix', onclick: () => mutate(() => { state.contacts.splice(i, 1); }) }, '✕');
    pane.append(h('div', { class:'row', style:'margin-top:8px' }, fieldText(() => c.role, v => { c.role = v; }), del),
      h('div', { style:'margin-top:4px' }, fieldText(() => c.text, v => { c.text = v; })));
  });
  pane.append(h('button', { type:'button', style:'margin-top:8px', onclick: () => mutate(() => { state.contacts.push({ role:'Kontakt:', text:'Name · Telefon · E-Mail' }); }) }, '+ Kontakt'));
}

/* ============================================================================
   PANEL: Anleitung (Text je nach Datenquelle)
   ========================================================================== */
function renderHelpPane(){
  const pane = $('#helpPane'); pane.textContent = '';
  const steps = [
    'Instrumente oben antippen = an/aus. Wirkt auf Bühnenplan und Instrumentenübersicht.',
    'Element im Bühnenplan antippen = auswählen, ziehen = verschieben. Leiste unten: drehen, Grösse, bearbeiten, duplizieren, löschen.',
    'Neuer Monitor, Mikrofon, Strom usw.: «＋ Hinzufügen» über dem Plan → erscheint in der Mitte des sichtbaren Plans, dann an den Platz ziehen.',
    'Oder direkt: leere Bühnenfläche antippen → Element wählen → es erscheint genau an dieser Stelle.',
    'In-Ear: Musiker (Karte oder Symbol) antippen → 🎧 in der Leiste antippen: aus → Funk → wired.',
    'Goldene Nummer = Person. Gleiche Nummer auf zwei Karten = eine Person mit zwei Instrumenten (Nummer unter «Ausgewähltes Element»). Besetzung und «N Personen» rechnen sich daraus.',
    'Handy: Ansicht «Bühne» oder «Bühne 2×» zum genauen Platzieren.',
    'Neues Instrument: «Instrumente verwalten» → «Instrument hinzufügen».',
    'Texte, Kontakte, Datum «Stand»: «Texte & Kontakte».',
    '«PDF» erzeugt den Rider (2 Seiten A4) zum Versenden an Veranstalter.'
  ];
  if (dataMode === 'enc') steps.push('Änderungen bleiben nur in diesem Browser. Für alle übernehmen: «Stand-Datei» → an Tom schicken bzw. auf GitHub in WATM/data/ hochladen.');
  else steps.push('«Speichern» sichert den Stand im Artefakt; vorher bleibt er als Entwurf im Browser.');
  steps.push('Verschrieben? ↶ oben macht rückgängig.');
  pane.append(h('ol', {}, steps.map(s => h('li', {}, s))));
}

/* ============================================================================
   PANEL: Daten & Sicherung
   ========================================================================== */
function renderDataPane(){
  const pane = $('#dataPane'); pane.textContent = '';
  pane.append(h('p', { class:'muted' }, dataMode === 'enc'
    ? 'Eigene Änderungen bleiben in diesem Browser. Für alle übernehmen: «Stand-Datei» erzeugt rider.enc.json (verschlüsselt) – Tom lädt sie auf GitHub in WATM/data/ hoch.'
    : inClaude && capArtifact && !readOnly
    ? '«Speichern» legt den Stand im Artefakt ab (Datei data/rider.json) – auf allen Geräten und für Claude lesbar. Bis dahin hält der Browser einen Entwurf.'
    : 'Speichern im Artefakt ist hier nicht verfügbar. Der Browser hält einen Entwurf; für eine Sicherung «JSON herunterladen» oder «JSON kopieren» nutzen.'));
  if (dataMode === 'enc') pane.append(h('button', { type:'button', class:'primary', style:'width:100%;margin-bottom:8px', onclick: () => exportEncrypted() }, 'Stand-Datei für GitHub (verschlüsselt)'));
  const json = () => JSON.stringify(state, null, 1);
  pane.append(h('div', { class:'row' },
    h('button', { type:'button', onclick: () => offerDownload('rider-stand.json', json()) }, dataMode === 'enc' ? 'JSON (unverschlüsselt)' : 'JSON herunterladen'),
    h('button', { type:'button', onclick: async () => {
      try { await navigator.clipboard.writeText(json()); toast('JSON in die Zwischenablage kopiert.'); }
      catch (e) { imp.value = json(); imp.select(); toast('Kopieren gesperrt – Text unten markiert, bitte manuell kopieren.'); }  // Fallback
    } }, 'JSON kopieren')));
  const imp = h('textarea', { placeholder:'JSON hier einfügen …', rows:4 });
  const file = h('input', { type:'file', accept:'.json,application/json', onchange: e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader(); rd.onload = () => { imp.value = rd.result; doImport(imp.value); }; rd.readAsText(f);   // Datei einlesen
  } });
  pane.append(h('label', { class:'f' }, 'Stand importieren (JSON einfügen oder Datei wählen)'), imp,
    h('div', { class:'row', style:'margin-top:6px' }, h('button', { type:'button', onclick: () => doImport(imp.value) }, 'Übernehmen'), file));
  const reset = h('button', { type:'button', class:'danger', style:'margin-top:12px;width:100%' }, dataMode === 'enc' ? 'Auf offiziellen Stand zurücksetzen' : 'Auf gespeicherten Stand zurücksetzen');
  armButton(reset, 'Wirklich zurücksetzen? (Rückgängig möglich)', () => { mutate(() => { state = JSON.parse(savedJSON); selectedId = null; }); toast('Zurückgesetzt.'); });  // Stand der geladenen Datei
  pane.append(reset);
  if (dataMode === 'enc') {
    /* Passwort ändern: neue Datei mit neuem Salz; gilt erst nach dem Hochladen */
    const p1 = h('input', { type:'password', placeholder:'neues Passwort', autocomplete:'new-password' });
    const p2 = h('input', { type:'password', placeholder:'wiederholen', autocomplete:'new-password' });
    pane.append(h('hr', { class:'sep' }), h('b', {}, 'Passwort ändern (Tom)'),
      h('p', { class:'muted' }, 'Erzeugt eine neue rider.enc.json. Nach dem Hochladen gilt nur noch das neue Passwort – allen Bandmitgliedern neu mitteilen.'),
      p1, h('div', { style:'margin-top:6px' }, p2),
      h('button', { type:'button', style:'margin-top:8px;width:100%', onclick: () => {
        if (p1.value.length < 10) { toast('Mindestens 10 Zeichen.'); return; }
        if (p1.value !== p2.value) { toast('Passwörter stimmen nicht überein.'); return; }
        exportEncrypted(p1.value).then(() => { p1.value = ''; p2.value = ''; });
      } }, 'Neue Stand-Datei mit neuem Passwort'));
    const out = h('button', { type:'button', style:'margin-top:12px;width:100%' }, 'Auf diesem Gerät abmelden');
    armButton(out, 'Abmelden? (Entwurf wird gelöscht)', () => {
      forgetKey(); try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}   // Schlüssel + Entwurf vom Gerät entfernen
      location.reload();
    });
    pane.append(out);
  }
}
function doImport(text){
  let d;
  try { d = JSON.parse(text); } catch (e) { toast('Kein gültiges JSON.'); return; }
  if (d && d.ct && d.iv) {                                 // verschlüsselte Stand-Datei
    if (!encKey) { toast('Verschlüsselte Datei: hier kein Schlüssel vorhanden.'); return; }
    decryptState(d, encKey).then(dd => doImport(JSON.stringify(dd))).catch(() => toast('Datei passt nicht zum aktuellen Passwort.'));
    return;
  }
  if (!d || !Array.isArray(d.stage) || !Array.isArray(d.instruments)) { toast('JSON passt nicht (stage/instruments fehlen).'); return; }
  delete d.savedAt;
  mutate(() => { state = normalize(d); selectedId = null; });
  toast('Stand übernommen – zum Behalten «Speichern».');
}

/* ============================================================================
   BÜHNE: Auswahl und Ziehen (Maus, Stift, Finger)
   ========================================================================== */
/* Bildschirmpunkt -> Planeinheiten (berücksichtigt Skalierung der Seite) */
function toStage(evt){
  const root = document.getElementById('stageRoot');
  const m = root.getScreenCTM().inverse();
  return { x: evt.clientX * m.a + evt.clientY * m.c + m.e, y: evt.clientX * m.b + evt.clientY * m.d + m.f };
}
function snap(v){ return $('#snap').checked ? Math.round(v / GRID) * GRID : +v.toFixed(1); }
function initStage(){
  const svg = $('#page2');
  /* Auf Touch-Geräten Scrollen nur verhindern, wenn ein Element berührt wird */
  svg.addEventListener('touchstart', e => { if (e.target.closest('.item')) e.preventDefault(); }, { passive:false });
  svg.addEventListener('pointerdown', e => {
    const g = e.target.closest('.item');
    downOnItem = !!g;                                      // merken für den folgenden Klick
    if (!g || (e.button && e.button !== 0)) return;        // nur Hauptknopf auf Elementen
    const it = getItem(g.dataset.id); if (!it) return;
    e.preventDefault();
    const p = toStage(e);
    drag = { id:it.id, pid:e.pointerId, p0:p, x0:it.x, y0:it.y, before:sj(), moved:false };
    svg.setPointerCapture(e.pointerId);                    // Zeiger an die (bleibende) Seite binden
    if (selectedId !== it.id) { selectedId = it.id; renderPages(); renderSelPane(); }  // auswählen
  });
  svg.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.pid) return;
    const it = getItem(drag.id); if (!it) return;
    const p = toStage(e), dx = p.x - drag.p0.x, dy = p.y - drag.p0.y;
    if (!drag.moved && Math.hypot(dx, dy) < 2) return;      // kleine Zitterbewegung ignorieren (2 PE)
    drag.moved = true;
    it.x = snap(drag.x0 + dx); it.y = snap(drag.y0 + dy);  // neue Lage
    const g = svg.querySelector(`.item[data-id="${CSS.escape(it.id)}"]`);
    if (g) g.setAttribute('transform', itemTransform(it)); // nur dieses Element bewegen (schnell)
  });
  const end = e => {
    if (!drag || e.pointerId !== drag.pid) return;
    const d = drag; drag = null;
    if (d.moved && d.before !== sj()) { undoStack.push(d.before); redoStack.length = 0; afterChange({ panels:false }); renderSelPane(); }
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  /* Klick auf leere Fläche: Auswahl aufheben */
  svg.addEventListener('pointerdown', () => { menuOpenAtDown = !$('#addMenu').hidden; }, true);   // vor dem Schliessen durch Tipp daneben
  svg.addEventListener('click', e => {
    if (downOnItem) { downOnItem = false; return; }        // Klick gehört zu Auswahl/Ziehen eines Elements
    if (e.target.closest('.item')) return;
    if (selectedId) { selectedId = null; renderPages(); renderSelPane(); return; }   // 1. Tipp: nur Auswahl aufheben
    if (menuOpenAtDown) return;                            // Tipp hat nur das offene Menü geschlossen
    if (e.target.classList && e.target.classList.contains('stage-floor')) openAddMenuAt(e);   // leere Bühnenfläche: hier einfügen
  });
}

/* Leiste für das gewählte Element */
function initSelbar(){
  $('#selbar').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const it = getItem(selectedId); if (!it) return;
    const act = b.dataset.act;
    if (act === 'rotL') mutate(() => { it.r = normAngle((it.r || 0) - 15); });
    if (act === 'rotR') mutate(() => { it.r = normAngle((it.r || 0) + 15); });
    if (act === 'smaller') mutate(() => { it.s = Math.max(0.2, +((it.s || 1) / 1.1).toFixed(3)); });   // −10 %
    if (act === 'bigger')  mutate(() => { it.s = Math.min(4, +((it.s || 1) * 1.1).toFixed(3)); });     // +10 %
    if (act === 'dup') duplicateItem(it.id);
    if (act === 'inear') {                                 // In-Ear durchschalten: aus -> Funk -> wired -> aus
      const ml = musicianLabel(it); if (!ml) return;
      const order = ['', ...Object.keys(IN_EAR)];
      const next = order[(order.indexOf(ml.inEar || '') + 1) % order.length];
      mutate(() => { if (next) ml.inEar = next; else delete ml.inEar; });
      toast('In-Ear «' + labelTitle(ml) + '»: ' + (next ? IN_EAR[next].lines.join(' / ') : 'keines'));
    }
    if (act === 'edit') { const d = $('#secSel'); d.open = true; d.scrollIntoView({ behavior:'smooth', block:'start' }); }
    if (act === 'close') { selectedId = null; renderPages(); renderSelPane(); }
    if (act === 'del') {                                   // zweistufig löschen
      if (b.classList.contains('armed')) { b.classList.remove('armed'); deleteItem(it.id); }
      else { b.classList.add('armed'); setTimeout(() => b.classList.remove('armed'), 3000); toast('Nochmals 🗑 tippen zum Löschen.'); }
    }
  });
}

/* Tastatur (Desktop) */
function initKeys(){
  document.addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); return; }
    if (typing) return;
    const it = getItem(selectedId); if (!it) return;
    const step = e.shiftKey ? 10 : 1;                      // Pfeil = 1 PE, mit Umschalt 10 PE
    const mv = { ArrowLeft:[-step,0], ArrowRight:[step,0], ArrowUp:[0,-step], ArrowDown:[0,step] }[e.key];
    if (mv) { e.preventDefault(); mutate(() => { it.x += mv[0]; it.y += mv[1]; }, { panels:false }); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteItem(it.id); return; }
    if (e.key === 'Escape') { selectedId = null; renderPages(); renderSelPane(); return; }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateItem(it.id); return; }
    if (e.key.toLowerCase() === 'r') mutate(() => { it.r = normAngle((it.r || 0) + (e.shiftKey ? -15 : 15)); });
  });
}

/* ============================================================================
   SPEICHERN, ENTWURF, DOWNLOAD
   ========================================================================== */
function saveDraft(){
  try {
    if (sj() === savedJSON) localStorage.removeItem(DRAFT_KEY);                     // nichts Ungespeichertes
    else localStorage.setItem(DRAFT_KEY, JSON.stringify({ at:Date.now(), json:sj() }));  // Entwurf ablegen
  } catch (e) { /* stiller Fallback: Browser-Speicher gesperrt -> kein Entwurf */ }
}
function readDraft(){ try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { return null; } }

/* Knopf «Speichern»: GitHub -> verschlüsselte Stand-Datei; sonst Artefakt */
function onSave(){ return dataMode === 'enc' ? exportEncrypted() : saveToArtifact(); }

/* Verschlüsselte Stand-Datei erzeugen (optional mit neuem Passwort) und anbieten */
async function exportEncrypted(newPassword){
  if (!encKey) { toast('Kein Schlüssel – Seite neu laden und Passwort eingeben.'); return; }
  try {
    let key = encKey, salt = encSalt, iter = encIter;
    if (newPassword) {
      salt = crypto.getRandomValues(new Uint8Array(16)); iter = ENC_ITER;   // neues Salz -> neuer Schlüssel
      toast('Neuer Schlüssel wird berechnet …');
      key = await deriveKey(newPassword, salt, iter);
    }
    const file = await encryptState(Object.assign(clone(state), { savedAt:new Date().toISOString() }), key, salt, iter);
    const ok = await offerDownload('rider.enc.json', JSON.stringify(file));
    if (!ok) return;
    if (newPassword) { encKey = key; encSalt = salt; encIter = iter; forgetKey(); }  // ab jetzt neues Passwort; Gerät fragt nach dem Hochladen neu
    toast('rider.enc.json erzeugt – auf GitHub in WATM/data/ hochladen (alte Datei ersetzen).', 6000);
  } catch (err) { toast('Stand-Datei fehlgeschlagen: ' + (err && err.message || err), 5000); }
}

async function saveToArtifact(){
  if (!capArtifact || readOnly) {
    saveDraft();
    toast(inClaude ? 'Speichern hier nicht möglich – Entwurf bleibt im Browser. Sicherung: «Daten & Sicherung».' : 'Lokal: nur als Entwurf im Browser gesichert.', 4200);
    return;
  }
  const btn = $('#bSave'); btn.disabled = true; btn.textContent = 'Speichert …';
  const stamp = new Date().toISOString();
  const payload = Object.assign(clone(state), { savedAt:stamp });
  try {
    await capArtifact.publish({ 'data/rider.json': { content: JSON.stringify(payload, null, 1), contentType:'application/json' } });
    savedJSON = sj(); savedAt = stamp;                     // gespeicherten Stand merken
    saveDraft();                                           // Entwurf entfällt
    toast('Gespeichert.');
  } catch (err) {
    const code = err && err.code;
    if (code === 'conflict') toast('Es gibt eine neuere Version – Seite lädt neu. Dein Stand bleibt als Entwurf erhalten.', 5000);
    else if (code === 'rate_limited') toast('Zu häufig gespeichert – bitte kurz warten.');
    else if (code === 'upstream_error') toast('Speichern vorübergehend gestört – bitte nochmals versuchen.');
    else if (['not_writer','not_granted','capability_disabled','capability_removed','consent_required','not_declared'].includes(code)) {
      readOnly = true;                                     // ab jetzt nur Entwurf/Export
      toast('Diese Ansicht darf nicht speichern. Entwurf bleibt im Browser; Sicherung über «JSON herunterladen».', 5000);
    } else toast('Speichern fehlgeschlagen' + (code ? ' (' + code + ')' : '') + '.');
  } finally {
    btn.disabled = false; btn.textContent = 'Speichern';
    renderStatus(); renderDataPane();
  }
}

/* Datei anbieten: im Artefakt über 'downloads', lokal über einen Link */
async function offerDownload(filename, data){
  if (capDownloads) {
    try { await capDownloads.save({ filename, data }); toast('Download übergeben.'); return true; }
    catch (err) {
      const code = err && err.code;
      if (code === 'declined') toast('Download abgebrochen.');
      else if (code === 'rate_limited') toast('Ein Download-Dialog ist schon offen.');
      else toast('Download hier nicht verfügbar' + (code ? ' (' + code + ')' : '') + '.');
      return false;
    }
  }
  if (!inClaude) {                                         // lokal geöffnet: normaler Download
    const blob = data instanceof Blob ? data : new Blob([data], { type:'application/octet-stream' });
    const a = h('a', { href:URL.createObjectURL(blob), download:filename });
    document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000);   // aufräumen
    return true;
  }
  toast('Download ist in dieser Ansicht nicht verfügbar.');
  return false;
}

async function exportPdf(){
  const btn = $('#bPdf'); btn.disabled = true; btn.textContent = 'PDF …';
  try {
    const blob = await buildRiderPdf(state);
    await offerDownload(pdfFileName(state), blob);
  } catch (err) {
    console.error(err);
    toast('PDF konnte nicht erstellt werden: ' + (err && err.message || err), 5000);
  } finally { btn.disabled = false; btn.textContent = 'PDF'; }
}

/* ============================================================================
   START
   ========================================================================== */
async function fetchJson(url){
  try { const r = await fetch(url, { cache:'no-store' }); return r.ok ? await r.json() : null; }
  catch (e) { return null; }                               // nicht vorhanden / offline
}
async function loadState(){
  let d = await fetchJson('data/rider.json');              // 1) Klartext (privates Claude-Artefakt)
  if (d) dataMode = 'plain';
  else {
    const enc = await fetchJson('data/rider.enc.json');    // 2) verschlüsselt (GitHub)
    if (enc && enc.ct) { dataMode = 'enc'; d = await unlock(enc); }
  }
  if (d) { savedAt = d.savedAt || null; delete d.savedAt; state = normalize(d); }
  else { dataMode = 'default'; state = clone(DEFAULT_STATE); }   // 3) stiller Fallback: eingebauter Standard (ohne Kontakte)
  savedJSON = sj();
}
/* Sperrbildschirm: wartet, bis das Passwort die Datei entschlüsselt */
async function unlock(enc){
  encSalt = b64dec(enc.salt); encIter = enc.iter || ENC_ITER;
  const kept = await loadRememberedKey(enc.salt);          // auf dem Gerät gemerkter Schlüssel?
  if (kept) {
    try { const d = await decryptState(enc, kept); encKey = kept; return d; }
    catch (e) { forgetKey(); }                             // veraltet (Passwort geändert) -> neu fragen
  }
  document.body.classList.add('locked');
  const form = $('#lock'); form.hidden = false; $('#pw').focus();
  return new Promise(resolve => {
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      const pw = $('#pw').value; if (!pw || form.dataset.busy) return;
      form.dataset.busy = '1'; $('#pwGo').disabled = true; $('#pwErr').textContent = 'Prüfe …';
      try {
        const key = await deriveKey(pw, encSalt, encIter);
        const d = await decryptState(enc, key);           // wirft bei falschem Passwort
        encKey = key;
        if ($('#pwRemember').checked) await rememberKey(key, enc.salt);
        form.hidden = true; document.body.classList.remove('locked'); $('#pw').value = '';
        resolve(d);
      } catch (e) {
        $('#pwErr').textContent = 'Passwort falsch.'; $('#pw').select();
      } finally { delete form.dataset.busy; $('#pwGo').disabled = false; }
    });
  });
}
/* Hinweis, wenn ein ungespeicherter Entwurf im Browser liegt */
function offerDraft(){
  const d = readDraft();
  if (!d || !d.json || d.json === savedJSON) return;
  const b = $('#banner'); b.hidden = false; b.textContent = '';
  b.append(h('span', {}, 'Ungespeicherter Entwurf vom ' + new Date(d.at).toLocaleString('de-CH', { dateStyle:'short', timeStyle:'short' }) + ' gefunden.'),
    h('button', { type:'button', class:'primary', onclick: () => { mutate(() => { state = normalize(JSON.parse(d.json)); selectedId = null; }); b.hidden = true; } }, 'Entwurf laden'),
    h('button', { type:'button', onclick: () => { try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} b.hidden = true; } }, 'Verwerfen'));
}
/* Fähigkeiten des Artefakts abfragen (kommen asynchron; lokal: keine) */
async function initCapabilities(){
  for (let i = 0; i < 20 && !(window.claude && typeof window.claude.use === 'function'); i++) await new Promise(r => setTimeout(r, 100));  // bis 2 s warten
  if (!(window.claude && typeof window.claude.use === 'function')) { inClaude = false; renderStatus(); renderDataPane(); return; }
  inClaude = true;
  try { capArtifact = await window.claude.use('artifact'); } catch (e) { capArtifact = null; }
  try { capDownloads = await window.claude.use('downloads'); } catch (e) { capDownloads = null; }
  renderStatus(); renderDataPane();
}

/* Ansichtswahl: Seite / Bühne / Bühne 2× */
function applyView(){
  $('#stageSheet').classList.toggle('zoom2', viewMode === 'stage2');   // 2×: Blatt seitlich scrollbar
  document.querySelectorAll('#viewbar button[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === viewMode));
  renderPages();
}
function initView(){
  $('#viewbar').addEventListener('click', e => { const b = e.target.closest('button[data-view]'); if (!b) return; viewMode = b.dataset.view; applyView(); });  // «＋ Hinzufügen» ausgenommen
}

async function boot(){
  try {
    await Promise.all(['400 12px "RiderText"','700 12px "RiderText"','400 12px "RiderPlan"','700 12px "RiderPlan"'].map(f => document.fonts.load(f)));
  } catch (e) { /* stiller Fallback: Ersatzschrift, Textbreiten ggf. ungenau */ }
  await loadState();
  initAddPane(); initAddMenu(); initStage(); initSelbar(); initKeys(); initView();
  $('#bUndo').onclick = undo; $('#bRedo').onclick = redo;
  $('#bSave').onclick = onSave; $('#bPdf').onclick = exportPdf;
  if (dataMode === 'enc') { $('#bSave').textContent = 'Stand-Datei'; $('#bSave').title = 'Verschlüsselte Stand-Datei für GitHub erzeugen'; }
  renderAll(); applyView();
  offerDraft();
  document.body.dataset.ready = '1';                       // Signal für automatische Tests
  initCapabilities();
}
boot();
