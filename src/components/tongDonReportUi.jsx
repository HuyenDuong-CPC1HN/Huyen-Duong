// Các component UI dùng chung cho 2 báo cáo "Đơn sàn" và "Đơn truyền thống" (tab Tổng Đơn) — tách riêng để
// không lặp lại giữa TongDonReportDonSan.jsx và TongDonReportDonTruyenThong.jsx. Hàm định dạng/số liệu thuần
// nằm ở src/utils/tongDonReportFormat.js (tách riêng khỏi file này để không phá fast-refresh).
import { fmtInt, pctOf } from '../utils/tongDonReportFormat'

export function TdrStack({ segments }) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  if (total === 0) return <div className="tdr-stack" />
  return (
    <div className="tdr-stack">
      {segments.map((s) => s.value > 0 && (
        <div key={s.label} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} />
      ))}
    </div>
  )
}

export function TdrLegend({ segments, total, extra }) {
  return (
    <div className="tdr-legend">
      {segments.map((s) => (
        <span key={s.label}><span className="tdr-sq" style={{ background: s.color }} />{s.label}{total ? ` (${pctOf(s.value, total)}%)` : ''}</span>
      ))}
      {extra}
    </div>
  )
}

export function EditableText({ value, onChange, rows = 3, className }) {
  if (!onChange) return <p className={className}>{value}</p>
  return <textarea className={`${className} tdr-editable`} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
}

export function KpiCard({ label, cur, prev, curFmt, prevFmt, deltaText, good }) {
  return (
    <div className="tdr-kpi-card">
      <div className="tdr-kpi-label">{label}</div>
      <div className="tdr-kpi-values">
        <span className="tdr-kpi-cur">{curFmt ?? fmtInt(cur)}</span>
        <span className="tdr-kpi-prev">/ {prevFmt ?? fmtInt(prev)}</span>
      </div>
      <div className={`tdr-kpi-delta ${good ? 'up' : 'down'}`}>{deltaText}</div>
    </div>
  )
}

export function InsightCard({ tone, tag, title, body, onBodyChange }) {
  return (
    <div className={`tdr-insight-card tone-${tone}`}>
      <span className="tdr-insight-tag">{tag}</span>
      <p className="tdr-insight-title">{title}</p>
      <EditableText className="tdr-insight-body" value={body} onChange={onBodyChange} />
    </div>
  )
}

export function VerdictBox({ text, onChange }) {
  return (
    <div className="tdr-verdict">
      <div className="tdr-verdict-tag">✓ KẾT LUẬN</div>
      <EditableText className="tdr-verdict-text" value={text} onChange={onChange} rows={4} />
    </div>
  )
}

export function PlanItem({ num, text, onChange, priority, priorityLabel }) {
  return (
    <div className="tdr-plan-item">
      <span className="tdr-plan-num">{String(num).padStart(2, '0')}</span>
      <EditableText className="tdr-plan-body" value={text} onChange={onChange} rows={2} />
      <span className={`tdr-plan-pill ${priority}`}>{priorityLabel}</span>
    </div>
  )
}
