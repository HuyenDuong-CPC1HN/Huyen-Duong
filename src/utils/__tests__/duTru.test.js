import { describe, expect, it } from 'vitest'
import { analyseItem, buildDuTruModel, computePlan, groupsOf, jwCandidates, parseNxtXml, planItems, roundKien, seaOf, weekKey } from '../duTru'
import { nxtXml } from './nxtXmlFixture'

// [mã, tên, mã kho, ĐVT, lô, hạn dùng, tồn đầu, nhập, xuất, tồn cuối]
const F3 = [
  ['A00001', 'Thuốc A - Hộp 10 vỉ', '020101', 'HOP', 'L1', '2027-01-01', 100, 800, 890, 10],
  ['A00001', 'Thuốc A - Hộp 10 vỉ', '020101', 'HOP', 'L2', '2028-01-01', 0, 200, 0, 200],
  ['B00002', 'Siro B - Hộp 1 lọ 100ml', '020101', 'LO', 'S1', '2027-05-01', 50, 400, 420, 30],
  ['J00602', 'Siro B - Hộp 1 lọ 100ml', '020102', 'LO', 'S9', '2027-05-01', 0, 90, 70, 20], // cùng sản phẩm, mã J
  ['C00003', 'Thuốc C', '020101', 'VIEN', 'C1', '2027-02-01', 300, 0, 0, 300], // không bán
  ['D00004', 'Thuốc D', '020108', 'HOP', 'D1', '2027-03-01', 0, 500, 500, 0], // kho không chọn
]

describe('Dự trù hàng — đọc file nhập – xuất – tồn', () => {
  it('đọc kỳ báo cáo, bỏ dòng tổng, giữ đúng cột; mã viết hoa', () => {
    const f = parseNxtXml(nxtXml('01/08/2026', '28/10/2026', F3))
    expect(f.days).toBe(89)
    expect(f.data).toHaveLength(6)
    expect(f.data[0]).toEqual({ ma: 'A00001', ten: 'Thuốc A - Hộp 10 vỉ', dvt: 'HOP', kho: '020101', lo: 'L1', hd: '2027-01-01', td: 100, nh: 800, x: 890, tc: 10 })
    expect(f.nMa).toBe(5)
  })

  it('báo lỗi dễ hiểu khi không phải file đúng mẫu', () => {
    expect(() => parseNxtXml('ma,ten\nA,B')).toThrow(/Excel dạng XML/)
    expect(() => parseNxtXml(nxtXml('01/08/2026', '28/10/2026', F3).replace(/Từ ngày/, 'Kỳ'))).toThrow(/Từ ngày/)
    expect(() => parseNxtXml(nxtXml('01/08/2026', '28/10/2026', F3).replace('Sl xuất', 'Xuất'))).toThrow(/thiếu cột: Sl xuất/)
  })
})

