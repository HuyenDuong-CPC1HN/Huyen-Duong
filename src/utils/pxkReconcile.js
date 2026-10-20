// Đối chiếu sổ sách (Phiếu xuất kho nhà máy) ↔ thực nhận (BB nhập hàng đã chốt) ↔ đã quét nhập (file xls web nội
// bộ), theo từng kho (Kho C / Kho DTP / Kho SO) và theo Mã hàng + Số lô. Hàm thuần — không đọc/ghi gì.
//
// Kho của phiếu do người dùng quyết định (thả vào vùng kho nào thì tính kho đó), không đoán từ nội dung phiếu.
// Mẫu DTP (02-VT, số phiếu FX…) có PDF gốc → đọc tự động; mẫu CPC1 Hà Nội (XD…) chỉ có bản giấy → chụp ảnh lưu
// kèm, kho nhập tay các dòng.

import { parseDateText } from './flowV2'

export const PXK_STORE_KEY = 'pxk_doi_chieu'
export const PXK_KHO = [
  { key: 'C', label: 'Kho C' },
  { key: 'DTP', label: 'Kho DTP' },
  { key: 'SO', label: 'Kho SO' },
]

// Kết luận từng dòng. nguon = lệch giữa thực nhận và sổ sách → báo nhà máy; quet = kho tự xử lý.
export const PXK_TAGS = {
  ok: { label: 'Khớp', tone: 'ok' },
  thieu: { label: 'Sổ sách thiếu', tone: 'bad', nguon: true },
  thua: { label: 'Sổ sách thừa', tone: 'bad', nguon: true },
  khongPxk: { label: 'Không có trên PXK', tone: 'bad', nguon: true },
  khongNhan: { label: 'Có trên PXK, không nhận', tone: 'bad', nguon: true },
  lot: { label: 'Lệch lô / HD', tone: 'lot', nguon: true },
  quet: { label: 'Quét chưa khớp', tone: 'warn' },
}
export const isNguonRow = row => row.tags.some(t => PXK_TAGS[t]?.nguon)

