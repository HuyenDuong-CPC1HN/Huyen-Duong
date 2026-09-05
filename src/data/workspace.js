import { supabase } from '../supabase'
import { createCarrierWeeksRepository } from './carrierWeeks'
import { createExpiryStockMonthsRepository } from './expiryStockMonths'
import { createGoodsReceiptBatchesRepository } from './goodsReceiptBatches'
import { createOpsSettingsRepository } from './opsSettings'
import { createReportWeeksRepository } from './reportWeeks'
import { createSheetReportsRepository } from './sheetReports'
import { createTmdtReportsRepository } from './tmdtReports'
import { createTongdonReportsRepository } from './tongdonReports'
import { createStorageFilesRepository } from './storageFiles'
import { createReportingCyclesRepository } from './reportingCycles'
import { createReturnRecordsRepository } from './returnRecords'

const values = new Map()
const pendingCollectionChanges = new Map()
let writeChain = Promise.resolve()

function encode(value) { return JSON.stringify(value) }
function decode(value) {
  try { return JSON.parse(value) } catch { return value }
}
function put(key, value) { values.set(key, value) }
function trackCollectionChanges(key, previousValue, nextValue) {
  const previous = decode(previousValue || '[]')
  const next = decode(nextValue || '[]')
  if (!Array.isArray(previous) || !Array.isArray(next)) return
  const priorById = new Map(previous.filter(Boolean).map(item => [String(item.id), item]))
  const nextById = new Map(next.filter(Boolean).map(item => [String(item.id), item]))
  const changes = pendingCollectionChanges.get(key) || { upserts: new Set(), deletes: new Set() }
  for (const [id, item] of nextById) {
    if (JSON.stringify(priorById.get(id)) !== JSON.stringify(item)) { changes.upserts.add(id); changes.deletes.delete(id) }
  }
  for (const id of priorById.keys()) if (!nextById.has(id)) { changes.deletes.add(id); changes.upserts.delete(id) }
  pendingCollectionChanges.set(key, changes)
}
function consumeChanges(key) {
  const changes = pendingCollectionChanges.get(key)
  pendingCollectionChanges.delete(key)
  return changes || { upserts: new Set(), deletes: new Set() }
}
function notifyError(error) {
  window.dispatchEvent(new CustomEvent('ops-store-error', { detail: error.message || String(error) }))
}

async function loadWeeks(client, channel) {
  const repo = createReportWeeksRepository(client)
  const records = await repo.list(channel)
  const weeks = await Promise.all(records.map(async record => ({
    id: record.id,
    label: record.label,
    fileName: record.file_name,
    uploadedAt: record.uploaded_at,
    data: await repo.loadRows(record),
  })))
  put(`weeks_${channel}`, encode(weeks))
  put(`activeWeek_${channel}`, records.find(record => record.is_active)?.id || weeks.at(-1)?.id || '')
}

async function loadCarriers(client) {
  const [weeksResult, holdsResult] = await Promise.all([
    client.from('carrier_weeks').select('*').order('uploaded_at', { ascending: false }),
    client.from('carrier_hold_weeks').select('*').order('uploaded_at', { ascending: false }),
  ])
  if (weeksResult.error || holdsResult.error) throw new Error(weeksResult.error?.message || holdsResult.error?.message)
  const repo = createCarrierWeeksRepository(client)
  const entries = await Promise.all((weeksResult.data || []).map(async record => [record.carrier_key, {
    id: record.id,
    fileName: record.file_name,
    uploadedAt: record.uploaded_at,
    rows: await repo.loadRows(record),
    isActive: record.is_active,
  }]))
  const byKey = new Map()
  for (const [key, entry] of entries) byKey.set(key, [...(byKey.get(key) || []), entry])
  for (const [key, weeks] of byKey) {
    put(`carrier_weeks_${key}`, encode(weeks))
    put(`carrier_active_${key}`, weeks.find(week => week.isActive)?.id || weeks[0]?.id || '')
  }
  const files = createStorageFilesRepository(client)
  const holdsByKey = new Map()
  for (const record of holdsResult.data || []) {
    const hold = { id: record.id, fileName: record.file_name, uploadedAt: record.uploaded_at, rows: await files.readJson(record.storage_path) }
    holdsByKey.set(record.carrier_key, [...(holdsByKey.get(record.carrier_key) || []), hold])
  }
  for (const [key, weeks] of holdsByKey) {
    put(`carrier_holdweeks_${key}`, encode(weeks))
  }
}

