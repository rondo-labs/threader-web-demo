// The player page's radars (docs/players.md): the five abilities the position is judged by (data.ts FIVE), and each
// ability's own radar, its reading and the readings that explain it. A corner is the share of the position group's
// players (above the minutes threshold) the player is ahead of (radar/axis.ts).
import { place, type Axis } from '../radar/axis'
import { FIVE, fiveSet, fmtValue, groupRank, nameOf, reading, shortName, summaryOf, type Season } from './data'
/** An ability's radar: its own reading first, then the readings that explain it. */
const ABILITY: Record<string, string[]> = {
  'defence.box_defence.save_rate': ['defence.box_defence.save_rate', 'defence.box_defence.saves', 'attack-transition.regains.keeper'],
  'defence.box_defence.claim_rate': ['defence.box_defence.claim_rate', 'defence.box_defence.keeper_out', 'attack-transition.regains.keeper'],
  'defence.box_defence.keeper_out': ['defence.box_defence.keeper_out', 'defence.pressing.height', 'attack-transition.regains.keeper'],
  'attack.build_up.long_rate': ['attack.build_up.long_rate', 'attack.build_up.long', 'attack.build_up.gk_long', 'attack.build_up.gk_long_share'],
  'overview.match.pass_rate': ['overview.match.pass_rate', 'overview.personal.passes', 'overview.personal.touches', 'attack.build_up.long_rate'],
  'defence.def_actions.aerial_rate': ['defence.def_actions.aerial_rate', 'defence.def_actions.aerials_won', 'defence.box_defence.aerial_won', 'defence.def_actions.clearances'],
  'defence.def_actions.duel_rate': ['defence.def_actions.duel_rate', 'defence.def_actions.tackles', 'defence.def_actions.interceptions', 'defence.def_actions.recoveries'],
  'defence.def_actions.interceptions': ['defence.def_actions.interceptions', 'defence.def_actions.blocked_passes', 'defence.def_actions.recoveries', 'attack-transition.regains.all'],
  'defence.def_actions.clearances': ['defence.def_actions.clearances', 'defence.box_defence.box_clear', 'defence.box_defence.blocks', 'defence.box_defence.aerial_won'],
  'attack.build_up.exits': ['attack.build_up.exits', 'attack.build_up.long_rate', 'overview.match.pass_rate', 'overview.personal.passes'],
  'attack-transition.regains.all': ['attack-transition.regains.all', 'defence.def_actions.interceptions', 'defence.def_actions.tackles', 'defence.def_actions.recoveries', 'defence.pressing.front_won'],
  'attack.entries.entries': ['attack.entries.entries', 'attack.entries.entry_rate', 'attack.entries.box', 'overview.personal.takeons_won'],
  'attack.crosses.cross_ok': ['attack.crosses.cross_ok', 'attack.crosses.crosses', 'attack.crosses.cross_rate', 'attack.crosses.cross_shot'],
  'overview.personal.key_passes': ['overview.personal.key_passes', 'overview.personal.assists', 'attack.entries.box', 'attack.entries.entries'],
  'overview.personal.takeons_won': ['overview.personal.takeons_won', 'overview.personal.takeon_rate', 'overview.personal.takeons', 'overview.personal.fouled'],
  'attack.shots.shots': ['attack.shots.shots', 'attack.shots.on_target', 'overview.personal.goals', 'attack.shots.in_box', 'attack.shots.big'],
  'defence.def_actions.zone_front': ['defence.def_actions.zone_front', 'defence.pressing.front_won', 'attack-transition.regains.zone_front', 'defence.def_actions.tackles'],
  'defence.def_actions.all_actions': ['defence.def_actions.all_actions', 'defence.def_actions.tackles', 'defence.def_actions.interceptions', 'defence.def_actions.recoveries', 'attack-transition.regains.all'],
  'overview.personal.goals': ['overview.personal.goals', 'attack.shots.on_target', 'attack.shots.open_play_box', 'attack.shots.conversion', 'attack.shots.big'],
  'attack.shots.in_box': ['attack.shots.in_box', 'attack.shots.open_play_box', 'attack.shots.headers', 'attack.shots.set_piece', 'attack.shots.big'],
  'attack.shots.conversion': ['attack.shots.conversion', 'overview.personal.goals', 'attack.shots.on_target', 'attack.shots.shots', 'attack.shots.big'],
}
// One ability can sit in two positions' sets with the same reading (支点 and 空中 are both 争顶成功率): the forward's
// 支点 radar reads like a target man's.
const ABILITY_BY_NAME: Record<string, string[]> = {
  支点: ['defence.def_actions.aerial_rate', 'defence.def_actions.aerials_won', 'overview.personal.fouled', 'overview.personal.touches'],
  串联: ['overview.personal.key_passes', 'overview.personal.assists', 'overview.personal.passes', 'overview.personal.touches'],
  对抗: ['defence.def_actions.duel_rate', 'defence.def_actions.tackles', 'defence.def_actions.aerial_rate', 'defence.def_actions.aerials_won'],
}

/** The set a player's radar uses: the group's five, 中场 split in two (data.ts fiveSet). */
export function radarSet(S: Season, pid: string): { name: string; axes: [string, string][] } {
  const set = fiveSet(S, pid)
  return { name: set === '后腰' ? '后腰、中前卫' : set, axes: FIVE[set] ?? [] }
}

function playerAxis(S: Season, pid: string, key: string, label: string): Axis | null {
  const i = S.idx[key]
  if (i == null) return null
  const m = S.meta.metrics[i]
  const r = reading(summaryOf(S, pid, 'all'), i, m)
  const g = groupRank(S, pid, key, 'all')
  const rows = g.rows.map((x) => ({ id: x.id, v: x.v, name: nameOf(S.meta.players[x.id]) }))
  const ok = r.rankable && r.value != null
  const p = ok ? place(rows, r.value!, false) : null
  const show = (v: number) => fmtValue(m.format, v)
  return {
    key, chapter: m.chapter, section: m.section, label, reading: shortName(S, m).replace(/^个人·/, ''),
    value: ok ? r.value : null, display: ok ? show(r.value!) : '—', unit: m.format === 'int' ? '每 90 分钟' : '',
    rank: p?.rank ?? null, of: rows.length, pct: p?.pct ?? null, fewer: false, median: g.median,
    missing: ok ? null : m.format === 'int' ? '没有出场' : `只有 ${r.n} 次`, rows, fmt: show,
  }
}

/** The player's five: one corner per ability of the position. */
export function playerAxes(S: Season, pid: string): Axis[] {
  return radarSet(S, pid).axes.flatMap(([ability, key]) => {
    const a = playerAxis(S, pid, key, ability)
    return a ? [a] : []
  })
}

/** An ability's own radar: its reading and the ones that explain it, each a corner named by the reading. */
export function abilityAxes(S: Season, pid: string, ability: Axis): Axis[] {
  const keys = ABILITY_BY_NAME[ability.label] ?? ABILITY[ability.key] ?? [ability.key]
  return keys.flatMap((k) => {
    const a = playerAxis(S, pid, k, '')
    return a ? [{ ...a, label: a.reading }] : []
  })
}
