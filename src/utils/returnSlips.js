// Phiếu trả hàng theo quy trình mới: sales tạo phiếu trên website nội bộ → GĐ chi nhánh/ASM/SS duyệt → kho
// tải PDF biên bản website tự tạo sau khi duyệt, điền phần còn trống, xuất bộ file Word (biên bản trả lại
// hàng + biên bản xác minh). Trạng thái duyệt trên website do kho tự kiểm tra rồi cập nhật trên app — app
// không truy cập được website, chỉ nhắc việc theo số ngày chờ.

import { soTienBangChu } from './numberToVietnameseWords'

export const RETURN_SLIPS_KEY = 'return_slips'
export const RETURN_SLIPS_EVENT = 'return-slips-changed'

export const KE_TOAN_LIST = ['Phạm Thị Tuyết Trinh', 'Trần Thị Ái Lâm', 'Lưu Thị Thuỳ', 'Võ Thị Ly', 'Nguyễn Thị Tú Anh', 'Đỗ Thị Bông']
export const THU_KHO = 'Dương Thị Ngọc Huyền'

// wait: chờ duyệt trên website · todo: đã duyệt, chưa tải file · doing: đang điền · exported: đã xuất, chờ ký
// · done: đã ký đủ, nhập kho
export const SLIP_STAGES = {
  wait: { label: 'Chờ duyệt trên website', tone: 'wait' },
  todo: { label: 'Chưa làm biên bản', tone: 'todo' },
  doing: { label: 'Đang điền', tone: 'doing' },
  exported: { label: 'Đã xuất, chờ ký', tone: 'doing' },
  done: { label: 'Đã ký, nhập kho', tone: 'done' },
}

// Mẫu biên bản website in ra: CPC1HN (khách đã nhận, Đơn C), UPHARMA (khách đã nhận, Đơn DTP), NOIBO
// (khách chưa nhận — kho chọn biên bản xác minh mẫu C hoặc U tuỳ đơn).
export const TEMPLATE_LABEL = { CPC1HN: 'Mẫu CPC1HN', UPHARMA: 'Mẫu UPHARMA', NOIBO: 'Mẫu nội bộ' }

export function slipLoai(slip) {
  const mau = slip?.pdf?.mau
  if (mau === 'CPC1HN') return 'C'
  if (mau === 'UPHARMA') return 'DTP'
  if (mau === 'NOIBO') return slip.form?.xmMau === 'U' ? 'DTP' : 'C'
  return null
}

