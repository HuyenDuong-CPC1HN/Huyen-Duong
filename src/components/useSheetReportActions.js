/**
 * Extracts sheet-report actions from SheetReportPanel.
 * Logic is copied verbatim — no business rules change.
 *
 * Responsibilities:
 *  - handleSave / handleUndo / handleRelink / handleExportImage / handleClearCarrierNow
 *  - isPendingClear + latestClearAt (pending-clear countdown)
 *  - pendingBannerProps (for rendering in context bar or inline)
 */
import { useState, useEffect, useCallback } from 'react'
import { toPng } from 'html-to-image'
import { partnerType } from '../utils/partnerType'
import { deliveryBucket } from '../utils/deliveryDays'
import {
  pickCarrierWeekIdByDate, snapshotCarrierLookup,
  getCarrierFileStats, useCarrierRowsPendingClear,
} from './CarrierStats'
import {
  readSheetReports, saveSheetReport, removeSheetReport,
  relinkSheetReportCarrier,
} from '../utils/sheetReports'

/** Compute bucket counts from raw data rows — used by handleSave. */
export function computeBuckets(data) {
  const validData = data.filter(r => String(r['Mã kiện hàng'] ?? '').trim())
  let b24 = 0, b48 = 0, b72 = 0, chanhXeCount = 0
  for (const row of validData) {
    const t = partnerType(row)
    if (t === 'tructiep') {
      const bucket = deliveryBucket(row)
      if (bucket === '24') b24++
      else if (bucket === '48') b48++
      else if (bucket === '72') b72++
    } else if (t === 'chanhxe') {
      chanhXeCount++
    }
  }
  return { b24, b48, b72, chanhXeCount }
}

