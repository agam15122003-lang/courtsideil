import { useState, useMemo } from 'react'
import { Search, ChevronDown, Mail, Compass, ExternalLink, LifeBuoy } from 'lucide-react'
import { L } from './i18n'
import { CONTACT_EMAIL, SITE_URL } from './constants'
import { FAQ_CATEGORIES, faqItems } from './faqData'

// «שאלות ותשובות» — מסך אחד שעונה על מה שמאמן שואל, ונותן דרך לשאול
// כשאין תשובה. עד היום התשובות היחידות היו בדף הנחיתה, כלומר **לפני**
// ההתחברות: מאמן שנתקע בתוך האפליקציה לא היה לו לאן ללכת חוץ מלהתקשר.
//
// אין כאן טופס שנשלח לשרת. הקשר הוא מייל עם נושא וגוף מוכנים מראש —
// זה עובד גם בטלפון, לא דורש טבלה חדשה במסד, ולא נכשל בשקט.
export default function Help({ profile, onStartTour }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [open, setOpen] = useState(null)
  const items = useMemo(() => faqItems(), [])

  const norm = (s) => (s || '').replace(/[״"׳'.,?!]/g, '').toLowerCase()
  const filtered = useMemo(() => {
    const needle = norm(q.trim())
    return items.filter((f) => {
      if (cat && f.category !== cat) return false
      if (!needle) return true
      return norm(f.q).includes(needle) || norm(f.a).includes(needle)
    })
  }, [items, q, cat])

  const searching = !!q.trim() || !!cat
  const groups = useMemo(() => {
    const out = []
    for (const c of FAQ_CATEGORIES) {
      const rows = filtered.filter((f) => f.category === c)
      if (rows.length) out.push({ cat: c, rows })
    }
    return out
  }, [filtered])

  const subject = encodeURIComponent(L('שאלה על CourtSide', 'A question about CourtSide'))
  const body = encodeURIComponent(
    L(
      `שלום,\n\nהשאלה שלי:\n\n\n—\n${profile?.first_name || ''} ${profile?.last_name || ''}\n${profile?.club || ''}\n${SITE_URL}\n`,
      `Hi,\n\nMy question:\n\n\n—\n${profile?.first_name || ''} ${profile?.last_name || ''}\n${profile?.club || ''}\n${SITE_URL}\n`
    )
  )
  const mailto = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`

  return (
    <div className="hlp">
      {/* חיפוש לפני הקטגוריות: מאמן עם שאלה מקלידה מילה אחת, הוא לא מחפש
          באיזו קטגוריה שמנו אותה */}
      <div className="hlp-search">
        <Search size={17} aria-hidden="true" />
        <input
          className="finder-input"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={L('מה אתה מחפש? למשל: נוכחות, תרגילים, שחקנים', 'What are you looking for? e.g. attendance, drills, players')}
          aria-label={L('חיפוש בשאלות ותשובות', 'Search questions and answers')}
        />
      </div>

      <div className="hlp-cats" role="group" aria-label={L('נושאים', 'Topics')}>
        <button type="button" className={cat === '' ? 'chip selected' : 'chip'} onClick={() => setCat('')} aria-pressed={cat === ''}>
          {L('הכול', 'All')}
        </button>
        {FAQ_CATEGORIES.map((c) => (
          <button key={c} type="button" className={cat === c ? 'chip selected' : 'chip'} onClick={() => setCat(cat === c ? '' : c)} aria-pressed={cat === c}>
            {c}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <div className="empty-state hlp-empty">
          <span className="empty-ic"><LifeBuoy size={26} /></span>
          <div className="empty-title">{L('לא מצאנו תשובה לזה', 'No answer for that')}</div>
          <p className="muted">{L('אולי ננסח אחרת? ואם לא — פשוט תשאל אותנו ונענה.', 'Try different words — or just ask us and we will answer.')}</p>
          <a className="btn-primary empty-cta" href={mailto}>
            <Mail size={16} aria-hidden="true" /> {L('שליחת השאלה במייל', 'Email your question')}
          </a>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.cat} className="hlp-group">
            <h2 className="hlp-group-title">{g.cat}</h2>
            <ul className="hlp-list">
              {g.rows.map((f) => {
                const id = f.category + '|' + f.q
                const isOpen = open === id || (searching && !!q.trim())
                return (
                  <li key={id} className={isOpen ? 'hlp-item open' : 'hlp-item'}>
                    <button
                      type="button"
                      className="hlp-q"
                      aria-expanded={isOpen}
                      onClick={() => setOpen(open === id ? null : id)}
                    >
                      <span>{f.q}</span>
                      <ChevronDown size={17} className="hlp-chev" aria-hidden="true" />
                    </button>
                    {isOpen && <div className="hlp-a">{f.a}</div>}
                  </li>
                )
              })}
            </ul>
          </section>
        ))
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
