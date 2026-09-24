const STYLES = {
  same: ['Cùng lô', 'bg-green-100 text-green-700'],
  diff: ['Khác lô', 'bg-amber-100 text-amber-700'],
  empty: ['Chưa đủ lô', 'bg-gray-100 text-gray-500 border border-dashed border-gray-300'],
}

export default function SwapReturnLotBadge({ status }) {
  const [label, cls] = STYLES[status] || STYLES.empty
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${cls}`}>{label}</span>
}
