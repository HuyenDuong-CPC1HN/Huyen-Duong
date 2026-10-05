// Đọc PDF "Hóa đơn giá trị gia tăng" (VNPAY Invoice) hoặc "Phiếu xuất kho" bán hàng của Kho C thành thông tin để lập biên bản trả lại hàng nhập tay: số hoá
// đơn, ký hiệu, ngày hoá đơn, bên bán (chọn mẫu CPC1HN / UPHARMA), bên mua, các dòng hàng (lô, hạn dùng, ĐVT, số
// lượng, đơn giá gồm VAT). File hoá đơn in mỗi chữ 2 lần chồng nhau nên nhiều dòng bị lặp ("Số: 00581703 00581703").
// lines: các dòng chữ từ trên xuống (extractPdfLines ở returnSlipPdf.js).

const clean = s => String(s || '').replace(/\s+/g, ' ').trim()
const num = s => Number(String(s).replace(/[.,]/g, '')) || 0

// "CÔNG TY A CÔNG TY A" → "CÔNG TY A"
function undouble(s) {
  const t = clean(s).split(' ')
  const half = t.length / 2
  if (Number.isInteger(half) && half > 0 && t.slice(0, half).join(' ') === t.slice(half).join(' ')) return t.slice(0, half).join(' ')
  return t.join(' ')
}

const ROW_RE = /^(\d{1,3})\s+(?:\S+\s+)??(\S+)\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\S+)\s+([\d.,]+)\s+([\d.,]+)\s+[\d.,]+\s+[\d.,]+\s+\d+(?:[.,]\d+)?%\s+[\d.,]+\s+([\d.,]+)$/
const NUMERIC_ONLY_RE = /^[\d.,%\s]+$/
// Dòng "Chiết khấu thương mại theo chương trình bán hàng" của hoá đơn (không lô/hạn dùng, ĐVT "VND", vd
// "2 VND 0 372,000 5% 18,600 390,600"): bỏ qua, không trừ vào giá hàng trả lại — chỉ dùng làm ranh giới để tên
// dòng chiết khấu không bị ghép vào tên hàng phía trên.
const DISCOUNT_ROW_RE = /^(\d{1,3})\s+(?:\S+\s+)?VND\s+[\d.,]+\s+[\d.,]+\s+\d+(?:[.,]\d+)?%\s+[\d.,]+\s+([\d.,]+)$/

// Số theo kiểu Việt Nam: "5.509,259" → 5509.259 · "220.370" → 220370 · "40,000" → 40 · "(21.296)" → -21296
const viNum = s => {
  const neg = /^\(.*\)$/.test(s)
  const n = Number(String(s).replace(/[()]/g, '').replaceAll('.', '').replace(',', '.')) || 0
  return neg ? -n : n
}

// Phiếu xuất kho bán hàng của Kho C (mẫu "Ký hiệu: C26MSG", cột Mã SP / Số lô / Hạn dùng / Kho / Đvt / Số lượng /
// Đơn giá / % CK / Thành tiền / VAT). Dòng chiết khấu/voucher (không có lô/hạn dùng,
// thành tiền âm) không thành dòng riêng: số tiền được trừ thẳng vào đơn giá các dòng hàng (chia theo tỷ lệ thành
// tiền) để tổng khớp "Tổng cộng tiền thanh toán" trên phiếu.
const SALES_ROW_RE = /^(\d{1,3})\s+(\S+)\s+(.+?)\s+(\S+)\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+\d{6}\s+(\S+)\s+([\d.,]+)\s+[\d.,]+\s+(?:[\d.,]+\s+)?(\(?[\d.,]+\)?)\s+(\d+)$/
const SALES_DISCOUNT_RE = /^\d{1,3}\s+[A-Z0-9][A-Z0-9-]*\s+.+?\s+\d{6}\s+\S+\s+[\d.,]+\s+[\d.,]+\s+(\([\d.,]+\))\s+(\d+)$/
const SALES_ANY_ROW_RE = /^\d{1,3}\s+[A-Z0-9][A-Z0-9-]*\s/

