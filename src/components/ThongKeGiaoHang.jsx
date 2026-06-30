import { useMemo, useState } from 'react'
import { Truck, CheckCircle, Clock, RotateCcw, XCircle, AlertCircle, Package, Users, Pencil, Check } from 'lucide-react'

function parseDate(str) {
  if (!str || str === '—') return null
  const parts = str.trim().split('/')
  if (parts.length !== 3) return null
  const [d, m, y] = parts
  const dt = new Date(+y, +m - 1, +d)
  return isNaN(dt) ? null : dt
}

function diffDays(from, to) {
  if (!from || !to) return null
  return Math.floor((to - from) / (1000 * 60 * 60 * 24))
}

const STAT_COLS = [
  { key: '24h',      label: '≤ 24 giờ',      icon: CheckCircle, cls: 'text-green-600',  bg: 'bg-green-50 border-green-200' },
  { key: '48h',      label: '≤ 48 giờ',       icon: CheckCircle, cls: 'text-teal-600',   bg: 'bg-teal-50 border-teal-200' },
  { key: '72h',      label: '≤ 72 giờ',       icon: Clock,       cls: 'text-blue-600',   bg: 'bg-blue-50 border-blue-200' },
  { key: 'chuaGiao', label: 'Chưa giao',      icon: AlertCircle, cls: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200' },
  { key: 'giaoLai',  label: 'Giao lại lần 2', icon: RotateCcw,   cls: 'text-orange-600', bg: 'bg-orange-50 border-orange-200' },
  { key: 'hoanHang', label: 'Hoàn hàng',      icon: XCircle,     cls: 'text-red-600',    bg: 'bg-red-50 border-red-200' },
]

function calcStats(rows) {
  const result = { total: rows.length, '24h': 0, '48h': 0, '72h': 0, chuaGiao: 0, giaoLai: 0, hoanHang: 0, chuaGiaoRows: [] }
  for (const row of rows) {
    const status   = (row['Trạng thái'] || '').trim()
    const ghiChu   = (row['Ghi chú check'] || '').toLowerCase()
    const ngayTao  = parseDate(row['Ngày tạo kiện'])
    const ngayGiao = parseDate(row['Ngày giao hàng'])

    if (status === 'Hoàn hàng') { result.hoanHang++; continue }

    const isGiaoLai = ghiChu.includes('lần 2') || ghiChu.includes('giao lại') || ghiChu.includes('giao lai')
    if (isGiaoLai) { result.giaoLai++; continue }

    if (!ngayGiao || status === 'Đang chuyển' || status === 'Chờ xử lý' || !status) {
      result.chuaGiao++; result.chuaGiaoRows.push(row); continue
    }

    const days = diffDays(ngayTao, ngayGiao)
    if (days === null)  { result.chuaGiao++; result.chuaGiaoRows.push(row) }
    else if (days <= 1) { result['24h']++ }
    else if (days <= 2) { result['48h']++ }
    else if (days <= 3) { result['72h']++ }
    else                { result.chuaGiao++; result.chuaGiaoRows.push(row) }
  }
  return result
}

// Phân loại khách hàng theo tên
const KH_TYPES = {
  donC: [
    { key: 'bv',     label: 'Bệnh viện',         match: n => /bệnh viện|benh vien|\bbv\b/i.test(n) },
    { key: 'nt',     label: 'Nhà thuốc',          match: n => /nhà thuốc|nha thuoc|\bnt\b/i.test(n) },
    { key: 'onl',    label: 'KH ONL / Khách lẻ',  match: () => true }, // fallback
  ],
  donDTP: [
    { key: 'nt',     label: 'Nhà thuốc',          match: n => /nhà thuốc|nha thuoc|\bnt\b/i.test(n) },
    { key: 'pk',     label: 'Phòng khám',          match: n => /phòng khám|phong kham|\bpk\b/i.test(n) },
    { key: 'onl',    label: 'KH ONL / Khách lẻ',  match: () => true }, // fallback
  ],
}

const KH_COLORS = {
  bv:  { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700' },
  nt:  { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700' },
  pk:  { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700' },
  onl: { bg: 'bg-gray-50',   border: 'border-gray-200',   text: 'text-gray-600' },
}

function ChuaGiaoBreakdown({ type, storageKey }) {
  const khTypes = KH_TYPES[type] || []
  const lsKey = `chuagiao_kh_${storageKey}`

  const [values, setValues] = useState(() => {
    try { return JSON.parse(localStorage.getItem(lsKey) || '{}') } catch { return {} }
  })

  const handleChange = (key, val) => {
    const next = { ...values, [key]: val }
    setValues(next)
    localStorage.setItem(lsKey, JSON.stringify(next))
  }

  return (
    <div className="mt-3 pt-3 border-t border-yellow-100">
      <div className="flex items-center gap-1.5 mb-2">
        <Users size={13} className="text-yellow-600" />
        <span className="text-xs font-medium text-yellow-700">Phân loại đơn chưa giao theo khách hàng</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {khTypes.map(t => {
          const c = KH_COLORS[t.key] || KH_COLORS.onl
          return (
            <div key={t.key} className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg border ${c.bg} ${c.border}`}>
              <span className={`text-xs font-medium ${c.text}`}>{t.label}</span>
              <input
                type="number"
                min="0"
                value={values[t.key] ?? ''}
                onChange={e => handleChange(t.key, e.target.value)}
                className={`w-16 text-center text-lg font-bold bg-transparent border-b-2 ${c.border} focus:outline-none focus:border-blue-400`}
                placeholder="0"
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

const COLS_DIRECT  = ['24h', '48h', '72h', 'chuaGiao']
const COLS_PARTNER = ['24h', '48h', '72h', 'chuaGiao', 'giaoLai', 'hoanHang']
const LABEL_PARTNER = { chuaGiao: 'Đang vận chuyển' }

export const PARTNERS = {
  donC: [
    { key: 'tructIep',    label: 'Giao hàng trực tiếp',    match: r => ['trực tiếp','truc tiep'].some(k => (r['Đối tác vận chuyển']||'').toLowerCase().includes(k)), detailed: true,  cols: COLS_DIRECT,  showKhBreakdown: true },
    { key: 'chanhXe',     label: 'Giao hàng qua chành xe', match: r => ['chành','chanh'].some(k => (r['Đối tác vận chuyển']||'').toLowerCase().includes(k)),           detailed: false, cols: [] },
    { key: 'viettelPost', label: 'Viettel Post',            match: r => (r['Đối tác vận chuyển']||'').toLowerCase().includes('viettel'),                                detailed: true,  cols: COLS_PARTNER, labelMap: LABEL_PARTNER },
    { key: 'spx',         label: 'SPX Express',             match: r => (r['Đối tác vận chuyển']||'').toLowerCase().includes('spx'),                                    detailed: true,  cols: COLS_PARTNER, labelMap: LABEL_PARTNER },
  ],
  donDTP: [
    { key: 'tructIep',    label: 'Giao hàng trực tiếp',    match: r => ['trực tiếp','truc tiep'].some(k => (r['Đối tác vận chuyển']||'').toLowerCase().includes(k)), detailed: true,  cols: COLS_DIRECT,  showKhBreakdown: true },
    { key: 'viettelPost', label: 'Viettel Post',            match: r => (r['Đối tác vận chuyển']||'').toLowerCase().includes('viettel'),                                detailed: true,  cols: COLS_PARTNER, labelMap: LABEL_PARTNER },
  ],
}

export default function ThongKeGiaoHang({ data, type }) {
  const partners = PARTNERS[type] || []

  const groups = useMemo(() => {
    return partners.map(p => {
      const rows = data.filter(r => p.match(r))
      return { ...p, rows, stats: p.detailed ? calcStats(rows) : null }
    })
  }, [data, type])

  const unmatched = useMemo(() => {
    return data.filter(row => !partners.some(p => p.match(row)))
  }, [data, type])

  return (
    <div className="space-y-4">
      {groups.map(g => (
        <div key={g.key} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200">
            <Truck size={16} className="text-gray-500" />
            <span className="font-semibold text-gray-700">{g.label}</span>
            <span className="ml-auto bg-[#1e3a5f] text-white text-xs font-bold px-2.5 py-1 rounded-full">{g.rows.length} đơn</span>
          </div>

          {!g.detailed && (
            <div className="px-5 py-4 text-sm text-gray-500 flex items-center gap-2">
              <Package size={15} className="text-gray-400" />
              Tổng số đơn đã gửi qua chành: <strong className="text-gray-800 ml-1">{g.rows.length} đơn</strong>
            </div>
          )}

          {g.detailed && (
            <div className="p-4">
              {g.stats && (
                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: `repeat(${g.cols.length}, minmax(0, 1fr))` }}>
                  {STAT_COLS.filter(col => g.cols.includes(col.key)).map(col => {
                    const Icon = col.icon
                    const val = g.stats[col.key]
                    const label = (g.labelMap && g.labelMap[col.key]) || col.label
                    return (
                      <div key={col.key} className={`rounded-xl border p-3 ${col.bg} text-center`}>
                        <Icon size={16} className={`${col.cls} mx-auto mb-1`} />
                        <div className={`text-xl font-bold ${col.cls}`}>{val}</div>
                        <div className="text-xs text-gray-500 mt-0.5 leading-tight">{label}</div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Phân loại khách hàng chưa giao — chỉ giao trực tiếp */}
              {g.showKhBreakdown && (
                <ChuaGiaoBreakdown type={type} storageKey={`${type}_${g.key}`} />
              )}

              {g.stats && g.rows.length > 0 && (() => {
                const delivered = g.stats['24h'] + g.stats['48h'] + g.stats['72h']
                const pct = Math.round((delivered / g.rows.length) * 100)
                return (
                  <div className="mt-3 flex items-center gap-3">
                    <span className="text-xs text-gray-500 whitespace-nowrap">Tỷ lệ giao thành công</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-bold text-green-700 whitespace-nowrap">{pct}%</span>
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      ))}

      {unmatched.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200">
            <span className="text-sm text-gray-500 font-medium">Đối tác khác / Chưa phân loại</span>
            <span className="ml-auto bg-gray-400 text-white text-xs font-bold px-2.5 py-1 rounded-full">{unmatched.length} đơn</span>
          </div>
          <div className="p-4">
            {(() => {
              const st = calcStats(unmatched)
              return (
                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}>
                  {STAT_COLS.map(col => {
                    const Icon = col.icon
                    return (
                      <div key={col.key} className={`rounded-xl border p-3 ${col.bg} text-center`}>
                        <Icon size={16} className={`${col.cls} mx-auto mb-1`} />
                        <div className={`text-xl font-bold ${col.cls}`}>{st[col.key]}</div>
                        <div className="text-xs text-gray-500 mt-0.5 leading-tight">{col.label}</div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
