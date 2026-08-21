import { useState, useId } from 'react'
import { Truck, ChevronDown, ChevronUp } from 'lucide-react'

export function KpiTile({ icon: Icon, value, label, sub, pctOfTotal, cls }) {
  return (
    <div className="report-kpi">
      <div className="report-kpi-main">
        <span className={`report-kpi-icon ${cls}`}><Icon size={18} aria-hidden="true" /></span>
        <div className="min-w-0">
          <div className="report-kpi-label">{label}</div>
          <div className={`report-kpi-value ${cls}`}>
            {value.toLocaleString('vi-VN')}
            {pctOfTotal !== undefined && <span>({pctOfTotal}%)</span>}
          </div>
        </div>
      </div>
      {sub && (
        <div className="report-kpi-breakdown">
          {sub.map(s => (
            <div key={s.label}>
              <span>{s.label}</span>
              <strong>{s.value.toLocaleString('vi-VN')} <small>({s.pct}%)</small></strong>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function StatCard({ icon: Icon, value, label, cls, pctOfTotal }) {
  return (
    <div className="report-stat">
      <Icon size={16} className={cls} aria-hidden="true" />
      <div className={`report-stat-value ${cls}`}>
        {value.toLocaleString('vi-VN')}
        {pctOfTotal !== undefined && <span>({pctOfTotal}%)</span>}
      </div>
      <div className="report-stat-label">{label}</div>
    </div>
  )
}

export function OrderBadge({ value }) {
  return (
    <span className="report-section-count">
      {value.toLocaleString('vi-VN')} đơn
    </span>
  )
}

export function SectionCard({ title, total, icon: Icon = Truck, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen)
  const contentId = useId()
  return (
    <section className="report-section">
      <button
        type="button"
        className="report-section-trigger"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls={contentId}
      >
        <Icon size={17} aria-hidden="true" />
        <span className="report-section-title">{title}</span>
        <OrderBadge value={total} />
        {open ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
      </button>
      {open && <div id={contentId} className="report-section-content">{children}</div>}
    </section>
  )
}
