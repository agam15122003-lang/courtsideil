import { createPortal } from 'react-dom'
import { useState, useEffect, useRef } from 'react'
import {
  Accessibility,
  X,
  Plus,
  Minus,
  Contrast,
  Link2,
  Ban,
  Type,
  RotateCcw,
  Droplet,
  AlignJustify,
  Globe,
} from 'lucide-react'
import { useLang } from './i18n'

const KEY = 'a11y_v1'
const DEFAULTS = {
  fontStep: 0, // 0..4 → זום 100%–140%
  contrast: false,
  grayscale: false,
  links: false,
  motion: false,
  readable: false,
  spacing: false,
}
const MAX_STEP = 4

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return { ...DEFAULTS }
  }
}

// מחיל את ההגדרות על ה-DOM. הזום מוחל על #root בלבד —
// הווידג'ט עצמו מרונדר ב-portal ל-body כדי שלא יושפע.
function apply(s) {
  const root = document.getElementById('root')
  if (root) root.style.zoom = s.fontStep ? String(1 + s.fontStep * 0.1) : ''
  const de = document.documentElement
  de.classList.toggle('a11y-contrast', s.contrast)
  de.classList.toggle('a11y-grayscale', s.grayscale)
  de.classList.toggle('a11y-links', s.links)
  de.classList.toggle('a11y-motion', s.motion)
  de.classList.toggle('a11y-readable', s.readable)
  de.classList.toggle('a11y-spacing', s.spacing)
}

