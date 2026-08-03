import { useState, useEffect, useCallback, useMemo } from 'react'
import { UserPlus, Copy, Check, X, Share2, KeyRound, QrCode } from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { L, trTeam } from './i18n'
import { getOrCreateJoinCode, pendingRequests, decideMembership } from './players'
import { waShare } from './share'
import { SITE_URL } from './constants'
import Avatar from './Avatar'

// פאנל "חיבור שחקנים" למאמן — לינק/קוד הצטרפות, QR לסריקה בסוף אימון,
// מד "כמה מהסגל כבר מחוברים", ואישור בקשות ממתינות.
// props: coachId, team, onApproved() — לרענון הסגל אחרי אישור
export default function TeamConnect({ coachId, team, onApproved }) {
  const [code, setCode] = useState(null)
  const [reqs, setReqs] = useState([])
  const [copied, setCopied] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [meter, setMeter] = useState(null) // {connected, total}

  const loadReqs = useCallback(async () => {
    setReqs((await pendingRequests(coachId)).filter((r) => r.team === team))
  }, [coachId, team])

  useEffect(() => { loadReqs() }, [loadReqs])
  useEffect(() => {
    let alive = true
    ;(async () => {
      try { const c = await getOrCreateJoinCode(coachId, team); if (alive) setCode(c) }
      catch { /* טבלת הקודים עוד לא קיימת — לא מציגים */ }
      // מד מחוברים: כמה משורות הסגל כבר מקושרות לחשבון שחקן
      const { data } = await supabase.from('team_players')
        .select('id, player_id').eq('coach_id', coachId).eq('team', team)
      if (alive && data) setMeter({ connected: data.filter((p) => p.player_id).length, total: data.length })
    })()
    return () => { alive = false }
  }, [coachId, team])

  const playerName = (p) => p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() || L('שחקן', 'Player') : L('שחקן', 'Player')

  const decide = async (m, approve) => {
    const res = await decideMembership({ ...m }, approve)
    if (!res.ok) { toast.error(L('הפעולה נכשלה: ', 'Action failed: ') + res.reason); return }
    toast.success(approve ? L('השחקן אושר והתווסף לסגל', 'Player approved and added to the roster') : L('הבקשה נדחתה', 'Request declined'))
    loadReqs()
    if (approve) onApproved?.()
  }

  // לינק הצטרפות: פותח את האפליקציה עם הקוד כבר בפנים — צעד אחד במקום חמישה.
  // SITE_URL ולא window.location.origin — בתוך WebView נייטיב ה-origin הוא
  // capacitor://localhost, והלינק שנשלח בוואטסאפ היה מגיע מת אצל השחקן.
  const joinUrl = code ? `${SITE_URL}/#/join/${code}` : ''
  // ה-QR נוצר מקומית (ראו qrPath בתחתית הקובץ) — בלי לשלוח את קוד ההצטרפות
  // של קבוצת קטינים לשירות חיצוני, ובלי תלות ברשת בתוך האפליקציה.
  const qr = useMemo(() => (joinUrl ? qrPath(joinUrl) : null), [joinUrl])

  const copy = async () => {
    try { await navigator.clipboard.writeText(joinUrl || code); setCopied(true); setTimeout(() => setCopied(false), 1500) }
    catch { /* ignore */ }
  }

  const shareText = L(
    `הצטרפו לקבוצה שלנו ב-CourtSide! לוחצים על הלינק ונרשמים כשחקן — הקוד כבר בפנים:\n${joinUrl}`,
    `Join our team on CourtSide! Tap the link and sign up as a player — the code is already in:\n${joinUrl}`
  )

  if (!code && reqs.length === 0) return null

  return (
    <div className="tc-panel tc-open">
      <div className="tc-head tc-head-static">
        <span className="tc-head-l"><UserPlus size={16} /> {L('חיבור שחקנים לקבוצה', 'Connect players')}</span>
        <span className="tc-head-r">
          {meter && meter.total > 0 && (
            <span className={meter.connected === meter.total ? 'tc-meter full' : 'tc-meter'}>
              {L(`${meter.connected} מתוך ${meter.total} מחוברים`, `${meter.connected} of ${meter.total} connected`)}
            </span>
          )}
          {reqs.length > 0 && <span className="tc-badge">{reqs.length}</span>}
        </span>
      </div>

      <div className="tc-body">
          {code && (
            <div className="tc-code-block">
              <span className="tc-code-label"><KeyRound size={14} /> {L(`קוד ההצטרפות ל${trTeam(team)}`, `Join code for ${trTeam(team)}`)}</span>
              <div className="tc-code-row">
                <span className="tc-code" dir="ltr">{code}</span>
                <button className="btn-ghost" onClick={copy}>{copied ? <><Check size={15} /> {L('הועתק', 'Copied')}</> : <><Copy size={15} /> {L('העתקת לינק', 'Copy link')}</>}</button>
                <button className="btn-soft" style={{ marginTop: 0 }} onClick={() => waShare(shareText)}><Share2 size={15} /> {L('שיתוף', 'Share')}</button>
                <button className="btn-ghost" onClick={() => setQrOpen((v) => !v)} aria-expanded={qrOpen}>
                  <QrCode size={15} /> {L('QR', 'QR')}
                </button>
              </div>
              {qrOpen && (
                <div className="tc-qr">
                  {qr ? (
                    <>
                      {/* שולי השקט (4 מודולים מכל צד) הם חלק מהתקן — בלעדיהם סורקים רבים
                          לא מזהים את הקוד. הצבעים חייבים להישאר כהה-על-בהיר בשני מצבי
                          התצוגה, אחרת הסריקה נכשלת — ולכן הם לא נגזרים מטוקני הערכה. */}
                      <svg
                        width="220"
                        height="220"
                        viewBox={`-4 -4 ${qr.size + 8} ${qr.size + 8}`}
                        shapeRendering="crispEdges"
                        style={{ borderRadius: 8 }}
                        role="img"
                        aria-label={L('קוד QR להצטרפות לקבוצה', 'Team join QR code')}
                      >
                        <rect x={-4} y={-4} width={qr.size + 8} height={qr.size + 8} fill="white" />
                        <path d={qr.d} fill="black" />
                      </svg>
                      <p className="muted small">{L('מציגים את המסך בסוף האימון — השחקנים סורקים ונרשמים במקום.', 'Show this at the end of practice — players scan and sign up on the spot.')}</p>
                    </>
                  ) : (
                    /* כשל קידוד (לינק ארוך מהצפוי) — לא מסך ריק: הלינק עצמו עדיין עובד */
                    <p className="muted small">
                      {L('לא הצלחנו לייצר QR ללינק הזה. אפשר להעתיק את הלינק ולשלוח אותו ישירות.', "We couldn't generate a QR for this link. You can copy the link and send it directly.")}
                    </p>
                  )}
                </div>
              )}
              <p className="muted small" style={{ margin: '6px 0 0' }}>
                {L('שולחים את הלינק (או סורקים את ה-QR) — השחקן נרשם, הקוד כבר בפנים, ואתם מאשרים כאן.', 'Send the link (or scan the QR) — the player signs up with the code pre-filled, and you approve here.')}
              </p>
            </div>
          )}

          {reqs.length > 0 && (
            <div className="tc-reqs">
              <span className="tc-code-label">{L('בקשות הצטרפות', 'Join requests')}</span>
              {reqs.map((m) => (
                <div key={m.id} className="tc-req">
                  <Avatar name={playerName(m.player)} url={m.player?.avatar_url} size={34} />
                  <span className="tc-req-name">
                    {playerName(m.player)}
                    {m.player?.position ? <span className="muted small"> · {m.player.position}</span> : ''}
                    {/* אין כאן שנת לידה: privacy4 שלל את ההרשאה על העמודה, והבקשה
                        כולה חזרה כ-42501 — כלומר המסך הזה היה ריק תמיד בפרודקשן. */}
                  </span>
                  <button className="tc-approve" onClick={() => decide(m, true)} aria-label={L('אישור', 'Approve')}><Check size={16} /></button>
                  <button className="tc-reject" onClick={() => decide(m, false)} aria-label={L('דחייה', 'Decline')}><X size={16} /></button>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  )
}

/* ==========================================================================
   מקודד QR מקומי — מצב בייטים, רמת תיקון M, גרסאות 1–10 (עד 213 בתים).
   קודם ה-QR נוצר בקריאה ל-api.qrserver.com, כלומר קוד ההצטרפות של קבוצת
   קטינים נשלח לשרת צד-שלישי בכל פתיחה של הפאנל. בנוסף באפליקציה נייטיבית
   הקריאה הזו נחסמת (CSP/אופליין) וה-QR פשוט לא היה מוצג.
   המימוש כאן עצמאי לגמרי, בלי תלות חדשה ובלי שום קריאת רשת.
   ========================================================================== */

// [קודי תיקון לבלוק, בלוקים בקבוצה 1, בתי נתונים, בלוקים בקבוצה 2, בתי נתונים]
const QR_RS = [
  [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0], [24, 2, 43, 0, 0],
  [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44],
]
const QR_ALIGN = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]]
const QR_REMAIN = [0, 0, 7, 7, 7, 7, 7, 0, 0, 0, 0]

// שדה גלואה GF(256) עם הפולינום הפרימיטיבי 0x11D
const QR_EXP = new Uint8Array(512)
const QR_LOG = new Uint8Array(256)
for (let i = 0, x = 1; i < 255; i++) { QR_EXP[i] = x; QR_LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d }
for (let i = 255; i < 512; i++) QR_EXP[i] = QR_EXP[i - 255]
const qrMul = (a, b) => (a === 0 || b === 0 ? 0 : QR_EXP[QR_LOG[a] + QR_LOG[b]])

// פולינום מחולל של ריד-סולומון, מקדם מוביל ראשון
function qrGenPoly(n) {
  let poly = [1]
  for (let i = 0; i < n; i++) {
    const next = new Array(poly.length + 1).fill(0)
    for (let j = 0; j < poly.length; j++) { next[j] ^= qrMul(poly[j], QR_EXP[i]); next[j + 1] ^= poly[j] }
    poly = next
  }
  return poly.reverse()
}
function qrEc(data, ecLen) {
  const gen = qrGenPoly(ecLen)
  const res = new Array(ecLen).fill(0)
  for (const d of data) {
    const factor = d ^ res[0]
    res.shift(); res.push(0)
    for (let i = 0; i < ecLen; i++) res[i] ^= qrMul(gen[i + 1], factor)
  }
  return res
}
// BCH — למידע הפורמט (15,5) ולמידע הגרסה (18,6)
function qrBch(value, gen, bits) {
  let v = value << bits
  const gb = 32 - Math.clz32(gen)
  while (32 - Math.clz32(v) >= gb) v ^= gen << (32 - Math.clz32(v) - gb)
  return (value << bits) | v
}

const QR_MASKS = [
  (y, x) => (y + x) % 2 === 0,
  (y) => y % 2 === 0,
  (y, x) => x % 3 === 0,
  (y, x) => (y + x) % 3 === 0,
  (y, x) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (y, x) => ((y * x) % 2) + ((y * x) % 3) === 0,
  (y, x) => (((y * x) % 2) + ((y * x) % 3)) % 2 === 0,
  (y, x) => (((y + x) % 2) + ((y * x) % 3)) % 2 === 0,
]

// בונה את מטריצת המודולים. מחזיר { size, grid } או null אם הטקסט ארוך מדי.
function qrMatrix(text) {
  const bytes = Array.from(new TextEncoder().encode(text))
  let version = 0
  for (let v = 1; v <= 10 && !version; v++) {
    const [, b1, d1, b2, d2] = QR_RS[v - 1]
    if ((b1 * d1 + b2 * d2) * 8 - (4 + (v >= 10 ? 16 : 8)) >= bytes.length * 8) version = v
  }
  if (!version) return null

  // ----- זרם הביטים -> בתי נתונים + קודי תיקון, בשזירת בלוקים -----
  const [ecLen, b1, d1, b2, d2] = QR_RS[version - 1]
  const totalData = b1 * d1 + b2 * d2
  const bits = []
  const push = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1) }
  push(4, 4)
  push(bytes.length, version >= 10 ? 16 : 8)
  for (const b of bytes) push(b, 8)
  for (let i = 0; i < 4 && bits.length < totalData * 8; i++) bits.push(0)
  while (bits.length % 8) bits.push(0)
  const cw = []
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]
    cw.push(b)
  }
  for (let i = 0; cw.length < totalData; i++) cw.push(i % 2 ? 0x11 : 0xec)
  const blocks = []
  for (let i = 0, at = 0; i < b1 + b2; i++) {
    const n = i < b1 ? d1 : d2
    const data = cw.slice(at, at + n); at += n
    blocks.push({ data, ec: qrEc(data, ecLen) })
  }
  const stream = []
  const pushByte = (b) => { for (let i = 7; i >= 0; i--) stream.push((b >> i) & 1) }
  for (let i = 0; i < Math.max(d1, d2); i++) for (const bl of blocks) if (i < bl.data.length) pushByte(bl.data[i])
  for (let i = 0; i < ecLen; i++) for (const bl of blocks) pushByte(bl.ec[i])
  for (let i = 0; i < QR_REMAIN[version]; i++) stream.push(0)

  // ----- דפוסי השירות -----
  const size = version * 4 + 17
  const mod = Array.from({ length: size }, () => new Int8Array(size).fill(-1))
  const box = (r, c, w, h, fn) => {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
      const y = r + dy, x = c + dx
      if (y >= 0 && y < size && x >= 0 && x < size) mod[y][x] = fn(dy, dx) ? 1 : 0
    }
  }
  for (const [r, c] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
    box(r - 1, c - 1, 9, 9, (dy, dx) => {
      const y = dy - 1, x = dx - 1
      if (y < 0 || y > 6 || x < 0 || x > 6) return false
      return Math.max(Math.abs(y - 3), Math.abs(x - 3)) !== 2
    })
  }
  for (let i = 8; i < size - 8; i++) { mod[6][i] = i % 2 === 0 ? 1 : 0; mod[i][6] = i % 2 === 0 ? 1 : 0 }
  for (const r of QR_ALIGN[version]) for (const c of QR_ALIGN[version]) {
    if ((r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8)) continue
    box(r - 2, c - 2, 5, 5, (dy, dx) => Math.max(Math.abs(dy - 2), Math.abs(dx - 2)) !== 1)
  }
  mod[4 * version + 9][8] = 1 // המודול הכהה הקבוע
  const fmtCells = []
  for (let i = 0; i <= 5; i++) fmtCells.push([8, i], [i, 8])
  fmtCells.push([8, 7], [8, 8], [7, 8])
  for (let i = 0; i <= 7; i++) fmtCells.push([8, size - 1 - i])
  for (let i = 0; i <= 6; i++) fmtCells.push([size - 1 - i, 8])
  for (const [y, x] of fmtCells) if (mod[y][x] === -1) mod[y][x] = 0
  if (version >= 7) {
    const vinfo = qrBch(version, 0x1f25, 12)
    for (let i = 0; i < 18; i++) {
      const bit = (vinfo >> i) & 1
      mod[Math.floor(i / 3)][size - 11 + (i % 3)] = bit
      mod[size - 11 + (i % 3)][Math.floor(i / 3)] = bit
    }
  }
  const reserved = mod.map((row) => Array.from(row, (v) => v !== -1))

  // ----- פריסת הנתונים בזיגזג משתי עמודות, מלמטה למעלה, בדילוג על עמודה 6 -----
  let idx = 0, up = true
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right = 5
    for (let step = 0; step < size; step++) {
      const y = up ? size - 1 - step : step
      for (const x of [right, right - 1]) {
        if (reserved[y][x]) continue
        mod[y][x] = idx < stream.length ? stream[idx] : 0
        idx++
      }
    }
    up = !up
  }

  // ----- בחירת מסכה לפי ניקוד העונשין של התקן -----
  const penalty = (g) => {
    let p = 0, dark = 0
    const A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0]
    const B = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1]
    for (let i = 0; i < size; i++) {
      for (const line of [g[i], g.map((r) => r[i])]) {
        let run = 1
        for (let j = 1; j < size; j++) {
          if (line[j] === line[j - 1]) run++
          else { if (run >= 5) p += run - 2; run = 1 }
        }
        if (run >= 5) p += run - 2
        for (let j = 0; j + 11 <= size; j++) {
          if (A.every((v, k) => line[j + k] === v) || B.every((v, k) => line[j + k] === v)) p += 40
        }
      }
    }
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
      const v = g[y][x]
      if (v === g[y][x + 1] && v === g[y + 1][x] && v === g[y + 1][x + 1]) p += 3
    }
    for (const row of g) for (const v of row) dark += v
    p += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10
    return p
  }
  let best = null, bestScore = Infinity
  for (let m = 0; m < 8; m++) {
    const g = mod.map((r) => Array.from(r))
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!reserved[y][x]) g[y][x] ^= QR_MASKS[m](y, x) ? 1 : 0
    const fmt = qrBch((0 << 3) | m, 0x537, 10) ^ 0x5412 // 0 = רמת תיקון M
    const bit = (i) => (fmt >> i) & 1
    // מיקום 15 ביטי הפורמט לפי ISO/IEC 18004 §8.9. שני העותקים חייבים לצאת
    // זהים — כאן היה באג: העותק הראשון נכתב משוחלף (השורה קיבלה את הביטים של
    // העמודה ולהפך), כלומר קוד תקין למראה שאף סורק לא מצליח לקרוא, כי מידע
    // הפורמט הוא הדבר הראשון שהסורק מפענח והוא קבע רמת תיקון ומסכה שגויות.
    // העותק הראשון (סביב הגלאי השמאלי-עליון): ביטים 0-5 יורדים בעמודה 8,
    // ביטים 9-14 רצים בשורה 8 מימין לשמאל, ושלושת ביטי הפינה 6/7/8 באמצע.
    for (let i = 0; i <= 5; i++) { g[i][8] = bit(i); g[8][i] = bit(14 - i) }
    g[7][8] = bit(6); g[8][8] = bit(7); g[8][7] = bit(8)
    // העותק השני (מפוצל בין הגלאי הימני-עליון לשמאלי-תחתון) — היה נכון מלכתחילה.
    for (let i = 0; i <= 7; i++) g[8][size - 1 - i] = bit(i)
    for (let i = 0; i <= 6; i++) g[size - 1 - i][8] = bit(14 - i)
    const s = penalty(g)
    if (s < bestScore) { bestScore = s; best = g }
  }
  return { size, grid: best }
}

// מחזיר את המודולים הכהים כנתיב SVG אחד (מיזוג רצפים באותה שורה — עשרות
// אלמנטים במקום מאות). מחזיר null אם הקידוד נכשל.
function qrPath(text) {
  let m = null
  try { m = qrMatrix(text) } catch { m = null }
  if (!m) return null
  let d = ''
  for (let y = 0; y < m.size; y++) {
    let x = 0
    while (x < m.size) {
      if (!m.grid[y][x]) { x++; continue }
      let w = 1
      while (x + w < m.size && m.grid[y][x + w]) w++
      d += `M${x} ${y}h${w}v1h-${w}z`
      x += w
    }
  }
  return { d, size: m.size }
}
