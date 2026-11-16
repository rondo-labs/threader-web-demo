// PROTOTYPE: /player/<id>/ — one player's season, built like the team page: a header (squad facts included), the
// five readings where he stands out in his position group plus a small quadrant chart, then the team page's six
// chapters and a match log. In a chapter the table is the filter. The variants differ only in each section's
// chart: A draws the picked row match by match (as the team page does), B draws the whole season on one pitch,
// C keeps both — the pitch with a strip of bars under it that filters it (pick a match, the pitch draws only that
// match; hover either chart and the other lights up) — and D keeps both in one place behind a switch.
import { useEffect, useMemo, useRef, useState } from 'react'
import { CHAPTERS } from '../../match-analysis/common'
import { AppBars, GroupStrip, Quadrant, SeasonPitch, type QPoint } from './charts'
import { ClipPlayer, buildClips, type PPlaylist } from './ClipPlayer'
import {
  DEFAULT_AXES, PFILTERS, axisOf, axisValue, currentStint, fmtAxis, fmtInt, fmtValue, footLine, groupRank, indexHref,
  loadDetail, loadPlayers, matchHref, nameOf, peers, placesLine, playerHref, ranked, reading, shareOf, shortDate, shortName,
  standouts, teamHref, teamRank, type PFilter, type PMetric, type PlayerDetail, type Season, type Stint,
} from './data'
import { ProtoNav, SearchBox } from './parts'

const CHAPTER_ZH: Record<string, string> = Object.fromEntries(CHAPTERS.map((c) => [c.key, c.zh]))
const TABS = [...CHAPTERS.map((c) => c.key as string), 'log']

function readUrl() {
  const q = new URLSearchParams(location.search)
  const tab = q.get('tab')
  const filter = q.get('filter') as PFilter | null
  return {
    tab: tab && TABS.includes(tab) ? tab : 'overview',
    filter: filter && PFILTERS.some(([k]) => k === filter) ? filter : ('all' as PFilter),
    focus: q.get('focus'),
  }
}

function keepOf(detail: PlayerDetail, f: PFilter): boolean[] {
  const n = detail.apps.length
  return detail.apps.map((a, i) => (f === 'home' ? a.h : f === 'away' ? !a.h : f === 'last5' ? i >= n - 5 : true))
}

export type Variant = 'A' | 'B' | 'C' | 'D'
type ChartMode = 'bars' | 'pitch' | 'linked'

