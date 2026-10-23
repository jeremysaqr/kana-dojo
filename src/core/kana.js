// Kana Dojo character data. Pure data + tiny helpers; no DOM, no I/O.
// Sources and canonical-romaji decisions: see docs/DATA_SOURCES.md.

export const SCRIPTS = ['hiragana', 'katakana'];

// Teaching order. Basic rows first (gojuon order), then dakuten/handakuten.
// Groups 'yoon' and 'extended' are reserved for future versions: add SET_DEFS with those groups
// and matching KANA rows; nothing else needs to change.
export const SET_DEFS = [
  { id: 'a',  label: 'a · i · u · e · o',    group: 'basic',   order: 1 },
  { id: 'k',  label: 'ka · ki · ku · ke · ko', group: 'basic',   order: 2 },
  { id: 's',  label: 'sa · shi · su · se · so', group: 'basic',  order: 3 },
  { id: 't',  label: 'ta · chi · tsu · te · to', group: 'basic', order: 4 },
  { id: 'n',  label: 'na · ni · nu · ne · no', group: 'basic',   order: 5 },
  { id: 'h',  label: 'ha · hi · fu · he · ho', group: 'basic',   order: 6 },
  { id: 'm',  label: 'ma · mi · mu · me · mo', group: 'basic',   order: 7 },
  { id: 'y',  label: 'ya · yu · yo',           group: 'basic',   order: 8 },
  { id: 'r',  label: 'ra · ri · ru · re · ro', group: 'basic',   order: 9 },
  { id: 'wn', label: 'wa · wo · n',            group: 'basic',   order: 10 },
  { id: 'g',  label: 'ga · gi · gu · ge · go', group: 'dakuten', order: 11 },
  { id: 'z',  label: 'za · ji · zu · ze · zo', group: 'dakuten', order: 12 },
  { id: 'd',  label: 'da · ji · zu · de · do', group: 'dakuten', order: 13 },
  { id: 'b',  label: 'ba · bi · bu · be · bo', group: 'dakuten', order: 14 },
  { id: 'p',  label: 'pa · pi · pu · pe · po', group: 'dakuten', order: 15 },
];

export const GRID_ROWS = {
  basic: ['a', 'k', 's', 't', 'n', 'h', 'm', 'y', 'r', 'w', 'nn'],
  dakuten: ['g', 'z', 'd', 'b', 'p'],
};

