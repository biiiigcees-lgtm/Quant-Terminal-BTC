/**
 * Terminal Command Parser & Registry
 * Implements all quant terminal commands with auto-complete support
 */

import type {
  TerminalCommand,
  TerminalOutput,
  MarketChannel,
  Timeframe,
  Exchange,
} from '@/types/market';
import type { CommandDefinition, TerminalActions } from '@/store/terminal';
import { getMarketService } from '@/lib/market/service';

// ============================================
// Command Parser
// ============================================

export function parseCommand(input: string): TerminalCommand {
  const trimmed = input.trim();
  if (!trimmed) {
    return { command: '', args: [], raw: input, timestamp: Date.now() };
  }

  const parts = trimmed.split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  return { command, args, raw: input, timestamp: Date.now() };
}

// ============================================
// Command Registry
// ============================================

const commands = new Map<string, CommandDefinition>();

export function registerCommand(def: CommandDefinition): void {
  commands.set(def.name, def);
  for (const alias of def.aliases) {
    commands.set(alias, def);
  }
}

export function getCommand(name: string): CommandDefinition | undefined {
  return commands.get(name.toLowerCase());
}

export function getAllCommands(): CommandDefinition[] {
  const unique = new Map<string, CommandDefinition>();
  for (const [, cmd] of commands) {
    if (!unique.has(cmd.name)) {
      unique.set(cmd.name, cmd);
    }
  }
  return Array.from(unique.values());
}

export function getCommandsByCategory(category: CommandDefinition['category']): CommandDefinition[] {
  return getAllCommands().filter((c) => c.category === category);
}

export function getCommandCompletions(partial: string): string[] {
  const lower = partial.toLowerCase();
  return getAllCommands()
    .filter((c) => c.name.startsWith(lower) || c.aliases.some((a) => a.startsWith(lower)))
    .map((c) => c.name);
}

// ============================================
// Helper Functions
// ============================================

function formatNumber(num: number, decimals = 2): string {
  if (num >= 1e9) return `${(num / 1e9).toFixed(decimals)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(decimals)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(decimals)}K`;
  return num.toFixed(decimals);
}

function formatPrice(price: number, precision = 2): string {
  return price.toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}

