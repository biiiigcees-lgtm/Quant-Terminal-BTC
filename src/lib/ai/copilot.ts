/**
 * AI Copilot - Vercel AI SDK integration for Quant Terminal
 * Provides streaming chat, tool calling, and market analysis
 */

import { streamText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { xai } from '@ai-sdk/xai';
import { z } from 'zod';
import type { TerminalOutput, ChartDataPoint, Ticker, OrderBook, Trade, MarketChannel } from '@/types/market';
import { getMarketService } from '@/lib/market/service';
import { TechnicalIndicators, PerformanceMetrics } from '@/lib/charts/chart-engine';

// ============================================
// Configuration
// ============================================

export type AIProvider = 'openai' | 'anthropic' | 'google' | 'xai';

export interface AIModelConfig {
  provider: AIProvider;
  model: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
}

export const DEFAULT_MODEL: AIModelConfig = {
  provider: 'openai',
  model: 'gpt-4o',
  temperature: 0.3,
  maxTokens: 4096,
};

export const AVAILABLE_MODELS: Record<AIProvider, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
  google: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0-pro'],
  xai: ['grok-2', 'grok-2-mini', 'grok-1'],
};

// ============================================
// Market Data Tools
// ============================================

const marketService = getMarketService();

// Get current price
const getPriceTool = tool({
  description: 'Get current price and 24h stats for a symbol',
  parameters: z.object({
    symbol: z.string().describe('Trading symbol (e.g., BTCUSDT, BTCUSD)'),
    exchange: z.enum(['binance', 'coinbase', 'kraken', 'bybit', 'okx']).optional().default('binance'),
  }),
  execute: async ({ symbol, exchange }) => {
    marketService.subscribe(symbol.toUpperCase(), ['ticker'], exchange);
    // Wait a bit for data
    await new Promise(r => setTimeout(r, 200));
    const ticker = marketService.getTicker(symbol.toUpperCase());
    
    if (!ticker) {
      return { error: `No data for ${symbol} on ${exchange}. Waiting for feed...` };
    }
    
    return {
      symbol: ticker.symbol,
      price: ticker.price,
      change24h: ticker.change24h,
      changePercent24h: ticker.changePercent24h,
      high24h: ticker.high24h,
      low24h: ticker.low24h,
      volume24h: ticker.volume24h,
      timestamp: ticker.timestamp,
    };
  },
});

// Get candles
const getCandlesTool = tool({
  description: 'Get historical candlestick data for a symbol',
  parameters: z.object({
    symbol: z.string().describe('Trading symbol'),
    timeframe: z.enum(['1m', '5m', '15m', '1h', '4h', '1d', '1w']).default('1h'),
    limit: z.number().max(5000).default(100),
    exchange: z.enum(['binance', 'coinbase', 'kraken', 'bybit', 'okx']).optional().default('binance'),
  }),
  execute: async ({ symbol, timeframe, limit, exchange }) => {
    const channel = `ohlcv_${timeframe}` as MarketChannel;
    marketService.subscribe(symbol.toUpperCase(), [channel], exchange);
    await new Promise(r => setTimeout(r, 200));
    const candles = marketService.getCandles(symbol.toUpperCase(), timeframe, limit);
    
    if (candles.length === 0) {
      return { error: `No candle data for ${symbol} ${timeframe}. Waiting for feed...` };
    }
    
    return {
      symbol,
      timeframe,
      count: candles.length,
      candles: candles.map(c => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      })),
    };
  },
});

// Get order book
const getOrderBookTool = tool({
  description: 'Get order book depth for a symbol',
  parameters: z.object({
    symbol: z.string().describe('Trading symbol'),
    levels: z.number().max(100).default(20),
    exchange: z.enum(['binance', 'coinbase', 'kraken', 'bybit', 'okx']).optional().default('binance'),
  }),
  execute: async ({ symbol, levels, exchange }) => {
    marketService.subscribe(symbol.toUpperCase(), ['orderbook'], exchange);
    await new Promise(r => setTimeout(r, 200));
    const ob = marketService.getOrderBook(symbol.toUpperCase());
    
    if (!ob) {
      return { error: `No orderbook data for ${symbol}. Waiting for feed...` };
    }
    
    return {
      symbol: ob.symbol,
      timestamp: ob.timestamp,
      bids: ob.bids.slice(0, levels).map(b => ({ price: b.price, size: b.size })),
      asks: ob.asks.slice(0, levels).map(a => ({ price: a.price, size: a.size })),
      spread: ob.asks[0] && ob.bids[0] ? ob.asks[0].price - ob.bids[0].price : 0,
    };
  },
});

