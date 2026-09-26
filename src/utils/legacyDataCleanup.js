// Dọn 1 lần dữ liệu Supabase của 3 tab đã gỡ (Giao hàng Đơn C, Giao hàng Đơn DTP, Đơn hàng Sàn TMĐT).
// Không bao giờ đụng dữ liệu Gộp kênh — mọi khoá/mã của Gộp kênh đều có chữ "unified"
// (unified_trial_*, unifiedTrial_*).

export const OLD_CHANNELS = ['donC', 'donDTP']
export const OLD_CARRIER_KEYS = ['donC_viettel', 'donC_spx', 'donDTP_viettel', 'donDTP_spx']
const CARRIER_TABLES = ['carrier_weeks', 'carrier_hold_weeks', 'carrier_sales_order_weeks', 'carrier_packing_weeks']
const BUCKET = 'ops-files'
const CHUNK = 100

export function isLegacySettingKey(key) {
  const k = String(key || '')
  if (/unified/i.test(k)) return false
  if (k === 'tongdon_data_source') return true
  if (/^tongdon_pick_(donC|donDTP|tmdt)_/.test(k)) return true
  if (/^vc_edits_(donC|donDTP)$/.test(k)) return true
  if (/^chuagiao_(kh|override)_(donC|donDTP)_/.test(k)) return true
  return OLD_CARRIER_KEYS.some(ck => k.endsWith(`_${ck}`) || k.includes(`_${ck}_`))
}

function fail(error) { if (error) throw new Error(error.message || String(error)) }

function chunks(list) {
  const out = []
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK))
  return out
}

// Chỉ đọc — trả về đúng những gì sẽ bị xoá để người dùng xem trước.
export async function scanLegacyData(client) {
  const weeks = await client.from('report_weeks').select('id, channel, storage_path').in('channel', OLD_CHANNELS)
  fail(weeks.error)
  const sheets = await client.from('sheet_reports').select('id, channel').in('channel', OLD_CHANNELS)
  fail(sheets.error)
  const tmdt = await client.from('tmdt_reports').select('id')
  fail(tmdt.error)
  const carriers = {}
  for (const table of CARRIER_TABLES) {
    const res = await client.from(table).select('id, carrier_key, storage_path').in('carrier_key', OLD_CARRIER_KEYS)
    fail(res.error)
    carriers[table] = res.data || []
  }
  const settings = await client.from('ops_settings').select('key')
  fail(settings.error)
  return {
    reportWeeks: weeks.data || [],
    sheetReports: sheets.data || [],
    tmdtReports: tmdt.data || [],
    carriers,
    settingKeys: (settings.data || []).map(r => r.key).filter(isLegacySettingKey).sort(),
  }
}

const OLD_STORAGE_PREFIXES = [
  ...OLD_CHANNELS.map(c => `weeks/${c}/`),
  ...OLD_CARRIER_KEYS.flatMap(k => [`carriers/${k}/`, `carrier-holds/${k}/`, `carrier-sales-orders/${k}/`, `carrier-packing/${k}/`]),
]

// Chỉ giữ file nằm đúng thư mục của kênh/mã vận chuyển cũ.
export function storagePathsOf(scan) {
  return [
    ...scan.reportWeeks.map(r => r.storage_path),
    ...Object.values(scan.carriers).flat().map(r => r.storage_path),
  ].filter(p => p && OLD_STORAGE_PREFIXES.some(prefix => p.startsWith(prefix)))
}

// guard: điều kiện thêm (kênh/mã vận chuyển cũ) để dù id có trùng cũng không xoá nhầm dòng của phần khác.
async function deleteIn(client, table, column, values, guard) {
  for (const part of chunks(values)) {
    let query = client.from(table).delete().in(column, part)
    if (guard) query = query.in(guard.column, guard.values)
    fail((await query).error)
  }
}

// Xoá đúng những gì scanLegacyData đã liệt kê (không quét lại, để khớp 100% với danh sách người dùng đã xem).
export async function deleteLegacyData(client, scan) {
  const byChannel = { column: 'channel', values: OLD_CHANNELS }
  const byCarrier = { column: 'carrier_key', values: OLD_CARRIER_KEYS }
  await deleteIn(client, 'report_weeks', 'id', scan.reportWeeks.map(r => r.id), byChannel)
  await deleteIn(client, 'sheet_reports', 'id', scan.sheetReports.map(r => r.id), byChannel)
  await deleteIn(client, 'tmdt_reports', 'id', scan.tmdtReports.map(r => r.id))
  for (const [table, rows] of Object.entries(scan.carriers)) await deleteIn(client, table, 'id', rows.map(r => r.id), byCarrier)
  await deleteIn(client, 'ops_settings', 'key', scan.settingKeys.filter(isLegacySettingKey))
  const files = client.storage.from(BUCKET)
  for (const part of chunks(storagePathsOf(scan))) fail((await files.remove(part)).error)
}