function formatPercent(pct: number): string {
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

function createOutput(type: TerminalOutput['type'], content: string | object): TerminalOutput {
  return { type, content, timestamp: Date.now() };
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================
// Market Commands
// ============================================

registerCommand({
  name: 'price',
  aliases: ['p', 'ticker'],
  description: 'Get current price for a symbol',
  usage: 'price <symbol> [exchange]',
  examples: ['price BTCUSDT', 'price BTCUSD coinbase', 'p ETHUSDT'],
  category: 'market',
  handler: async (args, terminal) => {
    if (args.length === 0) {
      terminal.addOutput(createOutput('error', 'Usage: price <symbol> [exchange]'));
      return;
    }

    const symbol = args[0].toUpperCase();
    const exchange = (args[1] as Exchange) || 'binance';

    const service = getMarketService();
    service.subscribe(symbol, ['ticker'], exchange);

    await sleep(100);

    const ticker = service.getTicker(symbol);
    if (!ticker) {
      terminal.addOutput(createOutput('warn', `No data for ${symbol} on ${exchange}. Waiting for feed...`));
      return;
    }

    const changeClass = ticker.changePercent24h >= 0 ? 'price-up' : 'price-down';
    terminal.addOutput(createOutput('stdout', ''));
    terminal.addOutput(createOutput('stdout', `  ${symbol} @ ${exchange.toUpperCase()}`));
    terminal.addOutput(createOutput('stdout', `  ────────────────────────`));
    terminal.addOutput(createOutput('stdout', `  Price:       ${formatPrice(ticker.price)}`));
    terminal.addOutput(createOutput('stdout', `  24h Change:  <span class="${changeClass}">${formatNumber(ticker.change24h)} (${formatPercent(ticker.changePercent24h)})</span>`));
    terminal.addOutput(createOutput('stdout', `  24h High:    ${formatPrice(ticker.high24h)}`));
    terminal.addOutput(createOutput('stdout', `  24h Low:     ${formatPrice(ticker.low24h)}`));
    terminal.addOutput(createOutput('stdout', `  24h Volume:  ${formatNumber(ticker.volume24h)}`));
    terminal.addOutput(createOutput('stdout', ''));
  },
  completions: (partial) => {
    const service = getMarketService();
    return service.getAvailableSymbols().map((s) => s.symbol).filter((s) => s.startsWith(partial.toUpperCase()));
  },
});

registerCommand({
  name: 'watchlist',
  aliases: ['wl', 'watch'],
  description: 'Manage watchlist of symbols',
  usage: 'watchlist [add|remove|list|clear] <symbol>',
  examples: ['watchlist add BTCUSDT', 'watchlist remove ETHUSDT', 'watchlist list', 'wl'],
  category: 'market',
  handler: async (args, terminal) => {
    const service = getMarketService();
    const action = args[0]?.toLowerCase() || 'list';

    const storageKey = 'quant-terminal-watchlist';
    const getWatchlist = (): string[] => {
      try {
        return JSON.parse(localStorage.getItem(storageKey) || '[]');
      } catch {
        return [];
      }
    };
    const saveWatchlist = (list: string[]) => {
      localStorage.setItem(storageKey, JSON.stringify(list));
    };

    switch (action) {
      case 'add': {
        const symbol = args[1]?.toUpperCase();
        if (!symbol) {
          terminal.addOutput(createOutput('error', 'Usage: watchlist add <symbol>'));
          return;
        }
        const list = getWatchlist();
        if (!list.includes(symbol)) {
          list.push(symbol);
          saveWatchlist(list);
          service.subscribe(symbol, ['ticker']);
          terminal.addOutput(createOutput('success', `Added ${symbol} to watchlist`));
        } else {
          terminal.addOutput(createOutput('info', `${symbol} already in watchlist`));
        }
        break;
      }
      case 'remove': {
        const symbol = args[1]?.toUpperCase();
        if (!symbol) {
          terminal.addOutput(createOutput('error', 'Usage: watchlist remove <symbol>'));
          return;
        }
        const list = getWatchlist().filter((s) => s !== symbol);
        saveWatchlist(list);
        terminal.addOutput(createOutput('success', `Removed ${symbol} from watchlist`));
        break;
      }
      case 'clear': {
        saveWatchlist([]);
        terminal.addOutput(createOutput('success', 'Watchlist cleared'));
        break;
      }
      case 'list':
      default: {
        const list = getWatchlist();
        if (list.length === 0) {
          terminal.addOutput(createOutput('info', 'Watchlist is empty. Use "watchlist add <symbol>" to add symbols.'));
          return;
        }

        terminal.addOutput(createOutput('stdout', ''));
        terminal.addOutput(createOutput('stdout', '  Watchlist'));
        terminal.addOutput(createOutput('stdout', '  ─────────'));

        for (const symbol of list) {
          service.subscribe(symbol, ['ticker']);
          await sleep(50);
          const ticker = service.getTicker(symbol);
          if (ticker) {
            const changeClass = ticker.changePercent24h >= 0 ? 'price-up' : 'price-down';
            terminal.addOutput(createOutput('stdout', `  ${symbol.padEnd(12)} ${formatPrice(ticker.price).padStart(14)} <span class="${changeClass}">${formatPercent(ticker.changePercent24h)}</span>`));
          } else {
            terminal.addOutput(createOutput('stdout', `  ${symbol.padEnd(12)} loading...`));
          }
        }
        terminal.addOutput(createOutput('stdout', ''));
      }
    }
  },
  completions: (partial) => ['add', 'remove', 'list', 'clear'].filter((c) => c.startsWith(partial.toLowerCase())),
});

registerCommand({
  name: 'orderbook',
  aliases: ['ob', 'depth', 'book'],
  description: 'Show order book depth for a symbol',
  usage: 'orderbook <symbol> [exchange] [levels]',
  examples: ['orderbook BTCUSDT', 'ob BTCUSD coinbase 20', 'depth ETHUSDT 10'],
  category: 'market',
  handler: async (args, terminal) => {
    if (args.length === 0) {
      terminal.addOutput(createOutput('error', 'Usage: orderbook <symbol> [exchange] [levels]'));
      return;
    }

    const symbol = args[0].toUpperCase();
    const exchange = (args[1] as Exchange) || 'binance';
    const levels = parseInt(args[2]) || 15;

    const service = getMarketService();
    service.subscribe(symbol, ['orderbook'], exchange);
    await sleep(100);

    const ob = service.getOrderBook(symbol);
    if (!ob) {
      terminal.addOutput(createOutput('warn', `No orderbook data for ${symbol}. Waiting for feed...`));
      return;
    }

    terminal.addOutput(createOutput('stdout', ''));
    terminal.addOutput(createOutput('stdout', `  ${symbol} Order Book (Top ${levels})`));
    terminal.addOutput(createOutput('stdout', `  ─────────────────────────────────`));

    const totalBidVol = ob.bids.slice(0, levels).reduce((sum, b) => sum + b.size, 0);
    const totalAskVol = ob.asks.slice(0, levels).reduce((sum, a) => sum + a.size, 0);
    const maxVol = Math.max(totalBidVol, totalAskVol);

    for (let i = levels - 1; i >= 0; i--) {
      const ask = ob.asks[i];
      if (!ask) continue;
      const barWidth = maxVol > 0 ? Math.round((ask.size / maxVol) * 30) : 0;
      const bar = '█'.repeat(barWidth);
      terminal.addOutput(createOutput('stdout', `  <span class="price-down">${formatPrice(ask.price)}</span> │ ${formatNumber(ask.size).padStart(12)} │ ${bar}`));
    }

    const spread = ob.asks[0]?.price && ob.bids[0]?.price ? ob.asks[0].price - ob.bids[0].price : 0;
    const spreadPct = ob.bids[0]?.price ? (spread / ob.bids[0].price) * 100 : 0;
    terminal.addOutput(createOutput('stdout', `  ─────────────────────────────────`));
    terminal.addOutput(createOutput('stdout', `  Spread: ${formatPrice(spread)} (${spreadPct.toFixed(4)}%)`));

    for (let i = 0; i < levels; i++) {
      const bid = ob.bids[i];
      if (!bid) continue;
      const barWidth = maxVol > 0 ? Math.round((bid.size / maxVol) * 30) : 0;
      const bar = '█'.repeat(barWidth);
      terminal.addOutput(createOutput('stdout', `  <span class="price-up">${formatPrice(bid.price)}</span> │ ${formatNumber(bid.size).padStart(12)} │ ${bar}`));
    }
    terminal.addOutput(createOutput('stdout', ''));
  },
});

registerCommand({
  name: 'trades',
  aliases: ['tape', 't'],
  description: 'Show recent trades (time & sales)',
  usage: 'trades <symbol> [exchange] [limit]',
  examples: ['trades BTCUSDT', 'tape BTCUSD coinbase 20', 't ETHUSDT 50'],
  category: 'market',
  handler: async (args, terminal) => {
    if (args.length === 0) {
      terminal.addOutput(createOutput('error', 'Usage: trades <symbol> [exchange] [limit]'));
      return;
    }

    const symbol = args[0].toUpperCase();
    const exchange = (args[1] as Exchange) || 'binance';
    const limit = parseInt(args[2]) || 20;

    const service = getMarketService();
    service.subscribe(symbol, ['trades'], exchange);
    await sleep(100);

    const trades = service.getTrades(symbol, limit);
    if (trades.length === 0) {
      terminal.addOutput(createOutput('warn', `No trade data for ${symbol}. Waiting for feed...`));
      return;
    }

    terminal.addOutput(createOutput('stdout', ''));
    terminal.addOutput(createOutput('stdout', `  ${symbol} Recent Trades (Last ${trades.length})`));
    terminal.addOutput(createOutput('stdout', `  ──────────────────────────────────────`));

    for (const trade of trades) {
      const time = new Date(trade.timestamp).toLocaleTimeString();
      const sideClass = trade.side === 'buy' ? 'price-up' : 'price-down';
      const sideSymbol = trade.side === 'buy' ? '▲' : '▼';
      terminal.addOutput(createOutput('stdout', `  ${time} <span class="${sideClass}">${sideSymbol} ${trade.side.toUpperCase().padEnd(4)}</span> ${formatPrice(trade.price).padStart(14)} ${formatNumber(trade.size).padStart(12)}`));
    }
    terminal.addOutput(createOutput('stdout', ''));
  },
});

registerCommand({
  name: 'funding',
  aliases: ['fr', 'fund'],
  description: 'Show funding rate for perpetual futures',
  usage: 'funding <symbol> [exchange]',
  examples: ['funding BTCUSDT', 'fr ETHUSDT binance'],
  category: 'market',
  handler: async (args, terminal) => {
    if (args.length === 0) {
      terminal.addOutput(createOutput('error', 'Usage: funding <symbol> [exchange]'));
      return;
    }

    const symbol = args[0].toUpperCase();
    const exchange = (args[1] as Exchange) || 'binance';

    const service = getMarketService();
    service.subscribe(symbol, ['funding'], exchange);
    await sleep(100);

    const funding = service.getFundingRate(symbol);
    if (!funding) {
      terminal.addOutput(createOutput('warn', `No funding data for ${symbol}. Waiting for feed...`));
      return;
    }

    const nextFunding = new Date(funding.nextFundingTime).toLocaleString();
    const annualized = funding.rate * 3 * 365 * 100;

    terminal.addOutput(createOutput('stdout', ''));
    terminal.addOutput(createOutput('stdout', `  ${symbol} Funding Rate`));
    terminal.addOutput(createOutput('stdout', `  ────────────────────`));
    terminal.addOutput(createOutput('stdout', `  Current Rate:     ${(funding.rate * 100).toFixed(6)}%`));
    terminal.addOutput(createOutput('stdout', `  Annualized:       ${annualized.toFixed(2)}%`));
    terminal.addOutput(createOutput('stdout', `  Next Funding:     ${nextFunding}`));
    terminal.addOutput(createOutput('stdout', ''));
  },
});

registerCommand({
  name: 'oi',
  aliases: ['openinterest'],
  description: 'Show open interest',
  usage: 'oi <symbol> [exchange]',
  examples: ['oi BTCUSDT', 'openinterest ETHUSDT'],
  category: 'market',
  handler: async (args, terminal) => {
    if (args.length === 0) {
      terminal.addOutput(createOutput('error', 'Usage: oi <symbol> [exchange]'));
      return;
    }

    const symbol = args[0].toUpperCase();
    const exchange = (args[1] as Exchange) || 'binance';

    const service = getMarketService();
    service.subscribe(symbol, ['open_interest'], exchange);
    await sleep(100);

    const oi = service.getOpenInterest(symbol);
    if (!oi) {
      terminal.addOutput(createOutput('warn', `No open interest data for ${symbol}. Waiting for feed...`));
      return;
    }

    terminal.addOutput(createOutput('stdout', ''));
    terminal.addOutput(createOutput('stdout', `  ${symbol} Open Interest`));
    terminal.addOutput(createOutput('stdout', `  ──────────────────────`));
    terminal.addOutput(createOutput('stdout', `  Open Interest: ${formatNumber(oi.openInterest)}`));
    terminal.addOutput(createOutput('stdout', ''));
  },
});

// ============================================
// Chart Commands
// ============================================

registerCommand({
  name: 'chart',
  aliases: ['c', 'candle', 'candles'],
  description: 'Display candlestick chart',
  usage: 'chart <symbol> [timeframe] [exchange] [limit]',
  examples: ['chart BTCUSDT', 'chart BTCUSDT 1h', 'c ETHUSDT 4h coinbase 100', 'chart SOLUSDT 1d 200'],
  category: 'chart',
  handler: async (args, terminal) => {
    if (args.length === 0) {
      terminal.addOutput(createOutput('error', 'Usage: chart <symbol> [timeframe] [exchange] [limit]'));
      return;
    }

    const symbol = args[0].toUpperCase();
    const timeframe = (args[1] as Timeframe) || '1h';
    const exchange = (args[2] as Exchange) || 'binance';
    const limit = parseInt(args[3]) || 100;

    const validTimeframes: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];
    if (!validTimeframes.includes(timeframe)) {
      terminal.addOutput(createOutput('error', `Invalid timeframe. Valid: ${validTimeframes.join(', ')}`));
      return;
    }

    const service = getMarketService();
    const channel = `ohlcv_${timeframe}` as MarketChannel;
    service.subscribe(symbol, [channel], exchange);
    await sleep(100);

    const candles = service.getCandles(symbol, timeframe, limit);
    if (candles.length === 0) {
      terminal.addOutput(createOutput('warn', `No candle data for ${symbol} ${timeframe}. Waiting for feed...`));
      return;
    }

    terminal.addOutput(createOutput('chart', {
      symbol,
      timeframe,
      exchange,
      candles: candles.map((c) => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      })),
    }));
  },
  completions: (partial) => {
    const validTimeframes: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];
    return validTimeframes.filter((t) => t.startsWith(partial.toLowerCase()));
  },
});

