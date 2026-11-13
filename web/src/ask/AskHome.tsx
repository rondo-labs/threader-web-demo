// /: the home page is the Q&A. Before the first question it shows what can be asked, in four kinds; then a clean
// single-column conversation in which charts and video open in a stage on the right (threader-desktop's 问答).
import { useEffect, useRef, useState } from 'react'
import { Nav } from '../app/Nav'
import { loadIndex, type SiteIndex } from '../team/data'
import { CardBody, ClipPlayer, cardTitle } from './cards'
import { shareLink, useConversation, useStream, type Turn } from './conversation'
import { loadExamples } from './source'
import type { Answer, Example } from './types'

const KINDS: Record<string, string> = {
  联赛排名: '哪支队、哪个球员某一项最多，排第几',
  一支队的多场: '一支队的多场汇总、逐场变化、只看主场或赢球的比赛',
  单场: '一场比赛里的进球、射门、推进、转换和定位球',
  球员: '一名球员在多场里的出场、动作和贡献',
}
const FOOTNOTE = '回答里的数字、球场图和片段来自查询；问答接上之后，文字由 DeepSeek 组织。每个 IP 每天能问的次数有限。'

type StageState = { turn: string; card: number | 'clips' } | null

export function AskHome() {
  const conv = useConversation()
  const [examples, setExamples] = useState<Example[]>([])
  const [index, setIndex] = useState<SiteIndex | null>(null)
  const [stage, setStage] = useState<StageState>(null)
  useEffect(() => {
    document.title = 'Threader · 问答'
    loadExamples().then(setExamples)
    loadIndex().then(setIndex).catch(() => setIndex(null))
  }, [])
  const empty = conv.turns.length === 0
  const stageAnswer = stage ? (conv.turns.find((t) => t.id === stage.turn)?.answer ?? null) : null
  const matches = index?.leagues.reduce((s, l) => s + l.matches, 0)
  const video = index?.leagues.reduce((s, l) => s + l.video, 0)
  return (
    <div className={`ak${stage && stageAnswer ? ' has-stage' : ''}`}>
      <aside className="ak-rail">
        <button className="ak-new" title="新对话" onClick={() => { conv.reset(); setStage(null) }}>＋</button>
        {conv.turns.map((t, i) => (
          <a key={t.id} href={`#${t.id}`} className="ak-rail-item" title={t.question}>{i + 1}</a>
        ))}
      </aside>
      <div className="ak-main">
        <Nav active="home" />
        {empty ? (
          <section className="ak-hero">
            <h1 className="t-display">问问 2026 赛季的中超、中甲、中乙</h1>
            <p className="t-lead">
              {index
                ? `${matches} 场比赛的 Opta 事件数据；${index.focusTeams.map((t) => t.nameZh).join('、')}的比赛有视频（现在 ${video} 场）。`
                : '2026 赛季三个联赛每一场比赛的 Opta 事件数据。'}
            </p>
            <AskBox big autoFocus onAsk={conv.ask} />
            <div className="ak-kinds">
              {Object.entries(KINDS).map(([kind, what]) => {
                const ex = examples.find((e) => e.kind === kind)
                return (
                  <div key={kind} className="ak-kind">
                    <div className="t-heading">{kind}</div>
                    <p className="t-caption">{what}</p>
                    {ex && <button onClick={() => conv.ask(ex.question)}>{ex.question}</button>}
                  </div>
                )
              })}
            </div>
            <p className="t-caption ak-foot">{FOOTNOTE}</p>
          </section>
        ) : (
          <>
            <div className="ak-thread">
              {conv.turns.map((t) => (
                <TurnView key={t.id} turn={t} onDone={() => conv.markStreamed(t.id)} onAsk={conv.ask} onOpen={(card) => setStage({ turn: t.id, card })} />
              ))}
            </div>
            <div className="ak-dock">
              <AskBox onAsk={conv.ask} placeholder="接着问……" />
              <p className="t-caption">{FOOTNOTE}</p>
            </div>
          </>
        )}
      </div>
      {stage && stageAnswer && <Stage answer={stageAnswer} what={stage.card} onPick={(card) => setStage({ ...stage, card })} onClose={() => setStage(null)} />}
    </div>
  )
}

function AskBox({ onAsk, placeholder = '问任何关于这三个联赛的问题……', big, autoFocus }: {
  onAsk: (q: string) => void; placeholder?: string; big?: boolean; autoFocus?: boolean
}) {
  const [text, setText] = useState('')
  const send = () => {
    if (!text.trim()) return
    onAsk(text)
    setText('')
  }
  return (
    <div className={`ak-ask${big ? ' is-big' : ''}`}>
      <textarea
        rows={big ? 2 : 1}
        value={text}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label="提问"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            send()
          }
        }}
      />
      <button className="ak-send" onClick={send} disabled={!text.trim()} aria-label="发送">↑</button>
    </div>
  )
}

