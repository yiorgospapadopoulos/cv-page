// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { profile } from '../content/profile';
import type { OutputLine } from './commands';
import {
  browserActions,
  initPrompt,
  renderLine,
  type Actions,
} from './promptUi';
import { links, mailto } from './site';
import { promptText } from './terminal';
import type { Scheduler } from './typing';

const fixture = `
  <div data-prompt>
    <div data-scroll>
      <div data-log></div>
      <form data-form>
        <input data-input aria-label="Terminal command" />
      </form>
    </div>
    <button data-command="help">help</button>
    <button data-command="cat thesis">cat thesis</button>
    <button data-command="github">github</button>
    <button data-command="clear">clear</button>
    <button data-command="cv">cv</button>
    <a data-link href="https://example.com">outside</a>
  </div>`;

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

function setup(reducedMotion = true) {
  document.body.innerHTML = fixture;
  const root = document.querySelector<HTMLElement>('[data-prompt]')!;
  const actions: Actions = { open: vi.fn(), download: vi.fn() };
  const scheduler = manualScheduler();
  const prompt = initPrompt(root, {
    profile,
    schedule: scheduler.schedule,
    reducedMotion,
    actions,
    charMs: 18,
  });
  const input = root.querySelector<HTMLInputElement>('[data-input]')!;
  const log = root.querySelector<HTMLElement>('[data-log]')!;
  const scroll = root.querySelector<HTMLElement>('[data-scroll]')!;
  const form = root.querySelector<HTMLFormElement>('[data-form]')!;
  return { root, actions, scheduler, prompt, input, log, scroll, form };
}

const keydown = (input: HTMLInputElement, key: string) => {
  const event = new KeyboardEvent('keydown', { key, cancelable: true });
  input.dispatchEvent(event);
  return event;
};

const submit = (form: HTMLFormElement) =>
  form.dispatchEvent(new Event('submit', { cancelable: true }));

function enter(env: ReturnType<typeof setup>, text: string) {
  env.input.value = text;
  submit(env.form);
}

describe('renderLine', () => {
  it('renders styled segments with textContent only', () => {
    const line: OutputLine = [
      { text: '<b>x</b>', style: 'bright' },
      { text: ' muted', style: 'muted' },
      { text: ' accent', style: 'accent' },
      { text: ' prompt', style: 'prompt' },
      { text: ' plain', style: 'plain' },
    ];
    const el = renderLine(document, line);
    expect(el.className).toBe('line');
    expect(el.innerHTML).not.toContain('<b>');
    expect(el.textContent).toBe('<b>x</b> muted accent prompt plain');
    const classes = [...el.children].map((child) => child.className);
    expect(classes).toEqual(['t-bright', 't-muted', 't-accent', 't-green', '']);
  });

  it('renders an external link that opens in a new tab safely', () => {
    const el = renderLine(document, [
      { text: 'repo', style: 'link', href: 'https://example.com/x' },
    ]);
    const a = el.querySelector('a')!;
    expect(a.getAttribute('href')).toBe('https://example.com/x');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    expect(a.className).toBe('t-link');
    expect(a.textContent).toBe('repo');
  });

  it('renders a mailto link in the same tab', () => {
    const el = renderLine(document, [
      { text: 'me', style: 'link', href: 'mailto:me@example.com' },
    ]);
    const a = el.querySelector('a')!;
    expect(a.getAttribute('href')).toBe('mailto:me@example.com');
    expect(a.hasAttribute('target')).toBe(false);
    expect(a.hasAttribute('rel')).toBe(false);
  });

  it('renders an empty line as an empty element', () => {
    const el = renderLine(document, []);
    expect(el.className).toBe('line');
    expect(el.childNodes).toHaveLength(0);
  });
});

describe('initPrompt wiring', () => {
  it('throws when a required element is missing', () => {
    document.body.innerHTML = '<div data-prompt></div>';
    expect(() =>
      initPrompt(document.querySelector('[data-prompt]')!, {
        profile,
        schedule: () => {},
        reducedMotion: true,
        actions: { open: vi.fn(), download: vi.fn() },
        charMs: 18,
      }),
    ).toThrow('[data-log]');
  });

  it('does not focus the input or print anything on setup', () => {
    const { input, log } = setup();
    expect(document.activeElement).not.toBe(input);
    expect(log.children).toHaveLength(0);
  });
});

