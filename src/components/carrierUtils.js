// Carrier utility functions extracted from CarrierStats.jsx for Fast Refresh compatibility.

import { opsStore as localStorage } from '../data/workspace'
import { buildInternalOrderLookup, buildTrackingSet, computeCarrierStats, isDonCHoldAsChoLay, getTrackingCode } from '../utils/parseCarrierExport'
import { reconcileNgoaiSan, buildSalesOrderLookup, buildPackingLookup } from '../utils/reconcileNgoaiSan'
import { useState, useEffect } from 'react'

// ---- Thời gian ân hạn trước khi thực sự xoá rows của 1 tuần VTP/SPX (giống cơ chế Excel Đơn C/DTP) —
// cho phép "Hoàn tác" trong vài phút. carrierKey có thể là null (vd donDTP không có SPX) — khi đó chỉ đứng yên.
function pendingClearCarrierKey(carrierKey) { return `pending_clear_carrier_${carrierKey}` }
function loadCarrierPendingClear(carrierKey) {
  try { return JSON.parse(localStorage.getItem(pendingClearCarrierKey(carrierKey)) || 'null') } catch { return null }
}
function clearCarrierWeekRows(carrierKey, weekId) {
  const weeks = readCarrierWeeks(carrierKey)
  const updated = weeks.map(w => w.id === weekId ? { ...w, rows: [] } : w)
  writeCarrierWeeks(carrierKey, updated)
}

// useCarrierRowsPendingClear — placed in this non-component file so Fast Refresh works.
// It is a React custom hook (uses useState/useEffect) but lives here so component-only files stay clean.
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

// ---- Lưu trữ dữ liệu upload theo TỪNG TUẦN, cố định/không bị ghi đè khi upload file mới ----
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

export function writeCarrierWeeks(carrierKey, weeks) {
  let list = weeks
  let triedFreeing = false
  while (list.length > 0) {
    try {
      localStorage.setItem(`carrier_weeks_${carrierKey}`, JSON.stringify(list))
      return list
    } catch (err) {
      if (!triedFreeing) { triedFreeing = true; continue }
      if (list.length <= 1) throw err
      list = list.slice(0, -1)
    }
  }
  throw new Error('Không thể lưu — dữ liệu quá lớn ngay cả với 1 tuần.')
}

export { readCarrierWeeks }

// Kiểm tra xem 1 tuần có dữ liệu rows không — dùng để xác định tuần "trống" (đã xoá rows sau khi đóng băng)
export function carrierWeekHasRows(carrierKey, weekId) {
  const w = readCarrierWeeks(carrierKey).find(w => w.id === weekId)
  return !!w?.rows?.length
}

// Lấy đúng dòng dữ liệu 1 tuần VTP/SPX theo id — dùng khi cần snapshot số liệu (vd đóng băng đối soát SPX)
export function getCarrierWeekRows(carrierKey, weekId) {
  return readCarrierWeeks(carrierKey).find(w => w.id === weekId)?.rows || []
}

// ---- File đối chiếu "Chờ giao Logistics" — dùng để xác nhận đơn "Đang lấy hàng" có thật đang xử lý không.
export function readHoldWeeks(carrierKey) {
  try {
    const weeks = JSON.parse(localStorage.getItem(`carrier_holdweeks_${carrierKey}`) || '[]')
    return Array.isArray(weeks) ? weeks : []
  } catch {
    return []
  }
}

// Chọn tuần có ngày upload GẦN NHẤT với referenceDate — đáng tin cậy hơn so với đếm vị trí trong danh sách
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

// Trả về id của file VTP/SPX khớp gần nhất với referenceDate — dùng để "đóng băng" đúng file tương ứng
// File (VTP/SPX/Chờ giao Logistics/Sales Order) thuộc phiên làm việc đang mở của tab Gộp kênh: có đúng
// sessionKey, hoặc — file không còn sessionKey (vd nạp lại từ máy chủ) — được tải lên SAU file Đơn của phiên
// này (sessionKey = thời điểm tải file Đơn). File của tuần trước luôn tải trước file Đơn tuần này nên không
// bị nhận nhầm.
export function belongsToSession(week, sessionKey) {
  if (!week || !sessionKey) return false
  if (week.sessionKey) return week.sessionKey === sessionKey
  const at = new Date(week.uploadedAt).getTime()
  const start = new Date(sessionKey).getTime()
  return Number.isFinite(at) && Number.isFinite(start) && at >= start
}
export function pickSessionWeek(weeks, sessionKey) {
  const own = (weeks || []).filter(w => belongsToSession(w, sessionKey))
  return own.find(w => w.sessionKey === sessionKey)
    || own.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))[0]
    || null
}

// Mã các file VTP/SPX đang được báo cáo tuần đã lưu ghim tới (spxWeekId/viettelWeekId) — không được tự dọn
// các file này khi tải thêm file mới, nếu không tuần đã lưu sẽ mất phần đối soát chi tiết.
const REPORT_STORAGE_KEYS = ['unified_trial_reports_donSO', 'unified_trial_reports_donTruyenThong', 'tongdon_reports']
export function referencedCarrierWeekIds() {
  const ids = new Set()
  const walk = (node) => {
    if (Array.isArray(node)) { node.forEach(walk); return }
    if (!node || typeof node !== 'object') return
    for (const [key, value] of Object.entries(node)) {
      if (/WeekId$/.test(key) && (typeof value === 'string' || typeof value === 'number')) ids.add(String(value))
      else if (value && typeof value === 'object') walk(value)
    }
  }
  for (const key of REPORT_STORAGE_KEYS) {
    try { walk(JSON.parse(localStorage.getItem(key) || 'null')) } catch { /* bỏ qua dữ liệu hỏng */ }
  }
  return ids
}

