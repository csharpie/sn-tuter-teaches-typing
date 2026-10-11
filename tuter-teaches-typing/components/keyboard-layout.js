// US QWERTY layout and finger map (v1 supports US QWERTY only, C2.1).
// Shared by the virtual keyboard and the typing session.

/** Fingers, left pinky to right pinky. */
export const FINGERS = ['L5', 'L4', 'L3', 'L2', 'thumb', 'R2', 'R3', 'R4', 'R5'];

const k = (id, finger, extra = {}) => ({
  id, label: id, finger, width: 1, ...extra,
});

/** Keyboard rows. `width` is in key units; `label` is what the cap shows. */
export const ROWS = [
  [
    k('`', 'L5', { shift: '~' }),
    k('1', 'L5', { shift: '!' }),
    k('2', 'L4', { shift: '@' }),
    k('3', 'L3', { shift: '#' }),
    k('4', 'L2', { shift: '$' }),
    k('5', 'L2', { shift: '%' }),
    k('6', 'R2', { shift: '^' }),
    k('7', 'R2', { shift: '&' }),
    k('8', 'R3', { shift: '*' }),
    k('9', 'R4', { shift: '(' }),
    k('0', 'R5', { shift: ')' }),
    k('-', 'R5', { shift: '_' }),
    k('=', 'R5', { shift: '+' }),
    k('backspace', 'R5', { label: 'Backspace', width: 2, special: true }),
  ],
  [
    k('tab', 'L5', { label: 'Tab', width: 1.5, special: true }),
    k('q', 'L5'),
    k('w', 'L4'),
    k('e', 'L3'),
    k('r', 'L2'),
    k('t', 'L2'),
    k('y', 'R2'),
    k('u', 'R2'),
    k('i', 'R3'),
    k('o', 'R4'),
    k('p', 'R5'),
    k('[', 'R5', { shift: '{' }),
    k(']', 'R5', { shift: '}' }),
    k('\\', 'R5', { shift: '|', width: 1.5 }),
  ],
  [
    k('caps', 'L5', { label: 'Caps', width: 1.75, special: true }),
    k('a', 'L5'),
    k('s', 'L4'),
    k('d', 'L3'),
    k('f', 'L2', { home: true }),
    k('g', 'L2'),
    k('h', 'R2'),
    k('j', 'R2', { home: true }),
    k('k', 'R3'),
    k('l', 'R4'),
    k(';', 'R5', { shift: ':' }),
    k("'", 'R5', { shift: '"' }),
    k('enter', 'R5', { label: 'Enter', width: 2.25, special: true }),
  ],
  [
    k('shift-left', 'L5', { label: 'Shift', width: 2.25, special: true }),
    k('z', 'L5'),
    k('x', 'L4'),
    k('c', 'L3'),
    k('v', 'L2'),
    k('b', 'L2'),
    k('n', 'R2'),
    k('m', 'R2'),
    k(',', 'R3', { shift: '<' }),
    k('.', 'R4', { shift: '>' }),
    k('/', 'R5', { shift: '?' }),
    k('shift-right', 'R5', { label: 'Shift', width: 2.75, special: true }),
  ],
  [k('space', 'thumb', { label: '', width: 6.25, special: true })],
];

const KEY_BY_ID = new Map();
const KEY_BY_SHIFTED = new Map();
ROWS.flat().forEach((key) => {
  KEY_BY_ID.set(key.id, key);
  if (key.shift) KEY_BY_SHIFTED.set(key.shift, key);
});

/**
 * Physical key for a character: {key, shift} where `shift` names the Shift key
 * to hold (the opposite hand), or null. Returns null for characters that are
 * not on a US keyboard.
 * @param {string} ch
 */
export function keyForChar(ch) {
  if (!ch) return null;
  if (ch === ' ') return { key: KEY_BY_ID.get('space'), shift: null };
  const lower = ch.toLowerCase();
  if (KEY_BY_ID.has(ch) && ch.length === 1) {
    return { key: KEY_BY_ID.get(ch), shift: null };
  }
  let key = null;
  if (lower !== ch && KEY_BY_ID.has(lower)) key = KEY_BY_ID.get(lower);
  else if (KEY_BY_SHIFTED.has(ch)) key = KEY_BY_SHIFTED.get(ch);
  if (!key) return null;
  return { key, shift: key.finger.startsWith('L') ? 'shift-right' : 'shift-left' };
}

/**
 * Physical key id for a stored key_char (lowercased expected character, or
 * "space"): shifted symbols map to their base key so "!" and "1" share a cap.
 * @param {string} keyChar
 */
export function keyIdForKeyChar(keyChar) {
  if (keyChar === 'space') return 'space';
  const found = keyForChar(keyChar);
  return found ? found.key.id : null;
}

/** Fingers used to type a character (the key's finger, plus Shift's). */
export function fingersForChar(ch) {
  const found = keyForChar(ch);
  if (!found) return [];
  const fingers = [found.key.finger];
  if (found.shift) fingers.push(KEY_BY_ID.get(found.shift).finger);
  return fingers;
}
