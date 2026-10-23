// Japanese speech with a single gate. RULE: never speak a kana before the learner has answered it
// in a quiz. The lesson view opens the gate only in the study phase and after an answer, and closes
// it (cancelling any speech) whenever a new quiz prompt appears.

let gateOpen = false;
let muted = false;
let voice = null;
const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

// Audit counters, read by the end-to-end checks: `refusedWhileClosed` counts calls that the gate
// stopped; `spokenWhileClosed` must always stay 0.
export const audit = { spoken: 0, refusedWhileClosed: 0, spokenWhileClosed: 0, lastText: null };

// Chrome fills the voice list asynchronously, so "no Japanese voice" is only known once the list
// has loaded (or a short wait has passed with nothing arriving).
let voicesKnown = !synth;

function pickVoice() {
  if (!synth) return;
  const voices = synth.getVoices();
  if (voices.length) voicesKnown = true;
  voice = voices.find((v) => v.lang === 'ja-JP') || voices.find((v) => v.lang?.toLowerCase().startsWith('ja')) || null;
  for (const fn of listeners) fn();
}
const listeners = new Set();
export function onVoicesChanged(fn) { listeners.add(fn); }
export function offVoicesChanged(fn) { listeners.delete(fn); }
if (synth) {
  pickVoice();
  synth.addEventListener?.('voiceschanged', pickVoice);
  setTimeout(() => { if (!voicesKnown) { voicesKnown = true; for (const fn of listeners) fn(); } }, 1500);
}

export function hasJapaneseVoice() { return !!voice; }
/** True once we can say for sure that no Japanese voice is available (drives the visible hint). */
export function knownSilent() { return voicesKnown && !voice; }
export function isSupported() { return !!synth; }

/** Open the gate (study phase / after an answer). */
export function openGate() { gateOpen = true; }

/** Close the gate and silence anything playing (a new quiz prompt is on screen). */
export function closeGate() {
  gateOpen = false;
  if (synth) synth.cancel();
}

export function isGateOpen() { return gateOpen; }
export function setMuted(m) { muted = !!m; if (muted && synth) synth.cancel(); }

/** Speak a kana. Returns true only if speech was actually requested. */
export function say(text) {
  if (!gateOpen) { audit.refusedWhileClosed++; return false; }
  if (muted || !synth || !voice) return false;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = 'ja-JP';
  u.rate = 0.8;
  if (!gateOpen) audit.spokenWhileClosed++;
  audit.spoken++;
  audit.lastText = text;
  synth.speak(u);
  return true;
}
