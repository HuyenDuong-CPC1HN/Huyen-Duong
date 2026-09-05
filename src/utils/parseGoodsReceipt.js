import * as XLSX from 'xlsx'

const COLUMN_ALIASES = {
  maHang: ['Mã hàng', 'Mã', 'Mã vật tư'],
  tenHang: ['Tên hàng', 'Tên hàng hóa', 'Tên', 'Tên vật tư'],
  dvt: ['ĐVT', 'Đvt', 'DVT'],
  soLo: ['Số lô', 'Số lô đề nghị', 'Mã lô'],
  hanDung: ['Hạn dùng', 'Han dung'],
  kienNguyen: ['Số kiện cần', 'Kiện nguyên'],
  kienLe: ['Số hộp cần', 'Kiện lẻ'],
  slHoaDon: ['Lượng cần', 'Số lượng', 'SL', 'Số lượng (Hóa đơn)', 'Đã lấy'],
}

const HEADER_CANDIDATES = new Set(['Mã hàng', 'Mã', 'Mã vật tư'])
const SKIP_LOT = new Set(['hết', 'het', 'ko lấy', 'ko lay', ''])
// Số lô ghi "Hết"/"Ko lấy": hàng không thực sự xuất được (hết hàng ở kho gửi) — không phải hàng đã nhập,
// nên loại hẳn khỏi bảng/biên bản nhập hàng, không chỉ xoá mỗi số lô.
const NOT_FULFILLED_LOT = new Set(['hết', 'het', 'ko lấy', 'ko lay'])
const PRODUCT_CODE = /^[A-Z]\d{4,5}$/

function normalizeHeader(value) {
  return String(value ?? '').trim()
}

function resolveField(header) {
  const key = normalizeHeader(header)
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.some(alias => alias.toLowerCase() === key.toLowerCase())) return field
  }
  return null
}

function toOptionalNumber(value) {
  if (value === null || value === undefined || value === '') return 0
  const n = Number(String(value).replaceAll(',', ''))
  return Number.isFinite(n) ? n : 0
}

function toIsoDate(value) {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  const text = String(value).trim()
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text)
  if (slash) {
    const [, d, mo, y] = slash
    const dt = new Date(Number(y), Number(mo) - 1, Number(d))
    if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10)
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  return null
}

function findHeaderRowIndex(grid) {
  return grid.findIndex(row => row.some(cell => HEADER_CANDIDATES.has(normalizeHeader(cell))))
}

function normalizeLot(value) {
  const lot = String(value ?? '').trim()
  if (SKIP_LOT.has(lot.toLowerCase())) return ''
  return lot
}

function rowKey(row) {
  return `${row.maHang}::${row.soLo || ''}`
}

function parsePdfSegment(segment) {
  const codeMatch = /^(?:\d+\s+)?([A-Z]\d{4,5})\s+(\S.*)$/s.exec(segment)
  if (!codeMatch) return null
  const tokens = codeMatch[2].trim().split(/\s+/)
  if (tokens.length < 5) return null
  // Cột "Ghi chú" (nếu có nội dung) nằm ngay sau Tổng SL nên không thể luôn giả định 3 token CUỐI CÙNG
  // là Kiện lẻ/Kiện nguyên/Tổng SL — quét từ phải sang trái, lấy cụm 3 token số liên tiếp XA NHẤT về
  // bên phải mà vẫn đứng trước ít nhất 1 token (Số lô); mọi thứ sau cụm đó (ghi chú) bị bỏ qua.
  let numRunStart = -1
  for (let i = tokens.length - 3; i >= 1; i -= 1) {
    if (/^\d+$/.test(tokens[i]) && /^\d+$/.test(tokens[i + 1]) && /^\d+$/.test(tokens[i + 2])) {
      numRunStart = i
      break
    }
  }
  if (numRunStart === -1) return null
  const [sKienLe, sKienNguyen, sTongSl] = tokens.slice(numRunStart, numRunStart + 3)
  // Số lô thuần số đôi khi gồm nhiều token cách nhau bởi khoảng trắng (vd "1 14", "1 15" — số lô thật,
  // không phải lỗi đọc PDF) — gộp hết các token số liên tiếp NGAY TRƯỚC cụm Kiện lẻ/Kiện nguyên/Tổng SL
  // vào Số lô thay vì chỉ lấy đúng 1 token. Số lô có chữ (vd "30926H01") vẫn luôn chỉ 1 token vì nó tự
  // dừng ở token không thuần số ngay trước đó.
  let lotStart = numRunStart - 1
  while (lotStart - 1 >= 0 && /^\d+$/.test(tokens[lotStart]) && /^\d+$/.test(tokens[lotStart - 1])) {
    lotStart -= 1
  }
  const soLo = tokens.slice(lotStart, numRunStart).join(' ')
  const tenHang = tokens.slice(0, lotStart).join(' ').trim()
  if (!tenHang || !soLo) return null
  return {
    maHang: codeMatch[1],
    tenHang,
    soLo,
    kienLe: Number(sKienLe),
    kienNguyen: Number(sKienNguyen),
    tongSl: Number(sTongSl),
  }
}

