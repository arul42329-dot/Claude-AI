// Core domain types for the Forex Trade Journal

export type Direction = 'long' | 'short'
export type Outcome = 'win' | 'loss' | 'breakeven' | 'open'
export type Session = 'sydney' | 'tokyo' | 'london' | 'newyork' | 'other'

// A trading account that trades are journalled under — e.g. a prop-firm
// evaluation phase, a funded account, or a personal live account.
export type AccountType = 'evaluation' | 'funded' | 'live' | 'demo' | 'other'

export interface Account {
  id: string
  name: string
  type: AccountType
  market?: 'forex' | 'india' // which app mode this account belongs to (absent = forex)
  startingBalance: number
  currency?: string // optional per-account override; defaults to global currency
  color?: string // accent colour used for chips/dots
  profitTarget?: number // optional absolute profit target (in currency)
  archived?: boolean
  createdAt: number
  updatedAt: number
}

export interface ChecklistItem {
  id: string
  text: string
}

export interface Checklist {
  id: string
  name: string
  description?: string
  items: ChecklistItem[]
  isDefault?: boolean // seeded/default checklist — preserved when clearing data
  createdAt: number
  updatedAt: number
}

// A free-form daily reflection / journal note (separate from trades).
export interface JournalEntry {
  id: string
  date: string // yyyy-mm-dd
  mood?: number // 1 (bad) – 5 (great)
  text: string
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

// A pre-trade checklist entry: filled and SAVED before a trade is taken.
// It gets a serial number so a later trade log can be linked to it.
export interface ChecklistEntry {
  id: string
  serial: number // human-facing serial, e.g. 1, 2, 3…
  market?: 'forex' | 'india' // which app mode this entry belongs to (absent = forex)
  date: string
  time?: string
  pair: string
  direction?: Direction
  bias?: string
  // India-mode instrument segment + option details (mirrors Trade).
  segment?: 'equity' | 'futures' | 'options' | 'commodity'
  optionType?: 'CE' | 'PE'
  strike?: number
  expiry?: string
  checklistId: string
  checklistName: string
  items: {
    itemId: string
    text: string
    checked: boolean
  }[]
  notes?: string
  linkedTradeId?: string // set once a trade log is linked to this entry
  createdAt: number
  updatedAt: number
}

export interface Trade {
  id: string
  serial?: number // human-facing serial for the trade log
  market?: 'forex' | 'india' // which app mode this trade belongs to (absent = forex)
  accountId?: string // which trading account this trade belongs to
  // Link to a pre-trade checklist entry by its serial number
  checklistSerial?: number
  // When the trade was opened (ISO date string yyyy-mm-dd) + optional time
  date: string
  time?: string
  pair: string
  direction: Direction
  session: Session
  strategy?: string

  // India-mode instrument segment + option/derivative details.
  segment?: 'equity' | 'futures' | 'options' | 'commodity'
  optionType?: 'CE' | 'PE'
  strike?: number
  expiry?: string // yyyy-mm-dd
  lots?: number

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
  pnl?: number // NET profit/loss in account currency (after brokerage & taxes)
  grossPnl?: number // P/L from prices only, before brokerage/taxes (India)
  brokerage?: number // broker charge snapshot at save time (India)
  taxes?: number // manually entered charges for this trade (India)

  // Emotional / behavioural
  emotion?: string
  rating?: number // 1-5 self rating of execution

  notes?: string
  tags?: string[]
  screenshot?: string // data URL (optional, legacy single image)
  screenshots?: string[] // data URLs (multiple chart screenshots)

  checklists: ChecklistResponse[]

  createdAt: number
  updatedAt: number
}

export interface Settings {
  id: string // always 'app'
  accountCurrency: string
  startingBalance: number
  activeAccountId?: string // forex active account: 'all' for the combined view, or an account id
  activeAccountIdIndia?: string // India-mode active account (kept separate from forex)
  theme: 'dark' | 'light'
  accent?: string // accent theme key (e.g. 'gold', 'emerald', 'azure'…)
  monthlyProfitGoal?: number // target net profit for the month (currency)
  maxLossLimit?: number // max acceptable loss for the month (positive currency amount)
}
