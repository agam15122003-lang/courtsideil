import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { L } from './i18n'

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

  useEffect(() => {
    _open = (opts) =>
      new Promise((resolve) => setState({ opts, resolve }))
    return () => { _open = null }
  }, [])

  const close = useCallback((val) => {
    setState((s) => {
      if (s) s.resolve(val)
      return null
    })
  }, [])

  useEffect(() => {
    if (!state) return
    const onKey = (e) => {
      if (e.key === 'Escape') close(false)
      if (e.key === 'Enter') close(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, close])

  if (!state) return null
  const { opts } = state
  const danger = opts.danger !== false // ברירת מחדל: אדום (מחיקה)

  return (
    <div className="cf-overlay" onClick={() => close(false)} role="dialog" aria-modal="true">
      <div className="cf-modal" onClick={(e) => e.stopPropagation()}>
        <button className="cf-x" onClick={() => close(false)} aria-label={L('סגור', 'Close')}>
          <X size={18} />
        </button>
        <div className={danger ? 'cf-ic danger' : 'cf-ic'}>
          <AlertTriangle size={22} />
        </div>
        <h3 className="cf-title">{opts.title || L('לאשר פעולה?', 'Confirm action?')}</h3>
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
