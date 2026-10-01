import { describe, expect, it } from 'vitest';
import { validateProfile } from './validate';
import type { Profile } from './types';

const base: Profile = {
  meta: {
    title: 'Some Name | Engineer',
    description: 'Some Name is an engineer.',
  },
  links: {
    linkedinUrl: 'https://www.linkedin.com/in/example/',
    githubUrl: 'https://github.com/example',
    email: 'someone@example.com',
  },
  hero: { intro: 'Hello.', moreLabel: '[more]', current: ['Role @ Company'] },
  about: {
    paragraphs: ['A paragraph.'],
    languages: [{ name: 'English', level: 'C2' }],
  },
  badge: {
    name: 'Some Name',
    role: 'Engineer',
    line: 'Line',
    chips: ['AI'],
    pass: 'PASS #1',
    strap: 'github.com/example',
  },
  projects: [
    {
      slug: 'public-one',
      title: 'Public one',
      tagline: 'Tagline',
      kind: 'research',
      visibility: 'public',
      repoUrl: 'https://github.com/example/repo',
      repoLabel: 'Repo',
      summary: 'Summary.',
      highlights: ['Highlight'],
      metrics: ['Metric'],
      stack: ['Python'],
      sketch: ['a -> b'],
    },
    {
      slug: 'case-two',
      title: 'Case two',
      tagline: 'Tagline',
      kind: 'case-study',
      visibility: 'private',
      org: 'Org',
      summary: 'Summary.',
      highlights: ['Highlight'],
      metrics: ['Metric'],
      stack: ['Python'],
      sketch: ['a -> b'],
    },
  ],
  experience: [
    { role: 'Role', company: 'Company', period: 'Now', points: ['Point'] },
  ],
  stackGroups: [{ label: 'Group', items: ['Item'] }],
  education: [
    { title: 'Degree', institution: 'School', period: '2020 to 2024' },
    {
      title: 'Degree 2',
      institution: 'School',
      period: '2024 to 2025',
      details: ['Detail'],
    },
  ],
  certifications: ['Certificate'],
  footer: {
    closing: 'Bye.',
    segments: [
      { kind: 'text', text: 'Write to ' },
      { kind: 'link', link: 'email', label: 'me' },
    ],
    cvLabel: 'Download CV',
    cvPath: '/cv.pdf',
    copyright: '© 2026 Some Name',
    builtWith: 'Built with Astro',
  },
  commands: [{ name: 'help', description: 'list commands' }],
};

function setFooterText(draft: Profile, text: string): void {
  draft.footer.segments = [{ kind: 'text', text }];
}

function change(mutate: (draft: Profile) => void): string[] {
  const draft = structuredClone(base);
  mutate(draft);
  return validateProfile(draft);
}

function expectProblem(problems: string[], fragment: string): void {
  expect(problems.some((problem) => problem.includes(fragment))).toBe(true);
}