// [idSuffix, hiragana, katakana, romaji, alt[], set, gridRow, gridCol]
const ROWS = [
  ['a',  'あ', 'ア', 'a',  [],            'a',  'a', 0],
  ['i',  'い', 'イ', 'i',  [],            'a',  'a', 1],
  ['u',  'う', 'ウ', 'u',  [],            'a',  'a', 2],
  ['e',  'え', 'エ', 'e',  [],            'a',  'a', 3],
  ['o',  'お', 'オ', 'o',  [],            'a',  'a', 4],

  ['ka', 'か', 'カ', 'ka', [],            'k',  'k', 0],
  ['ki', 'き', 'キ', 'ki', [],            'k',  'k', 1],
  ['ku', 'く', 'ク', 'ku', [],            'k',  'k', 2],
  ['ke', 'け', 'ケ', 'ke', [],            'k',  'k', 3],
  ['ko', 'こ', 'コ', 'ko', [],            'k',  'k', 4],

  ['sa', 'さ', 'サ', 'sa',  [],           's',  's', 0],
  ['shi','し', 'シ', 'shi', ['si'],       's',  's', 1],
  ['su', 'す', 'ス', 'su',  [],           's',  's', 2],
  ['se', 'せ', 'セ', 'se',  [],           's',  's', 3],
  ['so', 'そ', 'ソ', 'so',  [],           's',  's', 4],

  ['ta', 'た', 'タ', 'ta',  [],           't',  't', 0],
  ['chi','ち', 'チ', 'chi', ['ti'],       't',  't', 1],
  ['tsu','つ', 'ツ', 'tsu', ['tu'],       't',  't', 2],
  ['te', 'て', 'テ', 'te',  [],           't',  't', 3],
  ['to', 'と', 'ト', 'to',  [],           't',  't', 4],

  ['na', 'な', 'ナ', 'na', [],            'n',  'n', 0],
  ['ni', 'に', 'ニ', 'ni', [],            'n',  'n', 1],
  ['nu', 'ぬ', 'ヌ', 'nu', [],            'n',  'n', 2],
  ['ne', 'ね', 'ネ', 'ne', [],            'n',  'n', 3],
  ['no', 'の', 'ノ', 'no', [],            'n',  'n', 4],

  ['ha', 'は', 'ハ', 'ha', [],            'h',  'h', 0],
  ['hi', 'ひ', 'ヒ', 'hi', [],            'h',  'h', 1],
  ['fu', 'ふ', 'フ', 'fu', ['hu'],        'h',  'h', 2],
  ['he', 'へ', 'ヘ', 'he', [],            'h',  'h', 3],
  ['ho', 'ほ', 'ホ', 'ho', [],            'h',  'h', 4],

  ['ma', 'ま', 'マ', 'ma', [],            'm',  'm', 0],
  ['mi', 'み', 'ミ', 'mi', [],            'm',  'm', 1],
  ['mu', 'む', 'ム', 'mu', [],            'm',  'm', 2],
  ['me', 'め', 'メ', 'me', [],            'm',  'm', 3],
  ['mo', 'も', 'モ', 'mo', [],            'm',  'm', 4],

  ['ya', 'や', 'ヤ', 'ya', [],            'y',  'y', 0],
  ['yu', 'ゆ', 'ユ', 'yu', [],            'y',  'y', 2],
  ['yo', 'よ', 'ヨ', 'yo', [],            'y',  'y', 4],

  ['ra', 'ら', 'ラ', 'ra', [],            'r',  'r', 0],
  ['ri', 'り', 'リ', 'ri', [],            'r',  'r', 1],
  ['ru', 'る', 'ル', 'ru', [],            'r',  'r', 2],
  ['re', 'れ', 'レ', 're', [],            'r',  'r', 3],
  ['ro', 'ろ', 'ロ', 'ro', [],            'r',  'r', 4],

  ['wa', 'わ', 'ワ', 'wa', [],            'wn', 'w', 0],
  ['wo', 'を', 'ヲ', 'wo', ['o'],         'wn', 'w', 4],
  ['n',  'ん', 'ン', 'n',  ['nn', "n'"], 'wn', 'nn', 0],

  ['ga', 'が', 'ガ', 'ga', [],            'g',  'g', 0],
  ['gi', 'ぎ', 'ギ', 'gi', [],            'g',  'g', 1],
  ['gu', 'ぐ', 'グ', 'gu', [],            'g',  'g', 2],
  ['ge', 'げ', 'ゲ', 'ge', [],            'g',  'g', 3],
  ['go', 'ご', 'ゴ', 'go', [],            'g',  'g', 4],

  ['za', 'ざ', 'ザ', 'za', [],            'z',  'z', 0],
  ['ji', 'じ', 'ジ', 'ji', ['zi'],        'z',  'z', 1],
  ['zu', 'ず', 'ズ', 'zu', [],            'z',  'z', 2],
  ['ze', 'ぜ', 'ゼ', 'ze', [],            'z',  'z', 3],
  ['zo', 'ぞ', 'ゾ', 'zo', [],            'z',  'z', 4],

  ['da', 'だ', 'ダ', 'da', [],            'd',  'd', 0],
  ['di', 'ぢ', 'ヂ', 'ji', ['di', 'zi'],  'd',  'd', 1],
  ['du', 'づ', 'ヅ', 'zu', ['du', 'dzu'], 'd',  'd', 2],
  ['de', 'で', 'デ', 'de', [],            'd',  'd', 3],
  ['do', 'ど', 'ド', 'do', [],            'd',  'd', 4],

  ['ba', 'ば', 'バ', 'ba', [],            'b',  'b', 0],
  ['bi', 'び', 'ビ', 'bi', [],            'b',  'b', 1],
  ['bu', 'ぶ', 'ブ', 'bu', [],            'b',  'b', 2],
  ['be', 'べ', 'ベ', 'be', [],            'b',  'b', 3],
  ['bo', 'ぼ', 'ボ', 'bo', [],            'b',  'b', 4],

  ['pa', 'ぱ', 'パ', 'pa', [],            'p',  'p', 0],
  ['pi', 'ぴ', 'ピ', 'pi', [],            'p',  'p', 1],
  ['pu', 'ぷ', 'プ', 'pu', [],            'p',  'p', 2],
  ['pe', 'ぺ', 'ペ', 'pe', [],            'p',  'p', 3],
  ['po', 'ぽ', 'ポ', 'po', [],            'p',  'p', 4],
];

