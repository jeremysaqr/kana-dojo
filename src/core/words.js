// Kana Dojo word data for Levels 4 (read the word) and 5 (what does it mean). Pure data + helpers.
// Sources and selection rules: see docs/DATA_SOURCES.md ("Words").
//
// v1 rules, enforced by test/words.test.js:
//  - two or more kana, only the basic + dakuten kana the app teaches (no small ゃゅょっ, no ー);
//  - romaji is the kana-by-kana Hepburn reading (おとうさん → otousan), so no を and no particle
//    readings, and no ん before a vowel or y (that would need "n'");
//  - no common homonyms (あめ rain/candy, はし bridge/chopsticks…): each word has one meaning, which
//    Level 5 can ask about without ambiguity; no two words share an English label.
import { KANA, kanaById, setKey } from './kana.js';

// [kana, English meanings (first one is shown)]
const HIRAGANA_WORDS = [
  // people and family
  ['ひと', ['person']], ['おとこ', ['man']], ['おんな', ['woman']], ['こども', ['child']],
  ['ともだち', ['friend']], ['せんせい', ['teacher']], ['かぞく', ['family']],
  ['おかあさん', ['mother']], ['おとうさん', ['father']], ['あに', ['older brother']],
  ['あね', ['older sister']], ['いもうと', ['younger sister']], ['むすめ', ['daughter']],
  ['むすこ', ['son']], ['わたし', ['I', 'me']], ['なまえ', ['name']],
  // body
  ['あたま', ['head']], ['かお', ['face']], ['みみ', ['ear']], ['くち', ['mouth']],
  ['くび', ['neck']], ['のど', ['throat']], ['せなか', ['back (of the body)']],
  ['おなか', ['stomach', 'belly']], ['あし', ['foot', 'leg']], ['ゆび', ['finger']],
  ['ひざ', ['knee']], ['ほね', ['bone']], ['からだ', ['body']], ['こえ', ['voice']],
  // animals
  ['いぬ', ['dog']], ['ねこ', ['cat']], ['とり', ['bird']], ['さかな', ['fish']],
  ['うま', ['horse']], ['うし', ['cow']], ['ねずみ', ['mouse', 'rat']], ['うさぎ', ['rabbit']],
  ['さる', ['monkey']], ['くま', ['bear']], ['きつね', ['fox']], ['たぬき', ['raccoon dog']],
  ['おおかみ', ['wolf']], ['しか', ['deer']], ['ぞう', ['elephant']], ['とら', ['tiger']],
  ['へび', ['snake']], ['かめ', ['turtle', 'tortoise']],   ['いるか', ['dolphin']], ['くじら', ['whale']], ['さめ', ['shark']], ['いか', ['squid']],
  ['かに', ['crab']], ['えび', ['shrimp', 'prawn']], ['むし', ['insect', 'bug']],
  ['あり', ['ant']], ['せみ', ['cicada']],
  // food and drink
  ['たべもの', ['food']], ['のみもの', ['drink', 'beverage']], ['ごはん', ['cooked rice', 'meal']],
  ['こめ', ['rice']], ['にく', ['meat']], ['たまご', ['egg']], ['やさい', ['vegetable']],
  ['すし', ['sushi']], ['うどん', ['udon']], ['てんぷら', ['tempura']], ['とうふ', ['tofu']],
  ['みそ', ['miso']], ['しお', ['salt']], ['さとう', ['sugar']], ['りんご', ['apple']],
  ['みかん', ['mandarin orange']], ['いちご', ['strawberry']], ['ぶどう', ['grape']],
  ['すいか', ['watermelon']], ['なす', ['eggplant', 'aubergine']], ['にんじん', ['carrot']],
  ['たまねぎ', ['onion']], ['だいこん', ['daikon']], ['まめ', ['bean']],
  ['おにぎり', ['rice ball']], ['みず', ['water']],
  // nature and weather
  ['そら', ['sky']], ['やま', ['mountain']], ['うみ', ['sea', 'ocean']], ['もり', ['forest']],
  ['いけ', ['pond']], ['しま', ['island']], ['すな', ['sand']], ['なみ', ['wave']],
  ['ほし', ['star']], ['つき', ['moon']], ['ゆき', ['snow']], ['にじ', ['rainbow']],
  ['さくら', ['cherry blossom']], ['たけ', ['bamboo']],
  // seasons, time
  ['はる', ['spring']], ['なつ', ['summer']], ['あき', ['autumn', 'fall']], ['ふゆ', ['winter']],
  ['あさ', ['morning']], ['ひる', ['noon', 'daytime']], ['よる', ['night']], ['いま', ['now']],
  ['きのう', ['yesterday']], ['けさ', ['this morning']],
  // places and directions
  ['いえ', ['house']], ['へや', ['room']], ['にわ', ['garden']], ['まち', ['town']],
  ['むら', ['village']], ['みち', ['road', 'path']], ['みせ', ['shop', 'store']],
  ['えき', ['train station']], ['ぎんこう', ['bank']], ['くに', ['country']], ['せかい', ['world']],
  ['ここ', ['here']], ['どこ', ['where']], ['そと', ['outside']], ['うえ', ['above', 'up']],
  ['うしろ', ['behind']], ['まえ', ['in front', 'before']], ['となり', ['next to', 'adjacent']],
  ['みぎ', ['right (side)']], ['ひだり', ['left (side)']], ['きた', ['north']],
  ['みなみ', ['south']], ['ひがし', ['east']], ['にし', ['west']],
  // things
  ['ほん', ['book']], ['えほん', ['picture book']], ['しんぶん', ['newspaper']],
  ['てがみ', ['letter (mail)']], ['えんぴつ', ['pencil']], ['つくえ', ['desk']], ['いす', ['chair']],
  ['まど', ['window']], ['かいだん', ['stairs']], ['やね', ['roof']], ['ゆか', ['floor']],
  ['とけい', ['clock', 'watch']], ['でんわ', ['telephone']], ['かぎ', ['key']],
  ['かがみ', ['mirror']], ['かばん', ['bag']], ['かさ', ['umbrella']], ['めがね', ['glasses']],
  ['くつ', ['shoes']], ['くつした', ['socks']], ['ぼうし', ['hat', 'cap']],
  ['てぶくろ', ['glove']], ['きもの', ['kimono']],
  ['はさみ', ['scissors']], ['はこ', ['box']], ['ふた', ['lid']], ['くるま', ['car']],
  ['ふね', ['ship', 'boat']], ['おかね', ['money']], ['くすり', ['medicine']], ['ごみ', ['rubbish', 'trash']],
  ['もの', ['thing']], ['ことば', ['word', 'language']], ['うた', ['song']], ['おと', ['sound']],
  ['えいが', ['film', 'movie']], ['しごと', ['work', 'job']], ['ゆめ', ['dream']],
  ['ちず', ['map']], ['いろ', ['colour']], ['ちから', ['strength', 'power']], ['ねつ', ['fever']],
  // colours and describing words
  ['きいろ', ['yellow']], ['みどり', ['green']], ['くろい', ['black']], ['しろい', ['white']],
  ['あかい', ['red']], ['おおきい', ['big']], ['ちいさい', ['small']], ['あたらしい', ['new']],
  ['ふるい', ['old (not new)']], ['たかい', ['high', 'tall', 'expensive']], ['やすい', ['cheap']],
  ['ながい', ['long']], ['みじかい', ['short']], ['ひろい', ['wide', 'spacious']],
  ['せまい', ['narrow', 'cramped']], ['おもい', ['heavy']], ['かるい', ['light (not heavy)']],
  ['おそい', ['slow', 'late']], ['ちかい', ['near', 'close']], ['とおい', ['far']],
  ['あかるい', ['bright']], ['さむい', ['cold (weather)']],
  ['あたたかい', ['warm']], ['あまい', ['sweet']], ['おいしい', ['delicious']],
  ['うれしい', ['glad', 'happy']], ['かなしい', ['sad']], ['たのしい', ['fun', 'enjoyable']],
  ['いたい', ['painful', 'sore']], ['こわい', ['scary']], ['ねむい', ['sleepy']],
  ['げんき', ['well', 'energetic']], ['しずか', ['quiet']], ['きれい', ['pretty', 'clean']],
  ['すき', ['liking', 'being fond of']], ['きらい', ['disliking', 'hating']], ['へた', ['unskillful', 'poor']],
  // verbs
  ['いく', ['to go']], ['くる', ['to come']], ['みる', ['to see', 'to watch']],
  ['きく', ['to hear', 'to listen']], ['よむ', ['to read']], ['はなす', ['to speak', 'to talk']],
  ['たべる', ['to eat']], ['のむ', ['to drink']], ['ねる', ['to sleep']], ['おきる', ['to get up']],
  ['すわる', ['to sit']], ['あるく', ['to walk']], ['はしる', ['to run']], ['およぐ', ['to swim']],
  ['あそぶ', ['to play']], ['わらう', ['to laugh']], ['まつ', ['to wait']], ['うたう', ['to sing']],
  ['おしえる', ['to teach']], ['ならう', ['to learn']], ['わすれる', ['to forget']],
  ['あける', ['to open']],
  ['つくる', ['to make']], ['あらう', ['to wash']], ['はいる', ['to enter']],
  ['でる', ['to go out', 'to leave']], ['えらぶ', ['to choose']], ['さがす', ['to look for']],
  ['もつ', ['to hold', 'to carry']], ['おくる', ['to send']], ['てつだう', ['to help']],
  // numbers and question words
  ['いち', ['one']], ['よん', ['four']], ['ろく', ['six']], ['なな', ['seven']],
  ['なに', ['what']], ['だれ', ['who']],
];

