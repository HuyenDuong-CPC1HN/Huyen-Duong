import { useMemo, useState, useRef, useEffect } from 'react'
import { opsStore as localStorage } from '../data/workspace'
import { CheckCircle, Clock, RotateCcw, XCircle, AlertCircle, Package, Users, ChevronUp, ChevronDown } from 'lucide-react'
import { partnerType } from '../utils/partnerType'
import { deliveryBucket } from '../utils/deliveryDays'
import { CarrierPanel, getCarrierFileTotal } from './CarrierStats'
import { DetailTable } from './ThongKeDoiTac'
import { StatCard, SectionCard } from './ReportCards'

function parseDate(str) {
  if (!str || str === '—') return null
  const parts = str.trim().split('/')
  if (parts.length !== 3) return null
  const [d, m, y] = parts
  const dt = new Date(+y, +m - 1, +d)
  return Number.isNaN(dt.getTime()) ? null : dt
}

function diffDays(from, to) {
  if (!from || !to) return null
  return Math.floor((to - from) / (1000 * 60 * 60 * 24))
}

// R18: neutral stat chips — no pastel full-width boxes; semantic color only on icon/badge
const STAT_COLS = [
  { key: '24h',      label: '≤ 24 giờ',      icon: CheckCircle, cls: 'text-green-600' },
  { key: '48h',      label: '≤ 48 giờ',       icon: CheckCircle, cls: 'text-teal-600' },
  { key: '72h',      label: '≤ 72 giờ',       icon: Clock,       cls: 'text-blue-600' },
  { key: 'chuaGiao', label: 'Chưa giao',      icon: AlertCircle, cls: 'text-yellow-600' },
  { key: 'giaoLai',  label: 'Đang giao hàng', icon: RotateCcw,   cls: 'text-orange-600' },
  { key: 'hoanHang', label: 'Hoàn hàng',      icon: XCircle,     cls: 'text-red-600' },
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

// R18: neutral chip style — no large pastel boxes
const KH_COLORS = {
  bv:  { border: 'border-blue-200',   text: 'text-blue-700' },
  nt:  { border: 'border-green-200',  text: 'text-green-700' },
  pk:  { border: 'border-purple-200', text: 'text-purple-700' },
  onl: { border: 'border-gray-200',   text: 'text-gray-600' },
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

// EditableStatCard — compact chip style, neutral surface, semantic color on value
function EditableStatCard({ col, value, override, onCommit, label }) {
  const Icon = col.icon
  const [editing, setEditing] = useState(false)
  const inputRef = useRef()

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const commit = (v) => { onCommit(v); setEditing(false) }

  const displayVal = override !== '' ? override : value

  return (
    <div className="report-stat text-center">
      <div className="flex items-center justify-center gap-1 mb-1">
        <Icon size={12} className={col.cls} />
        <span className="report-stat-label" style={{ margin: 0 }}>{label}</span>
      </div>
      {editing ? (
        <input
          ref={inputRef}
          type="number"
          min="0"
          defaultValue={displayVal}
          onBlur={e => commit(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') e.target.blur()
            if (e.key === 'Escape') setEditing(false)
          }}
          className={`report-stat-value ${col.cls} bg-transparent border-b-2 border-current w-14 text-center focus:outline-none`}
        />
      ) : (
        <div
          onDoubleClick={() => setEditing(true)}
          className={`report-stat-value ${col.cls} cursor-pointer`}
          style={{ justifyContent: 'center' }}
          title="Bấm đúp để nhập tay"
        >
          {displayVal}
        </div>
      )}
      {override !== '' && (
        <button
          type="button"
          onClick={() => commit('')}
          className="absolute top-0.5 right-0.5 text-[9px] text-gray-400 hover:text-red-500"
          title="Khôi phục số tự động"
        >
          ↺
        </button>
      )}
    </div>
  )
}

// Bảng chi tiết Giao 24/48/72 giờ kèm Đã giao/Tỷ lệ, click từng dòng để xem danh sách đơn — dời từ tab Đối tác VC vào đây
function TrucTiepBucketRow({ label, rows }) {
  const [open, setOpen] = useState(false)
  if (rows.length === 0) return null
  const daGiao = rows.filter(r => r['Trạng thái'] === 'Đã giao').length
  const tyLe = Math.round((daGiao / rows.length) * 100)

  return (
    <>
      <tr className="border-t border-gray-50 cursor-pointer hover:bg-blue-50/30" onClick={() => setOpen(o => !o)}>
        <td className="py-1.5 text-gray-700 flex items-center gap-1.5">
          {open ? <ChevronUp size={12} className="text-gray-400" /> : <ChevronDown size={12} className="text-gray-400" />}
          {label}
        </td>
        <td className="py-1.5 text-center font-semibold text-[#1e3a5f]">{rows.length}</td>
        <td className="py-1.5 text-center text-green-700">{daGiao}</td>
        <td className="py-1.5 text-center text-gray-500">{tyLe}%</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={4} className="pb-2">
            <DetailTable rows={rows} />
          </td>
        </tr>
      )}
    </>
  )
}

