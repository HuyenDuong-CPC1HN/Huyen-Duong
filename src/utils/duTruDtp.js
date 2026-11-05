// Dự trù Kho DTP: hàng thực tế như Kho C nhưng quản lý trên 2 hệ thống, mã khác nhau.
// - File "Tồn sổ sách Fast U": Báo cáo tổng hợp nhập xuất tồn theo kho (mã U: TH…, TP…, MP…) — tồn cuối sổ sách,
//   các hàng xuất kho cuối ngày mới cập nhật. Đọc bằng parseNxtXml (cùng mẫu với Kho C).
// - File "Tồn thực tế Web" (.xlsx, mã C ở cột "Mã BFO") — tồn cập nhật tức thời.
// - Bảng quy đổi mã C ↔ U (.xlsx): Mã SP C · Tên sản phẩm · Đơn vị · Số lượng · Quy đổi U · Mã SP U · Đơn vị U.
// So 2 tồn theo mã U: chênh lệch = tồn thực tế − tồn sổ sách. Dự trù dùng tồn thực tế.
import { buildDuTruModel, isJW, jwCandidates, normText } from './duTru'

const num = v => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0 }
const up = v => String(v ?? '').trim().toUpperCase()
const findHeader = (rows, label) => rows.findIndex(r => (r || []).some(v => normText(v) === label))
const colsOf = (head, map) => {
  const col = {}
  head.forEach((v, i) => { const k = map[normText(v)]; if (k && col[k] === undefined) col[k] = i })
  return col
}
// "11/07/28" / "11/07/2028" / "2028-07-11" → "2028-07-11"
function isoDate(v) {
  const s = String(v ?? '').trim()
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s)
  if (!m) return ''
  const y = m[3].length === 2 ? `20${m[3]}` : m[3]
  return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

const MAP_COLS = { 'ma sp c': 'c', 'ten san pham': 'ten', 'don vi': 'dvt', 'so luong': 'sl', 'quy doi u': 'qd', 'ma sp u': 'u', 'don vi u': 'dvtU' }
// rows: mảng 2 chiều đọc từ sheet. Trả về [{ c, ten, dvt, k, u, dvtU }] — k: 1 đơn vị C = k đơn vị U.
export function parseMapCU(rows) {
  const hi = findHeader(rows, 'ma sp c')
  if (hi < 0) throw new Error('File quy đổi cần cột "Mã SP C" và "Mã SP U".')
  const col = colsOf(rows[hi], MAP_COLS)
  if (col.u === undefined) throw new Error('File quy đổi thiếu cột "Mã SP U".')
  const out = []
  for (const r of rows.slice(hi + 1)) {
    const c = up(r[col.c])
    const u = up(r[col.u])
    if (!c || !u) continue
    const sl = num(r[col.sl]) || 1
    const qd = num(r[col.qd]) || sl
    out.push({ c, ten: String(r[col.ten] ?? '').trim(), dvt: String(r[col.dvt] ?? '').trim(), k: qd / sl, u, dvtU: String(r[col.dvtU] ?? '').trim() })
  }
  if (!out.length) throw new Error('File quy đổi không có dòng mã nào.')
  return out
}

const WEB_COLS = { 'ma bfo': 'ma', 'ten san pham': 'ten', 'so lo': 'lo', 'han dung': 'hd', 'kho': 'kho', 'luong nhap': 'nh', 'luong xuat': 'x', 'luong ton': 'tc', 'dvt': 'dvt' }
// File tồn Web (.xlsx) → cùng dạng kết quả parseNxtXml ({ from, to, days, data, nMa }) để lưu / dùng chung; mã là mã C.
export function parseWebTon(rows, now = new Date()) {
  const hi = findHeader(rows, 'ma bfo')
  if (hi < 0) throw new Error('File tồn Web cần cột "Mã BFO" (mã hàng), "Số lô", "Lượng tồn".')
  const col = colsOf(rows[hi], WEB_COLS)
  if (col.tc === undefined) throw new Error('File tồn Web thiếu cột "Lượng tồn".')
  const data = []
  for (const r of rows.slice(hi + 1)) {
    const ma = up(r[col.ma])
    if (!ma) continue
    data.push({ ma, ten: String(r[col.ten] ?? '').trim(), dvt: String(r[col.dvt] ?? '').trim(), kho: String(r[col.kho] ?? '').trim(), lo: String(r[col.lo] ?? '').trim(),
      hd: isoDate(r[col.hd]), td: 0, nh: num(r[col.nh]), x: num(r[col.x]), tc: num(r[col.tc]) })
  }
  if (!data.length) throw new Error('File tồn Web không có dòng hàng nào.')
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return { from: day, to: day, days: 1, data, nMa: new Set(data.map(d => d.ma)).size }
}

