// שומר על עבודה שלא נשמרה בזמן ניווט בתוך האפליקציה.
//
// למה: מסך «המחברת» מחזיק את כל הדף (טקסט, כתב יד, מגרשים, נוכחות)
// ב-state בלבד — הבעלים ביקש במפורש שלא תהיה שמירה אוטומטית. עד עכשיו
// לחיצה על טאב בסרגל הצד פשוט פירקה את הרכיב, והכול נעלם בלי מילה.
// beforeunload תופס רק רענון/סגירה של הדפדפן, לא מעבר מסך פנימי.
//
// שימוש:
//   במסך העריכה:  useEffect(() => registerUnsaved(dirty ? confirmFn : null), [dirty])
//   במעטפת:       if (!(await confirmLeave())) return   // לפני setView/setTab
let pending = null

// fn — פונקציה שמחזירה Promise<boolean> ("אפשר לצאת?"), או null כשאין שינויים
export function registerUnsaved(fn) {
  pending = fn || null
  return () => { if (pending === fn) pending = null }
}

export function hasUnsaved() {
  return !!pending
}

// המעטפת קוראת לזה לפני כל מעבר מסך. בלי עבודה פתוחה — עובר מיד.
export async function confirmLeave() {
  if (!pending) return true
  const ok = await pending()
  if (ok) pending = null
  return ok
}
