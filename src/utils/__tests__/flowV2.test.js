import { describe, expect, it } from 'vitest'
import {
  advanceBatch, advanceCase, applyKtDone, backBatch, backCase, batchAsHuyPhieu, caseAsReturnSlip, dissolveBatch, ktLinkUrl, ktPending,
  ktQueue, makeBatch, newCase, newItem, newKtToken, newPsEntry, nextBatchNo, parseDateText, stepIndex, stepOfCase,
} from '../flowV2'

const now = new Date('2026-10-14T08:00:00')
const st = (over = {}) => ({ cases: [], pool: [], batches: [], ...over })
const goTo = (state, id, k) => {
  let s = state
  while (stepOfCase(s.cases.find(c => c.id === id)).k !== k) s = { ...s, ...advanceCase(s, id, {}, now) }
  return s
}

describe('Hàng trả & huỷ — hồ sơ khách trả', () => {
  it('hàng nguyên vẹn: tình trạng mặc định "Hàng nguyên vẹn"; bước kế toán ghi người xác nhận, xong sang Hoàn thành', () => {
    const c = newCase({ kind: 'tra', sub: 'daNhan', kho: 'DTP', items: [newItem({ maHang: 'Z00330', tenHang: 'Zensalbu', soLuong: 13 })] }, now)
    expect(c.items[0].tinhTrang).toBe('Hàng nguyên vẹn')
    let s = goTo(st({ cases: [c] }), c.id, 'ktNhap')
    s = { ...s, ...advanceCase(s, c.id, { ktBy: 'Lưu Thị Thuỳ' }, now) }
    const done = s.cases[0]
    expect(stepOfCase(done).k).toBe('banTiep')
    expect(done.ktDone.by).toBe('Lưu Thị Thuỳ')
    expect(s.pool).toHaveLength(0)
  })

  it('hàng lỗi: xong bước đổi hàng thì tự vào Chờ huỷ đúng kho; lùi lại thì rút khỏi Chờ huỷ', () => {
    const c = { ...newCase({ kind: 'loi', kho: 'C', khachHang: 'Nhà thuốc Linh Hà', items: [newItem({ maHang: 'A00977', tenHang: 'Actiso', soLuong: 2 })] }, now), loiLyDo: 'Gãy ống' }
    let s = goTo(st({ cases: [c] }), c.id, 'choHuy')
    expect(s.pool).toHaveLength(1)
    expect(s.pool[0]).toMatchObject({ kho: 'C', src: 'loi', caseId: c.id, who: 'Nhà thuốc Linh Hà' })
    s = { ...s, ...backCase(s, c.id, now) }
    expect(stepOfCase(s.cases[0]).k).toBe('doiHang')
    expect(s.pool).toHaveLength(0)
  })
})

describe('Hàng trả & huỷ — Chờ huỷ và đợt huỷ', () => {
  const loiCase = () => newCase({ kind: 'loi', kho: 'C', khachHang: 'PK An Bình', items: [newItem({ maHang: 'A01264', tenHang: 'Ambroxen', soLuong: 5, tinhTrang: 'Có cặn' })] }, now)

  it('gom hàng lỗi khách trả + hàng phát sinh cùng kho vào 1 đợt; hàng kho khác không lọt vào', () => {
    const c = loiCase()
    let s = goTo(st({ cases: [c] }), c.id, 'choHuy')
    const ps = newPsEntry({ kho: 'C', loai: 'Hàng cận date', items: [{ maHang: 'B01767', tenHang: 'Bupi', soLuong: 670 }, { maHang: '', tenHang: '' }] }, now)
    const psDtp = newPsEntry({ kho: 'DTP', items: [{ maHang: 'Z00330', tenHang: 'Zensalbu', soLuong: 20 }] }, now)
    expect(ps.items).toHaveLength(1) // dòng trống bị bỏ
    expect(ps.items[0].tinhTrang).toBe('Hàng cận date')
    s = { ...s, pool: [ps, psDtp, ...s.pool] }
    const r = makeBatch(s, 'C', s.pool.map(e => e.id), now)
    s = { ...s, ...r }
    expect(s.batches).toHaveLength(1)
    expect(s.batches[0].no).toBe('ĐH-C-1026-01')
    expect(s.batches[0].items.map(it => it.maHang)).toEqual(['B01767', 'A01264'])
    expect(s.pool.map(e => e.kho)).toEqual(['DTP'])
    expect(stepOfCase(s.cases[0]).k).toBe('dangHuy')
    expect(s.cases[0].batchId).toBe(r.batchId)
  })

  it('đợt xong thì mọi hồ sơ hàng lỗi trong đợt sang Huỷ xong; lùi đợt thì hồ sơ về Đang huỷ', () => {
    const c = loiCase()
    let s = goTo(st({ cases: [c] }), c.id, 'choHuy')
    s = { ...s, ...makeBatch(s, 'C', [s.pool[0].id], now) }
    const id = s.batches[0].id
    s = { ...s, ...advanceBatch(s, id, {}, now) } // → ký
    s = { ...s, ...advanceBatch(s, id, {}, now) } // → kế toán
    expect(ktPending(s, 'Lưu Thị Thuỳ').batches).toHaveLength(1)
    s = { ...s, ...advanceBatch(s, id, { ktBy: 'Lưu Thị Thuỳ' }, now) }
    expect(s.batches[0].ktDone.by).toBe('Lưu Thị Thuỳ')
    expect(stepOfCase(s.cases[0]).k).toBe('xong')
    s = { ...s, ...backBatch(s, id, now) }
    expect(stepOfCase(s.cases[0]).k).toBe('dangHuy')
    expect(s.batches[0].ktDone).toBeNull()
  })

  it('huỷ đợt khi còn lập biên bản: các mục về lại Chờ huỷ, hồ sơ về Chờ huỷ', () => {
    const c = loiCase()
    let s = goTo(st({ cases: [c] }), c.id, 'choHuy')
    s = { ...s, ...makeBatch(s, 'C', [s.pool[0].id], now) }
    s = { ...s, ...dissolveBatch(s, s.batches[0].id, now) }
    expect(s.batches).toHaveLength(0)
    expect(s.pool).toHaveLength(1)
    expect(s.cases[0].step).toBe(stepIndex('loi', 'choHuy'))
  })

  it('số đợt tăng dần trong tháng theo từng kho', () => {
    expect(nextBatchNo([{ no: 'ĐH-C-1026-01' }, { no: 'ĐH-C-1026-03' }, { no: 'ĐH-DTP-1026-07' }], 'C', now)).toBe('ĐH-C-1026-04')
    expect(nextBatchNo([], 'DTP', now)).toBe('ĐH-DTP-1026-01')
  })
})