export function readWarehouseExportRows(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null })
  const headerRowIndex = findHeaderRowIndex(grid)
  if (headerRowIndex === -1) {
    throw new Error('Không tìm thấy cột "Mã" hoặc "Mã hàng" trong file Excel xuất kho.')
  }

  const fieldByCol = grid[headerRowIndex].map(cell => resolveField(cell))
  const soLoColIndex = fieldByCol.indexOf('soLo')
  const rows = []
  for (let i = headerRowIndex + 1; i < grid.length; i += 1) {
    const line = grid[i]
    if (!line || line.every(cell => cell === null || cell === '')) continue
    if (soLoColIndex !== -1 && NOT_FULFILLED_LOT.has(String(line[soLoColIndex] ?? '').trim().toLowerCase())) continue
    const row = {}
    fieldByCol.forEach((field, colIndex) => {
      if (!field) return
      const raw = line[colIndex]
      if (field === 'hanDung') row[field] = toIsoDate(raw)
      else if (field === 'soLo') row[field] = normalizeLot(raw)
      else if (['kienNguyen', 'kienLe', 'slHoaDon'].includes(field)) row[field] = toOptionalNumber(raw)
      else row[field] = raw === null || raw === undefined ? '' : String(raw).trim()
    })
    if (!row.maHang || !PRODUCT_CODE.test(row.maHang)) continue
    if ((row.slHoaDon ?? 0) <= 0 && (row.kienNguyen ?? 0) <= 0 && (row.kienLe ?? 0) <= 0) continue
    rows.push(row)
  }
  return rows
}

export function mergeWarehouseRows(rows) {
  const merged = new Map()
  for (const row of rows) {
    const key = rowKey(row)
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, {
        maHang: row.maHang,
        tenHang: row.tenHang || '',
        dvt: row.dvt || '',
        soLo: row.soLo || '',
        hanDung: row.hanDung || null,
        kienNguyen: row.kienNguyen ?? 0,
        kienLe: row.kienLe ?? 0,
        slHoaDon: row.slHoaDon ?? 0,
        slThucTe: null,
        ghiChu: '',
        needsManual: false,
      })
      continue
    }
    existing.kienNguyen = (existing.kienNguyen ?? 0) + (row.kienNguyen ?? 0)
    existing.kienLe = (existing.kienLe ?? 0) + (row.kienLe ?? 0)
    existing.slHoaDon = (existing.slHoaDon ?? 0) + (row.slHoaDon ?? 0)
    if (!existing.tenHang && row.tenHang) existing.tenHang = row.tenHang
    if (!existing.dvt && row.dvt) existing.dvt = row.dvt
    if (!existing.hanDung && row.hanDung) existing.hanDung = row.hanDung
  }
  return [...merged.values()]
}

