export interface ConnectionInfo {
  saveData?: boolean;
  effectiveType?: string;
}

export interface LoadEnv {
  connection?: ConnectionInfo;
  coarsePointer: boolean;
}

export type LoadMode = 'skip' | 'idle' | 'deferred';

const slowTypes = new Set(['slow-2g', '2g']);

export function badgeLoadMode(env: LoadEnv): LoadMode {
  const { connection } = env;
  if (
    connection?.saveData === true ||
    slowTypes.has(connection?.effectiveType ?? '')
  ) {
    return 'skip';
  }
  return env.coarsePointer ? 'deferred' : 'idle';
}

export interface EnvWindow {
  navigator: object;
  matchMedia(query: string): { matches: boolean };
}

export function readLoadEnv(win: EnvWindow): LoadEnv {
  return {
    connection: (win.navigator as { connection?: ConnectionInfo }).connection,
    coarsePointer: win.matchMedia('(pointer: coarse)').matches,
  };
}
