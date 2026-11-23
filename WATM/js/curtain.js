/* ============================================================================
   curtain.js – Vorhang beim Öffnen des Rider-Editors
   ----------------------------------------------------------------------------
   Zweck:     Zeigt das Tafelbild (img/vorhang.jpg, «E = Werli + the Melodies»)
              mit dem Titel «Rider-Editor» als geschlossenen Vorhang. Nach
              1.5 s gehen die zwei Hälften nach links/rechts auf; Antippen
              öffnet sofort. Danach wird der Vorhang entfernt.
   Ablauf:    editor.js ruft nach dem Laden (bei GitHub: nach dem Passwort)
              Curtain.show() und nach dem Zeichnen Curtain.openAfter(1500).
   Annahmen:  Markup #curtain steht in index.html (zwei Hälften mit derselben
              Szene). Lädt das Bild nicht innert 2.5 s, öffnet der Vorhang
              trotzdem (stiller Fallback, Editor nie blockiert).
   Einheiten: Zeiten in Millisekunden (ms).
   ========================================================================== */
'use strict';

const Curtain = (() => {
  const OPEN_MS = 1100;                                    // Dauer der Öffnung (muss zum CSS passen)
  const IMG_WAIT_MS = 2500;                                // max. Wartezeit auf das Bild
  let el = null, timer = null, opened = false;

  /* Bild geladen? (oder Wartezeit abgelaufen) */
  function imageReady(){
    const img = el && el.querySelector('img');
    if (!img) return Promise.resolve();
    const load = img.decode ? img.decode().catch(() => {}) : Promise.resolve();
    return Promise.race([load, new Promise(r => setTimeout(r, IMG_WAIT_MS))]);
  }

  /* Geschlossenen Vorhang anzeigen (deckt alles ab) */
  function show(){
    el = document.getElementById('curtain');
    if (!el) return;
    el.hidden = false;                                     // sichtbar, geschlossen
    document.body.dataset.curtain = 'closed';
    el.addEventListener('click', open, { once:true });     // Antippen = sofort öffnen
  }

  /* Öffnen nach 'ms' – Zeit läuft erst, wenn das Bild da ist */
  function openAfter(ms){
    if (!el) return;
    imageReady().then(() => { if (!opened) timer = setTimeout(open, ms); });
  }

  /* Öffnen: Hälften wegschieben, danach entfernen */
  function open(){
    if (!el || opened) return;
    opened = true; clearTimeout(timer);
    el.classList.add('open');                              // CSS-Übergang startet
    document.body.dataset.curtain = 'opening';
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => {
      el.hidden = true; el.remove();                       // Vorhang ganz weg (blockiert nichts mehr)
      document.body.dataset.curtain = 'done';
    }, reduce ? 350 : OPEN_MS + 80);
  }

  return { show, openAfter, open };
})();
