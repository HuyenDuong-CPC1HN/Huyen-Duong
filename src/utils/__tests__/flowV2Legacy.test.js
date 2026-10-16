import { describe, expect, it } from 'vitest'
import { importLegacy } from '../flowV2Legacy'
import { BATCH_STEPS, doneMonth, isCaseDone, stepOfCase } from '../flowV2'

const returnSlips = [{
  id: 'slip_1', maPhieu: 'TH001', donHang: 'FB262/038621', khachHang: 'Công ty CP Bệnh viện Vạn Phúc City', stage: 'done',
  createdAt: '2026-08-02T03:00:00.000Z', doneAt: '2026-08-10T03:00:00.000Z',
  pdf: { mau: 'NOIBO', lyDo: 'Sai hoá đơn', benC: { daiDien: 'Nguyễn Văn A' }, items: [{ stt: 1, ten: 'Zencombi', dvt: 'ONG', soLuong: 100, donGia: 12000 }] },
  form: { ngayLap: '2026-08-05', soHD: '00038621', kyHieu: 'C26TCH', benA: 'Võ Thị Ly', benB: 'Dương Thị Ngọc Huyền', xmNgay: '2026-08-05', xmGio: '09:00', xmKeToan: 'Võ Thị Ly', xmMau: 'U', items: [{ soLo: 'L01', hanDung: '2028-01-31', quyCach: 'Hộp 10 lọ' }] },
}]
const swapRecords = [{
  id: 'swap_donC_1', flow: 'v2', entity: 'donC', date: '2026-07-20', customerName: 'PK An Bình', accountantNhapLai: 'Trần Thị Ái Lâm',
  items: [{ maHang: 'A01264', tenHang: 'Ambroxen', loLoi: 'B12', hanDungLoi: '31/12/2027', loDoi: 'B13', dvt: 'ONG', soLuong: '20', quyCach: 'Hộp 20 ống', lyDo: 'Có cặn đổi cho PK An Bình' }],
  nhapLaiDoneAt: '2026-07-25T03:00:00.000Z', huyBatchId: 'huy_donC_1', createdAt: '2026-07-20T03:00:00.000Z',
}]
const swapBatches = [{ id: 'huy_donC_1', entity: 'donC', no: 1, accountant: 'Lưu Thị Thuỳ', signedAt: '2026-07-30T03:00:00.000Z', accountedAt: '2026-08-01T03:00:00.000Z', createdAt: '2026-07-28T03:00:00.000Z', form: { soBB: '12' } }]
const huySlips = [{
  id: 'huy_1', kho: 'DTP', soPhieu: 'XH2605/0012', ngayPhieu: '2026-06-03', khoXuat: '020105', lyDo: 'Huỷ hàng cận date', fileName: 'pxk.pdf',
  importedAt: '2026-06-03T03:00:00.000Z', doneAt: '2026-06-09T03:00:00.000Z', stage: 'done',
  items: [{ maHang: 'B01767', tenHang: 'Bupi-BFS heavy', soLo: 'X1', hanDung: '2026-07-01', dvt: 'ONG', soLuong: 670, thucHuy: 660, quyCach: '', tinhTrang: 'Cận date' }],
  form: { soBB: '7', ngayLap: '2026-06-05' },
}]
const src = { returnSlips, swapRecords, swapBatches, huySlips }

describe('Hàng trả & huỷ — lấy dữ liệu từ tab cũ', () => {
  it('sao chép cả 3 tab vào Hoàn thành / Huỷ xong, đúng tháng hoàn thành', () => {
    const r = importLegacy({ cases: [], batches: [] }, src)
    expect(r.added).toEqual({ cases: 2, batches: 2 })
    const tra = r.cases.find(c => c.kind === 'tra')
    expect(isCaseDone(tra)).toBe(true)
    expect(doneMonth(tra)).toBe('2026-08')
    expect(tra).toMatchObject({ sub: 'tuChoi', kho: 'DTP', soDon: 'FB262/038621', keToan: 'Võ Thị Ly' })
    expect(tra.items[0]).toMatchObject({ tenHang: 'Zencombi', soLuong: 100, donGia: 12000, soLo: 'L01', hanDung: '2028-01-31', quyCach: 'Hộp 10 lọ' })
    expect(tra.traHang.form).toMatchObject({ soHD: '00038621', benA: 'Võ Thị Ly' })
    expect(tra.traHang.pdf.benC.daiDien).toBe('Nguyễn Văn A')

    const loi = r.cases.find(c => c.kind === 'loi')
    expect(stepOfCase(loi).k).toBe('xong')
    expect(doneMonth(loi)).toBe('2026-08')
    expect(loi.items[0]).toMatchObject({ soLo: 'B12', hanDung: '2027-12-31', loDoi: 'B13', soLuong: 20, tinhTrang: 'Có cặn' })
    const swapBatch = r.batches.find(b => b.id === loi.batchId)
    expect(swapBatch).toMatchObject({ kho: 'C', step: BATCH_STEPS.length - 1, no: 'Bộ 01 (đổi trả)' })
    expect(swapBatch.form.soBB).toBe('12')
    expect(swapBatch.entries[0].caseId).toBe(loi.id)

    const huy = r.batches.find(b => b.kho === 'DTP')
    expect(huy).toMatchObject({ no: 'XH2605/0012', khoXuat: '020105', step: BATCH_STEPS.length - 1 })
    expect(huy.items[0]).toMatchObject({ maHang: 'B01767', soLuong: 660, tinhTrang: 'Cận date' })
  })

  it('bấm lấy lại không bị trùng, chỉ thêm phiếu mới', () => {
    const first = importLegacy({ cases: [], batches: [] }, src)
    const again = importLegacy(first, src)
    expect(again.added).toEqual({ cases: 0, batches: 0 })
    const more = importLegacy(first, { ...src, huySlips: [...huySlips, { ...huySlips[0], id: 'huy_2', soPhieu: 'XH2606/0001' }] })
    expect(more.added).toEqual({ cases: 0, batches: 1 })
  })
})
