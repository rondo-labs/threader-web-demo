// PROTOTYPE: a stand-in for the Q&A backend. Four example questions get answers built from the real data
// (the way the real one will: numbers from queries, the model only words them); anything else gets a note that
// the Q&A is not connected yet. The shape of `Answer` is the question this prototype asks about, not the wording.
import type { Clip } from '../../match-analysis/clips'
import type { GoalItem, GoalsSection, MatchData, Section } from '../../match-analysis/types'
import {
  FEILU, VIDEO_MATCH, fmt, loadLeague, loadMatch, matchHref, rankOf, results, shortDate, teamHref, total, value,
} from './data'

export interface Fig { label: string; value: string; sub?: string }
export type Card =
  | { kind: 'figures'; items: Fig[] }
  | { kind: 'ranking'; title: string; rows: { key: string; label: string; v: number; sub?: string; mark?: boolean; href?: string }[] }
  | { kind: 'dots'; title: string; dots: { x: number; y: number; label: string }[]; caption: string }
  | { kind: 'table'; title: string; columns: string[]; rows: { cells: string[]; href?: string | null }[] }
  | { kind: 'goals'; title: string; match: MatchData; items: GoalItem[] }
export interface Clips { title: string; match: MatchData; spans?: Clip[]; eids?: string[]; count: number }
export interface Answer {
  id: string
  question: string
  /** 分析对象 of this answer, when it has one. */
  subject: string | null
  scope: string
  steps: string[]
  paragraphs: string[]
  cards: Card[]
  clips: Clips | null
  /** Said plainly when there is no video. */
  videoNote: string
  links: { label: string; href: string }[]
  followUps: string[]
  demo?: boolean
}

export const SUGGESTIONS = [
  { kind: '联赛排名', q: '中乙哪支队反击射门最多？' },
  { kind: '一支队的多场', q: '厦门飞鹭最近 5 场的角球都落在哪？' },
  { kind: '单场', q: '9 月 19 日厦门飞鹭 3–0 北京理工，三个进球是怎么打出来的？' },
  { kind: '球员', q: '厦门飞鹭谁出场时间最多？谁进球最多？' },
]
const CL2 = 'chinese-football-league-2-2026'
let seq = 0

export async function answer(question: string): Promise<Answer> {
  const q = question.replace(/\s/g, '')
  await new Promise((r) => setTimeout(r, 450))
  if (q.includes('反击')) return fastBreaks(question)
  if (q.includes('角球')) return corners(question)
  if (q.includes('进球是怎么') || (q.includes('9月19') && q.includes('进球'))) return goals(question)
  if (q.includes('出场') || q.includes('谁进球')) return squad(question)
  return {
    id: `a${++seq}`, question, subject: null, scope: '—', demo: true,
    steps: [],
    paragraphs: [
      '这是界面原型：问答还没有接上，现在只能回答下面这几个示意问题。',
      '正式版会让模型听懂问题、选择查询，回答里的数字、球场图和片段都由查询直接生成。',
    ],
    cards: [], clips: null, videoNote: '', links: [], followUps: SUGGESTIONS.map((s) => s.q),
  }
}

async function fastBreaks(question: string): Promise<Answer> {
  const lg = await loadLeague(CL2)
  const key = 'attack.shots.fast_break'
  const rows = Object.keys(lg.teams)
    .map((t) => ({ t, n: total(lg, t, key), pm: value(lg, t, key) ?? 0 }))
    .sort((a, b) => b.n - a.n || b.pm - a.pm)
  const all = rows.reduce((s, r) => s + r.n, 0)
  const [a, b, c] = rows
  const fe = rows.findIndex((r) => r.t === FEILU)
  const match = await loadMatch(VIDEO_MATCH)
  const eids = Object.keys(match.teams).flatMap((tid) => metricOf(match.sections[tid], 'shots', 'fast_break')?.team.eids ?? [])
  const name = (t: string) => lg.teams[t].nameZh
  return {
    id: `a${++seq}`, question, subject: null, scope: `2026 中乙 · 全部 ${lg.matches.length} 场`,
    steps: [
      '听懂问题：中乙 2026 · 反击射门（Opta 标为快速反击的射门）· 按球队排名',
      `查询事件：射门 + 快速反击 · ${lg.matches.length} 场 · 共 ${all} 次`,
      `按球队汇总：${rows.length} 支队`,
    ],
    paragraphs: [
      `2026 赛季中乙一共有 ${all} 次反击射门。最多的是${name(a.t)}，${a.n} 次（场均 ${a.pm.toFixed(1)}），其次是${name(b.t)}（${b.n} 次）和${name(c.t)}（${c.n} 次）。`,
      `厦门飞鹭 ${rows[fe].n} 次，排第 ${fe + 1}。`,
      '反击射门按 Opta 的「快速反击」标记统计，每支队的场次差不多（30 场左右），所以总数和场均的排序基本一致。',
    ],
    cards: [
      { kind: 'figures', items: [
        { label: '中乙反击射门', value: `${all}`, sub: `${lg.matches.length} 场` },
        { label: name(a.t), value: `${a.n}`, sub: `场均 ${a.pm.toFixed(1)} · 第 1` },
        { label: '厦门飞鹭', value: `${rows[fe].n}`, sub: `场均 ${rows[fe].pm.toFixed(1)} · 第 ${fe + 1}` },
      ] },
      { kind: 'ranking', title: '反击射门 · 按球队', rows: rows.map((r) => ({ key: r.t, label: name(r.t), v: r.n, sub: `场均 ${r.pm.toFixed(1)}`, mark: r.t === FEILU, href: teamHref(r.t) })) },
    ],
    clips: eids.length ? { title: '9/19 厦门飞鹭 3–0 北京理工 · 反击射门', match, eids, count: eids.length } : null,
    videoNote: `${lg.matches.length} 场里只有 1 场有比赛视频（9/19 厦门飞鹭 3–0 北京理工），那场有 ${eids.length} 次反击射门${eids.length ? '，可以看画面' : ''}；其余的没有视频。`,
    links: [{ label: `去看${name(a.t)}的球队页`, href: teamHref(a.t) }, { label: '去看厦门飞鹭的球队页', href: teamHref(FEILU) }],
    followUps: ['这些反击射门有几次进了？', '厦门飞鹭的反击都是从哪抢回球开始的？', '只看升级组的比赛呢？'],
  }
}

