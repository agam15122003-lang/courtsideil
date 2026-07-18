import { useSyncExternalStore } from 'react'
import { ageOf, genderOf } from './constants'

// ===== מערכת שפות (i18n) =====
// שפת ברירת מחדל: עברית (RTL). מעבר לאנגלית מחליף גם את כיוון הדף ל-LTR.
const KEY = 'lang_v1'
const listeners = new Set()

let lang = 'he'
try {
  lang = localStorage.getItem(KEY) || 'he'
} catch {
  lang = 'he'
}

export const DICT = {
  he: {
    // ניווט
    'nav.home': 'בית',
    'nav.community': 'קהילה',
    'nav.profile': 'פרופיל',
    'nav.teams': 'הקבוצות שלי',
    'nav.finder': 'מאמנים',
    'nav.drills': 'תרגילים',
    'nav.plans': 'תוכניות',
    'nav.schedule': 'לו"ז',
    'nav.media': 'מדיה',
    'nav.video': 'עריכת וידאו',
    'nav.messages': 'הודעות',
    'nav.admin': 'ניהול',
    // פעולות כלליות
    'action.signout': 'התנתקות',
    'action.editProfile': 'עריכת פרטים',
    'common.openMenu': 'פתיחת תפריט',
    'common.closeMenu': 'סגירת תפריט',
    'common.loadingProfile': 'טוען את הפרטים שלך...',
    // פרופיל
    'profile.myProfile': 'הפרופיל שלי',
    'profile.club': 'מועדון',
    'profile.email': 'אימייל',
    'profile.phone': 'טלפון',
    'profile.groups': 'קבוצות',
    'profile.shownToCoaches': 'מוצג למאמנים',
    'profile.private': 'פרטי',
    'profile.notSpecified': 'לא צוין',
    // דילוג לתוכן
    'skip.toContent': 'דלג לתוכן',
    // נגישות
    'a11y.title': 'נגישות',
    'a11y.menu': 'תפריט נגישות',
    'a11y.close': 'סגירה',
    'a11y.language': 'שפה',
    'a11y.textSize': 'גודל טקסט',
    'a11y.increase': 'הגדלת טקסט',
    'a11y.decrease': 'הקטנת טקסט',
    'a11y.contrast': 'ניגודיות גבוהה',
    'a11y.grayscale': 'גווני אפור',
    'a11y.links': 'הדגשת קישורים',
    'a11y.motion': 'עצירת אנימציות',
    'a11y.readable': 'גופן קריא',
    'a11y.spacing': 'ריווח טקסט',
    'a11y.reset': 'איפוס הגדרות',
    'a11y.statementLink': 'הצהרת נגישות',
    'a11y.contactUs': 'צרו קשר',
    // הצהרת נגישות
    'a11y.st.title': 'הצהרת נגישות',
    'a11y.st.intro':
      'אנו ב-CourtSide רואים חשיבות רבה במתן שירות שוויוני לכלל המשתמשים, ופועלים להנגשת האתר כך שיהיה נגיש לאנשים עם מוגבלות.',
    'a11y.st.level':
      'האתר שואף לעמוד בדרישות תקנות שוויון זכויות לאנשים עם מוגבלות (התשע"ג-2013) ובתקן הישראלי ת"י 5568 ברמת AA, המבוסס על הנחיות WCAG 2.0.',
    'a11y.st.tools':
      'באתר מותקן רכיב נגישות (הכפתור עם סמל הנגישות) המאפשר: הגדלת טקסט, ניגודיות גבוהה, גווני אפור, הדגשת קישורים, עצירת אנימציות, גופן קריא, ריווח טקסט ומעבר שפה.',
    'a11y.st.limitations':
      'ייתכנו דפים או רכיבים שטרם הונגשו במלואם. אנו ממשיכים לשפר את הנגישות באופן שוטף.',
    'a11y.st.coordinatorTitle': 'רכז הנגישות',
    'a11y.st.coordinator':
      'נתקלתם בקושי בגלישה או בבעיית נגישות? נשמח לסייע. ניתן לפנות לרכז הנגישות:',
    'a11y.st.namePlaceholder': 'אגם אדירי',
    'a11y.st.phonePlaceholder': '052-626-8252',
    'a11y.st.updated': 'עודכן לאחרונה: יוני 2026',
  },
  en: {
    'nav.home': 'Home',
    'nav.community': 'Community',
    'nav.profile': 'Profile',
    'nav.teams': 'My Teams',
    'nav.finder': 'Coaches',
    'nav.drills': 'Drills',
    'nav.plans': 'Plans',
    'nav.schedule': 'Schedule',
    'nav.media': 'Media',
    'nav.video': 'Video editor',
    'nav.messages': 'Messages',
    'nav.admin': 'Admin',
    'action.signout': 'Sign out',
    'action.editProfile': 'Edit details',
    'common.openMenu': 'Open menu',
    'common.closeMenu': 'Close menu',
    'common.loadingProfile': 'Loading your details...',
    'profile.myProfile': 'My profile',
    'profile.club': 'Club',
    'profile.email': 'Email',
    'profile.phone': 'Phone',
    'profile.groups': 'Teams',
    'profile.shownToCoaches': 'Shown to coaches',
    'profile.private': 'Private',
    'profile.notSpecified': 'Not specified',
    'skip.toContent': 'Skip to content',
    'a11y.title': 'Accessibility',
    'a11y.menu': 'Accessibility menu',
    'a11y.close': 'Close',
    'a11y.language': 'Language',
    'a11y.textSize': 'Text size',
    'a11y.increase': 'Increase text',
    'a11y.decrease': 'Decrease text',
    'a11y.contrast': 'High contrast',
    'a11y.grayscale': 'Grayscale',
    'a11y.links': 'Highlight links',
    'a11y.motion': 'Stop animations',
    'a11y.readable': 'Readable font',
    'a11y.spacing': 'Text spacing',
    'a11y.reset': 'Reset settings',
    'a11y.statementLink': 'Accessibility statement',
    'a11y.contactUs': 'Contact us',
    'a11y.st.title': 'Accessibility Statement',
    'a11y.st.intro':
      'At CourtSide we are committed to providing equal service to all users and work to make our website accessible to people with disabilities.',
    'a11y.st.level':
      'This website strives to comply with the Israeli Equal Rights for Persons with Disabilities Regulations (2013) and the Israeli Standard IS 5568 at level AA, based on the WCAG 2.0 guidelines.',
    'a11y.st.tools':
      'The site includes an accessibility widget (the button with the accessibility icon) that allows: enlarging text, high contrast, grayscale, highlighting links, stopping animations, a readable font, text spacing and language switching.',
    'a11y.st.limitations':
      'Some pages or components may not yet be fully accessible. We continuously work to improve accessibility.',
    'a11y.st.coordinatorTitle': 'Accessibility Coordinator',
    'a11y.st.coordinator':
      'Encountered an accessibility issue? We are happy to help. You can contact the accessibility coordinator:',
    'a11y.st.namePlaceholder': 'Agam Adiri',
    'a11y.st.phonePlaceholder': '052-626-8252',
    'a11y.st.updated': 'Last updated: June 2026',
  },
}

