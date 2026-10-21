import { useState } from 'react'
import { ArrowLeft, BookOpen, Copy, Download, ExternalLink, Lightbulb, AlertTriangle } from 'lucide-react'
import { LEARN_LINKS, LESSONS, SOURCES, WEEK_PLAN } from '../data/lessons'
import { submitTemplate } from '../utils/learningProgress'

// Trang bài học (e-learning) của 1 bài tập tuần trong tab "Lộ trình học": mục tiêu, giáo án, liên hệ nghiệp vụ dược,
// nguồn tài liệu chính thống, câu hỏi tự kiểm tra, đề bài + file dữ liệu + thang chấm, mẫu nộp bài cho giảng viên.

// Chữ có **đậm** và `công thức`.
function Rich({ text }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean)
  return parts.map((x, i) => (x.startsWith('**') ? <b key={i}>{x.slice(2, -2)}</b>
    : x.startsWith('`') ? <code key={i} className="px-1 py-0.5 rounded bg-slate-100 text-[0.92em] font-mono text-[#1e3a5f]">{x.slice(1, -1)}</code>
      : <span key={i}>{x}</span>))
}

function Block({ b }) {
  if (b.h) return <h3 className="mt-3 mb-0 text-[15px] font-semibold text-[#1e3a5f]">{b.h}</h3>
  if (b.p) return <p className="m-0 leading-relaxed"><Rich text={b.p} /></p>
  if (b.ul) return <ul className="m-0 pl-5 list-disc flex flex-col gap-1 leading-relaxed">{b.ul.map((x, i) => <li key={i}><Rich text={x} /></li>)}</ul>
  if (b.ol) return <ol className="m-0 pl-5 list-decimal flex flex-col gap-1 leading-relaxed">{b.ol.map((x, i) => <li key={i}><Rich text={x} /></li>)}</ol>
  if (b.code) return <pre className="m-0 rounded-lg bg-slate-900 text-slate-100 text-[12.5px] leading-relaxed px-3 py-2 overflow-x-auto whitespace-pre">{b.code}</pre>
  if (b.tip) return <div className="flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900"><Lightbulb size={16} className="shrink-0 mt-0.5" /><div className="leading-relaxed"><Rich text={b.tip} /></div></div>
  if (b.warn) return <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900"><AlertTriangle size={16} className="shrink-0 mt-0.5" /><div className="leading-relaxed"><Rich text={b.warn} /></div></div>
  if (b.table) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] border-collapse min-w-[520px]">
          <thead><tr className="bg-slate-100 text-left">{b.table.head.map(h => <th key={h} className="px-2 py-1.5 border border-gray-200 font-semibold">{h}</th>)}</tr></thead>
          <tbody>{b.table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="px-2 py-1.5 border border-gray-200 align-top"><Rich text={c} /></td>)}</tr>)}</tbody>
        </table>
      </div>
    )
  }
  return null
}

