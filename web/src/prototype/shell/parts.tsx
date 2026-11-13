// PROTOTYPE: pieces the shell variants share (the top bar, the conversation state, card bodies, the clip
// player). Layout stays in each variant.
import { useEffect, useRef, useState } from 'react'
import { GoalChart } from '../../match-analysis/overviewCharts'
import { Player, usePlaylist } from '../../match-analysis/Playlist'
import { HBars, PitchDots } from './charts'
import { answer, type Answer, type Card, type Clips } from './qa'

/* ------------------------------------------------------------------ top bar */

export function Nav({ active, compact }: { active?: 'home' | 'teams' | 'players' | 'review'; compact?: boolean }) {
  const items = [
    { key: 'teams', label: '球队', href: '/prototype/team/' },
    { key: 'players', label: '球员', href: '/prototype/home/?page=players' },
    { key: 'review', label: '复盘', href: '/prototype/home/?page=review' },
  ]
  return (
    <header className={`sh-nav${compact ? ' is-compact' : ''}`}>
      <a href="/prototype/home/" className="sh-mark" aria-current={active === 'home'}>THREADER</a>
      <nav>
        {items.map((it) => (
          <a key={it.key} href={it.href} aria-current={active === it.key}>{it.label}</a>
        ))}
      </nav>
    </header>
  )
}

export function Placeholder({ page }: { page: string }) {
  const what = page === 'players' ? '球员' : '复盘'
  return (
    <div className="sh-page">
      <Nav active={page === 'players' ? 'players' : 'review'} />
      <main className="sh-placeholder">
        <h1 className="t-display">{what}</h1>
        <p className="t-lead">{`这一块之后再设计。原型里只留了入口。`}</p>
        <a href="/prototype/home/">回到问答</a>
      </main>
    </div>
  )
}

/* ------------------------------------------------------------------ conversation */

export interface Turn { id: string; question: string; answer: Answer | null; streamed: boolean }
let askedFromUrl = false

/** The turns of this visit, in memory (the real one keeps them in the visitor's browser). `?q=` asks on load. */
export function useConversation() {
  const [turns, setTurns] = useState<Turn[]>([])
  const ask = (question: string) => {
    const q = question.trim()
    if (!q) return
    const id = `t${Date.now()}${Math.random().toString(36).slice(2, 6)}`
    setTurns((ts) => [...ts, { id, question: q, answer: null, streamed: false }])
    answer(q).then((a) => setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, answer: a } : t))))
  }
  const markStreamed = (id: string) => setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, streamed: true } : t)))
  useEffect(() => {
    const q = new URLSearchParams(location.search).get('q')
    if (q && !askedFromUrl) {
      askedFromUrl = true
      ask(q)
    }
  }, [])
  return { turns, ask, reset: () => setTurns([]), markStreamed }
}

export type Conv = ReturnType<typeof useConversation>