export function PlayerPage({ pid, league, variant }: { pid: string; league: string; variant: Variant }) {
  // D: one chart at a time, switched for every section at once from the tab bar.
  const [dMode, setDMode] = useState<'pitch' | 'bars'>('pitch')
  const mode: ChartMode = variant === 'A' ? 'bars' : variant === 'B' ? 'pitch' : variant === 'C' ? 'linked' : dMode
  const [S, setS] = useState<Season | null>(null)
  const [detail, setDetail] = useState<PlayerDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState(() => readUrl().tab)
  const [filter, setFilter] = useState<PFilter>(() => readUrl().filter)
  const [focus, setFocus] = useState<string | null>(() => readUrl().focus)
  const [playlist, setPlaylist] = useState<PPlaylist | null>(null)

  useEffect(() => {
    Promise.all([loadPlayers(league), loadDetail(league, pid)])
      .then(([s, d]) => { setS(s); setDetail(d) })
      .catch((e: Error) => setError(e.message))
  }, [league, pid])
  useEffect(() => {
    const url = new URL(location.href)
    url.searchParams.set('tab', tab)
    if (filter === 'all') url.searchParams.delete('filter')
    else url.searchParams.set('filter', filter)
    if (focus) url.searchParams.set('focus', focus)
    else url.searchParams.delete('focus')
    history.replaceState(null, '', url)
    if (S) document.title = `原型 · ${nameOf(S.lg.players[pid])}`
  }, [tab, filter, focus, S, pid])

  if (error) return <p className="boot">{`球员没有加载出来（${error}）。`}<a href="/prototype/players/">回到球员</a></p>
  if (!S || !detail) return <p className="boot">加载中…</p>
  const p = S.lg.players[pid]
  const st = currentStint(S, pid)
  const all = S.sum.get(pid)!.all
  const stints = S.stintsOf.get(pid) ?? []
  const ii = (k: string) => S.idx[k]
  const personal = (k: string) => reading(all, ii(`overview.personal.${k}`), S.lg.metrics[ii(`overview.personal.${k}`)]).total
  const foot = footLine(p)
  const isChapter = CHAPTERS.some((c) => c.key === tab)
  const open = (title: string, evs: number[], owner: string, start?: number) => {
    const clips = buildClips(detail, evs)
    if (!clips.length) return
    const at = start != null ? clips.findIndex((c) => c.evs.includes(start)) : 0
    setPlaylist({ title, clips, index: Math.max(0, at), owner, opened: Date.now() })
  }
  const teammates = (S.teamStints.get(st.t) ?? []).filter((s) => s.f.all[0] > 0).sort((a, b) => b.f.all[0] - a.f.all[0])
  const others = stints.filter((s) => s !== st).map((s) => S.lg.teams[s.t].nameZh)
  const hist = p.history.filter((h) => h.season !== '2026')
  return (
    <div className="tm pp">
      <ProtoNav />
      <header className="tm-head pp-head">
        <div>
          <div className="t-caption">
            {`${S.lg.nameZh} · 2026 赛季 · `}
            <a href={teamHref(st.t)}>{S.lg.teams[st.t].nameZh}</a>
            {others.length ? ` · 赛季中从${others.join('、')}转来（排名按两队合计）` : ''}
          </div>
          <h1 className="t-display pp-name">
            {p.number != null && <span className="pp-num">{p.number}</span>}
            {nameOf(p)}
            {p.nameZh && <span className="pp-en">{p.nameEn}</span>}
          </h1>
          <div className="t-lead">{`${p.group} · ${placesLine(p.pos, 3)} 分钟`}</div>
          {hist.length > 0 && (
            <div className="t-caption pp-hist">
              {'之前：'}
              {['2024', '2025'].map((y) => {
                const hs = hist.filter((h) => h.season === y)
                return hs.length ? <span key={y}>{`${y} ${hs.map((h) => `${h.team}（${h.league}）`).join('、')}`}</span> : null
              })}
            </div>
          )}
        </div>
        <dl className="tm-record">
          <div><dt className="t-label">出场</dt><dd className="t-figure">{all[1]}</dd></div>
          <div><dt className="t-label">首发</dt><dd className="t-figure">{all[2]}</dd></div>
          <div><dt className="t-label">分钟</dt><dd className="t-figure">{fmtInt(all[0])}</dd></div>
          <div><dt className="t-label">进球</dt><dd className="t-figure">{personal('goals')}</dd></div>
          <div><dt className="t-label">助攻</dt><dd className="t-figure">{personal('assists')}</dd></div>
        </dl>
        <dl className="tm-record pp-bio">
          <div><dt className="t-label">年龄</dt><dd className="t-figure">{p.age ?? '—'}</dd></div>
          <div><dt className="t-label">身高</dt><dd className="t-figure">{p.height ?? '—'}</dd></div>
          <div><dt className="t-label">体重</dt><dd className="t-figure">{p.weight ?? '—'}</dd></div>
          <div>
            <dt className="t-label">惯用脚</dt>
            <dd className={foot?.note ? 'pp-foot is-inferred' : 'pp-foot'} title={foot?.note ?? undefined}>{foot ? foot.text : '—'}</dd>
          </div>
          {p.nat && p.nat !== '中国' && <div><dt className="t-label">国籍</dt><dd className="pp-foot">{p.nat2 ? `${p.nat} / ${p.nat2}` : p.nat}</dd></div>}
          {p.joined && <div><dt className="t-label">加盟</dt><dd className="pp-foot">{p.joined.replace('-', ' 年 ').replace(/^(\d+ 年 )0?(\d+)$/, '$1$2 月')}</dd></div>}
        </dl>
        <div className="tm-picker">
          <select value={pid} onChange={(e) => location.assign(playerHref(e.target.value, league, { tab }))} aria-label="同队球员">
            {teammates.map((s) => <option key={s.p} value={s.p}>{`${S.lg.players[s.p].number ?? ''} ${nameOf(S.lg.players[s.p])}`}</option>)}
          </select>
          <SearchBox />
        </div>
      </header>

      <Standouts S={S} pid={pid} league={league} onPick={(m) => { setTab(m.chapter); setFilter('all'); setFocus(m.key) }} />

      <nav className="tabs tm-tabs" aria-label="章">
        {CHAPTERS.map((c) => (
          <button key={c.key} aria-current={tab === c.key} onClick={() => { setTab(c.key); setFocus(null); setPlaylist(null) }}>{c.zh}</button>
        ))}
        {isChapter && (
          <div className="seg seg-sm tm-filter" role="group" aria-label="哪些比赛">
            {PFILTERS.map(([k, zh]) => <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>{zh}</button>)}
          </div>
        )}
        {isChapter && filter === 'last5' && <span className="t-caption">{`他最近出场的 5 场：${detail.apps.slice(-5).map((a) => shortDate(a.d)).join('、')}`}</span>}
        {isChapter && variant === 'D' && (
          <div className="seg seg-sm pp-mode" role="group" aria-label="左边的图">
            <button aria-pressed={dMode === 'pitch'} onClick={() => setDMode('pitch')}>场上分布</button>
            <button aria-pressed={dMode === 'bars'} onClick={() => setDMode('bars')}>按场次</button>
          </div>
        )}
        <span className="tm-tab-gap" />
        <button aria-current={tab === 'log'} onClick={() => setTab('log')}>比赛记录</button>
      </nav>

      <main className="tm-main">
        {tab === 'log' ? (
          <MatchLog S={S} detail={detail} />
        ) : (
          sectionsOf(S, tab).map((s) => (
            <PSection
              key={`${pid}-${tab}-${s.key}`} S={S} detail={detail} pid={pid} st={st} filter={filter} section={s} mode={mode}
              focus={s.metrics.some((m) => m.key === focus) ? focus : null}
              playlist={playlist?.owner === s.key ? playlist : null}
              open={(title, evs, start) => open(title, evs, s.key, start)}
              go={(i) => setPlaylist((pl) => (pl && i >= 0 && i < pl.clips.length ? { ...pl, index: i } : pl))}
              close={() => setPlaylist(null)}
            />
          ))
        )}
      </main>
    </div>
  )
}

