import { useRef, useState } from 'react'
import { Info, XCircle } from 'lucide-react'
import { ChevronBack } from './DirIcon'
import { L } from './i18n'

// 1d · הרשמה · שחקן עם קוד — המסך הכהה המלא.
//
// הקוד **אלפאנומרי**, לא שש ספרות: הנתיב ב-App.jsx הוא
// /^#\/join\/([A-Z0-9]{4,10})/i, והמסך הזה הוא הקלט הידני לאותו מפתח
// עבור מי שלא הגיע מלינק. מה שנשמר ב-localStorage('pending_join_code')
// הוא מה ש-PlayerDashboard צורך אחרי יצירת החשבון — אותו מפתח, אותו פורמט.

const CELLS = 6
// המינימום זהה לרג'קס של App.jsx — קוד קצר מזה לא יזוהה גם בלינק
const MIN_LEN = 4

// נרמול קלט: אותיות גדולות בלבד, בלי רווחים, מקפים או תווים עבריים
const clean = (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

export default function JoinWithCode({ onJoin, onBack, onSkip }) {
  const [cells, setCells] = useState(() => Array(CELLS).fill(''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const refs = useRef([])

  const code = cells.join('')

  const focusCell = (i) => {
    const el = refs.current[Math.max(0, Math.min(CELLS - 1, i))]
    if (!el) return
    el.focus()
    el.select?.()
  }

  // התאוששות משגיאה: מנקים ומחזירים את הפוקוס לתא הראשון
  const resetCode = () => {
    setCells(Array(CELLS).fill(''))
    setError(null)
    focusCell(0)
  }

  // ---------- שליחה ----------
  const submit = async (value) => {
    const joinCode = clean(value)
    if (joinCode.length < MIN_LEN) {
      setError(
        L(
          'הקוד קצר מדי — צריך לפחות ארבעה תווים. בדוק מול המאמן שהעתקת את כולו.',
          'That code is too short — at least four characters. Check with your coach that you copied all of it.',
        ),
      )
      return
    }

    setError(null)
    setBusy(true)
    try {
      localStorage.setItem('pending_join_code', joinCode)
    } catch {
      /* מצב פרטי / אחסון חסום — לא עוצר את ההרשמה */
    }
    try {
      await onJoin?.(joinCode)
    } catch {
      // שגיאה היא לעולם לא "אין נתונים" — הודעה + דרך יציאה (DESIGN.md §6)
      setError(
        L(
          'לא הצלחנו להמשיך עם הקוד הזה. בדוק אותו מול המאמן ונסה שוב.',
          "We couldn't continue with that code. Check it with your coach and try again.",
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  // ---------- מילוי תאים ----------
  // כותב רצף תווים מהתא start והלאה. משמש גם להקלדה (תו אחד),
  // גם להדבקה וגם למילוי אוטומטי של הדפדפן (מחרוזת שלמה בתא אחד).
  const writeCells = (start, text) => {
    const chars = clean(text).split('')
    if (!chars.length) return

    const next = [...cells]
    let i = start
    for (const ch of chars) {
      if (i >= CELLS) break
      next[i] = ch
      i += 1
    }
    setCells(next)
    setError(null)

    // קוד מלא = שליחה אוטומטית, בלי לחכות ללחיצה
    if (next.every(Boolean)) {
      focusCell(CELLS - 1)
      submit(next.join(''))
    } else {
      focusCell(i)
    }
  }

  const handleChange = (i, raw) => {
    const value = clean(raw)
    if (!value) {
      const next = [...cells]
      next[i] = ''
      setCells(next)
      setError(null)
      return
    }
    writeCells(i, value)
  }

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace') {
      // תא ריק → חוזרים אחורה ומוחקים שם. תא מלא → מחיקה רגילה (onChange)
      if (cells[i]) return
      e.preventDefault()
      if (i === 0) return
      const next = [...cells]
      next[i - 1] = ''
      setCells(next)
      setError(null)
      focusCell(i - 1)
      return
    }
    // המכל הוא dir="ltr" קבוע, ולכן שמאל=הקודם וימין=הבא בשתי השפות
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      focusCell(i - 1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      focusCell(i + 1)
    }
  }

  const handlePaste = (i, e) => {
    const text = clean(e.clipboardData?.getData('text'))
    if (!text) return
    e.preventDefault()
    // הדבקה של קוד מלא ממלאת מהתא הראשון, גם אם הפוקוס באמצע
    writeCells(text.length >= CELLS ? 0 : i, text)
  }

  return (
    <div className="auth-page csa csa--dark cjc">
      {/* תמונת המגרש ב-opacity .16 מתחת לכל התוכן, לפי 1d בפרוטוטייפ */}
      <span className="cjc-art" aria-hidden="true">
        <img className="csa-banner-img cjc-img" src="/auth-court.jpg" alt="" />
      </span>
      <span className="cjc-veil" aria-hidden="true" />

      <div className="csa-sheet">
        <div className="csa-sheet-in">
          {onBack && (
            <button type="button" className="csa-back" onClick={onBack}>
              <ChevronBack size={17} /> {L('חזרה לבחירת תפקיד', 'Back to role selection')}
            </button>
          )}

          <form
            className="csa-form"
            onSubmit={(e) => {
              e.preventDefault()
              submit(code)
            }}
          >
            <div className="cjc-head">
              <span className="csa-eyebrow">{L('הרשמה · שחקן', 'Sign up · Player')}</span>
              <h1 className="csa-title">{L('יש לך קוד מהמאמן?', 'Got a code from your coach?')}</h1>
              <p className="csa-sub">
                {L(
                  'מקלידים את הקוד שהמאמן שלח. הוא מחבר אותך לקבוצה הנכונה — בלי לחכות לאישור ידני.',
                  'Type in the code your coach sent. It connects you to the right team — with no manual approval to wait for.',
                )}
              </p>
            </div>

            <div className="cjc-code-wrap">
              <div
                className="csa-code"
                dir="ltr"
                role="group"
                aria-label={L('קוד הקבוצה', 'Team code')}
                aria-describedby="cjc-code-hint"
              >
                {cells.map((ch, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      refs.current[i] = el
                    }}
                    type="text"
                    inputMode="text"
                    /* מילוי אוטומטי רק בתא הראשון — אחרת דפדפנים מסוימים
                       דוחפים את הקוד המלא לכל שישת התאים */
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    autoCorrect="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    maxLength={1}
                    /* placeholder ריק מפעיל את :placeholder-shown = תא ריק מקווקו */
                    placeholder=" "
                    value={ch}
                    aria-label={L(`תו ${i + 1} מתוך ${CELLS}`, `Character ${i + 1} of ${CELLS}`)}
                    aria-invalid={error ? 'true' : undefined}
                    disabled={busy}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => handleChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    onPaste={(e) => handlePaste(i, e)}
                  />
                ))}
              </div>
              <p className="csa-code-hint" id="cjc-code-hint">
                {L('אותיות ומספרים · לא מבדיל בין גדולות לקטנות', 'Letters and numbers · not case-sensitive')}
              </p>
            </div>

            {error && (
              <div className="csa-note csa-note--danger csa-note-col" role="alert">
                <span className="cjc-note-row">
                  <XCircle size={18} aria-hidden="true" />
                  <span>{error}</span>
                </span>
                <button type="button" className="csa-note-act" onClick={resetCode}>
                  {L('ניקוי הקוד והקלדה מחדש', 'Clear the code and retype')}
                </button>
              </div>
            )}

            <button
              type="submit"
              className={busy ? 'btn-primary is-busy' : 'btn-primary'}
              disabled={busy || code.length < MIN_LEN}
            >
              {busy ? (
                <>
                  <span className="csa-spin" aria-hidden="true" />
                  {L('רגע...', 'One moment...')}
                </>
              ) : (
                L('הצטרפות לקבוצה', 'Join the team')
              )}
            </button>

            <div className="auth-divider">
              <span>{L('או', 'or')}</span>
            </div>

            {/* החלטת הבעלים: שחקן בלי קוד נרשם כמשתמש מלא בלי קבוצה */}
            <button type="button" className="link-button cjc-skip" onClick={onSkip}>
              {L('אין לי קוד — להירשם ולחפש קבוצה אחר כך', "I don't have a code — sign up and find a team later")}
            </button>

            <div className="csa-note cjc-note">
              <Info size={18} aria-hidden="true" />
              <span>
                {L(
                  'מתחת לגיל 16? נשלח אישור הורה למייל שתזין בשלב הבא — עד שההורה מאשר, המאמן לא רואה את הפרטים.',
                  'Under 16? We will email a parental consent request to the address you enter next — until a parent approves, the coach cannot see your details.',
                )}
              </span>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