export function calcChenhLech(row) {
  if (row.slThucTe === null || row.slThucTe === undefined || row.slThucTe === '') return null
  return Number(row.slThucTe) - Number(row.slHoaDon ?? 0)
}

export function parsePdfDeliveryNote(pdfText) {
  if (!pdfText) return []
  const compact = pdfText.replace(/\s+/g, ' ').trim()
  const starts = [...compact.matchAll(/\b(\d+)\s+([A-Z]\d{4,5})\s+/g)]
  const rows = []
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i].index ?? 0
    const end = starts[i + 1]?.index ?? compact.length
    const parsed = parsePdfSegment(compact.slice(start, end).trim())
    if (parsed) rows.push(parsed)
  }
  return rows
}

// sharedKeys: các cặp (mã hàng, số lô) xuất hiện ở CẢ 2 kho — với các mã này, PDF (phiếu xuất kho lẫn
// biên bản giao nhận) chỉ ghi 1 dòng DUY NHẤT có SL là số CỘNG DỒN của cả 2 kho (vd mã D02124: Kho C 312
// + Kho DTP 468 = PDF 780), không phải số riêng của kho đang enrich — nên bỏ qua auto-fill "SL thực tế"
// và cảnh báo lệch cho các mã này, tránh báo sai/điền sai số (buildReceiptFromFiles đối chiếu tổng gộp
// riêng, xem sharedKeys ở đó).
export function enrichRowsFromPdfCatalog(rows, pdfRows, sharedKeys = new Set()) {
  const catalog = new Map()
  for (const item of pdfRows) catalog.set(rowKey(item), item)

  return rows.map(row => {
    const next = { ...row }
    const hit = catalog.get(rowKey(row))
    if (!hit) {
      if (!next.hanDung) next.needsManual = true
      return next
    }
    if (!next.tenHang) next.tenHang = hit.tenHang
    if (!next.soLo) next.soLo = hit.soLo
    if (!next.hanDung && hit.hanDung) next.hanDung = hit.hanDung
    if (!next.dvt && hit.dvt) next.dvt = hit.dvt
    if (sharedKeys.has(rowKey(row))) return next
    if (hit.source === 'bienBanGiaoNhan') {
      // Biên bản giao nhận = số kiểm đếm thực tế lúc nhận hàng — điền thẳng vào "SL thực tế" thay vì
      // bắt gõ tay; cột "Chênh lệch" đã tự so với SL hoá đơn nên không cần thêm ghi chú lệch riêng.
      if (next.slThucTe === null || next.slThucTe === undefined) next.slThucTe = hit.soLuong
    } else if (hit.soLuong !== undefined && hit.soLuong !== (next.slHoaDon ?? 0) && !next.ghiChu) {
      next.ghiChu = `Lệch SL so PDF — PDF: ${hit.soLuong}, Excel: ${next.slHoaDon ?? 0}`
    }
    return next
  })
}

