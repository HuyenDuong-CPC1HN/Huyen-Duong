import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { reloadForNewVersion } from './utils/staleChunk'

// App vừa deploy bản mới khi tab đang mở: file JS cũ không còn, tự tải lại trang 1 lần để lấy bản mới.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForNewVersion()) event.preventDefault()
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if (typeof window !== 'undefined' && typeof window.__hideBootFallback === 'function') {
  window.__hideBootFallback()
}
