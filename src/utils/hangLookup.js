// Tra cứu hàng đã nhập trả lại / đã huỷ: làm phẳng các phiếu thành từng dòng hàng để tìm, lọc, tổng hợp, xuất Excel.
// Chỉ dùng dữ liệu sẵn có của 2 tab (phiếu nhập trả lại, phiếu xuất kho hàng huỷ Kho C / Kho DTP).
import { slipLoai, goodsRowsOf } from './returnSlips'

export const LOOKUP_STAGE = {
  doing: ['Đang làm / chờ ký', ['todo', 'doing', 'exported']],
  acct: ['Đã ký, chờ kế toán nhập', ['acct']],
  done: ['Hoàn thành', ['done']],
}

export function normText(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
}

// loai: 'tra' | 'huy' → [{ id, phieuId, so, kho ('C'|'DTP'), who, date (ISO yyyy-mm-dd), stage, ma, ten, soLo, soLuong, dvt, extra }]
export function lookupRows(loai, { slips = [], phieus = [] } = {}) {
  if (loai === 'huy') {
    return phieus.flatMap(p => (p.items || []).map((it, i) => ({
      id: `${p.id}#${i}`, phieuId: p.id, so: p.soPhieu, kho: p.kho, who: p.lyDo || '',
      date: p.ngayPhieu || String(p.importedAt || '').slice(0, 10), stage: p.stage,
      ma: it.maHang || '', ten: it.tenHang || '', soLo: it.soLo || '', soLuong: Number(it.thucHuy ?? it.soLuong) || 0, dvt: it.dvt || '',
      extra: it.tinhTrang || '',
    })))
  }
  return slips.filter(s => s.pdf).flatMap(s => goodsRowsOf(s).map(({ it, i }) => ({
    id: `${s.id}#${i}`, phieuId: s.id, so: s.maPhieu || s.form?.soHD || '', kho: slipLoai(s) || 'C', who: s.khachHang || s.pdf.benMua?.ten || '',
    date: String(s.createdAt || '').slice(0, 10), stage: s.stage,
    ma: '', ten: it.ten || '', soLo: s.form?.items?.[i]?.soLo || it.soLo || '', soLuong: Number(it.soLuong) || 0, dvt: it.dvt || '',
    extra: it.thanhTien ? `${Number(it.thanhTien).toLocaleString('en-US')} đ` : '',
  })))
}

export function filterLookup(rows, { kho = 'all', month = 'all', stage = 'all', q = '' } = {}) {
  const needle = normText(q.trim())
  const stages = stage === 'all' ? null : LOOKUP_STAGE[stage][1]
  return rows.filter(r => (kho === 'all' || r.kho === kho)
    && (month === 'all' || r.date.startsWith(month))
    && (!stages || stages.includes(r.stage))
    && (!needle || [r.ma, r.ten, r.soLo, r.so, r.who].some(v => normText(v).includes(needle))))
}

// Cộng số lượng theo hàng + lô (cùng tên và lô thì gộp), nhiều nhất trước.
export function summarizeLookup(rows) {
  const map = new Map()
  for (const r of rows) {
    const key = `${r.ten}|${r.soLo}`
    const e = map.get(key) || { ma: r.ma, ten: r.ten, soLo: r.soLo, dvt: r.dvt, soLuong: 0, phieu: new Set(), kho: new Set() }
    e.soLuong += r.soLuong; e.phieu.add(r.phieuId); e.kho.add(r.kho)
    map.set(key, e)
  }
  return [...map.values()].sort((a, b) => b.soLuong - a.soLuong)
}
