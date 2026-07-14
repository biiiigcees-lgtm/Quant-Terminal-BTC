/**
 * Chart Engine - Lightweight Charts wrapper for high-performance financial charting
 * Supports candlestick, volume, indicators, and real-time updates
 */

import type { ChartDataPoint, Timeframe, TechnicalIndicators } from '@/types/market';

// ============================================
// Types
// ============================================

export interface ChartOptions {
  width: number;
  height: number;
  layout?: {
    backgroundColor: string;
    textColor: string;
    fontSize: number;
    fontFamily: string;
  };
  grid?: {
    vertLines: { color: string; style: number; visible: boolean };
    horzLines: { color: string; style: number; visible: boolean };
  };
  crosshair?: {
    mode: number;
    vertLine: { color: string; style: number; width: number; visible: boolean; labelBackgroundColor: string };
    horzLine: { color: string; style: number; width: number; visible: boolean; labelBackgroundColor: string };
  };
  rightPriceScale?: {
    borderColor: string;
    scaleMargins: { top: number; bottom: number };
  };
  timeScale?: {
    borderColor: string;
    timeVisible: boolean;
    secondsVisible: boolean;
    borderVisible: boolean;
  };
  localization?: {
    locale: string;
    dateFormat: string;
  };
}

export interface SeriesData {
  time: number | string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  color?: string;
}

export interface VolumeData {
  time: number | string;
  value: number;
  color: string;
}

export interface IndicatorSeriesData {
  time: number | string;
  value: number | { [key: string]: number };
}

export interface ChartInstance {
  chart: any; // LightweightCharts.IChartApi
  candleSeries: any; // LightweightCharts.ICandlestickSeriesApi
  volumeSeries: any; // LightweightCharts.IHistogramSeriesApi
  indicatorSeries: Map<string, any>;
  dispose: () => void;
  resize: (width: number, height: number) => void;
  updateData: (candles: ChartDataPoint[], volume?: VolumeData[]) => void;
  addIndicator: (name: string, data: IndicatorSeriesData[], options?: any) => void;
  removeIndicator: (name: string) => void;
  setCrosshair: (enabled: boolean) => void;
  subscribeCrosshairMove: (callback: (param: any) => void) => () => void;
  subscribeClick: (callback: (param: any) => void) => () => void;
}

// ============================================
// Default Options
// ============================================

export const DEFAULT_CHART_OPTIONS: ChartOptions = {
  width: 800,
  height: 400,
  layout: {
    backgroundColor: '#0d1117',
    textColor: '#8b949e',
    fontSize: 11,
    fontFamily: 'JetBrains Mono, Fira Code, monospace',
  },
  grid: {
    vertLines: { color: '#21262d', style: 0, visible: true },
    horzLines: { color: '#21262d', style: 0, visible: true },
  },
  crosshair: {
    mode: 1, // CrosshairMode.Normal
    vertLine: { color: '#30363d', style: 0, width: 1, visible: true, labelBackgroundColor: '#21262d' },
    horzLine: { color: '#30363d', style: 0, width: 1, visible: true, labelBackgroundColor: '#21262d' },
  },
  rightPriceScale: {
    borderColor: '#30363d',
    scaleMargins: { top: 0.1, bottom: 0.25 },
  },
  timeScale: {
    borderColor: '#30363d',
    timeVisible: true,
    secondsVisible: false,
    borderVisible: true,
  },
  localization: {
    locale: 'en-US',
    dateFormat: 'MMM dd, yyyy',
  },
};

// ============================================
// Chart Engine Class
// ============================================

export class ChartEngine {
  private chart: any = null;
  private candleSeries: any = null;
  private volumeSeries: any = null;
  private indicatorSeries = new Map<string, any>();
  private container: HTMLElement | null = null;
  private options: ChartOptions;
  private isDisposed = false;

  constructor(container: HTMLElement, options: Partial<ChartOptions> = {}) {
    this.container = container;
    this.options = { ...DEFAULT_CHART_OPTIONS, ...options };
    this.initialize();
  }

