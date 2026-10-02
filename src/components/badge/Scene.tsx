import { Environment, Lightformer } from '@react-three/drei';
import {
  Canvas,
  events as pointerEvents,
  type RootState,
} from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { Suspense, useRef } from 'react';
import type { Badge } from '../../content/types';
import { layoutCardBack, layoutCardFront } from '../../lib/badge/cardLayout';
import {
  canvasMeasure,
  drawFace,
  drawStrapTile,
  strapTile,
  type Ctx2D,
} from '../../lib/badge/draw';
import { toWorld } from '../../lib/badge/physics';
import { clientToNdc, type Stage } from '../../lib/badge/stage';
import Lanyard, { type BadgeAssets } from './Lanyard';

const textureScale = 4;
const world = toWorld();

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
    strapLabel: tile.label,
  };
}

interface Props {
  stage: Stage;
  assets: BadgeAssets;
  hero: HTMLElement;
  active: boolean;
  drop: boolean;
  onReady: () => void;
  onLost: () => void;
}

// The canvas ignores the pointer; the hero forwards events so the card is
// hit by raycasting while the text underneath stays usable.
const heroEvents: typeof pointerEvents = (store) => {
  const base = pointerEvents(store);
  return {
    ...base,
    compute(event: MouseEvent, state: RootState) {
      const target = state.events.connected as HTMLElement;
      const [x, y] = clientToNdc(
        [event.clientX, event.clientY],
        target.getBoundingClientRect(),
      );
      state.pointer.set(x, y);
      state.raycaster.setFromCamera(state.pointer, state.camera);
    },
  };
};

export default function Scene({
  stage,
  assets,
  hero,
  active,
  drop,
  onReady,
  onLost,
}: Props) {
  const hit = useRef<HTMLDivElement>(null);

  return (
    <>
      <Canvas
        frameloop={active ? 'demand' : 'never'}
        dpr={[1, 2]}
        flat
        gl={{ alpha: true, antialias: true, premultipliedAlpha: true }}
        camera={{
          position: [0, 0, stage.cameraZ],
          fov: stage.fov,
          near: 1,
          far: 40,
        }}
        eventSource={hero}
        events={heroEvents}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        onCreated={(state) => {
          state.gl.domElement.addEventListener('webglcontextlost', onLost);
        }}
      >
        <ambientLight intensity={2.6} />
        <Suspense fallback={null}>
          <Physics
            gravity={[0, world.gravity, 0]}
            timeStep={world.timeStep}
            numSolverIterations={world.solverIterations}
            updatePriority={-1}
            interpolate
          >
            <Lanyard
              key={`${stage.width}x${stage.height}:${stage.anchor.join(',')}:${stage.ropeLength}`}
              stage={stage}
              assets={assets}
              hero={hero}
              hit={hit}
              active={active}
              drop={drop}
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
      <div ref={hit} className="badge-hit" />
    </>
  );
}