/** Format remaining time string. `now` is injected so the pending-clear countdown can re-render. */
function formatRemaining(clearAt, now = Date.now()) {
  const ms = Math.max(0, clearAt - now)
  const totalSec = Math.ceil(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return min > 0 ? `${min} phút ${sec} giây` : `${sec} giây`
}

export function useSheetReportActions({
  type,
  data,
  weekId,
  weekLabel,
  referenceDate,
  pendingClear: excelPendingClear,
  onSaved,
  onUndoClear,
  exportRef,
  listExpanded,
  setListExpanded,
}) {
  // Carrier pending-clear timers (viettel + spx)
  const viettelPending = useCarrierRowsPendingClear(`${type}_viettel`)
  const spxPending = useCarrierRowsPendingClear(type === 'donC' ? 'donC_spx' : null)

  const [reports, setReports] = useState(() => readSheetReports(type))

  const [exporting, setExporting] = useState(false)

  // Snapshot mode: no live data but weekId matches a saved report
  const snapshot = (!data || data.length === 0)
    ? reports.find(r => r.id === weekId)
    : null

  // Active pending-clear items (excel + viettel + spx)
  const excelPending = excelPendingClear && excelPendingClear.weekId === weekId ? excelPendingClear : null
  const viettelCarrierPending = snapshot && viettelPending.pendingClear?.weekId === snapshot.viettelWeekId
    ? viettelPending.pendingClear
    : null
  const spxCarrierPending = snapshot && spxPending.pendingClear?.weekId === snapshot.spxWeekId
    ? spxPending.pendingClear
    : null

  const activePendings = [excelPending, viettelCarrierPending, spxCarrierPending].filter(Boolean)
  const isPendingClear = activePendings.length > 0
  const latestClearAt = isPendingClear ? Math.max(...activePendings.map(p => p.clearAt)) : null

  // Tick wall-clock so the pending-clear countdown stays live
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    if (!isPendingClear) return
    const timer = setInterval(() => setNowMs(Date.now()), 5000)
    return () => clearInterval(timer)
  }, [isPendingClear])

  const canSave = Boolean(weekId && !snapshot && !isPendingClear)
  const canUpload = !snapshot

  const handleSave = useCallback(() => {
    if (!weekId) return
    const buckets = computeBuckets(data)
    const viettelWeekId = pickCarrierWeekIdByDate(`${type}_viettel`, referenceDate)
    const spxWeekId = type === 'donC' ? pickCarrierWeekIdByDate('donC_spx', referenceDate) : null
    const carrierLookup = snapshotCarrierLookup(data)
    const viettelFrozen = viettelWeekId
      ? getCarrierFileStats(`${type}_viettel`, 'viettel', data, viettelWeekId)
      : null
    const spxFrozen = spxWeekId
      ? getCarrierFileStats('donC_spx', 'spx', data, spxWeekId)
      : null
    const label = weekLabel || new Date().toLocaleDateString('vi-VN')
    const next = saveSheetReport(type, weekId, label, {
      ...buckets,
      viettelWeekId,
      spxWeekId,
      carrierLookup,
      viettelFrozen,
      spxFrozen,
    })
    setReports(next)
    onSaved?.(weekId)
    if (viettelWeekId) viettelPending.scheduleClear(viettelWeekId)
    if (spxWeekId) spxPending.scheduleClear(spxWeekId)
  }, [type, data, weekId, weekLabel, referenceDate, onSaved, viettelPending, spxPending])

  const handleUndo = useCallback(() => {
    if (excelPending) {
      onUndoClear?.()
      viettelPending.cancelClear()
      spxPending.cancelClear()
      const next = removeSheetReport(type, weekId)
      setReports(next)
    } else {
      if (viettelCarrierPending) viettelPending.cancelClear()
      if (spxCarrierPending) spxPending.cancelClear()
    }
  }, [excelPending, onUndoClear, viettelPending, spxPending, viettelCarrierPending, spxCarrierPending, type, weekId])

  const handleRelink = useCallback(() => {
    if (!weekId) return
    const viettelWeekId = pickCarrierWeekIdByDate(`${type}_viettel`, referenceDate)
    const spxWeekId = type === 'donC' ? pickCarrierWeekIdByDate('donC_spx', referenceDate) : null
    const next = relinkSheetReportCarrier(type, weekId, { viettelWeekId, spxWeekId })
    setReports(next)
  }, [type, weekId, referenceDate])

  const handleExportImage = useCallback(async () => {
    if (!exportRef?.current) return
    setExporting(true)
    try {
      const wasExpanded = listExpanded
      if (!wasExpanded) {
        setListExpanded?.(true)
        // Wait for DOM to settle after accordion open
        await new Promise(r => setTimeout(r, 300))
      }
      const dataUrl = await toPng(exportRef.current, { backgroundColor: '#ffffff', pixelRatio: 2 })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `${type === 'donC' ? 'DonC' : 'DonDTP'}_${weekLabel || weekId}.png`
      a.click()
    } catch {
      window.alert('Không xuất được ảnh, vui lòng thử lại.')
    } finally {
      setExporting(false)
    }
  }, [exportRef, listExpanded, setListExpanded, type, weekLabel, weekId])

  const handlePrint = useCallback(() => {
    window.print()
  }, [])

  const handleClearCarrierNow = useCallback((which) => {
    const snap = reports.find(r => r.id === weekId)
    if (!snap) return
    if (which === 'viettel' && snap.viettelWeekId) {
      const viettelFrozen = getCarrierFileStats(`${type}_viettel`, 'viettel', [], snap.viettelWeekId, snap.carrierLookup)
      const next = relinkSheetReportCarrier(type, weekId, {
        viettelWeekId: snap.viettelWeekId,
        spxWeekId: snap.spxWeekId,
        viettelFrozen,
      })
      setReports(next)
      viettelPending.scheduleClear(snap.viettelWeekId)
    } else if (which === 'spx' && snap.spxWeekId) {
      const spxFrozen = getCarrierFileStats('donC_spx', 'spx', [], snap.spxWeekId, snap.carrierLookup)
      const next = relinkSheetReportCarrier(type, weekId, {
        viettelWeekId: snap.viettelWeekId,
        spxWeekId: snap.spxWeekId,
        spxFrozen,
      })
      setReports(next)
      spxPending.scheduleClear(snap.spxWeekId)
    }
  }, [reports, type, weekId, viettelPending, spxPending])

  const pendingBannerProps = isPendingClear ? {
    message: excelPending
      ? 'Đã lưu số liệu — Excel gốc và dòng dữ liệu Viettel Post/SPX Express sẽ tự xoá sau '
      : 'Dòng dữ liệu VTP/SPX sẽ tự xoá sau ',
    timeRemaining: formatRemaining(latestClearAt, nowMs),
    onUndo: handleUndo,
  } : null

  return {
    snapshot,
    isPendingClear,
    latestClearAt,
    canSave,
    canUpload,
    handleSave,
    handleUndo,
    handleRelink,
    handleExportImage,
    handlePrint,
    handleClearCarrierNow,
    exporting,
    pendingBannerProps,
    reports,
  }
}
