// The player pages' data (pipeline/threader_demo/players.py, definitions in docs/players.md) and the arithmetic they
// share: a player's season under a filter, per 90 minutes, his rank among teammates (by total) and in his position
// group (per 90, above the minutes threshold), the five readings his position is judged by, the quadrant chart's axes.
import { useEffect, useState } from 'react'
import { FILTERS, type Filter } from '../team/data'

export { FILTERS, type Filter }
export type PFormat = 'int' | 'pct' | 'meters'
export const LEAGUES = [
  { slug: 'chinese-super-league-2026', zh: '中超' },
  { slug: 'chinese-football-league-1-2026', zh: '中甲' },
  { slug: 'chinese-football-league-2-2026', zh: '中乙' },
]
export const FOCUS_LEAGUE = 'chinese-football-league-2-2026'

export interface PMetric {
  key: string; chapter: string; section: string; sectionTitle: string; question: string | null
  label: string; format: PFormat; hint: string | null
  /** attempts a rate needs before it is compared, where that is not the usual 20 */
  min?: number
}
/** A count, or [ok, attempts] (rates), or [metres summed, actions] (average position); 0 when there is none. */
export type Val = number | [number, number]
/** Minutes, appearances, starts, readings (aligned with the metric list). */
export type Summary = [number, number, number, Val[]]
export interface PlayerInfo {
  nameZh: string; nameEn: string; number: number | null; teams: string[]; group: string
  groupMin: Record<string, number>; places: Record<string, number>
  age?: number; height?: number; weight?: number; foot?: string; nat?: string; joined?: string; footShots?: [number, number]
}
export interface PlayersMeta {
  slug: string; nameZh: string; groups: string[]
  /** position name → [x, y, group]; x from our goal (0) to theirs, y = 100 on our left */
  places: Record<string, [number, number, string]>
  thresholds: Record<Filter, number>
  metrics: PMetric[]
  teams: Record<string, string>
  players: Record<string, PlayerInfo>
  /** [player, team]: a player at one team; the filter files list their sums in this order */
  stints: [string, string][]
}
export interface App {
  m: string; d: string; t: string; o: string; h: boolean; s: [number, number]; st: boolean; min: number
  places: Record<string, number>; src: string | null; num: number | null
}
/** x, y, end x, end y, appearance, outcome (1 ok), label index, clock, video seconds, kind (pass cross shot goal) */
export type PEvent = [number, number, number | null, number | null, number, number, number, string, number | null, number]
export interface LeagueDetail {
  apps: App[]
  /** per reading: n per appearance, e the counted actions, k the successful ones (rates), t the team's count per appearance */
  metrics: Record<string, { n: Val[]; e: number[]; k?: number[]; t?: number[] }>
  events: PEvent[]
  labels: string[]
}
export interface PlayerFile { id: string; leagues: Record<string, LeagueDetail> }
export interface SearchRow { id: string; zh: string; en: string; py: string; ini: string; num: number | null; team: string; lg: string; lgZh: string; group: string; min: number }

const cache = new Map<string, Promise<unknown>>()
function get<T>(url: string): Promise<T> {
  if (!cache.has(url))
    cache.set(url, fetch(url).then((r) => {
      if (!r.ok) throw new Error(r.status === 404 ? '没有找到' : `HTTP ${r.status}`)
      return r.json()
    }))
  return cache.get(url) as Promise<T>
}
export const loadPlayer = (id: string) => get<PlayerFile>(`/data/players/p/${encodeURIComponent(id)}.json`)
export const loadSearch = () => get<SearchRow[]>('/data/players/search.json')

/* ------------------------------------------------------------------ a league's season */

export interface Season {
  meta: PlayersMeta
  idx: Record<string, number>
  stintsOf: Map<string, number[]>
  teamStints: Map<string, number[]>
  /** filter → per stint; only the filters loaded so far */
  rows: Partial<Record<Filter, Summary[]>>
  /** filter → player → his sums over all his teams in this league */
  sums: Partial<Record<Filter, Map<string, Summary>>>
  memo: Map<string, unknown>
}