async function loadSalesOrderWeeks(client) {
  const { data, error } = await client.from('carrier_sales_order_weeks').select('*').order('uploaded_at', { ascending: false })
  if (error) throw new Error(error.message)
  const files = createStorageFilesRepository(client)
  const byKey = new Map()
  for (const record of data || []) {
    const week = { id: record.id, fileName: record.file_name, uploadedAt: record.uploaded_at, rows: await files.readJson(record.storage_path) }
    byKey.set(record.carrier_key, [...(byKey.get(record.carrier_key) || []), week])
  }
  for (const [key, weeks] of byKey) put(`carrier_salesorderweeks_${key}`, encode(weeks))
}

async function loadPackingWeeks(client) {
  const { data, error } = await client.from('carrier_packing_weeks').select('*').order('uploaded_at', { ascending: false })
  if (error) throw new Error(error.message)
  const files = createStorageFilesRepository(client)
  const byKey = new Map()
  for (const record of data || []) {
    const week = { id: record.id, fileName: record.file_name, uploadedAt: record.uploaded_at, rows: await files.readJson(record.storage_path) }
    byKey.set(record.carrier_key, [...(byKey.get(record.carrier_key) || []), week])
  }
  for (const [key, weeks] of byKey) put(`carrier_packingweeks_${key}`, encode(weeks))
}

async function loadExpiryStock(client) {
  const repo = createExpiryStockMonthsRepository(client)
  const records = await repo.list()
  const months = await Promise.all(records.map(async record => ({
    id: record.id,
    fileName: record.file_name,
    uploadedAt: record.uploaded_at,
    rows: await repo.loadRows(record),
  })))
  put('expiry_stock_months', encode(months))
  put('expiry_stock_active', records.find(record => record.is_active)?.id || months[0]?.id || '')
}

async function loadReturnRecords(client) {
  const records = await createReturnRecordsRepository(client).listAll()
  put('return_records', encode(records))
}

async function loadGoodsReceipt(client) {
  const repo = createGoodsReceiptBatchesRepository(client)
  const records = await repo.list()
  const batches = await Promise.all(records.map(async record => {
    const payload = await repo.loadBatch(record)
    return {
      id: record.id,
      processedAt: record.processed_at,
      pdfFileName: record.pdf_file_name,
      excelCFileName: record.excel_c_file_name,
      excelLgtFileName: record.excel_lgt_file_name,
      khoC: payload.khoC || [],
      khoLgt: payload.khoLgt || [],
    }
  }))
  put('goods_receipt_batches', encode(batches))
  put('goods_receipt_active', batches[0]?.id || '')
}

export async function loadWorkspace(client = supabase) {
  if (!client) throw new Error('Thiếu cấu hình Supabase.')
  values.clear()
  await Promise.all([loadWeeks(client, 'donC'), loadWeeks(client, 'donDTP'), loadCarriers(client)])
  try {
    await loadSalesOrderWeeks(client)
  } catch (error) {
    const message = error?.message || String(error)
    // Migration đối soát "đơn ngoại sàn" SPX COD có thể chưa được áp dụng — không chặn workspace chính vì việc này.
    if (!/carrier_sales_order_weeks|schema cache/i.test(message)) throw error
  }
  try {
    await loadPackingWeeks(client)
  } catch (error) {
    const message = error?.message || String(error)
    // Migration đối soát "đơn ngoại sàn" SPX COD (mốc đóng kiện) có thể chưa được áp dụng.
    if (!/carrier_packing_weeks|schema cache/i.test(message)) throw error
  }
  try {
    await loadExpiryStock(client)
  } catch (error) {
    const message = error?.message || String(error)
    // Migration tồn kho cận date có thể chưa được áp dụng — không chặn workspace chính vì việc này.
    if (!/expiry_stock_months|schema cache/i.test(message)) throw error
    put('expiry_stock_months', encode([]))
    put('expiry_stock_active', '')
  }
  try {
    await loadGoodsReceipt(client)
  } catch (error) {
    const message = error?.message || String(error)
    if (!/goods_receipt_batches|goods_receipt_lines|schema cache/i.test(message)) throw error
    put('goods_receipt_batches', encode([]))
    put('goods_receipt_active', '')
  }
  try {
    await loadReturnRecords(client)
  } catch (error) {
    const message = error?.message || String(error)
    // Migration theo dõi nhập trả lại có thể chưa được áp dụng — không chặn workspace chính vì việc này.
    if (!/return_records|return_record_invoices|return_record_products|schema cache/i.test(message)) throw error
    put('return_records', encode([]))
  }
  const [donCReports, donDtpReports, tongdon, tmdt, settingsResult] = await Promise.all([
    createSheetReportsRepository(client).list('donC'),
    createSheetReportsRepository(client).list('donDTP'),
    createTongdonReportsRepository(client).list(),
    createTmdtReportsRepository(client).list(),
    client.from('ops_settings').select('key,value'),
  ])
  if (settingsResult.error) throw new Error(settingsResult.error.message)

  let reportingCycles = []
  try {
    reportingCycles = await createReportingCyclesRepository(client).list()
  } catch (error) {
    const message = error?.message || String(error)
    // Analytics migration may not be applied yet — do not block core ops workspace.
    if (!/reporting_cycles|schema cache/i.test(message)) throw error
    reportingCycles = []
  }

  put('sheet_reports_donC', encode(donCReports))
  put('sheet_reports_donDTP', encode(donDtpReports))
  put('tongdon_reports', encode(tongdon))
  put('tmdt_reports', encode(tmdt))
  put('reporting_cycles', encode(reportingCycles))
  for (const setting of settingsResult.data || []) put(setting.key, encode(setting.value))
}

