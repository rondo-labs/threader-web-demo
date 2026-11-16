// PROTOTYPE: the 球员 prototype's data (pipeline/prototype/build_players.py) and the arithmetic its pages share:
// a player's season under a filter, per 90 minutes, his rank among teammates (by total) and among his position
// group in the league (per 90, above the minutes threshold), the readings where he stands out, the quadrant axes.

export type PFormat = 'int' | 'pct' | 'meters'
export type PFilter = 'all' | 'home' | 'away' | 'last5'
export const PFILTERS: [PFilter, string][] = [['all', '全部'], ['home', '主场'], ['away', '客场'], ['last5', '最近 5 场']]
export const LEAGUES = [
  { slug: 'chinese-super-league-2026', zh: '中超' },
  { slug: 'chinese-football-league-1-2026', zh: '中甲' },
  { slug: 'chinese-football-league-2-2026', zh: '中乙' },
]
export const FOCUS_LEAGUE = 'chinese-football-league-2-2026'

export interface PMetric {
  key: string; chapter: string; section: string; sectionTitle: string; question: string | null
  label: string; format: PFormat; hint: string | null
}
/** A count, or [ok, attempts] (rates), or [metres summed, actions] (average position); 0 when empty. */
export type Val = number | [number, number]
/** Minutes, appearances, starts, readings (aligned with the metric list), the team's counts in the same matches. */
export type Summary = [number, number, number, Val[], number[]]
export interface Stint { p: string; t: string; pos: Record<string, number>; goals: number; f: Record<PFilter | 'tlast5', Summary> }
export interface History { season: string; league: string; team: string; teamId: string; left: boolean }
export interface PlayerInfo {
  nameZh: string; nameEn: string; number: number | null; teams: string[]; group: string
  groupMin: Record<string, number>; pos: Record<string, number>
  dob?: string; age?: number; height?: number; weight?: number; foot?: string; nat?: string; nat2?: string
  joined?: string; optaPos?: string; history: History[]; footShots?: [number, number]
}
export interface PlayersLeague {
  slug: string; nameZh: string; focusTeam: string | null; groups: string[]
  /** display position → [x, y, group]; x from our goal (0) to theirs, y = 100 on our left */
  places: Record<string, [number, number, string]>
  metrics: PMetric[]
  teams: Record<string, { nameZh: string }>
  teamMatches: Record<string, number>
  thresholds: Record<PFilter, number>
  players: Record<string, PlayerInfo>
  stints: Stint[]
}
export interface App {
  m: string; d: string; t: string; o: string; h: boolean; s: [number, number]; st: boolean; min: number
  pos: Record<string, number>; src: string | null; num: number | null
}
/** x, y, end x, end y, appearance index, outcome (1 = ok), label index, clock, video seconds, kind (pass cross shot goal) */
export type PEvent = [number, number, number | null, number | null, number, number, number, string, number | null, number]
export interface PlayerDetail {
  id: string; league: string; apps: App[]
  metrics: Record<string, { n: Val[]; e: number[]; k: number[] | null }>
  events: PEvent[]; labels: string[]
}
export interface SearchRow { id: string; zh: string; en: string; py: string; ini: string; num: number | null; team: string; lg: string; lgZh: string; group: string; min: number }

const BASE = '/prototype-data/players'
const cache = new Map<string, Promise<unknown>>()
function get<T>(url: string): Promise<T> {
  if (!cache.has(url))
    cache.set(url, fetch(url).then((r) => {
      if (!r.ok) throw new Error(r.status === 404 ? '没有找到' : `HTTP ${r.status}`)
      return r.json()
    }))
  return cache.get(url) as Promise<T>
}
export const loadPlayers = (slug: string) => get<PlayersLeague>(`${BASE}/league-${slug}.json`).then(season)
export const loadDetail = (slug: string, id: string) => get<PlayerDetail>(`${BASE}/p/${slug}/${encodeURIComponent(id)}.json`)
export const loadSearch = () => get<SearchRow[]>(`${BASE}/search.json`)

/* ------------------------------------------------------------------ season sums */

export interface Season {
  lg: PlayersLeague
  idx: Record<string, number>
  /** player → filter → his summary over all his teams in this league */
  sum: Map<string, Record<PFilter, Summary>>
  stintsOf: Map<string, Stint[]>
  teamStints: Map<string, Stint[]>
  memo: Map<string, unknown>
}

