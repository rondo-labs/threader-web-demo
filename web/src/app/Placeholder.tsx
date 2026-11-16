// 复盘 is not built yet; its entry stays in the top bar.
import { useEffect } from 'react'
import { Nav } from './Nav'

export function Placeholder({ section }: { section: 'review' }) {
  const what = '复盘'
  useEffect(() => {
    document.title = `${what} · Threader`
  }, [what])
  return (
    <div className="site-page">
      <Nav active={section} />
      <main className="site-placeholder">
        <h1 className="t-display">{what}</h1>
        <p className="t-lead">这一部分还在做。</p>
        <p><a href="/teams/">先去看球队 →</a></p>
      </main>
    </div>
  )
}
