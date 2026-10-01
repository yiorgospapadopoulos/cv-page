import { describe, expect, it } from 'vitest';
import { links, mailto, ownerName } from './site';

describe('site config', () => {
  it('exposes the owner name', () => {
    expect(ownerName).toBe('Yiorgos Papadopoulos');
  });

  it('exposes the profile links', () => {
    expect(links.linkedin).toBe(
      'https://www.linkedin.com/in/yiorgospapadopoulos/',
    );
    expect(links.github).toBe('https://github.com/yiorgospapadopoulos');
    expect(links.email).toBe('giorgospapadopoulos002@yahoo.com');
  });
});

describe('mailto', () => {
  it('builds a mailto link for a valid address', () => {
    expect(mailto('giorgospapadopoulos002@yahoo.com')).toBe(
      'mailto:giorgospapadopoulos002@yahoo.com',
    );
  });

  it.each([
    '',
    'plainaddress',
    'a@b',
    '@yahoo.com',
    'a b@yahoo.com',
    'a@@b.com',
  ])('throws for the invalid address %j', (address) => {
    expect(() => mailto(address)).toThrow('Invalid email address');
  });
});
