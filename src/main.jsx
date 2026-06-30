import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import Toaster from './Toaster.jsx'
import AccessibilityWidget from './AccessibilityWidget.jsx'
import { applyDir } from './i18n'
import './index.css'

applyDir() // קובע lang/dir על <html> לפי השפה השמורה

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <Toaster />
    <AccessibilityWidget />
  </React.StrictMode>,
)
