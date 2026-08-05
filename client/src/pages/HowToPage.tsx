import { useEffect } from 'react'
import { Link } from 'react-router-dom'

const steps = [
  { title: '选关', body: '首页可选启蒙 / 冲刺 / 怪词三关，词库与时长不同。' },
  { title: '看图', body: '卡片上只有滑稽插画，不显示英文单词。' },
  { title: '说词', body: '对着麦克风大声说完整单词；说完自动评分。' },
  { title: '过关', body: '说对才翻下一张；说错同一张继续，直到说对或时间到。' },
  { title: '暂停', body: '对局中可点「暂停」或按 Esc；也可随时回主页。' },
  { title: '冲榜', body: '限时内说对越多越好；破纪录会按昵称上传全球排行榜。' },
]

export function HowToPage() {
  useEffect(() => {
    document.body.classList.add('page-scroll')
    return () => document.body.classList.remove('page-scroll')
  }, [])

  return (
    <main className="page how-page">
      <header className="page-hero">
        <h1>怎么玩</h1>
        <p>紧张一点，清楚一点。别偷看屏幕上的英文——本来就没有。</p>
      </header>

      <ol className="how-steps">
        {steps.map((step, i) => (
          <li key={step.title}>
            <span className="how-num">{i + 1}</span>
            <div>
              <h2>{step.title}</h2>
              <p>{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className="how-note">
        <h2>小提示</h2>
        <ul>
          <li>用 Chrome / Edge，允许麦克风。</li>
          <li>多音节词说完整，别被静音截太早。</li>
          <li>怪词也是正经英文：recipe ≠ receipt。</li>
        </ul>
      </section>

      <div className="home-cta-row">
        <Link className="cta" to="/">
          回首页开玩
        </Link>
        <Link className="cta ghost" to="/leaderboard">
          看排行榜
        </Link>
      </div>
    </main>
  )
}
