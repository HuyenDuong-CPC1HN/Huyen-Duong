import { useRef, useState, useMemo, useCallback, useEffect } from 'react'
import { opsStore as localStorage } from '../data/workspace'
import { Upload, FileUp, FileSpreadsheet, X, CheckCircle, Clock, RotateCcw, XCircle, Truck, Search, List, ChevronDown, ChevronUp, AlertTriangle, Package } from 'lucide-react'
import { parseCarrierFile, computeCarrierStats, getCarrierColumns, buildInternalOrderLookup, buildTrackingSet, reconcileViettelOrders, isHoldStatusRow, getTrackingCode } from '../utils/parseCarrierExport'
import { reconcileNgoaiSan, buildSalesOrderLookup, buildPackingLookup } from '../utils/reconcileNgoaiSan'
import * as XLSX from 'xlsx'
import { ColumnFilter, ResizeHandle } from './DataTable'
import { StatCard } from './ReportCards'

const STAT_CARDS = [
  { key: '24h',          label: '≤ 24 giờ',        icon: CheckCircle, cls: 'text-green-600' },
  { key: '48h',          label: '≤ 48 giờ',        icon: CheckCircle, cls: 'text-teal-600' },
  { key: '72h',          label: '≤ 72 giờ',        icon: Clock,       cls: 'text-blue-600' },
  { key: 'choLay',       label: 'Chờ lấy',         icon: Package,     cls: 'text-purple-600' },
  { key: 'dangVanChuyen',label: 'Đang vận chuyển', icon: Truck,       cls: 'text-yellow-600' },
  { key: 'giaoLai',      label: 'Đang giao hàng',  icon: RotateCcw,   cls: 'text-orange-600' },
  { key: 'hoanHang',     label: 'Hoàn hàng',       icon: XCircle,     cls: 'text-red-600' },
]

// ---- Lưu trữ dữ liệu upload theo TỪNG TUẦN, cố định/không bị ghi đè khi upload file mới ----
// carrier_weeks_${carrierKey} = [{ id, fileName, uploadedAt, rows }, ...] (mới nhất ở đầu)

function readCarrierWeeks(carrierKey) {
  try {
    const weeks = JSON.parse(localStorage.getItem(`carrier_weeks_${carrierKey}`) || 'null')
    if (Array.isArray(weeks)) return weeks
    // Di chuyển dữ liệu cũ (định dạng 1 file duy nhất) sang định dạng nhiều tuần, giữ nguyên số liệu cũ
    const legacy = JSON.parse(localStorage.getItem(`carrier_data_${carrierKey}`) || 'null')
    if (legacy) {
      const migrated = [{ id: legacy.uploadedAt || String(Date.now()), fileName: legacy.fileName, uploadedAt: legacy.uploadedAt, rows: legacy.rows }]
      localStorage.setItem(`carrier_weeks_${carrierKey}`, JSON.stringify(migrated))
      return migrated
    }
    return []
  } catch {
    return []
  }
}

const MAX_CARRIER_WEEKS = 8 // tối đa số tuần giữ lại — mỗi tuần lưu toàn bộ dòng dữ liệu, cần chặn để tránh đầy localStorage

// localStorage đầy không chỉ do riêng carrier — các tuần Excel Đơn C/DTP (weeks_donC/weeks_donDTP) thường
// chiếm nhiều chỗ nhất vì lưu toàn bộ dòng qua nhiều lần upload. Dữ liệu đã có trên Firebase nên có thể
// bớt bớt bản cục bộ an toàn khi cần giải phóng chỗ ghi dữ liệu mới.
function freeUpLocalStorageSpace() {
  for (const type of ['donC', 'donDTP']) {
    try {
      const raw = localStorage.getItem(`weeks_${type}`)
      if (!raw) continue
      const weeks = JSON.parse(raw)
      if (Array.isArray(weeks) && weeks.length > 2) {
        localStorage.setItem(`weeks_${type}`, JSON.stringify(weeks.slice(-2)))
      }
    } catch { /* ignore */ }
  }
}

// Ghi danh sách tuần — nếu vượt quota (bộ nhớ trình duyệt đầy): thử giải phóng chỗ từ nơi khác trước,
// nếu vẫn không đủ thì tự động bớt dần các tuần CŨ NHẤT của chính carrier này rồi ghi lại
function writeCarrierWeeks(carrierKey, weeks) {
  let list = weeks
  let triedFreeing = false
  while (list.length > 0) {
    try {
      localStorage.setItem(`carrier_weeks_${carrierKey}`, JSON.stringify(list))
      return list
    } catch (err) {
      if (!triedFreeing) { triedFreeing = true; freeUpLocalStorageSpace(); continue }
      if (list.length <= 1) throw err
      list = list.slice(0, -1) // bỏ tuần cũ nhất (mảng đang sắp mới nhất ở đầu)
    }
  }
  throw new Error('Không thể lưu — dữ liệu quá lớn ngay cả với 1 tuần.')
}

// Thêm 1 tuần upload mới — KHÔNG ghi đè các tuần cũ. Giới hạn tối đa MAX_CARRIER_WEEKS tuần,
// và tự động bớt tuần cũ nhất nếu localStorage đầy (báo cho người dùng biết nếu có tuần bị bớt).
export function addCarrierWeek(carrierKey, entry) {
  const weeks = readCarrierWeeks(carrierKey)
  const withId = { id: entry.uploadedAt || String(Date.now()), ...entry }
  const next = [withId, ...weeks].slice(0, MAX_CARRIER_WEEKS)
  const saved = writeCarrierWeeks(carrierKey, next)
  localStorage.setItem(`carrier_active_${carrierKey}`, withId.id)
  return { entry: withId, droppedCount: next.length - saved.length }
}

// Xoá 1 tuần cụ thể (không ảnh hưởng các tuần khác)
export function removeCarrierWeek(carrierKey, weekId) {
  const weeks = readCarrierWeeks(carrierKey).filter(w => w.id !== weekId)
  writeCarrierWeeks(carrierKey, weeks)
  const activeId = localStorage.getItem(`carrier_active_${carrierKey}`)
  if (activeId === weekId) {
    if (weeks[0]) localStorage.setItem(`carrier_active_${carrierKey}`, weeks[0].id)
    else localStorage.removeItem(`carrier_active_${carrierKey}`)
  }
}

// Chỉ giữ lại các tuần có id trong keepIds — dùng khi báo cáo Tổng đơn đã lưu, không cần giữ file các tuần cũ hơn để đỡ tốn bộ nhớ
export function pruneCarrierWeeksToIds(carrierKey, keepIds) {
  const weeks = readCarrierWeeks(carrierKey)
  const kept = weeks.filter(w => keepIds.includes(w.id))
  if (kept.length === weeks.length) return
  writeCarrierWeeks(carrierKey, kept)
}

// Xoá phần dòng dữ liệu (rows) của 1 tuần VTP/SPX sau khi đã đóng băng đủ 7 số liệu vào báo cáo Đơn C/DTP —
// KHÔNG xoá hẳn tuần khỏi danh sách, chỉ rỗng rows để đỡ tốn bộ nhớ. Lưu ý: file này có thể đang được tab
// Tổng đơn dùng để tính "Tuần này/Tuần trước" — xoá rows có thể khiến Tổng đơn hiện 0 cho đến khi có tuần mới.
export function clearCarrierWeekRows(carrierKey, weekId) {
  const weeks = readCarrierWeeks(carrierKey)
  const updated = weeks.map(w => w.id === weekId ? { ...w, rows: [] } : w)
  writeCarrierWeeks(carrierKey, updated)
}

export function carrierWeekHasRows(carrierKey, weekId) {
  const w = readCarrierWeeks(carrierKey).find(w => w.id === weekId)
  return !!(w && w.rows && w.rows.length > 0)
}

function pendingClearCarrierKey(carrierKey) { return `pending_clear_carrier_${carrierKey}` }
function loadCarrierPendingClear(carrierKey) {
  try { return JSON.parse(localStorage.getItem(pendingClearCarrierKey(carrierKey)) || 'null') } catch { return null }
}

