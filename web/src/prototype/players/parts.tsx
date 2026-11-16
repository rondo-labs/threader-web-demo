// PROTOTYPE: pieces the 球员 prototype's pages share: the top bar (球员 points at the prototype) and the name search.
import { useEffect, useMemo, useRef, useState } from 'react'
import { loadSearch, playerHref, type SearchRow } from './data'

export function ProtoNav() {
  const items = [
    { key: 'teams', label: '球队', href: '/teams/' },
    { key: 'players', label: '球员', href: '/prototype/players/' },
    { key: 'review', label: '复盘', href: '/review/' },
  ]
  return (
    <header className="site-nav">
      <a href="/" className="site-mark">THREADER</a>
      <nav aria-label="栏目">
        {items.map((it) => <a key={it.key} href={it.href} aria-current={it.key === 'players'}>{it.label}</a>)}
      </nav>
    </header>
  )
}

/** Chinese name, pinyin (full or initials), English name or shirt number, across the three leagues. */
export function SearchBox() {
  const [rows, setRows] = useState<SearchRow[]>([])
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { loadSearch().then(setRows).catch(() => {}) }, [])
  useEffect(() => {
    const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', off)
    return () => window.removeEventListener('mousedown', off)
  }, [])
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/\s+/g, '')
    if (!s) return []
    return rows
      .filter((r) => r.zh.includes(s) || r.py.startsWith(s) || (s.length >= 2 && r.ini.startsWith(s)) || r.en.toLowerCase().replace(/\s+/g, '').includes(s) || (/^\d+$/.test(s) && String(r.num) === s))
      .sort((a, b) => b.min - a.min)
      .slice(0, 8)
  }, [q, rows])
  return (
    <div className="ps" ref={box}>
      <input
        className="ps-input" value={q} placeholder="找球员：中文名、拼音或号码" aria-label="找球员"
        onChange={(e) => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) location.assign(playerHref(hits[0].id, hits[0].lg)) }}
      />
      {open && hits.length > 0 && (
        <ul className="ps-list">
          {hits.map((r) => (
            <li key={`${r.id}-${r.lg}`}>
              <a href={playerHref(r.id, r.lg)}>
                <span className="t-body">{`${r.num != null ? `${r.num} ` : ''}${r.zh || r.en}`}</span>
                <span className="t-caption">{`${r.team} · ${r.lgZh} · ${r.group}`}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
