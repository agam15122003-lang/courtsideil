import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { L } from './i18n'
import useFocusTrap from './useFocusTrap'

// דיאלוג אישור מעוצב בשפת האתר — מחליף את window.confirm המכוער.
// שימוש: const confirm = useConfirm(); ... if (await confirm({ title, message, danger })) { ... }
// מחזיר Promise<boolean>. הרכיב <ConfirmHost/> חייב להיות מרונדר פעם אחת בשורש.

let _open = null // הפונקציה שפותחת את הדיאלוג (מוגדרת ע"י ConfirmHost)

export function confirmDialog(opts) {
  if (!_open) return Promise.resolve(window.confirm(opts?.message || ''))
  return _open(opts || {})
}

export function useConfirm() {
  return confirmDialog
}

export function ConfirmHost() {
  const [state, setState] = useState(null) // { opts, resolve } | null

  // 12.9.2026 — ניקוי מוגן. _open הוא משתנה מודול יחיד, והניקוי איפס אותו
  // בלי לבדוק שהוא עדיין שלי. כשענף של App שהחזיק host התחלף לענף בלי host,
  // הניקוי מחק את ה-_open של ה-host **החי** שב-main.jsx — וה-effect שלו כבר
  // לא רץ שוב. מרגע זה כל confirmDialog נפל ל-window.confirm באנגלית ו-LTR,
  // כולל «לצאת בלי לשמור?» של המחברת. (המופעים הכפולים ב-App.jsx הוסרו גם הם.)
  useEffect(() => {
    const mine = (opts) => new Promise((resolve) => setState({ opts, resolve }))
    _open = mine
    return () => { if (_open === mine) _open = null }
  }, [])

  // 12.9.2026 — נעילת גלילת הרקע כל עוד הדיאלוג פתוח, בדיוק כמו PocketNav
  // ובית השחקן. בלעדיה הדף המשיך להיגלל מתחת לכיסוי הקבוע בזמן שהמיקוד
  // לכוד — באצבע זה נראה כאילו האישור צף והתוכן בורח מתחתיו.
  useEffect(() => {
    if (!state) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [!!state])

  const close = useCallback((val) => {
    setState((s) => {
      if (s) s.resolve(val)
      return null
    })
  }, [])

  // Escape + מלכודת פוקוס + החזרת פוקוס. שים לב: אין כאן Enter גלובלי —
  // קודם לכן הקשה על Enter בכל מקום במסך אישרה את הפעולה ההרסנית.
  // כפתור האישור מקבל פוקוס אוטומטי, ולכן Enter עובד ממילא כשהכוונה היא לאשר.
  const trapRef = useFocusTrap(!!state, () => close(false))

  if (!state) return null
  const { opts } = state
  const danger = opts.danger !== false // ברירת מחדל: אדום (מחיקה)

  return (
    <div className="cf-overlay" onClick={() => close(false)}>
      <div className="cf-modal" ref={trapRef} role="dialog" aria-modal="true"
        aria-labelledby="cf-title" onClick={(e) => e.stopPropagation()}>
        <button className="cf-x" onClick={() => close(false)} aria-label={L('סגור', 'Close')}>
          <X size={18} />
        </button>
        <div className={danger ? 'cf-ic danger' : 'cf-ic'}>
          <AlertTriangle size={22} />
        </div>
        <h3 className="cf-title" id="cf-title">{opts.title || L('לאשר פעולה?', 'Confirm action?')}</h3>
        {opts.message && <p className="cf-msg">{opts.message}</p>}
        <div className="cf-actions">
          <button className="btn-ghost" onClick={() => close(false)}>
            {opts.cancelText || L('ביטול', 'Cancel')}
          </button>
          <button
            className={danger ? 'btn-primary cf-danger' : 'btn-primary'}
            onClick={() => close(true)}
            autoFocus
          >
            {opts.confirmText || L('אישור', 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