const KATAKANA_WORDS = [
  ['カメラ', ['camera']], ['テニス', ['tennis']], ['ホテル', ['hotel']], ['トマト', ['tomato']],
  ['バナナ', ['banana']], ['ピアノ', ['piano']], ['ラジオ', ['radio']], ['テレビ', ['television', 'TV']],
  ['ナイフ', ['knife']], ['ペン', ['pen']], ['パン', ['bread']], ['ドア', ['door']],
  ['ズボン', ['trousers', 'pants']], ['ボタン', ['button']], ['バス', ['bus']], ['ネクタイ', ['necktie']],
  ['メモ', ['memo', 'note']], ['ゴルフ', ['golf']], ['サラダ', ['salad']], ['ミルク', ['milk']],
  ['レモン', ['lemon']], ['メロン', ['melon']], ['トイレ', ['toilet']], ['ワイン', ['wine']],
  ['ビル', ['multi-storey building']], ['エアコン', ['air conditioner']], ['パソコン', ['personal computer']],
  ['テスト', ['test', 'exam']], ['クラス', ['class']], ['ペンギン', ['penguin']], ['ライオン', ['lion']],
  ['ゴリラ', ['gorilla']], ['パンダ', ['panda']], ['コアラ', ['koala']], ['キリン', ['giraffe']],
  ['ドラマ', ['TV drama']], ['アニメ', ['anime', 'animation']], ['レストラン', ['restaurant']],
  ['ポスト', ['postbox', 'mailbox']], ['ハンカチ', ['handkerchief']], ['グラス', ['glass (for drinks)']],
  ['ピンク', ['pink']], ['ダンス', ['dance']], ['ピザ', ['pizza']], ['パスタ', ['pasta']],
  ['ハム', ['ham']], ['タオル', ['towel']], ['ベルト', ['belt']], ['ドレス', ['dress']],
  ['マスク', ['face mask']], ['ガス', ['gas']],
  ['アメリカ', ['America', 'USA']], ['カナダ', ['Canada']], ['ドイツ', ['Germany']],
  ['イギリス', ['United Kingdom', 'Britain']], ['イタリア', ['Italy']], ['スペイン', ['Spain']],
  ['ロシア', ['Russia']], ['インド', ['India']], ['ブラジル', ['Brazil']], ['メキシコ', ['Mexico']],
  ['アジア', ['Asia']], ['アフリカ', ['Africa']],
];

