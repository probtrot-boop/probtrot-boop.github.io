/* ============================================================================
   core.js – Rider «Werli and the Melodies»: Standardstand + Darstellung
   ----------------------------------------------------------------------------
   Zweck:     Zeichnet beide A4-Seiten als SVG. Dieselben SVGs dienen dem
              Bildschirm (Editor) und dem PDF-Export (svg2pdf) -> was man
              sieht, wird gedruckt.
   Einheiten: Seiten-SVG: viewBox 793.7 x 1122.5 = A4 in CSS-px
                (1 CSS-px = 0.75 pt; 210 mm = 793.7 px).
              Bühnenplan: eigene "Planeinheiten" (PE): 1 PE = 1 Pixel des
                Original-PDFs bei 110 dpi. Planfläche 710 x 812 PE, auf der
                Seite mit Faktor 619/710 = 0.8718 skaliert (619 px breit).
   Annahmen:  Schriften "RiderText" (Carlito, Ersatz für Calibri) und
              "RiderPlan" (Lato) sind per @font-face geladen, bevor gezeichnet
              wird (Textbreiten werden per Canvas gemessen).
   Umfang:    Keine Bedienlogik (die steckt in editor.js). Keine Personendaten
              (Kontakte nur als Platzhalter, siehe DEFAULT_STATE.contacts).
   ========================================================================== */
'use strict';

/* ===== FARBEN (aus dem Original-PDF abgegriffen) ===== */
const C = {
  navy:'#14202B', orange:'#C1832A', cream:'#FBF8F1', tan:'#D9CFB8', slate:'#3C4A57',
  beige:'#E8D3A8', grey:'#D8D2C4', green:'#1F5C57', greenBg:'#DDEAE6', red:'#B23A2E', redBg:'#F3DAD4',
  amp:'#B7BDC2', power:'#F4C430', cym:'#E8D3A8', cymLine:'#C1832A', tom:'#CFE3DF', tomLine:'#1F5C57',
  wine:'#9B2D26', wineDark:'#6E1E1A', dot:'#E9E4D8', mic:'#D5DADD', thLine:'#2B3742'
};

/* ===== SEITENMASSE (CSS-px, gemessen an der Auftrag-1-Vorlage) ===== */
const PAGE = { w:793.7, h:1122.5, left:57, right:736.7, inner:679.7 };   // Ränder 57 px = 15 mm
const STAGE_POS = { x:87.34, y:103, scale:619/710 };                     // Lage des Bühnenplans auf Seite 2

/* ===== STANDARDSTAND (Rider Stand November 2026) =====
   Wird verwendet, wenn data/rider.json fehlt, und für "Zurücksetzen".
   Bühnenelemente: x/y in PE; bei 'label' linke obere Ecke, sonst Mitte.
   r = Drehung in Grad (Uhrzeigersinn), s = Massstab (1 = Originalgrösse).
   group = Instrument-ID; ist das Instrument aus, wird das Element ausgeblendet. */
