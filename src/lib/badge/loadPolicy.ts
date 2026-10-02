export interface ConnectionInfo {
  saveData?: boolean;
  effectiveType?: string;
}

export interface BadgeEnv {
  coarse: boolean;
  hoverNone: boolean;
  saveData: boolean;
  effectiveType: string | undefined;
  reducedMotion: boolean;
  webgl: () => boolean;
}

const slowTypes = new Set(['slow-2g', '2g']);

export function isTouchFirst(env: Pick<BadgeEnv, 'coarse' | 'hoverNone'>) {
  return env.coarse && env.hoverNone;
}

export function wantsStaticBadge(env: BadgeEnv): boolean {
  return (
    isTouchFirst(env) ||
    env.saveData ||
    slowTypes.has(env.effectiveType ?? '') ||
    env.reducedMotion ||
    !env.webgl()
  );
}

export function wantsScrollSway(env: BadgeEnv): boolean {
  return isTouchFirst(env) && !env.reducedMotion;
}

export interface EnvWindow {
  navigator: object;
  matchMedia(query: string): { matches: boolean };
}

export function readBadgeEnv(win: EnvWindow, webgl: () => boolean): BadgeEnv {
  const connection = (win.navigator as { connection?: ConnectionInfo })
    .connection;
  const matches = (query: string) => win.matchMedia(query).matches;
  return {
    coarse: matches('(pointer: coarse)'),
    hoverNone: matches('(hover: none)'),
    saveData: connection?.saveData === true,
    effectiveType: connection?.effectiveType,
    reducedMotion: matches('(prefers-reduced-motion: reduce)'),
    webgl,
  };
}
