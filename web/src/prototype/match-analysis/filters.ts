// PROTOTYPE: per-section filters (round 2: A's layout with C's "look at one kind at a time").
import { LANE_ZH, markEids } from './Pitch'
import type { ArrowMark, Count, Mark, MatchData, Metric, Section, ShotMark, Span } from './types'

export interface Option { key: string; label: string; test: (m: Mark) => boolean }
export interface Facet { key: string; label: string; options: Option[] }
export type Selection = Record<string, string>
export type Half = 'all' | '1' | '2'
export type GameState = 'all' | 'lead' | 'draw' | 'trail'
/** Which part of the match the numbers and the chart cover. State is read from the analysed team's side. */
export interface Scope { half: Half; state: GameState }
export const FULL: Scope = { half: 'all', state: 'all' }

const all = (label = '全部'): Option => ({ key: 'all', label, test: () => true })
const shot = (key: string, label: string, test: (m: ShotMark) => boolean): Option => ({ key, label, test: (m) => m.kind === 'shot' && test(m) })
const arrow = (key: string, label: string, test: (m: ArrowMark) => boolean): Option => ({ key, label, test: (m) => m.kind === 'arrow' && test(m) })
const period = (m: Mark) => (m.kind === 'shot' || m.kind === 'arrow' ? m.period : 0)

const HALF: Facet = {
  key: 'half',
  label: '时间',
  options: [all('全场'), { key: '1', label: '上半场', test: (m) => period(m) === 1 }, { key: '2', label: '下半场', test: (m) => period(m) === 2 }],
}

export function facetsFor(section: Section, data: MatchData): Facet[] {
  switch (section.key) {
    case 'shots':
      return [
        { key: 'result', label: '结果', options: [all(), shot('goal', '进球', (m) => m.goal), shot('on', '射正', (m) => m.onTarget), shot('off', '没射正', (m) => !m.onTarget)] },
        {
          key: 'how',
          label: '方式',
          options: [
            all(),
            shot('box', '禁区内', (m) => m.inBox),
            shot('outside', '禁区外', (m) => !m.inBox),
            shot('head', '头球', (m) => m.header),
            shot('set', '定位球', (m) => m.setPiece),
            shot('fast', '反击', (m) => m.fastBreak),
          ],
        },
        HALF,
      ]
    case 'entries':
      return [
        {
          key: 'lane',
          label: '路线',
          options: [all('汇总'), ...(['left', 'center', 'right'] as const).map((l) => arrow(l, LANE_ZH[l], (m) => m.entry && m.lane === l))],
        },
        { key: 'result', label: '结果', options: [all(), arrow('ok', '成功', (m) => m.ok), arrow('fail', '失败', (m) => !m.ok)] },
        {
          key: 'how',
          label: '方式',
          options: [all(), arrow('box', '传进禁区', (m) => m.key), arrow('long', '长传', (m) => m.how === 'long'), arrow('through', '直塞', (m) => m.how === 'through'), arrow('cross', '传中', (m) => m.how === 'cross')],
        },
        HALF,
      ]
    case 'crosses':
      return [
        { key: 'side', label: '一侧', options: [all(), arrow('left', '左路', (m) => m.lane === 'left'), arrow('right', '右路', (m) => m.lane === 'right')] },
        { key: 'result', label: '结果', options: [all(), arrow('ok', '成功', (m) => m.ok), arrow('fail', '失败', (m) => !m.ok), arrow('shot', '形成射门', (m) => m.key)] },
        HALF,
      ]
    case 'network': {
      const nodes = section.marks.flatMap((m) => (m.kind === 'node' ? [m] : [])).sort((a, b) => b.count - a.count)
      return [
        {
          key: 'player',
          label: '球员',
          options: [
            all(),
            ...nodes.map((n) => ({
              key: n.playerId,
              label: `#${data.players[n.playerId]?.number ?? ''} ${data.players[n.playerId]?.nameZh ?? ''}`,
              test: (m: Mark) => (m.kind === 'edge' ? m.a === n.playerId || m.b === n.playerId : m.kind === 'node' && m.playerId === n.playerId),
            })),
          ],
        },
      ]
    }
    default:
      return [HALF]
  }
}

const chosen = (f: Facet, sel: Selection) => f.options.find((o) => o.key === (sel[f.key] ?? 'all')) ?? f.options[0]

