// PROTOTYPE · Home C「检索 + 报告」: the first screen reads like a search page that teaches what can be asked
// (grouped by kind). Each answer then becomes a short report in the match page's own pattern: chart left,
// table right, the video opening inline above what started it. A table of contents keeps this visit's questions.
import { useState } from 'react'
import { AskBox, CardBody, ClipPlayer, CopyLink, FOOTNOTE, Nav, cardTitle, useStream, type Conv, type Turn } from './parts'
import { SUGGESTIONS, type Answer, type Clips } from './qa'

const KINDS: Record<string, string> = {
  联赛排名: '哪支队、哪个球员某一项最多，排第几',
  一支队的多场: '一支队的多场汇总、逐场变化、只看主场或赢球的比赛',
  单场: '一场比赛里的进球、射门、推进、转换和定位球',
  球员: '一名球员在多场里的出场、动作和贡献',
}

export function HomeC({ conv }: { conv: Conv }) {
  if (conv.turns.length === 0) {
    return (
      <div className="hc">
        <Nav active="home" />
        <section className="hc-search">
          <h1 className="hc-title">Threader <span>问答</span></h1>
          <AskBox big autoFocus onAsk={conv.ask} placeholder="比如：中乙哪支队反击射门最多？" />
          <p className="t-caption">2026 赛季中超 240 场、中甲 240 场、中乙 359 场；厦门飞鹭的比赛有视频（现在 1 场）。</p>
          <div className="hc-kinds">
            {SUGGESTIONS.map((s) => (
              <div key={s.q} className="hc-kind">
                <div className="t-heading">{s.kind}</div>
                <p className="t-caption">{KINDS[s.kind]}</p>
                <button onClick={() => conv.ask(s.q)}>{s.q}</button>
              </div>
            ))}
          </div>
          <p className="t-caption hc-foot">{FOOTNOTE}</p>
        </section>
      </div>
    )
  }
  return (
    <div className="hc is-reading">
      <Nav active="home" />
      <div className="hc-layout">
        <nav className="hc-toc">
          <div className="t-label">这次问过的</div>
          <ol>
            {conv.turns.map((t) => (
              <li key={t.id}><a href={`#${t.id}`}>{t.question}</a></li>
            ))}
          </ol>
          <button className="sh-link-btn" onClick={conv.reset}>清空，重新开始</button>
        </nav>
        <main className="hc-doc">
          {conv.turns.map((t) => (
            <Report key={t.id} turn={t} onDone={() => conv.markStreamed(t.id)} onAsk={conv.ask} />
          ))}
        </main>
      </div>
      <div className="hc-dock">
        <AskBox onAsk={conv.ask} placeholder="接着问，或者问别的……" />
      </div>
    </div>
  )
}

function Report({ turn, onDone, onAsk }: { turn: Turn; onDone: () => void; onAsk: (q: string) => void }) {
  const a = turn.answer
  const st = useStream(a, turn.streamed, onDone)
  return (
    <article className="hc-report" id={turn.id}>
      <div className="t-caption hc-kicker">{a ? [a.scope !== '—' ? a.scope : null, a.subject ? `分析对象：${a.subject}` : null].filter(Boolean).join(' · ') : '正在查询……'}</div>
      <h1 className="t-display hc-h1">{turn.question}</h1>
      {a && (
        <>
          <div className="hc-lead">{st.paragraphs.map((p, i) => (p ? <p key={i}>{p}</p> : null))}</div>
          {a.steps.length > 0 && (
            <details className="hc-how">
              <summary className="t-caption">{`怎么查的（${a.steps.length} 步）`}</summary>
              <ol>{a.steps.map((s) => <li key={s} className="t-caption">{s}</li>)}</ol>
            </details>
          )}
          {st.done && <ReportBody a={a} onAsk={onAsk} question={turn.question} />}
        </>
      )}
    </article>
  )
}

function ReportBody({ a, onAsk, question }: { a: Answer; onAsk: (q: string) => void; question: string }) {
  const [playing, setPlaying] = useState<Clips | null>(null)
  const figures = a.cards.find((c) => c.kind === 'figures')
  const chart = a.cards.find((c) => c.kind === 'dots' || c.kind === 'ranking')
  const table = a.cards.find((c) => c.kind === 'table')
  const goals = a.cards.find((c) => c.kind === 'goals')
  return (
    <>
      {figures && <div className="hc-figs"><CardBody card={figures} /></div>}
      <div className={`hc-video${a.clips ? ' has' : ''}`}>
        {a.clips ? (
          <button className="hc-play" onClick={() => setPlaying(a.clips)}>{`▶ 看全部 ${a.clips.count} 段`}</button>
        ) : (
          <span className="hc-novideo">没有视频</span>
        )}
        <span className="t-caption">{a.videoNote}</span>
      </div>
      {playing && (
        <div className="hc-inline-player">
          <ClipPlayer clips={playing} onClose={() => setPlaying(null)} />
        </div>
      )}
      {goals && goals.kind === 'goals' && (
        <section className="hc-goals">
          {goals.items.map((it) => (
            <div key={it.goalEid} className="hc-goal">
              <CardBody card={{ ...goals, items: [it] }} />
              <div>
                <div className="t-heading">{`${it.clock} · ${it.source}`}</div>
                <p className="t-caption">{it.passes ? `${it.passes} 脚传递、${it.seconds} 秒，从${it.startZone}开始` : `没有传递，从${it.startZone}开始`}</p>
                {it.span && (
                  <button className="hc-play sm" onClick={() => setPlaying({ title: `${it.clock} 的进球`, match: goals.match, spans: [{ start: it.span!.start, end: it.span!.end, eids: it.eids }], count: 1 })}>
                    ▶ 看这个回合
                  </button>
                )}
              </div>
            </div>
          ))}
        </section>
      )}
      {(chart || table) && (
        <section className={`hc-figure${chart && table ? '' : ' is-single'}`}>
          {chart && (
            <div className="hc-chart">
              <div className="t-label">{cardTitle(chart)}</div>
              <CardBody card={chart} big={chart.kind === 'ranking'} />
            </div>
          )}
          {table && (
            <div className="hc-table">
              <div className="t-label">{cardTitle(table)}</div>
              <CardBody card={table} />
            </div>
          )}
        </section>
      )}
      <footer className="hc-after">
        {a.links.length > 0 && (
          <div>
            <div className="t-label">相关页面</div>
            {a.links.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}
          </div>
        )}
        <div>
          <div className="t-label">接着问</div>
          {a.followUps.map((f) => <button key={f} onClick={() => onAsk(f)}>{f}</button>)}
        </div>
        {!a.demo && <CopyLink question={question} />}
      </footer>
    </>
  )
}
