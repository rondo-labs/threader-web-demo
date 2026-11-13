// PROTOTYPE variant E: A's report, with C's small multiples turned into a picker under the big chart.
// Every kind is visible at a glance; the one you pick is drawn large.
import { useState } from 'react'
import type { VariantProps } from './common'
import { fmtValue } from './common'
import { inHalf, summaryMetric, valueIn, type Half } from './filters'
import { SectionChart } from './Pitch'
import { HALF_ZH, HalfToggle, LeadersFrom, MetricsTable, Report, type Ctx } from './round2'
import type { Section } from './types'

export function VariantE(props: VariantProps) {
  return (
    <Report
      props={props}
      renderSection={(s, ctx) => <SectionE section={s} ctx={ctx} />}
    />
  )
}

function SectionE({ section: s, ctx }: { section: Section; ctx: Ctx }) {
  const [key, setKey] = useState(s.metrics[0].key)
  const [half, setHalf] = useState<Half>('all')
  const metric = s.metrics.find((m) => m.key === key) ?? s.metrics[0]
  const eids = inHalf(ctx.data, metric.team.eids, half)
  const title = `${ctx.team.nameZh} · ${metric.label}${half === 'all' ? '' : ` · ${HALF_ZH[half]}`}`
  return (
    <div className="va-grid">
      <div className="va-chart-col">
        <div className="filter-line">
          <span className="t-heading">{metric.label}</span>
          <span className="t-caption">
            {metric.format === 'pct'
              ? `${fmtValue(valueIn(ctx.data, metric.team, metric.format, half), 'pct')}（${eids.length} 次尝试）`
              : `${eids.length} 次`}
          </span>
          <button className="btn" disabled={!eids.length} onClick={() => ctx.open(title, eids)}>{`播放这 ${eids.length} 次`}</button>
          <HalfToggle half={half} setHalf={setHalf} />
        </div>
        <SectionChart
          data={ctx.data}
          section={s}
          teamName={ctx.team.nameZh}
          focus={ctx.focus}
          open={ctx.open}
          only={new Set(eids)}
          aggregate={summaryMetric(s, metric.key)}
          onDrill={(lane) => setKey(`lane_${lane}`)}
          laneTags={false}
          playTitle={title}
        />
        <div className="thumbs" role="group" aria-label="选一类">
          {s.metrics.map((m) => {
            const ids = inHalf(ctx.data, m.team.eids, half)
            return (
              <button key={m.key} className={`thumb${m.key === metric.key ? ' is-selected' : ''}`} disabled={!ids.length} onClick={() => setKey(m.key)}>
                <SectionChart data={ctx.data} section={s} teamName={ctx.team.nameZh} focus={null} open={ctx.open} only={new Set(ids)} mini aggregate={summaryMetric(s, m.key)} />
                <span className="thumb-label t-caption">{m.label}</span>
                <span className="t-numeric">{fmtValue(valueIn(ctx.data, m.team, m.format, half), m.format)}</span>
              </button>
            )
          })}
        </div>
      </div>
      <div className="va-data">
        <MetricsTable section={s} ctx={ctx} scope={{ half, state: 'all' }} selected={metric.key} />
        <LeadersFrom ctx={ctx} eids={eids} label={`${metric.label}：谁最多`} />
      </div>
    </div>
  )
}
