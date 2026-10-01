import { Environment, Lightformer } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { Suspense, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Badge } from '../../content/types';
import { layoutCardBack, layoutCardFront } from '../../lib/badge/cardLayout';
import {
  canvasMeasure,
  drawFace,
  drawStrapTile,
  strapTile,
  type Ctx2D,
} from '../../lib/badge/draw';
import { canvasToWorld, type Stage } from '../../lib/badge/stage';
import Lanyard, { type BadgeAssets, type DragState } from './Lanyard';

const textureScale = 4;

function context(canvas: HTMLCanvasElement): Ctx2D {
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('2d canvas unavailable');
  return ctx;
}

export async function prepareAssets(
  badge: Badge,
  prompt: string,
  bandWidth: number,
): Promise<BadgeAssets> {
  const style = getComputedStyle(document.documentElement);
  const serif = style.getPropertyValue('--font-serif').trim();
  const mono = style.getPropertyValue('--font-mono').trim();
  await Promise.all([
    document.fonts.load(`500 28px ${serif}`, badge.name),
    document.fonts.load(`400 12px ${serif}`, badge.line),
    document.fonts.load(`400 9px ${mono}`, badge.pass),
  ]);
  await document.fonts.ready;

  const measure = canvasMeasure(context(document.createElement('canvas')));
  const options = { measure, serif, mono, scale: textureScale };
  const paint = (face: ReturnType<typeof layoutCardFront>) => {
    const canvas = document.createElement('canvas');
    canvas.width = face.width;
    canvas.height = face.height;
    drawFace(context(canvas), face, textureScale);
    return canvas;
  };
  const tile = strapTile(badge.strap, {
    band: bandWidth,
    scale: textureScale,
    mono,
    measure,
  });
  const strap = document.createElement('canvas');
  strap.width = tile.width;
  strap.height = tile.height;
  drawStrapTile(context(strap), tile);

  return {
    front: paint(layoutCardFront(badge, options)),
    back: paint(layoutCardBack({ prompt, url: badge.strap }, options)),
    strap,
    strapLength: tile.length,
  };
}

interface Props {
  stage: Stage;
  assets: BadgeAssets;
  bandWidth: number;
  active: boolean;
  onReady: () => void;
  onLost: () => void;
}

const tapTime = 250;
const tapDistance = 6;

export default function Scene({
  stage,
  assets,
  bandWidth,
  active,
  onReady,
  onLost,
}: Props) {
  const hit = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState>({
    active: false,
    pointer: [0, 0],
    offset: [0, 0],
    spin: false,
    grab: false,
  });
  const press = useRef({ x: 0, y: 0, time: 0 });
  const [dragging, setDragging] = useState(false);
  const invalidateRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (active) invalidateRef.current();
  }, [active]);

  useEffect(() => {
    if (!dragging) return;
    const previous = document.body.style.cursor;
    document.body.style.cursor = 'grabbing';
    return () => {
      document.body.style.cursor = previous;
    };
  }, [dragging]);

  const toWorld = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.parentElement!.getBoundingClientRect();
    return canvasToWorld(
      stage,
      event.clientX - box.left,
      event.clientY - box.top,
    );
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    press.current = {
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
    };
    drag.current.pointer = toWorld(event);
    drag.current.grab = true;
    drag.current.active = true;
    setDragging(true);
    invalidateRef.current();
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;
    drag.current.pointer = toWorld(event);
    invalidateRef.current();
  };

  const release = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;
    const { x, y, time } = press.current;
    const tap =
      event.type === 'pointerup' &&
      performance.now() - time < tapTime &&
      Math.hypot(event.clientX - x, event.clientY - y) < tapDistance;
    drag.current.active = false;
    drag.current.spin = tap;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
    invalidateRef.current();
  };

  return (
    <>
      <Canvas
        frameloop={active ? 'demand' : 'never'}
        dpr={[1, 2]}
        flat
        gl={{ alpha: true, antialias: true }}
        camera={{
          position: [0, 0, stage.cameraZ],
          fov: stage.fov,
          near: 1,
          far: 40,
        }}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        onCreated={(state) => {
          invalidateRef.current = () => state.invalidate();
          state.gl.domElement.addEventListener('webglcontextlost', onLost);
        }}
      >
        <ambientLight intensity={2.6} />
        <Suspense fallback={null}>
          <Physics gravity={[0, -32, 0]} timeStep={1 / 60} interpolate>
            <Lanyard
              key={`${stage.rect.width}x${stage.rect.height}:${stage.anchor.join(',')}:${stage.ropeLength}`}
              stage={stage}
              assets={assets}
              bandWidth={bandWidth}
              dragging={dragging}
              drag={drag}
              hit={hit}
              onReady={onReady}
            />
          </Physics>
          <Environment resolution={128} frames={1} environmentIntensity={0.35}>
            <Lightformer
              intensity={2}
              position={[0, -1, 5]}
              rotation={[0, 0, Math.PI / 3]}
              scale={[100, 0.1, 1]}
            />
            <Lightformer
              intensity={2.5}
              position={[-1, -1, 1]}
              rotation={[0, 0, Math.PI / 3]}
              scale={[100, 0.1, 1]}
            />
            <Lightformer
              intensity={2.5}
              position={[1, 1, 1]}
              rotation={[0, 0, Math.PI / 3]}
              scale={[100, 0.1, 1]}
            />
            <Lightformer
              intensity={6}
              position={[-10, 0, 14]}
              rotation={[0, Math.PI / 2, Math.PI / 3]}
              scale={[100, 10, 1]}
            />
          </Environment>
        </Suspense>
      </Canvas>
      <div
        ref={hit}
        className="badge-hit"
        data-dragging={dragging || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
      />
    </>
  );
}
