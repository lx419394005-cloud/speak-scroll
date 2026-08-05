export type WordCard = {
  id: string
  word: string
  image: string
}

/** 主题词库：小众动物 / 怪果 / 旅行场景（可被多关复用） */
export const WORDS: WordCard[] = [
  // —— 奇兽 ——
  { id: 'axolotl', word: 'axolotl', image: '/words/axolotl.webp' },
  { id: 'pangolin', word: 'pangolin', image: '/words/pangolin.webp' },
  { id: 'capybara', word: 'capybara', image: '/words/capybara.webp' },
  { id: 'quokka', word: 'quokka', image: '/words/quokka.webp' },
  { id: 'platypus', word: 'platypus', image: '/words/platypus.webp' },
  { id: 'armadillo', word: 'armadillo', image: '/words/armadillo.webp' },
  { id: 'okapi', word: 'okapi', image: '/words/okapi.webp' },
  { id: 'wombat', word: 'wombat', image: '/words/wombat.webp' },
  { id: 'lemur', word: 'lemur', image: '/words/lemur.webp' },
  { id: 'tapir', word: 'tapir', image: '/words/tapir.webp' },

  // —— 怪果 ——
  { id: 'durian', word: 'durian', image: '/words/durian.webp' },
  { id: 'lychee', word: 'lychee', image: '/words/lychee.webp' },
  { id: 'rambutan', word: 'rambutan', image: '/words/rambutan.webp' },
  { id: 'persimmon', word: 'persimmon', image: '/words/persimmon.webp' },
  { id: 'mangosteen', word: 'mangosteen', image: '/words/mangosteen.webp' },
  { id: 'kumquat', word: 'kumquat', image: '/words/kumquat.webp' },
  { id: 'jackfruit', word: 'jackfruit', image: '/words/jackfruit.webp' },
  { id: 'soursop', word: 'soursop', image: '/words/soursop.webp' },
  { id: 'guava', word: 'guava', image: '/words/guava.webp' },
  { id: 'longan', word: 'longan', image: '/words/longan.webp' },

  // —— 旅途 ——
  { id: 'passport', word: 'passport', image: '/words/passport.webp' },
  { id: 'suitcase', word: 'suitcase', image: '/words/suitcase.webp' },
  { id: 'hostel', word: 'hostel', image: '/words/hostel.webp' },
  { id: 'compass', word: 'compass', image: '/words/compass.webp' },
  { id: 'ferry', word: 'ferry', image: '/words/ferry.webp' },
  { id: 'backpack', word: 'backpack', image: '/words/backpack.webp' },
  { id: 'postcard', word: 'postcard', image: '/words/postcard.webp' },
  { id: 'lighthouse', word: 'lighthouse', image: '/words/lighthouse.webp' },
  { id: 'tram', word: 'tram', image: '/words/tram.webp' },
  { id: 'souvenir', word: 'souvenir', image: '/words/souvenir.webp' },
]

/**
 * 图片路径约定：同域 `/words/<id>.webp`
 * - 本地 Vite：读 `client/public/words/`
 * - 线上：Worker 从 R2 桶 `speak-scroll-words` 读取（key=`words/<id>.webp`）
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

/** 总分门槛 */
export const PASS_SCORE = 60
/** 准确度门槛（有该字段时才卡） */
export const PASS_ACCURACY = 55
/** 整局时长（毫秒） */
export const GAME_DURATION_MS = 60_000
/** 单次开口最长录音 */
export const ATTEMPT_MAX_MS = 4000
/** 检测到说话后，静音多久算说完（太短会切掉词尾） */
export const SILENCE_END_MS = 380
/** 最短录音时长 */
export const MIN_RECORD_MS = 480
/** 过关后翻卡停顿 */
export const PASS_PAUSE_MS = 80
/** 说错后重试停顿 */
export const FAIL_PAUSE_MS = 180
