import { useState, useEffect } from 'react'
import { Star, Dumbbell, Bookmark, ClipboardList } from 'lucide-react'
import { supabase } from './supabaseClient'
import { SkeletonStats } from './Skeleton'
import { L } from './i18n'

// "האזור שלי" — סיכום אישי של המאמן (מהנתונים הקיימים, בלי טבלה חדשה).
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

  return (
    <div className="mystats welcome-card">
      <span className="welcome-badge">{L('הסטטיסטיקות שלי', 'My stats')}</span>
      <h3 className="section-title">{L('האזור שלי', 'My area')}</h3>
      <p className="muted small">{L('סיכום הפעילות שלך במערכת.', 'A summary of your activity in the app.')}</p>

      {error ? (
        <div className="alert alert-error" style={{ marginTop: 16 }}>
          {error}
        </div>
      ) : !stats ? (
        <SkeletonStats count={4} />
      ) : (
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-ic"><Dumbbell size={17} /></span>
            <div className="stat-num">{stats.drillCount}</div>
            <div className="stat-label">{L('תרגילים שהוספתי', 'Drills I added')}</div>
          </div>
          <div className="stat-card">
            <span className="stat-ic"><Star size={17} /></span>
            <div className="stat-num">{stats.ratingN ? stats.avgRating.toFixed(1) : '—'}</div>
            <div className="stat-label">{L('דירוג ממוצע שלי', 'My average rating')}</div>
          </div>
          <div className="stat-card">
            <span className="stat-ic"><Bookmark size={17} /></span>
            <div className="stat-num">{stats.favCount}</div>
            <div className="stat-label">{L('מועדפים', 'Favorites')}</div>
          </div>
          <div className="stat-card">
            <span className="stat-ic"><ClipboardList size={17} /></span>
            <div className="stat-num">{stats.planCount}</div>
            <div className="stat-label">{L('תוכניות אימון', 'Training plans')}</div>
          </div>
        </div>
      )}
    </div>
  )
}
