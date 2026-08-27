import { useState, useEffect, useCallback } from 'react'
import { Dumbbell, Star, Clock, Globe2, Lock } from 'lucide-react'
// צ'יברון "המשך" כיווני דרך DirIcon (חוק RTL)
import { ChevronFwd } from './DirIcon'
import { supabase } from './supabaseClient'
import { L, tr } from './i18n'
import { SkeletonCards } from './Skeleton'
import { ErrorState } from './states'

// "התרגילים שלי" — כל התרגילים שהמאמן יצר, במרוכז (עמוד הפרופיל, לפי ה-handoff).
// props: session, onNavigate(viewId)
export default function MyDrills({ session, onNavigate }) {
  const [drills, setDrills] = useState(null) // null = בטעינה
  // עד היום שגיאה הומרה כאן לרשימה ריקה, כך שכשל רשת הציג «עוד לא יצרת
  // תרגילים» למאמן שיש לו תרגילים. מצב שגיאה נפרד, עם דרך התאוששות.
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    setFailed(false)
    const { data, error } = await supabase
      .from('drills')
      .select('id, title, category, duration_minutes, is_public, drill_ratings(rating)')
      .eq('created_by', session.user.id)
      .order('created_at', { ascending: false })
    if (error) { setFailed(true); setDrills([]); return }
    setDrills(data || [])
  }, [session.user.id])

  useEffect(() => { load() }, [load])

  const avgOf = (d) => {
    const r = d.drill_ratings || []
    return r.length ? (r.reduce((s, x) => s + x.rating, 0) / r.length).toFixed(1) : null
  }

  return (
    <section className="pr-card md-card">
      <div className="md-head">
        <h3 className="pr-card-title"><Dumbbell size={17} /> {L('התרגילים שלי', 'My drills')}</h3>
        {drills && drills.length > 0 && (
          <button type="button" className="link-button" onClick={() => onNavigate('drills')}>
            {L('לספרייה', 'Open library')} <ChevronFwd size={14} />
          </button>
        )}
      </div>

      {drills === null ? (
        <SkeletonCards count={3} lines={1} />
      ) : failed ? (
        <ErrorState compact message={L('לא הצלחנו לטעון את התרגילים שלך.', "We couldn't load your drills.")} onRetry={load} />
      ) : drills.length === 0 ? (
        <div className="md-empty">
          <p className="muted small" style={{ margin: 0 }}>
            {L('עוד לא יצרת תרגילים. התרגיל הראשון שלך מחכה במחברת המאמן.', "You haven't created drills yet. Your first drill is waiting in the coach notebook.")}
          </p>
          <button type="button" className="btn-soft" onClick={() => onNavigate('drills')}>
            {L('ליצירת תרגיל', 'Create a drill')}
          </button>
        </div>
      ) : (
        <ul className="md-list">
          {drills.map((d) => (
            <li key={d.id} className="md-item">
              <span className="md-title">{d.title}</span>
              <span className="md-meta">
                {d.category && <span className="md-cat">{tr(d.category)}</span>}
                {d.duration_minutes && (
                  <span><Clock size={12} /> {d.duration_minutes} {L('דק׳', 'min')}</span>
                )}
                {avgOf(d) && (
                  <span className="md-rate"><Star size={12} /> {avgOf(d)}</span>
                )}
                <span className="md-vis">
                  {d.is_public !== false
                    ? <><Globe2 size={12} /> {L('משותף', 'Shared')}</>
                    : <><Lock size={12} /> {L('פרטי', 'Private')}</>}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
