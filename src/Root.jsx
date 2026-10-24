import { lazy, Suspense } from 'react'
import App from './App.jsx'

// Link riêng của kế toán (#ketoan=<mã>): mở trang "Việc của kế toán", không qua đăng nhập của app chính.
const KeToanPage = lazy(() => import('./components/KeToanPage.jsx'))

export default function Root() {
  if (window.location.hash.startsWith('#ketoan')) return <Suspense fallback={null}><KeToanPage /></Suspense>
  return <App />
}
