// The team page's radars (docs/team.md): the five, one corner per chapter (data.ts FIVE), and each chapter's own radar,
// one corner per section, each section read by one reading; plus the league's teams by possession and pressing for
// 怎么踢. A corner is the share of the league's teams the team is ahead of (radar/axis.ts).
import { CHAPTERS } from '../match-analysis/common'
import { place, type Axis } from '../radar/axis'
import { median } from '../players/data'
import { FIVE, fmt, fmtDiff, value, type Filter, type League } from './data'

export const CHAPTER_ZH: Record<string, string> = Object.fromEntries(CHAPTERS.map((c) => [c.key, c.zh]))
/** Clockwise from the top: the attacking chapters on the right, the defending ones on the left, set pieces at the foot. */
export const TEAM_ORDER = ['attack', 'attack-transition', 'set-pieces', 'defence-transition', 'defence']

function teamRows(lg: League, of: (t: string) => number | null) {
  return Object.keys(lg.teams)
    .map((t) => ({ id: t, v: of(t), name: lg.teams[t].nameZh }))
    .filter((r): r is { id: string; v: number; name: string } => r.v != null)
}

/** A team reading as a radar corner, under a filter: a reading, a difference (ours − theirs) or a rate of two counts. */
interface TeamReadingDef { key?: string; num?: string; den?: string; label?: string; fewer?: boolean; vs?: boolean }
function teamAxis(lg: League, teamId: string, chapter: string, d: TeamReadingDef, label: string, filter: Filter): Axis | null {
  const focusKey = d.key ?? d.num!
  const m = lg.metrics.find((x) => x.key === focusKey)
  if (!m) return null
  const of = (t: string): number | null => {
    if (d.num && d.den) {
      const s = lg.season[filter]?.[t]
      const a = s?.[d.num]?.[0], b = s?.[d.den]?.[0]
      return a == null || !b ? null : a / b
    }
    if (d.vs) {
      const us = value(lg, t, d.key!, filter), them = value(lg, t, d.key!, filter, 'opp')
      return us == null || them == null ? null : us - them
    }
    return value(lg, t, d.key!, filter)
  }
  const format = d.num ? 'pct' : m.format
  const show = (v: number) => (d.vs ? fmtDiff(v) : fmt(v, format))
  const rows = teamRows(lg, of)
  const mine = of(teamId)
  const p = mine == null ? null : place(rows, mine, !!d.fewer)
  const axis: Axis = {
    key: focusKey, chapter, section: m.section, label, reading: d.label ?? m.label,
    value: mine, display: mine == null ? '—' : show(mine), unit: format === 'int' || d.vs ? '每场' : '',
    rank: p?.rank ?? null, of: rows.length, pct: p?.pct ?? null, fewer: !!d.fewer,
    median: median(rows.map((r) => r.v)), missing: null, rows, fmt: show,
  }
  if (d.vs) {
    const g = lg.season[filter]?.[teamId]?.['set-pieces.overall.goals']
    axis.note = `我们 ${fmt(value(lg, teamId, d.key!, filter), 'int')} 比对手 ${fmt(value(lg, teamId, d.key!, filter, 'opp'), 'int')}${g ? ` · 定位球进 ${g[0]} 失 ${g[2]}` : ''}`
  }
  return axis
}

/** The team's five, whole season: a corner per chapter. */
export function teamAxes(lg: League, teamId: string): Axis[] {
  return TEAM_ORDER.flatMap((chapter) => {
    const def = FIVE.find((d) => d.chapter === chapter)
    const a = def && teamAxis(lg, teamId, chapter, { key: def.key, fewer: def.fewer, vs: def.vs, label: def.label }, CHAPTER_ZH[chapter], 'all')
    return a ? [a] : []
  })
}

/** A chapter's radar: one corner per section, each read by the reading that says most about how the team does there
 *  (draft). Fewer-is-better readings are turned round so further out is still better. */
const CHAPTER_RADAR: Record<string, (TeamReadingDef & { section: string })[]> = {
  attack: [
    { section: 'build_up', key: 'attack.build_up.exits' },
    { section: 'network', key: 'attack.network.pass_rate' },
    { section: 'entries', key: 'attack.entries.entries' },
    { section: 'shots', key: 'attack.shots.open_play_box' },
    { section: 'crosses', key: 'attack.crosses.cross_ok' },
  ],
  defence: [
    { section: 'def_actions', key: 'defence.def_actions.dribbled_past', fewer: true },
    { section: 'pressing', key: 'defence.pressing.ppda', fewer: true, label: 'PPDA（越小压得越凶）' },
    { section: 'opp_access', key: 'defence.opp_access.opp_entries', fewer: true },
    { section: 'box_defence', key: 'defence.box_defence.shots_in_open', fewer: true },
  ],
  'attack-transition': [
    { section: 'regains', key: 'attack-transition.regains.zone_front', label: '前场抢回球权' },
    { section: 'first_action', num: 'attack-transition.first_action.lost', den: 'attack-transition.first_action.all', fewer: true, label: '第一脚就丢的比例' },
    { section: 'counter', key: 'attack-transition.counter.box_rate', label: '抢回后打进禁区的比例' },
  ],
  'defence-transition': [
    { section: 'losses', key: 'defence-transition.losses.zone_back', fewer: true, label: '后场丢球' },
    { section: 'opp_after_loss', key: 'defence-transition.opp_after_loss.box', fewer: true },
    { section: 'counterpress', key: 'defence-transition.counterpress.won10_rate' },
  ],
  'set-pieces': [
    { section: 'overall', key: 'set-pieces.overall.shots', vs: true, label: '定位球射门差' },
    { section: 'corners', key: 'set-pieces.corners.shots' },
    { section: 'free_kicks', key: 'set-pieces.free_kicks.shots_after' },
    { section: 'throw_ins', num: 'set-pieces.throw_ins.kept', den: 'set-pieces.throw_ins.all', label: '扔完控住球的比例' },
  ],
}

export function chapterAxes(lg: League, teamId: string, chapter: string, filter: Filter): Axis[] {
  return (CHAPTER_RADAR[chapter] ?? []).flatMap((d) => {
    const title = lg.metrics.find((x) => x.chapter === chapter && x.section === d.section)?.sectionTitle
    const a = title ? teamAxis(lg, teamId, chapter, d, title, filter) : null
    return a ? [a] : []
  })
}

/** The league's teams by possession and by how hard they press (PPDA: fewer opponent passes per defensive action is
 *  a harder press), for the 怎么踢 chart beside the radar. */
export function styleOf(lg: League) {
  return Object.keys(lg.teams).map((id) => ({
    id, name: lg.teams[id].nameZh,
    possession: value(lg, id, 'overview.match.possession'),
    ppda: value(lg, id, 'defence.pressing.ppda'),
  }))
}
