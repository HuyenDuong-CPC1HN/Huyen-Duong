// Tab "Dự trù hàng" (Kho C): đọc file "Báo cáo tổng hợp nhập xuất tồn theo kho" (Excel dạng XML xuất từ phần mềm),
// cộng chung các mã kho được chọn, gộp mã vật tư cùng sản phẩm, tính đề xuất đặt hàng tuần.
// Chỉ lấy đúng số trong file: không tự trừ hay ước tính phần điều chuyển, trả, huỷ (Sl xuất tạm coi là xuất bán).

export const KHO_DEFAULT_C = ['020101', '020102']
export const KHO_NAME_DEFAULT_C = { '020101': 'Kho nhận điều', '020102': 'Kho mua ngoài, đối tác' }
export const SEA_MIN = 0.7
export const SEA_MAX = 1.5
const DAY = 86400000
const MONTH_DAYS = 30.44

export const normText = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim()
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const pad2 = n => String(n).padStart(2, '0')
const nf = new Intl.NumberFormat('vi-VN')
export const fmtN = v => (Number.isFinite(v) ? nf.format(Math.round(v)) : '—')
export const fmt1 = v => (Number.isFinite(v) ? (Math.round(v * 10) / 10).toLocaleString('vi-VN') : '—')
export const fmt2 = v => (Number.isFinite(v) ? (Math.round(v * 100) / 100).toLocaleString('vi-VN') : '—')
export const fmtW = v => (Number.isFinite(v) ? `${fmt1(v)} tuần` : '—')
export const fmtDmy = d => (d ? `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}` : '')

// ---------- Đọc file ----------
const COLS = { 'ma vat tu': 'ma', 'ten vat tu': 'ten', 'ma kho': 'kho', 'dvt': 'dvt', 'ma lo': 'lo', 'han dung': 'hd', 'ton dau': 'td', 'sl nhap': 'nh', 'sl xuat': 'x', 'ton cuoi': 'tc' }
const COL_LABEL = { ma: 'Mã vật tư', kho: 'Mã kho', x: 'Sl xuất', tc: 'Tồn cuối' }
const SS = 'urn:schemas-microsoft-com:office:spreadsheet'