const DEFAULT_STATE = {
  version: 1,
  meta: {
    kicker: 'LIVE · KONZERT · BÜHNENPLANUNG',
    band: 'WERLI AND THE MELODIES',
    subtitle: 'Technischer Rider',
    besetzung: '10 Musiker:innen, 3 Lead-/Background-Vocals',
    strom: 'CH · Typ J · 230 V',
    stand: 'November 2026'
  },
  hint: { on:false, title:'Aktuelle Besetzung:', text:'Die Geige pausiert derzeit urlaubsbedingt und ist in diesem Rider nicht enthalten. Bühnenplan und Kanalliste werden entsprechend angepasst und bei Rückkehr der Geigerin/des Geigers wieder ergänzt.' },
  /* table = Zeile in der Instrumentenübersicht; Anzahl = eingeschaltete Instrumente mit gleicher Zeile
     inEar = { type:'funk'|'wired', note:'Zusatzzeile' } oder fehlt/null = kein In-Ear.
     Die In-Ear-Zeilen erscheinen automatisch in der ersten Beschriftung des Instruments. */
  instruments: [
    { id:'drums',   name:'Schlagzeug',                  table:'Schlagzeug',     on:true, inEar:{ type:'wired', note:'XLR' } },
    { id:'egit',    name:'E-Gitarre links (Kemper)',    table:'E-Gitarre',      on:true  },
    { id:'egit2',   name:'E-Gitarre rechts (Marshall)', table:'E-Gitarre',      on:false },
    { id:'akgit',   name:'Akustikgitarre (Engel)',      table:'Akustikgitarre', on:true  },
    { id:'mando',   name:'Mandoline',                   table:'Mandoline',      on:true  },
    { id:'bass',    name:'E-Bass',                      table:'E-Bass',         on:true  },
    { id:'akk',     name:'Akkordeon',                   table:'Akkordeon',      on:true  },
    { id:'violine', name:'Violine',                     table:'Violine',        on:true  },
    { id:'whistle', name:'Whistle',                     table:'Whistle',        on:true  },
    { id:'voc1',    name:'Vocal 1',                     table:'Vocals',         on:true  },
    { id:'voc2',    name:'Vocal 2',                     table:'Vocals',         on:true  },
    { id:'voc3',    name:'Vocal 3',                     table:'Vocals',         on:true, inEar:{ type:'funk', note:'XLR auf Bühne' } }
  ],
  drumSetup: [ ['Kick',1],['Tom Tom',1],['Stand Tom',2],['Snare',1],['Hi-Hat',1],['Ride',1],['Crash',2],['Splash',1],['Chimes',1] ],
  stage: [
    { id:'amp_egit',  type:'amp',       x:67.75,  y:252.25, r:0,     s:1,    group:'egit',  w:53.5, h:148.5 },
    { id:'amp_bass',  type:'amp',       x:113.75, y:408.5,  r:-39.2, s:1,    group:'bass',  w:68,   h:130 },
    { id:'kit',       type:'drums',     x:310,    y:640,    r:0,     s:1,    group:'drums' },
    { id:'acc',       type:'accordion', x:549.5,  y:557.25, r:0,     s:1,    group:'akk' },
    { id:'vio',       type:'violin',    x:216,    y:490,    r:-28,   s:0.8,  group:'violine' },
    { id:'mon_v3',    type:'monitor',   x:225,    y:83,     r:0,     s:1,    group:'voc3' },
    { id:'mon_v2',    type:'monitor',   x:358,    y:83,     r:0,     s:1,    group:'voc2' },
    { id:'mon_v1',    type:'monitor',   x:494.5,  y:83,     r:0,     s:1,    group:'voc1' },
    { id:'mon_c',     type:'monitor',   x:338,    y:380.5,  r:0,     s:1,    group:null },
    { id:'mon_r',     type:'monitor',   x:495.75, y:362.5,  r:-36.5, s:1,    group:null },
    { id:'mon_br',    type:'monitor',   x:641,    y:681,    r:145.5, s:1,    group:null },
    { id:'mic_v3',    type:'mic',       x:225,    y:135,    r:0,     s:1,    group:'voc3' },
    { id:'mic_v2',    type:'mic',       x:356.5,  y:135,    r:0,     s:1,    group:'voc2' },
    { id:'mic_v1',    type:'mic',       x:494.5,  y:135,    r:0,     s:1,    group:'voc1' },
    { id:'mic_wh',    type:'mic',       x:381.5,  y:441.5,  r:0,     s:0.82, group:'whistle' },
    { id:'pw_egit',   type:'power',     x:33,     y:350.5,  r:0,     s:1,    group:'egit' },
    { id:'pw_bass',   type:'power',     x:94.25,  y:475,    r:0,     s:1,    group:'bass' },
    { id:'pw_ak',     type:'power',     x:666.75, y:336.75, r:0,     s:1,    group:'akgit' },
    { id:'pw_mando',  type:'power',     x:666.75, y:480.5,  r:0,     s:1,    group:'mando' },
    { id:'pw_br',     type:'power',     x:582.5,  y:730,    r:0,     s:1,    group:null },
    { id:'lab_v3',    type:'label', x:176.5, y:167.5, r:0, s:1, group:'voc3',    w:98,    lines:['Vocal 3'] },
    { id:'lab_v2',    type:'label', x:314,   y:168.5, r:0, s:1, group:'voc2',    w:88.5,  lines:['Vocal 2'] },
    { id:'lab_v1',    type:'label', x:450.5, y:168.5, r:0, s:1, group:'voc1',    w:88.5,  lines:['Vocal 1'] },
    { id:'lab_egit',  type:'label', x:100.5, y:253,   r:0, s:1, group:'egit',    w:139,   lines:['E-Gitarre','Kemper Verstärker','Line Signal'] },
    { id:'lab_bass',  type:'label', x:143.5, y:332,   r:0, s:1, group:'bass',    w:93,    lines:['E-Bass','Amp'] },
    { id:'lab_ak',    type:'label', x:552.5, y:196,   r:0, s:1, group:'akgit',   w:143.5, lines:['Akk. Gitarre','Engel Verstärker','Line Signal'] },
    { id:'lab_egit2', type:'label', x:552.5, y:262,   r:0, s:1, group:'egit2',   w:143.5, lines:['E-Gitarre','Marshall Verstärker','Mikrofon'] },
    { id:'lab_mando', type:'label', x:552.5, y:388.5, r:0, s:1, group:'mando',   w:143.5, lines:['Mandoline','Engel Verstärker','Line Signal'] },
    { id:'lab_wh',    type:'label', x:399,   y:439,   r:0, s:1, group:'whistle', w:76,    lines:['Whistle','Mikrofon'] },
    { id:'lab_akk',   type:'label', x:501.5, y:608,   r:0, s:1, group:'akk',     w:97,    lines:['Akkordeon','DI-Box'] },
    { id:'lab_drums', type:'label', x:94.5,  y:689.5, r:0, s:1, group:'drums',   w:98,    lines:['Schlagzeug'] },
    { id:'lab_vio',   type:'label', x:247,   y:466,   r:0, s:1, group:'violine', w:90,    lines:['Violine','DI-Box'] }
  ],
  powerNote: { title:'Stromversorgung:', text:'Sämtliche elektrischen Geräte sind an Schweizer Stromanschlüsse (Typ J, 230 V) anzuschliessen. Pro markierter Position im Bühnenplan wird ein eigener, funktionierender Stromanschluss in Bühnennähe benötigt.' },
  /* Kontakte hier nur als Platzhalter: Code ist öffentlich; echte Angaben stehen
     ausschliesslich in data/rider.json (Artefakt, privat) bzw. verschlüsselt in data/rider.enc.json */
  contacts: [
    { role:'Kontakt Tourmanagement:',  text:'Name · Telefon · E-Mail' },
    { role:'Kontakt FOH / Tontechnik:', text:'Name · Telefon · E-Mail' }
  ]
};

