/**
 * Ultra-light line icons (Phosphor / Remix-line inspired).
 * Single stroke weight, rounded caps, currentColor — no emoji.
 */
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Base({ size = 22, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconDashboard = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 13a9 9 0 0 1 18 0" />
    <path d="M12 13l4-3" />
    <circle cx="12" cy="13" r="1.4" />
    <path d="M3 19h18" />
  </Base>
)

export const IconPreTrade = (p: IconProps) => (
  <Base {...p}>
    <rect x="5" y="4" width="14" height="17" rx="2.5" />
    <path d="M9 3.5h6a1 1 0 0 1 1 1V6a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
    <path d="M8.6 13.2l2 2 4-4.4" />
  </Base>
)

export const IconTrades = (p: IconProps) => (
  <Base {...p}>
    <path d="M7 3v3M7 15v6" />
    <rect x="5" y="6" width="4" height="9" rx="1.2" />
    <path d="M17 3v4M17 17v4" />
    <rect x="15" y="7" width="4" height="10" rx="1.2" />
  </Base>
)

export const IconAnalytics = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 21h18" />
    <path d="M4 15l5-5 3.5 3.5L20 6" />
    <path d="M20 10V6h-4" />
  </Base>
)

export const IconChecklists = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <path d="M3.5 5.6l1.1 1.1 2-2.3" />
    <path d="M3.5 11.6l1.1 1.1 2-2.3" />
    <path d="M3.5 17.6l1.1 1.1 2-2.3" />
  </Base>
)

export const IconSettings = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 0 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 0 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 0 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 0 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z" />
  </Base>
)

export const IconPlus = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
)

export const IconSearch = (p: IconProps) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.2-3.2" />
  </Base>
)

export const IconArrow = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Base>
)
