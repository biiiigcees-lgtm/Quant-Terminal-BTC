/**
 * Quant Terminal - Main Dashboard
 * Professional quantitative analysis platform
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { TerminalPanel } from '@/components/terminal/TerminalPanel';
import { ChartPanel } from '@/components/charts/Chart';
import { getMarketService } from '@/lib/market/service';
import { useTerminalStore } from '@/store/terminal';
import type { ChartDataPoint, Timeframe, MarketChannel } from '@/types/market';

// ============================================
// Mock Data Generator (for demo)
// ============================================

function generateMockCandles(symbol: string, count: number = 500): ChartDataPoint[] {
  const candles: ChartDataPoint[] = [];
  let price = symbol.includes('BTC') ? 65000 : symbol.includes('ETH') ? 3200 : 150;
  let time = Date.now() - count * 60 * 60 * 1000; // 1h intervals

  for (let i = 0; i < count; i++) {
    const volatility = price * 0.02;
    const change = (Math.random() - 0.5) * volatility;
    price = Math.max(price + change, price * 0.5);
    
    const open = price;
    const high = price + Math.random() * volatility * 0.5;
    const low = price - Math.random() * volatility * 0.5;
    const close = low + Math.random() * (high - low);
    const volume = Math.random() * 1000 + 100;

    candles.push({
      time: time + i * 60 * 60 * 1000,
      open,
      high,
      low,
      close,
      volume,
    });
    
    price = close;
  }

  return candles;
}

// ============================================
// Main Dashboard Component
// ============================================

export default function QuantTerminal() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [exchange, setExchange] = useState('binance');
  const [candles, setCandles] = useState<ChartDataPoint[]>([]);
  const [selectedIndicators, setSelectedIndicators] = useState<string[]>(['EMA 9', 'EMA 20', 'VWAP']);
  const [terminalHeight, setTerminalHeight] = useState(35);
  const [isTerminalOpen, setIsTerminalOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  const terminalStore = useTerminalStore();

  // Initialize market service and load data
  useEffect(() => {
    const initMarket = async () => {
      setIsLoading(true);
      const service = getMarketService();
      
      try {
        await service.initialize();
        setConnectionStatus('connected');
      } catch (error) {
        console.error('Failed to initialize market service:', error);
        setConnectionStatus('disconnected');
      }

      // Load initial candles
      const mockCandles = generateMockCandles(symbol, 500);
      setCandles(mockCandles);

      // Subscribe to real-time updates
      const channel = `ohlcv_${timeframe}` as MarketChannel;
      service.subscribe(symbol, [channel, 'ticker', 'trades', 'orderbook'], exchange as any);

      // Set up update listener
      const unsubscribe = service.onUpdate((event) => {
        if (event.symbol === symbol && event.channel === channel) {
          const newCandle = event.data as ChartDataPoint;
          setCandles(prev => {
            const updated = [...prev];
            const lastIdx = updated.findIndex(c => c.time === newCandle.time);
            if (lastIdx >= 0) {
              updated[lastIdx] = newCandle;
            } else {
              updated.push(newCandle);
              if (updated.length > 500) updated.shift();
            }
            return updated;
          });
        }
      });

      setIsLoading(false);

      return () => {
        unsubscribe();
        service.unsubscribe(symbol, exchange as any);
      };
    };

    initMarket();
  }, [symbol, timeframe, exchange]);

  // Handle timeframe change
  const handleTimeframeChange = useCallback((tf: Timeframe) => {
    setTimeframe(tf);
    setCandles(generateMockCandles(symbol, 500));
  }, [symbol]);

  // Handle symbol change
  const handleSymbolChange = useCallback((sym: string) => {
    setSymbol(sym);
    setCandles(generateMockCandles(sym, 500));
  }, []);

  // Handle terminal toggle
  const toggleTerminal = useCallback(() => {
    setIsTerminalOpen(!isTerminalOpen);
  }, [isTerminalOpen]);

  // Available symbols
  const availableSymbols = [
    'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
    'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT',
    'BTCUSD', 'ETHUSD', 'SOLUSD',
  ];

  return (
    <div className="h-screen w-full bg-terminal-bg font-sans">
      {/* Top Bar */}
      <header className="terminal-panel-header flex items-center justify-between px-4 py-2 border-b border-terminal-border">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-terminal-success animate-pulse-soft" />
            <span className="text-terminal-fg font-mono text-terminal-sm font-medium">QUANT TERMINAL</span>
            <span className="badge-terminal neutral">v0.1.0</span>
          </div>
          
          <div className="flex items-center gap-1 border-l border-terminal-border pl-4">
            <span className="text-terminal-fgMuted text-[10px] font-mono uppercase">SYMBOL</span>
            <select
              value={symbol}
              onChange={(e) => handleSymbolChange(e.target.value)}
              className="select-terminal text-terminal-sm bg-transparent border-none focus:ring-0 px-2"
            >
              {availableSymbols.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1 border-l border-terminal-border pl-4">
            <span className="text-terminal-fgMuted text-[10px] font-mono uppercase">EXCHANGE</span>
            <select
              value={exchange}
              onChange={(e) => setExchange(e.target.value)}
              className="select-terminal text-terminal-sm bg-transparent border-none focus:ring-0 px-2"
            >
              <option value="binance">BINANCE</option>
              <option value="coinbase">COINBASE</option>
              <option value="kraken">KRAKEN</option>
              <option value="bybit">BYBIT</option>
              <option value="okx">OKX</option>
            </select>
          </div>

          <div className="flex items-center gap-1 border-l border-terminal-border pl-4">
            <span className="text-terminal-fgMuted text-[10px] font-mono uppercase">TF</span>
            <select
              value={timeframe}
              onChange={(e) => handleTimeframeChange(e.target.value as Timeframe)}
              className="select-terminal text-terminal-sm bg-transparent border-none focus:ring-0 px-2"
            >
              <option value="1m">1M</option>
              <option value="5m">5M</option>
              <option value="15m">15M</option>
              <option value="1h">1H</option>
              <option value="4h">4H</option>
              <option value="1d">1D</option>
              <option value="1w">1W</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Connection Status */}
          <div className="flex items-center gap-1.5">
            <span className={`status-dot ${connectionStatus}`} />
            <span className={`text-[10px] font-mono uppercase ${
              connectionStatus === 'connected' ? 'text-terminal-success' : 
              connectionStatus === 'connecting' ? 'text-terminal-warning' : 'text-terminal-error'
            }`}>
              {connectionStatus.toUpperCase()}
            </span>
          </div>

          {/* Terminal Toggle */}
          <button
            onClick={toggleTerminal}
            className={`btn-terminal ${isTerminalOpen ? 'btn-terminal-primary' : ''}`}
            title="Toggle Terminal (Ctrl+`)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
            <span className="hidden sm:inline">TERMINAL</span>
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Watchlist / Navigation */}
        <aside className="terminal-panel w-64 flex-shrink-0 flex flex-col border-r border-terminal-border hidden lg:flex">
          <div className="terminal-panel-header px-3 py-2">
            <span className="text-terminal-fgMuted text-[10px] font-mono uppercase tracking-wider">WATCHLIST</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {availableSymbols.map(sym => (
              <WatchlistItem
                key={sym}
                symbol={sym}
                isActive={sym === symbol}
                onClick={() => handleSymbolChange(sym)}
              />
            ))}
          </div>
        </aside>

        {/* Center - Chart */}
        <section className="flex-1 flex flex-col min-w-0">
          <ChartPanel
            title="CHART"
            symbol={symbol}
            timeframe={timeframe}
            candles={candles}
            exchange={exchange}
            indicators={selectedIndicators}
            height={isTerminalOpen ? undefined : 'calc(100vh - 48px)'}
            onTimeframeChange={handleTimeframeChange}
            onSymbolChange={handleSymbolChange}
            availableSymbols={availableSymbols}
            selectedIndicators={selectedIndicators}
            onIndicatorsChange={setSelectedIndicators}
          />
        </section>

        {/* Right Sidebar - Order Book / Trades */}
        <aside className="terminal-panel w-64 flex-shrink-0 flex flex-col border-l border-terminal-border hidden xl:flex">
          <div className="tab-bar" role="tablist">
            <button 
              role="tab" 
              className="tab-button" 
              data-state="active"
            >ORDERBOOK</button>
            <button 
              role="tab" 
              className="tab-button" 
              data-state="inactive"
            >TRADES</button>
            <button 
              role="tab" 
              className="tab-button" 
              data-state="inactive"
            >FUNDING</button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <OrderBookPanel symbol={symbol} exchange={exchange} />
            <TradesPanel symbol={symbol} exchange={exchange} />
            <FundingPanel symbol={symbol} exchange={exchange} />
          </div>
        </aside>
      </main>

      {/* Terminal Panel */}
      <TerminalPanel
        isOpen={isTerminalOpen}
        height={terminalHeight}
        onClose={() => setIsTerminalOpen(false)}
      />

      {/* Keyboard Shortcuts Help */}
      <KeyboardShortcuts />
    </div>
  );
}

