import type { Profile } from '../content/types';
import { mailto, ownerName } from './site';
import { dotJoin, projectLabel } from './terminal';

export type TextStyle =
  | 'plain'
  | 'muted'
  | 'bright'
  | 'accent'
  | 'prompt'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'violet';

export type Segment =
  | { text: string; style: TextStyle }
  | { text: string; style: 'link'; href: string };

export type OutputLine = Segment[];

export type CommandAction =
  | { type: 'open'; url: string }
  | { type: 'download'; path: string }
  | { type: 'clear' };

export interface CommandResult {
  lines: OutputLine[];
  action?: CommandAction;
}

export interface PanelEntry {
  command: string;
  description: string;
}

export const panelCommands = [
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
] as const;

const catKey = 'cat <project>';

type Handler = (
  args: string[],
  profile: Profile,
  name: string,
) => CommandResult;

const text = (value: string, style: TextStyle = 'plain'): Segment => ({
  text: value,
  style,
});

const say = (value: string, style: TextStyle = 'plain'): CommandResult => ({
  lines: [[text(value, style)]],
});

function withBlanks(blocks: OutputLine[][]): OutputLine[] {
  return blocks.flatMap((block, index) =>
    index === 0 ? block : [[], ...block],
  );
}

function aligned(rows: Array<[string, string]>): OutputLine[] {
  const width = Math.max(...rows.map(([label]) => label.length)) + 2;
  return rows.map(([label, rest]) => [
    text(label.padEnd(width), 'accent'),
    text(rest, 'muted'),
  ]);
}

function help(_args: string[], profile: Profile): CommandResult {
  return {
    lines: [
      [text('Available commands:', 'muted')],
      ...aligned(profile.commands.map((c) => [c.name, c.description])),
    ],
  };
}

function whoami(_args: string[], profile: Profile): CommandResult {
  return {
    lines: [[text(ownerName, 'bright')], [text(profile.hero.intro)]],
  };
}

function ls(args: string[], profile: Profile): CommandResult {
  const [target] = args;
  if (target !== undefined && target !== 'projects' && target !== 'projects/') {
    return say(`ls: cannot access '${target}': No such file or directory`);
  }
  return {
    lines: aligned(profile.projects.map((p) => [p.slug, p.tagline])),
  };
}