// Words close enough in meaning that one must never be a Level 5 distractor for another.
const RELATED = [
  ['いえ', 'へや'], ['さむい', 'あたたかい'], ['ちかい', 'となり', 'とおい'], ['ほん', 'えほん'],
  ['のみもの', 'のむ'], ['たべもの', 'たべる', 'ごはん'], ['ごはん', 'こめ'],
  ['こども', 'むすめ', 'むすこ'], ['あし', 'ゆび'], ['あさ', 'けさ'], ['ひる', 'いま'],
  ['みる', 'よむ'], ['きく', 'はなす'], ['いく', 'でる'], ['くる', 'はいる'],
  ['おおきい', 'ひろい'], ['ちいさい', 'せまい', 'みじかい'],
  ['しろい', 'あかるい'], ['あたたかい', 'げんき'],
  ['うれしい', 'たのしい'], ['すき', 'きらい'], ['きもの', 'ズボン', 'ドレス', 'ベルト'],
  ['ドラマ', 'アニメ', 'えいが', 'テレビ'], ['グラス', 'めがね'], ['うみ', 'なみ'],
  ['テスト', 'クラス', 'せんせい'], ['ポスト', 'てがみ'], ['ハンカチ', 'タオル'],
  ['アメリカ', 'カナダ', 'メキシコ'], ['アジア', 'インド'], ['アフリカ', 'ライオン', 'キリン'],
];

