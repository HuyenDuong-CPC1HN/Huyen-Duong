import { describe, expect, it } from 'vitest'
import { LEARNING_PROGRAM } from '../../data/learningProgram'
import { gradeOf, gradebookText, moduleResult, normalizeProgress, overview, parseScore, phaseGpa, scheduleWeek } from '../learningProgress'

const mod = LEARNING_PROGRAM.find(m => m.code === 'PDA101')
const noExam = LEARNING_PROGRAM.find(m => m.code === 'PDA105')
const scored = (codes, diem) => Object.fromEntries(codes.map(c => [c, { hoc: true, nop: true, diem }]))

describe('Lộ trình học — chương trình', () => {
  it('14 học phần, mã bài không trùng, đủ 60 tuần', () => {
    expect(LEARNING_PROGRAM).toHaveLength(14)
    const codes = LEARNING_PROGRAM.flatMap(m => m.tasks.map(t => t.code))
    expect(new Set(codes).size).toBe(codes.length)
    expect(LEARNING_PROGRAM.at(-1).tasks.at(-1).week).toBe('60')
    expect(LEARNING_PROGRAM.filter(m => !m.hasExam).map(m => m.code)).toEqual(['PDA105', 'PDS204', 'PDS205'])
  })
})

describe('Lộ trình học — chấm điểm và tiến độ', () => {
  it('điểm gõ tay kiểu Việt Nam, ngoài 0–10 thì bỏ', () => {
    expect(parseScore('8,5')).toBe(8.5)
    expect(parseScore('9')).toBe(9)
    expect(parseScore('11')).toBeNull()
    expect(parseScore('')).toBeNull()
    expect(parseScore('abc')).toBeNull()
  })

  it('xếp loại theo quy chế', () => {
    expect([9.2, 8, 7, 6.9, 4].map(x => gradeOf(x).label)).toEqual(['Xuất sắc', 'Giỏi', 'Khá', 'Trung bình', 'Yếu'])
    expect(gradeOf(6.99).pass).toBe(false)
  })

  it('điểm học phần = 0,4 bài tập + 0,2 kiểm tra + 0,4 dự án; chỉ tính khi đủ điểm', () => {
    const tasks = scored(mod.tasks.map(t => t.code), 8)
    let p = normalizeProgress({ tasks, modules: { PDA101: { duAn: 9 } } })
    let r = moduleResult(mod, p)
    expect(r.diem).toBeNull()
    expect(r.missing).toEqual(['điểm kiểm tra'])
    expect(r.status).toBe('dangHoc')
    p = normalizeProgress({ tasks, modules: { PDA101: { duAn: 9, kiemTra: 7 } } })
    r = moduleResult(mod, p)
    expect(r.diem).toBe(8.2) // 0,4×8 + 0,2×7 + 0,4×9
    expect(r).toMatchObject({ status: 'dat', grade: { label: 'Giỏi' }, done: 4, total: 4 })
  })

  it('học phần không có kiểm tra riêng: phần kiểm tra lấy bằng điểm dự án', () => {
    const p = normalizeProgress({ tasks: scored(noExam.tasks.map(t => t.code), 6), modules: { PDA105: { duAn: 8 } } })
    expect(moduleResult(noExam, p).diem).toBe(7.2) // 0,4×6 + 0,6×8
  })

  it('dưới 7,0 là chưa đạt; GPA giai đoạn theo trọng số thời lượng', () => {
    const sql = LEARNING_PROGRAM.find(m => m.code === 'PDA102')
    const p = normalizeProgress({
      tasks: { ...scored(mod.tasks.map(t => t.code), 8), ...scored(sql.tasks.map(t => t.code), 6) },
      modules: { PDA101: { kiemTra: 8, duAn: 8 }, PDA102: { kiemTra: 6, duAn: 6 } },
    })
    expect(moduleResult(sql, p).status).toBe('chuaDat')
    expect(phaseGpa(LEARNING_PROGRAM, p, 1)).toBe(7) // 2 học phần cùng 30 giờ
    expect(phaseGpa(LEARNING_PROGRAM, p, 2)).toBeNull()
  })

  it('tiến độ: bài xong = đã học + đã nộp; tuần đang học là bài đầu tiên chưa xong', () => {
    const p = normalizeProgress({ tasks: { 'BT-101.1': { hoc: true, nop: true }, 'BT-101.2': { hoc: true } } })
    const ov = overview(LEARNING_PROGRAM, p)
    expect(ov).toMatchObject({ done: 1, total: 58, currentWeek: 2, nextTask: { code: 'BT-101.2' } })
    expect(ov.percent).toBe(2)
  })

  it('tuần theo lịch tính từ ngày nhập học', () => {
    expect(scheduleWeek('2026-10-26', new Date(2026, 9, 26))).toBe(1)
    expect(scheduleWeek('2026-10-26', new Date(2026, 10, 2))).toBe(2)
    expect(scheduleWeek('2026-10-26', new Date(2026, 9, 20))).toBe(0)
    expect(scheduleWeek('', new Date())).toBeNull()
  })

  it('sổ điểm dạng chữ để dán cho giảng viên', () => {
    const p = normalizeProgress({ startDate: '2026-10-26', tasks: { 'BT-101.1': { hoc: true, nop: true, diem: 8.5 } } })
    const t = gradebookText(LEARNING_PROGRAM, p, new Date(2026, 10, 2))
    expect(t).toContain('Ngày nhập học: 2026-10-26')
    expect(t).toContain('PDA101 Excel nâng cao & Power Query cho dữ liệu dược: đang học, 1/4 bài')
    expect(t).toContain('BT-101.1: 8,5')
    expect(t).not.toContain('PDA102')
  })
})

describe('Giáo án đã soạn', () => {
  it('mỗi giáo án gắn đúng mã bài có trong chương trình, đủ phần, thang chấm 10 điểm, nguồn có thật trong danh mục', async () => {
    const { LESSONS, SOURCES, LEARN_LINKS } = await import('../../data/lessons')
    const codes = new Set(LEARNING_PROGRAM.flatMap(m => m.tasks.map(t => t.code)))
    expect(Object.keys(LESSONS)).toEqual(['BT-101.1', 'BT-101.2', 'BT-101.3', 'BT-101.4'])
    for (const [code, l] of Object.entries(LESSONS)) {
      expect(codes.has(code)).toBe(true)
      expect(l.objectives.length).toBeGreaterThan(2)
      expect(l.selfCheck.length).toBeGreaterThan(2)
      expect(l.assignment.rubric.reduce((s, r) => s + r[1], 0)).toBe(10)
      expect(l.assignment.file.url).toMatch(/^\/hoc-tap\/PDA101\//)
      for (const k of [...l.sources, ...l.business.sources]) expect(SOURCES[k]?.url).toMatch(/^https:\/\//)
      for (const k of l.learn) expect(LEARN_LINKS[k]?.url).toMatch(/^https:\/\//)
    }
  })
  it('file dữ liệu bài tập có trong thư mục public', async () => {
    const fs = await import('node:fs')
    const { LESSONS } = await import('../../data/lessons')
    for (const l of Object.values(LESSONS)) expect(fs.existsSync(`public${decodeURI(l.assignment.file.url)}`)).toBe(true)
  })
})
