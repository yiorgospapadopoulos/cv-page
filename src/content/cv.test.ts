import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { profile } from './profile';

const verifiedSha256 =
  'eed6b4e1b6e9fb4b98bf69642ece9a3c5a3a819256c5dd13546414babfa1d694';

describe('published CV', () => {
  it('is the verified PDF', () => {
    const file = readFileSync(join('public', profile.footer.cvPath));
    expect(createHash('sha256').update(file).digest('hex')).toBe(
      verifiedSha256,
    );
  });
});
