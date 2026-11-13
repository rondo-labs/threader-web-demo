// 球员 and 复盘 are not built yet; their entries stay in the top bar.
import { useEffect } from 'react'
import { Nav } from './Nav'

export function Placeholder({ section }: { section: 'players' | 'review' }) {
  const what = section === 'players' ? '球员' : '复盘'
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
