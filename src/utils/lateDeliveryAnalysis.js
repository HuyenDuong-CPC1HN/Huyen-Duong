// Phân tích đơn giao trễ hạn 48h (đối soát đơn website / SPX): trong các đơn giao quá 48h, đơn nào thật sự trễ
// so với SLA của vùng giao (sheet "Cài đặt SLA" của file Đánh giá giao hàng ngoại sàn) và trễ do chặng nào.
//  - Vùng giao: cùng tỉnh với kho gửi → Nội tỉnh 48h; khác tỉnh cùng miền → Nội miền 72h; khác miền → Liên miền 96h.
//  - Miền: 34 tỉnh, thành sau sắp xếp (NQ 202/2025/QH15) theo 6 vùng kinh tế - xã hội, gộp thành Bắc / Trung / Nam.
//  - Chặng (chỉ xét đơn trễ): Duyệt → Đóng kiện > 24h = Đóng kiện trễ; Đóng kiện → SPX lấy > 8h = Kho bàn giao;
//    còn lại = SPX vận chuyển.

const REGIONS = {
  bac: ['Hà Nội', 'Hải Phòng', 'Quảng Ninh', 'Bắc Ninh', 'Hưng Yên', 'Ninh Bình', 'Tuyên Quang', 'Cao Bằng', 'Lai Châu',
    'Lào Cai', 'Thái Nguyên', 'Điện Biên', 'Lạng Sơn', 'Sơn La', 'Phú Thọ'],
  trung: ['Thanh Hóa', 'Nghệ An', 'Hà Tĩnh', 'Quảng Trị', 'Huế', 'Đà Nẵng', 'Quảng Ngãi', 'Khánh Hòa', 'Gia Lai', 'Đắk Lắk', 'Lâm Đồng'],
  nam: ['TP.HCM', 'Đồng Nai', 'Tây Ninh', 'Cần Thơ', 'Vĩnh Long', 'Đồng Tháp', 'Cà Mau', 'An Giang'],
}

// Tên tỉnh cũ (trước 01/07/2025) → tỉnh, thành mới
const OLD_TO_NEW = {
  'Hồ Chí Minh': 'TP.HCM', 'TP Hồ Chí Minh': 'TP.HCM', 'Sài Gòn': 'TP.HCM', 'Bình Dương': 'TP.HCM', 'Bà Rịa - Vũng Tàu': 'TP.HCM', 'Bà Rịa Vũng Tàu': 'TP.HCM',
  'Thừa Thiên Huế': 'Huế', 'Thừa Thiên - Huế': 'Huế',
  'Hà Giang': 'Tuyên Quang', 'Yên Bái': 'Lào Cai', 'Bắc Kạn': 'Thái Nguyên', 'Vĩnh Phúc': 'Phú Thọ', 'Hòa Bình': 'Phú Thọ',
  'Bắc Giang': 'Bắc Ninh', 'Thái Bình': 'Hưng Yên', 'Hà Nam': 'Ninh Bình', 'Nam Định': 'Ninh Bình', 'Hải Dương': 'Hải Phòng',
  'Quảng Bình': 'Quảng Trị', 'Quảng Nam': 'Đà Nẵng', 'Kon Tum': 'Quảng Ngãi', 'Bình Định': 'Gia Lai', 'Ninh Thuận': 'Khánh Hòa',
  'Phú Yên': 'Đắk Lắk', 'Đắk Nông': 'Lâm Đồng', 'Bình Thuận': 'Lâm Đồng', 'Bình Phước': 'Đồng Nai', 'Long An': 'Tây Ninh',
  'Tiền Giang': 'Đồng Tháp', 'Bến Tre': 'Vĩnh Long', 'Trà Vinh': 'Vĩnh Long', 'Sóc Trăng': 'Cần Thơ', 'Hậu Giang': 'Cần Thơ',
  'Bạc Liêu': 'Cà Mau', 'Kiên Giang': 'An Giang',
}

// So khớp không phân biệt dấu thanh đặt khác chỗ (Hòa/Hoà), hoa thường, khoảng trắng, gạch nối.
const keyOf = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]/g, '')