/* Namen der Symboltypen (für Editor-Anzeige) */
const TYPE_NAMES = { label:'Beschriftung', monitor:'Monitor', amp:'Verstärker', mic:'Mikrofon', power:'Stromanschluss',
  di:'DI-Box', violin:'Violine', accordion:'Akkordeon', drums:'Schlagzeug', guitar:'Gitarre' };

/* ===== HILFSFUNKTIONEN ===== */
const SVGNS = 'http://www.w3.org/2000/svg';
/* SVG-Element erzeugen, Attribute setzen, optional anhängen */
function el(tag, attrs, parent){
  const e = document.createElementNS(SVGNS, tag);          // neues Element
  for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]); // Attribute übertragen
  if (parent) parent.appendChild(e);                       // einhängen
  return e;
}
/* Textelement mit Inhalt erzeugen */
function txt(parent, x, y, str, size, bold, fill, extra){
  const t = el('text', Object.assign({ x, y, 'font-size':size, 'font-weight': bold ? 700 : 400, fill }, extra || {}), parent);
  t.textContent = str == null ? '' : String(str);           // Text sicher setzen (kein HTML)
  return t;
}
/* Textbreite per Canvas messen (gleiche Schrift wie im SVG) */
const _mctx = document.createElement('canvas').getContext('2d');
function tw(str, size, bold, fam){
  _mctx.font = `${bold ? 700 : 400} ${size}px "${fam || 'RiderText'}"`;  // Schrift setzen
  return _mctx.measureText(String(str || '')).width;
}
/* Fliesstext umbrechen: erste Zeile beginnt nach 'indent' px; liefert Zeilen-Array */
function wrapText(str, size, maxW, indent){
  const words = String(str || '').split(/\s+/).filter(Boolean);
  const lines = []; let cur = ''; let avail = maxW - (indent || 0);  // verfügbare Breite der ersten Zeile
  words.forEach(w => {
    const test = cur ? cur + ' ' + w : w;
    if (cur && tw(test, size, false) > avail) { lines.push(cur); cur = w; avail = maxW; }  // Umbruch, Folgezeilen volle Breite
    else cur = test;
  });
  if (cur || !lines.length) lines.push(cur);
  return lines;
}
/* Instrument nach ID */
function findInstr(st, id){ return st.instruments.find(i => i.id === id); }
/* Element sichtbar? Ohne Instrument immer; sonst nur, wenn Instrument eingeschaltet */
function isVisible(st, it){ if (!it.group) return true; const i = findInstr(st, it.group); return !i || i.on; }
/* Winkel auf (-180, 180] normieren */
function normAngle(a){ a = ((a % 360) + 360) % 360; return a > 180 ? a - 360 : a; }
/* Transform eines Bühnenelements */
function itemTransform(it){ return `translate(${+it.x.toFixed(2)} ${+it.y.toFixed(2)}) rotate(${it.r || 0}) scale(${it.s || 1})`; }
let _uid = 0;                                               // Zähler für eindeutige Clip-IDs