function addVal(a: Val, b: Val): Val {
  if (typeof a === 'number' && typeof b === 'number') return a + b
  const x = typeof a === 'number' ? [0, 0] : a
  const y = typeof b === 'number' ? [0, 0] : b
  return [x[0] + y[0], x[1] + y[1]]
}
function addSummary(a: Summary, b: Summary): Summary {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3].map((v, i) => addVal(v, b[3][i])), a[4].map((v, i) => v + b[4][i])]
}

const seasons = new WeakMap<PlayersLeague, Season>()
function season(lg: PlayersLeague): Season {
  const known = seasons.get(lg)
  if (known) return known
  const stintsOf = new Map<string, Stint[]>()
  const teamStints = new Map<string, Stint[]>()
  for (const s of lg.stints) {
    stintsOf.set(s.p, [...(stintsOf.get(s.p) ?? []), s])
    teamStints.set(s.t, [...(teamStints.get(s.t) ?? []), s])
  }
  const sum = new Map<string, Record<PFilter, Summary>>()
  for (const [pid, ss] of stintsOf) {
    const rec = {} as Record<PFilter, Summary>
    for (const [f] of PFILTERS) rec[f] = ss.slice(1).reduce((acc, s) => addSummary(acc, s.f[f]), ss[0].f[f])
    sum.set(pid, rec)
  }
  const s: Season = { lg, idx: Object.fromEntries(lg.metrics.map((m, i) => [m.key, i])), sum, stintsOf, teamStints, memo: new Map() }
  seasons.set(lg, s)
  return s
}

export interface Reading {
  /** per 90 minutes (counts), the rate (pct) or the average position in metres (meters) */
  value: number | null
  /** count, successes, or actions */
  total: number
  /** attempts behind a rate or an average */
  n: number
  /** enough attempts to compare a rate (20) or an average position (10) */
  rankable: boolean
}
export function reading(s: Summary | undefined, i: number, m: PMetric): Reading {
  if (!s) return { value: null, total: 0, n: 0, rankable: false }
  const v = s[3][i]
  if (m.format === 'int') {
    const total = typeof v === 'number' ? v : 0
    return { value: s[0] > 0 ? (total / s[0]) * 90 : null, total, n: total, rankable: s[0] > 0 }
  }
  const [a, b] = typeof v === 'number' ? [0, 0] : v
  return { value: b ? a / b : null, total: m.format === 'pct' ? a : b, n: b, rankable: b >= (m.format === 'pct' ? 20 : 10) }
}

export const minutesOf = (S: Season, pid: string, f: PFilter) => S.sum.get(pid)?.[f][0] ?? 0
export const ranked = (S: Season, pid: string, f: PFilter) => minutesOf(S, pid, f) >= S.lg.thresholds[f]
/** The player's current team: where he played last. */
export const currentStint = (S: Season, pid: string) => {
  const ss = S.stintsOf.get(pid) ?? []
  const last = S.lg.players[pid]?.teams.at(-1)
  return ss.find((s) => s.t === last) ?? ss[0]
}

/** Players of a position group above the filter's minutes threshold. */
export function peers(S: Season, group: string, f: PFilter): string[] {
  const k = `peers|${group}|${f}`
  if (!S.memo.has(k)) S.memo.set(k, Object.keys(S.lg.players).filter((pid) => S.lg.players[pid].group === group && ranked(S, pid, f)))
  return S.memo.get(k) as string[]
}

export interface GroupRank { rank: number | null; of: number; median: number | null; rows: { id: string; v: number }[] }
/** The player's place among his group's players (per 90 / rate / average), most first. */
export function groupRank(S: Season, pid: string, key: string, f: PFilter, group = S.lg.players[pid]?.group): GroupRank {
  const k = `rank|${group}|${f}|${key}`
  if (!S.memo.has(k)) {
    const i = S.idx[key]
    const m = S.lg.metrics[i]
    const rows = peers(S, group, f)
      .map((id) => ({ id, r: reading(S.sum.get(id)?.[f], i, m) }))
      .filter((x) => x.r.rankable && x.r.value != null)
      .map((x) => ({ id: x.id, v: x.r.value! }))
      .sort((a, b) => b.v - a.v)
    S.memo.set(k, rows)
  }
  const rows = S.memo.get(k) as { id: string; v: number }[]
  const at = rows.findIndex((r) => r.id === pid)
  return { rank: at >= 0 ? at + 1 : null, of: rows.length, median: median(rows.map((r) => r.v)), rows }
}