export default function AccessibilityWidget() {
  const { t, lang, setLang } = useLang()
  const [open, setOpen] = useState(false)
  const [statement, setStatement] = useState(false)
  const [settings, setSettings] = useState(load)
  const [pos, setPos] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('a11y_pos') || 'null')
    } catch {
      return null
    }
  })
  const drag = useRef({ active: false, moved: false, dx: 0, dy: 0 })

  // ---- גרירת כפתור הנגישות ----
  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const r = e.currentTarget.getBoundingClientRect()
    drag.current = { active: true, moved: false, dx: e.clientX - r.left, dy: e.clientY - r.top }
  }
  const onPointerMove = (e) => {
    const d = drag.current
    if (!d.active) return
    if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) d.moved = true
    const x = Math.max(8, Math.min(window.innerWidth - 60, e.clientX - d.dx))
    const y = Math.max(8, Math.min(window.innerHeight - 60, e.clientY - d.dy))
    setPos({ x, y })
  }
  const onPointerUp = () => {
    const d = drag.current
    if (!d.active) return
    d.active = false
    if (d.moved)
      setPos((p) => {
        try {
          localStorage.setItem('a11y_pos', JSON.stringify(p))
        } catch {
          /* ignore */
        }
        return p
      })
  }
  // קליק רגיל פותח/סוגר — אלא אם הייתה גרירה
  const onFabClick = () => {
    if (drag.current.moved) {
      drag.current.moved = false
      return
    }
    setOpen((o) => !o)
  }

  const fabStyle = pos
    ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto', insetInlineEnd: 'auto' }
    : undefined
  const panelStyle = pos
    ? (() => {
        const left = Math.max(8, Math.min(window.innerWidth - 308, pos.x))
        const below = pos.y < window.innerHeight / 2
        return below
          ? { left, top: pos.y + 60, right: 'auto', bottom: 'auto', insetInlineEnd: 'auto' }
          : {
              left,
              bottom: window.innerHeight - pos.y + 8,
              right: 'auto',
              top: 'auto',
              insetInlineEnd: 'auto',
            }
      })()
    : undefined

  useEffect(() => {
    apply(settings)
    localStorage.setItem(KEY, JSON.stringify(settings))
  }, [settings])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setStatement(false)
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const set = (patch) => setSettings((s) => ({ ...s, ...patch }))
  const toggle = (k) => set({ [k]: !settings[k] })
  const reset = () => setSettings({ ...DEFAULTS })

  const OPTS = [
    { k: 'contrast', Icon: Contrast, label: t('a11y.contrast') },
    { k: 'grayscale', Icon: Droplet, label: t('a11y.grayscale') },
    { k: 'links', Icon: Link2, label: t('a11y.links') },
    { k: 'motion', Icon: Ban, label: t('a11y.motion') },
    { k: 'readable', Icon: Type, label: t('a11y.readable') },
    { k: 'spacing', Icon: AlignJustify, label: t('a11y.spacing') },
  ]

  return createPortal(
    <>
      <button
        type="button"
        className="a11y-fab"
        style={fabStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={onFabClick}
        aria-label={t('a11y.menu')}
        aria-expanded={open}
        title={t('a11y.title')}
      >
        <Accessibility size={26} />
      </button>

      {open && (
        <div className="a11y-panel" style={panelStyle} role="dialog" aria-label={t('a11y.title')}>
          <div className="a11y-head">
            <span className="a11y-title">
              <Accessibility size={18} /> {t('a11y.title')}
            </span>
            <button
              type="button"
              className="a11y-close"
              onClick={() => setOpen(false)}
              aria-label={t('a11y.close')}
            >
              <X size={18} />
            </button>
          </div>

          {/* מתג שפה */}
          <div className="a11y-lang">
            <span className="a11y-lang-label">
              <Globe size={16} /> {t('a11y.language')}
            </span>
            <div className="a11y-lang-ctrl">
              <button
                type="button"
                className={lang === 'he' ? 'on' : ''}
                onClick={() => setLang('he')}
                aria-pressed={lang === 'he'}
              >
                עברית
              </button>
              <button
                type="button"
                className={lang === 'en' ? 'on' : ''}
                onClick={() => setLang('en')}
                aria-pressed={lang === 'en'}
              >
                English
              </button>
            </div>
          </div>

          {/* גודל טקסט */}
          <div className="a11y-font">
            <span className="a11y-font-label">
              <Type size={16} /> {t('a11y.textSize')}
            </span>
            <div className="a11y-font-ctrl">
              <button
                type="button"
                onClick={() => set({ fontStep: Math.max(0, settings.fontStep - 1) })}
                disabled={settings.fontStep === 0}
                aria-label={t('a11y.decrease')}
              >
                <Minus size={16} />
              </button>
              <span className="a11y-font-val">{100 + settings.fontStep * 10}%</span>
              <button
                type="button"
                onClick={() => set({ fontStep: Math.min(MAX_STEP, settings.fontStep + 1) })}
                disabled={settings.fontStep === MAX_STEP}
                aria-label={t('a11y.increase')}
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          <div className="a11y-grid">
            {OPTS.map(({ k, Icon, label }) => (
              <button
                key={k}
                type="button"
                className={'a11y-opt' + (settings[k] ? ' on' : '')}
                onClick={() => toggle(k)}
                aria-pressed={settings[k]}
              >
                <Icon size={20} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          <button type="button" className="a11y-reset" onClick={reset}>
            <RotateCcw size={15} /> {t('a11y.reset')}
          </button>

          <button
            type="button"
            className="a11y-statement-link"
            onClick={() => setStatement(true)}
          >
            {t('a11y.statementLink')}
          </button>
        </div>
      )}

      {/* הצהרת נגישות מלאה */}
      {statement && (
        <div className="a11y-modal-overlay" onClick={() => setStatement(false)}>
          <div
            className="a11y-modal"
            role="dialog"
            aria-label={t('a11y.st.title')}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="a11y-head">
              <span className="a11y-title">{t('a11y.st.title')}</span>
              <button
                type="button"
                className="a11y-close"
                onClick={() => setStatement(false)}
                aria-label={t('a11y.close')}
              >
                <X size={18} />
              </button>
            </div>
            <div className="a11y-modal-body">
              <p>{t('a11y.st.intro')}</p>
              <p>{t('a11y.st.level')}</p>
              <p>{t('a11y.st.tools')}</p>
              <p>{t('a11y.st.limitations')}</p>
              <h4>{t('a11y.st.coordinatorTitle')}</h4>
              <p>{t('a11y.st.coordinator')}</p>
              <ul>
                <li>{t('a11y.st.namePlaceholder')}</li>
                <li dir="ltr">
                  <a href="mailto:coachadiriagam@gmail.com">coachadiriagam@gmail.com</a>
                </li>
                <li dir="ltr">
                  <a href="tel:+972526268252">{t('a11y.st.phonePlaceholder')}</a>
                </li>
              </ul>
              <p className="a11y-st-date">{t('a11y.st.updated')}</p>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  )
}