function addVal(a: Val, b: Val): Val {
  if (typeof a === 'number' && typeof b === 'number') return a + b
  const x = typeof a === 'number' ? [0, 0] : a
  const y = typeof b === 'number' ? [0, 0] : b
  return [x[0] + y[0], x[1] + y[1]]
}
const addSummary = (a: Summary, b: Summary): Summary => [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3].map((v, i) => addVal(v, b[3][i]))]

const seasons = new Map<string, Promise<Season>>()
function seasonOf(slug: string): Promise<Season> {
  if (!seasons.has(slug))
    seasons.set(slug, get<PlayersMeta>(`/data/players/${slug}.json`).then((meta) => {
      const stintsOf = new Map<string, number[]>()
      const teamStints = new Map<string, number[]>()
      meta.stints.forEach(([p, t], i) => {
        stintsOf.set(p, [...(stintsOf.get(p) ?? []), i])
        teamStints.set(t, [...(teamStints.get(t) ?? []), i])
      })
      return { meta, idx: Object.fromEntries(meta.metrics.map((m, i) => [m.key, i])), stintsOf, teamStints, rows: {}, sums: {}, memo: new Map() }
    }))
  return seasons.get(slug)!
}
async function withFilter(S: Season, f: Filter): Promise<void> {
  if (S.rows[f]) return
  const rows = await get<Summary[]>(`/data/players/${S.meta.slug}-${f}.json`)
  const sums = new Map<string, Summary>()
  for (const [pid, list] of S.stintsOf) sums.set(pid, list.slice(1).reduce((acc, i) => addSummary(acc, rows[i]), rows[list[0]]))
  S.rows[f] = rows
  S.sums[f] = sums
}

/** A league's season with the whole-season sums and those of `filter`. While another filter loads, `shown` stays on
 *  the last one ready, so the page keeps its numbers instead of blanking. */
export function useSeason(slug: string | null, filter: Filter) {
  const [state, setState] = useState<{ S: Season | null; shown: Filter; error: string | null }>({ S: null, shown: 'all', error: null })
  useEffect(() => {
    if (!slug) return
    let live = true
    seasonOf(slug)
      .then(async (S) => {
        await withFilter(S, 'all')
        if (live) setState((s) => ({ S, shown: s.S === S && S.rows[filter] ? filter : s.S === S ? s.shown : 'all', error: null }))
        await withFilter(S, filter)
        if (live) setState({ S, shown: filter, error: null })
      })
      .catch((e: Error) => live && setState((s) => ({ ...s, error: e.message })))
    return () => {
      live = false
    }
  }, [slug, filter])
  return state
}

export interface Reading {
  /** per 90 minutes (counts), the rate (pct) or the average position in metres (meters) */
  value: number | null
  /** count, successes, or actions behind an average */
  total: number
  /** attempts behind a rate or an average */
  n: number
  /** enough to compare: any minutes for a count, 20 attempts for a rate (or its own `min`), 10 actions for an average position */
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
  return { value: b ? a / b : null, total: m.format === 'pct' ? a : b, n: b, rankable: b >= (m.min ?? (m.format === 'pct' ? 20 : 10)) }
}

export const summaryOf = (S: Season, pid: string, f: Filter) => S.sums[f]?.get(pid)
export const minutesOf = (S: Season, pid: string, f: Filter) => summaryOf(S, pid, f)?.[0] ?? 0
export const isRanked = (S: Season, pid: string, f: Filter) => minutesOf(S, pid, f) >= S.meta.thresholds[f]
/** The stint at the team he played for last. */
export function currentStint(S: Season, pid: string): number {
  const list = S.stintsOf.get(pid) ?? []
  const last = S.meta.players[pid]?.teams.at(-1)
  return list.find((i) => S.meta.stints[i][1] === last) ?? list[0]
}