/** The stint's place among the team's players by total (rates and averages: among those with enough attempts). */
export function teamRank(S: Season, st: Stint, key: string, f: PFilter | 'tlast5'): { rank: number | null; of: number } {
  const i = S.idx[key]
  const m = S.lg.metrics[i]
  const rows = (S.teamStints.get(st.t) ?? [])
    .map((s) => ({ s, r: reading(s.f[f], i, m) }))
    .filter((x) => x.s.f[f][0] > 0 && (m.format === 'int' ? x.r.total > 0 || x.s === st : x.r.rankable))
    .sort((a, b) => (m.format === 'int' ? b.r.total - a.r.total : (b.r.value ?? 0) - (a.r.value ?? 0)))
  const at = rows.findIndex((x) => x.s === st)
  const mine = reading(st.f[f], i, m)
  return { rank: at >= 0 && (m.format === 'int' ? mine.total > 0 : mine.rankable) ? at + 1 : null, of: rows.length }
}

/** The player's part of the team's count in the matches he played. */
export function shareOf(st: Stint | undefined, i: number, m: PMetric, f: PFilter | 'tlast5'): number | null {
  if (!st || m.format !== 'int') return null
  const s = st.f[f]
  const own = s[3][i] as number
  return s[4][i] ? own / s[4][i] : null
}

export function median(vs: number[]): number | null {
  if (!vs.length) return null
  const a = [...vs].sort((x, y) => x - y)
  const h = Math.floor(a.length / 2)
  return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2
}

/** One reading per label, skipping ones the group hardly ever does: what "stands out" is chosen from these. */
function comparable(S: Season, group: string, f: PFilter): number[] {
  const k = `comparable|${group}|${f}`
  if (!S.memo.has(k)) {
    const seen = new Set<string>()
    const out: number[] = []
    S.lg.metrics.forEach((m, i) => {
      if (AXIS_SKIP.has(m.key) || seen.has(m.label) || m.key.endsWith('.red') || m.key.endsWith('.yellow')) return
      seen.add(m.label)
      const g = groupRank(S, '', m.key, f, group)
      if (g.of < 10 || !g.median) return
      if (m.format === 'int' && g.median < 0.15) return
      out.push(i)
    })
    S.memo.set(k, out)
  }
  return S.memo.get(k) as number[]
}

export interface Standout { m: PMetric; value: number; rank: number; of: number; median: number; more: boolean }
/** The readings where the player sits furthest from the middle of his position group, either way. */
export function standouts(S: Season, pid: string, f: PFilter = 'all', n = 5): Standout[] {
  const group = S.lg.players[pid]?.group
  if (!group || !ranked(S, pid, f)) return []
  return comparable(S, group, f)
    .map((i) => {
      const m = S.lg.metrics[i]
      const g = groupRank(S, pid, m.key, f)
      if (g.rank == null || g.median == null) return null
      const p = (g.rank - 1) / Math.max(1, g.of - 1)
      return { m, value: g.rows[g.rank - 1].v, rank: g.rank, of: g.of, median: g.median, more: p < 0.5, score: Math.abs(p - 0.5) }
    })
    .filter((x): x is Standout & { score: number } => !!x)
    .sort((a, b) => b.score - a.score || a.rank - b.rank)
    .slice(0, n)
}

/* ------------------------------------------------------------------ quadrant axes */