describe('running commands', () => {
  let env: ReturnType<typeof setup>;
  beforeEach(() => {
    env = setup();
  });

  it('prints the command with its prompt, then the output, and clears the input', () => {
    enter(env, 'help');
    const entry = env.log.children[0]!;
    expect(entry.className).toBe('entry');
    expect(entry.children[0]!.textContent).toBe(`${promptText} help`);
    expect(entry.children[0]!.querySelector('.t-green')!.textContent).toBe(
      promptText,
    );
    for (const command of profile.commands) {
      expect(entry.textContent).toContain(command.name);
    }
    expect(env.input.value).toBe('');
  });

  it('prevents the native form submission', () => {
    env.input.value = 'help';
    const event = new Event('submit', { cancelable: true });
    env.form.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('keeps previous commands printed in order', () => {
    enter(env, 'whoami');
    enter(env, 'ls');
    expect(env.log.children).toHaveLength(2);
    expect(env.log.children[0]!.textContent).toContain('whoami');
    expect(env.log.children[1]!.textContent).toContain('ls');
  });

  it('prints just the prompt for empty input', () => {
    enter(env, '   ');
    const entry = env.log.children[0]!;
    expect(entry.children).toHaveLength(1);
    expect(entry.textContent).toBe(`${promptText}    `);
  });

  it('shows the unknown-command message', () => {
    enter(env, 'wat');
    expect(env.log.textContent).toContain(
      'command not found: wat. Type help to see what I can do.',
    );
  });

  it('never injects markup from the typed text', () => {
    enter(env, '<img src=x onerror=alert(1)>');
    expect(env.log.querySelector('img')).toBeNull();
    expect(env.log.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('scrolls to the newest output', () => {
    Object.defineProperty(env.scroll, 'scrollHeight', { value: 500 });
    enter(env, 'help');
    expect(env.scroll.scrollTop).toBe(500);
  });

  it('clears the whole log without echoing the clear command', () => {
    enter(env, 'help');
    enter(env, 'clear');
    expect(env.log.children).toHaveLength(0);
    expect(env.input.value).toBe('');
  });

  it('opens GitHub through the injected action in a new tab', () => {
    enter(env, 'github');
    expect(env.actions.open).toHaveBeenCalledWith(links.github, '_blank');
    expect(env.log.textContent).toContain('Opening GitHub...');
  });

  it('opens a mailto url in the same tab', () => {
    enter(env, 'email');
    expect(env.actions.open).toHaveBeenCalledWith(mailto(links.email), '_self');
    const a = env.log.querySelector('a')!;
    expect(a.getAttribute('href')).toBe(mailto(links.email));
  });

  it('downloads the CV through the injected action', () => {
    enter(env, 'cv');
    expect(env.actions.download).toHaveBeenCalledWith(profile.footer.cvPath);
    expect(env.actions.open).not.toHaveBeenCalled();
  });

  it('takes no action for plain output', () => {
    enter(env, 'help');
    expect(env.actions.open).not.toHaveBeenCalled();
    expect(env.actions.download).not.toHaveBeenCalled();
  });

  it('exposes run for direct use', () => {
    env.prompt.run('whoami');
    expect(env.log.textContent).toContain('Yiorgos Papadopoulos');
  });
});

describe('history keys', () => {
  it('recalls older and newer commands and restores the draft', () => {
    const env = setup();
    enter(env, 'help');
    enter(env, 'ls');
    env.input.value = 'draft';

    const up = keydown(env.input, 'ArrowUp');
    expect(up.defaultPrevented).toBe(true);
    expect(env.input.value).toBe('ls');
    keydown(env.input, 'ArrowUp');
    expect(env.input.value).toBe('help');
    keydown(env.input, 'ArrowUp');
    expect(env.input.value).toBe('help');

    const down = keydown(env.input, 'ArrowDown');
    expect(down.defaultPrevented).toBe(true);
    expect(env.input.value).toBe('ls');
    keydown(env.input, 'ArrowDown');
    expect(env.input.value).toBe('draft');
  });

  it('puts the caret at the end of a recalled command', () => {
    const env = setup();
    enter(env, 'cat thesis');
    const spy = vi.spyOn(env.input, 'setSelectionRange');
    keydown(env.input, 'ArrowUp');
    expect(spy).toHaveBeenCalledWith(10, 10);
  });

  it('ignores other keys', () => {
    const env = setup();
    enter(env, 'help');
    env.input.value = 'x';
    const event = keydown(env.input, 'a');
    expect(event.defaultPrevented).toBe(false);
    expect(env.input.value).toBe('x');
  });
});

describe('focus on click', () => {
  it('focuses the input when the terminal body is clicked', () => {
    const { scroll, input } = setup();
    scroll.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.activeElement).toBe(input);
  });

  it('does not steal focus from a link in the output', () => {
    const env = setup();
    enter(env, 'email');
    const a = env.log.querySelector('a')!;
    a.addEventListener('click', (event) => event.preventDefault());
    a.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.activeElement).not.toBe(env.input);
  });

  it('does not steal focus while text is selected', () => {
    const env = setup();
    vi.spyOn(document, 'getSelection').mockReturnValue({
      isCollapsed: false,
    } as Selection);
    env.scroll.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.activeElement).not.toBe(env.input);
  });

  it('focuses when there is no selection object', () => {
    const env = setup();
    vi.spyOn(document, 'getSelection').mockReturnValue(null);
    env.scroll.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.activeElement).toBe(env.input);
  });
});

describe('panel buttons with reduced motion', () => {
  it('types and runs the command at once', () => {
    const env = setup(true);
    env.root
      .querySelector<HTMLButtonElement>('[data-command="cat thesis"]')!
      .click();
    expect(env.log.textContent).toContain('cat thesis');
    expect(env.log.textContent).toContain(profile.projects[0]!.title);
    expect(env.input.value).toBe('');
    expect(env.scheduler.queue).toHaveLength(0);
  });

  it('runs actions from the panel', () => {
    const env = setup(true);
    env.root.querySelector<HTMLButtonElement>('[data-command="cv"]')!.click();
    expect(env.actions.download).toHaveBeenCalledWith(profile.footer.cvPath);
  });

  it('clears from the panel', () => {
    const env = setup(true);
    enter(env, 'help');
    env.root
      .querySelector<HTMLButtonElement>('[data-command="clear"]')!
      .click();
    expect(env.log.children).toHaveLength(0);
  });
});

describe('panel buttons with motion', () => {
  it('types character by character at the panel speed, then runs', () => {
    const env = setup(false);
    env.input.value = 'old draft';
    env.root.querySelector<HTMLButtonElement>('[data-command="help"]')!.click();

    expect(env.input.value).toBe('');
    expect(env.input.readOnly).toBe(true);
    const delays = env.scheduler.queue.map((item) => item.delay);
    expect(delays).toHaveLength(1);
    expect(delays[0]).toBeGreaterThanOrEqual(Math.round(18 * 0.7));
    expect(delays[0]).toBeLessThanOrEqual(Math.round(18 * 1.3));

    const seen: string[] = [];
    while (env.scheduler.queue.length > 0 && env.log.children.length === 0) {
      env.scheduler.queue.shift()!.task();
      seen.push(env.input.value);
    }
    expect(seen.slice(0, 4)).toEqual(['h', 'he', 'hel', 'help']);
    expect(env.log.children).toHaveLength(1);
    expect(env.log.textContent).toContain(`${promptText} help`);
    expect(env.input.value).toBe('');
    expect(env.input.readOnly).toBe(false);
  });

  it('ignores panel clicks, enter, and history keys while typing', () => {
    const env = setup(false);
    const help = env.root.querySelector<HTMLButtonElement>(
      '[data-command="help"]',
    )!;
    enter(env, 'ls');
    help.click();
    help.click();
    expect(env.scheduler.queue).toHaveLength(1);

    env.input.value = 'h';
    submit(env.form);
    keydown(env.input, 'ArrowUp');
    expect(env.input.value).toBe('h');
    expect(env.log.children).toHaveLength(1);

    env.scheduler.flush();
    expect(env.log.children).toHaveLength(2);
    expect(env.log.children[1]!.textContent).toContain(`${promptText} help`);
  });

  it('records panel commands in the history', () => {
    const env = setup(false);
    env.prompt.typeAndRun('whoami');
    env.scheduler.flush();
    keydown(env.input, 'ArrowUp');
    expect(env.input.value).toBe('whoami');
  });
});

describe('browserActions', () => {
  it('opens external urls in a new tab without an opener', () => {
    const win = {
      open: vi.fn(),
      location: { assign: vi.fn() },
    } as unknown as Window;
    browserActions(win, document).open('https://github.com/x', '_blank');
    expect(win.open).toHaveBeenCalledWith(
      'https://github.com/x',
      '_blank',
      'noopener,noreferrer',
    );
    expect(win.location.assign).not.toHaveBeenCalled();
  });

  it('navigates the same tab for mailto urls', () => {
    const win = {
      open: vi.fn(),
      location: { assign: vi.fn() },
    } as unknown as Window;
    browserActions(win, document).open('mailto:a@b.co', '_self');
    expect(win.location.assign).toHaveBeenCalledWith('mailto:a@b.co');
    expect(win.open).not.toHaveBeenCalled();
  });

  it('downloads through a temporary link that is removed afterwards', () => {
    const clicked: Array<{ href: string; download: string; inDom: boolean }> =
      [];
    const spy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push({
          href: this.getAttribute('href')!,
          download: this.download,
          inDom: document.body.contains(this),
        });
      });
    document.body.innerHTML = '';
    browserActions({} as Window, document).download('/files/My_CV.pdf');
    expect(clicked).toEqual([
      { href: '/files/My_CV.pdf', download: 'My_CV.pdf', inDom: true },
    ]);
    expect(document.querySelector('a')).toBeNull();
    spy.mockRestore();
  });
});
