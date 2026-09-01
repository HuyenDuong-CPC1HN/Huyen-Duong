import * as XLSX from 'xlsx'

const SHEET_NAME = 'BIEN BAN NHAP HANG'
const DATA_START_ROW = 13
const FOOTER_START_ROW = 102
const DEFAULT_STYLE = { patternType: 'none' }
const YELLOW_FILL = { patternType: 'solid', fgColor: { rgb: 'FFF2CC' }, bgColor: { rgb: 'FFFFFF' } }

function formatDateVi(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function setCell(ws, addr, value, style = DEFAULT_STYLE) {
  if (value === null || value === undefined || value === '') {
    ws[addr] = { t: 'z', s: style }
    return
  }
  if (typeof value === 'number') {
    ws[addr] = { t: 'n', v: value, s: style }
    return
  }
  ws[addr] = { t: 's', v: String(value), s: style }
}

function clearDataRows(ws, fromRow, toRow) {
  for (let r = fromRow; r <= toRow; r += 1) {
    for (const col of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']) {
      delete ws[`${col}${r}`]
    }
  }
}

export function fillReceiptSheet(ws, rows, { warehouseLabel = '', metadata = {} } = {}) {
  const meta = {
    ngayNhap: metadata.ngayNhap || new Date().toLocaleDateString('vi-VN'),
    benGiaoHang: metadata.benGiaoHang || 'Công ty CP Dược phẩm CPC1 Hà Nội',
    benVanChuyen: metadata.benVanChuyen || 'Vận tải 24h',
    benNhanHang: metadata.benNhanHang || 'CPC1 Hà Nội - Chi nhánh Hồ Chí Minh',
  }

  setCell(ws, 'C6', meta.ngayNhap)
  setCell(ws, 'C7', meta.benGiaoHang)
  setCell(ws, 'C8', meta.benVanChuyen)
  setCell(ws, 'C9', meta.benNhanHang)
  setCell(ws, 'A4', warehouseLabel ? `BIÊN BẢN NHẬP HÀNG — ${warehouseLabel}` : 'BIÊN BẢN NHẬP HÀNG')

  clearDataRows(ws, DATA_START_ROW, FOOTER_START_ROW - 1)

  rows.forEach((row, index) => {
    const r = DATA_START_ROW + index
    const hanDung = formatDateVi(row.hanDung)
    setCell(ws, `A${r}`, index + 1)
    setCell(ws, `B${r}`, row.maHang)
    setCell(ws, `C${r}`, row.tenHang || '')
    setCell(ws, `D${r}`, row.dvt || '')
    setCell(ws, `E${r}`, row.soLo || '')
    setCell(ws, `F${r}`, hanDung, hanDung ? { patternType: 'none' } : YELLOW_FILL)
    setCell(ws, `G${r}`, row.slHoaDon ?? 0)
    setCell(ws, `H${r}`, row.slThucTe ?? '', YELLOW_FILL)
    ws[`I${r}`] = {
      t: 'n',
      f: `IF(H${r}="","",IF(H${r}>G${r},H${r}-G${r},0))`,
      s: { patternType: 'none' },
    }
    ws[`J${r}`] = {
      t: 'n',
      f: `IF(H${r}="","",IF(H${r}<G${r},G${r}-H${r},0))`,
      s: { patternType: 'none' },
    }
    setCell(ws, `K${r}`, row.ghiChu || '', YELLOW_FILL)
  })

  const lastDataRow = DATA_START_ROW + Math.max(rows.length, 1) - 1
  ws['!ref'] = `A1:K${Math.max(FOOTER_START_ROW + 7, lastDataRow + 1)}`
}

export function workbookFromTemplateBuffer(templateBuffer, rows, options) {
  const wb = XLSX.read(templateBuffer, { type: 'array', cellStyles: true, cellFormula: true })
  const ws = wb.Sheets[SHEET_NAME]
  if (!ws) throw new Error('File mẫu biên bản nhập hàng không hợp lệ.')
  fillReceiptSheet(ws, rows, options)
  return wb
}

export async function exportReceiptFromTemplate({
  templateBuffer,
  khoC,
  khoLgt,
  metadata = {},
  processedAt = new Date(),
}) {
  const label = processedAt.toLocaleDateString('vi-VN').replaceAll('/', '-')

  if (khoC?.length) {
    const wbC = workbookFromTemplateBuffer(templateBuffer, khoC, { warehouseLabel: 'KHO C', metadata })
    XLSX.writeFile(wbC, `BienBanNhapHang_KhoC_${label}.xlsx`)
  }

  if (khoLgt?.length) {
    const wbLgt = workbookFromTemplateBuffer(templateBuffer, khoLgt, { warehouseLabel: 'KHO LGT', metadata })
    XLSX.writeFile(wbLgt, `BienBanNhapHang_KhoLGT_${label}.xlsx`)
  }
}

export async function loadReceiptTemplate(fetchImpl = fetch) {
  const res = await fetchImpl('/templates/BIEN_BAN_NHAP_HANG.xlsx')
  if (!res.ok) throw new Error('Không tải được file mẫu biên bản nhập hàng.')
  return res.arrayBuffer()
}
