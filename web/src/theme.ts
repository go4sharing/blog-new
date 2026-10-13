import { useEffect, useState } from 'react'

export type Mode = 'light' | 'dark' | 'system'
const Q = '(prefers-color-scheme: dark)'

function apply(m: Mode) {
  const dark = m === 'dark' || (m === 'system' && matchMedia(Q).matches)
  document.documentElement.classList.toggle('dark', dark)
}

export function useTheme() {
  const [mode, setMode] = useState<Mode>(() => (localStorage.getItem('theme') as Mode) || 'system')

  useEffect(() => {
    apply(mode)
    localStorage.setItem('theme', mode)
    if (mode !== 'system') return
    const mq = matchMedia(Q)
    const h = () => apply('system')
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [mode])

  const cycle = () => setMode((m) => (m === 'light' ? 'dark' : m === 'dark' ? 'system' : 'light'))
  return { mode, cycle }
}
