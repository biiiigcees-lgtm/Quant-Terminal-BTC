/**
 * Quant Terminal Component
 * Professional terminal with command execution, auto-complete, and AI integration
 */

'use client';

import React, {
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useState,
  KeyboardEvent,
  FocusEvent,
} from 'react';
import { useTerminalStore, selectTerminalUI, selectTerminalInput, selectTerminalOutputs, selectAutocomplete, selectCommandPalette, selectAIState, selectConnection, selectSettings } from '@/store/terminal';
import { parseCommand, getCommand, getCommandCompletions, getAllCommands } from '@/lib/terminal/commands';
import type { TerminalCommand, TerminalOutput, AIMessage } from '@/types/market';

// ============================================
// Sub-components
// ============================================

function TerminalHeader({ onToggleExpand, onClose, isExpanded, connectionStatus, latency }: {
  onToggleExpand: () => void;
  onClose: () => void;
  isExpanded: boolean;
  connectionStatus: string;
  latency: number | null;
}) {
  const statusColors = {
    connected: 'text-terminal-success',
    connecting: 'text-terminal-warning',
    reconnecting: 'text-terminal-warning',
    disconnected: 'text-terminal-fgMuted',
    error: 'text-terminal-error',
  };

  const statusLabels = {
    connected: '● LIVE',
    connecting: '◐ CONNECTING',
    reconnecting: '◐ RECONNECTING',
    disconnected: '○ OFFLINE',
    error: '● ERROR',
  };

  return (
    <div className="terminal-panel-header flex items-center justify-between px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-terminal-fgMuted text-[10px] font-mono uppercase tracking-wider">
          QUANT TERMINAL
        </span>
        <span className={`status-dot ${statusColors[connectionStatus as keyof typeof statusColors] || 'disconnected'}`} />
        <span className={`${statusColors[connectionStatus as keyof typeof statusColors] || 'text-terminal-fgMuted'} text-[10px] font-mono`}>
          {statusLabels[connectionStatus as keyof typeof statusLabels] || 'OFFLINE'}
        </span>
        {latency !== null && (
          <span className="text-terminal-fgMuted text-[10px] font-mono">
            {latency}ms
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={onToggleExpand}
          className="btn-terminal-ghost p-1.5"
          title={isExpanded ? 'Minimize' : 'Expand'}
          aria-label={isExpanded ? 'Minimize terminal' : 'Expand terminal'}
        >
          {isExpanded ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
          )}
        </button>
        <button
          onClick={onClose}
          className="btn-terminal-ghost p-1.5 text-terminal-error hover:text-terminal-error"
          title="Close"
          aria-label="Close terminal"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function TerminalOutputView({ outputs, settings }: {
  outputs: TerminalOutput[];
  settings: ReturnType<typeof selectSettings>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldScroll, setShouldScroll] = useState(true);

  useEffect(() => {
    if (shouldScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [outputs.length, shouldScroll]);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setShouldScroll(scrollHeight - scrollTop - clientHeight < 50);
  }, []);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto p-3 space-y-1 font-mono text-terminal-base"
      style={{
        fontFamily: settings.fontFamily,
        fontSize: `${settings.fontSize}px`,
        lineHeight: 1.5,
      }}
    >
      {outputs.map((output, index) => (
        <TerminalOutputLine key={index} output={output} showTimestamp={settings.showTimestamps} wordWrap={settings.wordWrap} />
      ))}
      {!shouldScroll && (
        <div className="fixed bottom-4 right-4 z-10">
          <button
            onClick={() => setShouldScroll(true)}
            className="btn-terminal-primary text-terminal-sm px-2 py-1 animate-slide-up"
          >
            Scroll to bottom
          </button>
        </div>
      )}
    </div>
  );
}

function TerminalOutputLine({ output, showTimestamp, wordWrap }: {
  output: TerminalOutput;
  showTimestamp: boolean;
  wordWrap: boolean;
}) {
  const timestamp = showTimestamp ? new Date(output.timestamp).toLocaleTimeString() : '';
  const typeClasses: Record<TerminalOutput['type'], string> = {
    stdout: 'text-terminal-fg',
    stderr: 'text-terminal-error',
    info: 'text-terminal-accent',
    warn: 'text-terminal-warning',
    error: 'text-terminal-error',
    success: 'text-terminal-success',
    chart: 'text-terminal-fg',
    table: 'text-terminal-fg',
    json: 'text-terminal-fgMuted',
  };

  // Special handling for clear command
  if (typeof output.content === 'string' && output.content === '__CLEAR__') {
    return null;
  }

  return (
    <div
      className={`terminal-line ${typeClasses[output.type] || ''} ${!wordWrap ? 'whitespace-nowrap overflow-x-auto' : ''}`}
      style={{ whiteSpace: wordWrap ? 'pre-wrap' : 'pre' }}
    >
      {timestamp && <span className="text-terminal-fgMuted mr-2">{timestamp}</span>}
      {typeof output.content === 'string' ? (
        <span dangerouslySetInnerHTML={{ __html: output.content }} />
      ) : output.type === 'chart' ? (
        <ChartRenderer data={output.content as any} />
      ) : output.type === 'table' ? (
        <TableRenderer data={output.content as any} />
      ) : output.type === 'json' ? (
        <pre className="text-terminal-sm overflow-x-auto">{JSON.stringify(output.content, null, 2)}</pre>
      ) : (
        <span>{String(output.content)}</span>
      )}
    </div>
  );
}

function ChartRenderer({ data }: { data: { symbol: string; timeframe: string; exchange: string; candles: any[] } }) {
  return (
    <div className="chart-container mt-2" style={{ height: '300px' }}>
      <div className="p-3 text-center text-terminal-fgMuted">
        Chart rendering for {data.symbol} {data.timeframe} - implementing with lightweight-charts...
      </div>
    </div>
  );
}

function TableRenderer({ data }: { data: any }) {
  if (!data || !data.headers || !data.rows) return null;
  return (
    <div className="overflow-x-auto mt-2">
      <table className="table-terminal">
        <thead>
          <tr>
            {data.headers.map((h: string, i: number) => <th key={i}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row: any[], i: number) => (
            <tr key={i}>
              {row.map((cell: any, j: number) => <td key={j}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AutocompleteDropdown({ suggestions, index, prefix, onSelect, onClose }: {
  suggestions: string[];
  index: number;
  prefix: string;
  onSelect: (suggestion: string) => void;
  onClose: () => void;
}) {
  if (suggestions.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 mb-1 min-w-[200px] max-h-60 overflow-y-auto terminal-panel z-20 animate-slide-up">
      <ul className="py-1">
        {suggestions.map((suggestion, i) => (
          <li key={suggestion}>
            <button
              onClick={() => onSelect(suggestion)}
              onMouseEnter={() => onSelect(suggestion)} // Update index on hover
              className={`w-full px-3 py-1.5 text-left text-terminal-sm font-mono transition-colors ${
                i === index ? 'bg-terminal-bgTertiary text-terminal-accent' : 'text-terminal-fgSecondary hover:text-terminal-fg hover:bg-terminal-bg'
              }`}
            >
              <span className="text-terminal-fgMuted">{prefix}</span>
              <span className="text-terminal-fg">{suggestion.slice(prefix.length)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CommandPalette({ isOpen, query, index, onClose, onQueryChange, onSelect, onKeyDown }: {
  isOpen: boolean;
  query: string;
  index: number;
  onClose: () => void;
  onQueryChange: (query: string) => void;
  onSelect: (command: string) => void;
  onKeyDown: (e: KeyboardEvent) => void;
}) {
  if (!isOpen) return null;

  const commands = getAllCommands();
  const filtered = commands.filter(
    (c) =>
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      c.aliases.some((a) => a.toLowerCase().includes(query.toLowerCase())) ||
      c.description.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed top-1/4 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl animate-slide-down">
      <div className="modal-terminal">
        <div className="terminal-panel-header px-4 py-3">
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a command..."
            className="input-terminal w-full bg-transparent border-none focus:ring-0 text-terminal-lg"
            autoFocus
            spellCheck={false}
          />
        </div>
        <div className="max-h-[50vh] overflow-y-auto">
          <ul className="py-1">
            {filtered.map((cmd, i) => (
              <li key={cmd.name}>
                <button
                  onClick={() => { onSelect(cmd.name); onClose(); }}
                  className={`w-full px-4 py-2.5 text-left transition-colors ${
                    i === index ? 'bg-terminal-bgTertiary' : 'hover:bg-terminal-bg'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="text-terminal-accent font-mono text-terminal-sm">{cmd.name}</span>
                      {cmd.aliases.length > 0 && (
                        <span className="ml-2 text-terminal-fgMuted text-[10px]">
                          ({cmd.aliases.join(', ')})
                        </span>
                      )}
                    </div>
                    <span className="text-terminal-fgMuted text-terminal-sm">{cmd.category}</span>
                  </div>
                  <div className="text-terminal-fgSecondary text-terminal-sm mt-0.5">{cmd.description}</div>
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-4 py-4 text-center text-terminal-fgMuted">No commands found</li>
            )}
          </ul>
        </div>
        <div className="terminal-panel-header px-4 py-2 text-terminal-fgMuted text-[10px]">
          Press ESC to close • ↑↓ to navigate • Enter to execute
        </div>
      </div>
      <div className="modal-overlay" onClick={onClose} />
    </div>
  );
}

function AIStreamingIndicator({ isStreaming, currentResponse }: { isStreaming: boolean; currentResponse: string }) {
  if (!isStreaming && !currentResponse) return null;

  return (
    <div className="border-t border-terminal-border p-3 bg-terminal-bgTertiary/50 animate-slide-up">
      <div className="flex items-start gap-2">
        <span className="text-terminal-accent font-mono text-terminal-sm mt-0.5">🤖</span>
        <div className="flex-1 min-h-[2rem]">
          {isStreaming && (
            <div className="flex items-center gap-1 text-terminal-fgMuted text-terminal-sm mb-1">
              <span className="animate-pulse-soft">●</span>
              <span>AI is thinking...</span>
            </div>
          )}
          <div className="whitespace-pre-wrap font-mono text-terminal-base text-terminal-fg">
            {currentResponse}
            {isStreaming && <span className="terminal-cursor" />}
          </div>
        </div>
      </div>
    </div>
  );
}

function TerminalInput({
  value,
  cursorPosition,
  onValueChange,
  onCursorChange,
  onKeyDown,
  onExecute,
  onTab,
  onCommandPalette,
  isAutocompleteOpen,
  autocompleteSuggestions,
  autocompleteIndex,
  autocompletePrefix,
  onAutocompleteSelect,
  onAutocompleteClose,
  settings,
  connectionStatus,
}: {
  value: string;
  cursorPosition: number;
  onValueChange: (value: string) => void;
  onCursorChange: (pos: number) => void;
  onKeyDown: (e: KeyboardEvent) => void;
  onExecute: () => void;
  onTab: () => void;
  onCommandPalette: () => void;
  isAutocompleteOpen: boolean;
  autocompleteSuggestions: string[];
  autocompleteIndex: number;
  autocompletePrefix: string;
  onAutocompleteSelect: (suggestion: string) => void;
  onAutocompleteClose: () => void;
  settings: ReturnType<typeof selectSettings>;
  connectionStatus: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const prefixMatch = value.slice(0, cursorPosition).match(/(\S+)$/);
  const currentPrefix = prefixMatch ? prefixMatch[1] : '';

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    // Tab for autocomplete
    if (e.key === 'Tab') {
      e.preventDefault();
      if (isAutocompleteOpen && autocompleteSuggestions.length > 0) {
        onAutocompleteSelect(autocompleteSuggestions[autocompleteIndex]);
      } else {
        onTab();
      }
      return;
    }

    // Escape to close autocomplete
    if (e.key === 'Escape') {
      onAutocompleteClose();
      return;
    }

    // Ctrl+K or Ctrl+P for command palette
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'p')) {
      e.preventDefault();
      onCommandPalette();
      return;
    }

    // Enter to execute
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onExecute();
      return;
    }

    // Up/Down for history (handled by store)
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      return;
    }

    onKeyDown(e);
  }, [isAutocompleteOpen, autocompleteSuggestions, autocompleteIndex, onAutocompleteSelect, onAutocompleteClose, onTab, onCommandPalette, onExecute, onKeyDown]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onValueChange(e.target.value);
    onCursorChange(e.target.selectionStart ?? 0);
  }, [onValueChange, onCursorChange]);

  return (
    <div className="border-t border-terminal-border p-3 bg-terminal-bgTertiary/50">
      <div className="cmd-prompt">
        <span className="cmd-prompt-symbol">
          {connectionStatus === 'connected' ? '▶' : '⏳'}
        </span>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={() => {}}
          className="cmd-prompt-input"
          spellCheck={false}
          style={{
            fontFamily: settings.fontFamily,
            fontSize: `${settings.fontSize}px`,
            lineHeight: 1.5,
            caretColor: settings.cursorBlink ? '#58a6ff' : 'transparent',
          }}
          aria-label="Terminal input"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
        />
        {settings.cursorBlink && <span className="terminal-cursor" />}
      </div>

      {/* Autocomplete Dropdown */}
      <AutocompleteDropdown
        suggestions={autocompleteSuggestions}
        index={autocompleteIndex}
        prefix={autocompletePrefix || currentPrefix}
        onSelect={onAutocompleteSelect}
        onClose={onAutocompleteClose}
      />
    </div>
  );
}

// ============================================
// Main Terminal Component
// ============================================

export function Terminal() {
  // Selectors for performance
  const ui = useTerminalStore(selectTerminalUI);
  const input = useTerminalStore(selectTerminalInput);
  const outputs = useTerminalStore(selectTerminalOutputs);
  const autocomplete = useTerminalStore(selectAutocomplete);
  const commandPalette = useTerminalStore(selectCommandPalette);
  const aiState = useTerminalStore(selectAIState);
  const connection = useTerminalStore(selectConnection);
  const settings = useTerminalStore(selectSettings);

  // Actions
  const {
    setFocused,
    setExpanded,
    toggleOpen,
    setHeight,
    setInputValue,
    moveCursor,
    clearInput,
    executeCommand: storeExecuteCommand,
    navigateHistory,
    addOutput,
    setAutocompleteSuggestions,
    setAutocompleteIndex,
    setAutocompleteOpen,
    setAutocompletePrefix,
    applyAutocomplete,
    setCommandPaletteOpen,
    setCommandPaletteQuery,
    setCommandPaletteIndex,
    setAIStreaming,
    setCurrentAIResponse,
    appendAIResponse,
    setConnectionStatus,
  } = useTerminalStore();

  // Refs
  const terminalRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  // Handle command execution
  const handleExecute = useCallback(async () => {
    const { inputValue } = useTerminalStore.getState();
    const trimmed = inputValue.trim();

    if (!trimmed) return;

    const parsed = parseCommand(trimmed);
    const cmd = getCommand(parsed.command);

    if (!cmd) {
      addOutput({ type: 'error', content: `Unknown command: ${parsed.command}. Type "help" for available commands.`, timestamp: Date.now() });
      return;
    }

    try {
      await cmd.handler(parsed.args, {
        addOutput,
        addCommand: storeExecuteCommand,
        getMarketService: () => {
          // Dynamic import to avoid circular dependency
          return import('@/lib/market/service').then((m) => m.getMarketService());
        },
      });
    } catch (error) {
      addOutput({ type: 'error', content: `Error: ${error instanceof Error ? error.message : String(error)}`, timestamp: Date.now() });
    }
  }, [addOutput, storeExecuteCommand]);

  // Handle autocomplete
  const handleTab = useCallback(() => {
    const { inputValue, cursorPosition } = useTerminalStore.getState();
    const textBeforeCursor = inputValue.slice(0, cursorPosition);
    const lastWord = textBeforeCursor.split(/\s+/).pop() || '';
    const commandName = textBeforeCursor.split(/\s+/)[0]?.toLowerCase();

    if (!commandName) {
      // Show all commands
      const suggestions = getCommandCompletions(lastWord);
      setAutocompleteSuggestions(suggestions);
      setAutocompletePrefix(lastWord);
      setAutocompleteOpen(true);
      return;
    }

    const cmd = getCommand(commandName);
    if (cmd?.completions) {
      const suggestions = cmd.completions(lastWord);
      setAutocompleteSuggestions(suggestions);
      setAutocompletePrefix(lastWord);
      setAutocompleteOpen(true);
    } else if (textBeforeCursor.split(/\s+/).length === 1) {
      // Complete command name
      const suggestions = getCommandCompletions(lastWord);
      setAutocompleteSuggestions(suggestions);
      setAutocompletePrefix(lastWord);
      setAutocompleteOpen(true);
    }
  }, [setAutocompleteSuggestions, setAutocompletePrefix, setAutocompleteOpen]);

  // Handle autocomplete selection
  const handleAutocompleteSelect = useCallback((suggestion: string) => {
    const { inputValue, cursorPosition, autocompletePrefix } = useTerminalStore.getState();
    const prefixLen = autocompletePrefix.length;
    const newValue = inputValue.slice(0, cursorPosition - prefixLen) + suggestion + ' ' + inputValue.slice(cursorPosition);
    setInputValue(newValue);
    moveCursor(cursorPosition - prefixLen + suggestion.length + 1);
    setAutocompleteOpen(false);
    applyAutocomplete();
  }, [setInputValue, moveCursor, setAutocompleteOpen, applyAutocomplete]);

  // Handle command palette
  const handleCommandPaletteKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setCommandPaletteOpen(false);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCommandPaletteIndex((useTerminalStore.getState().commandPaletteIndex || 0) - 1);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCommandPaletteIndex((useTerminalStore.getState().commandPaletteIndex || 0) + 1);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const commands = getAllCommands();
      const query = useTerminalStore.getState().commandPaletteQuery;
      const filtered = commands.filter(
        (c) =>
          c.name.toLowerCase().includes(query.toLowerCase()) ||
          c.aliases.some((a) => a.toLowerCase().includes(query.toLowerCase())) ||
          c.description.toLowerCase().includes(query.toLowerCase())
      );
      if (filtered[useTerminalStore.getState().commandPaletteIndex]) {
        setInputValue(filtered[useTerminalStore.getState().commandPaletteIndex].name + ' ');
        moveCursor((filtered[useTerminalStore.getState().commandPaletteIndex].name + ' ').length);
        setCommandPaletteOpen(false);
      }
      return;
    }
  }, [setCommandPaletteOpen, setCommandPaletteIndex, setInputValue, moveCursor]);

  // Handle resize
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isResizing.current = true;
    startY.current = e.clientY;
    startHeight.current = ui.height;
    e.preventDefault();
  }, [ui.height]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const deltaY = startY.current - e.clientY;
      const newHeight = startHeight.current + (deltaY / window.innerHeight) * 100;
      setHeight(newHeight);
    };

    const handleMouseUp = () => {
      isResizing.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [setHeight]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+` to toggle terminal
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        toggleOpen();
      }
      // Ctrl+Shift+` to expand/collapse
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '`') {
        e.preventDefault();
        setExpanded(!ui.isExpanded);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleOpen, setExpanded, ui.isExpanded]);

  if (!ui.isOpen) return null;

  return (
    <div
      ref={terminalRef}
      className={`terminal-panel dockable-panel flex flex-col ${ui.isExpanded ? 'fixed inset-4 z-50' : 'h-[35vh] min-h-[200px] max-h-[80vh]'}`}
      style={{
        height: ui.isExpanded ? 'auto' : `${ui.height}vh`,
        fontFamily: settings.fontFamily,
        fontSize: `${settings.fontSize}px`,
      }}
      role="terminal"
      aria-label="Quant Terminal"
    >
      {/* Resize Handle */}
      {!ui.isExpanded && (
        <div
          ref={resizeRef}
          className="resize-handle horizontal -top-0.5"
          onMouseDown={handleMouseDown}
          aria-label="Resize terminal"
          role="separator"
          tabIndex={0}
        >
          <div className="w-8 h-0.5 mx-auto bg-terminal-border hover:bg-terminal-accent/50 rounded-full transition-colors" />
        </div>
      )}

      {/* Header */}
      <TerminalHeader
        onToggleExpand={() => setExpanded(!ui.isExpanded)}
        onClose={() => toggleOpen()}
        isExpanded={ui.isExpanded}
        connectionStatus={connection.status}
        latency={connection.latency}
      />

      {/* Output Area */}
      <TerminalOutputView outputs={outputs} settings={settings} />

      {/* AI Streaming Indicator */}
      <AIStreamingIndicator
        isStreaming={aiState.isStreaming}
        currentResponse={aiState.currentResponse}
      />

      {/* Input Area */}
      <TerminalInput
        value={input.value}
        cursorPosition={input.cursorPosition}
        onValueChange={setInputValue}
        onCursorChange={moveCursor}
        onKeyDown={() => {}}
        onExecute={handleExecute}
        onTab={handleTab}
        onCommandPalette={() => setCommandPaletteOpen(true)}
        isAutocompleteOpen={autocomplete.isOpen}
        autocompleteSuggestions={autocomplete.suggestions}
        autocompleteIndex={autocomplete.index}
        autocompletePrefix={autocomplete.prefix}
        onAutocompleteSelect={handleAutocompleteSelect}
        onAutocompleteClose={() => setAutocompleteOpen(false)}
        settings={settings}
        connectionStatus={connection.status}
      />

      {/* Command Palette */}
      <CommandPalette
        isOpen={commandPalette.isOpen}
        query={commandPalette.query}
        index={commandPalette.index}
        onClose={() => setCommandPaletteOpen(false)}
        onQueryChange={setCommandPaletteQuery}
        onSelect={() => {}}
        onKeyDown={handleCommandPaletteKeyDown}
      />
    </div>
  );
}

export default Terminal;