// Thời gian ân hạn trước khi thực sự xoá rows của 1 tuần VTP/SPX (giống cơ chế Excel Đơn C/DTP) —
// cho phép "Hoàn tác" trong vài phút. carrierKey có thể là null (vd donDTP không có SPX) — khi đó hook chỉ đứng yên.
export function useCarrierRowsPendingClear(carrierKey) {
  const [pendingClear, setPendingClear] = useState(() => carrierKey ? loadCarrierPendingClear(carrierKey) : null)

  const scheduleClear = (weekId, delayMs = 3 * 60 * 1000) => {
    if (!carrierKey) return
    const info = { weekId, clearAt: Date.now() + delayMs }
    localStorage.setItem(pendingClearCarrierKey(carrierKey), JSON.stringify(info))
    setPendingClear(info)
  }

  const cancelClear = () => {
    if (!carrierKey) return
    localStorage.removeItem(pendingClearCarrierKey(carrierKey))
    setPendingClear(null)
  }

  useEffect(() => {
    if (!carrierKey || !pendingClear) return
    const remaining = pendingClear.clearAt - Date.now()
    const finalize = () => {
      clearCarrierWeekRows(carrierKey, pendingClear.weekId)
      localStorage.removeItem(pendingClearCarrierKey(carrierKey))
      setPendingClear(null)
    }
    if (remaining <= 0) { finalize(); return }
    const timer = setTimeout(finalize, remaining)
    return () => clearTimeout(timer)
  }, [carrierKey, pendingClear])

  return { pendingClear, scheduleClear, cancelClear }
}

// ---- Loại trừ theo "Tên hàng" — áp dụng chung cho carrier (không riêng theo tuần), vì đây là quy tắc
// phân loại sản phẩm (vd voucher, quà tặng...) chứ không phải số liệu upload ----
export function readExcludedTenHang(carrierKey) {
  try { return JSON.parse(localStorage.getItem(`carrier_exclude_tenhang_${carrierKey}`) || '[]') } catch { return [] }
}
export function writeExcludedTenHang(carrierKey, list) {
  localStorage.setItem(`carrier_exclude_tenhang_${carrierKey}`, JSON.stringify(list))
}
function filterExcludedRows(rows, carrierKey) {
  const excluded = readExcludedTenHang(carrierKey)
  if (excluded.length === 0) return rows
  const excludedSet = new Set(excluded)
  return rows.filter(r => !excludedSet.has((r['Tên hàng'] || '').trim()))
}

// ---- File đối chiếu "Chờ giao Logistics" — dùng để xác nhận đơn "Đang lấy hàng" có thật đang xử lý không.
// Mỗi lần upload là 1 tuần độc lập, KHÔNG ghi đè tuần cũ (giống dữ liệu carrier chính) ----
export function readHoldWeeks(carrierKey) {
  try {
    const weeks = JSON.parse(localStorage.getItem(`carrier_holdweeks_${carrierKey}`) || '[]')
    return Array.isArray(weeks) ? weeks : []
  } catch {
    return []
  }
}
export function addHoldWeek(carrierKey, entry) {
  const weeks = readHoldWeeks(carrierKey)
  const withId = { id: entry.uploadedAt || String(Date.now()), ...entry }
  let list = [withId, ...weeks].slice(0, MAX_CARRIER_WEEKS)
  let triedFreeing = false
  while (list.length > 0) {
    try {
      localStorage.setItem(`carrier_holdweeks_${carrierKey}`, JSON.stringify(list))
      return withId
    } catch (err) {
      if (!triedFreeing) { triedFreeing = true; freeUpLocalStorageSpace(); continue }
      if (list.length <= 1) throw err
      list = list.slice(0, -1)
    }
  }
  throw new Error('Không thể lưu — dữ liệu quá lớn ngay cả với 1 tuần.')
}
export function removeHoldWeek(carrierKey, weekId) {
  const next = readHoldWeeks(carrierKey).filter(w => w.id !== weekId)
  localStorage.setItem(`carrier_holdweeks_${carrierKey}`, JSON.stringify(next))
}

// File "Danh sách thống kê" (đội kinh doanh lên đơn, cột Mã đơn/Tạo lúc) — dùng để đối soát "đơn ngoại sàn"
// SPX COD (xem NgoaiSanPanel). Tích luỹ nhiều tuần giống hệt cơ chế Chờ giao Logistics ở trên.
export function readSalesOrderWeeks(carrierKey) {
  try {
    const weeks = JSON.parse(localStorage.getItem(`carrier_salesorderweeks_${carrierKey}`) || '[]')
    return Array.isArray(weeks) ? weeks : []
  } catch {
    return []
  }
}
export function addSalesOrderWeek(carrierKey, entry) {
  const weeks = readSalesOrderWeeks(carrierKey)
  const withId = { id: entry.uploadedAt || String(Date.now()), ...entry }
  let list = [withId, ...weeks].slice(0, MAX_CARRIER_WEEKS)
  let triedFreeing = false
  while (list.length > 0) {
    try {
      localStorage.setItem(`carrier_salesorderweeks_${carrierKey}`, JSON.stringify(list))
      return withId
    } catch (err) {
      if (!triedFreeing) { triedFreeing = true; freeUpLocalStorageSpace(); continue }
      if (list.length <= 1) throw err
      list = list.slice(0, -1)
    }
  }
  throw new Error('Không thể lưu — dữ liệu quá lớn ngay cả với 1 tuần.')
}
export function removeSalesOrderWeek(carrierKey, weekId) {
  const next = readSalesOrderWeeks(carrierKey).filter(w => w.id !== weekId)
  localStorage.setItem(`carrier_salesorderweeks_${carrierKey}`, JSON.stringify(next))
}

// File "bốc đóng" (kho đóng kiện, cột Mã vận đơn/TG Đóng kiện) — dùng để đối soát "đơn ngoại sàn" SPX COD
// (mốc 2, xem NgoaiSanPanel). Tích luỹ nhiều tuần giống hệt cơ chế Chờ giao Logistics/Danh sách thống kê.
export function readPackingWeeks(carrierKey) {
  try {
    const weeks = JSON.parse(localStorage.getItem(`carrier_packingweeks_${carrierKey}`) || '[]')
    return Array.isArray(weeks) ? weeks : []
  } catch {
    return []
  }
}
export function addPackingWeek(carrierKey, entry) {
  const weeks = readPackingWeeks(carrierKey)
  const withId = { id: entry.uploadedAt || String(Date.now()), ...entry }
  let list = [withId, ...weeks].slice(0, MAX_CARRIER_WEEKS)
  let triedFreeing = false
  while (list.length > 0) {
    try {
      localStorage.setItem(`carrier_packingweeks_${carrierKey}`, JSON.stringify(list))
      return withId
    } catch (err) {
      if (!triedFreeing) { triedFreeing = true; freeUpLocalStorageSpace(); continue }
      if (list.length <= 1) throw err
      list = list.slice(0, -1)
    }
  }
  throw new Error('Không thể lưu — dữ liệu quá lớn ngay cả với 1 tuần.')
}
export function removePackingWeek(carrierKey, weekId) {
  const next = readPackingWeeks(carrierKey).filter(w => w.id !== weekId)
  localStorage.setItem(`carrier_packingweeks_${carrierKey}`, JSON.stringify(next))
}
// Gộp mã tracking từ TOÀN BỘ các tuần đã upload (tích luỹ dần) để đối chiếu
function getHoldLookupSet(carrierKey) {
  const weeks = readHoldWeeks(carrierKey)
  if (weeks.length === 0) return null
  const set = new Set()
  for (const w of weeks) for (const code of buildTrackingSet(w.rows, 'Mã vận đơn VT')) set.add(code)
  return set
}

