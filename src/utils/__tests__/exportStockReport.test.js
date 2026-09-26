import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import PizZip from 'pizzip'
import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { fillStockReport, formatReportDateRange, stockReportFileName } from '../exportStockReport'

const TEMPLATE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../../public/templates/BAO_CAO_CAN_DATE_CLC.xlsx')

function loadTemplateBuffer() {
  const buf = readFileSync(TEMPLATE_PATH)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

function makeRow(overrides = {}) {
  return {
    maVatTu: 'B01767',
    tenVatTu: 'Bupi-BFS heavy - Hộp 10 lọ 2ml',
    maKho: '020101',
    dvt: 'LO',
    maLo: '010924',
    tenLo: '',
    hanDung: '2026-09-13',
    tuoiThuoc: 2,
    tonDau: 670,
    slNhap: 0,
    slXuat: 0,
    tonCuoi: 670,
    ...overrides,
  }
}

const dateRange = { tuNgay: '2026-03-01', denNgay: '2026-05-31', soNgay: 91 }

describe('fillStockReport — điền đúng file mẫu Báo cáo hàng cận date_CLC', () => {
  const canDateRows = [makeRow(), makeRow({ maVatTu: 'J00643', tenVatTu: 'Leve-SB 1500', maLo: '010224', hanDung: '2026-08-15', tonCuoi: 16 })]
  const clcRows = [makeRow({ tenLo: 'LO-TEN' }), makeRow({ maVatTu: 'C02019', hanDung: null, tuoiThuoc: null, tonDau: 500, tonCuoi: 500 })]
  const bytes = fillStockReport(loadTemplateBuffer(), { canDateRows, clcRows, dateRange })
  const wb = XLSX.read(bytes, { type: 'array', cellDates: true })

  it('giữ đúng 2 sheet, tiêu đề và dòng kỳ báo cáo như mẫu', () => {
    expect(wb.SheetNames).toEqual(['Cận date', 'CLC'])
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name]
      expect(ws.A1.v).toBe('Báo cáo tổng hợp nhập xuất tồn theo kho')
      expect(ws.A2.v).toBe('Từ ngày 01/03/2026 đến ngày 31/05/2026...')
    }
  })

  it('sheet Cận date: 9 cột như mẫu, dữ liệu từ dòng 5, hạn dùng là ngày thật, tuổi thuốc là công thức', () => {
    const ws = wb.Sheets['Cận date']
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null })
    expect(grid[3]).toEqual(['Stt', 'Mã vật tư', 'Tên vật tư', 'Mã kho', 'Đvt', 'Mã lô ', 'Hạn dùng', 'Tuổi thuốc\r\n(Tháng)', 'Tồn cuối'])
    expect(grid[4].slice(0, 6)).toEqual([1, 'B01767', 'Bupi-BFS heavy - Hộp 10 lọ 2ml', '020101', 'LO', '010924'])
    expect(grid[5][1]).toBe('J00643')
    expect(grid).toHaveLength(6)
    expect(ws.G5.v).toBeInstanceOf(Date)
    expect(ws.G5.v.toISOString().slice(0, 10)).toBe('2026-09-13')
    expect(ws.H5.f).toBe('IF(G5>=TODAY(),DATEDIF(TODAY(),G5,"m"),-DATEDIF(G5,TODAY(),"m"))')
    expect(ws.I5.v).toBe(670)
    expect(ws['!ref']).toBe('A1:I6')
    expect(ws['!merges'].map(m => XLSX.utils.encode_range(m))).toEqual(['A1:I1', 'A2:I2'])
  })

  it('sheet CLC: 13 cột, "Tên lô" lấy theo Mã lô khi file gốc không có, hàng không rõ hạn thì để trống ngày và tuổi thuốc', () => {
    const ws = wb.Sheets.CLC
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null })
    expect(grid[3]).toHaveLength(13)
    expect(grid[4].slice(5, 7)).toEqual(['010924', 'LO-TEN'])
    expect(grid[4].slice(9)).toEqual([670, 0, 0, 670])
    expect(ws.G6.v).toBe('010924')
    expect(ws.H6).toBeUndefined()
    expect(ws.I6).toBeUndefined()
    expect(ws.I5.f).toContain('DATEDIF(TODAY(),H5,"m")')
  })

  it('cập nhật vùng lọc, không còn calcChain gây lỗi khi mở bằng Excel', () => {
    const zip = new PizZip(bytes)
    expect(zip.file('xl/calcChain.xml')).toBeNull()
    const workbookXml = zip.file('xl/workbook.xml').asText()
    expect(workbookXml).toContain("'Cận date'!$A$4:$I$6")
    expect(workbookXml).toContain('CLC!$A$4:$M$6')
    expect(zip.file('xl/worksheets/sheet1.xml').asText()).toContain('<autoFilter ref="A4:I6"')
  })

  it('không có dòng nào thì vẫn xuất được file chỉ có tiêu đề', () => {
    const empty = XLSX.read(fillStockReport(loadTemplateBuffer(), { canDateRows: [], clcRows: [], dateRange: null }), { type: 'array' })
    const grid = XLSX.utils.sheet_to_json(empty.Sheets['Cận date'], { header: 1, raw: true, defval: null })
    expect(grid).toHaveLength(4)
  })
})

describe('tên file và dòng kỳ báo cáo', () => {
  it('đặt tên theo tháng xuất báo cáo như mẫu CNHCM-T06.26', () => {
    expect(stockReportFileName(new Date(2026, 5, 10))).toBe('CNHCM-T06.26_Báo cáo hàng cận date_CLC.xlsx')
  })
  it('không có kỳ báo cáo thì để trống', () => {
    expect(formatReportDateRange(null)).toBe('')
  })
})
