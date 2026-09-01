import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  buildReceiptFromFiles,
  calcChenhLech,
  enrichRowsFromPdfCatalog,
  mergeWarehouseRows,
  parsePdfDeliveryNote,
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

  it('duplicates kho C rows to kho LGT when shared excel flag is set', () => {
    const excelC = makeWorkbook([{ Mã: 'A01259', Tên: 'A', 'Số lô đề nghị': '010426', 'Lượng cần': 7920, 'Số kiện cần': 1, ĐVT: 'VIEN' }])
    const { khoC, khoLgt } = buildReceiptFromFiles({ excelCBuffer: excelC, pdfText: '', sharedExcelForBoth: true })
    expect(khoC).toHaveLength(1)
    expect(khoLgt).toHaveLength(1)
    expect(khoLgt[0].maHang).toBe('A01259')
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