export function visibleMarks(section: Section, facets: Facet[], sel: Selection): Mark[] {
  return section.marks.filter((m) => facets.every((f) => chosen(f, sel).test(m)))
}

/** How many events the page would show if this option were picked, keeping the other picks. */
export function optionCount(section: Section, facets: Facet[], sel: Selection, facet: Facet, option: Option): number {
  if (section.key === 'network') {
    const node = section.marks.find((m) => m.kind === 'node' && m.playerId === option.key)
    return node && node.kind === 'node' ? node.count : section.marks.reduce((n, m) => n + (m.kind === 'node' ? m.count : 0), 0)
  }
  return section.marks.filter((m) => facets.every((f) => (f.key === facet.key ? option : chosen(f, sel)).test(m))).length
}

export function selectionLabel(facets: Facet[], sel: Selection): string {
  return facets
    .map((f) => chosen(f, sel))
    .filter((o) => o.key !== 'all')
    .map((o) => o.label)
    .join(' · ')
}

export const visibleEids = (marks: Mark[]) => [...new Set(marks.flatMap(markEids))]

export function inHalf(data: MatchData, eids: string[], half: Half): string[] {
  return half === 'all' ? eids : eids.filter((id) => data.events[id]?.period === Number(half))
}

export function valueIn(data: MatchData, c: Count, format: Metric['format'], half: Half): number {
  if (format === 'pct') {
    const total = inHalf(data, c.eids, half).length
    return total ? inHalf(data, c.okEids ?? [], half).length / total : 0
  }
  return half === 'all' ? c.value : inHalf(data, c.eids, half).length
}

/** Entries metrics that are better read as the three-lane summary than as single arrows. */
export const summaryMetric = (section: Section, metricKey: string) =>
  section.summary ? section.summary.metrics.includes(metricKey) : section.key === 'entries' && (metricKey === 'entries' || metricKey === 'entry_rate')

function stateOf(data: MatchData, eventId: string, teamId: string): GameState | null {
  const e = data.events[eventId]
  if (!e) return null
  const diff = teamId === data.match.homeId ? e.score[0] - e.score[1] : e.score[1] - e.score[0]
  return diff > 0 ? 'lead' : diff < 0 ? 'trail' : 'draw'
}

export function inScope(data: MatchData, eids: string[], scope: Scope, teamId: string): string[] {
  return eids.filter((id) => {
    const e = data.events[id]
    if (!e) return false
    if (scope.half !== 'all' && e.period !== Number(scope.half)) return false
    return scope.state === 'all' || stateOf(data, id, teamId) === scope.state
  })
}

/** A span row's clips in the current half and score state, read from each row's anchor event. */
export function scopedSpans(data: MatchData, c: Count | null, scope: Scope, teamId: string): Span[] {
  if (!c?.spans) return []
  const keep = new Set(inScope(data, c.eids, scope, teamId))
  return c.spans.filter((_, i) => keep.has(c.eids[i]))
}

export function scopedValue(data: MatchData, m: Metric, side: 'team' | 'opp', scope: Scope, teamId: string): number {
  const c = side === 'team' ? m.team : m.opp
  if (!c) return 0
  const n = (x: Count | null) => (x ? inScope(data, x.eids, scope, teamId).length : 0)
  if (m.format === 'ratio') {
    return inScope(data, c.numEids ?? [], scope, teamId).length / Math.max(1, n(c))
  }
  if (m.format === 'meters') {
    const ids = inScope(data, c.eids, scope, teamId)
    return ids.length ? (ids.reduce((sum, id) => sum + data.events[id].x, 0) / ids.length) * 1.05 : 0
  }
  if (m.format === 'share') {
    const total = n(m.team) + n(m.opp)
    return total ? n(c) / total : 0
  }
  if (m.format === 'pct') {
    const total = n(c)
    return total ? inScope(data, c.okEids ?? [], scope, teamId).length / total : 0
  }
  return n(c)
}

/** Whether the analysed team was ever leading / level / behind, so empty choices can be greyed out. */
export function statesSeen(data: MatchData, teamId: string): Set<GameState> {
  const seen = new Set<GameState>(['all'])
  for (const id of Object.keys(data.events)) {
    const s = stateOf(data, id, teamId)
    if (s) seen.add(s)
  }
  return seen
}
