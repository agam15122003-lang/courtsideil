// מערכת Toast קלילה — store ברמת מודול, בלי prop-drilling.
// שימוש מכל מקום: import { toast } from './toast'; toast.success('נשמר')
let listeners = []
let counter = 0

function emit(message, type) {
  const item = { id: ++counter, message, type }
  listeners.forEach((fn) => fn(item))
}

export const toast = {
  success: (m) => emit(m, 'success'),
  error: (m) => emit(m, 'error'),
  info: (m) => emit(m, 'info'),
}

export function subscribe(fn) {
  listeners.push(fn)
  return () => {
    listeners = listeners.filter((l) => l !== fn)
  }
}