/** Players of a position group above the filter's threshold (or another number of minutes). */
export function peers(S: Season, group: string, f: Filter, minutes = S.meta.thresholds[f]): string[] {
  const k = `peers|${group}|${f}|${minutes}`
  if (!S.memo.has(k)) S.memo.set(k, Object.keys(S.meta.players).filter((pid) => S.meta.players[pid].group === group && minutesOf(S, pid, f) >= minutes))
  return S.memo.get(k) as string[]
}

export interface GroupRank { rank: number | null; of: number; median: number | null; rows: { id: string; v: number }[] }
/** The player's place in his group (per 90, rate or average), most first, among those with enough to compare. */
export function groupRank(S: Season, pid: string, key: string, f: Filter, group = S.meta.players[pid]?.group): GroupRank {
  const k = `rank|${group}|${f}|${key}`
  if (!S.memo.has(k)) {
    const i = S.idx[key]
    const m = S.meta.metrics[i]
    const rows = peers(S, group, f)
      .map((id) => ({ id, r: reading(summaryOf(S, id, f), i, m) }))
      .filter((x) => x.r.rankable && x.r.value != null)
      .map((x) => ({ id: x.id, v: x.r.value! }))
      .sort((a, b) => b.v - a.v)
    S.memo.set(k, rows)
  }
  const rows = S.memo.get(k) as { id: string; v: number }[]
  const at = rows.findIndex((r) => r.id === pid)
  return { rank: at >= 0 ? at + 1 : null, of: rows.length, median: median(rows.map((r) => r.v)), rows }
}

/** The stint's place in its team by total (rates and averages: among teammates with enough attempts). */
export function teamRank(S: Season, stint: number, key: string, f: Filter): { rank: number | null; of: number } {
  const rowsF = S.rows[f]
  if (!rowsF) return { rank: null, of: 0 }
  const i = S.idx[key]
  const m = S.meta.metrics[i]
  const list = (S.teamStints.get(S.meta.stints[stint][1]) ?? [])
    .map((s) => ({ s, r: reading(rowsF[s], i, m) }))
    .filter((x) => rowsF[x.s][0] > 0 && (m.format === 'int' ? x.r.total > 0 || x.s === stint : x.r.rankable))
    .sort((a, b) => (m.format === 'int' ? b.r.total - a.r.total : (b.r.value ?? 0) - (a.r.value ?? 0)))
  const at = list.findIndex((x) => x.s === stint)
  const mine = reading(rowsF[stint], i, m)
  return { rank: at >= 0 && (m.format === 'int' ? mine.total > 0 : mine.rankable) ? at + 1 : null, of: list.length }
}

export function median(vs: number[]): number | null {
  if (!vs.length) return null
  const a = [...vs].sort((x, y) => x - y)
  const h = Math.floor(a.length / 2)
  return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2
}

/** Readings that repeat another one's events: left out of the axis menus. */
export const REPEATS = new Set([
  'overview.match.shots', 'overview.match.on_target', 'overview.match.entries', 'overview.match.box', 'overview.match.recoveries',
  'overview.match.fouls', 'overview.match.corners', 'attack-transition.counter.all', 'defence-transition.counterpress.all',
])

/* ------------------------------------------------------------------ the five on the radar */

/** The five readings each position is judged by, in order, as [ability, reading] (docs/players.md):
 *  the corners of the player page's radar (radar.ts). 中场 has two sets: 前腰, and 后腰 for the rest of midfield (后腰,
 *  中前卫, a 4-3-3's side central midfielders), who look alike in the data. On a radar every corner must read "further
 *  out is stronger", so the keeper's 扑救量 (how busy) and 出球方式 (球门球长传占比, how the ball goes out) are left
 *  off; both show in the quadrant chart and the abilities' own radars. */
