import { describe, expect, it } from 'vitest'
import { batchMaHang, buildNguonReport, isNguonRow, mergeAiChunks, normLot, splitScanByBatch, parseQty, readSoPhieu, receivedRowsOf, reconcilePxk } from '../pxkReconcile'

const phieu = (soPhieu, rows) => ({ soPhieu, rows })

describe('Đối chiếu sổ sách (PXK)', () => {
  it('đọc số lượng kiểu phiếu và số phiếu', () => {
    expect(parseQty('3.380,000')).toBe(3380)
    expect(parseQty('154,000')).toBe(154)
    expect(parseQty('7.200,000')).toBe(7200)
    expect(parseQty('3380')).toBe(3380)
    expect(parseQty('')).toBe(null)
    expect(readSoPhieu('PHIẾU XUẤT KHO Ngày 09 tháng 10 năm 2026 Số: FX126/005804 Lý do DH091026/03802_Kho C')).toBe('FX126/005804')
  })

  it('thực nhận lấy SL thực tế đã sửa, Kho SO tách từ Kho C theo "(SO)"', () => {
    const batch = { khoC: [
      { maHang: 'F00629', tenHang: 'Falgankid', soLo: '13626G01', slHoaDon: 3380, slThucTe: null },
      { maHang: 'S00061', tenHang: 'Salbutamol (SO)', soLo: 'A1', slHoaDon: 10, slThucTe: 8 },
    ], khoLgt: [{ maHang: 'C02918', tenHang: 'Conadin', soLo: '011026', slHoaDon: 154 }] }
    expect(receivedRowsOf(batch, 'C').map(r => [r.maHang, r.soLuong])).toEqual([['F00629', 3380]])
    expect(receivedRowsOf(batch, 'SO').map(r => [r.maHang, r.soLuong])).toEqual([['S00061', 8]])
    expect(receivedRowsOf(batch, 'DTP').map(r => r.maHang)).toEqual(['C02918'])
  })

  it('kết luận: khớp, sổ sách thiếu / thừa, không có trên PXK, lệch lô, quét chưa khớp', () => {
    const received = [
      { maHang: 'F00629', tenHang: 'Falgankid', dvt: 'ONG', soLo: '13626G01', hanDung: '2029-07-12', soLuong: 3380 },
      { maHang: 'C02918', tenHang: 'Conadin', dvt: 'LO', soLo: '011026', hanDung: '2029-10-06', soLuong: 160 },
      { maHang: 'L01286', tenHang: 'Laforin', dvt: 'LO', soLo: '010826', hanDung: '2029-08-17', soLuong: 50 },
      { maHang: 'D01997', tenHang: 'Diasyl', dvt: 'VIEN', soLo: '020726', hanDung: '2029-07-25', soLuong: 7200 },
      { maHang: 'O00092', tenHang: 'Ondansetron', dvt: 'ONG', soLo: 'X1', hanDung: '', soLuong: 150 },
    ]
    const phieus = [
      phieu('XD2611/04592', [{ maHang: 'F00629', soLo: '13626G01', hanDung: '12/07/2029', soLuong: '3.380,000' }]),
      phieu('FX126/005804', [
        { maHang: 'C02918', soLo: '011026', hanDung: '2029-10-06', soLuong: 154 },
        { maHang: 'L01286', soLo: '010826', hanDung: '2029-08-17', soLuong: 56 },
        { maHang: 'D01997', soLo: '020727', hanDung: '2029-07-25', soLuong: 7200 },
        { maHang: 'M00219', soLo: 'B2', hanDung: '', soLuong: 200 },
      ]),
    ]
    const scanned = [{ maHang: 'F00629', soLo: '13626G01', soLuong: 3000 }, { maHang: 'F00629', soLo: '13626G01', soLuong: 380 }, { maHang: 'C02918', soLo: '011026', soLuong: 150 }]
    const rows = reconcilePxk({ received, scanned, phieus })
    const tags = Object.fromEntries(rows.map(r => [r.maHang, r.tags]))
    expect(tags.F00629).toEqual(['ok'])
    expect(tags.C02918).toEqual(['thieu', 'quet'])
    expect(tags.L01286).toEqual(['thua', 'quet'])
    expect(tags.D01997).toEqual(['lot', 'quet'])
    expect(tags.O00092).toEqual(['khongPxk', 'quet'])
    expect(tags.M00219).toEqual(['khongNhan'])
    expect(rows.find(r => r.maHang === 'D01997')).toMatchObject({ pLo: '020727', phieus: ['FX126/005804'] })
    expect(rows.filter(isNguonRow).map(r => r.maHang).sort()).toEqual(['C02918', 'D01997', 'L01286', 'M00219', 'O00092'])

    const text = buildNguonReport({ C: rows }, 'chuyến nhập 10/10/2026')
    expect(text).toContain('Kho C:')
    expect(text).toContain('  FX126/005804')
    expect(text).toContain('C02918 Conadin · lô 011026: phiếu 154, thực nhận 160 LO (thiếu phiếu 6)')
    expect(text).toContain('phiếu ghi lô 020727, thực tế lô 020726')
    expect(text).not.toContain('F00629')
  })

  it('chưa thả file quét thì không báo lệch quét', () => {
    const rows = reconcilePxk({ received: [{ maHang: 'A1234', soLo: 'L', soLuong: 5 }], scanned: null, phieus: [phieu('X', [{ maHang: 'A1234', soLo: 'L', soLuong: 5 }])] })
    expect(rows[0]).toMatchObject({ b: null, tags: ['ok'] })
    expect(buildNguonReport({ C: rows })).toBe('')
  })
})