/* ===== IN-EAR ===== */
const IEM_TEXT = { funk:'Funk In-Ear', wired:'wired In-Ear' };   // Text im Plan je Art
/* Erste Beschriftung je Instrument = Träger der In-Ear-Zeilen (Map Instrument-ID -> Label-ID) */
function mainLabels(st){
  const m = {};
  st.stage.forEach(it => { if (it.type === 'label' && it.group && !m[it.group]) m[it.group] = it.id; });
  return m;
}
/* Zeilen einer Beschriftung inkl. automatisch ergänzter In-Ear-Angabe */
function labelLines(st, it, mains){
  const base = (it.lines && it.lines.length) ? it.lines.slice() : ['Neu'];
  const ins = it.group && findInstr(st, it.group);
  if (!ins || !ins.inEar || !IEM_TEXT[ins.inEar.type]) return base;
  if ((mains || mainLabels(st))[it.group] !== it.id) return base;   // nur an der ersten Beschriftung
  base.push(IEM_TEXT[ins.inEar.type]);
  if (ins.inEar.note) base.push(ins.inEar.note);         // Zusatz (z.B. "XLR auf Bühne")
  return base;
}
/* Umstellung älterer Stände: In-Ear-Zeilen aus Beschriftungen ins Instrument übernehmen.
   Erkennung (Auswahlstelle): Zeile enthält "in-ear"/"inear"; "wired"/"kabel" = wired, sonst Funk;
   folgt eine Zeile mit "XLR", wird sie zum Zusatz. Läuft nur für Instrumente ohne Feld inEar. */
function migrateInEar(st){
  const mains = mainLabels(st);
  st.instruments.forEach(ins => {
    if (ins.inEar !== undefined) return;                   // schon neues Format
    ins.inEar = null;                                      // Standard: kein In-Ear
    const lab = st.stage.find(x => x.id === mains[ins.id]);
    if (!lab || !Array.isArray(lab.lines)) return;
    const i = lab.lines.findIndex((s, k) => k > 0 && /in-?\s?ear/i.test(s));
    if (i < 0) return;
    const type = /wired|kabel/i.test(lab.lines[i]) ? 'wired' : 'funk';
    const hasNote = /xlr/i.test(lab.lines[i + 1] || '');
    ins.inEar = { type, note: hasNote ? lab.lines[i + 1] : '' };
    lab.lines.splice(i, hasNote ? 2 : 1);                  // Zeilen aus der Beschriftung entfernen (werden automatisch angezeigt)
  });
  return st;
}

/* ============================================================================
   SYMBOLE – lokale Koordinaten in PE: Mitte = 0/0 (Label: linke obere Ecke)
   ========================================================================== */