registerCommand({
  name: 'heatmap',
  aliases: ['hm', 'correlation'],
  description: 'Show correlation heatmap',
  usage: 'heatmap [symbols...] [period]',
  examples: ['heatmap', 'heatmap BTCUSDT ETHUSDT SOLUSDT', 'hm BTCUSDT ETHUSDT 30d'],
  category: 'chart',
  handler: async (args, terminal) => {
    terminal.addOutput(createOutput('info', 'Correlation heatmap - implementing...'));
  },
});

// ============================================
// Technical Analysis Commands
// ============================================

registerCommand({
  name: 'rsi',
  aliases: ['r'],
  description: 'Calculate RSI indicator',
  usage: 'rsi <symbol> [timeframe] [period] [exchange]',
  examples: ['rsi BTCUSDT', 'rsi BTCUSDT 1h 14', 'r ETHUSDT 4h'],
  category: 'analysis',
  handler: async (args, terminal) => {
    if (args.length === 0) {
      terminal.addOutput(createOutput('error', 'Usage: rsi <symbol> [timeframe] [period] [exchange]'));
      return;
    }

    const symbol = args[0].toUpperCase();
    const timeframe = (args[1] as Timeframe) || '1h';
    const period = parseInt(args[2]) || 14;
    const exchange = (args[3] as Exchange) || 'binance';

    terminal.addOutput(createOutput('info', `Calculating RSI(${period}) for ${symbol} ${timeframe}...`));
    terminal.addOutput(createOutput('stdout', 'RSI calculation - implementing...'));
  },
});

