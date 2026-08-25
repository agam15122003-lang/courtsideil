import { useState, useMemo } from 'react'
import { Search, ChevronDown, Mail, Compass, ExternalLink, LifeBuoy, Rocket, Shield, ClipboardList, CalendarDays, MessagesSquare, Lock, Wrench } from 'lucide-react'
import { ArrowBack } from './DirIcon'
import { L } from './i18n'
import { CONTACT_EMAIL, SITE_URL } from './constants'
import { FAQ_CATEGORIES, faqItems } from './faqData'

// «שאלות ותשובות» — מסך אחד שעונה על מה שמאמן שואל, ונותן דרך לשאול
// כשאין תשובה. עד היום התשובות היחידות היו בדף הנחיתה, כלומר **לפני**
// ההתחברות: מאמן שנתקע בתוך האפליקציה לא היה לו לאן ללכת חוץ מלהתקשר.
//
// ⚠ המסך **לא** מציג את כל השאלות בבת אחת. 39 שאלות פרוסות זו אחר זו הן
// קיר טקסט שאף אחד לא קורא — בוחרים נושא, ורואים רק אותו. החיפוש הוא
// הקיצור למי שכבר יודע מה הוא מחפש.
//
// אין כאן טופס שנשלח לשרת. הקשר הוא מייל עם נושא וגוף מוכנים מראש —
// זה עובד גם בטלפון, לא דורש טבלה חדשה במסד, ולא נכשל בשקט.
const CAT_META = {
  'התחלה': { Icon: Rocket, sub: L('הצעדים הראשונים, ומה עושים כשהמסך ריק', 'First steps, and what to do with an empty screen') },
  'הקבוצה והסגל': { Icon: Shield, sub: L('שחקנים, נוכחות, ומה נשמר אצלך', 'Players, attendance, and what stays with you') },
  'אימונים ותרגילים': { Icon: ClipboardList, sub: L('תוכניות, ספריית התרגילים, ומה שהקהילה שיתפה', 'Plans, the drill library, and what the community shared') },
  'לו״ז וסקירה': { Icon: CalendarDays, sub: L('ימי אימון קבועים, נוכחות, עומס וסקירה', 'Fixed practice days, attendance, load and review') },
  'קהילה': { Icon: MessagesSquare, sub: L('מאמנים אחרים, הודעות ומשחקי אימון', 'Other coaches, messages and scrimmages') },
  'פרטיות וחשבון': { Icon: Lock, sub: L('מי רואה מה, סיסמה, ומחיקת חשבון', 'Who sees what, passwords, and deleting an account') },
  'תקלות': { Icon: Wrench, sub: L('כשמשהו לא נשמר, לא נטען או נראה שבור', 'When something is not saved, not loading, or looks broken') },
}