// ============================================
// Sub Components
// ============================================

function WatchlistItem({ symbol, isActive, onClick }: { 
  symbol: string; 
  isActive: boolean; 
  onClick: () => void; 
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full px-2 py-1.5 rounded-terminal text-left text-terminal-sm font-mono transition-colors ${
        isActive 
          ? 'bg-terminal-accent/15 text-terminal-accent border border-terminal-accent/30' 
          : 'text-terminal-fgSecondary hover:text-terminal-fg hover:bg-terminal-bgTertiary'
      }`}
    >
      {symbol}
    </button>
  );
}

function OrderBookPanel({ symbol, exchange }: { symbol: string; exchange: string }) {
  return (
    <div className="space-y-2">
      <div className="text-terminal-fgMuted text-[10px] font-mono uppercase tracking-wider">
        {symbol} @ {exchange.toUpperCase()}
      </div>
      <div className="text-terminal-fgMuted text-terminal-sm text-center py-8">
        Real-time order book<br/>connecting...
      </div>
    </div>
  );
}

function TradesPanel({ symbol, exchange }: { symbol: string; exchange: string }) {
  return (
    <div className="space-y-2">
      <div className="text-terminal-fgMuted text-[10px] font-mono uppercase tracking-wider">
        RECENT TRADES
      </div>
      <div className="text-terminal-fgMuted text-terminal-sm text-center py-8">
        Time & sales feed<br/>connecting...
      </div>
    </div>
  );
}

function FundingPanel({ symbol, exchange }: { symbol: string; exchange: string }) {
  return (
    <div className="space-y-2">
      <div className="text-terminal-fgMuted text-[10px] font-mono uppercase tracking-wider">
        FUNDING & OI
      </div>
      <div className="text-terminal-fgMuted text-terminal-sm text-center py-8">
        Funding rate & open interest<br/>connecting...
      </div>
    </div>
  );
}

function KeyboardShortcuts() {
  const [isOpen, setIsOpen] = useState(false);

  const shortcuts = [
    { key: 'Ctrl+`', desc: 'Toggle Terminal' },
    { key: 'Ctrl+Shift+`', desc: 'Expand Terminal' },
    { key: 'Ctrl+K / Ctrl+P', desc: 'Command Palette' },
    { key: 'Tab', desc: 'Auto-complete' },
    { key: '↑ / ↓', desc: 'Command History' },
    { key: 'Esc', desc: 'Close Dropdowns' },
  ];

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 left-4 z-40 btn-terminal-ghost p-2 rounded-terminal"
        aria-label="Keyboard shortcuts"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="M6 8h12M6 12h12M6 16h8" />
        </svg>
      </button>

      {isOpen && (
        <div className="fixed bottom-4 left-4 z-50 terminal-panel min-w-[280px] animate-slide-up">
          <div className="terminal-panel-header flex items-center justify-between">
            <span className="text-terminal-fgMuted text-[10px] font-mono uppercase tracking-wider">SHORTCUTS</span>
            <button onClick={() => setIsOpen(false)} className="btn-terminal-ghost p-1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="p-3 space-y-2">
            {shortcuts.map((s, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <kbd className="kbd-terminal">{s.key}</kbd>
                <span className="text-terminal-sm text-terminal-fgSecondary">{s.desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}