describe('Đọc PDF Phiếu xuất kho mẫu CPC1 Hà Nội', () => {
  it('đọc đúng chữ trích từ PDF thật (tiêu đề cột và cột bị trộn thứ tự)', async () => {
    const { parseCpc1PxkPdf, readPxkPdfRows } = await import('../pxkReconcile')
    // Chữ trích từ file PHIẾU BỔ SUNG HCM (XD2611/04824) bằng extractPdfText
    const text = 'CÔNG TY CỔ PHẦN DƯỢC PHẨM CPC1 HÀ NỘI Ngày 19 tháng 10 năm 2026 PHIẾU XUẤT KHO Số phiếu: XD2611/04824 Đơn vị mua hàng Công ty Cổ phần UPHARMA '
      + 'XUẤT LOGICTICS - CN HỒ CHÍ MINH 19/10 Lý do xuất kho: Xuất tại kho (ngăn lô): 010108 Địa điểm: Nước SX Lô Hạn dùng Số lượng Đvt Tên vật tư Mã vật tư Stt '
      + 'A B C 2 3 4 1 D 1 Zensonid - Hộp 10 lọ x 2 ml (BFS-R) Z00338 LO 1.050,000 22926F01 CPC1HN-VNM 11/06/2028 2 3 4 5 6 7 8 9 10 '
      + 'Ngày........tháng........năm................ NGƯỜI LẬP THỦ KHO'
    expect(readSoPhieu(text)).toBe('XD2611/04824')
    expect(parseCpc1PxkPdf(text)).toEqual([{ maHang: 'Z00338', tenHang: 'Zensonid - Hộp 10 lọ x 2 ml (BFS-R)', dvt: 'LO', soLuong: 1050, soLo: '22926F01', hanDung: '2028-06-11' }])
    expect(readPxkPdfRows(text, () => [])).toHaveLength(1)

    // Nhiều dòng, chữ Nước SX bị ngắt "CPC1HN-VN M"
    const multi = 'Stt Mã vật tư Tên vật tư Đvt Số lượng Hạn dùng Lô Nước SX A B C D 2 3 4 1 '
      + '1 Falgankid 25 mg/ml - Hộp 4 vỉ x 5 ống 10ml W00520 ONG 60,000 CPC1HN-VN M 020126 12/01/2029 '
      + '2 Linezolid-SB - Túi 300ml L01289 TUI 1,000 CPC1HN-VN M 04926G01 15/01/2029 3 4 5 Số chứng từ gốc kèm theo: Ngày........tháng'
    expect(parseCpc1PxkPdf(multi).map(r => [r.maHang, r.tenHang, r.dvt, r.soLuong, r.soLo, r.hanDung])).toEqual([
      ['W00520', 'Falgankid 25 mg/ml - Hộp 4 vỉ x 5 ống 10ml', 'ONG', 60, '020126', '2029-01-12'],
      ['L01289', 'Linezolid-SB - Túi 300ml', 'TUI', 1, '04926G01', '2029-01-15'],
    ])
  })
})

