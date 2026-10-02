// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  animateTerminal,
  buildSteps,
  hashSeed,
  initTyping,
  observeOnce,
  prefersReducedMotion,
  revealTerminal,
  runSequence,
  shouldAnimate,
  typeText,
  typingDelays,
  type ObserverCtor,
  type Scheduler,
  type Step,
} from './typing';

function manualScheduler() {
  const queue: Array<{ task: () => void; delay: number }> = [];
  const schedule: Scheduler = (task, delay) => {
    queue.push({ task, delay });
  };
  const flush = () => {
    let guard = 0;
    while (queue.length > 0 && guard++ < 10_000) queue.shift()!.task();
  };
  return { schedule, flush, queue };
}

describe('hashSeed', () => {
  it('is deterministic and differs between inputs', () => {
    expect(hashSeed('whoami')).toBe(hashSeed('whoami'));
    expect(hashSeed('whoami')).not.toBe(hashSeed('ls projects/'));
    expect(Number.isInteger(hashSeed('whoami'))).toBe(true);
  });

  it('handles empty text', () => {
    expect(Number.isInteger(hashSeed(''))).toBe(true);
  });
});

describe('typingDelays', () => {
  it('returns one delay per character', () => {
    expect(typingDelays('whoami', 28, 1)).toHaveLength(6);
    expect(typingDelays('', 28, 1)).toEqual([]);
  });

  it('counts a character outside the basic plane once', () => {
    expect(typingDelays('a\u{1F600}b', 28, 1)).toHaveLength(3);
  });

  it('is deterministic for the same seed', () => {
    expect(typingDelays('git log', 28, 7)).toEqual(
      typingDelays('git log', 28, 7),
    );
  });

  it('varies with the seed', () => {
    expect(typingDelays('git log --author', 28, 1)).not.toEqual(
      typingDelays('git log --author', 28, 2),
    );
  });

  it('stays within 70 to 130 percent of the base', () => {
    const delays = typingDelays('cat projects/thesis.md', 28, 99);
    for (const delay of delays) {
      expect(delay).toBeGreaterThanOrEqual(Math.round(28 * 0.7));
      expect(delay).toBeLessThanOrEqual(Math.round(28 * 1.3));
      expect(Number.isInteger(delay)).toBe(true);
    }
    expect(new Set(delays).size).toBeGreaterThan(1);
  });
});

describe('prefersReducedMotion', () => {
  it('reads the media query and defaults to false without matchMedia', () => {
    expect(
      prefersReducedMotion({ matchMedia: () => ({ matches: true }) }),
    ).toBe(true);
    expect(
      prefersReducedMotion({ matchMedia: () => ({ matches: false }) }),
    ).toBe(false);
    expect(prefersReducedMotion({})).toBe(false);
  });
});

describe('shouldAnimate', () => {
  const observer = class {} as unknown as ObserverCtor;
  const media = (matches: boolean) => () => ({ matches });

  it('animates when motion is allowed and observers exist', () => {
    expect(
      shouldAnimate({
        matchMedia: media(false),
        IntersectionObserver: observer,
      }),
    ).toBe(true);
  });

  it('does not animate under reduced motion', () => {
    expect(
      shouldAnimate({
        matchMedia: media(true),
        IntersectionObserver: observer,
      }),
    ).toBe(false);
  });

  it('does not animate without IntersectionObserver', () => {
    expect(shouldAnimate({ matchMedia: media(false) })).toBe(false);
  });

  it('treats a missing matchMedia as motion allowed', () => {
    expect(shouldAnimate({ IntersectionObserver: observer })).toBe(true);
  });

  it('asks about prefers-reduced-motion', () => {
    const matchMedia = vi.fn(() => ({ matches: false }));
    shouldAnimate({ matchMedia, IntersectionObserver: observer });
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  });
});

