export type WordCard = {
  id: string
  word: string
  image: string
  /** 情景模式中文谜语提示（可选） */
  hint?: string
}

/**
 * 词图 URL 版本号。R2 未就绪时 SPA 曾把 HTML 当成 /words/*.webp 缓存，
 *  bump 可强制浏览器重新拉图。
 */
export const WORD_IMG_V = '2'

/** 生成带缓存戳的词图路径（path 相对 /words/，如 axolotl.webp） */
export function wordImg(path: string): string {
  const file = path.replace(/^\/?words\//, '')
  return `/words/${file}?v=${WORD_IMG_V}`
}

/** 主题词库：小众动物 / 怪果 / 旅行场景 / 行囊情景（可被多关复用） */
export const WORDS: WordCard[] = [
  // —— 奇兽 ——
  { id: 'axolotl', word: 'axolotl', image: wordImg('axolotl.webp') },
  { id: 'pangolin', word: 'pangolin', image: wordImg('pangolin.webp') },
  { id: 'capybara', word: 'capybara', image: wordImg('capybara.webp') },
  { id: 'quokka', word: 'quokka', image: wordImg('quokka.webp') },
  { id: 'platypus', word: 'platypus', image: wordImg('platypus.webp') },
  { id: 'armadillo', word: 'armadillo', image: wordImg('armadillo.webp') },
  { id: 'okapi', word: 'okapi', image: wordImg('okapi.webp') },
  { id: 'wombat', word: 'wombat', image: wordImg('wombat.webp') },
  { id: 'lemur', word: 'lemur', image: wordImg('lemur.webp') },
  { id: 'tapir', word: 'tapir', image: wordImg('tapir.webp') },

  // —— 怪果 ——
  { id: 'durian', word: 'durian', image: wordImg('durian.webp') },
  { id: 'lychee', word: 'lychee', image: wordImg('lychee.webp') },
  { id: 'rambutan', word: 'rambutan', image: wordImg('rambutan.webp') },
  { id: 'persimmon', word: 'persimmon', image: wordImg('persimmon.webp') },
  { id: 'mangosteen', word: 'mangosteen', image: wordImg('mangosteen.webp') },
  { id: 'kumquat', word: 'kumquat', image: wordImg('kumquat.webp') },
  { id: 'jackfruit', word: 'jackfruit', image: wordImg('jackfruit.webp') },
  { id: 'soursop', word: 'soursop', image: wordImg('soursop.webp') },
  { id: 'guava', word: 'guava', image: wordImg('guava.webp') },
  { id: 'longan', word: 'longan', image: wordImg('longan.webp') },

  // —— 旅途 ——
  { id: 'passport', word: 'passport', image: wordImg('passport.webp') },
  { id: 'suitcase', word: 'suitcase', image: wordImg('suitcase.webp') },
  { id: 'hostel', word: 'hostel', image: wordImg('hostel.webp') },
  { id: 'compass', word: 'compass', image: wordImg('compass.webp') },
  { id: 'ferry', word: 'ferry', image: wordImg('ferry.webp') },
  { id: 'backpack', word: 'backpack', image: wordImg('backpack.webp') },
  { id: 'postcard', word: 'postcard', image: wordImg('postcard.webp') },
  { id: 'lighthouse', word: 'lighthouse', image: wordImg('lighthouse.webp') },
  { id: 'tram', word: 'tram', image: wordImg('tram.webp') },
  { id: 'souvenir', word: 'souvenir', image: wordImg('souvenir.webp') },

  // —— 行囊情景（travel-fun，带中文谜语）——
  {
    id: 'tf-passport',
    word: 'passport',
    image: wordImg('travel-fun/passport.webp'),
    hint: '没有它你连国门都踏不出去',
  },
  {
    id: 'tf-suitcase',
    word: 'suitcase',
    image: wordImg('travel-fun/suitcase.webp'),
    hint: '出门最大件，全靠它拖着走',
  },
  {
    id: 'tf-backpack',
    word: 'backpack',
    image: wordImg('travel-fun/backpack.webp'),
    hint: '双手腾出来，行李背在身后',
  },
  {
    id: 'tf-adapter',
    word: 'adapter',
    image: wordImg('travel-fun/adapter.webp'),
    hint: '各国插座脾气不同，全靠它来调解',
  },
  {
    id: 'tf-camera',
    word: 'camera',
    image: wordImg('travel-fun/camera.webp'),
    hint: '美景当面过，不拍就等于没来过',
  },
  {
    id: 'tf-charger',
    word: 'charger',
    image: wordImg('travel-fun/charger.webp'),
    hint: '手机没电时，旅行直接瘫痪',
  },
  {
    id: 'tf-clothes',
    word: 'clothes',
    image: wordImg('travel-fun/clothes.webp'),
    hint: '箱里叠得齐齐的，换季全靠它们',
  },
  {
    id: 'tf-headphones',
    word: 'headphones',
    image: wordImg('travel-fun/headphones.webp'),
    hint: '飞机上的私人小世界',
  },
  {
    id: 'tf-map',
    word: 'map',
    image: wordImg('travel-fun/map.webp'),
    hint: '迷路之前，先打开它认路',
  },
  {
    id: 'tf-medicine',
    word: 'medicine',
    image: wordImg('travel-fun/medicine.webp'),
    hint: '出门保命丸，肚疼头疼都靠它',
  },
  {
    id: 'tf-sunglasses',
    word: 'sunglasses',
    image: wordImg('travel-fun/sunglasses.webp'),
    hint: '阳光太刺眼，装酷也靠它',
  },
  {
    id: 'tf-ticket',
    word: 'ticket',
    image: wordImg('travel-fun/ticket.webp'),
    hint: '没这张票，飞机火车都不让上',
  },
  {
    id: 'tf-toothbrush',
    word: 'toothbrush',
    image: wordImg('travel-fun/toothbrush.webp'),
    hint: '早起第一件事，牙还等着它',
  },
  {
    id: 'tf-umbrella',
    word: 'umbrella',
    image: wordImg('travel-fun/umbrella.webp'),
    hint: '天有不测风云，湿身全靠忘带它',
  },
  {
    id: 'tf-wallet',
    word: 'wallet',
    image: wordImg('travel-fun/wallet.webp'),
    hint: '钱卡证件都住这里，丢了整个人都慌',
  },
]

/**
 * 图片路径约定：同域 `/words/.../*.webp`
 * - 本地 Vite：读 `client/public/words/`
 * - 线上：Worker 从 R2 桶 `speak-scroll-words` 读取（key=`words/...`）
 */
export const BEAST_IDS = [
  'axolotl',
  'pangolin',
  'capybara',
  'quokka',
  'platypus',
  'armadillo',
  'okapi',
  'wombat',
  'lemur',
  'tapir',
] as const

export const FRUIT_IDS = [
  'durian',
  'lychee',
  'rambutan',
  'persimmon',
  'mangosteen',
  'kumquat',
  'jackfruit',
  'soursop',
  'guava',
  'longan',
] as const

export const VOYAGE_IDS = [
  'passport',
  'suitcase',
  'hostel',
  'compass',
  'ferry',
  'backpack',
  'postcard',
  'lighthouse',
  'tram',
  'souvenir',
] as const

export const PACKING_IDS = [
  'tf-passport',
  'tf-suitcase',
  'tf-backpack',
  'tf-adapter',
  'tf-camera',
  'tf-charger',
  'tf-clothes',
  'tf-headphones',
  'tf-map',
  'tf-medicine',
  'tf-sunglasses',
  'tf-ticket',
  'tf-toothbrush',
  'tf-umbrella',
  'tf-wallet',
] as const

/** 乱斗：动物+水果+旅途（不含行囊情景，避免同词多图混战） */
export const MIXED_IDS = [
  ...BEAST_IDS,
  ...FRUIT_IDS,
  ...VOYAGE_IDS,
] as const

/** 总分门槛 */
export const PASS_SCORE = 60
/** 准确度门槛（有该字段时才卡） */
export const PASS_ACCURACY = 55
/** 整局时长（毫秒） */
export const GAME_DURATION_MS = 60_000
/** 单次开口最长录音 */
export const ATTEMPT_MAX_MS = 3800
/** 检测到说话后，静音多久算说完 */
export const SILENCE_END_MS = 420
/** 最短录音时长 */
export const MIN_RECORD_MS = 520
/** 过关后翻卡停顿 */
export const PASS_PAUSE_MS = 320
/** 说错后重试停顿 */
export const FAIL_PAUSE_MS = 280
/** 点「不会」后揭晓答案的停顿 */
export const SKIP_REVEAL_MS = 1800
