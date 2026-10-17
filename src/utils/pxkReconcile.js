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
