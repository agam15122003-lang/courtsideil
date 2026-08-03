import { useState, useEffect, useRef, useCallback } from 'react'
import { signedMediaUrl, noteImageError, SIGNED_TTL } from './storage'

// תמונה שמוגשת דרך signed URL. ה-bucket 'media' פרטי — אין יותר כתובת
// ציבורית קבועה לתמונת פנים של קטין. הרכיב מחזיר null כשאי אפשר לחתום
// (למשל כשההרשאה נדחתה), כדי שהנפילה חזרה של הקורא — ראשי תיבות, מצב ריק —
// תוצג במקום אייקון תמונה שבורה.

// useSignedMediaUrl — הוק לשימוש כשצריך את הכתובת עצמה (רקע CSS, href).
// מחזיר { url, onError }: את onError יש לחבר ל-onError של ה-<img>.
export function useSignedMediaUrl(src, transform = null, expiresIn = SIGNED_TTL) {
  const width = transform?.width || null
  const quality = transform?.quality || null
  const [url, setUrl] = useState(null)
  const [broken, setBroken] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const urlRef = useRef(null)

  useEffect(() => {
    let alive = true
    // מאפסים בלי לגרום לרינדור מיותר כשהמצב ממילא ריק (יש הרבה אווטארים בלי תמונה)
    setUrl((cur) => (cur === null ? cur : null))
    setBroken((cur) => (cur === false ? cur : false))
    urlRef.current = null
    if (!src) return undefined
    signedMediaUrl(src, expiresIn, width ? { width, quality: quality || undefined } : null)
      .then((u) => {
        if (!alive) return
        urlRef.current = u || null
        setUrl(u || null)
      })
      .catch(() => {
        if (alive) setUrl(null)
      })
    return () => {
      alive = false
    }
  }, [src, width, quality, expiresIn, attempt])

  // כשל טעינה: אם זו כתובת טרנספורמציה — מנסים שוב עם התמונה המלאה, אחרת מוותרים
  const onError = useCallback(() => {
    if (noteImageError(urlRef.current)) setAttempt((a) => a + 1)
    else setBroken(true)
  }, [])

  return { url: broken ? null : url, onError }
}

// props: src (נתיב ב-bucket או URL ישן/חיצוני), transform ({width, quality}),
// ושאר תכונות <img> הרגילות. width/height נועדו למנוע קפיצת פריסה (CLS).
export default function SignedImg({
  src,
  transform = null,
  expiresIn = SIGNED_TTL,
  loading = 'lazy',
  alt = '',
  ...rest
}) {
  const { url, onError } = useSignedMediaUrl(src, transform, expiresIn)
  if (!url) return null
  return <img src={url} alt={alt} loading={loading} onError={onError} {...rest} />
}
