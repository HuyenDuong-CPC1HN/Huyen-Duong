import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import PizZip from 'pizzip'
import { describe, expect, it } from 'vitest'
import fixtures from './fixtures/returnSlipPdfLines.json'
import {
  parseReturnSlipLines, slipReminders, nextMorning, missingSlipFields, slipLoai, sameCustomer, newSlipForm, THU_KHO,
} from '../returnSlips'
import { buildTraHangData, buildXacMinhData, renderDocx } from '../exportReturnSlip'

// fixtures/returnSlipPdfLines.json: các dòng chữ đọc từ 3 file PDF thật website in ra (bbth_1 = Mẫu CPC1HN,
// bbth_2 = Mẫu UPHARMA, bbth_noibo = Mẫu nội bộ), cùng cách gom dòng với extractPdfLines.
describe('parseReturnSlipLines — đọc biên bản website in ra', () => {
  it('Mẫu CPC1HN: khách đã nhận, Đơn C, đủ bên mua / bên bán / lý do / hàng hoá; MST bên mua đang để trống', () => {
    const r = parseReturnSlipLines(fixtures.bbth_1)
    expect(r.mau).toBe('CPC1HN')
    expect(r.benMua).toMatchObject({ ten: 'PHÒNG XÉT NGHIỆM CHUẨN ĐOÁN Y KHOA SỐ 9', diaChi: '9 Lê Đại Hành, Quận 11, Thành phố Hồ Chí Minh', mst: '', daiDien: 'Anh Thông', chucVu: '-Dược sĩ' })
    expect(r.benBan).toMatchObject({ mst: '0104089394-002', daiDien: 'Phương Thu', chucVu: 'Giám đốc chi nhánh' })
    expect(r.lyDo).toMatch(/^Họ muốn trả hàng lại để xuất hoá đơn ạ\..*mang hàng về nha ạ$/)
    expect(r.items).toEqual([{ stt: 1, ten: 'Tranfast', dvt: 'GOI', soLuong: 100, soLo: '', donGia: 29500, thanhTien: 2950000 }])
    expect(r.tongTien).toBe(2950000)
    expect(r.bangChu).toBe('Hai triệu chín trăm năm mươi nghìn đồng./.')
  })

  it('Mẫu UPHARMA: khách đã nhận, Đơn DTP', () => {
    const r = parseReturnSlipLines(fixtures.bbth_2)
    expect(r.mau).toBe('UPHARMA')
    expect(r.benBan).toMatchObject({ ten: 'CÔNG TY CỔ PHẦN UPHARMA', mst: '0109313177', daiDien: 'Bà Phương Thu', chucVu: 'Giám đốc' })
    expect(slipLoai({ pdf: r })).toBe('DTP')
  })

  it('Mẫu nội bộ: khách chưa nhận; Bên A/B để trống, Bên C là nhân viên kinh doanh; loại đơn theo mẫu xác minh kho chọn', () => {
    const r = parseReturnSlipLines(fixtures.bbth_noibo)
    expect(r.mau).toBe('NOIBO')
    expect(r.benA).toEqual({ daiDien: '', chucVu: '' })
    expect(r.benB).toEqual({ daiDien: '', chucVu: '' })
    expect(r.benC).toEqual({ daiDien: 'Nguyễn Hồng Nhung', chucVu: 'Nhân viên kinh doanh ETC' })
    expect(r.lyDo).toMatch(/^Bộ phận kinh doanh, kế toán và kho đã kiểm tra lại thông tin/)
    expect(r.items).toHaveLength(1)
    expect(slipLoai({ pdf: r, form: { xmMau: 'C' } })).toBe('C')
    expect(slipLoai({ pdf: r, form: { xmMau: 'U' } })).toBe('DTP')
  })

  it('đọc số lô nếu website có điền, tên hàng xuống dòng được nối lại', () => {
    const lines = [...fixtures.bbth_1]
    const row = lines.findIndex(l => /^1\s+Tranfast/.test(l))
    lines.splice(row, 1, '1 Salbutop 0,042% - Hộp 10 GOI 100 010126 29,500 2,950,000', 'ống 3ml (BFS-R)')
    const r = parseReturnSlipLines(lines)
    expect(r.items[0]).toMatchObject({ ten: 'Salbutop 0,042% - Hộp 10 ống 3ml (BFS-R)', dvt: 'GOI', soLuong: 100, soLo: '010126', donGia: 29500 })
  })

  it('file không phải biên bản trả lại hàng thì báo lỗi rõ ràng', () => {
    expect(() => parseReturnSlipLines(['PHIẾU XUẤT KHO', 'abc'])).toThrow(/Không nhận ra mẫu biên bản/)
  })
})

