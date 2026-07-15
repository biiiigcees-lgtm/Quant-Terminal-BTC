/**
 * Terminal Store
 * Zustand store for terminal state management
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  TerminalCommand,
  TerminalOutput,
  AIMessage,
  ToolCall,
  ToolResult,
  MarketChannel,
  Timeframe,
  Exchange,
} from '@/types/market';
import type { MarketDataService } from '@/lib/market/service';
import { getMarketService } from '@/lib/market/service';

// ============================================
// Types
// ============================================

export interface CommandDefinition {
  name: string;
  aliases: string[];
  description: string;
  usage: string;
  examples: string[];
  category: 'market' | 'chart' | 'analysis' | 'ai' | 'portfolio' | 'macro' | 'system';
  handler: (args: string[], terminal: TerminalActions) => Promise<void>;
  completions?: (partial: string) => string[];
}

export interface TerminalSession {
  id: string;
  name: string;
  createdAt: number;
  lastUsed: number;
  history: TerminalCommand[];
  outputs: TerminalOutput[];
  workingDirectory: string;
  environment: Record<string, string>;
}

export interface TerminalState {
  // UI State
  isOpen: boolean;
  isFocused: boolean;
  isExpanded: boolean;
  height: number; // percentage of screen height
  minHeight: number;
  maxHeight: number;

  // Input State
  inputValue: string;
  cursorPosition: number;
  history: TerminalCommand[];
  historyIndex: number; // -1 means current input
  savedInput: string; // input saved when navigating history

  // Output State
  outputs: TerminalOutput[];
  maxOutputs: number;

  // Auto-complete
  autocompleteSuggestions: string[];
  autocompleteIndex: number;
  isAutocompleteOpen: boolean;
  autocompletePrefix: string;

  // Command Palette
  isCommandPaletteOpen: boolean;
  commandPaletteQuery: string;
  commandPaletteIndex: number;

  // AI State
  isAIStreaming: boolean;
  currentAIResponse: string;
  aiMessages: AIMessage[];
  pendingToolCalls: ToolCall[];
  toolResults: ToolResult[];

  // Sessions
  sessions: TerminalSession[];
  activeSessionId: string | null;

  // Connection Status
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'error';
  latency: number | null;

  // Settings
  theme: 'dark' | 'light' | 'terminal' | 'high-contrast';
  fontSize: number;
  fontFamily: string;
  cursorBlink: boolean;
  showTimestamps: boolean;
  showCommandNumbers: boolean;
  wordWrap: boolean;
}

export interface TerminalActions {
  // UI Actions
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  setFocused: (focused: boolean) => void;
  setExpanded: (expanded: boolean) => void;
  setHeight: (height: number) => void;
  resetHeight: () => void;

  // Input Actions
  setInputValue: (value: string) => void;
  appendInput: (char: string) => void;
  deleteInput: (count?: number) => void;
  moveCursor: (position: number) => void;
  moveCursorRelative: (delta: number) => void;
  clearInput: () => void;
  executeCommand: () => Promise<void>;
  navigateHistory: (direction: 'up' | 'down') => void;

  // Output Actions
  addOutput: (output: TerminalOutput) => void;
  clearOutputs: () => void;
  removeOutput: (index: number) => void;

  // Auto-complete Actions
  setAutocompleteSuggestions: (suggestions: string[]) => void;
  setAutocompleteIndex: (index: number) => void;
  setAutocompleteOpen: (open: boolean) => void;
  setAutocompletePrefix: (prefix: string) => void;
  applyAutocomplete: () => void;

  // Command Palette Actions
  setCommandPaletteOpen: (open: boolean) => void;
  setCommandPaletteQuery: (query: string) => void;
  setCommandPaletteIndex: (index: number) => void;
  executeCommandPaletteSelection: () => void;

  // AI Actions
  setAIStreaming: (streaming: boolean) => void;
  setCurrentAIResponse: (response: string) => void;
  appendAIResponse: (chunk: string) => void;
  addAIMessage: (message: AIMessage) => void;
  addToolCall: (toolCall: ToolCall) => void;
  addToolResult: (result: ToolResult) => void;
  clearAIState: () => void;

  // Session Actions
  createSession: (name?: string) => string;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => void;
  renameSession: (id: string, name: string) => void;
  saveSession: () => void;

  // Connection Actions
  setConnectionStatus: (status: TerminalState['connectionStatus']) => void;
  setLatency: (latency: number | null) => void;

  // Settings Actions
  setTheme: (theme: TerminalState['theme']) => void;
  setFontSize: (size: number) => void;
  setFontFamily: (family: string) => void;
  setCursorBlink: (blink: boolean) => void;
  setShowTimestamps: (show: boolean) => void;
  setShowCommandNumbers: (show: boolean) => void;
  setWordWrap: (wrap: boolean) => void;

    // Market Service Access
    getMarketService: () => MarketDataService;

  // Utility
  reset: () => void;
}

// ============================================
// Default State
// ============================================

const DEFAULT_SESSION: TerminalSession = {
  id: 'default',
  name: 'Default',
  createdAt: Date.now(),
  lastUsed: Date.now(),
  history: [],
  outputs: [],
  workingDirectory: '~',
  environment: {},
};

const DEFAULT_STATE: TerminalState = {
  // UI State
  isOpen: true,
  isFocused: false,
  isExpanded: false,
  height: 35,
  minHeight: 15,
  maxHeight: 80,

  // Input State
  inputValue: '',
  cursorPosition: 0,
  history: [],
  historyIndex: -1,
  savedInput: '',

  // Output State
  outputs: [],
  maxOutputs: 10000,

  // Auto-complete
  autocompleteSuggestions: [],
  autocompleteIndex: 0,
  isAutocompleteOpen: false,
  autocompletePrefix: '',

  // Command Palette
  isCommandPaletteOpen: false,
  commandPaletteQuery: '',
  commandPaletteIndex: 0,

  // AI State
  isAIStreaming: false,
  currentAIResponse: '',
  aiMessages: [],
  pendingToolCalls: [],
  toolResults: [],

  // Sessions
  sessions: [DEFAULT_SESSION],
  activeSessionId: 'default',

  // Connection Status
  connectionStatus: 'disconnected',
  latency: null,

  // Settings
  theme: 'terminal',
  fontSize: 13,
  fontFamily: 'JetBrains Mono, Fira Code, monospace',
  cursorBlink: true,
  showTimestamps: false,
  showCommandNumbers: true,
  wordWrap: true,
};

// ============================================
// Store Creation
// ============================================

export const useTerminalStore = create<TerminalState & TerminalActions>()(
  subscribeWithSelector((set, get) => ({
    ...DEFAULT_STATE,

    // ============================================
    // UI Actions
    // ============================================
    setOpen: (open) => set({ isOpen: open }),
    toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),
    setFocused: (focused) => set({ isFocused: focused }),
    setExpanded: (expanded) => set({ isExpanded: expanded }),
    setHeight: (height) =>
      set((state) => ({
        height: Math.max(state.minHeight, Math.min(state.maxHeight, height)),
      })),
    resetHeight: () => set({ height: 35 }),

    // ============================================
    // Input Actions
    // ============================================
    setInputValue: (value) => set({ inputValue: value, cursorPosition: value.length }),
    appendInput: (char) =>
      set((state) => {
        const newValue = state.inputValue.slice(0, state.cursorPosition) + char + state.inputValue.slice(state.cursorPosition);
        return { inputValue: newValue, cursorPosition: state.cursorPosition + char.length };
      }),
    deleteInput: (count = 1) =>
      set((state) => {
        if (state.cursorPosition === 0) return state;
        const newValue = state.inputValue.slice(0, state.cursorPosition - count) + state.inputValue.slice(state.cursorPosition);
        return { inputValue: newValue, cursorPosition: Math.max(0, state.cursorPosition - count) };
      }),
    moveCursor: (position) => set({ cursorPosition: Math.max(0, Math.min(position, get().inputValue.length)) }),
    moveCursorRelative: (delta) =>
      set((state) => ({ cursorPosition: Math.max(0, Math.min(state.cursorPosition + delta, state.inputValue.length)) })),
    clearInput: () => set({ inputValue: '', cursorPosition: 0, historyIndex: -1, savedInput: '' }),
    executeCommand: async () => {
      const { inputValue, history, addOutput } = get();
      const trimmed = inputValue.trim();

      if (!trimmed) return;

      // Add to history
      const command = {
        command: trimmed.split(' ')[0].toLowerCase(),
        args: trimmed.split(' ').slice(1),
        raw: trimmed,
        timestamp: Date.now(),
      };

      set({ history: [...history, command], historyIndex: -1, savedInput: '', inputValue: '', cursorPosition: 0 });

      // Add command to output
      addOutput({ type: 'stdout', content: `> ${trimmed}`, timestamp: Date.now() });

      // Execute command (will be handled by terminal component)
      // The component will call the command handler
    },
    navigateHistory: (direction) =>
      set((state) => {
        if (state.history.length === 0) return state;

        let newIndex = state.historyIndex;
        if (direction === 'up') {
          if (newIndex === -1) {
            newIndex = state.history.length - 1;
            // Save current input
            return { historyIndex: newIndex, inputValue: state.history[newIndex].raw, cursorPosition: state.history[newIndex].raw.length, savedInput: state.inputValue };
          }
          newIndex = Math.max(0, newIndex - 1);
        } else {
          if (newIndex === -1) return state;
          newIndex = Math.min(state.history.length - 1, newIndex + 1);
          if (newIndex === state.history.length - 1) {
            return { historyIndex: -1, inputValue: state.savedInput, cursorPosition: state.savedInput.length };
          }
        }
        return { historyIndex: newIndex, inputValue: state.history[newIndex].raw, cursorPosition: state.history[newIndex].raw.length };
      }),

    // ============================================
    // Output Actions
    // ============================================
    addOutput: (output) =>
      set((state) => {
        const newOutputs = [...state.outputs, output];
        if (newOutputs.length > state.maxOutputs) {
          newOutputs.splice(0, newOutputs.length - state.maxOutputs);
        }
        return { outputs: newOutputs };
      }),
    clearOutputs: () => set({ outputs: [] }),
    removeOutput: (index) =>
      set((state) => ({ outputs: state.outputs.filter((_, i) => i !== index) })),

    // ============================================
    // Auto-complete Actions
    // ============================================
    setAutocompleteSuggestions: (suggestions) => set({ autocompleteSuggestions: suggestions, autocompleteIndex: 0 }),
    setAutocompleteIndex: (index) =>
      set((state) => ({
        autocompleteIndex: Math.max(0, Math.min(index, state.autocompleteSuggestions.length - 1)),
      })),
    setAutocompleteOpen: (open) => set({ isAutocompleteOpen: open }),
    setAutocompletePrefix: (prefix) => set({ autocompletePrefix: prefix }),
    applyAutocomplete: () =>
      set((state) => {
        if (state.autocompleteSuggestions.length === 0 || state.autocompleteIndex >= state.autocompleteSuggestions.length) {
          return state;
        }
        const suggestion = state.autocompleteSuggestions[state.autocompleteIndex];
        const prefixLen = state.autocompletePrefix.length;
        const newValue = state.inputValue.slice(0, state.cursorPosition - prefixLen) + suggestion + state.inputValue.slice(state.cursorPosition);
        return { inputValue: newValue, cursorPosition: state.cursorPosition - prefixLen + suggestion.length, isAutocompleteOpen: false, autocompleteSuggestions: [] };
      }),

    // ============================================
    // Command Palette Actions
    // ============================================
    setCommandPaletteOpen: (open) => set({ isCommandPaletteOpen: open, commandPaletteQuery: '', commandPaletteIndex: 0 }),
    setCommandPaletteQuery: (query) => set({ commandPaletteQuery: query, commandPaletteIndex: 0 }),
    setCommandPaletteIndex: (index) =>
      set((state) => ({ commandPaletteIndex: Math.max(0, Math.min(index, state.autocompleteSuggestions.length - 1)) })),
    executeCommandPaletteSelection: () => {
      // Handled by component
    },

    // ============================================
    // AI Actions
    // ============================================
    setAIStreaming: (streaming) => set({ isAIStreaming: streaming }),
    setCurrentAIResponse: (response) => set({ currentAIResponse: response }),
    appendAIResponse: (chunk) => set((state) => ({ currentAIResponse: state.currentAIResponse + chunk })),
    addAIMessage: (message) => set((state) => ({ aiMessages: [...state.aiMessages, message] })),
    addToolCall: (toolCall) => set((state) => ({ pendingToolCalls: [...state.pendingToolCalls, toolCall] })),
    addToolResult: (result) => set((state) => ({ toolResults: [...state.toolResults, result] })),
    clearAIState: () => set({ isAIStreaming: false, currentAIResponse: '', aiMessages: [], pendingToolCalls: [], toolResults: [] }),

    // ============================================
    // Session Actions
    // ============================================
    createSession: (name) => {
      const id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const session: TerminalSession = {
        id,
        name: name || `Session ${get().sessions.length + 1}`,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        history: [],
        outputs: [],
        workingDirectory: '~',
        environment: {},
      };
      set((state) => ({ sessions: [...state.sessions, session], activeSessionId: id }));
      return id;
    },
    switchSession: (id) => set({ activeSessionId: id }),
    deleteSession: (id) =>
      set((state) => {
        if (state.sessions.length <= 1) return state; // Keep at least one
        const newSessions = state.sessions.filter((s) => s.id !== id);
        return {
          sessions: newSessions,
          activeSessionId: state.activeSessionId === id ? newSessions[0].id : state.activeSessionId,
        };
      }),
    renameSession: (id, name) =>
      set((state) => ({
        sessions: state.sessions.map((s) => (s.id === id ? { ...s, name } : s)),
      })),
    saveSession: () =>
      set((state) => {
        const activeSession = state.sessions.find((s) => s.id === state.activeSessionId);
        if (!activeSession) return state;
        return {
          sessions: state.sessions.map((s) =>
            s.id === state.activeSessionId ? { ...s, history: state.history, outputs: state.outputs, lastUsed: Date.now() } : s
          ),
        };
      }),

    // ============================================
    // Connection Actions
    // ============================================
    setConnectionStatus: (status) => set({ connectionStatus: status }),
    setLatency: (latency) => set({ latency }),

    // ============================================
    // Settings Actions
    // ============================================
    setTheme: (theme) => set({ theme }),
    setFontSize: (size) => set({ fontSize: Math.max(10, Math.min(24, size)) }),
    setFontFamily: (family) => set({ fontFamily: family }),
    setCursorBlink: (blink) => set({ cursorBlink: blink }),
    setShowTimestamps: (show) => set({ showTimestamps: show }),
    setShowCommandNumbers: (show) => set({ showCommandNumbers: show }),
    setWordWrap: (wrap) => set({ wordWrap: wrap }),

    // ============================================
    // Market Service Access
    // ============================================
    getMarketService: (): MarketDataService => getMarketService(),

    // ============================================
    // Utility
    // ============================================
    reset: () => set(DEFAULT_STATE),
  }))
);

// ============================================
// Selectors
// ============================================

export const selectTerminalUI = (state: TerminalState) => ({
  isOpen: state.isOpen,
  isFocused: state.isFocused,
  isExpanded: state.isExpanded,
  height: state.height,
});

export const selectTerminalInput = (state: TerminalState) => ({
  value: state.inputValue,
  cursorPosition: state.cursorPosition,
  history: state.history,
  historyIndex: state.historyIndex,
});

export const selectTerminalOutputs = (state: TerminalState) => state.outputs;

export const selectAutocomplete = (state: TerminalState) => ({
  suggestions: state.autocompleteSuggestions,
  index: state.autocompleteIndex,
  isOpen: state.isAutocompleteOpen,
  prefix: state.autocompletePrefix,
});

export const selectCommandPalette = (state: TerminalState) => ({
  isOpen: state.isCommandPaletteOpen,
  query: state.commandPaletteQuery,
  index: state.commandPaletteIndex,
});

export const selectAIState = (state: TerminalState) => ({
  isStreaming: state.isAIStreaming,
  currentResponse: state.currentAIResponse,
  messages: state.aiMessages,
  pendingToolCalls: state.pendingToolCalls,
  toolResults: state.toolResults,
});

export const selectSessions = (state: TerminalState) => ({
  sessions: state.sessions,
  activeId: state.activeSessionId,
});

export const selectConnection = (state: TerminalState) => ({
  status: state.connectionStatus,
  latency: state.latency,
});

export const selectSettings = (state: TerminalState) => ({
  theme: state.theme,
  fontSize: state.fontSize,
  fontFamily: state.fontFamily,
  cursorBlink: state.cursorBlink,
  showTimestamps: state.showTimestamps,
  showCommandNumbers: state.showCommandNumbers,
  wordWrap: state.wordWrap,
});