describe('Hàng trả & huỷ — dựng dữ liệu cho mẫu biên bản cũ', () => {
  it('đợt huỷ → phiếu cho HangHuyPapers: thực huỷ = số lượng', () => {
    const p = batchAsHuyPhieu({ kho: 'DTP', no: 'ĐH-DTP-1026-01', khoXuat: '020105', form: { soBB: '3' }, items: [{ maHang: 'X', soLuong: 4 }] })
    expect(p).toMatchObject({ kho: 'DTP', soPhieu: 'ĐH-DTP-1026-01', khoXuat: '020105', items: [{ maHang: 'X', thucHuy: 4 }] })
  })
  it('hồ sơ → slip cho BB xác minh của tab Nhập trả lại: đúng mẫu theo kho', () => {
    const c = newCase({ kind: 'tra', kho: 'DTP', khachHang: 'NT A', items: [newItem({ tenHang: 'Zensalbu', soLo: 'L1', soLuong: 3, dvt: 'ONG' })] }, now)
    const slip = caseAsReturnSlip(c)
    expect(slip.pdf.mau).toBe('UPHARMA')
    expect(slip.pdf.items[0]).toEqual({ ten: 'Zensalbu', dvt: 'ONG', soLuong: 3 })
    expect(slip.form.items[0]).toMatchObject({ soLo: 'L1', tinhTrang: 'Hàng nguyên vẹn' })
  })
  it('đọc ngày dạng chữ', () => {
    expect(parseDateText('22/08/2029')).toBe('2029-08-22')
    expect(parseDateText('22.08.29')).toBe('2029-08-22')
    expect(parseDateText('31/02/2029')).toBeNull()
  })
})

describe('Hàng trả & huỷ — Biên bản trả lại hàng của hồ sơ khách từ chối nhận', () => {
  it('mặc định mẫu nội bộ, lý do mặc định, dòng hàng + thành tiền lấy từ hồ sơ; mẫu xác minh theo kho', async () => {
    const { caseReturnSlip } = await import('../flowV2')
    const c = newCase({ kind: 'tra', sub: 'tuChoi', kho: 'DTP', khachHang: 'BV A', items: [newItem({ tenHang: 'Zencombi', dvt: 'ONG', soLuong: 100, donGia: 12000, soLo: '010226' }), newItem()] }, now)
    const slip = caseReturnSlip(c)
    expect(slip.pdf.mau).toBe('NOIBO')
    expect(slip.pdf.lyDo).toMatch(/phát hiện sai sót/)
    expect(slip.pdf.items).toHaveLength(1) // dòng trống bị bỏ
    expect(slip.pdf.tongTien).toBe(1200000)
    expect(slip.form).toMatchObject({ benA: 'Lưu Thị Thuỳ', benB: 'Dương Thị Ngọc Huyền', xmMau: 'U' })
    expect(newCase({ kind: 'tra', sub: 'daNhan' }, now).traHang).toBeUndefined()
  })
})

describe('Hàng trả & huỷ — bỏ bước Tiếp nhận', () => {
  it('hồ sơ mới vào thẳng Lập BB xác minh; hồ sơ lưu từ bản cũ lùi chỉ số bước cho khớp', async () => {
    const { migrateCase } = await import('../flowV2')
    const c = newCase({ kind: 'loi', kho: 'C' })
    expect(stepOfCase(c).k).toBe('xmNhap')
    expect(migrateCase(c)).toBe(c)
    const old = { ...c, flowVer: undefined }
    expect(migrateCase({ ...old, step: 0 })).toMatchObject({ step: 0, flowVer: 2 }) // đang Tiếp nhận → Lập BB xác minh
    expect(stepOfCase(migrateCase({ ...old, step: 3 })).k).toBe('phieuNhap') // bản cũ: 3 = Nhập lại kho
  })
})

