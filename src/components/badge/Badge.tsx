import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Badge as BadgeContent } from '../../content/types';
import { supportsWebGL } from '../../lib/badge/capability';
import { whenIdle } from '../../lib/badge/deferral';
import { readBadgeEnv, wantsStaticBadge } from '../../lib/badge/loadPolicy';
import { computeStage, type Rect, type Stage } from '../../lib/badge/stage';
import type { BadgeAssets } from './Lanyard';

type SceneComponent = (typeof import('./Scene'))['default'];

interface Layout {
  stage: Stage;
  slotX: number;
  slotY: number;
  bandWidth: number;
}

class Boundary extends Component<
  { onError: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function measureLayout(slot: HTMLElement, hero: HTMLElement): Layout | null {
  const badge = slot.querySelector<HTMLElement>('[data-badge]');
  const strap = badge?.querySelector<HTMLElement>('.strap');
  const card = badge?.querySelector<HTMLElement>('.card');
  const intro = hero.querySelector('.intro');
  const current = hero.querySelector('.current');
  if (!badge || !strap || !card || !intro || !current) return null;

  const h = hero.getBoundingClientRect();
  const s = slot.getBoundingClientRect();
  const relative = (el: Element): Rect => {
    const r = el.getBoundingClientRect();
    return {
      left: r.left - h.left,
      top: r.top - h.top,
      right: r.right - h.left,
      bottom: r.bottom - h.top,
    };
  };
  const slotX = s.left - h.left;
  const slotY = s.top - h.top;
  const stage = computeStage({
    hero: { width: h.width, height: h.height },
    badge: {
      x: slotX + badge.offsetLeft + badge.offsetWidth / 2,
      top: slotY + badge.offsetTop,
    },
    strapLength: strap.offsetHeight,
    bandWidth: strap.offsetWidth,
    card: {
      width: card.offsetWidth,
      height: card.offsetHeight,
      offsetTop: card.offsetTop,
    },
    avoid: [relative(intro), relative(current)],
  });
  return { stage, slotX, slotY, bandWidth: strap.offsetWidth };
}

interface Props {
  badge: BadgeContent;
  prompt: string;
}

export default function Badge({ badge, prompt }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [failed, setFailed] = useState(false);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [hero, setHero] = useState<HTMLElement | null>(null);
  const [scene, setScene] = useState<{
    Scene: SceneComponent;
    assets: BadgeAssets;
  } | null>(null);
  const [ready, setReady] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);

  const fail = useCallback(() => setFailed(true), []);
  const markReady = useCallback(() => setReady(true), []);
  const hasLayout = layout !== null;
  const bandWidth = layout?.bandWidth ?? 16;

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () =>
      setEnabled(
        !wantsStaticBadge(readBadgeEnv(window, () => supportsWebGL(document))),
      );
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const slot = root.current?.closest<HTMLElement>('#badge-slot');
    const hero = slot?.closest<HTMLElement>('.hero');
    if (!enabled || failed || !slot || !hero) return;
    setHero(hero);
    const update = () => setLayout(measureLayout(slot, hero));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(hero);
    return () => observer.disconnect();
  }, [enabled, failed]);

  useEffect(() => {
    if (!enabled || failed || !hasLayout || scene !== null) return;
    let cancelled = false;
    const load = () => {
      import('./Scene')
        .then(async (mod) => {
          const assets = await mod.prepareAssets(badge, prompt, bandWidth);
          if (!cancelled) setScene({ Scene: mod.default, assets });
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        });
    };
    const cancel = whenIdle(window, load);
    return () => {
      cancelled = true;
      cancel();
    };
  }, [enabled, failed, hasLayout, scene, badge, prompt, bandWidth]);

  useEffect(() => {
    const el = frame.current;
    if (!el || !hasLayout) return;
    const observer = new IntersectionObserver(([entry]) =>
      setOnScreen(entry?.isIntersecting ?? true),
    );
    observer.observe(el);
    const onVisibility = () =>
      setPageVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [hasLayout]);

  const shown = enabled && !failed && ready;
  useEffect(() => {
    const slot = root.current?.closest<HTMLElement>('#badge-slot');
    if (!slot) return;
    if (shown) slot.setAttribute('data-badge-3d', 'ready');
    else slot.removeAttribute('data-badge-3d');
  }, [shown]);

  useEffect(() => {
    if (!enabled) setReady(false);
  }, [enabled]);

  const live = enabled && !failed && layout !== null;
  const stage = layout?.stage;
  return (
    <div
      ref={root}
      className="badge-3d"
      data-ready={shown || undefined}
      aria-hidden="true"
    >
      {live && stage && (
        <div
          ref={frame}
          className="badge-frame"
          style={{
            left: -layout.slotX,
            top: -layout.slotY,
            width: stage.width,
            height: stage.height,
          }}
        >
          {scene && hero && (
            <Boundary onError={fail}>
              <scene.Scene
                stage={stage}
                assets={scene.assets}
                hero={hero}
                active={onScreen && pageVisible}
                onReady={markReady}
                onLost={fail}
              />
            </Boundary>
          )}
        </div>
      )}
    </div>
  );
}
