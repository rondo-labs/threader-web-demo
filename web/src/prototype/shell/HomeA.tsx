// PROTOTYPE · Home A「对话 + 侧边舞台」: a clean single-column chat like Claude's; charts and video open in a
// stage that slides in on the right, the way threader-desktop's 问答 page does.
import { useState } from 'react'
import { AskBox, CardBody, ClipPlayer, CopyLink, FOOTNOTE, Nav, cardTitle, useStream, type Conv, type Turn } from './parts'
import { SUGGESTIONS, type Answer } from './qa'

type StageState = { turn: string; card: number | 'clips' } | null

export function HomeA({ conv }: { conv: Conv }) {
  const [stage, setStage] = useState<StageState>(null)
  const empty = conv.turns.length === 0
  const stageTurn = stage ? conv.turns.find((t) => t.id === stage.turn)?.answer ?? null : null
  return (
    <div className={`ha${stage ? ' has-stage' : ''}`}>
      <aside className="ha-rail">
        <button className="ha-new" title="新对话" onClick={() => { conv.reset(); setStage(null) }}>＋</button>
        {conv.turns.map((t, i) => (
          <a key={t.id} href={`#${t.id}`} className="ha-rail-item" title={t.question}>{i + 1}</a>
        ))}
      </aside>
      <div className="ha-main">
        <Nav active="home" />
        {empty ? (
          <section className="ha-hero">
            <h1 className="t-display">问问 2026 赛季的中超、中甲、中乙</h1>
            <p className="t-lead">839 场比赛的 Opta 事件数据；厦门飞鹭的比赛有视频（现在 1 场）。</p>
            <AskBox big autoFocus onAsk={conv.ask} />
            <div className="ha-suggest">
              {SUGGESTIONS.map((s) => (
                <button key={s.q} onClick={() => conv.ask(s.q)}>
                  <span className="t-label">{s.kind}</span>
                  <span>{s.q}</span>
                </button>
              ))}
            </div>
            <p className="t-caption ha-foot">{FOOTNOTE}</p>
          </section>
        ) : (
          <>
            <div className="ha-thread">
              {conv.turns.map((t) => (
                <TurnA key={t.id} turn={t} onDone={() => conv.markStreamed(t.id)} onAsk={conv.ask}
                  onOpen={(card) => setStage({ turn: t.id, card })} />
              ))}
            </div>
            <div className="ha-dock">
              <AskBox onAsk={conv.ask} placeholder="接着问……" />
              <p className="t-caption">{FOOTNOTE}</p>
            </div>
          </>
        )}
      </div>
      {stage && stageTurn && <StageA answer={stageTurn} what={stage.card} onPick={(card) => setStage({ ...stage, card })} onClose={() => setStage(null)} />}
    </div>
  )
}

function TurnA({ turn, onDone, onAsk, onOpen }: { turn: Turn; onDone: () => void; onAsk: (q: string) => void; onOpen: (card: number | 'clips') => void }) {
  const a = turn.answer
  const st = useStream(a, turn.streamed, onDone)
  return (
    <div className="ha-turn" id={turn.id}>
      <div className="ha-q">{turn.question}</div>
      {!a ? (
        <div className="ha-steps t-caption">◇ 正在理解问题……</div>
      ) : (
        <div className="ha-a">
          {a.steps.slice(0, st.steps).map((s) => (
            <div key={s} className="ha-steps t-caption">◆ {s}</div>
          ))}
          <div className="ha-text">
            {st.paragraphs.map((p, i) => (p ? <p key={i}>{p}</p> : null))}
          </div>
          {st.done && <AnswerExtrasA a={a} onAsk={onAsk} onOpen={onOpen} question={turn.question} />}
        </div>
      )}
    </div>
  )
}

function AnswerExtrasA({ a, onAsk, onOpen, question }: { a: Answer; onAsk: (q: string) => void; onOpen: (card: number | 'clips') => void; question: string }) {
  return (
    <>
      {a.cards.length > 0 && (
        <div className="ha-cards">
          {a.cards.map((c, i) => (
            <div key={i} className={`ha-card k-${c.kind}`}>
              {cardTitle(c) && (
                <div className="ha-card-head">
                  <span className="t-label">{cardTitle(c)}</span>
                  {c.kind !== 'figures' && <button className="sh-link-btn" onClick={() => onOpen(i)}>放大 ↗</button>}
                </div>
              )}
              <CardBody card={c} onOpen={() => onOpen(i)} />
            </div>
          ))}
        </div>
      )}
      {a.videoNote && (
        <div className={`ha-video${a.clips ? ' has' : ''}`}>
          {a.clips ? (
            <button className="ha-play" onClick={() => onOpen('clips')}>{`▶ 看画面 · ${a.clips.count} 段`}</button>
          ) : (
            <span className="ha-novideo">没有视频</span>
          )}
          <span className="t-caption">{a.videoNote}</span>
        </div>
      )}
      {a.scope !== '—' && <div className="t-caption ha-scope">{`范围：${a.scope}${a.subject ? ` · 分析对象：${a.subject}` : ''}`}</div>}
      <div className="ha-links">
        {a.links.map((l) => <a key={l.href} href={l.href}>{`${l.label} →`}</a>)}
        {!a.demo && <CopyLink question={question} />}
      </div>
      <div className="ha-follow">
        {a.followUps.map((f) => <button key={f} onClick={() => onAsk(f)}>{f}</button>)}
      </div>
    </>
  )
}

function StageA({ answer, what, onPick, onClose }: { answer: Answer; what: number | 'clips'; onPick: (c: number | 'clips') => void; onClose: () => void }) {
  const visual = answer.cards.map((c, i) => ({ c, i })).filter(({ c }) => c.kind !== 'figures')
  return (
    <aside className="ha-stage">
      <div className="ha-stage-head">
        <div className="seg seg-sm">
          {visual.map(({ c, i }) => (
            <button key={i} aria-pressed={what === i} onClick={() => onPick(i)}>{cardTitle(c)}</button>
          ))}
          {answer.clips && <button aria-pressed={what === 'clips'} onClick={() => onPick('clips')}>{`片段 ${answer.clips.count}`}</button>}
        </div>
        <button className="ha-close" onClick={onClose} aria-label="关闭">✕</button>
      </div>
      <div className="t-caption ha-stage-q">{answer.question}</div>
      <div className="ha-stage-body">
        {what === 'clips' ? (
          answer.clips ? <ClipPlayer clips={answer.clips} onClose={onClose} /> : null
        ) : (
          <CardBody card={answer.cards[what]} big />
        )}
        {what !== 'clips' && !answer.clips && <p className="t-caption">{answer.videoNote}</p>}
      </div>
    </aside>
  )
}