const SHAPES = {
  /* Monitor-Wedge 90 x 51 PE; orange Kante = Abstrahlseite zur Person */
  monitor(g, it){
    const w=90, h=51, rr=3, sh=5;                          // Breite, Höhe, Eckradius, Kantenhöhe
    el('path',{d:`M${-w/2} ${h/2-sh}V${-h/2+rr}Q${-w/2} ${-h/2} ${-w/2+rr} ${-h/2}H${w/2-rr}Q${w/2} ${-h/2} ${w/2} ${-h/2+rr}V${h/2-sh}Z`, fill:C.navy}, g);
    el('path',{d:`M${-w/2} ${h/2-sh}H${w/2}V${h/2-rr}Q${w/2} ${h/2} ${w/2-rr} ${h/2}H${-w/2+rr}Q${-w/2} ${h/2} ${-w/2} ${h/2-rr}Z`, fill:C.orange}, g);
    const t = txt(g, 0, 2.6, it.text || 'Monitor', 14.5, true, '#FFFFFF', {'text-anchor':'middle'});
    if (Math.abs(normAngle(it.r || 0)) > 90) t.setAttribute('transform', 'rotate(180 0 -2.5)'); // Schrift nie kopfüber
  },
  /* Verstärker: graues Rechteck w x h PE */
  amp(g, it){
    const w = it.w || 60, h = it.h || 40;
    el('rect',{x:-w/2, y:-h/2, width:w, height:h, rx:1, fill:C.amp, stroke:C.slate, 'stroke-width':1.3}, g);
    if (it.text) txt(g, 0, 4, it.text, 11, true, C.navy, {'text-anchor':'middle'});  // optionale Aufschrift
  },
  /* Gesangsmikrofon ca. 34 x 49 PE: Kapsel mit Rillen, U-Bügel, Stiel */
  mic(g){
    const cid = 'mclip' + (++_uid);                        // eindeutige Clip-ID
    const cp = el('clipPath',{id:cid}, g);
    el('ellipse',{cx:0, cy:-7.8, rx:11.5, ry:16}, cp);
    el('ellipse',{cx:0, cy:-7.8, rx:11.5, ry:16, fill:C.mic}, g);
    const st = el('g',{'clip-path':`url(#${cid})`, stroke:C.slate, 'stroke-width':1.1}, g);
    for (let y = -19; y <= 5; y += 4) el('line',{x1:-13, y1:y, x2:13, y2:y}, st);   // Rillen alle 4 PE
    el('ellipse',{cx:0, cy:-7.8, rx:11.5, ry:16, fill:'none', stroke:C.slate, 'stroke-width':2}, g);
    el('path',{d:'M-16 -9 V2 Q-16 13 0 13 Q16 13 16 2 V-9', fill:'none', stroke:C.slate, 'stroke-width':2, 'stroke-linecap':'round'}, g);
    el('line',{x1:0, y1:13, x2:0, y2:24, stroke:C.slate, 'stroke-width':2.2, 'stroke-linecap':'round'}, g);
  },
  /* Stromanschluss: gelbes Warndreieck mit Blitz, ca. 48 x 41 PE */
  power(g){
    el('path',{d:'M0 -19.5 L22.5 19.5 L-22.5 19.5 Z', fill:C.power, stroke:C.navy, 'stroke-width':2.6, 'stroke-linejoin':'round'}, g);
    el('path',{d:'M2.6 -6.5 L-5.2 5.5 L-0.6 5.5 L-2.6 14.5 L5.4 2.2 L0.8 2.2 Z', fill:C.navy}, g);
  },
  /* Schlagzeug: Bassdrum (Rechteck), Toms (grün), Becken (beige), Hocker (dunkel) */
  drums(g){
    const sw = 1.5;                                        // Linienstärke PE
    el('rect',{x:-62.5, y:-79, width:131, height:73.5, rx:5, fill:C.tom, stroke:C.tomLine, 'stroke-width':sw}, g);
    [[-53,-37,33.5],[-95,27,31.5],[105,12,35.5]].forEach(([x,y,r]) => el('circle',{cx:x, cy:y, r, fill:C.tom, stroke:C.tomLine, 'stroke-width':sw}, g));
    [[-114,-5,28],[4.5,-78,33],[70,-49,32],[94,86.5,31.5]].forEach(([x,y,r]) => el('circle',{cx:x, cy:y, r, fill:C.cym, stroke:C.cymLine, 'stroke-width':sw}, g));
    el('circle',{cx:3, cy:36, r:24, fill:C.navy}, g);     // Hocker
  },
  /* Akkordeon 96 x 64.5 PE */
  accordion(g){
    el('rect',{x:-48, y:-32.25, width:96, height:64.5, rx:6, fill:C.navy}, g);
    el('rect',{x:-25, y:-28, width:49, height:56, fill:C.wine}, g);
    for (let i = 1; i < 6; i++) el('line',{x1:-25+i*49/6, y1:-28, x2:-25+i*49/6, y2:28, stroke:C.wineDark, 'stroke-width':1.2}, g); // Balgfalten
    [-21.75,-7.25,7.25,21.75].forEach(y => { el('circle',{cx:-37, cy:y, r:3.5, fill:C.dot}, g); el('circle',{cx:36.5, cy:y, r:3.5, fill:C.dot}, g); });
  },
  /* Violine ca. 34 x 85 PE (vor Massstab) */
  violin(g){
    el('path',{d:'M0 -12 C9 -12 14 -8 14 -1 C14 5 9 7 9 11 C9 15 17 18 17 26 C17 35 9 38 0 38 C-9 38 -17 35 -17 26 C-17 18 -9 15 -9 11 C-9 7 -14 5 -14 -1 C-14 -8 -9 -12 0 -12 Z',
      fill:C.wine, stroke:C.navy, 'stroke-width':2, 'stroke-linejoin':'round'}, g);
    el('rect',{x:-2.6, y:-40, width:5.2, height:50, rx:1.5, fill:C.navy}, g);                 // Hals
    el('circle',{cx:0, cy:-43, r:4.6, fill:C.navy}, g);                                        // Schnecke
    el('path',{d:'M-7 13 Q-9 18 -7 23 M7 13 Q9 18 7 23', fill:'none', stroke:C.navy, 'stroke-width':1.6, 'stroke-linecap':'round'}, g); // F-Löcher
    el('line',{x1:-6.5, y1:18.5, x2:6.5, y2:18.5, stroke:C.dot, 'stroke-width':1.8}, g);      // Steg
    el('path',{d:'M-3.5 24 H3.5 L2.4 35 H-2.4 Z', fill:C.navy}, g);                            // Saitenhalter
  },
  /* Gitarre (für zusätzliche Elemente) ca. 40 x 100 PE */
  guitar(g){
    el('path',{d:'M0 -8 C11 -8 15 -3 15 4 C15 10 10 12 10 15 C10 18 19 21 19 31 C19 42 10 46 0 46 C-10 46 -19 42 -19 31 C-19 21 -10 18 -10 15 C-10 12 -15 10 -15 4 C-15 -3 -11 -8 0 -8 Z',
      fill:C.cym, stroke:C.navy, 'stroke-width':2, 'stroke-linejoin':'round'}, g);
    el('circle',{cx:0, cy:16, r:5.5, fill:C.navy}, g);                                        // Schallloch
    el('rect',{x:-2.8, y:-48, width:5.6, height:56, rx:1.5, fill:C.navy}, g);                 // Hals
    el('rect',{x:-5, y:-56, width:10, height:11, rx:2, fill:C.navy}, g);                      // Kopf
    el('line',{x1:-8, y1:33, x2:8, y2:33, stroke:C.navy, 'stroke-width':2.2}, g);             // Steg
  },
  /* DI-Box 30 x 19 PE */
  di(g){
    el('rect',{x:-15, y:-9.5, width:30, height:19, rx:2.5, fill:C.navy}, g);
    txt(g, 0, 4, 'DI', 10.5, true, '#FFFFFF', {'text-anchor':'middle'});
  },
  /* Beschriftung: Karte mit dunklem Balken links; Zeile 1 fett, weitere normal */
  label(g, it, linesOverride){
    const lines = linesOverride || ((it.lines && it.lines.length) ? it.lines : ['Neu']);   // inkl. In-Ear-Zeilen aus drawStage
    const h = 15 + 16 * lines.length;                      // 31 / 47 / 63 PE für 1 / 2 / 3 Zeilen
    let maxW = 0;
    lines.forEach((s, i) => { maxW = Math.max(maxW, tw(s, i ? 12 : 14, i === 0, 'RiderPlan')); });
    const w = Math.max(it.w || 90, Math.ceil(maxW + 24)); // stiller Fallback: Karte wächst mit dem Text (gespeicherte Breite bleibt)
    el('rect',{x:0, y:0, width:w, height:h, rx:1.5, fill:C.cream, stroke:C.tan, 'stroke-width':1.2}, g);
    el('rect',{x:0, y:0, width:4.5, height:h, fill:C.navy}, g);                                // Balken links
    lines.forEach((s, i) => txt(g, 13, 19.5 + 16*i, s, i ? 12 : 14, i === 0, i ? C.slate : C.navy));
  }
};