async function corners(question: string): Promise<Answer> {
  const lg = await loadLeague(CL2)
  const last = results(lg, FEILU).filter((r) => r.m.page).slice(-5)
  const datas = await Promise.all(last.map((r) => loadMatch(r.m.id)))
  const name = (t: string) => lg.teams[t].nameZh
  let n = 0, shots = 0, gls = 0
  const zones: Record<string, number> = {}
  const dots: { x: number; y: number; label: string }[] = []
  const table = last.map((r, i) => {
    const d = datas[i]
    const sec = d.setpieces[FEILU].find((s) => s.key === 'corners')!
    const v = (k: string) => sec.metrics.find((m) => m.key === k)?.team.value ?? 0
    n += v('corners'); shots += v('shots'); gls += v('goals')
    for (const m of sec.metrics) if (m.key.startsWith('zone_')) zones[m.label] = (zones[m.label] ?? 0) + m.team.value
    for (const id of sec.metrics.find((m) => m.key === 'corners')?.team.eids ?? []) {
      const e = d.events[id]
      if (e?.ex != null && e.ey != null) dots.push({ x: e.ex, y: e.ey, label: `${shortDate(r.m.date)} ${e.clock} ${e.label}` })
    }
    return { cells: [shortDate(r.m.date), name(r.oppId), r.home ? '主' : '客', `${v('corners')}`, `${v('shots')}`, `${v('goals')}`], href: matchHref(r.m, FEILU, 'set-pieces') }
  })
  const z = Object.entries(zones).sort((a, b) => b[1] - a[1])
  const season = value(lg, FEILU, 'set-pieces.corners.corners')
  const rk = rankOf(lg, FEILU, 'set-pieces.corners.corners')
  const span = `${shortDate(last[0].m.date)}–${shortDate(last[last.length - 1].m.date)}`
  const withVideo = last.filter((r) => r.m.video).length
  return {
    id: `a${++seq}`, question, subject: '厦门飞鹭', scope: `厦门飞鹭 · 最近 5 场（${span}）`,
    steps: [
      '听懂问题：分析对象 厦门飞鹭 · 最近 5 场 · 本队的角球 · 落点',
      `查询事件：角球 · 5 场 · 共 ${n} 个`,
      '按落点区域和比赛拆开',
    ],
    paragraphs: [
      `最近 5 场（${span}）厦门飞鹭一共踢了 ${n} 个角球，场均 ${(n / 5).toFixed(1)} 个。落点最多的是「${z[0][0].replace('落在', '')}」（${z[0][1]} 个），其次是「${z[1][0].replace('落在', '')}」（${z[1][1]} 个）。`,
      `这些角球之后形成了 ${shots} 次射门，进了 ${gls} 个。整个赛季飞鹭场均 ${fmt(season, 'int')} 个角球，在中乙排第 ${rk.rank}。`,
    ],
    cards: [
      { kind: 'figures', items: [
        { label: '角球', value: `${n}`, sub: `场均 ${(n / 5).toFixed(1)}` },
        { label: z[0][0], value: `${z[0][1]}` },
        { label: '角球后射门', value: `${shots}` },
        { label: '角球进球', value: `${gls}` },
      ] },
      { kind: 'dots', title: '落点（朝右进攻）', dots, caption: `${dots.length} 个角球的第一落点；短角球落在禁区外` },
      { kind: 'table', title: '逐场', columns: ['日期', '对手', '主客', '角球', '角球后射门', '进球'], rows: table },
    ],
    clips: null,
    videoNote: withVideo ? `5 场里 ${withVideo} 场有视频。` : '这 5 场都没有比赛视频，看不了画面。',
    links: [{ label: '去看厦门飞鹭整季的定位球', href: `${teamHref(FEILU)}&chapter=set-pieces` }],
    followUps: ['整个赛季呢？', '对手的角球都落在哪？', '哪几个角球形成了射门？'],
  }
}