function TrucTiepBucketTable({ rows }) {
  const buckets = { 24: [], 48: [], 72: [] }
  for (const row of rows) {
    const b = deliveryBucket(row)
    if (b === '24') buckets[24].push(row)
    else if (b === '48') buckets[48].push(row)
    else if (b === '72') buckets[72].push(row)
  }
  const items = [
    { label: 'Giao 24 giờ', rows: buckets[24] },
    { label: 'Giao 48 giờ', rows: buckets[48] },
    { label: 'Giao 72 giờ', rows: buckets[72] },
  ].filter(i => i.rows.length > 0)

  if (items.length === 0) return null

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-400">
            <th className="text-left font-medium pb-1">Mốc giao hàng</th>
            <th className="text-center font-medium pb-1 w-20">Số đơn</th>
            <th className="text-center font-medium pb-1 w-20">Đã giao</th>
            <th className="text-center font-medium pb-1 w-20">Tỷ lệ</th>
          </tr>
        </thead>
        <tbody>
          {items.map(i => <TrucTiepBucketRow key={i.label} label={i.label} rows={i.rows} />)}
        </tbody>
      </table>
    </div>
  )
}

function useKhBreakdownValues(storageKey) {
  const lsKey = `chuagiao_kh_${storageKey}`
  const [values, setValues] = useState(() => {
    try { return JSON.parse(localStorage.getItem(lsKey) || '{}') } catch { return {} }
  })
  const handleChange = (key, val) => {
    const next = { ...values, [key]: val }
    setValues(next)
    localStorage.setItem(lsKey, JSON.stringify(next))
  }
  return [values, handleChange]
}