const CANONICAL = new Map()
for (const [region, list] of Object.entries(REGIONS)) for (const name of list) CANONICAL.set(keyOf(name), { name, region })
for (const [oldName, newName] of Object.entries(OLD_TO_NEW)) CANONICAL.set(keyOf(oldName), CANONICAL.get(keyOf(newName)))

export function normalizeProvince(raw) {
  const stripped = String(raw || '').trim().replace(/^(tỉnh|thành phố|tp\.?)\s+/i, '')
  if (!stripped) return null
  return CANONICAL.get(keyOf(stripped)) || CANONICAL.get(keyOf(raw)) || null
}

export const ZONES = {
  noiTinh: { label: 'Nội tỉnh', sla: 48 },
  noiMien: { label: 'Nội miền', sla: 72 },
  lienMien: { label: 'Liên miền', sla: 96 },
}

export function deliveryZone(senderProvince, receiverProvince) {
  const from = normalizeProvince(senderProvince)
  const to = normalizeProvince(receiverProvince)
  if (!from || !to) return null
  if (from.name === to.name) return 'noiTinh'
  return from.region === to.region ? 'noiMien' : 'lienMien'
}

export const STAGES = {
  spx: 'SPX vận chuyển',
  banGiao: 'Kho bàn giao (>8 giờ)',
  dongKien: 'Đóng kiện trễ',
}
const PACKING_LIMIT_HOURS = 24
const HANDOVER_LIMIT_HOURS = 8

export function lateStage(row) {
  if (typeof row.gioDongKien === 'number' && row.gioDongKien > PACKING_LIMIT_HOURS) return 'dongKien'
  if (typeof row.gioLaySauDongKien === 'number' && row.gioLaySauDongKien > HANDOVER_LIMIT_HOURS) return 'banGiao'
  return 'spx'
}

export const LATE_48H_STATUS = 'TRỄ HẠN (>48h)'

// rows: kết quả reconcileNgoaiSan; spxRows: dòng file SPX (đã có "Tỉnh nhận"/"Tỉnh gửi"/"Phường/Xã nhận").
export function analyzeLateDeliveries(rows, spxRows) {
  const spxByCode = new Map()
  for (const s of spxRows || []) {
    const code = String(s['Mã vận đơn'] || '').trim().toUpperCase()
    if (code) spxByCode.set(code, s)
  }
  const items = []
  for (const r of rows || []) {
    if (r.tinhTrangGiao !== LATE_48H_STATUS || r.excludedFromReport) continue
    const spx = spxByCode.get(String(r.maVanDon || '').toUpperCase()) || {}
    const zone = deliveryZone(spx['Tỉnh gửi'], spx['Tỉnh nhận'])
    const sla = zone ? ZONES[zone].sla : null
    const hours = Number(r.gioGiaoTong)
    const late = sla === null ? null : hours > sla
    items.push({
      maDon: r.maDon,
      maVanDon: r.maVanDon,
      tinhNhan: normalizeProvince(spx['Tỉnh nhận'])?.name || spx['Tỉnh nhận'] || '',
      phuongXa: spx['Phường/Xã nhận'] || '',
      zone,
      sla,
      hours,
      overHours: sla === null ? null : Math.round((hours - sla) * 10) / 10,
      late,
      stage: late ? lateStage(r) : null,
    })
  }
  const late = items.filter(i => i.late === true)
  const ok = items.filter(i => i.late === false)
  const unknown = items.filter(i => i.late === null)
  const count = (list, fn) => list.filter(fn).length
  return {
    items,
    total: items.length,
    late: late.length,
    ok: ok.length,
    unknown: unknown.length,
    byStage: Object.fromEntries(Object.keys(STAGES).map(k => [k, count(late, i => i.stage === k)])),
    lateByZone: Object.fromEntries(Object.keys(ZONES).map(k => [k, count(late, i => i.zone === k)])),
    okByZone: Object.fromEntries(Object.keys(ZONES).map(k => [k, count(ok, i => i.zone === k)])),
  }
}
