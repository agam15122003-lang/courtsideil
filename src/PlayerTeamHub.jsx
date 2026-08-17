// «הקבוצה והלו"ז» (מסמך ההשקה 1.13) — אזור אחד לשחקן עם ארבע לשוניות:
// לו"ז · הקבוצה שלי · צ'אט הקבוצה · המאמן שלי.
// «המאמן שלי» כולל ארבעה כפתורי בקשה מהירים שיוצרים הודעה מובנית בצ'אט:
// יעד חדש · פציעה/מחלה (מעדכן גם זמינות) · לא אגיע לאימון (נרשם באישורי
// ההגעה עם סיבה) · בקשת שיחה אישית.

import { useState, useEffect } from 'react'
import {
  CalendarDays, Users, MessagesSquare, MessageSquare, Target,
  HeartPulse, CalendarX, Phone, Trophy, MapPin,
} from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { L, cnt, trTeam } from './i18n'
import { sendNotification } from './notify'
import { expandSlots } from './sessionId'
import TeamChat from './TeamChat'
import CoachChat from './CoachChat'
import LeagueTable from './LeagueTable'
import PlayerScreen from './PlayerScreen'

const coachNm = (c) => `${c?.first_name || ''} ${c?.last_name || ''}`.trim() || L('המאמן', 'Coach')
const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const ilShort = (s) => { const d = new Date(s + 'T00:00'); return isNaN(d) ? s : `${d.getDate()}.${d.getMonth() + 1}` }

const TABS = [
  { id: 'schedule', label: ['לו"ז', 'Schedule'], Icon: CalendarDays },
  { id: 'team', label: ['הקבוצה שלי', 'My team'], Icon: Users },
  { id: 'chat', label: ['צ\'אט הקבוצה', 'Team chat'], Icon: MessagesSquare },
  { id: 'coach', label: ['המאמן שלי', 'My coach'], Icon: MessageSquare },
]

