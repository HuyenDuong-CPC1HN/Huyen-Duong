import { useState } from 'react'

function storageKey(type) { return `weeks_${type}` }
function activeKey(type) { return `activeWeek_${type}` }

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

  const renameWeek = (id, label) => {
    const updated = weeks.map(w => w.id === id ? { ...w, label } : w)
    saveWeeks(type, updated)
    setWeeks(updated)
  }

  const selectWeek = (id) => {
    localStorage.setItem(activeKey(type), id)
    setActiveId(id)
  }

  return { weeks, activeWeek, activeId, addWeek, removeWeek, renameWeek, selectWeek }
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
}
