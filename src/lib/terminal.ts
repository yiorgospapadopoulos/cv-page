import type { Project } from '../content/types';
import { hashSeed } from './typing';

export const terminalUser = 'yiorgos@thessaloniki';
export const promptText = `${terminalUser}:~$`;
export const windowTitle = `${terminalUser}: ~`;

export const terminalSections = [
  { id: 'about', heading: 'About', command: 'whoami' },
  { id: 'projects', heading: 'Projects', command: 'ls projects/' },
  {
    id: 'experience',
    heading: 'Experience',
    command: 'git log --author="Yiorgos"',
  },
  { id: 'stack', heading: 'Stack', command: 'cat stack.toml' },
  { id: 'education', heading: 'Education', command: 'cat education.md' },
] as const;

export const tryIt = {
  id: 'try',
  heading: 'Try it',
  panelHeading: 'Try a command',
  inputLabel: 'Terminal command',
} as const;

export const welcomeLines = [
  'Welcome. This terminal works.',
  'Type help, or pick a command from the list.',
] as const;

export const panelTypingMs = 18;

export interface ProjectLabel {
  prefix?: string;
  text: string;
  href?: string;
}

export function snakeCase(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function dotJoin(items: string[]): string {
  return items.join(' · ');
}

export function fakeHash(seed: string): string {
  return hashSeed(seed).toString(16).padStart(8, '0').slice(0, 7);
}

export function projectLabel(project: Project): ProjectLabel {
  if (project.visibility === 'public' && project.repoUrl !== undefined) {
    return {
      prefix: 'public',
      text: project.repoLabel ?? project.repoUrl,
      href: project.repoUrl,
    };
  }
  if (project.org !== undefined) {
    const kind = project.kind === 'case-study' ? 'case study' : 'project';
    return { text: `private, ${project.org} ${kind}` };
  }
  return { text: project.repoLabel ?? 'private' };
}