const rid = p => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`

export function newPxkPhieu({ kho, kind, name = '', soPhieu = '', rows = [], files = [], images = [] }, now = new Date()) {
  return { id: rid('pxk'), kho, kind, name, soPhieu, rows, files, images, addedAt: now.toISOString() }
}
export function newPxkRow(extra = {}) {
  return { rowId: rid('r'), maHang: '', tenHang: '', dvt: '', soLuong: null, soLo: '', hanDung: '', ...extra }
}

// "3.380,000" (mẫu phiếu: chấm nghìn, phẩy thập phân) → 3380; "3380" / "3.380" / "3,380" → 3380.
export function parseQty(text) {
  if (typeof text === 'number') return Number.isFinite(text) ? text : null
  let t = String(text ?? '').trim().replace(/\s+/g, '')
  if (!t) return null
  t = t.replace(/,0{1,3}$/, '')
  t = t.replace(/[.,]/g, '')
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

// Hạn dùng gõ tay / đọc từ phiếu → yyyy-mm-dd (không đọc được thì giữ nguyên chữ để người dùng thấy và sửa).
export const normHanDung = v => (v ? parseDateText(v) || String(v).trim() : '')
export const fmtHanDung = v => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : (v || '') }

export function normLot(v) {
  const lot = String(v ?? '').trim().toUpperCase()
  const tokens = lot.split(/\s+/)
  return tokens.length > 1 && tokens.every(x => /^\d+$/.test(x)) ? tokens.join('') : lot
}
const keyOf = (maHang, soLo) => `${String(maHang || '').trim().toUpperCase()}::${normLot(soLo)}`

// Số phiếu trên PDF mẫu DTP: "Số: FX126/005804". Không thấy thì lấy mã dạng chữ+số/số đầu tiên (bỏ số đơn DH…).
export function readSoPhieu(pdfText) {
  const t = String(pdfText || '').replace(/\s+/g, ' ')
  const m = /Số\s*:?\s*([A-Z]{1,4}\d{2,6}\/\d{3,7})/.exec(t)
  if (m) return m[1]
  const all = t.match(/\b(?!DH)[A-Z]{1,4}\d{2,6}\/\d{3,7}\b/g)
  return all?.[0] || ''
}

// Dòng thực nhận của 1 kho từ chuyến đã lưu ở tab Nhập hàng. Kho SO là phần hàng có "(SO)" trong tên của bảng Kho
// C (giống trang Đối soát). Thực nhận = SL thực tế đã sửa khi kiểm, chưa sửa thì = SL trên biên bản.
export function receivedRowsOf(batch, kho) {
  if (!batch) return []
  const isSo = r => /\(SO\)/i.test(r.tenHang || '')
  const src = kho === 'DTP' ? (batch.khoLgt || []) : (batch.khoC || []).filter(r => (kho === 'SO' ? isSo(r) : !isSo(r)))
  return src.filter(r => r.maHang).map(r => {
    const tt = r.slThucTe === '' || r.slThucTe === null || r.slThucTe === undefined ? null : Number(r.slThucTe)
    return { maHang: r.maHang, tenHang: r.tenHang || '', dvt: r.dvt || '', soLo: r.soLo || '', hanDung: r.hanDung || '', soLuong: tt ?? Number(r.slHoaDon ?? 0) }
  })
}

function groupBy(rows, pick) {
  const map = new Map()
  for (const r of rows) {
    const k = keyOf(r.maHang, r.soLo)
    map.set(k, pick(map.get(k) || null, r))
  }
  return map
}

// received: receivedRowsOf · scanned: [{maHang, soLo, soLuong}] hoặc null (chưa thả file quét kho này) ·
// phieus: phiếu của kho này (rows có maHang, soLo, hanDung, soLuong).
export function reconcilePxk({ received = [], scanned = null, phieus = [] }) {
  const rec = groupBy(received, (cur, r) => (cur
    ? { ...cur, soLuong: cur.soLuong + (Number(r.soLuong) || 0) }
    : { maHang: r.maHang, tenHang: r.tenHang, dvt: r.dvt, soLo: r.soLo, hanDung: r.hanDung, soLuong: Number(r.soLuong) || 0 }))
  const bookRows = phieus.flatMap(p => (p.rows || []).filter(r => r.maHang).map(r => ({ ...r, soPhieu: p.soPhieu || p.name || '' })))
  const book = groupBy(bookRows, (cur, r) => {
    const qty = parseQty(r.soLuong) || 0
    if (!cur) return { maHang: r.maHang, tenHang: r.tenHang, dvt: r.dvt, soLo: r.soLo, hanDung: normHanDung(r.hanDung), soLuong: qty, phieus: [r.soPhieu].filter(Boolean) }
    return { ...cur, soLuong: cur.soLuong + qty, phieus: cur.phieus.includes(r.soPhieu) || !r.soPhieu ? cur.phieus : [...cur.phieus, r.soPhieu] }
  })
  const scan = scanned ? groupBy(scanned, (cur, r) => (cur ? { ...cur, soLuong: cur.soLuong + (Number(r.soLuong) || 0) } : { maHang: r.maHang, tenHang: r.tenHang || '', soLo: r.soLo, soLuong: Number(r.soLuong) || 0 })) : null

  // Cùng mã hàng mà lô trên phiếu khác lô thực nhận: nếu mã đó còn ĐÚNG 1 dòng thực nhận và ĐÚNG 1 dòng phiếu chưa
  // khớp thì ghép lại thành 1 dòng "Lệch lô" (phiếu ghi sai lô). Nhiều hơn thì không đoán, để từng dòng riêng.
  const pair = new Map() // key thực nhận → key phiếu
  const unmatched = (map, other) => {
    const g = new Map()
    for (const [k, r] of map) if (!other.has(k)) g.set(r.maHang, [...(g.get(r.maHang) || []), k])
    return g
  }
  const recU = unmatched(rec, book)
  const bookU = unmatched(book, rec)
  for (const [ma, ks] of recU) {
    const bs = bookU.get(ma)
    if (ks.length === 1 && bs?.length === 1) pair.set(ks[0], bs[0])
  }
  const pairedBook = new Set(pair.values())

  const rows = []
  const scanUsed = new Set()
  const scanOf = k => { if (!scan) return null; scanUsed.add(k); return scan.get(k)?.soLuong ?? 0 }
  for (const [k, r] of rec) {
    const bk = book.has(k) ? k : pair.get(k)
    const b = bk ? book.get(bk) : null
    const tags = []
    if (!b) tags.push('khongPxk')
    else {
      if (r.soLuong > b.soLuong) tags.push('thieu')
      if (r.soLuong < b.soLuong) tags.push('thua')
      if (normLot(b.soLo) !== normLot(r.soLo) || (b.hanDung && r.hanDung && b.hanDung !== r.hanDung)) tags.push('lot')
    }
    const sl = scanOf(k)
    if (sl !== null && sl !== r.soLuong) tags.push('quet')
    rows.push({ key: k, maHang: r.maHang, tenHang: r.tenHang || b?.tenHang || '', dvt: r.dvt || b?.dvt || '', soLo: r.soLo, hanDung: r.hanDung,
      a: r.soLuong, b: sl, c: b ? b.soLuong : null, phieus: b?.phieus || [], pLo: b?.soLo ?? '', pHd: b?.hanDung ?? '', tags: tags.length ? tags : ['ok'] })
  }
  for (const [k, b] of book) {
    if (rec.has(k) || pairedBook.has(k)) continue
    const sl = scanOf(k)
    rows.push({ key: k, maHang: b.maHang, tenHang: b.tenHang, dvt: b.dvt, soLo: b.soLo, hanDung: b.hanDung,
      a: 0, b: sl, c: b.soLuong, phieus: b.phieus, pLo: b.soLo, pHd: b.hanDung, tags: ['khongNhan', ...(sl ? ['quet'] : [])] })
  }
  if (scan) {
    for (const [k, s] of scan) {
      if (scanUsed.has(k)) continue
      rows.push({ key: k, maHang: s.maHang, tenHang: s.tenHang, dvt: '', soLo: s.soLo, hanDung: '', a: 0, b: s.soLuong, c: null, phieus: [], pLo: '', pHd: '', tags: ['quet'] })
    }
  }
  return rows.sort((x, y) => x.maHang.localeCompare(y.maHang) || String(x.soLo).localeCompare(String(y.soLo)))
}

const vn = n => (n === null || n === undefined ? '—' : Number(n).toLocaleString('vi-VN'))

// Nội dung báo đầu nguồn (dán Zalo): chỉ các dòng lệch thực nhận ↔ sổ sách, gom theo kho rồi theo số phiếu.
export function buildNguonReport(resultsByKho, title = '') {
  const lines = []
  for (const { key, label } of PXK_KHO) {
    const bad = (resultsByKho[key] || []).filter(isNguonRow)
    if (!bad.length) continue
    lines.push(`${label}:`)
    const byPhieu = new Map()
    for (const r of bad) {
      const p = r.phieus.join(', ') || 'Không có trên PXK'
      byPhieu.set(p, [...(byPhieu.get(p) || []), r])
    }
    for (const [p, rs] of byPhieu) {
      lines.push(`  ${p}`)
      for (const r of rs) {
        const parts = []
        if (r.c === null) parts.push(`thực nhận ${vn(r.a)} ${r.dvt}, phiếu không có`.trim())
        else if (r.tags.includes('khongNhan')) parts.push(`phiếu ghi ${vn(r.c)} ${r.dvt}, kho không nhận được hàng`.replace('  ', ' '))
        else {
          if (r.a !== r.c) parts.push(`phiếu ${vn(r.c)}, thực nhận ${vn(r.a)} ${r.dvt} (${r.a > r.c ? 'thiếu phiếu' : 'thừa phiếu'} ${vn(Math.abs(r.a - r.c))})`.replace(' )', ')'))
          if (normLot(r.pLo) !== normLot(r.soLo)) parts.push(`phiếu ghi lô ${r.pLo}, thực tế lô ${r.soLo}`)
          if (r.pHd && r.hanDung && r.pHd !== r.hanDung) parts.push(`phiếu ghi HD ${fmtHanDung(r.pHd)}, thực tế HD ${fmtHanDung(r.hanDung)}`)
        }
        lines.push(`  - ${r.maHang} ${r.tenHang} · lô ${r.soLo || '—'}: ${parts.join('; ')}`)
      }
    }
  }
  const head = title ? `Kho CN HCM báo chênh lệch ${title} (sổ sách so với thực nhận):` : 'Kho CN HCM báo chênh lệch (sổ sách so với thực nhận):'
  return lines.length ? `${head}\n${lines.join('\n')}` : ''
}

// ---------- Đọc PDF Phiếu xuất kho mẫu CPC1 Hà Nội (số phiếu XD…) ----------
// Mẫu này không có cột "Vị trí" như mẫu DTP 02-VT (parsePdfItems không đọc được), cột: Stt · Mã vật tư · Tên vật tư ·
// Nước SX · Đvt · Số lượng · Lô · Hạn dùng. Thứ tự chữ trích từ PDF có thể không theo thứ tự cột, nên đọc theo dấu
// hiệu thay vì vị trí: mỗi dòng hàng kết thúc ở Hạn dùng (dd/mm/yyyy); trong đoạn đó Mã vật tư là mã dạng A12345,
// Số lượng dạng "1.050,000", Đvt là chữ in hoa đứng ngay trước Số lượng, Nước SX có dạng "…-VNM", Lô là chữ ngay
// trước Hạn dùng, phần còn lại là Tên vật tư.
const PXK_CODE = /^[A-Z]\d{4,5}$/
const PXK_QTY = /^\d{1,3}(?:\.\d{3})*,\d{1,3}$|^\d+,\d{1,3}$/
const PXK_ORIGIN = /^[A-Z0-9]+-[A-Z]{2,3}[A-Z]?$/
const PXK_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/

export function parseCpc1PxkPdf(pdfText) {
  let compact = String(pdfText || '').replace(/\s+/g, ' ').trim()
  const end = compact.search(/NGƯỜI\s+LẬP|Ngày\s*\.{2,}/i)
  if (end >= 0) compact = compact.slice(0, end)
  const all = compact.split(' ').filter(Boolean)
  // Bảng bắt đầu ngay sau dòng mã cột "A C B D 1 2 3 4" (PDF có thể trộn thứ tự: "A B C 2 3 4 1 D"); tiêu đề cột
  // cũng có thể bị trộn thứ tự nên không dựa vào chữ "Hạn dùng".
  const COL = new Set(['A', 'B', 'C', 'D', '1', '2', '3', '4'])
  let start = -1
  for (let i = 0; i + 8 <= all.length; i += 1) {
    const win = all.slice(i, i + 8)
    if (win.every(x => COL.has(x)) && ['A', 'B', 'C', 'D'].every(x => win.includes(x))) { start = i + 8; break }
  }
  if (start < 0) return []
  const tokens = all.slice(start)
  const rows = []
  let chunk = []
  for (const tok of tokens) {
    const d = PXK_DATE.exec(tok)
    if (!d) { chunk.push(tok); continue }
    const row = parseChunk(chunk, `${d[3]}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}`)
    if (row) rows.push(row)
    chunk = []
  }
  return rows
}

function parseChunk(tokens, hanDung) {
  const t = [...tokens]
  while (t.length && /^\d{1,2}$/.test(t[0])) t.shift() // Stt (và số thứ tự dòng trống của dòng trước nếu có)
  const iCode = t.findIndex(x => PXK_CODE.test(x))
  const iQty = t.findIndex(x => PXK_QTY.test(x))
  if (iCode < 0 || iQty < 0) return null
  const used = new Set([iCode, iQty])
  let dvt = ''
  if (iQty > 0 && /^[A-ZĐ]{1,6}$/.test(t[iQty - 1]) && !PXK_CODE.test(t[iQty - 1])) { dvt = t[iQty - 1]; used.add(iQty - 1) }
  const iOrigin = t.findIndex((x, i) => !used.has(i) && PXK_ORIGIN.test(x) && /VN/.test(x))
  if (iOrigin >= 0) {
    used.add(iOrigin)
    // "CPC1HN-VN M": PDF ngắt chữ Nước SX làm 2 mẩu, mẩu sau 1 chữ cái cũng là Nước SX
    if (/-VN$/.test(t[iOrigin]) && /^[A-Z]$/.test(t[iOrigin + 1] || '')) used.add(iOrigin + 1)
  }
  let iLot = t.length - 1
  while (iLot >= 0 && used.has(iLot)) iLot -= 1
  const soLo = iLot >= 0 && iLot > Math.max(iQty, iCode) ? t[iLot] : ''
  if (soLo) used.add(iLot)
  if (!dvt) {
    const iDvt = t.findIndex((x, i) => !used.has(i) && i > iCode && /^[A-ZĐ]{2,6}$/.test(x))
    if (iDvt >= 0 && iDvt > iQty - 3) { dvt = t[iDvt]; used.add(iDvt) }
  }
  const tenHang = t.filter((_, i) => !used.has(i)).join(' ').trim()
  return { maHang: t[iCode], tenHang, dvt, soLuong: parseQty(t[iQty]), soLo, hanDung }
}

// Đọc 1 file PDF phiếu xuất kho bất kỳ mẫu: thử mẫu DTP 02-VT (parsePdfItems có sẵn) trước, rồi mẫu CPC1 Hà Nội.
export function readPxkPdfRows(text, parsePdfItems) {
  const dtp = parsePdfItems(text).filter(it => it.source === 'phieuXuatKho')
  if (dtp.length) return dtp
  return parseCpc1PxkPdf(text)
}

// ---------- Đọc chữ từ ẢNH phiếu (OCR miễn phí chạy trên trình duyệt, xem pxkOcr.js) ----------
// Chữ đọc từ ảnh theo từng dòng in trên phiếu, có nhiễu (dấu tick, kẻ bảng "|", dấu phẩy rơi mất). Mỗi dòng có mã
// vật tư là 1 dòng hàng; ô nào không chắc để trống để kho tự điền khi soát.
const OCR_ORIGIN = /^[A-Z0-9]{2,10}[-.]?[VY][NM]{1,2}[A-Z]?$|[-.]VN/

// Đvt đọc nhầm hay gặp → đúng chữ trên phiếu
const UNIT_FIX = { LONG: 'ONG', ONC: 'ONG', '0NG': 'ONG', TUBE: 'TUYP', TUYB: 'TUYP', L0: 'LO', VIENN: 'VIEN' }
const normUnit = u => UNIT_FIX[u] || u

// Số lượng đọc từ ảnh: mẫu phiếu in "3.380,000" (chấm nghìn, phẩy + 3 số lẻ) nhưng OCR hay rơi dấu.
export function parseOcrQty(raw) {
  const t = String(raw || '').replace(/[^\d.,]/g, '')
  if (!/\d/.test(t)) return null
  let n
  if (t.includes('.') && t.includes(',')) n = t.slice(0, t.lastIndexOf(',')).replace(/\./g, '')
  else if (/[.,]0{1,3}$/.test(t)) n = t.replace(/[.,]0{1,3}$/, '').replace(/[.,]/g, '')
  else if (/,\d{1,3}$/.test(t)) n = t.slice(0, t.lastIndexOf(',')).replace(/\./g, '')
  else if (t.includes('.')) n = t.replace(/\./g, '')
  else n = t.length >= 4 && t.endsWith('000') ? t.slice(0, -3) : t
  const v = Number(n)
  return Number.isFinite(v) ? v : null
}

const OCR_LOT_DATE = /([A-Z0-9][A-Z0-9/-]{3,})\s+(\d{1,2}\/\d{1,2}\/\d{4})/i

export function parseOcrPxkText(text) {
  const rows = []
  const lines = String(text || '').split(/\n/).map(l => l.replace(/[|[\]{}“”"'`~_]/g, ' ').replace(/\s+/g, ' ').trim())
  const codeOf = l => /\b([A-Z]\d{5}|[A-Z]\d{4})\b/.exec(l)
  lines.forEach((rawLine, li) => {
    let line = rawLine
    const code = codeOf(line)
    if (!code) return
    // Ảnh chụp nghiêng: "Lô Hạn dùng" ở mép phải có thể rơi sang dòng ngay trên / dưới (dòng không có mã hàng)
    if (!/\d{1,2}\/\d{1,2}\/\d{4}/.test(line)) {
      const near = [lines[li - 1], lines[li + 1]].find(l => l && !codeOf(l) && OCR_LOT_DATE.test(l))
      if (near) { const m = OCR_LOT_DATE.exec(near); line = `${line} ${m[1]} ${m[2]}` }
    }
    const dates = [...line.matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g)]
    const d = dates[dates.length - 1]
    const hanDung = d ? `${d[3]}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}` : ''
    const before = (d ? line.slice(0, d.index) : line).slice(code.index + code[0].length).trim()
    // Bỏ dấu kẻ bảng / dấu chấm dính 2 đầu mỗi chữ ("TUBE..", "]E0047]", "1219 |!")
    const tokens = before.split(' ').map(x => (/[\p{L}\d]/u.test(x) ? x.replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, '') : (x === '-' || x === '–' ? '-' : ''))).filter(Boolean)
    const isQty = x => /^[\d.,/]+$/.test(x) && x.replace(/\D/g, '').length >= 2
    // Đọc từ phải sang trái (cột cuối ổn định hơn cột tên): [Lô] ← Số lượng ← Đvt ← Nước SX ← Tên. Số lượng in dạng
    // "4.800,000" (có dấu ngăn), lô thường không có dấu — chữ cuối trước Hạn dùng có dấu ngăn kiểu số lượng thì không có lô.
    const qtyLike = x => isQty(x) && /[.,/]\d{1,3}$/.test(x)
    let iLot = -1
    let iQty = -1
    if (d) {
      let i = tokens.length - 1
      // bỏ dấu tick ("v", "ý", "1"...) trước hạn dùng: lô có ít nhất 4 ký tự
      while (i >= 0 && !(/\d/.test(tokens[i]) && (tokens[i].length >= 4 || qtyLike(tokens[i])))) i -= 1
      if (i >= 0 && !qtyLike(tokens[i])) { iLot = i; i -= 1 }
      while (i >= 0 && !isQty(tokens[i])) i -= 1
      iQty = i
    } else {
      for (let i = tokens.length - 1; i >= 0; i -= 1) if (qtyLike(tokens[i])) { iQty = i; break }
    }
    if (iQty < 0) iQty = tokens.findIndex((x, i) => i > 0 && qtyLike(x))
    // Không có hạn dùng (quà tặng / vật tư): chữ có số ngay sau Số lượng là Lô
    if (!d && iQty >= 0 && tokens[iQty + 1] && /\d/.test(tokens[iQty + 1])) iLot = iQty + 1
    const unitAt = iQty > 0 ? iQty - 1 : -1
    const unitTok = unitAt >= 0 ? tokens[unitAt].toUpperCase() : ''
    const iUnit = unitAt >= 0 && /^[A-ZĐ]{2,6}$/.test(unitTok) && !OCR_ORIGIN.test(unitTok) ? unitAt : -1
    const iOrigin = tokens.findIndex((x, i) => OCR_ORIGIN.test(x.toUpperCase()) && (iQty < 0 || i < iQty))
    const nameEnd = [iOrigin, iUnit, iQty].filter(i => i >= 0)
    const tenHang = tokens.slice(0, nameEnd.length ? Math.min(...nameEnd) : tokens.length).join(' ').replace(/^[-\s]+|[-\s]+$/g, '')
    rows.push({
      maHang: code[1], tenHang, dvt: iUnit >= 0 ? normUnit(unitTok) : '',
      soLuong: iQty >= 0 ? parseOcrQty(tokens[iQty]) : null, soLo: iLot >= 0 ? tokens[iLot].toUpperCase() : '', hanDung,
    })
  })
  return rows
}