registerCommand({
  name: 'macd',
  aliases: ['m'],
  description: 'Calculate MACD indicator',
  usage: 'macd <symbol> [timeframe] [fast] [slow] [signal] [exchange]',
  examples: ['macd BTCUSDT', 'macd BTCUSDT 1h 12 26 9', 'm ETHUSDT 4h'],
  category: 'analysis',
  handler: async (args, terminal) => {
    if (args.length === 0) {
      terminal.addOutput(createOutput('error', 'Usage: macd <symbol> [timeframe] [fast] [slow] [signal] [exchange]'));
      return;
    }

    terminal.addOutput(createOutput('stdout', 'MACD calculation - implementing...'));
  },
});

registerCommand({
  name: 'indicators',
  aliases: ['ind', 'ta'],
  description: 'Show all technical indicators for a symbol',
  usage: 'indicators <symbol> [timeframe] [exchange]',
  examples: ['indicators BTCUSDT', 'ta ETHUSDT 4h', 'ind SOLUSDT 1d coinbase'],
  category: 'analysis',
  handler: async (args, terminal) => {
    if (args.length === 0) {
      terminal.addOutput(createOutput('error', 'Usage: indicators <symbol> [timeframe] [exchange]'));
      return;
    }

    terminal.addOutput(createOutput('stdout', 'Technical indicators panel - implementing...'));
  },
});