interface SectionDef { key: string; title: string; question: string | null; chapter: string; metrics: PMetric[] }
function sectionsOf(S: Season, chapter: string): SectionDef[] {
  const out: SectionDef[] = []
  for (const m of S.lg.metrics) {
    if (m.chapter !== chapter) continue
    let s = out.find((x) => x.key === m.section)
    if (!s) out.push((s = { key: m.section, title: m.sectionTitle, question: m.question, chapter, metrics: [] }))
    s.metrics.push(m)
  }
  return out
}

/* ------------------------------------------------------------------ the band under the header */

function Standouts({ S, pid, league, onPick }: { S: Season; pid: string; league: string; onPick: (m: PMetric) => void }) {
  const p = S.lg.players[pid]
  const list = standouts(S, pid)
  const [xk, yk] = DEFAULT_AXES[p.group] ?? DEFAULT_AXES['中场']
  const ax = axisOf(S, xk), ay = axisOf(S, yk)
  const pts: QPoint[] = []
  for (const id of peers(S, p.group, 'all')) {
    const x = axisValue(S, id, xk, 'all'), y = axisValue(S, id, yk, 'all')
    if (x == null || y == null) continue
    pts.push({ id, x, y, name: nameOf(S.lg.players[id]), team: S.lg.teams[S.lg.players[id].teams.at(-1)!].nameZh, hl: false })
  }
  const me = pts.find((x) => x.id === pid)
  const gx = axisValue(S, pid, xk, 'all'), gy = axisValue(S, pid, yk, 'all')
  const ghost = !me && gx != null && gy != null ? { id: pid, x: gx, y: gy, name: nameOf(p), team: '', hl: false } : null
  const med = (k: string) => {
    const vs = pts.map((x) => (k === xk ? x.x : x.y)).sort((a, b) => a - b)
    return vs.length ? vs[Math.floor(vs.length / 2)] : null
  }
  const all = S.sum.get(pid)!.all
  return (
    <section className="tm-odd pp-odd">
      <div>
        <div className="t-label">{`和${S.lg.nameZh}其他${p.group}比，最突出的 5 项（整季，每 90 分钟）`}</div>
        {list.length ? (
          <div className="tm-tiles">
            {list.map((x) => {
              const g = groupRank(S, pid, x.m.key, 'all')
              const r = reading(all, S.idx[x.m.key], x.m)
              return (
                <button key={x.m.key} className="tm-tile" onClick={() => onPick(x.m)}>
                  <span className="t-caption">{`${CHAPTER_ZH[x.m.chapter]} · ${x.m.sectionTitle}`}</span>
                  <span className="t-heading">{shortName(S, x.m)}</span>
                  <span className="t-figure">{fmtValue(x.m.format, x.value)}</span>
                  <span className="t-caption">{`${x.more ? '偏多' : '偏少'} · 第 ${x.rank}/${x.of} · 中位数 ${fmtValue(x.m.format, x.median)}`}</span>
                  <GroupStrip rows={g.rows} me={pid} mine={r.value} med={g.median} label={(v) => fmtValue(x.m.format, v)} nameOf={(id) => nameOf(S.lg.players[id])} width={160} />
                </button>
              )
            })}
          </div>
        ) : (
          <p className="t-lead pp-unranked">{`整季出场 ${fmtInt(all[0])} 分钟，不到 ${fmtInt(S.lg.thresholds.all)} 分钟，不和同位置排名。下面的数字照常给出。`}</p>
        )}
      </div>
      <div className="pp-mini">
        <div className="t-label">{`在${S.lg.nameZh}${p.group}里的位置`}</div>
        <Quadrant
          small width={300} height={196} points={pts} ghost={ghost} selected={pid}
          xLabel={ax.label} yLabel={ay.label} xWords={ax.words} yWords={ay.words} xShort={ax.short} yShort={ay.short}
          xMed={med(xk)} yMed={med(yk)} fmtX={(v) => fmtAxis(S, xk, v)} fmtY={(v) => fmtAxis(S, yk, v)}
        />
        <div className="t-caption pp-mini-axes">{`横：${ax.label}　纵：${ay.label}`}</div>
        <a className="t-caption" href={indexHref({ league, group: p.group, sel: pid, hl: p.teams.at(-1)! })}>换两项读数，看全组 →</a>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ one section */

function PSection({ S, detail, pid, st, filter, section, mode, focus, playlist, open, go, close }: {
  S: Season; detail: PlayerDetail; pid: string; st: Stint; filter: PFilter; section: SectionDef; mode: ChartMode
  focus: string | null; playlist: PPlaylist | null
  open: (title: string, evs: number[], start?: number) => void; go: (i: number) => void; close: () => void
}) {
  const sum = S.sum.get(pid)![filter]
  const keep = useMemo(() => keepOf(detail, filter), [detail, filter])
  const visible = section.metrics.filter((m) => {
    const r = reading(sum, S.idx[m.key], m)
    if (r.total > 0 || r.n > 0) return true
    const g = groupRank(S, pid, m.key, filter)
    return (g.median ?? 0) > 0
  })
  const hidden = section.metrics.length - visible.length
  const first = visible.find((m) => m.format === 'int' && reading(sum, S.idx[m.key], m).total > 0) ?? visible[0]
  const [sel, setSel] = useState(focus ?? first?.key ?? section.metrics[0].key)
  const [pick, setPick] = useState<number | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const box = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!focus) return
    setSel(focus)
    box.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [focus])
  useEffect(() => setPick(null), [filter])

  if (!visible.length) {
    return (
      <section className="tm-section pp-section is-empty">
        <div className="tm-sec-head"><h2 className="t-title">{section.title}</h2></div>
        <p className="t-caption">{`这一节的 ${section.metrics.length} 项他都是 0，同位置的人也很少做。`}</p>
      </section>
    )
  }
  const m = S.lg.metrics[S.idx[sel]] ?? visible[0]
  const series = detail.metrics[m.key]
  const evsIn = (key: string) => {
    const s = detail.metrics[key]
    return s ? s.e.filter((i) => keep[detail.events[i][4]]) : []
  }
  const playableIn = (key: string) => evsIn(key).filter((i) => detail.events[i][8] != null && detail.apps[detail.events[i][4]].src)
  const current = playlist ? new Set(playlist.clips[playlist.index]?.evs ?? []) : null

  // variant A: one value per appearance
  const perApp = detail.apps.map((_, i) => {
    const v = series?.n[i] ?? 0
    if (m.format === 'int') return typeof v === 'number' ? v : 0
    const [a, b] = typeof v === 'number' ? [0, 0] : v
    return m.format === 'pct' ? b : b ? a / b : 0
  })
  const okPerApp = m.format === 'pct' ? detail.apps.map((_, i) => { const v = series?.n[i] ?? 0; return typeof v === 'number' ? 0 : v[0] }) : null
  const keptApps = detail.apps.map((_, i) => i).filter((i) => keep[i])
  const mean = keptApps.length ? keptApps.reduce((s, i) => s + perApp[i], 0) / keptApps.length : null
  const picked = pick != null ? detail.apps[pick] : null
  const pickedEvs = pick != null && series ? series.e.filter((i) => detail.events[i][4] === pick) : []
  const pickedPlayable = pickedEvs.filter((i) => detail.events[i][8] != null && detail.apps[pick!].src)
  const one = (v: number) => (m.format === 'meters' ? `${Math.round(v)} 米` : `${Math.round(v * 10) / 10}`)
  const linked = mode === 'linked'

  // The bars (variant A, D, and the strip under the pitch in C): clicking a bar picks that match, again lets go.
  const bars = (height: number) => (
    <AppBars
      apps={detail.apps} values={perApp} ok={okPerApp} keep={keep} mean={mean} height={height}
      meanLabel={`他的场均 ${mean == null ? '—' : one(mean)}`} selected={pick} onPick={(i) => setPick(pick === i ? null : i)} format={one} lg={S.lg}
      hover={linked ? hover : null} onHover={linked ? setHover : undefined}
    />
  )
  const pickedLine = picked && (
    <>
      {`${shortDate(picked.d)} ${picked.h ? '主' : '客'} ${S.lg.teams[picked.o]?.nameZh ?? ''} ${picked.s[0]}–${picked.s[1]} · ${picked.st ? '首发' : '替补'} ${picked.min} 分钟 · ${one(perApp[pick!])}${okPerApp ? `（成功 ${okPerApp[pick!]}）` : ''}。`}
      {pickedPlayable.length > 0 && (
        <button className="btn-quiet pp-inline" onClick={() => open(`${m.label} · ${shortDate(picked.d)}`, pickedPlayable)}>{`看这场的 ${pickedPlayable.length} 次 ▶`}</button>
      )}
      <a href={matchHref(picked.m, picked.t, section.chapter)}>{`打开这场的${CHAPTER_ZH[section.chapter]} →`}</a>
    </>
  )
  // The pitch (variant B, D, and the main chart in C): in C a picked match leaves only its actions on the pitch.
  const onlyPicked = (i: number) => !linked || pick == null || detail.events[i][4] === pick
  const pitchEvs = evsIn(m.key).filter(onlyPicked)
  const pitch = series && pitchEvs.length ? (
    <SeasonPitch
      key={`${m.key}-${linked ? pick : ''}`}
      events={pitchEvs.map((i) => ({ i, e: detail.events[i] }))}
      ok={m.format === 'pct' && series.k ? new Set(series.k) : null}
      apps={detail.apps} labels={detail.labels} lg={S.lg} current={current}
      onPlay={(i) => open(`${m.label}（有视频的）`, playableIn(m.key).filter(onlyPicked), i)}
      dimApp={linked && pick == null ? hover : null} onHoverApp={linked && pick == null ? setHover : undefined}
    />
  ) : (
    <p className="t-caption pp-none">这一项他在这些比赛里一次也没有。</p>
  )

  return (
    <section ref={box} className={`tm-section pp-section${focus ? ' is-focus' : ''}`}>
      <div className="tm-sec-head pp-sec-head">
        <div>
          <h2 className="t-title">{section.title}</h2>
          {section.question && <p className="t-lead">{section.question}</p>}
        </div>
        <a className="t-caption" href={teamHref(st.t, { tab: section.chapter, focus: sel })}>{`${S.lg.teams[st.t].nameZh}全队这一项 →`}</a>
      </div>
      <div className="tm-sec-body">
        <div className="tm-chart">
          {mode === 'linked' ? (
            <>
              <div className="t-label">{`${m.label} · 场上分布${picked ? `（只画 ${shortDate(picked.d)} 这一场）` : '（整季）'}`}</div>
              {pitch}
              <div className="t-label pp-linked-label">{`按场次 · ${m.format === 'pct' ? '尝试（深色是成功）' : m.format === 'meters' ? '平均位置' : '每场次数'}`}</div>
              {bars(84)}
              <p className="t-caption">
                {picked ? (
                  <>
                    {pickedLine}
                    <button className="btn-quiet pp-inline pp-back" onClick={() => setPick(null)}>回到整季</button>
                  </>
                ) : (
                  '点一根柱子，场上只画那一场，再点一下回到整季。鼠标停在柱子上，场上会亮出那一场的动作；停在场上的动作上，它那一场的柱子会亮。'
                )}
              </p>
            </>
          ) : mode === 'bars' ? (
            <>
              <div className="t-label">{`${m.label} · 每场${m.format === 'pct' ? '尝试（深色是成功）' : m.format === 'meters' ? '平均位置' : ''}`}</div>
              {bars(112)}
              <p className="t-caption">
                {pickedLine || `每根柱子是他出场的一场；浅色是替补出场，虚线是他的场均（${mean == null ? '—' : one(mean)}）。柱子上方的点：有视频的场次。`}
              </p>
            </>
          ) : (
            <>
              <div className="t-label">{`${m.label} · 整季画在一张场上`}</div>
              {pitch}
            </>
          )}
        </div>
        <div className="pp-right">
          {playlist && <ClipPlayer detail={detail} lg={S.lg} playlist={playlist} go={go} close={close} />}
          <table className="tm-metrics pp-metrics">
            <thead>
              <tr>
                <th />
                <th className="t-label" title="次数按每 90 分钟算；比率和平均位置照原样">每 90 分钟</th>
                <th className="t-label">合计</th>
                <th className="t-label" title="在本队按合计排">队内</th>
                <th className="t-label" title={`和${S.lg.nameZh}同位置、出场够门槛的人比，按每 90 分钟排`}>同位置</th>
                <th className="t-label">联赛同位置</th>
                <th className="t-label" title="他出场的那些比赛里，全队这一项有多少是他做的">占全队</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((x) => {
                const i = S.idx[x.key]
                const r = reading(sum, i, x)
                const g = groupRank(S, pid, x.key, filter)
                const tr = teamRank(S, st, x.key, filter)
                const sh = shareOf(st, i, x, filter)
                const play = playableIn(x.key)
                const value = x.format === 'pct' && !r.rankable && r.n > 0 ? '—' : fmtValue(x.format, r.value)
                const total = x.format === 'int' ? fmtInt(r.total) : x.format === 'pct' ? `${r.total}/${r.n}` : `${r.n} 次`
                return (
                  <tr key={x.key} className={sel === x.key ? 'is-selected' : ''} onClick={() => { setSel(x.key); setPick(null) }}>
                    <th>
                      <div className="t-body">{x.label}</div>
                      {x.hint && <div className="t-caption">{x.hint}</div>}
                    </th>
                    <td className="t-figure pp-value">{value}</td>
                    <td className="t-numeric">
                      {play.length ? (
                        <button className="val val-sm pp-play" title={`其中 ${play.length} 次有视频，点开看`} onClick={(e) => { e.stopPropagation(); setSel(x.key); open(`${x.label}（有视频的）`, play) }}>
                          {total}<span className="pp-vid">{`▶${play.length}`}</span>
                        </button>
                      ) : total}
                    </td>
                    <td className="t-numeric">{tr.rank ? `${tr.rank}/${tr.of}` : '—'}</td>
                    <td className="t-numeric" title={g.rank ? undefined : !ranked(S, pid, filter) ? '出场不够门槛' : '次数太少，不比比率'}>
                      {g.rank ? `${g.rank}/${g.of}` : !ranked(S, pid, filter) ? '不排' : '—'}
                    </td>
                    <td><GroupStrip rows={g.rows} me={pid} mine={r.rankable || x.format === 'int' ? r.value : null} med={g.median} label={(v) => fmtValue(x.format, v)} nameOf={(id) => nameOf(S.lg.players[id])} /></td>
                    <td className="t-numeric">{sh == null ? '—' : `${Math.round(sh * 100)}%`}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {hidden > 0 && <p className="t-caption pp-hidden">{`另有 ${hidden} 项他是 0，同位置的人也很少做，没列出来。`}</p>}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ match log */

function MatchLog({ S, detail }: { S: Season; detail: PlayerDetail }) {
  const col = (k: string, i: number) => {
    const v = detail.metrics[k]?.n[i] ?? 0
    return typeof v === 'number' ? v : v[1]
  }
  return (
    <table className="tm-table pp-log">
      <thead>
        <tr>{['日期', '对手', '主客', '比分', '', '首发', '分钟', '位置', '进球', '助攻', '射门', '关键传球', '触球', '视频', ''].map((c, i) => <th key={i} className="t-label">{c}</th>)}</tr>
      </thead>
      <tbody>
        {detail.apps.map((a, i) => {
          const r = a.s[0] > a.s[1] ? '胜' : a.s[0] < a.s[1] ? '负' : '平'
          return (
            <tr key={a.m}>
              <td className="t-numeric">{shortDate(a.d)}</td>
              <td>{S.lg.teams[a.o]?.nameZh}</td>
              <td>{a.h ? '主' : '客'}</td>
              <td className="t-numeric">{`${a.s[0]}–${a.s[1]}`}</td>
              <td><span className={`tm-res r-${r}`}>{r}</span></td>
              <td>{a.st ? '首发' : '替补'}</td>
              <td className="t-numeric">{a.min}</td>
              <td className="t-caption">{placesLine(a.pos, 2).replace(/ \d[\d,]*/g, '')}</td>
              <td className="t-numeric">{col('overview.personal.goals', i) || ''}</td>
              <td className="t-numeric">{col('overview.personal.assists', i) || ''}</td>
              <td className="t-numeric">{col('attack.shots.shots', i) || ''}</td>
              <td className="t-numeric">{col('overview.personal.key_passes', i) || ''}</td>
              <td className="t-numeric">{col('overview.personal.touches', i)}</td>
              <td>{a.src ? <span className="tm-has-video">有视频</span> : ''}</td>
              <td><a href={matchHref(a.m, a.t)}>比赛分析 →</a></td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
