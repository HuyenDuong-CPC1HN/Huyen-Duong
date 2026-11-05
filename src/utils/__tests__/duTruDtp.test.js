import { describe, expect, it } from 'vitest'
import { buildDtpCompare, parseMapCU, parseWebTon, remapFile, soGroups, ttByU } from '../duTruDtp'
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

describe('Kho SO — 1 sản phẩm 2 mã (sổ sách mã J / W, Web mã nhận điều)', () => {
  // số liệu giả lập
  const fast = parseNxtXml(nxtXml('01/10/2026', '05/11/2026', [
    ['J00001', 'Siro K - H20 10ml', '020105', 'TUI', 'L1', '2028-05-20', 500, 0, 100, 400],
    ['W00002', 'Viên L - Lọ 30 viên', '020105', 'VIEN', 'V1', '2028-05-20', 90, 0, 0, 90],
    ['B00003', 'Bột M', '020105', 'GOI', 'B1', '2028-05-20', 50, 0, 0, 50],
  ]))
  const web = parseWebTon([
    ['STT', 'Mã BFO', 'Tên sản phẩm', 'Số lô', 'Hạn dùng', 'Kho', 'Lượng nhập', 'Lượng xuất', 'Lượng tồn', 'ĐVT'],
    [1, 'S00001', 'Siro K - Hộp 20 gói 10ml', 'L1', '20/05/28', '020105', 400, 20, 380, 'TUI'],
    [2, 'V00002', 'Viên L - Lọ 30 viên', 'V1', '20/05/28', '020105', 90, 0, 90, 'VIEN'],
    [3, 'B00003', 'Bột M', 'B1', '20/05/28', '020105', 50, 0, 50, 'GOI'],
  ])
  const cmpOf = g => buildDtpCompare(remapFile(fast, g.rep, g.pool), web, g.map)

  it('trùng tên + ĐVT thì tự gom về mã nhận điều; tên khác thì gợi ý, anh ghép mới gom; không ghép thì lệch giả', () => {
    const g = soGroups(fast, web)
    const c = cmpOf(g)
    const v = c.rows.find(r => r.u === 'V00002')
    expect([...v.codesC].sort()).toEqual(['V00002', 'W00002'])
    expect(v).toMatchObject({ ss: 90, tt: 90, diff: 0 })
    expect(c.rows.find(r => r.u === 'J00001').diff).toBe(-400) // chưa ghép: lệch giả
    expect(g.pending.map(p => [p.order, p.cands[0].ma])).toEqual([['J00001', 'S00001']])
    const g2 = soGroups(fast, web, [['S00001', 'J00001']])
    expect(cmpOf(g2).rows.find(r => r.u === 'S00001')).toMatchObject({ ss: 400, tt: 380, diff: -20 })
    expect(g2.pending).toEqual([])
    expect(soGroups(fast, web, [], ['J00001']).pending).toEqual([]) // "không phải hàng 2 mã"
  })
})

describe('Kho SO — ĐVT TUBE / TUYP là 1 đơn vị', () => {
  it('cùng tên, 1 mã ghi TUBE 1 mã ghi TUYP vẫn tự gom; mã J / W tên khác gợi ý đúng nhóm', () => {
    const fast = parseNxtXml(nxtXml('01/10/2026', '05/11/2026', [['J00744', 'Kem F - H1 tuýp 30g', '020105', 'TUBE', 'L1', '2028-05-20', 600, 0, 0, 600]]))
    const web = parseWebTon([
      ['STT', 'Mã BFO', 'Tên sản phẩm', 'Số lô', 'Hạn dùng', 'Kho', 'Lượng nhập', 'Lượng xuất', 'Lượng tồn', 'ĐVT'],
      [1, 'A01706', 'Kem F - Hộp 1 tuýp 30g', 'L0', '20/05/28', '020105', 0, 8, -8, 'TUYP'],
      [2, 'A01840', 'Kem F - Hộp 1 tuýp 30g', 'L1', '20/05/28', '020105', 600, 26, 574, 'TUBE'],
    ])
    const g = soGroups(fast, web)
    expect(g.rep.get('A01706')).toBe(g.rep.get('A01840'))
    expect(g.pending[0].cands.map(c => c.ma)).toContain(g.rep.get('A01840'))
    const g2 = soGroups(fast, web, [[g.rep.get('A01840'), 'J00744']])
    const row = buildDtpCompare(remapFile(fast, g2.rep, g2.pool), web, g2.map).rows
    expect(row).toHaveLength(1)
    expect(row[0]).toMatchObject({ ss: 600, tt: 566, diff: -34 })
  })
})

describe('Bảng mã quy đổi Kho C (mã phụ → mã gốc)', () => {
  it('đọc file 2 cột Mã gốc / Mã phụ (nhiều mã phụ 1 ô); thêm cặp nối tiếp về đúng mã gốc; ra nhóm để gộp', async () => {
    const { parseMaGocRows } = await import('../duTruDtp')
    const { linkMaGoc, maGocGroups } = await import('../../data/duTruStore')
    expect(parseMaGocRows([['Mã phụ', 'Mã gốc'], ['J00690', 'Z00314'], ['J00745, J00746', 'K00140']])).toEqual([['J00690', 'Z00314'], ['J00745', 'K00140'], ['J00746', 'K00140']])
    let m = linkMaGoc({}, 'J00690', 'Z00314')
    m = linkMaGoc(m, 'W00001', 'J00690') // mã gốc khai là mã phụ → quy tiếp về Z00314
    expect(m).toEqual({ J00690: 'Z00314', W00001: 'Z00314' })
    expect(maGocGroups(m)).toEqual([['Z00314', 'J00690', 'W00001']])
  })
})