registerCommand({
  name: 'volatility',
  aliases: ['vol', 'atr'],
  description: 'Calculate volatility metrics',
  usage: 'volatility <symbol> [timeframe] [period] [exchange]',
  examples: ['volatility BTCUSDT', 'vol ETHUSDT 1d 20', 'atr SOLUSDT 4h'],
  category: 'analysis',
  handler: async (args, terminal) => {
    if (args.length === 0) {
      terminal.addOutput(createOutput('error', 'Usage: volatility <symbol> [timeframe] [period] [exchange]'));
      return;
    }

    terminal.addOutput(createOutput('stdout', 'Volatility analysis - implementing...'));
  },
});

registerCommand({
  name: 'drawdown',
  aliases: ['dd', 'maxdd'],
  description: 'Calculate maximum drawdown',
  usage: 'drawdown <symbol> [timeframe] [exchange]',
  examples: ['drawdown BTCUSDT', 'dd ETHUSDT 1d', 'maxdd SOLUSDT 4h'],
  category: 'analysis',
  handler: async (args, terminal) => {
    if (args.length === 0) {
      terminal.addOutput(createOutput('error', 'Usage: drawdown <symbol> [timeframe] [exchange]'));
      return;
    }

    terminal.addOutput(createOutput('stdout', 'Drawdown analysis - implementing...'));
  },
});

registerCommand({
  name: 'sharpe',
  aliases: ['sr'],
  description: 'Calculate Sharpe ratio',
  usage: 'sharpe <symbol> [timeframe] [riskFreeRate] [exchange]',
  examples: ['sharpe BTCUSDT', 'sr ETHUSDT 1d 0.02', 'sharpe SOLUSDT 4h 0.05'],
  category: 'analysis',
  handler: async (args, terminal) => {
    if (args.length === 0) {
      terminal.addOutput(createOutput('error', 'Usage: sharpe <symbol> [timeframe] [riskFreeRate] [exchange]'));
      return;
    }

    terminal.addOutput(createOutput('stdout', 'Sharpe ratio calculation - implementing...'));
  },
});

registerCommand({
  name: 'regime',
  aliases: ['marketregime', 'mr'],
  description: 'Detect market regime',
  usage: 'regime <symbol> [timeframe] [exchange]',
  examples: ['regime BTCUSDT', 'mr ETHUSDT 1d', 'regime SOLUSDT 4h'],
  category: 'analysis',
  handler: async (args, terminal) => {
    if (args.length === 0) {
      terminal.addOutput(createOutput('error', 'Usage: regime <symbol> [timeframe] [exchange]'));
      return;
    }

    terminal.addOutput(createOutput('stdout', 'Market regime detection - implementing...'));
  },
});

// ============================================
// Quant Analytics Commands
// ============================================

registerCommand({
  name: 'analyze',
  aliases: ['a', 'quant'],
  description: 'Full quantitative analysis of a symbol',
  usage: 'analyze <symbol> [timeframe] [exchange]',
  examples: ['analyze BTCUSDT', 'a ETHUSDT 1d', 'quant SOLUSDT 4h coinbase'],
  category: 'analysis',
  handler: async (args, terminal) => {
    if (args.length === 0) {
      terminal.addOutput(createOutput('error', 'Usage: analyze <symbol> [timeframe] [exchange]'));
      return;
    }

    const symbol = args[0].toUpperCase();
    const timeframe = (args[1] as Timeframe) || '1d';
    const exchange = (args[2] as Exchange) || 'binance';

    terminal.addOutput(createOutput('stdout', ''));
    terminal.addOutput(createOutput('stdout', `  ╔══════════════════════════════════════╗`));
    terminal.addOutput(createOutput('stdout', `  ║  QUANTITATIVE ANALYSIS: ${symbol.padEnd(12)} ║`));
    terminal.addOutput(createOutput('stdout', `  ╚══════════════════════════════════════╝`));
    terminal.addOutput(createOutput('stdout', ''));
    terminal.addOutput(createOutput('info', 'Running full quant analysis...'));
    terminal.addOutput(createOutput('stdout', ''));
    terminal.addOutput(createOutput('stdout', '  [1/6] Fetching market data...'));
    terminal.addOutput(createOutput('stdout', '  [2/6] Calculating returns...'));
    terminal.addOutput(createOutput('stdout', '  [3/6] Computing risk metrics...'));
    terminal.addOutput(createOutput('stdout', '  [4/6] Detecting regime...'));
    terminal.addOutput(createOutput('stdout', '  [5/6] Running factor analysis...'));
    terminal.addOutput(createOutput('stdout', '  [6/6] Generating report...'));
    terminal.addOutput(createOutput('stdout', ''));
    terminal.addOutput(createOutput('success', 'Analysis complete - implementing detailed output...'));
  },
});