export const pxkRowKey = (maHang, soLo) => keyOf(maHang, soLo)

// Dòng đọc từ ảnh (ocr) tự coi là đúng khi khớp thực nhận: đối chiếu theo Mã + Lô ra không lệch sổ sách (cùng lô,
// cùng hạn dùng, cùng số lượng) — đọc sai mà vẫn trùng từng ký tự là rất khó. Chỉ dòng lệch mới cần soát với ảnh
// (có thể do đọc nhầm, hoặc lệch thật cần báo nhà máy). checked = kho đã soát, giữ nguyên.
export function ocrRowNeedsCheck(row, resultRows) {
  if (!row.ocr || row.checked || !row.maHang) return false
  // Ô không đọc được, app lấy theo thực nhận: chưa có gì xác nhận → vẫn cần soát
  if (row.ocrFixed && Object.values(row.ocrFixed).some(v => !v)) return true
  const res = resultRows.find(x => x.key === keyOf(row.maHang, row.soLo))
  return !res || isNguonRow(res)
}

// Sửa lỗi đọc ảnh bằng "từ điển" là chính các dòng thực nhận của kho: dòng đọc được gần giống đúng 1 dòng thực nhận
// (mã sai ≤ 2 ký tự, lô sai ≤ 2 ký tự hoặc dính dấu tick) thì lấy mã, lô, tên, Đvt, hạn dùng theo thực nhận — các ô
// này đọc ảnh hay nhầm 1–2 ký tự. KHÔNG sửa số lượng (đó là số cần đối chiếu): số lượng khác thực nhận vẫn báo cần soát.
// Ô nào đã sửa ghi lại chữ đọc được gốc ở ocrFixed để kho xem lại khi cần.
function editDistance(a, b) {
  const m = a.length
  const n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 1; j <= n; j += 1) dp[0][j] = j
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  }
  return dp[m][n]
}
const up = v => String(v || '').trim().toUpperCase()