  private async initialize(): Promise<void> {
    if (!this.container || this.isDisposed) return;

    try {
      // Dynamic import of lightweight-charts
      const { createChart } = await import('lightweight-charts');

      this.chart = createChart(this.container, this.options);

      // Create candlestick series
      this.candleSeries = this.chart.addCandlestickSeries({
        upColor: '#3fb950',
        downColor: '#f85149',
        borderUpColor: '#3fb950',
        borderDownColor: '#f85149',
        wickUpColor: '#3fb950',
        wickDownColor: '#f85149',
        priceLineVisible: false,
        lastValueVisible: true,
      });

      // Create volume series (histogram)
      this.volumeSeries = this.chart.addHistogramSeries({
        color: '#30363d',
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
        scaleMargins: { top: 0.75, bottom: 0 },
      });

      // Configure volume price scale
      this.chart.priceScale('volume').applyOptions({
        borderColor: '#30363d',
        scaleMargins: { top: 0.75, bottom: 0 },
      });

    } catch (error) {
      console.error('[ChartEngine] Failed to initialize chart:', error);
    }
  }

  // ============================================
  // Public API
  // ============================================

  public resize(width: number, height: number): void {
    this.chart?.resize(width, height);
  }

  public updateData(candles: ChartDataPoint[], volumeData?: VolumeData[]): void {
    if (!this.candleSeries) return;

    // Convert to lightweight-charts format
    const seriesData: SeriesData[] = candles.map((c) => ({
      time: c.time / 1000, // Convert ms to seconds
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    this.candleSeries.setData(seriesData);

    if (volumeData && this.volumeSeries) {
      this.volumeSeries.setData(volumeData);
    } else if (this.volumeSeries) {
      // Generate volume data from candles
      const volData: VolumeData[] = candles.map((c) => ({
        time: c.time / 1000,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(63, 185, 80, 0.6)' : 'rgba(248, 81, 73, 0.6)',
      }));
      this.volumeSeries.setData(volData);
    }
  }

  public addIndicator(name: string, data: IndicatorSeriesData[], options: any = {}): void {
    if (!this.chart || this.indicatorSeries.has(name)) return;

    const color = options.color || this.getNextColor();
    const lineWidth = options.lineWidth || 2;
    const type = options.type || 'line'; // 'line', 'histogram', 'area'

    let series: any;

    if (type === 'histogram') {
      series = this.chart.addHistogramSeries({
        color: color,
        priceFormat: { type: 'price', precision: 2 },
        priceScaleId: name,
        scaleMargins: options.scaleMargins || { top: 0.7, bottom: 0 },
      });
    } else if (type === 'area') {
      series = this.chart.addAreaSeries({
        lineColor: color,
        topColor: `${color}40`,
        bottomColor: `${color}00`,
        lineWidth,
        priceFormat: { type: 'price', precision: 2 },
        priceScaleId: name,
        scaleMargins: options.scaleMargins || { top: 0.7, bottom: 0 },
      });
    } else {
      series = this.chart.addLineSeries({
        color,
        lineWidth,
        priceFormat: { type: 'price', precision: 2 },
        priceScaleId: name,
        scaleMargins: options.scaleMargins || { top: 0.7, bottom: 0 },
      });
    }

    // Format data
    const formattedData = data.map((d) => ({
      time: typeof d.time === 'number' ? d.time / 1000 : d.time,
      value: d.value,
    }));

    series.setData(formattedData);
    this.indicatorSeries.set(name, { series, type, options });

    // Configure price scale for indicator
    this.chart.priceScale(name).applyOptions({
      borderColor: '#30363d',
      scaleMargins: options.scaleMargins || { top: 0.7, bottom: 0 },
    });
  }

  public removeIndicator(name: string): void {
    const indicator = this.indicatorSeries.get(name);
    if (indicator && this.chart) {
      this.chart.removeSeries(indicator.series);
      this.indicatorSeries.delete(name);
    }
  }

  public setCrosshair(enabled: boolean): void {
    this.chart?.applyOptions({
      crosshair: { mode: enabled ? 1 : 0 }, // Normal : None
    });
  }

  public subscribeCrosshairMove(callback: (param: any) => void): () => void {
    if (!this.chart) return () => {};

    this.chart.subscribeCrosshairMove((param: any) => {
      callback(param);
    });

    return () => {
      this.chart.unsubscribeCrosshairMove(callback);
    };
  }

  public subscribeClick(callback: (param: any) => void): () => void {
    if (!this.chart) return () => {};

    this.chart.subscribeClick((param: any) => {
      callback(param);
    });

    return () => {
      this.chart.unsubscribeClick(callback);
    };
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    // Remove indicator series
    for (const [, indicator] of this.indicatorSeries) {
      this.chart?.removeSeries(indicator.series);
    }
    this.indicatorSeries.clear();

    // Remove main series
    if (this.candleSeries) this.chart?.removeSeries(this.candleSeries);
    if (this.volumeSeries) this.chart?.removeSeries(this.volumeSeries);

    // Dispose chart
    this.chart?.remove();
    this.chart = null;
    this.candleSeries = null;
    this.volumeSeries = null;
    this.container = null;
  }

  // ============================================
  // Helpers
  // ============================================

  private colorIndex = 0;
  private colors = [
    '#58a6ff', // blue
    '#a371f7', // purple
    '#f0883e', // orange
    '#ff7b72', // pink
    '#79c0ff', // light blue
    '#d2a8ff', // light purple
    '#ffa657', // light orange
    '#ff9790', // light pink
  ];

  private getNextColor(): string {
    const color = this.colors[this.colorIndex % this.colors.length];
    this.colorIndex++;
    return color;
  }

  // Static helper to create chart engine
  static async create(container: HTMLElement, options?: Partial<ChartOptions>): Promise<ChartEngine> {
    return new ChartEngine(container, options);
  }
}

// ============================================
// Technical Indicator Calculations
// ============================================

export class TechnicalIndicators {
  /**
   * Calculate RSI (Relative Strength Index)
   */
  static rsi(data: ChartDataPoint[], period = 14): { time: number; value: number }[] {
    if (data.length < period + 1) return [];

    const closes = data.map((d) => d.close);
    const gains: number[] = [];
    const losses: number[] = [];

    for (let i = 1; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      gains.push(diff > 0 ? diff : 0);
      losses.push(diff < 0 ? -diff : 0);
    }

    const result: { time: number; value: number }[] = [];

    // Initial average
    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

    for (let i = period; i < gains.length; i++) {
      avgGain = (avgGain * (period - 1) + gains[i]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period;

      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      const rsi = 100 - 100 / (1 + rs);

      result.push({ time: data[i + 1].time, value: rsi });
    }

    return result;
  }

  /**
   * Calculate MACD (Moving Average Convergence Divergence)
   */
  static macd(
    data: ChartDataPoint[],
    fastPeriod = 12,
    slowPeriod = 26,
    signalPeriod = 9
  ): {
    macd: { time: number; value: number }[];
    signal: { time: number; value: number }[];
    histogram: { time: number; value: number }[];
  } {
    const emaFast = this.ema(data, fastPeriod);
    const emaSlow = this.ema(data, slowPeriod);

    if (emaFast.length === 0 || emaSlow.length === 0) {
      return { macd: [], signal: [], histogram: [] };
    }

    // Align EMAs (they start at different indices)
    const fastStart = fastPeriod - 1;
    const slowStart = slowPeriod - 1;
    const offset = slowStart - fastStart;

    const macdLine: { time: number; value: number }[] = [];
    for (let i = 0; i < emaFast.length - offset; i++) {
      macdLine.push({
        time: emaFast[i + offset].time,
        value: emaFast[i + offset].value - emaSlow[i].value,
      });
    }

    // Signal line (EMA of MACD)
    const macdValues = macdLine.map((m) => m.value);
    const signalLine = this.emaFromValues(macdValues, signalPeriod, macdLine.map((m) => m.time));

    // Histogram
    const histogram: { time: number; value: number }[] = [];
    for (let i = 0; i < signalLine.length; i++) {
      histogram.push({
        time: signalLine[i].time,
        value: macdLine[macdLine.length - signalLine.length + i].value - signalLine[i].value,
      });
    }

    return { macd: macdLine, signal: signalLine, histogram };
  }

  /**
   * Calculate EMA (Exponential Moving Average)
   */
  static ema(data: ChartDataPoint[], period: number): { time: number; value: number }[] {
    if (data.length < period) return [];

    const multiplier = 2 / (period + 1);
    const closes = data.map((d) => d.close);
    const result: { time: number; value: number }[] = [];

    // First EMA is SMA
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    result.push({ time: data[period - 1].time, value: ema });

    for (let i = period; i < closes.length; i++) {
      ema = (closes[i] - ema) * multiplier + ema;
      result.push({ time: data[i].time, value: ema });
    }

    return result;
  }

  /**
   * Calculate EMA from values array
   */
  static emaFromValues(values: number[], period: number, times: number[]): { time: number; value: number }[] {
    if (values.length < period) return [];

    const multiplier = 2 / (period + 1);
    const result: { time: number; value: number }[] = [];

    let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
    result.push({ time: times[period - 1], value: ema });

    for (let i = period; i < values.length; i++) {
      ema = (values[i] - ema) * multiplier + ema;
      result.push({ time: times[i], value: ema });
    }

    return result;
  }

  /**
   * Calculate SMA (Simple Moving Average)
   */
  static sma(data: ChartDataPoint[], period: number): { time: number; value: number }[] {
    if (data.length < period) return [];

    const closes = data.map((d) => d.close);
    const result: { time: number; value: number }[] = [];

    for (let i = period - 1; i < closes.length; i++) {
      const sum = closes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push({ time: data[i].time, value: sum / period });
    }

    return result;
  }

  /**
   * Calculate Bollinger Bands
   */
  static bollinger(data: ChartDataPoint[], period = 20, stdDev = 2): {
    upper: { time: number; value: number }[];
    middle: { time: number; value: number }[];
    lower: { time: number; value: number }[];
  } {
    const middle = this.sma(data, period);
    const upper: { time: number; value: number }[] = [];
    const lower: { time: number; value: number }[] = [];

    const closes = data.map((d) => d.close);

    for (let i = 0; i < middle.length; i++) {
      const idx = i + period - 1;
      const slice = closes.slice(idx - period + 1, idx + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / period;
      const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
      const sd = Math.sqrt(variance);

      upper.push({ time: middle[i].time, value: middle[i].value + stdDev * sd });
      lower.push({ time: middle[i].time, value: middle[i].value - stdDev * sd });
    }

    return { upper, middle, lower };
  }

  /**
   * Calculate ATR (Average True Range)
   */
  static atr(data: ChartDataPoint[], period = 14): { time: number; value: number }[] {
    if (data.length < period + 1) return [];

    const trueRanges: number[] = [];
    for (let i = 1; i < data.length; i++) {
      const high = data[i].high;
      const low = data[i].low;
      const prevClose = data[i - 1].close;
      const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
      trueRanges.push(tr);
    }

    return this.emaFromValues(trueRanges, period, data.slice(1).map((d) => d.time));
  }

  /**
   * Calculate VWAP (Volume Weighted Average Price)
   */
  static vwap(data: ChartDataPoint[]): { time: number; value: number }[] {
    const result: { time: number; value: number }[] = [];
    let cumulativePV = 0;
    let cumulativeVolume = 0;

    for (const candle of data) {
      const typicalPrice = (candle.high + candle.low + candle.close) / 3;
      cumulativePV += typicalPrice * candle.volume;
      cumulativeVolume += candle.volume;
      result.push({ time: candle.time, value: cumulativePV / cumulativeVolume });
    }

    return result;
  }

  /**
   * Calculate Supertrend
   */
  static supertrend(data: ChartDataPoint[], period = 10, multiplier = 3): {
    trend: { time: number; value: number }[];
    direction: { time: number; value: number }[]; // 1 for up, -1 for down
  } {
    const atrData = this.atr(data, period);
    if (atrData.length === 0) return { trend: [], direction: [] };

    const trend: { time: number; value: number }[] = [];
    const direction: { time: number; value: number }[] = [];

    let currentTrend = 0;
    let upperBand = 0;
    let lowerBand = 0;

    for (let i = 0; i < data.length; i++) {
      if (i < period) {
        trend.push({ time: data[i].time, value: data[i].close });
        direction.push({ time: data[i].time, value: 0 });
        continue;
      }

      const atrIdx = i - period;
      const atr = atrIdx < atrData.length ? atrData[atrIdx].value : 0;
      const hl2 = (data[i].high + data[i].low) / 2;

      const basicUpper = hl2 + multiplier * atr;
      const basicLower = hl2 - multiplier * atr;

      if (i === period) {
        upperBand = basicUpper;
        lowerBand = basicLower;
        currentTrend = data[i].close > hl2 ? 1 : -1;
      } else {
        if (data[i].close > upperBand) {
          currentTrend = 1;
        } else if (data[i].close < lowerBand) {
          currentTrend = -1;
        }

        if (currentTrend === 1) {
          upperBand = Math.max(upperBand, basicUpper);
        } else {
          lowerBand = Math.min(lowerBand, basicLower);
        }
      }

      trend.push({ time: data[i].time, value: currentTrend === 1 ? lowerBand : upperBand });
      direction.push({ time: data[i].time, value: currentTrend });
    }

    return { trend, direction };
  }

  /**
   * Calculate Ichimoku Cloud
   */
  static ichimoku(data: ChartDataPoint[]): {
    tenkan: { time: number; value: number }[];
    kijun: { time: number; value: number }[];
    senkouA: { time: number; value: number }[];
    senkouB: { time: number; value: number }[];
    chikou: { time: number; value: number }[];
  } {
    const tenkan = this.donchian(data, 9);
    const kijun = this.donchian(data, 26);
    const senkouB = this.donchian(data, 52);

    // Senkou Span A = (Tenkan + Kijun) / 2, shifted 26 periods forward
    const senkouA: { time: number; value: number }[] = [];
    for (let i = 0; i < tenkan.length; i++) {
      const kijunIdx = i + 26 - 9; // adjust for different start indices
      if (kijunIdx >= 0 && kijunIdx < kijun.length) {
        senkouA.push({
          time: data[i + 26 + 8]?.time || data[data.length - 1].time,
          value: (tenkan[i].value + kijun[kijunIdx].value) / 2,
        });
      }
    }

    // Senkou Span B shifted 26 periods forward
    const senkouAShifted = senkouA.map((s, i) => ({
      time: data[i + 26 + 8]?.time || data[data.length - 1].time,
      value: s.value,
    }));

    const senkouBShifted = senkouB.map((s, i) => ({
      time: data[i + 26 + 51]?.time || data[data.length - 1].time,
      value: s.value,
    }));

    // Chikou Span = Close shifted 26 periods back
    const chikou = data.slice(26).map((d, i) => ({
      time: data[i].time,
      value: d.close,
    }));

    return { tenkan, kijun, senkouA: senkouAShifted, senkouB: senkouBShifted, chikou };
  }

  /**
   * Donchian Channel helper (midline)
   */
  static donchian(data: ChartDataPoint[], period: number): { time: number; value: number }[] {
    if (data.length < period) return [];

    const result: { time: number; value: number }[] = [];
    for (let i = period - 1; i < data.length; i++) {
      const slice = data.slice(i - period + 1, i + 1);
      const high = Math.max(...slice.map((d) => d.high));
      const low = Math.min(...slice.map((d) => d.low));
      result.push({ time: data[i].time, value: (high + low) / 2 });
    }
    return result;
  }
}

// ============================================
// Performance Metrics Calculator
// ============================================

export class PerformanceMetrics {
  /**
   * Calculate returns from price data
   */
  static returns(data: ChartDataPoint[]): number[] {
    const result: number[] = [];
    for (let i = 1; i < data.length; i++) {
      result.push((data[i].close - data[i - 1].close) / data[i - 1].close);
    }
    return result;
  }

  /**
   * Calculate Sharpe Ratio
   */
  static sharpeRatio(returns: number[], riskFreeRate = 0): number {
    if (returns.length === 0) return 0;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev === 0) return 0;
    return (mean - riskFreeRate / 252) / stdDev * Math.sqrt(252); // Annualized
  }

  /**
   * Calculate Sortino Ratio
   */
  static sortinoRatio(returns: number[], riskFreeRate = 0): number {
    if (returns.length === 0) return 0;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const downsideReturns = returns.filter((r) => r < 0);
    if (downsideReturns.length === 0) return Infinity;
    const downsideVariance = downsideReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downsideReturns.length;
    const downsideDev = Math.sqrt(downsideVariance);
    if (downsideDev === 0) return 0;
    return (mean - riskFreeRate / 252) / downsideDev * Math.sqrt(252);
  }

  /**
   * Calculate Maximum Drawdown
   */
  static maxDrawdown(data: ChartDataPoint[]): { maxDrawdown: number; duration: number; peakIndex: number; troughIndex: number } {
    if (data.length === 0) return { maxDrawdown: 0, duration: 0, peakIndex: 0, troughIndex: 0 };

    let peak = data[0].close;
    let peakIndex = 0;
    let maxDD = 0;
    let maxDDDuration = 0;
    let troughIndex = 0;

    for (let i = 1; i < data.length; i++) {
      if (data[i].close > peak) {
        peak = data[i].close;
        peakIndex = i;
      } else {
        const dd = (peak - data[i].close) / peak;
        if (dd > maxDD) {
          maxDD = dd;
          troughIndex = i;
          maxDDDuration = i - peakIndex;
        }
      }
    }

    return { maxDrawdown: maxDD * 100, duration: maxDDDuration, peakIndex, troughIndex };
  }

  /**
   * Calculate Volatility (annualized)
   */
  static volatility(returns: number[]): number {
    if (returns.length < 2) return 0;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
    return Math.sqrt(variance) * Math.sqrt(252) * 100; // Annualized percentage
  }

  /**
   * Calculate Beta relative to benchmark
   */
  static beta(assetReturns: number[], benchmarkReturns: number[]): number {
    const n = Math.min(assetReturns.length, benchmarkReturns.length);
    if (n < 2) return 1;

    const assetSlice = assetReturns.slice(-n);
    const benchSlice = benchmarkReturns.slice(-n);

    const assetMean = assetSlice.reduce((a, b) => a + b, 0) / n;
    const benchMean = benchSlice.reduce((a, b) => a + b, 0) / n;

    let covariance = 0;
    let benchVariance = 0;

    for (let i = 0; i < n; i++) {
      covariance += (assetSlice[i] - assetMean) * (benchSlice[i] - benchMean);
      benchVariance += Math.pow(benchSlice[i] - benchMean, 2);
    }

    return benchVariance === 0 ? 1 : covariance / benchVariance;
  }

  /**
   * Calculate Alpha
   */
  static alpha(assetReturns: number[], benchmarkReturns: number[], riskFreeRate = 0): number {
    const beta = this.beta(assetReturns, benchmarkReturns);
    const assetMean = assetReturns.reduce((a, b) => a + b, 0) / assetReturns.length;
    const benchMean = benchmarkReturns.reduce((a, b) => a + b, 0) / benchmarkReturns.length;
    return (assetMean - riskFreeRate / 252) - beta * (benchMean - riskFreeRate / 252);
  }

  /**
   * Calculate full performance metrics
   */
  static calculateAll(data: ChartDataPoint[], benchmarkData?: ChartDataPoint[], riskFreeRate = 0.02): any {
    const returns = this.returns(data);
    const benchmarkReturns = benchmarkData ? this.returns(benchmarkData) : returns;

    return {
      sharpeRatio: this.sharpeRatio(returns, riskFreeRate),
      sortinoRatio: this.sortinoRatio(returns, riskFreeRate),
      maxDrawdown: this.maxDrawdown(data).maxDrawdown,
      maxDrawdownDuration: this.maxDrawdown(data).duration,
      volatility: this.volatility(returns),
      annualizedReturn: (Math.pow(data[data.length - 1].close / data[0].close, 252 / data.length) - 1) * 100,
      beta: this.beta(returns, benchmarkReturns),
      alpha: this.alpha(returns, benchmarkReturns, riskFreeRate) * 100,
      calmarRatio: this.sharpeRatio(returns, riskFreeRate) / (this.maxDrawdown(data).maxDrawdown / 100 || 1),
    };
  }
}