export default function Help({ profile, onStartTour }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [open, setOpen] = useState(null)
  const items = useMemo(() => faqItems(), [])

  const norm = (s) => (s || '').replace(/[״"׳'.,?!]/g, '').toLowerCase()
  const needle = norm(q.trim())
  const searching = needle.length > 0

  const counts = useMemo(() => {
    const c = {}
    for (const f of items) c[f.category] = (c[f.category] || 0) + 1
    return c
  }, [items])

  // חיפוש גובר על בחירת נושא: מי שמקליד רוצה תשובה, לא ניווט
  const shown = useMemo(() => {
    if (searching) return items.filter((f) => norm(f.q).includes(needle) || norm(f.a).includes(needle))
    if (cat) return items.filter((f) => f.category === cat)
    return []
  }, [items, cat, needle, searching])

  const groups = useMemo(() => {
    const out = []
    for (const c of FAQ_CATEGORIES) {
      const rows = shown.filter((f) => f.category === c)
      if (rows.length) out.push({ cat: c, rows })
    }
    return out
  }, [shown])

  const subject = encodeURIComponent(L('שאלה על CourtSide', 'A question about CourtSide'))
  const body = encodeURIComponent(
    L(
      `שלום,\n\nהשאלה שלי:\n\n\n—\n${profile?.first_name || ''} ${profile?.last_name || ''}\n${profile?.club || ''}\n${SITE_URL}\n`,
      `Hi,\n\nMy question:\n\n\n—\n${profile?.first_name || ''} ${profile?.last_name || ''}\n${profile?.club || ''}\n${SITE_URL}\n`
    )
  )
  const mailto = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`

  const pick = (c) => { setCat(c); setOpen(null); setQ('') }

  const item = (f) => {
    const id = f.category + '|' + f.q
    // בחיפוש התשובות פתוחות מאליהן — אחרת מצאת את השאלה וצריך עוד קליק
    const isOpen = open === id || searching
    return (
      <li key={id} className={isOpen ? 'hlp-item open' : 'hlp-item'}>
        <button type="button" className="hlp-q" aria-expanded={isOpen} onClick={() => setOpen(open === id ? null : id)}>
          <span>{f.q}</span>
          <ChevronDown size={17} className="hlp-chev" aria-hidden="true" />
        </button>
        {isOpen && <div className="hlp-a">{f.a}</div>}
      </li>
    )
  }

  return (
    <div className="hlp">
      <div className="hlp-search">
        <Search size={17} aria-hidden="true" />
        <input
          className="finder-input"
          type="search"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(null) }}
          placeholder={L('חיפוש בכל השאלות — נוכחות, תרגילים, שחקנים…', 'Search all questions — attendance, drills, players…')}
          aria-label={L('חיפוש בשאלות ותשובות', 'Search questions and answers')}
        />
      </div>

      {/* ---- מצב א: בחירת נושא (ברירת המחדל) ---- */}
      {!searching && !cat && (
        <>
          <p className="hlp-lede muted">
            {L('על מה תרצה לקרוא? בכל נושא כמה שאלות קצרות.', 'What would you like to read about? A few short questions in each topic.')}
          </p>
          <div className="hlp-grid">
            {FAQ_CATEGORIES.map((c) => {
              const meta = CAT_META[c] || {}
              const Icon = meta.Icon || LifeBuoy
              return (
                <button key={c} type="button" className="hlp-tile" onClick={() => pick(c)}>
                  <span className="hlp-tile-ic"><Icon size={19} aria-hidden="true" /></span>
                  <span className="hlp-tile-tx">
                    <b>{c}</b>
                    <span className="muted small">{meta.sub}</span>
                  </span>
                  <span className="hlp-tile-n">{counts[c] || 0}</span>
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* ---- מצב ב: נושא נבחר ---- */}
      {!searching && cat && (
        <>
          <div className="hlp-crumb">
            <button type="button" className="btn-soft hlp-back" onClick={() => { setCat(''); setOpen(null) }}>
              <ArrowBack size={15} aria-hidden="true" /> {L('כל הנושאים', 'All topics')}
            </button>
            <h2 className="hlp-group-title">{cat}</h2>
          </div>
          <ul className="hlp-list">{shown.map(item)}</ul>
        </>
      )}

      {/* ---- מצב ג: חיפוש ---- */}
      {searching && (
        groups.length === 0 ? (
          <div className="empty-state hlp-empty">
            <span className="empty-ic"><LifeBuoy size={26} /></span>
            <div className="empty-title">{L('לא מצאנו תשובה לזה', 'No answer for that')}</div>
            <p className="muted">{L('אולי ננסח אחרת? ואם לא — פשוט תשאל אותנו ונענה.', 'Try different words — or just ask us and we will answer.')}</p>
            <a className="btn-primary empty-cta" href={mailto}>
              <Mail size={16} aria-hidden="true" /> {L('שליחת השאלה במייל', 'Email your question')}
            </a>
          </div>
        ) : (
          <>
            <p className="hlp-lede muted">
              {L(`${shown.length} תשובות מתאימות`, `${shown.length} matching answers`)}
            </p>
            {groups.map((g) => (
              <section key={g.cat} className="hlp-group">
                <h2 className="hlp-group-title">{g.cat}</h2>
                <ul className="hlp-list">{g.rows.map(item)}</ul>
              </section>
            ))}
          </>
        )
      )}

      {/* צור קשר — באותו דף, כי מאמן שלא מצא תשובה לא צריך לחפש מסך נוסף */}
      <section className="hlp-contact">
        <h2 className="hlp-contact-title">{L('לא מצאת? תשאל אותנו', "Didn't find it? Ask us")}</h2>
        <p className="muted">
          {L('אין שאלה טיפשית. אם משהו לא ברור — זה כנראה אומר שצריך לתקן אותו אצלנו.',
             'There are no silly questions. If something is unclear, it usually means we should fix it.')}
        </p>
        <div className="hlp-acts">
          <a className="btn-primary hlp-mail" href={mailto}>
            <Mail size={16} aria-hidden="true" /> {L('שליחת מייל', 'Send an email')}
          </a>
          {onStartTour && (
            <button type="button" className="btn-soft" onClick={onStartTour}>
              <Compass size={16} aria-hidden="true" /> {L('הסיור המודרך מחדש', 'Replay the guided tour')}
            </button>
          )}
        </div>
        <p className="hlp-mail-line muted small">
          {L('או ישירות: ', 'Or directly: ')}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          {L(' · נענה תוך כמה ימים.', ' · We reply within a few days.')}
        </p>
        <p className="hlp-links muted small">
          <a href="/privacy.html" target="_blank" rel="noopener noreferrer">
            {L('מדיניות הפרטיות', 'Privacy policy')} <ExternalLink size={12} aria-hidden="true" />
          </a>
          <a href="/terms.html" target="_blank" rel="noopener noreferrer">
            {L('תנאי השימוש', 'Terms of use')} <ExternalLink size={12} aria-hidden="true" />
          </a>
          <a href="/accessibility.html" target="_blank" rel="noopener noreferrer">
            {L('הצהרת נגישות', 'Accessibility')} <ExternalLink size={12} aria-hidden="true" />
          </a>
        </p>
      </section>
    </div>
  )
}
