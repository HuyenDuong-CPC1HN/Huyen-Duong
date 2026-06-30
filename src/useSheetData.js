import { useState, useEffect, useCallback } from 'react'

const CSV_URL = (id, gid) =>
  `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`

function parseCSV(text) {
  const lines = text.split('\n').filter(Boolean)
  if (lines.length < 2) return []
  const headers = parseRow(lines[0])
  return lines.slice(1).map(line => {
    const vals = parseRow(line)
    const row = {}
    headers.forEach((h, i) => { row[h.trim()] = (vals[i] || '').trim() })
    return row
  })
}

function parseRow(line) {
  const result = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { inQ = !inQ }
    else if (c === ',' && !inQ) { result.push(cur); cur = '' }
    else { cur += c }
  }
  result.push(cur)
  return result
}

export function useSheetData(sheetId, gid) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(CSV_URL(sheetId, gid))
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      setData(parseCSV(text))
      setLastRefresh(new Date())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [sheetId, gid])

  useEffect(() => { load() }, [load])

  return { data, loading, error, refresh: load, lastRefresh }
}
