export default function SummaryCards({ data }) {
  const total = data.length
  const byStatus = data.reduce((acc, row) => {
    const s = row['Trạng thái'] || 'Không rõ'
    acc[s] = (acc[s] || 0) + 1
    return acc
  }, {})

  const totalCOD = data.reduce((sum, row) => {
    const v = (row['Thu hộ'] || '0').replace(/[^0-9]/g, '')
    return sum + (parseInt(v) || 0)
  }, 0)

  const formatMoney = n => n.toLocaleString('vi-VN') + ' đ'

  const cards = [
    { label: 'Tổng đơn', value: total, color: 'bg-blue-50 border-blue-200', text: 'text-blue-700' },
    { label: 'Đang chuyển', value: byStatus['Đang chuyển'] || 0, color: 'bg-orange-50 border-orange-200', text: 'text-orange-700' },
    { label: 'Đã giao', value: byStatus['Đã giao'] || 0, color: 'bg-green-50 border-green-200', text: 'text-green-700' },
    { label: 'Hoàn hàng', value: byStatus['Hoàn hàng'] || 0, color: 'bg-red-50 border-red-200', text: 'text-red-700' },
    { label: 'Tổng COD', value: formatMoney(totalCOD), color: 'bg-purple-50 border-purple-200', text: 'text-purple-700' },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
      {cards.map(c => (
        <div key={c.label} className={`rounded-xl border p-3 ${c.color}`}>
          <div className="text-xs text-gray-500 mb-1">{c.label}</div>
          <div className={`text-xl font-bold ${c.text}`}>{c.value}</div>
        </div>
      ))}
    </div>
  )
}
