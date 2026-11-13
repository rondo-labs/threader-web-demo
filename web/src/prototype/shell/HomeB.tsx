// PROTOTYPE · Home B「对话 + 常驻画板」: a narrow chat on the left keeps only the words; the right side is a
// canvas that always shows the selected answer as a board (big numbers, the chart, the table, the video).
// Before the first question the canvas shows what can be asked about: the three leagues and the video.
import { useEffect, useState } from 'react'
import { LEAGUES, loadAll, type League } from './data'
import { AskBox, CardBody, ClipPlayer, CopyLink, FOOTNOTE, Nav, cardTitle, useStream, type Conv, type Turn } from './parts'
import { SUGGESTIONS, type Answer } from './qa'

export function HomeB({ conv }: { conv: Conv }) {
  const [picked, setPicked] = useState<string | null>(null)
  const last = [...conv.turns].reverse().find((t) => t.answer)
  const sel = conv.turns.find((t) => t.id === picked) ?? last ?? null
  return (
    <div className="hb">
      <Nav active="home" compact />
      <div className="hb-body">
        <section className="hb-chat">
          <div className="hb-chat-head">
            <span className="t-label">对话</span>
            {conv.turns.length > 0 && <button className="sh-link-btn" onClick={() => { conv.reset(); setPicked(null) }}>＋ 新对话</button>}
          </div>
          <div className="hb-turns">
            {conv.turns.length === 0 && <p className="t-caption hb-hint">在下面提问，回答的图、表和视频会出现在右边。</p>}
            {conv.turns.map((t) => (
              <TurnB key={t.id} turn={t} active={sel?.id === t.id} onPick={() => setPicked(t.id)} onDone={() => conv.markStreamed(t.id)} />
            ))}
          </div>
          <div className="hb-dock">
            <AskBox onAsk={(q) => { setPicked(null); conv.ask(q) }} autoFocus />
            <p className="t-caption">{FOOTNOTE}</p>
          </div>
        </section>
        <section className="hb-canvas">
          {sel?.answer ? <Board a={sel.answer} onAsk={(q) => { setPicked(null); conv.ask(q) }} /> : sel ? <p className="t-caption hb-wait">正在查询……</p> : <Scope onAsk={conv.ask} />}
        </section>
      </div>
    </div>
  )
}

function TurnB({ turn, active, onPick, onDone }: { turn: Turn; active: boolean; onPick: () => void; onDone: () => void }) {
  const st = useStream(turn.answer, turn.streamed, onDone)
  const [open, setOpen] = useState(false)
  return (
    <div className={`hb-turn${active ? ' is-active' : ''}`} onClick={onPick}>
      <div className="hb-q">{turn.question}</div>
      {turn.answer ? (
        <>
          {turn.answer.steps.length > 0 && (
            <button className="hb-steps t-caption" onClick={(e) => { e.stopPropagation(); setOpen(!open) }}>
              {`◆ 查询了 ${Math.min(st.steps, turn.answer.steps.length)} 步 ${open ? '▴' : '▾'}`}
            </button>
          )}
          {open && turn.answer.steps.map((s) => <div key={s} className="t-caption hb-step">{s}</div>)}
          <div className="hb-text">{st.paragraphs.map((p, i) => (p ? <p key={i}>{p}</p> : null))}</div>
        </>
      ) : (
        <div className="t-caption">◇ 正在理解问题……</div>
      )}
    </div>
  )
}

function Board({ a, onAsk }: { a: Answer; onAsk: (q: string) => void }) {
  const figures = a.cards.find((c) => c.kind === 'figures')
  const visuals = a.cards.filter((c) => c.kind === 'dots' || c.kind === 'goals' || c.kind === 'ranking')
  const tables = a.cards.filter((c) => c.kind === 'table')
  return (
    <div className="hb-board">
      <header className="hb-board-head">
        <div className="t-caption">{[a.scope !== '—' ? a.scope : null, a.subject ? `分析对象：${a.subject}` : null].filter(Boolean).join(' · ')}</div>
        <h1 className="t-title">{a.question}</h1>
        {!a.demo && <CopyLink question={a.question} />}
      </header>
      {figures && <div className="hb-figs"><CardBody card={figures} big /></div>}
      <div className={`hb-grid${tables.length ? '' : ' is-single'}`}>
        <div className="hb-main-visual">
          {visuals.map((c, i) => (
            <div key={i} className="hb-panel">
              <div className="t-label">{cardTitle(c)}</div>
              <CardBody card={c} big={c.kind === 'dots'} />
            </div>
          ))}
        </div>
        {tables.length > 0 && (
          <div className="hb-side">
            {tables.map((c, i) => (
              <div key={i} className="hb-panel">
                <div className="t-label">{cardTitle(c)}</div>
                <CardBody card={c} />
              </div>
            ))}
          </div>
        )}
      </div>
      <div className={`hb-video${a.clips ? ' has' : ''}`}>
        <div className="t-label">{a.clips ? `视频 · ${a.clips.count} 段` : '视频'}</div>
        {a.clips ? <ClipPlayer clips={a.clips} /> : <p className="hb-novideo">{a.videoNote || '没有视频'}</p>}
      </div>
      <footer className="hb-board-foot">
        <div className="hb-links">{a.links.map((l) => <a key={l.href} href={l.href}>{`${l.label} →`}</a>)}</div>
        <div className="hb-follow">
          <span className="t-label">接着问</span>
          {a.followUps.map((f) => <button key={f} onClick={() => onAsk(f)}>{f}</button>)}
        </div>
      </footer>
    </div>
  )
}

/** Before the first question: what the data covers, and what kinds of questions it answers. */
function Scope({ onAsk }: { onAsk: (q: string) => void }) {
  const [all, setAll] = useState<League[] | null>(null)
  useEffect(() => { loadAll().then(setAll) }, [])
  return (
    <div className="hb-scope">
      <h1 className="t-display">能问什么</h1>
      <p className="t-lead">2026 赛季三个联赛的每一场比赛。厦门飞鹭的比赛有视频，回答里涉及这些比赛时可以直接看画面。</p>
      <div className="hb-leagues">
        {LEAGUES.map((l, i) => {
          const lg = all?.[i]
          const first = lg?.stages[0].groups.flatMap((g) => g.rows.slice(0, 1)) ?? []
          return (
            <a key={l.slug} className="hb-league" href={`/prototype/team/?league=${l.slug}`}>
              <div className="t-title">{l.zh}</div>
              <div className="t-numeric">{lg ? `${Object.keys(lg.teams).length} 支队 · ${lg.matches.length} 场` : '…'}</div>
              <div className="t-caption">{lg ? `常规赛第一：${first.map((r) => lg.teams[r.teamId].nameZh).join('、')}` : ''}</div>
              <div className="t-caption">{lg ? `视频：${lg.matches.filter((m) => m.video).length} 场` : ''}</div>
            </a>
          )
        })}
      </div>
      <div className="hb-kinds">
        {SUGGESTIONS.map((s) => (
          <button key={s.q} onClick={() => onAsk(s.q)}>
            <span className="t-label">{s.kind}</span>
            <span>{s.q}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