function cellsOf(row) {
  const out = []
  let i = 0
  for (const c of row.children) {
    if (c.localName !== 'Cell') continue
    const idx = c.getAttributeNS(SS, 'Index') || c.getAttribute('ss:Index')
    if (idx) i = Number(idx) - 1
    const d = c.getElementsByTagNameNS('*', 'Data')[0]
    out[i++] = d ? d.textContent.trim() : ''
  }
  return out
}
const num = v => { const n = parseFloat(String(v || '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0 }

// text: nội dung file. Trả về { from, to, days, data: [{ ma, ten, dvt, kho, lo, hd, td, nh, x, tc }], nMa }; lỗi thì ném Error.
export function parseNxtXml(text) {
  if (!/<Workbook[\s>]/.test(String(text).slice(0, 5000))) throw new Error('File không đúng dạng: cần file Excel dạng XML xuất từ phần mềm, mẫu "Báo cáo tổng hợp nhập xuất tồn theo kho".')
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Không đọc được file (cấu trúc XML bị lỗi).')
  const rows = [...doc.getElementsByTagNameNS('*', 'Row')].map(cellsOf)
  let from = null
  let to = null
  for (const r of rows.slice(0, 20)) for (const v of r) {
    const m = /Từ ngày\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*đến ngày\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(v || '')
    if (m && !from) { from = new Date(+m[3], m[2] - 1, +m[1]); to = new Date(+m[6], m[5] - 1, +m[4]) }
  }
  if (!from) throw new Error('Không thấy dòng "Từ ngày … đến ngày …" để biết kỳ báo cáo.')
  const hi = rows.findIndex(r => r.some(v => normText(v) === 'ma vat tu'))
  if (hi < 0) throw new Error('Không thấy dòng tiêu đề có cột "Mã vật tư".')
  const col = {}
  rows[hi].forEach((v, i) => { const k = COLS[normText(v)]; if (k && col[k] === undefined) col[k] = i })
  const miss = ['ma', 'kho', 'x', 'tc'].filter(k => col[k] === undefined)
  if (miss.length) throw new Error(`File thiếu cột: ${miss.map(k => COL_LABEL[k]).join(', ')}.`)
  const data = []
  for (const r of rows.slice(hi + 1)) {
    const ma = String(r[col.ma] || '').trim().toUpperCase()
    if (!ma) continue // dòng tổng / dòng trống
    data.push({
      ma, ten: r[col.ten] || '', dvt: r[col.dvt] || '', kho: String(r[col.kho] || '').trim(), lo: r[col.lo] || '', hd: String(r[col.hd] || '').slice(0, 10),
      td: num(r[col.td]), nh: num(r[col.nh]), x: num(r[col.x]), tc: num(r[col.tc]),
    })
  }
  if (!data.length) throw new Error('File không có dòng hàng nào.')
  return { from, to, days: Math.round((to - from) / DAY) + 1, data, nMa: new Set(data.map(d => d.ma)).size }
}

// ---------- Mô hình từ các file ----------
// files: { f3 (bắt buộc), f4, fw, ly3, lyn } — mỗi file là kết quả parseNxtXml.
// rows: mỗi dòng = mã vật tư × mã kho (đã cộng các lô); x4 / xw / tcw lấy từ file 4 tuần / tuần này cùng mã × mã kho.
export function buildDuTruModel(files) {
  const { f3, f4, fw, ly3, lyn } = files
  if (!f3) return null
  const key = (ma, kho) => `${ma}|${kho}`
  const agg = f => {
    const m = new Map()
    for (const d of f.data) {
      const k = key(d.ma, d.kho)
      let a = m.get(k)
      if (!a) m.set(k, a = { ma: d.ma, kho: d.kho, td: 0, nh: 0, x: 0, tc: 0, lots: [] })
      a.td += d.td; a.nh += d.nh; a.x += d.x; a.tc += d.tc
      if (d.tc > 0) a.lots.push({ lo: d.lo, hd: d.hd, q: d.tc })
    }
    return m
  }
  const main = agg(f3), m4 = f4 ? agg(f4) : null, mw = fw ? agg(fw) : null
  const rows = [...main.values()].map(a => {
    const k = key(a.ma, a.kho)
    return { ...a, x4: m4 ? (m4.get(k)?.x ?? 0) : null, xw: mw ? (mw.get(k)?.x ?? 0) : null, tcw: mw ? (mw.get(k)?.tc ?? null) : null }
  })
  const prod = {}
  for (const d of f3.data) if (!prod[d.ma]) prod[d.ma] = { ma: d.ma, ten: d.ten, dvt: d.dvt }
  const byMa = new Map()
  for (const r of rows) { if (!byMa.has(r.ma)) byMa.set(r.ma, []); byMa.get(r.ma).push(r) }
  const khoCodes = [...new Set(rows.map(r => r.kho))].sort()
  const khoStats = Object.fromEntries(khoCodes.map(c => {
    const rs = rows.filter(r => r.kho === c)
    return [c, { nMa: new Set(rs.map(r => r.ma)).size, tc: rs.reduce((s, r) => s + r.tc, 0), x: rs.reduce((s, r) => s + r.x, 0) }]
  }))
  const lyMap = f => { const m = new Map(); if (f) for (const d of f.data) m.set(key(d.ma, d.kho), (m.get(key(d.ma, d.kho)) || 0) + d.x); return m }
  return {
    D3: f3.days, D4: f4?.days || 0, DW: fw?.days || 0, has4: !!f4, hasW: !!fw, hasLY: !!(ly3 && lyn),
    ly3: lyMap(ly3), lyn: lyMap(lyn), lyD3: ly3?.days || 0, lyDn: lyn?.days || 0,
    rows, prod, byMa, khoCodes, khoStats, from: f3.from, to: f3.to,
  }
}

// ---------- Mã cùng sản phẩm ----------
// Mã J / W = hàng mua ngoài, đối tác; mã khác = hàng nhận điều. Chỉ dùng để chọn mã đặt hàng mặc định, không tách nguồn.
export const isJW = c => /^[JW]/i.test(c)
const rowsOf = (model, kho, c) => (model.byMa.get(c) || []).filter(r => kho.has(r.kho))
const sales = (model, kho, c) => rowsOf(model, kho, c).reduce((s, r) => s + r.x, 0)
// Mã đặt hàng mặc định: ưu tiên mã nhận điều; nhiều mã thì lấy mã bán nhiều nhất trong các kho đang chọn
export const defaultOrder = (model, kho, codes) => [...codes].sort((a, b) => (isJW(a) - isJW(b)) || (sales(model, kho, b) - sales(model, kho, a)) || a.localeCompare(b))[0]

// Nhóm mã: nhóm anh gộp tay + app tự tìm mã trùng tên + ĐVT (trong các kho đang chọn). settings: { kho, merge, manual }
// Nhóm gộp tay xét trước; nhóm tự tìm đã nằm trọn trong nhóm gộp tay (đang gộp) thì bỏ.
export function groupsOf(model, settings) {
  const kho = new Set(settings.kho)
  const by = {}
  for (const p of Object.values(model.prod)) {
    if (!rowsOf(model, kho, p.ma).length) continue
    ;(by[`${normText(p.ten)}|${normText(p.dvt)}`] ||= []).push(p.ma)
  }
  const auto = Object.entries(by).filter(([, v]) => v.length > 1).map(([key, codes]) => ({ key, codes: codes.sort(), auto: true }))
  const manual = (settings.manual || []).map(codes => ({ key: `manual:${codes.join(',')}`, codes: codes.filter(c => model.prod[c]), auto: false })).filter(g => g.codes.length > 1)
  const covered = new Set(manual.filter(g => groupOn(settings, g)).flatMap(g => g.codes))
  return [...manual, ...auto.filter(g => !g.codes.every(c => covered.has(c)))]
}
export const groupOn = (settings, g) => (settings.merge?.[g.key] || {}).on !== false
export function groupOrder(model, settings, g) {
  const m = settings.merge?.[g.key] || {}
  return g.codes.includes(m.order) ? m.order : defaultOrder(model, new Set(settings.kho), g.codes)
}

// ---------- Mã J / W đứng riêng: gợi ý mã nhận điều cùng sản phẩm ----------
// Tên 2 mã thường ghi khác nhau ("Afenemi - H20 0.5ml" / "Afenemi - Hộp 4 vỉ x 5 ống 0.5ml") nên không tự gộp được.
// App chỉ gợi ý: mã không J / W, cùng ĐVT, cùng chữ đầu của tên, giống nhau nhiều nhất (quy cách, số ống / hộp). Anh chọn mới gộp.
const PACK_WORDS = new Set(['hop', 'vi', 'x', 'ong', 'lo', 'chai', 'goi', 'vien', 'tuyp', 'h', 'binh', 'tui', 'cai', 'kem', 'hang', 'km', 'khuyen', 'mai'])
const tokenCache = new WeakMap()
function nameTokens(model, ma) {
  let cache = tokenCache.get(model)
  if (!cache) tokenCache.set(model, cache = new Map())
  if (cache.has(ma)) return cache.get(ma)
  const s = normText(model.prod[ma].ten).replace(/(\d),(\d)/g, '$1.$2').replace(/(\d)\s+(ml|mg|mcg|g|kg|l|ui|iu|%)(?![a-z])/g, '$1$2')
  const m = /\b(\d+)\s*vi\s*x\s*(\d+)/.exec(s)
  const h = m ? null : /\bh\s*(\d+)\b/.exec(s) || /\bhop\s+(\d+)\s+(ong|lo|goi|vien|tuyp|chai|tui)\b/.exec(s)
  const pack = m ? m[1] * m[2] : h ? Number(h[1]) : 0 // số đơn vị / hộp: "H20" = "4 vỉ x 5"
  const words = s.split(/[^a-z0-9.%/]+/).filter(w => w && !PACK_WORDS.has(w))
  const set = new Set(words.filter(w => !/^\d+$/.test(w)))
  if (pack) set.add(`#${pack}`)
  const t = { first: words[0] || '', set }
  cache.set(ma, t)
  return t
}
export function jwCandidates(model, settings, ma, limit = 3) {
  if (!model.prod[ma]) return []
  const kho = new Set(settings.kho)
  const a = nameTokens(model, ma)
  const dvt = normText(model.prod[ma].dvt)
  const out = []
  for (const q of Object.values(model.prod)) {
    if (isJW(q.ma) || normText(q.dvt) !== dvt) continue
    const b = nameTokens(model, q.ma)
    if (!a.first || b.first !== a.first) continue
    const same = [...a.set].filter(w => b.set.has(w)).length
    const score = same / new Set([...a.set, ...b.set]).size
    if (score >= 0.25) out.push({ ma: q.ma, score, x: sales(model, kho, q.ma) })
  }
  return out.sort((x, y) => y.score - x.score || y.x - x.x || x.ma.localeCompare(y.ma)).slice(0, limit)
}

// Các dòng dự trù: mỗi nhóm đang gộp 1 dòng (đặt bằng mã đặt hàng), các mã còn lại mỗi mã 1 dòng.
// Mã J / W đứng riêng có gợi ý mã nhận điều thì kèm cands (trừ mã anh đã đánh dấu "không phải hàng 2 mã": settings.jwAlone).
export function planItems(model, settings) {
  const kho = new Set(settings.kho)
  const used = new Set()
  const list = []
  for (const g of groupsOf(model, settings)) {
    if (!groupOn(settings, g)) continue
    const codes = g.codes.filter(c => !used.has(c))
    if (codes.length < 2) continue
    codes.forEach(c => used.add(c))
    const want = groupOrder(model, settings, g)
    const order = codes.includes(want) ? want : defaultOrder(model, kho, codes)
    list.push({ id: order, order, codes })
  }
  const alone = new Set(settings.jwAlone || [])
  for (const p of Object.values(model.prod)) {
    if (used.has(p.ma) || !rowsOf(model, kho, p.ma).length) continue
    const live = rowsOf(model, kho, p.ma).some(r => r.x > 0 || r.tc > 0) // mã không tồn, không xuất thì không cần quy
    const cands = live && isJW(p.ma) && !alone.has(p.ma) ? jwCandidates(model, settings, p.ma) : []
    list.push({ id: p.ma, order: p.ma, codes: [p.ma], ...(cands.length ? { cands } : {}) })
  }
  return list
}

// ---------- Tính 1 dòng ----------
// P: { Ld (ngày từ lúc đặt đến khi nhập), ss (ngày tồn an toàn), useSea }
export function seaOf(model, kho, codes) {
  if (!model.hasLY) return 1
  let a = 0
  let b = 0
  for (const c of codes) for (const k of kho) { a += model.ly3.get(`${c}|${k}`) || 0; b += model.lyn.get(`${c}|${k}`) || 0 }
  if (a < 10 || !model.lyD3 || !model.lyDn) return 1 // năm trước bán quá ít thì không đủ để tính mùa vụ
  return clamp((b / model.lyDn) / (a / model.lyD3), SEA_MIN, SEA_MAX)
}

export function analyseItem(model, settings, it, P) {
  const kho = new Set(settings.kho)
  const rows = it.codes.flatMap(c => rowsOf(model, kho, c))
  const p0 = model.prod[it.order]
  const sum = f => rows.reduce((s, r) => s + f(r), 0)
  const X3 = sum(r => r.x), TON = sum(r => r.tc), TD = sum(r => r.td), NH = sum(r => r.nh)
  const X4 = model.has4 ? sum(r => r.x4 || 0) : null
  const XW = model.hasW ? sum(r => r.xw || 0) : null
  const rate = X3 / model.D3
  const sea = P.useSea ? seaOf(model, kho, it.codes) : 1
  const rd = rate * sea
  const r4 = model.has4 ? X4 / model.D4 : null
  const coverDays = 7 + P.Ld + P.ss
  const de = rd > 0 ? Math.max(0, Math.ceil(rd * coverDays - TON - 1e-9)) : 0
  const weeks = rd > 0 ? TON / (rd * 7) : Infinity
  const month1 = model.has4 ? X4 * MONTH_DAYS / model.D4 : rate * MONTH_DAYS
  const old = Math.max(0, Math.round(month1) - TON) // cách đang làm: xuất 1 tháng − tồn
  // đơn bổ sung thứ 6 (file tuần này)
  const expW = model.hasW ? rd * model.DW : 0
  const fast = model.hasW && rd > 0 && XW >= 1.3 * expW && XW >= 5
  const rateNew = fast ? Math.max(rd, XW / model.DW) : rd
  const tonNow = model.hasW && rows.some(r => r.tcw != null) ? sum(r => r.tcw ?? r.tc) : TON
  const untilNext = 7 + P.Ld - 2 // từ sáng thứ 6 tới chuyến kế tiếp (thứ 2 tuần sau nữa)
  const unit = p0.dvt
  const f1 = v => (Math.round(v * 10) / 10).toLocaleString('vi-VN')
  const f0 = v => Math.round(v).toLocaleString('vi-VN')
  const al = []
  if (it.cands?.length) al.push({ lv: 'warn', k: 'jw', t: 'Chưa quy về mã nhận điều', d: `${it.order} là mã J / W, đang tính riêng. Có thể cùng hàng với ${it.cands.map(c => c.ma).join(', ')}.`, a: 'Bấm vào dòng, chọn mã nhận điều để gộp; không phải hàng 2 mã thì bấm "Không phải hàng 2 mã".' })
  if (TON <= 0 && X3 > 0) al.push({ lv: 'crit', k: 'out', t: 'Đang hết hàng', d: 'Tồn cuối = 0. Những ngày hết hàng không bán được nên bình quân có thể thấp hơn nhu cầu thật.', a: 'Đặt ngay; cân nhắc chốt cao hơn đề xuất.' })
  else if (rd > 0 && TON < rd * P.Ld) al.push({ lv: 'crit', k: 'risk', t: 'Hết hàng trước khi chuyến tới về', d: `Tồn ${f0(TON)} ${unit} chỉ đủ bán ${f1(TON / rd)} ngày, hàng về sau ${P.Ld} ngày.`, a: 'Đặt ngay trong đơn chính; nếu cần, xin điều chuyển từ kho khác.' })
  else if (rd > 0 && TON < rd * (P.Ld + P.ss)) al.push({ lv: 'warn', k: 'low', t: 'Dưới điểm đặt hàng', d: `Tồn ${f0(TON)} ${unit}, thấp hơn mức cần giữ tới lúc hàng về (${f0(rd * (P.Ld + P.ss))}).`, a: 'Ưu tiên duyệt mã này.' })
  if (r4 != null && X3 >= 10 && r4 >= 1.5 * rate) al.push({ lv: 'warn', k: 'up', t: 'Bán tăng mạnh 4 tuần gần đây', d: `4 tuần gần nhất bán ${f1(r4 * 7)}/tuần, gấp ${f1(r4 / rate)} lần bình quân 3 tháng (${f1(rate * 7)}/tuần).`, a: 'Đề xuất vẫn theo bình quân 3 tháng. Hỏi kinh doanh: thầu mới, khách lớn, dịch? Nếu còn kéo dài thì chốt cao hơn; thứ 6 xem lại ở đơn bổ sung.' })
  if (r4 != null && X3 >= 10 && rate * model.D4 >= 10 && r4 <= 0.5 * rate) al.push({ lv: 'warn', k: 'down', t: 'Bán giảm mạnh 4 tuần gần đây', d: `4 tuần gần nhất chỉ bán ${f1(r4 * 7)}/tuần, bằng ${Math.round(r4 / rate * 100)}% bình quân 3 tháng.`, a: 'Hỏi kinh doanh: mất thầu, đối thủ, đổi phác đồ? Chốt thấp hơn đề xuất để tránh tồn.' })
  if (X3 === 0 && TON > 0) al.push({ lv: 'warn', k: 'stop', t: 'Không bán trong kỳ', d: `Cả kỳ không xuất, còn tồn ${f0(TON)} ${unit}.`, a: 'Không đặt thêm. Báo kinh doanh đẩy bán hoặc xem xét điều chuyển.' })
  if (rd > 0 && weeks > 8) al.push({ lv: 'warn', k: 'high', t: 'Tồn cao', d: `Tồn hiện có đủ bán ${f1(weeks)} tuần.`, a: 'Không cần đặt tuần này.' })
  if (TD <= 0 && NH > 0 && X3 > 0) al.push({ lv: 'info', k: 'new', t: 'Mới về trong kỳ', d: `Đầu kỳ chưa có hàng: số ngày bán ít hơn ${model.D3} ngày nên bình quân bị thấp.`, a: model.has4 ? 'Xem tốc độ 4 tuần gần nhất để chốt tay.' : 'Chốt tay theo tốc độ bán thực tế.' })
  if (sea >= 1.15) al.push({ lv: 'season', k: 'season', t: 'Sắp vào mùa', d: `Tháng tới năm ngoái bán gấp ${f1(sea)} lần bình quân 3 tháng trước đó.`, a: 'Đã nhân hệ số mùa vụ vào bán/ngày.' })
  else if (P.useSea && model.hasLY && sea <= 0.9) al.push({ lv: 'info', k: 'offseason', t: 'Hết mùa', d: `Tháng tới năm ngoái chỉ bán bằng ${Math.round(sea * 100)}% bình quân 3 tháng trước đó.`, a: 'Đã giảm bán/ngày theo hệ số mùa vụ.' })
  if (it.codes.length > 1) al.push({ lv: 'info', k: 'merge', t: `Gộp ${it.codes.length} mã`, d: `${it.codes.join(', ')}: đã cộng tồn và xuất trước khi tính.`, a: `Đặt bằng mã ${it.order}.` })
  return { ...it, p0, rows, X3, X4, XW, TON, rate, sea, rd, r4, coverDays, de, weeks, month1, old, expW, fast, rateNew, tonNow, untilNext, alerts: al }
}

const collator = new Intl.Collator('vi', { sensitivity: 'base', numeric: true })
// Xếp theo tên vật tư A → Z (tiếng Việt), trùng tên thì theo mã
export const byName = (a, b) => collator.compare(a.p0.ten, b.p0.ten) || a.order.localeCompare(b.order)

// Làm tròn lên số kiện đủ (k = số lượng 1 kiện, từ tab Quy cách hàng hoá); chưa có quy cách thì giữ nguyên.
export const roundKien = (q, k) => (q > 0 && k > 0 ? Math.ceil(q / k - 1e-9) * k : q)

// Cả bảng dự trù. chot: { [id]: số chốt đơn chính } — đơn bổ sung trừ phần đã chốt (chưa chốt thì lấy đề xuất tròn kiện).
// kien: { [mã]: số lượng 1 kiện } — nhóm gộp lấy quy cách của mã đặt hàng, chưa có thì lấy mã cùng nhóm.
export function computePlan(model, settings, P, chot = {}, kien = {}) {
  const list = planItems(model, settings).map(it => analyseItem(model, settings, it, P))
  for (const r of list) {
    r.kien = [r.order, ...r.codes].map(c => kien[c]).find(v => v > 0) || null
    r.deK = roundKien(r.de, r.kien)
    const main = chot[r.id] ?? r.deK
    r.addDe = r.fast ? Math.max(0, Math.ceil(r.rateNew * r.untilNext + r.rd * P.ss - r.tonNow - main - 1e-9)) : 0
    r.addDeK = roundKien(r.addDe, r.kien)
  }
  return list.sort(byName)
}

// Khoá tuần ISO ("2026-W44") của ngày cuối file 3 tháng: đơn chính thứ 4 và đơn bổ sung thứ 6 cùng tuần dùng chung số chốt.
export function weekKey(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const y = t.getUTCFullYear()
  const w = Math.ceil(((t - Date.UTC(y, 0, 1)) / DAY + 1) / 7)
  return `${y}-W${pad2(w)}`
}
