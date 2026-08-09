#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'ops-files'

export function assembleKvstore(documents, { withWarnings = false } = {}) {
  const byId = new Map(documents.map(document => [document.id, document.data]))
  const values = new Map()
  const warnings = []
  for (const [id, data] of byId) {
    if (id.includes('__chunk')) continue
    const key = decodeURIComponent(id)
    if (data.chunked) {
      let value = ''
      for (let index = 0; index < data.chunkCount; index += 1) {
        const chunk = byId.get(`${id}__chunk${index}`)
        if (chunk?.value === undefined) warnings.push(`Missing chunk: ${id}__chunk${index}`)
        else value += chunk.value
      }
      values.set(key, value)
    } else if (data.value !== undefined) values.set(key, data.value)
  }
  for (const id of byId.keys()) {
    if (id.includes('__chunk') && !byId.has(id.split('__chunk')[0])) warnings.push(`Orphan chunk: ${id}`)
  }
  return withWarnings ? { values, warnings } : values
}

function parseJson(value, fallback) {
  try { return JSON.parse(value) } catch { return fallback }
}

export function mapKey(key, value) {
  if (key.startsWith('weeks_')) {
    const channel = key.slice('weeks_'.length)
    const weeks = parseJson(value, [])
    return {
      kind: 'report_weeks',
      rows: weeks.filter(Boolean).map(week => ({
        id: week.id, channel, label: week.label || week.fileName || week.id, file_name: week.fileName || null,
        uploaded_at: week.uploadedAt || new Date().toISOString(), storage_path: `weeks/${channel}/${week.id}.json`, is_active: false,
      })),
      files: weeks.filter(Boolean).map(week => ({ path: `weeks/${channel}/${week.id}.json`, value: week.data || [] })),
    }
  }
  if (key.startsWith('sheet_reports_')) {
    const channel = key.slice('sheet_reports_'.length)
    const reports = parseJson(value, [])
    return { kind: 'sheet_reports', rows: reports.filter(Boolean).map(report => ({ id: report.id, channel, week_id: report.id, label: report.label || report.id, payload: report })) }
  }
  if (key === 'tongdon_reports') {
    return { kind: 'tongdon_reports', rows: parseJson(value, []).filter(Boolean).map(report => ({ id: String(report.id), label: report.label || null, payload: report })) }
  }
  if (key === 'tmdt_reports') {
    return { kind: 'tmdt_reports', rows: parseJson(value, []).filter(Boolean).map(report => ({ id: String(report.id), report_key: report.key, label: report.label || report.key, date_from: report.dateFrom, date_to: report.dateTo, payload: report })) }
  }
  if (key.startsWith('carrier_weeks_')) {
    const carrierKey = key.slice('carrier_weeks_'.length)
    const type = carrierKey.endsWith('_spx') ? 'spx' : 'viettel'
    const weeks = parseJson(value, [])
    return {
      kind: 'carrier_weeks',
      rows: weeks.filter(Boolean).map(week => ({ id: week.id, carrier_key: carrierKey, carrier_type: type, file_name: week.fileName || null, uploaded_at: week.uploadedAt || new Date().toISOString(), storage_path: `carriers/${carrierKey}/${week.id}.json`, is_active: false })),
      files: weeks.filter(Boolean).map(week => ({ path: `carriers/${carrierKey}/${week.id}.json`, value: week.data || week.rows || [] })),
    }
  }
  if (key.startsWith('carrier_holdweeks_')) {
    const carrierKey = key.slice('carrier_holdweeks_'.length)
    const weeks = parseJson(value, [])
    return {
      kind: 'carrier_hold_weeks',
      rows: weeks.filter(Boolean).map(week => ({ id: week.id, carrier_key: carrierKey, file_name: week.fileName || null, uploaded_at: week.uploadedAt || new Date().toISOString(), storage_path: `carrier-holds/${carrierKey}/${week.id}.json` })),
      files: weeks.filter(Boolean).map(week => ({ path: `carrier-holds/${carrierKey}/${week.id}.json`, value: week.data || week.rows || [] })),
    }
  }
  return { kind: 'ops_settings', rows: [{ key, value: parseJson(value, value) }] }
}

