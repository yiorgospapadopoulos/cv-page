import { describe, expect, it } from 'vitest';
import { profile } from '../content/profile';
import {
  panelCommands,
  panelEntries,
  runCommand,
  type CommandResult,
  type OutputLine,
} from './commands';
import { links, mailto, ownerName } from './site';

const plain = (lines: OutputLine[]) =>
  lines.map((line) => line.map((segment) => segment.text).join(''));

const run = (input: string): CommandResult => runCommand(input, profile);
const out = (input: string) => plain(run(input).lines);
const slugs = profile.projects.map((project) => project.slug);
const thesis = profile.projects.find((project) => project.slug === 'thesis')!;
const mammo = profile.projects.find((project) => project.slug === 'mammo')!;

describe('input normalisation', () => {
  it('prints nothing for empty or blank input', () => {
    expect(run('')).toEqual({ lines: [] });
    expect(run('   \t ')).toEqual({ lines: [] });
  });

  it('trims, collapses whitespace, and ignores case in the command name', () => {
    expect(run('  HeLp  ')).toEqual(run('help'));
    expect(run('Cat    THESIS')).toEqual(run('cat thesis'));
    expect(run('LS   projects')).toEqual(run('ls'));
  });
});

describe('help', () => {
  it('lists every command with its description, aligned', () => {
    const lines = out('help');
    for (const command of profile.commands) {
      expect(
        lines.some(
          (line) =>
            line.trimStart().startsWith(command.name) &&
            line.endsWith(command.description),
        ),
      ).toBe(true);
    }
    const rows = lines.filter((line) =>
      profile.commands.some((command) => line.startsWith(command.name)),
    );
    expect(rows).toHaveLength(profile.commands.length);
    const columns = new Set(
      profile.commands.map((command) =>
        rows
          .find((row) => row.startsWith(command.name))!
          .indexOf(command.description),
      ),
    );
    expect(columns.size).toBe(1);
  });

  it('has no action', () => {
    expect(run('help').action).toBeUndefined();
  });
});

describe('whoami', () => {
  it('prints the owner name in bright and the intro', () => {
    const { lines } = run('whoami');
    expect(lines[0]).toEqual([{ text: ownerName, style: 'bright' }]);
    expect(plain(lines)).toEqual([ownerName, profile.hero.intro]);
  });
});

describe('ls', () => {
  it('lists each slug in accent with its tagline', () => {
    const { lines } = run('ls');
    expect(lines).toHaveLength(profile.projects.length);
    profile.projects.forEach((project, index) => {
      const line = lines[index]!;
      expect(line[0]).toMatchObject({
        text: expect.any(String),
        style: 'accent',
      });
      expect(line[0]!.text.trim()).toBe(project.slug);
      expect(plain([line])[0]).toContain(project.tagline);
    });
  });

  it('accepts projects and projects/ as the target', () => {
    expect(run('ls projects')).toEqual(run('ls'));
    expect(run('ls projects/')).toEqual(run('ls'));
  });

  it('rejects any other target', () => {
    expect(out('ls nope')).toEqual([
      "ls: cannot access 'nope': No such file or directory",
    ]);
  });
});

describe('cat', () => {
  it('shows a public project with a link line', () => {
    const { lines } = run('cat thesis');
    expect(lines[0]).toEqual([{ text: thesis.title, style: 'bright' }]);
    const text = plain(lines);
    expect(text).toContain(thesis.tagline);
    expect(text).toContain(thesis.summary);
    expect(text).toContain(thesis.metrics.join(' · '));
    const link = lines.at(-1)!.find((segment) => segment.style === 'link');
    expect(link).toEqual({
      text: thesis.repoLabel,
      style: 'link',
      href: thesis.repoUrl,
    });
  });

  it('labels a private project without a link', () => {
    const { lines } = run('cat mammo');
    const flat = lines.flat();
    expect(flat.some((segment) => segment.style === 'link')).toBe(false);
    expect(plain(lines).join('\n')).toContain(mammo.repoLabel);
    expect(plain(lines).join('\n').toLowerCase()).toContain('private');
  });

  it('labels a private company case study with its org', () => {
    expect(out('cat lead-gen').join('\n')).toContain(
      'private, Zimmerman case study',
    );
  });

  it('resolves every accepted spelling of a slug', () => {
    for (const slug of slugs) {
      const expected = run(`cat ${slug}`);
      expect(run(`cat projects/${slug}`)).toEqual(expected);
      expect(run(`cat ${slug}.md`)).toEqual(expected);
      expect(run(`cat projects/${slug}.md`)).toEqual(expected);
      expect(run(`cat ${slug.toUpperCase()}`)).toEqual(expected);
    }
  });

  it('prints usage and the slugs without an argument', () => {
    const lines = out('cat');
    expect(lines[0]).toBe('usage: cat <project>');
    for (const slug of slugs) {
      expect(lines.join('\n')).toContain(slug);
    }
  });

  it('reports an unknown project as typed', () => {
    expect(out('cat Nope')).toEqual(['cat: Nope: No such file. Try ls.']);
    expect(out('cat projects/')).toEqual([
      'cat: projects/: No such file. Try ls.',
    ]);
    expect(out('cat a b')).toEqual(['cat: a b: No such file. Try ls.']);
  });
});