// Get recent trades
const getTradesTool = tool({
  description: 'Get recent trades (time & sales) for a symbol',
  parameters: z.object({
    symbol: z.string().describe('Trading symbol'),
    limit: z.number().max(200).default(50),
    exchange: z.enum(['binance', 'coinbase', 'kraken', 'bybit', 'okx']).optional().default('binance'),
  }),
  execute: async ({ symbol, limit, exchange }) => {
    marketService.subscribe(symbol.toUpperCase(), ['trades'], exchange);
    await new Promise(r => setTimeout(r, 200));
    const trades = marketService.getTrades(symbol.toUpperCase(), limit);
    
    return {
      symbol,
      count: trades.length,
      trades: trades.map(t => ({
        id: t.id,
        time: t.timestamp,
        price: t.price,
        size: t.size,
        side: t.side,
      })),
    };
  },
});

// Get funding rate
const getFundingTool = tool({
  description: 'Get funding rate for perpetual futures',
  parameters: z.object({
    symbol: z.string().describe('Trading symbol'),
    exchange: z.enum(['binance', 'coinbase', 'kraken', 'bybit', 'okx']).optional().default('binance'),
  }),
  execute: async ({ symbol, exchange }) => {
    marketService.subscribe(symbol.toUpperCase(), ['funding'], exchange);
    await new Promise(r => setTimeout(r, 200));
    const funding = marketService.getFundingRate(symbol.toUpperCase());
    
    if (!funding) {
      return { error: `No funding data for ${symbol}` };
    }
    
    return {
      symbol: funding.symbol,
      rate: funding.rate,
      annualized: funding.rate * 3 * 365 * 100,
      nextFundingTime: funding.nextFundingTime,
    };
  },
});

// Get open interest
const getOpenInterestTool = tool({
  description: 'Get open interest for a symbol',
  parameters: z.object({
    symbol: z.string().describe('Trading symbol'),
    exchange: z.enum(['binance', 'coinbase', 'kraken', 'bybit', 'okx']).optional().default('binance'),
  }),
  execute: async ({ symbol, exchange }) => {
    marketService.subscribe(symbol.toUpperCase(), ['open_interest'], exchange);
    await new Promise(r => setTimeout(r, 200));
    const oi = marketService.getOpenInterest(symbol.toUpperCase());
    
    if (!oi) {
      return { error: `No open interest data for ${symbol}` };
    }
    
    return {
      symbol: oi.symbol,
      openInterest: oi.openInterest,
      timestamp: oi.timestamp,
    };
  },
});

// Calculate technical indicators
const calculateIndicatorsTool = tool({
  description: 'Calculate technical indicators for a symbol',
  parameters: z.object({
    symbol: z.string().describe('Trading symbol'),
    timeframe: z.enum(['1m', '5m', '15m', '1h', '4h', '1d', '1w']).default('1h'),
    indicators: z.array(z.enum(['rsi', 'macd', 'ema', 'sma', 'bollinger', 'vwap', 'atr', 'supertrend'])).default(['rsi', 'macd']),
    exchange: z.enum(['binance', 'coinbase', 'kraken', 'bybit', 'okx']).optional().default('binance'),
  }),
  execute: async ({ symbol, timeframe, indicators, exchange }) => {
    const channel = `ohlcv_${timeframe}` as MarketChannel;
    marketService.subscribe(symbol.toUpperCase(), [channel], exchange);
    await new Promise(r => setTimeout(r, 200));
    const candles = marketService.getCandles(symbol.toUpperCase(), timeframe, 500);
    
    if (candles.length === 0) {
      return { error: `No data for ${symbol} ${timeframe}` };
    }
    
    const results: Record<string, any> = {};
    
    if (indicators.includes('rsi')) {
      const rsi = TechnicalIndicators.rsi(candles);
      results.rsi = rsi.slice(-20).map(r => ({ time: r.time, value: r.value }));
    }
    
    if (indicators.includes('macd')) {
      const macd = TechnicalIndicators.macd(candles);
      results.macd = {
        macd: macd.macd.slice(-20).map(m => ({ time: m.time, value: m.value })),
        signal: macd.signal.slice(-20).map(m => ({ time: m.time, value: m.value })),
        histogram: macd.histogram.slice(-20).map(m => ({ time: m.time, value: m.value })),
      };
    }
    
    if (indicators.includes('ema')) {
      results.ema9 = TechnicalIndicators.ema(candles, 9).slice(-20).map(e => ({ time: e.time, value: e.value }));
      results.ema20 = TechnicalIndicators.ema(candles, 20).slice(-20).map(e => ({ time: e.time, value: e.value }));
      results.ema50 = TechnicalIndicators.ema(candles, 50).slice(-20).map(e => ({ time: e.time, value: e.value }));
    }
    
    if (indicators.includes('sma')) {
      results.sma20 = TechnicalIndicators.sma(candles, 20).slice(-20).map(s => ({ time: s.time, value: s.value }));
    }
    
    if (indicators.includes('bollinger')) {
      const bb = TechnicalIndicators.bollinger(candles);
      results.bollinger = {
        upper: bb.upper.slice(-20).map(u => ({ time: u.time, value: u.value })),
        middle: bb.middle.slice(-20).map(m => ({ time: m.time, value: m.value })),
        lower: bb.lower.slice(-20).map(l => ({ time: l.time, value: l.value })),
      };
    }
    
    if (indicators.includes('vwap')) {
      results.vwap = TechnicalIndicators.vwap(candles).slice(-20).map(v => ({ time: v.time, value: v.value }));
    }
    
    if (indicators.includes('atr')) {
      results.atr = TechnicalIndicators.atr(candles).slice(-20).map(a => ({ time: a.time, value: a.value }));
    }
    
    if (indicators.includes('supertrend')) {
      const st = TechnicalIndicators.supertrend(candles);
      results.supertrend = {
        trend: st.trend.slice(-20).map(t => ({ time: t.time, value: t.value })),
        direction: st.direction.slice(-20).map(d => ({ time: d.time, value: d.value })),
      };
    }
    
    return { symbol, timeframe, indicators: results };
  },
});

