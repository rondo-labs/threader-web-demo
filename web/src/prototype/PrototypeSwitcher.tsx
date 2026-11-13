// PROTOTYPE: floating bar for flipping between UI variants (?variant=). Never rendered in production builds.
import { useEffect } from 'react'

export interface VariantInfo { key: string; name: string }

export function PrototypeSwitcher({ variants, current, onChange }: { variants: VariantInfo[]; current: string; onChange: (key: string) => void }) {
  const index = Math.max(0, variants.findIndex((v) => v.key === current))
  const step = (delta: number) => onChange(variants[(index + delta + variants.length) % variants.length].key)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, video, [contenteditable="true"]')) return
      if (e.key === 'ArrowLeft') step(-1)
      if (e.key === 'ArrowRight') step(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (import.meta.env.PROD) return null
  const v = variants[index]
  return (
    <div className="proto-switcher" role="toolbar" aria-label="切换原型方案">
      <button onClick={() => step(-1)} aria-label="上一个方案">‹</button>
      <span>
        <b>{v.key}</b> {v.name}
      </span>
      <button onClick={() => step(1)} aria-label="下一个方案">›</button>
    </div>
  )
}
