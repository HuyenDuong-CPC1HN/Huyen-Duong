import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, RefreshCw, Search } from 'lucide-react'
import { callKeToan, tokenFromHash } from '../data/keToanApi'
import cpcLogo from '../assets/cpc1hn_logo.png'

// Trang "Việc của kế toán" — mở bằng link riêng https://<app>/#ketoan=<mã> kho gửi, không cần đăng nhập. Chỉ thấy việc
// đang chờ đúng kế toán giữ link (hồ sơ khách trả chờ nhập trả lại, đợt huỷ chờ xuất huỷ): lọc theo kho / công việc,
// tìm kiếm; mỗi việc 1 dòng gọn, bấm mở xem hàng hoá + biên bản kho đã lập, rồi bấm "Đã xong".
// Mã nằm sau dấu # nên không đi vào nhật ký máy chủ web.
const KeToanPapers = lazy(() => import('./KeToanPapers'))

const VIEC = [['case', 'Nhập trả lại'], ['batch', 'Xuất huỷ']]
const pad2 = n => String(n).padStart(2, '0')
const fmtDate = s => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''))
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}
const fmtDay = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}` }
const daysSince = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? 0 : Math.max(0, Math.floor((Date.now() - d) / 86400000)) }
const fmtQty = v => (v === null || v === undefined || v === '' ? '' : new Intl.NumberFormat('vi-VN').format(v))
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
const searchText = it => norm([it.khachHang, it.so, it.loai, it.hoaDon?.so, it.hoaDon?.kyHieu,
  ...it.items.flatMap(r => [r.maHang, r.tenHang, r.soLo])].join(' '))
const keyOf = it => `${it.kind}:${it.id}`

const KhoTag = ({ kho }) => (kho === 'C'
  ? <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold border border-red-200 bg-red-50 text-red-700">Kho C</span>
  : <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold border border-blue-200 bg-blue-50 text-blue-700">Kho DTP</span>)

function Seg({ label, value, onChange, options }) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={label}>
      <span className="text-xs text-gray-500 mr-1">{label}</span>
      {options.map(([v, l, n]) => (
        <button key={v} type="button" onClick={() => onChange(v)} aria-pressed={value === v}
          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${value === v ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white text-gray-600 border-gray-200'}`}>
          {l} <span className={value === v ? 'text-white/80' : 'text-gray-400'}>{n}</span>
        </button>
      ))}
    </div>
  )
}