function ChuaGiaoBreakdown({ type, values, onChange }) {
  const khTypes = KH_TYPES[type] || []
  const handleChange = onChange

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
            <div key={t.key} className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg border ${c.border}`}>
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

const PARTNERS = {
  donC: [
    { key: 'tructIep',    label: 'Giao hàng trực tiếp',    match: isTrucTiep, detailed: true,  cols: COLS_DIRECT,  showKhBreakdown: true },
    { key: 'chanhXe',     label: 'Giao qua Chành xe',       match: isChanhXe,  detailed: false, cols: [] },
    { key: 'viettelPost', label: 'Viettel Post',            match: isViettel,  detailed: true,  cols: COLS_PARTNER, labelMap: LABEL_PARTNER, carrierGroup: true },
    { key: 'spx',         label: 'SPX Express',             match: isSpx,      detailed: true,  cols: COLS_PARTNER, labelMap: LABEL_PARTNER, carrierGroup: true },
  ],
  donDTP: [
    { key: 'tructIep',    label: 'Giao hàng trực tiếp',    match: isTrucTiep, detailed: true,  cols: COLS_DIRECT,  showKhBreakdown: true },
    { key: 'viettelPost', label: 'Viettel Post',            match: isViettel,  detailed: true,  cols: COLS_PARTNER, labelMap: LABEL_PARTNER, carrierGroup: true },
  ],
}

const CARRIER_KEY_MAP = { viettelPost: 'viettel', spx: 'spx' }

function ChanhXeDetail({ rows }) {
  const [showDetail, setShowDetail] = useState(false)
  if (rows.length === 0) return null
  return (
    <div>
      <button
        type="button"
        onClick={() => setShowDetail(v => !v)}
        className="text-xs text-blue-600 hover:underline"
      >
        {showDetail ? 'Ẩn chi tiết' : `Xem ${rows.length} đơn`}
      </button>
      {showDetail && <DetailTable rows={rows} />}
    </div>
  )
}

function GroupCard({ g, type, internalData, weekKey, referenceDate = null }) {
  const scopedKey = `${type}_${g.key}_${weekKey}`
  const [override, commitOverride] = useChuaGiaoOverride(scopedKey)
  const [chuaGuiChanh, setChuaGuiChanh] = useChuaGiaoOverride(`${scopedKey}_chuagui`)
  const [khValues, setKhValue] = useKhBreakdownValues(scopedKey)

  // Viettel Post / SPX Express: nhúng trực tiếp khung đối soát (upload file xuất, thống kê thật) — khớp đúng tuần đang chọn
  if (CARRIER_KEY_MAP[g.key]) {
    const carrierType = CARRIER_KEY_MAP[g.key]
    const fileData = getCarrierFileTotal(`${type}_${carrierType}`, carrierType, internalData, referenceDate)
    const badgeValue = fileData ? fileData.total : g.rows.length
    return (
      <SectionCard title={g.label} total={badgeValue} defaultOpen={false}>
        <CarrierPanel
          carrierKey={`${type}_${CARRIER_KEY_MAP[g.key]}`}
          label={g.label}
          carrierType={CARRIER_KEY_MAP[g.key]}
          internalData={internalData}
          referenceDate={referenceDate}
        />
      </SectionCard>
    )
  }

  if (!g.detailed) {
    // Badge tren tieu de luon la so dong Excel thuc te — khop voi cot Doi tac VC va khong bi lech
    // khi upload lai file moi ma chua kip cap nhat lai "so don chua gui chanh" nhap tay.
    return (
      <SectionCard title={g.label} total={g.rows.length} defaultOpen={false}>
        <div className="text-sm text-gray-500 flex items-center gap-2">
          <Package size={15} className="text-gray-400" />
          Tổng số đơn đã gửi qua chành: <strong className="text-gray-800 ml-1">{g.rows.length} đơn</strong>
        </div>
        <div className="pt-3 flex items-center gap-2">
          <label className="text-sm text-gray-500 flex items-center gap-2">
            <span>Số đơn chưa gửi chành:</span>
            <input
              type="number"
              min="0"
              value={chuaGuiChanh}
              onChange={e => setChuaGuiChanh(e.target.value)}
              placeholder="0"
              className="w-20 text-center font-bold text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-yellow-300"
            />
            <span>đơn</span>
          </label>
        </div>
        <div className="pt-3">
          <ChanhXeDetail rows={g.rows} />
        </div>
      </SectionCard>
    )
  }

  // Chưa giao luôn lấy theo số tính tự động từ dữ liệu (ngày tạo/ngày giao) — không dùng tổng
  // "Phân loại theo khách hàng" nhập tay nữa, vì số đó dễ bị cũ sau khi Excel được upload lại
  // với nhiều/ít đơn hơn mà chưa kịp nhập lại cho khớp.
  let effectiveChuaGiao = g.stats.chuaGiao
  if (override !== '') effectiveChuaGiao = Number(override)
  const totalWithOverride = g.stats['24h'] + g.stats['48h'] + g.stats['72h'] + effectiveChuaGiao
    + (g.cols.includes('giaoLai') ? g.stats.giaoLai : 0)
    + (g.cols.includes('hoanHang') ? g.stats.hoanHang : 0)

  const delivered = g.stats['24h'] + g.stats['48h'] + g.stats['72h']
  const pct = totalWithOverride > 0 ? Math.round((delivered / totalWithOverride) * 100) : 0

  return (
    // Badge tren tieu de la so dong Excel thuc te (g.rows.length), khop voi cot Doi tac VC —
    // totalWithOverride (giao + chua giao nhap tay) chi dung cho thanh Da giao/Chua giao ben trong,
    // vi no de bi lech khi file duoc upload lai ma chua cap nhat lai phan nhap tay tuong ung.
    <SectionCard title={g.label} total={g.rows.length} defaultOpen={false}>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: `repeat(${g.cols.length}, minmax(0, 1fr))` }}>
        {STAT_COLS.filter(col => g.cols.includes(col.key)).map(col => {
          const val = g.stats[col.key]
          const label = g.labelMap?.[col.key] || col.label
          if (col.key === 'chuaGiao' && g.showKhBreakdown) {
            return (
              <div key={col.key} title="Tính tự động từ ngày tạo/ngày giao — xem chi tiết theo khách hàng bên dưới">
                <StatCard icon={col.icon} value={val} label={label} cls={col.cls} />
              </div>
            )
          }
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
          return <StatCard key={col.key} icon={col.icon} value={val} label={label} cls={col.cls} />
        })}
      </div>

      {/* Chi tiết Giao 24/48/72 giờ — chỉ giao trực tiếp */}
      {g.key === 'tructIep' && <TrucTiepBucketTable rows={g.rows} />}

      {/* Phân loại khách hàng chưa giao — chỉ giao trực tiếp */}
      {g.showKhBreakdown && (
        <ChuaGiaoBreakdown type={type} values={khValues} onChange={setKhValue} />
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
    </SectionCard>
  )
}

function formatCarrierDelta(delta) {
  if (delta === 0) return 'Khớp'
  if (delta > 0) return `+${delta}`
  return String(delta)
}

// So sánh nhanh số đơn nội bộ (Excel Đơn C/DTP) và số đơn theo file VTP/SPX đã upload
function CarrierCompareSummary({ carrierGroups, type, internalData, referenceDate = null }) {
  const rows = carrierGroups.map(g => {
    const carrierKey = CARRIER_KEY_MAP[g.key]
    const fileData = getCarrierFileTotal(`${type}_${carrierKey}`, carrierKey, internalData, referenceDate)
    return { label: g.label, internalTotal: g.rows.length, fileData }
  }).filter(r => r.fileData)

  if (rows.length === 0) return null

  return (
    <div className="mb-3 bg-white rounded-lg border border-gray-200 overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 text-gray-500 border-b border-gray-100">
            <th className="text-left px-3 py-2 font-medium">Đơn vị</th>
            <th className="text-center px-3 py-2 font-medium">Nội bộ (Excel)</th>
            <th className="text-center px-3 py-2 font-medium">File đã upload</th>
            <th className="text-center px-3 py-2 font-medium">Chênh lệch</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const delta = r.internalTotal - r.fileData.total
            return (
              <tr key={r.label} className="border-b border-gray-50 last:border-0">
                <td className="px-3 py-2 text-gray-700 font-medium">{r.label}</td>
                <td className="px-3 py-2 text-center font-semibold text-[#1e3a5f]">{r.internalTotal}</td>
                <td className="px-3 py-2 text-center font-semibold text-teal-700">{r.fileData.total}</td>
                <td className={`px-3 py-2 text-center font-semibold ${delta === 0 ? 'text-green-600' : 'text-amber-600'}`}>
                  {formatCarrierDelta(delta)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function CarrierParentGroup({ label, children, total, carrierGroups, type, internalData, referenceDate = null }) {
  return (
    <SectionCard title={label} total={total}>
      <CarrierCompareSummary carrierGroups={carrierGroups} type={type} internalData={internalData} referenceDate={referenceDate} />
      <div className="space-y-3">{children}</div>
    </SectionCard>
  )
}

export default function ThongKeGiaoHang({ data, type, weekKey = 'live', referenceDate = null }) {
  // Chỉ tính đơn có Mã kiện hàng — khớp với cách tính ở tab Đối tác VC
  const validData = useMemo(() => data.filter(row => String(row['Mã kiện hàng'] ?? '').trim()), [data])

  const groups = useMemo(() => {
    const partners = PARTNERS[type] || []
    return partners.map(p => {
      const rows = validData.filter(r => p.match(r))
      let stats = null
      if (p.detailed) {
        stats = p.key === 'tructIep' ? calcStatsTrucTiep(rows) : calcStats(rows)
      }
      return { ...p, rows, stats }
    })
  }, [validData, type])

  const mainGroups = groups.filter(g => !g.carrierGroup)
  const carrierGroups = groups.filter(g => g.carrierGroup)
  const carrierTotal = carrierGroups.reduce((s, g) => {
    const carrierType = CARRIER_KEY_MAP[g.key]
    const fileData = getCarrierFileTotal(`${type}_${carrierType}`, carrierType, validData, referenceDate)
    return s + (fileData ? fileData.total : g.rows.length)
  }, 0)

  return (
    <div className="space-y-4">
      {mainGroups.map(g => <GroupCard key={`${g.key}_${weekKey}`} g={g} type={type} internalData={validData} weekKey={weekKey} referenceDate={referenceDate} />)}

      {carrierGroups.length > 0 && (
        <CarrierParentGroup label="Giao qua đối tác vận chuyển" total={carrierTotal} carrierGroups={carrierGroups} type={type} internalData={validData} referenceDate={referenceDate}>
          {carrierGroups.map(g => <GroupCard key={`${g.key}_${weekKey}`} g={g} type={type} internalData={validData} weekKey={weekKey} referenceDate={referenceDate} />)}
        </CarrierParentGroup>
      )}

    </div>
  )
}
