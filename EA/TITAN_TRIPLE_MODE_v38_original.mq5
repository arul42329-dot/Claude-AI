#property copyright "Mr AP"
#property version   "6.00"
#property strict
#property description "TITAN EDGE / RAGE SURGE / PHOENIX FLIP (Triple Mode) HFT"
#include <Trade/Trade.mqh>
CTrade            trade;
CPositionInfo     posinfo;
COrderInfo        ordinfo;
CHistoryOrderInfo hsinfo;
CDealInfo         dealinfo;

enum enumLotType { Fixed_Lots = 0, Pct_of_Balance = 1, Pct_of_Equity = 2, Pct_of_Free_Margin = 3 };

enum enumEAMode { SL_Mode = 0, Bucket_Mode = 1, Step_Scale_Mode = 2 };

enum enumMomentumTradeMode { Trade_HighOnly = 0, Trade_ModerateHigh = 1, Trade_AllRegardless = 2 };
enum enumDashboardMode { Manual_Button = 0, Always_On = 1 };
enum enumNewsImportance { News_HighOnly = 0, News_MediumHigh = 1 };
enum TSLType { Default_Trail=0, Scalp_Trail=1, Previous_Candle=2, Fast_MA=3, Tenkansen=4 };
enum enumStepDirection { Step_Buy_First = 0, Step_Sell_First = 1 };
enum enumBasketLossMode { BasketLoss_FixedUSD = 0, BasketLoss_PercentBalance = 1 };

//======================================================================
// GROUP 1/7: COMMON SETTINGS (split into subgroups below) - shared by all
// EA Mode selector itself (kept here instead of its own group header so
// the whole input panel stays down to exactly 4 groups total).
//======================================================================
input group "=== COMMON: GENERAL & MODE ==="

input enumEAMode EAMode = SL_Mode;   // EA Mode: 0=SL Mode / 1=Bucket Mode / 2=Step Scale Mode

input int InpMagic = 12345;    // Magic Number
input int Slippage = 1;        // Slippage Points

input group "=== COMMON: TRADING SESSIONS ==="

input bool EnableTradingSessions = false;   // Enable Trading Sessions
input int Secs = 60;           // Modify Seconds
input string TradingSessions = "13:30-14:15,14:30-15:15,17:15-18:00"; // Sessions (HH:MM-HH:MM, comma separated)

input double BrokerGMTOffset = 4.0;  // Broker GMT Offset
input int ISTFineTuneMinutes = 0;    // IST Fine Tune Min
input bool UseISTSessionTimes = true;  // Session Times Are In IST
input bool EnablePostSessionTimeout = true;   // Force Close After Session
input int  PostSessionGraceMinutes  = 30;     // Grace Period After Session (Min)

input group "=== COMMON: LOT SIZING ==="

input enumLotType LotType = 0;   // Lot Sizing Method
input double FixedLot = 0.01;    // Fixed Lot
input double RiskPercent = 0.5;  // Risk Percent
input bool UseBalanceLotScaling = false;   // Use Balance Lot Scaling
input double BaseLot = 0.01;               // Base Lot
input double BalanceStep = 100.0;          // Balance Step

input group "=== COMMON: SPREAD & TRADE LIMITS ==="

input int MaxSpread = 5555;         // Max Spread
input int MaxOpenTrades = 5;        // Max Concurrent Open Trades (both sides combined, all modes)

input group "=== COMMON: MOMENTUM FILTER ==="

input int    VolumeLookbackMinutes    = 10;   // Volume Avg Lookback (Minutes)
input double VolumeExpansionRatio     = 1.3;  // Volume Expansion Ratio
input int    TickCountPerMinThreshold = 30;   // Ticks/Min For Full Score
input int    RunMinutes            = 10;    // Active Minutes
input int    MomentumHighScore     = 70;    // High Score
input int    MomentumLowScore      = 40;    // Low Score
input enumMomentumTradeMode MomentumTradeMode = Trade_ModerateHigh; // Momentum Trade Mode

input group "=== COMMON: EFFICIENCY GATE ==="

input int    EfficiencyLookbackBars = 10;    // Efficiency Lookback (Bars)
input double SpreadPenaltyRatio     = 1.6;   // Spread Penalty Trigger (x EMA)
input int    GateHysteresisSeconds  = 3;     // Gate Hysteresis (Seconds)

input group "=== COMMON: DASHBOARD & DAILY LOCKS ==="

input enumDashboardMode DashboardMode = Manual_Button; // Dashboard Mode

input bool EnableDailyTargetLock = false;      // Enable Daily Target Lock
input double MaxDailyProfitPercent = 3.0;      // Daily Profit Target %
input bool EnableDailyLossLock = false;        // Enable Daily Loss Lock
input double MaxDailyLossPercent = 3.0;        // Max Daily Loss %

input group "=== COMMON: CHART DISPLAY ==="

input bool ShowTradeLevels = false;   // Show Trade Levels
input bool ShowTradeHistory = true;   // Show Trade History

input group "=== COMMON: NEWS TIMER ==="

input bool EnableNewsTimer = true;              // News Timer
input enumNewsImportance NewsImportanceFilter = News_MediumHigh; // News Filter
input int NewsRefreshSeconds = 60;              // News Refresh
input int NewsLookaheadDays  = 7;               // News Lookahead

input group "=== COMMON: BASKET LOSS GUARD (Bucket & Step Modes) ==="

input bool   EnableMaxBasketLoss    = true;   // Enable Basket Loss Guard (Bucket & Step Modes)
input enumBasketLossMode BasketLossMode = BasketLoss_PercentBalance; // Basket Loss Guard Mode
input double MaxBasketLoss          = 10.0;   // Max Basket Floating Loss ($) - used when Mode = Fixed USD
input double MaxBasketLossPercent   = 2.0;    // Max Basket Floating Loss (% of Balance) - used when Mode = Percent Balance
input bool   CloseWorstTradeOnly    = false;  // On Loss: true=close worst trade only, false=close whole basket

//======================================================================
// v36: SCALING SAFETY CAPS (Bucket & Step Modes)
// A $/% basket-loss guard is reactive - it only closes AFTER the loss has
// already built up, and in a hedged basket the total floating P/L can
// look fine while one leg quietly runs deep against you. These two caps
// attack the actual mechanism that turns a single wrong entry into a
// 50-100% account drawdown: the lot multiplier compounding size on every
// add, with no limit on how many times in a row it can add into the same
// (losing) direction.
//   - EnableLotFreezeOnDrawdown: once the basket's floating loss reaches
//     LotFreezeDrawdownPercent of balance, new adds stop compounding the
//     lot multiplier and fall back to the base calculated lot size - the
//     position can still grow to try to recover, but stops accelerating.
//   - EnableMaxSameDirectionAdds: hard caps how many adds in a row can
//     fire in the SAME direction. Once the cap is hit, that direction is
//     blocked until the trend flips and confirms the opposite side -
//     stops the grid from repeatedly doubling down into a wrong trend.
//======================================================================
input group "=== COMMON: SCALING SAFETY CAPS (Bucket & Step Modes) ==="

input bool   EnableLotFreezeOnDrawdown  = true;    // Freeze Lot Multiplier Once Basket Drawdown Reaches X%
input double LotFreezeDrawdownPercent   = 1.0;     // Freeze Trigger - Basket Floating Loss (% of Balance)
input bool   EnableMaxSameDirectionAdds = true;    // Cap Consecutive Same-Direction Adds
input int    MaxSameDirectionAdds       = 3;       // Max Consecutive Adds In Same Direction Before Requiring A Flip

//======================================================================
// v32: GRID PER-TRADE STOP LOSS (Bucket & Step Modes)
// Bucket Mode and Step Scale Mode previously opened every trade with
// SL=0/TP=0 - the ONLY protection against a runaway move was the Basket
// Loss Guard above, which is a reactive, tick-based check with no
// broker-side enforcement. If that check gets skipped for any reason (a
// fast one-directional move, the guard disabled, or an undersized
// MaxBasketLoss for the actual lot size), nothing else stops a single
// leg from running all the way to a full account wipeout.
//
// When EnableGridStopLoss is on, every new trade opened in Bucket or
// Step mode gets a real, broker-side stop loss GridStopLossPoints away
// from its own entry price - a hard floor under each individual leg,
// independent of and in addition to the Basket Loss Guard. Off by
// default so existing behaviour (and existing backtests/settings) is
// unchanged unless you opt in.
//======================================================================
input group "=== GRID PER-TRADE STOP LOSS (Bucket & Step Modes) ==="

input bool   EnableGridStopLoss   = false;   // Enable Per-Trade Stop Loss On Every Grid Trade
input double GridStopLossPoints   = 300;     // Per-Trade Stop Loss Distance (Points From Own Entry)
input bool   EnableGridTrailingSL = false;   // Enable Trailing Stop Loss On Grid Trades (uses the TITAN EDGE trail settings below)

input group "=== COMMON: BASKET PROFIT LOCK (Bucket & Step Modes) ==="

input bool   EnableBasketProfitLock   = true;   // Enable Basket Profit Lock (Giveback Trail)
input double BasketProfitLockTrigger  = 5.0;    // Arm Lock Once Floating Profit Reaches ($)
input double BasketProfitLockGiveback = 2.0;    // Close If Profit Pulls Back This Much From Peak ($)

input group "=== COMMON: BASKET MAX DURATION (Bucket & Step Modes) ==="

input bool             EnableBasketMaxBars   = true;          // Enable Basket Max Duration Timeout
input int              MaxBasketBars         = 180;           // Force-Close Basket After This Many Bars
input ENUM_TIMEFRAMES  MaxBasketBarsTimeframe = PERIOD_CURRENT; // Timeframe Used To Count Bars

//======================================================================
// GROUP 2/7: TITAN EDGE - SL MODE ONLY SETTINGS
//======================================================================
input group "=== TITAN EDGE SETTINGS (SL Mode Only) ==="

input double Delta = 0.5;           // Order Distance
input double MaxDistance = 7;       // Max Distance
input double Stbp = 10;             // Stop Loss Size
input double MaxTrailing = 4;       // Trail Start

input bool BlockOppositeSide = true;   // Block Opposite Side
input int  MinLockTrades     = 2;      // Lock Trigger Count

input TSLType TrailType = 1;    // Trail Type

input int TslTriggerPoints = 15;    // Scalp Trail Trigger
input int TslPoints        = 10;    // Scalp Trail Distance

input int PrvCandleN = 1;    // Candle Trail: Trail Candles
input int ConfirmCandles = 2; // Candle Trail: Confirm Candles (must open beyond entry before trail starts)

input int FMAPeriod = 5;                  // MA Trail: MA Period
input ENUM_MA_METHOD MA_Mode = MODE_EMA;  // MA Trail: MA Method
input ENUM_APPLIED_PRICE MA_AppPrice = PRICE_MEDIAN;  // MA Trail: MA Price

//======================================================================
// GROUP 3/7: RAGE SURGE - BUCKET MODE ONLY SETTINGS
//======================================================================
input group "=== RAGE SURGE SETTINGS (Bucket Mode Only) ==="

input double PerEntryProfitTargetPercent = 0.1;    // Per-Entry Profit Target (% of Balance)
input double NominalRiskPoints = 50;        // Risk Calc Distance (Points, no real stop)
input double BucketScaleLotMultiplier = 1.5;   // NEW: Lot Multiplier From 3rd Trade Onward (1.0 = off, compounds each add)

//======================================================================
// GROUP 4/7: STEP SCALE - THIRD MODE ONLY SETTINGS
// Opens ONE single trade first. From then on, scaling is governed by the
// TREND BASED GRID SCALING group below: once TrendGridConfirmCandles
// candles have closed since the last trade, a new trade is added in
// WHICHEVER direction the trend gate confirms (not forced to the
// opposite side any more), with its lot size scaled up by
// StepScaleLotMultiplier. This repeats until MaxOpenTrades is reached or
// the combined basket profit reaches StepPerEntryProfitTargetPercent x
// number of open entries, which closes everything.
//======================================================================
input group "=== STEP SCALE SETTINGS (Step Scale Mode Only) ==="

input enumStepDirection StepStartDirection = Step_Buy_First;  // First Trade Direction (used when trend filter is OFF)
input bool   UseTrendFilterFirstEntry = false;      // First Entry: Use Trend Filter Instead Of Fixed Direction
input int    TrendMAPeriod            = 50;         // Trend Filter: MA Period
input ENUM_MA_METHOD TrendMAMode      = MODE_EMA;   // Trend Filter: MA Method
input ENUM_TIMEFRAMES TrendTF         = PERIOD_CURRENT; // Trend Filter: Timeframe
input double StepScaleLotMultiplier  = 2.0;   // Lot Multiplier Per Scale-In Step
input double StepPerEntryProfitTargetPercent = 0.1;   // Per-Entry Profit Target (% of Balance) - basket closes when combined profit reaches this x number of open entries

//======================================================================
// GROUP 5/7: TREND BASED GRID SCALING (Bucket & Step Modes)
// v31 REDESIGN: replaces the old candle-confirm / ATR-distance / RSI-only
// trigger modes, the optional Trend+RSI filter gate, and the Ladder
// Distance Cap - all removed. There is now exactly ONE scaling method,
// used identically by both modes:
//
//   Once TrendGridConfirmCandles genuinely NEW candles have closed since
//   the reference trade (the SECOND trade of the straddle in Bucket
//   Mode, or the single FIRST trade in Step Scale Mode - and every add
//   after that becomes the new reference for the next one), the EA
//   checks a higher-timeframe MA:
//     - price above the MA AND the MA sloped up by at least
//       ScaleTrendMinSlopePoints over the last ScaleTrendSlopeBars bars
//       -> add a BUY
//     - price below the MA AND sloped down by the same amount -> add a
//       SELL
//     - otherwise (flat/undecided) -> no add yet, keep waiting
//
// In Step Scale Mode this means the next add is no longer forced onto
// the opposite side - it follows the trend gate, same side or opposite,
// whichever the trend confirms.
//
// v35: COMBINED TREND DIRECTION. Four independent methods (primary MA
// slope, secondary MA, ADX+DI, swing structure) each cast a BUY/SELL vote;
// whichever side has more votes wins, with a tie-break so the function
// always resolves to one side or the other - it never withholds a trade
// for being "undecided". TrendGridConfirmCandles above is the only thing
// still allowed to delay an add, and that's a timing throttle, not a
// trend judgment.
//======================================================================
input group "=== TREND BASED GRID SCALING (Bucket & Step Modes) ==="

input int    TrendGridConfirmCandles    = 3;          // Candles To Wait Since Last Trade Before Trend Check
input int    ScaleTrendMAPeriod         = 50;         // Trend Gate: MA Period (vote 1)
input ENUM_MA_METHOD ScaleTrendMAMode   = MODE_EMA;   // Trend Gate: MA Method
input ENUM_TIMEFRAMES ScaleTrendTF      = PERIOD_CURRENT; // Trend Gate: Timeframe
input int    ScaleTrendSlopeBars        = 5;          // Trend Gate: Bars Back For Slope Check
input double ScaleTrendMinSlopePoints   = 20;          // Trend Gate: Min MA Movement (Points) To Count As Trending
input int    ScaleTrend2MAPeriod        = 20;         // Trend Gate: Secondary MA Period (vote 2)
input ENUM_MA_METHOD ScaleTrend2MAMode  = MODE_SMA;    // Trend Gate: Secondary MA Method
input int    ScaleADXPeriod             = 14;         // Trend Gate: ADX Period (vote 3)
input double ScaleADXMinLevel           = 20;          // Trend Gate: Min ADX To Count As Trending (else vote 3 abstains)
input int    ScaleSwingLookback         = 20;         // Trend Gate: Swing Structure Lookback (Bars) (vote 4)
input int    ScaleSwingDepth            = 3;            // Trend Gate: Bars Each Side To Confirm A Swing Point

//======================================================================
// v37: CLOSE ON TREND REVERSAL (Bucket & Step Modes)
// Checked once per new bar. Compares the current combined trend direction
// against the direction it last saw. If the direction has flipped, every
// open leg that matches the OLD (now-obsolete) direction is closed - the
// legs matching the NEW direction are left alone, since they already
// align with where the trend gate will scale next. This keeps the basket
// from carrying stale positions from a trend that no longer exists.
//======================================================================
input group "=== COMMON: CLOSE ON TREND REVERSAL (Bucket & Step Modes) ==="

input bool EnableCloseOnTrendReversal = false;   // Close Legs Aligned With The Old Direction When Trend Flips

int handleTrailMA, handleIchimoku;
int handleTrendMA;
int handleScaleTrendMA = INVALID_HANDLE;   // v31: trend-grid MA handle (Bucket & Step scaling)
int handleScaleTrend2MA = INVALID_HANDLE;  // v33: secondary MA vote (combined trend filter)
int handleScaleADX      = INVALID_HANDLE;  // v33: ADX+DI vote (combined trend filter)

double Deltax = Delta;

double MinOrderDistance = 0.5;
double MaxTrailingLimit = 7.5;
double OrderModificationFactor = 3;
int TickCounter = 0;
double PriceToPipRatio = 0;

double BaseTrailingStop = 0;
double TrailingStopBuffer = 0;
double TrailingStopIncrement = 0;
double TrailingStopThreshold = 0;
long AccountLeverageValue = 0;

double LotStepSize = 0;
double MaxLotSize = 0;
double MinLotSize = 0;
double MarginPerMinLot = 0;
double MinStopDistance = 0;

int BrokerStopLevel = 0;
double MinFreezeDistance = 0;
int BrokerFreezeLevel = 0;
double CurrentSpread = 0;
double AverageSpread = 0;

int EAModeFlag = 0;
int SpreadArraySize = 8;
int DefaultSpreadPeriod = 30;
double MaxAllowedSpread = 0;
double CalculatedLotSize = 0;

double CommissionPerPip = 0;
int SpreadMultiplier = 8;
double AdjustedOrderDistance = 0;
double MinOrderModification = 0;
double TrailingStopActive = 0;

double TrailingStopMax = 0;
double MaxOrderPlacementDistance = 0;
double OrderPlacementStep = 0;
double CalculatedStopLoss = 0;
bool AllowBuyOrders = false;

bool AllowSellOrders = false;
bool SpreadAcceptable = false;
int LastOrderTimeDiff = 0;
int LastOrderTime = 0;
int MinOrderInterval = 0;

double CurrentBuySL = 0;
string OrderCommentText = "MR AP";
int LastBuyOrderTime = 0;
bool TradeAllowed = false;
double CurrentSellSL = 0;

int LastSellOrderTime = 0;
int OrderCheckFrequency = 1;
int SpreadCalculationMethod = 1;
double SpreadHistoryArray[];

//--- MOMENTUM DASHBOARD / MANUAL CONTROL GLOBALS
bool     TradingActive   = false;   // true while the ON button is toggled on
datetime EnableStartTime = 0;       // time TradingActive was switched on
double   MomentumScore   = 0;       // 0-100 combined score
bool     IsTesterMode    = false;   // true when running inside Strategy Tester

//--- v6: per-minute volume/tick momentum engine globals
datetime g_CurrentMinuteBarTime   = 0;   // open time of the M1 bar we're currently counting ticks for
int      g_CurrentMinuteTickCount = 0;   // ticks counted so far in the currently-forming minute

//--- v12: momentum filter accuracy upgrades
double   g_SpreadEMA          = 0;      // rolling spread baseline used for the spread penalty
bool     g_GateCandidate      = true;   // gate hysteresis - the "pending" state before it's committed
datetime g_GateCandidateSince = 0;      // when the candidate state most recently changed

//--- v14: Bucket Mode globals - unused when EAMode == SL_Mode
double   g_LastEntryPrice   = 0;   // v21: reference price used to confirm profit before the NEXT trade, either side
datetime g_LastEntryBarTime = 0;   // v21: bar that reference trade opened on - forces genuinely NEW candles between adds
double   g_BasketTarget       = 0;   // (PerEntryProfitTargetPercent% of balance) x number of open entries
double   g_BasketProfit       = 0;   // combined floating P/L of every open position this tick
double   g_BucketPeakProfit      = 0;       // NEW: highest floating basket profit seen since the lock armed
bool     g_BucketProfitLockArmed = false;   // NEW: true once floating profit has crossed BasketProfitLockTrigger

//--- v26: Step Scale Mode globals - unused unless EAMode == Step_Scale_Mode.
//    g_StepLastEntryIsBuy tracks the side of the MOST RECENTLY opened trade,
//    so the next scale-in always fires on the opposite side. g_StepNextLotSize
//    carries the pre-scaled lot size forward from one step to the next.
double   g_StepLastEntryPrice   = 0;
datetime g_StepLastEntryBarTime = 0;
bool     g_StepLastEntryIsBuy   = true;
double   g_StepNextLotSize      = 0;
double   g_StepBasketTarget     = 0;
double   g_StepBasketProfit     = 0;
double   g_StepPeakProfit       = 0;       // NEW: highest floating basket profit seen since the lock armed
bool     g_StepProfitLockArmed  = false;   // NEW: true once floating profit has crossed BasketProfitLockTrigger
datetime g_LastStepDebugBar     = 0;

//--- v36: SAME-DIRECTION-ADD CAP tracking
int      g_BucketConsecSameDir  = 0;      // consecutive adds in the same direction (Bucket Mode)
bool     g_BucketLastAddWasBuy  = true;
int      g_StepConsecSameDir    = 0;      // consecutive adds in the same direction (Step Scale Mode) - direction itself tracked by g_StepLastEntryIsBuy

//--- v37: CLOSE ON TREND REVERSAL tracking
bool     g_LastKnownTrendIsBuy      = true;
bool     g_TrendReversalInit        = false;
datetime g_LastTrendReversalCheckBar = 0;

//--- NEW: LADDER DISTANCE CAP - tracks the price of the VERY FIRST entry of
//    the current basket/ladder (set once when the basket opens from flat,
//    left untouched by every add after that, only cleared when the basket
//    fully flattens). This is deliberately separate from g_LastEntryPrice /
//    g_StepLastEntryPrice above, which move with every new add and are used
//    for candle-count confirmation - the distance cap needs the ORIGINAL
//    reference point, not the most recent one, to measure total basket travel.
double   g_BucketFirstEntryPrice = 0;   // Bucket Mode: price of the straddle's first fill
datetime g_BucketFirstEntryBarTime = 0; // NEW: bar time of the straddle's first fill - basket max-duration timer
double   g_StepFirstEntryPrice   = 0;   // Step Scale Mode: price of the very first single trade
datetime g_StepFirstEntryBarTime = 0;   // NEW: bar time of the very first trade - basket max-duration timer