describe('experience, stack, education', () => {
  it('summarises each role with company and period', () => {
    const [entry] = profile.experience;
    const { lines } = run('experience');
    expect(lines[0]).toEqual([
      { text: `${entry!.role} @ ${entry!.company}`, style: 'bright' },
    ]);
    expect(plain(lines)).toEqual([
      `${entry!.role} @ ${entry!.company}`,
      entry!.period,
    ]);
  });

  it('lists each stack group with its items', () => {
    const lines = out('stack');
    expect(lines).toHaveLength(profile.stackGroups.length);
    profile.stackGroups.forEach((group, index) => {
      expect(lines[index]).toBe(`${group.label}: ${group.items.join(' · ')}`);
    });
  });

  it('lists each degree with institution and period, separated by blanks', () => {
    const lines = out('education');
    const expected = profile.education.flatMap((entry, index) => [
      ...(index === 0 ? [] : ['']),
      entry.title,
      `${entry.institution} · ${entry.period}`,
    ]);
    expect(lines).toEqual(expected);
    expect(run('education').lines[0]).toEqual([
      { text: profile.education[0]!.title, style: 'bright' },
    ]);
  });
});

describe('actions', () => {
  it('opens GitHub and LinkedIn', () => {
    expect(run('github')).toEqual({
      lines: [[{ text: 'Opening GitHub...', style: 'plain' }]],
      action: { type: 'open', url: links.github },
    });
    expect(run('linkedin')).toEqual({
      lines: [[{ text: 'Opening LinkedIn...', style: 'plain' }]],
      action: { type: 'open', url: links.linkedin },
    });
  });

  it('prints the address as a mailto link and opens it', () => {
    const result = run('email');
    const link = result.lines
      .flat()
      .find((segment) => segment.style === 'link');
    expect(link).toEqual({
      text: links.email,
      style: 'link',
      href: mailto(links.email),
    });
    expect(result.action).toEqual({ type: 'open', url: mailto(links.email) });
  });

  it('downloads the CV', () => {
    expect(run('cv')).toEqual({
      lines: [[{ text: 'Downloading CV...', style: 'plain' }]],
      action: { type: 'download', path: profile.footer.cvPath },
    });
  });

  it('clears the screen', () => {
    expect(run('clear')).toEqual({ lines: [], action: { type: 'clear' } });
  });
});

