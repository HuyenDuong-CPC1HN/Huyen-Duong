import { useState } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { Eye, EyeOff, LogIn, Loader2 } from 'lucide-react'
import { auth } from '../firebase'
import cpcLogo from '../assets/cpc1hn_logo.png'

const ERROR_MESSAGES = {
  'auth/invalid-credential': 'Email hoặc mật khẩu không đúng.',
  'auth/invalid-email': 'Email không hợp lệ.',
  'auth/too-many-requests': 'Bạn đã thử sai quá nhiều lần, vui lòng thử lại sau.',
  'auth/network-request-failed': 'Lỗi kết nối mạng, vui lòng kiểm tra lại internet.',
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
    } catch (err) {
      setError(ERROR_MESSAGES[err.code] || 'Đăng nhập thất bại. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-shell">
      <main className="login-card">
        <img className="login-logo" src={cpcLogo} alt="CPC1HN" width="100" height="100" />

        <div className="login-heading">
          <h1>Chào mừng quay trở lại</h1>
          <p>Đăng nhập để tiếp tục vào Báo cáo giao hàng.</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-floating-field">
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="username"
              placeholder=" "
            />
            <label htmlFor="email">Email</label>
          </div>
          <div className="login-floating-field login-password-field">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder=" "
            />
            <label htmlFor="password">Mật khẩu</label>
            <button
              type="button"
              className="login-password-toggle"
              aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              aria-pressed={showPassword}
              onClick={() => setShowPassword(value => !value)}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {error && (
            <p className="login-error" role="alert">{error}</p>
          )}

          <button type="submit" disabled={loading} className="login-submit">
            {loading ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>
      </main>
    </div>
  )
}