//--- v24: DEBUG LOGGING throttles for Bucket Mode entries - each message only
//    prints once per NEW bar per side, so the Experts/Journal log shows exactly
//    which condition is blocking an expected add instead of spamming every tick.
datetime g_LastBuyDebugBar  = 0;
datetime g_LastSellDebugBar = 0;

//--- v3: momentum trade-mode gate - recalculated every tick in UpdateMomentumScore()
bool     MomentumGateOpen = true;   // true => selected momentum mode currently permits trade execution

//--- v4: direction lock - live open-position counts + resulting block flags,
//    cached globally so the dashboard can display the current lock state
int      g_OpenBuyCount     = 0;
int      g_OpenSellCount    = 0;
bool     g_OppositeLockBuy  = false;   // true => BUY side is currently blocked
bool     g_OppositeLockSell = false;   // true => SELL side is currently blocked

//--- v5: post-session force-close timer - set the instant the session window closes,
//    cleared the instant a session becomes active again
datetime g_PostSessionTimerStart = 0;

//--- v7: parsed multi-session arrays, built from the TradingSessions input string
int      g_SessionStartMin[];
int      g_SessionEndMin[];
int      g_SessionCount = 0;

#define DASH_PREFIX "DUALHFT_"
//--- v14: theme is now runtime, not compile-time - these get set in OnInit
//    based on EAMode, so SL Mode and Bucket Mode each get their own palette
color    g_ThemeProfit;      // "in profit / good value" accent colour
color    g_ThemeGlowLow;     // pulse low colour
color    g_ThemeGlowHigh;    // pulse high colour
color    g_ThemeButtonOn;    // TRADING ON button colour
color    g_ThemeStrip;       // Always-On strip colour
color    g_ThemeHeaderBg;    // header bar background - now matches the active theme
color    g_ThemeCaption;     // v29: section caption text colour ("MOMENTUM"/"STATUS"/...) - now themed per mode
string   g_EATitle;          // panel title text - different name per mode

//--- panel layout constants (shared by CreateDashboard and UpdateDashboard)
#define PANEL_X 12
#define PANEL_Y 20
#define PANEL_W 212
#define PANEL_H_SL     452
#define PANEL_H_BUCKET 436
#define PANEL_H_STEP   436
int      g_GlowTimerTicks = 0;   // counts 200ms timer ticks, used to drive the pulse + throttle full redraws

//--- DAILY PROFIT LOCK GLOBALS
double   DayStartBalance   = 0;
int      CurrentDay        = -1;
double   DailyProfitPercent = 0;
bool     DailyTargetHit    = false;
bool     DailyLossHit      = false;   // true once MaxDailyLossPercent drawdown reached for the day



//--- NEXT NEWS TIMER GLOBALS (informational only, never gates trading)
datetime NextNewsTime          = 0;
string   NextNewsTitle         = "";
string   NextNewsCurrency      = "";
int      NextNewsImportanceVal = -1;   // 0=LOW,1=MODERATE,2=HIGH (from CALENDAR_IMPORTANCE)
datetime LastNewsScanTime      = 0;

int OnInit()
{
   TesterHideIndicators(true); // must be called before any indicator handles are created

   trade.SetExpertMagicNumber(InpMagic);

   if (TrailType == 3)
      handleTrailMA = iMA(_Symbol, PERIOD_CURRENT, FMAPeriod, 0, MA_Mode, MA_AppPrice);

   if (TrailType == 4)
      handleIchimoku = iIchimoku(_Symbol, PERIOD_CURRENT, 9, 26, 52);

   //--- v29: trend-filter MA handle for Step Scale Mode's first entry only
   if (EAMode == Step_Scale_Mode && UseTrendFilterFirstEntry)
      handleTrendMA = iMA(_Symbol, TrendTF, TrendMAPeriod, 0, TrendMAMode, PRICE_CLOSE);

   //--- v31: trend-grid MA handle - the sole scaling method for both Bucket
   //    and Step modes now, so it's always created for either mode.
   //--- v33: two extra handles for the combined trend filter's secondary
   //    MA and ADX+DI votes, created alongside the primary one.
   if (EAMode == Bucket_Mode || EAMode == Step_Scale_Mode)
   {
      handleScaleTrendMA  = iMA(_Symbol, ScaleTrendTF, ScaleTrendMAPeriod, 0, ScaleTrendMAMode, PRICE_CLOSE);
      handleScaleTrend2MA = iMA(_Symbol, ScaleTrendTF, ScaleTrend2MAPeriod, 0, ScaleTrend2MAMode, PRICE_CLOSE);
      handleScaleADX      = iADX(_Symbol, ScaleTrendTF, ScaleADXPeriod);
   }

   ChartSetInteger(0, CHART_SHOW_GRID, false);

   ChartSetInteger(0, CHART_SHOW_TRADE_LEVELS, ShowTradeLevels);
   ChartSetInteger(0,
                CHART_SHOW_TRADE_HISTORY,
                ShowTradeHistory);

   //--- v27: bullish = white, bearish = red - black bearish candles were
   //    invisible against the dark chart background
   ChartSetInteger(0, CHART_COLOR_CANDLE_BULL, clrWhite);
   ChartSetInteger(0, CHART_COLOR_CANDLE_BEAR, C'235,60,60');
   ChartSetInteger(0, CHART_COLOR_CHART_UP,    clrWhite);
   ChartSetInteger(0, CHART_COLOR_CHART_DOWN,  C'235,60,60');

   if ((MinOrderDistance > Delta)) {
      Deltax = (MinOrderDistance + 0.1);
   }

   if ((MaxTrailing > MaxTrailingLimit)) {
      MaxTrailingLimit = (MaxTrailing + 0.1);
   }

   if ((OrderModificationFactor < 1)) {
      OrderModificationFactor = 1;
   }

   TickCounter = 0;
   PriceToPipRatio = 0;
   BaseTrailingStop = TrailingStopBuffer;
   TrailingStopIncrement = TrailingStopThreshold;
   AccountLeverageValue = AccountInfoInteger(ACCOUNT_LEVERAGE);

   LotStepSize = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   MaxLotSize = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   MinLotSize = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   MarginPerMinLot = SymbolInfoDouble(_Symbol, SYMBOL_MARGIN_INITIAL) * MinLotSize;

   MinStopDistance = 0;

   BrokerStopLevel = (int)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
   if (BrokerStopLevel > 0) MinStopDistance = ((BrokerStopLevel + 1) * _Point);

   MinFreezeDistance = 0;
   BrokerFreezeLevel = (int)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_FREEZE_LEVEL);
   if (BrokerFreezeLevel > 0) MinFreezeDistance = ((BrokerFreezeLevel + 1) * _Point);

   if ((BrokerStopLevel > 0) || BrokerFreezeLevel > 0) {
      Comment("WARNING! Broker is not suitable, the stoplevel is greater than zero.");
   }

   double Ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double Bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);

   CurrentSpread = NormalizeDouble(Ask - Bid, _Digits);
   AverageSpread = CurrentSpread;

   SpreadArraySize = (EAModeFlag == 0) ? DefaultSpreadPeriod : 3;

   ArrayResize(SpreadHistoryArray, SpreadArraySize, 0);

   MaxAllowedSpread = NormalizeDouble((MaxSpread * _Point), _Digits);

   //--- v6: per-minute momentum engine - no indicator handles needed, just reset the counters
   g_CurrentMinuteBarTime   = iTime(_Symbol, PERIOD_M1, 0);
   g_CurrentMinuteTickCount = 0;
   MomentumGateOpen = true;

   //--- v12: reset the momentum-filter-accuracy state on every EA start
   g_GateCandidate      = true;
   g_GateCandidateSince = TimeCurrent();
   g_SpreadEMA          = 0;

   //--- v7: parse the comma-separated sessions string into start/end minute arrays
   ParseSessions();

   MqlDateTime dtInit;
   TimeCurrent(dtInit);
   CurrentDay = dtInit.day;
   DayStartBalance = AccountInfoDouble(ACCOUNT_BALANCE);
   DailyTargetHit = false;
   DailyLossHit = false;

   g_PostSessionTimerStart = 0;

   //--- v14: pick the theme + on-chart name for whichever mode is selected -
   //    SL Mode keeps the original teal/cyan look, Bucket Mode is amber,
   //    Step Scale Mode (v26) is light green
   //--- v29: g_ThemeCaption added so the section captions (MOMENTUM/STATUS/
   //    NEWS/ACCOUNT/SESSION) are themed per mode instead of a single fixed
   //    teal colour that clashed with the amber/green panels.
   if(EAMode == SL_Mode)
   {
      g_ThemeProfit   = C'0,181,159';
      g_ThemeGlowLow  = C'0,80,72';
      g_ThemeGlowHigh = C'0,235,200';
      g_ThemeButtonOn = C'0,140,110';
      g_ThemeStrip    = C'0,90,75';
      g_ThemeHeaderBg = C'12,26,24';
      g_ThemeCaption  = C'110,240,215';
      g_EATitle       = "TITAN EDGE HFT";
   }
   else if(EAMode == Bucket_Mode)
   {
      g_ThemeProfit   = C'255,178,90';
      g_ThemeGlowLow  = C'110,60,10';
      g_ThemeGlowHigh = C'255,175,60';
      g_ThemeButtonOn = C'210,120,20';
      g_ThemeStrip    = C'150,80,15';
      g_ThemeHeaderBg = C'32,20,10';
      g_ThemeCaption  = C'255,215,160';
      g_EATitle       = "RAGE SURGE HFT";
   }
   else // Step_Scale_Mode - light green
   {
      g_ThemeProfit   = C'140,230,110';
      g_ThemeGlowLow  = C'35,85,30';
      g_ThemeGlowHigh = C'175,255,145';
      g_ThemeButtonOn = C'90,190,70';
      g_ThemeStrip    = C'70,150,55';
      g_ThemeHeaderBg = C'14,28,12';
      g_ThemeCaption  = C'205,255,190';
      g_EATitle       = "PHOENIX FLIP HFT";
   }

   //--- v14: reset Bucket Mode state on every EA start (harmless in SL Mode)
   g_LastEntryPrice   = 0;
   g_LastEntryBarTime = 0;
   g_BasketTarget       = 0;
   g_BasketProfit       = 0;
   g_BucketFirstEntryPrice = 0;   // NEW: ladder distance cap origin
   g_BucketFirstEntryBarTime = 0;   // NEW: basket max-duration timer origin
   g_BucketPeakProfit      = 0;   // NEW: profit lock peak
   g_BucketProfitLockArmed = false;   // NEW: profit lock armed flag
   g_BucketConsecSameDir   = 0;   // v36
   g_BucketLastAddWasBuy   = true;   // v36

   //--- v26: reset Step Scale Mode state on every EA start (harmless in other modes)
   g_StepLastEntryPrice   = 0;
   g_StepLastEntryBarTime = 0;
   g_StepLastEntryIsBuy   = (StepStartDirection == Step_Buy_First);
   g_StepNextLotSize      = 0;
   g_StepBasketTarget     = 0;
   g_StepBasketProfit     = 0;
   g_StepFirstEntryPrice  = 0;   // NEW: ladder distance cap origin
   g_StepFirstEntryBarTime = 0;   // NEW: basket max-duration timer origin
   g_StepPeakProfit       = 0;   // NEW: profit lock peak
   g_StepProfitLockArmed  = false;   // NEW: profit lock armed flag
   g_StepConsecSameDir    = 0;   // v36

   g_TrendReversalInit         = false;   // v37: re-baseline on next check
   g_LastTrendReversalCheckBar = 0;

   IsTesterMode = (bool)MQLInfoInteger(MQL_TESTER);
   CreateDashboard();
   if(IsTesterMode)
   {
      TradingActive = true;
   }

   if(DashboardMode == Always_On)
   {
      TradingActive   = true;
      EnableStartTime = TimeCurrent();
   }

   if(EnableNewsTimer && !IsTesterMode)
   {
      FindNextNews();
      LastNewsScanTime = TimeCurrent();
   }

   UpdateDashboard();

   //--- v9: sub-second timer so the glow/pulse animation is smooth; the heavier
   //    UpdateDashboard() text refresh is throttled inside OnTimer() to ~1/sec
   EventSetMillisecondTimer(200);

   return(INIT_SUCCEEDED);
}

void OnTimer()
{
   if(IsTesterMode) return;

   UpdatePanelGlow();

   g_GlowTimerTicks++;
   if(g_GlowTimerTicks % 5 != 0) return;   // full dashboard refresh ~once per second

   UpdateDashboard();
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   ObjectsDeleteAll(0, DASH_PREFIX);

   if(handleScaleTrendMA != INVALID_HANDLE) IndicatorRelease(handleScaleTrendMA);
   if(handleScaleTrend2MA != INVALID_HANDLE) IndicatorRelease(handleScaleTrend2MA);
   if(handleScaleADX      != INVALID_HANDLE) IndicatorRelease(handleScaleADX);
}

void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
{
   if(IsTesterMode) return;
   if(DashboardMode == Always_On) return;
   if(id == CHARTEVENT_OBJECT_CLICK && sparam == DASH_PREFIX+"BtnToggle")
   {
      if(!TradingActive)
      {
         TradingActive   = true;
         EnableStartTime = TimeCurrent();
      }
      else
      {
         TradingActive = false;
         FlattenAll();
      }
      ObjectSetInteger(0, DASH_PREFIX+"BtnToggle", OBJPROP_STATE, false);
      UpdateDashboard();
      ChartRedraw();
   }
}

//======================================================================
// HELPERS
//======================================================================

string MomentumModeText(enumMomentumTradeMode m)
{
   switch(m)
   {
      case Trade_HighOnly:     return "HIGH ONLY";
      case Trade_ModerateHigh: return "MODERATE+HIGH";
      default:                 return "ALL (IGNORE)";
   }
}

//======================================================================
// SESSION PARSING  (v7: single comma-separated "HH:MM-HH:MM,HH:MM-HH:MM,..." input)
//======================================================================
bool ParseHHMM(string s, int &outMinutes)
{
   StringTrimLeft(s);
   StringTrimRight(s);

   string hm[];
   if(StringSplit(s, ':', hm) != 2) return false;

   int h = (int)StringToInteger(hm[0]);
   int m = (int)StringToInteger(hm[1]);
   if(h < 0 || h > 23 || m < 0 || m > 59) return false;

   outMinutes = h*60 + m;
   return true;
}

void ParseSessions()
{
   ArrayResize(g_SessionStartMin, 0);
   ArrayResize(g_SessionEndMin, 0);
   g_SessionCount = 0;

   string sessions[];
   int n = StringSplit(TradingSessions, ',', sessions);

   for(int i = 0; i < n; i++)
   {
      string tok = sessions[i];
      StringTrimLeft(tok);
      StringTrimRight(tok);
      if(tok == "") continue;

      string parts[];
      if(StringSplit(tok, '-', parts) != 2)
      {
         Print("[Sessions] Skipping invalid entry: '", tok, "' (expected HH:MM-HH:MM)");
         continue;
      }

      int startMin, endMin;
      if(!ParseHHMM(parts[0], startMin) || !ParseHHMM(parts[1], endMin))
      {
         Print("[Sessions] Skipping invalid entry: '", tok, "' (expected HH:MM-HH:MM)");
         continue;
      }

      int idx = g_SessionCount;
      ArrayResize(g_SessionStartMin, idx+1);
      ArrayResize(g_SessionEndMin,   idx+1);
      g_SessionStartMin[idx] = startMin;
      g_SessionEndMin[idx]   = endMin;
      g_SessionCount++;
   }

   if(EnableTradingSessions && g_SessionCount == 0)
      Print("[Sessions] WARNING: EnableTradingSessions=true but no valid sessions were parsed from '", TradingSessions, "'");
   else if(g_SessionCount > 0)
      Print("[Sessions] Parsed ", g_SessionCount, " session(s) from '", TradingSessions, "'");
}

//======================================================================
// DASHBOARD UI
//======================================================================
void DashLabel(string name, int x, int y, string text, color clr, int fontSize=9, string font="Segoe UI")
{
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetString (0, name, OBJPROP_TEXT, text);
   ObjectSetString (0, name, OBJPROP_FONT, font);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, fontSize);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
   ObjectSetInteger(0, name, OBJPROP_BACK, false);
}

//--- v9: section header now draws a small glowing "chip" marker to the left
//    of the caption instead of a plain separator-only look
//--- v10: extra vertical breathing room added above the separator and below
//    the caption text so sub-headers (STATUS/NEWS/ACCOUNT/SESSION) don't
//    read as cramped against the row directly above/below them
//--- v29: caption text colour now uses g_ThemeCaption (set per-mode in OnInit)
//    instead of a single hardcoded teal - previously ALL three modes showed
//    the same cyan/teal caption text even in the amber (Bucket) and green
//    (Step Scale) panels, which looked mismatched against their own theme.
void DashSectionHeader(int panelXParam, int panelWParam, int &y, string key, string text, bool withSeparator)
{
   if(withSeparator)
   {
      y += 3;   // small gap above the separator line

      string sep = DASH_PREFIX+"Sep_"+key;
      if(ObjectFind(0, sep) < 0) ObjectCreate(0, sep, OBJ_RECTANGLE_LABEL, 0, 0, 0);
      ObjectSetInteger(0, sep, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, sep, OBJPROP_XDISTANCE, panelXParam+10);
      ObjectSetInteger(0, sep, OBJPROP_YDISTANCE, y);
      ObjectSetInteger(0, sep, OBJPROP_XSIZE, panelWParam-20);
      ObjectSetInteger(0, sep, OBJPROP_YSIZE, 1);
      ObjectSetInteger(0, sep, OBJPROP_BGCOLOR, g_ThemeGlowLow);
      ObjectSetInteger(0, sep, OBJPROP_BORDER_TYPE, BORDER_FLAT);
      ObjectSetInteger(0, sep, OBJPROP_COLOR, g_ThemeGlowLow);
      ObjectSetInteger(0, sep, OBJPROP_BACK, false);
      ObjectSetInteger(0, sep, OBJPROP_SELECTABLE, false);
      y += 9;
   }

   string chip = DASH_PREFIX+"Chip_"+key;
   if(ObjectFind(0, chip) < 0) ObjectCreate(0, chip, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, chip, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, chip, OBJPROP_XDISTANCE, panelXParam+10);
   ObjectSetInteger(0, chip, OBJPROP_YDISTANCE, y+2);
   ObjectSetInteger(0, chip, OBJPROP_XSIZE, 4);
   ObjectSetInteger(0, chip, OBJPROP_YSIZE, 10);
   ObjectSetInteger(0, chip, OBJPROP_BGCOLOR, g_ThemeGlowHigh);
   ObjectSetInteger(0, chip, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, chip, OBJPROP_COLOR, g_ThemeGlowHigh);
   ObjectSetInteger(0, chip, OBJPROP_BACK, false);
   ObjectSetInteger(0, chip, OBJPROP_SELECTABLE, false);

   //--- v11: bumped from 7pt dim to 8pt bright so section captions
   //    (MOMENTUM/STATUS/NEWS/ACCOUNT/SESSION) are actually readable at a glance
   //--- v29: now themed (g_ThemeCaption) instead of a fixed teal
   DashLabel(DASH_PREFIX+"SecLbl_"+key, panelXParam+18, y, text, g_ThemeCaption, 8, "Segoe UI Bold");
   y += 18;
}

//--- v9: linear-interpolate between two colours (MQL5 colour = 0x00BBGGRR)
color LerpColor(color c1, color c2, double t)
{
   if(t < 0) t = 0;
   if(t > 1) t = 1;

   int r1 = (int)(c1 & 0xFF),       g1 = (int)((c1 >> 8) & 0xFF),  b1 = (int)((c1 >> 16) & 0xFF);
   int r2 = (int)(c2 & 0xFF),       g2 = (int)((c2 >> 8) & 0xFF),  b2 = (int)((c2 >> 16) & 0xFF);

   int r = (int)MathRound(r1 + (r2 - r1) * t);
   int g = (int)MathRound(g1 + (g2 - g1) * t);
   int b = (int)MathRound(b1 + (b2 - b1) * t);

   return (color)(r | (g << 8) | (b << 16));
}

//--- v9: drives the animated "glow" - pulses the header accent bar, panel
//    border, and every section chip/separator between the two glow colours
//    on a smooth 3-second breathing cycle. Called from the fast 200ms timer.
//--- v29: NOTE - this intentionally only re-glows the small chip + separator
//    accents, NOT the caption text (g_ThemeCaption) - the caption stays a
//    fixed, readable, per-theme colour instead of pulsing/washing out.
void UpdatePanelGlow()
{
   double t     = (double)(GetTickCount() % 3000) / 3000.0;
   double phase = 0.5 + 0.5 * MathSin(t * 2.0 * M_PI);
   color  glow  = LerpColor(g_ThemeGlowLow, g_ThemeGlowHigh, phase);

   ObjectSetInteger(0, DASH_PREFIX+"Accent", OBJPROP_BGCOLOR, glow);
   ObjectSetInteger(0, DASH_PREFIX+"Accent", OBJPROP_COLOR,   glow);
   ObjectSetInteger(0, DASH_PREFIX+"Panel",  OBJPROP_COLOR,   glow);
   ObjectSetInteger(0, DASH_PREFIX+"Title",  OBJPROP_COLOR,   glow);

   string keys[5] = {"MOMENTUM","STATUS","NEWS","ACCOUNT","SESSION"};
   for(int i = 0; i < 5; i++)
   {
      string chip = DASH_PREFIX+"Chip_"+keys[i];
      if(ObjectFind(0, chip) >= 0)
      {
         ObjectSetInteger(0, chip, OBJPROP_BGCOLOR, glow);
         ObjectSetInteger(0, chip, OBJPROP_COLOR,   glow);
      }
      string sep = DASH_PREFIX+"Sep_"+keys[i];
      if(ObjectFind(0, sep) >= 0)
      {
         ObjectSetInteger(0, sep, OBJPROP_BGCOLOR, glow);
         ObjectSetInteger(0, sep, OBJPROP_COLOR,   glow);
      }
   }

   ChartRedraw();
}

//======================================================================
// DASHBOARD LAYOUT
//   MOMENTUM -> Score / Status
//   STATUS   -> Mode + Trade Gate + Spread + Dir Lock + TP/SL Lock (all one block)
//   NEWS     -> Next event countdown + short event name (own block)
//   ACCOUNT  -> Balance / Daily P&L / Daily P&L %
//   SESSION  -> Time left / Server-IST clock (own block)
//======================================================================
void CreateDashboard()
{
   if(EAMode == SL_Mode)          CreateDashboardSLMode();
   else if(EAMode == Bucket_Mode) CreateDashboardBucketMode();
   else                            CreateDashboardStepMode();
}