describe('Đọc chữ từ ảnh phiếu (OCR)', () => {
  it('tách dòng hàng từ chữ đọc được của ảnh chụp thật, kể cả khi rơi dấu phẩy số lượng', async () => {
    const { parseOcrPxkText, parseOcrQty } = await import('../pxkReconcile')
    // Chữ đọc từ ảnh chụp phiếu DTP FX126/005804 và CPC1 XD2611/04592 (ảnh nghiêng, mất cột lô / HD)
    const dtp = 'Ngày 09 tháng 10 năm 2026 Số: FX126/005804\n'
      + '1 C02918 | Conadin Roll-on Strong - Hộp 1 DTP-VNM |LO 154,000 V |011026 v | 06/10/2029\n'
      + 'lọ 15ml Ñ w_—m mm\n'
      + '2 L01286 | Laforin - Hộp 1 lọ 500ml DITP-VNM  |LO 56000 vý |010826 | 17/08/2029\n'
      + '3 D01997 Diasyl Softcap - Lọ ó0 viên DTP-VNM VIEN 7.200,000 ý 020726 v | 25/07/2029\n'
    expect(parseOcrPxkText(dtp).map(r => [r.maHang, r.dvt, r.soLuong, r.soLo, r.hanDung])).toEqual([
      ['C02918', 'LO', 154, '011026', '2029-10-06'],
      ['L01286', 'LO', 56, '010826', '2029-08-17'],
      ['D01997', 'VIEN', 7200, '020726', '2029-07-25'],
    ])
    expect(parseOcrPxkText('] F00629 | Falgankid 25 mg/ml - Hộp 4 vi x CPCIHN-VNN | ONG 3.380,0')).toEqual([
      { maHang: 'F00629', tenHang: 'Falgankid 25 mg/ml - Hộp 4 vi x', dvt: 'ONG', soLuong: 3380, soLo: '', hanDung: '' },
    ])
    expect([parseOcrQty('3.380,000'), parseOcrQty('3380.000'), parseOcrQty('1.050,000'), parseOcrQty('56000'), parseOcrQty('7.200')]).toEqual([3380, 3380, 1050, 56, 7200])
  })
})

describe('Đọc chữ từ ảnh chụp nghiêng', () => {
  it('lô + hạn dùng rơi sang dòng trên vẫn ghép đúng vào dòng hàng', async () => {
    const { parseOcrPxkText } = await import('../pxkReconcile')
    // Chữ đọc thật (trình duyệt) từ ảnh phiếu XD2611/04592 chụp nghiêng
    const text = 'tại kho (ngăn lô): 010108 Địa điềm:\n¬ị cm lL.l- ở\n13626G01 12/07/2029\n'
      + '1 | F00629 |Falgankid25 mg/ml-Hộp4vix  |CPCIHN-VNK| ONG 3380000\nSốngl0ml MU |. MU mm ng\n'
    expect(parseOcrPxkText(text)).toEqual([{ maHang: 'F00629', tenHang: 'Falgankid25 mg/ml-Hộp4vix', dvt: 'ONG', soLuong: 3380, soLo: '13626G01', hanDung: '2029-07-12' }])
  })
})

describe('Sửa lô đọc từ ảnh bị dính dấu tick', () => {
  it('bỏ 1 ký tự đầu khi khớp đúng 1 lô thực nhận cùng mã', async () => {
    const { alignOcrLots, parseOcrPxkText } = await import('../pxkReconcile')
    const received = [{ maHang: 'L01286', soLo: '010826' }]
    expect(alignOcrLots([{ ocr: true, maHang: 'L01286', soLo: 'J010826' }], received)[0].soLo).toBe('010826')
    expect(alignOcrLots([{ ocr: true, maHang: 'L01286', soLo: '010827' }], received)[0].soLo).toBe('010827') // lệch thật giữ nguyên
    expect(parseOcrPxkText('1 C02918 Conadin Roll-on Strong - Hộp 1 DTP.VNM LO 154,000 011026 06/10/2029')[0].tenHang).toBe('Conadin Roll-on Strong - Hộp 1')
  })
})

