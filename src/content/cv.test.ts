import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { profile } from './profile';

const verifiedSha256 =
  'fd22ae283006a92f48d6adede9ace6b439fe479e1938854093e01e168fe8976f';

describe('published CV', () => {
  it('is the verified PDF', () => {
    const file = readFileSync(join('public', profile.footer.cvPath));
    expect(createHash('sha256').update(file).digest('hex')).toBe(
      verifiedSha256,
    );
  });
});