describe('slipReminders — nhắc việc theo 3 mốc', () => {
  const now = new Date('2026-09-30T08:00:00')
  const base = { id: 'x', maPhieu: 'DHC1', khachHang: 'A' }

  it('chờ duyệt quá 1 ngày thì nhắc; chưa quá 1 ngày hoặc đang "nhắc lại mai" thì không', () => {
    expect(slipReminders([{ ...base, stage: 'wait', createdAt: '2026-09-28T11:39:00' }], now)).toMatchObject([{ kind: 'wait', days: 1 }])
    expect(slipReminders([{ ...base, stage: 'wait', createdAt: '2026-09-29T11:39:00' }], now)).toEqual([])
    const snoozed = { ...base, stage: 'wait', createdAt: '2026-09-20T08:00:00', snoozeUntil: nextMorning(new Date('2026-09-30T07:00:00')) }
    expect(slipReminders([snoozed], now)).toEqual([])
    expect(slipReminders([snoozed], new Date('2026-10-01T08:00:00'))).toHaveLength(1)
  })

  it('đã duyệt mà chưa làm xong biên bản quá 1 ngày (kể cả đang điền dở) thì nhắc', () => {
    const list = slipReminders([
      { ...base, id: 'a', stage: 'todo', approvedAt: '2026-09-25T15:44:00' },
      { ...base, id: 'b', stage: 'doing', approvedAt: '2026-09-15T09:32:00' },
      { ...base, id: 'c', stage: 'todo', approvedAt: '2026-09-29T20:00:00' },
    ], now)
    expect(list.map(r => [r.slip.id, r.kind, r.days])).toEqual([['b', 'todo', 14], ['a', 'todo', 4]])
  })

  it('đã xuất mà chưa ký đủ quá 3 ngày thì nhắc; đã ký đủ thì không nhắc gì', () => {
    expect(slipReminders([{ ...base, stage: 'exported', exportedAt: '2026-09-26T08:00:00' }], now)).toMatchObject([{ kind: 'sign', days: 4 }])
    expect(slipReminders([{ ...base, stage: 'exported', exportedAt: '2026-09-28T08:00:00' }], now)).toEqual([])
    expect(slipReminders([{ ...base, stage: 'done', exportedAt: '2026-09-01T08:00:00' }], now)).toEqual([])
  })
})

describe('missingSlipFields / sameCustomer / newSlipForm', () => {
  it('liệt kê chỗ còn trống; mẫu nội bộ không cần MST bên mua', () => {
    const pdf = parseReturnSlipLines(fixtures.bbth_1)
    const form = newSlipForm(1, new Date(2026, 8, 30))
    expect(missingSlipFields({ pdf, form })).toEqual(['MST bên mua', 'số hoá đơn', 'ký hiệu', 'ngày hoá đơn', 'số lô', 'hạn dùng'])
    const noiBo = parseReturnSlipLines(fixtures.bbth_noibo)
    expect(missingSlipFields({ pdf: noiBo, form })).not.toContain('MST bên mua')
  })
  it('mặc định: Bên B là Thủ kho, 3 ô xác minh điền sẵn', () => {
    const form = newSlipForm(0)
    expect(form.benB).toBe(THU_KHO)
    expect(form.xmDiaDiem).toBe('CN.Hồ Chí Minh')
    expect(form.xmTinhTrang).toBe('Hàng nguyên vẹn')
    expect(form.xmKetQua).toBe('Kiểm tra hàng đúng lô, đúng hạn dùng, đúng số lượng.')
  })
  it('so tên khách không phân biệt dấu/hoa thường', () => {
    expect(sameCustomer('Phòng xét nghiệm chuẩn đoán y khoa Số 9', 'PHÒNG XÉT NGHIỆM CHUẨN ĐOÁN Y KHOA SỐ 9')).toBe(true)
    expect(sameCustomer('Phòng khám Bác sĩ Gia đình DOMED', 'PHÒNG XÉT NGHIỆM CHUẨN ĐOÁN Y KHOA SỐ 9')).toBe(false)
  })
})

const TEMPLATE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../public/templates')
function templateBuffer(name) {
  const buf = readFileSync(resolve(TEMPLATE_DIR, name))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}
