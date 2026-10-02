import { describe, expect, it } from 'vitest';
import { links, ownerName } from '../lib/site';
import { profile } from './profile';
import { validateProfile } from './validate';

describe('profile', () => {
  it('validates with no problems', () => {
    expect(validateProfile(profile)).toEqual([]);
  });

  it('has the page title and description', () => {
    expect(profile.meta.title).toBe(
      'Yiorgos Papadopoulos | ML & LLM Systems Engineer',
    );
    expect(profile.meta.description).toBe(
      'Yiorgos Papadopoulos is an ML & LLM Systems Engineer. I build AI that helps people, and the backends that make it reliable.',
    );
    expect(profile.badge.role).toBe('ML & LLM Systems Engineer @ Zimmerman');
  });

  it('has a whoami profile that does not repeat the about paragraphs', () => {
    expect(profile.about.facts).toEqual([
      { key: 'name', value: ownerName },
      { key: 'role', value: 'ML & LLM Systems Engineer @ Zimmerman' },
      {
        key: 'studying',
        value: 'MSc AI & Applications @ University of Thessaly',
      },
      { key: 'based in', value: 'Thessaloniki, Greece' },
      {
        key: 'focus',
        value: 'medical imaging, LLM systems, typed and tested Python backends',
      },
      { key: 'languages', value: 'Greek, English' },
    ]);
    const facts = profile.about.facts.map((fact) => fact.value).join(' ');
    for (const paragraph of profile.about.paragraphs) {
      expect(facts).not.toContain(paragraph);
    }
  });

  it('avoids repeating "like" in the about paragraphs', () => {
    const text = profile.about.paragraphs.join(' ');
    expect(text.match(/\blike\b/gi) ?? []).toHaveLength(0);
  });

  it('lists only the language names', () => {
    expect(profile.about.languages).toEqual(['Greek', 'English']);
  });

  it('takes the owner name and links from the site config', () => {
    expect(profile.badge.name).toBe(ownerName);
    expect(profile.links.linkedinUrl).toBe(links.linkedin);
    expect(profile.links.githubUrl).toBe(links.github);
    expect(profile.links.email).toBe(links.email);
  });

  it('contains exactly the five projects in order', () => {
    expect(profile.projects.map((project) => project.slug)).toEqual([
      'thesis',
      'mammo',
      'model-pipeline',
      'lead-gen',
      'narrative-engine',
    ]);
  });

  it('keeps every Zimmerman project a private case study without a repo url', () => {
    const zimmerman = profile.projects.filter(
      (project) => project.org === 'Zimmerman',
    );
    expect(zimmerman.map((project) => project.slug)).toEqual([
      'model-pipeline',
      'lead-gen',
      'narrative-engine',
    ]);
    for (const project of zimmerman) {
      expect(project.kind).toBe('case-study');
      expect(project.visibility).toBe('private');
      expect(project.repoUrl).toBeUndefined();
    }
  });

  it('links only the public thesis to a repository', () => {
    const withRepo = profile.projects.filter((project) => project.repoUrl);
    expect(withRepo.map((project) => project.slug)).toEqual(['thesis']);
    expect(withRepo[0]?.visibility).toBe('public');
  });

  it('has the hero, badge, and footer copy', () => {
    expect(profile.hero.intro).toBe(
      'I build AI that helps people, and the backends that make it reliable.',
    );
    expect(profile.hero.moreLabel).toBe('[more]');
    expect(profile.hero.current).toHaveLength(2);
    expect(profile.badge.chips).toEqual(['AI/ML', 'Backend', 'LLMs']);
    expect(profile.footer.cvPath).toBe('/Yiorgos_Papadopoulos_CV.pdf');
  });

  it('builds the footer sentence from text and link segments', () => {
    expect(
      profile.footer.segments
        .map((segment) =>
          segment.kind === 'text' ? segment.text : segment.label,
        )
        .join(''),
    ).toBe(
      "I'd love to hear from you. Connect on LinkedIn, see my code on GitHub, or send me an email.",
    );
    expect(
      profile.footer.segments.flatMap((segment) =>
        segment.kind === 'link' ? [segment.link] : [],
      ),
    ).toEqual(['linkedin', 'github', 'email']);
    expect(profile.footer.closing).toBe('Building AI that people can rely on.');
    expect(profile.footer.cvLabel).toBe('Download CV');
    expect(profile.footer.copyright).toBe(`© 2026 ${ownerName}`);
    expect(profile.footer).not.toHaveProperty('builtWith');
  });

  it('has one experience entry, five stack groups, and three education entries', () => {
    expect(profile.experience).toHaveLength(1);
    expect(profile.stackGroups.map((group) => group.label)).toEqual([
      'Machine learning',
      'LLMs and retrieval',
      'Backend',
      'Engineering',
      'Languages',
    ]);
    expect(profile.education).toHaveLength(3);
    expect(profile.certifications).toHaveLength(2);
  });

  it('lists the terminal commands in order', () => {
    expect(profile.commands.map((command) => command.name)).toEqual([
      'help',
      'ls',
      'cat <project>',
      'whoami',
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
});