function slugOf(argument: string): string {
  return argument
    .toLowerCase()
    .replace(/^projects\//, '')
    .replace(/\.md$/, '');
}

function cat(args: string[], profile: Profile): CommandResult {
  if (args.length === 0) {
    return {
      lines: [
        [text(`usage: ${catKey}`)],
        [text(profile.projects.map((p) => p.slug).join('  '), 'accent')],
      ],
    };
  }
  const argument = args.join(' ');
  const slug = slugOf(argument);
  const project = profile.projects.find((p) => p.slug === slug);
  if (project === undefined) {
    return say(`cat: ${argument}: No such file. Try ls.`);
  }
  const label = projectLabel(project);
  const link: OutputLine =
    label.href === undefined
      ? [text(label.text, 'muted')]
      : [
          text(`${label.prefix}, `, 'muted'),
          { text: label.text, style: 'link', href: label.href },
        ];
  return {
    lines: [
      [text(project.title, 'bright')],
      [text(project.tagline, 'muted')],
      [text(project.summary)],
      [text(dotJoin(project.metrics), 'accent')],
      link,
    ],
  };
}

function experience(_args: string[], profile: Profile): CommandResult {
  return {
    lines: withBlanks(
      profile.experience.map((entry) => [
        [text(`${entry.role} @ ${entry.company}`, 'bright')],
        [text(entry.period, 'muted')],
      ]),
    ),
  };
}

function stack(_args: string[], profile: Profile): CommandResult {
  return {
    lines: profile.stackGroups.map((group) => [
      text(`${group.label}:`, 'accent'),
      text(` ${dotJoin(group.items)}`),
    ]),
  };
}

function education(_args: string[], profile: Profile): CommandResult {
  return {
    lines: withBlanks(
      profile.education.map((entry) => [
        [text(entry.title, 'bright')],
        [text(dotJoin([entry.institution, entry.period]), 'muted')],
      ]),
    ),
  };
}

function opener(label: string, pick: (profile: Profile) => string): Handler {
  return (_args, profile) => ({
    ...say(`Opening ${label}...`),
    action: { type: 'open', url: pick(profile) },
  });
}

function email(_args: string[], profile: Profile): CommandResult {
  const url = mailto(profile.links.email);
  return {
    lines: [
      [
        text('Write to me: ', 'muted'),
        { text: profile.links.email, style: 'link', href: url },
      ],
    ],
    action: { type: 'open', url },
  };
}

function cv(_args: string[], profile: Profile): CommandResult {
  return {
    ...say('Downloading CV...'),
    action: { type: 'download', path: profile.footer.cvPath },
  };
}

function clear(): CommandResult {
  return { lines: [], action: { type: 'clear' } };
}

function sudo(): CommandResult {
  return say('Nice try. But you can hire me instead: type email or cv.');
}

const bunny = [
  ' .-.     .-.',
  '/   \\   /   \\',
  "| ' |   | ' |",
  "| ' |   | ' |",
  '\\   /   \\   /',
  ' \\ /.---.\\ /',
  "  .'     '.",
  ' / (o) (o) \\',
  '|  =  v  =  |',
  " \\  '---'  /",
  "  '._____.'",
  '  /  | |  \\',
  ' (___| |___)',
];

function kats(): CommandResult {
  return {
    lines: [
      ...bunny.map((row) => [text(row, 'accent')]),
      [text('hop hop.', 'muted')],
    ],
  };
}

const ink: Record<string, TextStyle> = {
  r: 'red',
  o: 'orange',
  y: 'yellow',
  g: 'green',
  b: 'blue',
  v: 'violet',
  w: 'bright',
  a: 'accent',
  m: 'muted',
};

// Each row pairs the art with a colour mask of the same width; a mask
// character picks the style of the art character above it (see `ink`), and
// anything else, including a shorter mask, falls back to `base`.
function paint(rows: Array<[string, string]>, base: TextStyle): OutputLine[] {
  return rows.map(([art, mask]) => {
    const line: Segment[] = [];
    [...art].forEach((char, index) => {
      const style = ink[mask[index] ?? ''] ?? base;
      const last = line.at(-1);
      if (last !== undefined && last.style === style) last.text += char;
      else line.push(text(char, style));
    });
    return line;
  });
}

const art =
  (rows: Array<[string, string]>, base: TextStyle): Handler =>
  () => ({
    lines: paint(rows, base),
  });

const eyes = [
  '   .------.       .------.',
  " .'        '.   .'        '.",
  '/            \\ /            \\',
  '|            | |            |',
  '|      .--.  | |  .--.      |',
  '|     /####\\ | | /####\\     |',
  '|     |#@@#| | | |#@@#|     |',
  '\\     \\####/ / \\ \\####/     /',
  " '.    '--'.'   '.'--'    .'",
  "   '------'       '------'",
];

// Blue irises with white pupils, inside accent outlines.
const pdl = art(
  eyes.map((row) => [row, row.replace(/#/g, 'b').replace(/@/g, 'w')]),
  'accent',
);

const pap = art(
  [
    ['              >>---->', '              wwwwwww'],
    ['     .---.', '     rrrrr'],
    ['    / .-. \\', '    r wwwww'],
    ['   | ( o ) |', '   r w r w r'],
    ["    \\ '-' /", '    r wwwww'],
    ["     '---'", '     rrrrr'],
    ['', ''],
    [' _               _', ''],
    ['| |__   __ _  __| |', ''],
    ["| '_ \\ / _` |/ _` |", ''],
    ['| |_) | (_| | (_| |', ''],
    ['|_.__/ \\__,_|\\__,_|', ''],
    ['       _', ''],
    ['  __ _(_)_ __ ___', ''],
    [" / _` | | '_ ` _ \\", ''],
    ['| (_| | | | | | | |', ''],
    [' \\__,_|_|_| |_| |_|', ''],
  ],
  'accent',
);

const pegkas = art(
  [
    ['             @ @ @', '             r r r'],
    ['   .---.    @ @ @ @', '            r r r r'],
    ['  /     \\    @ @ @', '             r r r'],
    [' | ^   ^ |   \\\\|//', '             ggggg'],
    [' |   v   |    \\|/', '              ggg'],
    ['  \\ \\_/ /_____/|', '              yyg'],
    ["   '---'       |", '               g'],
  ],
  'yellow',
);

const flag = (masks: string[]): Handler =>
  art(
    [
      ...masks.map((mask): [string, string] => [
        `|${'#'.repeat(mask.length - 1)}`,
        mask,
      ]),
      ['|', ''],
      ['|', ''],
    ],
    'muted',
  );

const mike = flag(
  Array.from(
    { length: 6 },
    () => `m${'g'.repeat(6)}${'w'.repeat(6)}${'r'.repeat(6)}`,
  ),
);

const rest = flag([...'roygbv'].map((colour) => `m${colour.repeat(18)}`));

function hire(args: string[], profile: Profile, name: string): CommandResult {
  if (args.length > 0 && args.join(' ').toLowerCase() !== 'yiorgos') {
    return notFound(name);
  }
  return {
    lines: [
      [text("Great choice. Let's talk.", 'bright')],
      [
        text('Write to me: ', 'muted'),
        {
          text: profile.links.email,
          style: 'link',
          href: mailto(profile.links.email),
        },
      ],
      [text('Or type cv to grab my CV.', 'muted')],
    ],
  };
}

function notFound(name: string): CommandResult {
  return say(`command not found: ${name}. Type help to see what I can do.`);
}

const handlers = new Map<string, Handler>([
  ['help', help],
  ['whoami', whoami],
  ['ls', ls],
  ['cat', cat],
  ['experience', experience],
  ['stack', stack],
  ['education', education],
  ['github', opener('GitHub', (p) => p.links.githubUrl)],
  ['linkedin', opener('LinkedIn', (p) => p.links.linkedinUrl)],
  ['email', email],
  ['cv', cv],
  ['clear', clear],
  ['sudo', sudo],
  ['hire', hire],
  ['kats', kats],
  ['pdl', pdl],
  ['pap', pap],
  ['pegkas', pegkas],
  ['mike', mike],
  ['rest', rest],
]);

export function runCommand(input: string, profile: Profile): CommandResult {
  const words = input.trim().split(/\s+/);
  const name = words[0] as string;
  if (name === '') return { lines: [] };
  const handler = handlers.get(name.toLowerCase());
  const args = words.slice(1);
  return handler === undefined ? notFound(name) : handler(args, profile, name);
}

export function panelEntries(profile: Profile): PanelEntry[] {
  return panelCommands.map((command) => {
    const key = command.startsWith('cat ') ? catKey : command;
    const found = profile.commands.find((c) => c.name === key);
    return {
      command,
      description: found === undefined ? '' : found.description,
    };
  });
}
