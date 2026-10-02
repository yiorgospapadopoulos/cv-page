export type ProjectKind = 'research' | 'case-study';
export type ProjectVisibility = 'public' | 'private';

export interface ProfileLinks {
  linkedinUrl: string;
  githubUrl: string;
  email: string;
}

export interface Hero {
  intro: string;
  moreLabel: string;
  current: string[];
}

export interface About {
  paragraphs: string[];
  languages: string[];
}

export interface Badge {
  name: string;
  role: string;
  line: string;
  chips: string[];
  pass: string;
  strap: string;
}

export interface Project {
  slug: string;
  title: string;
  tagline: string;
  kind: ProjectKind;
  visibility: ProjectVisibility;
  org?: string;
  repoUrl?: string;
  repoLabel?: string;
  summary: string;
  highlights: string[];
  metrics: string[];
  stack: string[];
  sketch: string[];
}

export interface ExperienceEntry {
  role: string;
  company: string;
  period: string;
  points: string[];
}

export interface StackGroup {
  label: string;
  items: string[];
}

export interface EducationEntry {
  title: string;
  institution: string;
  period: string;
  details?: string[];
}

export type FooterLinkKey = 'linkedin' | 'github' | 'email';

export type FooterSegment =
  | { kind: 'text'; text: string }
  | { kind: 'link'; link: FooterLinkKey; label: string };

export interface Footer {
  closing: string;
  segments: FooterSegment[];
  cvLabel: string;
  cvPath: string;
  copyright: string;
  builtWith: string;
}

export interface TerminalCommand {
  name: string;
  description: string;
}

export interface Meta {
  title: string;
  description: string;
}

export interface Profile {
  meta: Meta;
  links: ProfileLinks;
  hero: Hero;
  about: About;
  badge: Badge;
  projects: Project[];
  experience: ExperienceEntry[];
  stackGroups: StackGroup[];
  education: EducationEntry[];
  certifications: string[];
  footer: Footer;
  commands: TerminalCommand[];
}