/* ============================================================================
   BÜHNENPLAN (Seite 2, Gruppe in PE)
   opts.selectedId = hervorgehobenes Element; opts.interactive = Trefferflächen + Auswahl
   ========================================================================== */
function drawStage(root, st, opts){
  opts = opts || {};
  /* Publikum-Hinweis: Buchstaben einzeln gesetzt (Sperrung ohne letter-spacing, PDF-sicher) */
  el('path',{d:'M273 21 L282 7 L291 21 Z', fill:C.slate}, root);
  el('path',{d:'M419 21 L428 7 L437 21 Z', fill:C.slate}, root);
  const word = 'PUBLIKUM', fs = 13.5, sp = 4.6;            // Schriftgrösse und Sperrung PE
  const total = [...word].reduce((a, ch) => a + tw(ch, fs, true, 'RiderPlan') + sp, -sp);
  let px = 355 - total / 2;                                // zentriert auf Planmitte x = 355
  [...word].forEach(ch => { txt(root, +px.toFixed(2), 20, ch, fs, true, C.slate); px += tw(ch, fs, true, 'RiderPlan') + sp; });
  /* Bühnenrahmen */
  el('rect',{x:7, y:34.5, width:695.5, height:740, rx:7, fill:'#FFFFFF', stroke:C.navy, 'stroke-width':2.2, class:'stage-floor'}, root);
  /* Elemente in Reihenfolge (unten -> oben) */
  const layer = el('g',{class:'items'}, root);
  const mains = mainLabels(st);                            // Träger der In-Ear-Zeilen
  st.stage.forEach(it => {
    if (!isVisible(st, it)) return;                        // abgewählte Instrumente überspringen
    const g = el('g',{class:'item', 'data-id':it.id, transform:itemTransform(it)}, layer);
    if (it.type === 'label' || !SHAPES[it.type]) SHAPES.label(g, it, labelLines(st, it, mains)); // unbekannter Typ -> als Beschriftung
    else SHAPES[it.type](g, it);
    if (opts.interactive) addHitArea(g);                   // grössere Trefferfläche für Finger
    if (opts.interactive && it.id === opts.selectedId) markSelected(g);
  });
  /* Legende unter dem Rahmen */
  const p = el('g',{transform:'translate(25 795.5) scale(0.5)'}, root); SHAPES.power(p);
  txt(root, 51, 800, 'Stromanschluss erforderlich (CH, Typ J, 230 V)', 12, false, C.slate);
  el('rect',{x:371, y:788.5, width:24, height:15, rx:2, fill:C.navy}, root);
  txt(root, 403, 800, 'Monitor', 12, false, C.slate);
  el('rect',{x:473, y:788.5, width:24, height:15, rx:2, fill:C.amp, stroke:C.slate, 'stroke-width':1}, root);
  txt(root, 505, 800, 'Verstärker', 12, false, C.slate);
}
/* Unsichtbare Trefferfläche (nur Bildschirm), damit dünne Symbole gut greifbar sind */
function addHitArea(g){
  const b = g.getBBox();
  const pad = 6;                                           // zusätzlicher Rand PE
  g.insertBefore(el('rect',{x:b.x-pad, y:b.y-pad, width:b.width+2*pad, height:b.height+2*pad, fill:'#000', 'fill-opacity':0, class:'hit'}), g.firstChild);
}
/* Auswahlrahmen (dreht mit dem Element) */
function markSelected(g){
  const b = g.getBBox();
  el('rect',{x:b.x-2, y:b.y-2, width:b.width+4, height:b.height+4, rx:4, fill:'none', stroke:'#2F7DE1', 'stroke-width':2, 'stroke-dasharray':'6 4', class:'sel-box', 'pointer-events':'none', 'vector-effect':'non-scaling-stroke'}, g);
}