export function pickCarrierWeekIdByDate(carrierKey, referenceDate) {
  const weeks = readCarrierWeeks(carrierKey)
  return (pickSessionWeek(weeks, referenceDate) || closestByDate(weeks, referenceDate))?.id || null
}

// ---- Loại trừ theo TỪNG ĐƠN (Mã vận đơn) — áp dụng chung cho carrier (không riêng theo tuần)
function readExcludedOrders(carrierKey) {
  try { return JSON.parse(localStorage.getItem(`carrier_exclude_orders_${carrierKey}`) || '[]') } catch { return [] }
}
function filterExcludedRows(rows, carrierKey, carrierType) {
  const excluded = readExcludedOrders(carrierKey)
  if (excluded.length === 0) return rows
  const excludedSet = new Set(excluded)
  return rows.filter(r => !excludedSet.has(getTrackingCode(r, carrierType)))
}

// Gộp mã tracking từ TOÀN BỘ các tuần đã upload (tích luỹ dần) để đối chiếu
function getHoldLookupSet(carrierKey) {
  const weeks = readHoldWeeks(carrierKey)
  if (weeks.length === 0) return null
  const set = new Set()
  for (const w of weeks) for (const code of buildTrackingSet(w.rows, 'Mã vận đơn VT')) set.add(code)
  return set
}

// Ghi chú tay theo từng mã vận đơn
function readHoldNotesMap(carrierKey) {
  try { return JSON.parse(localStorage.getItem(`carrier_hold_notes_${carrierKey}`) || '{}') } catch { return {} }
}

// Tính stats cho 1 tuần cụ thể
function buildStatsForWeek(entry, carrierKey, carrierType, internalData, frozenLookup = null) {
  if (!entry) return null
  const lookupMap = frozenLookup ? new Map(Object.entries(frozenLookup)) : buildInternalOrderLookup(internalData)
  const holdLookupSet = getHoldLookupSet(carrierKey)
  const holdNotes = readHoldNotesMap(carrierKey)
  const effectiveRows = filterExcludedRows(entry.rows, carrierKey, carrierType)
  const stats = computeCarrierStats(effectiveRows, carrierType, lookupMap, holdLookupSet, holdNotes, {
    holdAsChoLay: isDonCHoldAsChoLay(carrierKey, carrierType, entry.uploadedAt),
  })
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

// Đóng băng bảng đối chiếu "Mã vận đơn" nội bộ (object nhỏ gọn, không phải toàn bộ dòng Excel)
export function snapshotCarrierLookup(internalData) {
  return Object.fromEntries(buildInternalOrderLookup(internalData))
}

// Lấy tổng đơn theo file VTP/SPX có ngày upload gần nhất với referenceDate
// requireSessionKey: dùng cho tab "Gộp kênh" (kho carrier_weeks_<key> dùng chung, không tách theo tuần) —
// chỉ lấy đúng file đã upload trong đúng phiên làm việc hiện tại (sessionKey khớp referenceDate, xem
// CarrierPanel/parseFile), KHÔNG tự "khớp theo ngày gần nhất" nữa. Thiếu cờ này thì tuần mới chưa upload
// vẫn có thể tự hiện nhầm số của tuần khác (y hệt bug đã sửa ở CarrierPanel, nhưng ở đây tính riêng cho
// KPI "Tổng đơn"/"Đối tác VC" qua computeChannelSnapshot, không đi qua CarrierPanel). Mặc định false để
// không đổi hành vi 2 tab sản xuất cũ (ThongKeGiaoHang/ThongKeDoiTac) — nơi đó không có khái niệm phiên.
export function getCarrierFileTotal(carrierKey, carrierType, internalData, referenceDate = null, requireSessionKey = false) {
  const weeks = readCarrierWeeks(carrierKey)
  const entry = requireSessionKey
    ? pickSessionWeek(weeks, referenceDate)
    : closestByDate(weeks, referenceDate)
  return entry ? buildStatsForWeek(entry, carrierKey, carrierType, internalData) : null
}

// ---- SPX Ngoại sàn utilities ----
function readSalesOrderWeeks(carrierKey) {
  try {
    const weeks = JSON.parse(localStorage.getItem(`carrier_salesorderweeks_${carrierKey}`) || '[]')
    return Array.isArray(weeks) ? weeks : []
  } catch {
    return []
  }
}

function readPackingWeeks(carrierKey) {
  try {
    const weeks = JSON.parse(localStorage.getItem(`carrier_packingweeks_${carrierKey}`) || '[]')
    return Array.isArray(weeks) ? weeks : []
  } catch {
    return []
  }
}

function readNgoaiSanExcluded(carrierKey) {
  try { return JSON.parse(localStorage.getItem(`carrier_ngoaisan_exclude_${carrierKey}`) || '[]') } catch { return [] }
}

// Đóng băng kết quả đối soát "đơn ngoại sàn" tại thời điểm lưu báo cáo tuần
export function computeFrozenNgoaiSan(carrierKey, spxRows) {
  const salesLookup = buildSalesOrderLookup(readSalesOrderWeeks(carrierKey))
  const packingLookup = buildPackingLookup(readPackingWeeks(carrierKey))
  const excludedSet = new Set(readNgoaiSanExcluded(carrierKey))
  return reconcileNgoaiSan(spxRows, salesLookup, packingLookup, excludedSet)
}
