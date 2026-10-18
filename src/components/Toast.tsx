import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

interface ToastMessage {
  id: number
  text: string
  action?: { label: string; run: () => void }
}

const ToastContext = createContext<((text: string, action?: ToastMessage['action']) => void) | null>(null)

const DURATION_MS = 5000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const seq = useRef(0)

  const show = useCallback((text: string, action?: ToastMessage['action']) => {
    seq.current += 1
    setToast({ id: seq.current, text, action })
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast((t) => (t?.id === toast.id ? null : t)), DURATION_MS)
    return () => clearTimeout(timer)
  }, [toast])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(9rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 lg:bottom-8">
        {toast && (
          <div className="pointer-events-auto flex max-w-md items-center gap-4 rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow-lg dark:bg-slate-100 dark:text-slate-900">
            <span>{toast.text}</span>
            {toast.action && (
              <button
                type="button"
                className="font-bold text-teal-300 underline-offset-2 hover:underline dark:text-teal-700"
                onClick={() => {
                  toast.action!.run()
                  setToast(null)
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast は ToastProvider の中で使ってください')
  return ctx
}