/* ============================================================================
   SEITENBAUSTEINE (CSS-px)
   ========================================================================== */
/* Abschnittstitel "01 TITEL" mit Linie; top = Oberkante */
function drawSection(root, top, num, title){
  txt(root, PAGE.left, top + 18, num, 13, true, C.orange);
  txt(root, 104, top + 16, title, 18, true, C.navy);
  el('line',{x1:104, y1:top + 25.5, x2:PAGE.right, y2:top + 25.5, stroke:C.tan, 'stroke-width':1}, root);
  return top + 26;                                         // Unterkante
}
/* Hinweisbox (grün/rot) mit fettem Titel und umbrochenem Text; liefert Unterkante */
function drawNote(root, top, title, text, bg, accent){
  const fs = 12, lh = 16.5, x0 = 77, maxW = PAGE.right - 14 - x0;   // Schrift, Zeilenabstand, Textanfang, Breite
  const indent = tw(title, fs, true) + 2 + tw(' ', fs, false);      // erste Zeile beginnt nach dem Titel
  const lines = wrapText(text, fs, maxW, indent);
  const h = 8 + lines.length * lh + 9;                     // Innenabstand oben 8, unten 9
  el('rect',{x:PAGE.left, y:top, width:PAGE.inner, height:h, fill:bg}, root);
  el('rect',{x:PAGE.left, y:top, width:3, height:h, fill:accent}, root);
  txt(root, x0, top + 20, title, fs, true, accent);
  lines.forEach((ln, i) => txt(root, +(i ? x0 : x0 + indent).toFixed(2), +(top + 20 + i*lh).toFixed(2), ln, fs, false, C.navy));
  return top + h;
}
/* Tabelle mit Kopfzeile; rows = [[Text, Anzahl], …]; liefert Unterkante */
function drawTable(root, top, head, rows){
  const L = PAGE.left, W = PAGE.inner, split = 545.48, rh = 26.39, hh = 26;  // Spaltengrenze, Zeilen-/Kopfhöhe
  el('rect',{x:L, y:top, width:W, height:hh, fill:C.navy}, root);
  el('line',{x1:split, y1:top, x2:split, y2:top + hh, stroke:C.thLine, 'stroke-width':1}, root);
  txt(root, 67.5, top + 16.25, head[0], 11, true, '#FFFFFF');
  txt(root, 726.2, top + 16.25, head[1], 11, true, '#FFFFFF', {'text-anchor':'end'});
  rows.forEach((r, i) => {
    const y = top + hh + i * rh;
    const fill = i % 2 ? C.cream : '#FFFFFF';              // jede zweite Zeile crème
    el('rect',{x:L, y, width:split - L, height:rh, fill, stroke:C.tan, 'stroke-width':1}, root);
    el('rect',{x:split, y, width:L + W - split, height:rh, fill, stroke:C.tan, 'stroke-width':1}, root);
    txt(root, 67.5, +(y + 17.69).toFixed(2), r[0], 13.4, false, C.navy);
    txt(root, 726.2, +(y + 17.69).toFixed(2), r[1], 13.4, true, C.orange, {'text-anchor':'end'});
  });
  return top + hh + rows.length * rh;
}
/* Zeilen der Instrumentenübersicht: nach 'table' gruppiert, Anzahl = eingeschaltete */
function instrumentRows(st){
  const rows = [];
  st.instruments.forEach(i => {
    let r = rows.find(x => x[0] === i.table);
    if (!r) { r = [i.table, 0]; rows.push(r); }            // neue Zeile in Reihenfolge des ersten Auftretens
    if (i.on) r[1]++;                                      // nur eingeschaltete zählen
  });
  return rows.filter(r => r[1] > 0);                       // leere Zeilen weglassen
}