function parseSalesSlipLines(lines) {
  const text = lines.join('\n')
  const find = re => re.exec(text)
  const head = lines.find(l => /^Họ tên người mua hàng:/.test(l)) || ''
  const person = clean(/Họ tên người mua hàng:\s*(.+?)\s*(?:•|Số liên hệ|$)/.exec(head)?.[1] || '')
  const donVi = clean(find(/Tên đơn vị:\s*(.+?)\s+Ngày:/)?.[1] || '')
  const date = find(/Ngày:\s*(\d{2})\/(\d{2})\/(\d{4})/) || find(/Ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})/)
  const seller = clean(lines.find(l => /CÔNG TY/i.test(l)) || '')
  const result = {
    soHD: /Số\s+(\d+)\s*$/.exec(head)?.[1] || '',
    kyHieu: find(/Ký hiệu:\s*(\S+)/)?.[1] || '',
    ngayHD: date ? `${date[3]}-${date[2]}-${date[1].padStart(2, '0')}` : '',
    mau: /UPHARMA/i.test(seller) ? 'UPHARMA' : /CPC1/i.test(seller) ? 'CPC1HN' : null,
    benBan: seller,
    benMua: {
      ten: person || donVi,
      diaChi: clean(find(/Địa chỉ:\s*(.+?)\s+PTTT:/)?.[1] || ''),
      mst: find(/Mã số thuế:\s*(\d[\d-]*)/)?.[1] || '',
    },
    items: [],
    tongTien: 0,
  }
  const start = lines.findIndex(l => /^0\s+1\s+2\s+3\s+4/.test(l))
  const end = lines.findIndex(l => /^Cộng tiền hàng/i.test(l))
  let discount = 0 // tổng chiết khấu gồm VAT (số âm)
  if (start !== -1) {
    let current = null
    for (const line of lines.slice(start + 1, end === -1 ? undefined : end)) {
      const m = SALES_ROW_RE.exec(line)
      if (m) {
        const soLuong = viNum(m[9])
        const thanhTien = viNum(m[10])
        const vat = Number(m[11]) || 0
        current = {
          stt: Number(m[1]), ten: clean(m[3]), soLo: m[4], hanDung: `${m[7]}-${m[6].padStart(2, '0')}-${m[5].padStart(2, '0')}`,
          dvt: m[8], soLuong,
          donGia: soLuong ? Math.round((thanhTien * (1 + vat / 100)) / soLuong) : 0, // đơn giá gồm VAT
          thanhTien: Math.round(thanhTien * (1 + vat / 100)),
        }
        result.items.push(current)
      } else if (SALES_DISCOUNT_RE.test(line)) {
        const d = SALES_DISCOUNT_RE.exec(line)
        discount += Math.round(viNum(d[1]) * (1 + (Number(d[2]) || 0) / 100))
        current = null
      } else if (SALES_ANY_ROW_RE.test(line)) current = null
      else if (current) current.ten = clean(`${current.ten} ${line}`)
    }
  }
  if (discount) {
    const gross = result.items.reduce((sum, it) => sum + it.thanhTien, 0)
    let left = discount
    result.items.forEach((it, i) => {
      const share = i === result.items.length - 1 ? left : Math.round((discount * it.thanhTien) / gross)
      left -= share
      it.thanhTien += share
      it.donGia = it.soLuong ? Math.round(it.thanhTien / it.soLuong) : 0
    })
  }
  result.tongTien = result.items.reduce((sum, it) => sum + it.thanhTien, 0)
  if (result.items.length === 0) throw new Error('Không đọc được bảng hàng hoá trong phiếu xuất kho. Kiểm tra lại file PDF.')
  return result
}