export async function refreshReportingCycles(client = supabase) {
  const reportingCycles = await createReportingCyclesRepository(client).list()
  put('reporting_cycles', encode(reportingCycles))
  return reportingCycles
}

export function clearWorkspaceCache() {
  values.clear()
  pendingCollectionChanges.clear()
}

async function syncWeeks(key) {
  const channel = key.replace('weeks_', '')
  const repo = createReportWeeksRepository(supabase)
  const weeks = decode(values.get(key) || '[]')
  const changes = consumeChanges(key)
  if (!changes.upserts.size && !changes.deletes.size) return
  const current = await repo.list(channel)
  const currentById = new Map(current.map(week => [String(week.id), week]))
  for (const week of weeks.filter(item => changes.upserts.has(String(item.id)))) {
    await repo.save({
      id: week.id,
      channel,
      label: week.label,
      fileName: week.fileName,
      uploadedAt: week.uploadedAt,
      rows: week.data || [],
      isActive: values.get(`activeWeek_${channel}`) === week.id,
    })
  }
  await Promise.all([...changes.deletes].map(id => currentById.get(id)).filter(Boolean).map(week => repo.remove(week)))
}

async function syncSheetReports(key) {
  const channel = key.replace('sheet_reports_', '')
  const repo = createSheetReportsRepository(supabase)
  const reports = decode(values.get(key) || '[]')
  const changes = consumeChanges(key)
  for (const report of reports.filter(item => changes.upserts.has(String(item.id)))) await repo.save(channel, report)
  await Promise.all([...changes.deletes].map(id => repo.remove(channel, id)))
}

async function syncReports(key, repo) {
  const reports = decode(values.get(key) || '[]')
  const changes = consumeChanges(key)
  for (const report of reports.filter(item => changes.upserts.has(String(item.id)))) await repo.save(report)
  await Promise.all([...changes.deletes].map(id => repo.remove(id)))
}

async function syncCarrierWeeks(key) {
  const carrierKey = key.replace('carrier_weeks_', '')
  const repo = createCarrierWeeksRepository(supabase)
  const weeks = decode(values.get(key) || '[]')
  const changes = consumeChanges(key)
  if (!changes.upserts.size && !changes.deletes.size) return
  const existing = await repo.list(carrierKey)
  const existingById = new Map(existing.map(week => [String(week.id), week]))
  for (const week of weeks.filter(item => changes.upserts.has(String(item.id)))) {
    await repo.save({
      id: week.id,
      carrierKey,
      carrierType: carrierKey.endsWith('_spx') ? 'spx' : 'viettel',
      fileName: week.fileName,
      uploadedAt: week.uploadedAt,
      rows: week.data || week.rows || [],
      isActive: values.get(`carrier_active_${carrierKey}`) === week.id,
    })
  }
  await Promise.all([...changes.deletes].map(id => existingById.get(id)).filter(Boolean).map(week => repo.remove(week)))
}

