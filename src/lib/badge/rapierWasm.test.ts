import { describe, expect, it } from 'vitest';
import { externalizeRapierWasm, rapierWasmFile } from './rapierWasm';

const base64 = 'AGFzbQEAAAAB6QykAWACf38AYAN/f38A+/=';

describe('externalizeRapierWasm', () => {
  it('replaces the inlined base64 module with a url to the wasm file', () => {
    const code = `a;function dg(){return Lg(this,void 0,void 0,(function*(){yield xA(lg.toByteArray("${base64}").buffer)}))}b;`;
    const out = externalizeRapierWasm(code);
    expect(out).toBe(
      `a;function dg(){return Lg(this,void 0,void 0,(function*(){yield xA({module_or_path:new URL("./${rapierWasmFile}",import.meta.url)})}))}b;`,
    );
    expect(out).not.toContain(base64);
  });

  it('returns null when the inlined module is not there', () => {
    expect(externalizeRapierWasm('export const x = 1;')).toBeNull();
  });
});
