import { useState, useEffect } from 'react'
import { Trophy, Star, ChevronLeft } from 'lucide-react'
import { supabase } from './supabaseClient'
import Avatar from './Avatar'
import { L } from './i18n'

// מאמן השבוע — שיטת ניקוד הוגנת:
//   • ממוצע כוכבים מתוקנן (Bayesian) — מונע ש"תרגיל בודד עם 5" ינצח עשרה תרגילים מצוינים.
//     score_quality = (C*m + סך הכוכבים) / (C + מס' הדירוגים)   [m=ממוצע גלובלי, C=משקל פריור]
//   • בונוס היקף — לפי מספר התרגילים שדורגו וכמות הדירוגים (יותר תוכן איכותי = יותר נקודות).
const M = 3.6   // ממוצע התחלתי משוער
const C = 6     // משקל הפריור (כמה דירוגים צריך כדי "להשתחרר" מהממוצע)
const coachScore = (sum, count, drills) =>
  (C * M + sum) / (C + count) + 0.30 * Math.log10(1 + drills) + 0.15 * Math.log10(1 + count)

export default function CoachOfWeek({ onOpenCoach }) {
  const [winner, setWinner] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
      const { data: ratings, error } = await supabase
        .from('drill_ratings').select('rating, drill_id').gte('created_at', since)
      if (error || !ratings || ratings.length === 0) {
        if (alive) { setWinner(null); setLoading(false) }
        return
      }

      const drillIds = [...new Set(ratings.map((r) => r.drill_id))]
      const { data: drills } = await supabase.from('drills').select('id, created_by').in('id', drillIds)
      const ownerOf = {}
      for (const d of drills || []) ownerOf[d.id] = d.created_by

      const agg = {}
      for (const r of ratings) {
        const owner = ownerOf[r.drill_id]
        if (!owner) continue
        if (!agg[owner]) agg[owner] = { sum: 0, count: 0, drills: new Set() }
        agg[owner].sum += r.rating; agg[owner].count += 1; agg[owner].drills.add(r.drill_id)
      }

      const ranked = Object.entries(agg)
        .map(([owner, a]) => ({
          owner, count: a.count, drills: a.drills.size, avg: a.sum / a.count,
          score: coachScore(a.sum, a.count, a.drills.size),
        }))
        .sort((x, y) => y.score - x.score || y.count - x.count)

      if (ranked.length === 0) { if (alive) { setWinner(null); setLoading(false) } return }

      const top = ranked[0]
      const { data: prof } = await supabase
        .from('profiles').select('*').eq('id', top.owner).single()

      if (alive) { setWinner({ ...top, profile: prof }); setLoading(false) }
    })()
    return () => { alive = false }
  }, [])

  if (loading) {
    return (
      <div className="cow-card is-skeleton">
        <div className="cow-badge"><Trophy size={16} /> {L('מאמן השבוע', 'Coach of the Week')}</div>
        <div className="skeleton skeleton-line" style={{ width: '60%', height: 22 }} />
      </div>
    )
  }

  if (!winner || !winner.profile) {
    return (
      <div className="cow-card cow-empty">
        <div className="cow-badge"><Trophy size={16} /> {L('מאמן השבוע', 'Coach of the Week')}</div>
        <p className="cow-empty-text">
          {L('עדיין לא נצבר מספיק דירוגים השבוע. דרגו תרגילים — והמאמן עם התרגילים הכי מדורגים יזכה בתואר! 🏀',
            'Not enough ratings this week yet. Rate drills — and the coach with the highest-rated drills earns the title! 🏀')}
        </p>
      </div>
    )
  }

  const p = winner.profile
  const fullName = `${p.first_name || ''} ${p.last_name || ''}`.trim() || L('מאמן', 'Coach')
  const rounded = Math.round(winner.avg)

  return (
    <button type="button" className="cow-card cow-win" onClick={() => onOpenCoach && onOpenCoach(p)} title={L('פתח את פרופיל המאמן', 'Open coach profile')}>
      <div className="cow-badge"><Trophy size={15} /> {L('מאמן השבוע', 'Coach of the Week')}</div>

      <div className="cow-main">
        <div className="cow-ava">
          <Avatar name={fullName} url={p.avatar_url} size={64} />
          <span className="cow-trophy"><Trophy size={15} /></span>
        </div>
        <div className="cow-info">
          <span className="cow-name">{fullName}</span>
          {p.club && <span className="cow-club">{p.club}</span>}
          <div className="cow-stars" aria-label={L(`דירוג ${winner.avg.toFixed(1)}`, `Rating ${winner.avg.toFixed(1)}`)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Star key={n} size={16} className={n <= rounded ? 'cow-star on' : 'cow-star'} />
            ))}
            <span className="cow-avg">{winner.avg.toFixed(1)}</span>
          </div>
        </div>
      </div>

      <div className="cow-foot">
        <div className="cow-stats">
          <span className="cow-stat"><strong>{winner.drills}</strong> {L('תרגילים', 'drills')}</span>
          <span className="cow-stat"><strong>{winner.count}</strong> {L('דירוגים', 'ratings')}</span>
        </div>
        <span className="cow-cta">{L('צפה בפרופיל', 'View profile')} <ChevronLeft size={15} /></span>
      </div>
    </button>
  )
}
