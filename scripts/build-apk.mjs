// בניית קובץ ההתקנה לאנדרואיד. מריצים דרך `npm run app:build`, שמסנכרן
// קודם את האתר לתוך הפרויקט הנייטיבי ואז קורא לכאן.
//
// למה סקריפט ולא שורה ב-package.json: הקריאה ל-gradlew חייבת לדעת אם היא
// רצה תחת cmd (gradlew.bat) או תחת shell של יוניקס (./gradlew), ו-npm
// בוחר ביניהם לפי המערכת. שורה אחת שעובדת בשתיהן לא קיימת.
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const androidDir = join(root, 'android')

if (!existsSync(androidDir)) {
  console.error('אין תיקיית android. הרץ קודם:  npx cap add android')
  process.exit(1)
}

const isWin = process.platform === 'win32'
const cmd = join(androidDir, isWin ? 'gradlew.bat' : 'gradlew')

// איתור ה-JDK.
//
// הבנייה דורשת JDK 21. Android Studio מגיע עם 25, ו-Gradle 8.14.3 (הגרסה
// ש-Capacitor מקבע) אינו יודע לקרוא אותה — נופל על
// "Unsupported class file major version 69".
//
// org.gradle.java.home ב-~/.gradle/gradle.properties אומר ל-Gradle במה
// לבנות, אבל **לא מספיק**: הסקריפט gradlew הוא זה שמרים את ה-JVM מלכתחילה,
// והוא מחפש JAVA_HOME בסביבה. בלי השורות האלה הבנייה נעצרת עוד לפני
// ש-Gradle קרא את הקובץ הזה בכלל.
//
// הקובץ יושב מחוץ לריפו במכוון — הנתיב נכון למחשב אחד ולא לאף אחד אחר.
function jdkFromGradleProps() {
  const f = join(homedir(), '.gradle', 'gradle.properties')
  if (!existsSync(f)) return null
  const m = readFileSync(f, 'utf8').match(/^\s*org\.gradle\.java\.home\s*=\s*(.+)$/m)
  if (!m) return null
  // ב-.properties הקו הנטוי מוכפל כתו בריחה. מחזירים אותו לנתיב אמיתי.
  const p = m[1].trim().replace(/\\\\/g, '\\')
  return existsSync(p) ? p : null
}

const javaHome = process.env.JAVA_HOME || jdkFromGradleProps()
if (!javaHome) {
  console.error('לא נמצאה Java לבנייה.')
  console.error('הגדר org.gradle.java.home ב-~/.gradle/gradle.properties, או JAVA_HOME בסביבה.')
  console.error('נדרשת גרסה 21 — לא 25.')
  process.exit(1)
}

const child = spawn(cmd, ['assembleDebug'], {
  cwd: androidDir,
  stdio: 'inherit',
  shell: isWin,
  env: { ...process.env, JAVA_HOME: javaHome },
})

child.on('exit', (code) => {
  if (code === 0) {
    console.log('\nקובץ ההתקנה מוכן:')
    console.log('  android/app/build/outputs/apk/debug/app-debug.apk')
  } else {
    console.error('\nהבנייה נכשלה. אם השגיאה מזכירה "class file major version" —')
    console.error('זו גרסת ה-Java. ראו ההערה בראש הקובץ הזה.')
  }
  process.exit(code ?? 1)
})