async function syncHoldWeeks(key) {
  const carrierKey = key.replace('carrier_holdweeks_', '')
  const weeks = decode(values.get(key) || '[]')
  const changes = consumeChanges(key)
  if (!changes.upserts.size && !changes.deletes.size) return
  const { data: current, error: readError } = await supabase.from('carrier_hold_weeks').select('*').eq('carrier_key', carrierKey)
  if (readError) throw new Error(readError.message)
  const files = createStorageFilesRepository(supabase)
  const currentById = new Map((current || []).map(week => [week.id, week]))
  for (const week of weeks.filter(item => changes.upserts.has(String(item.id)))) {
    const storagePath = `carrier-holds/${carrierKey}/${week.id}.json`
    await files.writeJson(storagePath, week.rows || week.data || [])
    const { error } = await supabase.from('carrier_hold_weeks').upsert({ id: week.id, carrier_key: carrierKey, file_name: week.fileName || null, uploaded_at: week.uploadedAt, storage_path: storagePath })
    if (error) throw new Error(error.message)
  }
  for (const id of changes.deletes) {
    const week = currentById.get(id)
    if (!week) continue
    const { error } = await supabase.from('carrier_hold_weeks').delete().eq('id', week.id)
    if (error) throw new Error(error.message)
    await files.remove(week.storage_path)
  }
}

async function syncSalesOrderWeeks(key) {
  const carrierKey = key.replace('carrier_salesorderweeks_', '')
  const weeks = decode(values.get(key) || '[]')
  const changes = consumeChanges(key)
  if (!changes.upserts.size && !changes.deletes.size) return
  const { data: current, error: readError } = await supabase.from('carrier_sales_order_weeks').select('*').eq('carrier_key', carrierKey)
  if (readError) throw new Error(readError.message)
  const files = createStorageFilesRepository(supabase)
  const currentById = new Map((current || []).map(week => [week.id, week]))
  for (const week of weeks.filter(item => changes.upserts.has(String(item.id)))) {
    const storagePath = `carrier-sales-orders/${carrierKey}/${week.id}.json`
    await files.writeJson(storagePath, week.rows || week.data || [])
    const { error } = await supabase.from('carrier_sales_order_weeks').upsert({ id: week.id, carrier_key: carrierKey, file_name: week.fileName || null, uploaded_at: week.uploadedAt, storage_path: storagePath })
    if (error) throw new Error(error.message)
  }
  for (const id of changes.deletes) {
    const week = currentById.get(id)
    if (!week) continue
    const { error } = await supabase.from('carrier_sales_order_weeks').delete().eq('id', week.id)
    if (error) throw new Error(error.message)
    await files.remove(week.storage_path)
  }
}

async function syncPackingWeeks(key) {
  const carrierKey = key.replace('carrier_packingweeks_', '')
  const weeks = decode(values.get(key) || '[]')
  const changes = consumeChanges(key)
  if (!changes.upserts.size && !changes.deletes.size) return
  const { data: current, error: readError } = await supabase.from('carrier_packing_weeks').select('*').eq('carrier_key', carrierKey)
  if (readError) throw new Error(readError.message)
  const files = createStorageFilesRepository(supabase)
  const currentById = new Map((current || []).map(week => [week.id, week]))
  for (const week of weeks.filter(item => changes.upserts.has(String(item.id)))) {
    const storagePath = `carrier-packing/${carrierKey}/${week.id}.json`
    await files.writeJson(storagePath, week.rows || week.data || [])
    const { error } = await supabase.from('carrier_packing_weeks').upsert({ id: week.id, carrier_key: carrierKey, file_name: week.fileName || null, uploaded_at: week.uploadedAt, storage_path: storagePath })
    if (error) throw new Error(error.message)
  }
  for (const id of changes.deletes) {
    const week = currentById.get(id)
    if (!week) continue
    const { error } = await supabase.from('carrier_packing_weeks').delete().eq('id', week.id)
    if (error) throw new Error(error.message)
    await files.remove(week.storage_path)
  }
}

async function syncExpiryStockMonths(key) {
  const repo = createExpiryStockMonthsRepository(supabase)
  const months = decode(values.get(key) || '[]')
  const changes = consumeChanges(key)
  if (!changes.upserts.size && !changes.deletes.size) return
  const current = await repo.list()
  const currentById = new Map(current.map(month => [String(month.id), month]))
  for (const month of months.filter(item => changes.upserts.has(String(item.id)))) {
    await repo.save({
      id: month.id,
      fileName: month.fileName,
      uploadedAt: month.uploadedAt,
      rows: month.rows || [],
      isActive: values.get('expiry_stock_active') === month.id,
    })
  }
  await Promise.all([...changes.deletes].map(id => currentById.get(id)).filter(Boolean).map(month => repo.remove(month)))
}