describe('PDF scan nhiều trang', () => {
  it('mỗi trang 1 phiếu, trang trùng số phiếu giữ riêng để kho chọn, sửa mã đọc thiếu 1 số theo thực nhận', async () => {
    const { groupScanPages, alignOcrRows, soPhieuKey, pxkDuplicateGroups } = await import('../pxkReconcile')
    expect(soPhieuKey('XID2611/04759')).toBe(soPhieuKey('XD2611/04759'))
    const page = (so, line) => `PHIẾU XUẤT KHO Số phiếu: ${so}\n${line}`
    const { groups } = groupScanPages([
      page('XD2611/04789', '1 B02577 Bupi HOP 385 M51260802 31/07/2031'),
      page('XD2611/04759', '1 P0148 Paracetamol ONG 19.200,000 32226G03 13/07/2029'),
      'không đọc được số phiếu\n2 Q00145 Q ONG 1.350,000 010626 01/06/2029',
      page('XID2611/04759', '1 P01481 Paracetamol ONG 19.200,000 32226G03 13/07/2029'),
    ])
    expect(groups.map(g => [g.soPhieu, g.pages, g.rows.map(r => r.maHang)])).toEqual([
      ['XD2611/04789', [1], ['B02577']],
      ['XD2611/04759', [2, 3], ['P0148', 'Q00145']],
      ['XID2611/04759', [4], ['P01481']],
    ])
    const ph = groups.map((g, i) => ({ id: `p${i}`, soPhieu: g.soPhieu, kind: 'scan', rows: g.rows }))
    expect(pxkDuplicateGroups(ph).map(gr => gr.map(p => p.id))).toEqual([['p1', 'p2']])
    expect(pxkDuplicateGroups(ph.map(p => (p.id === 'p2' ? { ...p, excluded: true } : p)))).toEqual([])
    expect(pxkDuplicateGroups(ph.map(p => ({ ...p, keepDup: true })))).toEqual([])
    const fixed = alignOcrRows(groups[1].rows.map(r => ({ ...r, ocr: true })), [{ maHang: 'P01481', soLo: '32226G03' }, { maHang: 'Q00145', soLo: '010626' }])
    expect(fixed.map(r => r.maHang)).toEqual(['P01481', 'Q00145'])
  })
})

describe('Tách cột chữ đọc từ bản scan thật (file quét 12 trang)', () => {
  it('không lấy nhầm số trong tên hàng làm số lượng, bỏ dấu tick, sửa Đvt đọc nhầm', async () => {
    const { parseOcrPxkText } = await import('../pxkReconcile')
    const lines = [
      '] A01264 | Ambroxen - Hộp 4 vì x 5 ống CPCIEN-VNN LONG 4.800,000 010326 22/03/2029 —',
      '1 T02666 | Trinolon - Hộp 1 tuýp 5g CPCIBN-VNN|TUBE..|630000- 1219 |! 31/05/2029.',
      '1 M01121 | Máy tính cằm tay 12 số- CHIEC 80,000 202606',
      '6 K00672 Kim tiền thảo AGP 400 - Lọ 60 VNM VIEN 4.320,000 010626 05/06/2029 _',
    ].join('\n')
    expect(parseOcrPxkText(lines).map(r => [r.maHang, r.dvt, r.soLuong, r.soLo, r.hanDung])).toEqual([
      ['A01264', 'ONG', 4800, '010326', '2029-03-22'],
      ['T02666', 'TUYP', 630, '1219', '2029-05-31'],
      ['M01121', 'CHIEC', 80, '202606', ''],
      ['K00672', 'VIEN', 4320, '010626', '2029-06-05'],
    ])
  })
})

describe('Sửa lỗi đọc ảnh theo thực nhận (từ điển)', () => {
  it('sửa mã / lô / hạn dùng đọc nhầm kiểu ảnh, giữ lệch thật, ô không đọc được vẫn cần soát', async () => {
    const { alignOcrRows, ocrRowNeedsCheck } = await import('../pxkReconcile')
    const received = [
      { maHang: 'E00478', tenHang: 'B-Novo', dvt: 'VIEN', soLo: '010326', hanDung: '2029-03-02' },
      { maHang: 'N00928', tenHang: 'Nausazy', dvt: 'ONG', soLo: '02026I01', hanDung: '2028-09-04' },
      { maHang: 'G01184', tenHang: 'Gravia', dvt: 'VIEN', soLo: '010326', hanDung: '2029-03-30' },
    ]
    const [a, b, c, d] = alignOcrRows([
      { ocr: true, maHang: 'E0047', soLo: '010326', hanDung: '2029-03-02', soLuong: 1500 },
      { ocr: true, maHang: 'N00928', soLo: '02026101', hanDung: '2028-09-04', soLuong: 4800 },
      { ocr: true, maHang: 'G01184', soLo: '', hanDung: '2029-03-30', soLuong: 320 },
      { ocr: true, maHang: 'G01184', soLo: '010327', hanDung: '2029-03-30', soLuong: 320 },
    ], received)
    expect(a).toMatchObject({ maHang: 'E00478', tenHang: 'B-Novo', ocrFixed: { maHang: 'E0047' } })
    expect(b).toMatchObject({ soLo: '02026I01', ocrFixed: { soLo: '02026101' } })
    expect(c).toMatchObject({ soLo: '010326', ocrFixed: { soLo: '' } })
    expect(ocrRowNeedsCheck(c, [])).toBe(true) // lô không đọc được → vẫn soát
    expect(d.soLo).toBe('010327') // 6↔7 không phải lỗi đọc ảnh điển hình → giữ để báo lệch
  })
})