// Mẫu "PHIẾU XUẤT KHO" (02-VT) của DTP — khác hẳn định dạng "biên bản giao nhận" ở parsePdfDeliveryNote.
// Thứ tự trích xuất từ PDF theo dòng dữ liệu thật là: Stt, Tên vật tư, Mã vật tư, Đvt, Số lượng
// ("272,000"/"1.440,000" — lấy phần nguyên trước dấu ",", bỏ dấu "." phân cách nghìn), Nước SX (bỏ qua),
// Lô, Hạn dùng — KHÔNG theo đúng thứ tự cột tiêu đề (PDF xuất tên trước mã, ngược thứ tự header).
function parsePhieuXuatKhoPdf(pdfText) {
  if (!pdfText) return []
  const compact = String(pdfText).replace(/\s+/g, ' ').trim()
  let afterHeader = compact.split(/Vị trí/i).pop() || ''
  // Bỏ dòng mã cột ẩn cố định của mẫu form ("A B C D 2 3 5 1 4") ngay sau "Vị trí", trước Stt=1 thật —
  // nếu không bỏ, dòng đầu tiên sẽ bị nhặt nhầm 1 trong các số lẻ này làm Stt, cuốn theo rác vào tên hàng.
  afterHeader = afterHeader.replace(/^\s*A\s+B\s*C\s+D\s+2\s+3\s+5\s*1\s+4\s*/i, '')

  const rows = []
  const re = /(\d{1,3})\s+([\s\S]+?)\s+([A-Z]\d{4,5})\s+(\S+)\s+([\d.,]+)\s+\S+\s+(\S+)\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/g
  let m
  while ((m = re.exec(afterHeader))) {
    const [, , tenHangRaw, maHang, dvt, qtyRaw, soLo, dd, mo, yyyy] = m
    const soLuong = Number(qtyRaw.split(',')[0].replaceAll('.', ''))
    if (!Number.isFinite(soLuong)) continue
    rows.push({
      maHang,
      tenHang: tenHangRaw.trim(),
      dvt,
      soLuong,
      soLo,
      hanDung: `${yyyy}-${mo.padStart(2, '0')}-${dd.padStart(2, '0')}`,
    })
  }
  return rows
}

// Đọc PDF theo cả 2 định dạng đã biết — thử mẫu "Phiếu xuất kho" (thường gặp nhất hiện nay) trước,
// nếu không khớp dòng nào thì thử mẫu "biên bản giao nhận" (parsePdfDeliveryNote). Gắn "source" để
// enrichRowsFromPdfCatalog phân biệt: phiếu xuất kho là số theo chứng từ xuất ở nhà máy (chỉ dùng để
// bổ sung thông tin/cảnh báo lệch so Excel), còn biên bản giao nhận là số kiểm đếm thực tế lúc nhận
// hàng — dùng để tự điền thẳng vào "SL thực tế".
export function parsePdfItems(pdfText) {
  const viaPhieuXuatKho = parsePhieuXuatKhoPdf(pdfText)
  if (viaPhieuXuatKho.length > 0) return viaPhieuXuatKho.map(row => ({ ...row, source: 'phieuXuatKho' }))
  return parsePdfDeliveryNote(pdfText).map(row => ({ ...row, soLuong: row.tongSl, source: 'bienBanGiaoNhan' }))
}

// File "Phiếu xuất kho" tự ghi rõ xuất đi kho nào ở dòng "Địa điểm"/"Lý do xuất kho" (vd "...Kho C..."
// hoặc "...Kho DTP LGT..."). Dùng để CẢNH BÁO nếu người dùng lỡ thả nhầm file vào vùng kho khác — không
// tự động phân loại lại, vì cơ sở phân loại chính vẫn là người dùng thả file vào vùng nào.
export function detectPhieuXuatKhoWarehouse(pdfText) {
  const text = String(pdfText || '')
  if (/kho\s*dtp\s*lgt|kho\s*lgt/i.test(text)) return 'LGT'
  if (/kho\s*c\b/i.test(text)) return 'C'
  return null
}

// khoCRows/khoLgtRows: mảng row đã đọc sẵn (nối từ NHIỀU file Excel — mỗi kho có thể nhận nhiều phiếu
// xuất kho cùng 1 chuyến hàng, xem readWarehouseExportRows), gộp lại thành 1 bảng theo maHang::soLo.
// Đọc từng file riêng ở nơi gọi (NhapHangTab.jsx) để 1 file lỗi không làm hỏng cả batch. pdfTexts: mảng
// text đã trích từ TẤT CẢ PDF của cả 2 kho — chỉ dùng để bổ sung tên hàng/số lô còn thiếu, không bắt buộc.
// Hàng có trong PDF (biên bản giao nhận/phiếu xuất kho) nhưng KHÔNG khớp bất kỳ dòng Excel nào (cả 2 kho)
// — tức chưa được ghi nhận ở đâu cả — vẫn phải điền vào biên bản, mặc định về Kho C để kiểm tra tay.
function buildMissingRowsFromPdf(pdfRows, excelKeys) {
  const seen = new Set()
  const rows = []
  for (const item of pdfRows) {
    if (!(item.soLuong > 0)) continue
    const key = rowKey(item)
    if (excelKeys.has(key) || seen.has(key)) continue
    seen.add(key)
    rows.push({
      maHang: item.maHang,
      tenHang: item.tenHang || '',
      dvt: item.dvt || '',
      soLo: item.soLo || '',
      hanDung: item.hanDung || null,
      kienNguyen: 0,
      kienLe: 0,
      slHoaDon: item.soLuong,
      slThucTe: null,
      ghiChu: 'Chỉ thấy trong PDF, không có trong file Excel nào — kiểm tra tay',
      needsManual: !item.hanDung,
    })
  }
  return rows
}

