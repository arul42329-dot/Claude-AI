// Core domain types for the Forex Trade Journal

export type Direction = 'long' | 'short'
export type Outcome = 'win' | 'loss' | 'breakeven' | 'open'
export type Session = 'sydney' | 'tokyo' | 'london' | 'newyork' | 'other'

export interface ChecklistItem {
  id: string
  text: string
}

export interface Checklist {
  id: string
  name: string
  description?: string
  items: ChecklistItem[]
  createdAt: number
  updatedAt: number
}

// A checked/unchecked response for a checklist item, stored on a trade.
export interface ChecklistResponse {
  checklistId: string
  checklistName: string
  items: {
    itemId: string
    text: string
    checked: boolean
  }[]
}

export interface Trade {
  id: string
  // When the trade was opened (ISO date string yyyy-mm-dd) + optional time
  date: string
  time?: string
  pair: string
  direction: Direction
  session: Session
  strategy?: string

  entryPrice?: number
  exitPrice?: number
  stopLoss?: number
  takeProfit?: number

  lotSize?: number
  riskPercent?: number
  riskReward?: number

  // Result
  outcome: Outcome
  pips?: number
  pnl?: number // profit/loss in account currency

  // Emotional / behavioural
  emotion?: string
  rating?: number // 1-5 self rating of execution

  notes?: string
  tags?: string[]
  screenshot?: string // data URL (optional)

  checklists: ChecklistResponse[]

  createdAt: number
  updatedAt: number
}

export interface Settings {
  id: string // always 'app'
  accountCurrency: string
  startingBalance: number
  theme: 'dark' | 'light'
}