registerCommand({
  name: 'compare',
  aliases: ['vs', 'correlation'],
  description: 'Compare multiple symbols',
  usage: 'compare <symbol1> <symbol2> [timeframe] [exchange]',
  examples: ['compare BTCUSDT ETHUSDT', 'vs BTCUSDT SOLUSDT 1d', 'compare BTCUSDT ETHUSDT 4h coinbase'],
  category: 'analysis',
  handler: async (args, terminal) => {
    if (args.length < 2) {
      terminal.addOutput(createOutput('error', 'Usage: compare <symbol1> <symbol2> [timeframe] [exchange]'));
      return;
    }

    terminal.addOutput(createOutput('stdout', 'Symbol comparison - implementing...'));
  },
});

registerCommand({
  name: 'backtest',
  aliases: ['bt', 'test'],
  description: 'Run strategy backtest',
  usage: 'backtest <strategy> <symbol> [timeframe] [start] [end]',
  examples: ['backtest sma_cross BTCUSDT', 'bt rsi_mean_revert ETHUSDT 1h 2024-01-01 2024-12-31'],
  category: 'analysis',
  handler: async (args, terminal) => {
    if (args.length < 2) {
      terminal.addOutput(createOutput('error', 'Usage: backtest <strategy> <symbol> [timeframe] [start] [end]'));
      return;
    }

    terminal.addOutput(createOutput('stdout', 'Backtesting engine - implementing...'));
  },
});

registerCommand({
  name: 'scan',
  aliases: ['screener', 'screen'],
  description: 'Scan symbols for conditions',
  usage: 'scan <condition> [symbols...] [timeframe]',
  examples: ['scan "rsi < 30"', 'scan "price > sma20" BTCUSDT ETHUSDT SOLUSDT', 'screen "volume > avg_volume*2"'],
  category: 'analysis',
  handler: async (args, terminal) => {
    if (args.length === 0) {
      terminal.addOutput(createOutput('error', 'Usage: scan <condition> [symbols...] [timeframe]'));
      terminal.addOutput(createOutput('info', 'Example conditions: "rsi < 30", "price > sma20", "volume > avg_volume*2"'));
      return;
    }

    terminal.addOutput(createOutput('stdout', 'Market scanner - implementing...'));
  },
});

// ============================================
// AI Commands
// ============================================

registerCommand({
  name: 'ask',
  aliases: ['ai', 'chat'],
  description: 'Ask AI assistant a question',
  usage: 'ask <question>',
  examples: ['ask "Why is BTC pumping?"', 'ai "Explain the current market structure"', 'chat "What\'s your view on ETH?"'],
  category: 'ai',
  handler: async (args, terminal) => {
    if (args.length === 0) {
      terminal.addOutput(createOutput('error', 'Usage: ask <question>'));
      return;
    }

    const question = args.join(' ');
    terminal.addOutput(createOutput('stdout', ''));
    terminal.addOutput(createOutput('info', `🤖 AI: Thinking...`));

    await sleep(500);
    terminal.addOutput(createOutput('stdout', `AI Assistant response to: "${question}"`));
    terminal.addOutput(createOutput('stdout', 'AI integration - implementing with Vercel AI SDK...'));
  },
});

registerCommand({
  name: 'explain',
  aliases: ['exp'],
  description: 'Explain a chart or indicator',
  usage: 'explain <chart|indicator|signal> <symbol> [timeframe]',
  examples: ['explain chart BTCUSDT 1h', 'exp indicator rsi BTCUSDT', 'explain signal macd ETHUSDT 4h'],
  category: 'ai',
  handler: async (args, terminal) => {
    if (args.length < 2) {
      terminal.addOutput(createOutput('error', 'Usage: explain <chart|indicator|signal> <symbol> [timeframe]'));
      return;
    }

    terminal.addOutput(createOutput('stdout', 'Chart/indicator explanation - implementing...'));
  },
});

registerCommand({
  name: 'forecast',
  aliases: ['predict', 'pred'],
  description: 'AI price forecast',
  usage: 'forecast <symbol> [timeframe] [horizon]',
  examples: ['forecast BTCUSDT', 'predict ETHUSDT 1h 24h', 'pred SOLUSDT 4h 7d'],
  category: 'ai',
  handler: async (args, terminal) => {
    if (args.length === 0) {
      terminal.addOutput(createOutput('error', 'Usage: forecast <symbol> [timeframe] [horizon]'));
      return;
    }

    terminal.addOutput(createOutput('stdout', 'AI price forecast - implementing...'));
  },
});

// ============================================
// Portfolio Commands
// ============================================

registerCommand({
  name: 'portfolio',
  aliases: ['pf', 'balance', 'pos'],
  description: 'Show portfolio overview',
  usage: 'portfolio [exchange]',
  examples: ['portfolio', 'pf binance', 'balance coinbase'],
  category: 'portfolio',
  handler: async (args, terminal) => {
    const exchange = (args[0] as Exchange) || 'binance';

    terminal.addOutput(createOutput('stdout', ''));
    terminal.addOutput(createOutput('stdout', `  Portfolio Overview (${exchange.toUpperCase()})`));
    terminal.addOutput(createOutput('stdout', `  ═══════════════════════════════════`));
    terminal.addOutput(createOutput('stdout', ''));
    terminal.addOutput(createOutput('info', 'Portfolio integration - implementing...'));
  },
});