export const FIVE: Record<string, [string, string][]> = {
  门将: [
    ['扑救', 'defence.box_defence.save_rate'], ['高空球', 'defence.box_defence.claim_rate'], ['出击', 'defence.box_defence.keeper_out'],
    ['长传', 'attack.build_up.long_rate'], ['传球', 'overview.match.pass_rate'],
  ],
  中卫: [
    ['空中', 'defence.def_actions.aerial_rate'], ['一对一', 'defence.def_actions.duel_rate'], ['预判', 'defence.def_actions.interceptions'],
    ['禁区保护', 'defence.def_actions.clearances'], ['出球', 'attack.build_up.exits'],
  ],
  边后卫: [
    ['一对一', 'defence.def_actions.duel_rate'], ['断球', 'attack-transition.regains.all'], ['推进', 'attack.entries.entries'],
    ['传中', 'attack.crosses.cross_ok'], ['创造机会', 'overview.personal.key_passes'],
  ],
  后腰: [
    ['传球稳定', 'overview.match.pass_rate'], ['推进', 'attack.entries.entries'], ['创造机会', 'overview.personal.key_passes'],
    ['断球', 'attack-transition.regains.all'], ['对抗', 'defence.def_actions.duel_rate'],
  ],
  前腰: [
    ['推进', 'attack.entries.entries'], ['创造机会', 'overview.personal.key_passes'], ['突破', 'overview.personal.takeons_won'],
    ['射门威胁', 'attack.shots.shots'], ['压迫', 'defence.def_actions.zone_front'],
  ],
  边路: [
    ['突破', 'overview.personal.takeons_won'], ['传中', 'attack.crosses.cross_ok'], ['创造机会', 'overview.personal.key_passes'],
    ['射门威胁', 'attack.shots.shots'], ['防守投入', 'defence.def_actions.all_actions'],
  ],
  前锋: [
    ['得分', 'overview.personal.goals'], ['抢点', 'attack.shots.in_box'], ['把握机会', 'attack.shots.conversion'],
    ['支点', 'defence.def_actions.aerial_rate'], ['串联', 'overview.personal.key_passes'],
  ],
}
const ATTACKING_MIDFIELD = new Set(['左前腰', '前腰', '右前腰'])
/** The set he is judged by: his group's; in 中场, 前腰 if he played more minutes there than in the rest of midfield. */
export function fiveSet(S: Season, pid: string): string {
  const p = S.meta.players[pid]
  if (p.group !== '中场') return p.group
  let am = 0
  let rest = 0
  for (const [place, min] of Object.entries(p.places)) {
    if (S.meta.places[place]?.[2] !== '中场') continue
    if (ATTACKING_MIDFIELD.has(place)) am += min
    else rest += min
  }
  return am > rest ? '前腰' : '后腰'
}

/* ------------------------------------------------------------------ the quadrant chart's axes */

