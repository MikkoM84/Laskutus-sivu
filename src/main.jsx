import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Invoice from './Invoice.jsx'
import { LanguageProvider } from './LanguageContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LanguageProvider>
      <Invoice />
    </LanguageProvider>
  </StrictMode>,
)