function SourceList({ keys, from = SOURCES }) {
  const list = keys.map(k => from[k]).filter(Boolean)
  if (!list.length) return null
  return (
    <ul className="m-0 pl-0 list-none flex flex-col gap-1.5">
      {list.map(s => (
        <li key={s.url} className="flex items-start gap-2">
          <span className="shrink-0 px-1.5 py-0.5 rounded border border-[#1e3a5f]/20 bg-slate-50 text-[11px] font-semibold text-[#1e3a5f]">{s.org}</span>
          <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[#1e3a5f] underline underline-offset-2 hover:text-blue-700">{s.title}<ExternalLink size={11} className="inline ml-1 -mt-0.5" /></a>
        </li>
      ))}
    </ul>
  )
}

const Section = ({ title, children, id }) => (
  <section aria-labelledby={id} className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col gap-2.5 text-sm text-gray-800">
    <h2 id={id} className="m-0 text-base font-semibold">{title}</h2>
    {children}
  </section>
)

export default function LessonView({ task, moduleName, progress, onBack, setTask }) {
  const lesson = LESSONS[task.code]
  const [msg, setMsg] = useState('')
  const p = progress.tasks[task.code] || {}
  if (!lesson) return null
  const copySubmit = () => {
    navigator.clipboard?.writeText(submitTemplate(task.code, lesson)).then(
      () => setMsg('Đã chép mẫu nộp bài — dán vào chat, điền kết quả và đính kèm file.'),
      () => setMsg('Trình duyệt chặn sao chép, anh bôi đen nội dung mẫu ở trên để chép.'),
    )
  }
  const a = lesson.assignment
  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <button type="button" onClick={onBack} className="sheet-tab-action self-start"><ArrowLeft size={14} /> Quay lại lộ trình</button>

      <section className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col gap-2" aria-label="Thông tin bài học">
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <BookOpen size={15} className="text-[#1e3a5f]" />
          <span>{moduleName}</span><span>·</span><span>Tuần {task.week}</span><span>·</span><span className="font-mono text-[#1e3a5f] font-semibold">{task.code}</span>
        </div>
        <h1 className="m-0 text-lg font-bold text-[#1e3a5f]">{lesson.title}</h1>
        <div className="text-xs text-gray-500">{lesson.time}</div>
        <div className="text-sm font-semibold mt-1">Mục tiêu bài học</div>
        <ul className="m-0 pl-5 list-disc text-sm flex flex-col gap-0.5">{lesson.objectives.map((o, i) => <li key={i}>{o}</li>)}</ul>
        <div className="flex flex-wrap gap-4 mt-2 text-sm">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={Boolean(p.hoc)} onChange={e => setTask(task.code, { hoc: e.target.checked })} /> Đã học xong bài giảng</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={Boolean(p.nop)} onChange={e => setTask(task.code, { nop: e.target.checked })} /> Đã nộp bài tập</label>
        </div>
      </section>

      <Section title="Lịch học mỗi tuần (khoảng 15 giờ, 2 bài/tuần)" id="ls-plan">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse min-w-[480px]">
            <tbody>{WEEK_PLAN.map(([d, w, t]) => <tr key={d} className="border-t border-gray-100"><td className="py-1.5 pr-3 font-semibold whitespace-nowrap">{d}</td><td className="py-1.5 pr-3">{w}</td><td className="py-1.5 text-gray-500 whitespace-nowrap">{t}</td></tr>)}</tbody>
          </table>
        </div>
      </Section>

      <Section title="Giáo án" id="ls-lesson">
        {lesson.blocks.map((b, i) => <Block key={i} b={b} />)}
      </Section>

      <section aria-labelledby="ls-biz" className="rounded-2xl border border-[#1e3a5f]/25 bg-[#f3f6fa] p-4 flex flex-col gap-2 text-sm text-gray-800">
        <h2 id="ls-biz" className="m-0 text-base font-semibold text-[#1e3a5f]">{lesson.business.title}</h2>
        {lesson.business.text.map((t, i) => <p key={i} className="m-0 leading-relaxed"><Rich text={t} /></p>)}
        {lesson.business.sources.length > 0 && <SourceList keys={lesson.business.sources} />}
      </section>

      <Section title="Tài liệu gốc (nguồn chính thống)" id="ls-src">
        <p className="m-0 text-xs text-gray-500">Nội dung giáo án bám theo các tài liệu dưới đây. Khi có điểm chưa rõ, tài liệu gốc là căn cứ cuối cùng.</p>
        <SourceList keys={lesson.sources} />
        <div className="text-sm font-semibold mt-1">Học thêm (bài viết, video chính thức)</div>
        <SourceList keys={lesson.learn} from={LEARN_LINKS} />
      </Section>

      <Section title="Câu hỏi tự kiểm tra" id="ls-check">
        <p className="m-0 text-xs text-gray-500">Tự trả lời trước, rồi bấm vào câu hỏi để xem đáp án.</p>
        {lesson.selfCheck.map((c, i) => (
          <details key={i} className="rounded-lg border border-gray-200 px-3 py-2">
            <summary className="cursor-pointer font-medium"><Rich text={`${i + 1}. ${c.q}`} /></summary>
            <div className="mt-1.5 text-gray-700 leading-relaxed"><Rich text={c.a} /></div>
          </details>
        ))}
      </Section>

      <Section title={`Bài tập tuần · ${task.code}`} id="ls-task">
        <p className="m-0 leading-relaxed"><Rich text={a.brief} /></p>
        <a href={a.file.url} download className="sheet-tab-action self-start"><Download size={14} /> Tải file dữ liệu: {a.file.label}</a>
        <div className="font-semibold">Các bước</div>
        <ol className="m-0 pl-5 list-decimal flex flex-col gap-1 leading-relaxed">{a.steps.map((s, i) => <li key={i}><Rich text={s} /></li>)}</ol>
        <div className="font-semibold">Nộp bài gồm</div>
        <ul className="m-0 pl-5 list-disc flex flex-col gap-1">{a.submit.map((s, i) => <li key={i}>{s}</li>)}</ul>
        <div className="font-semibold">Thang chấm (10 điểm, đạt khi ≥ 7,0)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse min-w-[480px]">
            <thead><tr className="bg-slate-100 text-left"><th className="px-2 py-1.5 border border-gray-200">Tiêu chí</th><th className="px-2 py-1.5 border border-gray-200 w-14 text-center">Điểm</th><th className="px-2 py-1.5 border border-gray-200">Yêu cầu</th></tr></thead>
            <tbody>{a.rubric.map(([c, d, t]) => <tr key={c}><td className="px-2 py-1.5 border border-gray-200 font-medium">{c}</td><td className="px-2 py-1.5 border border-gray-200 text-center">{d}</td><td className="px-2 py-1.5 border border-gray-200">{t}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="font-semibold">Mẫu nộp bài cho giảng viên</div>
        <pre className="m-0 rounded-lg bg-slate-50 border border-gray-200 text-[12.5px] px-3 py-2 whitespace-pre-wrap">{submitTemplate(task.code, lesson)}</pre>
        <button type="button" onClick={copySubmit} className="sheet-tab-action self-start"><Copy size={14} /> Chép mẫu nộp bài</button>
        {msg && <span className="text-xs text-green-700">{msg}</span>}
      </Section>
    </div>
  )
}