describe('mergeAiChunks — ghép kết quả AI đọc từng phần PDF scan', () => {
  const row = maHang => ({ maHang, soLuong: 1, soLo: 'L1' })
  it('đổi số trang về file gốc, nối trang tiếp của phiếu qua ranh giới 2 phần, gom trang của phần lỗi', () => {
    const chunks = [{ pages: [1, 2, 3, 4] }, { pages: [5, 6, 7, 8] }, { pages: [9, 10] }, { pages: [11] }]
    const r = mergeAiChunks(chunks, [
      { phieus: [{ soPhieu: 'X1', trang: [1, 2, 3], rows: [row('A00001')] }, { soPhieu: 'X2', trang: [4], rows: [row('A00002')] }] },
      { phieus: [{ soPhieu: '', trang: [1], rows: [row('A00003')] }, { soPhieu: 'X3', trang: [2, 3, 4], rows: [row('A00004')] }] },
      { error: 'quá tải' },
      { phieus: [{ soPhieu: '', trang: [1], rows: [row('A00005')] }] },
    ])
    expect(r.phieus.map(p => [p.soPhieu, p.trang, p.rows.map(x => x.maHang)])).toEqual([
      ['X1', [1, 2, 3], ['A00001']],
      ['X2', [4, 5], ['A00002', 'A00003']],
      ['X3', [6, 7, 8], ['A00004']],
      // phần trước lỗi → không nối bừa vào phiếu X3
      ['', [11], ['A00005']],
    ])
    expect(r.failedPages).toEqual([9, 10])
    expect(r.errors).toEqual(['quá tải'])
  })
})

describe('Lô có đuôi nội bộ (.SDKM, GMP)', () => {
  it('bỏ đuôi khi so lô — phần trước đuôi khớp là cùng lô, không báo lệch lô', () => {
    expect(['010126.SDKM', '010126 SDKM', '010126-GMP', '010126GMP', '010126.gmp', '010126'].map(normLot)).toEqual(Array(6).fill('010126'))
    expect(normLot('13626G01.SDKM')).toBe('13626G01')
    expect(normLot('010127.SDKM')).not.toBe(normLot('010126'))
    const rows = reconcilePxk({
      received: [{ maHang: 'A01324', tenHang: 'BFS-Adenosin', dvt: 'LO', soLo: '010126.SDKM', hanDung: '2029-01-17', soLuong: 180 }],
      scanned: [{ maHang: 'A01324', soLo: '010126', soLuong: 180 }],
      phieus: [{ soPhieu: 'XD2611/04792', rows: [{ maHang: 'A01324', soLo: '010126', hanDung: '17/01/2029', soLuong: 180 }] }],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ soLo: '010126.SDKM', pLo: '010126', a: 180, b: 180, c: 180, tags: ['ok'] })
    expect(buildNguonReport({ C: rows })).toBe('')
  })
})

describe('File quét: bỏ mã không có trong biên bản nhập hàng', () => {
  it('chỉ giữ dòng quét có mã trong biên bản (mọi kho của chuyến), báo lại các mã đã bỏ', () => {
    const batch = { khoC: [{ maHang: 'F00629' }], khoLgt: [{ maHang: 'c02918' }] }
    const ma = batchMaHang(batch)
    const r = splitScanByBatch([
      { maHang: 'F00629', soLo: 'A', soLuong: 1 }, { maHang: 'C02918', soLo: 'B', soLuong: 2 },
      { maHang: 'X99999', soLo: 'C', soLuong: 3 }, { maHang: 'X99999', soLo: 'D', soLuong: 4 }, { maHang: 'A00001', soLo: 'E', soLuong: 5 },
    ], ma)
    expect(r.kept.map(x => x.maHang)).toEqual(['F00629', 'C02918'])
    expect(r.dropped).toEqual(['A00001', 'X99999'])
    expect(splitScanByBatch([{ maHang: 'X99999' }], new Set()).kept).toHaveLength(1)
  })
})
