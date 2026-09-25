import { describe, expect, it } from 'vitest'
import { buildDonSanNarrative } from '../tongDonNarrative'

function makeWeek(overrides = {}) {
  return { totalTMDT: 1000, spxC: null, totalNgoaiSan: 0, ...overrides }
}

describe('buildDonSanNarrative — tổng "Đơn ngoại sàn" phải lấy đúng totalNgoaiSan, không được rơi về 0 khi spxC thiếu', () => {
  // Bug thật: tuần trước không còn ghép được file đối soát chi tiết SPX (spxC null, vd tuần đó bị xoá/
  // pruning) nhưng đơn ngoại sàn của tuần đó KHÔNG hề mất — ngoaiSanCount đã lưu chắc chắn cùng báo cáo
  // Đơn SO tuần đó (qua totalNgoaiSan). Trước fix, ngoaiSanCurTotal/ngoaiSanPrevTotal + donSanTotalCur/Prev
  // đều rơi về 0 sai (dựa thẳng vào spxC.total), khiến người dùng tưởng nhầm mất dữ liệu.
  it('tuần trước spxC null nhưng totalNgoaiSan > 0 -> ngoaiSanPrevTotal và donSanTotalPrev lấy đúng, không về 0', () => {
    const current = makeWeek({ totalTMDT: 1560, spxC: { total: 582, stats: { dangVanChuyen: 150 } }, totalNgoaiSan: 582 })
    const previous = makeWeek({ totalTMDT: 1996, spxC: null, totalNgoaiSan: 582 })

    const narrative = buildDonSanNarrative(current, previous, null)

    expect(narrative.ngoaiSanCurTotal).toBe(582)
    expect(narrative.ngoaiSanPrevTotal).toBe(582)
    expect(narrative.donSanTotalCur).toBe(1560 + 582)
    expect(narrative.donSanTotalPrev).toBe(1996 + 582)
  })

  it('không có totalNgoaiSan (nguồn cũ/legacy) -> vẫn lấy fallback từ spxC.total như trước', () => {
    const current = { totalTMDT: 1000, spxC: { total: 300, stats: { dangVanChuyen: 50 } } }
    const previous = { totalTMDT: 900, spxC: { total: 250, stats: { dangVanChuyen: 40 } } }

    const narrative = buildDonSanNarrative(current, previous, null)

    expect(narrative.ngoaiSanCurTotal).toBe(300)
    expect(narrative.ngoaiSanPrevTotal).toBe(250)
  })
})
