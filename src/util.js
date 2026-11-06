import { useEffect, useState } from 'react'

export function shuffle(a) {
  const r = [...a]
  for (let i = r.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1)
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}
export const lines = (s) => (s || '').split('\n').map((x) => x.trim()).filter(Boolean)
export const bar = (v, max) => (max ? Math.round((v / max) * 20) * 5 : 0)
export const fmtDate = (d) => new Date(d).toLocaleDateString('el-GR')
export const fmtDateTime = (d) => new Date(d).toLocaleString('el-GR', { dateStyle: 'short', timeStyle: 'short' })
export const truncWords = (s, n) => {
  const w = (s || '').split(/\s+/)
  return w.length > n ? w.slice(0, n).join(' ') + '…' : s
}
export const KIND = { party: 'Κόμμα', group: 'Ομάδα υπό σύσταση' }
export const TIER = { full: 'Πλήρες προφίλ', in_progress: 'Προφίλ σε εξέλιξη' }

export function useTitle(t) {
  useEffect(() => { document.title = t ? `${t} · Freedom for Democracy` : 'Freedom for Democracy' }, [t])
}

// Φορτώνει δεδομένα και επιστρέφει {data, error, loading}.
export function useData(fn, deps) {
  const [s, set] = useState({ data: null, error: null, loading: true })
  useEffect(() => {
    let live = true
    set({ data: null, error: null, loading: true })
    fn().then(
      (data) => live && set({ data, error: null, loading: false }),
      (e) => live && set({ data: null, error: e.message || String(e), loading: false })
    )
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return s
}
