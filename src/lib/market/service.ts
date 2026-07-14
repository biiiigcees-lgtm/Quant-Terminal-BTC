/**
 * Market Data Service
 * High-level service for managing real-time market data subscriptions
 * Provides normalized data from multiple exchange sources
 */

import { WebSocketManager, getWSManager } from '@/lib/websocket/manager';
import type {
  OHLCV,
  Trade,
  OrderBook,
  Ticker,
  FundingRate,
  OpenInterest,
  MarketChannel,
  Exchange,
  SymbolConfig,
  SubscriptionConfig,
  MarketDataEvent,
  ConnectionState,
  ChartDataPoint,
  Timeframe,
} from '@/types/market';

// ============================================
// Configuration
// ============================================

export interface MarketServiceConfig {
  defaultExchange: Exchange;
  wsManagerConfig?: {
    ablyKey?: string;
    fallbackWsUrl?: string;
  };
  cacheSize?: number; // Max candles to keep in memory per symbol/timeframe
  enableNormalization?: boolean;
}

const DEFAULT_CONFIG: Required<MarketServiceConfig> = {
  defaultExchange: 'binance',
  wsManagerConfig: {},
  cacheSize: 5000,
  enableNormalization: true,
};

// ============================================
// Internal State
// ============================================

interface CachedData {
  tickers: Map<string, Ticker>;
  orderbooks: Map<string, OrderBook>;
  trades: Map<string, Trade[]>;
  candles: Map<string, Map<Timeframe, ChartDataPoint[]>>;
  fundingRates: Map<string, FundingRate>;
  openInterest: Map<string, OpenInterest>;
  lastUpdate: Map<string, number>;
}

interface ActiveSubscription {
  symbol: string;
  channels: MarketChannel[];
  exchange: Exchange;
  wsSubscription: ReturnType<WebSocketManager['subscribe']>;
}

// ============================================
// Market Data Service Class
// ============================================

export class MarketDataService {
  private config: Required<MarketServiceConfig>;
  private wsManager: WebSocketManager;
  private cache: CachedData;
  private activeSubscriptions = new Map<string, ActiveSubscription>();
  private symbolConfigs = new Map<string, SymbolConfig>();
  private updateListeners = new Set<(event: MarketDataEvent) => void>();
  private isInitialized = false;

  constructor(config: MarketServiceConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.wsManager = getWSManager(this.config.wsManagerConfig);
    this.cache = this.createEmptyCache();
  }

  private createEmptyCache(): CachedData {
    return {
      tickers: new Map(),
      orderbooks: new Map(),
      trades: new Map(),
      candles: new Map(),
      fundingRates: new Map(),
      openInterest: new Map(),
      lastUpdate: new Map(),
    };
  }

  // ============================================
  // Initialization
  // ============================================

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Load default symbol configurations
    this.loadDefaultSymbols();

    // Connect WebSocket
    await this.wsManager.connect();

    // Subscribe to connection state changes
    this.wsManager.onStateChange((state) => {
      this.notifyUpdate({
        type: 'update',
        channel: 'connection' as MarketChannel,
        symbol: 'system',
        exchange: this.config.defaultExchange,
        data: state,
        timestamp: Date.now(),
      });
    });