async function fetchFirestoreDocuments() {
  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!rawServiceAccount) throw new Error('Thiếu FIREBASE_SERVICE_ACCOUNT_JSON. Script chỉ chạy local/offline.')
  const serviceAccount = JSON.parse(rawServiceAccount)
  const admin = await import('firebase-admin')
  const app = admin.apps.length ? admin.app() : admin.initializeApp({ credential: admin.cert(serviceAccount) })
  const snapshot = await admin.getFirestore(app).collection('kvstore').get()
  return snapshot.docs.map(document => ({ id: document.id, data: document.data() }))
}

async function writeMapping(client, mapping, dryRun, counts) {
  counts[mapping.kind] = (counts[mapping.kind] || 0) + mapping.rows.length
  if (dryRun) return
  for (const file of mapping.files || []) {
    const { error } = await client.storage.from(BUCKET).upload(file.path, new Blob([JSON.stringify(file.value)], { type: 'application/json' }), { upsert: true, contentType: 'application/json' })
    if (error) throw new Error(`Storage ${file.path}: ${error.message}`)
  }
  if (mapping.rows.length) {
    const { error } = await client.from(mapping.kind).upsert(mapping.rows)
    if (error) throw new Error(`${mapping.kind}: ${error.message}`)
  }
}

async function setActiveRows(client, values, dryRun) {
  for (const channel of ['donC', 'donDTP']) {
    const id = values.get(`activeWeek_${channel}`)
    if (!id || dryRun) continue
    let result = await client.from('report_weeks').update({ is_active: false }).eq('channel', channel)
    if (result.error) throw new Error(result.error.message)
    result = await client.from('report_weeks').update({ is_active: true }).eq('id', id).eq('channel', channel)
    if (result.error) throw new Error(result.error.message)
  }
  for (const [key, id] of values) {
    if (!key.startsWith('carrier_active_') || !id || dryRun) continue
    const carrierKey = key.slice('carrier_active_'.length)
    let result = await client.from('carrier_weeks').update({ is_active: false }).eq('carrier_key', carrierKey)
    if (result.error) throw new Error(result.error.message)
    result = await client.from('carrier_weeks').update({ is_active: true }).eq('id', id).eq('carrier_key', carrierKey)
    if (result.error) throw new Error(result.error.message)
  }
}

async function main() {
  const args = new Set(process.argv.slice(2))
  const dryRun = args.has('--dry-run')
  const fixtureFlag = [...args].find(arg => arg.startsWith('--fixture='))
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('Thiếu SUPABASE_URL (hoặc VITE_SUPABASE_URL cho dry-run).')
  if (!dryRun && !serviceRole) throw new Error('Thiếu SUPABASE_SERVICE_ROLE_KEY. Không thể migrate thật.')
  const documents = fixtureFlag
    ? JSON.parse(await readFile(fixtureFlag.slice('--fixture='.length), 'utf8'))
    : await fetchFirestoreDocuments()
  const { values, warnings } = assembleKvstore(documents, { withWarnings: true })
  if (warnings.length && !dryRun) throw new Error(`Dừng migrate vì Firestore chunk không đầy đủ: ${warnings.join('; ')}`)
  const client = dryRun ? null : createClient(url, serviceRole)
  const counts = {}
  for (const [key, value] of values) await writeMapping(client, mapKey(key, value), dryRun, counts)
  if (!dryRun) await setActiveRows(client, values, false)
  console.log(JSON.stringify({ dryRun, inputKeys: values.size, migrated: counts, warnings }, null, 2))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`Migration failed: ${error.message}`); process.exitCode = 1 })
}
