// A number field with − / + buttons AND free typing. Used for lots, strike, etc.
export function NumberStepper({
  value,
  onChange,
  step = 1,
  min,
  placeholder,
}: {
  value: number | undefined
  onChange: (v: number | undefined) => void
  step?: number
  min?: number
  placeholder?: string
}) {
  const clamp = (n: number) => (min != null ? Math.max(min, n) : n)
  const bump = (dir: number) => {
    const base = value ?? 0
    const next = clamp(Math.round((base + dir * step) * 1e6) / 1e6)
    onChange(next)
  }
  return (
    <div className="stepper">
      <button type="button" className="stepper-btn" onClick={() => bump(-1)} aria-label="Decrease">−</button>
      <input
        className="input stepper-input"
        type="number"
        step={step}
        inputMode="decimal"
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      />
      <button type="button" className="stepper-btn" onClick={() => bump(1)} aria-label="Increase">+</button>
    </div>
  )
}
