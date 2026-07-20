import { toast } from './toast'
import { L } from './i18n'

// שיתוף בוואטסאפ — פותח שיחה עם הטקסט מוכן לשליחה
export function waShare(text) {
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener')
}

// קישור ציבורי לתרגיל (נפתח יפה גם בלי חשבון)
export function drillLink(id) {
  return `${window.location.origin}/#/drill/${id}`
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
    `🏀 אני ב-CourtSide — הבית הדיגיטלי של מאמני הכדורסל: תרגילים, תוכניות אימון, לוח טקטיקה וקהילת מאמנים. מצטרפים חינם:\n${window.location.origin}`,
    `🏀 I'm on CourtSide — the basketball coaches' digital home: drills, practice plans, tactics board and a coaching community. Join free:\n${window.location.origin}`
  )
}