function pad2(n) { return String(n).padStart(2, '0') }
export function toIsoDate(date) { return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}` }

// Mặc định cho phần kho điền trên web app. Địa điểm / tình trạng / kết quả xác minh là giá trị mặc định
// (sửa được), còn lại là chỗ website để "……".
export function newSlipForm(itemCount = 0, today = new Date()) {
  return {
    ngayLap: toIsoDate(today),
    mst: '', soHD: '', kyHieu: '', ngayHD: '',
    benA: KE_TOAN_LIST[0], benAChucVu: 'Kế toán đơn hàng',
    benB: THU_KHO, benBChucVu: 'Thủ kho',
    xmMau: 'C',
    xmNgay: toIsoDate(today), xmGio: '08:30',
    xmDiaDiem: 'CN.Hồ Chí Minh',
    xmKeToan: KE_TOAN_LIST[0],
    xmTinhTrang: 'Hàng nguyên vẹn',
    xmKetQua: 'Kiểm tra hàng đúng lô, đúng hạn dùng, đúng số lượng.',
    items: Array.from({ length: itemCount }, () => ({ soLo: '', hanDung: '', quyCach: '' })),
  }
}

// Các chỗ còn trống cần kho điền — vẫn cho xuất (chỗ trống giữ "……" như file gốc), chỉ để nhắc.
export function missingSlipFields(slip) {
  const f = slip.form || {}
  const missing = []
  if (!f.ngayLap) missing.push('ngày lập')
  if (slip.pdf?.mau !== 'NOIBO' && !f.mst) missing.push('MST bên mua')
  if (!f.soHD) missing.push('số hoá đơn')
  if (!f.kyHieu) missing.push('ký hiệu')
  if (!f.ngayHD) missing.push('ngày hoá đơn')
  if ((f.items || []).some(it => !it.soLo)) missing.push('số lô')
  if ((f.items || []).some(it => !it.hanDung)) missing.push('hạn dùng')
  return missing
}

// ---------- Đơn tạo thủ công (không có PDF từ website) ----------
// Dựng ra đúng dạng dữ liệu như khi đọc PDF (pdf.mau, bên mua/bán, hàng hoá, tổng tiền...) để xem trước, in, xuất
// Word và nhắc việc chạy y như đơn có PDF. pdf.manual = true để màn làm biên bản hiện phần nhập tay.
export const MANUAL_SELLERS = {
  CPC1HN: {
    ten: 'CÔNG TY CỔ PHẦN DƯỢC PHẨM CPC1 HÀ NỘI - CHI NHÁNH THÀNH PHỐ HỒ CHÍ MINH',
    diaChi: 'Số 26-28 đường Hàn Mạc Tử, Phường Phú Thọ Hòa, Thành phố Hồ Chí Minh, Việt Nam',
    mst: '0104089394-002', daiDien: 'Phương Thu', chucVu: 'Giám đốc chi nhánh',
  },
  UPHARMA: {
    ten: 'CÔNG TY CỔ PHẦN UPHARMA',
    diaChi: 'Tòa nhà Vinh Quang Group, lô DX, KDDT Tây Nam hồ Linh Đàm, phường Hoàng Liệt, thành phố Hà Nội',
    mst: '0109313177', daiDien: 'Bà Phương Thu', chucVu: 'Giám đốc',
  },
}

// Lý do mặc định của biên bản nội bộ (đúng câu website in ra cho đơn khách chưa nhận hàng).
export const NOIBO_LY_DO = 'Bộ phận kinh doanh, kế toán và kho đã kiểm tra lại thông tin, phát hiện sai sót ngay khi hóa đơn được ghi sổ, tại thời điểm phát hiện hàng hóa chưa giao cho khách hàng.'

// Lý do xuất trả dùng để in / xuất: đơn nhập tay mẫu nội bộ chưa có lý do thì lấy câu mặc định (kể cả phiếu tạo từ bản cũ).
export function effectiveLyDo(pdf) {
  return pdf?.lyDo || (pdf?.manual && pdf.mau === 'NOIBO' ? NOIBO_LY_DO : '')
}

export function emptyManualItem() {
  return { stt: 0, ten: '', dvt: '', soLuong: 0, soLo: '', donGia: 0, thanhTien: 0 }
}

// Tính lại STT, thành tiền từng dòng, tổng tiền và số tiền bằng chữ (đúng văn phong file website: "…đồng./.").
export function recalcManualPdf(pdf) {
  const items = (pdf.items || []).map((it, i) => ({
    ...it, stt: i + 1, thanhTien: (Number(it.soLuong) || 0) * (Number(it.donGia) || 0),
  }))
  const tongTien = items.reduce((sum, it) => sum + it.thanhTien, 0)
  return { ...pdf, items, tongTien, bangChu: soTienBangChu(tongTien).replace(/đồng chẵn$/, 'đồng./.') }
}

// Đơn nhập tay luôn mang đủ bên mua / bên bán / bên C để đổi qua lại giữa 3 mẫu mà không mất dữ liệu; biên bản chỉ
// dùng phần thuộc mẫu đang chọn. sellerKey: bên bán mặc định (mẫu nội bộ không in bên bán, chỉ để khi đổi sang mẫu C/DTP).
export function newManualPdf(mau, slip = {}, sellerKey = mau === 'NOIBO' ? 'CPC1HN' : mau) {
  return recalcManualPdf({
    mau, manual: true, fileName: 'Nhập tay', lyDo: slip.lyDo || (mau === 'NOIBO' ? NOIBO_LY_DO : ''), items: [emptyManualItem()],
    benMua: { ten: slip.khachHang || '', diaChi: '', mst: '', daiDien: '', chucVu: '' },
    benBan: { ...MANUAL_SELLERS[sellerKey] },
    benC: { daiDien: slip.nhanVien || '', chucVu: 'Nhân viên kinh doanh' },
  })
}

// Đổi mẫu biên bản của đơn nhập tay: mẫu C / DTP đặt lại bên bán theo mẫu, mẫu nội bộ giữ nguyên.
export function switchManualMau(pdf, mau) {
  return { ...pdf, mau, lyDo: pdf.lyDo || (mau === 'NOIBO' ? NOIBO_LY_DO : ''), benBan: mau === 'NOIBO' ? pdf.benBan : { ...MANUAL_SELLERS[mau] } }
}

// Dựng đơn nhập tay từ hoá đơn đã đọc (parseInvoiceLines): mặc định MẪU NỘI BỘ (đơn cần lập lại theo hoá đơn), mẫu
// biên bản xác minh theo bên bán (UPHARMA → U, CPC1 → C); bên mua, hàng hoá, số hoá đơn, ký hiệu, ngày hoá đơn, số lô,
// hạn dùng điền sẵn. Trả về { pdf, formPatch } — kho vẫn đổi mẫu / sửa được trên màn nhập tay.
export function manualPdfFromInvoice(inv, slip = {}, mau = 'NOIBO') {
  const sellerKey = inv.mau || 'UPHARMA'
  const base = newManualPdf(mau, slip, sellerKey)
  const pdf = recalcManualPdf({
    ...base,
    fileName: 'Hoá đơn',
    benMua: { ...base.benMua, ten: inv.benMua.ten || base.benMua.ten, diaChi: inv.benMua.diaChi || '' },
    items: inv.items.map(it => ({ stt: 0, ten: it.ten, dvt: it.dvt, soLuong: it.soLuong, soLo: it.soLo, donGia: it.donGia, thanhTien: 0 })),
  })
  return {
    pdf,
    formPatch: {
      mst: inv.benMua.mst || '', soHD: inv.soHD, kyHieu: inv.kyHieu, ngayHD: inv.ngayHD,
      xmMau: sellerKey === 'UPHARMA' ? 'U' : 'C',
      items: inv.items.map(it => ({ soLo: it.soLo, hanDung: it.hanDung, quyCach: '' })),
    },
  }
}

// ---------- Nhắc việc ----------
const HOUR = 3600000
const DAY = 24 * HOUR
export const REMINDER_RULES = [
  { kind: 'wait', title: 'Chờ duyệt quá 1 ngày — vào website nội bộ kiểm tra', hours: 24 },
  { kind: 'todo', title: 'Đã duyệt, chưa làm xong biên bản quá 1 ngày', hours: 24 },
  { kind: 'sign', title: 'Đã xuất biên bản, chưa ký đủ quá 3 ngày', hours: 72 },
]

// Trả về danh sách việc cần nhắc: { slip, kind, since (ISO), days }.
export function slipReminders(slips, now = new Date()) {
  const nowMs = now.getTime()
  const list = []
  for (const slip of slips || []) {
    if (!slip) continue
    const push = (kind, since, hours) => {
      if (!since) return
      const age = nowMs - new Date(since).getTime()
      if (age > hours * HOUR) list.push({ slip, kind, since, days: Math.floor(age / DAY) })
    }
    if (slip.stage === 'wait') {
      const snoozed = slip.snoozeUntil && nowMs < new Date(slip.snoozeUntil).getTime()
      if (!snoozed) push('wait', slip.createdAt, 24)
    } else if (slip.stage === 'todo' || slip.stage === 'doing') {
      push('todo', slip.approvedAt, 24)
    } else if (slip.stage === 'exported') {
      push('sign', slip.exportedAt, 72)
    }
  }
  return list.sort((a, b) => b.days - a.days)
}

// "Chưa duyệt, nhắc lại mai": ẩn khỏi nhắc việc đến 0h ngày hôm sau.
export function nextMorning(now = new Date()) {
  const t = new Date(now)
  t.setDate(t.getDate() + 1)
  t.setHours(0, 0, 0, 0)
  return t.toISOString()
}

// ---------- Đọc PDF biên bản website ----------
function clean(s) { return String(s || '').replace(/\s+/g, ' ').trim() }
// Chỗ website để trống in thành dãy dấu chấm "......" — coi như chưa có.
function valueOrEmpty(s) { const v = clean(s); return /^[.…\s]*$/.test(v) ? '' : v }
export function parseMoney(s) {
  const digits = String(s || '').replace(/[^\d]/g, '')
  return digits ? Number(digits) : 0
}

// Tên hàng dài xuống dòng thì dòng số liệu không còn tên: "1 ONG 150 8,400 1,260,000" (tên nằm ở dòng trên/dưới).
const ITEM_NO_NAME_RE = /^(\d{1,3})\s+([^\d\s.,]\S*)\s+([\d.,]+)\s+(?:(\S+)\s+)?([\d.,]+)\s+([\d.,]+)$/
// Chữ tiêu đề bảng ("STT Tên hàng hóa, dịch vụ Đơn vị tính Số lượng Số Lô Đơn giá (gồm VAT) Thành tiền") bị PDF xếp
// lộn thành nhiều dòng, có khi dính liền đầu tên hàng: bỏ dãy chữ tiêu đề ở đầu dòng.
const HEADER_WORDS = new Set(['stt', 'tên', 'hàng', 'hóa', 'hoá', 'dịch', 'vụ', 'đơn', 'vị', 'tính', 'đvt', 'số', 'lượng', 'lô', 'giá', '(gồm', 'vat)', 'thành', 'tiền'])
function stripHeaderPrefix(line) {
  const tokens = line.split(' ')
  let n = 0
  while (n < tokens.length && HEADER_WORDS.has(tokens[n].toLowerCase().replace(/,$/, ''))) n += 1
  return n >= 2 ? tokens.slice(n).join(' ') : line
}

const ITEM_RE = /^(\d{1,3})\s+(.+?)\s+(\S+)\s+([\d.,]+)\s+(?:(\S+)\s+)?([\d.,]+)\s+([\d.,]+)$/

function afterLabel(line, label) {
  const i = line.toLowerCase().indexOf(label.toLowerCase())
  return i === -1 ? null : line.slice(i + label.length)
}

// "Đại diện: Anh Thông   Chức vụ: -Dược sĩ" → { daiDien, chucVu }
function parseRepLine(line) {
  const m = /Đại\s*diện\s*:\s*(.*?)\s*(?:Chức\s*vụ\s*:\s*(.*))?$/i.exec(line)
  return m ? { daiDien: valueOrEmpty(m[1]), chucVu: valueOrEmpty(m[2] || '') } : null
}

function parsePartyBlock(lines) {
  const party = { ten: '', diaChi: '', mst: '', daiDien: '', chucVu: '' }
  if (lines.length === 0) return party
  party.ten = clean(lines[0])
  for (const line of lines.slice(1)) {
    if (/^Địa\s*chỉ\s*:/i.test(line)) party.diaChi = valueOrEmpty(line.replace(/^Địa\s*chỉ\s*:/i, ''))
    else if (/^Mã\s*số\s*thuế\s*:/i.test(line)) party.mst = valueOrEmpty(line.replace(/^Mã\s*số\s*thuế\s*:/i, ''))
    else if (/^Đại\s*diện\s*:/i.test(line)) Object.assign(party, parseRepLine(line))
    else if (/^Chức\s*vụ\s*:/i.test(line)) party.chucVu = valueOrEmpty(line.replace(/^Chức\s*vụ\s*:/i, ''))
  }
  return party
}

// lines: các dòng chữ của PDF theo thứ tự từ trên xuống (xem extractPdfLines ở returnSlipPdf.js).
export function parseReturnSlipLines(rawLines) {
  const lines = (rawLines || []).map(clean).filter(Boolean)
  const text = lines.join('\n')
  let mau = null
  if (/BIÊN BẢN TRẢ LẠI HÀNG\s*\(NỘI BỘ\)/i.test(text)) mau = 'NOIBO'
  else if (/BÊN BÁN\s*:\s*CÔNG TY CỔ PHẦN UPHARMA/i.test(text)) mau = 'UPHARMA'
  else if (/BÊN BÁN\s*:.*CPC1/i.test(text)) mau = 'CPC1HN'
  if (!mau) {
    throw new Error('Không nhận ra mẫu biên bản. Chỉ nhận file "Biên bản trả lại hàng" in từ website (Mẫu CPC1HN, Mẫu UPHARMA hoặc Mẫu nội bộ).')
  }

  const idx = (re, from = 0) => { for (let i = from; i < lines.length; i += 1) if (re.test(lines[i])) return i; return -1 }
  const result = { mau, benMua: null, benBan: null, benA: null, benB: null, benC: null, lyDo: '', items: [], tongTien: 0, bangChu: '' }

  if (mau === 'NOIBO') {
    const a = idx(/^BÊN A\s*:/i); const b = idx(/^BÊN B\s*:/i); const c = idx(/^BÊN C\s*:/i)
    const end = idx(/thống nhất lập biên bản/i)
    const block = (from, to) => {
      if (from === -1) return { daiDien: '', chucVu: '' }
      const part = { daiDien: '', chucVu: '' }
      for (const line of lines.slice(from + 1, to === -1 ? undefined : to)) {
        if (/^Đại\s*diện\s*:/i.test(line)) part.daiDien = valueOrEmpty(line.replace(/^Đại\s*diện\s*:/i, ''))
        else if (/^Chức\s*vụ\s*:/i.test(line)) part.chucVu = valueOrEmpty(line.replace(/^Chức\s*vụ\s*:/i, ''))
      }
      return part
    }
    result.benA = block(a, b)
    result.benB = block(b, c)
    result.benC = block(c, end)
  } else {
    const mua = idx(/^BÊN MUA\s*:/i)
    const ban = idx(/^BÊN BÁN\s*:/i)
    const end = idx(/thống nhất lập biên bản/i)
    if (mua !== -1 && ban !== -1) {
      const muaLines = lines.slice(mua, ban)
      muaLines[0] = afterLabel(muaLines[0], 'BÊN MUA:') ?? muaLines[0]
      result.benMua = parsePartyBlock(muaLines)
      const banLines = lines.slice(ban, end === -1 ? undefined : end)
      banLines[0] = afterLabel(banLines[0], 'BÊN BÁN:') ?? banLines[0]
      result.benBan = parsePartyBlock(banLines)
    }
  }

  const lyDoStart = idx(/^1\.\s*Lý do xuất trả\s*:/i)
  const chiTiet = idx(/^2\.\s*Chi tiết/i)
  if (lyDoStart !== -1) {
    const parts = lines.slice(lyDoStart, chiTiet === -1 ? lyDoStart + 1 : chiTiet)
    parts[0] = parts[0].replace(/^1\.\s*Lý do xuất trả\s*:/i, '')
    result.lyDo = clean(parts.join(' '))
  }

  const tong = idx(/^Tổng cộng tiền thanh toán/i, Math.max(chiTiet, 0))
  if (chiTiet !== -1) {
    let pendingName = ''
    for (const rawLine of lines.slice(chiTiet + 1, tong === -1 ? undefined : tong)) {
      const line = stripHeaderPrefix(rawLine)
      if (!line) continue
      const noName = ITEM_NO_NAME_RE.exec(line)
      const m = noName ? [line, noName[1], '', noName[2], noName[3], noName[4], noName[5], noName[6]] : ITEM_RE.exec(line)
      if (m) {
        result.items.push({
          stt: Number(m[1]),
          ten: clean(`${pendingName} ${m[2]}`),
          dvt: m[3],
          soLuong: parseMoney(m[4]),
          soLo: valueOrEmpty(m[5] || ''),
          donGia: parseMoney(m[6]),
          thanhTien: parseMoney(m[7]),
        })
        pendingName = ''
      } else if (!/^(STT|Đơn giá|\(gồm VAT\))/i.test(line)) {
        // Tên hàng dài bị xuống dòng: phần xuống dòng nằm ngay sau dòng có số liệu.
        if (result.items.length > 0 && !/^\d/.test(line)) result.items.at(-1).ten = clean(`${result.items.at(-1).ten} ${line}`)
        else pendingName = clean(`${pendingName} ${line}`)
      }
    }
  }
  if (tong !== -1) result.tongTien = parseMoney(lines[tong].replace(/^Tổng cộng tiền thanh toán/i, ''))
  if (!result.tongTien) result.tongTien = result.items.reduce((s, it) => s + it.thanhTien, 0)
  const chu = idx(/^Số tiền bằng chữ\s*:/i)
  if (chu !== -1) result.bangChu = clean(lines[chu].replace(/^Số tiền bằng chữ\s*:/i, ''))

  if (result.items.length === 0) {
    throw new Error('Không đọc được bảng hàng hoá trong file biên bản. Kiểm tra lại file PDF in từ website.')
  }
  return result
}

// So tên khách trong file với phiếu đang chọn (bỏ dấu, không phân biệt hoa thường) để cảnh báo thả nhầm file.
export function normalizeName(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}
export function sameCustomer(a, b) {
  const x = normalizeName(a); const y = normalizeName(b)
  if (!x || !y) return true
  return x === y || x.includes(y) || y.includes(x)
}
