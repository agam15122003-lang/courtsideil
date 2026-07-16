import { useState } from 'react'
import { User, Phone, Building2, Users2, Camera } from 'lucide-react'
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
  const [firstName, setFirstName] = useState(profile?.first_name || '')
  const [lastName, setLastName] = useState(profile?.last_name || '')
  const [club, setClub] = useState(profile?.club || '')
  const [phone, setPhone] = useState(profile?.phone || '')
  const [phonePublic, setPhonePublic] = useState(!!profile?.phone_public)
  const [teams, setTeams] = useState(profile?.age_groups || [])
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

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
    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: session.user.id,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        club: club.trim(),
        phone: phone.trim() || null,
        phone_public: phonePublic,
        avatar_url: avatarUrl || null,
        age_groups: orderedTeams,
        updated_at: new Date().toISOString(),
      })

    setSaving(false)

    if (error) {
      setError(L('שמירה נכשלה: ', 'Save failed: ') + error.message)
    } else {
      toast.success(L('הפרופיל נשמר', 'Profile saved'))
      onSaved()
    }
  }

  return (
    <div className="welcome-card profile-form">
      <div className="form-head">
        {!profile?.first_name && <span className="welcome-badge">{L('שלב אחרון בהרשמה', 'Final signup step')}</span>}
        <h2>{profile?.first_name ? L('עריכת הפרופיל', 'Edit profile') : L('ברוך הבא! נשלים את הפרטים', 'Welcome! Let’s complete your details')}</h2>
        <p className="muted small">
          {profile?.first_name
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
            {L('בחר מהרשימה או הקלד שם מועדון', 'Pick from the list or type a club name')} <span className="req-star" aria-hidden="true">*</span>
            <input
              type="text"
              list="clubs-list"
              value={club}
              onChange={(e) => setClub(e.target.value)}
              placeholder={L('התחל להקליד...', 'Start typing...')}
              required
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

        {/* קבוצות */}
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

        <div className="form-actions">
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

      {error && <div className="alert alert-error">{error}</div>}
    </div>
  )
}
