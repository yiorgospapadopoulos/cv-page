export type Scheduler = (task: () => void, delayMs: number) => unknown;

export interface Step {
  run(done: () => void): void;
}

export interface TypingOptions {
  baseMs: number;
  outputPauseMs: number;
  nextPauseMs: number;
}

interface ObserverEntry {
  isIntersecting: boolean;
  target: Element;
}

export type ObserverCtor = new (
  callback: (entries: ObserverEntry[]) => void,
  init?: { threshold?: number; rootMargin?: string },
) => {
  observe(target: Element): void;
  unobserve(target: Element): void;
};

export interface TypingEnv {
  matchMedia?: (query: string) => { matches: boolean };
  IntersectionObserver?: ObserverCtor;
}

export const typingClass = 'typing';

const stateKey = 'typing';

export const defaultOptions: TypingOptions = {
  baseMs: 28,
  outputPauseMs: 140,
  nextPauseMs: 260,
};

const reducedMotionQuery = '(prefers-reduced-motion: reduce)';

export function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
  }
  return hash;
}

export function typingDelays(
  text: string,
  baseMs: number,
  seed: number,
): number[] {
  let state = seed >>> 0;
  return Array.from(text, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.round(baseMs * (0.7 + 0.6 * (state / 4294967296)));
  });
}

export function prefersReducedMotion(env: TypingEnv): boolean {
  return env.matchMedia?.(reducedMotionQuery).matches ?? false;
}

export function shouldAnimate(env: TypingEnv): boolean {
  return (
    !prefersReducedMotion(env) && typeof env.IntersectionObserver === 'function'
  );
}

export function typeText(
  el: { textContent: string | null },
  text: string,
  delays: number[],
  schedule: Scheduler,
  onDone: () => void,
): void {
  const chars = Array.from(text);
  const next = (index: number) => {
    if (index === chars.length) {
      onDone();
      return;
    }
    schedule(() => {
      el.textContent = chars.slice(0, index + 1).join('');
      next(index + 1);
    }, delays[index] ?? 0);
  };
  next(0);
}

export function runSequence(
  steps: Step[],
  onDone: () => void = () => {},
): void {
  const next = (index: number) => {
    const step = steps[index];
    if (step === undefined) {
      onDone();
      return;
    }
    step.run(() => next(index + 1));
  };
  next(0);
}

interface BlockParts {
  block: Element;
  line: Element;
  command: Element;
  text: string;
}

export interface TerminalRun {
  finish(): void;
}

function blockParts(terminal: Element): BlockParts[] {
  const parts: BlockParts[] = [];
  for (const block of terminal.querySelectorAll('[data-block]')) {
    const line = block.querySelector('[data-cmd-line]');
    const command = block.querySelector('[data-cmd]');
    if (line === null || command === null) continue;
    parts.push({ block, line, command, text: String(command.textContent) });
  }
  return parts;
}

function showAll(parts: BlockParts[]): void {
  for (const { block, command, text } of parts) {
    block.classList.add('is-live', 'is-out');
    command.textContent = text;
  }
}

export function buildSteps(
  terminal: Element,
  schedule: Scheduler,
  options: TypingOptions,
  cursor: Element = createCursor(terminal),
): Step[] {
  return blockParts(terminal).map(({ block, line, command, text }) => ({
    run(done) {
      block.classList.add('is-live');
      command.textContent = '';
      line.append(cursor);
      typeText(
        command,
        text,
        typingDelays(text, options.baseMs, hashSeed(text)),
        schedule,
        () =>
          schedule(() => {
            block.classList.add('is-out');
            schedule(done, options.nextPauseMs);
          }, options.outputPauseMs),
      );
    },
  }));
}

function createCursor(terminal: Element): Element {
  const cursor = terminal.ownerDocument.createElement('span');
  cursor.className = 'cursor';
  cursor.setAttribute('aria-hidden', 'true');
  return cursor;
}

export function revealTerminal(terminal: Element): void {
  showAll(blockParts(terminal));
}

export function animateTerminal(
  terminal: Element,
  schedule: Scheduler,
  options: TypingOptions = defaultOptions,
): TerminalRun {
  const cursor = createCursor(terminal);
  const parts = blockParts(terminal);
  let finished = false;
  const guarded: Scheduler = (task, delayMs) =>
    schedule(() => {
      if (!finished) task();
    }, delayMs);
  runSequence(buildSteps(terminal, guarded, options, cursor), () =>
    cursor.remove(),
  );
  return {
    finish() {
      finished = true;
      showAll(parts);
      cursor.remove();
    },
  };
}

export function observeOnce(
  targets: Element[],
  onVisible: (target: Element) => void,
  Observer: ObserverCtor,
  init: { threshold?: number; rootMargin?: string },
): void {
  const observer = new Observer((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      onVisible(entry.target);
    }
  }, init);
  targets.forEach((target) => observer.observe(target));
}

function giveUp(root: HTMLElement): false {
  root.classList.remove(typingClass);
  root.dataset[stateKey] = 'off';
  return false;
}

export function initTyping(
  doc: Document,
  env: TypingEnv,
  schedule: Scheduler = (task, delayMs) => setTimeout(task, delayMs),
): boolean {
  const root = doc.documentElement;
  if (
    !shouldAnimate(env) ||
    env.IntersectionObserver === undefined ||
    root.dataset[stateKey] === 'off'
  ) {
    root.classList.remove(typingClass);
    return false;
  }
  try {
    setUpTyping(doc, env.IntersectionObserver, schedule);
  } catch {
    return giveUp(root);
  }
  root.dataset[stateKey] = 'on';
  return true;
}

function setUpTyping(
  doc: Document,
  Observer: ObserverCtor,
  schedule: Scheduler,
): void {
  doc.documentElement.classList.add(typingClass);

  const runs = new WeakMap<Element, TerminalRun>();
  const started = new WeakSet<Element>();
  const firstLines = [...doc.querySelectorAll('[data-terminal]')].flatMap(
    (terminal) => {
      const line = terminal.querySelector('[data-cmd-line]');
      return line === null ? [] : [line];
    },
  );
  observeOnce(
    firstLines,
    (line) => {
      const terminal = line.closest('[data-terminal]');
      if (terminal === null || started.has(terminal)) return;
      started.add(terminal);
      runs.set(terminal, animateTerminal(terminal, schedule));
    },
    Observer,
    { threshold: 0.25, rootMargin: '0px 0px -10% 0px' },
  );
  doc.addEventListener('focusin', (event) => {
    const terminal = (event.target as Element).closest('[data-terminal]');
    if (terminal === null) return;
    const run = runs.get(terminal);
    if (run === undefined) {
      started.add(terminal);
      revealTerminal(terminal);
    } else {
      run.finish();
    }
  });
}