async function syncGoodsReceiptBatches(key) {
  const repo = createGoodsReceiptBatchesRepository(supabase)
  const batches = decode(values.get(key) || '[]')
  const changes = consumeChanges(key)
  if (!changes.upserts.size && !changes.deletes.size) return
  const current = await repo.list()
  const currentById = new Map(current.map(batch => [String(batch.id), batch]))
  for (const batch of batches.filter(item => changes.upserts.has(String(item.id)))) {
    await repo.save({
      id: batch.id,
      processedAt: batch.processedAt,
      pdfFileName: batch.pdfFileName,
      excelCFileName: batch.excelCFileName,
      excelLgtFileName: batch.excelLgtFileName,
      bienBanTongFileName: batch.bienBanTongFileName,
      bienBanTongStoragePath: batch.bienBanTongStoragePath,
      khoC: batch.khoC || [],
      khoLgt: batch.khoLgt || [],
    })
  }
  await Promise.all([...changes.deletes].map(id => currentById.get(id)).filter(Boolean).map(batch => repo.remove(batch)))
}

async function syncReturnRecords(key) {
  const repo = createReturnRecordsRepository(supabase)
  const records = decode(values.get(key) || '[]')
  const changes = consumeChanges(key)
  if (!changes.upserts.size && !changes.deletes.size) return
  for (const record of records.filter(item => changes.upserts.has(String(item.id)))) {
    await repo.save(record)
  }
  await Promise.all([...changes.deletes].map(id => repo.remove(id)))
}

async function persist(key) {
  if (key.startsWith('weeks_')) return syncWeeks(key)
  if (key.startsWith('activeWeek_')) return createReportWeeksRepository(supabase).setActive(key.replace('activeWeek_', ''), values.get(key) || '')
  if (key.startsWith('sheet_reports_')) return syncSheetReports(key)
  if (key === 'tongdon_reports') return syncReports(key, createTongdonReportsRepository(supabase))
  if (key === 'tmdt_reports') return syncReports(key, createTmdtReportsRepository(supabase))
  if (key.startsWith('carrier_weeks_')) return syncCarrierWeeks(key)
  if (key.startsWith('carrier_holdweeks_')) return syncHoldWeeks(key)
  if (key.startsWith('carrier_salesorderweeks_')) return syncSalesOrderWeeks(key)
  if (key.startsWith('carrier_packingweeks_')) return syncPackingWeeks(key)
  if (key === 'expiry_stock_months') return syncExpiryStockMonths(key)
  if (key === 'expiry_stock_active') return createExpiryStockMonthsRepository(supabase).setActive(values.get(key) || '')
  if (key === 'goods_receipt_batches') return syncGoodsReceiptBatches(key)
  if (key === 'return_records') return syncReturnRecords(key)
  return createOpsSettingsRepository(supabase).set(key, decode(values.get(key)))
}

export const opsStore = {
  getItem(key) { return values.get(key) ?? null },
  setItem(key, value) {
    if (!navigator.onLine) {
      notifyError(new Error('Bạn đang ngoại tuyến. Ứng dụng chỉ hoạt động khi có Internet.'))
      return Promise.resolve()
    }
    trackCollectionChanges(key, values.get(key), String(value))
    put(key, String(value))
    writeChain = writeChain.then(() => persist(key)).catch(notifyError)
    return writeChain
  },
  removeItem(key) {
    if (!navigator.onLine) {
      notifyError(new Error('Bạn đang ngoại tuyến. Ứng dụng chỉ hoạt động khi có Internet.'))
      return Promise.resolve()
    }
    trackCollectionChanges(key, values.get(key), '[]')
    values.delete(key)
    writeChain = writeChain.then(async () => {
      if (key.startsWith('sheet_reports_')) return syncSheetReports(key)
      if (key === 'tongdon_reports') return syncReports(key, createTongdonReportsRepository(supabase))
      if (key === 'tmdt_reports') return syncReports(key, createTmdtReportsRepository(supabase))
      if (key.startsWith('weeks_')) return syncWeeks(key)
      if (key.startsWith('carrier_weeks_')) return syncCarrierWeeks(key)
      if (key.startsWith('carrier_holdweeks_')) return syncHoldWeeks(key)
  if (key.startsWith('carrier_salesorderweeks_')) return syncSalesOrderWeeks(key)
  if (key.startsWith('carrier_packingweeks_')) return syncPackingWeeks(key)
      if (key === 'expiry_stock_months') return syncExpiryStockMonths(key)
      if (key === 'goods_receipt_batches') return syncGoodsReceiptBatches(key)
      if (key === 'return_records') return syncReturnRecords(key)
      return createOpsSettingsRepository(supabase).remove(key)
    }).catch(notifyError)
    return writeChain
  },
}