export function parseInvoiceLines(rawLines) {
  const lines = (rawLines || []).map(clean).filter(Boolean)
  const text = lines.join('\n')
  if (!/HÓA ĐƠN GIÁ TRỊ GIA TĂNG/i.test(text)) {
    if (/PHIẾU XUẤT KHO/i.test(text) && /Ký hiệu:/.test(text) && /Mã SP/.test(text)) return parseSalesSlipLines(lines)
    throw new Error('Không nhận ra file. Chỉ nhận "Hóa đơn giá trị gia tăng" hoặc "Phiếu xuất kho" bán hàng của Kho C dạng PDF.')
  }
  const find = re => re.exec(text)

  const dm = find(/Ngày\s+(\d{1,2})(?:\s+\1)?\s+tháng\s+(\d{1,2})(?:\s+\2)?\s+năm\s+(\d{4})/)
  const sellerRaw = find(/Đơn vị bán hàng\s+(.+?)\s+Mã số thuế/)?.[1] || ''
  const seller = undouble(sellerRaw)
  const donVi = undouble(find(/Đơn vị mua hàng:\s*(.*?)\s*Hình thức/)?.[1] || '')
  const person = clean((find(/Họ tên người mua hàng:\s*(.*?)\s*(?:Kho:|$)/m)?.[1] || '')
    .replace(/^Bán cho người tiêu dùng\s*-\s*/i, '').replace(/\s0\d{9,10}$/, ''))
  // Địa chỉ người mua: dòng "Địa chỉ:" nằm sau dòng người mua (dòng "Địa chỉ:" đầu tiên là của bên bán).
  const buyerAt = lines.findIndex(l => /^(Họ tên người mua hàng|Đơn vị mua hàng):/.test(l))
  const diaChi = clean((buyerAt === -1 ? [] : lines.slice(buyerAt)).find(l => /^Địa chỉ:/.test(l)) || '')
    .replace(/\s*Đồng tiền thanh toán:.*$/, '')
  const mstBuyer = /^Mã số thuế:\s*(\d[\d-]*)/m.exec(text.split('\n').filter(l => /^Mã số thuế:/.test(l)).join('\n'))?.[1] || ''

  const result = {
    soHD: find(/Số:\s*(\d+)/)?.[1] || '',
    kyHieu: find(/Ký hiệu:\s*(\S+)/)?.[1] || '',
    ngayHD: dm ? `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}` : '',
    mau: /UPHARMA/i.test(seller) ? 'UPHARMA' : /CPC1/i.test(seller) ? 'CPC1HN' : null,
    benBan: seller,
    benMua: { ten: donVi || person, diaChi: diaChi.replace(/^Địa chỉ:\s*-?\s*/, ''), mst: mstBuyer },
    items: [],
    tongTien: 0,
  }

  // Bảng hàng: bắt đầu sau dòng đánh số cột "1 1 2 2 …", kết thúc ở "Tổng cộng tiền thanh toán". Tên hàng dài xuống
  // dòng nằm quanh dòng số liệu (căn giữa ô): dòng liền trên là đầu tên, dòng liền dưới là phần đuôi.
  let hasDiscount = false
  const start = lines.findIndex(l => /^1\s+1\s+2\s+2\s+3\s+3/.test(l))
  const end = lines.findIndex(l => /^Tổng cộng tiền thanh toán/i.test(l))
  if (start !== -1 && end !== -1) {
    const body = lines.slice(start + 1, end)
    // Ranh giới từng dòng hàng gồm cả dòng chiết khấu, để tên dòng chiết khấu không bị ghép vào tên hàng.
    const rows = []
    body.forEach((l, i) => { if (ROW_RE.test(l) || DISCOUNT_ROW_RE.test(l)) rows.push(i) })
    if (rows.some(i => DISCOUNT_ROW_RE.test(body[i]))) hasDiscount = true
    rows.forEach((at, k) => {
      const m = ROW_RE.exec(body[at])
      if (!m) return
      const nextAt = k + 1 < rows.length ? rows[k + 1] : body.length
      const between = body.slice(at + 1, nextAt).filter(l => !NUMERIC_ONLY_RE.test(l))
      const prevAt = k > 0 ? rows[k - 1] : -1
      const heads = body.slice(prevAt + 1, at).filter(l => !NUMERIC_ONLY_RE.test(l))
      // Giữa 2 dòng số liệu: dòng đầu là đuôi tên hàng trên, còn lại là đầu tên hàng dưới.
      const head = k === 0 ? heads : heads.slice(heads.length > 1 ? 1 : 0)
      const tail = k + 1 < rows.length ? between.slice(0, between.length > 1 ? 1 : 0) : between
      const soLuong = num(m[7])
      const thanhTien = num(m[9])
      result.items.push({
        stt: Number(m[1]),
        ten: clean([...head, ...tail].join(' ')),
        soLo: m[2], hanDung: `${m[5]}-${m[4].padStart(2, '0')}-${m[3].padStart(2, '0')}`,
        dvt: m[6], soLuong,
        donGia: soLuong ? Math.round(thanhTien / soLuong) : num(m[8]), // đơn giá gồm VAT = thành tiền / số lượng
        thanhTien,
      })
    })
  }
  const itemsTotal = result.items.reduce((sum, it) => sum + it.thanhTien, 0)
  // Có dòng chiết khấu (đã bỏ qua): tổng tiền = tổng các dòng hàng, không lấy "Tổng cộng tiền thanh toán" đã trừ chiết khấu.
  result.tongTien = hasDiscount ? itemsTotal : (num(find(/Tổng cộng tiền thanh toán:?\s*(?:Tổng cộng tiền thanh toán:?\s*)?([\d.,]+)/)?.[1]) || itemsTotal)
  if (result.items.length === 0) throw new Error('Không đọc được bảng hàng hoá trong hoá đơn. Kiểm tra lại file PDF.')
  return result
}
