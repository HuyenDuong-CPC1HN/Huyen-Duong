import { useState } from 'react'
import { BookOpen, ChevronDown, ChevronRight, Copy, GraduationCap } from 'lucide-react'
import { opsStore } from '../data/workspace'
import { LEARNING_PROGRAM } from '../data/learningProgram'
import { LESSONS } from '../data/lessons'
import LessonView from './LessonView'
import {
  LEARNING_STORE_KEY, fmtScore, gradebookText, moduleResult, normalizeProgress, overview, parseScore, phaseGpa,
  scheduleWeek, taskDone, weekStart,
} from '../utils/learningProgress'

// Tab "Lộ trình học": check list chương trình "Dược sĩ phân tích dữ liệu" (Data Analyst → Data Scientist). Tích bài
// đã học / đã nộp, ghi điểm giảng viên chấm, app tự tính điểm học phần, xếp loại và tiến độ so với lịch học.
// Lưu ở ops_settings (khoá hoc_tap_lo_trinh).

function readProgress() {
  try { return normalizeProgress(JSON.parse(opsStore.getItem(LEARNING_STORE_KEY) || '{}')) } catch { return normalizeProgress({}) }
}

const STATUS = {
  chuaHoc: { label: 'Chưa học', cls: 'bg-gray-100 text-gray-500 border-gray-200' },
  dangHoc: { label: 'Đang học', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  dat: { label: 'Đạt', cls: 'bg-green-50 text-green-700 border-green-200' },
  chuaDat: { label: 'Chưa đạt', cls: 'bg-red-50 text-red-700 border-red-200' },
}

// Ô nhập điểm / ghi chú: gõ thoải mái, lưu khi rời ô hoặc Enter (không ghi máy chủ theo từng phím).
function CommitInput({ value, onCommit, label, className = '', placeholder = '', score = false }) {
  const shown = score ? (value === null || value === undefined ? '' : String(value).replace('.', ',')) : (value || '')
  const [draft, setDraft] = useState(null)
  const commit = () => {
    if (draft === null) return
    if (score) {
      const n = parseScore(draft)
      if (draft.trim() && n === null) { setDraft(null); return } // điểm sai (ngoài 0–10): bỏ, giữ điểm cũ
      onCommit(n)
    } else onCommit(draft.trim())
    setDraft(null)
  }
  return (
    <input value={draft ?? shown} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
      aria-label={label} placeholder={placeholder} inputMode={score ? 'decimal' : undefined}
      className={`border border-gray-200 rounded px-1.5 py-1 text-xs ${score ? 'w-14 text-right tabular-nums' : 'w-full'} ${className}`} />
  )
}

function ModuleCard({ mod, progress, open, onToggle, setTask, setModule, nowWeek, onOpenLesson }) {
  const r = moduleResult(mod, progress)
  const st = STATUS[r.status]
  const m = progress.modules[mod.code] || {}
  return (
    <div className={`bg-white rounded-2xl border ${r.status === 'dangHoc' ? 'border-[#1e3a5f]/40' : 'border-gray-200'}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full flex flex-wrap items-center gap-2 px-4 py-3 text-left">
        {open ? <ChevronDown size={16} className="text-gray-400 shrink-0" /> : <ChevronRight size={16} className="text-gray-400 shrink-0" />}
        <span className="font-mono text-xs font-bold text-[#1e3a5f]">{mod.code}</span>
        <span className="font-semibold text-sm">{mod.name}</span>
        <span className="text-xs text-gray-400">{mod.weeks} · {mod.hours} giờ</span>
        <span className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-500 tabular-nums">{r.done}/{r.total} bài</span>
          <span className="w-20 h-1.5 rounded-full bg-gray-100 overflow-hidden"><span className="block h-full bg-[#1e3a5f]" style={{ width: `${(r.done / r.total) * 100}%` }} /></span>
          <span className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold ${st.cls}`}>
            {st.label}{r.diem !== null ? ` · ${fmtScore(r.diem)} ${r.grade.label}` : ''}
          </span>
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3">
          <div className="text-xs text-gray-600"><b>Mục tiêu:</b> {mod.goal}</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[760px]">
              <thead>
                <tr className="bg-slate-50 text-gray-500 text-left">
                  <th className="px-2 py-1.5 w-12">Tuần</th><th className="px-2 py-1.5">Bài giảng</th><th className="px-2 py-1.5">Bài tập</th>
                  <th className="px-2 py-1.5 text-center w-14">Đã học</th><th className="px-2 py-1.5 text-center w-14">Đã nộp</th>
                  <th className="px-2 py-1.5 w-16">Điểm</th><th className="px-2 py-1.5 w-48">Nhận xét giảng viên</th>
                </tr>
              </thead>
              <tbody>
                {mod.tasks.map(t => {
                  const p = progress.tasks[t.code] || {}
                  const done = taskDone(p)
                  const late = !done && nowWeek !== null && weekStart(t.week) < nowWeek
                  return (
                    <tr key={t.code} className={`border-t border-gray-100 align-top ${done ? 'bg-green-50/40' : ''}`}>
                      <td className={`px-2 py-1.5 tabular-nums ${late ? 'text-red-600 font-semibold' : ''}`} title={late ? 'Chậm so với lịch học' : undefined}>{t.week}</td>
                      <td className="px-2 py-1.5 text-gray-700">{t.lecture}</td>
                      <td className="px-2 py-1.5"><div>{t.task}</div>
                        <div className="flex flex-wrap items-center gap-2 mt-0.5">
                          <span className="font-mono text-[11px] text-[#1e3a5f]">{t.code}</span>
                          {LESSONS[t.code]
                            ? <button type="button" onClick={() => onOpenLesson(t.code)} className="inline-flex items-center gap-1 rounded-md bg-[#1e3a5f] px-2 py-0.5 text-[11px] font-semibold text-white"><BookOpen size={11} /> Vào học</button>
                            : <span className="text-[11px] text-gray-400">giáo án soạn trước khi tới tuần học</span>}
                        </div></td>
                      <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={Boolean(p.hoc)} onChange={e => setTask(t.code, { hoc: e.target.checked })} aria-label={`Đã học ${t.code}`} /></td>
                      <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={Boolean(p.nop)} onChange={e => setTask(t.code, { nop: e.target.checked })} aria-label={`Đã nộp ${t.code}`} /></td>
                      <td className="px-2 py-1.5"><CommitInput score value={p.diem} onCommit={v => setTask(t.code, { diem: v })} label={`Điểm ${t.code}`} placeholder="0–10"
                        className={typeof p.diem === 'number' && p.diem < 7 ? 'border-red-300 text-red-700' : ''} /></td>
                      <td className="px-2 py-1.5"><CommitInput value={p.note} onCommit={v => setTask(t.code, { note: v })} label={`Nhận xét ${t.code}`} placeholder="ghi chú…" /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 text-xs">
            <div className="rounded-lg bg-slate-50 px-3 py-2"><b>Bài kiểm tra:</b> {mod.exam}</div>
            <div className="rounded-lg bg-slate-50 px-3 py-2"><b>Dự án học phần:</b> {mod.project}</div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <span>Bài tập (40%): <b className="tabular-nums">{fmtScore(r.baiTap)}</b></span>
            <label className="flex items-center gap-1.5">Kiểm tra (20%):
              {mod.hasExam
                ? <CommitInput score value={m.kiemTra} onCommit={v => setModule(mod.code, { kiemTra: v })} label={`Điểm kiểm tra ${mod.code}`} placeholder="0–10" />
                : <span className="text-gray-400">= điểm dự án</span>}
            </label>
            <label className="flex items-center gap-1.5">Dự án (40%):
              <CommitInput score value={m.duAn} onCommit={v => setModule(mod.code, { duAn: v })} label={`Điểm dự án ${mod.code}`} placeholder="0–10" />
            </label>
            <span className="ml-auto">Điểm học phần: {r.diem !== null
              ? <b className={r.grade.pass ? 'text-green-700' : 'text-red-700'}>{fmtScore(r.diem)} · {r.grade.label}{r.grade.pass ? '' : ' (làm lại bài/dự án, tối đa 8,0)'}</b>
              : <span className="text-gray-400">chưa đủ điểm ({r.missing.join(', ')})</span>}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default function LoTrinhHocTab() {
  const [progress, setProgress] = useState(readProgress)
  const ov = overview(LEARNING_PROGRAM, progress)
  const currentMod = LEARNING_PROGRAM.find(m => m.tasks.some(t => t.code === ov.nextTask?.code))
  const [phase, setPhase] = useState(() => currentMod?.phase ?? 1)
  const [openSet, setOpenSet] = useState(() => new Set(currentMod ? [currentMod.code] : []))
  const [copyMsg, setCopyMsg] = useState('')
  const [lessonCode, setLessonCode] = useState('')
  const nowWeek = scheduleWeek(progress.startDate)

  const save = next => { setProgress(next); opsStore.setItem(LEARNING_STORE_KEY, JSON.stringify(next)) }
  const update = fn => save(fn(readProgress()))
  const setTask = (code, patch) => update(p => ({ ...p, tasks: { ...p.tasks, [code]: { ...(p.tasks[code] || {}), ...patch } } }))
  const setModule = (code, patch) => update(p => ({ ...p, modules: { ...p.modules, [code]: { ...(p.modules[code] || {}), ...patch } } }))
  const toggle = code => setOpenSet(s => { const n = new Set(s); if (n.has(code)) n.delete(code); else n.add(code); return n })
  const copyGradebook = () => {
    const text = gradebookText(LEARNING_PROGRAM, progress)
    navigator.clipboard?.writeText(text).then(() => setCopyMsg('Đã sao chép sổ điểm — dán vào đầu cuộc trò chuyện mới với giảng viên.'), () => setCopyMsg('Không sao chép được, trình duyệt chặn quyền.'))
  }

  if (lessonCode) {
    const mod = LEARNING_PROGRAM.find(m => m.tasks.some(t => t.code === lessonCode))
    const task = mod?.tasks.find(t => t.code === lessonCode)
    if (task) {
      return <LessonView task={task} moduleName={`${mod.code} · ${mod.name}`} progress={progress} setTask={setTask}
        onBack={() => { setLessonCode(''); window.scrollTo?.(0, 0) }} />
    }
  }

  const behind = nowWeek !== null && nowWeek > 0 ? nowWeek - ov.currentWeek : null
  const pace = behind === null ? 'Nhập ngày nhập học để so với lịch'
    : nowWeek === 0 ? 'Chưa tới ngày nhập học'
      : behind > 0 ? `Chậm ${behind} tuần so với lịch` : behind < 0 ? `Nhanh hơn lịch ${-behind} tuần` : 'Đúng tiến độ'

  return (
    <div className="flex flex-col gap-4">
      <section className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col gap-3" aria-label="Tổng quan lộ trình">
        <div className="flex flex-wrap items-center gap-2">
          <GraduationCap size={20} className="text-[#1e3a5f]" />
          <h2 className="m-0 text-base font-semibold">Dược sĩ phân tích dữ liệu · Data Analyst → Data Scientist</h2>
          <span className="text-xs text-gray-400">GĐ 1: 13 tuần (3 tháng), khoảng 15 giờ/tuần · GĐ 2: tuần 14–41, 7–8 giờ/tuần · điểm đạt ≥ 7,0</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-slate-50 p-3 flex flex-col gap-1">
            <span className="text-[11px] text-gray-500">Tiến độ chung</span>
            <span className="text-xl font-bold tabular-nums">{ov.percent}%</span>
            <span className="h-2 rounded-full bg-gray-200 overflow-hidden"><span className="block h-full bg-[#1e3a5f]" style={{ width: `${ov.percent}%` }} /></span>
            <span className="text-[11px] text-gray-500">{ov.done}/{ov.total} bài đã học + đã nộp</span>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 flex flex-col gap-1">
            <span className="text-[11px] text-gray-500">Đang học</span>
            <span className="text-xl font-bold">Tuần {ov.currentWeek}</span>
            <span className={`text-[11px] font-semibold ${behind > 0 ? 'text-red-600' : 'text-green-700'}`}>{pace}{nowWeek > 0 ? ` (theo lịch: tuần ${nowWeek})` : ''}</span>
            {ov.nextTask && <span className="text-[11px] text-gray-500">Bài tiếp theo: <b className="font-mono">{ov.nextTask.code}</b></span>}
          </div>
          <div className="rounded-xl bg-slate-50 p-3 flex flex-col gap-1">
            <span className="text-[11px] text-gray-500">Điểm trung bình tích luỹ</span>
            <span className="text-sm">GĐ 1 (DA): <b className="tabular-nums">{fmtScore(phaseGpa(LEARNING_PROGRAM, progress, 1))}</b></span>
            <span className="text-sm">GĐ 2 (DS): <b className="tabular-nums">{fmtScore(phaseGpa(LEARNING_PROGRAM, progress, 2))}</b></span>
            <span className="text-[11px] text-gray-500">{ov.passed}/{ov.modules} học phần đạt</span>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 flex flex-col gap-1.5">
            <label className="text-[11px] text-gray-500 flex flex-col gap-1">Ngày nhập học
              <input type="date" value={progress.startDate} onChange={e => update(p => ({ ...p, startDate: e.target.value }))} aria-label="Ngày nhập học" className="border border-gray-200 rounded px-2 py-1 text-sm text-gray-800" />
            </label>
            <button type="button" onClick={copyGradebook} className="sheet-tab-action self-start"><Copy size={13} /> Sao chép sổ điểm</button>
            {copyMsg && <span className="text-[11px] text-green-700">{copyMsg}</span>}
          </div>
        </div>
        <div className="text-[11px] text-gray-500">
          Nộp bài cho giảng viên AI trong chat theo cú pháp <b>NỘP BÀI – [Mã bài] – [Họ tên]</b>, rồi ghi điểm và nhận xét vào đây.
          Giảng viên không tự nhớ giữa các cuộc trò chuyện: mỗi buổi học mới, bấm “Sao chép sổ điểm” và dán vào đầu cuộc trò chuyện.
        </div>
      </section>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Giai đoạn">
        {[[1, 'Giai đoạn 1 · Data Analyst (tuần 1–13 · 3 tháng)'], [2, 'Giai đoạn 2 · Data Scientist (tuần 14–41)']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setPhase(k)} aria-pressed={phase === k}
            className={`px-3 py-1.5 rounded-lg text-sm border ${phase === k ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white text-gray-600 border-gray-200'}`}>{l}</button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {LEARNING_PROGRAM.filter(m => m.phase === phase).map(mod => (
          <ModuleCard key={mod.code} mod={mod} progress={progress} open={openSet.has(mod.code)} onToggle={() => toggle(mod.code)}
            setTask={setTask} setModule={setModule} nowWeek={nowWeek} onOpenLesson={code => { setLessonCode(code); window.scrollTo?.(0, 0) }} />
        ))}
      </div>
    </div>
  )
}
