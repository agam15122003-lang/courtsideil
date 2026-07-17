import { useState, useEffect } from 'react'
import { Star, Dumbbell, Bookmark, ClipboardList, Medal } from 'lucide-react'
import { supabase } from './supabaseClient'
import { SkeletonStats } from './Skeleton'
import { L } from './i18n'

// רמות "מאמן פעיל" — לפי תרומה לקהילה (תרגילים + תוכניות ששותפו)
const LEVELS = [0, 2, 5, 10, 20] // סף כניסה לכל רמה (רמה 1 = 0, רמה 5 = 20+)

// "המספרים שלך" + כרטיס רמה — צד שמאל של מסך הפרופיל (מסך היעד 11).
// props:
//   session - המשתמש המחובר
export default function MyStats({ session }) {
  const me = session.user.id
  const [stats, setStats] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      const { data: myDrills, error: err } = await supabase
        .from('drills')
        .select('id, drill_ratings(rating)')
        .eq('created_by', me)

      if (err) {
        setError(L('שגיאה בטעינת הנתונים: ', 'Error loading data: ') + err.message)
        return
      }

      const drillCount = myDrills?.length || 0
      let ratingSum = 0
      let ratingN = 0
      for (const d of myDrills || []) {
        for (const r of d.drill_ratings || []) {
          ratingSum += r.rating
          ratingN++
        }
      }
      const avgRating = ratingN ? ratingSum / ratingN : 0

      const { count: favCount } = await supabase
        .from('saved_drills')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', me)

      const { count: planCount } = await supabase
        .from('training_plans')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', me)

      setStats({
        drillCount,
        avgRating,
        ratingN,
        favCount: favCount || 0,
        planCount: planCount || 0,
      })
    }
    load()
  }, [me])

  if (error) return <div className="alert alert-error">{error}</div>
  if (!stats) return <div className="pr-card"><SkeletonStats count={4} /></div>

  // חישוב רמת מאמן פעיל
  const score = stats.drillCount + stats.planCount
  let level = 1
  for (let i = 0; i < LEVELS.length; i++) if (score >= LEVELS[i]) level = i + 1
  const maxLevel = level >= LEVELS.length
  const nextAt = maxLevel ? null : LEVELS[level]
  const prevAt = LEVELS[level - 1]
  const progress = maxLevel ? 100 : Math.round(((score - prevAt) / (nextAt - prevAt)) * 100)
  const missing = maxLevel ? 0 : nextAt - score

  return (
    <>
      <section className="pr-card">
        <h3 className="pr-card-title">{L('המספרים שלך', 'Your numbers')}</h3>
        <div className="pr-stats-grid">
          <div className="pr-stat">
            <span className="pr-stat-num">
              {stats.ratingN ? <><Star size={15} className="stat-star" aria-hidden="true" /> <bdi>{stats.avgRating.toFixed(1)}</bdi></> : '—'}
            </span>
            <span className="pr-stat-label">{L('דירוג ממוצע', 'Average rating')}</span>
          </div>
          <div className="pr-stat">
            <span className="pr-stat-num"><bdi>{stats.drillCount}</bdi></span>
            <span className="pr-stat-label">{L('תרגילים שיצרת', 'Drills you created')}</span>
          </div>
          <div className="pr-stat">
            <span className="pr-stat-num"><bdi>{stats.favCount}</bdi></span>
            <span className="pr-stat-label">{L('תרגילים במועדפים', 'Saved favorites')}</span>
          </div>
          <div className="pr-stat">
            <span className="pr-stat-num"><bdi>{stats.planCount}</bdi></span>
            <span className="pr-stat-label">{L('תוכניות שיצרת', 'Plans you created')}</span>
          </div>
        </div>
      </section>

      <section className="pr-level">
        <span className="pr-level-head"><Medal size={17} /> {L(`מאמן פעיל · רמה ${level}`, `Active coach · level ${level}`)}</span>
        <p className="pr-level-text">
          {maxLevel
            ? L('הגעת לרמה הגבוהה ביותר — כל הכבוד! הפרופיל שלך מקודם במאתר המאמנים.', 'You reached the top level — well done! Your profile is boosted in the coach finder.')
            : L(`עוד ${missing} ${missing === 1 ? 'תרגיל או תוכנית' : 'תרגילים או תוכניות'} ותגיע לרמה ${level + 1} — והפרופיל שלך יקודם במאתר המאמנים.`, `${missing} more ${missing === 1 ? 'drill or plan' : 'drills or plans'} to reach level ${level + 1} — and your profile gets boosted in the coach finder.`)}
        </p>
        <span className="pr-level-bar" aria-hidden="true"><span style={{ width: `${progress}%` }} /></span>
      </section>
    </>
  )
}
