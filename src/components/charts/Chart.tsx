/**
 * Chart Component - React wrapper for Lightweight Charts
 * High-performance financial charting with indicators
 */

'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ChartEngine, TechnicalIndicators, PerformanceMetrics, DEFAULT_CHART_OPTIONS } from '@/lib/charts/chart-engine';
import type { ChartDataPoint, Timeframe } from '@/types/market';

// ============================================
// Types
// ============================================

interface ChartProps {
  symbol: string;
  timeframe: Timeframe;
  candles: ChartDataPoint[];
  exchange?: string;
  indicators?: string[];
  height?: number;
  width?: number;
  onCrosshairMove?: (data: any) => void;
  onClick?: (data: any) => void;
  showVolume?: boolean;
  showCrosshair?: boolean;
}

// ============================================
// Chart Component
// ============================================

export function Chart({
  symbol,
  timeframe,
  candles,
  exchange,
  indicators = [],
  height = 400,
  width,
  onCrosshairMove,
  onClick,
  showVolume = true,
  showCrosshair = true,
}: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ChartEngine | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current || engineRef.current || candles.length === 0) return;

    const initChart = async () => {
      try {
        const options: Partial<ChartOptions> = {
          width: width || containerRef.current!.clientWidth,
          height,
        };

        engineRef.current = await ChartEngine.create(containerRef.current!, options);
        
        // Subscribe to crosshair
        if (showCrosshair && onCrosshairMove) {
          engineRef.current.subscribeCrosshairMove(onCrosshairMove);
        }

        // Subscribe to clicks
        if (onClick) {
          engineRef.current.subscribeClick(onClick);
        }

        setIsLoaded(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize chart');
      }
    };

    initChart();

    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [showCrosshair, onCrosshairMove, onClick, width, height]);

  // Update data when candles change
  useEffect(() => {
    if (!engineRef.current || !isLoaded || candles.length === 0) return;

    engineRef.current.updateData(candles);
  }, [candles, isLoaded]);

  // Add/remove indicators
  useEffect(() => {
    if (!engineRef.current || !isLoaded || candles.length === 0) return;

    const currentIndicators = new Set(engineRef.current['indicatorSeries'].keys());
    const newIndicators = new Set(indicators);

    // Remove old indicators
    for (const name of currentIndicators) {
      if (!newIndicators.has(name)) {
        engineRef.current!.removeIndicator(name);
      }
    }

    // Add new indicators
    for (const name of indicators) {
      if (!currentIndicators.has(name)) {
        addIndicator(name);
      }
    }
  }, [indicators, isLoaded, candles]);

  const addIndicator = useCallback((name: string) => {
    if (!engineRef.current || candles.length === 0) return;

    switch (name.toLowerCase()) {
      case 'rsi': {
        const rsiData = TechnicalIndicators.rsi(candles, 14);
        engineRef.current.addIndicator('RSI', rsiData, {
          color: '#58a6ff',
          type: 'line',
          scaleMargins: { top: 0.7, bottom: 0 },
        });
        break;
      }
      case 'macd': {
        const macdData = TechnicalIndicators.macd(candles);
        engineRef.current.addIndicator('MACD', macdData.macd, {
          color: '#58a6ff',
          type: 'line',
          scaleMargins: { top: 0.7, bottom: 0 },
        });
        engineRef.current.addIndicator('MACD Signal', macdData.signal, {
          color: '#a371f7',
          type: 'line',
          scaleMargins: { top: 0.7, bottom: 0 },
        });
        engineRef.current.addIndicator('MACD Histogram', macdData.histogram, {
          color: '#f0883e',
          type: 'histogram',
          scaleMargins: { top: 0.7, bottom: 0 },
        });
        break;
      }
      case 'ema':
      case 'ema9': {
        const emaData = TechnicalIndicators.ema(candles, 9);
        engineRef.current.addIndicator('EMA 9', emaData, {
          color: '#58a6ff',
          type: 'line',
          lineWidth: 1.5,
        });
        break;
      }
      case 'ema20': {
        const emaData = TechnicalIndicators.ema(candles, 20);
        engineRef.current.addIndicator('EMA 20', emaData, {
          color: '#a371f7',
          type: 'line',
          lineWidth: 1.5,
        });
        break;
      }
      case 'ema50': {
        const emaData = TechnicalIndicators.ema(candles, 50);
        engineRef.current.addIndicator('EMA 50', emaData, {
          color: '#f0883e',
          type: 'line',
          lineWidth: 1.5,
        });
        break;
      }
      case 'sma':
      case 'sma20': {
        const smaData = TechnicalIndicators.sma(candles, 20);
        engineRef.current.addIndicator('SMA 20', smaData, {
          color: '#58a6ff',
          type: 'line',
          lineWidth: 1.5,
        });
        break;
      }
      case 'bollinger': {
        const bbData = TechnicalIndicators.bollinger(candles);
        engineRef.current.addIndicator('BB Upper', bbData.upper, {
          color: '#30363d',
          type: 'line',
          lineWidth: 1,
        });
        engineRef.current.addIndicator('BB Middle', bbData.middle, {
          color: '#8b949e',
          type: 'line',
          lineWidth: 1,
        });
        engineRef.current.addIndicator('BB Lower', bbData.lower, {
          color: '#30363d',
          type: 'line',
          lineWidth: 1,
        });
        break;
      }
      case 'vwap': {
        const vwapData = TechnicalIndicators.vwap(candles);
        engineRef.current.addIndicator('VWAP', vwapData, {
          color: '#ff7b72',
          type: 'line',
          lineWidth: 2,
        });
        break;
      }
      case 'atr': {
        const atrData = TechnicalIndicators.atr(candles);
        engineRef.current.addIndicator('ATR', atrData, {
          color: '#d29922',
          type: 'line',
          scaleMargins: { top: 0.7, bottom: 0 },
        });
        break;
      }
      case 'supertrend': {
        const stData = TechnicalIndicators.supertrend(candles);
        engineRef.current.addIndicator('Supertrend', stData.trend, {
          color: '#3fb950',
          type: 'line',
          lineWidth: 2,
        });
        break;
      }
    }
  }, [candles]);

  // Handle resize
  useEffect(() => {
    if (!containerRef.current || !engineRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        engineRef.current?.resize(entry.contentRect.width, entry.contentRect.height);
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  if (error) {
    return (
      <div
        ref={containerRef}
        className="chart-container flex items-center justify-center"
        style={{ height }}
      >
        <div className="text-center text-terminal-error p-4">
          <p className="font-mono text-terminal-sm">Chart Error</p>
          <p className="text-terminal-xs text-terminal-fgMuted mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="chart-container"
      style={{ height, width: width || '100%' }}
    />
  );
}

// ============================================
// Chart Wrapper with Toolbar
// ============================================

interface ChartPanelProps extends ChartProps {
  title?: string;
  onTimeframeChange?: (tf: Timeframe) => void;
  onSymbolChange?: (symbol: string) => void;
  availableSymbols?: string[];
  availableTimeframes?: Timeframe[];
  availableIndicators?: string[];
  selectedIndicators?: string[];
  onIndicatorsChange?: (indicators: string[]) => void;
}

export function ChartPanel({
  title,
  symbol,
  timeframe,
  candles,
  exchange,
  indicators = [],
  height = 400,
  width,
  onTimeframeChange,
  onSymbolChange,
  availableSymbols = [],
  availableTimeframes = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'],
  availableIndicators = ['EMA 9', 'EMA 20', 'EMA 50', 'SMA 20', 'RSI', 'MACD', 'Bollinger', 'VWAP', 'ATR', 'Supertrend'],
  selectedIndicators = [],
  onIndicatorsChange,
}: ChartPanelProps) {
  const [showIndicatorMenu, setShowIndicatorMenu] = useState(false);
  const [crosshairInfo, setCrosshairInfo] = useState<string | null>(null);

  const handleCrosshairMove = useCallback((param: any) => {
    if (param.time && param.seriesPrices) {
      const price = param.seriesPrices.get(engineRef.current?.candleSeries);
      if (price) {
        setCrosshairInfo(`${param.time} | O:${price.open.toFixed(2)} H:${price.high.toFixed(2)} L:${price.low.toFixed(2)} C:${price.close.toFixed(2)}`);
      }
    }
  }, []);

  // We need a ref to access the engine for crosshair
  const engineRef = useRef<any>(null);

  // Override to capture engine ref
  useEffect(() => {
    if (engineRef.current) return;
  }, []);

  return (
    <div className="terminal-panel flex flex-col h-full">
      {/* Toolbar */}
      <div className="terminal-panel-header flex flex-wrap items-center gap-2">
        <span className="text-terminal-fgMuted text-[10px] font-mono uppercase tracking-wider">
          {title || 'CHART'}
        </span>
        <div className="flex items-center gap-1 ml-auto">
          {/* Symbol Selector */}
          {availableSymbols.length > 0 && (
            <select
              value={symbol}
              onChange={(e) => onSymbolChange?.(e.target.value)}
              className="select-terminal text-terminal-sm"
            >
              {availableSymbols.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}

          {/* Timeframe Selector */}
          <select
            value={timeframe}
            onChange={(e) => onTimeframeChange?.(e.target.value as Timeframe)}
            className="select-terminal text-terminal-sm"
          >
            {availableTimeframes.map((tf) => (
              <option key={tf} value={tf}>{tf}</option>
            ))}
          </select>

          {/* Indicators Menu */}
          <div className="relative">
            <button
              onClick={() => setShowIndicatorMenu(!showIndicatorMenu)}
              className={`btn-terminal ${selectedIndicators.length > 0 ? 'btn-terminal-primary' : ''}`}
            >
              INDICATORS {selectedIndicators.length > 0 && `(${selectedIndicators.length})`}
            </button>

            {showIndicatorMenu && (
              <div className="absolute bottom-full right-0 mb-1 terminal-panel min-w-[200px] animate-slide-up z-20">
                <div className="p-2">
                  <div className="text-terminal-fgMuted text-[10px] font-mono uppercase tracking-wider mb-2">
                    SELECT INDICATORS
                  </div>
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {availableIndicators.map((ind) => (
                      <label
                        key={ind}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-terminal hover:bg-terminal-bgTertiary cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedIndicators.includes(ind)}
                          onChange={(e) => {
                            const newSelection = e.target.checked
                              ? [...selectedIndicators, ind]
                              : selectedIndicators.filter((i) => i !== ind);
                            onIndicatorsChange?.(newSelection);
                          }}
                          className="w-4 h-4 accent-terminal-accent"
                        />
                        <span className="text-terminal-sm font-mono">{ind}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Exchange */}
          {exchange && (
            <span className="badge-terminal neutral">{exchange.toUpperCase()}</span>
          )}

          {/* Crosshair Info */}
          {crosshairInfo && (
            <span className="text-terminal-fgMuted text-[10px] font-mono px-2 py-0.5 bg-terminal-bg rounded-terminal">
              {crosshairInfo}
            </span>
          )}
        </div>
      </div>

      {/* Chart */}
      <Chart
        symbol={symbol}
        timeframe={timeframe}
        candles={candles}
        exchange={exchange}
        indicators={selectedIndicators}
        height={height}
        width={width}
        onCrosshairMove={handleCrosshairMove}
        showVolume={true}
        showCrosshair={true}
      />
    </div>
  );
}

export default Chart;