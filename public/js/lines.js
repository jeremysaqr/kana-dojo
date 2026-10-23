// Station-board world: each set is a rail line with a colour and a code letter.
// Dakuten sets run as a "rapid" service on their base line (same colour, double band).
import { kanaById } from '/core/kana.js';

export const LINES = {
  a:  { code: 'A', colour: 'var(--line-a)', base: 'a' },
  k:  { code: 'K', colour: 'var(--line-k)', base: 'k' },
  s:  { code: 'S', colour: 'var(--line-s)', base: 's' },
  t:  { code: 'T', colour: 'var(--line-t)', base: 't' },
  n:  { code: 'N', colour: 'var(--line-n)', base: 'n' },
  h:  { code: 'H', colour: 'var(--line-h)', base: 'h' },
  m:  { code: 'M', colour: 'var(--line-m)', base: 'm' },
  y:  { code: 'Y', colour: 'var(--line-y)', base: 'y' },
  r:  { code: 'R', colour: 'var(--line-r)', base: 'r' },
  wn: { code: 'W', colour: 'var(--line-wn)', base: 'wn' },
  g:  { code: 'G', colour: 'var(--line-k)', base: 'k', rapid: true },
  z:  { code: 'Z', colour: 'var(--line-s)', base: 's', rapid: true },
  d:  { code: 'D', colour: 'var(--line-t)', base: 't', rapid: true },
  b:  { code: 'B', colour: 'var(--line-h)', base: 'h', rapid: true },
  p:  { code: 'P', colour: 'var(--line-h)', base: 'h', rapid: true },
};

export const SET_NAMES = {
  a: 'Vowels', k: 'Ka row', s: 'Sa row', t: 'Ta row', n: 'Na row', h: 'Ha row', m: 'Ma row',
  y: 'Ya row', r: 'Ra row', wn: 'Wa · N', g: 'Ga row', z: 'Za row', d: 'Da row', b: 'Ba row', p: 'Pa row',
};

/** Station code for a kana, e.g. し → "S02"; ん → "W06". */
export function stationCode(id) {
  const k = kanaById.get(id);
  if (!k) return '';
  const line = LINES[k.set];
  const num = k.grid.row === 'nn' ? 6 : k.grid.col + 1;
  return `${line.code}${String(num).padStart(2, '0')}`;
}

export function lineFor(id) {
  const k = kanaById.get(id);
  return k ? LINES[k.set] : null;
}

export const SCRIPT_LABEL = { hiragana: 'Hiragana', katakana: 'Katakana' };
export const SCRIPT_NATIVE = { hiragana: 'ひらがな', katakana: 'カタカナ' };
