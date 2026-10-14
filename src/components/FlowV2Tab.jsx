import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, X } from 'lucide-react'
import {
  BATCH_STEPS, BOARD_COLS, CASE_FLOWS, FLOWV2_EVENT, PS_LOAI, advanceBatch, advanceCase, backBatch, backCase, daysSince,
  dissolveBatch, fmtDateVi, KIND_BORDER, makeBatch, newCase, newItem, newPsEntry, newTraHang, stepOfCase,
} from '../utils/flowV2'
import { readFlowV2, writeFlowV2 } from '../data/flowV2Store'
import { uploadFlowFiles } from '../data/flowV2Files'
import { manualPdfFromInvoice, parseReturnSlipLines } from '../utils/returnSlips'
import { extractPdfLines } from '../utils/returnSlipPdf'
import { parseInvoiceLines } from '../utils/parseInvoicePdf'
import { parsePhieuXuatKhoHuyPdf } from '../utils/parsePhieuXuatKhoHangHuy'
import { extractPdfText } from '../utils/parseGoodsReceipt'
import { KhoTag } from './HangHuyBadges'
import FlowV2CaseWorkspace from './FlowV2CaseWorkspace'
import FlowV2BatchWorkspace from './FlowV2BatchWorkspace'
import { Dots, ItemsEditor, KindTag } from './FlowV2Parts'

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
const looksLikeInvoice = lines => lines.some(l => /HÓA ĐƠN GIÁ TRỊ GIA TĂNG|HOÁ ĐƠN GIÁ TRỊ GIA TĂNG|Ký hiệu\s*\(Serial\)/i.test(l))

