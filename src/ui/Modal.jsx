// מודאל נגיש אחוד — פוקוס כלוא, Escape סוגר, פוקוס חוזר לפותח,
// אנימציית כניסה/יציאה עם framer-motion (מכבד prefers-reduced-motion).
// משתמש במחלקות .tm-overlay/.tm-modal הקיימות; tm-motion מבטל את אנימציית ה-CSS הישנה.
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { m, AnimatePresence, useReducedMotion, motionOff, EASE_OUT, DUR_BASE, DUR_FAST } from './motion'
import { L } from '../i18n'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  const boxRef = useRef(null)
  const lastActive = useRef(null)
  const reduced = useReducedMotion()

  // onClose נשמר ב-ref — כך האפקט תלוי רק ב-open, ולכידת הפוקוס לא נקרעת
  // ומתאתחלת בכל רינדור של ההורה (למשל כשמצב loading של כפתור המחיקה משתנה)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    lastActive.current = document.activeElement

    // פוקוס ראשוני — הפקד הראשון בתוכן, ואם אין: החלון עצמו
    const t = setTimeout(() => {
      const el = boxRef.current
      if (!el) return
      const first = el.querySelector(`.tm-body ${FOCUSABLE.split(', ').join(', .tm-body ')}`) || el.querySelector(FOCUSABLE)
      ;(first || el).focus()
    }, 0)

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current?.()
        return
      }
      if (e.key !== 'Tab') return
      const el = boxRef.current
      if (!el) return
      const items = [...el.querySelectorAll(FOCUSABLE)].filter(
        (n) => n.offsetParent !== null || n === document.activeElement
      )
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey, true)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = prevOverflow
      lastActive.current?.focus?.()
    }
  }, [open])

  const noMotion = reduced || motionOff()
  const durIn = noMotion ? 0 : DUR_BASE
  const durOut = noMotion ? 0 : DUR_FAST

  return createPortal(
    <AnimatePresence>
      {open && (
        <m.div
          className="tm-overlay tm-motion"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: durIn } }}
          exit={{ opacity: 0, transition: { duration: durOut } }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose?.()
          }}
        >
          <m.div
            ref={boxRef}
            className={`tm-modal tm-motion${size !== 'md' ? ` tm-modal--${size}` : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === 'string' ? title : undefined}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: { duration: durIn, ease: EASE_OUT } }}
            exit={{ opacity: 0, scale: 0.97, y: 8, transition: { duration: durOut, ease: 'easeIn' } }}
          >
            {(title || onClose) && (
              <div className="tm-head">
                {title ? <h3 className="tm-title">{title}</h3> : <span />}
                {onClose && (
                  <button type="button" className="icon-btn tm-close" onClick={onClose} aria-label={L('סגירה', 'Close')}>
                    <X size={18} />
                  </button>
                )}
              </div>
            )}
            <div className="tm-body">{children}</div>
            {footer && <div className="tm-foot">{footer}</div>}
          </m.div>
        </m.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
