import { describe, expect, it } from 'vitest';
import { links, ownerName } from '../lib/site';
import { profile } from './profile';
import { validateProfile } from './validate';

describe('profile', () => {
  it('validates with no problems', () => {
    expect(validateProfile(profile)).toEqual([]);
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