describe('Dự trù hàng — tính đề xuất', () => {
  const model = buildDuTruModel({ f3: parseNxtXml(nxtXml('01/08/2026', '28/10/2026', F3)) })
  const settings = { kho: ['020101', '020102'], merge: {}, manual: [] }
  const P = { Ld: 5, ss: 3, useSea: true }

  it('chỉ cộng các kho được chọn; mã trùng tên + ĐVT tự gộp, đặt bằng mã nhận điều (không J / W)', () => {
    expect(model.khoCodes).toEqual(['020101', '020102', '020108'])
    expect(groupsOf(model, settings).map(g => g.codes)).toEqual([['B00002', 'J00602']])
    const items = planItems(model, settings)
    expect(items.map(i => i.id).sort()).toEqual(['A00001', 'B00002', 'C00003']) // D00004 ở kho không chọn
    expect(items.find(i => i.id === 'B00002').codes).toEqual(['B00002', 'J00602'])
  })

  it('bán/ngày = Sl xuất ÷ số ngày; đề xuất = bán/ngày × (7 + chờ hàng + tồn an toàn) − tồn, làm tròn lên', () => {
    const a = analyseItem(model, settings, { id: 'A00001', order: 'A00001', codes: ['A00001'] }, P)
    expect(a.X3).toBe(890)
    expect(a.TON).toBe(210) // cộng 2 lô
    expect(a.rate).toBeCloseTo(10)
    expect(a.de).toBe(0) // cần 10 × 15 = 150 < tồn 210
    const b = analyseItem(model, settings, { id: 'B00002', order: 'B00002', codes: ['B00002', 'J00602'] }, P)
    expect(b.X3).toBe(490)
    expect(b.TON).toBe(50)
    expect(b.de).toBe(Math.ceil(490 / 89 * 15 - 50)) // 33
    // tính riêng mã B00002 thì đặt nhiều hơn hẳn vì không thấy tồn ở mã J
    const b1 = analyseItem(model, settings, { id: 'B00002', order: 'B00002', codes: ['B00002'] }, P)
    expect(b1.de).toBe(Math.ceil(420 / 89 * 15 - 30))
    expect(b1.de).toBeGreaterThan(b.de)
    const c = analyseItem(model, settings, { id: 'C00003', order: 'C00003', codes: ['C00003'] }, P)
    expect(c.de).toBe(0)
    expect(c.alerts.map(x => x.k)).toContain('stop')
  })

  it('anh bỏ gộp / đổi mã đặt hàng / gộp tay; bảng xếp theo tên vật tư A → Z', () => {
    const key = groupsOf(model, settings)[0].key
    expect(planItems(model, { ...settings, merge: { [key]: { on: false } } }).map(i => i.id).sort()).toEqual(['A00001', 'B00002', 'C00003', 'J00602'])
    expect(planItems(model, { ...settings, merge: { [key]: { order: 'J00602' } } }).find(i => i.codes.length > 1).id).toBe('J00602')
    expect(planItems(model, { ...settings, manual: [['A00001', 'C00003']] }).find(i => i.codes.includes('C00003')).codes).toEqual(['A00001', 'C00003'])
    expect(computePlan(model, settings, P).map(r => r.p0.ten)).toEqual(['Siro B - Hộp 1 lọ 100ml', 'Thuốc A - Hộp 10 vỉ', 'Thuốc C'])
  })

  it('file 4 tuần: cảnh báo bán tăng mạnh, cột cách đang làm = xuất 1 tháng − tồn', () => {
    const f4 = parseNxtXml(nxtXml('01/10/2026', '28/10/2026', [['A00001', 'Thuốc A - Hộp 10 vỉ', '020101', 'HOP', 'L1', '2027-01-01', 0, 0, 560, 0]]))
    const m = buildDuTruModel({ f3: parseNxtXml(nxtXml('01/08/2026', '28/10/2026', F3)), f4 })
    const a = analyseItem(m, settings, { id: 'A00001', order: 'A00001', codes: ['A00001'] }, P)
    expect(a.r4).toBeCloseTo(20)
    expect(a.alerts.map(x => x.k)).toContain('up')
    expect(a.old).toBe(Math.round(560 * 30.44 / 28) - 210)
  })

  it('2 file năm trước: hệ số mùa vụ = tốc độ tháng tới ÷ tốc độ 3 tháng, giới hạn 0,7 – 1,5', () => {
    const ly3 = parseNxtXml(nxtXml('01/08/2025', '28/10/2025', [['A00001', 'Thuốc A - Hộp 10 vỉ', '020101', 'HOP', 'L0', '2026-01-01', 0, 0, 890, 0]]))
    const lyn = parseNxtXml(nxtXml('01/11/2025', '30/11/2025', [['A00001', 'Thuốc A - Hộp 10 vỉ', '020101', 'HOP', 'L0', '2026-01-01', 0, 0, 360, 0]]))
    const m = buildDuTruModel({ f3: parseNxtXml(nxtXml('01/08/2026', '28/10/2026', F3)), ly3, lyn })
    expect(seaOf(m, new Set(['020101']), ['A00001'])).toBeCloseTo((360 / 30) / (890 / 89))
    const a = analyseItem(m, settings, { id: 'A00001', order: 'A00001', codes: ['A00001'] }, P)
    expect(a.rd).toBeCloseTo(12)
    expect(a.alerts.map(x => x.k)).toContain('season')
    expect(analyseItem(m, settings, { id: 'A00001', order: 'A00001', codes: ['A00001'] }, { ...P, useSea: false }).rd).toBeCloseTo(10)
  })

  it('file tuần này: mã bán nhanh hơn dự kiến 30% thì ra đơn bổ sung, trừ tồn hiện có và đơn chính đã chốt', () => {
    const fw = parseNxtXml(nxtXml('26/10/2026', '29/10/2026', [['A00001', 'Thuốc A - Hộp 10 vỉ', '020101', 'HOP', 'L2', '2028-01-01', 200, 0, 80, 120]]))
    const m = buildDuTruModel({ f3: parseNxtXml(nxtXml('01/08/2026', '28/10/2026', F3)), fw })
    const [a] = computePlan(m, settings, P, { A00001: 50 }).filter(r => r.id === 'A00001')
    expect(a.fast).toBe(true) // 80 trong 4 ngày ≥ 1,3 × 40
    expect(a.tonNow).toBe(120)
    expect(a.addDe).toBe(Math.ceil(20 * a.untilNext + 10 * 3 - 120 - 50))
  })

  it('mã J / W tên khác mã nhận điều: chỉ gợi ý (cùng ĐVT, quy cách giống nhất), anh chọn thì gộp và đặt bằng mã nhận điều', () => {
    const m = buildDuTruModel({ f3: parseNxtXml(nxtXml('01/08/2026', '28/10/2026', [
      ...F3,
      ['E00010', 'Thuốc E - Hộp 4 vỉ x 5 ống 0.5ml', '020101', 'ONG', 'E1', '2028-01-01', 0, 400, 300, 100],
      ['E00011', 'Thuốc E - Hộp 1 ống 10ml', '020101', 'ONG', 'E2', '2028-01-01', 0, 70, 50, 20],
      ['E00012', 'Thuốc E - Hộp 4 vỉ x 5 ống 0.5ml', '020101', 'HOP', 'E3', '2028-01-01', 0, 10, 5, 5], // khác ĐVT
      ['J00710', 'Thuốc E - H20 0.5ml', '020102', 'ONG', 'J1', '2028-01-01', 120, 0, 120, 0],
    ])) })
    expect(jwCandidates(m, settings, 'J00710').map(c => c.ma)).toEqual(['E00010', 'E00011']) // "H20" = "4 vỉ x 5", cùng 0.5ml
    const lone = planItems(m, settings).find(i => i.id === 'J00710')
    expect(lone.codes).toEqual(['J00710'])
    expect(analyseItem(m, settings, lone, P).alerts[0].k).toBe('jw')
    expect(planItems(m, { ...settings, jwAlone: ['J00710'] }).find(i => i.id === 'J00710').cands).toBeUndefined()
    const linked = { ...settings, manual: [['E00010', 'J00710']] }
    const it2 = planItems(m, linked).find(i => i.codes.includes('J00710'))
    expect(it2).toMatchObject({ id: 'E00010', codes: ['E00010', 'J00710'] })
    expect(analyseItem(m, linked, it2, P)).toMatchObject({ X3: 420, TON: 100 })
    // gộp tay chứa trọn nhóm tự tìm thì thay nhóm đó (nhóm gộp tay xét trước)
    const wide = { ...settings, manual: [['B00002', 'J00602', 'J00710']] }
    expect(groupsOf(m, wide).map(g => g.codes)).toEqual([['B00002', 'J00602', 'J00710']])
  })

  it('quy cách kiện: đề xuất làm tròn lên đủ kiện; nhóm gộp lấy quy cách mã đặt hàng, chưa có thì mã cùng nhóm', () => {
    expect(roundKien(130, 50)).toBe(150)
    expect(roundKien(150, 50)).toBe(150)
    expect(roundKien(0, 50)).toBe(0)
    expect(roundKien(33, null)).toBe(33)
    const plan = computePlan(model, settings, P, {}, { J00602: 20 })
    const b = plan.find(r => r.id === 'B00002')
    expect(b.de).toBe(33)
    expect(b).toMatchObject({ kien: 20, deK: 40 })
    expect(plan.find(r => r.id === 'A00001')).toMatchObject({ kien: null, deK: 0 })
  })

  it('khoá tuần: thứ 4 và thứ 6 cùng tuần', () => {
    expect(weekKey(new Date(2026, 9, 28))).toBe('2026-W44')
    expect(weekKey(new Date(2026, 9, 30))).toBe('2026-W44')
    expect(weekKey(new Date(2026, 10, 2))).toBe('2026-W45')
  })
})