function TurnView({ turn, onDone, onAsk, onOpen }: { turn: Turn; onDone: () => void; onAsk: (q: string) => void; onOpen: (card: number | 'clips') => void }) {
  const a = turn.answer
  const st = useStream(a, turn.streamed, onDone)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!turn.streamed) box.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [turn.streamed])
  return (
    <div className="ak-turn" id={turn.id} ref={box}>
      <div className="ak-q">{turn.question}</div>
      {!a ? (
        <div className="ak-step t-caption">◇ 正在理解问题……</div>
      ) : (
        <div className="ak-a">
          {a.example && <div className="ak-badge t-caption">示例回答 · 问答接上之前，由程序从数据生成</div>}
          {a.steps.slice(0, st.steps).map((s) => (
            <div key={s} className="ak-step t-caption">◆ {s}</div>
          ))}
          <div className="ak-text">{st.paragraphs.map((p, i) => (p ? <p key={i}>{p}</p> : null))}</div>
          {st.done && <Extras a={a} onAsk={onAsk} onOpen={onOpen} />}
        </div>
      )}
    </div>
  )
}

function Extras({ a, onAsk, onOpen }: { a: Answer; onAsk: (q: string) => void; onOpen: (card: number | 'clips') => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <>
      {a.cards.length > 0 && (
        <div className="ak-cards">
          {a.cards.map((c, i) => (
            <div key={i} className={`ak-card k-${c.kind}`}>
              {cardTitle(c) && (
                <div className="ak-card-head">
                  <span className="t-label">{cardTitle(c)}</span>
                  <button className="ak-link-btn" onClick={() => onOpen(i)}>放大 ↗</button>
                </div>
              )}
              <CardBody card={c} onOpen={() => onOpen(i)} />
            </div>
          ))}
        </div>
      )}
      {a.videoNote && (
        <div className={`ak-video${a.clips ? ' has' : ''}`}>
          {a.clips ? <button className="ak-play" onClick={() => onOpen('clips')}>{`▶ 看画面 · ${a.clips.count} 段`}</button> : <span className="ak-novideo">没有视频</span>}
          <span className="t-caption">{a.videoNote}</span>
        </div>
      )}
      {a.scope && <div className="t-caption ak-scope">{`范围：${a.scope}${a.subject ? ` · 分析对象：${a.subject}` : ''}`}</div>}
      <div className="ak-links">
        {a.links.map((l) => <a key={l.href} href={l.href}>{`${l.label} →`}</a>)}
        {!a.unanswered && (
          <button
            className="ak-link-btn"
            title="链接里只带问题，打开后重新问一遍"
            onClick={() => {
              navigator.clipboard?.writeText(shareLink(a.question))
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
          >
            {copied ? '已复制链接' : '复制链接'}
          </button>
        )}
      </div>
      <div className="ak-follow">
        {a.followUps.map((f) => <button key={f} onClick={() => onAsk(f)}>{f}</button>)}
      </div>
    </>
  )
}

function Stage({ answer, what, onPick, onClose }: { answer: Answer; what: number | 'clips'; onPick: (c: number | 'clips') => void; onClose: () => void }) {
  const visual = answer.cards.map((c, i) => ({ c, i })).filter(({ c }) => c.kind !== 'figures')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const card = typeof what === 'number' ? answer.cards[what] : null
  return (
    <aside className="ak-stage" aria-label="放大">
      <div className="ak-stage-head">
        <div className="seg seg-sm">
          {visual.map(({ c, i }) => (
            <button key={i} aria-pressed={what === i} onClick={() => onPick(i)}>{cardTitle(c)}</button>
          ))}
          {answer.clips && <button aria-pressed={what === 'clips'} onClick={() => onPick('clips')}>{`片段 ${answer.clips.count}`}</button>}
        </div>
        <button className="ak-close" onClick={onClose} aria-label="关闭">✕</button>
      </div>
      <div className="t-caption">{answer.question}</div>
      <div className="ak-stage-body">
        {what === 'clips' ? (answer.clips ? <ClipPlayer clips={answer.clips} onClose={onClose} /> : null) : card && <CardBody card={card} big />}
        {what !== 'clips' && !answer.clips && answer.videoNote && <p className="t-caption">{answer.videoNote}</p>}
      </div>
    </aside>
  )
}
