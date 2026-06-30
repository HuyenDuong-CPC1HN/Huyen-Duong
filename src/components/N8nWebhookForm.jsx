import { useState } from 'react'
import { Send, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { sendToN8n } from '../utils/sendToN8n'

const INIT = { name: '', email: '', message: '' }

export default function N8nWebhookForm() {
  const [form, setForm] = useState(INIT)
  const [status, setStatus] = useState(null) // null | 'loading' | 'success' | 'error'
  const [errorMsg, setErrorMsg] = useState('')

  const handleChange = e => {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
  }

  const handleSubmit = async e => {
    e.preventDefault()
    setStatus('loading')
    setErrorMsg('')

    const result = await sendToN8n({
      ...form,
      sentAt: new Date().toISOString(),
    })

    if (result.success) {
      setStatus('success')
      setForm(INIT)
    } else {
      setStatus('error')
      setErrorMsg(result.error)
    }
  }

  const handleReset = () => {
    setStatus(null)
    setErrorMsg('')
  }

  return (
    <div className="max-w-lg mx-auto mt-6">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Gửi dữ liệu lên n8n</h2>
        <p className="text-sm text-gray-400 mb-5">
          Dữ liệu sẽ được gửi qua Webhook đến hệ thống n8n của CPC1HN.
        </p>

        {/* Thành công */}
        {status === 'success' && (
          <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-lg p-4 mb-5">
            <CheckCircle2 size={20} className="text-green-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-green-800">Gửi thành công!</p>
              <p className="text-xs text-green-600 mt-0.5">n8n đã nhận được dữ liệu của bạn.</p>
            </div>
            <button onClick={handleReset} className="text-xs text-green-600 hover:underline">Gửi tiếp</button>
          </div>
        )}

        {/* Lỗi */}
        {status === 'error' && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4 mb-5">
            <XCircle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">Gửi thất bại</p>
              <p className="text-xs text-red-600 mt-0.5">{errorMsg}</p>
            </div>
            <button onClick={handleReset} className="text-xs text-red-600 hover:underline">Thử lại</button>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Họ tên</label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              placeholder="Nguyễn Văn A"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
              placeholder="example@cpc1hn.com"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nội dung</label>
            <textarea
              name="message"
              value={form.message}
              onChange={handleChange}
              required
              rows={4}
              placeholder="Nhập nội dung cần gửi..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
          >
            {status === 'loading' ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Đang gửi...
              </>
            ) : (
              <>
                <Send size={16} />
                Gửi đến n8n
              </>
            )}
          </button>
        </form>

        <p className="text-xs text-gray-400 mt-4 text-center">
          Webhook: <span className="font-mono">n8n.cpc1hn.com/webhook/Claude Web App</span>
        </p>
      </div>
    </div>
  )
}
