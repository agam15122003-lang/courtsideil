import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import Toaster from './Toaster.jsx'
import AccessibilityWidget from './AccessibilityWidget.jsx'
import { ConfirmHost } from './confirm.jsx'
import { applyDir } from './i18n'
import { inject } from '@vercel/analytics'
import './index.css'

applyDir() // קובע lang/dir על <html> לפי השפה השמורה

// אנליטיקס (Vercel) — סקריפט same-origin, עומד ב-CSP; פועל רק בפרודקשן
if (import.meta.env.PROD) inject()

// Service worker — התקנה כאפליקציה וטעינה מהירה (פרודקשן בלבד)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* לא קריטי */ })
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <Toaster />
    <ConfirmHost />
    <AccessibilityWidget />
  </React.StrictMode>,
)