export interface Axis { key: string; label: string; short: string; words: [string, string] }
export const BIO_AXES: Axis[] = [
  { key: 'bio.age', label: '年龄', short: '年龄', words: ['大', '小'] },
  { key: 'bio.height', label: '身高（厘米）', short: '个子', words: ['高', '矮'] },
  { key: 'bio.weight', label: '体重（公斤）', short: '体重', words: ['重', '轻'] },
  { key: 'bio.minutes', label: '出场时间（分钟）', short: '出场时间', words: ['多', '少'] },
]
export const DEFAULT_AXES: Record<string, [string, string]> = {
  门将: ['attack.build_up.gk_long_share', 'defence.box_defence.saves'],
  中卫: ['attack.build_up.exits', 'defence.def_actions.all_actions'],
  边后卫: ['attack.crosses.crosses', 'defence.def_actions.all_actions'],
  中场: ['attack.entries.entries', 'attack-transition.regains.all'],
  边路: ['attack.entries.box', 'attack.shots.shots'],
  前锋: ['attack.shots.shots', 'defence.def_actions.zone_front'],
}
/** Short names for readings whose label only makes sense inside their section ("在前场", "全部"). */
const AXIS_NAME: Record<string, string> = {
  'attack.entries.box': '传进禁区', 'set-pieces.free_kicks.into_box': '任意球传进禁区', 'defence.box_defence.saves': '扑救',
  'defence.def_actions.tackles': '抢断', 'defence.def_actions.interceptions': '拦截', 'defence.def_actions.recoveries': '抢第二落点',
  'defence.def_actions.clearances': '解围', 'defence.def_actions.blocked_passes': '封堵传球', 'defence.def_actions.aerials_won': '争顶成功',
  'defence.def_actions.dribbled_past': '被过', 'defence.def_actions.fouls': '犯规',
  'defence.def_actions.all_actions': '防守动作', 'defence.def_actions.zone_front': '前场防守动作',
  'defence.def_actions.zone_mid': '中场防守动作', 'defence.def_actions.zone_back': '后场防守动作',
  'attack-transition.regains.all': '抢回球权', 'attack-transition.regains.zone_front': '前场抢回',
  'attack-transition.regains.zone_mid': '中场抢回', 'attack-transition.regains.zone_back': '后场抢回',
  'attack-transition.regains.tackle': '抢断抢回', 'attack-transition.regains.interception': '拦截抢回',
  'attack-transition.regains.loose': '抢第二落点抢回', 'attack-transition.regains.keeper': '门将拿球', 'attack-transition.regains.other': '其他抢回',
  'attack-transition.first_action.all': '抢回后的第一脚', 'attack-transition.first_action.forward': '抢回后向前传',
  'attack-transition.first_action.side': '抢回后横传', 'attack-transition.first_action.back': '抢回后回传',
  'attack-transition.first_action.long': '抢回后长传', 'attack-transition.first_action.dribble': '抢回后过人',
  'attack-transition.first_action.other': '抢回后其他', 'attack-transition.first_action.lost': '抢回后第一脚就丢',
  'attack-transition.counter.third': '抢回后打进前场', 'attack-transition.counter.box': '抢回后打进禁区',
  'attack-transition.counter.shots': '抢回后形成射门', 'attack-transition.counter.goals': '抢回后进球',
  'attack-transition.counter.fast': '抢回 6 秒内射门', 'attack-transition.counter.mid': '抢回 6–15 秒射门', 'attack-transition.counter.slow': '抢回 15 秒后射门',
  'defence-transition.losses.all': '丢球', 'defence-transition.losses.zone_front': '前场丢球',
  'defence-transition.losses.zone_mid': '中场丢球', 'defence-transition.losses.zone_back': '后场丢球',
  'defence-transition.losses.pass': '传球被断', 'defence-transition.losses.tackled': '被抢断', 'defence-transition.losses.dribble': '过人失败丢球',
  'defence-transition.losses.touch': '停球失误', 'defence-transition.losses.shot': '射门后丢球', 'defence-transition.losses.other': '其他丢球',
  'defence-transition.counterpress.won5': '丢球后 5 秒内抢回', 'defence-transition.counterpress.won10': '丢球后 10 秒内抢回',
  'defence-transition.counterpress.fouls': '丢球后犯规中断', 'defence-transition.counterpress.opp_shots': '丢球后对手射门',
  'defence-transition.counterpress.opp_goals': '丢球后对手进球',
  'set-pieces.throw_ins.all': '界外球', 'set-pieces.throw_ins.zone_front': '前场界外球', 'set-pieces.throw_ins.zone_mid': '中场界外球',
  'set-pieces.throw_ins.zone_back': '后场界外球', 'set-pieces.throw_ins.shots_after': '界外球后射门',
  'set-pieces.corners.corners': '角球', 'set-pieces.corners.shots': '角球后射门', 'set-pieces.free_kicks.all': '任意球',
  'set-pieces.free_kicks.shots_after': '任意球后射门', 'defence.pressing.front_won': '前场抢回球权',
  'defence.box_defence.aerial_won': '禁区内争顶赢', 'defence.box_defence.aerial_lost': '禁区内争顶输',
}
/** Readings that repeat another one's events: left out of the axis menus. */
export const AXIS_SKIP = new Set([
  'overview.match.shots', 'overview.match.on_target', 'overview.match.entries', 'overview.match.box', 'overview.match.recoveries',
  'overview.match.fouls', 'overview.match.corners', 'attack-transition.counter.all', 'defence-transition.counterpress.all',
])
export function shortName(S: Season, m: PMetric): string {
  if (AXIS_NAME[m.key]) return AXIS_NAME[m.key]
  const label = m.label.replace(/^全部/, '')
  return S.lg.metrics.filter((x) => x.label === m.label && !AXIS_SKIP.has(x.key)).length > 1 ? `${m.sectionTitle}·${label}` : label
}
export function axisOf(S: Season, key: string): Axis {
  const bio = BIO_AXES.find((a) => a.key === key)
  if (bio) return bio
  const m = S.lg.metrics[S.idx[key]]
  const name = shortName(S, m)
  if (m.format === 'int') return { key, label: `${name} / 90 分钟`, short: name, words: ['多', '少'] }
  if (m.format === 'pct') return { key, label: name, short: name, words: ['高', '低'] }
  return { key, label: `${name}（米）`, short: name, words: ['靠前', '靠后'] }
}
/** A label that says which section it comes from when the same label appears in several. */
export function uniqueLabel(S: Season, m: PMetric): string {
  const dup = S.lg.metrics.filter((x) => x.label === m.label).length > 1
  return dup && m.chapter !== 'overview' ? `${m.label}（${m.sectionTitle}）` : m.label
}
export function axisValue(S: Season, pid: string, key: string, f: PFilter): number | null {
  const p = S.lg.players[pid]
  if (key === 'bio.age') return p.age ?? null
  if (key === 'bio.height') return p.height ?? null
  if (key === 'bio.weight') return p.weight ?? null
  if (key === 'bio.minutes') return minutesOf(S, pid, f)
  const i = S.idx[key]
  const r = reading(S.sum.get(pid)?.[f], i, S.lg.metrics[i])
  return r.rankable ? r.value : null
}
export function fmtAxis(S: Season, key: string, v: number | null): string {
  if (v == null) return '—'
  if (key.startsWith('bio.')) return `${Math.round(v)}`
  return fmtValue(S.lg.metrics[S.idx[key]].format, v)
}