// Ghi chú tay theo từng mã vận đơn (xem useHoldNotes) — đọc trực tiếp từ localStorage cho bản build tĩnh
function readHoldNotesMap(carrierKey) {
  try { return JSON.parse(localStorage.getItem(`carrier_hold_notes_${carrierKey}`) || '{}') } catch { return {} }
}

// frozenLookup (object {mã: số lượng}, xem snapshotCarrierLookup): dùng thay cho internalData khi Excel gốc
// đã bị xoá (báo cáo Đơn C/DTP đã lưu) — vẫn đếm đúng đơn CB gộp/SPX lấy hàng-không-thành-công.
function buildStatsForWeek(entry, carrierKey, carrierType, internalData, frozenLookup = null) {
  if (!entry) return null
  const lookupMap = frozenLookup ? new Map(Object.entries(frozenLookup)) : buildInternalOrderLookup(internalData)
  const holdLookupSet = getHoldLookupSet(carrierKey)
  const holdNotes = readHoldNotesMap(carrierKey)
  const effectiveRows = filterExcludedRows(entry.rows, carrierKey)
  const stats = computeCarrierStats(effectiveRows, carrierType, lookupMap, holdLookupSet, holdNotes)

  return {
    weekId: entry.id,
    fileName: entry.fileName,
    uploadedAt: entry.uploadedAt,
    stats,
    total: stats['24h'] + stats['48h'] + stats['72h'] + stats.dangVanChuyen + stats.giaoLai + stats.hoanHang + stats.choLay,
  }
}

// Đọc nhanh toàn bộ thống kê (24h/48h/72h/đang vận chuyển/giao lại/hoàn hàng) theo tuần đang chọn (mặc định: tuần mới nhất)
export function getCarrierFileStats(carrierKey, carrierType, internalData, weekId, frozenLookup = null) {
  try {
    const weeks = readCarrierWeeks(carrierKey)
    if (weeks.length === 0) return null
    const entry = weekId ? weeks.find(w => w.id === weekId) : weeks[0]
    return buildStatsForWeek(entry, carrierKey, carrierType, internalData, frozenLookup)
  } catch {
    return null
  }
}

// Chọn tuần có ngày upload GẦN NHẤT với referenceDate — đáng tin cậy hơn so với đếm vị trí trong danh sách,
// vì danh sách Excel Đơn C/DTP và danh sách VTP/SPX là 2 danh sách upload độc lập, không tăng đồng bộ với nhau
// (đã từng gây bug: dùng vị trí (rank) làm lệch tuần VTP khi 1 trong 2 danh sách có tuần bị "dọn rỗng"/lưu trước đó).
function closestByDate(weeks, referenceDate) {
  if (weeks.length === 0) return null
  if (!referenceDate) return weeks[0]
  const refTime = new Date(referenceDate).getTime()
  let best = weeks[0]
  let bestDiff = Math.abs(new Date(best.uploadedAt).getTime() - refTime)
  for (const w of weeks) {
    const diff = Math.abs(new Date(w.uploadedAt).getTime() - refTime)
    if (diff < bestDiff) { best = w; bestDiff = diff }
  }
  return best
}

// Đóng băng bảng đối chiếu "Mã vận đơn" nội bộ (object nhỏ gọn, không phải toàn bộ dòng Excel) — gọi lúc
// còn dữ liệu Excel sống (trước khi "Lưu số liệu tuần này" xoá Excel gốc) để giữ đúng cách đếm đơn CB gộp/
// SPX lấy hàng-không-thành-công về sau, không bị lệch khi Excel đã xoá (internalData sẽ thành rỗng).
export function snapshotCarrierLookup(internalData) {
  return Object.fromEntries(buildInternalOrderLookup(internalData))
}

// Lấy tổng đơn theo file VTP/SPX có ngày upload gần nhất với referenceDate (ngày upload Excel Đơn C/DTP
// đang xem) — không truyền referenceDate thì mặc định lấy file mới nhất.
export function getCarrierFileTotal(carrierKey, carrierType, internalData, referenceDate = null) {
  const weeks = readCarrierWeeks(carrierKey)
  const entry = closestByDate(weeks, referenceDate)
  return entry ? buildStatsForWeek(entry, carrierKey, carrierType, internalData) : null
}

// Trả về id của file VTP/SPX khớp gần nhất với referenceDate — dùng để "đóng băng" đúng file tương ứng
// vào 1 báo cáo đã lưu (Lưu số liệu tuần này), tránh lệch nếu sau này upload thêm file mới.
export function pickCarrierWeekIdByDate(carrierKey, referenceDate) {
  return closestByDate(readCarrierWeeks(carrierKey), referenceDate)?.id || null
}

// Danh sách rút gọn các tuần đã upload (không kèm rows) — dùng cho UI chọn tuần thủ công ở nơi khác (vd Tổng đơn)
export function getCarrierWeeksList(carrierKey) {
  return readCarrierWeeks(carrierKey).map(w => ({ id: w.id, fileName: w.fileName, uploadedAt: w.uploadedAt }))
}

// So sánh tuần mới nhất vs tuần trước đó cho 1 carrier
export function getCarrierHistoryCompare(carrierKey, carrierType, internalData) {
  try {
    const weeks = readCarrierWeeks(carrierKey)
    return {
      current: buildStatsForWeek(weeks[0], carrierKey, carrierType, internalData),
      previous: buildStatsForWeek(weeks[1], carrierKey, carrierType, internalData),
    }
  } catch {
    return { current: null, previous: null }
  }
}

