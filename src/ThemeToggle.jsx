import { useState, useEffect } from 'react'
import { Moon, Sun } from 'lucide-react'
import { L } from './i18n'

// כפתור מעבר בין מצב בהיר לכהה. שומר את הבחירה ב-localStorage.
export default function ThemeToggle() {
  const [dark, setDark] = useState(
    () => document.documentElement.getAttribute('data-theme') === 'dark'
  )

  // סנכרון בין מופעים מרובים (סרגל עליון + פוטר) — כל מופע מאזין לשינוי
  useEffect(() => {
    const sync = () =>
      setDark(document.documentElement.getAttribute('data-theme') === 'dark')
    window.addEventListener('themechange', sync)
    return () => window.removeEventListener('themechange', sync)
  }, [])

  const toggle = () => {
    const next = !dark
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light')
    localStorage.setItem('theme', next ? 'dark' : 'light')
    window.dispatchEvent(new Event('themechange')) // מעדכן את כל המופעים
  }

  return (
    <button
      className="btn-ghost icon-toggle"
      onClick={toggle}
      title={L('מצב כהה / בהיר', 'Dark / light mode')}
      aria-label={L('החלפת מצב תצוגה', 'Toggle theme')}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
