import { mailto } from '../lib/site';
import type { Profile } from './types';

const maxSketchWidth = 46;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const schemePattern = /[a-z][a-z0-9+.-]*:\/\/\S*/gi;

const forbiddenText = [
  { pattern: /georgios/i, message: 'contains "Georgios"' },
  {
    pattern: new RegExp(String.fromCharCode(0x2014)),
    message: 'contains an em dash',
  },
  {
    pattern: /George20021|georgios-papadopoulos002/i,
    message: 'contains an old link',
  },
  { pattern: /mailto:/i, message: 'contains a mailto link' },
  {
    pattern: /\d(?:[\s.+-]*\d){8,}/,
    message: 'looks like a phone number',
  },
];

function checkString(
  text: string,
  path: string,
  key: string,
  problems: string[],
): void {
  if (text.trim() === '') {
    problems.push(`${path}: empty string`);
  }
  for (const { pattern, message } of forbiddenText) {
    if (pattern.test(text)) {
      problems.push(`${path}: ${message}`);
    }
  }
  for (const url of text.match(schemePattern) ?? []) {
    if (!url.startsWith('https://')) {
      problems.push(`${path}: url must start with https://`);
    }
  }
  if (key.endsWith('Url') && !text.startsWith('https://')) {
    problems.push(`${path}: url must start with https://`);
  }
  if (key === 'email') {
    try {
      mailto(text);
    } catch {
      problems.push(`${path}: not a valid email address`);
    }
  }
}

function walk(
  value: unknown,
  path: string,
  key: string,
  problems: string[],
): void {
  if (typeof value === 'string') {
    checkString(value, path, key, problems);
  } else if (Array.isArray(value)) {
    if (value.length === 0) {
      problems.push(`${path}: empty list`);
    }
    value.forEach((item, index) =>
      walk(item, `${path}[${index}]`, key, problems),
    );
  } else if (value instanceof Object) {
    for (const [name, child] of Object.entries(value)) {
      walk(child, path === '' ? name : `${path}.${name}`, name, problems);
    }
  }
}

function checkProjects(profile: Profile, problems: string[]): void {
  const seen = new Set<string>();
  profile.projects.forEach((project, index) => {
    const path = `projects[${index}]`;
    if (!slugPattern.test(project.slug)) {
      problems.push(`${path}.slug: must be lowercase kebab-case`);
    }
    if (seen.has(project.slug)) {
      problems.push(`${path}.slug: duplicate slug "${project.slug}"`);
    }
    seen.add(project.slug);
    if (project.kind === 'case-study' && project.repoUrl !== undefined) {
      problems.push(`${path}.repoUrl: a case study must not have a repo url`);
    }
    project.sketch.forEach((line, lineIndex) => {
      const linePath = `${path}.sketch[${lineIndex}]`;
      if (line.length > maxSketchWidth) {
        problems.push(`${linePath}: longer than ${maxSketchWidth} characters`);
      }
      if (/[^\x20-\x7e]/.test(line)) {
        problems.push(`${linePath}: must be ASCII only`);
      }
    });
  });
}

export function validateProfile(profile: Profile): string[] {
  const problems: string[] = [];
  walk(profile, '', '', problems);
  checkProjects(profile, problems);
  return problems;
}