// Visually or phonetically confusable characters, as groups of ids. Every member of a group lists
// every other member as a confusable. Cross-script pairs teach the scripts apart.
const CONFUSABLE_GROUPS = [
  // hiragana look-alikes
  ['h-a', 'h-o'],
  ['h-a', 'h-me', 'h-nu'],
  ['h-nu', 'h-ne'],
  ['h-i', 'h-ri'],
  ['h-i', 'h-ko'],
  ['h-u', 'h-tsu'],
  ['h-u', 'h-ra'],
  ['h-ra', 'h-chi'],
  ['h-sa', 'h-ki'],
  ['h-sa', 'h-chi'],
  ['h-ha', 'h-ho', 'h-ke'],
  ['h-ho', 'h-ma'],
  ['h-ne', 'h-re', 'h-wa'],
  ['h-ru', 'h-ro'],
  ['h-ma', 'h-mo', 'h-yo'],
  ['h-shi', 'h-tsu'],
  ['h-ku', 'h-he'],
  ['h-ta', 'h-na'],
  ['h-ko', 'h-ni'],
  // hiragana dakuten (゛) vs handakuten (゜) and their base kana
  ['h-ba', 'h-pa', 'h-ha'],
  ['h-bi', 'h-pi'],
  ['h-bu', 'h-pu', 'h-fu'],
  ['h-be', 'h-pe'],
  ['h-bo', 'h-po'],
  // katakana look-alikes
  ['k-shi', 'k-tsu', 'k-so', 'k-n'],
  ['k-ku', 'k-ta', 'k-ke', 'k-wa'],
  ['k-u', 'k-wa', 'k-fu', 'k-wo'],
  ['k-ko', 'k-yu', 'k-ro'],
  ['k-ko', 'k-yo'],
  ['k-e', 'k-ko'],
  ['k-nu', 'k-su', 'k-fu', 'k-ra'],
  ['k-nu', 'k-me'],
  ['k-chi', 'k-te', 'k-na'],
  ['k-no', 'k-me', 'k-so'],
  ['k-ma', 'k-mu', 'k-a'],
  ['k-se', 'k-sa', 'k-ya'],
  ['k-ru', 'k-re'],
  ['k-o', 'k-ho'],
  ['k-ha', 'k-ho'],
  ['k-ki', 'k-sa'],
  // katakana dakuten (゛) vs handakuten (゜)
  ['k-ba', 'k-pa'],
  ['k-bi', 'k-pi'],
  ['k-bu', 'k-pu', 'k-fu'],
  ['k-be', 'k-pe'],
  ['k-bo', 'k-po'],
  // cross-script look-alikes
  ['h-ka', 'k-ka'], ['h-ki', 'k-ki'], ['h-he', 'k-he'], ['h-ri', 'k-ri'], ['h-mo', 'k-mo'],
  ['h-ya', 'k-ya'], ['h-se', 'k-se'], ['h-ko', 'k-ko'], ['h-ni', 'k-ni'], ['h-wa', 'k-wa'],
  ['h-u', 'k-u'], ['h-ke', 'k-ke'], ['h-be', 'k-be'], ['h-pe', 'k-pe'], ['h-ga', 'k-ga'],
  ['h-ka', 'h-ga'], ['k-ka', 'k-ga'],
];

function buildKana() {
  const out = [];
  for (const script of SCRIPTS) {
    const p = script === 'hiragana' ? 'h' : 'k';
    for (const [suffix, hira, kata, romaji, alt, set, row, col] of ROWS) {
      out.push({
        id: `${p}-${suffix}`,
        char: script === 'hiragana' ? hira : kata,
        script,
        set,
        romaji,
        alt: [...alt],
        grid: { row, col },
        confusables: [],
      });
    }
  }
  const byId = new Map(out.map((k) => [k.id, k]));
  for (const group of CONFUSABLE_GROUPS) {
    for (const a of group) {
      const ka = byId.get(a);
      if (!ka) throw new Error(`Unknown confusable id ${a}`);
      for (const b of group) {
        if (a !== b && !ka.confusables.includes(b)) ka.confusables.push(b);
      }
    }
  }
  return out;
}

export const KANA = Object.freeze(buildKana());
export const kanaById = new Map(KANA.map((k) => [k.id, k]));
export const setDefById = new Map(SET_DEFS.map((s) => [s.id, s]));

export function setKey(script, setId) {
  return `${script}:${setId}`;
}

export function parseSetKey(key) {
  const [script, setId] = String(key).split(':');
  return { script, setId };
}

export function charsInSet(script, setId) {
  return KANA.filter((k) => k.script === script && k.set === setId);
}

export function charsInSetKey(key) {
  const { script, setId } = parseSetKey(key);
  return charsInSet(script, setId);
}

export function allSetKeys() {
  const keys = [];
  for (const script of SCRIPTS) for (const s of SET_DEFS) keys.push(setKey(script, s.id));
  return keys;
}