export function getLang() {
  return lang
}
export function getDir() {
  return lang === 'he' ? 'rtl' : 'ltr'
}
export function applyDir() {
  document.documentElement.lang = lang
  document.documentElement.dir = getDir()
}
export function setLang(next) {
  if (next === lang) return
  lang = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    /* ignore */
  }
  applyDir()
  listeners.forEach((l) => l())
}
// תרגום צמוד-לקוד: L('טקסט עברי', 'English text') → לפי השפה הנבחרת.
export function L(he, en) {
  return lang === 'en' ? en : he
}

// ===== מילון ערכי דומיין (enum) — הערך הנשמר ב-DB נשאר עברית; רק התצוגה מתורגמת =====
const TR = {
  // שכבות גיל
  'בית ספר לכדורסל': 'Basketball School',
  'קטסל ב׳': 'Mini B',
  'קטסל א׳': 'Mini A',
  'ילדים ב׳': 'Children B',
  'ילדים א׳': 'Children A',
  'נערים ב׳': 'Youth B',
  'נערים א׳': 'Youth A',
  נוער: 'Juniors',
  בוגרים: 'Seniors',
  // מגדר
  בנים: 'Boys',
  בנות: 'Girls',
  // קטגוריות תרגיל
  יסודות: 'Fundamentals',
  הגנה: 'Defense',
  התקפה: 'Offense',
  'ניהול אימון': 'Practice Management',
  'ניהול משחק': 'Game Management',
  'פיתוח שחקן': 'Player Development',
  // רמות קושי
  קל: 'Easy',
  בינוני: 'Medium',
  מתקדם: 'Advanced',
  // קטגוריות וידאו
  כדרור: 'Dribbling',
  קליעה: 'Shooting',
  מסירות: 'Passing',
  ריבאונד: 'Rebounding',
  'תנועה בלי כדור': 'Movement Without Ball',
  טקטיקה: 'Tactics',
  כושר: 'Conditioning',
}

// tr(value) — מתרגם ערך דומיין לתצוגה (אם אנגלית). אם אין תרגום — מחזיר כמו שהוא.
export function tr(s) {
  if (lang !== 'en' || s == null) return s
  return TR[s] || s
}

// trTeam(entry) — מתרגם קבוצה מקודדת "<שכבה> <מגדר>" (כל חלק בנפרד).
export function trTeam(entry) {
  if (lang !== 'en' || !entry) return entry
  const g = genderOf(entry)
  if (!g) return tr(entry)
  return tr(ageOf(entry)) + ' ' + tr(g)
}
export function t(key, vars) {
  const table = DICT[lang] || DICT.he
  let s = table[key] ?? DICT.he[key] ?? key
  if (vars) for (const k in vars) s = s.replaceAll('{' + k + '}', vars[k])
  return s
}
function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// hook: גורם ל-re-render בכל החלפת שפה ומחזיר {lang, dir, setLang, t}
export function useLang() {
  const l = useSyncExternalStore(subscribe, getLang, getLang)
  return { lang: l, dir: getDir(), setLang, t }
}
