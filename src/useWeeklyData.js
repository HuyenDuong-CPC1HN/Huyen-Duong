import { useState, useEffect } from 'react'
import { opsStore as localStorage } from './data/workspace'

function storageKey(type) { return `weeks_${type}` }
function activeKey(type) { return `activeWeek_${type}` }
function pendingClearKey(type) { return `pending_clear_${type}` }

function loadPendingClear(type) {
  try { return JSON.parse(localStorage.getItem(pendingClearKey(type)) || 'null') } catch { return null }
}

function loadWeeks(type) {
  try {
    return JSON.parse(localStorage.getItem(storageKey(type)) || '[]')
  } catch { return [] }
}

function saveWeeks(type, weeks) {
  try {
    localStorage.setItem(storageKey(type), JSON.stringify(weeks))
    return true
  } catch { return false }
}

export function useWeeklyData(type) {
  const [weeks, setWeeks] = useState(() => loadWeeks(type))
  const [activeId, setActiveId] = useState(() => {
    const saved = localStorage.getItem(activeKey(type))
    const all = loadWeeks(type)
    // fallback to latest week if saved id not found
    if (all.find(w => w.id === saved)) return saved
    return all[all.length - 1]?.id || null
  })

  const activeWeek = weeks.find(w => w.id === activeId) || null

  const addWeek = (rows, fileName) => {
    const now = new Date()
    const label = fileName
      ? fileName.replace(/\.(xlsx|xls|csv)$/i, '')
      : `Tuần ${getWeekNumber(now)} - ${now.getFullYear()}`
    const id = `${type}_${Date.now()}`
    const newWeek = { id, label, fileName, uploadedAt: now.toISOString(), data: rows }

    const updated = [...weeks, newWeek]
    const ok = saveWeeks(type, updated)
    if (!ok) {
      // localStorage full: just keep last 4 weeks
      const trimmed = [...weeks.slice(-3), newWeek]
      saveWeeks(type, trimmed)
      setWeeks(trimmed)
    } else {
      setWeeks(updated)
    }
    localStorage.setItem(activeKey(type), id)
    setActiveId(id)
  }

  const removeWeek = (id) => {
    const updated = weeks.filter(w => w.id !== id)
    saveWeeks(type, updated)
    setWeeks(updated)
    if (activeId === id) {
      const next = updated[updated.length - 1]?.id || null
      localStorage.setItem(activeKey(type), next || '')
      setActiveId(next)
    }
  }

  // Chỉ giữ lại các tuần có id trong keepIds (dùng khi báo cáo Tổng đơn đã lưu, không cần giữ Excel các tuần cũ hơn để đỡ tốn bộ nhớ)
  const pruneToIds = (keepIds) => {
    const updated = weeks.filter(w => keepIds.includes(w.id))
    if (updated.length === weeks.length) return
    saveWeeks(type, updated)
    setWeeks(updated)
  }

  // Xoá phần dữ liệu chi tiết (rows) của 1 tuần sau khi đã "Lưu số liệu tuần này" (đóng băng số liệu) —
  // KHÔNG xoá hẳn khỏi danh sách, tuần vẫn hiện trong "Lịch sử upload" để chọn lại xem báo cáo đã lưu.
  // Cập nhật theo kiểu functional (setWeeks(prev => ...)) vì hàm này còn được gọi từ bộ đếm hết hạn ân hạn
  // (setTimeout) — lúc đó biến `weeks` trong closure có thể đã cũ nếu người dùng upload tuần mới trong lúc chờ.
  const clearWeekData = (id) => {
    setWeeks(prev => {
      const updated = prev.map(w => w.id === id ? { ...w, data: [] } : w)
      saveWeeks(type, updated)
      return updated
    })
  }

  // ---- Thời gian ân hạn trước khi thực sự xoá Excel gốc sau khi "Lưu số liệu tuần này" ----
  // Cho phép "Hoàn tác" trong vài phút, tránh mất dữ liệu nếu lỡ bấm nhầm/số liệu chưa đúng.
  const [pendingClear, setPendingClear] = useState(() => loadPendingClear(type))

  const schedulePendingClear = (id, delayMs = 3 * 60 * 1000) => {
    const info = { weekId: id, clearAt: Date.now() + delayMs }
    localStorage.setItem(pendingClearKey(type), JSON.stringify(info))
    setPendingClear(info)
  }

  const cancelPendingClear = () => {
    localStorage.removeItem(pendingClearKey(type))
    setPendingClear(null)
  }

  // Hết thời gian ân hạn thì thực sự xoá — kể cả khi mới mở lại trang (không cần đợi tab luôn mở)
  useEffect(() => {
    if (!pendingClear) return
    const remaining = pendingClear.clearAt - Date.now()
    const finalize = () => {
      clearWeekData(pendingClear.weekId)
      localStorage.removeItem(pendingClearKey(type))
      setPendingClear(null)
    }
    if (remaining <= 0) { finalize(); return }
    const timer = setTimeout(finalize, remaining)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingClear])

  const renameWeek = (id, label) => {
    const updated = weeks.map(w => w.id === id ? { ...w, label } : w)
    saveWeeks(type, updated)
    setWeeks(updated)
  }

  const selectWeek = (id) => {
    localStorage.setItem(activeKey(type), id)
    setActiveId(id)
  }

  return {
    weeks, activeWeek, activeId, addWeek, removeWeek, renameWeek, selectWeek, pruneToIds, clearWeekData,
    pendingClear, schedulePendingClear, cancelPendingClear,
  }
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
}
