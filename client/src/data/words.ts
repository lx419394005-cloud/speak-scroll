export type WordCard = {
  id: string
  word: string
  image: string
}

export const WORDS: WordCard[] = [
  { id: 'banana', word: 'banana', image: '/words/banana.webp' },
  { id: 'cat', word: 'cat', image: '/words/cat.webp' },
  { id: 'pig', word: 'pig', image: '/words/pig.webp' },
  { id: 'duck', word: 'duck', image: '/words/duck.webp' },
  { id: 'apple', word: 'apple', image: '/words/apple.webp' },
  { id: 'dog', word: 'dog', image: '/words/dog.webp' },
  { id: 'fish', word: 'fish', image: '/words/fish.webp' },
  { id: 'cow', word: 'cow', image: '/words/cow.webp' },
  { id: 'frog', word: 'frog', image: '/words/frog.webp' },
  { id: 'hat', word: 'hat', image: '/words/hat.webp' },
  { id: 'cake', word: 'cake', image: '/words/cake.webp' },
  { id: 'bus', word: 'bus', image: '/words/bus.webp' },
  { id: 'sex', word: 'sex', image: '/words/sex.webp' },
  { id: 'recipe', word: 'recipe', image: '/words/recipe.webp' },
  { id: 'receipt', word: 'receipt', image: '/words/receipt.webp' },
  { id: 'soursop', word: 'soursop', image: '/words/soursop.webp' },
  { id: 'rope', word: 'rope', image: '/words/rope.webp' },
  { id: 'emotion', word: 'emotion', image: '/words/emotion.webp' },
  { id: 'pickle', word: 'pickle', image: '/words/pickle.webp' },
  { id: 'waffle', word: 'waffle', image: '/words/waffle.webp' },
  { id: 'cactus', word: 'cactus', image: '/words/cactus.webp' },
  { id: 'sock', word: 'sock', image: '/words/sock.webp' },
]

/** 总分门槛 */
export const PASS_SCORE = 60
/** 准确度门槛（有该字段时才卡） */
export const PASS_ACCURACY = 55
/** 整局时长（毫秒） */
export const GAME_DURATION_MS = 60_000
/** 单次开口最长录音 */
export const ATTEMPT_MAX_MS = 4500
/** 检测到说话后，静音多久算说完（太短会切掉词尾） */
export const SILENCE_END_MS = 580
/** 最短录音时长 */
export const MIN_RECORD_MS = 650
/** 过关后翻卡停顿 */
export const PASS_PAUSE_MS = 120
/** 说错后重试停顿（需够读完揭晓的英文） */
export const FAIL_PAUSE_MS = 1100
