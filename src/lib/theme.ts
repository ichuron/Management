import type { Theme } from './types'

const KEY = 'theme'

export function loadTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    // ストレージが使えない環境では端末の設定に合わせる
  }
  return 'system'
}

export function applyTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // 保存できなくても表示は切り替える
  }
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

/** 「端末に合わせる」のとき、端末側の切り替えに追従する */
export function watchSystemTheme(getTheme: () => Theme): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const onChange = () => {
    if (getTheme() === 'system') applyTheme('system')
  }
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