export interface Axis { key: string; label: string; short: string; words: [string, string] }
export const BIO_AXES: Axis[] = [
  { key: 'bio.age', label: '年龄', short: '年龄', words: ['大', '小'] },
  { key: 'bio.height', label: '身高（厘米）', short: '个子', words: ['高', '矮'] },
  { key: 'bio.weight', label: '体重（公斤）', short: '体重', words: ['重', '轻'] },
  { key: 'bio.minutes', label: '出场时间（分钟）', short: '出场时间', words: ['多', '少'] },
]
/** Each group opens on its own pair. */
export const DEFAULT_AXES: Record<string, [string, string]> = {
  门将: ['attack.build_up.gk_long_share', 'defence.box_defence.saves'],
  中卫: ['attack.build_up.exits', 'defence.def_actions.all_actions'],
  边后卫: ['attack.crosses.crosses', 'defence.def_actions.all_actions'],
  中场: ['attack.entries.entries', 'attack-transition.regains.all'],
  边路: ['attack.entries.box', 'attack.shots.shots'],
  前锋: ['attack.shots.shots', 'defence.def_actions.zone_front'],
}
/** Short names for readings whose label only reads right inside their section ("在前场", "全部"). */
const SHORT: Record<string, string> = {
  'attack.entries.box': '传进禁区', 'set-pieces.free_kicks.into_box': '任意球传进禁区', 'defence.box_defence.saves': '扑救',
  'defence.def_actions.all_actions': '防守动作', 'defence.def_actions.zone_front': '前场防守动作', 'defence.def_actions.zone_mid': '中场防守动作',
  'defence.def_actions.zone_back': '后场防守动作', 'defence.def_actions.tackles': '抢断', 'defence.def_actions.interceptions': '拦截',
  'defence.def_actions.recoveries': '抢第二落点', 'defence.def_actions.clearances': '解围', 'defence.def_actions.blocked_passes': '封堵传球',
  'defence.def_actions.aerials_won': '争顶成功', 'defence.def_actions.dribbled_past': '被过', 'defence.def_actions.fouls': '犯规',
  'defence.pressing.front_won': '前场抢回球权', 'defence.box_defence.aerial_won': '禁区内争顶赢', 'defence.box_defence.aerial_lost': '禁区内争顶输',
  'attack-transition.regains.all': '抢回球权', 'attack-transition.regains.zone_front': '前场抢回', 'attack-transition.regains.zone_mid': '中场抢回',
  'attack-transition.regains.zone_back': '后场抢回', 'attack-transition.regains.tackle': '抢断抢回', 'attack-transition.regains.interception': '拦截抢回',
  'attack-transition.regains.loose': '抢第二落点抢回', 'attack-transition.regains.keeper': '门将拿球', 'attack-transition.regains.other': '其他抢回',
  'attack-transition.first_action.all': '抢回后的第一脚', 'attack-transition.first_action.forward': '抢回后向前传',
  'attack-transition.first_action.side': '抢回后横传', 'attack-transition.first_action.back': '抢回后回传', 'attack-transition.first_action.long': '抢回后长传',
  'attack-transition.first_action.dribble': '抢回后过人', 'attack-transition.first_action.other': '抢回后其他', 'attack-transition.first_action.lost': '抢回后第一脚就丢',
  'attack-transition.counter.third': '抢回后打进前场', 'attack-transition.counter.box': '抢回后打进禁区',
  'attack-transition.counter.box_rate': '抢回后打进禁区的比例', 'attack-transition.counter.shots': '抢回后形成射门',
  'attack-transition.counter.goals': '抢回后进球', 'attack-transition.counter.fast': '抢回 6 秒内射门', 'attack-transition.counter.mid': '抢回 6–15 秒射门',
  'attack-transition.counter.slow': '抢回 15 秒后射门',
  'defence-transition.losses.all': '丢球', 'defence-transition.losses.zone_front': '前场丢球', 'defence-transition.losses.zone_mid': '中场丢球',
  'defence-transition.losses.zone_back': '后场丢球', 'defence-transition.losses.pass': '传球被断', 'defence-transition.losses.tackled': '被抢断',
  'defence-transition.losses.dribble': '过人失败丢球', 'defence-transition.losses.touch': '停球失误', 'defence-transition.losses.shot': '射门后丢球',
  'defence-transition.losses.other': '其他丢球', 'defence-transition.counterpress.won5': '丢球后 5 秒内抢回',
  'defence-transition.counterpress.won10': '丢球后 10 秒内抢回', 'defence-transition.counterpress.won10_rate': '丢球后 10 秒内抢回的比例',
  'defence-transition.counterpress.fouls': '丢球后犯规中断',
  'defence-transition.counterpress.opp_shots': '丢球后对手射门', 'defence-transition.counterpress.opp_goals': '丢球后对手进球',
  'set-pieces.corners.corners': '角球', 'set-pieces.corners.shots': '角球后射门', 'set-pieces.free_kicks.all': '任意球',
  'set-pieces.free_kicks.shots_after': '任意球后射门', 'set-pieces.throw_ins.all': '界外球', 'set-pieces.throw_ins.zone_front': '前场界外球',
  'set-pieces.throw_ins.zone_mid': '中场界外球', 'set-pieces.throw_ins.zone_back': '后场界外球', 'set-pieces.throw_ins.shots_after': '界外球后射门',
}
export function shortName(S: Season, m: PMetric): string {
  if (SHORT[m.key]) return SHORT[m.key]
  const label = m.label.replace(/^全部/, '')
  return S.meta.metrics.filter((x) => x.label === m.label && !REPEATS.has(x.key)).length > 1 ? `${m.sectionTitle}·${label}` : label
}
export function axisOf(S: Season, key: string): Axis {
  const bio = BIO_AXES.find((a) => a.key === key)
  if (bio) return bio
  const m = S.meta.metrics[S.idx[key]]
  const name = shortName(S, m)
  if (m.format === 'int') return { key, label: `${name} / 90 分钟`, short: name, words: ['多', '少'] }
  if (m.format === 'pct') return { key, label: name, short: name, words: ['高', '低'] }
  return { key, label: `${name}（米）`, short: name, words: ['靠前', '靠后'] }
}
export const isAxis = (S: Season, key: string | null): key is string => !!key && (key in S.idx || BIO_AXES.some((a) => a.key === key))
export function axisValue(S: Season, pid: string, key: string, f: Filter): number | null {
  const p = S.meta.players[pid]
  if (key === 'bio.age') return p.age ?? null
  if (key === 'bio.height') return p.height ?? null
  if (key === 'bio.weight') return p.weight ?? null
  if (key === 'bio.minutes') return minutesOf(S, pid, f)
  const i = S.idx[key]
  const r = reading(summaryOf(S, pid, f), i, S.meta.metrics[i])
  return r.rankable ? r.value : null
}
export function fmtAxis(S: Season, key: string, v: number | null): string {
  if (v == null) return '—'
  if (key.startsWith('bio.')) return `${Math.round(v)}`
  return fmtValue(S.meta.metrics[S.idx[key]].format, v)
}

