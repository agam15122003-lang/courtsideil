import { toast } from './toast'
import { L } from './i18n'
import { SITE_URL } from './constants'

// שיתוף בוואטסאפ — פותח שיחה עם הטקסט מוכן לשליחה
export function waShare(text) {
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener')
}

// קישור ציבורי לתרגיל (נפתח יפה גם בלי חשבון).
// SITE_URL ולא window.location.origin — בתוך אפליקציה נייטיבית ה-origin הוא
// capacitor://localhost והלינק היה מגיע מת אצל הנמען.
export function drillLink(id) {
  return `${SITE_URL}/#/drill/${id}`
}

// העתקה ללוח עם טוסט
export async function copyText(text, doneMsg) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(doneMsg || L('הקישור הועתק', 'Link copied'))
  } catch {
    toast.error(L('ההעתקה נכשלה', 'Copy failed'))
  }
}

// טקסט הזמנה לקהילה
export function inviteText() {
  return L(
    `🏀 אני ב-CourtSide — הבית הדיגיטלי של מאמני הכדורסל: תרגילים, תוכניות אימון, לוח טקטיקה וקהילת מאמנים. מצטרפים חינם:\n${SITE_URL}`,
    `🏀 I'm on CourtSide — the basketball coaches' digital home: drills, practice plans, tactics board and a coaching community. Join free:\n${SITE_URL}`
  )
}
