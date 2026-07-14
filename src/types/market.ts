/**
 * Core type definitions for the Quant Terminal
 * Designed for type-safe real-time market data processing
 */

// ============================================
// Base Market Data Types
// ============================================

export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Trade {
  id: string;
  timestamp: number;
  price: number;
  size: number;
  side: 'buy' | 'sell';
}

export interface OrderBookLevel {
  price: number;
  size: number;
  orders?: number;
}

export interface OrderBook {
  symbol: string;
  timestamp: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface Ticker {
  symbol: string;
  price: number;
  change24h: number;
  changePercent24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  timestamp: number;
}

export interface FundingRate {
  symbol: string;
  rate: number;
  nextFundingTime: number;
  timestamp: number;
}

export interface OpenInterest {
  symbol: string;
  openInterest: number;
  timestamp: number;
}

// ============================================
// Symbol & Exchange Types
// ============================================

export type Exchange = 'binance' | 'coinbase' | 'kraken' | 'bybit' | 'okx';

export interface SymbolConfig {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  exchange: Exchange;
  pricePrecision: number;
  quantityPrecision: number;
  minOrderSize: number;
  tickSize: number;
}

export interface SubscriptionConfig {
  symbol: string;
  channels: MarketChannel[];
  exchange?: Exchange;
}

export type MarketChannel = 
  | 'ticker'
  | 'trades'
  | 'orderbook'
  | 'ohlcv_1m'
  | 'ohlcv_5m'
  | 'ohlcv_15m'
  | 'ohlcv_1h'
  | 'ohlcv_4h'
  | 'ohlcv_1d'
  | 'funding'
  | 'open_interest';

// ============================================
// Real-time Data Events
// ============================================

export interface MarketDataEvent<T = unknown> {
  type: 'update' | 'snapshot' | 'delta' | 'error';
  channel: MarketChannel;
  symbol: string;
  exchange: Exchange;
  data: T;
  timestamp: number;
  sequence?: number;
}

export interface ConnectionState {
  status: 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'error';
  lastConnected?: number;
  lastDisconnected?: number;
  reconnectAttempts: number;
  latency?: number;
}

// ============================================
// Chart & Indicator Types
// ============================================

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w';

export interface ChartDataPoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorDataPoint {
  time: number;
  value: number | { [key: string]: number };
}

export interface IndicatorConfig {
  name: string;
  type: 'overlay' | 'separate';
  params: Record<string, number | string | boolean>;
  color?: string;
  lineWidth?: number;
}

export interface TechnicalIndicators {
  rsi?: IndicatorDataPoint[];
  macd?: { macd: IndicatorDataPoint[]; signal: IndicatorDataPoint[]; histogram: IndicatorDataPoint[] };
  ema?: { [period: number]: IndicatorDataPoint[] };
  sma?: { [period: number]: IndicatorDataPoint[] };
  vwap?: IndicatorDataPoint[];
  bollinger?: { upper: IndicatorDataPoint[]; middle: IndicatorDataPoint[]; lower: IndicatorDataPoint[] };
  atr?: IndicatorDataPoint[];
  supertrend?: { trend: IndicatorDataPoint[]; direction: IndicatorDataPoint[] };
  ichimoku?: {
    tenkan: IndicatorDataPoint[];
    kijun: IndicatorDataPoint[];
    senkouA: IndicatorDataPoint[];
    senkouB: IndicatorDataPoint[];
    chikou: IndicatorDataPoint[];
  };
}

// ============================================
// Quant Analytics Types
// ============================================

export interface PerformanceMetrics {
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  maxDrawdownDuration: number;
  volatility: number;
  annualizedReturn: number;
  calmarRatio: number;
  omegaRatio: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
}

export interface RollingMetrics {
  timestamp: number;
  returns: number[];
  sharpe: number;
  volatility: number;
  drawdown: number;
}

export interface CorrelationMatrix {
  symbols: string[];
  matrix: number[][];
  period: string;
  timestamp: number;
}

export interface RegimeState {
  regime: 'bull' | 'bear' | 'sideways' | 'high_vol' | 'low_vol';
  confidence: number;
  duration: number;
  timestamp: number;
}

// ============================================
// AI & Terminal Types
// ============================================

export interface TerminalCommand {
  command: string;
  args: string[];
  raw: string;
  timestamp: number;
}

export interface TerminalOutput {
  type: 'stdout' | 'stderr' | 'info' | 'warn' | 'error' | 'success' | 'chart' | 'table' | 'json';
  content: string | object;
  timestamp: number;
  commandId?: string;
}

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  timestamp: number;
  metadata?: {
    tokens?: number;
    model?: string;
    latency?: number;
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  result: unknown;
  error?: string;
}

// ============================================
// Portfolio & Position Types
// ============================================

export interface Position {
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
  leverage: number;
  margin: number;
  liquidationPrice?: number;
  timestamp: number;
}

export interface Portfolio {
  totalEquity: number;
  availableBalance: number;
  usedMargin: number;
  unrealizedPnl: number;
  realizedPnl24h: number;
  positions: Position[];
  timestamp: number;
}

export interface Balance {
  asset: string;
  total: number;
  available: number;
  locked: number;
}

// ============================================
// News & Macro Types
// ============================================

export interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: number;
  symbols: string[];
  sentiment: 'positive' | 'negative' | 'neutral';
  importance: 'low' | 'medium' | 'high';
}

export interface MacroEvent {
  id: string;
  title: string;
  country: string;
  currency: string;
  actual?: number;
  forecast?: number;
  previous?: number;
  timestamp: number;
  importance: 'low' | 'medium' | 'high';
}

// ============================================
// WebSocket Message Types (for Ably/providers)
// ============================================

export interface WSMessage {
  event: string;
  channel?: string;
  data?: unknown;
  error?: { code: number; message: string };
}

// ============================================
// Utility Types
// ============================================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type NonEmptyArray<T> = [T, ...T[]];

export interface TimeRange {
  start: number;
  end: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  };
}