// Calculate performance metrics
const calculatePerformanceTool = tool({
  description: 'Calculate performance metrics (Sharpe, Sortino, Max DD, etc.)',
  parameters: z.object({
    symbol: z.string().describe('Trading symbol'),
    timeframe: z.enum(['1m', '5m', '15m', '1h', '4h', '1d', '1w']).default('1d'),
    benchmarkSymbol: z.string().optional(),
    exchange: z.enum(['binance', 'coinbase', 'kraken', 'bybit', 'okx']).optional().default('binance'),
  }),
  execute: async ({ symbol, timeframe, benchmarkSymbol, exchange }) => {
    const channel = `ohlcv_${timeframe}` as MarketChannel;
    marketService.subscribe(symbol.toUpperCase(), [channel], exchange);
    await new Promise(r => setTimeout(r, 200));
    const candles = marketService.getCandles(symbol.toUpperCase(), timeframe, 1000);
    
    if (candles.length === 0) {
      return { error: `No data for ${symbol} ${timeframe}` };
    }
    
    let benchmarkCandles: ChartDataPoint[] = [];
    if (benchmarkSymbol) {
      marketService.subscribe(benchmarkSymbol.toUpperCase(), [channel], exchange);
      await new Promise(r => setTimeout(r, 200));
      benchmarkCandles = marketService.getCandles(benchmarkSymbol.toUpperCase(), timeframe, 1000);
    }
    
    const metrics = PerformanceMetrics.calculateAll(candles, benchmarkCandles.length > 0 ? benchmarkCandles : undefined);
    return { symbol, timeframe, metrics };
  },
});

// Market regime detection
const detectRegimeTool = tool({
  description: 'Detect current market regime (bull/bear/sideways/high_vol/low_vol)',
  parameters: z.object({
    symbol: z.string().describe('Trading symbol'),
    timeframe: z.enum(['1m', '5m', '15m', '1h', '4h', '1d', '1w']).default('1d'),
    exchange: z.enum(['binance', 'coinbase', 'kraken', 'bybit', 'okx']).optional().default('binance'),
  }),
  execute: async ({ symbol, timeframe, exchange }) => {
    const channel = `ohlcv_${timeframe}` as MarketChannel;
    marketService.subscribe(symbol.toUpperCase(), [channel], exchange);
    await new Promise(r => setTimeout(r, 200));
    const candles = marketService.getCandles(symbol.toUpperCase(), timeframe, 500);
    
    if (candles.length < 50) {
      return { error: `Insufficient data for regime detection` };
    }
    
    // Simple regime detection based on trend and volatility
    const returns = PerformanceMetrics.returns(candles);
    const volatility = PerformanceMetrics.volatility(returns);
    const sma20 = TechnicalIndicators.sma(candles, 20);
    const sma50 = TechnicalIndicators.sma(candles, 50);
    
    const currentPrice = candles[candles.length - 1].close;
    const currentSMA20 = sma20[sma20.length - 1]?.value || 0;
    const currentSMA50 = sma50[sma50.length - 1]?.value || 0;
    
    let regime = 'sideways';
    let confidence = 0.5;
    
    if (currentPrice > currentSMA20 && currentSMA20 > currentSMA50) {
      regime = 'bull';
      confidence = 0.75;
    } else if (currentPrice < currentSMA20 && currentSMA20 < currentSMA50) {
      regime = 'bear';
      confidence = 0.75;
    } else if (volatility > 5) {
      regime = 'high_vol';
      confidence = 0.6;
    } else if (volatility < 1) {
      regime = 'low_vol';
      confidence = 0.6;
    }
    
    return {
      symbol,
      timeframe,
      regime,
      confidence,
      volatility: volatility.toFixed(2),
      priceVsSMA20: ((currentPrice / currentSMA20 - 1) * 100).toFixed(2),
      priceVsSMA50: ((currentPrice / currentSMA50 - 1) * 100).toFixed(2),
    };
  },
});

