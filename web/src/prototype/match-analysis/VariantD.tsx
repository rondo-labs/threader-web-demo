// PROTOTYPE variant D: A's report with a filter bar above each chart. Facets combine
// (lane × result × kind × half), every option shows how many events it would leave.
import { useMemo, useState } from 'react'
import type { VariantProps } from './common'
import { Legend } from './common'
import { facetsFor, optionCount, selectionLabel, visibleEids, visibleMarks, type Half, type Selection } from './filters'
import { SectionChart } from './Pitch'
import { FacetBar, LeadersFrom, MetricsTable, Report, type Ctx } from './round2'
import type { Section } from './types'

export function VariantD(props: VariantProps) {
  return (
    <Report
      props={props}
      renderSection={(s, ctx) => <SectionD section={s} ctx={ctx} />}
    />
  )
}

function SectionD({ section: s, ctx }: { section: Section; ctx: Ctx }) {
  const facets = useMemo(() => facetsFor(s, ctx.data), [s, ctx.data])
  const [sel, setSel] = useState<Selection>({})
  const marks = visibleMarks(s, facets, sel)
  const eids = visibleEids(marks)
  const half = (sel.half ?? 'all') as Half
  const aggregate = s.key === 'entries' && (sel.lane ?? 'all') === 'all'
  const label = selectionLabel(facets, sel)
  const title = `${ctx.team.nameZh} · ${s.title}${label ? ` · ${label}` : ''}`
  const count = s.key === 'network' ? eids.length : marks.length
  return (
    <div className="va-grid">
      <div className="va-chart-col">
        <FacetBar facets={facets} sel={sel} setSel={setSel} count={(f, o) => optionCount(s, facets, sel, f, o)} />
        <div className="filter-line">
          <span className="t-heading">{label || (aggregate ? '汇总' : '全部')}</span>
          <span className="t-caption">{`${count} 次`}</span>
          <button className="btn" disabled={!eids.length} onClick={() => ctx.open(title, eids)}>{`播放这 ${count} 次`}</button>
          {label && (
            <button className="btn-quiet" onClick={() => setSel({})}>
              清除筛选
            </button>
          )}
        </div>
        <SectionChart
          data={ctx.data}
          section={s}
          teamName={ctx.team.nameZh}
          focus={ctx.focus}
          open={ctx.open}
          only={new Set(eids)}
          aggregate={aggregate}
          onDrill={(lane) => setSel({ ...sel, lane })}
          laneTags={false}
          playTitle={title}
        />
        <Legend section={s} />
      </div>
      <div className="va-data">
        <MetricsTable section={s} ctx={ctx} scope={{ half, state: 'all' }} />
        <LeadersFrom ctx={ctx} eids={eids} label={label ? `${label}：谁最多` : s.leadersLabel} />
      </div>
    </div>
  )
}