describe('validateProfile', () => {
  it('accepts a valid profile', () => {
    expect(validateProfile(base)).toEqual([]);
  });

  it('reports the path of the offending value', () => {
    const problems = change((p) => {
      p.about.paragraphs[0] = 'Georgios here';
    });
    expect(problems).toEqual(['about.paragraphs[0]: contains "Georgios"']);
  });

  it('checks every footer segment, label, and line', () => {
    const problems = change((p) => {
      p.footer.segments = [
        { kind: 'text', text: 'Hello' },
        { kind: 'link', link: 'github', label: 'Georgios' },
      ];
      p.footer.copyright = 'Call 691 234 5678';
      p.footer.builtWith = '';
    });
    expect(problems).toEqual([
      'footer.segments[1].label: contains "Georgios"',
      'footer.copyright: looks like a phone number',
      'footer.builtWith: empty string',
    ]);
  });

  describe('forbidden text', () => {
    it.each(['Georgios', 'GEORGIOS', 'georgios'])('rejects %s', (name) => {
      expectProblem(
        change((p) => {
          p.hero.intro = `Hi, I am ${name}.`;
        }),
        'Georgios',
      );
    });

    it('rejects an em dash', () => {
      expectProblem(
        change((p) => {
          p.hero.intro = `One ${String.fromCharCode(0x2014)} two`;
        }),
        'em dash',
      );
    });

    it.each(['George20021', 'georgios-papadopoulos002'])(
      'rejects the old link %s',
      (old) => {
        expectProblem(
          change((p) => {
            p.links.githubUrl = `https://github.com/${old}`;
          }),
          'old link',
        );
      },
    );

    it.each([
      '6912345678',
      '691 234 5678',
      '691-234-5678',
      '691.234.5678',
      '+30 691 234 5678',
      '+306912345678',
      '+30 21 0123 4567',
      '210123456',
    ])('rejects the phone number %s', (phone) => {
      expectProblem(
        change((p) => {
          setFooterText(p, `Call ${phone} now`);
        }),
        'phone number',
      );
    });

    it('allows short numbers, years, and metrics', () => {
      expect(
        change((p) => {
          p.projects[0]!.metrics = ['1,300+ tests', '112K X-rays', '24 cases'];
          p.education[0]!.period = '2021 to 2026';
        }),
      ).toEqual([]);
    });

    it('rejects a mailto link in text', () => {
      expectProblem(
        change((p) => {
          setFooterText(p, 'Write to mailto:someone@example.com');
        }),
        'mailto',
      );
    });
  });

  describe('links', () => {
    it('rejects an http url', () => {
      expectProblem(
        change((p) => {
          p.links.githubUrl = 'http://github.com/example';
        }),
        'https://',
      );
    });

    it('rejects a url field without a scheme', () => {
      expectProblem(
        change((p) => {
          p.projects[0]!.repoUrl = 'github.com/example/repo';
        }),
        'must start with https://',
      );
    });

    it('rejects other schemes inside text', () => {
      expectProblem(
        change((p) => {
          setFooterText(p, 'See ftp://example.com/file');
        }),
        'https://',
      );
    });

    it('allows https urls inside text', () => {
      expect(
        change((p) => {
          setFooterText(p, 'See https://example.com/page');
        }),
      ).toEqual([]);
    });

    it('rejects a mailto link in the email field', () => {
      expectProblem(
        change((p) => {
          p.links.email = 'mailto:someone@example.com';
        }),
        'mailto',
      );
    });

    it('rejects an invalid email address', () => {
      expectProblem(
        change((p) => {
          p.links.email = 'not an address';
        }),
        'valid email address',
      );
    });
  });

  describe('projects', () => {
    it('rejects duplicate slugs', () => {
      expectProblem(
        change((p) => {
          p.projects[1]!.slug = 'public-one';
        }),
        'duplicate slug',
      );
    });

    it.each([
      'Upper',
      'with_underscore',
      'two  words',
      '-lead',
      'trail-',
      'a--b',
    ])('rejects the slug %s', (slug) => {
      expectProblem(
        change((p) => {
          p.projects[0]!.slug = slug;
        }),
        'kebab-case',
      );
    });

    it('rejects a repo url on a case study', () => {
      expectProblem(
        change((p) => {
          p.projects[1]!.repoUrl = 'https://github.com/example/private';
        }),
        'case study',
      );
    });

    it('rejects sketch lines over 46 characters', () => {
      expectProblem(
        change((p) => {
          p.projects[0]!.sketch = ['x'.repeat(47)];
        }),
        '46 characters',
      );
    });

    it('accepts sketch lines of exactly 46 characters', () => {
      expect(
        change((p) => {
          p.projects[0]!.sketch = ['x'.repeat(46)];
        }),
      ).toEqual([]);
    });

    it('rejects non-ASCII sketch characters', () => {
      expectProblem(
        change((p) => {
          p.projects[0]!.sketch = ['a → b'];
        }),
        'ASCII',
      );
    });
  });

  describe('empty values', () => {
    it('rejects an empty string', () => {
      expectProblem(
        change((p) => {
          p.hero.intro = '';
        }),
        'empty string',
      );
    });

    it('rejects a whitespace-only string', () => {
      expectProblem(
        change((p) => {
          p.hero.moreLabel = '   ';
        }),
        'empty string',
      );
    });

    it('rejects an empty array', () => {
      expectProblem(
        change((p) => {
          p.projects[0]!.highlights = [];
        }),
        'empty list',
      );
    });

    it('rejects an empty top-level list', () => {
      expectProblem(
        change((p) => {
          p.projects = [];
        }),
        'projects: empty list',
      );
    });

    it('ignores optional fields that are undefined', () => {
      expect(
        change((p) => {
          p.projects[0]!.repoLabel = undefined;
        }),
      ).toEqual([]);
    });

    it('ignores omitted optional fields', () => {
      expect(
        change((p) => {
          delete p.projects[0]!.repoLabel;
          delete p.education[1]!.details;
        }),
      ).toEqual([]);
    });
  });
});