// Lô / hạn dùng chỉ sửa khi chỗ khác nhau là lỗi đọc ảnh điển hình (0↔O, 1↔I, 8↔B…, rơi 1 ký tự, dính dấu tick ở
// đầu) — khác kiểu khác (vd 010826 ↔ 010827) có thể là nhà máy ghi sai thật nên giữ nguyên để báo lệch.
const CONFUSE = ['0ODQ', '1ILJT7', '2Z', '5S', '6G', '8B3', '9Q']
const confusable = (a, b) => a === b || CONFUSE.some(g => g.includes(a) && g.includes(b))
function ocrClose(truth, read) {
  if (!truth || !read) return false
  if (truth === read || truth === read.slice(1)) return true
  if (truth.length === read.length) return [...truth].every((ch, i) => confusable(ch, read[i]))
  if (truth.length === read.length + 1) { // đọc rơi 1 ký tự
    for (let i = 0; i < truth.length; i += 1) if (truth.slice(0, i) + truth.slice(i + 1) === read) return true
  }
  return false
}

export function alignOcrRows(rows, received) {
  return rows.map(r => {
    if (!r.ocr || !r.maHang) return r
    const ma = up(r.maHang)
    const lo = normLot(r.soLo)
    const scored = received.map(x => {
      const dMa = editDistance(up(x.maHang), ma)
      const xl = normLot(x.soLo)
      const loOk = !lo || ocrClose(xl, lo)
      const dLo = !lo ? 1 : (xl === lo ? 0 : 1)
      return { x, dMa, dLo, loOk, score: dMa * 2 + dLo }
    }).filter(c => c.dMa <= 2 && c.loOk && (c.dMa === 0 || c.dLo === 0 || c.dMa <= 1))
    if (!scored.length) return r
    scored.sort((a, b) => a.score - b.score)
    if (scored.length > 1 && scored[1].score === scored[0].score) return r // 2 dòng giống nhau ngang nhau: không đoán
    const { x } = scored[0]
    const fixed = {}
    const hd = x.hanDung || ''
    if (up(x.maHang) !== ma) fixed.maHang = r.maHang
    if (normLot(x.soLo) !== lo) fixed.soLo = r.soLo
    if (hd && r.hanDung !== hd && (!r.hanDung || ocrClose(hd, r.hanDung))) fixed.hanDung = r.hanDung
    return {
      ...r,
      maHang: x.maHang, soLo: x.soLo || r.soLo,
      hanDung: 'hanDung' in fixed ? hd : r.hanDung,
      tenHang: x.tenHang || r.tenHang, dvt: x.dvt || r.dvt,
      ...(Object.keys(fixed).length ? { ocrFixed: { ...(r.ocrFixed || {}), ...fixed } } : {}),
    }
  })
}
export const alignOcrLots = alignOcrRows