//======================================================================
// v20: SL MODE PANEL - built entirely separately from Bucket Mode so
// changes to one layout can never leave a gap or shift rows in the other.
// Rows: MOMENTUM (Score, Status) / STATUS (Mode, Gate, Spread, Dir Lock,
// TP Lock, SL Lock) / NEWS / ACCOUNT / SESSION.
//======================================================================
void CreateDashboardSLMode()
{
   int panelX = PANEL_X, panelY = PANEL_Y, panelW = PANEL_W, panelH = PANEL_H_SL;

   string bg = DASH_PREFIX+"Panel";
   if(ObjectFind(0, bg) < 0) ObjectCreate(0, bg, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, bg, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, bg, OBJPROP_XDISTANCE, panelX);
   ObjectSetInteger(0, bg, OBJPROP_YDISTANCE, panelY);
   ObjectSetInteger(0, bg, OBJPROP_XSIZE, panelW);
   ObjectSetInteger(0, bg, OBJPROP_YSIZE, panelH);
   ObjectSetInteger(0, bg, OBJPROP_BGCOLOR, C'14,16,19');
   ObjectSetInteger(0, bg, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, bg, OBJPROP_COLOR, g_ThemeGlowLow);
   ObjectSetInteger(0, bg, OBJPROP_STYLE, STYLE_SOLID);
   ObjectSetInteger(0, bg, OBJPROP_WIDTH, 2);
   ObjectSetInteger(0, bg, OBJPROP_BACK, false);
   ObjectSetInteger(0, bg, OBJPROP_SELECTABLE, false);

   string hdr = DASH_PREFIX+"HeaderBg";
   if(ObjectFind(0, hdr) < 0) ObjectCreate(0, hdr, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, hdr, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, hdr, OBJPROP_XDISTANCE, panelX);
   ObjectSetInteger(0, hdr, OBJPROP_YDISTANCE, panelY);
   ObjectSetInteger(0, hdr, OBJPROP_XSIZE, panelW);
   ObjectSetInteger(0, hdr, OBJPROP_YSIZE, 28);
   ObjectSetInteger(0, hdr, OBJPROP_BGCOLOR, g_ThemeHeaderBg);
   ObjectSetInteger(0, hdr, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, hdr, OBJPROP_COLOR, g_ThemeHeaderBg);
   ObjectSetInteger(0, hdr, OBJPROP_BACK, false);
   ObjectSetInteger(0, hdr, OBJPROP_SELECTABLE, false);

   string accent = DASH_PREFIX+"Accent";
   if(ObjectFind(0, accent) < 0) ObjectCreate(0, accent, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, accent, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, accent, OBJPROP_XDISTANCE, panelX);
   ObjectSetInteger(0, accent, OBJPROP_YDISTANCE, panelY+28);
   ObjectSetInteger(0, accent, OBJPROP_XSIZE, panelW);
   ObjectSetInteger(0, accent, OBJPROP_YSIZE, 2);
   ObjectSetInteger(0, accent, OBJPROP_BGCOLOR, g_ThemeGlowHigh);
   ObjectSetInteger(0, accent, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, accent, OBJPROP_COLOR, g_ThemeGlowHigh);
   ObjectSetInteger(0, accent, OBJPROP_BACK, false);
   ObjectSetInteger(0, accent, OBJPROP_SELECTABLE, false);

   DashLabel(DASH_PREFIX+"Title", panelX+10, panelY+7, g_EATitle, g_ThemeProfit, 9, "Segoe UI Bold");
   DashLabel(DASH_PREFIX+"LblCandleTimer", panelX+panelW-52, panelY+7, "00:00", clrWhite, 8, "Segoe UI Bold");

   int rowY = panelY + 30, rowGap = 16, lx = panelX+10, vx = panelX+104;

   //======================= MOMENTUM =======================
   DashSectionHeader(panelX, panelW, rowY, "MOMENTUM", "MOMENTUM", false);
   DashLabel(DASH_PREFIX+"LblScoreCap",  lx, rowY, "> Score",   C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblScoreVal",  vx, rowY, "0 / 100",   clrWhite, 8, "Segoe UI Bold");
   rowY += rowGap;
   DashLabel(DASH_PREFIX+"LblStatus",    lx, rowY, "LOW - WAIT", clrRed, 8, "Segoe UI Bold");
   rowY += rowGap;

   //======================= STATUS =======================
   DashSectionHeader(panelX, panelW, rowY, "STATUS", "STATUS", true);
   DashLabel(DASH_PREFIX+"LblModeCap",   lx, rowY, "> Mode",    C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblModeVal",   vx, rowY, MomentumModeText(MomentumTradeMode), clrWhite, 8);
   rowY += rowGap;
   DashLabel(DASH_PREFIX+"LblGateCap",   lx, rowY, "> Trade Gate", C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblGateVal",   vx, rowY, "IDLE",      clrWhite, 8, "Segoe UI Bold");
   rowY += rowGap;
   DashLabel(DASH_PREFIX+"LblSpreadCap", lx, rowY, "> Spread", C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblSpreadVal", vx, rowY, "0 pts", clrWhite, 8, "Segoe UI Bold");
   rowY += rowGap;
   DashLabel(DASH_PREFIX+"LblLockDirCap", lx, rowY, "> Dir Lock", C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblLockDirVal", vx, rowY, "OFF",      clrWhite, 8, "Segoe UI Bold");
   rowY += rowGap;
   DashLabel(DASH_PREFIX+"LblTPLockCap", lx, rowY, "> TP Lock", C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblTPLockVal", vx, rowY, "OFF",  C'140,146,150', 8, "Segoe UI Bold");
   rowY += rowGap;
   DashLabel(DASH_PREFIX+"LblSLLockCap", lx, rowY, "> SL Lock", C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblSLLockVal", vx, rowY, "OFF",  C'140,146,150', 8, "Segoe UI Bold");
   rowY += rowGap;

   //======================= NEWS =======================
   DashSectionHeader(panelX, panelW, rowY, "NEWS", "NEWS", true);
   DashLabel(DASH_PREFIX+"LblNewsCap",   lx, rowY,    "> Next", C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblNewsVal",   vx, rowY,    "--:--",      clrWhite, 8, "Segoe UI Bold");
   DashLabel(DASH_PREFIX+"LblNewsImp",   vx+44, rowY, "",           clrWhite, 8, "Segoe UI Bold");
   rowY += rowGap;
   DashLabel(DASH_PREFIX+"LblNewsNameCap", lx, rowY, "> Event", C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblNewsNameVal", vx, rowY, "--",          clrWhite, 8);
   rowY += rowGap;

   //======================= ACCOUNT =======================
   DashSectionHeader(panelX, panelW, rowY, "ACCOUNT", "ACCOUNT", true);
   DashLabel(DASH_PREFIX+"LblBalCap",    lx, rowY, "$ Balance", C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblBalVal",    vx, rowY, "0.00",      clrWhite, 8);
   rowY += rowGap;
   DashLabel(DASH_PREFIX+"LblPLCap",  lx, rowY, "$ Daily P/L", C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblPLVal",  vx, rowY, "0.00",        clrWhite, 8, "Segoe UI Bold");
   rowY += rowGap;
   DashLabel(DASH_PREFIX+"LblPLPctCap", lx, rowY, "% Daily P/L", C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblPLPct",    vx, rowY, "(0.00%)",     g_ThemeProfit, 8, "Segoe UI Bold");
   rowY += rowGap;

   //======================= SESSION =======================
   DashSectionHeader(panelX, panelW, rowY, "SESSION", "SESSION", true);
   DashLabel(DASH_PREFIX+"LblTimerCap",  lx, rowY, "> Time Left", C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblTimerVal",  vx, rowY, "--:--",       clrWhite, 8);
   rowY += rowGap;
   DashLabel(DASH_PREFIX+"LblSrvIstCap", lx,    rowY, "> Server/IST", C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblSrvVal",    vx,    rowY, "--:--", clrWhite, 8);
   DashLabel(DASH_PREFIX+"LblSrvSep",    vx+34, rowY, "/",     C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblIstVal",    vx+42, rowY, "--:--", g_ThemeProfit, 8, "Segoe UI Bold");
   rowY += rowGap;

   BuildTradeToggleButton(panelX, panelY, panelW, panelH);
   ChartRedraw();
}

//======================================================================
// v20: BUCKET MODE PANEL - fully separate from SL Mode. Rows: MOMENTUM
// (Score, Status) / STATUS (Mode, Gate, Spread, Dir Lock, Basket P/L) /
// NEWS / ACCOUNT / SESSION. No TP/SL Lock rows exist here at all.
//======================================================================
void CreateDashboardBucketMode()
{
   int panelX = PANEL_X, panelY = PANEL_Y, panelW = PANEL_W, panelH = PANEL_H_BUCKET;

   string bg = DASH_PREFIX+"Panel";
   if(ObjectFind(0, bg) < 0) ObjectCreate(0, bg, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, bg, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, bg, OBJPROP_XDISTANCE, panelX);
   ObjectSetInteger(0, bg, OBJPROP_YDISTANCE, panelY);
   ObjectSetInteger(0, bg, OBJPROP_XSIZE, panelW);
   ObjectSetInteger(0, bg, OBJPROP_YSIZE, panelH);
   ObjectSetInteger(0, bg, OBJPROP_BGCOLOR, C'14,16,19');
   ObjectSetInteger(0, bg, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, bg, OBJPROP_COLOR, g_ThemeGlowLow);
   ObjectSetInteger(0, bg, OBJPROP_STYLE, STYLE_SOLID);
   ObjectSetInteger(0, bg, OBJPROP_WIDTH, 2);
   ObjectSetInteger(0, bg, OBJPROP_BACK, false);
   ObjectSetInteger(0, bg, OBJPROP_SELECTABLE, false);

   string hdr = DASH_PREFIX+"HeaderBg";
   if(ObjectFind(0, hdr) < 0) ObjectCreate(0, hdr, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, hdr, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, hdr, OBJPROP_XDISTANCE, panelX);
   ObjectSetInteger(0, hdr, OBJPROP_YDISTANCE, panelY);
   ObjectSetInteger(0, hdr, OBJPROP_XSIZE, panelW);
   ObjectSetInteger(0, hdr, OBJPROP_YSIZE, 28);
   ObjectSetInteger(0, hdr, OBJPROP_BGCOLOR, g_ThemeHeaderBg);
   ObjectSetInteger(0, hdr, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, hdr, OBJPROP_COLOR, g_ThemeHeaderBg);
   ObjectSetInteger(0, hdr, OBJPROP_BACK, false);
   ObjectSetInteger(0, hdr, OBJPROP_SELECTABLE, false);

   string accent = DASH_PREFIX+"Accent";
   if(ObjectFind(0, accent) < 0) ObjectCreate(0, accent, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, accent, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, accent, OBJPROP_XDISTANCE, panelX);
   ObjectSetInteger(0, accent, OBJPROP_YDISTANCE, panelY+28);
   ObjectSetInteger(0, accent, OBJPROP_XSIZE, panelW);
   ObjectSetInteger(0, accent, OBJPROP_YSIZE, 2);
   ObjectSetInteger(0, accent, OBJPROP_BGCOLOR, g_ThemeGlowHigh);
   ObjectSetInteger(0, accent, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, accent, OBJPROP_COLOR, g_ThemeGlowHigh);
   ObjectSetInteger(0, accent, OBJPROP_BACK, false);
   ObjectSetInteger(0, accent, OBJPROP_SELECTABLE, false);

   DashLabel(DASH_PREFIX+"Title", panelX+10, panelY+7, g_EATitle, g_ThemeProfit, 9, "Segoe UI Bold");
   DashLabel(DASH_PREFIX+"LblCandleTimer", panelX+panelW-52, panelY+7, "00:00", clrWhite, 8, "Segoe UI Bold");

   int rowY = panelY + 30, rowGap = 16, lx = panelX+10, vx = panelX+104;

   //======================= MOMENTUM =======================
   DashSectionHeader(panelX, panelW, rowY, "MOMENTUM", "MOMENTUM", false);
   DashLabel(DASH_PREFIX+"LblScoreCap",  lx, rowY, "> Score",   C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblScoreVal",  vx, rowY, "0 / 100",   clrWhite, 8, "Segoe UI Bold");
   rowY += rowGap;
   DashLabel(DASH_PREFIX+"LblStatus",    lx, rowY, "LOW - WAIT", clrRed, 8, "Segoe UI Bold");
   rowY += rowGap;

   //======================= STATUS =======================
   DashSectionHeader(panelX, panelW, rowY, "STATUS", "STATUS", true);
   DashLabel(DASH_PREFIX+"LblModeCap",   lx, rowY, "> Mode",    C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblModeVal",   vx, rowY, MomentumModeText(MomentumTradeMode), clrWhite, 8);
   rowY += rowGap;
   DashLabel(DASH_PREFIX+"LblGateCap",   lx, rowY, "> Trade Gate", C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblGateVal",   vx, rowY, "IDLE",      clrWhite, 8, "Segoe UI Bold");
   rowY += rowGap;
   DashLabel(DASH_PREFIX+"LblSpreadCap", lx, rowY, "> Spread", C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblSpreadVal", vx, rowY, "0 pts", clrWhite, 8, "Segoe UI Bold");
   rowY += rowGap;
   DashLabel(DASH_PREFIX+"LblLockDirCap", lx, rowY, "> Dir Lock", C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblLockDirVal", vx, rowY, "OFF",      clrWhite, 8, "Segoe UI Bold");
   rowY += rowGap;
   DashLabel(DASH_PREFIX+"LblBasketCap", lx, rowY, "> Basket P/L", C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblBasketVal", vx, rowY, "0.00 / 0.00", C'140,146,150', 8, "Segoe UI Bold");
   rowY += rowGap;

   //======================= NEWS =======================
   DashSectionHeader(panelX, panelW, rowY, "NEWS", "NEWS", true);
   DashLabel(DASH_PREFIX+"LblNewsCap",   lx, rowY,    "> Next", C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblNewsVal",   vx, rowY,    "--:--",      clrWhite, 8, "Segoe UI Bold");
   DashLabel(DASH_PREFIX+"LblNewsImp",   vx+44, rowY, "",           clrWhite, 8, "Segoe UI Bold");
   rowY += rowGap;
   DashLabel(DASH_PREFIX+"LblNewsNameCap", lx, rowY, "> Event", C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblNewsNameVal", vx, rowY, "--",          clrWhite, 8);
   rowY += rowGap;

   //======================= ACCOUNT =======================
   DashSectionHeader(panelX, panelW, rowY, "ACCOUNT", "ACCOUNT", true);
   DashLabel(DASH_PREFIX+"LblBalCap",    lx, rowY, "$ Balance", C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblBalVal",    vx, rowY, "0.00",      clrWhite, 8);
   rowY += rowGap;
   DashLabel(DASH_PREFIX+"LblPLCap",  lx, rowY, "$ Daily P/L", C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblPLVal",  vx, rowY, "0.00",        clrWhite, 8, "Segoe UI Bold");
   rowY += rowGap;
   DashLabel(DASH_PREFIX+"LblPLPctCap", lx, rowY, "% Daily P/L", C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblPLPct",    vx, rowY, "(0.00%)",     g_ThemeProfit, 8, "Segoe UI Bold");
   rowY += rowGap;

   //======================= SESSION =======================
   DashSectionHeader(panelX, panelW, rowY, "SESSION", "SESSION", true);
   DashLabel(DASH_PREFIX+"LblTimerCap",  lx, rowY, "> Time Left", C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblTimerVal",  vx, rowY, "--:--",       clrWhite, 8);
   rowY += rowGap;
   DashLabel(DASH_PREFIX+"LblSrvIstCap", lx,    rowY, "> Server/IST", C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblSrvVal",    vx,    rowY, "--:--", clrWhite, 8);
   DashLabel(DASH_PREFIX+"LblSrvSep",    vx+34, rowY, "/",     C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblIstVal",    vx+42, rowY, "--:--", g_ThemeProfit, 8, "Segoe UI Bold");
   rowY += rowGap;

   BuildTradeToggleButton(panelX, panelY, panelW, panelH);
   ChartRedraw();
}

//======================================================================
// v26: STEP SCALE MODE PANEL - third mode, fully separate from the other
// two. Rows: MOMENTUM (Score, Status) / STATUS (Mode, Gate, Spread, Next
// Add, Step P/L) / NEWS / ACCOUNT / SESSION. Same row layout as Bucket
// Mode (the "Dir Lock" row becomes "Next Add", "Basket P/L" becomes
// "Step P/L") so the two panel functions can share height/geometry.
//======================================================================
void CreateDashboardStepMode()
{
   int panelX = PANEL_X, panelY = PANEL_Y, panelW = PANEL_W, panelH = PANEL_H_STEP;

   string bg = DASH_PREFIX+"Panel";
   if(ObjectFind(0, bg) < 0) ObjectCreate(0, bg, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, bg, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, bg, OBJPROP_XDISTANCE, panelX);
   ObjectSetInteger(0, bg, OBJPROP_YDISTANCE, panelY);
   ObjectSetInteger(0, bg, OBJPROP_XSIZE, panelW);
   ObjectSetInteger(0, bg, OBJPROP_YSIZE, panelH);
   ObjectSetInteger(0, bg, OBJPROP_BGCOLOR, C'14,16,19');
   ObjectSetInteger(0, bg, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, bg, OBJPROP_COLOR, g_ThemeGlowLow);
   ObjectSetInteger(0, bg, OBJPROP_STYLE, STYLE_SOLID);
   ObjectSetInteger(0, bg, OBJPROP_WIDTH, 2);
   ObjectSetInteger(0, bg, OBJPROP_BACK, false);
   ObjectSetInteger(0, bg, OBJPROP_SELECTABLE, false);

   string hdr = DASH_PREFIX+"HeaderBg";
   if(ObjectFind(0, hdr) < 0) ObjectCreate(0, hdr, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, hdr, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, hdr, OBJPROP_XDISTANCE, panelX);
   ObjectSetInteger(0, hdr, OBJPROP_YDISTANCE, panelY);
   ObjectSetInteger(0, hdr, OBJPROP_XSIZE, panelW);
   ObjectSetInteger(0, hdr, OBJPROP_YSIZE, 28);
   ObjectSetInteger(0, hdr, OBJPROP_BGCOLOR, g_ThemeHeaderBg);
   ObjectSetInteger(0, hdr, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, hdr, OBJPROP_COLOR, g_ThemeHeaderBg);
   ObjectSetInteger(0, hdr, OBJPROP_BACK, false);
   ObjectSetInteger(0, hdr, OBJPROP_SELECTABLE, false);

   string accent = DASH_PREFIX+"Accent";
   if(ObjectFind(0, accent) < 0) ObjectCreate(0, accent, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, accent, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, accent, OBJPROP_XDISTANCE, panelX);
   ObjectSetInteger(0, accent, OBJPROP_YDISTANCE, panelY+28);
   ObjectSetInteger(0, accent, OBJPROP_XSIZE, panelW);
   ObjectSetInteger(0, accent, OBJPROP_YSIZE, 2);
   ObjectSetInteger(0, accent, OBJPROP_BGCOLOR, g_ThemeGlowHigh);
   ObjectSetInteger(0, accent, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, accent, OBJPROP_COLOR, g_ThemeGlowHigh);
   ObjectSetInteger(0, accent, OBJPROP_BACK, false);
   ObjectSetInteger(0, accent, OBJPROP_SELECTABLE, false);

   DashLabel(DASH_PREFIX+"Title", panelX+10, panelY+7, g_EATitle, g_ThemeProfit, 9, "Segoe UI Bold");
   DashLabel(DASH_PREFIX+"LblCandleTimer", panelX+panelW-52, panelY+7, "00:00", clrWhite, 8, "Segoe UI Bold");

   int rowY = panelY + 30, rowGap = 16, lx = panelX+10, vx = panelX+104;

   //======================= MOMENTUM =======================
   DashSectionHeader(panelX, panelW, rowY, "MOMENTUM", "MOMENTUM", false);
   DashLabel(DASH_PREFIX+"LblScoreCap",  lx, rowY, "> Score",   C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblScoreVal",  vx, rowY, "0 / 100",   clrWhite, 8, "Segoe UI Bold");
   rowY += rowGap;
   DashLabel(DASH_PREFIX+"LblStatus",    lx, rowY, "LOW - WAIT", clrRed, 8, "Segoe UI Bold");
   rowY += rowGap;

   //======================= STATUS =======================
   DashSectionHeader(panelX, panelW, rowY, "STATUS", "STATUS", true);
   DashLabel(DASH_PREFIX+"LblModeCap",   lx, rowY, "> Mode",    C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblModeVal",   vx, rowY, MomentumModeText(MomentumTradeMode), clrWhite, 8);
   rowY += rowGap;
   DashLabel(DASH_PREFIX+"LblGateCap",   lx, rowY, "> Trade Gate", C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblGateVal",   vx, rowY, "IDLE",      clrWhite, 8, "Segoe UI Bold");
   rowY += rowGap;
   DashLabel(DASH_PREFIX+"LblSpreadCap", lx, rowY, "> Spread", C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblSpreadVal", vx, rowY, "0 pts", clrWhite, 8, "Segoe UI Bold");
   rowY += rowGap;
   DashLabel(DASH_PREFIX+"LblLockDirCap", lx, rowY, "> Next Add", C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblLockDirVal", vx, rowY, "BUY",      clrWhite, 8, "Segoe UI Bold");
   rowY += rowGap;
   DashLabel(DASH_PREFIX+"LblBasketCap", lx, rowY, "> Step P/L", C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblBasketVal", vx, rowY, "0.00 / 0.00", C'140,146,150', 8, "Segoe UI Bold");
   rowY += rowGap;

   //======================= NEWS =======================
   DashSectionHeader(panelX, panelW, rowY, "NEWS", "NEWS", true);
   DashLabel(DASH_PREFIX+"LblNewsCap",   lx, rowY,    "> Next", C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblNewsVal",   vx, rowY,    "--:--",      clrWhite, 8, "Segoe UI Bold");
   DashLabel(DASH_PREFIX+"LblNewsImp",   vx+44, rowY, "",           clrWhite, 8, "Segoe UI Bold");
   rowY += rowGap;
   DashLabel(DASH_PREFIX+"LblNewsNameCap", lx, rowY, "> Event", C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblNewsNameVal", vx, rowY, "--",          clrWhite, 8);
   rowY += rowGap;

   //======================= ACCOUNT =======================
   DashSectionHeader(panelX, panelW, rowY, "ACCOUNT", "ACCOUNT", true);
   DashLabel(DASH_PREFIX+"LblBalCap",    lx, rowY, "$ Balance", C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblBalVal",    vx, rowY, "0.00",      clrWhite, 8);
   rowY += rowGap;
   DashLabel(DASH_PREFIX+"LblPLCap",  lx, rowY, "$ Daily P/L", C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblPLVal",  vx, rowY, "0.00",        clrWhite, 8, "Segoe UI Bold");
   rowY += rowGap;
   DashLabel(DASH_PREFIX+"LblPLPctCap", lx, rowY, "% Daily P/L", C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblPLPct",    vx, rowY, "(0.00%)",     g_ThemeProfit, 8, "Segoe UI Bold");
   rowY += rowGap;

   //======================= SESSION =======================
   DashSectionHeader(panelX, panelW, rowY, "SESSION", "SESSION", true);
   DashLabel(DASH_PREFIX+"LblTimerCap",  lx, rowY, "> Time Left", C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblTimerVal",  vx, rowY, "--:--",       clrWhite, 8);
   rowY += rowGap;
   DashLabel(DASH_PREFIX+"LblSrvIstCap", lx,    rowY, "> Server/IST", C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblSrvVal",    vx,    rowY, "--:--", clrWhite, 8);
   DashLabel(DASH_PREFIX+"LblSrvSep",    vx+34, rowY, "/",     C'140,146,150', 8);
   DashLabel(DASH_PREFIX+"LblIstVal",    vx+42, rowY, "--:--", g_ThemeProfit, 8, "Segoe UI Bold");
   rowY += rowGap;

   BuildTradeToggleButton(panelX, panelY, panelW, panelH);
   ChartRedraw();
}

//--- v20: shared by both panels only because it's mode-agnostic (DashboardMode
//    is a separate, independent setting from EAMode) - not a layout dependency
void BuildTradeToggleButton(int panelX, int panelY, int panelW, int panelH)
{
   int btnY = panelY + panelH - 34;

   if(DashboardMode == Always_On)
   {
      string btn = DASH_PREFIX+"BtnToggle";
      if(ObjectFind(0, btn) >= 0) ObjectDelete(0, btn);

      string strip = DASH_PREFIX+"AutoStrip";
      if(ObjectFind(0, strip) < 0) ObjectCreate(0, strip, OBJ_RECTANGLE_LABEL, 0, 0, 0);
      ObjectSetInteger(0, strip, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, strip, OBJPROP_XDISTANCE, panelX+10);
      ObjectSetInteger(0, strip, OBJPROP_YDISTANCE, btnY);
      ObjectSetInteger(0, strip, OBJPROP_XSIZE, panelW-20);
      ObjectSetInteger(0, strip, OBJPROP_YSIZE, 26);
      ObjectSetInteger(0, strip, OBJPROP_BGCOLOR, g_ThemeStrip);
      ObjectSetInteger(0, strip, OBJPROP_BORDER_TYPE, BORDER_FLAT);
      ObjectSetInteger(0, strip, OBJPROP_COLOR, g_ThemeStrip);
      ObjectSetInteger(0, strip, OBJPROP_BACK, false);
      ObjectSetInteger(0, strip, OBJPROP_SELECTABLE, false);

      DashLabel(DASH_PREFIX+"AutoLbl", panelX+10, btnY+7, "   ALWAYS ON - AUTO", clrWhite, 9, "Segoe UI Bold");
   }
   else
   {
      string strip = DASH_PREFIX+"AutoStrip";
      if(ObjectFind(0, strip) >= 0) ObjectDelete(0, strip);
      string autoLbl = DASH_PREFIX+"AutoLbl";
      if(ObjectFind(0, autoLbl) >= 0) ObjectDelete(0, autoLbl);

      string btn = DASH_PREFIX+"BtnToggle";
      if(ObjectFind(0, btn) < 0) ObjectCreate(0, btn, OBJ_BUTTON, 0, 0, 0);
      ObjectSetInteger(0, btn, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, btn, OBJPROP_XDISTANCE, panelX+10);
      ObjectSetInteger(0, btn, OBJPROP_YDISTANCE, btnY);
      ObjectSetInteger(0, btn, OBJPROP_XSIZE, panelW-20);
      ObjectSetInteger(0, btn, OBJPROP_YSIZE, 26);
      ObjectSetString (0, btn, OBJPROP_TEXT, "   TRADING OFF");
      ObjectSetString (0, btn, OBJPROP_FONT, "Segoe UI Bold");
      ObjectSetInteger(0, btn, OBJPROP_FONTSIZE, 9);
      ObjectSetInteger(0, btn, OBJPROP_COLOR, clrWhite);
      ObjectSetInteger(0, btn, OBJPROP_BGCOLOR, C'120,30,30');
      ObjectSetInteger(0, btn, OBJPROP_BORDER_COLOR, C'50,54,58');
      ObjectSetInteger(0, btn, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, btn, OBJPROP_STATE, false);
   }
}

void UpdateDashboard()
{
   ObjectSetString(0, DASH_PREFIX+"LblScoreVal", OBJPROP_TEXT, DoubleToString(MomentumScore,0)+" / 100");

   color statusClr; string statusTxt;
   if(MomentumScore >= MomentumHighScore)      { statusClr = g_ThemeProfit; statusTxt = "^ HIGH MOMENTUM - TRADE"; }
   else if(MomentumScore >= MomentumLowScore)  { statusClr = clrOrange;        statusTxt = "~ MODERATE"; }
   else                                        { statusClr = clrRed;           statusTxt = "v LOW - WAIT"; }
   ObjectSetString (0, DASH_PREFIX+"LblStatus", OBJPROP_TEXT, statusTxt);
   ObjectSetInteger(0, DASH_PREFIX+"LblStatus", OBJPROP_COLOR, statusClr);

   //--- v10: Dir Lock now reports which side is actively permitted (BUY MODE /
   //    SELL MODE) instead of a generic ON, so the panel tells you the actual
   //    state at a glance. When the lock isn't engaged it simply shows OFF.
   //    Bucket Mode has no position-count lock of its own (BlockOppositeSide/
   //    g_OppositeLockBuy/Sell never gates a Bucket Mode trade), so it always
   //    just shows OFF here.
   //--- v26: Step Scale Mode reuses this same row as "Next Add" - which side
   //    the NEXT scale-in trade will fire on (always the opposite of the most
   //    recently opened trade).
   string lockDirTxt; color lockDirClr; string lockDirTip;
   if(EAMode == Bucket_Mode)
   {
      lockDirTxt = "OFF";
      lockDirClr = C'140,146,150';
      lockDirTip = "Direction lock not used in Bucket Mode";
   }
   else if(EAMode == Step_Scale_Mode)
   {
      bool nextIsBuy = !g_StepLastEntryIsBuy;
      lockDirTxt = nextIsBuy ? "BUY" : "SELL";
      lockDirClr = g_ThemeProfit;
      lockDirTip = "Side the next scale-in trade will open on, once the loss confirmation triggers";
   }
   else if(!BlockOppositeSide)
   {
      lockDirTxt = "OFF";
      lockDirClr = C'140,146,150';
      lockDirTip = "Direction lock disabled";
   }
   else if(g_OppositeLockSell)
   {
      lockDirTxt = "BUY MODE";
      lockDirClr = g_ThemeProfit;
      lockDirTip = "BUY ONLY - new SELL orders blocked (existing sells keep running)";
   }
   else if(g_OppositeLockBuy)
   {
      lockDirTxt = "SELL MODE";
      lockDirClr = g_ThemeProfit;
      lockDirTip = "SELL ONLY - new BUY orders blocked (existing buys keep running)";
   }
   else
   {
      lockDirTxt = "OFF";
      lockDirClr = C'140,146,150';
      lockDirTip = "Armed, but no side currently locked";
   }
   ObjectSetString (0, DASH_PREFIX+"LblLockDirVal", OBJPROP_TEXT, lockDirTxt);
   ObjectSetInteger(0, DASH_PREFIX+"LblLockDirVal", OBJPROP_COLOR, lockDirClr);
   ObjectSetString (0, DASH_PREFIX+"LblLockDirVal", OBJPROP_TOOLTIP, lockDirTip);

   //--- v16: Basket P/L objects only EXIST in Bucket Mode and Step Scale Mode
   //    now (see CreateDashboard) - only touch them here if we're in one of
   //    those modes, so nothing stale is ever displayed
   if(EAMode == Bucket_Mode)
   {
      string basketTxt = DoubleToString(g_BasketProfit, 2) + " / " + DoubleToString(g_BasketTarget, 2);
      color  basketClr = (g_BasketProfit >= 0) ? g_ThemeProfit : C'255,90,90';
      string basketTip = "Closes ALL entries the instant combined floating profit reaches the target - no per-trade stop loss in Bucket Mode";
      ObjectSetString(0, DASH_PREFIX+"LblBasketVal", OBJPROP_TEXT, basketTxt);
      ObjectSetInteger(0, DASH_PREFIX+"LblBasketVal", OBJPROP_COLOR, basketClr);
      ObjectSetString(0, DASH_PREFIX+"LblBasketVal", OBJPROP_TOOLTIP, basketTip);
   }
   else if(EAMode == Step_Scale_Mode)
   {
      string stepTxt = DoubleToString(g_StepBasketProfit, 2) + " / " + DoubleToString(g_StepBasketTarget, 2);
      color  stepClr = (g_StepBasketProfit >= 0) ? g_ThemeProfit : C'255,90,90';
      string stepTip = "Closes ALL entries the instant combined floating profit reaches the target - no per-trade stop loss in Step Scale Mode";
      ObjectSetString(0, DASH_PREFIX+"LblBasketVal", OBJPROP_TEXT, stepTxt);
      ObjectSetInteger(0, DASH_PREFIX+"LblBasketVal", OBJPROP_COLOR, stepClr);
      ObjectSetString(0, DASH_PREFIX+"LblBasketVal", OBJPROP_TOOLTIP, stepTip);
   }

   string gateTxt; color gateClr;
   if(!TradingActive)
   {
      gateTxt = "IDLE";
      gateClr = C'140,146,150';
   }
   else if(MomentumGateOpen)
   {
      gateTxt = "OPEN - TRADING";
      gateClr = g_ThemeProfit;
   }
   else
   {
      gateTxt = "CLOSED - WAIT";
      gateClr = clrRed;
   }
   ObjectSetString (0, DASH_PREFIX+"LblGateVal", OBJPROP_TEXT, gateTxt);
   ObjectSetInteger(0, DASH_PREFIX+"LblGateVal", OBJPROP_COLOR, gateClr);

   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity  = AccountInfoDouble(ACCOUNT_EQUITY);
   double dailyPL = equity - DayStartBalance;

   ObjectSetString(0, DASH_PREFIX+"LblBalVal", OBJPROP_TEXT, DoubleToString(balance,2));

   string sign       = (dailyPL >= 0) ? "+" : "";
   string dollarText = sign + DoubleToString(dailyPL,2);
   string pctText    = "(" + sign + DoubleToString(DailyProfitPercent,2) + "%)";
   color  plClr      = (dailyPL < 0) ? C'255,90,90' : g_ThemeProfit;
   ObjectSetString (0, DASH_PREFIX+"LblPLVal", OBJPROP_TEXT, dollarText);
   ObjectSetInteger(0, DASH_PREFIX+"LblPLVal", OBJPROP_COLOR, plClr);
   ObjectSetString (0, DASH_PREFIX+"LblPLPct", OBJPROP_TEXT, pctText);
   ObjectSetInteger(0, DASH_PREFIX+"LblPLPct", OBJPROP_COLOR, plClr);

   if(DashboardMode == Always_On)
   {
      ObjectSetString(0, DASH_PREFIX+"LblTimerVal", OBJPROP_TEXT, "ALWAYS ON");
   }
   else if(TradingActive)
   {
      int remain = (int)(RunMinutes*60 - (TimeCurrent()-EnableStartTime));
      if(remain < 0) remain = 0;
      ObjectSetString(0, DASH_PREFIX+"LblTimerVal", OBJPROP_TEXT,
         StringFormat("%02d:%02d", remain/60, remain%60));
   }
   else
   {
      ObjectSetString(0, DASH_PREFIX+"LblTimerVal", OBJPROP_TEXT, "--:--");
   }

   //--- NEWS: kept deliberately short-form - no full event names, just a
   //    compact tag so the block stays tidy inside its own section
   if(!EnableNewsTimer)
   {
      ObjectSetString (0, DASH_PREFIX+"LblNewsVal", OBJPROP_TEXT, "OFF");
      ObjectSetInteger(0, DASH_PREFIX+"LblNewsVal", OBJPROP_COLOR, C'140,146,150');
      ObjectSetString (0, DASH_PREFIX+"LblNewsImp", OBJPROP_TEXT, "");
      ObjectSetString (0, DASH_PREFIX+"LblNewsNameVal", OBJPROP_TEXT, "--");
   }
   else if(IsTesterMode)
   {
      ObjectSetString (0, DASH_PREFIX+"LblNewsVal", OBJPROP_TEXT, "N/A (test)");
      ObjectSetInteger(0, DASH_PREFIX+"LblNewsVal", OBJPROP_COLOR, C'140,146,150');
      ObjectSetString (0, DASH_PREFIX+"LblNewsImp", OBJPROP_TEXT, "");
      ObjectSetString (0, DASH_PREFIX+"LblNewsNameVal", OBJPROP_TEXT, "--");
   }
   else if(NextNewsTime == 0)
   {
      ObjectSetString (0, DASH_PREFIX+"LblNewsVal", OBJPROP_TEXT, "none found");
      ObjectSetInteger(0, DASH_PREFIX+"LblNewsVal", OBJPROP_COLOR, C'140,146,150');
      ObjectSetString (0, DASH_PREFIX+"LblNewsImp", OBJPROP_TEXT, "");
      ObjectSetString (0, DASH_PREFIX+"LblNewsNameVal", OBJPROP_TEXT, "--");
   }
   else
   {
      int secsLeft = (int)(NextNewsTime - TimeCurrent());
      if(secsLeft < 0) secsLeft = 0;
      int hh = secsLeft / 3600;
      int mm = (secsLeft % 3600) / 60;
      int ss = secsLeft % 60;

      string timeStr = (hh > 0) ? StringFormat("%dh%02dm", hh, mm) : StringFormat("%02dm%02ds", mm, ss);
      bool   isHigh   = (NextNewsImportanceVal >= 2);
      string impTag   = isHigh ? "HIGH" : "MED";

      color newsClr;
      if(secsLeft <= 15*60)      newsClr = clrOrange;
      else if(secsLeft <= 60*60) newsClr = clrYellow;
      else                       newsClr = clrWhite;

      ObjectSetString (0, DASH_PREFIX+"LblNewsVal", OBJPROP_TEXT, timeStr);
      ObjectSetInteger(0, DASH_PREFIX+"LblNewsVal", OBJPROP_COLOR, newsClr);
      ObjectSetString(0, DASH_PREFIX+"LblNewsVal", OBJPROP_TOOLTIP,
         NextNewsCurrency + " - " + NextNewsTitle);

      ObjectSetString (0, DASH_PREFIX+"LblNewsImp", OBJPROP_TEXT, impTag);
      ObjectSetInteger(0, DASH_PREFIX+"LblNewsImp", OBJPROP_COLOR, isHigh ? g_ThemeProfit : C'140,146,150');

      //--- short form only: currency + first 2 words of the event name, no full title on the panel itself
      string nm = NextNewsCurrency;
      if(nm != "") nm += " ";
      string words[];
      int wCount = StringSplit(NextNewsTitle, ' ', words);
      string shortTitle = "";
      int wUse = MathMin(2, wCount);
      for(int w = 0; w < wUse; w++)
      {
         if(w > 0) shortTitle += " ";
         shortTitle += words[w];
      }
      nm += shortTitle;
      ObjectSetString(0, DASH_PREFIX+"LblNewsNameVal", OBJPROP_TEXT, nm);
      ObjectSetString(0, DASH_PREFIX+"LblNewsNameVal", OBJPROP_TOOLTIP,
         NextNewsCurrency + " - " + NextNewsTitle);
   }

   //--- v15: TP Lock / SL Lock rows only exist visually in SL Mode now
   if(EAMode == SL_Mode)
   {
      ObjectSetString(0, DASH_PREFIX+"LblTPLockCap", OBJPROP_TEXT, "> TP Lock");
      ObjectSetString(0, DASH_PREFIX+"LblSLLockCap", OBJPROP_TEXT, "> SL Lock");

      string tpTxt = EnableDailyTargetLock ? "ON" : "OFF";
      color  tpClr = EnableDailyTargetLock ? g_ThemeProfit : C'140,146,150';
      string tpTip = "Daily Target: " + DoubleToString(MaxDailyProfitPercent,2) + "%";
      if(DailyTargetHit)
      {
         tpTip += EnableDailyTargetLock ? "  (HIT - STOPPED)" : "  (HIT)";
         tpClr  = clrOrange;
      }
      ObjectSetString (0, DASH_PREFIX+"LblTPLockVal", OBJPROP_TEXT, tpTxt);
      ObjectSetInteger(0, DASH_PREFIX+"LblTPLockVal", OBJPROP_COLOR, tpClr);
      ObjectSetString (0, DASH_PREFIX+"LblTPLockVal", OBJPROP_TOOLTIP, tpTip);

      string slTxt = EnableDailyLossLock ? "ON" : "OFF";
      color  slClr = EnableDailyLossLock ? g_ThemeProfit : C'140,146,150';
      string slTip = "Max Daily Loss: " + DoubleToString(MaxDailyLossPercent,2) + "%";
      if(DailyLossHit)
      {
         slTip += EnableDailyLossLock ? "  (HIT - STOPPED)" : "  (HIT)";
         slClr  = clrOrange;
      }
      ObjectSetString (0, DASH_PREFIX+"LblSLLockVal", OBJPROP_TEXT, slTxt);
      ObjectSetInteger(0, DASH_PREFIX+"LblSLLockVal", OBJPROP_COLOR, slClr);
      ObjectSetString (0, DASH_PREFIX+"LblSLLockVal", OBJPROP_TOOLTIP, slTip);
   }
   else
   {
      ObjectSetString(0, DASH_PREFIX+"LblTPLockCap", OBJPROP_TEXT, "");
      ObjectSetString(0, DASH_PREFIX+"LblTPLockVal", OBJPROP_TEXT, "");
      ObjectSetString(0, DASH_PREFIX+"LblSLLockCap", OBJPROP_TEXT, "");
      ObjectSetString(0, DASH_PREFIX+"LblSLLockVal", OBJPROP_TEXT, "");
   }

   int perSecs = PeriodSeconds(PERIOD_CURRENT);
   if(perSecs > 0)
   {
      datetime barOpen   = iTime(_Symbol, PERIOD_CURRENT, 0);
      int       candleLeft = (int)((barOpen + perSecs) - TimeCurrent());
      if(candleLeft < 0) candleLeft = 0;
      ObjectSetString(0, DASH_PREFIX+"LblCandleTimer", OBJPROP_TEXT,
         StringFormat("%02d:%02d", candleLeft/60, candleLeft%60));
   }

   MqlDateTime nowDt;
   TimeCurrent(nowDt);

   double serverMinutesOfDay = nowDt.hour*60.0 + nowDt.min;
   double istOffsetMinutes   = (5.5 - BrokerGMTOffset) * 60.0 + ISTFineTuneMinutes;
   double istMinutesOfDay    = MathMod(serverMinutesOfDay + istOffsetMinutes + 1440.0, 1440.0);
   int    istH = (int)(istMinutesOfDay / 60.0);
   int    istM = (int)MathRound(istMinutesOfDay - istH*60.0);
   if(istM >= 60) { istM -= 60; istH = (istH+1) % 24; }

   ObjectSetString(0, DASH_PREFIX+"LblSrvVal", OBJPROP_TEXT,
      StringFormat("%02d:%02d", nowDt.hour, nowDt.min));
   ObjectSetString(0, DASH_PREFIX+"LblIstVal", OBJPROP_TEXT,
      StringFormat("%02d:%02d", istH, istM));

   long spreadPoints = SymbolInfoInteger(_Symbol, SYMBOL_SPREAD);
   ObjectSetString(0, DASH_PREFIX+"LblSpreadVal", OBJPROP_TEXT, StringFormat("%d pts", (int)spreadPoints));
   ObjectSetString(0, DASH_PREFIX+"LblSpreadVal", OBJPROP_TOOLTIP,
      StringFormat("Avg spread used by EA: %.*f (%s units) | Raw broker spread: %d pts",
                   _Digits, AverageSpread, "price", (int)spreadPoints));

   if(DashboardMode != Always_On)
   {
      color onColor  = g_ThemeButtonOn;
      color offColor = C'120,30,30';

      if(TradingActive)
      {
         ObjectSetString (0, DASH_PREFIX+"BtnToggle", OBJPROP_TEXT, "   TRADING ON");
         ObjectSetInteger(0, DASH_PREFIX+"BtnToggle", OBJPROP_BGCOLOR, onColor);
      }
      else
      {
         ObjectSetString (0, DASH_PREFIX+"BtnToggle", OBJPROP_TEXT, "   TRADING OFF");
         ObjectSetInteger(0, DASH_PREFIX+"BtnToggle", OBJPROP_BGCOLOR, offColor);
      }
   }

   ChartRedraw();
}

//======================================================================
// MOMENTUM SCORE ENGINE  (v12: volume + tick pace + directional efficiency,
// combined via geometric mean, damped early in the minute, penalized for
// wide spread, and gated with hysteresis so it doesn't flicker at the line)
//======================================================================
void UpdateMomentumScore()
{
   //--- reset the tick counter every time the M1 bar rolls over to a new minute
   datetime barTime = iTime(_Symbol, PERIOD_M1, 0);
   if(barTime != g_CurrentMinuteBarTime)
   {
      g_CurrentMinuteBarTime   = barTime;
      g_CurrentMinuteTickCount = 0;
   }
   g_CurrentMinuteTickCount++;

   int secElapsed = (int)(TimeCurrent() - barTime);
   if(secElapsed < 1) secElapsed = 1;
   if(secElapsed > 60) secElapsed = 60;
   double paceMultiplier = 60.0 / secElapsed;
   double elapsedFrac    = secElapsed / 60.0;   // 0..1 - how far into the current minute we are

   //--- VOLUME SCORE: projected current-minute tick volume vs the average tick
   //    volume of the previous VolumeLookbackMinutes completed minutes. The raw
   //    pace-projection is blended with the LAST completed minute's actual
   //    volume, weighted by elapsedFrac - this stops one tick at secElapsed=1
   //    from spiking the projection up to 60x on almost no sample.
   double volumeScore = 50.0;   // neutral default until there's enough history to judge
   if(VolumeLookbackMinutes > 0 && VolumeExpansionRatio > 0)
   {
      long volSum   = 0;
      int  volCount = 0;
      for(int i = 1; i <= VolumeLookbackMinutes; i++)
      {
         long v = iVolume(_Symbol, PERIOD_M1, i);
         if(v <= 0) continue;
         volSum += v;
         volCount++;
      }

      if(volCount > 0)
      {
         double avgVolume        = (double)volSum / volCount;
         double rawProjVolume    = (double)iVolume(_Symbol, PERIOD_M1, 0) * paceMultiplier;
         double lastMinuteVolume = (double)iVolume(_Symbol, PERIOD_M1, 1);
         double dampedVolume     = elapsedFrac * rawProjVolume + (1.0 - elapsedFrac) * lastMinuteVolume;

         if(avgVolume > 0)
         {
            double ratio = dampedVolume / (avgVolume * VolumeExpansionRatio);
            volumeScore = MathMax(0.0, MathMin(2.0, ratio)) * 50.0;
         }
      }
   }

   //--- TICK SCORE: same early-minute damping treatment as volume, projected
   //    against the fixed tick-count-per-minute threshold
   double tickScore = 50.0;
   if(TickCountPerMinThreshold > 0)
   {
      double rawProjTicks    = g_CurrentMinuteTickCount * paceMultiplier;
      double lastMinuteTicks = (double)iVolume(_Symbol, PERIOD_M1, 1);   // best available proxy for prior minute's tick count
      double dampedTicks     = elapsedFrac * rawProjTicks + (1.0 - elapsedFrac) * lastMinuteTicks;

      double ratio = dampedTicks / (double)TickCountPerMinThreshold;
      tickScore = MathMax(0.0, MathMin(2.0, ratio)) * 50.0;
   }

   //--- DIRECTIONAL EFFICIENCY: Kaufman-style efficiency ratio over the last
   //    EfficiencyLookbackBars completed M1 bars - net displacement divided by
   //    total path length travelled. 1.0 = pure trend, 0.0 = pure chop. This is
   //    what actually separates "busy market" from "market moving somewhere" -
   //    raw tick/volume counts can't tell a whipsaw from a genuine run.
   double efficiencyScore = 50.0;
   if(EfficiencyLookbackBars > 0 && Bars(_Symbol, PERIOD_M1) > EfficiencyLookbackBars + 1)
   {
      double netMove = MathAbs(iClose(_Symbol, PERIOD_M1, 1) - iClose(_Symbol, PERIOD_M1, EfficiencyLookbackBars + 1));
      double pathSum = 0;
      for(int i = 1; i <= EfficiencyLookbackBars; i++)
         pathSum += MathAbs(iClose(_Symbol, PERIOD_M1, i) - iClose(_Symbol, PERIOD_M1, i + 1));

      if(pathSum > 0)
      {
         double efficiencyRatio = MathMax(0.0, MathMin(1.0, netMove / pathSum));
         efficiencyScore = efficiencyRatio * 100.0;
      }
   }

   //--- COMBINE: geometric mean instead of a plain average - this forces all
   //    three signals (volume, tick pace, directional efficiency) to be
   //    reasonably strong AT THE SAME TIME, rather than one strong component
   //    masking two weak ones the way an arithmetic average would.
   double product  = MathMax(volumeScore, 0.01) * MathMax(tickScore, 0.01) * MathMax(efficiencyScore, 0.01);
   double rawScore = MathPow(product, 1.0/3.0);

   //--- SPREAD PENALTY: a tick burst during a spread spike (thin liquidity,
   //    news gap) is unreliable and expensive to trade into - scale the score
   //    down when the current spread runs well above its own recent baseline
   double curSpreadPts = (double)SymbolInfoInteger(_Symbol, SYMBOL_SPREAD);
   if(g_SpreadEMA <= 0) g_SpreadEMA = curSpreadPts;
   else                 g_SpreadEMA = g_SpreadEMA * 0.95 + curSpreadPts * 0.05;

   double spreadPenalty = 1.0;
   if(SpreadPenaltyRatio > 0 && g_SpreadEMA > 0 && curSpreadPts > g_SpreadEMA * SpreadPenaltyRatio)
      spreadPenalty = MathMax(0.3, (g_SpreadEMA * SpreadPenaltyRatio) / curSpreadPts);

   MomentumScore = rawScore * spreadPenalty;

   //--- GATE HYSTERESIS: work out what the gate "wants" to be this tick, but
   //    only commit to that state once it's held steady for GateHysteresisSeconds
   //    - stops the gate flapping open/closed every tick when the score is
   //    hovering right on the threshold line.
   bool desiredGate;
   switch(MomentumTradeMode)
   {
      case Trade_HighOnly:
         desiredGate = (MomentumScore >= MomentumHighScore);
         break;
      case Trade_ModerateHigh:
         desiredGate = (MomentumScore >= MomentumLowScore);
         break;
      default: // Trade_AllRegardless
         desiredGate = true;
         break;
   }

   if(desiredGate != g_GateCandidate)
   {
      g_GateCandidate      = desiredGate;
      g_GateCandidateSince = TimeCurrent();
   }

   if(GateHysteresisSeconds <= 0 || (TimeCurrent() - g_GateCandidateSince) >= GateHysteresisSeconds)
      MomentumGateOpen = g_GateCandidate;

   UpdateDashboard();
}

//======================================================================
// NEXT NEWS TIMER  (informational only - never gates or blocks trading)
//======================================================================
void AddCurrencyUnique(string &arr[], string ccy)
{
   if(ccy == "") return;
   for(int i = 0; i < ArraySize(arr); i++)
      if(arr[i] == ccy) return;
   int n = ArraySize(arr);
   ArrayResize(arr, n+1);
   arr[n] = ccy;
}

void FindNextNews()
{
   NextNewsTime          = 0;
   NextNewsTitle         = "";
   NextNewsCurrency      = "";
   NextNewsImportanceVal = -1;

   if(!EnableNewsTimer) return;

   string currencies[];
   ArrayResize(currencies, 0);
   AddCurrencyUnique(currencies, "USD");
   AddCurrencyUnique(currencies, SymbolInfoString(_Symbol, SYMBOL_CURRENCY_BASE));
   AddCurrencyUnique(currencies, SymbolInfoString(_Symbol, SYMBOL_CURRENCY_PROFIT));

   datetime scanFrom = TimeCurrent();
   datetime scanTo   = TimeCurrent() + NewsLookaheadDays * 24 * 3600;
   int      minImportance = (NewsImportanceFilter == News_HighOnly) ? 2 : 1;

   datetime bestTime       = 0;
   string   bestTitle      = "";
   string   bestCurrency   = "";
   int      bestImportance = -1;
   int      totalScanned   = 0;

   for(int c = 0; c < ArraySize(currencies); c++)
   {
      MqlCalendarValue values[];
      int total = CalendarValueHistory(values, scanFrom, scanTo, NULL, currencies[c]);

      if(total < 0)
      {
         Print("[NewsTimer] CalendarValueHistory failed for ", currencies[c],
               " - error ", GetLastError(), ". Check View>Toolbox>Calendar tab - if it's ",
               "also empty, your broker server does not provide the economic calendar service.");
         continue;
      }

      totalScanned += total;
      if(total <= 0) continue;

      for(int i = 0; i < total; i++)
      {
         if(values[i].time < scanFrom) continue;

         MqlCalendarEvent ev;
         if(!CalendarEventById(values[i].event_id, ev)) continue;

         int impVal = (int)ev.importance;
         if(impVal < minImportance) continue;

         if(bestTime == 0 || values[i].time < bestTime)
         {
            bestTime       = values[i].time;
            bestTitle      = ev.name;
            bestImportance = impVal;
            bestCurrency   = currencies[c];
         }
      }
   }

   if(totalScanned == 0)
      Print("[NewsTimer] 0 calendar events returned across all currencies for the next ",
            NewsLookaheadDays, " day(s). This usually means your broker's terminal is not ",
            "receiving the MQL5 economic calendar feed - check View>Toolbox>Calendar tab.");
   else if(bestTime == 0)
      Print("[NewsTimer] ", totalScanned, " event(s) found but none met the Medium/High ",
            "importance filter in the next ", NewsLookaheadDays, " day(s).");

   NextNewsTime          = bestTime;
   NextNewsTitle         = bestTitle;
   NextNewsCurrency      = bestCurrency;
   NextNewsImportanceVal = bestImportance;
}

//======================================================================
// DAILY PROFIT / LOSS TRACKING
//======================================================================
void UpdateDailyProfit()
{
   MqlDateTime dt;
   TimeCurrent(dt);

   if(dt.day != CurrentDay)
{
   CurrentDay = dt.day;

   DayStartBalance = AccountInfoDouble(ACCOUNT_BALANCE);

   DailyProfitPercent = 0.0;

   DailyTargetHit = false;
   DailyLossHit = false;

   TradingActive = true;

   EnableStartTime = TimeCurrent();
}

   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   DailyProfitPercent = (DayStartBalance > 0) ? ((equity - DayStartBalance) / DayStartBalance) * 100.0 : 0;

   if(!DailyTargetHit && DailyProfitPercent >= MaxDailyProfitPercent)
   {
      DailyTargetHit = true;
      if(EnableDailyTargetLock && TradingActive)
      {
         TradingActive = false;
         FlattenAll();
      }
   }

   if(!DailyLossHit && DailyProfitPercent <= -MaxDailyLossPercent)
   {
      DailyLossHit = true;
      if(EnableDailyLossLock && TradingActive)
      {
         TradingActive = false;
         FlattenAll();
      }
   }
}

//======================================================================
// FLATTEN: cancel all pending orders + close all open positions
//======================================================================
void FlattenAll()
{
   for(int i = OrdersTotal()-1; i >= 0; i--)
   {
      if(ordinfo.SelectByIndex(i) && ordinfo.Symbol() == _Symbol && ordinfo.Magic() == InpMagic)
         trade.OrderDelete(ordinfo.Ticket());
   }

   for(int i = PositionsTotal()-1; i >= 0; i--)
   {
      if(posinfo.SelectByIndex(i) && posinfo.Symbol() == _Symbol && posinfo.Magic() == InpMagic)
         trade.PositionClose(posinfo.Ticket());
   }
}

//======================================================================
// v3: CANCEL PENDING ONLY
//======================================================================
void CancelPendingOrders()
{
   for(int i = OrdersTotal()-1; i >= 0; i--)
   {
      if(ordinfo.SelectByIndex(i) && ordinfo.Symbol() == _Symbol && ordinfo.Magic() == InpMagic)
         trade.OrderDelete(ordinfo.Ticket());
   }
}

//======================================================================
// v29: CLOSE THE SINGLE WORST-LOSING OPEN TRADE (this EA's symbol+magic only)
// Used by the Bucket Mode / Step Scale Mode basket-loss handler when
// CloseWorstTradeOnly = true, instead of flattening the whole basket.
//======================================================================
bool CloseWorstLosingTrade()
{
   double worstProfit = 0;
   ulong  worstTicket  = 0;
   bool   found        = false;

   for(int i = PositionsTotal()-1; i >= 0; i--)
   {
      if(posinfo.SelectByIndex(i) && posinfo.Symbol() == _Symbol && posinfo.Magic() == InpMagic)
      {
         double p = posinfo.Profit() + posinfo.Swap() + posinfo.Commission();
         if(!found || p < worstProfit)
         {
            worstProfit = p;
            worstTicket = posinfo.Ticket();
            found = true;
         }
      }
   }

   if(found)
   {
      Print("[LossGuard] Closing worst losing trade #", worstTicket,
            " (floating P/L ", DoubleToString(worstProfit,2), ")");
      return trade.PositionClose(worstTicket);
   }
   return false;
}

//======================================================================
// v29: RESYNC STEP SCALE STATE AFTER A PARTIAL CLOSE
// Only relevant when CloseWorstTradeOnly closed one leg out of the ladder
// and MORE THAN ONE position is still open (if exactly one survivor is left,
// the caller re-derives state directly from that position instead - see
// OnTick()). This just refreshes counts; kept separate in case future partial
// -close logic needs to run extra bookkeeping here.
//======================================================================

bool IsTradingSession()
{
   if(!EnableTradingSessions)
      return true;

   int now = GetSessionNowMinutes();

   //--- v7: loop over however many sessions were parsed from TradingSessions
   for(int i = 0; i < g_SessionCount; i++)
   {
      int start = g_SessionStartMin[i];
      int end   = g_SessionEndMin[i];

      if(start <= end)
      {
         if(now >= start && now <= end)
            return true;
      }
      else
      {
         if(now >= start || now <= end)
            return true;
      }
   }

   return false;
}

//======================================================================
// v29: STEP SCALE MODE - FIRST ENTRY DIRECTION VIA TREND FILTER
// Only used for the very FIRST trade of a new ladder (stepOpenCount == 0).
// Does NOT touch the scale-in / opposite-side-add logic in any way.
// Simple MA position filter: price above the MA => favor BUY as the first
// trade, price below => favor SELL. Falls back to StepStartDirection if the
// MA handle isn't ready yet (e.g. right after EA start / not enough bars).
//======================================================================
bool GetStepFirstEntryTrendIsBuy()
{
   double ma[];
   if(handleTrendMA == INVALID_HANDLE || CopyBuffer(handleTrendMA, MAIN_LINE, 1, 1, ma) <= 0)
      return (StepStartDirection == Step_Buy_First);   // fallback if MA not ready

   double price = iClose(_Symbol, TrendTF, 1);
   return (price > ma[0]);   // above MA = uptrend = buy first, below = sell first
}

void OnTick()
{
   UpdateMomentumScore();
   UpdateDailyProfit();

   if(EnableNewsTimer && !IsTesterMode &&
      (LastNewsScanTime == 0 || (TimeCurrent() - LastNewsScanTime) >= NewsRefreshSeconds))
   {
      FindNextNews();
      LastNewsScanTime = TimeCurrent();
   }

   if(!IsTesterMode && DashboardMode != Always_On &&
      TradingActive && (TimeCurrent() - EnableStartTime) >= RunMinutes*60)
   {
      TradingActive = false;
      FlattenAll();
      UpdateDashboard();
   }

   if(!TradingActive)
   {
      UpdateDashboard();
      return;
   }

   //--- v5: POST-SESSION FORCE CLOSE
   if(EnableTradingSessions && EnablePostSessionTimeout)
   {
      bool inSessionNow = IsTradingSession();
      if(inSessionNow)
      {
         g_PostSessionTimerStart = 0;
      }
      else
      {
         if(g_PostSessionTimerStart == 0)
            g_PostSessionTimerStart = TimeCurrent();

         if((TimeCurrent() - g_PostSessionTimerStart) >= PostSessionGraceMinutes * 60)
         {
            FlattenAll();
            UpdateDashboard();
            return;
         }
      }
   }

   //--- v37: CLOSE ON TREND REVERSAL - checked (and internally throttled to
   //    once per new bar) before the basket P/L block below, so if it closes
   //    any legs this tick, the profit-target/loss-guard math right after
   //    reflects the correct, post-close position set.
   ManageTrendReversalExit();

   //--- v14: BUCKET MODE BASKET PROFIT TARGET
   //    Runs before the momentum gate so a profitable basket closes promptly
   //    even if the momentum gate happens to be closed right now. Combined
   //    floating profit across every open position (both sides) is compared
   //    against a target of (PerEntryProfitTargetPercent% of ACCOUNT_BALANCE)
   //    x number of open entries - the basket target scales up automatically
   //    as more entries get added, same as before, just % based instead of a
   //    fixed dollar figure per entry.
   //--- v29: MaxBasketLoss / CloseWorstTradeOnly added directly below the
   //    profit-target check - previously there was NO loss exit at all here,
   //    which is why a hedged Bucket Mode basket could sit and bleed
   //    indefinitely in a chop / stuck-hedge scenario.
   if(EAMode == Bucket_Mode)
   {
      int    basketCount  = 0;
      double basketProfit = 0;

      for(int i = PositionsTotal()-1; i >= 0; i--)
      {
         if(posinfo.SelectByIndex(i) && posinfo.Symbol() == _Symbol && posinfo.Magic() == InpMagic)
         {
            basketCount++;
            basketProfit += posinfo.Profit() + posinfo.Swap() + posinfo.Commission();
         }
      }

      if(basketCount > 0)
      {
         double bucketPerEntryTarget = AccountInfoDouble(ACCOUNT_BALANCE) * (PerEntryProfitTargetPercent / 100.0);
         g_BasketTarget = bucketPerEntryTarget * basketCount;
         g_BasketProfit = basketProfit;

         if(basketProfit >= g_BasketTarget)
         {
            FlattenAll();
            g_LastEntryPrice   = 0;
            g_LastEntryBarTime = 0;
            g_BucketFirstEntryPrice = 0;   // NEW: basket fully flat - clear ladder cap origin
            g_BucketFirstEntryBarTime = 0;
            g_BucketPeakProfit      = 0;   // NEW: reset profit lock
            g_BucketProfitLockArmed = false;
            g_BucketConsecSameDir = 0;   // v36
            g_BucketLastAddWasBuy = true;   // v36
            UpdateDashboard();
            return;
         }

         //--- NEW: BASKET PROFIT LOCK - once floating profit crosses
         //    BasketProfitLockTrigger, arm a trail on the basket's own peak
         //    profit. If profit then gives back BasketProfitLockGiveback from
         //    that peak, close the whole basket immediately - this catches
         //    baskets that get healthily positive but never quite reach the
         //    full per-entry profit target line before reversing, so they get
         //    banked in profit instead of round-tripping into a loss.
         if(EnableBasketProfitLock && BasketProfitLockTrigger > 0)
         {
            if(basketProfit >= BasketProfitLockTrigger)
            {
               g_BucketProfitLockArmed = true;
               if(basketProfit > g_BucketPeakProfit) g_BucketPeakProfit = basketProfit;
            }

            if(g_BucketProfitLockArmed && basketProfit > 0 &&
               basketProfit <= (g_BucketPeakProfit - BasketProfitLockGiveback))
            {
               FlattenAll();
               g_LastEntryPrice   = 0;
               g_LastEntryBarTime = 0;
               g_BucketFirstEntryPrice = 0;
               g_BucketFirstEntryBarTime = 0;
               g_BucketPeakProfit      = 0;
               g_BucketProfitLockArmed = false;
               g_BucketConsecSameDir = 0;   // v36
               g_BucketLastAddWasBuy = true;   // v36
               UpdateDashboard();
               return;
            }
         }

         double basketLossThreshold = GetBasketLossThreshold();
         if(EnableMaxBasketLoss && basketLossThreshold > 0 && basketProfit <= -basketLossThreshold)
         {
            if(CloseWorstTradeOnly)
            {
               CloseWorstLosingTrade();

               //--- v29: if that leaves exactly ONE position open, re-derive the
               //    reference price/bar from the actual survivor so the next add's
               //    profit-confirmation check is judged against a trade that still
               //    exists, instead of a stale reference from the trade just closed.
               int remaining = 0;
               ulong survTicket = 0;
               for(int i = PositionsTotal()-1; i >= 0; i--)
               {
                  if(posinfo.SelectByIndex(i) && posinfo.Symbol() == _Symbol && posinfo.Magic() == InpMagic)
                  {
                     remaining++;
                     survTicket = posinfo.Ticket();
                  }
               }
               if(remaining == 1 && posinfo.SelectByTicket(survTicket))
               {
                  g_LastEntryPrice   = posinfo.PriceOpen();
                  g_LastEntryBarTime = iTime(_Symbol, PERIOD_CURRENT, 0);
                  //--- NOTE: g_BucketFirstEntryPrice is deliberately left as-is here -
                  //    this is a partial close (worst trade only), the basket itself
                  //    hasn't fully flattened, so the ladder distance cap should keep
                  //    measuring from the original basket origin.
               }
               else if(remaining == 0)
               {
                  g_LastEntryPrice   = 0;
                  g_LastEntryBarTime = 0;
                  g_BucketFirstEntryPrice = 0;   // NEW: basket fully flat - clear ladder cap origin
                  g_BucketFirstEntryBarTime = 0;
                  g_BucketPeakProfit      = 0;
                  g_BucketProfitLockArmed = false;
                  g_BucketConsecSameDir = 0;   // v36
                  g_BucketLastAddWasBuy = true;   // v36
               }
            }
            else
            {
               FlattenAll();
               g_LastEntryPrice   = 0;
               g_LastEntryBarTime = 0;
               g_BucketFirstEntryPrice = 0;   // NEW: basket fully flat - clear ladder cap origin
               g_BucketFirstEntryBarTime = 0;
               g_BucketPeakProfit      = 0;
               g_BucketProfitLockArmed = false;
               g_BucketConsecSameDir = 0;   // v36
               g_BucketLastAddWasBuy = true;   // v36
            }
            UpdateDashboard();
            return;
         }

         //--- NEW: BASKET MAX DURATION - a hard timeout independent of P/L.
         //    If none of the target/profit-lock/loss-guard checks above
         //    closed the basket, and it's been open longer than
         //    MaxBasketBars bars, close it anyway. This is the safety valve
         //    for a basket that's just stuck going nowhere (neither hitting
         //    target nor triggering the loss guard) - it forces a decision
         //    instead of letting it sit indefinitely.
         if(EnableBasketMaxBars && MaxBasketBars > 0 && g_BucketFirstEntryBarTime > 0)
         {
            int barsOpen = iBarShift(_Symbol, MaxBasketBarsTimeframe, g_BucketFirstEntryBarTime, false);
            if(barsOpen >= MaxBasketBars)
            {
               FlattenAll();
               g_LastEntryPrice        = 0;
               g_LastEntryBarTime      = 0;
               g_BucketFirstEntryPrice = 0;
               g_BucketFirstEntryBarTime = 0;
               g_BucketPeakProfit      = 0;
               g_BucketProfitLockArmed = false;
               g_BucketConsecSameDir = 0;   // v36
               g_BucketLastAddWasBuy = true;   // v36
               UpdateDashboard();
               return;
            }
         }
      }
      else
      {
         g_BasketTarget     = 0;
         g_BasketProfit     = 0;
         g_LastEntryPrice   = 0;
         g_LastEntryBarTime = 0;
         g_BucketFirstEntryPrice = 0;   // NEW: no positions left - clear ladder cap origin
         g_BucketFirstEntryBarTime = 0;
         g_BucketPeakProfit      = 0;
         g_BucketProfitLockArmed = false;
         g_BucketConsecSameDir = 0;   // v36
         g_BucketLastAddWasBuy = true;   // v36
      }
   }
   //--- v31: STEP SCALE MODE BASKET PROFIT TARGET
   //    Now the same idea as the Bucket Mode block above: a target of
   //    (StepPerEntryProfitTargetPercent% of ACCOUNT_BALANCE) x number of
   //    open entries, instead of a fixed dollar figure that didn't scale
   //    with entry count.
   //--- v29: MaxBasketLoss / CloseWorstTradeOnly added the same way as Bucket
   //    Mode above. On a partial close leaving exactly one survivor, the
   //    ladder state (g_StepLastEntryIsBuy/Price/BarTime) is re-derived from
   //    that surviving position so the next scale-in can resume correctly.
   else if(EAMode == Step_Scale_Mode)
   {
      int    stepCount  = 0;
      double stepProfit = 0;

      for(int i = PositionsTotal()-1; i >= 0; i--)
      {
         if(posinfo.SelectByIndex(i) && posinfo.Symbol() == _Symbol && posinfo.Magic() == InpMagic)
         {
            stepCount++;
            stepProfit += posinfo.Profit() + posinfo.Swap() + posinfo.Commission();
         }
      }

      if(stepCount > 0)
      {
         double stepPerEntryTarget = AccountInfoDouble(ACCOUNT_BALANCE) * (StepPerEntryProfitTargetPercent / 100.0);
         g_StepBasketTarget = stepPerEntryTarget * stepCount;
         g_StepBasketProfit = stepProfit;

         if(stepProfit >= g_StepBasketTarget)
         {
            FlattenAll();
            g_StepLastEntryPrice   = 0;
            g_StepLastEntryBarTime = 0;
            g_StepLastEntryIsBuy   = (StepStartDirection == Step_Buy_First);
            g_StepNextLotSize      = 0;
            g_StepFirstEntryPrice  = 0;   // NEW: ladder fully flat - clear ladder cap origin
            g_StepFirstEntryBarTime = 0;
            g_StepPeakProfit       = 0;   // NEW: reset profit lock
            g_StepProfitLockArmed  = false;
            g_StepConsecSameDir = 0;   // v36
            UpdateDashboard();
            return;
         }

         //--- NEW: BASKET PROFIT LOCK - same giveback-trail idea as Bucket
         //    Mode above, applied to the Step ladder.
         if(EnableBasketProfitLock && BasketProfitLockTrigger > 0)
         {
            if(stepProfit >= BasketProfitLockTrigger)
            {
               g_StepProfitLockArmed = true;
               if(stepProfit > g_StepPeakProfit) g_StepPeakProfit = stepProfit;
            }

            if(g_StepProfitLockArmed && stepProfit > 0 &&
               stepProfit <= (g_StepPeakProfit - BasketProfitLockGiveback))
            {
               FlattenAll();
               g_StepLastEntryPrice   = 0;
               g_StepLastEntryBarTime = 0;
               g_StepLastEntryIsBuy   = (StepStartDirection == Step_Buy_First);
               g_StepNextLotSize      = 0;
               g_StepFirstEntryPrice  = 0;
               g_StepFirstEntryBarTime = 0;
               g_StepPeakProfit       = 0;
               g_StepProfitLockArmed  = false;
               g_StepConsecSameDir = 0;   // v36
               UpdateDashboard();
               return;
            }
         }

         double stepLossThreshold = GetBasketLossThreshold();
         if(EnableMaxBasketLoss && stepLossThreshold > 0 && stepProfit <= -stepLossThreshold)
         {
            if(CloseWorstTradeOnly)
            {
               CloseWorstLosingTrade();

               int remaining = 0;
               ulong survTicket = 0;
               bool  survIsBuy = true;
               double survPrice = 0;
               for(int i = PositionsTotal()-1; i >= 0; i--)
               {
                  if(posinfo.SelectByIndex(i) && posinfo.Symbol() == _Symbol && posinfo.Magic() == InpMagic)
                  {
                     remaining++;
                     survTicket = posinfo.Ticket();
                     survIsBuy  = (posinfo.PositionType() == POSITION_TYPE_BUY);
                     survPrice  = posinfo.PriceOpen();
                  }
               }
               if(remaining == 1)
               {
                  g_StepLastEntryPrice   = survPrice;
                  g_StepLastEntryBarTime = iTime(_Symbol, PERIOD_CURRENT, 0);
                  g_StepLastEntryIsBuy   = survIsBuy;
                  g_StepNextLotSize      = 0;   // resume scaling fresh from here
                  //--- NOTE: g_StepFirstEntryPrice is deliberately left as-is here -
                  //    this is a partial close (worst trade only), the ladder hasn't
                  //    fully flattened, so the distance cap keeps measuring from the
                  //    original first entry.
               }
               else if(remaining == 0)
               {
                  g_StepLastEntryPrice   = 0;
                  g_StepLastEntryBarTime = 0;
                  g_StepLastEntryIsBuy   = (StepStartDirection == Step_Buy_First);
                  g_StepNextLotSize      = 0;
                  g_StepFirstEntryPrice  = 0;   // NEW: ladder fully flat - clear ladder cap origin
                  g_StepFirstEntryBarTime = 0;
                  g_StepPeakProfit       = 0;
                  g_StepProfitLockArmed  = false;
                  g_StepConsecSameDir = 0;   // v36
               }
            }
            else
            {
               FlattenAll();
               g_StepLastEntryPrice   = 0;
               g_StepLastEntryBarTime = 0;
               g_StepLastEntryIsBuy   = (StepStartDirection == Step_Buy_First);
               g_StepNextLotSize      = 0;
               g_StepFirstEntryPrice  = 0;   // NEW: ladder fully flat - clear ladder cap origin
               g_StepFirstEntryBarTime = 0;
               g_StepPeakProfit       = 0;
               g_StepProfitLockArmed  = false;
               g_StepConsecSameDir = 0;   // v36
            }
            UpdateDashboard();
            return;
         }

         //--- NEW: BASKET MAX DURATION - same hard timeout idea as Bucket
         //    Mode above, applied to the Step ladder.
         if(EnableBasketMaxBars && MaxBasketBars > 0 && g_StepFirstEntryBarTime > 0)
         {
            int stepBarsOpen = iBarShift(_Symbol, MaxBasketBarsTimeframe, g_StepFirstEntryBarTime, false);
            if(stepBarsOpen >= MaxBasketBars)
            {
               FlattenAll();
               g_StepLastEntryPrice   = 0;
               g_StepLastEntryBarTime = 0;
               g_StepLastEntryIsBuy   = (StepStartDirection == Step_Buy_First);
               g_StepNextLotSize      = 0;
               g_StepFirstEntryPrice  = 0;
               g_StepFirstEntryBarTime = 0;
               g_StepPeakProfit       = 0;
               g_StepProfitLockArmed  = false;
               g_StepConsecSameDir = 0;   // v36
               UpdateDashboard();
               return;
            }
         }
      }
      else
      {
         g_StepBasketTarget     = 0;
         g_StepBasketProfit     = 0;
         g_StepLastEntryPrice   = 0;
         g_StepLastEntryBarTime = 0;
         g_StepNextLotSize      = 0;
         g_StepFirstEntryPrice  = 0;   // NEW: no positions left - clear ladder cap origin
         g_StepFirstEntryBarTime = 0;
         g_StepPeakProfit       = 0;
         g_StepProfitLockArmed  = false;
         g_StepConsecSameDir = 0;   // v36
      }
   }

   //--- v3: MOMENTUM TRADE MODE GATE.
   if(!MomentumGateOpen)
   {
      //--- FIX: the gate only controls placing NEW/PENDING orders. Trailing-stop
      //    management for positions that are ALREADY open must keep running
      //    regardless of gate state - otherwise Trade_HighOnly (or any mode
      //    whose gate closes mid-window) leaves live trades un-trailed the
      //    moment momentum drops from HIGH to MODERATE/LOW, until it climbs
      //    back up again. Previously this branch returned before TrialStop()
      //    was ever reached.
      if(ShouldRunTrailingStop()) TrialStop();   // v38: SL Mode always, Bucket/Step Mode when EnableGridTrailingSL is on
      CancelPendingOrders();

      //--- v24: DEBUG - the gate blocks ALL new entries (buy AND sell, first AND
      //    add) regardless of profit-candles/trend - this is the single most
      //    common reason an expected add "doesn't happen" with no other clue why.
      if(EAMode == Bucket_Mode)
      {
         datetime curBar = iTime(_Symbol, PERIOD_CURRENT, 0);
         if(curBar != g_LastBuyDebugBar)
         {
            g_LastBuyDebugBar = curBar;
            Print("[BucketDebug] Momentum gate CLOSED - no new Bucket Mode entries allowed this bar. Score=",
                  DoubleToString(MomentumScore,1), " (Low=", MomentumLowScore, " High=", MomentumHighScore, ")");
         }
      }

      UpdateDashboard();
      return;
   }

   int CurrentTime = (int)TimeCurrent();
   int PendingBuyCount = 0;
   int PendingSellCount = 0;
   int OpenBuyCount = 0;
   int OpenSellCount = 0;
   int TotalSellCount = 0;
   int TotalBuyCount = 0;

   double OrderLossValue = 0;
   double OrderTakeProfitValue = 0;
   double OrderOpenPriceValue = 0;
   double NewOrderTakeProfit = 0;
   double BuyOrdersLotSum = 0;
   double BuyOrdersPriceSum = 0;
   double SellOrdersPriceSum = 0;
   double SellOrdersLotSum = 0;
   double AverageBuyPrice = 0;
   double AverageSellPrice = 0;
   double LowestBuyPrice = 99999;
   double HighestSellPrice = 0;

   TickCounter++;

   if (PriceToPipRatio == 0) {
      HistorySelect(0, TimeCurrent());

      for (int i = HistoryDealsTotal() - 1; i >= 0; i--) {
         ulong ticket = HistoryDealGetTicket(i);
         if (ticket == 0) continue;

         if (HistoryDealGetString(ticket, DEAL_SYMBOL) != _Symbol) continue;
         if (HistoryDealGetDouble(ticket, DEAL_PROFIT) == 0) continue;
         if (HistoryDealGetInteger(ticket, DEAL_ENTRY) != DEAL_ENTRY_OUT) continue;

         ulong posID = HistoryDealGetInteger(ticket, DEAL_POSITION_ID);
         if (posID == 0) continue;

         if (HistoryDealSelect(posID)) {
            double entryPrice = HistoryDealGetDouble(posID, DEAL_PRICE);
            double exitPrice = HistoryDealGetDouble(ticket, DEAL_PRICE);
            double profit = HistoryDealGetDouble(ticket, DEAL_PROFIT);
            double commission = HistoryDealGetDouble(ticket, DEAL_COMMISSION);

            if (exitPrice != entryPrice) {
               PriceToPipRatio = fabs(profit / (exitPrice - entryPrice));
               CommissionPerPip = -commission / PriceToPipRatio;
               break;
            }
         }
      }
   }

   double Ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double Bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);

   double newSpread = NormalizeDouble(Ask - Bid, _Digits);
   ArrayCopy(SpreadHistoryArray, SpreadHistoryArray, 0, 1, SpreadArraySize - 1);
   SpreadHistoryArray[SpreadArraySize - 1] = newSpread;

   double sum = 0;
   for (int i = 0; i < SpreadArraySize; i++) {
      sum += SpreadHistoryArray[i];
   }

   CurrentSpread = sum / SpreadArraySize;

   AverageSpread = MathMax(SpreadMultiplier * _Point, CurrentSpread + CommissionPerPip);

   AdjustedOrderDistance = MathMax(AverageSpread * Delta, MinStopDistance);
   MinOrderModification = MathMax(AverageSpread * MinOrderDistance, MinFreezeDistance);

   TrailingStopActive = AverageSpread * MaxTrailing;
   TrailingStopMax = AverageSpread * MaxTrailingLimit;
   BaseTrailingStop = AverageSpread * SpreadMultiplier;
   MaxOrderPlacementDistance = AverageSpread * MaxDistance;
   OrderPlacementStep = MinOrderModification / OrderModificationFactor;
   CalculatedStopLoss = MathMax(AverageSpread * Stbp, MinStopDistance);

   for (int i = PositionsTotal() - 1; i >= 0; i--) {
      if (posinfo.SelectByIndex(i) &&
          posinfo.Symbol() == _Symbol &&
          posinfo.Magic() == InpMagic) {

         double price = posinfo.PriceOpen();
         double lots = posinfo.Volume();
         double sl = posinfo.StopLoss();

         if (posinfo.PositionType() == POSITION_TYPE_BUY) {
            OpenBuyCount++;
            if (sl == 0 || (sl > 0 && sl < price)) TotalBuyCount++;
            CurrentBuySL = sl;
            BuyOrdersPriceSum += price * lots;
            BuyOrdersLotSum += lots;
            if (price < LowestBuyPrice) LowestBuyPrice = price;
         }
         else if (posinfo.PositionType() == POSITION_TYPE_SELL) {
            OpenSellCount++;
            if (sl == 0 || (sl > 0 && sl > price)) TotalSellCount++;
            CurrentSellSL = sl;
            SellOrdersPriceSum += price * lots;
            SellOrdersLotSum += lots;
            if (price > HighestSellPrice) HighestSellPrice = price;
         }
      }
   }

   g_OpenBuyCount     = OpenBuyCount;
   g_OpenSellCount    = OpenSellCount;
   bool oppositeLockBuy  = (BlockOppositeSide && OpenSellCount >= MinLockTrades);
   bool oppositeLockSell = (BlockOppositeSide && OpenBuyCount  >= MinLockTrades);
   g_OppositeLockBuy  = oppositeLockBuy;
   g_OppositeLockSell = oppositeLockSell;

   for (int i = OrdersTotal() - 1; i >= 0; i--) {
      if (ordinfo.SelectByIndex(i) &&
          ordinfo.Symbol() == _Symbol &&
          ordinfo.Magic() == InpMagic) {

         if (ordinfo.OrderType() == ORDER_TYPE_BUY_STOP) {
            PendingBuyCount++;
            TotalBuyCount++;
         }
         else if (ordinfo.OrderType() == ORDER_TYPE_SELL_STOP) {
            PendingSellCount++;
            TotalSellCount++;
         }
      }
   }

   if ((BuyOrdersLotSum > 0)) {
      AverageBuyPrice = NormalizeDouble((BuyOrdersPriceSum / BuyOrdersLotSum), _Digits);
   }

   if ((SellOrdersLotSum > 0)) {
      AverageSellPrice = NormalizeDouble((SellOrdersPriceSum / SellOrdersLotSum), _Digits);
   }

   MqlDateTime BrokerTime;
   TimeCurrent(BrokerTime);


   bool allowTradeWindow = IsTradingSession();
if(EnableTradingSessions)
   allowTradeWindow = allowTradeWindow && IsTradingSession();

   for (int i = OrdersTotal() - 1; i >= 0; i--) {
      if (!ordinfo.SelectByIndex(i)) continue;
      if (ordinfo.Symbol() != _Symbol || ordinfo.Magic() != InpMagic) continue;

      ulong ticket = ordinfo.Ticket();
      ENUM_ORDER_TYPE type = ordinfo.OrderType();
      double openPrice = ordinfo.PriceOpen();
      double sl = ordinfo.StopLoss();
      double tp = ordinfo.TakeProfit();
      double lots = ordinfo.VolumeCurrent();

      if (type == ORDER_TYPE_BUY_STOP) {
         bool allowTrade = allowTradeWindow;

         if (AverageSpread > MaxAllowedSpread || !allowTrade || oppositeLockBuy) {
            trade.OrderDelete(ticket);
            continue;
         }

         int timeDiff = (int)(CurrentTime - LastBuyOrderTime);

         bool needsModification = (timeDiff > Secs) ||
                                  (TickCounter % OrderCheckFrequency == 0 &&
                                   ((OpenBuyCount < 1 &&
                                     (openPrice - SymbolInfoDouble(_Symbol, SYMBOL_ASK)) < MinOrderModification) ||
                                    (openPrice - SymbolInfoDouble(_Symbol, SYMBOL_ASK)) < OrderPlacementStep ||
                                    (openPrice - SymbolInfoDouble(_Symbol, SYMBOL_ASK)) > MaxOrderPlacementDistance));

         if (needsModification) {
            double distance = AdjustedOrderDistance;
            if (OpenBuyCount > 0) distance /= OrderModificationFactor;
            distance = MathMax(distance, MinStopDistance);

            double modifiedPrice = NormalizeDouble(SymbolInfoDouble(_Symbol, SYMBOL_ASK) + distance, _Digits);
            double modifiedSL = 0;
            if(EAMode == SL_Mode)
               modifiedSL = (OpenBuyCount > 0)? CurrentBuySL : NormalizeDouble(modifiedPrice - CalculatedStopLoss, _Digits);

            if ((OpenBuyCount == 0 || modifiedPrice > AverageBuyPrice) &&
                modifiedPrice != openPrice &&
                (openPrice - SymbolInfoDouble(_Symbol, SYMBOL_ASK)) > MinFreezeDistance) {
               trade.OrderModify(ticket, modifiedPrice, modifiedSL, tp, 0, 0);
               LastBuyOrderTime = CurrentTime;
            }
         }
      }
      else if (type == ORDER_TYPE_SELL_STOP) {
         bool allowTrade = allowTradeWindow;

         if (AverageSpread > MaxAllowedSpread || !allowTrade || oppositeLockSell) {
            trade.OrderDelete(ticket);
            continue;
         }

         int timeDiff = (int)(CurrentTime - LastSellOrderTime);
         bool needsModification =
             (timeDiff > Secs) ||
             (TickCounter % OrderCheckFrequency == 0 &&
             ((OpenSellCount < 1 &&
               (SymbolInfoDouble(_Symbol, SYMBOL_BID) - openPrice) < MinOrderModification) ||
              (SymbolInfoDouble(_Symbol, SYMBOL_BID) - openPrice) < OrderPlacementStep ||
              (SymbolInfoDouble(_Symbol, SYMBOL_BID) - openPrice) > MaxOrderPlacementDistance));

         if (needsModification) {
            double distance = AdjustedOrderDistance;
            if (OpenSellCount > 0)
               distance /= OrderModificationFactor;
            distance = MathMax(distance, MinStopDistance);

            double modifiedPrice =
                NormalizeDouble(SymbolInfoDouble(_Symbol, SYMBOL_BID) - distance, _Digits);

            double modifiedSL = 0;
            if(EAMode == SL_Mode)
               modifiedSL = (OpenSellCount > 0) ? CurrentSellSL : NormalizeDouble(modifiedPrice + CalculatedStopLoss, _Digits);
            if ((OpenSellCount == 0 || modifiedPrice < AverageSellPrice) &&
                modifiedPrice != openPrice &&
                (SymbolInfoDouble(_Symbol, SYMBOL_BID) - openPrice) > MinFreezeDistance) {
               trade.OrderModify(ticket, modifiedPrice, modifiedSL, tp, 0, 0);
               LastSellOrderTime = CurrentTime;
            }
         }
      }
   }

   if(ShouldRunTrailingStop()) TrialStop();   // v38

   //======================= BUY ENTRY =======================
   if(EAMode == SL_Mode)
   {
      if ((OrderModificationFactor > 1 && TotalBuyCount < 1) || OpenBuyCount < 1)
      {
         if (PendingBuyCount < 1 && !oppositeLockBuy && (OpenBuyCount + OpenSellCount) < MaxOpenTrades)
         {
            bool spreadOK = (AverageSpread <= MaxAllowedSpread);
            bool timeOK = allowTradeWindow;

            if (spreadOK && timeOK && (CurrentTime - LastOrderTime) > MinOrderInterval && EAModeFlag == 0)
            {
               if (LotType == 0) {
                  CalculatedLotSize = calcLots(CalculatedStopLoss);
                  CalculatedLotSize = MathCeil(CalculatedLotSize / LotStepSize) * LotStepSize;
                  CalculatedLotSize = MathMax(CalculatedLotSize, MinLotSize);
                  CalculatedLotSize = MathMin(CalculatedLotSize, MaxLotSize);
               }
               else if (LotType > 0) {
                  CalculatedLotSize = calcLots(CalculatedStopLoss);
               }

               double marginRequired = 0.0;
               double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
               if(OrderCalcMargin(ORDER_TYPE_BUY_STOP, _Symbol, CalculatedLotSize, ask, marginRequired) &&
                  AccountInfoDouble(ACCOUNT_MARGIN_FREE) > marginRequired)
               {
                  double orderDist = MathMax(MathMax(AdjustedOrderDistance, MinFreezeDistance), MinStopDistance);
                  double orderPrice = NormalizeDouble(ask + orderDist, _Digits);
                  double orderSL = (OpenBuyCount > 0) ? CurrentBuySL : NormalizeDouble(orderPrice - CalculatedStopLoss, _Digits);
                  if(trade.OrderOpen(_Symbol, ORDER_TYPE_BUY_STOP, CalculatedLotSize, orderPrice,
                                     ask, orderSL, NewOrderTakeProfit,0,0, OrderCommentText))
                  {
                     LastBuyOrderTime = (int)TimeCurrent();
                     LastOrderTime = (int)TimeCurrent();
                  }
               }
            }
         }
      }
   }
   else if(EAMode == Bucket_Mode)
   {
      //--- v17: BUCKET MODE STRADDLE ENTRY
      //    First entry: both BUY and SELL open together as market orders the
      //    moment neither side has a position yet (see matching SELL block
      //    below - both fire in the same tick since the position counts read
      //    here are the counts from the start of this tick, before either
      //    order executes). This is as close to "same price" as a real BUY
      //    and SELL can get - a market buy fills at Ask, a market sell fills
      //    at Bid, separated only by the live spread.
      //--- v21 REDESIGN: single shared reference, not two independent trackers.
      //    The reference for the NEXT trade (either direction) is whichever
      //    trade - buy or sell - was opened most recently, full stop. Straddle
      //    entry sets the reference to the mid price. From there: candles
      //    opening ABOVE the reference add a BUY, candles opening BELOW it
      //    add a SELL (handled in the matching block below) - each add then
      //    becomes the new reference for whatever comes next, so the basket
      //    follows price back and forth rather than each side pyramiding in
      //    isolation.
      //--- v21: BlockOppositeSide/MinLockTrades (the position-count lock) is
      //    SKIPPED entirely in Bucket Mode. Its whole job is blocking the
      //    opposite side once one side gets ahead - which directly contradicts
      //    this design, where a reversal is SUPPOSED to trigger the opposite-
      //    side add. It still applies normally in SL Mode.
      bool allowFirst = (OpenBuyCount == 0 && OpenSellCount == 0 && (OpenBuyCount + OpenSellCount + 2) <= MaxOpenTrades);

      bool bucketSeatsOK = ((OpenBuyCount + OpenSellCount + 1) <= MaxOpenTrades);

      //--- v31: TREND BASED GRID SCALING - once TrendGridConfirmCandles
      //    candles have closed since the last trade (g_LastEntryBarTime,
      //    the SECOND trade of the straddle for the very first add, then
      //    whichever trade was most recently added), require the trend
      //    gate to confirm an uptrend before adding a BUY.
      bool allowAdd    = (OpenBuyCount + OpenSellCount > 0 && bucketSeatsOK &&
                          TrendGridScaleReady(true, g_LastEntryBarTime) &&
                          SameDirectionCapOK(true, g_BucketLastAddWasBuy, g_BucketConsecSameDir) &&
                          (CurrentTime - LastOrderTime) > MinOrderInterval);
      bool spreadOK = (AverageSpread <= MaxAllowedSpread);
      bool timeOK = allowTradeWindow;

      //--- v24: DEBUG - fires once per new bar whenever a BUY add looked possible
      //    (2+ trades already open) but didn't go through, breaking out exactly
      //    which condition said no.
      if(!allowFirst && !allowAdd && (OpenBuyCount + OpenSellCount) >= 2)
      {
         datetime curBar = iTime(_Symbol, PERIOD_CURRENT, 0);
         if(curBar != g_LastBuyDebugBar)
         {
            g_LastBuyDebugBar = curBar;
            bool sc = TrendGridScaleReady(true, g_LastEntryBarTime);
            Print("[BucketDebug][BUY] add blocked | TrendGridOK=", sc,
                  " | SameDirCapOK=", SameDirectionCapOK(true, g_BucketLastAddWasBuy, g_BucketConsecSameDir),
                  " | ConsecSameDir=", g_BucketConsecSameDir,
                  " | IntervalOK=", ((CurrentTime - LastOrderTime) > MinOrderInterval),
                  " | SeatsUsed=", (OpenBuyCount + OpenSellCount), "/", MaxOpenTrades, " (SeatsOK=", bucketSeatsOK, ")",
                  " | SpreadOK=", spreadOK, " | SessionOK=", timeOK,
                  " | RefPrice=", DoubleToString(g_LastEntryPrice, _Digits),
                  " | FirstEntryPrice=", DoubleToString(g_BucketFirstEntryPrice, _Digits),
                  " | RefBarsAgo=", iBarShift(_Symbol, PERIOD_CURRENT, g_LastEntryBarTime, false));
         }
      }

      if((allowFirst || allowAdd) && spreadOK && timeOK && EAModeFlag == 0)
      {
         if (LotType == 0) {
            CalculatedLotSize = calcLots(NominalRiskPoints);
            CalculatedLotSize = MathCeil(CalculatedLotSize / LotStepSize) * LotStepSize;
            CalculatedLotSize = MathMax(CalculatedLotSize, MinLotSize);
            CalculatedLotSize = MathMin(CalculatedLotSize, MaxLotSize);
         }
         else if (LotType > 0) {
            CalculatedLotSize = calcLots(NominalRiskPoints);
         }

         //--- NEW: from the 3rd trade onward (2 already open before this
         //    one), scale the lot up by BucketScaleLotMultiplier, compounding
         //    per additional trade - trades 1 & 2 (the initial straddle)
         //    always stay at the base calculated lot.
         int bucketOpenBefore = OpenBuyCount + OpenSellCount;
         bool bucketLotFrozen = IsLotFreezeActive(g_BasketProfit);   // v36
         if(bucketOpenBefore >= 2 && BucketScaleLotMultiplier > 0 && !bucketLotFrozen)
         {
            CalculatedLotSize = CalculatedLotSize * MathPow(BucketScaleLotMultiplier, bucketOpenBefore - 1);
            CalculatedLotSize = MathCeil(CalculatedLotSize / LotStepSize) * LotStepSize;
            CalculatedLotSize = MathMax(CalculatedLotSize, MinLotSize);
            CalculatedLotSize = MathMin(CalculatedLotSize, MaxLotSize);
         }

         double marginRequired = 0.0;
         double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
         if(OrderCalcMargin(ORDER_TYPE_BUY, _Symbol, CalculatedLotSize, ask, marginRequired) &&
            AccountInfoDouble(ACCOUNT_MARGIN_FREE) > marginRequired)
         {
            double gridSL = GridStopLossPrice(true, ask);
            if(trade.Buy(CalculatedLotSize, _Symbol, 0, gridSL, 0, OrderCommentText))
            {
               LastBuyOrderTime = (int)TimeCurrent();
               LastOrderTime = (int)TimeCurrent();
               g_LastEntryPrice   = ask;
               g_LastEntryBarTime = iTime(_Symbol, PERIOD_CURRENT, 0);
               g_BucketConsecSameDir = (g_BucketLastAddWasBuy) ? g_BucketConsecSameDir + 1 : 1;   // v36
               g_BucketLastAddWasBuy = true;   // v36
               if(g_BucketFirstEntryPrice <= 0)
               {
                  g_BucketFirstEntryPrice   = ask;   // NEW: capture ladder cap origin on the very first fill
                  g_BucketFirstEntryBarTime = iTime(_Symbol, MaxBasketBarsTimeframe, 0);   // NEW: basket max-duration timer origin
               }
            }
         }
      }
   }

   //======================= SELL ENTRY =======================
   if(EAMode == SL_Mode)
   {
      if ((OrderModificationFactor > 1 && TotalSellCount < 1) || OpenSellCount < 1)
      {
         if (PendingSellCount < 1 && !oppositeLockSell && (OpenBuyCount + OpenSellCount) < MaxOpenTrades)
         {
            bool spreadOK = (AverageSpread <= MaxAllowedSpread);
            bool timeOK = allowTradeWindow;

            if (spreadOK && timeOK && (CurrentTime - LastOrderTime) > MinOrderInterval && EAModeFlag == 0)
            {
               if (LotType == 0) {
                  CalculatedLotSize = calcLots(CalculatedStopLoss);
                  CalculatedLotSize = MathCeil(CalculatedLotSize / LotStepSize) * LotStepSize;
                  CalculatedLotSize = MathMax(CalculatedLotSize, MinLotSize);
                  CalculatedLotSize = MathMin(CalculatedLotSize, MaxLotSize);
               }
               else if (LotType > 0) {
                  CalculatedLotSize = calcLots(CalculatedStopLoss);
               }
               double marginRequired = 0.0;
               double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
               if(OrderCalcMargin(ORDER_TYPE_SELL_STOP, _Symbol, CalculatedLotSize, bid, marginRequired) &&
                  AccountInfoDouble(ACCOUNT_MARGIN_FREE) > marginRequired)
               {
                  double orderDist = MathMax(MathMax(AdjustedOrderDistance, MinFreezeDistance), MinStopDistance);
                  double orderPrice = NormalizeDouble(bid - orderDist, _Digits);
                  double orderSL = (OpenSellCount > 0) ? CurrentSellSL : NormalizeDouble(orderPrice + CalculatedStopLoss, _Digits);
                  if(trade.OrderOpen(_Symbol, ORDER_TYPE_SELL_STOP, CalculatedLotSize, orderPrice,
                                     bid, orderSL, NewOrderTakeProfit, 0, 0, OrderCommentText))
                  {
                     LastSellOrderTime = (int)TimeCurrent();
                     LastOrderTime = (int)TimeCurrent();
                  }
               }
            }
         }
      }
   }
   else if(EAMode == Bucket_Mode)
   {
      bool allowFirst = (OpenBuyCount == 0 && OpenSellCount == 0 && (OpenBuyCount + OpenSellCount + 2) <= MaxOpenTrades);

      bool bucketSeatsOK = ((OpenBuyCount + OpenSellCount + 1) <= MaxOpenTrades);

      //--- v31: TREND BASED GRID SCALING - mirror of the BUY side above,
      //    requires the trend gate to confirm a downtrend before adding a SELL.
      bool allowAdd    = (OpenBuyCount + OpenSellCount > 0 && bucketSeatsOK &&
                          TrendGridScaleReady(false, g_LastEntryBarTime) &&
                          SameDirectionCapOK(false, g_BucketLastAddWasBuy, g_BucketConsecSameDir) &&
                          (CurrentTime - LastOrderTime) > MinOrderInterval);
      bool spreadOK = (AverageSpread <= MaxAllowedSpread);
      bool timeOK = allowTradeWindow;

      //--- v24: DEBUG - fires once per new bar whenever a SELL add looked possible
      //    (2+ trades already open) but didn't go through, breaking out exactly
      //    which condition said no.
      if(!allowFirst && !allowAdd && (OpenBuyCount + OpenSellCount) >= 2)
      {
         datetime curBar = iTime(_Symbol, PERIOD_CURRENT, 0);
         if(curBar != g_LastSellDebugBar)
         {
            g_LastSellDebugBar = curBar;
            bool sc = TrendGridScaleReady(false, g_LastEntryBarTime);
            Print("[BucketDebug][SELL] add blocked | TrendGridOK=", sc,
                  " | SameDirCapOK=", SameDirectionCapOK(false, g_BucketLastAddWasBuy, g_BucketConsecSameDir),
                  " | ConsecSameDir=", g_BucketConsecSameDir,
                  " | IntervalOK=", ((CurrentTime - LastOrderTime) > MinOrderInterval),
                  " | SeatsUsed=", (OpenBuyCount + OpenSellCount), "/", MaxOpenTrades, " (SeatsOK=", bucketSeatsOK, ")",
                  " | SpreadOK=", spreadOK, " | SessionOK=", timeOK,
                  " | RefPrice=", DoubleToString(g_LastEntryPrice, _Digits),
                  " | FirstEntryPrice=", DoubleToString(g_BucketFirstEntryPrice, _Digits),
                  " | RefBarsAgo=", iBarShift(_Symbol, PERIOD_CURRENT, g_LastEntryBarTime, false));
         }
      }

      if((allowFirst || allowAdd) && spreadOK && timeOK && EAModeFlag == 0)
      {
         if (LotType == 0) {
            CalculatedLotSize = calcLots(NominalRiskPoints);
            CalculatedLotSize = MathCeil(CalculatedLotSize / LotStepSize) * LotStepSize;
            CalculatedLotSize = MathMax(CalculatedLotSize, MinLotSize);
            CalculatedLotSize = MathMin(CalculatedLotSize, MaxLotSize);
         }
         else if (LotType > 0) {
            CalculatedLotSize = calcLots(NominalRiskPoints);
         }

         //--- NEW: same lot multiplier from the 3rd trade onward as the BUY
         //    side above - keeps both legs of the basket scaling identically.
         int bucketOpenBefore = OpenBuyCount + OpenSellCount;
         bool bucketLotFrozen = IsLotFreezeActive(g_BasketProfit);   // v36
         if(bucketOpenBefore >= 2 && BucketScaleLotMultiplier > 0 && !bucketLotFrozen)
         {
            CalculatedLotSize = CalculatedLotSize * MathPow(BucketScaleLotMultiplier, bucketOpenBefore - 1);
            CalculatedLotSize = MathCeil(CalculatedLotSize / LotStepSize) * LotStepSize;
            CalculatedLotSize = MathMax(CalculatedLotSize, MinLotSize);
            CalculatedLotSize = MathMin(CalculatedLotSize, MaxLotSize);
         }

         double marginRequired = 0.0;
         double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
         if(OrderCalcMargin(ORDER_TYPE_SELL, _Symbol, CalculatedLotSize, bid, marginRequired) &&
            AccountInfoDouble(ACCOUNT_MARGIN_FREE) > marginRequired)
         {
            double gridSL = GridStopLossPrice(false, bid);
            if(trade.Sell(CalculatedLotSize, _Symbol, 0, gridSL, 0, OrderCommentText))
            {
               LastSellOrderTime = (int)TimeCurrent();
               LastOrderTime = (int)TimeCurrent();
               g_LastEntryPrice   = bid;
               g_LastEntryBarTime = iTime(_Symbol, PERIOD_CURRENT, 0);
               g_BucketConsecSameDir = (!g_BucketLastAddWasBuy) ? g_BucketConsecSameDir + 1 : 1;   // v36
               g_BucketLastAddWasBuy = false;   // v36
               if(g_BucketFirstEntryPrice <= 0)
               {
                  g_BucketFirstEntryPrice   = bid;   // NEW: capture ladder cap origin on the very first fill
                  g_BucketFirstEntryBarTime = iTime(_Symbol, MaxBasketBarsTimeframe, 0);   // NEW: basket max-duration timer origin
               }
            }
         }
      }
   }

   //======================= STEP SCALE ENTRY (Third Mode) =======================
   //--- v26: single self-contained block instead of split BUY/SELL sections,
   //    since which side trades next depends on state (always the opposite of
   //    the most recently opened trade), not a fixed per-section side.
   //--- v29: the FIRST trade's direction can now come from a trend filter
   //    (UseTrendFilterFirstEntry) instead of always using StepStartDirection.
   //    Nothing else in this block (the scale-in / opposite-side logic) changed.
   if(EAMode == Step_Scale_Mode)
   {
      int  stepOpenCount = OpenBuyCount + OpenSellCount;
      bool spreadOK       = (AverageSpread <= MaxAllowedSpread);
      bool timeOK         = allowTradeWindow;
      bool intervalOK     = (CurrentTime - LastOrderTime) > MinOrderInterval;

      if(stepOpenCount == 0)
      {
         //--- FIRST TRADE: a single position. Direction comes from the trend
         //    filter when enabled, otherwise from the fixed StepStartDirection.
         if(spreadOK && timeOK && intervalOK && EAModeFlag == 0)
         {
            bool firstIsBuy = UseTrendFilterFirstEntry
                              ? GetStepFirstEntryTrendIsBuy()
                              : (StepStartDirection == Step_Buy_First);

            if (LotType == 0) {
               CalculatedLotSize = calcLots(NominalRiskPoints);
               CalculatedLotSize = MathCeil(CalculatedLotSize / LotStepSize) * LotStepSize;
               CalculatedLotSize = MathMax(CalculatedLotSize, MinLotSize);
               CalculatedLotSize = MathMin(CalculatedLotSize, MaxLotSize);
            }
            else if (LotType > 0) {
               CalculatedLotSize = calcLots(NominalRiskPoints);
            }

            double marginRequired = 0.0;
            bool   opened    = false;
            double fillPrice = 0;

            if(firstIsBuy)
            {
               double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
               if(OrderCalcMargin(ORDER_TYPE_BUY, _Symbol, CalculatedLotSize, ask, marginRequired) &&
                  AccountInfoDouble(ACCOUNT_MARGIN_FREE) > marginRequired)
               {
                  double gridSL = GridStopLossPrice(true, ask);
                  if(trade.Buy(CalculatedLotSize, _Symbol, 0, gridSL, 0, OrderCommentText))
                  {
                     opened = true; fillPrice = ask;
                     LastBuyOrderTime = (int)TimeCurrent();
                  }
               }
            }
            else
            {
               double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
               if(OrderCalcMargin(ORDER_TYPE_SELL, _Symbol, CalculatedLotSize, bid, marginRequired) &&
                  AccountInfoDouble(ACCOUNT_MARGIN_FREE) > marginRequired)
               {
                  double gridSL = GridStopLossPrice(false, bid);
                  if(trade.Sell(CalculatedLotSize, _Symbol, 0, gridSL, 0, OrderCommentText))
                  {
                     opened = true; fillPrice = bid;
                     LastSellOrderTime = (int)TimeCurrent();
                  }
               }
            }

            if(opened)
            {
               LastOrderTime          = (int)TimeCurrent();
               g_StepLastEntryPrice   = fillPrice;
               g_StepLastEntryBarTime = iTime(_Symbol, PERIOD_CURRENT, 0);
               g_StepLastEntryIsBuy   = firstIsBuy;
               g_StepConsecSameDir    = 1;   // v36: first trade in this direction
               g_StepNextLotSize      = NormalizeDouble(CalculatedLotSize * StepScaleLotMultiplier, 2);
               g_StepFirstEntryPrice  = fillPrice;   // NEW: capture ladder cap origin on the very first trade
               g_StepFirstEntryBarTime = iTime(_Symbol, MaxBasketBarsTimeframe, 0);   // NEW: basket max-duration timer origin
            }
         }
      }
      else if(stepOpenCount < MaxOpenTrades)
      {
         //--- v31: TREND BASED GRID SCALING - once TrendGridConfirmCandles
         //    candles have closed since the last trade (the FIRST trade for
         //    the very first scale-in, then whichever trade was most recently
         //    added), the next add fires in WHATEVER direction the trend gate
         //    confirms - no longer forced onto the opposite side.
         bool nextIsBuy    = true;   // set by whichever side the trend gate confirms below
         bool scaleReady   = false;
         if(TrendGridScaleReady(true, g_StepLastEntryBarTime))       { nextIsBuy = true;  scaleReady = true; }
         else if(TrendGridScaleReady(false, g_StepLastEntryBarTime)) { nextIsBuy = false; scaleReady = true; }

         //--- v36: SAME-DIRECTION CAP - if this add would exceed
         //    MaxSameDirectionAdds consecutive adds in one direction, hold
         //    off until the trend genuinely flips (the opposite side will
         //    naturally start passing TrendGridScaleReady once it does).
         int stepProspectiveConsec = (nextIsBuy == g_StepLastEntryIsBuy) ? g_StepConsecSameDir + 1 : 1;
         bool stepSameDirCapOK = SameDirectionCapOK(nextIsBuy, g_StepLastEntryIsBuy, g_StepConsecSameDir);
         if(scaleReady && !stepSameDirCapOK) scaleReady = false;

         //--- v26: DEBUG - once per new bar, shows why the scale-in add hasn't fired.
         if(!scaleReady)
         {
            datetime curBar = iTime(_Symbol, PERIOD_CURRENT, 0);
            if(curBar != g_LastStepDebugBar)
            {
               g_LastStepDebugBar = curBar;
               Print("[StepScaleDebug] add blocked | TrendGridOK=", scaleReady,
                     " | SameDirCapOK=", stepSameDirCapOK, " | ConsecSameDir=", g_StepConsecSameDir,
                     " | IntervalOK=", intervalOK, " | SeatsUsed=", stepOpenCount, "/", MaxOpenTrades,
                     " | SpreadOK=", spreadOK, " | SessionOK=", timeOK,
                     " | RefPrice=", DoubleToString(g_StepLastEntryPrice, _Digits),
                     " | FirstEntryPrice=", DoubleToString(g_StepFirstEntryPrice, _Digits),
                     " | RefBarsAgo=", iBarShift(_Symbol, PERIOD_CURRENT, g_StepLastEntryBarTime, false));
            }
         }

         if(scaleReady && spreadOK && timeOK && intervalOK && EAModeFlag == 0)
         {
            bool   stepLotFrozen = IsLotFreezeActive(g_StepBasketProfit);   // v36
            double scaleLot  = (g_StepNextLotSize > 0 && !stepLotFrozen) ? g_StepNextLotSize : CalculatedLotSize;
            scaleLot = MathCeil(scaleLot / LotStepSize) * LotStepSize;
            scaleLot = MathMax(scaleLot, MinLotSize);
            scaleLot = MathMin(scaleLot, MaxLotSize);

            double marginRequired = 0.0;
            bool   opened    = false;
            double fillPrice = 0;

            if(nextIsBuy)
            {
               double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
               if(OrderCalcMargin(ORDER_TYPE_BUY, _Symbol, scaleLot, ask, marginRequired) &&
                  AccountInfoDouble(ACCOUNT_MARGIN_FREE) > marginRequired)
               {
                  double gridSL = GridStopLossPrice(true, ask);
                  if(trade.Buy(scaleLot, _Symbol, 0, gridSL, 0, OrderCommentText))
                  {
                     opened = true; fillPrice = ask;
                     LastBuyOrderTime = (int)TimeCurrent();
                  }
               }
            }
            else
            {
               double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
               if(OrderCalcMargin(ORDER_TYPE_SELL, _Symbol, scaleLot, bid, marginRequired) &&
                  AccountInfoDouble(ACCOUNT_MARGIN_FREE) > marginRequired)
               {
                  double gridSL = GridStopLossPrice(false, bid);
                  if(trade.Sell(scaleLot, _Symbol, 0, gridSL, 0, OrderCommentText))
                  {
                     opened = true; fillPrice = bid;
                     LastSellOrderTime = (int)TimeCurrent();
                  }
               }
            }

            if(opened)
            {
               LastOrderTime          = (int)TimeCurrent();
               g_StepLastEntryPrice   = fillPrice;
               g_StepLastEntryBarTime = iTime(_Symbol, PERIOD_CURRENT, 0);
               g_StepLastEntryIsBuy   = nextIsBuy;
               g_StepConsecSameDir    = stepProspectiveConsec;   // v36
               g_StepNextLotSize      = stepLotFrozen ? scaleLot : NormalizeDouble(scaleLot * StepScaleLotMultiplier, 2);
            }
         }
      }
   }

   UpdateDashboard();
}


//======================================================================
// v8: CANDLE TRAIL CONFIRMATION
// For TrailType == Previous_Candle only: require the last ConfirmCandles
// completed candles to have OPENED beyond the entry price (above it for a
// BUY, below it for a SELL) before the previous-candle trail is allowed to
// engage. This keeps the trail from kicking in on a shallow/unconfirmed
// move and only arms it once price is genuinely running in profit.
//======================================================================
bool IsCandleTrailConfirmed(bool isBuy, double entryPrice)
{
   int n = ConfirmCandles;
   if(n < 1) return true;

   for(int i = 1; i <= n; i++)
   {
      double o = iOpen(_Symbol, PERIOD_CURRENT, i);
      if(isBuy)
      {
         if(o <= entryPrice) return false;
      }
      else
      {
         if(o >= entryPrice) return false;
      }
   }
   return true;
}

//======================================================================
// v32: GRID PER-TRADE STOP LOSS - shared helper for Bucket & Step Modes.
// Returns 0 (no SL) if the feature is off or the configured distance is
// invalid, so callers can pass the result straight into trade.Buy()/
// trade.Sell() without an extra branch. The distance is widened up to
// the broker's own minimum stop level (MinStopDistance) when needed, so
// this never gets silently rejected for sitting too close to price.
//======================================================================
//======================================================================
// v36: SCALING SAFETY CAPS - shared helpers for Bucket & Step Modes.
//======================================================================
double GetBasketLossThreshold()
{
   if(BasketLossMode == BasketLoss_PercentBalance)
      return AccountInfoDouble(ACCOUNT_BALANCE) * (MaxBasketLossPercent / 100.0);
   return MaxBasketLoss;
}

bool IsLotFreezeActive(double basketFloatingPL)
{
   if(!EnableLotFreezeOnDrawdown) return false;
   double threshold = AccountInfoDouble(ACCOUNT_BALANCE) * (LotFreezeDrawdownPercent / 100.0);
   return (basketFloatingPL <= -threshold);
}

//--- returns true if adding in wantBuy direction would still be within the
//    consecutive-same-direction cap, given the last add's direction/count
bool SameDirectionCapOK(bool wantBuy, bool lastWasBuy, int consecCount)
{
   if(!EnableMaxSameDirectionAdds) return true;
   int prospective = (wantBuy == lastWasBuy) ? consecCount + 1 : 1;
   return (prospective <= MaxSameDirectionAdds);
}

//======================================================================
// v38: shared gate for whether TrialStop() should run this tick - always
// true for SL Mode (unchanged), and now also true for Bucket/Step Mode
// grid trades when EnableGridTrailingSL is on. TrialStop() itself is
// untouched - it already works off the TrailType/TslPoints/etc. inputs
// and the AverageSpread-derived distances that are computed every tick
// regardless of EAMode, and it already tolerates a starting StopLoss()
// of 0 (i.e. no GridStopLossPrice set), so no separate trailing logic
// was needed for grid trades - just letting it run for them.
//======================================================================
bool ShouldRunTrailingStop()
{
   if(EAMode == SL_Mode) return true;
   if((EAMode == Bucket_Mode || EAMode == Step_Scale_Mode) && EnableGridTrailingSL) return true;
   return false;
}

double GridStopLossPrice(bool isBuy, double entryPrice)
{
   if(!EnableGridStopLoss || GridStopLossPoints <= 0 || entryPrice <= 0) return 0;

   double dist = MathMax(GridStopLossPoints * _Point, MinStopDistance);
   return isBuy ? NormalizeDouble(entryPrice - dist, _Digits)
                : NormalizeDouble(entryPrice + dist, _Digits);
}

//======================================================================
// v35: COMBINED TREND DIRECTION (Bucket & Step Modes)
// Unlike v33/v34, this never returns "no decision". Four independent
// methods each cast one vote for BUY (+1) or SELL (-1): primary MA slope,
// secondary MA position, ADX+DI direction, and swing structure. The votes
// are summed and whichever side is ahead wins. On an exact tie (or if no
// indicator has enough data yet), price-vs-primary-MA breaks the tie, and
// if even that isn't available yet it defaults to BUY - so this function
// is mathematically guaranteed to return one side or the other, never
// neither. The only thing that can still delay a trade is the
// TrendGridConfirmCandles bar-count throttle in TrendGridScaleReady()
// below, which is a timing control, not a trend judgment.
//======================================================================
bool GetCombinedTrendDirection()
{
   int score = 0;

   //--- vote 1: primary MA slope (full weight if slope clears the threshold
   //    in that direction, still leans with price-vs-MA if the slope is weak
   //    - a weak lean is still a lean, not a reason to sit out)
   if(handleScaleTrendMA != INVALID_HANDLE)
   {
      int need = ScaleTrendSlopeBars + 1;
      double ma[];
      ArraySetAsSeries(ma, true);
      if(CopyBuffer(handleScaleTrendMA, MAIN_LINE, 1, need, ma) >= need)
      {
         double maNow    = ma[0];
         double maPast   = ma[ScaleTrendSlopeBars];
         double slope    = maNow - maPast;
         double price    = iClose(_Symbol, ScaleTrendTF, 1);
         double minSlope = ScaleTrendMinSlopePoints * _Point;

         if(price > maNow && slope >  minSlope)      score++;
         else if(price < maNow && slope < -minSlope) score--;
         else if(price > maNow)                      score++;
         else if(price < maNow)                      score--;
      }
   }

   //--- vote 2: secondary MA position
   if(handleScaleTrend2MA != INVALID_HANDLE)
   {
      double ma[];
      if(CopyBuffer(handleScaleTrend2MA, MAIN_LINE, 1, 1, ma) >= 1)
      {
         double price = iClose(_Symbol, ScaleTrendTF, 1);
         score += (price > ma[0]) ? 1 : -1;
      }
   }

   //--- vote 3: ADX + DI direction (only casts a vote once ADX confirms an
   //    actual trend exists - a flat/ranging ADX abstains rather than voting)
   if(handleScaleADX != INVALID_HANDLE)
   {
      double adxMain[], plusDI[], minusDI[];
      if(CopyBuffer(handleScaleADX, MAIN_LINE,    1, 1, adxMain) >= 1 &&
         CopyBuffer(handleScaleADX, PLUSDI_LINE,  1, 1, plusDI)  >= 1 &&
         CopyBuffer(handleScaleADX, MINUSDI_LINE, 1, 1, minusDI) >= 1 &&
         adxMain[0] >= ScaleADXMinLevel)
      {
         if(plusDI[0] > minusDI[0])       score++;
         else if(minusDI[0] > plusDI[0])  score--;
      }
   }

   //--- vote 4: swing structure (higher-high/higher-low vs lower-high/lower-low)
   int depth = MathMax(1, ScaleSwingDepth);
   double swingHighs[2]; int foundHighs = 0;
   double swingLows[2];  int foundLows  = 0;

   for(int i = depth + 1; i < ScaleSwingLookback && (foundHighs < 2 || foundLows < 2); i++)
   {
      double h = iHigh(_Symbol, PERIOD_CURRENT, i);
      double l = iLow(_Symbol, PERIOD_CURRENT, i);
      bool isHigh = true, isLow = true;

      for(int k = 1; k <= depth; k++)
      {
         if(iHigh(_Symbol, PERIOD_CURRENT, i - k) > h || iHigh(_Symbol, PERIOD_CURRENT, i + k) > h) isHigh = false;
         if(iLow(_Symbol,  PERIOD_CURRENT, i - k) < l || iLow(_Symbol,  PERIOD_CURRENT, i + k) < l) isLow  = false;
      }

      if(isHigh && foundHighs < 2) { swingHighs[foundHighs] = h; foundHighs++; }
      if(isLow  && foundLows  < 2) { swingLows[foundLows]   = l; foundLows++;  }
   }

   if(foundHighs >= 2 && foundLows >= 2)
   {
      if(swingHighs[0] > swingHighs[1] && swingLows[0] > swingLows[1])      score++;
      else if(swingHighs[0] < swingHighs[1] && swingLows[0] < swingLows[1]) score--;
   }

   //--- decision: majority wins; tie or no data yet falls back to
   //    price-vs-primary-MA, and if that's not even available yet, default
   //    to BUY so this function NEVER fails to return a side
   if(score > 0) return true;
   if(score < 0) return false;

   if(handleScaleTrendMA != INVALID_HANDLE)
   {
      double maTie[];
      if(CopyBuffer(handleScaleTrendMA, MAIN_LINE, 1, 1, maTie) >= 1)
         return (iClose(_Symbol, ScaleTrendTF, 1) >= maTie[0]);
   }

   return true;
}

//======================================================================
// v37: CLOSE ON TREND REVERSAL (Bucket & Step Modes)
// Checked once per new bar (not every tick - the combined direction only
// changes on a bar close anyway, since every vote reads shift-1 data).
// On the first check after EA start it just records the current direction
// as the baseline and takes no action - there's nothing to compare
// against yet. From then on, if the direction has flipped since the last
// check, every open leg matching the OLD direction gets closed; legs
// matching the NEW direction are left open since they already align with
// where TrendGridScaleReady will scale next.
//======================================================================
void ManageTrendReversalExit()
{
   if(!EnableCloseOnTrendReversal) return;
   if(EAMode != Bucket_Mode && EAMode != Step_Scale_Mode) return;

   datetime curBar = iTime(_Symbol, PERIOD_CURRENT, 0);
   if(curBar == g_LastTrendReversalCheckBar) return;
   g_LastTrendReversalCheckBar = curBar;

   bool currentTrendIsBuy = GetCombinedTrendDirection();

   if(!g_TrendReversalInit)
   {
      g_TrendReversalInit    = true;
      g_LastKnownTrendIsBuy  = currentTrendIsBuy;
      return;   // first run - just record the baseline
   }

   if(currentTrendIsBuy == g_LastKnownTrendIsBuy) return;   // no reversal this bar

   bool oldTrendWasBuy   = g_LastKnownTrendIsBuy;
   g_LastKnownTrendIsBuy = currentTrendIsBuy;   // update baseline regardless of what closes below

   int closedCount = 0;
   for(int i = PositionsTotal()-1; i >= 0; i--)
   {
      if(!posinfo.SelectByIndex(i)) continue;
      if(posinfo.Symbol() != _Symbol || posinfo.Magic() != InpMagic) continue;

      bool posIsBuy = (posinfo.PositionType() == POSITION_TYPE_BUY);
      if(posIsBuy == oldTrendWasBuy)   // this leg belongs to the direction that just reversed
      {
         if(trade.PositionClose(posinfo.Ticket())) closedCount++;
      }
   }

   if(closedCount > 0)
   {
      Print("[TrendReversal] Combined trend flipped ", (oldTrendWasBuy ? "BUY->SELL" : "SELL->BUY"),
            " - closed ", closedCount, " leg(s) aligned with the old direction.");
      UpdateDashboard();
   }
}

bool TrendGridScaleReady(bool wantBuy, datetime refBarTime)
{
   //--- the ONLY thing allowed to delay an add - a timing throttle, not a
   //    trend judgment
   if(TrendGridConfirmCandles > 0)
   {
      if(refBarTime <= 0) return false;   // no reference yet - don't add
      int barsElapsed = iBarShift(_Symbol, PERIOD_CURRENT, refBarTime, false);
      if(barsElapsed <= TrendGridConfirmCandles) return false;   // not enough genuinely NEW candles yet
   }

   //--- always resolves to exactly one side - see GetCombinedTrendDirection()
   return (wantBuy == GetCombinedTrendDirection());
}


double CalculateTrailingStop(double priceMove, double minDist, double activeDist, double baseDist, double maxDist)
{
   if(maxDist == 0) return MathMax(activeDist, minDist);

   double ratio = priceMove / maxDist;
   double dynamicDist = (activeDist - baseDist) * ratio + baseDist;
   return MathMax(MathMin(dynamicDist, activeDist), minDist);
}

double calcLots(double slPoints){

   double lots = SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN);

   double AccountBalance  = AccountInfoDouble(ACCOUNT_BALANCE);
   double EquityBalance   = AccountInfoDouble(ACCOUNT_EQUITY);
   double FreeMargin      = AccountInfoDouble(ACCOUNT_MARGIN_FREE);

   double risk=0;
   switch(LotType){
      case 0:
{
   if(UseBalanceLotScaling)
   {
      double multiplier = MathFloor(AccountBalance / BalanceStep);

      if(multiplier < 1)
         multiplier = 1;

      lots = BaseLot * multiplier;
   }
   else
   {
      lots = FixedLot;
   }

   return NormalizeDouble(lots,2);
}
      case 1: risk = AccountBalance * RiskPercent / 100; break;
      case 2: risk = EquityBalance * RiskPercent / 100; break;
      case 3: risk = FreeMargin * RiskPercent / 100;
   }

   double ticksize = SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE);
   double tickvalue = SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_VALUE);
   double lotstep = SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP);

   double moneyPerLotstep = slPoints / ticksize * tickvalue * lotstep;
   lots = MathFloor(risk / moneyPerLotstep) * lotstep;

   double minvolume=SymbolInfoDouble(Symbol(),SYMBOL_VOLUME_MIN);
   double maxvolume=SymbolInfoDouble(Symbol(),SYMBOL_VOLUME_MAX);
   double volumelimit = SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_LIMIT);

   if(volumelimit!=0) lots = MathMin(lots,volumelimit);
   if(maxvolume!=0) lots = MathMin(lots,SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MAX));
   if(minvolume!=0) lots = MathMax(lots,SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN));
   lots = NormalizeDouble(lots,2);
   return lots;
}

//--- FIX: guards against the [frozen] broker error. Some brokers refuse ANY
//    modify of SL/TP while price sits within SYMBOL_TRADE_FREEZE_LEVEL of the
//    position's CURRENT stop - regardless of what new value is being sent.
//    Call this before every PositionModify() and skip the attempt if true.
bool IsFreezeBlocked(double refPrice, double existingStopLevel)
{
   if(MinFreezeDistance <= 0) return false;      // broker has no freeze level
   if(existingStopLevel == 0) return false;      // no existing SL to be frozen near
   return (MathAbs(refPrice - existingStopLevel) <= MinFreezeDistance);
}

//--- FIX: small extra buffer added on top of the broker's raw stop-level
//    distance, to absorb the price movement/slippage that happens in the
//    few ms between when we calculate sl here and when the modify request
//    is actually processed by the server - this is what was causing
//    intermittent [invalid stops] rejections.
#define STOPLEVEL_SAFETY_POINTS 2

void TrialStop(){

   if(TrailType==0){

      for(int i = PositionsTotal()-1; i >= 0; i--) {
         if(!posinfo.SelectByIndex(i)) continue;
         if(posinfo.Symbol() != _Symbol || posinfo.Magic() != InpMagic) continue;

         ulong ticket = posinfo.Ticket();
         ENUM_POSITION_TYPE type = posinfo.PositionType();
         double openPrice = posinfo.PriceOpen();
         double sl = posinfo.StopLoss();
         double tp = posinfo.TakeProfit();

         if(type == POSITION_TYPE_BUY) {
            double priceMove = MathMax(SymbolInfoDouble(_Symbol, SYMBOL_BID) - openPrice + CommissionPerPip, 0);
            double trailDist = CalculateTrailingStop(priceMove, MinStopDistance, TrailingStopActive, BaseTrailingStop, TrailingStopMax);

            double modifiedSl = NormalizeDouble(SymbolInfoDouble(_Symbol, SYMBOL_BID) - trailDist, _Digits);
            double triggerLevel = openPrice + CommissionPerPip + TrailingStopIncrement;

            if((SymbolInfoDouble(_Symbol, SYMBOL_BID) - triggerLevel) > trailDist &&
               (sl == 0 || (SymbolInfoDouble(_Symbol, SYMBOL_BID) - sl) > trailDist) &&
               modifiedSl != sl &&
               !IsFreezeBlocked(SymbolInfoDouble(_Symbol, SYMBOL_BID), sl)) {
               trade.PositionModify(ticket, modifiedSl, tp);
            }
         }
         else if(type == POSITION_TYPE_SELL) {
            double priceMove = MathMax(openPrice - SymbolInfoDouble(_Symbol, SYMBOL_ASK) - CommissionPerPip, 0);
            double trailDist = CalculateTrailingStop(priceMove, MinStopDistance, TrailingStopActive, BaseTrailingStop, TrailingStopMax);

            double modifiedSl = NormalizeDouble(SymbolInfoDouble(_Symbol, SYMBOL_ASK) + trailDist, _Digits);
            double triggerLevel = openPrice - CommissionPerPip - TrailingStopIncrement;

            if((triggerLevel - SymbolInfoDouble(_Symbol, SYMBOL_ASK)) > trailDist &&
               (sl == 0 || (sl - SymbolInfoDouble(_Symbol, SYMBOL_ASK)) > trailDist) &&
               modifiedSl != sl &&
               !IsFreezeBlocked(SymbolInfoDouble(_Symbol, SYMBOL_ASK), sl)) {
               trade.PositionModify(ticket, modifiedSl, tp);
            }
         }
      }
      return;
   }

   double sl            = 0;
   double tp            = 0;
   double ask           = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid           = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   int    stoplevel     = (int)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
   double indbuffer[];

   for (int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if (posinfo.SelectByIndex(i))
      {
         ulong ticket = posinfo.Ticket();

         if (posinfo.Magic() == InpMagic && posinfo.Symbol() == _Symbol)
         {
            if (posinfo.PositionType() == POSITION_TYPE_BUY)
            {
               //--- v8: for Previous_Candle trailing, require ConfirmCandles consecutive
               //    candles to have OPENED above the entry price first, so the trail only
               //    engages once the move is genuinely confirmed in profit.
               bool candleTrailReady = (TrailType != 2) || IsCandleTrailConfirmed(true, posinfo.PriceOpen());

               if (bid - posinfo.PriceOpen() > TslTriggerPoints * _Point && candleTrailReady)
               {
                  tp = posinfo.TakeProfit();

                  switch (TrailType)
                  {
                     case 1:
                        sl = bid - (TslPoints * _Point);
                        break;

                     case 2:
                        sl = iLow(_Symbol, PERIOD_CURRENT, PrvCandleN);
                        break;

                     case 3:
                        CopyBuffer(handleTrailMA, MAIN_LINE, 1, 1, indbuffer);
                        ArraySetAsSeries(indbuffer, true);
                        sl = NormalizeDouble(indbuffer[0], _Digits);
                        break;

                     case 4:
                        CopyBuffer(handleIchimoku, TENKANSEN_LINE, 1, 1, indbuffer);
                        ArraySetAsSeries(indbuffer, true);
                        sl = NormalizeDouble(indbuffer[0], _Digits);
                        break;
                  }

                  if(sl != 0)
                  {
                     //--- FIX: added STOPLEVEL_SAFETY_POINTS buffer to absorb slippage
                     double minDistBuy = (stoplevel > 0) ? (stoplevel + 1 + STOPLEVEL_SAFETY_POINTS) * _Point
                                                          : (STOPLEVEL_SAFETY_POINTS * _Point);
                     sl = MathMin(sl, NormalizeDouble(bid - minDistBuy, _Digits));
                  }

                  //--- FIX: skip the modify entirely if the broker's freeze level
                  //    currently blocks any change to this position's stop
                  if((sl > posinfo.StopLoss()) && sl != 0 && sl > posinfo.PriceOpen() && sl < bid &&
                     !IsFreezeBlocked(bid, posinfo.StopLoss()))
                  {
                     trade.PositionModify(ticket, sl, tp);
                  }
               }
            }
            else if(posinfo.PositionType()==POSITION_TYPE_SELL){
               bool candleTrailReadySell = (TrailType != 2) || IsCandleTrailConfirmed(false, posinfo.PriceOpen());

               if(ask + (TslTriggerPoints * _Point) < posinfo.PriceOpen() && candleTrailReadySell){
                  tp = posinfo.TakeProfit();

                  switch(TrailType){
                     case 1:
                        sl = ask + (TslPoints * _Point);
                        break;

                     case 2:
                        sl = iHigh(_Symbol, PERIOD_CURRENT, PrvCandleN);
                        break;

                     case 3:
                        CopyBuffer(handleTrailMA, MAIN_LINE, 1, 1, indbuffer);
                        ArraySetAsSeries(indbuffer, true);
                        sl = NormalizeDouble(indbuffer[0], _Digits);
                        break;

                     case 4:
                        CopyBuffer(handleIchimoku, TENKANSEN_LINE, 1, 1, indbuffer);
                        ArraySetAsSeries(indbuffer, true);
                        sl = NormalizeDouble(indbuffer[0], _Digits);
                        break;
                  }

                  if(sl != 0)
                  {
                     //--- FIX: added STOPLEVEL_SAFETY_POINTS buffer to absorb slippage
                     double minDistSell = (stoplevel > 0) ? (stoplevel + 1 + STOPLEVEL_SAFETY_POINTS) * _Point
                                                           : (STOPLEVEL_SAFETY_POINTS * _Point);
                     sl = MathMax(sl, NormalizeDouble(ask + minDistSell, _Digits));
                  }

                  //--- FIX: skip the modify entirely if the broker's freeze level
                  //    currently blocks any change to this position's stop
                  if((sl < posinfo.StopLoss()) && sl != 0 && sl < posinfo.PriceOpen() && sl > ask &&
                     !IsFreezeBlocked(ask, posinfo.StopLoss()))
                  {
                     trade.PositionModify(ticket, sl, tp);
                  }
               }
            }
         }
      }
   }
}
int GetSessionNowMinutes()
{
   MqlDateTime tm;
   TimeToStruct(TimeCurrent(), tm);
   int nowServer = tm.hour * 60 + tm.min;

   if(!UseISTSessionTimes)
      return nowServer;

   double istOffsetMinutes = (5.5 - BrokerGMTOffset) * 60.0 + ISTFineTuneMinutes;
   double nowIST = MathMod(nowServer + istOffsetMinutes + 1440.0, 1440.0);
   return (int)MathRound(nowIST);
}

bool IsUSDST(datetime utcTime)
{
   MqlDateTime dt;
   TimeToStruct(utcTime, dt);
   int year = dt.year;

   MqlDateTime mStart; ZeroMemory(mStart);
   mStart.year = year; mStart.mon = 3; mStart.day = 1;
   MqlDateTime m1; TimeToStruct(StructToTime(mStart), m1);
   int secondSundayMarch = 1 + ((7 - m1.day_of_week) % 7) + 7;

   MqlDateTime nStart; ZeroMemory(nStart);
   nStart.year = year; nStart.mon = 11; nStart.day = 1;
   MqlDateTime n1; TimeToStruct(StructToTime(nStart), n1);
   int firstSundayNov = 1 + ((7 - n1.day_of_week) % 7);

   MqlDateTime dstStart; ZeroMemory(dstStart);
   dstStart.year = year; dstStart.mon = 3; dstStart.day = secondSundayMarch; dstStart.hour = 7;
   datetime tStart = StructToTime(dstStart);

   MqlDateTime dstEnd; ZeroMemory(dstEnd);
   dstEnd.year = year; dstEnd.mon = 11; dstEnd.day = firstSundayNov; dstEnd.hour = 6;
   datetime tEnd = StructToTime(dstEnd);

   return (utcTime >= tStart && utcTime < tEnd);
}

void GetNYOpenTimes(string &srvOut, string &istOut, bool &dstOut)
{
   datetime utcNow = TimeCurrent() - (int)(BrokerGMTOffset * 3600.0);
   bool dst = IsUSDST(utcNow);
   int nyOpenUtcMinutes = dst ? 12*60 : 13*60;
   dstOut = dst;

   double srvMinutes = MathMod(nyOpenUtcMinutes + BrokerGMTOffset*60.0 + 1440.0, 1440.0);
   int sh = (int)(srvMinutes / 60.0);
   int sm = (int)MathRound(srvMinutes - sh*60.0);
   if(sm >= 60) { sm -= 60; sh = (sh+1) % 24; }
   srvOut = StringFormat("%02d:%02d", sh, sm);

   double istMinutes = MathMod(nyOpenUtcMinutes + 5.5*60.0 + ISTFineTuneMinutes + 1440.0, 1440.0);
   int ih = (int)(istMinutes / 60.0);
   int im = (int)MathRound(istMinutes - ih*60.0);
   if(im >= 60) { im -= 60; ih = (ih+1) % 24; }
   istOut = StringFormat("%02d:%02d", ih, im);
}
