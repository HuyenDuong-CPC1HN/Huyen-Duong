// Tính điểm, xếp loại và tiến độ cho tab "Lộ trình học" theo quy chế trong chương trình đào tạo:
// Điểm học phần = 0,4 × trung bình bài tập + 0,2 × kiểm tra + 0,4 × dự án (học phần không có kiểm tra riêng thì phần
// kiểm tra lấy bằng điểm dự án). Đạt khi ≥ 7,0.
export const LEARNING_STORE_KEY = 'hoc_tap_lo_trinh'
export const PASS_SCORE = 7

// Dữ liệu lưu: { startDate: 'yyyy-mm-dd', tasks: { [mã bài]: { hoc, nop, diem, note } }, modules: { [mã HP]: { kiemTra, duAn } } }
export const emptyProgress = () => ({ startDate: '', tasks: {}, modules: {} })

export function normalizeProgress(v) {
  const p = v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  return {
    startDate: typeof p.startDate === 'string' ? p.startDate : '',
    tasks: p.tasks && typeof p.tasks === 'object' ? p.tasks : {},
    modules: p.modules && typeof p.modules === 'object' ? p.modules : {},
  }
}

// Điểm gõ tay: "8,5" / "8.5" / "9" → số 0–10; trống hoặc sai → null.
export function parseScore(text) {
  const t = String(text ?? '').trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 && n <= 10 ? Math.round(n * 100) / 100 : null
}

export const fmtScore = n => (n === null || n === undefined ? '—' : n.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 2 }))

export function gradeOf(score) {
  if (score === null || score === undefined) return null
  if (score >= 9) return { label: 'Xuất sắc', pass: true }
  if (score >= 8) return { label: 'Giỏi', pass: true }
  if (score >= 7) return { label: 'Khá', pass: true }
  if (score >= 5) return { label: 'Trung bình', pass: false }
  return { label: 'Yếu', pass: false }
}

const isNum = v => typeof v === 'number' && Number.isFinite(v)
export const taskDone = t => Boolean(t?.hoc && t?.nop)

// Kết quả 1 học phần: trung bình bài tập (chỉ bài đã có điểm), điểm kiểm tra, dự án, điểm học phần (chỉ tính khi đủ
// điểm mọi bài tập + kiểm tra + dự án), xếp loại, trạng thái.
export function moduleResult(mod, progress) {
  const tasks = mod.tasks.map(t => progress.tasks[t.code] || {})
  const scores = tasks.map(t => t.diem).filter(isNum)
  const baiTap = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null
  const m = progress.modules[mod.code] || {}
  const duAn = isNum(m.duAn) ? m.duAn : null
  const kiemTra = mod.hasExam ? (isNum(m.kiemTra) ? m.kiemTra : null) : duAn
  const complete = scores.length === mod.tasks.length && baiTap !== null && kiemTra !== null && duAn !== null
  const diem = complete ? Math.round((0.4 * baiTap + 0.2 * kiemTra + 0.4 * duAn) * 100) / 100 : null
  const done = tasks.filter(taskDone).length
  const started = done > 0 || tasks.some(t => t.hoc || t.nop || isNum(t.diem)) || duAn !== null || isNum(m.kiemTra)
  const missing = []
  if (scores.length < mod.tasks.length) missing.push(`${mod.tasks.length - scores.length} bài tập chưa có điểm`)
  if (mod.hasExam && kiemTra === null) missing.push('điểm kiểm tra')
  if (duAn === null) missing.push('điểm dự án')
  const grade = gradeOf(diem)
  const status = diem !== null ? (grade.pass ? 'dat' : 'chuaDat') : started ? 'dangHoc' : 'chuaHoc'
  return { baiTap, kiemTra, duAn, diem, grade, done, total: mod.tasks.length, status, missing }
}

