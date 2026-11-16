// The player search: Chinese name, pinyin (in full or initials), the Opta name or a shirt number, across the three
// leagues. The name list loads on first focus.
import { useEffect, useMemo, useRef, useState } from 'react'
import { loadSearch, playerHref, type SearchRow } from './data'

export function SearchBox() {
  const [rows, setRows] = useState<SearchRow[] | null>(null)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const off = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', off)
    return () => window.removeEventListener('mousedown', off)
  }, [])
  const load = () => {
    if (!rows) loadSearch().then(setRows).catch(() => setRows([]))
  }
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/\s+/g, '')
    if (!s || !rows) return []
    return rows
      .filter((r) => r.zh.includes(s) || r.py.startsWith(s) || (s.length >= 2 && r.ini.startsWith(s)) || r.en.toLowerCase().replace(/\s+/g, '').includes(s) || (/^\d+$/.test(s) && String(r.num) === s))
      .sort((a, b) => b.min - a.min)
      .slice(0, 8)
  }, [q, rows])
  const go = (r: SearchRow) => location.assign(playerHref(r.id, { league: r.lg }))
  return (
    <div className="ps" ref={box}>
      <input
        className="ps-input" value={q} placeholder="找球员：中文名、拼音或号码" aria-label="找球员"
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => { load(); setOpen(true) }}
        onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) go(hits[0]) }}
      />
      {open && hits.length > 0 && (
        <ul className="ps-list">
          {hits.map((r) => (
            <li key={`${r.id}-${r.lg}`}>
              <a href={playerHref(r.id, { league: r.lg })}>
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
