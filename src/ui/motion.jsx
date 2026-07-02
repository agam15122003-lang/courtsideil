// שכבת מוֹשֶׁן מרכזית — LazyMotion טוען רק את פיצ'רי ה-DOM (חבילה קטנה),
// ו-strict מבטיח שכל האפליקציה משתמשת רק ב-m.* (לא motion.* המלא).
import { LazyMotion, domAnimation, m, AnimatePresence, useReducedMotion } from 'framer-motion'

export { m, AnimatePresence, useReducedMotion }

// מתג "ביטול אנימציות" של ווידג'ט הנגישות (html.a11y-motion) — משלים את הגדרת ה-OS.
// ה-CSS מנוטרל ע"י המחלקה עצמה; JS (framer/rAF) חייב לבדוק אותה במפורש.
export const motionOff = () =>
  typeof document !== 'undefined' && document.documentElement.classList.contains('a11y-motion')

export function MotionRoot({ children }) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  )
}

// טוקני תנועה משותפים — תואמים ל---dur-*/--ease-out שב-CSS
export const EASE_OUT = [0.22, 1, 0.36, 1]
export const DUR_FAST = 0.14
export const DUR_BASE = 0.22
export const DUR_SLOW = 0.38

// וריאנטים לכניסת עמוד — fade + הרמה קלה (משרת הבנה, לא מופע)
export const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: DUR_BASE, ease: EASE_OUT } },
  exit: { opacity: 0, y: -6, transition: { duration: DUR_FAST, ease: 'easeIn' } },
}

// וריאנטים לרשימות — כניסה מדורגת של ילדים
export const listVariants = {
  animate: { transition: { staggerChildren: 0.05 } },
}
export const itemVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: DUR_BASE, ease: EASE_OUT } },
}