// Đọc PDF khách trả (biên bản trả hàng in từ website, hoặc hoá đơn) → khách hàng + dòng hàng. Không đọc được thì trả null.
async function readReturnPdf(file) {
  const lines = await extractPdfLines(await file.arrayBuffer())
  // Hoá đơn → dựng Biên bản trả lại hàng mẫu nội bộ (giống tab Nhập trả lại); biên bản in từ website → giữ đúng mẫu đó.
  if (looksLikeInvoice(lines)) {
    const inv = parseInvoiceLines(lines)
    const khachHang = inv.benMua?.ten || ''
    const { pdf, formPatch } = manualPdfFromInvoice(inv, { khachHang })
    const form = { ...formPatch }
    delete form.items
    delete form.xmMau
    return {
      khachHang, traHang: newTraHang({ khachHang, pdf, form }),
      items: (inv.items || []).map(it => newItem({ tenHang: it.ten || '', dvt: it.dvt || '', soLuong: it.soLuong ?? null, soLo: it.soLo || '', hanDung: it.hanDung || '', donGia: it.donGia ?? null })),
    }
  }
  const pdf = parseReturnSlipLines(lines)
  const khachHang = pdf.benMua?.ten || ''
  return {
    khachHang, traHang: newTraHang({ khachHang, pdf, form: { mst: pdf.benMua?.mst || '' } }),
    items: (pdf.items || []).map(it => newItem({ tenHang: it.ten || '', dvt: it.dvt || '', soLuong: it.soLuong ?? null, soLo: it.soLo || '', donGia: it.donGia ?? null })),
  }
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-30 bg-slate-900/35 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-3xl max-h-[90vh] overflow-auto flex flex-col gap-3" role="dialog" aria-label={title}>
        <div className="flex items-center gap-2"><h2 className="text-base font-semibold m-0">{title}</h2>
          <button type="button" onClick={onClose} className="ml-auto p-1.5 rounded hover:bg-gray-100" aria-label="Đóng"><X size={15} /></button></div>
        {children}
      </div>
    </div>
  )
}
const Choice = ({ on, onClick, title, desc }) => (
  <button type="button" onClick={onClick} aria-pressed={on}
    className={`text-left rounded-xl border-2 p-3 ${on ? 'border-[#1e3a5f] bg-slate-50' : 'border-gray-200 hover:border-gray-300'}`}>
    <b className="block text-sm">{title}</b><span className="text-xs text-gray-500">{desc}</span>
  </button>
)
const Seg = ({ value, options, onChange, label }) => (
  <div className="flex gap-1 bg-gray-50 border border-gray-200 rounded-lg p-1" role="group" aria-label={label}>
    {options.map(([k, l]) => (
      <button key={k} type="button" onClick={() => onChange(k)} aria-pressed={value === k}
        className={`px-2.5 py-1 rounded text-xs font-medium ${value === k ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>{l}</button>
    ))}
  </div>
)

function NewCaseModal({ onClose, onCreate }) {
  const [kho, setKho] = useState('C')
  const [kind, setKind] = useState(null)
  const [sub, setSub] = useState('tuChoi')
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const create = async () => {
    setBusy(true); setError('')
    try {
      let parsed = null
      const pdf = files.find(f => /\.pdf$/i.test(f.name))
      if (pdf && !(kind === 'tra' && sub === 'daNhan')) { try { parsed = await readReturnPdf(pdf) } catch { parsed = null } }
      let stored = []
      if (files.length) { try { stored = await uploadFlowFiles(files) } catch { stored = files.map(f => ({ name: f.name, storagePath: '', type: f.type })) } }
      const daNhanPhotos = kind === 'tra' && sub === 'daNhan'
      onCreate(newCase({ kind, sub, kho, khachHang: parsed?.khachHang || '', items: parsed?.items?.length ? parsed.items : [], files: daNhanPhotos ? [] : stored, traHang: kind === 'tra' && sub === 'tuChoi' ? parsed?.traHang : null }), daNhanPhotos ? stored : [])
    } catch (err) {
      setError(err.message || 'Không tạo được hồ sơ.')
    } finally { setBusy(false) }
  }
  return (
    <Modal title="Tạo hồ sơ khách trả" onClose={onClose}>
      <div className="text-xs text-gray-500">Hàng phát sinh trong kho (cận date / lỗi nhà máy) thêm ở <b>Huỷ hàng</b> → "+ Thêm hàng phát sinh".</div>
      <div className="text-xs font-bold uppercase tracking-wide text-gray-400">1. Kho</div>
      <Seg value={kho} onChange={setKho} label="Kho" options={[['C', 'Kho C'], ['DTP', 'Kho DTP']]} />
      <div className="text-xs font-bold uppercase tracking-wide text-gray-400">2. Hàng gì?</div>
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <Choice on={kind === 'tra'} onClick={() => setKind('tra')} title="Khách trả — hàng nguyên vẹn" desc="Nhập lại kho, bán tiếp." />
        <Choice on={kind === 'loi'} onClick={() => setKind('loi')} title="Khách trả — hàng lỗi" desc="Nhập lại → đổi lô khác cho khách → hàng lỗi vào Chờ huỷ." />
      </div>
      {kind === 'tra' && (
        <>
          <div className="text-xs font-bold uppercase tracking-wide text-gray-400">3. Khách đã nhận hàng chưa?</div>
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <Choice on={sub === 'tuChoi'} onClick={() => setSub('tuChoi')} title="Khách từ chối nhận" desc="Tải BB trả hàng nội bộ (app đọc file, điền sẵn hàng)." />
            <Choice on={sub === 'daNhan'} onClick={() => setSub('daNhan')} title="Khách đã nhận rồi trả" desc="BB có chữ ký khách gửi bản cứng — chụp ảnh lưu nếu muốn." />
          </div>
        </>
      )}
      <div className="text-xs font-bold uppercase tracking-wide text-gray-400">{kind === 'tra' ? 4 : 3}. File (không bắt buộc)</div>
      <label
        onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); setFiles(f => [...f, ...e.dataTransfer.files]) }}
        className={`block text-center text-sm text-gray-500 rounded-xl border-2 border-dashed p-4 cursor-pointer ${dragging ? 'border-[#1e3a5f] bg-slate-50' : 'border-gray-300'}`}>
        {kind === 'tra' && sub === 'daNhan' ? 'Kéo thả ảnh / PDF biên bản vào đây hoặc bấm để chọn' : 'Kéo thả biên bản trả hàng / hoá đơn (PDF) vào đây hoặc bấm để chọn — app tự đọc khách hàng và dòng hàng'}
        <input type="file" multiple accept=".pdf,image/*" hidden aria-label="Chọn file" onChange={e => { const l = [...e.target.files]; e.target.value = ''; setFiles(f => [...f, ...l]) }} />
      </label>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5">{files.map((f, i) => (
          <span key={i} className="px-2 py-1 rounded-lg border border-green-200 bg-green-50 text-xs text-green-800 flex items-center gap-1">✓ {f.name}
            <button type="button" onClick={() => setFiles(l => l.filter((_, idx) => idx !== i))} aria-label={`Bỏ ${f.name}`}><X size={11} /></button></span>
        ))}</div>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-2"><button type="button" disabled={!kind || busy} onClick={() => void create()} className="sheet-tab-action is-primary">{busy ? 'Đang tạo…' : 'Tạo hồ sơ'}</button>
        <button type="button" onClick={onClose} className="sheet-tab-action">Huỷ</button></div>
    </Modal>
  )
}

function PsModal({ kho, onClose, onAdd }) {
  const [loai, setLoai] = useState(PS_LOAI[0])
  const [items, setItems] = useState(() => [newItem({ tinhTrang: PS_LOAI[0] })])
  const [pxk, setPxk] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pickLoai = l => { setItems(list => list.map(it => (!it.tinhTrang || it.tinhTrang === loai ? { ...it, tinhTrang: l } : it))); setLoai(l) }
  const readPxk = async (file) => {
    if (!file) return
    setBusy(true); setError('')
    try {
      const [stored] = await uploadFlowFiles([file]).catch(() => [{ name: file.name, storagePath: '', type: file.type }])
      setPxk(stored)
      const parsed = parsePhieuXuatKhoHuyPdf(await extractPdfText(await file.arrayBuffer()))
      if (parsed.items?.length) setItems(parsed.items.map(it => newItem({ maHang: it.maHang || '', tenHang: it.tenHang || '', soLo: it.soLo || '', hanDung: it.hanDung || '', dvt: it.dvt || '', soLuong: it.soLuong ?? null, tinhTrang: loai })))
      else setError('Đã lưu file PXK nhưng không đọc được dòng hàng — anh gõ tay bên dưới.')
    } catch { setError('Không đọc được PDF phiếu xuất kho — anh gõ tay bên dưới.') } finally { setBusy(false) }
  }
  const ok = items.some(it => it.maHang || it.tenHang)
  return (
    <Modal title={`Thêm hàng phát sinh vào Chờ huỷ — Kho ${kho}`} onClose={onClose}>
      <div className="text-xs text-gray-500">Hàng cận date / lỗi chưa ra khỏi kho. Gõ tay từng dòng; có PXK thì tải lên (không bắt buộc) — app đọc và điền sẵn.</div>
      <Seg value={loai} onChange={pickLoai} label="Loại" options={PS_LOAI.map(l => [l, l])} />
      <ItemsEditor items={items} onChange={setItems} cols={['maHang', 'tenHang', 'soLo', 'hanDung', 'soLuong', 'dvt', 'tinhTrang']}
        onAdd={() => setItems(l => [...l, newItem({ tinhTrang: loai })])} onRemove={i => setItems(l => (l.length > 1 ? l.filter((_, idx) => idx !== i) : [newItem({ tinhTrang: loai })]))} />
      <div className="flex flex-wrap items-center gap-2">
        <label className={`sheet-tab-action cursor-pointer ${busy ? 'opacity-60 pointer-events-none' : ''}`}>{busy ? 'Đang đọc…' : 'Tải PDF phiếu xuất kho (nếu có)'}
          <input type="file" accept=".pdf" hidden aria-label="Tải PDF phiếu xuất kho" onChange={e => { const f = e.target.files[0]; e.target.value = ''; void readPxk(f) }} /></label>
        {pxk && <span className="px-2 py-1 rounded-lg border border-green-200 bg-green-50 text-xs text-green-800">✓ {pxk.name}</span>}
      </div>
      {error && <p className="text-sm text-amber-700">{error}</p>}
      <div className="flex gap-2"><button type="button" disabled={!ok} onClick={() => onAdd(newPsEntry({ kho, loai, items, pxk }))} className="sheet-tab-action is-primary">Thêm vào Chờ huỷ</button>
        <button type="button" onClick={onClose} className="sheet-tab-action">Huỷ</button></div>
      {!ok && <div className="text-xs text-gray-400">Gõ ít nhất 1 dòng hàng (mã hoặc tên).</div>}
    </Modal>
  )
}

function CaseCard({ c, batch, onOpen }) {
  const flow = CASE_FLOWS[c.kind], s = stepOfCase(c), nxt = flow.steps[c.step + 1]
  const days = daysSince(c.stepAt)
  return (
    <button type="button" onClick={onOpen} className="w-full text-left bg-white rounded-xl border border-gray-200 p-2.5 hover:shadow-sm" style={{ borderLeft: `4px solid ${KIND_BORDER[c.kind]}` }}>
      <div className="flex flex-wrap items-center gap-1.5"><KindTag kind={c.kind} /><KhoTag kho={c.kho} />{days >= 3 && s.col < 4 && <span className="text-[11px] font-semibold text-red-600">{days} ngày</span>}</div>
      <div className="font-semibold text-sm mt-1">{c.khachHang || 'Khách hàng chưa ghi'}</div>
      <div className="text-xs text-gray-500">{c.soDon || 'chưa có số đơn'} · {c.items.filter(it => it.maHang || it.tenHang).length} mặt hàng</div>
      <Dots total={flow.steps.length} current={c.step} color={KIND_BORDER[c.kind]} />
      <div className="text-xs font-semibold text-[#1e3a5f] mt-1.5">{s.col === 4 ? `✓ ${s.t}` : `Đang ở: ${s.t}${s.k === 'dangHuy' && batch ? ` ${batch.no}` : ''}`}</div>
      {s.k === 'choHuy' ? <div className="text-xs text-gray-500">Đang ở khu Huỷ hàng, chờ gom đợt</div> : nxt && s.col < 4 && s.k !== 'dangHuy' && <div className="text-xs text-gray-500">Tiếp theo: {nxt.t}</div>}
    </button>
  )
}

// Tab "Hàng trả & huỷ (Demo)": bảng việc hồ sơ khách trả + khu Huỷ hàng (Chờ huỷ, đợt huỷ) cho Kho C / Kho DTP.
export default function FlowV2Tab() {
  const [data, setData] = useState(() => readFlowV2())
  const [view, setView] = useState('board')
  const [khoFilter, setKhoFilter] = useState('all')
  const [kindFilter, setKindFilter] = useState('all')
  const [q, setQ] = useState('')
  const [openCase, setOpenCase] = useState(null)
  const [openBatch, setOpenBatch] = useState(null)
  const [modal, setModal] = useState(null) // 'new' | { ps: 'C' | 'DTP' }
  const [sel, setSel] = useState({ C: [], DTP: [] })

  useEffect(() => {
    const reload = () => setData(readFlowV2())
    window.addEventListener(FLOWV2_EVENT, reload)
    return () => window.removeEventListener(FLOWV2_EVENT, reload)
  }, [])
  const save = patch => { writeFlowV2(patch); setData(d => ({ ...d, ...patch })) }
  const saveCase = c => save({ cases: data.cases.map(x => (x.id === c.id ? c : x)) })
  const saveBatch = b => save({ batches: data.batches.map(x => (x.id === b.id ? b : x)) })

  const visible = useMemo(() => data.cases.filter(c => (khoFilter === 'all' || c.kho === khoFilter) && (kindFilter === 'all' || c.kind === kindFilter)
    && (!q.trim() || norm([c.khachHang, c.soDon, ...c.items.flatMap(it => [it.maHang, it.tenHang, it.soLo])].join(' ')).includes(norm(q.trim())))), [data.cases, khoFilter, kindFilter, q])
  const batchById = id => data.batches.find(b => b.id === id)

  const caseObj = openCase && data.cases.find(c => c.id === openCase)
  if (caseObj) {
    return (
      <FlowV2CaseWorkspace c={caseObj} batch={caseObj.batchId ? batchById(caseObj.batchId) : null}
        onSave={saveCase}
        onAdvance={opts => save(advanceCase(data, caseObj.id, opts))}
        onBackStep={() => save(backCase(data, caseObj.id))}
        onClose={() => setOpenCase(null)}
        onOpenBatch={id => { setOpenCase(null); setOpenBatch(id) }}
        onGoHuy={() => { setOpenCase(null); setView('huy') }}
        onDelete={() => { save({ cases: data.cases.filter(c => c.id !== caseObj.id) }); setOpenCase(null) }} />
    )
  }
  const batchObj = openBatch && batchById(openBatch)
  if (batchObj) {
    return (
      <FlowV2BatchWorkspace b={batchObj}
        onSave={saveBatch}
        onAdvance={opts => save(advanceBatch(data, batchObj.id, opts))}
        onBackStep={() => save(backBatch(data, batchObj.id))}
        onDissolve={() => { save(dissolveBatch(data, batchObj.id)); setOpenBatch(null); setView('huy') }}
        onClose={() => { setOpenBatch(null); setView('huy') }}
        onOpenCase={id => { setOpenBatch(null); setOpenCase(id) }} />
    )
  }

  const createCase = (c, photos) => { const full = photos.length ? { ...c, photos } : c; save({ cases: [full, ...data.cases] }); setModal(null); setOpenCase(full.id) }
  const createBatch = kho => {
    const r = makeBatch(data, kho, sel[kho])
    if (!r.batchId) return
    save({ cases: r.cases, pool: r.pool, batches: r.batches })
    setSel(s => ({ ...s, [kho]: [] }))
    setOpenBatch(r.batchId)
  }
  const late = visible.filter(c => daysSince(c.stepAt) >= 3 && stepOfCase(c).col < 4).length
  const atKt = visible.filter(c => stepOfCase(c).kt).length
  const openBatches = data.batches.filter(b => b.step < BATCH_STEPS.length - 1).length

  return (
    <div className="sheet-tab">
      <div className="sheet-tab-shell flex flex-col gap-3">
        <header className="sheet-tab-context flex-wrap gap-2">
          <span className="font-semibold">Hàng trả &amp; huỷ (Demo)</span>
          <span className="text-xs text-gray-500">Bản dùng thử song song — dữ liệu riêng, không ảnh hưởng các tab cũ.</span>
          {view === 'board' && <button type="button" onClick={() => setModal('new')} className="sheet-tab-action is-primary ml-auto"><Plus size={13} /> Tạo hồ sơ khách trả</button>}
        </header>

        <div className="flex flex-wrap gap-2" role="tablist">
          {[['board', 'Bảng việc khách trả'], ['huy', `Huỷ hàng · ${data.pool.length} chờ huỷ · ${openBatches} đợt đang làm`]].map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)}
              className={`px-3.5 py-2 rounded-xl text-sm font-semibold border ${view === k ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white text-gray-500 border-gray-200'}`}>{l}</button>
          ))}
        </div>

        {view === 'board' ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Seg value={khoFilter} onChange={setKhoFilter} label="Kho" options={[['all', 'Tất cả kho'], ['C', 'Kho C'], ['DTP', 'Kho DTP']]} />
              <Seg value={kindFilter} onChange={setKindFilter} label="Loại" options={[['all', 'Mọi loại'], ['tra', 'Trả nguyên vẹn'], ['loi', 'Trả lỗi']]} />
              <div className="relative flex-1 min-w-48 max-w-xs">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm khách hàng, mã hàng, số đơn…" aria-label="Tìm hồ sơ" className="w-full pl-8 pr-2 py-1.5 border border-gray-200 rounded-lg text-sm" />
              </div>
            </div>
            {(late > 0 || atKt > 0) && (
              <div className="flex flex-wrap gap-2 text-xs">
                {late > 0 && <span className="px-2.5 py-1 rounded-lg border border-red-200 text-red-700 bg-white">⚠ {late} hồ sơ đứng 1 bước quá 3 ngày</span>}
                {atKt > 0 && <span className="px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 bg-white">{atKt} hồ sơ đang chờ kế toán</span>}
              </div>
            )}
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(5, minmax(210px, 1fr))', overflowX: 'auto' }}>
              {BOARD_COLS.map(([title, hint], ci) => {
                const list = visible.filter(c => stepOfCase(c).col === ci)
                return (
                  <div key={title} className="bg-slate-100 rounded-2xl p-2.5 flex flex-col gap-2 min-h-60">
                    <div><div className="flex items-center justify-between text-sm font-semibold">{title}<span className="text-xs bg-white rounded-full px-2 text-gray-500">{list.length}</span></div>
                      <div className="text-[11px] text-gray-500">{hint}</div></div>
                    {list.map(c => <CaseCard key={c.id} c={c} batch={c.batchId ? batchById(c.batchId) : null} onOpen={() => setOpenCase(c.id)} />)}
                  </div>
                )
              })}
            </div>
            {data.cases.length === 0 && <div className="text-sm text-gray-500">Chưa có hồ sơ nào. Bấm <b>"Tạo hồ sơ khách trả"</b> để bắt đầu.</div>}
          </>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))' }}>
            {['C', 'DTP'].map(kho => {
              const items = data.pool.filter(e => e.kho === kho)
              const picked = sel[kho]
              const bs = data.batches.filter(b => b.kho === kho)
              const toggle = id => setSel(s => ({ ...s, [kho]: s[kho].includes(id) ? s[kho].filter(x => x !== id) : [...s[kho], id] }))
              return (
                <section key={kho} className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col gap-3 min-w-0" aria-label={`Huỷ hàng Kho ${kho}`}>
                  <h2 className="m-0 text-base font-semibold flex items-center gap-2"><KhoTag kho={kho} /> Huỷ hàng</h2>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-gray-400">Chờ huỷ ({items.length})</span>
                    <button type="button" onClick={() => setModal({ ps: kho })} className="sheet-tab-action"><Plus size={13} /> Thêm hàng phát sinh (cận date / lỗi)</button>
                  </div>
                  {items.length === 0 ? <div className="text-sm text-gray-400">Không có hàng chờ huỷ.</div> : items.map(e => (
                    <label key={e.id} className={`grid gap-2 rounded-xl border p-2.5 cursor-pointer ${picked.includes(e.id) ? 'border-[#1e3a5f] bg-slate-50' : 'border-gray-200'}`} style={{ gridTemplateColumns: '20px minmax(0,1fr)' }}>
                      <input type="checkbox" checked={picked.includes(e.id)} onChange={() => toggle(e.id)} aria-label={`Chọn ${e.who}`} className="mt-1" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5"><KindTag kind={e.src === 'loi' ? 'loi' : 'ps'} /><b className="text-sm">{e.who}</b><span className="text-xs text-gray-400">vào {fmtDateVi(e.addedAt)}{e.pxk ? ` · PXK ${e.pxk.name}` : ''}</span></div>
                        <div className="text-xs text-gray-500">{e.items.map(it => `${it.maHang} ${it.tenHang} · lô ${it.soLo || '—'} · ${it.soLuong ?? ''} ${it.dvt} · ${it.tinhTrang}`).map((t, i) => <div key={i}>{t}</div>)}</div>
                      </div>
                    </label>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={!picked.length} onClick={() => createBatch(kho)} className="sheet-tab-action is-primary">Tạo đợt huỷ{picked.length ? ` (${picked.length} mục)` : ''}</button>
                    {items.length > 0 && <button type="button" onClick={() => setSel(s => ({ ...s, [kho]: picked.length === items.length ? [] : items.map(e => e.id) }))} className="sheet-tab-action">{picked.length === items.length ? 'Bỏ chọn hết' : 'Chọn hết'}</button>}
                    {items.some(e => e.src === 'ps') && picked.length === 1 && items.find(e => e.id === picked[0])?.src === 'ps' && (
                      <button type="button" onClick={() => { save({ pool: data.pool.filter(e => e.id !== picked[0]) }); setSel(s => ({ ...s, [kho]: [] })) }} className="sheet-tab-action">Xoá mục phát sinh đã chọn</button>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">Tick các mục muốn huỷ chung 1 bộ biên bản. Cần huỷ gấp thì tick 1 mục là đủ.</div>
                  <span className="text-xs font-bold uppercase tracking-wide text-gray-400 mt-1">Đợt huỷ ({bs.length})</span>
                  {bs.length === 0 ? <div className="text-sm text-gray-400">Chưa có đợt huỷ.</div> : bs.map(b => {
                    const days = daysSince(b.stepAt)
                    return (
                      <button key={b.id} type="button" onClick={() => setOpenBatch(b.id)} className="text-left rounded-xl border border-gray-200 p-2.5 hover:shadow-sm" style={{ borderLeft: `4px solid ${KIND_BORDER.batch}` }}>
                        <div className="flex flex-wrap items-center gap-2"><b className="font-mono text-sm">{b.no}</b><span className="text-xs text-gray-400">tạo {fmtDateVi(b.createdAt)} · {b.entries.length} mục · {b.items.length} dòng hàng</span>
                          {b.step < BATCH_STEPS.length - 1 && days >= 3 && <span className="text-[11px] font-semibold text-red-600">{days} ngày</span>}</div>
                        <Dots total={BATCH_STEPS.length} current={b.step} color={KIND_BORDER.batch} />
                        <div className="text-xs font-semibold text-[#1e3a5f] mt-1.5">{b.step === BATCH_STEPS.length - 1 ? '✓ Huỷ xong' : `Đang ở: ${BATCH_STEPS[b.step].t}${BATCH_STEPS[b.step].kt ? ` — ${b.keToan}` : ''}`}</div>
                      </button>
                    )
                  })}
                </section>
              )
            })}
          </div>
        )}
      </div>
      {modal === 'new' && <NewCaseModal onClose={() => setModal(null)} onCreate={createCase} />}
      {modal?.ps && <PsModal kho={modal.ps} onClose={() => setModal(null)} onAdd={entry => { save({ pool: [entry, ...data.pool] }); setModal(null) }} />}
    </div>
  )
}
