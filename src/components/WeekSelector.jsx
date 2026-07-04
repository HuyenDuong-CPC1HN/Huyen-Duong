import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Trash2, Pencil, Check, X, CalendarDays } from 'lucide-react'

export default function WeekSelector({ weeks, activeId, onSelect, onRemove, onRename }) {
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editLabel, setEditLabel] = useState('')
  const ref = useRef()

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const activeWeek = weeks.find(w => w.id === activeId)

  const startEdit = (w, e) => {
    e.stopPropagation()
    setEditingId(w.id)
    setEditLabel(w.fileName ? w.fileName.replace(/\.(xlsx|xls|csv)$/i, '') : w.label)
  }

  const confirmEdit = (e) => {
    e.stopPropagation()
    if (editLabel.trim()) onRename(editingId, editLabel.trim())
    setEditingId(null)
  }

  if (weeks.length === 0) return null

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:border-blue-300 transition-colors"
      >
        <CalendarDays size={14} className="text-blue-500 flex-shrink-0" />
        <span className="font-medium text-gray-700 max-w-40 truncate">
          {activeWeek?.label || 'Chọn tuần'}
        </span>
        {weeks.length > 1 && (
          <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{weeks.length}</span>
        )}
        <ChevronDown size={13} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg w-72">
          <div className="px-3 py-2 border-b border-gray-100 text-xs text-gray-400 font-medium">
            Lịch sử upload ({weeks.length} tuần)
          </div>
          <div className="max-h-64 overflow-y-auto">
            {[...weeks].reverse().map(w => (
              <div
                key={w.id}
                onClick={() => { if (editingId !== w.id) { onSelect(w.id); setOpen(false) } }}
                className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-blue-50 transition-colors ${w.id === activeId ? 'bg-blue-50/70' : ''}`}
              >
                {/* Label / edit input */}
                <div className="flex-1 min-w-0">
                  {editingId === w.id ? (
                    <input
                      autoFocus
                      value={editLabel}
                      onChange={e => setEditLabel(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') confirmEdit(e); if (e.key === 'Escape') setEditingId(null) }}
                      onClick={e => e.stopPropagation()}
                      className="w-full text-xs border border-blue-300 rounded px-1.5 py-0.5 focus:outline-none"
                    />
                  ) : (
                    <>
                      <p className={`text-sm font-medium truncate ${w.id === activeId ? 'text-blue-700' : 'text-gray-700'}`}>
                        {w.label}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{w.fileName} · {new Date(w.uploadedAt).toLocaleDateString('vi-VN')}</p>
                    </>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                  {editingId === w.id ? (
                    <>
                      <button onClick={confirmEdit} className="p-1 rounded hover:bg-green-100 text-green-600"><Check size={13} /></button>
                      <button onClick={() => setEditingId(null)} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X size={13} /></button>
                    </>
                  ) : (
                    <>
                      <button onClick={(e) => startEdit(w, e)} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"><Pencil size={13} /></button>
                      <button
                        onClick={() => { if (confirm(`Xóa "${w.label}"?`)) onRemove(w.id) }}
                        className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                      >
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>

                {w.id === activeId && !editingId && (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