function docText(bytes) {
  const xml = new PizZip(bytes).file('word/document.xml').asText()
  return xml.replace(/<w:tab\/>/g, '\t').replace(/<[^>]+>/g, '')
}

describe('Xuất bộ file Word', () => {
  const form = {
    ...newSlipForm(1, new Date(2026, 8, 30)),
    mst: '0312345678', soHD: '00001523', kyHieu: '1C26TPH', ngayHD: '2026-09-10',
    items: [{ soLo: '010924', hanDung: '2027-08-15', quyCach: 'Hộp 20 gói' }],
  }

  it('biên bản trả lại hàng mẫu CPC1HN: điền đủ phần website để trống, giữ nội dung website', () => {
    const slip = { khachHang: 'Phòng xét nghiệm chuẩn đoán y khoa Số 9', pdf: parseReturnSlipLines(fixtures.bbth_1), form }
    const text = docText(renderDocx(templateBuffer('BBTH_CPC1HN.docx'), buildTraHangData(slip), 'uint8array'))
    expect(text).toContain('Hôm nay, ngày 30 tháng 09 năm 2026')
    expect(text).toContain('BÊN MUA: PHÒNG XÉT NGHIỆM CHUẨN ĐOÁN Y KHOA SỐ 9')
    expect(text).toContain('Mã số thuế: 0312345678')
    expect(text).toContain('theo Hóa đơn 00001523')
    expect(text).toContain('có ký hiệu: 1C26TPH ngày 10 tháng 09 năm 2026')
    expect(text).toContain('Tranfast')
    expect(text).toContain('010924')
    expect(text).toContain('2,950,000 đ')
    expect(text).toContain('Trị giá hàng nhập lại trên sẽ được Công ty bù trừ công nợ')
    expect(text).not.toMatch(/[{}]/)
  })

  it('mẫu UPHARMA không có câu bù trừ công nợ; chỗ chưa điền giữ "…………"', () => {
    const slip = { pdf: parseReturnSlipLines(fixtures.bbth_2), form: { ...form, soHD: '', mst: '' } }
    const text = docText(renderDocx(templateBuffer('BBTH_UPHARMA.docx'), buildTraHangData(slip), 'uint8array'))
    expect(text).toContain('BÊN BÁN: CÔNG TY CỔ PHẦN UPHARMA')
    expect(text).toContain('theo Hóa đơn …………')
    expect(text).toContain('Mã số thuế: …………')
    expect(text).not.toContain('bù trừ công nợ')
  })

  it('mẫu nội bộ: Bên A kế toán đã chọn, Bên B Thủ kho, Bên C từ file website', () => {
    const slip = { pdf: parseReturnSlipLines(fixtures.bbth_noibo), form }
    const text = docText(renderDocx(templateBuffer('BBTH_NOIBO.docx'), buildTraHangData(slip), 'uint8array'))
    expect(text).toContain('BIÊN BẢN TRẢ LẠI HÀNG (NỘI BỘ)')
    expect(text).toContain(`Đại Diện: ${form.benA}`)
    expect(text).toContain(`Đại Diện: ${THU_KHO}`)
    expect(text).toContain('Đại Diện: Nguyễn Hồng Nhung')
    expect(text).toContain('Hóa đơn số 00001523')
    expect(text).not.toMatch(/[{}]/)
  })

  it('biên bản xác minh: dùng mẫu có sẵn, điền giờ, lô, hạn dùng, quy cách và 3 giá trị mặc định', () => {
    const slip = { khachHang: 'Phòng xét nghiệm chuẩn đoán y khoa Số 9', pdf: parseReturnSlipLines(fixtures.bbth_1), form }
    const text = docText(renderDocx(templateBuffer('BIEN_BAN_XAC_MINH_CPC1HN.docx'), buildXacMinhData(slip), 'uint8array'))
    expect(text).toContain('Hàng trả về của Phòng xét nghiệm chuẩn đoán y khoa Số 9')
    expect(text).toContain('Vào lúc 08h30’, ngày 30 tháng 09 năm 2026')
    expect(text).toContain('CN.Hồ Chí Minh')
    expect(text).toContain('15/08/2027')
    expect(text).toContain('Hộp 20 gói')
    expect(text).toContain('Hàng nguyên vẹn')
    expect(text).toContain('Kiểm tra hàng đúng lô, đúng hạn dùng, đúng số lượng.')
    expect(text).not.toMatch(/[{}]/)
  })
})