// Khoá so trùng số phiếu: phần số "2611/04759" (đọc ảnh hay nhầm phần chữ đầu: "XID2611/04759" = "XD2611/04759").
export function soPhieuKey(soPhieu) {
  const m = /(\d{3,6})\/(\d{3,7})\s*$/.exec(String(soPhieu || ''))
  return m ? `${m[1]}/${m[2]}` : String(soPhieu || '').trim().toUpperCase()
}

// File PDF scan nhiều trang = nhiều phiếu: mỗi trang có số phiếu là 1 phiếu; trang không đọc được số phiếu, hoặc
// cùng số phiếu với trang ngay trước mà dòng hàng khác hẳn, là trang tiếp của phiếu trước (phiếu dài 2 trang).
// Trang trùng số phiếu (2 liên / scan 2 lần / bản nhà máy sửa lại) KHÔNG tự bỏ — tách thành phiếu riêng để kho tự chọn
// giữ bản nào (xem pxkDuplicateGroups). pageTexts: chữ đọc từng trang.
export function groupScanPages(pageTexts) {
  const groups = []
  pageTexts.forEach((text, i) => {
    const page = i + 1
    const soPhieu = readSoPhieu(text)
    const rows = parseOcrPxkText(text)
    const key = soPhieu ? soPhieuKey(soPhieu) : ''
    const last = groups[groups.length - 1]
    if (!soPhieu && last) { last.pages.push(page); last.rows.push(...rows); return }
    if (key && last && last.key === key) {
      const seen = new Set(last.rows.flatMap(r => [r.maHang, r.soLo && normLot(r.soLo)]).filter(Boolean))
      const overlap = rows.filter(r => seen.has(r.maHang) || (r.soLo && seen.has(normLot(r.soLo)))).length
      if (!rows.length || overlap * 2 < rows.length) { last.pages.push(page); last.rows.push(...rows); return }
    }
    groups.push({ key, soPhieu, pages: [page], rows })
  })
  return { groups }
}

