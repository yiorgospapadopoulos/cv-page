import { describe, expect, it } from 'vitest';
import { profile } from '../content/profile';
import { footerParts } from './footer';
import { links, mailto } from './site';

describe('footerParts', () => {
  const parts = footerParts(profile);

  it('keeps the order of text and link segments', () => {
    expect(parts.map((part) => part.kind)).toEqual([
      'text',
      'link',
      'text',
      'link',
      'text',
      'link',
      'text',
    ]);
    expect(parts[0]).toEqual({
      kind: 'text',
      text: "I'd love to hear from you. Connect on ",
    });
  });

  it('resolves external links to the profile urls', () => {
    expect(parts[1]).toEqual({
      kind: 'link',
      link: 'linkedin',
      label: 'LinkedIn',
      href: links.linkedin,
      external: true,
    });
    expect(parts[3]).toEqual({
      kind: 'link',
      link: 'github',
      label: 'GitHub',
      href: links.github,
      external: true,
    });
  });

  it('resolves the email link to a mailto url that stays in the same tab', () => {
    expect(parts[5]).toEqual({
      kind: 'link',
      link: 'email',
      label: 'email',
      href: mailto(links.email),
      external: false,
    });
  });
});
