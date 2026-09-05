import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  buildReceiptFromFiles,
  calcChenhLech,
  detectPhieuXuatKhoWarehouse,
  enrichRowsFromPdfCatalog,
  mergeWarehouseRows,
  parseBienBanGiaoNhanTong,
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
    const { khoC, khoLgt } = buildReceiptFromFiles({ khoCRows, khoLgtRows: [], khoCPdfTexts: [pdfText] })
    expect(khoC).toHaveLength(2)
    const missing = khoC.find(r => r.maHang === 'A01840')
    expect(missing).toMatchObject({ soLo: '612', slHoaDon: 272, hanDung: '2029-06-21' })
    expect(missing.ghiChu).toContain('không có trong file Excel')
    expect(khoLgt).toHaveLength(0)
  })

  it('keeps items from a Kho LGT-only pdf in Kho LGT, not Kho C (zone must be preserved)', () => {
    const pdfText = 'Địa điểm: Kho DTP LGT '
      + 'Stt   Mã vật tư   Tên vật tư   Đvt   Số lượng   Hạn dùng Lô Nước SX   Vị trí  A   B C   D   2   3   5 1   4 '
      + '1   Arica Folicus Cream - Hộp 1 tuýp 30g A01840   TUBE   272,000 DTP-VNM   612   21/06/2029'
    const { khoC, khoLgt } = buildReceiptFromFiles({ khoCRows: [], khoLgtRows: [], khoLgtPdfTexts: [pdfText] })
    expect(khoC).toHaveLength(0)
    expect(khoLgt).toHaveLength(1)
    expect(khoLgt[0]).toMatchObject({ maHang: 'A01840', soLo: '612' })
    expect(khoLgt[0].ghiChu).toContain('PDF Kho LGT')
  })

  it('parses master "Biên bản giao nhận" PDF (positional columns) — real Chrome-exported layout', () => {
    // Mô phỏng bố cục cột thật (toạ độ x lấy từ file thật): STT, Mã hàng, Tên hàng, Số lô, Kiện lẻ,
    // Kiện nguyên, Tổng SL, Ghi chú — 1 trang, header + 2 dòng dữ liệu.
    const header = [
      { str: 'STT', x: 42, y: 739 }, { str: 'Mã hàng', x: 78, y: 739 }, { str: 'Tên hàng', x: 158, y: 739 },
      { str: 'Số lô', x: 266, y: 739 }, { str: 'Kiện lẻ', x: 338, y: 739 }, { str: 'Kiện nguyên', x: 398, y: 739 },
      { str: 'Tổng SL', x: 483, y: 739 }, { str: 'Ghi', x: 548, y: 739 },
    ]
    const row1 = [
      { str: '1', x: 50, y: 700 }, { str: 'F00464', x: 83, y: 700 }, { str: 'Fogyma - Hộp 8 vỉ x 5 ống 10ml', x: 134, y: 700 },
      { str: '080326', x: 268, y: 700 }, { str: '0', x: 353, y: 700 }, { str: '4', x: 428, y: 700 }, { str: '5760', x: 496, y: 700 },
    ]
    const row2 = [
      // "ống 1ml" là dòng 2 bị wrap của ô Tên hàng — trong text phẳng thật, nó xuất hiện NGAY SAU dòng 1
      // của cùng ô (do bảng HTML render xong 1 ô rồi mới sang ô kế), TRƯỚC Số lô — không phải ở cuối dòng.
      { str: '2', x: 50, y: 680 }, { str: 'A01252', x: 83, y: 680 }, { str: 'Arimenus - Hộp 10', x: 134, y: 680 },
      { str: 'ống 1ml', x: 134, y: 673 },
      { str: '011225', x: 268, y: 680 }, { str: '0', x: 353, y: 680 }, { str: '1', x: 428, y: 680 }, { str: '660', x: 496, y: 680 },
    ]
    const pagesItems = [[...header, ...row1, ...row2]]
    const fullText = pagesItems[0].map(i => i.str).join(' ')
    const rows = parseBienBanGiaoNhanTong(pagesItems, fullText)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ maHang: 'F00464', tenHang: 'Fogyma - Hộp 8 vỉ x 5 ống 10ml', soLo: '080326', soLuong: 5760 })
    expect(rows[1]).toMatchObject({ maHang: 'A01252', tenHang: 'Arimenus - Hộp 10 ống 1ml', soLo: '011225', soLuong: 660 })
  })

  it('adds master BBGN items missing from every uploaded file into Kho C', () => {
    const excelC = makeWorkbook([{ Mã: 'A01259', Tên: 'A', 'Số lô đề nghị': '010426', 'Lượng cần': 20, ĐVT: 'VIEN' }])
    const khoCRows = readWarehouseExportRows(excelC)
    const masterBbgnRows = [{ maHang: 'F00464', tenHang: 'Fogyma', dvt: '', soLuong: 5760, soLo: '080326', hanDung: null }]
    const { khoC } = buildReceiptFromFiles({ khoCRows, khoLgtRows: [], masterBbgnRows })
    expect(khoC).toHaveLength(2)
    const missing = khoC.find(r => r.maHang === 'F00464')
    expect(missing).toMatchObject({ soLo: '080326', slHoaDon: 5760 })
    expect(missing.ghiChu).toContain('không có trong file Excel')
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
})
