// confetti.js — פרץ קונפטי קטן לרגעי הצלחה (השלמת תרגיל/מטרה).
// DOM ישיר בלי state, מכבד prefers-reduced-motion ואת ווידג'ט הנגישות.

const COLORS = ['#F97316', '#FDBA74', '#22C55E', '#6D3FC8', '#C8873F']

export function burstConfetti() {
  if (typeof document === 'undefined') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  if (document.documentElement.classList.contains('a11y-motion')) return
  const wrap = document.createElement('div')
  wrap.className = 'pl-confetti'
  for (let i = 0; i < 16; i++) {
    const p = document.createElement('i')
    p.style.setProperty('--cx', `${(Math.random() * 2 - 1) * 140}px`)
    p.style.setProperty('--cr', `${Math.round(Math.random() * 540 - 270)}deg`)
    p.style.setProperty('--cd', `${(0.75 + Math.random() * 0.5).toFixed(2)}s`)
    p.style.background = COLORS[i % COLORS.length]
    wrap.appendChild(p)
  }
  document.body.appendChild(wrap)
  setTimeout(() => wrap.remove(), 1400)
}
