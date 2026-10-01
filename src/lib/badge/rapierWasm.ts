export const rapierWasmFile = 'rapier_wasm3d_bg.wasm';

const inlined = /yield (\w+)\(\w+\.toByteArray\("[A-Za-z0-9+/=]+"\)\.buffer\)/;

export function externalizeRapierWasm(code: string): string | null {
  if (!inlined.test(code)) return null;
  return code.replace(
    inlined,
    `yield $1({module_or_path:new URL("./${rapierWasmFile}",import.meta.url)})`,
  );
}
