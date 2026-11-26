import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { Root } from './app/Root.tsx'

// Đặt chiều cao ứng dụng đúng bằng phần màn hình nhìn thấy (trừ thanh địa chỉ / thanh dưới của trình duyệt)
const setAppHeight = () => {
  document.documentElement.style.setProperty('--app-h', `${window.innerHeight}px`)
}
setAppHeight()
window.addEventListener('resize', setAppHeight)
window.addEventListener('orientationchange', () => setTimeout(setAppHeight, 300))
window.visualViewport?.addEventListener('resize', setAppHeight)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
