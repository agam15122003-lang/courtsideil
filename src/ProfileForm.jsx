import { useState } from 'react'
import {
  User, Phone, Building2, Users2, Camera, ClipboardList, Dumbbell, Eye, EyeOff, Check,
  ShieldCheck, MessageCircle, Copy,
} from 'lucide-react'
import { toast } from './toast'
import { supabase } from './supabaseClient'
import { uploadImage } from './storage'
import Avatar from './Avatar'
import MultiSelect from './MultiSelect'
import { AGE_GROUPS, GENDERS, ISRAELI_CLUBS, teamLabel } from './constants'
import { L, trTeam } from './i18n'
import { PLAYER_SIDE } from './flags'
import { createConsentRequest, consentShareText, consentRequestError } from './consent'
import { waShare, copyText } from './share'

// כל צירופי הקבוצות (שכבה × מגדר) כרשימה שטוחה לבחירה מרובה
const TEAM_OPTIONS = AGE_GROUPS.flatMap((age) => GENDERS.map((g) => teamLabel(age, g)))

// קרבת האפוטרופוס — הערכים חייבים להיות בדיוק אלה שה-RPC מקבל
// ('parent' | 'guardian' | 'other'); כל ערך אחר מנורמל שם ל-'parent'.
const RELATIONS = [
  { value: 'parent', label: () => L('הורה', 'Parent') },
  { value: 'guardian', label: () => L('אפוטרופוס/ית', 'Legal guardian') },
  { value: 'other', label: () => L('אחר', 'Other') },
]

// גיל מדויק מתאריך לידה מלא. עד היום החישוב היה הפרש שנים קלנדרי בלבד,
// ולכן מי שימלאו לו 18 בדצמבר נחשב בגיר כבר ב-1 בינואר (ממצא בדוח).
function exactAge(dateStr) {
  if (!dateStr) return null
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  let a = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a -= 1
  return a
}

