import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, RefreshCw } from 'lucide-react'
import { callKeToan, tokenFromHash } from '../data/keToanApi'
import cpcLogo from '../assets/cpc1hn_logo.png'

// Trang "Việc của kế toán" — mở bằng link riêng https://<app>/#ketoan=<mã> kho gửi, không cần đăng nhập. Chỉ thấy việc
// đang chờ đúng kế toán giữ link (hồ sơ khách trả chờ nhập trả lại, đợt huỷ chờ xuất huỷ) và bấm "Đã xong".
// Mã nằm sau dấu # nên không đi vào nhật ký máy chủ web.

const pad2 = n => String(n).padStart(2, '0')
const fmtDate = s => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''))
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}
const fmtDay = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}` }
const daysSince = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? 0 : Math.max(0, Math.floor((Date.now() - d) / 86400000)) }
const fmtQty = v => (v === null || v === undefined || v === '' ? '' : new Intl.NumberFormat('vi-VN').format(v))

const KhoTag = ({ kho }) => (kho === 'C'
  ? <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold border border-red-200 bg-red-50 text-red-700">Kho C</span>
  : <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold border border-blue-200 bg-blue-50 text-blue-700">Kho DTP</span>)

function TaskCard({ it, asking, busy, onAsk, onCancel, onDone }) {
  const days = daysSince(it.since)
  return (
    <article className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col gap-2.5" aria-label={`${it.loai} ${it.khachHang || it.so}`}>
      <div className="flex flex-wrap items-center gap-2">
        <KhoTag kho={it.kho} />
        <span className="text-xs font-semibold text-gray-600">{it.loai}</span>
        {it.khachHang && <span className="font-semibold text-gray-900">{it.khachHang}</span>}
        {it.so && <span className="font-mono text-xs text-gray-500">{it.so}</span>}
        <span className={`ml-auto text-xs ${days >= 3 ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>Chờ từ {fmtDay(it.since)}{days ? ` · ${days} ngày` : ' · hôm nay'}</span>
      </div>
      <div className="text-sm text-gray-700">Việc cần làm: <b>{it.viec}</b></div>
      {it.hoaDon && <div className="text-sm text-gray-700">Hoá đơn: số <b>{it.hoaDon.so}</b>{it.hoaDon.kyHieu ? `, ký hiệu ${it.hoaDon.kyHieu}` : ''}{it.hoaDon.ngay ? `, ngày ${fmtDate(it.hoaDon.ngay)}` : ''}</div>}
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
      {asking ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
          <span className="text-sm text-amber-900">Anh/chị đã làm xong <b>{it.viec.toLowerCase()}</b> trên phần mềm?</span>
          <button type="button" onClick={onDone} disabled={busy} className="sheet-tab-action is-primary">{busy ? 'Đang gửi…' : 'Đúng, đã xong'}</button>
          <button type="button" onClick={onCancel} disabled={busy} className="sheet-tab-action">Chưa</button>
        </div>
      ) : (
        <button type="button" onClick={onAsk} className="sheet-tab-action is-primary self-start"><CheckCircle2 size={14} /> Đã xong</button>
      )}
    </article>
  )
}

export default function KeToanPage() {
  const [token] = useState(() => tokenFromHash())
  const [data, setData] = useState({ loading: Boolean(token), error: token ? '' : 'Link thiếu mã. Anh/chị mở lại đúng link kho gửi qua Zalo.', name: '', items: [] })
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
  const keyOf = it => `${it.kind}:${it.id}`
  const markDone = async it => {
    setBusy(keyOf(it)); setMsg('')
    try {
      await callKeToan({ t: token, action: 'done', kind: it.kind, id: it.id })
      setData(s => ({ ...s, items: s.items.filter(x => keyOf(x) !== keyOf(it)) }))
      setMsg(`Đã báo kho: ${it.khachHang || it.so} — xong. Kho sẽ thấy khi mở app.`)
      setAsking('')
    } catch (err) {
      setMsg('')
      setData(s => ({ ...s, error: err.message || 'Không gửi được. Anh/chị thử lại.' }))
    } finally { setBusy('') }
  }

  const groups = [
    ['case', 'Hồ sơ khách trả chờ nhập trả lại'],
    ['batch', 'Đợt huỷ chờ xuất huỷ'],
  ].map(([kind, title]) => [kind, title, data.items.filter(x => x.kind === kind)])

  return (
    <div className="min-h-screen bg-slate-100 text-gray-800">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          <img src={cpcLogo} alt="CPC1HN" className="h-8 w-auto" />
          <div className="flex flex-col">
            <h1 className="m-0 text-base font-bold text-[#1e3a5f]">Việc của kế toán · Hàng trả &amp; huỷ</h1>
            {data.name && <span className="text-xs text-gray-500">Xin chào {data.name}</span>}
          </div>
          {token && <button type="button" onClick={refresh} disabled={data.loading} className="sheet-tab-action ml-auto"><RefreshCw size={13} className={data.loading ? 'animate-spin' : ''} /> Tải lại</button>}
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-4 flex flex-col gap-4">
        {msg && <div className="rounded-xl border border-green-200 bg-green-50 text-green-800 px-3 py-2 text-sm" role="status">{msg}</div>}
        {data.error && <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm" role="alert">{data.error}</div>}
        {data.loading && <div className="text-sm text-gray-500">Đang tải việc…</div>}
        {!data.loading && data.name && data.items.length === 0 && (
          <div className="rounded-2xl bg-white border border-gray-200 p-6 text-center text-sm text-gray-600">Không có việc nào đang chờ anh/chị.</div>
        )}
        {!data.loading && groups.map(([kind, title, list]) => list.length > 0 && (
          <section key={kind} className="flex flex-col gap-3" aria-label={title}>
            <h2 className="m-0 text-sm font-semibold text-gray-700">{title} ({list.length})</h2>
            {list.map(it => (
              <TaskCard key={keyOf(it)} it={it} asking={asking === keyOf(it)} busy={busy === keyOf(it)}
                onAsk={() => { setAsking(keyOf(it)); setMsg('') }} onCancel={() => setAsking('')} onDone={() => void markDone(it)} />
            ))}
          </section>
        ))}
        <p className="m-0 text-xs text-gray-500">Link này là riêng của anh/chị, không cần đăng nhập — anh/chị đừng chuyển cho người khác. Lộ link thì báo kho đổi link mới.</p>
      </main>
    </div>
  )
}