/* ============================================================================
   SEITEN
   ========================================================================== */
/* Seite 1: Kopf, optionaler Hinweis, Instrumentenübersicht, Schlagzeug-Setup */
function renderPage1(svg, st){
  svg.textContent = '';                                    // leeren
  svg.setAttribute('viewBox', `0 0 ${PAGE.w} ${PAGE.h}`);
  const root = el('g',{'font-family':'RiderText'}, svg);
  el('rect',{x:0, y:0, width:PAGE.w, height:PAGE.h, fill:'#FFFFFF'}, root);
  /* Kopfbalken 121 px hoch */
  el('rect',{x:PAGE.left, y:57, width:PAGE.inner, height:121, fill:C.navy}, root);
  txt(root, 78, 82.5, st.meta.kicker, 10, true, C.beige);
  txt(root, 78, 115.5, st.meta.band, 30.7, true, '#FFFFFF');
  txt(root, 78, 136.5, st.meta.subtitle, 13.6, false, C.grey);
  let x = 78;                                              // Laufposition Metazeile
  [['Besetzung', st.meta.besetzung], ['Stromnorm', st.meta.strom], ['Stand', st.meta.stand]].forEach(([k, v]) => {
    txt(root, +x.toFixed(2), 160, k, 10.8, true, '#FFFFFF'); x += tw(k, 10.8, true) + 3;      // Bezeichnung + 3 px
    txt(root, +x.toFixed(2), 160, v, 10.8, false, C.grey);   x += tw(v, 10.8, false) + 14;    // Wert + 14 px Lücke
  });
  /* Hinweisbox (optional) */
  let y = 178;
  if (st.hint && st.hint.on) y = drawNote(root, 204, st.hint.title, st.hint.text, C.greenBg, C.green);
  /* 01 Instrumentenübersicht */
  y = drawSection(root, y + 36, '01', 'INSTRUMENTENÜBERSICHT');
  y = drawTable(root, y + 22, ['INSTRUMENT', 'ANZAHL'], instrumentRows(st));
  /* Schlagzeug-Setup nur, wenn Schlagzeug eingeschaltet */
  const d = findInstr(st, 'drums');
  if ((!d || d.on) && st.drumSetup.length) drawTable(root, y + 30, ['SCHLAGZEUG – SETUP', 'ANZAHL'], st.drumSetup);
}
/* Seite 2: Bühnenplan, Stromhinweis, Kontakte */
function renderPage2(svg, st, opts){
  svg.textContent = '';
  svg.setAttribute('viewBox', `0 0 ${PAGE.w} ${PAGE.h}`);
  const root = el('g',{'font-family':'RiderText'}, svg);
  el('rect',{x:0, y:0, width:PAGE.w, height:PAGE.h, fill:'#FFFFFF'}, root);
  drawSection(root, 60, '02', 'BÜHNENPLAN');
  const stage = el('g',{id: opts && opts.interactive ? 'stageRoot' : null, 'font-family':'RiderPlan',
    transform:`translate(${STAGE_POS.x} ${STAGE_POS.y}) scale(${STAGE_POS.scale})`}, root);
  drawStage(stage, st, opts);
  let y = drawNote(root, 822.92, st.powerNote.title, st.powerNote.text, C.redBg, C.red);
  y += 30;                                                 // Abstand zur Linie
  el('line',{x1:PAGE.left, y1:y + 0.5, x2:PAGE.right, y2:y + 0.5, stroke:C.tan, 'stroke-width':1}, root);
  (st.contacts || []).forEach((c, i) => {
    const by = +(y + 34 + i * 18.5).toFixed(2);            // Grundlinie Kontaktzeile
    txt(root, PAGE.left, by, c.role, 11.8, true, C.navy);
    txt(root, +(PAGE.left + tw(c.role, 11.8, true) + 5).toFixed(2), by, c.text, 11.8, false, C.navy);   // 5 px Abstand nach der Rolle
  });
}
