import { describe, expect, it } from 'vitest'
import { buildDtpCompare, parseMapCU, parseWebTon, ttByU } from '../duTruDtp'
import { buildDuTruModel, computePlan, parseNxtXml } from '../duTru'
import { nxtXml } from './nxtXmlFixture'

// số liệu giả lập
const MAP = [
  ['Mã SP C', 'Tên sản phẩm', 'Đơn vị', 'Số lượng', 'Quy đổi U', 'Mã SP U', 'Đơn vị U'],
  ['A00001', 'Thuốc A - Hộp 4 vỉ x 5 ống', 'ONG', '1', '1', 'TH00001', 'Ống'],
  ['J00001', 'Thuốc A - H20', 'ONG', '1', '1', 'TH00001', 'Ống'], // 2 mã C cùng 1 mã U
  ['B00002', 'Siro B', 'LO', '1', '1', 'TH00002', 'Lọ'],
]
const WEB = [
  ['STT', 'Mã BFO', 'Tên sản phẩm', 'Số lô', 'Hạn dùng', 'Kho', 'Lượng nhập', 'Lượng xuất', 'Lượng tồn', 'ĐVT', 'Ghi chú'],
  [1, 'A00001', 'Thuốc A', 'L1', '11/07/28', '020105', 500, 380, 120, 'ONG', ''],
  [2, 'J00001', 'Thuốc A', 'L2', '01/01/29', '020105', 30, 0, 30, 'ONG', ''],
  [3, 'B00002', 'Siro B', 'S1', '01/05/28', '020105', 100, 0, 100, 'LO', ''],
  [4, 'X99999', 'Hàng lạ', 'Z', '01/01/29', '020105', 5, 0, 5, 'HOP', ''],
]
// [mã, tên, kho, ĐVT, lô, hạn dùng, tồn đầu, nhập, xuất, tồn cuối]
const FAST = [
  ['TH00001', 'Thuốc A', '020105', 'Ống', 'L1', '2028-07-11', 1500, 200, 1500, 200],
  ['TH00002', 'Siro B', '020105', 'Lọ', 'S1', '2028-05-01', 100, 0, 0, 100],
]

describe('Dự trù Kho DTP — tồn sổ sách Fast U ↔ tồn thực tế Web', () => {
  const map = parseMapCU(MAP)
  const web = parseWebTon(WEB)
  const fast = parseNxtXml(nxtXml('01/08/2026', '28/10/2026', FAST))

  it('đọc bảng quy đổi và file Web; báo lỗi dễ hiểu khi sai mẫu', () => {
    expect(map).toHaveLength(3)
    expect(map[0]).toMatchObject({ c: 'A00001', u: 'TH00001', k: 1 })
    expect(web.data[0]).toMatchObject({ ma: 'A00001', lo: 'L1', hd: '2028-07-11', tc: 120 })
    expect(() => parseMapCU([['a', 'b']])).toThrow(/Mã SP C/)
    expect(() => parseWebTon([['a', 'b']])).toThrow(/Mã BFO/)
  })

  it('so theo mã U, cộng các mã C cùng quy về 1 mã U; chênh lệch = thực tế − sổ sách; báo mã Web chưa có quy đổi', () => {
    const cmp = buildDtpCompare(fast, web, map)
    const a = cmp.rows.find(r => r.u === 'TH00001')
    expect(a).toMatchObject({ codesC: ['A00001', 'J00001'], ss: 200, tt: 150, diff: -50 })
    expect(a.lots.map(l => [l.lo, l.ss, l.tt])).toEqual([['L1', 200, 120], ['L2', 0, 30]])
    expect(cmp.rows.find(r => r.u === 'TH00002').diff).toBe(0)
    expect(cmp.webUnmapped.map(w => w.ma)).toEqual(['X99999'])
  })

  it('dự trù dùng tồn thực tế Web thay tồn sổ sách', () => {
    const m = buildDuTruModel({ f3: fast })
    const s = { kho: m.khoCodes, merge: {}, manual: [], jwAlone: [] }
    const P = { Ld: 5, ss: 3, useSea: false }
    const before = computePlan(m, s, P).find(r => r.id === 'TH00001')
    m.tonOverride = ttByU(buildDtpCompare(fast, web, map))
    const after = computePlan(m, s, P).find(r => r.id === 'TH00001')
    expect(before.TON).toBe(200)
    expect(after.TON).toBe(150)
    expect(after.de).toBe(Math.ceil(1500 / 89 * 15 - 150))
    expect(after.de).toBeGreaterThan(before.de)
  })
})
