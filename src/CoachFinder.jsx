import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { AGE_GROUPS, ageOf } from './constants'
import { L, tr, trTeam } from './i18n'
import CoachProfile from './CoachProfile'
import GamesBoard from './GamesBoard'
import Avatar from './Avatar'
import MultiSelect from './MultiSelect'
import { SkeletonCards } from './Skeleton'
import ReportButton, { VerifiedBadge } from './ReportButton'
import { Users } from 'lucide-react'

// טאב "מאמנים" — מתג בין מאתר מאמנים ללוח משחקי אימון.
// props:
//   session - המשתמש המחובר (כדי לא להציג אותך בתוצאות שלך עצמך)
export default function CoachFinder({ session, initialCoach, onConsumeInitial, initialTab, onConsumeInitialTab }) {
  const [mode, setMode] = useState(initialTab || 'coaches') // 'coaches' | 'games'
  // ניתוב עומק — למשל "ללוח המשחקים" מטאב המשחקים בקבוצות
  useEffect(() => {
    if (initialTab) {
      setMode(initialTab)
      if (onConsumeInitialTab) onConsumeInitialTab()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab])
  const [coaches, setCoaches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedCoach, setSelectedCoach] = useState(null) // מאמן שנבחר לצפייה
  const [composeOnOpen, setComposeOnOpen] = useState(false) // לפתוח את תיבת ההודעה מיד

  const [clubQuery, setClubQuery] = useState('')
  const [ageFilter, setAgeFilter] = useState([])

  useEffect(() => {
    async function loadCoaches() {
      setLoading(true)
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .neq('id', session.user.id)

      if (error) {
        setError(L('שגיאה בטעינת המאמנים: ', 'Error loading coaches: ') + error.message)
      } else {
        const complete = (data || []).filter(
          (c) => c.first_name && c.last_name && c.club
        )
        setCoaches(complete)
      }
      setLoading(false)
    }
    loadCoaches()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  // פתיחה ישירה של מאמן שהגיע מבחוץ (למשל "מאמן השבוע")
  useEffect(() => {
    if (initialCoach) {
      setMode('coaches')
      setComposeOnOpen(false)
      setSelectedCoach(initialCoach)
      onConsumeInitial && onConsumeInitial()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCoach])

  const toggleAge = (group) => {
    setAgeFilter((current) =>
      current.includes(group)
        ? current.filter((g) => g !== group)
        : [...current, group]
    )
  }

  const clearFilters = () => {
    setClubQuery('')
    setAgeFilter([])
  }

  const results = coaches.filter((c) => {
    const q = clubQuery.trim().toLowerCase()
    const haystack = `${c.first_name || ''} ${c.last_name || ''} ${c.club || ''}`.toLowerCase()
    const queryOk = q === '' || haystack.includes(q)
    const ageOk =
      ageFilter.length === 0 ||
      (c.age_groups || []).some((g) => ageFilter.includes(ageOf(g)))
    return queryOk && ageOk
  })

  // אם נבחר מאמן — מציגים את הפרופיל שלו
  if (selectedCoach) {
    return (
      <CoachProfile
        coach={selectedCoach}
        session={session}
        startComposing={composeOnOpen}
        onBack={() => {
          setSelectedCoach(null)
          setComposeOnOpen(false)
        }}
      />
    )
  }

  return (
    <div className="welcome-card">
      <header className="page-header">
        <div className="page-header-text">
          {/* [12] שם ייחודי — "קהילת המאמנים" שמור לעמוד הקהילה */}
          <div className="welcome-badge">{L('מאמנים', 'Coaches')}</div>
          <h2>{L('חיפוש מאמנים', 'Find coaches')}</h2>
          <p className="page-desc">{L('חפשו מאמנים לפי שם, מועדון או שכבת גיל, צפו בתרגילים שלהם וצרו קשר.', 'Search coaches by name, club or age group, view their drills, and get in touch.')}</p>
        </div>
      </header>

      <div className="tabs">
        <button
          className={mode === 'coaches' ? 'tab active' : 'tab'}
          onClick={() => setMode('coaches')}
        >
          {L('מאתר מאמנים', 'Coach Finder')}
        </button>
        <button
          className={mode === 'games' ? 'tab active' : 'tab'}
          onClick={() => setMode('games')}
        >
          {L('לוח משחקי אימון', 'Scrimmage board')}
        </button>
      </div>

      {mode === 'games' ? (
        <GamesBoard session={session} />
      ) : (
        <>
          <h3 className="section-title" style={{ marginTop: 4 }}>{L('מצא מאמנים לתיאום', 'Find coaches to connect with')}</h3>

          {/* חיפוש חופשי — שם או מועדון */}
          <div className="field-group" style={{ marginTop: 20 }}>
            <span className="field-label">{L('חיפוש', 'Search')}</span>
            <input
              className="finder-input"
              type="search"
              value={clubQuery}
              onChange={(e) => setClubQuery(e.target.value)}
              placeholder={L('חיפוש לפי שם או מועדון...', 'Search by name or club...')}
            />
          </div>

          {/* סינון לפי שכבת גיל */}
          <div className="field-group" style={{ marginTop: 18 }}>
            <span className="field-label">{L('סינון לפי שכבת גיל', 'Filter by age group')}</span>
            <MultiSelect
              options={AGE_GROUPS}
              selected={ageFilter}
              onToggle={toggleAge}
              renderLabel={tr}
              placeholder={L('כל הגילאים', 'All age groups')}
            />
          </div>

          {(clubQuery || ageFilter.length > 0) && (
            <button
              className="link-button"
              style={{ marginTop: 14 }}
              onClick={clearFilters}
            >
              {L('נקה סינון', 'Clear filters')}
            </button>
          )}

          {/* תוצאות */}
          <div className="finder-results">
            {loading ? (
              <SkeletonCards count={3} />
            ) : error ? (
              <div className="alert alert-error">{error}</div>
            ) : results.length === 0 ? (
              <div className="empty-state">
                <span className="empty-ic">
                  <Users size={26} />
                </span>
                <div className="empty-title">
                  {coaches.length === 0 ? L('עדיין אין מאמנים', 'No coaches yet') : L('לא נמצאו מאמנים', 'No coaches found')}
                </div>
                <p className="muted small">
                  {coaches.length === 0
                    ? L('כשמאמנים נוספים יצטרפו, הם יופיעו כאן.', 'When more coaches join, they will appear here.')
                    : L('נסה לשנות את המועדון או לנקות את הסינון.', 'Try changing the club or clearing the filters.')}
                </p>
              </div>
            ) : (
              <div className="coach-grid">
                <p className="muted small results-count">
                  {results.length === 1
                    ? L('נמצא מאמן אחד', 'Found 1 coach')
                    : L(`נמצאו ${results.length} מאמנים`, `Found ${results.length} coaches`)}
                </p>

                {results.map((coach) => (
                  <div key={coach.id} className="coach-card">
                    <div className="coach-card-head">
                      <Avatar
                        name={`${coach.first_name} ${coach.last_name}`}
                        url={coach.avatar_url}
                        size={48}
                      />
                      <div>
                        <h3 className="coach-name">
                          {coach.first_name} {coach.last_name}
                          <VerifiedBadge verified={coach.verified} />
                        </h3>
                        <p className="coach-club">{coach.club}</p>
                      </div>
                    </div>

                    {coach.age_groups && coach.age_groups.length > 0 && (
                      <div className="chips" style={{ marginTop: 10 }}>
                        {coach.age_groups.map((g) => (
                          <span key={g} className="chip selected static">
                            {trTeam(g)}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="coach-card-actions">
                      <button
                        className="btn-primary"
                        style={{ marginTop: 0 }}
                        onClick={() => {
                          setComposeOnOpen(false)
                          setSelectedCoach(coach)
                        }}
                      >
                        {L('צפה בתרגילים', 'View drills')}
                      </button>
                      <button
                        className="btn-ghost"
                        onClick={() => {
                          setComposeOnOpen(true)
                          setSelectedCoach(coach)
                        }}
                      >
                        {L('שליחת הודעה', 'Send message')}
                      </button>
                      <ReportButton
                        session={session}
                        targetType="coach"
                        targetId={coach.id}
                        targetLabel={`${coach.first_name} ${coach.last_name} · ${coach.club}`}
                        className="link-button report-link"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