function ReconcilePanel({ vtpRows, internalData }) {
  const [open, setOpen] = useState(false)
  const result = useMemo(() => reconcileViettelOrders(vtpRows, internalData), [vtpRows, internalData])

  if (internalData.length === 0) return null
  const isMatched = result.missingInVtp.length === 0 && result.extraInVtp.length === 0

  return (
    <div className={`rounded-xl border p-3 mb-4 ${isMatched ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 text-left">
        {isMatched
          ? <CheckCircle size={16} className="text-green-600 flex-shrink-0" />
          : <AlertTriangle size={16} className="text-amber-600 flex-shrink-0" />}
        <span className={`text-sm font-medium ${isMatched ? 'text-green-800' : 'text-amber-800'}`}>
          {isMatched
            ? `Khớp hoàn toàn: ${result.internalTotal} đơn nội bộ ↔ ${result.vtpUniqueCodes} mã trong file VTP`
            : `Lệch dữ liệu: ${result.internalTotal} đơn nội bộ, ${result.vtpUniqueCodes} mã VTP — ${result.missingInVtp.length} đơn chưa thấy trong VTP, ${result.extraInVtp.length} mã VTP không khớp nội bộ`}
        </span>
        {(open ? <ChevronUp size={15} className="ml-auto text-gray-400" /> : <ChevronDown size={15} className="ml-auto text-gray-400" />)}
      </button>

      {open && !isMatched && (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          {result.missingInVtp.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-700 mb-1">
                Đơn nội bộ chưa thấy trong file VTP ({result.missingInVtp.length})
              </p>
              <div className="max-h-40 overflow-y-auto bg-white rounded-lg border border-amber-100 p-2">
                {result.missingInVtp.map(({ code, row }) => (
                  <div key={code} className="text-xs text-gray-600 py-0.5 border-b border-gray-50 last:border-0">
                    <span className="font-mono text-gray-800">{code}</span>
                    {row['Tên khách hàng'] && <span className="text-gray-400"> — {row['Tên khách hàng']}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {result.extraInVtp.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-700 mb-1">
                Mã VTP không khớp đơn nội bộ ({result.extraInVtp.length})
              </p>
              <div className="max-h-40 overflow-y-auto bg-white rounded-lg border border-amber-100 p-2">
                {result.extraInVtp.map(code => (
                  <div key={code} className="text-xs font-mono text-gray-600 py-0.5 border-b border-gray-50 last:border-0">{code}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const NGOAI_SAN_DONG_KIEN_CARDS = [
  { key: 'dungHanDongKien',     label: 'Đóng kiện đúng hạn (≤24h)',   icon: CheckCircle,   cls: 'text-green-600' },
  { key: 'treDongKien',         label: 'Trễ đóng kiện (>24h)',        icon: Clock,         cls: 'text-orange-600' },
  { key: 'quaHanChuaDongKien',  label: 'Chưa đóng kiện — quá 24h',    icon: AlertTriangle, cls: 'text-red-600' },
]
const NGOAI_SAN_LAY_HANG_CARDS = [
  { key: 'layTrong24h',            label: 'SPX lấy trong 24h (sau đóng kiện)', icon: CheckCircle,   cls: 'text-green-600' },
  { key: 'layTrong48h',            label: 'SPX lấy trong 48h',                 icon: Clock,         cls: 'text-teal-600' },
  { key: 'layTrong72h',            label: 'SPX lấy trong 72h',                 icon: Clock,         cls: 'text-blue-600' },
  { key: 'layQua72h',              label: 'SPX lấy sau >72h',                  icon: AlertTriangle, cls: 'text-orange-600' },
  { key: 'layChuaLay',             label: 'Chưa lấy hàng',                    icon: AlertTriangle, cls: 'text-red-600' },
  { key: 'khongCoDuLieuDongKien',  label: 'Chưa có dữ liệu đóng kiện',        icon: Package,       cls: 'text-gray-500' },
]
const NGOAI_SAN_GIAO_CARDS = [
  { key: 'dungHanGiao',      label: 'Giao đúng hạn (≤48h)',   icon: CheckCircle,   cls: 'text-green-600' },
  { key: 'treHanGiao',       label: 'Giao trễ hạn (>48h)',    icon: Clock,         cls: 'text-orange-600' },
  { key: 'chuaGiaoQuaHan',   label: 'Chưa giao — quá 48h',    icon: AlertTriangle, cls: 'text-red-600' },
]

// Đối soát "đơn ngoại sàn" (SPX COD) theo 4 mốc thời gian — xem reconcileNgoaiSan.js.
// Chỉ hiển thị trong tab SPX (carrierType === 'spx').
function NgoaiSanPanel({ carrierKey, spxRows }) {
  const salesInputRef = useRef()
  const packingInputRef = useRef()
  const [error, setError] = useState('')
  const [salesWeeks, setSalesWeeks] = useState(() => readSalesOrderWeeks(carrierKey))
  const [packingWeeks, setPackingWeeks] = useState(() => readPackingWeeks(carrierKey))
  const [expanded, setExpanded] = useState(false)
  const [onlyProblem, setOnlyProblem] = useState(false)
  const [excluded, setExcludedEntry] = useNgoaiSanExcluded(carrierKey)

  const salesLookup = useMemo(() => buildSalesOrderLookup(salesWeeks), [salesWeeks])
  const packingLookup = useMemo(() => buildPackingLookup(packingWeeks), [packingWeeks])
  const excludedSet = useMemo(() => new Set(excluded), [excluded])
  const { rows, stats } = useMemo(
    () => reconcileNgoaiSan(spxRows, salesLookup, packingLookup, excludedSet),
    [spxRows, salesLookup, packingLookup, excludedSet]
  )

  const parseSalesFile = (file) => {
    setError('')
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const fileRows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false })
        if (fileRows.length === 0 || !('Mã đơn' in fileRows[0])) {
          setError('Không tìm thấy cột "Mã đơn" trong file. Vui lòng kiểm tra lại.')
          return
        }
        addSalesOrderWeek(carrierKey, { fileName: file.name, uploadedAt: new Date().toISOString(), rows: fileRows })
        setSalesWeeks(readSalesOrderWeeks(carrierKey))
      } catch {
        setError('Không đọc được file Danh sách thống kê. Vui lòng kiểm tra lại.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const parsePackingFile = (file) => {
    setError('')
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames.includes('Theo dõi kiện hàng') ? 'Theo dõi kiện hàng' : wb.SheetNames[0]]
        const fileRows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false })
        const hasPackingTimeCol = 'TG Đóng kiện' in fileRows[0] || 'TG Đóng hàng' in fileRows[0]
        if (fileRows.length === 0 || !('Mã vận đơn' in fileRows[0]) || !hasPackingTimeCol) {
          setError('Không tìm thấy cột "Mã vận đơn"/"TG Đóng kiện"/"TG Đóng hàng" trong file. Vui lòng kiểm tra lại.')
          return
        }
        addPackingWeek(carrierKey, { fileName: file.name, uploadedAt: new Date().toISOString(), rows: fileRows })
        setPackingWeeks(readPackingWeeks(carrierKey))
      } catch {
        setError('Không đọc được file bốc đóng. Vui lòng kiểm tra lại.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const removeSalesWeekEntry = (weekId) => {
    removeSalesOrderWeek(carrierKey, weekId)
    setSalesWeeks(readSalesOrderWeeks(carrierKey))
  }
  const removePackingWeekEntry = (weekId) => {
    removePackingWeek(carrierKey, weekId)
    setPackingWeeks(readPackingWeeks(carrierKey))
  }

  const problemStatuses = new Set(['TRỄ ĐÓNG KIỆN (>24h)', 'CHƯA ĐÓNG KIỆN — QUÁ 24H', 'TRỄ HẠN (>48h)', 'CHƯA GIAO — QUÁ 48H'])
  const isProblemRow = r => !r.excludedFromReport && (
    problemStatuses.has(r.tinhTrangDongKien) || problemStatuses.has(r.tinhTrangGiao) ||
    r.nhomLay === '>72h' || r.nhomLay === 'Chưa lấy hàng'
  )
  const visibleRows = onlyProblem ? rows.filter(isProblemRow) : rows
  const problemCount = rows.filter(isProblemRow).length
  const khongKhopRows = rows.filter(r => r.tinhTrangDongKien === 'Không khớp Mã đơn')

  return (
    <div className="mb-5 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-1">
        <Truck size={16} className="text-[#1e3a5f]" />
        <h3 className="font-semibold text-gray-800 text-sm">Đối soát đơn ngoại sàn (SPX COD) — theo 4 mốc thời gian</h3>
      </div>
      <p className="text-xs text-gray-400 mb-3">
        Mốc 1: Tạo lúc (Danh sách thống kê) · Mốc 2: Đóng kiện (file bốc đóng, nối qua Mã vận đơn) · Mốc 3: SPX lấy hàng ·
        Mốc 4: SPX giao hàng thành công. A) Đóng kiện (M1→M2) đạt khi ≤24h. B) SPX lấy hàng (M2→M3) tính theo nhóm 24h/48h/72h
        kể từ lúc đóng kiện xong. C) Giao hàng (M1→M4) đạt khi ≤48h.
      </p>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button
          onClick={() => salesInputRef.current.click()}
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:border-blue-400 hover:text-blue-600 text-gray-600 transition-colors"
        >
          <Upload size={14} />
          Upload Danh sách thống kê
        </button>
        <input ref={salesInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => parseSalesFile(e.target.files[0])} />
        <button
          onClick={() => packingInputRef.current.click()}
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:border-blue-400 hover:text-blue-600 text-gray-600 transition-colors"
        >
          <Upload size={14} />
          Upload File bốc đóng
        </button>
        <input ref={packingInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => parsePackingFile(e.target.files[0])} />
      </div>
      {(salesWeeks.length === 0 || packingWeeks.length === 0) && (
        <p className="mb-3 text-xs text-gray-400">
          {salesWeeks.length === 0 && 'Chưa có file Danh sách thống kê. '}
          {packingWeeks.length === 0 && 'Chưa có file bốc đóng (sẽ không tính được mốc Đóng kiện/SPX lấy hàng).'}
        </p>
      )}
      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      {(salesWeeks.length > 0 || packingWeeks.length > 0) && (
        <>
          {salesWeeks.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {salesWeeks.map(w => (
                <span key={w.id} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
                  <FileSpreadsheet size={12} />
                  <span className="max-w-48 truncate" title={w.fileName}>{w.fileName}</span>
                  <span className="text-blue-400">· {new Date(w.uploadedAt).toLocaleDateString('vi-VN')}</span>
                  <button onClick={() => removeSalesWeekEntry(w.id)} className="ml-0.5 text-blue-400 hover:text-red-500" title="Xoá tuần này">
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          {packingWeeks.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {packingWeeks.map(w => (
                <span key={w.id} className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-700">
                  <FileSpreadsheet size={12} />
                  <span className="max-w-48 truncate" title={w.fileName}>{w.fileName}</span>
                  <span className="text-purple-400">· {new Date(w.uploadedAt).toLocaleDateString('vi-VN')}</span>
                  <button onClick={() => removePackingWeekEntry(w.id)} className="ml-0.5 text-purple-400 hover:text-red-500" title="Xoá tuần này">
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <p className="text-xs font-semibold text-gray-500 mb-2">A) Đóng kiện (kho) — Mốc 1 → Mốc 2</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            {NGOAI_SAN_DONG_KIEN_CARDS.map(c => (
              <StatCard key={c.key} icon={c.icon} value={stats[c.key]} label={c.label} cls={c.cls} />
            ))}
          </div>

          <p className="text-xs font-semibold text-gray-500 mb-2">B) SPX lấy hàng — Mốc 2 → Mốc 3</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            {NGOAI_SAN_LAY_HANG_CARDS.map(c => (
              <StatCard key={c.key} icon={c.icon} value={stats[c.key]} label={c.label} cls={c.cls} />
            ))}
          </div>

          <p className="text-xs font-semibold text-gray-500 mb-2">C) Giao hàng thành công — Mốc 1 → Mốc 4</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            {NGOAI_SAN_GIAO_CARDS.map(c => (
              <StatCard key={c.key} icon={c.icon} value={stats[c.key]} label={c.label} cls={c.cls} />
            ))}
          </div>

          <div className="flex items-center gap-3 flex-wrap text-xs text-gray-500 mb-3">
            <span>{stats.total} đơn khớp Mã đơn</span>
            <span>· {stats.hoanHang} hoàn hàng</span>
            <span>· {stats.huy} đã huỷ (không đối soát)</span>
            {stats.boQua > 0 && <span>· {stats.boQua} đã đánh dấu không cần tính (trùng đơn)</span>}
            {stats.khongKhop > 0 && <span className="text-amber-600">· {stats.khongKhop} đơn SPX không khớp Mã đơn</span>}
          </div>

          <button
            onClick={() => setExpanded(v => !v)}
            className="w-full flex items-center gap-2 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors text-left"
          >
            <List size={15} className="text-gray-500" />
            <span className="font-medium text-gray-700 text-sm">Chi tiết đối soát</span>
            {expanded ? <ChevronUp size={15} className="text-gray-400 ml-auto" /> : <ChevronDown size={15} className="text-gray-400 ml-auto" />}
          </button>

          {expanded && (
            <div className="mt-3">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                {problemCount > 0 ? (
                  <button
                    onClick={() => setOnlyProblem(v => !v)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors ${
                      onlyProblem ? 'bg-red-100 border-red-300 text-red-700' : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
                    }`}
                  >
                    <AlertTriangle size={14} />
                    {onlyProblem ? 'Đang chỉ hiện đơn trễ/quá hạn — bấm để bỏ lọc' : `Chỉ hiện ${problemCount} đơn trễ/quá hạn`}
                  </button>
                ) : (
                  <span className="flex items-center gap-1.5 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-600">
                    <CheckCircle size={14} />
                    Không có đơn trễ/quá hạn
                  </span>
                )}
                {khongKhopRows.length > 0 && (
                  <span className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                    {khongKhopRows.length} đơn SPX chưa tìm thấy Mã đơn tương ứng
                  </span>
                )}
              </div>
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#1e3a5f] text-white">
                      <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Mã đơn</th>
                      <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Trạng thái SPX</th>
                      <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Mốc1 - Tạo lúc</th>
                      <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Mốc2 - Đóng kiện</th>
                      <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Giờ đóng kiện</th>
                      <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Tình trạng đóng kiện</th>
                      <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Mốc3 - SPX lấy hàng</th>
                      <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Giờ lấy sau đóng kiện</th>
                      <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Nhóm lấy hàng</th>
                      <th className="px-3 py-2 text-center font-semibold whitespace-nowrap" title='Bỏ tick với đơn trùng/chỉ cần huỷ bên SPX — sẽ không tính vào thống kê "Chưa lấy hàng/Chưa giao"'>Tính vào BC</th>
                      <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Mốc4 - Giao hàng</th>
                      <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Giờ giao tổng</th>
                      <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Tình trạng giao (≤48h)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.length === 0 ? (
                      <tr><td colSpan={13} className="text-center py-8 text-gray-400">Không có dữ liệu</td></tr>
                    ) : visibleRows.map((r, i) => (
                      <tr key={i} className={`border-b border-gray-100 hover:bg-blue-50/40 ${r.excludedFromReport ? 'opacity-50' : ''}`}>
                        <td className="px-3 py-2 border border-gray-200 font-mono whitespace-nowrap">{r.maDon}</td>
                        <td className="px-3 py-2 border border-gray-200 whitespace-nowrap">{r.trangThai || '—'}</td>
                        <td className="px-3 py-2 border border-gray-200 whitespace-nowrap">{r.moc1 || '—'}</td>
                        <td className="px-3 py-2 border border-gray-200 whitespace-nowrap">{r.moc2 || '—'}</td>
                        <td className="px-3 py-2 border border-gray-200 whitespace-nowrap">{r.gioDongKien === '' || r.gioDongKien === undefined ? '—' : r.gioDongKien}</td>
                        <td className={`px-3 py-2 border border-gray-200 whitespace-nowrap ${problemStatuses.has(r.tinhTrangDongKien) ? 'text-red-600 font-medium' : ''}`}>{r.tinhTrangDongKien || '—'}</td>
                        <td className="px-3 py-2 border border-gray-200 whitespace-nowrap">{r.moc3 || '—'}</td>
                        <td className="px-3 py-2 border border-gray-200 whitespace-nowrap">{r.gioLaySauDongKien === '' || r.gioLaySauDongKien === undefined ? '—' : r.gioLaySauDongKien}</td>
                        <td className={`px-3 py-2 border border-gray-200 whitespace-nowrap ${!r.excludedFromReport && (r.nhomLay === '>72h' || r.nhomLay === 'Chưa lấy hàng') ? 'text-red-600 font-medium' : ''}`}>
                          {r.excludedFromReport ? 'Chưa lấy hàng (đã bỏ qua)' : (r.nhomLay || '—')}
                        </td>
                        <td className="px-3 py-2 border border-gray-200 text-center">
                          {r.nhomLay === 'Chưa lấy hàng' || r.excludedFromReport ? (
                            <input
                              type="checkbox"
                              checked={!r.excludedFromReport}
                              onChange={e => setExcludedEntry(r.maDon, !e.target.checked)}
                              title={r.excludedFromReport ? 'Đang KHÔNG tính vào báo cáo (đơn trùng/huỷ SPX) — tick để tính lại' : 'Đang tính vào báo cáo — bỏ tick nếu đơn trùng/chỉ cần huỷ bên SPX'}
                            />
                          ) : null}
                        </td>
                        <td className="px-3 py-2 border border-gray-200 whitespace-nowrap">{r.moc4 || '—'}</td>
                        <td className="px-3 py-2 border border-gray-200 whitespace-nowrap">{r.gioGiaoTong === '' || r.gioGiaoTong === undefined ? '—' : r.gioGiaoTong}</td>
                        <td className={`px-3 py-2 border border-gray-200 whitespace-nowrap ${problemStatuses.has(r.tinhTrangGiao) ? 'text-red-600 font-medium' : ''}`}>{r.tinhTrangGiao || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200, 'all']
const DEFAULT_COL_WIDTH = {
  'Mã Vận Đơn': 130, 'Mã đơn hàng': 130, 'Ngày tạo': 140, 'Người nhận': 200, 'Địa chỉ nhận': 260,
  'ĐT Nhận': 140, 'Tên hàng': 180, 'Trạng Thái': 130, 'Lý do': 200, 'Đơn chuyển hoàn': 110, 'Ngày chuyển trạng thái': 150,
  'Mã vận đơn': 150, 'Thời gian tạo đơn': 140, 'Thời gian lấy hàng/gửi hàng': 160, 'Thời gian giao hàng': 140, 'Trạng thái hiện tại': 150,
  'Tên người nhận': 160, 'Số điện thoại người nhận': 140, 'Mã khách hàng': 140,
  'Thu COD (Có/Không)': 130, 'Số tiền COD': 120, 'Giá trị đơn hàng': 130,
}

// Ghi chú tay theo từng mã vận đơn (dùng để theo dõi các đơn "Đang lấy hàng" chưa khớp file Chờ giao Logistics)
function useHoldNotes(carrierKey) {
  const lsKey = `carrier_hold_notes_${carrierKey}`
  const [notes, setNotes] = useState(() => {
    try { return JSON.parse(localStorage.getItem(lsKey) || '{}') } catch { return {} }
  })
  const setNote = (code, text) => {
    const next = { ...notes, [code]: text }
    if (!text) delete next[code]
    setNotes(next)
    localStorage.setItem(lsKey, JSON.stringify(next))
  }
  return [notes, setNote]
}

// Đánh dấu tay các đơn "Chưa lấy — quá 24h" là "không cần tính vào báo cáo" (vd đơn trùng, chỉ cần huỷ
// bên SPX là xong) — loại khỏi thống kê chưa lấy/chưa giao nhưng vẫn hiện trong bảng chi tiết để theo dõi.
function useNgoaiSanExcluded(carrierKey) {
  const lsKey = `carrier_ngoaisan_excluded_${carrierKey}`
  const [excluded, setExcluded] = useState(() => {
    try { return JSON.parse(localStorage.getItem(lsKey) || '[]') } catch { return [] }
  })
  const setEntry = (maDon, isExcluded) => {
    const next = isExcluded ? [...new Set([...excluded, maDon])] : excluded.filter(c => c !== maDon)
    setExcluded(next)
    localStorage.setItem(lsKey, JSON.stringify(next))
  }
  return [excluded, setEntry]
}

function useColWidths(storageKey, columns) {
  const lsKey = `carrier_colwidths_${storageKey}`
  const init = () => {
    const defaults = Object.fromEntries(columns.map(c => [c, DEFAULT_COL_WIDTH[c] ?? 120]))
    try {
      const saved = JSON.parse(localStorage.getItem(lsKey) || '{}')
      return { ...defaults, ...saved }
    } catch {
      return defaults
    }
  }
  const [widths, setWidths] = useState(init)
  const setWidth = (key, w) => setWidths(prev => {
    const next = { ...prev, [key]: Math.max(60, w) }
    localStorage.setItem(lsKey, JSON.stringify(next))
    return next
  })
  return [widths, setWidth]
}

// frozenLookup: bảng đối chiếu "Mã vận đơn" nội bộ đã đóng băng sẵn (object {mã: số lượng}) — dùng khi xem
// báo cáo Đơn C/DTP đã lưu (Excel gốc đã xoá, không còn internalData thật) để vẫn đếm đúng đơn CB gộp/SPX
// lấy hàng-không-thành-công, thay vì tính theo internalData=[] (sẽ sai vì rơi về cách đếm phỏng đoán).
export function CarrierPanel({ carrierKey, label, carrierType = 'viettel', internalData = [], referenceDate = null, weekId = null, frozenLookup = null }) {
  const TABLE_COLUMNS = getCarrierColumns(carrierType)
  const lookupMap = useMemo(
    () => frozenLookup ? new Map(Object.entries(frozenLookup)) : buildInternalOrderLookup(internalData),
    [internalData, frozenLookup]
  )
  const inputRef = useRef()
  const holdInputRef = useRef()
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [holdNotes, setHoldNote] = useHoldNotes(carrierKey)

  // File đối chiếu "Chờ giao Logistics" — xác nhận đơn "Đang lấy hàng" có đang thực sự xử lý không.
  // Mỗi lần upload là 1 tuần độc lập, không ghi đè — mã tracking được gộp từ TẤT CẢ các tuần đã upload để đối chiếu.
  const [holdWeeks, setHoldWeeks] = useState(() => readHoldWeeks(carrierKey))
  const holdLookupSet = useMemo(() => {
    if (holdWeeks.length === 0) return null
    const set = new Set()
    for (const w of holdWeeks) for (const code of buildTrackingSet(w.rows, 'Mã vận đơn VT')) set.add(code)
    return set
  }, [holdWeeks])

  const parseHoldFile = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false })
        addHoldWeek(carrierKey, { fileName: file.name, uploadedAt: new Date().toISOString(), rows })
        setHoldWeeks(readHoldWeeks(carrierKey))
      } catch {
        setError('Không đọc được file Chờ giao Logistics. Vui lòng kiểm tra lại.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const removeHoldWeekEntry = (weekId) => {
    removeHoldWeek(carrierKey, weekId)
    setHoldWeeks(readHoldWeeks(carrierKey))
  }

  const [weeks, setWeeks] = useState(() => readCarrierWeeks(carrierKey))
  // Tuần đang xem: nếu có weekId cụ thể (vd đang xem 1 báo cáo Đơn C/DTP đã lưu) thì lấy đúng file đó;
  // không thì lấy file có ngày upload gần nhất với referenceDate (ngày upload tuần Excel Đơn C/DTP đang chọn)
  const state = weekId ? (weeks.find(w => w.id === weekId) || null) : closestByDate(weeks, referenceDate)

  const [colFilters, setColFilters] = useState({})
  const [pageSize, setPageSize] = useState(50)
  const [tableExpanded, setTableExpanded] = useState(false)
  const [colWidths, setColWidth] = useColWidths(carrierKey, TABLE_COLUMNS)
  const minTableWidthRef = useRef(0)

  const NOTE_COL_WIDTH = 220
  // Đối chiếu "Chờ giao Logistics" chỉ áp dụng cho Đơn DTP — Đơn C không cần kiểm tra mục này
  const showNoteCol = carrierType === 'viettel' && carrierKey.startsWith('donDTP')
  const totalTableWidth = Object.values(colWidths).reduce((a, b) => a + b, 0) + (showNoteCol ? NOTE_COL_WIDTH : 0)
  minTableWidthRef.current = Math.max(minTableWidthRef.current, totalTableWidth)
  const stableWidth = minTableWidthRef.current

  const topScrollRef = useRef()
  const tableScrollRef = useRef()
  const bottomScrollRef = useRef()
  const [showBottomScroll, setShowBottomScroll] = useState(false)

  const syncScrollLeft = useCallback((sourceRef, ...targetRefs) => {
    for (const ref of targetRefs) {
      if (ref.current && ref.current.scrollLeft !== sourceRef.current.scrollLeft) {
        ref.current.scrollLeft = sourceRef.current.scrollLeft
      }
    }
  }, [])
  const syncFromTop = useCallback(() => syncScrollLeft(topScrollRef, tableScrollRef, bottomScrollRef), [syncScrollLeft])
  const syncFromTable = useCallback(() => syncScrollLeft(tableScrollRef, topScrollRef, bottomScrollRef), [syncScrollLeft])
  const syncFromBottom = useCallback(() => syncScrollLeft(bottomScrollRef, topScrollRef, tableScrollRef), [syncScrollLeft])

  useEffect(() => {
    const el = tableScrollRef.current
    if (!el || !tableExpanded) { setShowBottomScroll(false); return }
    const update = () => setShowBottomScroll(el.scrollWidth > el.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [tableExpanded, stableWidth])

  const setColFilter = (key, vals) => setColFilters(f => ({ ...f, [key]: vals }))

  // Mỗi lần upload tạo 1 tuần dữ liệu MỚI, độc lập — không ghi đè tuần đã có trước đó
  const parseFile = (file) => {
    setError('')
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const rows = parseCarrierFile(e.target.result, carrierType)
        if (rows.length === 0) { setError('Không tìm thấy dữ liệu đơn hàng trong file.'); return }
        const { droppedCount } = addCarrierWeek(carrierKey, { fileName: file.name, uploadedAt: new Date().toISOString(), rows })
        setWeeks(readCarrierWeeks(carrierKey))
        if (droppedCount > 0) {
          setError(`Bộ nhớ trình duyệt gần đầy — đã tự động bỏ ${droppedCount} tuần cũ nhất để lưu được tuần này.`)
        }
      } catch (err) {
        setError(err.message || 'Không đọc được file. Vui lòng kiểm tra lại.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    parseFile(e.dataTransfer.files[0])
  }

  // Xoá HẲN tuần đang xem — các tuần khác không bị ảnh hưởng
  const removeActiveWeek = () => {
    if (!state) return
    if (!window.confirm(`Xoá dữ liệu tuần "${state.fileName}"? Các tuần khác vẫn được giữ nguyên.`)) return
    removeCarrierWeek(carrierKey, state.id)
    setWeeks(readCarrierWeeks(carrierKey))
  }

  // Loại trừ theo "Tên hàng" (vd voucher, quà tặng...) khỏi thống kê — áp dụng chung cho carrier này
  const [excludedNames, setExcludedNames] = useState(() => readExcludedTenHang(carrierKey))
  const hasTenHang = TABLE_COLUMNS.includes('Tên hàng')

  const toggleExclude = (name) => {
    const next = excludedNames.includes(name) ? excludedNames.filter(n => n !== name) : [...excludedNames, name]
    setExcludedNames(next)
    writeExcludedTenHang(carrierKey, next)
  }

  const effectiveRows = useMemo(() => {
    if (!state) return []
    if (!hasTenHang || excludedNames.length === 0) return state.rows
    const excludedSet = new Set(excludedNames)
    return state.rows.filter(r => !excludedSet.has((r['Tên hàng'] || '').trim()))
  }, [state, excludedNames, hasTenHang])

  const stats = useMemo(() => state ? computeCarrierStats(effectiveRows, carrierType, lookupMap, holdLookupSet, holdNotes) : null, [state, effectiveRows, carrierType, lookupMap, holdLookupSet, holdNotes])

  // Đơn "Đang lấy hàng" chưa khớp file Chờ giao Logistics — cần kiểm tra tay
  const [onlyUnmatched, setOnlyUnmatched] = useState(false)
  const unmatchedRows = useMemo(() => {
    if (!state || !showNoteCol) return []
    return state.rows.filter(row => isHoldStatusRow(row, carrierType) && !holdLookupSet?.has(getTrackingCode(row, carrierType)))
  }, [state, carrierType, holdLookupSet, showNoteCol])

  const activeFilters = Object.entries(colFilters).filter(([, v]) => v?.length > 0)

  const filteredRows = useMemo(() => {
    if (!state) return []
    const q = search.toLowerCase()
    const base = onlyUnmatched ? unmatchedRows : state.rows
    return base.filter(row => {
      for (const [key, vals] of activeFilters) {
        if (!vals.includes(row[key])) return false
      }
      if (q) return Object.values(row).some(v => v.toLowerCase().includes(q))
      return true
    })
  }, [state, search, activeFilters, onlyUnmatched, unmatchedRows])

  // Dữ liệu dùng để tính option cho từng cột: áp dụng mọi filter khác, trừ filter của chính cột đó (lọc liên động)
  const dataForColumn = useCallback((excludeKey) => {
    if (!state) return []
    const q = search.toLowerCase()
    return (onlyUnmatched ? unmatchedRows : state.rows).filter(row => {
      for (const [key, vals] of activeFilters) {
        if (key === excludeKey) continue
        if (!vals.includes(row[key])) return false
      }
      if (q) return Object.values(row).some(v => v.toLowerCase().includes(q))
      return true
    })
  }, [state, search, activeFilters, onlyUnmatched, unmatchedRows])

  if (!state) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false) }}
          onDrop={handleDrop}
          onClick={() => inputRef.current.click()}
          className={`flex flex-col items-center justify-center gap-3 w-full h-48 rounded-2xl border-2 border-dashed cursor-pointer transition-all select-none
            ${dragging ? 'border-blue-500 bg-blue-50 scale-[1.01]' : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50/30'}`}
        >
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${dragging ? 'bg-blue-100' : 'bg-gray-100'}`}>
            {dragging ? <FileUp size={24} className="text-blue-500" /> : <Upload size={24} className="text-gray-400" />}
          </div>
          <div className="text-center">
            <p className="text-gray-700 font-semibold text-sm">Kéo & thả file xuất {label} vào đây</p>
            <p className="text-gray-400 text-xs mt-1">hoặc <span className="text-blue-600 underline font-medium">click để chọn file .xlsx</span></p>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => parseFile(e.target.files[0])} />
      </div>
    )
  }

  const effectiveTotal = stats['24h'] + stats['48h'] + stats['72h'] + stats.dangVanChuyen + stats.giaoLai + stats.hoanHang + stats.choLay

  return (
    <div>
      {weeks.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3 text-xs text-gray-400">
          <span>{weekId ? 'Tuần dữ liệu (cố định theo báo cáo đã lưu):' : 'Tuần dữ liệu (khớp theo ngày tuần Đơn C/DTP đang chọn ở trên):'}</span>
          <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-600 font-medium" title={state.fileName}>
            {state.fileName} · {new Date(state.uploadedAt).toLocaleDateString('vi-VN')}
          </span>
        </div>
      )}

      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
        {STAT_CARDS.map(c => (
          <StatCard
            key={c.key}
            icon={c.icon}
            value={stats[c.key]}
            label={c.label}
            cls={c.cls}
            pctOfTotal={effectiveTotal ? Math.round((stats[c.key] / effectiveTotal) * 100) : 0}
          />
        ))}
      </div>

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm">
          <FileSpreadsheet size={15} className="text-green-600 flex-shrink-0" />
          <span className="text-green-700 font-medium truncate max-w-72">{state.fileName}</span>
          <span className="text-green-500 text-xs">({effectiveTotal} đơn, {state.rows.length} dòng)</span>
          <button onClick={removeActiveWeek} className="ml-1 p-0.5 rounded hover:bg-green-100 text-green-400 hover:text-green-700" title="Xoá hẳn dữ liệu tuần này (các tuần khác không bị ảnh hưởng)">
            <X size={14} />
          </button>
        </div>
        <button
          onClick={() => inputRef.current.click()}
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:border-blue-400 hover:text-blue-600 text-gray-600 transition-colors"
        >
          <Upload size={14} />
          Upload tuần mới
        </button>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => parseFile(e.target.files[0])} />
        <span className="text-xs text-gray-400">Cập nhật: {new Date(state.uploadedAt).toLocaleString('vi-VN')}</span>
      </div>

      {carrierType === 'spx' && <NgoaiSanPanel carrierKey={carrierKey} spxRows={effectiveRows} />}

      {showNoteCol && (
        <div className="mb-5">
          <div className="flex items-center gap-2 flex-wrap">
            {holdWeeks.length === 0 && (
              <span className="text-xs text-gray-400">Chưa có file "Chờ giao Logistics" để đối chiếu đơn "Đang lấy hàng"</span>
            )}
            <button
              onClick={() => holdInputRef.current.click()}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:border-blue-400 hover:text-blue-600 text-gray-600 transition-colors"
            >
              <Upload size={14} />
              Upload tuần Chờ giao Logistics
            </button>
            <input ref={holdInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => parseHoldFile(e.target.files[0])} />
            {holdWeeks.length > 0 && (
              <span className="text-xs text-gray-400">Tổng {holdLookupSet.size} mã đối chiếu từ {holdWeeks.length} tuần đã upload</span>
            )}
            {holdWeeks.length > 0 && (
              unmatchedRows.length > 0 ? (
                <button
                  onClick={() => { setOnlyUnmatched(true); setTableExpanded(true) }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 hover:bg-red-100 transition-colors"
                >
                  <AlertTriangle size={14} />
                  Xem {unmatchedRows.length} đơn chưa khớp
                </button>
              ) : (
                <span className="flex items-center gap-1.5 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-600">
                  <CheckCircle size={14} />
                  0 đơn chưa khớp
                </span>
              )
            )}
          </div>
          {holdWeeks.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {holdWeeks.map(w => (
                <span key={w.id} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
                  <FileSpreadsheet size={12} />
                  <span className="max-w-48 truncate" title={w.fileName}>{w.fileName}</span>
                  <span className="text-blue-400">· {new Date(w.uploadedAt).toLocaleDateString('vi-VN')}</span>
                  <button onClick={() => removeHoldWeekEntry(w.id)} className="ml-0.5 text-blue-400 hover:text-red-500" title="Xoá tuần này">
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => setTableExpanded(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors text-left"
      >
        <List size={15} className="text-gray-500" />
        <span className="font-medium text-gray-700 text-sm">Danh sách chi tiết</span>
        {tableExpanded ? <ChevronUp size={15} className="text-gray-400 ml-auto" /> : <ChevronDown size={15} className="text-gray-400 ml-auto" />}
      </button>

      {tableExpanded && (
        <div className="mt-3">
          {onlyUnmatched && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              <AlertTriangle size={14} />
              Đang chỉ hiện {unmatchedRows.length} đơn "Đang lấy hàng" chưa khớp file Chờ giao Logistics
              <button onClick={() => setOnlyUnmatched(false)} className="ml-auto flex items-center gap-1 text-red-500 hover:text-red-700 font-medium">
                <X size={13} /> Bỏ lọc
              </button>
            </div>
          )}
          <div className="flex flex-wrap gap-2 mb-3 items-center">
            <div className="relative flex-1 min-w-48 max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="Tìm mã vận đơn, người nhận..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <span className="text-xs text-gray-400 whitespace-nowrap">
              {activeFilters.length > 0 || search || onlyUnmatched ? `${filteredRows.length}/${state.rows.length} dòng (đã lọc)` : `${state.rows.length} dòng`}
            </span>
            <div className="flex items-center gap-1.5 text-sm text-gray-500">
              <span>Hiển thị</span>
              <select
                value={pageSize}
                onChange={e => setPageSize(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n === 'all' ? 'Tất cả' : `${n} dòng`}</option>)}
              </select>
            </div>
          </div>

          {/* Thanh scroll trên đầu */}
          <div
            ref={topScrollRef}
            onScroll={syncFromTop}
            style={{ overflowX: 'scroll', overflowY: 'hidden', height: 16, marginBottom: 4 }}
          >
            <div style={{ height: 1, width: stableWidth }} />
          </div>

          <div ref={tableScrollRef} onScroll={syncFromTable} className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="text-sm border-collapse" style={{ tableLayout: 'fixed', width: stableWidth, minWidth: '100%' }}>
              <thead>
                <tr className="bg-[#1e3a5f] text-white text-xs">
                  {TABLE_COLUMNS.map(c => (
                    <th key={c} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap border border-white/20 relative" style={{ width: colWidths[c] }}>
                      <span className={colFilters[c]?.length > 0 ? 'text-yellow-300' : 'text-white'}>{c}</span>
                      <ColumnFilter
                        colKey={c}
                        data={dataForColumn(c)}
                        selected={colFilters[c] || []}
                        onChange={vals => setColFilter(c, vals)}
                      />
                      <ResizeHandle colKey={c} setWidth={setColWidth} />
                    </th>
                  ))}
                  {showNoteCol && (
                    <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap border border-white/20" style={{ width: NOTE_COL_WIDTH }}>
                      Ghi chú
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr><td colSpan={TABLE_COLUMNS.length + (showNoteCol ? 1 : 0)} className="text-center py-10 text-gray-400">Không có dữ liệu</td></tr>
                ) : (pageSize === 'all' ? filteredRows : filteredRows.slice(0, pageSize)).map((row, i) => {
                  const tenHang = (row['Tên hàng'] || '').trim()
                  const isExcludedRow = hasTenHang && excludedNames.includes(tenHang)
                  const code = showNoteCol ? getTrackingCode(row, carrierType) : null
                  const isUnmatchedHold = showNoteCol && isHoldStatusRow(row, carrierType) && !holdLookupSet?.has(code)
                  return (
                    <tr
                      key={i}
                      className={`border-b border-gray-100 text-[12px] ${
                        isExcludedRow ? 'opacity-40 hover:bg-blue-50/40'
                        : isUnmatchedHold ? 'bg-red-50 hover:bg-red-100'
                        : 'hover:bg-blue-50/40'
                      }`}
                      title={isUnmatchedHold ? 'Đơn "Đang lấy hàng" chưa khớp file Chờ giao Logistics — cần kiểm tra' : undefined}
                    >
                      {TABLE_COLUMNS.map(c => {
                        const isTenHangCol = c === 'Tên hàng'
                        return (
                          <td
                            key={c}
                            onClick={isTenHangCol && tenHang ? () => toggleExclude(tenHang) : undefined}
                            className={`px-3 py-2 border border-gray-200 ${isTenHangCol && tenHang ? 'cursor-pointer hover:bg-red-50' : ''}`}
                            style={{ maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            title={isTenHangCol && tenHang ? 'Bấm để loại trừ/khôi phục các đơn cùng "Tên hàng" khỏi thống kê' : undefined}
                          >
                            {row[c] || '—'}
                          </td>
                        )
                      })}
                      {showNoteCol && (
                        <td className="px-2 py-1 border border-gray-200">
                          <input
                            type="text"
                            value={holdNotes[code] || ''}
                            onChange={e => setHoldNote(code, e.target.value)}
                            placeholder={isUnmatchedHold ? 'Ghi chú theo dõi...' : ''}
                            className="w-full text-xs bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-blue-300 rounded px-1 py-0.5"
                          />
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {pageSize !== 'all' && filteredRows.length > pageSize && (
              <div className="text-center py-2 text-xs text-gray-400">Hiển thị {pageSize}/{filteredRows.length} dòng</div>
            )}
          </div>
        </div>
      )}

      {/* Thanh scroll cố định dưới cùng màn hình — luôn thấy được dù cuộn tới đâu */}
      {showBottomScroll && (
        <div
          ref={bottomScrollRef}
          onScroll={syncFromBottom}
          style={{ position: 'fixed', left: 0, right: 0, bottom: 0, overflowX: 'scroll', overflowY: 'hidden', height: 16, zIndex: 40, background: 'white', borderTop: '1px solid #e5e7eb' }}
        >
          <div style={{ height: 1, width: stableWidth }} />
        </div>
      )}
    </div>
  )
}

// type: 'donC' | 'donDTP' — SPX Express chỉ áp dụng cho Đơn C
export default function CarrierStats({ type }) {
  const showSpx = type === 'donC'
  const [tab, setTab] = useState('viettel')

  return (
    <div>
      <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1 mb-4 w-fit">
        <button
          onClick={() => setTab('viettel')}
          className={`px-4 py-1.5 rounded text-sm font-medium transition-all ${tab === 'viettel' ? 'bg-[#1e3a5f] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Viettel Post
        </button>
        {showSpx && (
          <button
            onClick={() => setTab('spx')}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-all ${tab === 'spx' ? 'bg-[#1e3a5f] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            SPX Express
          </button>
        )}
      </div>

      {tab === 'viettel' && <CarrierPanel carrierKey={`${type}_viettel`} label="Viettel Post" carrierType="viettel" />}
      {tab === 'spx' && showSpx && <CarrierPanel carrierKey={`${type}_spx`} label="SPX Express" carrierType="spx" />}
    </div>
  )
}