// ---------- הקבוצה שלי: סגל יבש + המשחק הבא + טבלת הליגה ----------
function MyTeamTab({ membership, onSched, onChat }) {
  const [mates, setMates] = useState(null)
  const [nextGame, setNextGame] = useState(null)
  const [iba, setIba] = useState(null) // {league_id, league_name, iba_team_name} או null

  useEffect(() => {
    if (!membership) return
    let alive = true
    ;(async () => {
      const [rosterRes, gameRes, ibaRes] = await Promise.all([
        supabase.rpc('team_roster', { _coach: membership.coach_id, _team: membership.team }),
        supabase.from('team_games').select('*')
          .eq('coach_id', membership.coach_id).eq('team', membership.team)
          .gte('game_date', ymd(new Date())).order('game_date').limit(1),
        // קריאת חברי קבוצה דורשת את supabase_team_hub.sql — עד אז הטבלה פשוט לא מוצגת
        supabase.from('team_iba').select('league_id, league_name, iba_team_name')
          .eq('coach_id', membership.coach_id).eq('team', membership.team).maybeSingle(),
      ])
      if (!alive) return
      if (rosterRes.error) {
        const legacy = await supabase.from('team_players')
          .select('id, name, number, position')
          .eq('coach_id', membership.coach_id).eq('team', membership.team).order('number')
        if (!alive) return
        setMates(legacy.data || [])
      } else {
        setMates(rosterRes.data || [])
      }
      setNextGame(gameRes.data?.[0] || null)
      setIba(ibaRes.error ? null : ibaRes.data)
    })()
    return () => { alive = false }
  }, [membership])

  const crest = (trTeam(membership.team) || '?').slice(0, 2)
  return (
    <>
      {/* הבאנר של המסמך: סמל, שם הקבוצה, והמאמן. ⚠ בלי מאזן/מקום/נקודות
          למשחק — אין להם מקור בשרת, והמסמך רק מדגים אותם. */}
      <div className="ps-hero">
        <div className="ps-prof">
          <span className="ps-crest" aria-hidden="true">{crest}</span>
          <span className="ps-coach-tx">
            {iba?.league_name && <span className="ps-hero-kick">{iba.league_name}</span>}
            <b className="ps-hero-title">{trTeam(membership.team)}</b>
            <span className="ps-hero-sub">
              {[mates?.length ? cnt(mates.length, L('שחקן אחד', 'player'), L('שחקנים', 'players')) : null,
                membership.coach ? L(`מאמן: ${coachNm(membership.coach)}`, `Coach: ${coachNm(membership.coach)}`) : null]
                .filter(Boolean).join(' · ')}
            </span>
          </span>
        </div>
      </div>

      <div className="ps-cols">
        <div className="ps-card">
          <div className="ps-card-head">
            <b className="ps-h">{L('המשחק הבא', 'Next game')}</b>
            {nextGame?.game_time && (
              <span className="ps-chip ps-chip--acc" dir="ltr">{String(nextGame.game_time).slice(0, 5)}</span>
            )}
          </div>
          {nextGame ? (
            <>
              <div className="ps-vs">
                <span className="ps-vs-side">
                  <span className="ps-crest-sm" aria-hidden="true">{crest}</span>
                  <b className="ps-t13b">{trTeam(membership.team)}</b>
                </span>
                <b className="ps-vs-tx">VS</b>
                <span className="ps-vs-side">
                  <span className="ps-crest-sm ps-crest-sm--mut" aria-hidden="true">
                    {(nextGame.opponent || '?').slice(0, 2)}
                  </span>
                  <b className="ps-t13b">{nextGame.opponent || L('יריבה', 'Opponent')}</b>
                </span>
              </div>
              <span className="ps-lbl">
                <bdi dir="ltr">{ilShort(nextGame.game_date)}</bdi>
                {nextGame.location && <> · <MapPin size={11} aria-hidden="true" /> {nextGame.location}</>}
              </span>
              {onSched && (
                <button type="button" className="ps-btn-ghost" onClick={onSched}>{L('ללו״ז המלא', 'Full schedule')}</button>
              )}
            </>
          ) : (
            <p className="ps-mut">{L('אין משחק קרוב בלו״ז. ברגע שהמאמן יוסיף — הוא יופיע כאן.', 'No upcoming game yet. It shows up here once your coach adds one.')}</p>
          )}
        </div>

        <div className="ps-card">
          <div className="ps-card-head">
            <b className="ps-h">{L('הסגל', 'Roster')}</b>
            <span className="ps-chip ps-chip--mut">
              {mates === null ? L('טוען…', 'Loading…') : cnt(mates.length, L('שחקן אחד', 'player'), L('שחקנים', 'players'))}
            </span>
          </div>
          {mates === null ? null : mates.length === 0 ? (
            <p className="ps-mut">{L('אין עדיין שחקנים בסגל.', 'No players in the roster yet.')}</p>
          ) : (
            <div className="ps-roster">
              {mates.map((m) => (
                <div key={m.id} className="ps-row">
                  <span className="ps-jersey" aria-hidden="true">{m.number || '·'}</span>
                  <span className="ps-row-main">
                    <b className="ps-t13b">{m.name}</b>
                    {m.position && <span className="ps-lbl">{m.position}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
          {onChat && (
            <button type="button" className="ps-btn" onClick={onChat}>{L('לצ׳אט הקבוצה', 'Team chat')}</button>
          )}
        </div>
      </div>

      {iba?.league_id && (
        <div className="ps-card">
          <b className="ps-h"><Trophy size={15} aria-hidden="true" /> {L('טבלת הליגה', 'League table')}</b>
          <div className="ps-slot">
            <LeagueTable leagueId={iba.league_id} leagueName={iba.league_name} highlight={iba.iba_team_name || membership.team} />
          </div>
        </div>
      )}
    </>
  )
}

// ---------- המאמן שלי: בקשות מהירות + צ'אט ----------
function QuickRequests({ session, membership, coach }) {
  const me = session.user.id
  const [mode, setMode] = useState(null) // null | 'injury' | 'miss'
  const [note, setNote] = useState('')
  const [injKind, setInjKind] = useState('injured')
  const [busy, setBusy] = useState(false)

  const sendChat = async (text) => {
    const { error } = await supabase.from('messages').insert({ sender_id: me, recipient_id: membership.coach_id, content: text })
    if (!error) sendNotification({ to: membership.coach_id, actor: me, type: 'message', content: L('שלח לך הודעה', 'sent you a message'), nav: 'messages' })
    return !error
  }

  const askGoal = async () => {
    setBusy(true)
    const ok = await sendChat(L('🎯 בקשה מהאפליקציה: אשמח שתציב לי יעד חדש.', '🎯 App request: I would love a new goal.'))
    setBusy(false)
    ok ? toast.success(L('הבקשה נשלחה למאמן', 'Request sent')) : toast.error(L('השליחה נכשלה', 'Failed to send'))
  }

  const askTalk = async () => {
    setBusy(true)
    const ok = await sendChat(L('💬 בקשה מהאפליקציה: אשמח לשיחה אישית כשנוח לך.', '💬 App request: I would love a personal chat when convenient.'))
    setBusy(false)
    ok ? toast.success(L('הבקשה נשלחה למאמן', 'Request sent')) : toast.error(L('השליחה נכשלה', 'Failed to send'))
  }

  // עדכון פציעה/מחלה — מעדכן גם את הזמינות בכרטיס השחקן (RPC מ-1.7) וגם מודיע למאמן
  const sendInjury = async () => {
    setBusy(true)
    const { error: availErr } = await supabase.rpc('set_my_availability', { _status: injKind, _note: note.trim() || null })
    const kindTxt = injKind === 'sick' ? L('חולה', 'sick') : L('פצוע', 'injured')
    const ok = await sendChat(L(`🤕 עדכון מהאפליקציה: אני ${kindTxt}${note.trim() ? ` — ${note.trim()}` : ''}.`, `🤕 App update: I'm ${kindTxt}${note.trim() ? ` — ${note.trim()}` : ''}.`))
    setBusy(false)
    if (ok) {
      toast.success(availErr
        ? L('המאמן עודכן בהודעה', 'Coach notified')
        : L('המאמן עודכן והסטטוס שלך בכרטיס השחקן התעדכן', 'Coach notified and your availability updated'))
      setMode(null); setNote('')
    } else toast.error(L('השליחה נכשלה', 'Failed to send'))
  }

  // לא אגיע לאימון — נרשם באישורי ההגעה של האימון הקרוב, עם הסיבה
  const sendMiss = async () => {
    setBusy(true)
    const { data: slots } = await supabase.from('team_practice_slots').select('*')
      .eq('coach_id', membership.coach_id).eq('team', membership.team)
    const { data: entries } = await supabase.from('schedule_entries').select('id, date')
      .eq('created_by', membership.coach_id).eq('team', membership.team)
      .gte('date', ymd(new Date())).order('date').limit(5)
    const cands = [
      ...expandSlots(slots || [], 0, 14).map((o) => ({ session_id: o.session_id, date: o.date })),
      ...(entries || []).map((e) => ({ session_id: e.id, date: e.date })),
    ].sort((a, b) => a.date.localeCompare(b.date))
    const next = cands[0] || null
    if (next) {
      const row = {
        coach_id: membership.coach_id, team: membership.team,
        session_id: next.session_id, session_date: next.date,
        player_id: me, response: 'no',
      }
      let { error } = await supabase.from('practice_rsvp')
        .upsert({ ...row, reason: note.trim() || null }, { onConflict: 'session_id,player_id' })
      if (error) await supabase.from('practice_rsvp').upsert(row, { onConflict: 'session_id,player_id' })
    }
    const ok = await sendChat(L(`🙋 עדכון מהאפליקציה: לא אגיע לאימון הקרוב${note.trim() ? ` — ${note.trim()}` : ''}.`, `🙋 App update: I can't make the next practice${note.trim() ? ` — ${note.trim()}` : ''}.`))
    setBusy(false)
    if (ok) { toast.success(L('המאמן עודכן ונרשם באישורי ההגעה', 'Coach notified and RSVP saved')); setMode(null); setNote('') }
    else toast.error(L('השליחה נכשלה', 'Failed to send'))
  }

  return (
    <div className="pth-quick">
      <p className="pl-section-label">{L('בקשות מהירות', 'Quick requests')}</p>
      <div className="pth-quick-grid">
        <button type="button" className="pth-quick-btn" disabled={busy} onClick={askGoal}>
          <Target size={16} /> {L('בקשת יעד חדש', 'New goal request')}
        </button>
        <button type="button" className={'pth-quick-btn' + (mode === 'injury' ? ' on' : '')} disabled={busy}
          onClick={() => { setMode(mode === 'injury' ? null : 'injury'); setNote('') }}>
          <HeartPulse size={16} /> {L('עדכון פציעה/מחלה', 'Injury / illness')}
        </button>
        <button type="button" className={'pth-quick-btn' + (mode === 'miss' ? ' on' : '')} disabled={busy}
          onClick={() => { setMode(mode === 'miss' ? null : 'miss'); setNote('') }}>
          <CalendarX size={16} /> {L('לא אגיע לאימון', "Can't make practice")}
        </button>
        <button type="button" className="pth-quick-btn" disabled={busy} onClick={askTalk}>
          <Phone size={16} /> {L('בקשת שיחה אישית', 'Personal chat request')}
        </button>
      </div>

      {mode === 'injury' && (
        <div className="pth-quick-form">
          <div className="pth-quick-kind">
            <button type="button" className={injKind === 'injured' ? 'chip selected' : 'chip'} onClick={() => setInjKind('injured')}>{L('פצוע', 'Injured')}</button>
            <button type="button" className={injKind === 'sick' ? 'chip selected' : 'chip'} onClick={() => setInjKind('sick')}>{L('חולה', 'Sick')}</button>
          </div>
          <input className="finder-input" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)}
            placeholder={L('פירוט (לא חובה) — למשל: נקע בקרסול', 'Details (optional)')} />
          <button type="button" className="btn-primary" style={{ marginTop: 0 }} disabled={busy} onClick={sendInjury}>
            {busy ? L('שולח…', 'Sending…') : L('עדכון המאמן', 'Notify coach')}
          </button>
        </div>
      )}
      {mode === 'miss' && (
        <div className="pth-quick-form">
          <input className="finder-input" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)}
            placeholder={L('סיבה (לא חובה) — למשל: מבחן מחר', 'Reason (optional)')} />
          <button type="button" className="btn-primary" style={{ marginTop: 0 }} disabled={busy} onClick={sendMiss}>
            {busy ? L('שולח…', 'Sending…') : L('עדכון המאמן', 'Notify coach')}
          </button>
        </div>
      )}
    </div>
  )
}

// כותרת לכל לשונית — הבאנר של PlayerScreen מתחלף איתן
const TAB_HEAD = {
  schedule: { kicker: ['לו״ז', 'SCHEDULE'], title: ['הלו״ז שלי', 'My schedule'] },
  team:     { kicker: ['הקבוצה', 'TEAM'], title: ['הקבוצה שלי', 'My team'] },
  chat:     { kicker: ['צ׳אט', 'CHAT'], title: ['צ׳אט הקבוצה', 'Team chat'] },
  coach:    { kicker: ['מאמן', 'COACH'], title: ['המאמן שלי', 'My coach'] },
}

export default function PlayerTeamHub({ session, membership, coach, initialTab, ScheduleView, bell, coachName, onCoach }) {
  const [tab, setTab] = useState(initialTab || 'schedule')
  useEffect(() => { if (initialTab) setTab(initialTab) }, [initialTab])
  const head = TAB_HEAD[tab] || TAB_HEAD.schedule

  // ⚠ הלשוניות תופסות את מקום שורת המספרים ורוכבות על תחתית הבאנר —
  //    אותה הכרעה כמו ב«עולם הכדורסל», ומהסיבה הזהה: המסך הזה הוא ארבעה
  //    מסכים, ובלי הגלולה הזאת שלושה מהם נעלמים.
  const tabs = (
    <nav className="ps-seg" aria-label={L('לשוניות הקבוצה', 'Team tabs')}>
      {TABS.map((t) => (
        <button key={t.id} type="button" className={tab === t.id ? 'ps-seg-btn is-on' : 'ps-seg-btn'}
          aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
          <t.Icon size={15} aria-hidden="true" /> {L(t.label[0], t.label[1])}
        </button>
      ))}
    </nav>
  )

  return (
    <PlayerScreen
      // ⚠ הצבע והכותרת מתחלפים עם הלשונית: המסמך המעודכן נותן לכל אחת
      //    מהן מסך משלה (sched · team · chat · coach), לא לשונית בתוך מסך.
      page={tab === 'schedule' ? 'sched' : tab}
      kicker={L(head.kicker[0], head.kicker[1])}
      title={L(head.title[0], head.title[1])}
      rider={tabs}
      bell={bell}
      coach={coachName}
      onCoach={onCoach}
    >
      {tab === 'schedule' && ScheduleView}
      {tab === 'team' && (
        <MyTeamTab membership={membership} onSched={() => setTab('schedule')} onChat={() => setTab('chat')} />
      )}
      {/* ⚠ בלי כותרת משלנו: ל-TeamChat כבר יש ‎.pl-chat-head משלו, ומעליו
          הבאנר של המסך — שלוש כותרות זו על זו. הרכיב משותף עם צד המאמן
          ולכן הוא שומר על המרקאפ שלו; ‎.ps-chat רק מיישר אותו לקנבס. */}
      {tab === 'chat' && (
        <div className="ps-chat ps-slot">
          <TeamChat session={session} coachId={membership.coach_id} team={membership.team} isCoach={false} />
        </div>
      )}
      {/* ⚠ ‏ps-chat גם כאן: CoachChat חולק את אותן מחלקות עם TeamChat
          (‎.pl-chat-head / .pl-chat-box / .chat-scroll), ובלי המחלקה הזאת
          המשטח הקרם שלו נשאר בשפה הישנה על הקנבס החדש. */}
      {tab === 'coach' && (
        <div className="ps-chat ps-slot">
          <div className="ps-card ps-quickreq">
            <QuickRequests session={session} membership={membership} coach={coach} />
          </div>
          <CoachChat session={session} coach={coach} />
        </div>
      )}
    </PlayerScreen>
  )
}
