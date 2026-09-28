import { useEffect, useMemo, useRef, useState } from 'react'

// A typeable dropdown: shows the FULL option list when opened, filters as you
// type, and still allows a free-typed custom value. Fixes the native <datalist>
// problem where a pre-filled value hides all the other options.
export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  uppercase = true,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder?: string
  uppercase?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState<string | null>(null) // null = not editing; show value
  const ref = useRef<HTMLDivElement>(null)
  const queryRef = useRef<string | null>(null)
  queryRef.current = query

  function commit(v: string) {
    onChange(uppercase ? v.toUpperCase() : v)
    setQuery(null)
    setOpen(false)
  }

  // Closing: keep any text the user typed (so custom values aren't lost).
  function close() {
    const q = queryRef.current
    if (q !== null && q.trim() !== '') onChange(uppercase ? q.toUpperCase() : q)
    setQuery(null)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const text = query ?? value
  const filtered = useMemo(() => {
    const q = (query ?? '').trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.toLowerCase().includes(q))
  }, [options, query])

  return (
    <div className={'combo' + (open ? ' open' : '')} ref={ref}>
      <div className="combo-input-wrap">
        <input
          className="input"
          value={text}
          placeholder={placeholder}
          onFocus={() => { setOpen(true); setQuery('') }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit((query ?? value)) }
            if (e.key === 'Escape') { setOpen(false); setQuery(null) }
          }}
        />
        <button type="button" className="combo-caret" tabIndex={-1} onClick={() => { if (open) { close() } else { setOpen(true); setQuery('') } }} aria-label="Toggle list">▾</button>
      </div>
      {open && (
        <div className="combo-menu" role="listbox">
          {filtered.length === 0 && <div className="combo-empty">No match — press Enter to use “{(query ?? '').toUpperCase()}”</div>}
          {filtered.map((o) => (
            <button
              type="button"
              key={o}
              className={'combo-item' + (o === value ? ' active' : '')}
              onClick={() => commit(o)}
              role="option"
              aria-selected={o === value}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