// ============================================
// Tool Registry
// ============================================

export const marketTools = {
  getPrice: getPriceTool,
  getCandles: getCandlesTool,
  getOrderBook: getOrderBookTool,
  getTrades: getTradesTool,
  getFunding: getFundingTool,
  getOpenInterest: getOpenInterestTool,
  calculateIndicators: calculateIndicatorsTool,
  calculatePerformance: calculatePerformanceTool,
  detectRegime: detectRegimeTool,
};

// ============================================
// AI Provider Factory
// ============================================

function getModel(provider: AIProvider, model: string) {
  switch (provider) {
    case 'openai':
      return openai(model);
    case 'anthropic':
      return anthropic(model);
    case 'google':
      return google(model);
    case 'xai':
      return xai(model);
    default:
      return openai(model);
  }
}

// ============================================
// System Prompt
// ============================================

export const SYSTEM_PROMPT = `You are a professional quantitative trading assistant for the Quant Terminal. 
You have access to real-time market data, technical analysis tools, and performance metrics.

Your capabilities:
1. Real-time price data, order book, trades, funding rates, open interest
2. Historical candlestick data across multiple timeframes
3. Technical indicators: RSI, MACD, EMA/SMA, Bollinger Bands, VWAP, ATR, Supertrend
4. Performance metrics: Sharpe, Sortino, Max Drawdown, Volatility, Beta, Alpha, Calmar
5. Market regime detection (bull/bear/sideways/high_vol/low_vol)

Guidelines:
- Always use tools to fetch current data before answering
- Provide specific numbers, not vague descriptions
- Explain the reasoning behind your analysis
- Reference specific indicators and their values
- Be concise but thorough
- Use markdown formatting for readability
- When showing data, include timestamps

You are an expert quant - act like one.`;

// ============================================
// Streaming Chat Function
// ============================================

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: any[];
  toolCallId?: string;
}

export async function streamChat(
  messages: ChatMessage[],
  config: AIModelConfig = DEFAULT_MODEL,
  onToolCall?: (tool: string, args: any) => void,
  onToolResult?: (tool: string, result: any) => void
) {
  const model = getModel(config.provider, config.model);
  
  const result = await streamText({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
    ],
    tools: marketTools,
    temperature: config.temperature ?? 0.3,
    maxTokens: config.maxTokens ?? 4096,
  });

  return result;
}

// ============================================
// Quick Analysis Functions
// ============================================

export async function quickAnalysis(symbol: string, timeframe: string = '1h', exchange: string = 'binance') {
  const messages: ChatMessage[] = [
    { role: 'user', content: `Perform a quick technical analysis of ${symbol} on ${timeframe} timeframe from ${exchange}. Include current price, key indicators, trend, and any notable signals.` }
  ];

  const result = await streamChat(messages, { ...DEFAULT_MODEL, provider: 'openai' });
  return result;
}

export async function compareAssets(symbol1: string, symbol2: string, timeframe: string = '1d') {
  const messages: ChatMessage[] = [
    { role: 'user', content: `Compare ${symbol1} and ${symbol2} on ${timeframe} timeframe. Analyze correlation, relative performance, and which looks better for a trade.` }
  ];

  const result = await streamChat(messages, { ...DEFAULT_MODEL, provider: 'openai' });
  return result;
}

export async function marketOutlook(symbol: string) {
  const messages: ChatMessage[] = [
    { role: 'user', content: `What's your outlook for ${symbol}? Analyze regime, key levels, and probability scenarios.` }
  ];

  const result = await streamChat(messages, { ...DEFAULT_MODEL, provider: 'anthropic' });
  return result;
}

// Re-export TechnicalIndicators and PerformanceMetrics for use in components
export { TechnicalIndicators, PerformanceMetrics } from '@/lib/charts/chart-engine';