/** Steps first, then the text a few characters at a time, then everything else. Finished turns show at once. */
export function useStream(a: Answer | null, instant: boolean, onDone?: () => void) {
  const [steps, setSteps] = useState(0)
  const [chars, setChars] = useState(0)
  const full = a ? a.paragraphs.join('\n') : ''
  useEffect(() => {
    if (!a) return
    if (instant) {
      setSteps(a.steps.length)
      setChars(full.length)
      return
    }
    setSteps(0)
    setChars(0)
    let s = 0, c = 0, alive = true
    let timer = 0
    const tick = () => {
      if (!alive) return
      if (s < a.steps.length) {
        setSteps(++s)
        timer = window.setTimeout(tick, 380)
      } else if (c < full.length) {
        c = Math.min(full.length, c + 3)
        setChars(c)
        timer = window.setTimeout(tick, 18)
      } else onDone?.()
    }
    timer = window.setTimeout(tick, 150)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [a?.id])
  const done = !!a && steps >= a.steps.length && chars >= full.length
  return { steps, paragraphs: full.slice(0, chars).split('\n'), done }
}

export function shareLink(question: string) {
  const url = new URL(location.href)
  url.searchParams.set('q', question)
  return url.toString()
}

export function CopyLink({ question }: { question: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className="sh-link-btn"
      onClick={() => {
        navigator.clipboard?.writeText(shareLink(question))
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      title="链接里只带问题，打开后重新问一遍"
    >
      {copied ? '已复制链接' : '复制链接'}
    </button>
  )
}

/* ------------------------------------------------------------------ input */

export function AskBox({ onAsk, placeholder = '问任何关于这三个联赛的问题……', big, autoFocus }: {
  onAsk: (q: string) => void; placeholder?: string; big?: boolean; autoFocus?: boolean
}) {
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  const send = () => {
    if (!text.trim()) return
    onAsk(text)
    setText('')
  }
  return (
    <div className={`sh-ask${big ? ' is-big' : ''}`}>
      <textarea
        ref={ref}
        rows={big ? 2 : 1}
        value={text}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            send()
          }
        }}
      />
      <button className="sh-send" onClick={send} disabled={!text.trim()} aria-label="发送">↑</button>
    </div>
  )
}

export const FOOTNOTE = '数字、球场图和片段来自查询；文字由 DeepSeek 组织。每个 IP 每天能问的次数有限。'

/* ------------------------------------------------------------------ card bodies */

export function CardBody({ card, big, onOpen }: { card: Card; big?: boolean; onOpen?: () => void }) {
  switch (card.kind) {
    case 'figures':
      return (
        <div className="sh-figs">
          {card.items.map((f) => (
            <div key={f.label} className="sh-fig">
              <div className="t-label">{f.label}</div>
              <div className={big ? 't-score' : 't-figure'}>{f.value}</div>
              {f.sub && <div className="t-caption">{f.sub}</div>}
            </div>
          ))}
        </div>
      )
    case 'ranking':
      return <HBars rows={big ? card.rows : card.rows.slice(0, 8)} format={(v) => `${v}`} />
    case 'dots':
      return (
        <figure className="sh-fig-pitch" onClick={onOpen}>
          <PitchDots dots={card.dots} big={big} />
          <figcaption className="t-caption">{card.caption}</figcaption>
        </figure>
      )
    case 'table':
      return (
        <table className="sh-table">
          <thead>
            <tr>{card.columns.map((c) => <th key={c} className="t-label">{c}</th>)}</tr>
          </thead>
          <tbody>
            {card.rows.map((r, i) => (
              <tr key={i}>
                {r.cells.map((c, j) => (
                  <td key={j} className={j > 2 ? 't-numeric' : ''}>{j === 0 && r.href ? <a href={r.href}>{c}</a> : c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
    case 'goals':
      return (
        <div className={`sh-goals${big ? ' is-big' : ''}`}>
          {card.items.map((it) => (
            <figure key={it.goalEid} onClick={onOpen}>
              <GoalChart data={card.match} item={it} focus={null} open={() => onOpen?.()} title="" />
              <figcaption className="t-caption">{`${it.clock} · ${it.source}`}</figcaption>
            </figure>
          ))}
        </div>
      )
  }
}

export const cardTitle = (c: Card) => (c.kind === 'figures' ? '' : c.title)

/** The answer's clips on the match video (only matches with video have any). */
export function ClipPlayer({ clips, onClose }: { clips: Clips; onClose?: () => void }) {
  const pl = usePlaylist(clips.match)
  const { open, openSpans } = pl
  useEffect(() => {
    if (clips.spans) openSpans(clips.title, clips.spans, 'qa')
    else open(clips.title, clips.eids ?? [], undefined, 'qa')
  }, [clips, open, openSpans])
  if (!pl.playlist) return null
  return (
    <Player
      data={clips.match}
      playlist={pl.playlist}
      go={pl.go}
      close={() => {
        pl.close()
        onClose?.()
      }}
    />
  )
}
