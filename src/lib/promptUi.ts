import type { Profile } from '../content/types';
import {
  runCommand,
  type CommandAction,
  type OutputLine,
  type Segment,
  type TextStyle,
} from './commands';
import {
  createHistory,
  recallNewer,
  recallOlder,
  recordEntry,
} from './history';
import { promptText } from './terminal';
import { hashSeed, typeText, typingDelays, type Scheduler } from './typing';

export type OpenTarget = '_blank' | '_self';

export interface Actions {
  open(url: string, target: OpenTarget): void;
  download(path: string): void;
}

export interface PromptDeps {
  profile: Profile;
  schedule: Scheduler;
  reducedMotion: boolean;
  actions: Actions;
  charMs: number;
}

export interface Prompt {
  run(text: string): void;
  typeAndRun(text: string): void;
}

const runPauseMs = 140;

const styleClass: Record<TextStyle, string> = {
  plain: '',
  muted: 't-muted',
  bright: 't-bright',
  accent: 't-accent',
  prompt: 't-green',
};

function isMailto(url: string): boolean {
  return url.startsWith('mailto:');
}

function renderSegment(doc: Document, segment: Segment): HTMLElement {
  if (segment.style === 'link') {
    const a = doc.createElement('a');
    a.className = 't-link';
    a.href = segment.href;
    if (!isMailto(segment.href)) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    a.textContent = segment.text;
    return a;
  }
  const span = doc.createElement('span');
  span.className = styleClass[segment.style];
  span.textContent = segment.text;
  return span;
}

export function renderLine(doc: Document, line: OutputLine): HTMLElement {
  const el = doc.createElement('div');
  el.className = 'line';
  el.append(...line.map((segment) => renderSegment(doc, segment)));
  return el;
}

function must<T extends Element>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (found === null) throw new Error(`Missing ${selector}`);
  return found;
}

export function browserActions(win: Window, doc: Document): Actions {
  return {
    open(url, target) {
      if (target === '_self') {
        win.location.assign(url);
      } else {
        win.open(url, '_blank', 'noopener,noreferrer');
      }
    },
    download(path) {
      const a = doc.createElement('a');
      a.href = path;
      a.download = path.slice(path.lastIndexOf('/') + 1);
      a.hidden = true;
      doc.body.append(a);
      a.click();
      a.remove();
    },
  };
}

export function initPrompt(root: HTMLElement, deps: PromptDeps): Prompt {
  const doc = root.ownerDocument;
  const log = must<HTMLElement>(root, '[data-log]');
  const scroll = must<HTMLElement>(root, '[data-scroll]');
  const form = must<HTMLFormElement>(root, '[data-form]');
  const input = must<HTMLInputElement>(root, '[data-input]');
  let history = createHistory();
  let busy = false;

  const scrollToEnd = () => {
    scroll.scrollTop = scroll.scrollHeight;
  };

  const perform = (action: CommandAction | undefined) => {
    if (action?.type === 'open') {
      deps.actions.open(action.url, isMailto(action.url) ? '_self' : '_blank');
    } else if (action?.type === 'download') {
      deps.actions.download(action.path);
    }
  };

  const echo = (text: string): HTMLElement => {
    const el = doc.createElement('div');
    el.className = 'line';
    const prompt = doc.createElement('span');
    prompt.className = styleClass.prompt;
    prompt.textContent = promptText;
    const command = doc.createElement('span');
    command.textContent = ` ${text}`;
    el.append(prompt, command);
    return el;
  };

  const run = (text: string) => {
    const { lines, action } = runCommand(text, deps.profile);
    history = recordEntry(history, text);
    input.value = '';
    if (action?.type === 'clear') {
      log.replaceChildren();
    } else {
      const entry = doc.createElement('div');
      entry.className = 'entry';
      entry.append(echo(text), ...lines.map((line) => renderLine(doc, line)));
      log.append(entry);
    }
    scrollToEnd();
    perform(action);
  };

  const finish = (text: string) => {
    busy = false;
    input.readOnly = false;
    run(text);
  };

  const typeAndRun = (text: string) => {
    if (busy) return;
    busy = true;
    input.readOnly = true;
    input.value = '';
    if (deps.reducedMotion) {
      input.value = text;
      finish(text);
      return;
    }
    const target = {
      set textContent(value: string | null) {
        input.value = String(value);
      },
    };
    typeText(
      target,
      text,
      typingDelays(text, deps.charMs, hashSeed(text)),
      deps.schedule,
      () => deps.schedule(() => finish(text), runPauseMs),
    );
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!busy) run(input.value);
  });

  input.addEventListener('keydown', (event) => {
    if (busy) return;
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const recall =
      event.key === 'ArrowUp'
        ? recallOlder(history, input.value)
        : recallNewer(history, input.value);
    history = recall.state;
    input.value = recall.value;
    input.setSelectionRange(recall.value.length, recall.value.length);
  });

  scroll.addEventListener('click', (event) => {
    const target = event.target as Element;
    if (target.closest('a') !== null) return;
    if (doc.getSelection()?.isCollapsed === false) return;
    input.focus();
  });

  for (const button of root.querySelectorAll<HTMLElement>('[data-command]')) {
    button.addEventListener('click', () =>
      typeAndRun(button.dataset.command as string),
    );
  }

  return { run, typeAndRun };
}
