// Small pieces of the match-analysis page: heading, team toggle, chapter tabs, clickable numbers, legend.
import { playerName } from './clips'
import { Swatch, type Open } from './Pitch'
import type { LegendKey, MatchData, Metric, Section } from './types'

export const CHAPTERS = [
  { key: 'overview', zh: '概览' },
  { key: 'attack', zh: '进攻' },
  { key: 'defence', zh: '防守' },
  { key: 'attack-transition', zh: '进攻转换' },
  { key: 'defence-transition', zh: '防守转换' },
  { key: 'set-pieces', zh: '定位球' },
] as const
export type ChapterKey = (typeof CHAPTERS)[number]['key']
export const isChapter = (k: string | null): k is ChapterKey => CHAPTERS.some((c) => c.key === k)

export function sides(data: MatchData, teamId: string) {
  const oppId = teamId === data.match.homeId ? data.match.awayId : data.match.homeId
  return { team: data.teams[teamId], opp: data.teams[oppId] }
}

export const fmtValue = (value: number, format: Metric['format']) =>
  format === 'pct' || format === 'share'
    ? `${Math.round(value * 100)}%`
    : format === 'ratio'
      ? value.toFixed(1)
      : format === 'meters'
        ? `${Math.round(value)} 米`
        : `${value}`

export function MatchHeading({ data, open }: { data: MatchData; open: Open }) {
  const { match, teams } = data
  const playable = data.video.available
  return (
    <div className="match-heading">
      <div className="t-caption">
        <a className="back-link" href="/">全部比赛</a>
        {` · ${match.date} · ${match.competition}${match.stage}`}
      </div>
      <div className="score-line">
        <span className="t-title">{teams[match.homeId].nameZh}</span>
        <span className="t-score">{`${match.score[0]}–${match.score[1]}`}</span>
        <span className="t-title">{teams[match.awayId].nameZh}</span>
      </div>
      <div className="goal-chips">
        {data.goals.map((g) => {
          const label = (
            <>
              <span className="t-numeric">{g.clock}</span> {playerName(data, g.playerId)}
              {g.ownGoal ? '（乌龙）' : ''}
            </>
          )
          return playable ? (
            <button key={g.eid} className="goal-chip" title="点开看本场所有进球" onClick={() => open('本场进球', data.goals.map((x) => x.eid), g.eid)}>
              {label}
            </button>
          ) : (
            <span key={g.eid} className="goal-chip is-static">
              {label}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export function TeamToggle({ data, teamId, setTeamId }: { data: MatchData; teamId: string; setTeamId: (id: string) => void }) {
  return (
    <div className="seg" role="group" aria-label="分析对象">
      {[data.match.homeId, data.match.awayId].map((id) => (
        <button key={id} aria-pressed={id === teamId} onClick={() => setTeamId(id)}>
          {data.teams[id].nameZh}
        </button>
      ))}
    </div>
  )
}

export function ChapterTabs({ current, onChange }: { current: ChapterKey; onChange: (c: ChapterKey) => void }) {
  return (
    <nav className="tabs" aria-label="章">
      {CHAPTERS.map((c) => (
        <button key={c.key} aria-current={c.key === current} onClick={() => onChange(c.key)}>
          {c.zh}
        </button>
      ))}
    </nav>
  )
}

interface ValueProps { value: number; format: Metric['format']; eids: string[]; title: string; open: Open; size: 'lg' | 'md' | 'sm'; muted?: boolean; playable: boolean }

/** A number that plays the events behind it; plain text when the match has no video. */
export function ValueButton({ value, format, eids, title, open, size, muted, playable }: ValueProps) {
  const cls = `val val-${size}${muted ? ' muted' : ''}`
  if (!playable) return <span className={`${cls} is-static`}>{fmtValue(value, format)}</span>
  return (
    <button className={cls} disabled={!eids.length} title={eids.length ? '点开看视频' : '没有可播放的片段'} onClick={() => open(title, eids)}>
      {fmtValue(value, format)}
    </button>
  )
}

const LEGEND_TEXT: Record<LegendKey, string> = {
  goal: '进球',
  on: '射正',
  off: '射偏',
  blocked: '被封堵',
  big: '大圈：绝佳机会',
  ok: '成功',
  fail: '失败',
  key: '',
  node: '首发球员，越大传球越多',
  edge: '两人互传，越粗次数越多',
  us: '本队',
  them: '对手',
  act_ok: '成功的防守动作',
  act_fail: '被过、犯规',
  them_pass: '对手的传球',
  them_shot: '对手射门',
  key_dot: '',
}

export function Legend({ section }: { section: Section }) {
  return (
    <div className="legend t-caption">
      {section.legend.map((k) => (
        <span key={k} className="legend-item">
          <Swatch kind={k} />
          {k === 'key' || k === 'key_dot' ? (section.keyLabel ?? '形成射门') : (section.legendText?.[k] ?? LEGEND_TEXT[k])}
        </span>
      ))}
    </div>
  )
}
