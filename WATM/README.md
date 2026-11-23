# WATM – Technischer Rider «Werli and the Melodies»

Interaktiver Rider-Editor für die Band. Instrumente an-/abwählen, Bühnenplan verschieben, PDF erzeugen.

**Adresse:** https://probtrot-boop.github.io/WATM/
**Zugang:** Passwort (von Tom). Ohne Passwort ist der Rider nicht lesbar.

---

## Für die Band – so geht's

1. Adresse öffnen, Passwort eingeben. Mit «Auf diesem Gerät merken» fragt die Seite auf diesem Gerät nicht mehr.
2. **Instrumente an/aus:** oben die Instrumente antippen. Das wirkt auf den Bühnenplan und die Instrumentenübersicht.
3. **Bühnenplan:** Element antippen = auswählen, ziehen = verschieben. Die Leiste unten dreht, ändert die Grösse, bearbeitet, dupliziert oder löscht.
   Auf dem Handy die Ansicht «Bühne» oder «Bühne 2×» wählen.
4. **Hinzufügen (z.B. Monitor):** leere Bühnenfläche antippen → Element wählen; es erscheint genau dort.
   Oder über dem Plan «+ Monitor» bzw. «+ Element» (Bühnenmitte). Löschen: Element antippen → 🗑 zweimal.
5. **In-Ear pro Musiker:** ein Element des Instruments antippen (Beschriftung, Mikrofon, Verstärker …) → 🎧 →
   «Funk In-Ear» oder «wired In-Ear» wählen, Zusatzzeile anpassen (z.B. «XLR auf Bühne»).
   Die Angabe erscheint automatisch in der Beschriftung des Instruments und im PDF. Auch unter «Instrumente verwalten» einstellbar.
6. **Texte, Kontakte, «Stand»-Datum:** Seitenleiste → «Texte & Kontakte».
7. **PDF:** Knopf «PDF» → 2 Seiten A4, fertig zum Versenden an Veranstalter.
8. **Rückgängig:** ↶ oben.

Eigene Änderungen bleiben nur im eigenen Browser, der offizielle Stand ändert sich dadurch nicht.
Wer eine Änderung für alle will: Knopf «Stand-Datei» → die Datei `rider.enc.json` an Tom schicken.

---

## Für Tom – offiziellen Stand ändern

1. Im Editor anpassen → Knopf **«Stand-Datei»** → `rider.enc.json` wird heruntergeladen (verschlüsselt).
2. Auf GitHub den Ordner `WATM/data` öffnen:
   https://github.com/probtrot-boop/probtrot-boop.github.io/tree/main/WATM/data
3. **Add file → Upload files** → `rider.enc.json` hineinziehen → **Commit changes** (die alte Datei wird ersetzt).
   Am Handy: Browser auf «Desktop-Ansicht» stellen. Oder die Datei Claude geben und sagen «auf WATM hochladen».
4. Nach etwa 1–2 Minuten sehen alle den neuen Stand. Wer noch eigene Änderungen im Browser hat, bekommt beim Öffnen die Frage «Entwurf laden / Verwerfen».

### Passwort ändern
Seitenleiste → «Daten & Sicherung» → «Passwort ändern» → neues Passwort zweimal eingeben → neue `rider.enc.json` hochladen (wie oben).
Danach gilt nur noch das neue Passwort; allen Bandmitgliedern neu mitteilen. So entziehst du auch jemandem den Zugang.

### Was geschützt ist – und was nicht
- **Geschützt (verschlüsselt):** der ganze Rider-Stand: Kontakte, Instrumente, Bühnenplan, Texte (`data/rider.enc.json`).
- **Öffentlich:** der Programmcode (HTML/JS), die Schriften und diese Anleitung. Sie enthalten keine Kontaktdaten.
- Das Passwort steht nirgends im Repo. Es ist ein gemeinsames Band-Passwort: Wer es kennt, kann den Rider öffnen.

---

## Technik (kurz)

| Datei | Inhalt |
|---|---|
| `index.html` | Seite, Gestaltung, Sperrbildschirm |
| `js/core.js` | Standardaufbau, Symbole, Zeichnen beider A4-Seiten (SVG) |
| `js/editor.js` | Bedienung, Rückgängig, Entwurf, Laden/Entsperren, Stand-Datei |
| `js/crypto.js` | Verschlüsselung: PBKDF2-SHA-256 (600 000 Durchläufe) → AES-GCM 256 |
| `js/pdf.js` | PDF-Export (jsPDF + svg2pdf, Schriften eingebettet) |
| `data/rider.enc.json` | offizieller Stand, verschlüsselt |
| `fonts/` | RiderText (aus Carlito), RiderPlan (aus Lato) – SIL OFL 1.1, siehe `fonts/LIZENZ.txt` |
| `lib/` | jsPDF 4.2.1, svg2pdf.js 2.9.0 (MIT-Lizenz) |

Dieselbe Codebasis läuft auch als privates Claude-Artefakt. Dort liegt der Stand unverschlüsselt in `data/rider.json`, und «Speichern» schreibt direkt ins Artefakt.
