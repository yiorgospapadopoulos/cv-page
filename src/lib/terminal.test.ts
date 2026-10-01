import { describe, expect, it } from 'vitest';
import type { Project } from '../content/types';
import {
  fakeHash,
  joinStack,
  projectLabel,
  promptText,
  snakeCase,
  terminalSections,
  windowTitle,
} from './terminal';

const base: Project = {
  slug: 'demo',
  title: 'Demo',
  tagline: 'Tag',
  kind: 'research',
  visibility: 'private',
  summary: 'Summary',
  highlights: ['One'],
  metrics: ['M'],
  stack: ['Python'],
  sketch: ['x'],
};

describe('terminal chrome', () => {
  it('builds the prompt and the window title', () => {
    expect(promptText).toBe('yiorgos@thessaloniki:~$');
    expect(windowTitle).toBe('yiorgos@thessaloniki: ~');
  });

  it('lists the five sections in page order with unique ids', () => {
    expect(terminalSections.map((s) => s.id)).toEqual([
      'about',
      'projects',
      'experience',
      'stack',
      'education',
    ]);
    expect(terminalSections.map((s) => s.heading)).toEqual([
      'About',
      'Projects',
      'Experience',
      'Stack',
      'Education',
    ]);
    expect(terminalSections.map((s) => s.command)).toEqual([
      'whoami',
      'ls projects/',
      'git log --author="Yiorgos"',
      'cat stack.toml',
      'cat education.md',
    ]);
  });
});

describe('snakeCase', () => {
  it('lowercases and joins words with underscores', () => {
    expect(snakeCase('Machine learning')).toBe('machine_learning');
    expect(snakeCase('LLMs and retrieval')).toBe('llms_and_retrieval');
  });

  it('drops punctuation and trims separators', () => {
    expect(snakeCase('  C++ & Rust! ')).toBe('c_rust');
  });
});

describe('joinStack', () => {
  it('joins items with a middle dot', () => {
    expect(joinStack(['Python', 'Flask'])).toBe('Python · Flask');
    expect(joinStack(['Python'])).toBe('Python');
  });
});

describe('fakeHash', () => {
  it('is a deterministic 7 character hex string', () => {
    expect(fakeHash('role@company')).toMatch(/^[0-9a-f]{7}$/);
    expect(fakeHash('role@company')).toBe(fakeHash('role@company'));
    expect(fakeHash('a')).not.toBe(fakeHash('b'));
  });

  it('pads short hashes to the full length', () => {
    for (const seed of ['', 'a', 'b', 'c', 'd', 'e']) {
      expect(fakeHash(seed)).toHaveLength(7);
    }
  });
});

describe('projectLabel', () => {
  it('links public projects to their repository', () => {
    expect(
      projectLabel({
        ...base,
        visibility: 'public',
        repoUrl: 'https://github.com/x/y',
        repoLabel: 'Write-up',
      }),
    ).toEqual({
      prefix: 'public',
      text: 'Write-up',
      href: 'https://github.com/x/y',
    });
  });

  it('falls back to the url when a public project has no label', () => {
    expect(
      projectLabel({
        ...base,
        visibility: 'public',
        repoUrl: 'https://github.com/x/y',
      }),
    ).toEqual({
      prefix: 'public',
      text: 'https://github.com/x/y',
      href: 'https://github.com/x/y',
    });
  });

  it('names the organisation for private case studies', () => {
    expect(
      projectLabel({ ...base, kind: 'case-study', org: 'Zimmerman' }),
    ).toEqual({ text: 'private, Zimmerman case study' });
  });

  it('calls a private project with an organisation a project when it is research', () => {
    expect(projectLabel({ ...base, org: 'Lab' })).toEqual({
      text: 'private, Lab project',
    });
  });

  it('uses the repo label for private research', () => {
    expect(projectLabel({ ...base, repoLabel: 'Private repo' })).toEqual({
      text: 'Private repo',
    });
  });

  it('says private when nothing else is known', () => {
    expect(projectLabel(base)).toEqual({ text: 'private' });
  });
});
