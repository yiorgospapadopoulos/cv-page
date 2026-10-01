export interface HistoryState {
  entries: readonly string[];
  cursor: number;
  draft: string;
}

export interface Recall {
  state: HistoryState;
  value: string;
}

export function createHistory(): HistoryState {
  return { entries: [], cursor: 0, draft: '' };
}

export function recordEntry(state: HistoryState, text: string): HistoryState {
  const entry = text.trim();
  const last = state.entries.at(-1);
  const entries =
    entry === '' || entry === last ? state.entries : [...state.entries, entry];
  return { entries, cursor: entries.length, draft: '' };
}

export function recallOlder(state: HistoryState, current: string): Recall {
  if (state.entries.length === 0) return { state, value: current };
  const draft = state.cursor === state.entries.length ? current : state.draft;
  const cursor = Math.max(0, state.cursor - 1);
  return {
    state: { ...state, cursor, draft },
    value: state.entries[cursor] as string,
  };
}

export function recallNewer(state: HistoryState, current: string): Recall {
  if (state.cursor >= state.entries.length) return { state, value: current };
  const cursor = state.cursor + 1;
  return {
    state: { ...state, cursor },
    value:
      cursor === state.entries.length
        ? state.draft
        : (state.entries[cursor] as string),
  };
}