async function goals(question: string): Promise<Answer> {
  const match = await loadMatch(VIDEO_MATCH)
  const sec = match.overview[FEILU].find((s) => s.key === 'goals') as GoalsSection
  const items = sec.items.filter((it) => it.side === 'team')
  const pname = (id: string | null) => (id ? match.players[id]?.nameZh || match.players[id]?.nameEn : '')
  const shots = (tid: string) => metricOf(match.overview[tid] as Section[], 'match', 'shots')?.team.value ?? 0
  const opp = Object.keys(match.teams).find((t) => t !== FEILU)!
  return {
    id: `a${++seq}`, question, subject: '厦门飞鹭', scope: '2026-09-19 厦门飞鹭 3–0 北京理工 · 中乙常规赛',
    steps: ['听懂问题：分析对象 厦门飞鹭 · 9/19 对北京理工 · 进球的回合', '查询：这场的 3 个进球，每个从这次控球开始算起', '这场有视频：3 个回合都能看'],
    paragraphs: [
      `厦门飞鹭这场射门 ${shots(FEILU)} 次，北京理工 ${shots(opp)} 次。3 个进球：`,
      ...items.map((it) => `${it.clock} ${pname(it.scorerId)}：${it.source}，${it.passes ? `${it.passes} 脚传递、${it.seconds} 秒` : '没有传递'}，从${it.startZone}开始。`),
      sec.readings[1] ?? '回合从这次控球的开始算：本队的死球开出、或抢回球权的那一下。',
    ],
    cards: [
      { kind: 'figures', items: [
        { label: '比分', value: '3–0' },
        { label: '射门', value: `${shots(FEILU)}–${shots(opp)}` },
        { label: '进球回合', value: `${items.length}` },
      ] },
      { kind: 'goals', title: '3 个进球的回合', match, items },
    ],
    clips: { title: '9/19 厦门飞鹭的 3 个进球', match, spans: items.filter((it) => it.span).map((it) => ({ start: it.span!.start, end: it.span!.end, eids: it.eids })), count: items.length },
    videoNote: '这场有比赛视频，每个回合都能看。',
    links: [{ label: '去看这场比赛的完整分析', href: `/match/${VIDEO_MATCH}/?team=${FEILU}&chapter=overview` }],
    followUps: ['北京理工的射门都在哪？', '这场飞鹭的反击呢？', '刘子铭这场踢得怎么样？'],
  }
}

async function squad(question: string): Promise<Answer> {
  const lg = await loadLeague(CL2)
  const ps = lg.players[FEILU]
  const byMin = [...ps].sort((a, b) => b.minutes - a.minutes)
  const byGoals = [...ps].sort((a, b) => b.goals - a.goals || b.minutes - a.minutes)
  const m = byMin[0], g = byGoals[0]
  const n = results(lg, FEILU).length
  return {
    id: `a${++seq}`, question, subject: '厦门飞鹭', scope: `厦门飞鹭 · 2026 赛季 ${n} 场`,
    steps: ['听懂问题：分析对象 厦门飞鹭 · 整季 · 球员出场和进球', `查询：${n} 场的首发、换人和进球`],
    paragraphs: [
      `出场时间最多的是${m.nameZh}（${m.apps} 场、首发 ${m.starts} 场，共 ${m.minutes} 分钟）。`,
      g.id === m.id ? `他也是进球最多的，${g.goals} 个；其次是${byGoals[1].nameZh}（${byGoals[1].goals} 个）。` : `进球最多的是${g.nameZh}，${g.goals} 个。`,
    ],
    cards: [
      { kind: 'figures', items: [
        { label: `${m.nameZh} · 出场时间`, value: `${m.minutes}`, sub: `${m.apps} 场 · 首发 ${m.starts}` },
        { label: `${g.nameZh} · 进球`, value: `${g.goals}` },
      ] },
      { kind: 'table', title: '出场时间前 10', columns: ['球员', '位置', '出场', '首发', '分钟', '进球'],
        rows: byMin.slice(0, 10).map((p) => ({ cells: [`${p.number != null ? `#${p.number} ` : ''}${p.nameZh}`, p.position, `${p.apps}`, `${p.starts}`, `${p.minutes}`, `${p.goals}`] })) },
    ],
    clips: null,
    videoNote: `${n} 场里只有 1 场有比赛视频（9/19 对北京理工），球员跨场的画面暂时看不全。`,
    links: [{ label: '去看厦门飞鹭的球员', href: `${teamHref(FEILU)}&tab=players` }],
    followUps: [`${g.nameZh}的进球都是怎么来的？`, '谁的关键传球最多？', '首发阵容这个赛季变过几次？'],
  }
}

function metricOf(secs: Section[] | undefined, section: string, key: string) {
  return secs?.find((s) => s.key === section)?.metrics?.find((m) => m.key === key)
}