registerCommand({
  name: 'positions',
  aliases: ['pos', 'open'],
  description: 'Show open positions',
  usage: 'positions [exchange]',
  examples: ['positions', 'pos binance', 'open coinbase'],
  category: 'portfolio',
  handler: async (args, terminal) => {
    terminal.addOutput(createOutput('stdout', 'Positions view - implementing...'));
  },
});

registerCommand({
  name: 'pnl',
  aliases: ['profit', 'pl'],
  description: 'Show P&L summary',
  usage: 'pnl [timeframe] [exchange]',
  examples: ['pnl', 'pnl 24h', 'profit 7d binance', 'pl 30d'],
  category: 'portfolio',
  handler: async (args, terminal) => {
    terminal.addOutput(createOutput('stdout', 'P&L analysis - implementing...'));
  },
});

// ============================================
// Macro Commands
// ============================================

registerCommand({
  name: 'macro',
  aliases: ['eco', 'events', 'calendar'],
  description: 'Show macroeconomic calendar',
  usage: 'macro [country] [importance]',
  examples: ['macro', 'macro US high', 'eco EU medium', 'calendar US'],
  category: 'macro',
  handler: async (args, terminal) => {
    terminal.addOutput(createOutput('stdout', 'Macroeconomic calendar - implementing...'));
  },
});

registerCommand({
  name: 'news',
  aliases: ['n', 'headlines'],
  description: 'Show latest news',
  usage: 'news [symbol] [limit]',
  examples: ['news', 'news BTCUSDT', 'n ETHUSDT 10', 'headlines BTCUSDT 5'],
  category: 'macro',
  handler: async (args, terminal) => {
    terminal.addOutput(createOutput('stdout', 'News feed - implementing...'));
  },
});

registerCommand({
  name: 'feargreed',
  aliases: ['fg', 'sentiment'],
  description: 'Show Fear & Greed Index',
  usage: 'feargreed',
  examples: ['feargreed', 'fg', 'sentiment'],
  category: 'macro',
  handler: async (args, terminal) => {
    terminal.addOutput(createOutput('stdout', 'Fear & Greed Index - implementing...'));
  },
});

// ============================================
// System Commands
// ============================================

registerCommand({
  name: 'help',
  aliases: ['h', '?'],
  description: 'Show help for commands',
  usage: 'help [command]',
  examples: ['help', 'help price', 'h chart'],
  category: 'system',
  handler: async (args, terminal) => {
    if (args.length > 0) {
      const cmd = getCommand(args[0]);
      if (cmd) {
        terminal.addOutput(createOutput('stdout', ''));
        terminal.addOutput(createOutput('stdout', `  ${cmd.name.toUpperCase()}`));
        terminal.addOutput(createOutput('stdout', `  ────────────────`));
        terminal.addOutput(createOutput('stdout', `  Description: ${cmd.description}`));
        terminal.addOutput(createOutput('stdout', `  Usage:       ${cmd.usage}`));
        terminal.addOutput(createOutput('stdout', `  Aliases:     ${cmd.aliases.join(', ')}`));
        terminal.addOutput(createOutput('stdout', `  Category:    ${cmd.category}`));
        terminal.addOutput(createOutput('stdout', `  Examples:`));
        for (const ex of cmd.examples) {
          terminal.addOutput(createOutput('stdout', `    ${ex}`));
        }
        terminal.addOutput(createOutput('stdout', ''));
      } else {
        terminal.addOutput(createOutput('error', `Unknown command: ${args[0]}`));
      }
      return;
    }

    const categories = ['market', 'chart', 'analysis', 'ai', 'portfolio', 'macro', 'system'] as const;
    terminal.addOutput(createOutput('stdout', ''));
    terminal.addOutput(createOutput('stdout', `  QUANT TERMINAL - COMMAND REFERENCE`));
    terminal.addOutput(createOutput('stdout', `  ═══════════════════════════════════`));
    terminal.addOutput(createOutput('stdout', ''));
    terminal.addOutput(createOutput('stdout', `  Type "help <command>" for details`));
    terminal.addOutput(createOutput('stdout', `  Press TAB for auto-complete`));
    terminal.addOutput(createOutput('stdout', `  Press ↑/↓ for history`));
    terminal.addOutput(createOutput('stdout', ''));

    for (const cat of categories) {
      const cmds = getCommandsByCategory(cat);
      if (cmds.length === 0) continue;

      terminal.addOutput(createOutput('stdout', `  ${cat.toUpperCase()}`));
      terminal.addOutput(createOutput('stdout', `  ${'─'.repeat(cat.length + 2)}`));
      for (const cmd of cmds) {
        const aliases = cmd.aliases.length > 0 ? ` (${cmd.aliases.join(', ')})` : '';
        terminal.addOutput(createOutput('stdout', `    ${cmd.name.padEnd(14)}${aliases.padEnd(20)} ${cmd.description}`));
      }
      terminal.addOutput(createOutput('stdout', ''));
    }
  },
  completions: (partial) => getCommandCompletions(partial),
});

