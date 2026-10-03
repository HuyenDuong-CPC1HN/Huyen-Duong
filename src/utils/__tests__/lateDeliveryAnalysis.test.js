import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { analyzeLateDeliveries, deliveryZone, normalizeProvince } from '../lateDeliveryAnalysis'
import { parseCarrierFile } from '../parseCarrierExport'

describe('Chia vùng giao theo 34 tỉnh, thành mới', () => {
  it('chuẩn hoá tên tỉnh mới, tỉnh cũ và cách viết dấu khác nhau', () => {
    expect(normalizeProvince('Thành phố Hồ Chí Minh')?.name).toBe('TP.HCM')
    expect(normalizeProvince('Tỉnh Khánh Hoà')?.name).toBe('Khánh Hòa')
    expect(normalizeProvince('Tỉnh Bình Dương')?.name).toBe('TP.HCM')
    expect(normalizeProvince('Long An')?.name).toBe('Tây Ninh')
    expect(normalizeProvince('Tỉnh Bình Thuận')?.name).toBe('Lâm Đồng')
    expect(normalizeProvince('')).toBeNull()
  })

  it('cùng tỉnh = Nội tỉnh, cùng miền = Nội miền, khác miền = Liên miền (Lâm Đồng, Gia Lai thuộc miền Trung)', () => {
    expect(deliveryZone('Thành phố Hồ Chí Minh', 'Thành phố Hồ Chí Minh')).toBe('noiTinh')
    expect(deliveryZone('Thành phố Hồ Chí Minh', 'Tỉnh Tây Ninh')).toBe('noiMien')
    expect(deliveryZone('Thành phố Hồ Chí Minh', 'Tỉnh Lâm Đồng')).toBe('lienMien')
    expect(deliveryZone('Thành phố Hồ Chí Minh', 'Tỉnh Gia Lai')).toBe('lienMien')
    expect(deliveryZone('Tỉnh Khánh Hòa', 'Tỉnh Lâm Đồng')).toBe('noiMien')
    expect(deliveryZone('', 'Tỉnh Gia Lai')).toBeNull()
  })
})

describe('analyzeLateDeliveries', () => {
  const spx = [
    { 'Mã vận đơn': 'A1', 'Tỉnh gửi': 'Thành phố Hồ Chí Minh', 'Tỉnh nhận': 'Thành phố Hồ Chí Minh', 'Phường/Xã nhận': 'Phường Bến Thành' },
    { 'Mã vận đơn': 'A2', 'Tỉnh gửi': 'Thành phố Hồ Chí Minh', 'Tỉnh nhận': 'Tỉnh Đồng Nai' },
    { 'Mã vận đơn': 'A3', 'Tỉnh gửi': 'Thành phố Hồ Chí Minh', 'Tỉnh nhận': 'Tỉnh Đồng Nai' },
    { 'Mã vận đơn': 'A4', 'Tỉnh gửi': 'Thành phố Hồ Chí Minh', 'Tỉnh nhận': 'Tỉnh Gia Lai' },
    { 'Mã vận đơn': 'A5', 'Tỉnh gửi': 'Thành phố Hồ Chí Minh', 'Tỉnh nhận': 'Thành phố Hồ Chí Minh' },
  ]
  const late = (maVanDon, gioGiaoTong, extra = {}) => ({ maDon: `D-${maVanDon}`, maVanDon, tinhTrangGiao: 'TRỄ HẠN (>48h)', gioGiaoTong, gioDongKien: 2, gioLaySauDongKien: 1, ...extra })
  const rows = [
    late('A1', 60),
    late('A2', 80, { gioLaySauDongKien: 12 }),
    late('A3', 70),
    late('A4', 100, { gioDongKien: 30 }),
    late('A5', 50, { excludedFromReport: true }),
    { maDon: 'D-ok', maVanDon: 'A9', tinhTrangGiao: 'Đúng hạn (≤48h)', gioGiaoTong: 20 },
    late('ZZ', 55),
  ]

  it('tách đơn trễ theo SLA vùng / đạt SLA vùng / chưa rõ vùng, chia theo chặng và theo vùng', () => {
    const a = analyzeLateDeliveries(rows, spx)
    expect(a.total).toBe(5) // bỏ đơn đúng hạn và đơn đã đánh dấu không tính
    expect(a.late).toBe(3)
    expect(a.ok).toBe(1)
    expect(a.unknown).toBe(1)
    expect(a.byStage).toEqual({ spx: 1, banGiao: 1, dongKien: 1 })
    expect(a.lateByZone).toEqual({ noiTinh: 1, noiMien: 1, lienMien: 1 })
    expect(a.okByZone).toEqual({ noiTinh: 0, noiMien: 1, lienMien: 0 })
    expect(a.items.find(i => i.maVanDon === 'A3')).toMatchObject({ zone: 'noiMien', sla: 72, overHours: -2, late: false })
    expect(a.items.find(i => i.maVanDon === 'A1')).toMatchObject({ tinhNhan: 'TP.HCM', phuongXa: 'Phường Bến Thành', overHours: 12 })
  })
})

describe('parseCarrierFile SPX: đọc tỉnh gửi/nhận từ 2 cột trùng tên "Tỉnh, thành"', () => {
  it('lần đầu là người nhận, lần 2 là người gửi', () => {
    const header = ['Mã vận đơn', 'Trạng thái hiện tại', 'Tỉnh, thành', 'Quận, huyện (cũ) / Phường, xã (mới)', 'Tên người gửi', 'Tỉnh, thành', 'Quận, huyện (cũ) / Phường, xã (mới)', 'Mã khách hàng']
    const ws = XLSX.utils.aoa_to_sheet([['Thời gian tải xuống'], header, ['SPX1', 'Đã giao hàng', 'Tỉnh Tây Ninh', 'Xã Mỹ Yên', 'CPC1', 'Thành phố Hồ Chí Minh', 'Phường Phú Thọ Hòa', 'ORD1']])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    const [row] = parseCarrierFile(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), 'spx')
    expect(row).toMatchObject({ 'Mã vận đơn': 'SPX1', 'Tỉnh nhận': 'Tỉnh Tây Ninh', 'Phường/Xã nhận': 'Xã Mỹ Yên', 'Tỉnh gửi': 'Thành phố Hồ Chí Minh', 'Mã khách hàng': 'ORD1' })
  })
})