describe('Hàng trả & huỷ — cột Hoàn thành theo tháng', () => {
  it('lấy tháng hoàn thành từ lúc vào bước cuối, danh sách tháng luôn có tháng hiện tại', async () => {
    const { CASE_FLOWS, doneMonth, doneMonthOptions, fmtMonthVi } = await import('../flowV2')
    const c = newCase({ kind: 'tra', sub: 'daNhan', kho: 'C' })
    const done = { ...c, step: CASE_FLOWS.tra.steps.length - 1, stepAt: new Date(2026, 8, 20, 10).toISOString() }
    expect(doneMonth(c)).toBe('')
    expect(doneMonth(done)).toBe('2026-09')
    expect(doneMonthOptions([c, done], new Date(2026, 9, 15))).toEqual(['2026-10', '2026-09'])
    expect(fmtMonthVi('2026-09')).toBe('Tháng 9/2026')
  })
})

describe('Hàng trả & huỷ — link kế toán', () => {
  const traAtKt = (keToan = 'Trần Thị Ái Lâm') => {
    const c = { ...newCase({ kind: 'tra', sub: 'daNhan', kho: 'DTP', khachHang: 'Nhà thuốc Hải Phong', soDon: 'DU262/058586', items: [newItem({ maHang: 'TH0089', tenHang: 'Tobrameson', soLo: '021025', hanDung: '2027-10-19', soLuong: 20, dvt: 'LO' }), newItem()] }, now), keToan }
    return goTo(st({ cases: [c] }), c.id, 'ktNhap')
  }

  it('hàng đợi chỉ gồm việc đang ở bước kế toán, dòng hàng rút gọn, bỏ dòng trống', () => {
    const s = traAtKt()
    const other = newCase({ kind: 'tra', sub: 'daNhan', khachHang: 'Chưa tới kế toán' }, now)
    const q = ktQueue({ ...s, cases: [...s.cases, other] })
    expect(q).toHaveLength(1)
    expect(q[0]).toMatchObject({ kind: 'case', id: s.cases[0].id, keToan: 'Trần Thị Ái Lâm', kho: 'DTP', khachHang: 'Nhà thuốc Hải Phong', so: 'DU262/058586', viec: 'Nhập trả lại (phiếu nhập + hoá đơn)' })
    expect(q[0].items).toEqual([{ maHang: 'TH0089', tenHang: 'Tobrameson', soLo: '021025', hanDung: '2027-10-19', soLuong: 20, dvt: 'LO' }])
  })

  it('đợt huỷ ở bước kế toán cũng vào hàng đợi', () => {
    const c = newCase({ kind: 'loi', kho: 'C', khachHang: 'PK An Bình', items: [newItem({ maHang: 'A01264', tenHang: 'Ambroxen', soLuong: 5 })] }, now)
    let s = goTo(st({ cases: [c] }), c.id, 'choHuy')
    s = { ...s, ...makeBatch(s, 'C', [s.pool[0].id], now) }
    const id = s.batches[0].id
    s = { ...s, ...advanceBatch(s, id, {}, now) }
    s = { ...s, ...advanceBatch(s, id, {}, now) }
    expect(ktQueue(s)).toEqual([expect.objectContaining({ kind: 'batch', id, so: 'ĐH-C-1026-01', viec: 'Xuất huỷ khỏi phần mềm' })])
  })

  it('áp "Đã xong": hồ sơ sang bước kế, ghi tên kế toán + giờ bấm; việc đã xong / không còn ở bước kế toán thì bỏ qua', () => {
    const s = traAtKt()
    const id = s.cases[0].id
    const at = '2026-10-23T09:15:00.000Z'
    const r = applyKtDone(s, [{ kind: 'case', id, by: 'Trần Thị Ái Lâm', at }, { kind: 'case', id: 'khong_co', by: 'X', at }])
    expect(stepOfCase(r.cases[0]).k).toBe('banTiep')
    expect(r.cases[0].ktDone).toEqual({ by: 'Trần Thị Ái Lâm (bấm trên link kế toán)', at })
    expect(r.applied).toEqual([expect.objectContaining({ id, label: 'Nhà thuốc Hải Phong' })])
    const again = applyKtDone(r, [{ kind: 'case', id, by: 'Trần Thị Ái Lâm', at }])
    expect(again.applied).toEqual([])
    expect(again.cases).toBe(r.cases)
  })

  it('mã link ngẫu nhiên 32 ký tự base64url, mỗi lần khác nhau; link dạng #ketoan=', () => {
    const a = newKtToken(), b = newKtToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(a).not.toBe(b)
    expect(ktLinkUrl(a, 'https://app.vn')).toBe(`https://app.vn/#ketoan=${a}`)
  })
})
