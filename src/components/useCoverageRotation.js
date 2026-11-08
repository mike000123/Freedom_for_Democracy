import { useEffect, useRef, useState } from 'react'

export const VISIBLE_PARTIES = 6

// Move the table viewport, never the page. The first six repeated rows make
// the return to the beginning seamless; only original rows are exposed to AT.
export function useCoverageRotation(count) {
  const ref = useRef(null)
  const [paused, setPaused] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [visible, setVisible] = useState(false)
  const [hidden, setHidden] = useState(document.hidden)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const head = el.querySelector('thead')
    const row = el.querySelector('tbody tr')
    const measure = () => {
      el.style.setProperty('--coverage-header-height', `${head.getBoundingClientRect().height}px`)
      el.style.setProperty('--coverage-measured-row-height', `${row.getBoundingClientRect().height}px`)
      el.style.setProperty('--coverage-scrollbar-height', `${Math.max(0, el.offsetHeight - el.clientHeight - 2)}px`)
    }
    measure()
    const resize = new ResizeObserver(measure)
    resize.observe(head); resize.observe(row); resize.observe(el)
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting && entry.intersectionRatio >= 0.1), { threshold: 0.1 })
    observer.observe(el)
    return () => { resize.disconnect(); observer.disconnect() }
  }, [count])

  useEffect(() => {
    const visibility = () => setHidden(document.hidden)
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const change = () => { if (motion.matches) setPaused(true) }
    document.addEventListener('visibilitychange', visibility)
    motion.addEventListener('change', change)
    return () => {
      document.removeEventListener('visibilitychange', visibility)
      motion.removeEventListener('change', change)
    }
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el || count <= VISIBLE_PARTIES || paused || hovered || focused || !visible || hidden) return
    let wrap
    const timer = window.setInterval(() => {
      const height = el.querySelector('tbody tr').getBoundingClientRect().height
      if (!height) return
      if (el.scrollTop >= count * height - 1) el.scrollTo({ top: 0, left: el.scrollLeft, behavior: 'instant' })
      const next = Math.min(count, Math.floor((el.scrollTop + 1) / height) + 1)
      el.scrollTo({ top: next * height, left: el.scrollLeft, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
      if (next === count) {
        wrap = window.setTimeout(() => el.scrollTo({ top: 0, left: el.scrollLeft, behavior: 'instant' }), 800)
      }
    }, 5000)
    return () => {
      window.clearInterval(timer); window.clearTimeout(wrap)
      el.scrollTo({ top: el.scrollTop, left: el.scrollLeft, behavior: 'instant' })
    }
  }, [count, paused, hovered, focused, visible, hidden])

  return {
    ref, paused, toggle: () => setPaused((value) => !value),
    interactions: {
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
      onFocusCapture: () => setFocused(true),
      onBlurCapture: (event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false) },
      onTouchStart: () => setPaused(true),
      onWheel: () => setPaused(true),
      onKeyDown: (event) => { if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) setPaused(true) },
    },
  }
}
