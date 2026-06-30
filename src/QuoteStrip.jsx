import { useState, useEffect } from 'react'
import { COACHING_QUOTES } from './constants'
import { L } from './i18n'

// רצועת ציטוט קומפקטית בראש כל מסך — מתחלפת כל דקה (זמן לקרוא).
export default function QuoteStrip() {
  const [qi, setQi] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setQi((i) => (i + 1) % COACHING_QUOTES.length), 60000)
    return () => clearInterval(t)
  }, [])
  const q = COACHING_QUOTES[qi]
  return (
    <div className="quote-strip" key={qi}>
      <span className="quote-strip-mark" aria-hidden="true">"</span>
      <span className="quote-strip-text">{L(q.text, q.text_en)}</span>
      <span className="quote-strip-author">— {L(q.author, q.author_en)}</span>
    </div>
  )
}