// So tồn theo mã U. fast: file Fast U (mã U) · web: file Web (mã C) · map: parseMapCU.
// Trả về { rows: [{ u, ten, dvt, codesC, ss, tt, diff, xuat, lots: [{ lo, hd, ss, tt }] }], webUnmapped: [{ ma, ten, tt }], days }
export function buildDtpCompare(fast, web, map) {
  const c2 = new Map(map.map(m => [m.c, m]))
  const uC = new Map()
  for (const m of map) uC.set(m.u, [...(uC.get(m.u) || []), m.c])
  const by = new Map()
  const get = (u, ten, dvt) => {
    let g = by.get(u)
    if (!g) by.set(u, g = { u, ten: ten || '', dvt: dvt || '', codesC: uC.get(u) || [], ss: 0, tt: 0, xuat: 0, lots: new Map(), inFast: false, inWeb: false })
    return g
  }
  const lot = (g, lo, hd) => {
    const k = up(lo)
    let l = g.lots.get(k)
    if (!l) g.lots.set(k, l = { lo: lo || '', hd: hd || '', ss: 0, tt: 0 })
    if (!l.hd && hd) l.hd = hd
    return l
  }
  for (const d of fast?.data || []) {
    const g = get(d.ma, d.ten, d.dvt)
    g.inFast = true
    if (!g.ten) g.ten = d.ten
    g.ss += d.tc
    g.xuat += d.x
    if (d.tc) lot(g, d.lo, d.hd).ss += d.tc
  }
  const webUnmapped = new Map()
  for (const d of web?.data || []) {
    const m = c2.get(d.ma)
    if (!m) { const w = webUnmapped.get(d.ma) || { ma: d.ma, ten: d.ten, tt: 0 }; w.tt += d.tc; webUnmapped.set(d.ma, w); continue }
    const g = get(m.u, m.ten || d.ten, d.dvt)
    g.inWeb = true
    const q = d.tc * m.k
    g.tt += q
    if (q) lot(g, d.lo, d.hd).tt += q
  }
  const rows = [...by.values()].map(g => ({ ...g, diff: g.tt - g.ss, lots: [...g.lots.values()].sort((a, b) => String(a.hd).localeCompare(String(b.hd))) }))
  const collator = new Intl.Collator('vi', { sensitivity: 'base', numeric: true })
  rows.sort((a, b) => collator.compare(a.ten, b.ten) || a.u.localeCompare(b.u))
  return { rows, webUnmapped: [...webUnmapped.values()], days: fast?.days || 0 }
}

// Tồn thực tế (Web) theo mã U để dự trù thay cho tồn sổ sách: Map mã U → tồn.
export const ttByU = cmp => new Map(cmp.rows.filter(r => r.inWeb || r.inFast).map(r => [r.u, r.tt]))

// Kho SO: sổ sách và Web cùng hệ mã C, nhưng 1 sản phẩm có thể mang 2 mã (sổ sách ghi mã J / W, Web ghi mã nhận điều).
// Gom mã cùng sản phẩm: trùng tên + ĐVT (tự gom) + nhóm anh đã ghép (manual: [[mã…]], gồm cả nhóm ghép ở Kho C).
// Mỗi nhóm quy về 1 mã đại diện (ưu tiên mã nhận điều, rồi mã có trên Web). Trả về:
// { map: dạng parseMapCU (mã → mã đại diện), rep: Map mã → mã đại diện, pool: model chung 2 file (tên, ĐVT),
//   pending: [{ order, p0, TON, X3, cands }] mã J / W chưa ghép có gợi ý mã nhận điều trên file }.
export function soGroups(fast, web, manual = [], jwAlone = []) {
  const pool = buildDuTruModel({ f3: { ...fast, data: [...(fast?.data || []), ...(web?.data || [])] } })
  const codes = Object.keys(pool.prod)
  const parent = new Map(codes.map(c => [c, c]))
  const find = c => { let r = c; while (parent.get(r) !== r) r = parent.get(r); parent.set(c, r); return r }
  const union = (a, b) => { if (parent.has(a) && parent.has(b)) parent.set(find(a), find(b)) }
  const byName = new Map()
  for (const p of Object.values(pool.prod)) {
    const k = `${normText(p.ten)}|${normText(p.dvt)}`
    if (byName.has(k)) union(p.ma, byName.get(k)); else byName.set(k, p.ma)
  }
  for (const g of manual) for (let i = 1; i < g.length; i++) union(g[0], g[i])
  const members = new Map()
  for (const c of codes) members.set(find(c), [...(members.get(find(c)) || []), c])
  const onWeb = new Set((web?.data || []).map(d => d.ma))
  const rep = new Map()
  for (const list of members.values()) {
    const r = [...list].sort((a, b) => (isJW(a) - isJW(b)) || (onWeb.has(b) - onWeb.has(a)) || a.localeCompare(b))[0]
    for (const c of list) rep.set(c, r)
  }
  const map = codes.map(c => ({ c, ten: pool.prod[rep.get(c)].ten, dvt: pool.prod[rep.get(c)].dvt, k: 1, u: rep.get(c), dvtU: pool.prod[rep.get(c)].dvt }))
  const alone = new Set(jwAlone)
  const sum = (c, f) => (fast?.data || []).filter(d => d.ma === c).reduce((s, d) => s + d[f], 0)
  const pending = []
  for (const list of members.values()) {
    if (list.length > 1 || !isJW(list[0]) || alone.has(list[0])) continue
    const c = list[0]
    const cands = jwCandidates(pool, { kho: pool.khoCodes }, c).filter(x => rep.get(x.ma) !== c)
    if (cands.length) pending.push({ order: c, p0: pool.prod[c], TON: sum(c, 'tc'), X3: sum(c, 'x'), cands })
  }
  return { map, rep, pool, pending }
}
// File sổ sách quy về mã đại diện (để dự trù theo nhóm sản phẩm)
export const remapFile = (f, rep, pool) => (f ? { ...f, data: f.data.map(d => { const r = rep.get(d.ma) || d.ma; return r === d.ma ? d : { ...d, ma: r, ten: pool.prod[r]?.ten || d.ten } }) } : f)
