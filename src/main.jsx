import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if (typeof window !== 'undefined' && typeof window.__hideBootFallback === 'function') {
  window.__hideBootFallback()
}
