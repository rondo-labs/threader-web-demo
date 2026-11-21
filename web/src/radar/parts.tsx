// Pieces both radar pages share: the page's own views as tabs under the header, the bar that takes the radar's place
// at the top once it scrolls away, the head of whatever the radar opened, the filter for which matches count, and a row
// name whose definition shows on hover.
import type { ReactNode } from 'react'
import { FILTERS, type Filter } from '../team/data'
import { Info, MiniRadar } from './charts'
import type { Axis } from './axis'

export interface BarLink { key: string; label: string; rank?: string; on: boolean; onClick: () => void }

/** The radar in small with every corner as a button: always one click from any part of the page. */
export function StickyBar({ show, axes, current, name, links }: { show: boolean; axes: Axis[]; current: number | null; name: string; links: BarLink[] }) {
  return (
    <div className={`rd-sticky${show ? ' is-on' : ''}`} aria-hidden={!show}>
      <button className="rd-sticky-mini" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} title="回到雷达" tabIndex={show ? 0 : -1}>
        <MiniRadar axes={axes} selected={current} />
      </button>
      <span className="rd-sticky-name">{name}</span>
      <nav className="rd-sticky-links">
        {links.map((l) => (
          <button key={l.key} aria-current={l.on} onClick={l.onClick} tabIndex={show ? 0 : -1}>
            {l.label}
            {l.rank && <span className="t-numeric">{l.rank}</span>}
          </button>
        ))}
      </nav>
    </div>
  )
}

/** The head of what the radar opened: its name, where it stands, and on the right the controls that apply to it. */
export function Head({ title, info, children, extra }: { title: string; info?: string | null; children?: ReactNode; extra?: ReactNode }) {
  return (
    <div className="rd-head">
      <h2 className="rd-head-title">{title}<Info text={info} /></h2>
      {children}
      {extra && <div className="rd-head-extra">{extra}</div>}
    </div>
  )
}

export function FilterSeg({ filter, setFilter }: { filter: Filter; setFilter: (f: Filter) => void }) {
  return (
    <div className="seg seg-sm" role="group" aria-label="哪些比赛">
      {FILTERS.map(([k, zh]) => <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>{zh}</button>)}
    </div>
  )
}

/** The page's own views (the radar's analysis, the fixtures, the squad…), as a row of tabs under the header. */
export function PageTabs({ tabs, current, onPick }: { tabs: [string, string][]; current: string; onPick: (key: string) => void }) {
  return (
    <nav className="tabs rd-pagetabs" aria-label="页面">
      {tabs.map(([k, zh]) => <button key={k} aria-current={current === k} onClick={() => onPick(k)}>{zh}</button>)}
    </nav>
  )
}

/** A row name whose definition shows on hover instead of on a second grey line. */
export function Defined({ label, hint }: { label: string; hint: string | null | undefined }) {
  return hint ? <span className="rd-defined" title={hint}>{label}</span> : <>{label}</>
}
