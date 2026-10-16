// Lấy dữ liệu 3 tab cũ (Theo dõi nhập trả lại · Đổi trả hàng · Theo dõi hàng huỷ) sang tab "Hàng trả & huỷ (Demo)".
// Chỉ SAO CHÉP — không sửa / xoá dữ liệu tab cũ. Mọi phiếu tab cũ đã làm xong nên vào thẳng bước cuối (Hoàn thành /
// Huỷ xong), mốc thời gian lấy theo lúc phiếu cũ hoàn thành để cột Hoàn thành xếp đúng tháng. Mỗi bản sao giữ
// legacyId ("<khoá tab cũ>:<id>") — bấm lấy lại nhiều lần chỉ thêm phiếu mới phát sinh, không trùng.

import { BATCH_STEPS, CASE_FLOWS, DEFAULT_KE_TOAN, newItem, parseDateText, toIsoDate } from './flowV2'
import { slipLoai } from './returnSlips'
import { tinhTrangFromLyDo } from './swapReturnBatch'

const rid = p => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
const lastStep = kind => CASE_FLOWS[kind].steps.length - 1
const firstIso = (...vals) => vals.find(v => v && !Number.isNaN(new Date(v).getTime())) || new Date().toISOString()
const dayOf = iso => toIsoDate(new Date(iso))
const isoDate = v => (v ? parseDateText(v) || String(v) : '')
const num = v => (v === '' || v === null || v === undefined ? null : (Number.isFinite(Number(v)) ? Number(v) : v))

function legacyCase({ legacyId, kind, sub = null, kho, khachHang, soDon = '', items, form, keToan, at, createdAt, extra = {} }) {
  const k = keToan || DEFAULT_KE_TOAN
  return {
    id: rid('case'), legacyId, kind, sub, kho, khachHang: khachHang || '', soDon: soDon || '', loiLyDo: '',
    items: items.length ? items : [newItem()], files: [], photos: [], signedNhap: [],
    form: { xmNgay: form?.xmNgay || dayOf(at), xmGio: form?.xmGio || '08:30', keToan: k },
    phieuNhapLai: '', keToan: k, ktDone: null, batchId: null, flowVer: 2,
    step: lastStep(kind), stepAt: at, createdAt: createdAt || at, history: [{ step: lastStep(kind), at }],
    ...extra,
  }
}

// Theo dõi nhập trả lại (return_slips) → hồ sơ Trả nguyên vẹn. Có PDF biên bản thì giữ luôn phần Biên bản trả lại hàng.
export function caseFromReturnSlip(slip) {
  const pdf = slip.pdf || null
  const f = slip.form || {}
  const at = firstIso(slip.doneAt, slip.exportedAt, slip.approvedAt, slip.createdAt)
  const items = (pdf?.items || []).map((it, i) => {
    const x = f.items?.[i] || {}
    return newItem({
      tenHang: it.ten || '', dvt: it.dvt || '', soLuong: num(it.soLuong), donGia: num(it.donGia),
      soLo: x.soLo || it.soLo || '', hanDung: isoDate(x.hanDung), quyCach: x.quyCach || '',
      tinhTrang: x.tinhTrang || f.xmTinhTrang || 'Hàng nguyên vẹn',
    })
  })
  let traHang = null
  if (pdf) {
    const meta = { ...pdf }
    delete meta.items
    traHang = {
      pdf: meta,
      form: {
        ngayLap: f.ngayLap || '', mst: f.mst || '', soHD: f.soHD || '', kyHieu: f.kyHieu || '', ngayHD: f.ngayHD || '',
        benA: f.benA || DEFAULT_KE_TOAN, benAChucVu: f.benAChucVu || 'Kế toán đơn hàng', benB: f.benB || '', benBChucVu: f.benBChucVu || 'Thủ kho',
      },
    }
  }
  return legacyCase({
    legacyId: `return_slips:${slip.id}`, kind: 'tra', sub: pdf?.mau === 'NOIBO' ? 'tuChoi' : 'daNhan',
    kho: slipLoai(slip) === 'DTP' ? 'DTP' : 'C',
    khachHang: slip.khachHang || pdf?.benMua?.ten, soDon: slip.donHang || slip.maPhieu,
    items, form: f, keToan: f.xmKeToan, at, createdAt: slip.createdAt, extra: traHang ? { traHang } : {},
  })
}

// Đổi trả hàng (swap_return_records) → hồ sơ Trả lỗi · đổi hàng, đã Huỷ xong.
function swapItems(r) {
  return (r.items || []).map(it => newItem({
    maHang: it.maHang || '', tenHang: it.tenHang || '', soLo: it.loLoi || '', hanDung: isoDate(it.hanDungLoi),
    dvt: it.dvt || '', soLuong: num(it.soLuong), quyCach: it.quyCach || '',
    tinhTrang: tinhTrangFromLyDo(it.lyDo) || 'Hàng lỗi', loDoi: it.loDoi || '',
  }))
}

export function caseFromSwapRecord(r, batch = null) {
  const items = swapItems(r)
  const at = firstIso(batch?.accountedAt, batch?.signedAt, r.nhapLaiDoneAt, r.nhapLaiSignedAt, r.nhapLaiExportedAt, r.createdAt)
  const c = legacyCase({
    legacyId: `swap_return_records:${r.id}`, kind: 'loi', kho: r.entity === 'donDTP' ? 'DTP' : 'C',
    khachHang: r.customerName, items, form: { xmNgay: r.date }, keToan: r.accountantNhapLai, at, createdAt: r.createdAt,
  })
  c.loiLyDo = items[0]?.tinhTrang || ''
  return c
}

