import { useState } from 'react'
import { User, Phone, Building2, Users2, Camera, ClipboardList, Dumbbell, Eye, EyeOff, Check } from 'lucide-react'
import { toast } from './toast'
import { supabase } from './supabaseClient'
import { uploadImage } from './storage'
import Avatar from './Avatar'
import MultiSelect from './MultiSelect'
import { AGE_GROUPS, GENDERS, ISRAELI_CLUBS, teamLabel } from './constants'
import { L, trTeam } from './i18n'

// כל צירופי הקבוצות (שכבה × מגדר) כרשימה שטוחה לבחירה מרובה
const TEAM_OPTIONS = AGE_GROUPS.flatMap((age) => GENDERS.map((g) => teamLabel(age, g)))

// טופס למילוי/עריכת פרטי הפרופיל.
// props:
//   session  - המשתמש המחובר (כדי לדעת איזו שורה לעדכן)
//   profile  - הפרטים הקיימים (יכול להיות חלקי/ריק)
//   onSaved  - פונקציה שתופעל אחרי שמירה מוצלחת
//   onCancel - פונקציה לכפתור "ביטול" (אופציונלי — מוצג רק אם קיים)
export default function ProfileForm({ session, profile, onSaved, onCancel }) {
  // משתמש חדש (עדיין אין שם) — תמיד מתחילים ממסך בחירת התפקיד, גם אם
  // ברירת המחדל של העמודה במסד היא 'coach' (אחרת מסך הבחירה נדלג).
  const [role, setRole] = useState(profile?.first_name ? (profile?.role || '') : '') // '' = טרם נבחר, 'coach' | 'player'
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

  // הסכמת הורה לשחקן מתחת לגיל 18 (מסמך ההשקה 1.15; נאכף גם בטריגר ב-DB)
  const [guardianName, setGuardianName] = useState(profile?.guardian_name || '')
  const [guardianEmail, setGuardianEmail] = useState(profile?.guardian_email || '')
  const [guardianPhone, setGuardianPhone] = useState(profile?.guardian_phone || '')
  const [consent, setConsent] = useState(!!profile?.guardian_consent_at)
  const age = birthYear ? new Date().getFullYear() - Number(birthYear) : null
  const isMinor = isPlayer && age !== null && age < 18

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

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

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    // שער גיל: בלי שנת לידה אין דרך לדעת אם מדובר בקטין, ולקטין נדרשת הסכמת הורה
    if (isPlayer && !birthYear) {
      setError(L('צריך למלא שנת לידה.', 'Birth year is required.'))
      return
    }
    if (isMinor && (!guardianEmail.trim() || !consent)) {
      setError(L('שחקן מתחת לגיל 18 — נדרש מייל של הורה ואישור ההורה.',
        'Player under 18 — a parent email and parental approval are required.'))
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
      payload.position = position.trim() || null
      payload.age_groups = [] // לשחקן אין "קבוצות שאני מאמן"
      payload.phone_public = false // טלפון של שחקן לא מוצג לאף אחד
      if (isMinor) {
        payload.guardian_name = guardianName.trim() || null
        payload.guardian_email = guardianEmail.trim()
        payload.guardian_phone = guardianPhone.trim() || null
        // רשומת הסכמה: מי (guardian_*), מתי (consent_at), גרסת נוסח (version)
        payload.guardian_consent_at = profile?.guardian_consent_at || new Date().toISOString()
        payload.guardian_consent_version = profile?.guardian_consent_version || 'v1 · 1.8.2026'
      }
    } else {
      payload.age_groups = orderedTeams
    }
    // גיבוי: אם עמודות התפקיד עוד לא קיימות במסד — שומרים בלי לחסום
    let { error } = await supabase.from('profiles').upsert(payload)
    if (error && /column .* does not exist|could not find the .* column/i.test(error.message || '')) {
      const { role: _r, birth_year: _b, position: _p, guardian_phone: _gp, guardian_consent_version: _gv, ...basic } = payload
      ;({ error } = await supabase.from('profiles').upsert(basic))
    }

    setSaving(false)

    if (error) {
      setError(L('שמירה נכשלה: ', 'Save failed: ') + error.message)
    } else {
      toast.success(L('הפרופיל נשמר', 'Profile saved'))
      onSaved()
    }
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
      {isNew && (
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

          <div className="avatar-upload">
            <Avatar name={`${firstName} ${lastName}`} url={avatarUrl} size={76} />
            <div className="avatar-upload-actions">
              <label className="btn-soft avatar-pick">
                <Camera size={16} />
                {uploadingAvatar ? L('מעלה...', 'Uploading...') : avatarUrl ? L('החלפת תמונה', 'Change photo') : L('העלאת תמונה', 'Upload photo')}
                <input
                  type="file"
                  accept="image/*"
                  capture="user"
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
                {L('שנת לידה', 'Birth year')} <span className="pf-req">*</span>
                <input
                  type="number"
                  dir="ltr"
                  min="1970"
                  max={new Date().getFullYear()}
                  required
                  value={birthYear}
                  onChange={(e) => setBirthYear(e.target.value)}
                  placeholder={L('למשל 2010', 'e.g. 2010')}
                />
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
                <h4 className="pf-guardian-title">{L('אישור הורה', 'Parental consent')}</h4>
                <p className="muted small">
                  {L('כיוון שאתה מתחת לגיל 18, נדרש אישור של הורה או אחראי כדי להפעיל חשבון שחקן. ההורה יקבל עדכונים על החשבון.',
                    'Because you are under 18, a parent or guardian must approve activating a player account. The parent will receive updates about the account.')}
                </p>
                <div className="form-grid-2">
                  <label className="pf-label">
                    {L('שם ההורה', 'Parent name')}
                    <input type="text" value={guardianName} onChange={(e) => setGuardianName(e.target.value)}
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
                </div>
                <label className="pf-consent">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                  <span>
                    {L('ההורה שלי קרא את ', 'My parent has read the ')}
                    <a href="/privacy.html" target="_blank" rel="noopener noreferrer">{L('מדיניות הפרטיות', 'privacy policy')}</a>
                    {L(' ומאשר את פתיחת החשבון.', ' and approves opening this account.')}
                  </span>
                </label>
              </div>
            )}
            <p className="muted small">{L('אחרי השמירה מתחברים לקבוצה עם קוד מהמאמן.', 'After saving you’ll join your team with a code from your coach.')}</p>
          </section>
        ) : (
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
