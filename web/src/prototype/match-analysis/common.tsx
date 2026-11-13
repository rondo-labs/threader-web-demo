// PROTOTYPE: small pieces the three layouts share. Layout itself is never shared.
import { playerLabel, playerName } from './clips'
import { Swatch, type Open } from './Pitch'
import type { LegendKey, MatchData, Metric, Section } from './types'

export const CHAPTERS = ['概览', '进攻', '防守', '进攻转换', '防守转换', '定位球']

export interface VariantProps {
  data: MatchData
  teamId: string
  setTeamId: (id: string) => void
}

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

export function MatchHeading({ data, open, compact }: { data: MatchData; open: Open; compact?: boolean }) {
  const { match, teams } = data
  return (
    <div className={`match-heading${compact ? ' is-compact' : ''}`}>
      <div className="t-caption">{`${match.date} · ${match.competition}${match.stage}`}</div>
      <div className="score-line">
        <span className="t-title">{teams[match.homeId].nameZh}</span>
        <span className={compact ? 't-figure' : 't-score'}>{`${match.score[0]}–${match.score[1]}`}</span>
        <span className="t-title">{teams[match.awayId].nameZh}</span>
      </div>
      <div className="goal-chips">
        {data.goals.map((g) => (
          <button
            key={g.eid}
            className="goal-chip"
            title="点开看本场所有进球"
            onClick={() => open('本场进球', data.goals.map((x) => x.eid), g.eid)}
          >
            <span className="t-numeric">{g.clock}</span> {playerName(data, g.playerId)}
            {g.ownGoal ? '（乌龙）' : ''}
          </button>
        ))}
      </div>
    </div>
  )
}

export function TeamToggle({ data, teamId, setTeamId }: VariantProps) {
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

export function ChapterTabs({ current = '进攻', ready = ['进攻'], onChange }: { current?: string; ready?: string[]; onChange?: (c: string) => void }) {
  return (
    <nav className="tabs" aria-label="章">
      {CHAPTERS.map((c) => (
        <button
          key={c}
          aria-current={c === current}
          disabled={!ready.includes(c)}
          title={ready.includes(c) ? undefined : '原型还没做这一章'}
          onClick={() => onChange?.(c)}
        >
          {c}
        </button>
      ))}
    </nav>
  )
}

interface ValueProps { value: number; format: Metric['format']; eids: string[]; title: string; open: Open; size: 'xl' | 'lg' | 'md' | 'sm'; muted?: boolean }

export function ValueButton({ value, format, eids, title, open, size, muted }: ValueProps) {
  return (
    <button
      className={`val val-${size}${muted ? ' muted' : ''}`}
      disabled={!eids.length}
      title={eids.length ? '点开看视频' : '没有可播放的片段'}
      onClick={() => open(title, eids)}
    >
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
          {k === 'key' || k === 'key_dot' ? (section.keyLabel ?? (section.key === 'entries' ? '传进禁区' : '形成射门')) : section.legendText?.[k] ?? LEGEND_TEXT[k]}
        </span>
      ))}
    </div>
  )
}

export function Leaders({ data, section, teamName, open }: { data: MatchData; section: Section; teamName: string; open: Open }) {
  return (
    <div className="leaders">
      <div className="t-label">{section.leadersLabel}</div>
      <ol>
        {section.leaders.map((l) => (
          <li key={l.playerId}>
            <button className="leader-row" onClick={() => open(`${teamName} · ${playerLabel(data, l.playerId)} · ${section.title}`, l.eids)}>
              <span>{playerLabel(data, l.playerId)}</span>
              <span className="t-caption">{l.extra}</span>
              <span className="t-numeric">{l.value}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function Readings({ section }: { section: Section }) {
  return (
    <div className="readings-block">
      <div className="t-label">读数</div>
      <ul className="readings t-lead">
        {section.readings.filter(Boolean).map((r) => (
          <li key={r}>{r}</li>
        ))}
        {section.note && <li className="t-caption">{section.note}</li>}
      </ul>
    </div>
  )
}