/* ------------------------------------------------------------------ formatting, names, links */

export function fmtValue(format: PFormat, v: number | null): string {
  if (v == null) return '—'
  if (format === 'pct') return `${Math.round(v * 100)}%`
  if (format === 'meters') return `${Math.round(v)} 米`
  return v >= 10 ? v.toFixed(1) : v.toFixed(2)
}
export const fmtInt = (v: number) => v.toLocaleString('en-US')
export const nameOf = (p: { nameZh: string; nameEn?: string } | undefined) => (p ? p.nameZh || p.nameEn || '' : '')
/** The positions he played, most minutes first: "中锋 1,581 · 左前锋 987". */
export function placesLine(places: Record<string, number>, n = 3): string {
  return Object.entries(places)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => `${k} ${fmtInt(v)}`)
    .join(' · ')
}
export const mainPlace = (places: Record<string, number>) => Object.entries(places).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''

/** The squad file's foot when it has one, else what his footed shots say (eight or more). */
export function footLine(p: PlayerInfo): { text: string; note: string | null } | null {
  if (p.foot) return { text: p.foot, note: null }
  const fs = p.footShots
  if (!fs || fs[0] + fs[1] < 8) return null
  const [l, r] = fs
  const text = l / (l + r) >= 0.75 ? '多用左脚' : r / (l + r) >= 0.75 ? '多用右脚' : '两脚都用'
  return { text, note: `阵容资料没写；按射门算：左脚 ${l}、右脚 ${r}` }
}

export const playerHref = (id: string, params?: Record<string, string>) =>
  `/player/${encodeURIComponent(id)}/${params && Object.keys(params).length ? `?${new URLSearchParams(params)}` : ''}`
export const playersHref = (params: Record<string, string>) => `/players/?${new URLSearchParams(params)}`
export const teamPageHref = (id: string, params?: Record<string, string>) =>
  `/team/${encodeURIComponent(id)}/${params && Object.keys(params).length ? `?${new URLSearchParams(params)}` : ''}`
export const matchPageHref = (matchId: string, teamId: string, chapter?: string) => `/match/${matchId}/?team=${teamId}${chapter ? `&chapter=${chapter}` : ''}`
export const shortDate = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
