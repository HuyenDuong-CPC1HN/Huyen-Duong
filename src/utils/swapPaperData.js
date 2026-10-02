import { batchItems, nhapLaiItems, tinhTrangFromLyDo } from './swapReturnBatch'

// Dựng dữ liệu cho bản xem trước / in của Đổi trả hàng từ đợt và bộ huỷ, theo đúng dạng các biên bản dùng chung
// (ReturnSlipWorkspace.XacMinhPaper cho BB xác minh nhập lại kho; HangHuyPapers cho BB xác minh huỷ + BB xử lý huỷ).
const DEFAULT_KHO = { donC: '020101', donDTP: '020105' }
export const swapLoai = entity => (entity === 'donC' ? 'C' : 'DTP')

// "26/05/2029" → "2029-05-26"; không đúng dạng thì ''.
export function dmyToIso(text) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(text || ''))
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}

export function nhapLaiSlip(record) {
  const items = nhapLaiItems(record)
  return {
    khachHang: record.customerName || '',
    pdf: {
      mau: record.entity === 'donC' ? 'CPC1HN' : 'UPHARMA',
      items: items.map(it => ({ ten: it.tenHang || it.maHang || '', dvt: it.dvt || '', soLuong: Number(it.soLuong) || 0, soLo: it.loLoi || '' })),
    },
    form: {
      xmNgay: record.date, xmGio: '', xmDiaDiem: 'CN. Hồ Chí Minh', xmKeToan: record.accountantNhapLai || '', xmKetQua: '',
      items: items.map(it => ({ soLo: it.loLoi || '', hanDung: dmyToIso(it.hanDungLoi), quyCach: it.quyCach || '', tinhTrang: tinhTrangFromLyDo(it.lyDo) })),
    },
  }
}

export function newBatchForm(date = new Date()) {
  const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return { soBB: '', ngayLap: iso, xlNgay: iso, xlGio: '08:30', diaDiem: 'Kho CN Hồ Chí Minh', phuongPhap: 'Xuất gửi nhà máy xử lý', xmNgay: iso, xmGio: '08:30' }
}

export function huyPhieu(batch, records) {
  const items = batchItems(records)
  return {
    kho: swapLoai(batch.entity),
    khoXuat: DEFAULT_KHO[batch.entity],
    form: { ...newBatchForm(), ...(batch.form || {}) },
    items: items.map(it => ({
      maHang: it.maHang || '', tenHang: it.tenHang || '', soLo: it.loLoi || '', hanDung: dmyToIso(it.hanDungLoi), dvt: it.dvt || '',
      soLuong: it.soLuong ?? null, thucHuy: it.soLuong ?? null, quyCach: it.quyCach || '', tinhTrang: it.lyDo || '',
    })),
  }
}