function TaskRow({ it, open, asking, busy, onToggle, onAsk, onCancel, onDone }) {
  const days = daysSince(it.since)
  return (
    <article className={`bg-white rounded-xl border ${open ? 'border-[#1e3a5f]' : 'border-gray-200'}`} aria-label={`${it.loai} ${it.khachHang || it.so}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full text-left px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        {open ? <ChevronDown size={15} className="text-gray-400" /> : <ChevronRight size={15} className="text-gray-400" />}
        <KhoTag kho={it.kho} />
        <span className="text-xs font-semibold text-gray-600 w-24">{it.kind === 'batch' ? 'Xuất huỷ' : 'Nhập trả lại'}</span>
        <span className="font-semibold text-gray-900 flex-1 min-w-[12rem]">{it.khachHang || `Đợt huỷ ${it.so}`}</span>
        {it.kind === 'case' && it.so && <span className="font-mono text-xs text-gray-500">{it.so}</span>}
        <span className="text-xs text-gray-500">{it.items.length} mặt hàng</span>
        <span className={`text-xs ${days >= 3 ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>{days ? `chờ ${days} ngày` : 'hôm nay'}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 flex flex-col gap-3 border-t border-gray-100 pt-3">
          <div className="text-sm text-gray-700 flex flex-col gap-0.5">
            <div>Việc cần làm: <b>{it.viec}</b> · {it.loai} · chờ từ {fmtDay(it.since)}</div>
            {it.hoaDon && <div>Hoá đơn: số <b>{it.hoaDon.so}</b>{it.hoaDon.kyHieu ? `, ký hiệu ${it.hoaDon.kyHieu}` : ''}{it.hoaDon.ngay ? `, ngày ${fmtDate(it.hoaDon.ngay)}` : ''}</div>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] border-collapse min-w-[560px]">
              <thead><tr className="bg-slate-100 text-left">{['STT', 'Mã hàng', 'Tên hàng', 'Số lô', 'Hạn dùng', 'SL', 'ĐVT'].map(h => <th key={h} className="px-2 py-1.5 border border-gray-200 font-semibold">{h}</th>)}</tr></thead>
              <tbody>{it.items.map((r, i) => (
                <tr key={i}>
                  <td className="px-2 py-1.5 border border-gray-200 text-center">{i + 1}</td>
                  <td className="px-2 py-1.5 border border-gray-200 font-mono text-xs">{r.maHang}</td>
                  <td className="px-2 py-1.5 border border-gray-200">{r.tenHang}</td>
                  <td className="px-2 py-1.5 border border-gray-200">{r.soLo}</td>
                  <td className="px-2 py-1.5 border border-gray-200 whitespace-nowrap">{fmtDate(r.hanDung)}</td>
                  <td className="px-2 py-1.5 border border-gray-200 text-right">{fmtQty(r.soLuong)}</td>
                  <td className="px-2 py-1.5 border border-gray-200">{r.dvt}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {it.papers && (
            <Suspense fallback={<div className="text-sm text-gray-500">Đang mở biên bản…</div>}>
              <KeToanPapers it={it} />
            </Suspense>
          )}
          {asking ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
              <span className="text-sm text-amber-900">Anh/chị đã làm xong <b>{it.viec.toLowerCase()}</b> trên phần mềm?</span>
              <button type="button" onClick={onDone} disabled={busy} className="sheet-tab-action is-primary">{busy ? 'Đang gửi…' : 'Đúng, đã xong'}</button>
              <button type="button" onClick={onCancel} disabled={busy} className="sheet-tab-action">Chưa</button>
            </div>
          ) : (
            <button type="button" onClick={onAsk} className="sheet-tab-action is-primary self-start"><CheckCircle2 size={14} /> Đã xong</button>
          )}
        </div>
      )}
    </article>
  )
}

export default function KeToanPage() {
  const [token] = useState(() => tokenFromHash())
  const [data, setData] = useState({ loading: Boolean(token), error: token ? '' : 'Link thiếu mã. Anh/chị mở lại đúng link kho gửi qua Zalo.', name: '', items: [] })
  const [kho, setKho] = useState('all')
  const [viec, setViec] = useState('all')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState('')
  const [asking, setAsking] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')

  const fetchList = useCallback(async () => {
    try {
      const d = await callKeToan({ t: token, action: 'list' })
      setData({ loading: false, error: '', name: d?.name || '', items: Array.isArray(d?.items) ? d.items : [] })
    } catch (err) {
      setData(s => ({ ...s, loading: false, error: err.message || 'Không tải được danh sách việc.' }))
    }
  }, [token])
  useEffect(() => { if (token) void fetchList() }, [token, fetchList])

  const refresh = () => { setMsg(''); setData(s => ({ ...s, loading: true, error: '' })); void fetchList() }
  const markDone = async it => {
    setBusy(keyOf(it)); setMsg('')
    try {
      await callKeToan({ t: token, action: 'done', kind: it.kind, id: it.id })
      setData(s => ({ ...s, items: s.items.filter(x => keyOf(x) !== keyOf(it)) }))
      setMsg(`Đã báo kho: ${it.khachHang || `đợt huỷ ${it.so}`} — xong. Kho sẽ thấy khi mở app.`)
      setAsking(''); setOpen('')
    } catch (err) {
      setData(s => ({ ...s, error: err.message || 'Không gửi được. Anh/chị thử lại.' }))
    } finally { setBusy('') }
  }

  const all = data.items
  const byKho = all.filter(x => kho === 'all' || x.kho === kho)
  const nq = norm(q.trim())
  const shown = byKho.filter(x => (viec === 'all' || x.kind === viec) && (!nq || searchText(x).includes(nq)))
  const count = (list, f) => list.filter(f).length

  return (
    <div className="min-h-screen bg-slate-100 text-gray-800">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          <img src={cpcLogo} alt="CPC1HN" className="h-8 w-auto" />
          <div className="flex flex-col">
            <h1 className="m-0 text-base font-bold text-[#1e3a5f]">Việc của kế toán · Hàng trả &amp; huỷ</h1>
            {data.name && <span className="text-xs text-gray-500">Xin chào {data.name}</span>}
          </div>
          {token && <button type="button" onClick={refresh} disabled={data.loading} className="sheet-tab-action ml-auto"><RefreshCw size={13} className={data.loading ? 'animate-spin' : ''} /> Tải lại</button>}
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-4 flex flex-col gap-3">
        {msg && <div className="rounded-xl border border-green-200 bg-green-50 text-green-800 px-3 py-2 text-sm" role="status">{msg}</div>}
        {data.error && <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm" role="alert">{data.error}</div>}
        {data.loading && <div className="text-sm text-gray-500">Đang tải việc…</div>}
        {!data.loading && data.name && (all.length === 0 ? (
          <div className="rounded-2xl bg-white border border-gray-200 p-6 text-center text-sm text-gray-600">Không có việc nào đang chờ anh/chị.</div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-gray-200 px-3 py-2.5 flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <Seg label="Kho" value={kho} onChange={setKho} options={[['all', 'Tất cả', all.length], ['C', 'Kho C', count(all, x => x.kho === 'C')], ['DTP', 'Kho DTP', count(all, x => x.kho === 'DTP')]]} />
                <Seg label="Công việc" value={viec} onChange={setViec} options={[['all', 'Tất cả', byKho.length], ...VIEC.map(([k, l]) => [k, l, count(byKho, x => x.kind === k)])]} />
              </div>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm khách hàng, số đơn, số đợt huỷ, mã / tên hàng, số lô, số hoá đơn…" aria-label="Tìm việc"
                  className="w-full pl-8 pr-2 py-1.5 border border-gray-200 rounded-lg text-sm" />
              </div>
            </div>
            <div className="text-xs text-gray-500">Đang hiện {shown.length}/{all.length} việc · việc chờ lâu nhất ở trên · bấm vào dòng để xem hàng hoá, biên bản và báo xong</div>
            {shown.length === 0 && <div className="rounded-xl bg-white border border-gray-200 p-4 text-sm text-gray-500">Không có việc nào khớp bộ lọc / từ khoá.</div>}
            <div className="flex flex-col gap-2">
              {shown.map(it => (
                <TaskRow key={keyOf(it)} it={it} open={open === keyOf(it)} asking={asking === keyOf(it)} busy={busy === keyOf(it)}
                  onToggle={() => { setOpen(o => (o === keyOf(it) ? '' : keyOf(it))); setAsking('') }}
                  onAsk={() => { setAsking(keyOf(it)); setMsg('') }} onCancel={() => setAsking('')} onDone={() => void markDone(it)} />
              ))}
            </div>
          </>
        ))}
        <p className="m-0 text-xs text-gray-500">Link này là riêng của anh/chị, không cần đăng nhập — anh/chị đừng chuyển cho người khác. Lộ link thì báo kho đổi link mới.</p>
      </main>
    </div>
  )
}