registerCommand({
  name: 'clear',
  aliases: ['cls', 'reset'],
  description: 'Clear terminal output',
  usage: 'clear',
  examples: ['clear', 'cls'],
  category: 'system',
  handler: async (args, terminal) => {
    terminal.addOutput(createOutput('stdout', ''));
    terminal.addOutput({ type: 'stdout', content: '__CLEAR__', timestamp: Date.now() });
  },
});

registerCommand({
  name: 'history',
  aliases: ['hist'],
  description: 'Show command history',
  usage: 'history [limit]',
  examples: ['history', 'history 20', 'hist 50'],
  category: 'system',
  handler: async (args, terminal) => {
    const limit = parseInt(args[0]) || 50;
    terminal.addOutput(createOutput('stdout', `Command history (last ${limit}) - implementing...`));
  },
});

registerCommand({
  name: 'theme',
  aliases: ['colors'],
  description: 'Change terminal theme',
  usage: 'theme <dark|light|terminal|high-contrast>',
  examples: ['theme dark', 'theme terminal', 'colors high-contrast'],
  category: 'system',
  handler: async (args, terminal) => {
    if (args.length === 0) {
      terminal.addOutput(createOutput('error', 'Usage: theme <dark|light|terminal|high-contrast>'));
      return;
    }

    terminal.addOutput(createOutput('info', `Theme switching - implementing...`));
  },
});

registerCommand({
  name: 'layout',
  aliases: ['workspace', 'ws'],
  description: 'Manage workspace layout',
  usage: 'layout <save|load|list|reset> [name]',
  examples: ['layout save default', 'layout load trading', 'layout list', 'ws reset'],
  category: 'system',
  handler: async (args, terminal) => {
    terminal.addOutput(createOutput('stdout', 'Workspace layout management - implementing...'));
  },
});

registerCommand({
  name: 'connect',
  aliases: ['conn', 'ws'],
  description: 'Manage WebSocket connection',
  usage: 'connect [status|reconnect|disconnect]',
  examples: ['connect status', 'connect reconnect', 'conn disconnect', 'ws'],
  category: 'system',
  handler: async (args, terminal) => {
    const service = getMarketService();
    const action = args[0]?.toLowerCase() || 'status';

    switch (action) {
      case 'status': {
        const state = service.getConnectionState();
        terminal.addOutput(createOutput('stdout', ''));
        terminal.addOutput(createOutput('stdout', `  Connection Status`));
        terminal.addOutput(createOutput('stdout', `  ─────────────────`));
        terminal.addOutput(createOutput('stdout', `  Status:     ${state.status}`));
        terminal.addOutput(createOutput('stdout', `  Provider:   ${service['wsManager']?.getProvider() || 'unknown'}`));
        terminal.addOutput(createOutput('stdout', `  Latency:    ${state.latency ? `${state.latency}ms` : 'N/A'}`));
        terminal.addOutput(createOutput('stdout', `  Reconnections: ${state.reconnectAttempts}`));
        terminal.addOutput(createOutput('stdout', ''));
        break;
      }
      case 'reconnect': {
        terminal.addOutput(createOutput('info', 'Reconnecting...'));
        await service.disconnect();
        await service.initialize();
        terminal.addOutput(createOutput('success', 'Reconnected'));
        break;
      }
      case 'disconnect': {
        await service.disconnect();
        terminal.addOutput(createOutput('success', 'Disconnected'));
        break;
      }
      default: {
        terminal.addOutput(createOutput('error', 'Usage: connect [status|reconnect|disconnect]'));
      }
    }
  },
  completions: (partial) => ['status', 'reconnect', 'disconnect'].filter((c) => c.startsWith(partial.toLowerCase())),
});

registerCommand({
  name: 'version',
  aliases: ['v', 'ver'],
  description: 'Show version information',
  usage: 'version',
  examples: ['version', 'v', 'ver'],
  category: 'system',
  handler: async (args, terminal) => {
    terminal.addOutput(createOutput('stdout', ''));
    terminal.addOutput(createOutput('stdout', `  QUANT TERMINAL v0.1.0`));
    terminal.addOutput(createOutput('stdout', `  ─────────────────────`));
    terminal.addOutput(createOutput('stdout', `  Next.js 15 | React 19 | TypeScript`));
    terminal.addOutput(createOutput('stdout', `  Tailwind CSS | Zustand | Ably`));
    terminal.addOutput(createOutput('stdout', `  Vercel AI SDK | shadcn/ui`));
    terminal.addOutput(createOutput('stdout', ''));
    terminal.addOutput(createOutput('stdout', `  Built for professional quantitative analysis`));
    terminal.addOutput(createOutput('stdout', ''));
  },
});

registerCommand({
  name: 'exit',
  aliases: ['quit', 'q'],
  description: 'Exit terminal (close panel)',
  usage: 'exit',
  examples: ['exit', 'quit', 'q'],
  category: 'system',
  handler: async (args, terminal) => {
    terminal.addOutput(createOutput('info', 'Use the minimize button to hide the terminal panel'));
  },
});

// ============================================
// End of module
// ============================================
