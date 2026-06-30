import { STATUS_COLORS } from '../config'

export default function StatusBadge({ status }) {
  const cls = STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${cls}`}>
      {status || '—'}
    </span>
  )
}
