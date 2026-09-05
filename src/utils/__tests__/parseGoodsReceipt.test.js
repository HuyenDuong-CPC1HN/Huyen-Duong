import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  buildReceiptFromFiles,
  calcChenhLech,
  detectPhieuXuatKhoWarehouse,
  enrichRowsFromPdfCatalog,
  mergeWarehouseRows,
  parsePdfDeliveryNote,
  parsePdfItems,
  readWarehouseExportRows,
} from '../parseGoodsReceipt'

function makeWorkbook(rows) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Sheet1')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}

describe('parseGoodsReceipt', () => {
  it('merges same maHang + soLo and keeps different lots separate', () => {
    const merged = mergeWarehouseRows([
      { maHang: 'A001', soLo: 'L1', slHoaDon: 10, kienNguyen: 2, kienLe: 1 },
      { maHang: 'A001', soLo: 'L1', slHoaDon: 5, kienNguyen: 1, kienLe: 0 },
      { maHang: 'A001', soLo: 'L2', slHoaDon: 3, kienNguyen: 1, kienLe: 0 },
    ])
    expect(merged).toHaveLength(2)
    expect(merged.find(r => r.soLo === 'L1')).toMatchObject({ slHoaDon: 15, kienNguyen: 3, kienLe: 1 })
    expect(merged.find(r => r.soLo === 'L2')).toMatchObject({ slHoaDon: 3 })
  })

  it('reads warehouse export columns (Mã, Lượng cần, Số kiện cần)', () => {
    const buffer = makeWorkbook([
      {
        Mã: 'A01259',
        Tên: 'Thuốc A',
        'Số lô đề nghị': 'LOT1',
        'Hạn dùng': '2028-04-23',
        'Lượng cần': 20,
        'Số kiện cần': 2,
        'Số hộp cần': 1,
        ĐVT: 'VIEN',
      },
    ])
    const rows = readWarehouseExportRows(buffer)
    expect(rows[0]).toMatchObject({
      maHang: 'A01259',
      slHoaDon: 20,
      kienNguyen: 2,
      kienLe: 1,
      hanDung: '2028-04-23',
    })
  })

  it('parses pdf delivery note rows by stt + product code', () => {
    const pdfText = '3 F00507 Falgankid - Hộp 4 vỉ x 5 ống 10ml 010526 0 20 26400 44 A01259 Aricamun - 2 vỉ x 15 viên 010426 0 1 7920'
    const rows = parsePdfDeliveryNote(pdfText)
    expect(rows).toHaveLength(2)
    expect(rows[1]).toMatchObject({ maHang: 'A01259', soLo: '010426', kienNguyen: 1, tongSl: 7920 })
  })

  it('parses real "Phiếu xuất kho" PDF layout (Tên trước Mã, số lượng có dấu phẩy/chấm)', () => {
    const pdfText = 'Địa điểm: DH030926/03507_Dự trù SO Kho C - Chi nhánh HCM - 0903114623 '
      + 'Stt   Mã vật tư   Tên vật tư   Đvt   Số lượng   Hạn dùng Lô Nước SX   Vị trí  A   B C   D   2   3   5 1   4 '
      + '1   Arica Folicus Cream - Hộp 1 tuýp 30g A01840   TUBE   272,000 DTP-VNM   612   21/06/2029 '
      + '2   Hexami Cap - Lọ 60 viên H05005   VIEN   1.440,000 DTP-VNM   010826   31/07/2029'
    const rows = parsePdfItems(pdfText)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ maHang: 'A01840', tenHang: 'Arica Folicus Cream - Hộp 1 tuýp 30g', dvt: 'TUBE', soLuong: 272, soLo: '612', hanDung: '2029-06-21' })
    expect(rows[1]).toMatchObject({ maHang: 'H05005', soLuong: 1440, hanDung: '2029-07-31' })
  })

  it('detects target warehouse from Phiếu xuất kho "Địa điểm" line', () => {
    expect(detectPhieuXuatKhoWarehouse('...Địa điểm: DH030926/03507_Dự trù SO Kho C - Chi nhánh HCM...')).toBe('C')
    expect(detectPhieuXuatKhoWarehouse('...Địa điểm: DH030926/03506_Chi nhánh HCM - Kho DTP LGT...')).toBe('LGT')
    expect(detectPhieuXuatKhoWarehouse('không có thông tin kho')).toBeNull()
  })

  it('fills missing hạn dùng/dvt from pdf catalog and flags quantity mismatch in ghi chú', () => {
    const rows = enrichRowsFromPdfCatalog(
      [{ maHang: 'A01840', soLo: '612', slHoaDon: 300, dvt: '', hanDung: null }],
      [{ maHang: 'A01840', soLo: '612', tenHang: 'Arica', dvt: 'TUBE', hanDung: '2029-06-21', soLuong: 272 }],
    )
    expect(rows[0]).toMatchObject({ dvt: 'TUBE', hanDung: '2029-06-21' })
    expect(rows[0].ghiChu).toContain('272')
    expect(rows[0].ghiChu).toContain('300')
  })

  it('merges multiple excel files (already-parsed rows) per warehouse into one table', () => {
    const excelC1 = makeWorkbook([{ Mã: 'A01259', Tên: 'A', 'Số lô đề nghị': '010426', 'Lượng cần': 7920, 'Số kiện cần': 1, ĐVT: 'VIEN' }])
    const excelC2 = makeWorkbook([{ Mã: 'A01259', Tên: 'A', 'Số lô đề nghị': '010426', 'Lượng cần': 80, 'Số kiện cần': 0, ĐVT: 'VIEN' }])
    const rowsC1 = readWarehouseExportRows(excelC1)
    const rowsC2 = readWarehouseExportRows(excelC2)
    const { khoC, khoLgt } = buildReceiptFromFiles({ khoCRows: [...rowsC1, ...rowsC2], khoLgtRows: rowsC1 })
    expect(khoC).toHaveLength(1)
    expect(khoC[0].slHoaDon).toBe(8000)
    expect(khoLgt).toHaveLength(1)
    expect(khoLgt[0].maHang).toBe('A01259')
  })

  it('skips rows whose Số lô is "Hết" — item was never actually fulfilled', () => {
    const buffer = makeWorkbook([
      { Mã: 'A01259', Tên: 'A', 'Số lô đề nghị': 'LOT1', 'Lượng cần': 20, ĐVT: 'VIEN' },
      { Mã: 'A01497', Tên: 'B', 'Số lô đề nghị': 'Hết', 'Lượng cần': 30, ĐVT: 'LO' },
      { Mã: 'B01418', Tên: 'C', 'Số lô đề nghị': 'ko lấy', 'Lượng cần': 1440, ĐVT: 'ONG' },
    ])
    const rows = readWarehouseExportRows(buffer)
    expect(rows).toHaveLength(1)
    expect(rows[0].maHang).toBe('A01259')
  })

  it('adds pdf-only items (not found in any excel file) into Kho C for manual review', () => {
    const excelC = makeWorkbook([{ Mã: 'A01259', Tên: 'A', 'Số lô đề nghị': '010426', 'Lượng cần': 20, ĐVT: 'VIEN' }])
    const khoCRows = readWarehouseExportRows(excelC)
    const pdfText = 'Địa điểm: Kho C '
      + 'Stt   Mã vật tư   Tên vật tư   Đvt   Số lượng   Hạn dùng Lô Nước SX   Vị trí  A   B C   D   2   3   5 1   4 '
      + '1   Arica Folicus Cream - Hộp 1 tuýp 30g A01840   TUBE   272,000 DTP-VNM   612   21/06/2029'
    const { khoC, khoLgt } = buildReceiptFromFiles({ khoCRows, khoLgtRows: [], pdfTexts: [pdfText] })
    expect(khoC).toHaveLength(2)
    const missing = khoC.find(r => r.maHang === 'A01840')
    expect(missing).toMatchObject({ soLo: '612', slHoaDon: 272, hanDung: '2029-06-21' })
    expect(missing.ghiChu).toContain('không có trong file Excel')
    expect(khoLgt).toHaveLength(0)
  })

  it('calculates chenh lech from actual minus invoice quantity', () => {
    expect(calcChenhLech({ slHoaDon: 10, slThucTe: 12 })).toBe(2)
    expect(calcChenhLech({ slHoaDon: 10, slThucTe: null })).toBeNull()
  })

  it('marks rows needing manual expiry when pdf catalog has no match', () => {
    const rows = enrichRowsFromPdfCatalog([
      { maHang: 'X999', soLo: 'L1', hanDung: null },
    ], [])
    expect(rows[0].needsManual).toBe(true)
  })

  it('parses "biên bản giao nhận" rows even when a trailing Ghi chú follows Tổng SL', () => {
    // Dòng thật có Ghi chú (vd "20h thùng số 2") — trước đây bị coi 3 token cuối (thùng/số/2) là
    // Kiện lẻ/Kiện nguyên/Tổng SL nên rớt hẳn, không parse được.
    const pdfText = '8 K00675 Ketorolac-BFS - Hộp 10 lọ 2ml 010126GMP 1 0 200 20h thùng số 2 '
      + '9 L01021 Liproin - Hộp 1 tuýp 5g 1 15 0 3 2100'
    const rows = parsePdfDeliveryNote(pdfText)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ maHang: 'K00675', soLo: '010126GMP', kienLe: 1, kienNguyen: 0, tongSl: 200 })
  })

  it('auto-fills "SL thực tế" from biên bản giao nhận (source bienBanGiaoNhan), leaves phiếu xuất kho as ghi chú only', () => {
    const viaBienBan = enrichRowsFromPdfCatalog(
      [{ maHang: 'F00464', soLo: '080326', slHoaDon: 5760, slThucTe: null, ghiChu: '' }],
      [{ maHang: 'F00464', soLo: '080326', soLuong: 5760, source: 'bienBanGiaoNhan' }],
    )
    expect(viaBienBan[0].slThucTe).toBe(5760)
    expect(viaBienBan[0].ghiChu).toBe('')

    const viaPhieuXuatKho = enrichRowsFromPdfCatalog(
      [{ maHang: 'F00464', soLo: '080326', slHoaDon: 300, slThucTe: null }],
      [{ maHang: 'F00464', soLo: '080326', soLuong: 272, source: 'phieuXuatKho' }],
    )
    expect(viaPhieuXuatKho[0].slThucTe).toBeNull()
    expect(viaPhieuXuatKho[0].ghiChu).toContain('Lệch SL so PDF')
  })

  it('warns when tổng kiện khai trong biên bản giao nhận lệch với tổng đã tách trong bảng', () => {
    const pdfText = '1 A01259 Arica - Hộp 1 tuýp 30g 612 0 1 272 Tổng cả đơn 33 Kiện'
    const excelC = makeWorkbook([{ Mã: 'A01259', Tên: 'A', 'Số lô đề nghị': '612', 'Lượng cần': 272, 'Số kiện cần': 1, ĐVT: 'TUYP' }])
    const { warnings } = buildReceiptFromFiles({ khoCRows: readWarehouseExportRows(excelC), khoLgtRows: [], pdfTexts: [pdfText] })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('khai tổng 33 kiện')
    expect(warnings[0]).toContain('tách được 1 kiện')
  })

  it('keeps multi-token số lô intact (vd "1 14") instead of chopping it down to 1 token', () => {
    // Số lô thật ghi 2 token cách nhau bởi khoảng trắng — trước đây bị cắt mất token đầu.
    const pdfText = '9 L01021 Liproin - Hộp 1 tuýp 5g 1 14 1 1 867 167h thùng số 1 '
      + '10 L01021 Liproin - Hộp 1 tuýp 5g 1 15 0 3 2100'
    const rows = parsePdfDeliveryNote(pdfText)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ maHang: 'L01021', tenHang: 'Liproin - Hộp 1 tuýp 5g', soLo: '1 14', kienLe: 1, kienNguyen: 1, tongSl: 867 })
    expect(rows[1]).toMatchObject({ soLo: '1 15', kienNguyen: 3, tongSl: 2100 })
  })

  it('does not auto-fill "SL thực tế" or flag "Lệch SL" for a mã hàng shared by both kho (PDF ghi 1 dòng tổng gộp cả 2 kho)', () => {
    // D02124: Kho C 312 + Kho DTP 468 = PDF 780 — khớp, không phải sai lệch thật, nên không auto-fill
    // và không ghi chú cho dòng nào cả.
    const pdfText = '7 D02124 Dung dịch xịt mũi Nebusal spray baby - Hộp 1 lọ 50ml 07626G01 0 5 780'
    const { khoC, khoLgt, warnings } = buildReceiptFromFiles({
      khoCRows: [{ maHang: 'D02124', tenHang: 'Nebusal', dvt: 'HOP', soLo: '07626G01', hanDung: '2026-07-06', kienNguyen: 2, kienLe: 0, slHoaDon: 312 }],
      khoLgtRows: [{ maHang: 'D02124', tenHang: 'Nebusal', dvt: 'HOP', soLo: '07626G01', hanDung: '2026-07-06', kienNguyen: 3, kienLe: 0, slHoaDon: 468 }],
      pdfTexts: [pdfText],
    })
    expect(khoC[0]).toMatchObject({ slThucTe: null, ghiChu: '' })
    expect(khoLgt[0]).toMatchObject({ slThucTe: null, ghiChu: '' })
    expect(warnings).toHaveLength(0)
  })

  it('warns on the combined total when a shared mã hàng does NOT reconcile between both kho', () => {
    const pdfText = '7 D02124 Dung dịch xịt mũi Nebusal spray baby - Hộp 1 lọ 50ml 07626G01 0 5 780'
    const { warnings } = buildReceiptFromFiles({
      khoCRows: [{ maHang: 'D02124', tenHang: 'Nebusal', dvt: 'HOP', soLo: '07626G01', hanDung: '2026-07-06', kienNguyen: 2, kienLe: 0, slHoaDon: 300 }],
      khoLgtRows: [{ maHang: 'D02124', tenHang: 'Nebusal', dvt: 'HOP', soLo: '07626G01', hanDung: '2026-07-06', kienNguyen: 3, kienLe: 0, slHoaDon: 468 }],
      pdfTexts: [pdfText],
    })
    expect(warnings.some(w => w.includes('D02124') && w.includes('300') && w.includes('768'))).toBe(true)
  })
})
