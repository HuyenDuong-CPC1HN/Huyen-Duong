// Tra cứu hàng đã xuất khỏi kho: gộp các phiếu của Nhập trả lại, Đổi trả hàng (quy trình mới) và Hàng huỷ Kho C /
// Kho DTP thành từng dòng hàng, mỗi dòng có Nguồn (hàng từ đâu ra) và Hướng xử lý (Nhập trả lại / Xuất huỷ).
// Kho A (hồ sơ huỷ cho kế toán) và đợt đổi trả theo quy trình cũ không nằm trong tra cứu.
import { slipLoai } from './returnSlips'
import { isV2 } from './swapReturnBatch'

export const NGUON = {
  tra: { label: 'Khách trả · nguyên vẹn', huong: 'nhap', tab: 'traHang' },
  doitra: { label: 'Khách trả · lỗi', huong: 'huy', tab: 'doiTra' },
  kho: { label: 'Phát sinh', huong: 'huy', tab: 'hangHuyCD' },
}
export const HUONG = { nhap: 'Nhập trả lại', huy: 'Xuất huỷ' }

// stage của dòng: doing = đang làm / chờ ký · nhap = chờ nhập · gom = chờ gom huỷ · xuat = chờ xuất · done = hoàn thành
export const STAGE_FILTER = {
  doing: ['Đang làm / chờ ký', ['doing']],
  wait: ['Chờ nhập / xuất', ['nhap', 'gom', 'xuat']],
  done: ['Hoàn thành', ['done']],
}
const STAGE_LABEL = { doing: 'Đang làm / chờ ký', nhap: 'Chờ nhập', gom: 'Chờ gom huỷ', xuat: 'Chờ xuất', done: 'Hoàn thành' }
export const stageLabel = row => STAGE_LABEL[row.stage] || ''

export function normText(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
}
const lotKey = (ten, lo) => `${normText(ten)}|${normText(lo)}`
const isoDay = v => String(v || '').slice(0, 10)

function slipStage(stage) {
  if (stage === 'acct') return 'nhap' // đã ký, chờ kế toán nhập
  if (stage === 'done') return 'done'
  return 'doing'
}
function recordStage(r, batch) {
  if (!r.nhapLaiSignedAt) return 'doing'
  if (!r.nhapLaiDoneAt) return 'nhap'
  if (!batch) return 'gom'
  return batch.accountedAt ? 'done' : 'xuat'
}

export function lookupRows({ slips = [], phieus = [], swapRecords = [], swapBatches = [] } = {}) {
  const rows = []
  // Nhập trả lại: khách trả nguyên vẹn
  for (const s of slips) {
    if (!s?.pdf) continue
    ;(s.pdf.items || []).forEach((it, i) => rows.push({
      id: `tra:${s.id}#${i}`, ref: s.id, nguon: 'tra', huong: 'nhap', so: s.maPhieu || s.form?.soHD || '',
      kho: slipLoai(s) || 'C', who: s.khachHang || s.pdf.benMua?.ten || '', date: isoDay(s.createdAt), stage: slipStage(s.stage),
      ma: '', ten: it.ten || '', soLo: s.form?.items?.[i]?.soLo || it.soLo || '', soLuong: Number(it.soLuong) || 0, dvt: it.dvt || '',
      extra: s.form?.xmTinhTrang || '', huyPhieu: '', // tình trạng hàng ghi ở BB xác minh của phiếu
    }))
  }
  // Đổi trả (quy trình mới): khách trả lỗi, một dòng cho tới khi xuất huỷ xong
  const batchOf = id => swapBatches.find(b => b.id === id)
  const swapKeysByPhieu = new Map()
  for (const r of swapRecords) {
    if (!isV2(r)) continue
    const batch = r.huyBatchId ? batchOf(r.huyBatchId) : null
    const huyPhieu = batch?.soPhieuXuat || ''
    ;(r.items || []).forEach((it, i) => {
      rows.push({
        id: `doitra:${r.id}#${i}`, ref: r.id, nguon: 'doitra', huong: 'huy', so: huyPhieu, kho: r.entity === 'donC' ? 'C' : 'DTP',
        who: r.customerName || '', date: isoDay(r.date), stage: recordStage(r, batch),
        ma: it.maHang || '', ten: it.tenHang || '', soLo: it.loLoi || '', soLuong: Number(it.soLuong) || 0, dvt: it.dvt || '',
        extra: it.lyDo || '', huyPhieu,
      })
      if (huyPhieu) {
        const keys = swapKeysByPhieu.get(huyPhieu) || new Set()
        keys.add(lotKey(it.tenHang, it.loLoi)); swapKeysByPhieu.set(huyPhieu, keys)
      }
    })
  }
  // Hàng huỷ Kho C / Kho DTP: phát sinh; dòng đã là hàng đổi trả (cùng phiếu xuất huỷ + hàng + lô) không hiện lần nữa
  for (const p of phieus) {
    const skip = swapKeysByPhieu.get(p.soPhieu)
    ;(p.items || []).forEach((it, i) => {
      if (skip?.has(lotKey(it.tenHang, it.soLo))) return
      rows.push({
        id: `kho:${p.id}#${i}`, ref: p.id, nguon: 'kho', huong: 'huy', so: p.soPhieu || '', kho: p.kho, who: p.lyDo || '',
        date: p.ngayPhieu || isoDay(p.importedAt), stage: p.stage === 'done' ? 'done' : 'doing',
        ma: it.maHang || '', ten: it.tenHang || '', soLo: it.soLo || '', soLuong: Number(it.thucHuy ?? it.soLuong) || 0, dvt: it.dvt || '',
        extra: it.tinhTrang || '', huyPhieu: '',
      })
    })
  }
  return rows
}

export function filterLookup(rows, { kho = 'all', nguon = 'all', huong = 'all', month = 'all', stage = 'all', q = '' } = {}) {
  const needle = normText(q.trim())
  const stages = stage === 'all' ? null : STAGE_FILTER[stage][1]
  return rows.filter(r => (kho === 'all' || r.kho === kho)
    && (nguon === 'all' || r.nguon === nguon)
    && (huong === 'all' || r.huong === huong)
    && (month === 'all' || r.date.startsWith(month))
    && (!stages || stages.includes(r.stage))
    && (!needle || [r.ma, r.ten, r.soLo, r.so, r.who, r.huyPhieu].some(v => normText(v).includes(needle))))
}

// Cộng số lượng theo hàng + lô (cùng tên và lô thì gộp), nhiều nhất trước.
export function summarizeLookup(rows) {
  const map = new Map()
  for (const r of rows) {
    const key = lotKey(r.ten, r.soLo)
    const e = map.get(key) || { ma: r.ma, ten: r.ten, soLo: r.soLo, dvt: r.dvt, soLuong: 0, phieu: new Set(), nguon: new Set(), kho: new Set() }
    e.soLuong += r.soLuong; e.phieu.add(`${r.nguon}:${r.ref}`); e.nguon.add(r.nguon); e.kho.add(r.kho)
    map.set(key, e)
  }
  return [...map.values()].sort((a, b) => b.soLuong - a.soLuong)
}

// Các dòng cùng hàng + số lô (chưa có số lô thì không nối được) theo ngày — để biết lô đó đã đi những đâu.
export function sameLot(rows, row) {
  if (!row.soLo) return []
  const key = lotKey(row.ten, row.soLo)
  return rows.filter(r => lotKey(r.ten, r.soLo) === key).sort((a, b) => a.date.localeCompare(b.date))
}
