import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { profile } from './profile';

const verifiedSha256 =
  'f3b769b94d9e514dc2e2df4ed25faf5e71292d0ceafdd1c3f25662ea2331d5d1';

describe('published CV', () => {
  it('is the verified PDF', () => {
    const file = readFileSync(join('public', profile.footer.cvPath));
    expect(createHash('sha256').update(file).digest('hex')).toBe(
      verifiedSha256,
    );
  });
});