// "Tổng cả đơn ... Kiện" ghi ở cuối biên bản giao nhận — dùng để đối chiếu với tổng kiện đã tách được
// trong bảng. Biên bản giao nhận đôi khi gộp cả hàng ký gửi kho khác vào 1 dòng không có mã hàng (vd
// "HÀNG GỬI DTP" cho cả 32 kiện) — dòng đó không tự tách được, nên lệch giữa 2 tổng là dấu hiệu còn
// hàng chưa được ghi nhận vào bảng, cần người dùng tự kiểm tra bằng chế độ Chỉnh sửa.
function parseDeliveryNoteDeclaredTotal(pdfText) {
  const compact = String(pdfText || '').replace(/\s+/g, ' ').trim()
  const m = /Tổng cả đơn\s+(\d+)\s*Kiện/i.exec(compact)
  return m ? Number(m[1]) : null
}

function sumKien(rows) {
  return rows.reduce((sum, row) => sum + (row.kienNguyen ?? 0) + (row.kienLe ?? 0), 0)
}

export function buildReceiptFromFiles({
  khoCRows = [],
  khoLgtRows = [],
  pdfTexts = [],
}) {
  const pdfRows = pdfTexts.flatMap(text => parsePdfItems(text))

  const khoCMerged = mergeWarehouseRows(khoCRows)
  const khoLgtMerged = mergeWarehouseRows(khoLgtRows)
  const khoCKeys = new Set(khoCMerged.map(rowKey))
  const khoLgtKeys = new Set(khoLgtMerged.map(rowKey))
  // Mã hàng (+ số lô) có mặt ở CẢ 2 kho — PDF chỉ ghi 1 dòng tổng gộp cho cả 2, không phải số riêng
  // từng kho (xem ghi chú ở enrichRowsFromPdfCatalog).
  const sharedKeys = new Set([...khoCKeys].filter(key => khoLgtKeys.has(key)))
  const excelKeys = new Set([...khoCKeys, ...khoLgtKeys])
  const missingRows = buildMissingRowsFromPdf(pdfRows, excelKeys)

  const khoC = enrichRowsFromPdfCatalog([...khoCMerged, ...missingRows], pdfRows, sharedKeys)
  const khoLgt = enrichRowsFromPdfCatalog(khoLgtMerged, pdfRows, sharedKeys)

  const warnings = []
  // Đối chiếu riêng cho các mã dùng chung: tổng Kho C + Kho DTP (theo Excel) phải khớp với dòng gộp
  // trên PDF — khớp thì im lặng (không cần ghi chú), chỉ báo khi thực sự lệch.
  const pdfCatalog = new Map(pdfRows.map(item => [rowKey(item), item]))
  for (const key of sharedKeys) {
    const hit = pdfCatalog.get(key)
    if (!hit || hit.soLuong === undefined) continue
    const cRow = khoCMerged.find(row => rowKey(row) === key)
    const lgtRow = khoLgtMerged.find(row => rowKey(row) === key)
    const combined = (cRow?.slHoaDon ?? 0) + (lgtRow?.slHoaDon ?? 0)
    if (hit.soLuong !== combined) {
      warnings.push(
        `Mã ${cRow?.maHang || lgtRow?.maHang} (số lô ${cRow?.soLo || lgtRow?.soLo}): PDF ghi tổng gộp `
        + `${hit.soLuong} nhưng Kho C ${cRow?.slHoaDon ?? 0} + Kho DTP ${lgtRow?.slHoaDon ?? 0} = ${combined} `
        + `(lệch ${hit.soLuong - combined}).`,
      )
    }
  }

  const declaredTotals = pdfTexts.map(parseDeliveryNoteDeclaredTotal).filter(n => n !== null)
  if (declaredTotals.length > 0) {
    const declaredTotal = declaredTotals.reduce((a, b) => a + b, 0)
    const actualTotal = sumKien(khoC) + sumKien(khoLgt)
    if (declaredTotal !== actualTotal) {
      warnings.push(
        `Biên bản giao nhận khai tổng ${declaredTotal} kiện nhưng bảng đã tách được ${actualTotal} kiện `
        + `(lệch ${declaredTotal - actualTotal}) — có thể do dòng gộp không ghi mã hàng cụ thể (vd hàng ký gửi kho khác). `
        + `Kiểm tra lại bằng chế độ Chỉnh sửa.`,
      )
    }
  }

  return { khoC, khoLgt, pdfRows, warnings }
}

