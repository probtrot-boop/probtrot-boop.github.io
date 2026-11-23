/* ============================================================================
   crypto.js – Verschlüsselung des Rider-Stands mit einem Band-Passwort
   ----------------------------------------------------------------------------
   Zweck:     Auf öffentlichem Hosting (GitHub Pages) liegt der Stand nur
              verschlüsselt im Repo (data/rider.enc.json). Ohne Passwort sind
              weder Kontakte noch Bühnenplan lesbar.
   Verfahren: Schlüssel = PBKDF2-SHA-256(Passwort, Salz 16 Byte, 600 000
              Durchläufe) -> AES-GCM 256 Bit; je Datei neuer Zufalls-IV 12 Byte.
              Alles über die Web Crypto API des Browsers (nur HTTPS/localhost).
   Annahmen:  600 000 Durchläufe = OWASP-Empfehlung für PBKDF2-SHA-256;
              dauert auf Handys ca. 0.5–2 s pro Entsperren (einmalig).
   Dateiformat data/rider.enc.json:
              { v:1, alg:"AES-GCM-256", kdf:"PBKDF2-SHA256", iter, salt, iv, ct }
              (salt, iv, ct als base64)
   ========================================================================== */
'use strict';

const ENC_ITER = 600000;                                  // PBKDF2-Durchläufe
const KEY_STORE = 'watm-rider-key-v1';                    // gemerkter Schlüssel auf dem Gerät (nicht das Passwort)

/* ===== Umwandeln: Bytes <-> base64 ===== */
function b64enc(buf){
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); // blockweise
  return btoa(s);
}
function b64dec(str){
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);   // Zeichen -> Byte
  return out;
}

/* ===== Schlüssel aus Passwort ableiten ===== */
async function deriveKey(password, salt, iter){
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name:'PBKDF2', salt, iterations: iter || ENC_ITER, hash:'SHA-256' },
    base, { name:'AES-GCM', length:256 }, true, ['encrypt', 'decrypt']);  // exportierbar, damit "merken" möglich ist
}

/* ===== Verschlüsseln: Stand -> Dateiobjekt ===== */
async function encryptState(st, key, salt, iter){
  const iv = crypto.getRandomValues(new Uint8Array(12));  // neuer IV pro Datei (Pflicht bei AES-GCM)
  const ct = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(st)));
  return { v:1, alg:'AES-GCM-256', kdf:'PBKDF2-SHA256', iter: iter || ENC_ITER, salt: b64enc(salt), iv: b64enc(iv), ct: b64enc(ct) };
}

/* ===== Entschlüsseln: Dateiobjekt -> Stand (wirft bei falschem Schlüssel) ===== */
async function decryptState(file, key){
  const pt = await crypto.subtle.decrypt({ name:'AES-GCM', iv: b64dec(file.iv) }, key, b64dec(file.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

/* ===== Gerät: Schlüssel merken / laden / vergessen =====
   Gespeichert wird der abgeleitete Schlüssel samt Salz, nicht das Passwort.
   Passt das Salz nicht mehr (Passwort gewechselt), wird neu gefragt. */
async function rememberKey(key, saltB64){
  try {
    const raw = await crypto.subtle.exportKey('raw', key);
    localStorage.setItem(KEY_STORE, JSON.stringify({ salt: saltB64, key: b64enc(raw) }));   // auf dem Gerät ablegen
  } catch (e) { /* stiller Fallback: Speicher gesperrt -> beim nächsten Mal erneut fragen */ }
}
async function loadRememberedKey(saltB64){
  try {
    const d = JSON.parse(localStorage.getItem(KEY_STORE) || 'null');
    if (!d || d.salt !== saltB64) return null;             // anderes Salz = anderes Passwort
    return await crypto.subtle.importKey('raw', b64dec(d.key), { name:'AES-GCM' }, true, ['encrypt', 'decrypt']);
  } catch (e) { return null; }
}
function forgetKey(){ try { localStorage.removeItem(KEY_STORE); } catch (e) {} }
