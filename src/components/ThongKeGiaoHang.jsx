import { useMemo, useState, useRef, useEffect } from 'react'
import { Truck, CheckCircle, Clock, RotateCcw, XCircle, AlertCircle, Package, Users, Pencil, Check, ChevronUp, ChevronDown } from 'lucide-react'
import { partnerType } from '../utils/partnerType'
import { deliveryBucket } from '../utils/deliveryDays'

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

// Thống kê riêng cho "Giao hàng trực tiếp" — kế thừa cách tính giống tab Đối tác VC
// (chỉ dựa vào chênh lệch Ngày tạo kiện / Ngày giao hàng, không phụ thuộc Trạng thái)
function calcStatsTrucTiep(rows) {
  const result = { total: rows.length, '24h': 0, '48h': 0, '72h': 0, chuaGiao: 0, giaoLai: 0, hoanHang: 0, chuaGiaoRows: [] }
  for (const row of rows) {
    const bucket = deliveryBucket(row)
    if (bucket === '24')      result['24h']++
    else if (bucket === '48') result['48h']++
    else if (bucket === '72') result['72h']++
    else { result.chuaGiao++; result.chuaGiaoRows.push(row) }
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

function useChuaGiaoOverride(storageKey) {
  const lsKey = `chuagiao_override_${storageKey}`
  const [override, setOverride] = useState(() => {
    const v = localStorage.getItem(lsKey)
    return v === null ? '' : v
  })
  const commit = (v) => {
    setOverride(v)
    if (v === '') localStorage.removeItem(lsKey)
    else localStorage.setItem(lsKey, v)
  }
  return [override, commit]
}

function EditableStatCard({ col, value, override, onCommit, label }) {
  const Icon = col.icon
  const [editing, setEditing] = useState(false)
  const inputRef = useRef()

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const commit = (v) => { onCommit(v); setEditing(false) }

  const displayVal = override !== '' ? override : value

  return (
    <div className={`rounded-xl border p-3 ${col.bg} text-center relative`}>
      <Icon size={16} className={`${col.cls} mx-auto mb-1`} />
      {editing ? (
        <input
          ref={inputRef}
          type="number"
          min="0"
          defaultValue={displayVal}
          onBlur={e => commit(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditing(false) }}
          className={`text-xl font-bold ${col.cls} bg-transparent border-b-2 border-current w-16 text-center focus:outline-none`}
        />
      ) : (
        <div
          onDoubleClick={() => setEditing(true)}
          className={`text-xl font-bold ${col.cls} cursor-pointer`}
          title="Bấm đúp để nhập tay"
        >
          {displayVal}
        </div>
      )}
      <div className="text-xs text-gray-500 mt-0.5 leading-tight">{label}</div>
      {override !== '' && (
        <button
          onClick={() => commit('')}
          className="absolute top-1 right-1 text-[9px] text-gray-400 hover:text-red-500"
          title="Khôi phục số tự động"
        >
          ↺
        </button>
      )}
    </div>
  )
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

const isTrucTiep = row => partnerType(row) === 'tructiep'
const isViettel   = row => partnerType(row) === 'viettel'
const isSpx       = row => partnerType(row) === 'spx'
const isChanhXe   = row => partnerType(row) === 'chanhxe'

export const PARTNERS = {
  donC: [
    { key: 'tructIep',    label: 'Giao hàng trực tiếp',    match: isTrucTiep, detailed: true,  cols: COLS_DIRECT,  showKhBreakdown: true },
    { key: 'chanhXe',     label: 'Giao hàng qua chành xe', match: isChanhXe,  detailed: false, cols: [] },
    { key: 'viettelPost', label: 'Viettel Post',            match: isViettel,  detailed: true,  cols: COLS_PARTNER, labelMap: LABEL_PARTNER },
    { key: 'spx',         label: 'SPX Express',             match: isSpx,      detailed: true,  cols: COLS_PARTNER, labelMap: LABEL_PARTNER },
  ],
  donDTP: [
    { key: 'tructIep',    label: 'Giao hàng trực tiếp',    match: isTrucTiep, detailed: true,  cols: COLS_DIRECT,  showKhBreakdown: true },
    { key: 'viettelPost', label: 'Viettel Post',            match: isViettel,  detailed: true,  cols: COLS_PARTNER, labelMap: LABEL_PARTNER },
  ],
}

function GroupCard({ g, type }) {
  const [override, commitOverride] = useChuaGiaoOverride(`${type}_${g.key}`)
  const [chuaGuiChanh, setChuaGuiChanh] = useChuaGiaoOverride(`${type}_${g.key}_chuagui`)
  const [open, setOpen] = useState(false)

  if (!g.detailed) {
    const chuaGuiVal = chuaGuiChanh !== '' ? Number(chuaGuiChanh) : 0
    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div
          className="flex items-center gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200 cursor-pointer"
          onClick={() => setOpen(o => !o)}
        >
          <Truck size={16} className="text-gray-500" />
          <span className="font-semibold text-gray-700">{g.label}</span>
          <span className="ml-auto bg-[#1e3a5f] text-white text-xs font-bold px-2.5 py-1 rounded-full">{g.rows.length + chuaGuiVal} đơn</span>
          {open ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
        </div>
        {open && (
          <>
            <div className="px-5 py-4 text-sm text-gray-500 flex items-center gap-2">
              <Package size={15} className="text-gray-400" />
              Tổng số đơn đã gửi qua chành: <strong className="text-gray-800 ml-1">{g.rows.length} đơn</strong>
            </div>
            <div className="px-5 pb-4 flex items-center gap-2">
              <label className="text-sm text-gray-500 flex items-center gap-2">
                Số đơn chưa gửi chành:
                <input
                  type="number"
                  min="0"
                  value={chuaGuiChanh}
                  onChange={e => setChuaGuiChanh(e.target.value)}
                  placeholder="0"
                  className="w-20 text-center font-bold text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-yellow-300"
                />
                đơn
              </label>
            </div>
          </>
        )}
      </div>
    )
  }

  const effectiveChuaGiao = override !== '' ? Number(override) : g.stats.chuaGiao
  const totalWithOverride = g.stats['24h'] + g.stats['48h'] + g.stats['72h'] + effectiveChuaGiao
    + (g.cols.includes('giaoLai') ? g.stats.giaoLai : 0)
    + (g.cols.includes('hoanHang') ? g.stats.hoanHang : 0)

  const delivered = g.stats['24h'] + g.stats['48h'] + g.stats['72h']
  const pct = totalWithOverride > 0 ? Math.round((delivered / totalWithOverride) * 100) : 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200">
        <Truck size={16} className="text-gray-500" />
        <span className="font-semibold text-gray-700">{g.label}</span>
        <span className="ml-auto bg-[#1e3a5f] text-white text-xs font-bold px-2.5 py-1 rounded-full">{totalWithOverride} đơn</span>
      </div>

      <div className="p-4">
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: `repeat(${g.cols.length}, minmax(0, 1fr))` }}>
          {STAT_COLS.filter(col => g.cols.includes(col.key)).map(col => {
            const Icon = col.icon
            const val = g.stats[col.key]
            const label = (g.labelMap && g.labelMap[col.key]) || col.label
            if (col.key === 'chuaGiao') {
              return (
                <EditableStatCard
                  key={col.key}
                  col={col}
                  value={val}
                  override={override}
                  onCommit={commitOverride}
                  label={label}
                />
              )
            }
            return (
              <div key={col.key} className={`rounded-xl border p-3 ${col.bg} text-center`}>
                <Icon size={16} className={`${col.cls} mx-auto mb-1`} />
                <div className={`text-xl font-bold ${col.cls}`}>{val}</div>
                <div className="text-xs text-gray-500 mt-0.5 leading-tight">{label}</div>
              </div>
            )
          })}
        </div>

        {/* Phân loại khách hàng chưa giao — chỉ giao trực tiếp */}
        {g.showKhBreakdown && (
          <ChuaGiaoBreakdown type={type} storageKey={`${type}_${g.key}`} />
        )}

        {totalWithOverride > 0 && (() => {
          const chuaGiaoPct = Math.round((effectiveChuaGiao / totalWithOverride) * 100)
          return (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between mb-1.5 text-xs">
                <span className="flex items-center gap-1.5 text-green-700 font-medium">
                  <span className="w-2 h-2 rounded-full bg-green-500" /> Đã giao: {delivered} đơn ({pct}%)
                </span>
                <span className="flex items-center gap-1.5 text-yellow-700 font-medium">
                  Chưa giao: {effectiveChuaGiao} đơn ({chuaGiaoPct}%) <span className="w-2 h-2 rounded-full bg-yellow-400" />
                </span>
              </div>
              <div className="flex bg-gray-100 rounded-full h-2.5 overflow-hidden">
                <div className="h-full bg-green-500" style={{ width: `${pct}%` }} />
                <div className="h-full bg-yellow-400" style={{ width: `${chuaGiaoPct}%` }} />
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}

export default function ThongKeGiaoHang({ data, type }) {
  const partners = PARTNERS[type] || []

  const groups = useMemo(() => {
    return partners.map(p => {
      const rows = data.filter(r => p.match(r))
      const stats = !p.detailed ? null : p.key === 'tructIep' ? calcStatsTrucTiep(rows) : calcStats(rows)
      return { ...p, rows, stats }
    })
  }, [data, type])

  const unmatched = useMemo(() => {
    return data.filter(row => !partners.some(p => p.match(row)))
  }, [data, type])

  return (
    <div className="space-y-4">
      {groups.map(g => <GroupCard key={g.key} g={g} type={type} />)}

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