// טופס למילוי/עריכת פרטי הפרופיל.
// props:
//   session  - המשתמש המחובר (כדי לדעת איזו שורה לעדכן)
//   profile  - הפרטים הקיימים (יכול להיות חלקי/ריק)
//   onSaved  - פונקציה שתופעל אחרי שמירה מוצלחת
//   onCancel - פונקציה לכפתור "ביטול" (אופציונלי — מוצג רק אם קיים)
export default function ProfileForm({ session, profile, onSaved, onCancel }) {
  // משתמש חדש (עדיין אין שם) — תמיד מתחילים ממסך בחירת התפקיד, גם אם
  // ברירת המחדל של העמודה במסד היא 'coach' (אחרת מסך הבחירה נדלג).
  // צד המאמן בלבד (22.8): אין מסך «מי אתם?» — כל משתמש חדש הוא מאמן.
  const [role, setRole] = useState(PLAYER_SIDE ? (profile?.first_name ? (profile?.role || '') : '') : (profile?.role || 'coach')) // '' = טרם נבחר, 'coach' | 'player'
  const [firstName, setFirstName] = useState(profile?.first_name || '')
  const [lastName, setLastName] = useState(profile?.last_name || '')
  const [club, setClub] = useState(profile?.club || '')
  const [phone, setPhone] = useState(profile?.phone || '')
  const [phonePublic, setPhonePublic] = useState(!!profile?.phone_public)
  const [teams, setTeams] = useState(profile?.age_groups || [])
  const [birthYear, setBirthYear] = useState(profile?.birth_year ? String(profile.birth_year) : '')
  const [position, setPosition] = useState(profile?.position || '')
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const isPlayer = role === 'player'

  // פרטי האפוטרופוס. שים לב: הקטין כבר לא מסמן שום צ'קבוקס הסכמה בשמו —
  // הוא רק מוסר למי לשלוח את הקישור, וההורה מאשר במסך נפרד (ParentConsent).
  const [guardianName, setGuardianName] = useState(profile?.guardian_name || '')
  const [guardianEmail, setGuardianEmail] = useState(profile?.guardian_email || '')
  const [guardianPhone, setGuardianPhone] = useState(profile?.guardian_phone || '')
  const [guardianRelation, setGuardianRelation] = useState('')

  // תאריך לידה מלא — שער הגיל האמיתי. birth_year נשמר לצד זה כי כל הלוגיקה
  // הקיימת (וגם הטריגר הישן במסד) עדיין עובדת מולו.
  const [birthDate, setBirthDate] = useState(profile?.birth_date || '')
  const playerAge = birthDate
    ? exactAge(birthDate)
    // בלי תאריך מלא (פרופיל ישן) — חישוב שמרני: קטין עד שבוודאות מלאו 18
    : birthYear ? new Date().getFullYear() - Number(birthYear) - 1 : null
  const isMinor = isPlayer && playerAge !== null && playerAge < 18
  // מאמן שמשלים פרופיל עכשיו. **אותו תנאי בדיוק** שהטריגר במסד בודק
  // (game_block_minor_coach: יצירה, או המעבר הראשון משם ריק לשם מלא) —
  // כדי שמאמן ותיק בלי תאריך לידה לא ייחסם פתאום בעריכת פרופיל.
  const isNewCoach = !isPlayer && !profile?.first_name

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  // מסלול legacy: המסד עוד לא הריץ את מיגרציית ההסכמות והטריגר הישן דורש
  // guardian_consent_at. נדלק רק כשהטריגר באמת נופל, לא מראש.
  const [legacyMode, setLegacyMode] = useState(false)
  const [legacyConsent, setLegacyConsent] = useState(false)
  // שלב השיתוף עם ההורה אחרי שמירה מוצלחת של קטין.
  // shareLink — הקישור נמסר לקטין לשיתוף ידני (החוזה הישן).
  // sentTo    — הקישור נשלח בצד שרת למייל ההורה ומוחזרת רק כתובת ממוסכת;
  //             במקרה הזה אין מה להעתיק ואין מה לשלוח בוואטסאפ.
  const [shareLink, setShareLink] = useState('')
  const [sentTo, setSentTo] = useState('')

  const onAvatarPick = async (e) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    setUploadingAvatar(true)
    try {
      const url = await uploadImage(file, 'avatars', session.user.id)
      setAvatarUrl(url)
      toast.success(L('תמונת הפרופיל הועלתה', 'Profile photo uploaded'))
    } catch (err) {
      toast.error(L('העלאת התמונה נכשלה: ', 'Photo upload failed: ') + err.message)
    } finally {
      setUploadingAvatar(false)
    }
  }

  const toggleTeam = (key) => {
    setTeams((cur) =>
      cur.includes(key) ? cur.filter((t) => t !== key) : [...cur, key]
    )
  }

  // שינוי תאריך הלידה מעדכן גם את שנת הלידה (העמודה הישנה נשארת מקור אמת לטריגר)
  const onBirthDate = (v) => {
    setBirthDate(v)
    const y = v ? v.slice(0, 4) : ''
    if (/^\d{4}$/.test(y)) setBirthYear(y)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    // שער גיל: בלי תאריך/שנת לידה אין דרך לדעת אם מדובר בקטין
    if ((isPlayer || isNewCoach) && !birthDate && !birthYear) {
      setError(L('צריך למלא תאריך לידה.', 'A birth date is required.'))
      return
    }
    // חשבון מאמן הוא לבגירים. השרת חוסם גם הוא (game_block_minor_coach),
    // אבל הודעת חריגה של פוסטגרס אינה מסך — לכן נאמר את זה כאן, בעברית
    // ובאנגלית, ובמקום שבו אפשר עוד לחזור אחורה ולבחור «שחקן».
    if (isNewCoach && playerAge !== null && playerAge < 18) {
      setError(PLAYER_SIDE
        ? L('חשבון מאמן מיועד לבגירים (18+). אם אתה שחקן — חזרו אחורה ובחרו «שחקן».',
            'A coach account is for adults (18+). If you are a player, go back and pick “Player”.')
        // אין בורר תפקידים כשצד השחקן סגור — אין לאן «לחזור אחורה»
        : L('חשבון מאמן מיועד לבגירים (18+). בדקו את שנת הלידה.',
            'A coach account is for adults (18+). Please check the birth year.'))
      return
    }
    if (isMinor && (!guardianEmail.trim() || !guardianName.trim())) {
      setError(L('שחקן מתחת לגיל 18 — צריך למלא שם ומייל של הורה או אחראי, כדי שנוכל לשלוח לו קישור לאישור.',
        'Player under 18 — a parent or guardian name and email are required so we can send them an approval link.'))
      return
    }
    // מייל ההורה חייב להיות של ההורה. אותו מייל של הקטין פירושו שהקטין מאשר
    // לעצמו — בדיוק מה שמסמך ההסכמה (סעיף 2) מצהיר שאינו אפשרי. חוסמים כאן
    // כדי לתת הודעה ברורה; החסימה האמיתית היא בשרת ('guardian_email_is_self'),
    // כי בדיקת לקוח לבדה אינה הגנה.
    if (isMinor && guardianEmail.trim().toLowerCase() === (session?.user?.email || '').trim().toLowerCase()) {
      setError(L('מייל ההורה חייב להיות שונה מהמייל שלך — ההורה הוא זה שמאשר את פתיחת החשבון, לא אתה.',
        "The parent email must differ from your own — your parent approves the account, not you."))
      return
    }
    // legacy בלבד: מסד ישן שהטריגר שלו דורש הסכמה שנכתבת מהלקוח
    if (isMinor && legacyMode && !legacyConsent) {
      setError(L('צריך לסמן את אישור ההורה כדי להמשיך.', 'Parental approval must be ticked to continue.'))
      return
    }
    setSaving(true)

    // שומרים את הקבוצות בסדר הקבוע (שכבה ואז מגדר), לא בסדר הלחיצה
    const orderedTeams = []
    for (const age of AGE_GROUPS) {
      for (const g of GENDERS) {
        const key = teamLabel(age, g)
        if (teams.includes(key)) orderedTeams.push(key)
      }
    }
    // משמרים בחירות ישנות (בלי מגדר) אם קיימות
    for (const t of teams) {
      if (!orderedTeams.includes(t)) orderedTeams.push(t)
    }

    // upsert ולא update: אם שורת הפרופיל חסרה (טריגר ההרשמה נכשל),
    // update על 0 שורות "מצליח" בלי לשמור — ויוצר לולאת שמירה אינסופית.
    const payload = {
      id: session.user.id,
      role: role || 'coach',
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      club: club.trim(),
      phone: phone.trim() || null,
      phone_public: phonePublic,
      avatar_url: avatarUrl || null,
      updated_at: new Date().toISOString(),
    }
    if (isPlayer) {
      payload.birth_year = birthYear ? Number(birthYear) : null
      payload.birth_date = birthDate || null
      payload.position = position.trim() || null
      payload.age_groups = [] // לשחקן אין "קבוצות שאני מאמן"
      payload.phone_public = false // טלפון של שחקן לא מוצג לאף אחד
      // לשחקן אין תמונת פרופיל. מאפסים גם בשמירה ולא רק מסתירים את הטופס,
      // כדי שתמונה שהועלתה לפני השינוי תימחק בעריכה הבאה של הפרופיל.
      payload.avatar_url = null
      if (isMinor) {
        // רק פרטי הקשר של האפוטרופוס. ההסכמה עצמה נכתבת אך ורק בשרת,
        // אחרי שההורה אישר בטופס שלו — הקליינט לא נוגע בה יותר.
        payload.guardian_name = guardianName.trim() || null
        payload.guardian_email = guardianEmail.trim()
        payload.guardian_phone = guardianPhone.trim() || null
        if (legacyMode) {
          // --- legacy: מסד שטרם הריץ את מיגרציית ההסכמות. הטריגר הישן
          // enforce_minor_consent דורש guardian_consent_at, ובלעדיו אי אפשר
          // לשמור בכלל. נשמר כדי שפרודקשן לא-מעודכן לא ייתקע. ---
          payload.guardian_consent_at = profile?.guardian_consent_at || new Date().toISOString()
          payload.guardian_consent_version = profile?.guardian_consent_version || 'v1 · 1.8.2026'
        }
      }
    } else {
      payload.age_groups = orderedTeams
      // בלי שתי השורות האלה השדה מופיע על המסך ולא מגיע למסד, והטריגר
      // game_block_minor_coach ממשיך לקבל null ולעולם לא חוסם.
      payload.birth_date = birthDate || null
      payload.birth_year = birthYear ? Number(birthYear) : null
    }

    // ---- שמירה בלי upsert (תוקן 3.8.2026 אחרי כשל בפרודקשן) ----
    // upsert של PostgREST מתורגם ל-INSERT ... ON CONFLICT DO UPDATE. כש-RLS
    // פעיל, פוסטגרס חייב לקרוא את השורה המתנגשת כדי לאכוף את ה-USING של
    // מדיניות ה-UPDATE — ולשם כך הוא דורש SELECT **ברמת הטבלה**, לא ברמת
    // העמודה. supabase_privacy4.sql ביטל בדיוק את זה בכוונה (טלפון, שנת לידה
    // ופרטי הורה פתוחים רק ברמת עמודה), ולכן כל שמירת פרופיל החזירה
    // 42501 "permission denied for table profiles". פוסטגרס אפילו הציע
    // GRANT SELECT ON public.profiles — הצעה שאסור לקבל: היא הייתה פותחת את
    // הטלפון ופרטי ההורה של כל מאמן לכל משתמש רשום.
    // update רגיל לא דורש SELECT ברמת הטבלה. אם לא עודכנה אף שורה — הפרופיל
    // עוד לא קיים (טריגר ההרשמה נכשל) ואז מוסיפים; זה שומר על הסיבה המקורית
    // שבגללה נבחר upsert, בלי לוותר על נעילת ה-PII.
    const saveProfile = async (row) => {
      const { id, ...fields } = row
      const { data, error: upErr } = await supabase
        .from('profiles').update(fields).eq('id', id).select('id')
      if (upErr) return { error: upErr }
      if (data && data.length > 0) return { error: null }
      const { error: insErr } = await supabase.from('profiles').insert(row)
      return { error: insErr }
    }

    // ---- שכבה א': עמודה שעדיין לא קיימת במסד ----
    // מסירים בדיוק את העמודה שהמסד לא מכיר (PostgREST נוקב בשמה) ומנסים שוב,
    // כדי לא לזרוק בדרך עמודות תקינות כמו birth_year — שהטריגר הישן דורש.
    let { error } = await saveProfile(payload)
    const attempt = { ...payload }
    for (let i = 0; error && i < 4; i++) {
      const m = String(error.message || '').match(/'([a-z_]+)' column|column "?([a-z_]+)"? does not exist/i)
      const col = m && (m[1] || m[2])
      if (!col || !(col in attempt)) break
      delete attempt[col]
      ;({ error } = await saveProfile(attempt))
    }
    // גיבוי רחב אם ההודעה לא נקבה בשם עמודה — ההתנהגות ההיסטורית
    if (error && /column .* does not exist|could not find the .* column/i.test(error.message || '')) {
      const {
        role: _r, birth_year: _b, birth_date: _bd, position: _p,
        guardian_phone: _gp, guardian_consent_version: _gv, ...basic
      } = payload
      ;({ error } = await saveProfile(basic))
    }

    // ---- שכבה ב': הטריגר הישן של הסכמת הורה נפל — עוברים למסלול legacy ----
    if (error && /הסכמת הורה/.test(error.message || '')) {
      setSaving(false)
      if (!legacyMode) {
        setLegacyMode(true)
        setError(L(
          'המערכת עדיין בגרסה הקודמת: כדי לשמור צריך לסמן את אישור ההורה כאן, ואז לשמור שוב.',
          'The system is still on the previous version: tick the parental approval below and save again.'
        ))
      } else {
        setError(L('שמירה נכשלה: ', 'Save failed: ') + error.message)
      }
      return
    }

    if (error) {
      setSaving(false)
      setError(L('שמירה נכשלה: ', 'Save failed: ') + error.message)
      return
    }

    // ---- הצלחה ----
    toast.success(L('הפרופיל נשמר', 'Profile saved'))

    // קטין במסלול החדש: יוצרים בקשת הסכמה ומציגים שלב שיתוף עם ההורה —
    // אבל רק כשעוד אין הסכמה בתוקף. עד היום הבלוק רץ אחרי *כל* שמירה, ולכן
    // כל עריכת פרופיל של קטין מאושר יצרה בקשה חדשה, ביטלה (expires_at=now)
    // קישור שההורה אולי מחזיק ביד, שרפה מהמכסה של 5 ליממה, וחטפה את המסך
    // למסך «כמעט שם» על חשבון שכבר פתוח.
    // לא בודקים approval_status לבדו: שורת פרופיל חדשה נולדת עם 'active'
    // כברירת מחדל, וזה היה מונע את הבקשה הראשונה מקטין חדש לגמרי.
    const alreadyConsented = profile?.approval_status === 'active' && !!profile?.guardian_consent_at
    if (isMinor && !legacyMode && !alreadyConsented) {
      const res = await createConsentRequest({
        name: guardianName,
        email: guardianEmail,
        phone: guardianPhone,
        relation: guardianRelation,
        purpose: 'initial',
      })
      setSaving(false)
      if (res.ok) {
        // link = הקטין משתף ידנית · sent_to = השרת שלח למייל ההורה.
        // ok בלי אף אחד משניהם: אין מה להציג, פשוט ממשיכים — ובלי טוסט
        // אדום שמכריז על כישלון שלא קרה.
        if (res.link || res.sent_to) {
          setShareLink(res.link || '')
          setSentTo(res.sent_to || '')
          return
        }
        onSaved()
        return
      }
      // ה-RPC עוד לא קיים בפרודקשן — לא חוסמים את המשתמש, ממשיכים כרגיל.
      // 'already_consented' = השרת דחה בקשה מיותרת כי ההסכמה כבר בתוקף;
      // זה no-op שקט ולא תקלה שצריך להציג למשתמש.
      if (!res.notDeployed && res.reason !== 'already_consented') toast.error(consentRequestError(res.reason))
      onSaved()
      return
    }

    setSaving(false)
    onSaved()
  }

  // ---- שלב השיתוף: הקישור צריך להגיע להורה לפני שממשיכים הלאה ----
  // שני מסלולים: מסירה בצד שרת (sentTo — אין טוקן ביד הקטין, וזו הצורה
  // הבטוחה), או קישור שהקטין משתף בעצמו (shareLink — החוזה הישן).
  if (shareLink || sentTo) {
    const done = () => { setShareLink(''); setSentTo(''); onSaved() }
    return (
      <div className="welcome-card profile-form pf-share">
        <span className="pf-share-ic"><ShieldCheck size={26} /></span>
        <h2>
          {sentTo
            ? L('שלחנו את בקשת האישור להורה', 'We sent the approval request to your parent')
            : L('כמעט שם — נשאר לשלוח להורה', 'Almost there — send it to your parent')}
        </h2>
        <p className="muted small">
          {sentTo
            ? L('הקישור האישי נשלח ישירות למייל של ההורה או האחראי שלך — הוא לא עובר דרכך. ברגע שהוא מאשר, החשבון נפתח.',
                "The personal link was sent straight to your parent or guardian's email — it does not pass through you. The moment they approve, your account opens.")
            : L('יצרנו קישור אישי להורה או לאחראי שלך. שלחו לו אותו עכשיו — ברגע שהוא מאשר, החשבון נפתח.',
                'We created a personal link for your parent or guardian. Send it now — the moment they approve, your account opens.')}
        </p>
        <code className="pf-share-link" dir="ltr">{sentTo || shareLink}</code>
        <div className="form-actions pf-actions">
          {!sentTo && (
            <>
              <button
                type="button"
                className="btn-primary"
                onClick={() => waShare(consentShareText(`${firstName} ${lastName}`.trim(), shareLink))}
              >
                <MessageCircle size={16} /> {L('שליחה בוואטסאפ', 'Send on WhatsApp')}
              </button>
              <button
                type="button"
                className="btn-soft"
                onClick={() => copyText(shareLink, L('הקישור הועתק', 'Link copied'))}
              >
                <Copy size={16} /> {L('העתקת הקישור', 'Copy link')}
              </button>
            </>
          )}
          <button type="button" className={sentTo ? 'btn-primary' : 'btn-ghost'} onClick={done}>
            {L('סיימתי', 'Done')}
          </button>
        </div>
        <p className="muted small">
          {sentTo
            ? L('לא הגיע? אפשר לשלוח שוב בכל רגע מהמסך הבא, וכדאי לבדוק גם בתיקיית הספאם.',
                "Didn't arrive? You can send it again at any time from the next screen — check the spam folder too.")
            : L('אפשר לשלוח את הקישור שוב בכל רגע מהמסך הבא.', 'You can re-send this link at any time from the next screen.')}
        </p>
      </div>
    )
  }

  // שלב ראשון למשתמש חדש — בוחרים מי אתם (ברור ופשוט לילדים ולנוער)
  const isNew = !profile?.first_name
  if (isNew && !role) {
    return (
      <div className="welcome-card profile-form">
        <div className="form-head" style={{ textAlign: 'center' }}>
          <span className="welcome-badge">{L('ברוכים הבאים ל-CourtSide', 'Welcome to CourtSide')}</span>
          <h2>{L('מי אתם?', 'Who are you?')}</h2>
          <p className="muted small">{L('בחרו כדי שנתאים לכם את האפליקציה.', 'Pick so we can set up the right app for you.')}</p>
        </div>
        <div className="role-picker">
          <button type="button" className="role-card" onClick={() => setRole('coach')}>
            <span className="role-ic coach"><ClipboardList size={30} /></span>
            <strong>{L('אני מאמן/ת', "I'm a coach")}</strong>
            <span className="muted small">{L('תרגילים, תוכניות אימון, ניהול קבוצה וקהילה', 'Drills, plans, team management and community')}</span>
          </button>
          <button type="button" className="role-card" onClick={() => setRole('player')}>
            <span className="role-ic player"><Dumbbell size={30} /></span>
            <strong>{L('אני שחקן/ית', "I'm a player")}</strong>
            <span className="muted small">{L('מתחברים לקבוצה ומקבלים תרגילים ומשוב מהמאמן', 'Join your team and get drills and feedback from your coach')}</span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="welcome-card profile-form">
      {isNew && PLAYER_SIDE && (
        <button type="button" className="link-button" style={{ marginBottom: 8 }} onClick={() => setRole('')}>
          {L('← שינוי סוג משתמש', '← Change who you are')}
        </button>
      )}
      <div className="form-head">
        {isNew && <span className="welcome-badge">{isPlayer ? L('הרשמת שחקן', 'Player signup') : L('שלב אחרון בהרשמה', 'Final signup step')}</span>}
        <h2>{profile?.first_name ? L('עריכת הפרופיל', 'Edit profile') : isPlayer ? L('נעים להכיר, שחקן!', 'Nice to meet you, player!') : L('ברוך הבא! נשלים את הפרטים', 'Welcome! Let’s complete your details')}</h2>
        <p className="muted small">
          {isPlayer
            ? L('כמה פרטים קצרים, ואז מתחברים לקבוצה עם קוד מהמאמן.', 'A few quick details, then join your team with a code from your coach.')
            : profile?.first_name
            ? L('הפרטים האלה עוזרים למאמנים אחרים למצוא אותך, לתאם משחקי אימון וליצור קשר.', 'These details help other coaches find you, set up scrimmages, and get in touch.')
            : L('כדי להיכנס לקהילה צריך להשלים את הפרטים — זה ייקח דקה, ויעזור למאמנים אחרים למצוא אותך.', 'To join the community, complete your details — it takes a minute and helps other coaches find you.')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="pf-form">
        {/* פרטים אישיים */}
        <section className="form-section">
          <h3 className="form-section-title">
            <User size={16} /> {L('פרטים אישיים', 'Personal details')}
          </h3>

          {/* תמונת פרופיל — למאמנים בלבד (החלטת הבעלים, 4.8.2026).
              לשחקן אין העלאת תמונה כלל: רוב השחקנים קטינים, ותמונת פנים
              של ילד היא הפריט הרגיש ביותר במערכת. הדרך הפשוטה והבטוחה
              ביותר להגן עליה היא לא לאסוף אותה מלכתחילה. במקומה מוצגות
              ראשי התיבות של השם, בכל מקום שבו מוצג אווטאר.
              האכיפה אינה כאן בלבד — מדיניות ה-Storage חוסמת העלאה
              לתיקיית avatars/ מחשבון שחקן (supabase_no_player_avatars.sql). */}
          {isPlayer ? (
            <div className="avatar-upload">
              <Avatar name={`${firstName} ${lastName}`} url={null} size={76} />
              <p className="muted small" style={{ margin: 0 }}>
                {L('בפרופיל שחקן אין תמונה — מוצגות ראשי התיבות של השם.',
                   'Player profiles have no photo — initials are shown instead.')}
              </p>
            </div>
          ) : (
            <div className="avatar-upload">
              <Avatar name={`${firstName} ${lastName}`} url={avatarUrl} size={76} />
              <div className="avatar-upload-actions">
                <label className="btn-soft avatar-pick">
                  <Camera size={16} />
                  {uploadingAvatar ? L('מעלה...', 'Uploading...') : avatarUrl ? L('החלפת תמונה', 'Change photo') : L('העלאת תמונה', 'Upload photo')}
                  <input
                    type="file"
                    accept="image/*"
                    /* היה כאן capture="user": באייפד זה פותח מיד את המצלמה
                       הקדמית ולא מאפשר לבחור תמונה קיימת מהגלריה */
                    onChange={onAvatarPick}
                    disabled={uploadingAvatar}
                    hidden
                  />
                </label>
                {avatarUrl && (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setAvatarUrl('')}
                  >
                    {L('הסר תמונה', 'Remove photo')}
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="form-grid-2">
            <label className="pf-label">
              {L('שם פרטי', 'First name')} <span className="req-star" aria-hidden="true">*</span>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder={L('לדוגמה: דני', 'e.g. Danny')}
                required
              />
            </label>
            <label className="pf-label">
              {L('שם משפחה', 'Last name')} <span className="req-star" aria-hidden="true">*</span>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder={L('לדוגמה: כהן', 'e.g. Cohen')}
                required
              />
            </label>
          </div>
        </section>

        {/* מועדון */}
        <section className="form-section">
          <h3 className="form-section-title">
            <Building2 size={16} /> {L('המועדון שלי', 'My club')}
          </h3>
          <label className="pf-label">
            {L('בחר מהרשימה או הקלד שם מועדון', 'Pick from the list or type a club name')}
            {!isPlayer && <span className="req-star" aria-hidden="true"> *</span>}
            <input
              type="text"
              list="clubs-list"
              value={club}
              onChange={(e) => setClub(e.target.value)}
              placeholder={isPlayer ? L('לא חובה', 'Optional') : L('התחל להקליד...', 'Start typing...')}
              required={!isPlayer}
            />
          </label>
          <datalist id="clubs-list">
            {ISRAELI_CLUBS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <p className="muted small">{L('לא מצאת את המועדון שלך? פשוט הקלד אותו ידנית.', 'Can’t find your club? Just type it in manually.')}</p>
        </section>

        {/* טלפון + פרטיות */}
        <section className="form-section">
          <h3 className="form-section-title">
            <Phone size={16} /> {L('טלפון ליצירת קשר', 'Contact phone')}
          </h3>
          <label className="pf-label">
            {L('מספר טלפון (לא חובה)', 'Phone number (optional)')}
            <input
              type="tel"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="050-0000000"
              autoComplete="tel"
            />
          </label>
          <label className="switch-row">
            <span className="switch">
              <input
                type="checkbox"
                checked={phonePublic}
                onChange={(e) => setPhonePublic(e.target.checked)}
              />
              <span className="switch-track" />
            </span>
            <span className="switch-text">
              {L('הצג את הטלפון בפרופיל הציבורי', 'Show phone on public profile')}
              <span className="muted small">
                {phonePublic
                  ? L('מאמנים אחרים יוכלו לראות את המספר. אפשר לשנות בכל עת.', 'Other coaches will see your number. You can change this anytime.')
                  : L('המספר יישאר פרטי. אפשר להפעיל הצגה בכל עת.', 'Your number stays private. You can turn this on anytime.')}
              </span>
            </span>
          </label>
        </section>

        {/* קבוצות / פרטי שחקן */}
        {isPlayer ? (
          <section className="form-section">
            <h3 className="form-section-title">
              <Dumbbell size={16} /> {L('פרטי שחקן', 'Player details')}
            </h3>
            <div className="form-grid-2">
              <label className="pf-label">
                {L('תאריך לידה', 'Date of birth')} <span className="pf-req">*</span>
                <input
                  type="date"
                  dir="ltr"
                  min="1940-01-01"
                  max={new Date().toISOString().slice(0, 10)}
                  required={!birthYear}
                  value={birthDate}
                  onChange={(e) => onBirthDate(e.target.value)}
                />
                <span className="muted small">
                  {L('התאריך המלא נדרש רק כדי לדעת אם צריך אישור הורה. הוא לא מוצג לאף אחד.',
                     'The full date is used only to know whether parental approval is needed. It is shown to nobody.')}
                </span>
              </label>
              <label className="pf-label">
                {L('עמדה', 'Position')}
                <input
                  type="text"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  placeholder={L('רכז / קלע / כנף / סנטר', 'Guard / Forward / Center')}
                />
              </label>
            </div>
            {isMinor && (
              <div className="pf-guardian">
                <h4 className="pf-guardian-title">
                  <ShieldCheck size={16} /> {L('אישור הורה או אחראי', 'Parent or guardian approval')}
                </h4>
                <p className="muted small">
                  {L('כיוון שאתה מתחת לגיל 18, החוק דורש שההורה או האחראי יאשר את פתיחת החשבון — ולא אתה. מלא את הפרטים שלו, ואחרי השמירה נייצר קישור אישי שתשלח אליו בוואטסאפ. ההורה קורא את הטופס ומסמן בעצמו מה מאושר.',
                    'Because you are under 18, the law requires your parent or guardian to approve opening the account — not you. Fill in their details, and after saving we will create a personal link for you to send them on WhatsApp. They read the form and tick what they approve themselves.')}
                </p>
                <div className="form-grid-2">
                  <label className="pf-label">
                    {L('שם ההורה או האחראי', 'Parent or guardian name')} <span className="pf-req">*</span>
                    <input type="text" required value={guardianName} onChange={(e) => setGuardianName(e.target.value)}
                      placeholder={L('שם מלא', 'Full name')} />
                  </label>
                  <label className="pf-label">
                    {L('מייל של ההורה', 'Parent email')} <span className="pf-req">*</span>
                    <input type="email" dir="ltr" required value={guardianEmail}
                      onChange={(e) => setGuardianEmail(e.target.value)} placeholder="parent@example.com" />
                  </label>
                  <label className="pf-label">
                    {L('טלפון של ההורה', 'Parent phone')}
                    <input type="tel" dir="ltr" value={guardianPhone}
                      onChange={(e) => setGuardianPhone(e.target.value)} placeholder="050-0000000" maxLength={20} />
                  </label>
                  <label className="pf-label">
                    {L('הקשר אליך', 'Relation to you')}
                    <select value={guardianRelation} onChange={(e) => setGuardianRelation(e.target.value)}>
                      <option value="">{L('בחר/י...', 'Select...')}</option>
                      {RELATIONS.map((r) => (
                        <option key={r.value} value={r.value}>{r.label()}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="pf-guardian-note">
                  {L('עד שההורה מאשר, החשבון ממתין: אי אפשר להצטרף לקבוצה או לתקשר עם המאמן.',
                     'Until they approve, the account waits: you cannot join a team or talk to a coach.')}
                </p>

                {/* legacy — נראה רק אם המסד עוד לא הריץ את מיגרציית ההסכמות
                    והטריגר הישן חסם את השמירה. במסלול הרגיל הצ'קבוקס הזה לא קיים. */}
                {legacyMode && (
                  <label className="pf-consent">
                    <input type="checkbox" checked={legacyConsent} onChange={(e) => setLegacyConsent(e.target.checked)} />
                    <span>
                      {L('ההורה שלי קרא את ', 'My parent has read the ')}
                      <a href="/terms.html" target="_blank" rel="noopener noreferrer">{L('תנאי השימוש', 'terms of use')}</a>
                      {L(' ואת ', ' and the ')}
                      <a href="/privacy.html" target="_blank" rel="noopener noreferrer">{L('מדיניות הפרטיות', 'privacy policy')}</a>
                      {L(' ומאשר את פתיחת החשבון.', ' and approves opening this account.')}
                    </span>
                  </label>
                )}
              </div>
            )}
            <p className="muted small">{L('אחרי השמירה מתחברים לקבוצה עם קוד מהמאמן.', 'After saving you’ll join your team with a code from your coach.')}</p>
          </section>
        ) : (
          <>
          <section className="form-section">
            <h3 className="form-section-title">
              <ShieldCheck size={16} /> {L('אימות גיל', 'Age check')}
            </h3>
            <label className="pf-label">
              {L('תאריך לידה', 'Date of birth')} {isNewCoach && <span className="pf-req">*</span>}
              <input
                type="date"
                dir="ltr"
                min="1940-01-01"
                max={new Date().toISOString().slice(0, 10)}
                required={isNewCoach && !birthYear}
                value={birthDate}
                onChange={(e) => onBirthDate(e.target.value)}
              />
              <span className="muted small">
                {L('חשבון מאמן מיועד לבגירים (18+). התאריך נשמר בחשבונך לאימות גיל בלבד, ואינו מוצג לאף משתמש אחר.',
                   'A coach account is for adults (18+). The date is stored on your account for age verification only and is shown to no other user.')}
              </span>
            </label>
          </section>
          <section className="form-section">
            <h3 className="form-section-title">
              <Users2 size={16} /> {L('הקבוצות שאני מאמן', 'Teams I coach')}
            </h3>
            <p className="muted small">{L('בחר את כל הקבוצות שאתה מאמן (שכבה ומגדר). אפשר לבחור כמה.', 'Select all the teams you coach (age group and gender). You can pick several.')}</p>
            <MultiSelect
              options={TEAM_OPTIONS}
              selected={teams}
              onToggle={toggleTeam}
              renderLabel={trTeam}
              placeholder={L('בחר קבוצות...', 'Select teams...')}
            />
          </section>
          </>
        )}

        {/* מה מוצג למאמנים אחרים — הפרטיות היא החלטה, ולכן היא מסוכמת
            כאן במילים ולא נשארת מפוזרת בין מתגים. */}
        {!isPlayer && (
          <section className="form-section pf-public">
            <h3 className="form-section-title">
              <Eye size={16} /> {L('מה מאמנים אחרים רואים', 'What other coaches see')}
            </h3>
            <ul className="pf-public-list">
              <li><Check size={14} /> {L('השם, המועדון והקבוצות שאתה מאמן', 'Your name, club and the teams you coach')}</li>
              <li><Check size={14} /> {L('התרגילים והתוכניות ששיתפת לקהילה', 'The drills and plans you shared with the community')}</li>
              <li className={phonePublic ? '' : 'off'}>
                {phonePublic ? <Check size={14} /> : <EyeOff size={14} />}
                {phonePublic ? L('מספר הטלפון שלך', 'Your phone number') : L('הטלפון שלך מוסתר', 'Your phone stays hidden')}
              </li>
              <li className="off"><EyeOff size={14} /> {L('כתובת המייל — לעולם לא מוצגת', 'Your email — never shown')}</li>
            </ul>
          </section>
        )}

        {/* השגיאה ישבה עד היום מתחת לכפתור, מחוץ למסך בטופס ארוך */}
        {error && <div className="alert alert-error" role="alert">{error}</div>}

        <div className="form-actions pf-actions">
          <button type="submit" className="btn-primary" disabled={saving} aria-busy={saving}>
            {saving && <span className="btn-spinner" aria-hidden="true" />}
            {saving ? L('שומר...', 'Saving...') : L('שמירת הפרופיל', 'Save profile')}
          </button>
          {onCancel && (
            <button
              type="button"
              className="btn-ghost"
              onClick={onCancel}
              disabled={saving}
            >
              {L('ביטול', 'Cancel')}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
