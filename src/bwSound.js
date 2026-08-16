// bwSound.js — הצלילים של עולם הכדורסל (מסמך העיצוב BasketballWorldV2).
//
// סינתזה ב-WebAudio, בלי קובצי אודיו: «סוויש» רעש-לבן מסונן לתשובה נכונה,
// שני טונים יורדים לטעות, קליק קצר למעברים, ופתיחה/סיום עולים. הכל
// מתחת ל-0.1 בעוצמה — אפקט, לא מוזיקה.
//
// ⚠ הבחירה נשמרת ב-localStorage; ברירת המחדל דלוקה. AudioContext נוצר
//   רק בלחיצה הראשונה (מדיניות autoplay של הדפדפנים), ולכן הקריאה
//   הראשונה יכולה להיות שקטה — זה בסדר.

const KEY = 'bw_sound'
let ac = null

export function soundOn() {
  try { return localStorage.getItem(KEY) !== 'off' } catch { return true }
}

export function setSound(on) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off') } catch { /* ignore */ }
  window.dispatchEvent(new Event('bw-sound'))
}

export function playSound(type, n = 0) {
  if (!soundOn()) return
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    ac = ac || new Ctx()
    if (ac.state === 'suspended') ac.resume()
    const t0 = ac.currentTime

    const tone = (f, at, dur, vol = 0.05, wave = 'triangle', to = 0) => {
      const o = ac.createOscillator(); const g = ac.createGain()
      o.type = wave
      o.frequency.setValueAtTime(f, t0 + at)
      if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + at + dur)
      g.gain.setValueAtTime(0.0001, t0 + at)
      g.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur)
      o.connect(g); g.connect(ac.destination)
      o.start(t0 + at); o.stop(t0 + at + dur + 0.05)
    }
    const swish = (at, vol = 0.08) => {
      const len = Math.floor(ac.sampleRate * 0.16)
      const buf = ac.createBuffer(1, len, ac.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len)
      const src = ac.createBufferSource(); src.buffer = buf
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2100; f.Q.value = 0.9
      const g = ac.createGain(); g.gain.value = vol
      src.connect(f); f.connect(g); g.connect(ac.destination)
      src.start(t0 + at)
    }

    if (type === 'good') { swish(0); tone(659, 0.03, 0.16); tone(988, 0.11, 0.22); if (n >= 3) tone(1319, 0.2, 0.2, 0.04) }
    else if (type === 'bad') { tone(300, 0, 0.2, 0.04, 'sine', 170); tone(96, 0.02, 0.13, 0.05) }
    else if (type === 'click') tone(480, 0, 0.05, 0.03)
    else if (type === 'start') { tone(523, 0, 0.08, 0.04); tone(659, 0.08, 0.1, 0.04) }
    else if (type === 'finish') { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.1, 0.2)); swish(0.35, 0.06) }
  } catch { /* אין אודיו — לא נופלים */ }
}
