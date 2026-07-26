import { ChevronLeft, ChevronRight, ArrowLeft, ArrowRight } from 'lucide-react'
import { getDir } from './i18n'

// אייקונים כיווניים שמתהפכים לפי שפה (חוק המסמך: RTL מלא).
// בעברית "קדימה/הבא" מצביע שמאלה; באנגלית ימינה — עד היום החצים
// היו קשיחים והצביעו לכיוון הלא נכון במצב English.
//
// שימוש:
//   <ChevronFwd size={16} />   — "המשך / פתח / הבא"
//   <ChevronBack size={16} />  — "חזרה / הקודם"
//   <ArrowFwd size={18} />     — חץ מלא קדימה
//   <ArrowBack size={18} />    — חץ מלא אחורה

const isRtl = () => getDir() === 'rtl'

export function ChevronFwd(props) {
  const C = isRtl() ? ChevronLeft : ChevronRight
  return <C aria-hidden="true" {...props} />
}

export function ChevronBack(props) {
  const C = isRtl() ? ChevronRight : ChevronLeft
  return <C aria-hidden="true" {...props} />
}

export function ArrowFwd(props) {
  const C = isRtl() ? ArrowLeft : ArrowRight
  return <C aria-hidden="true" {...props} />
}

export function ArrowBack(props) {
  const C = isRtl() ? ArrowRight : ArrowLeft
  return <C aria-hidden="true" {...props} />
}