/* ------------------------------------------------------------------ formatting and places */

export function fmtValue(format: PFormat, v: number | null): string {
  if (v == null) return '—'
  if (format === 'pct') return `${Math.round(v * 100)}%`
  if (format === 'meters') return `${Math.round(v)} 米`
  return v >= 10 ? v.toFixed(1) : v.toFixed(2)
}
export const fmtInt = (v: number) => v.toLocaleString('en-US')
export const nameOf = (p: PlayerInfo | undefined) => (p ? p.nameZh || p.nameEn : '')
/** The places he played, most minutes first, as "中锋 1,581 · 左前锋 987". */
export function placesLine(pos: Record<string, number>, n = 3): string {
  return Object.entries(pos)
    .filter(([k]) => k !== '未知')
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => `${k} ${fmtInt(v)}`)
    .join(' · ')
}
export const mainPlace = (pos: Record<string, number>) => Object.entries(pos).filter(([k]) => k !== '未知').sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''

/** The player's foot: the squad file's when it has one, else what his footed shots say. */
export function footLine(p: PlayerInfo): { text: string; note: string | null } | null {
  if (p.foot) return { text: p.foot, note: null }
  const fs = p.footShots
  if (!fs || fs[0] + fs[1] < 8) return null
  const [l, r] = fs
  const side = l / (l + r) >= 0.75 ? '多用左脚' : r / (l + r) >= 0.75 ? '多用右脚' : '两脚都用'
  return { text: side, note: `阵容资料没写；按射门算：左脚 ${l}、右脚 ${r}` }
}

export const playerHref = (id: string, league?: string, extra?: Record<string, string>) => {
  const q = new URLSearchParams({ player: id, ...(league ? { league } : {}), ...(extra ?? {}) })
  return `/prototype/players/?${q}`
}
export const teamHref = (id: string, extra?: Record<string, string>) => `/prototype/players/?${new URLSearchParams({ team: id, ...(extra ?? {}) })}`
export const indexHref = (extra: Record<string, string>) => `/prototype/players/?${new URLSearchParams(extra)}`
export const matchHref = (matchId: string, teamId: string, chapter?: string) => `/match/${matchId}/?team=${teamId}${chapter ? `&chapter=${chapter}` : ''}`
export const shortDate = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