    this.isInitialized = true;
  }

  private loadDefaultSymbols(): void {
    const defaults: SymbolConfig[] = [
      { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', exchange: 'binance', pricePrecision: 2, quantityPrecision: 6, minOrderSize: 0.00001, tickSize: 0.01 },
      { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT', exchange: 'binance', pricePrecision: 2, quantityPrecision: 5, minOrderSize: 0.0001, tickSize: 0.01 },
      { symbol: 'SOLUSDT', baseAsset: 'SOL', quoteAsset: 'USDT', exchange: 'binance', pricePrecision: 4, quantityPrecision: 2, minOrderSize: 0.01, tickSize: 0.0001 },
      { symbol: 'BTCUSD', baseAsset: 'BTC', quoteAsset: 'USD', exchange: 'coinbase', pricePrecision: 2, quantityPrecision: 8, minOrderSize: 0.00001, tickSize: 0.01 },
      { symbol: 'ETHUSD', baseAsset: 'ETH', quoteAsset: 'USD', exchange: 'coinbase', pricePrecision: 2, quantityPrecision: 6, minOrderSize: 0.001, tickSize: 0.01 },
    ];

    for (const symbol of defaults) {
      this.symbolConfigs.set(symbol.symbol, symbol);
    }
  }

  // ============================================
  // Subscription Management
  // ============================================

  subscribe(symbol: string, channels: MarketChannel[], exchange?: Exchange): ActiveSubscription {
    const ex = exchange || this.config.defaultExchange;
    const subKey = `${ex}:${symbol}`;

    // Check if already subscribed
    if (this.activeSubscriptions.has(subKey)) {
      const existing = this.activeSubscriptions.get(subKey)!;
      // Add missing channels
      const newChannels = channels.filter((c) => !existing.channels.includes(c));
      if (newChannels.length > 0) {
        existing.channels.push(...newChannels);
        this.resubscribe(existing);
      }
      return existing;
    }

    const config: SubscriptionConfig = {
      symbol,
      channels,
      exchange: ex,
    };

    const wsSubscription = this.wsManager.subscribe(config);

    const subscription: ActiveSubscription = {
      symbol,
      channels,
      exchange: ex,
      wsSubscription,
    };

    this.activeSubscriptions.set(subKey, subscription);

    // Set up event handlers for each channel
    for (const channel of channels) {
      wsSubscription.on(channel, (data) => this.handleChannelData(channel, symbol, ex, data));
    }

    return subscription;
  }

  private resubscribe(subscription: ActiveSubscription): void {
    subscription.wsSubscription.unsubscribe();
    const config: SubscriptionConfig = {
      symbol: subscription.symbol,
      channels: subscription.channels,
      exchange: subscription.exchange,
    };
    const wsSubscription = this.wsManager.subscribe(config);
    subscription.wsSubscription = wsSubscription;

    for (const channel of subscription.channels) {
      wsSubscription.on(channel, (data) => this.handleChannelData(channel, subscription.symbol, subscription.exchange, data));
    }
  }

  unsubscribe(symbol: string, exchange?: Exchange): void {
    const ex = exchange || this.config.defaultExchange;
    const subKey = `${ex}:${symbol}`;
    const subscription = this.activeSubscriptions.get(subKey);

    if (subscription) {
      subscription.wsSubscription.unsubscribe();
      this.activeSubscriptions.delete(subKey);
    }
  }

  unsubscribeAll(): void {
    for (const [, subscription] of this.activeSubscriptions) {
      subscription.wsSubscription.unsubscribe();
    }
    this.activeSubscriptions.clear();
  }

  // ============================================
  // Data Handlers
  // ============================================

  private handleChannelData(channel: MarketChannel, symbol: string, exchange: Exchange, data: unknown): void {
    const timestamp = Date.now();
    this.cache.lastUpdate.set(symbol, timestamp);

    let normalizedData: unknown;

    switch (channel) {
      case 'ticker':
        normalizedData = this.normalizeTicker(data, symbol, exchange);
        this.cache.tickers.set(symbol, normalizedData);
        break;
      case 'trades':
        normalizedData = this.normalizeTrade(data, symbol, exchange);
        this.addTrade(symbol, normalizedData);
        break;
      case 'orderbook':
        normalizedData = this.normalizeOrderBook(data, symbol, exchange);
        this.cache.orderbooks.set(symbol, normalizedData);
        break;
      case 'ohlcv_1m':
      case 'ohlcv_5m':
      case 'ohlcv_15m':
      case 'ohlcv_1h':
      case 'ohlcv_4h':
      case 'ohlcv_1d':
        normalizedData = this.normalizeCandle(data, symbol, exchange);
        this.addCandle(symbol, channel as Timeframe, normalizedData);
        break;
      case 'funding':
        normalizedData = this.normalizeFundingRate(data, symbol, exchange);
        this.cache.fundingRates.set(symbol, normalizedData);
        break;
      case 'open_interest':
        normalizedData = this.normalizeOpenInterest(data, symbol, exchange);
        this.cache.openInterest.set(symbol, normalizedData);
        break;
    }

    // Notify listeners
    this.notifyUpdate({
      type: 'update',
      channel,
      symbol,
      exchange,
      data: normalizedData,
      timestamp,
    });
  }

  // ============================================
  // Normalization
  // ============================================

  private normalizeTicker(data: unknown, symbol: string, exchange: Exchange): Ticker {
    const d = data as Record<string, unknown>;
    return {
      symbol,
      price: Number(d.price || d.lastPrice || d.c || d.last || 0),
      change24h: Number(d.change24h || d.priceChange24h || d.p24h || 0),
      changePercent24h: Number(d.changePercent24h || d.priceChangePercent24h || d.P24h || 0),
      high24h: Number(d.high24h || d.highPrice24h || d.h24h || 0),
      low24h: Number(d.low24h || d.lowPrice24h || d.l24h || 0),
      volume24h: Number(d.volume24h || d.volume || d.v24h || 0),
      timestamp: Number(d.timestamp || d.T || d.t || Date.now()),
    };
  }

  private normalizeTrade(data: unknown, symbol: string, exchange: Exchange): Trade {
    const d = data as Record<string, unknown>;
    return {
      id: String(d.id || d.tradeId || d.t || Date.now()),
      timestamp: Number(d.timestamp || d.time || d.T || Date.now()),
      price: Number(d.price || d.p || 0),
      size: Number(d.size || d.quantity || d.q || d.amount || 0),
      side: (d.side || d.S || 'buy') as 'buy' | 'sell',
    };
  }

  private normalizeOrderBook(data: unknown, symbol: string, exchange: Exchange): OrderBook {
    const d = data as Record<string, unknown>;
    const bids = (d.bids || d.b || []) as Array<[number, number] | { price: number; size: number }>;
    const asks = (d.asks || d.a || []) as Array<[number, number] | { price: number; size: number }>;

    return {
      symbol,
      timestamp: Number(d.timestamp || d.T || Date.now()),
      bids: bids.map((b) => ({
        price: Array.isArray(b) ? b[0] : b.price,
        size: Array.isArray(b) ? b[1] : b.size,
      })),
      asks: asks.map((a) => ({
        price: Array.isArray(a) ? a[0] : a.price,
        size: Array.isArray(a) ? a[1] : a.size,
      })),
    };
  }

  private normalizeCandle(data: unknown, symbol: string, exchange: Exchange): ChartDataPoint {
    const d = data as Record<string, unknown>;
    return {
      time: Number(d.timestamp || d.time || d.t || d.openTime || Date.now()),
      open: Number(d.open || d.o || 0),
      high: Number(d.high || d.h || 0),
      low: Number(d.low || d.l || 0),
      close: Number(d.close || d.c || 0),
      volume: Number(d.volume || d.v || 0),
    };
  }

  private normalizeFundingRate(data: unknown, symbol: string, exchange: Exchange): FundingRate {
    const d = data as Record<string, unknown>;
    return {
      symbol,
      rate: Number(d.rate || d.fundingRate || d.r || 0),
      nextFundingTime: Number(d.nextFundingTime || d.nextFundingTimestamp || d.t || Date.now() + 8 * 60 * 60 * 1000),
      timestamp: Number(d.timestamp || d.T || Date.now()),
    };
  }

  private normalizeOpenInterest(data: unknown, symbol: string, exchange: Exchange): OpenInterest {
    const d = data as Record<string, unknown>;
    return {
      symbol,
      openInterest: Number(d.openInterest || d.oi || d.open_interest || 0),
      timestamp: Number(d.timestamp || d.T || Date.now()),
    };
  }

  // ============================================
  // Cache Management
  // ============================================

  private addTrade(symbol: string, trade: Trade): void {
    if (!this.cache.trades.has(symbol)) {
      this.cache.trades.set(symbol, []);
    }
    const trades = this.cache.trades.get(symbol)!;
    trades.unshift(trade);
    // Keep last 1000 trades
    if (trades.length > 1000) {
      trades.length = 1000;
    }
  }

  private addCandle(symbol: string, timeframe: Timeframe, candle: ChartDataPoint): void {
    if (!this.cache.candles.has(symbol)) {
      this.cache.candles.set(symbol, new Map());
    }
    const timeframeMap = this.cache.candles.get(symbol)!;
    if (!timeframeMap.has(timeframe)) {
      timeframeMap.set(timeframe, []);
    }
    const candles = timeframeMap.get(timeframe)!;

    // Check if updating existing candle or adding new
    const lastCandle = candles[candles.length - 1];
    if (lastCandle && lastCandle.time === candle.time) {
      // Update last candle
      candles[candles.length - 1] = candle;
    } else {
      // Add new candle
      candles.push(candle);
    }

    // Trim cache
    if (candles.length > this.config.cacheSize) {
      candles.splice(0, candles.length - this.config.cacheSize);
    }
  }

  // ============================================
  // Public Getters
  // ============================================

  getTicker(symbol: string): Ticker | undefined {
    return this.cache.tickers.get(symbol);
  }

  getAllTickers(): Ticker[] {
    return Array.from(this.cache.tickers.values());
  }

  getOrderBook(symbol: string): OrderBook | undefined {
    return this.cache.orderbooks.get(symbol);
  }

  getTrades(symbol: string, limit = 100): Trade[] {
    return this.cache.trades.get(symbol)?.slice(0, limit) || [];
  }

  getCandles(symbol: string, timeframe: Timeframe, limit = 500): ChartDataPoint[] {
    const candles = this.cache.candles.get(symbol)?.get(timeframe) || [];
    return candles.slice(-limit);
  }

  getFundingRate(symbol: string): FundingRate | undefined {
    return this.cache.fundingRates.get(symbol);
  }

  getOpenInterest(symbol: string): OpenInterest | undefined {
    return this.cache.openInterest.get(symbol);
  }

  getLastUpdate(symbol: string): number | undefined {
    return this.cache.lastUpdate.get(symbol);
  }

  getConnectionState(): ConnectionState {
    return this.wsManager.getState();
  }

  isConnected(): boolean {
    return this.wsManager.isConnected();
  }

  // ============================================
  // Historical Data (REST fallback)
  // ============================================

  async fetchHistoricalCandles(
    symbol: string,
    timeframe: Timeframe,
    limit: number,
    endTime?: number
  ): Promise<ChartDataPoint[]> {
    // In production, this would call REST API endpoints
    // For now, return cached data or empty array
    const cached = this.getCandles(symbol, timeframe, limit);
    if (cached.length > 0) return cached;

    // TODO: Implement REST API fallback
    return [];
  }

  async fetchHistoricalTrades(symbol: string, limit: number): Promise<Trade[]> {
    const cached = this.getTrades(symbol, limit);
    if (cached.length > 0) return cached;

    // TODO: Implement REST API fallback
    return [];
  }

  // ============================================
  // Symbol Configuration
  // ============================================

  getSymbolConfig(symbol: string): SymbolConfig | undefined {
    return this.symbolConfigs.get(symbol);
  }

  setSymbolConfig(config: SymbolConfig): void {
    this.symbolConfigs.set(config.symbol, config);
  }

  getAvailableSymbols(): SymbolConfig[] {
    return Array.from(this.symbolConfigs.values());
  }

  // ============================================
  // Event System
  // ============================================

  onUpdate(listener: (event: MarketDataEvent) => void): () => void {
    this.updateListeners.add(listener);
    return () => this.updateListeners.delete(listener);
  }

  private notifyUpdate(event: MarketDataEvent): void {
    this.updateListeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error('[MarketDataService] Listener error:', error);
      }
    });
  }

  // ============================================
  // Cleanup
  // ============================================

  async disconnect(): Promise<void> {
    this.unsubscribeAll();
    await this.wsManager.disconnect();
    this.isInitialized = false;
  }
}

// ============================================
// Singleton Instance
// ============================================

let marketServiceInstance: MarketDataService | null = null;

export function getMarketService(config?: MarketServiceConfig): MarketDataService {
  if (!marketServiceInstance) {
    marketServiceInstance = new MarketDataService(config);
  }
  return marketServiceInstance;
}

export function resetMarketService(): void {
  if (marketServiceInstance) {
    marketServiceInstance.disconnect();
    marketServiceInstance = null;
  }
}

// ============================================
// React Hook (for client components)
// ============================================

export function useMarketData() {
  // This will be implemented in hooks folder
  // Import from '@/hooks/useMarketData'
}