// Các nhóm phiếu trùng số phiếu chưa được kho quyết định (bỏ qua phiếu đã bỏ / đang đọc / đã chọn "giữ tất cả").
// Phiếu trong nhóm chưa quyết định KHÔNG đưa vào đối chiếu (tránh cộng sổ sách 2 lần) cho tới khi kho chọn.
export function pxkDuplicateGroups(phieus) {
  const by = new Map()
  for (const p of phieus) {
    if (p.excluded || p.kind === 'dang' || !p.soPhieu) continue
    const k = soPhieuKey(p.soPhieu)
    by.set(k, [...(by.get(k) || []), p])
  }
  return [...by.values()].filter(list => list.length > 1 && !list.every(p => p.keepDup))
}

// Ghép kết quả AI đọc từng phần của PDF scan đã chia (splitScanPdf). chunks: [{ pages: [số trang trong file gốc] }],
// results[i]: { phieus: [{ soPhieu, trang: [số trang trong phần], rows }] } hoặc { error }. Số trang đổi về số trang
// file gốc; phần mở đầu bằng trang không có số phiếu (phiếu kéo dài qua ranh giới 2 phần) thì nối vào phiếu cuối của
// phần trước. Trả về { phieus: [{ soPhieu, trang, rows }], failedPages, errors }.
export function mergeAiChunks(chunks, results) {
  const phieus = []
  const failedPages = []
  const errors = []
  let prevOk = false
  chunks.forEach((c, i) => {
    const r = results[i]
    if (!r || r.error || !Array.isArray(r.phieus)) {
      failedPages.push(...c.pages)
      if (r?.error && !errors.includes(r.error)) errors.push(r.error)
      prevOk = false
      return
    }
    r.phieus.forEach((p, j) => {
      const trang = (Array.isArray(p.trang) ? p.trang : []).map(n => c.pages[n - 1]).filter(Boolean)
      const soPhieu = String(p.soPhieu || '').trim()
      const last = phieus[phieus.length - 1]
      if (!soPhieu && j === 0 && prevOk && last) {
        last.trang.push(...trang)
        last.rows.push(...(p.rows || []))
        return
      }
      phieus.push({ soPhieu, trang, rows: [...(p.rows || [])] })
    })
    prevOk = true
  })
  return { phieus, failedPages, errors }
}
