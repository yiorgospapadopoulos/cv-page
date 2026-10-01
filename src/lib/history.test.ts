import { describe, expect, it } from 'vitest';
import {
  createHistory,
  recallNewer,
  recallOlder,
  recordEntry,
} from './history';

const filled = () =>
  ['help', 'ls', 'cat thesis'].reduce(recordEntry, createHistory());

describe('recordEntry', () => {
  it('starts empty', () => {
    expect(createHistory()).toEqual({ entries: [], cursor: 0, draft: '' });
  });

  it('appends entries and moves the cursor past the end', () => {
    expect(filled()).toEqual({
      entries: ['help', 'ls', 'cat thesis'],
      cursor: 3,
      draft: '',
    });
  });

  it('ignores blank entries and trims the rest', () => {
    const state = recordEntry(recordEntry(createHistory(), '   '), '  ls  ');
    expect(state.entries).toEqual(['ls']);
  });

  it('skips a repeat of the previous entry', () => {
    const state = recordEntry(recordEntry(createHistory(), 'ls'), 'ls');
    expect(state.entries).toEqual(['ls']);
    expect(recordEntry(state, 'help').entries).toEqual(['ls', 'help']);
  });

  it('resets the cursor and draft after recalling', () => {
    const { state } = recallOlder(filled(), 'half');
    const next = recordEntry(state, 'whoami');
    expect(next.cursor).toBe(next.entries.length);
    expect(next.draft).toBe('');
  });

  it('does not mutate the previous state', () => {
    const before = filled();
    recordEntry(before, 'more');
    recallOlder(before, 'x');
    expect(before.entries).toEqual(['help', 'ls', 'cat thesis']);
    expect(before.cursor).toBe(3);
  });
});

describe('recallOlder', () => {
  it('leaves the input alone when there is no history', () => {
    const empty = createHistory();
    expect(recallOlder(empty, 'typing')).toEqual({
      state: empty,
      value: 'typing',
    });
  });

  it('walks back to the oldest entry and stays there', () => {
    let state = filled();
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      const result = recallOlder(state, '');
      state = result.state;
      seen.push(result.value);
    }
    expect(seen).toEqual(['cat thesis', 'ls', 'help', 'help', 'help']);
  });

  it('keeps the first draft while walking back', () => {
    const first = recallOlder(filled(), 'half typed');
    const second = recallOlder(first.state, 'cat thesis');
    expect(second.state.draft).toBe('half typed');
  });
});

describe('recallNewer', () => {
  it('returns the current input when already at the end', () => {
    const state = filled();
    expect(recallNewer(state, 'abc')).toEqual({ state, value: 'abc' });
  });

  it('walks forward and restores the draft at the end', () => {
    let state = recallOlder(filled(), 'draft').state;
    state = recallOlder(state, '').state;
    const forward = recallNewer(state, '');
    expect(forward.value).toBe('cat thesis');
    const end = recallNewer(forward.state, '');
    expect(end.value).toBe('draft');
    expect(end.state.cursor).toBe(3);
    expect(recallNewer(end.state, 'draft').value).toBe('draft');
  });
});