const BATCH_DONE = BATCH_STEPS.length - 1

function legacyBatch({ legacyId, no, kho, entries, form, keToan, khoXuat, at, createdAt }) {
  const day = dayOf(at)
  return {
    id: rid('batch'), legacyId, no, kho, entries,
    items: entries.flatMap(e => e.items.map(it => ({ ...it, rowId: rid('r'), entryId: e.id }))),
    form: {
      soBB: form?.soBB || '', ngayLap: form?.ngayLap || day, xlNgay: form?.xlNgay || form?.ngayLap || day, xlGio: form?.xlGio || '09:00',
      xmNgay: form?.xmNgay || form?.ngayLap || day, xmGio: form?.xmGio || '08:30',
      diaDiem: form?.diaDiem || 'Kho CN Hồ Chí Minh', phuongPhap: form?.phuongPhap || 'Xuất gửi nhà máy xử lý', keToan: keToan || DEFAULT_KE_TOAN,
    },
    khoXuat: khoXuat || (kho === 'C' ? '020102' : '020105'), signedHuy: [], keToan: keToan || DEFAULT_KE_TOAN, ktDone: null,
    step: BATCH_DONE, stepAt: at, createdAt: createdAt || at,
  }
}

// Bộ huỷ của Đổi trả hàng (swap_huy_batches) → đợt huỷ đã xong, mỗi đợt đổi trả trong bộ là 1 mục.
export function batchFromSwapBatch(b, casesOfBatch) {
  const kho = b.entity === 'donDTP' ? 'DTP' : 'C'
  const entries = casesOfBatch.map(c => ({
    id: rid('pool'), kho, src: 'loi', caseId: c.id, who: c.khachHang || 'Khách hàng',
    items: c.items.filter(it => it.maHang || it.tenHang).map(it => ({ ...it, rowId: rid('r') })), addedAt: c.createdAt, pxk: null,
  }))
  return legacyBatch({
    legacyId: `swap_huy_batches:${b.id}`, no: `Bộ ${String(b.no).padStart(2, '0')} (đổi trả)`, kho, entries, form: b.form,
    keToan: b.accountant, at: firstIso(b.accountedAt, b.signedAt, b.createdAt), createdAt: b.createdAt,
  })
}

// Theo dõi hàng huỷ (huy_slips) → đợt huỷ đã xong, cả phiếu xuất kho là 1 mục hàng phát sinh.
export function batchFromHuyPhieu(p) {
  const kho = p.kho === 'DTP' ? 'DTP' : 'C'
  const items = (p.items || []).filter(it => it.maHang || it.tenHang).map(it => newItem({
    maHang: it.maHang || '', tenHang: it.tenHang || '', soLo: it.soLo || '', hanDung: isoDate(it.hanDung), dvt: it.dvt || '',
    soLuong: num(it.thucHuy ?? it.soLuong), quyCach: it.quyCach || '', tinhTrang: it.tinhTrang || '',
  }))
  const at = firstIso(p.doneAt, p.exportedAt, p.importedAt)
  const entry = {
    id: rid('pool'), kho, src: 'ps', caseId: null, who: p.lyDo || (p.soPhieu ? `PXK ${p.soPhieu}` : 'Hàng huỷ'),
    items, addedAt: p.importedAt || at, pxk: p.fileName ? { name: p.fileName } : null,
  }
  return legacyBatch({
    legacyId: `huy_slips:${p.id}`, no: p.soPhieu || `Phiếu huỷ ${dayOf(at)}`, kho, entries: [entry], form: p.form,
    keToan: p.form?.keToan, khoXuat: p.khoXuat, at, createdAt: p.importedAt,
  })
}

// Gộp dữ liệu tab cũ vào state Demo. Trả về { cases, batches, added: { cases, batches } } — phần đã lấy trước đó
// (cùng legacyId) bỏ qua. Bản ghi theo quy trình cũ của Đổi trả hàng (không phải flow v2) cũng lấy, không có bộ huỷ.
export function importLegacy(state, { returnSlips = [], swapRecords = [], swapBatches = [], huySlips = [] }) {
  const have = new Set([...state.cases, ...state.batches].map(x => x.legacyId).filter(Boolean))
  const newCases = []
  const newBatches = []
  for (const s of returnSlips) {
    if (s && !have.has(`return_slips:${s.id}`)) newCases.push(caseFromReturnSlip(s))
  }
  const batchOf = id => swapBatches.find(b => b.id === id) || null
  const swapCases = new Map()
  for (const r of swapRecords) {
    if (!r || have.has(`swap_return_records:${r.id}`)) continue
    const c = caseFromSwapRecord(r, r.huyBatchId ? batchOf(r.huyBatchId) : null)
    swapCases.set(r.id, c)
    newCases.push(c)
  }
  for (const b of swapBatches) {
    if (!b || have.has(`swap_huy_batches:${b.id}`)) continue
    const members = swapRecords.filter(r => r?.huyBatchId === b.id).map(r => swapCases.get(r.id)).filter(Boolean)
    if (!members.length) continue
    const batch = batchFromSwapBatch(b, members)
    members.forEach(c => { c.batchId = batch.id })
    newBatches.push(batch)
  }
  for (const p of huySlips) {
    if (p && !have.has(`huy_slips:${p.id}`)) newBatches.push(batchFromHuyPhieu(p))
  }
  return {
    cases: [...state.cases, ...newCases],
    batches: [...state.batches, ...newBatches],
    added: { cases: newCases.length, batches: newBatches.length },
  }
}