describe('typeText', () => {
  it('types one character per scheduled delay, then calls done', () => {
    const { schedule, queue, flush } = manualScheduler();
    const el = { textContent: '' as string | null };
    const done = vi.fn();
    typeText(el, 'abc', [5, 6, 7], schedule, done);

    expect(queue.map((item) => item.delay)).toEqual([5]);
    queue.shift()!.task();
    expect(el.textContent).toBe('a');
    expect(queue.map((item) => item.delay)).toEqual([6]);
    expect(done).not.toHaveBeenCalled();

    flush();
    expect(el.textContent).toBe('abc');
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('calls done at once for empty text', () => {
    const { schedule, queue } = manualScheduler();
    const done = vi.fn();
    typeText({ textContent: 'x' }, '', [], schedule, done);
    expect(done).toHaveBeenCalledTimes(1);
    expect(queue).toHaveLength(0);
  });

  it('falls back to a zero delay when delays run short', () => {
    const { schedule, queue, flush } = manualScheduler();
    const el = { textContent: '' as string | null };
    typeText(el, 'ab', [3], schedule, () => {});
    queue.shift()!.task();
    expect(queue.map((item) => item.delay)).toEqual([0]);
    flush();
    expect(el.textContent).toBe('ab');
  });

  it('keeps whole characters outside the basic plane', () => {
    const { schedule, flush } = manualScheduler();
    const el = { textContent: '' as string | null };
    typeText(el, 'a\u{1F600}', [1, 1], schedule, () => {});
    flush();
    expect(el.textContent).toBe('a\u{1F600}');
  });
});

describe('runSequence', () => {
  it('runs steps in order, each after the previous one is done', () => {
    const log: string[] = [];
    const finishers: Array<() => void> = [];
    const step = (name: string): Step => ({
      run(done) {
        log.push(`start ${name}`);
        finishers.push(() => {
          log.push(`end ${name}`);
          done();
        });
      },
    });
    const onDone = vi.fn();
    runSequence([step('a'), step('b')], onDone);

    expect(log).toEqual(['start a']);
    finishers[0]!();
    expect(log).toEqual(['start a', 'end a', 'start b']);
    expect(onDone).not.toHaveBeenCalled();
    finishers[1]!();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('finishes at once for no steps and works without a callback', () => {
    const onDone = vi.fn();
    runSequence([], onDone);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(() => runSequence([{ run: (done) => done() }])).not.toThrow();
  });
});

function terminalHtml() {
  return `
    <div data-terminal id="t1">
      <div data-block id="b1">
        <p data-cmd-line><span class="prompt">$</span> <span data-cmd>whoami</span></p>
        <div class="out">Yiorgos</div>
      </div>
      <div data-block id="b2">
        <p data-cmd-line><span class="prompt">$</span> <span data-cmd>ls</span></p>
        <div class="out">projects</div>
      </div>
    </div>`;
}

describe('buildSteps and animateTerminal', () => {
  beforeEach(() => {
    document.body.innerHTML = terminalHtml();
  });

  const options = { baseMs: 10, outputPauseMs: 50, nextPauseMs: 70 };

  it('creates one step per block', () => {
    const { schedule } = manualScheduler();
    const terminal = document.getElementById('t1')!;
    expect(buildSteps(terminal, schedule, options)).toHaveLength(2);
  });

  it('skips blocks without a command line or command text', () => {
    document.body.innerHTML =
      '<div data-terminal id="t"><div data-block></div><div data-block><p data-cmd-line></p></div></div>';
    const { schedule } = manualScheduler();
    const terminal = document.getElementById('t')!;
    expect(buildSteps(terminal, schedule, options)).toHaveLength(0);
  });

  it('types the command, then shows the output, then moves on', () => {
    const { schedule, queue } = manualScheduler();
    const terminal = document.getElementById('t1')!;
    const b1 = document.getElementById('b1')!;
    const b2 = document.getElementById('b2')!;
    const cmd1 = b1.querySelector('[data-cmd]')!;
    const cmd2 = b2.querySelector('[data-cmd]')!;

    animateTerminal(terminal, schedule, options);

    expect(b1.classList.contains('is-live')).toBe(true);
    expect(b1.classList.contains('is-out')).toBe(false);
    expect(b2.classList.contains('is-live')).toBe(false);
    expect(cmd1.textContent).toBe('');
    const cursor = terminal.querySelector('.cursor')!;
    expect(cursor.parentElement).toBe(b1.querySelector('[data-cmd-line]'));

    while (!b1.classList.contains('is-out')) queue.shift()!.task();
    expect(cmd1.textContent).toBe('whoami');
    expect(b2.classList.contains('is-live')).toBe(false);

    while (!b2.classList.contains('is-live')) queue.shift()!.task();
    expect(cmd2.textContent).toBe('');
    expect(cursor.parentElement).toBe(b2.querySelector('[data-cmd-line]'));

    while (queue.length > 0) queue.shift()!.task();
    expect(cmd2.textContent).toBe('ls');
    expect(b2.classList.contains('is-out')).toBe(true);
    expect(terminal.querySelector('.cursor')).toBeNull();
  });

  it('uses the configured pauses', () => {
    const { schedule, queue } = manualScheduler();
    animateTerminal(document.getElementById('t1')!, schedule, options);
    const delays: number[] = [];
    while (queue.length > 0) {
      const item = queue.shift()!;
      delays.push(item.delay);
      item.task();
    }
    expect(delays).toContain(50);
    expect(delays).toContain(70);
  });

  it('uses default options when none are given', () => {
    const { schedule, flush } = manualScheduler();
    animateTerminal(document.getElementById('t1')!, schedule);
    flush();
    expect(document.querySelectorAll('.is-out')).toHaveLength(2);
  });

  it('marks the cursor as decorative', () => {
    const { schedule } = manualScheduler();
    animateTerminal(document.getElementById('t1')!, schedule, options);
    expect(document.querySelector('.cursor')!.getAttribute('aria-hidden')).toBe(
      'true',
    );
  });
});

describe('finishing a terminal early', () => {
  beforeEach(() => {
    document.body.innerHTML = terminalHtml();
  });

  const options = { baseMs: 10, outputPauseMs: 50, nextPauseMs: 70 };

  it('shows every block with its full command and stops the animation', () => {
    const { schedule, queue } = manualScheduler();
    const terminal = document.getElementById('t1')!;
    const run = animateTerminal(terminal, schedule, options);
    queue.shift()!.task();
    queue.shift()!.task();
    expect(document.querySelector('[data-cmd]')!.textContent).toBe('wh');

    run.finish();
    const commands = [...document.querySelectorAll('[data-cmd]')].map(
      (el) => el.textContent,
    );
    expect(commands).toEqual(['whoami', 'ls']);
    expect(document.querySelectorAll('.is-live')).toHaveLength(2);
    expect(document.querySelectorAll('.is-out')).toHaveLength(2);
    expect(terminal.querySelector('.cursor')).toBeNull();

    while (queue.length > 0) queue.shift()!.task();
    expect(
      [...document.querySelectorAll('[data-cmd]')].map((el) => el.textContent),
    ).toEqual(['whoami', 'ls']);
    expect(terminal.querySelector('.cursor')).toBeNull();
  });

  it('is harmless after the animation has completed', () => {
    const { schedule, flush } = manualScheduler();
    const run = animateTerminal(
      document.getElementById('t1')!,
      schedule,
      options,
    );
    flush();
    run.finish();
    expect(document.querySelectorAll('.is-out')).toHaveLength(2);
    expect(document.querySelectorAll('[data-cmd]')[1]!.textContent).toBe('ls');
  });

  it('reveals an untouched terminal without animating it', () => {
    document.body.innerHTML =
      '<div data-terminal id="t"><div data-block></div>' +
      terminalHtml() +
      '</div>';
    const terminal = document.getElementById('t')!;
    revealTerminal(terminal);
    expect(document.querySelectorAll('.is-live')).toHaveLength(2);
    expect(document.querySelectorAll('.is-out')).toHaveLength(2);
    expect(document.querySelector('[data-cmd]')!.textContent).toBe('whoami');
    expect(terminal.querySelector('.cursor')).toBeNull();
  });
});

type Entry = { isIntersecting: boolean; target: Element };

function fakeObserver() {
  const instances: FakeObserver[] = [];
  class FakeObserver {
    observed: Element[] = [];
    unobserved: Element[] = [];
    constructor(
      public callback: (entries: Entry[]) => void,
      public init?: { threshold?: number; rootMargin?: string },
    ) {
      instances.push(this);
    }
    observe(target: Element) {
      this.observed.push(target);
    }
    unobserve(target: Element) {
      this.unobserved.push(target);
    }
  }
  return { Ctor: FakeObserver as unknown as ObserverCtor, instances };
}

describe('observeOnce', () => {
  it('reports each target once when it becomes visible', () => {
    const { Ctor, instances } = fakeObserver();
    const a = document.createElement('div');
    const b = document.createElement('div');
    const seen: Element[] = [];
    observeOnce([a, b], (target) => seen.push(target), Ctor, {
      threshold: 0.25,
    });

    const observer = instances[0]!;
    expect(observer.observed).toEqual([a, b]);
    expect(observer.init).toEqual({ threshold: 0.25 });

    observer.callback([
      { isIntersecting: false, target: a },
      { isIntersecting: true, target: b },
    ]);
    expect(seen).toEqual([b]);
    expect(observer.unobserved).toEqual([b]);
  });
});

describe('initTyping', () => {
  beforeEach(() => {
    document.documentElement.className = '';
    delete document.documentElement.dataset['typing'];
    document.body.innerHTML = terminalHtml();
  });

  const motionAllowed = (Ctor: ObserverCtor) => ({
    matchMedia: () => ({ matches: false }),
    IntersectionObserver: Ctor,
  });

  it('removes the hiding class and does nothing when animation is off', () => {
    document.documentElement.classList.add('typing');
    const { Ctor, instances } = fakeObserver();
    const { schedule, queue } = manualScheduler();
    const started = initTyping(
      document,
      { ...motionAllowed(Ctor), matchMedia: () => ({ matches: true }) },
      schedule,
    );
    expect(started).toBe(false);
    expect(document.documentElement.classList.contains('typing')).toBe(false);
    expect(instances).toHaveLength(0);
    expect(queue).toHaveLength(0);
  });

  it('observes the first command line and animates a terminal once', () => {
    const { Ctor, instances } = fakeObserver();
    const { schedule, flush } = manualScheduler();
    const started = initTyping(document, motionAllowed(Ctor), schedule);

    expect(started).toBe(true);
    expect(document.documentElement.classList.contains('typing')).toBe(true);
    const observer = instances[0]!;
    const firstLine = document.querySelector('[data-cmd-line]')!;
    expect(observer.observed).toEqual([firstLine]);
    expect(observer.init).toEqual({
      threshold: 0.25,
      rootMargin: '0px 0px -10% 0px',
    });

    observer.callback([{ isIntersecting: true, target: firstLine }]);
    flush();
    expect(document.querySelectorAll('.is-out')).toHaveLength(2);

    document.querySelectorAll('.is-live').forEach((el) => {
      el.classList.remove('is-live', 'is-out');
    });
    observer.callback([{ isIntersecting: true, target: firstLine }]);
    flush();
    expect(document.querySelectorAll('.is-live')).toHaveLength(0);
  });

  it('reveals a terminal at once when focus enters it before it types', () => {
    const { Ctor, instances } = fakeObserver();
    const { schedule, queue } = manualScheduler();
    initTyping(document, motionAllowed(Ctor), schedule);
    const link = document.createElement('a');
    document.getElementById('b2')!.append(link);

    link.dispatchEvent(new Event('focusin', { bubbles: true }));
    expect(document.querySelectorAll('.is-out')).toHaveLength(2);

    const firstLine = document.querySelector('[data-cmd-line]')!;
    instances[0]!.callback([{ isIntersecting: true, target: firstLine }]);
    expect(queue).toHaveLength(0);
    expect(document.querySelector('[data-cmd]')!.textContent).toBe('whoami');
  });

  it('finishes a terminal that is already typing when focus enters it', () => {
    const { Ctor, instances } = fakeObserver();
    const { schedule, queue } = manualScheduler();
    initTyping(document, motionAllowed(Ctor), schedule);
    const firstLine = document.querySelector('[data-cmd-line]')!;
    instances[0]!.callback([{ isIntersecting: true, target: firstLine }]);
    queue.shift()!.task();

    const link = document.createElement('a');
    document.getElementById('b2')!.append(link);
    link.dispatchEvent(new Event('focusin', { bubbles: true }));
    expect(document.querySelectorAll('.is-out')).toHaveLength(2);
    expect(document.querySelector('[data-cmd]')!.textContent).toBe('whoami');
  });

  it('ignores focus outside any terminal', () => {
    const { Ctor } = fakeObserver();
    initTyping(document, motionAllowed(Ctor), manualScheduler().schedule);
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.dispatchEvent(new Event('focusin', { bubbles: true }));
    expect(document.querySelectorAll('.is-live')).toHaveLength(0);
  });

  it('ignores terminals without a command line', () => {
    document.body.innerHTML = '<div data-terminal></div>';
    const { Ctor, instances } = fakeObserver();
    initTyping(document, motionAllowed(Ctor), manualScheduler().schedule);
    expect(instances[0]!.observed).toEqual([]);
  });

  it('ignores an observed target that is not inside a terminal', () => {
    const { Ctor, instances } = fakeObserver();
    const { schedule, queue } = manualScheduler();
    initTyping(document, motionAllowed(Ctor), schedule);
    const stray = document.createElement('div');
    instances[0]!.callback([{ isIntersecting: true, target: stray }]);
    expect(queue).toHaveLength(0);
  });

  it('marks the page as typing so the safety timer stands down', () => {
    const { Ctor } = fakeObserver();
    initTyping(document, motionAllowed(Ctor), manualScheduler().schedule);
    expect(document.documentElement.dataset['typing']).toBe('on');
  });

  it('does nothing when the safety timer already gave up', () => {
    document.documentElement.dataset['typing'] = 'off';
    const { Ctor, instances } = fakeObserver();
    const started = initTyping(
      document,
      motionAllowed(Ctor),
      manualScheduler().schedule,
    );
    expect(started).toBe(false);
    expect(document.documentElement.classList.contains('typing')).toBe(false);
    expect(document.documentElement.dataset['typing']).toBe('off');
    expect(instances).toHaveLength(0);
  });

  it('shows all text if setting up the animation throws', () => {
    const Broken = class {
      constructor() {
        throw new Error('observer failed');
      }
    } as unknown as ObserverCtor;
    document.documentElement.classList.add('typing');
    const started = initTyping(
      document,
      motionAllowed(Broken),
      manualScheduler().schedule,
    );
    expect(started).toBe(false);
    expect(document.documentElement.classList.contains('typing')).toBe(false);
    expect(document.documentElement.dataset['typing']).toBe('off');
  });

  it('uses setTimeout when no scheduler is given', () => {
    vi.useFakeTimers();
    try {
      const { Ctor, instances } = fakeObserver();
      initTyping(document, motionAllowed(Ctor));
      const firstLine = document.querySelector('[data-cmd-line]')!;
      instances[0]!.callback([{ isIntersecting: true, target: firstLine }]);
      vi.runAllTimers();
      expect(document.querySelectorAll('.is-out')).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
