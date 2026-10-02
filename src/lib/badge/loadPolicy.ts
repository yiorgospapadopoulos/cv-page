export interface ConnectionInfo {
  saveData?: boolean;
  effectiveType?: string;
}

export interface BadgeEnv {
  wide: boolean;
  saveData: boolean;
  effectiveType: string | undefined;
  reducedMotion: boolean;
  webgl: () => boolean;
}

const slowTypes = new Set(['slow-2g', '2g']);

export const wideQuery = '(min-width: 860px)';

export function wantsStaticBadge(env: BadgeEnv): boolean {
  return (
    !env.wide ||
    env.saveData ||
    slowTypes.has(env.effectiveType ?? '') ||
    env.reducedMotion ||
    !env.webgl()
  );
}

export function wantsScrollTilt(env: BadgeEnv): boolean {
  return !env.wide && !env.reducedMotion;
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
    wide: matches(wideQuery),
    saveData: connection?.saveData === true,
    effectiveType: connection?.effectiveType,
    reducedMotion: matches('(prefers-reduced-motion: reduce)'),
    webgl,
  };
}
