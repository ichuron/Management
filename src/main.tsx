import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { applyTheme, loadTheme, watchSystemTheme } from './lib/theme'
import './index.css'

applyTheme(loadTheme())
watchSystemTheme(loadTheme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