describe('easter eggs', () => {
  it('answers sudo with anything', () => {
    const nice = 'Nice try. But you can hire me instead: type email or cv.';
    expect(out('sudo rm -rf /')).toEqual([nice]);
    expect(out('SUDO')).toEqual([nice]);
    expect(run('sudo make me a job').action).toBeUndefined();
  });

  it('answers hire and hire yiorgos with the email link and the CV hint', () => {
    for (const input of ['hire', 'Hire Yiorgos']) {
      const result = run(input);
      const text = plain(result.lines).join('\n');
      expect(text).toContain(links.email);
      expect(text).toContain('cv');
      expect(
        result.lines
          .flat()
          .find((segment) => segment.style === 'link' && segment.href),
      ).toMatchObject({ href: mailto(links.email) });
      expect(result.action).toBeUndefined();
    }
  });

  it('draws a detailed bunny for kats, narrow enough for phones', () => {
    const { lines, action } = run('kats');
    const art = lines.slice(0, -1);
    const caption = lines.at(-1)!;
    expect(art.length).toBeGreaterThanOrEqual(10);
    expect(plain(art).join('\n')).toContain('(o) (o)');
    expect(art.flat().every((segment) => segment.style === 'accent')).toBe(
      true,
    );
    expect(
      Math.max(...plain(art).map((row) => row.length)),
    ).toBeLessThanOrEqual(24);
    expect(caption).toEqual([{ text: 'hop hop.', style: 'muted' }]);
    expect(run('KATS')).toEqual(run('kats'));
    expect(action).toBeUndefined();
  });

  const artWidth = (input: string) =>
    Math.max(...out(input).map((row) => row.length));
  const stylesOf = (line: OutputLine) =>
    line.filter((segment) => segment.text.trim() !== '').map((s) => s.style);

  it.each(['pdl', 'pap', 'pegkas', 'mike', 'rest'])(
    'draws %s as hidden, case-insensitive art narrow enough for phones',
    (name) => {
      const result = run(name);
      expect(result.lines.length).toBeGreaterThanOrEqual(5);
      expect(artWidth(name)).toBeLessThanOrEqual(24);
      expect(run(name.toUpperCase())).toEqual(result);
      expect(result.action).toBeUndefined();
      expect(profile.commands.some((command) => command.name === name)).toBe(
        false,
      );
    },
  );

  it('draws pdl as two eyes looking in different directions', () => {
    const pupils = out('pdl').find((row) => row.includes('(@)'))!;
    const [left, right] = pupils.split(/(?<=\|)(?=\s)/);
    expect(left!.trimEnd().startsWith('|(@)')).toBe(true);
    expect(right!.trimEnd().endsWith('(@)|')).toBe(true);
  });

  it('draws pap as an arrow missing its target, then bad aim', () => {
    const rows = out('pap');
    const arrow = rows.findIndex((row) => row.includes('>>---->'));
    const target = rows.findIndex((row) => row.includes('( o )'));
    expect(arrow).toBeGreaterThanOrEqual(0);
    expect(arrow).toBeLessThan(target);
    expect(rows.join('\n')).toContain('| |__');
    const bullseye = run('pap').lines[target]!;
    expect(stylesOf(bullseye)).toContain('red');
  });

  it('draws pegkas as a smiling face holding out red roses on green stems', () => {
    const lines = run('pegkas').lines;
    const roses = lines.flat().filter((segment) => segment.text.includes('@'));
    expect(roses.length).toBeGreaterThan(0);
    expect(roses.every((segment) => segment.style === 'red')).toBe(true);
    expect(
      lines.flat().some((s) => s.text.includes('|') && s.style === 'green'),
    ).toBe(true);
    expect(plain(lines).join('\n')).toContain('\\_/');
  });

  it('draws mike as the Italian flag: green, white, red', () => {
    const bands = run('mike').lines.filter((line) =>
      line.some((segment) => segment.text.includes('#')),
    );
    expect(bands.length).toBeGreaterThanOrEqual(5);
    for (const line of bands) {
      expect(stylesOf(line)).toEqual(['muted', 'green', 'bright', 'red']);
    }
  });

  it('draws rest as the rainbow pride flag, one colour per stripe', () => {
    const stripes = run('rest')
      .lines.filter((line) => line.some((s) => s.text.includes('#')))
      .map((line) => stylesOf(line).at(-1));
    expect(stripes).toEqual([
      'red',
      'orange',
      'yellow',
      'green',
      'blue',
      'violet',
    ]);
  });

  it('does not treat hire with another name as a command', () => {
    expect(out('hire someone')).toEqual([
      'command not found: hire. Type help to see what I can do.',
    ]);
  });
});

describe('unknown commands', () => {
  it('names the command as typed', () => {
    expect(out('Foo bar')).toEqual([
      'command not found: Foo. Type help to see what I can do.',
    ]);
    expect(out('constructor')).toEqual([
      'command not found: constructor. Type help to see what I can do.',
    ]);
  });
});

describe('panel', () => {
  it('lists the twelve panel commands in order', () => {
    expect(panelCommands).toEqual([
      'help',
      'whoami',
      'ls',
      'cat thesis',
      'experience',
      'stack',
      'education',
      'github',
      'linkedin',
      'email',
      'cv',
      'clear',
    ]);
  });

  it('describes each from the profile, using the cat description for cat thesis', () => {
    const entries = panelEntries(profile);
    expect(entries.map((entry) => entry.command)).toEqual([...panelCommands]);
    expect(entries.find((entry) => entry.command === 'cat thesis')).toEqual({
      command: 'cat thesis',
      description: 'show a project',
    });
    expect(entries.find((entry) => entry.command === 'help')).toEqual({
      command: 'help',
      description: 'list commands',
    });
  });

  it('uses an empty description when the profile lacks the command', () => {
    expect(panelEntries({ ...profile, commands: [] })[0]).toEqual({
      command: 'help',
      description: '',
    });
  });

  it('runs every panel command without a not-found message', () => {
    for (const command of panelCommands) {
      expect(plain(run(command).lines).join('\n')).not.toContain(
        'command not found',
      );
    }
  });
});
