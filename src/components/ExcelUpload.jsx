import { useRef, useState } from 'react'
import { Upload, FileSpreadsheet, X, FileUp } from 'lucide-react'
import * as XLSX from 'xlsx'

// Các cột ngày/giờ có thể là ô kiểu Date thật trong Excel — định dạng hiển thị của Excel
// đôi khi lưu theo kiểu Mỹ (m/d/yyyy) dù XLSX yêu cầu dd/mm/yyyy, gây đọc sai ngày (vd "7/10" hiểu nhầm
// thành 7 tháng 10 thay vì 10 tháng 7). Nên lấy trực tiếp từ Date object thay vì tin vào chuỗi hiển thị.
// "Ngày tạo kiện" có giờ thật (dùng để hiển thị) — các cột còn lại chỉ có ngày, bỏ giờ để tránh sai số
// làm tròn số thực khi Excel lưu ngày (vd 46209.00001 lệch vài phút so với nửa đêm).
const DATETIME_COLUMNS = ['Ngày tạo kiện']
const DATE_ONLY_COLUMNS = ['Ngày giao hàng', 'Ngày ghi sổ']

function pad2(n) { return String(n).padStart(2, '0') }

function formatDate(d, withTime) {
  const datePart = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`
  if (!withTime) return datePart
  const hh = d.getHours(), mm = d.getMinutes()
  return (hh === 0 && mm === 0) ? datePart : `${datePart} ${pad2(hh)}:${pad2(mm)}`
}

export default function ExcelUpload({ onData, fileName, onClear, compact = false }) {
  const inputRef = useRef()
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')

  const parseFile = (file) => {
    setError('')
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      setError('Chỉ hỗ trợ file .xlsx, .xls hoặc .csv')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false, dateNF: 'dd/mm/yyyy' })
        // Đọc lại riêng các cột ngày ở dạng Date object thật (raw), tránh phụ thuộc định dạng hiển thị lệch
        const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true })
        const cleaned = rows.map((row, i) => {
          const rawRow = rawRows[i] || {}
          return Object.fromEntries(Object.entries(row).map(([k, v]) => {
            const key = k.trim()
            const rawVal = rawRow[k]
            const isDatetime = DATETIME_COLUMNS.includes(key)
            const isDateOnly = DATE_ONLY_COLUMNS.includes(key)
            if ((isDatetime || isDateOnly) && rawVal instanceof Date && !isNaN(rawVal)) {
              return [key, formatDate(rawVal, isDatetime)]
            }
            return [key, String(v).trim()]
          }))
        })
        onData(cleaned, file.name)
      } catch {
        setError('Không đọc được file. Vui lòng kiểm tra lại.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    parseFile(e.dataTransfer.files[0])
  }

  // Compact button mode (used in toolbar)
  if (compact) {
    return (
      <>
        <button
          onClick={() => inputRef.current.click()}
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:border-blue-400 hover:text-blue-600 text-gray-600 transition-colors"
        >
          <Upload size={14} />
          Upload tuần mới
        </button>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => parseFile(e.target.files[0])} />
      </>
    )
  }

  // Compact badge after upload
  if (fileName) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm w-fit">
        <FileSpreadsheet size={15} className="text-green-600 flex-shrink-0" />
        <span className="text-green-700 font-medium truncate max-w-72">{fileName}</span>
        <button
          onClick={onClear}
          className="ml-2 p-0.5 rounded hover:bg-green-100 text-green-400 hover:text-green-700 flex-shrink-0"
          title="Xóa file, quay về dữ liệu Google Sheets"
        >
          <X size={14} />
        </button>
      </div>
    )
  }

  // Large centered drop zone
  return (
    <div className="flex flex-col items-center justify-center py-10">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false) }}
        onDrop={handleDrop}
        onClick={() => inputRef.current.click()}
        className={`relative flex flex-col items-center justify-center gap-4 w-full max-w-xl h-64 rounded-2xl border-2 border-dashed cursor-pointer transition-all select-none
          ${dragging
            ? 'border-blue-500 bg-blue-50 scale-[1.02]'
            : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50/30'
          }`}
      >
        {/* Icon */}
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors ${dragging ? 'bg-blue-100' : 'bg-gray-100'}`}>
          {dragging
            ? <FileUp size={32} className="text-blue-500" />
            : <Upload size={32} className="text-gray-400" />
          }
        </div>

        {/* Text */}
        <div className="text-center">
          {dragging ? (
            <p className="text-blue-600 font-semibold text-base">Thả file vào đây</p>
          ) : (
            <>
              <p className="text-gray-700 font-semibold text-base">Kéo & thả file Excel vào đây</p>
              <p className="text-gray-400 text-sm mt-1">hoặc <span className="text-blue-600 underline font-medium">click để chọn file</span></p>
            </>
          )}
        </div>

        {/* Format hint */}
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="px-2 py-0.5 bg-gray-100 rounded font-mono">.xlsx</span>
          <span className="px-2 py-0.5 bg-gray-100 rounded font-mono">.xls</span>
          <span className="px-2 py-0.5 bg-gray-100 rounded font-mono">.csv</span>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => parseFile(e.target.files[0])}
      />
    </div>
  )
}
