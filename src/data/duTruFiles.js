import { opsStore } from './workspace'

// Tab "Dự trù hàng": lưu lại số liệu các file nhập – xuất – tồn đã tải (bản đã đọc, gọn), để mở lại tab không phải tải lại.
// Số liệu nằm ở Supabase Storage (bucket ops-files, thư mục dutru/<kho>/), danh mục ở ops_settings khoá dutru_files_<kho>:
// { [ô]: { path, name, from, to, days, nMa, at } }. Tải file mới vào ô thì thay bản cũ; "Bỏ file" thì xoá.
const META_KEY = branch => `dutru_files_${branch}`

async function repo() {
  const [{ createStorageFilesRepository }, { supabase }] = await Promise.all([import('./storageFiles'), import('../supabase')])
  return createStorageFilesRepository(supabase)
}

export function readDuTruFilesMeta(branch = 'C') {
  try {
    const v = JSON.parse(opsStore.getItem(META_KEY(branch)) || 'null')
    return v && typeof v === 'object' ? v : {}
  } catch { return {} }
}
const writeMeta = (branch, meta) => opsStore.setItem(META_KEY(branch), JSON.stringify(meta))

// Bỏ các dòng lô toàn số 0 (giữ 1 dòng / mã × kho để còn tên, ĐVT và mã vẫn có mặt ở kho đó); mỗi dòng 1 mảng cho gọn.
export function packNxt(f) {
  const seen = new Set()
  const d = []
  for (const r of f.data) {
    const k = `${r.ma}|${r.kho}`
    if (!(r.td || r.nh || r.x || r.tc) && seen.has(k)) continue
    seen.add(k)
    d.push([r.ma, r.ten, r.dvt, r.kho, r.lo, r.hd, r.td, r.nh, r.x, r.tc])
  }
  return { v: 1, name: f.name, from: f.from.toISOString(), to: f.to.toISOString(), days: f.days, nMa: f.nMa, nRows: f.data.length, d }
}
export function unpackNxt(p) {
  const data = p.d.map(([ma, ten, dvt, kho, lo, hd, td, nh, x, tc]) => ({ ma, ten, dvt, kho, lo, hd, td, nh, x, tc }))
  return { name: p.name, from: new Date(p.from), to: new Date(p.to), days: p.days, nMa: p.nMa, data, savedRows: p.nRows }
}

export async function saveDuTruFile(slot, f, branch = 'C') {
  const r = await repo()
  const old = readDuTruFilesMeta(branch)[slot]
  const at = new Date().toISOString()
  const path = `dutru/${branch}/${slot}-${Date.now()}.json`
  await r.writeJson(path, packNxt(f))
  writeMeta(branch, { ...readDuTruFilesMeta(branch), [slot]: { path, name: f.name, from: f.from.toISOString(), to: f.to.toISOString(), days: f.days, nMa: f.nMa, at } })
  if (old?.path && old.path !== path) r.remove(old.path).catch(() => {})
  return at
}

// Trả về { [ô]: file đã đọc (kèm savedAt) } — ô nào tải lỗi thì bỏ qua, báo trong errors.
export async function loadDuTruFiles(branch = 'C') {
  const meta = readDuTruFilesMeta(branch)
  const slots = Object.keys(meta)
  if (!slots.length) return { files: {}, errors: {} }
  const r = await repo()
  const files = {}
  const errors = {}
  await Promise.all(slots.map(async s => {
    try { files[s] = { ...unpackNxt(await r.readJson(meta[s].path)), savedAt: meta[s].at } }
    catch (err) { errors[s] = err.message }
  }))
  return { files, errors }
}

export async function removeDuTruFile(slot, branch = 'C') {
  const meta = readDuTruFilesMeta(branch)
  const old = meta[slot]
  if (!old) return
  const next = { ...meta }
  delete next[slot]
  writeMeta(branch, next)
  if (old.path) (await repo()).remove(old.path).catch(() => {})
}
