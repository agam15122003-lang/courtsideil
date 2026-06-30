import { Globe } from 'lucide-react'
import { useLang } from './i18n'

// כפתור מעבר עברית ⇄ English. מציג את השפה שאליה אפשר לעבור.
export default function LanguageToggle() {
  const { lang, setLang } = useLang()
  return (
    <button
      className="btn-ghost icon-toggle"
      onClick={() => setLang(lang === 'he' ? 'en' : 'he')}
      title="Language / שפה"
      aria-label="Switch language / החלפת שפה"
    >
      <Globe size={16} /> {lang === 'he' ? 'EN' : 'עב'}
    </button>
  )
}