// Điểm trung bình tích luỹ của 1 giai đoạn: trung bình các học phần đã có điểm, trọng số theo thời lượng (số giờ).
export function phaseGpa(program, progress, phase) {
  let sum = 0
  let w = 0
  for (const mod of program.filter(m => m.phase === phase)) {
    const r = moduleResult(mod, progress)
    if (r.diem === null) continue
    sum += r.diem * mod.hours
    w += mod.hours
  }
  return w ? Math.round((sum / w) * 100) / 100 : null
}

// Số tuần học (1, 2, …) tính từ ngày nhập học đến hôm nay; chưa tới ngày nhập học → 0; chưa nhập ngày → null.
export function scheduleWeek(startDate, today = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate || '')
  if (!m) return null
  const start = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const days = Math.round((t - start) / 86400000)
  return days < 0 ? 0 : Math.floor(days / 7) + 1
}

// Tuần bắt đầu của 1 bài ("13" → 13, "55–56" → 55).
export const weekStart = w => Number(String(w).split(/[–-]/)[0]) || 0

// Tổng quan: số bài xong / tổng, %, tuần đang học (bài đầu tiên chưa xong), số học phần đạt.
export function overview(program, progress) {
  const all = program.flatMap(m => m.tasks)
  const done = all.filter(t => taskDone(progress.tasks[t.code])).length
  const next = all.find(t => !taskDone(progress.tasks[t.code]))
  const results = program.map(m => moduleResult(m, progress))
  return {
    done, total: all.length, percent: all.length ? Math.round((done / all.length) * 100) : 0,
    currentWeek: next ? weekStart(next.week) : weekStart(all[all.length - 1].week) + 1,
    nextTask: next || null,
    passed: results.filter(r => r.status === 'dat').length,
    modules: program.length,
  }
}

// Sổ điểm dạng chữ để dán vào cuộc trò chuyện mới với giảng viên AI (AI không tự nhớ giữa các cuộc trò chuyện).
export function gradebookText(program, progress, today = new Date()) {
  const ov = overview(program, progress)
  const lines = [
    'SỔ ĐIỂM – Chương trình Dược sĩ phân tích dữ liệu',
    `Ngày nhập học: ${progress.startDate || 'chưa nhập'} · Hôm nay: ${today.toLocaleDateString('vi-VN')}`,
    `Tiến độ: ${ov.done}/${ov.total} bài (${ov.percent}%) · Đang học tuần ${ov.currentWeek}${ov.nextTask ? ` – bài tiếp theo ${ov.nextTask.code}` : ''}`,
  ]
  for (const phase of [1, 2]) {
    const gpa = phaseGpa(program, progress, phase)
    lines.push('', `GIAI ĐOẠN ${phase} (${phase === 1 ? 'Data Analyst' : 'Data Scientist'}) · Điểm TB tích luỹ: ${fmtScore(gpa)}`)
    for (const mod of program.filter(m => m.phase === phase)) {
      const r = moduleResult(mod, progress)
      if (r.status === 'chuaHoc') continue
      const graded = mod.tasks.filter(t => isNum(progress.tasks[t.code]?.diem)).map(t => `${t.code}: ${fmtScore(progress.tasks[t.code].diem)}`)
      lines.push(`- ${mod.code} ${mod.name}: ${r.diem !== null ? `${fmtScore(r.diem)} (${r.grade.label})` : `đang học, ${r.done}/${r.total} bài`}`)
      if (graded.length) lines.push(`  Bài tập: ${graded.join('; ')}`)
      if (r.duAn !== null || (mod.hasExam && r.kiemTra !== null)) lines.push(`  ${mod.hasExam ? `Kiểm tra: ${fmtScore(r.kiemTra)} · ` : ''}Dự án: ${fmtScore(r.duAn)}`)
    }
  }
  return lines.join('\n')
}

// Mẫu tin nộp bài cho giảng viên AI (dán vào chat): mã bài + các mục cần nộp theo giáo án.
export function submitTemplate(code, lesson) {
  return [
    `NỘP BÀI – ${code} – [Họ tên]`,
    `Bài: ${lesson.title}`,
    '',
    ...lesson.assignment.submit.map((s, i) => `${i + 1}. ${s}\n   → `),
  ].join('\n')
}