function extractDriverInfo(compact) {
  const lower = compact.toLowerCase()
  const nameLabel = 'họ và tên:'
  const plateLabel = 'biển số xe:'
  const nameIdx = lower.indexOf(nameLabel)
  const plateIdx = lower.indexOf(plateLabel)
  if (nameIdx === -1 || plateIdx === -1 || plateIdx <= nameIdx) return null
  const name = compact.slice(nameIdx + nameLabel.length, plateIdx).trim()
  const plate = compact.slice(plateIdx + plateLabel.length).trim().split(/\s+/)[0]
  if (!name || !plate) return null
  return { name, plate }
}

export function parsePdfMetadata(pdfText) {
  const compact = String(pdfText || '').replace(/\s+/g, ' ')
  const ngayMatch = /Ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})/i.exec(compact)
  const ngayNhap = ngayMatch
    ? `${ngayMatch[1].padStart(2, '0')}/${ngayMatch[2].padStart(2, '0')}/${ngayMatch[3]}`
    : new Date().toLocaleDateString('vi-VN')

  const driver = extractDriverInfo(compact)
  const sdtMatch = /SĐT liên hệ:\s*(\d+)/i.exec(compact)
  const benVanChuyen = driver
    ? `Vận tải 24h - Lái xe: ${driver.name} - SĐT: ${sdtMatch?.[1] || ''} - Xe: ${driver.plate}`
    : 'Vận tải 24h'

  return {
    ngayNhap,
    benGiaoHang: `Công ty CP Dược phẩm CPC1 Hà Nội (theo BB giao nhận ngày ${ngayNhap})`,
    benVanChuyen,
    benNhanHang: 'CPC1 Hà Nội - Chi nhánh Hồ Chí Minh',
  }
}

export async function extractPdfText(arrayBuffer) {
  try {
    const pdfjs = await import('pdfjs-dist/build/pdf.mjs')
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString()
    const data = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer)
    const doc = await pdfjs.getDocument({ data }).promise
    const chunks = []
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
      const page = await doc.getPage(pageNum)
      const content = await page.getTextContent()
      chunks.push(content.items.map(item => item.str).join(' '))
    }
    return chunks.join('\n')
  } catch {
    throw new Error('Không đọc được file PDF biên bản giao nhận.')
  }
}

export function exportReceiptWorkbook() {
  throw new Error('Dùng exportReceiptFromTemplate() để xuất theo file mẫu BIEN_BAN_NHAP_HANG.xlsx')
}

export const enrichRowsFromPdfText = enrichRowsFromPdfCatalog