const charToId = new Map();
for (const k of KANA) if (!charToId.has(`${k.script}|${k.char}`)) charToId.set(`${k.script}|${k.char}`, k.id);

function buildWords() {
  const out = [];
  for (const [script, list] of [['hiragana', HIRAGANA_WORDS], ['katakana', KATAKANA_WORDS]]) {
    const p = script === 'hiragana' ? 'wh' : 'wk';
    for (const [kana, en] of list) {
      const units = [...kana].map((ch) => {
        const id = charToId.get(`${script}|${ch}`);
        if (!id) throw new Error(`words: ${kana} uses ${ch}, which the app doesn't teach`);
        return id;
      });
      const romaji = units.map((id) => kanaById.get(id).romaji).join('');
      out.push({ id: `${p}-${romaji}`, script, kana, units, romaji, en: [...en], related: [] });
    }
  }
  const byKana = new Map(out.map((w) => [w.kana, w]));
  for (const group of RELATED) {
    for (const a of group) if (!byKana.has(a)) throw new Error(`words: unknown related word ${a}`);
    for (const a of group) {
      const wa = byKana.get(a);
      for (const b of group) if (a !== b && !wa.related.includes(byKana.get(b).id)) wa.related.push(byKana.get(b).id);
    }
  }
  return out;
}

export const WORDS = Object.freeze(buildWords());
export const wordById = new Map(WORDS.map((w) => [w.id, w]));

/** Set keys ('hiragana:k') a word needs passed in Learn before it can be asked. */
export function wordSetKeys(word) {
  return [...new Set(word.units.map((id) => { const k = kanaById.get(id); return setKey(k.script, k.set); }))];
}

/** Ids of words whose every kana is in a learned row. `learnedKeys` = learned set keys. */
export function readableWords(learnedKeys) {
  const learned = new Set(learnedKeys);
  return WORDS.filter((w) => wordSetKeys(w).every((k) => learned.has(k))).map((w) => w.id);
}

/**
 * The single not-yet-learned row that would make the most new words readable, for the locked
 * Words screen ("Passing the Ma row adds 6"). Ties go to the earlier row in `orderedKeys`.
 * @param {string[]} learnedKeys
 * @param {string[]} orderedKeys every set key in teaching order
 * @returns {{ key: string, adds: number } | null}
 */
export function bestNextRow(learnedKeys, orderedKeys) {
  const learned = new Set(learnedKeys);
  const now = readableWords(learnedKeys).length;
  let best = null;
  for (const key of orderedKeys) {
    if (learned.has(key)) continue;
    const adds = readableWords([...learned, key]).length - now;
    if (adds > 0 && (!best || adds > best.adds)) best = { key, adds };
  }
  return best;
}
