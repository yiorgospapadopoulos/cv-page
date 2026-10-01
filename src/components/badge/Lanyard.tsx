import { useFrame, useThree } from '@react-three/fiber';
import {
  BallCollider,
  CuboidCollider,
  RigidBody,
  useRopeJoint,
  useSphericalJoint,
  type RapierRigidBody,
} from '@react-three/rapier';
import { MeshLineGeometry, MeshLineMaterial } from 'meshline';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { cardPalette } from '../../lib/badge/cardLayout';
import { clampDragTarget, type Stage } from '../../lib/badge/stage';
import { strapRepeat } from '../../lib/badge/strap';

export interface BadgeAssets {
  front: HTMLCanvasElement;
  back: HTMLCanvasElement;
  strap: HTMLCanvasElement;
  strapLength: number;
}

export interface DragState {
  active: boolean;
  pointer: [number, number];
  offset: [number, number];
  spin: boolean;
  grab: boolean;
}

interface Props {
  stage: Stage;
  assets: BadgeAssets;
  bandWidth: number;
  dragging: boolean;
  drag: RefObject<DragState>;
  hit: RefObject<HTMLDivElement | null>;
  onReady: () => void;
}

const segmentProps = {
  canSleep: true,
  colliders: false,
  angularDamping: 2,
  linearDamping: 2,
} as const;

const thickness = 0.02;
const restSpeed = 0.02;
const restFrames = 45;

function roundedRect(width: number, height: number, radius: number) {
  const shape = new THREE.Shape();
  const x = -width / 2;
  const y = -height / 2;
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

function faceGeometry(shape: THREE.Shape, width: number, height: number) {
  const geometry = new THREE.ShapeGeometry(shape, 12);
  const position = geometry.attributes.position!;
  const uv = geometry.attributes.uv!;
  for (let i = 0; i < position.count; i++) {
    uv.setXY(
      i,
      (position.getX(i) + width / 2) / width,
      (position.getY(i) + height / 2) / height,
    );
  }
  return geometry;
}

function canvasTexture(canvas: HTMLCanvasElement, anisotropy: number) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

function speed(body: RapierRigidBody): number {
  const v = body.linvel();
  const w = body.angvel();
  return Math.hypot(v.x, v.y, v.z) + Math.hypot(w.x, w.y, w.z);
}

export default function Lanyard({
  stage,
  assets,
  bandWidth,
  dragging,
  drag,
  hit,
  onReady,
}: Props) {
  const fixed = useRef<RapierRigidBody>(null!);
  const j1 = useRef<RapierRigidBody>(null!);
  const j2 = useRef<RapierRigidBody>(null!);
  const j3 = useRef<RapierRigidBody>(null!);
  const card = useRef<RapierRigidBody>(null!);
  const cardGroup = useRef<THREE.Group>(null!);
  const { gl, camera, size, invalidate } = useThree();

  const [ax, ay] = stage.anchor;
  const segment = stage.ropeLength / 3;
  const { width: cw, height: ch } = stage.card;
  const jointY = ch / 2 + stage.clipGap;

  useRopeJoint(fixed, j1, [[0, 0, 0], [0, 0, 0], segment]);
  useRopeJoint(j1, j2, [[0, 0, 0], [0, 0, 0], segment]);
  useRopeJoint(j2, j3, [[0, 0, 0], [0, 0, 0], segment]);
  useSphericalJoint(j3, card, [
    [0, 0, 0],
    [0, jointY, 0],
  ]);

  const scene = useMemo(() => {
    const anisotropy = gl.capabilities.getMaxAnisotropy();
    const shape = roundedRect(cw, ch, (14 / 220) * cw);
    const face = faceGeometry(shape, cw, ch);
    const edge = new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: false,
      curveSegments: 12,
    });
    edge.translate(0, 0, -thickness / 2);
    const strap = canvasTexture(assets.strap, anisotropy);
    strap.wrapS = THREE.RepeatWrapping;
    strap.wrapT = THREE.ClampToEdgeWrapping;
    strap.flipY = false;
    const band = new MeshLineMaterial({
      color: '#ffffff',
      map: strap,
      useMap: 1,
      lineWidth: 1,
      repeat: new THREE.Vector2(
        strapRepeat(stage.ropeLength * stage.pxPerUnit, assets.strapLength),
        1,
      ),
      resolution: new THREE.Vector2(1, 1),
    });
    band.depthTest = false;
    band.transparent = false;
    return {
      face,
      edge,
      front: canvasTexture(assets.front, anisotropy),
      back: canvasTexture(assets.back, anisotropy),
      strap,
      bandGeometry: new MeshLineGeometry(),
      band,
    };
  }, [gl, assets, cw, ch, stage.ropeLength, stage.pxPerUnit]);

  useEffect(
    () => () => {
      scene.face.dispose();
      scene.edge.dispose();
      scene.front.dispose();
      scene.back.dispose();
      scene.strap.dispose();
      scene.bandGeometry.dispose();
      scene.band.dispose();
    },
    [scene],
  );

  useEffect(() => {
    scene.band.lineWidth = (bandWidth * 2 * stage.cameraZ) / size.height;
    scene.band.resolution.set(size.width, size.height);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = stage.fov;
      camera.position.set(0, 0, stage.cameraZ);
      camera.updateProjectionMatrix();
    }
    invalidate();
  }, [scene, bandWidth, stage, size, camera, invalidate]);

  const work = useMemo(
    () => ({
      curve: new THREE.CatmullRomCurve3(
        [0, 1, 2, 3].map(() => new THREE.Vector3()),
        false,
        'chordal',
      ),
      lerped: [new THREE.Vector3(), new THREE.Vector3()],
      seeded: false,
      corner: new THREE.Vector3(),
      frames: 0,
      still: 0,
      ready: false,
      nudged: false,
    }),
    [],
  );

  useFrame((state, delta) => {
    const bodies = [fixed, j1, j2, j3, card].map((ref) => ref.current);
    if (bodies.some((body) => body === null)) return;
    const [, b1, b2, b3, c] = bodies as RapierRigidBody[];
    const d = drag.current;

    if (dragging && d.active) {
      if (d.grab) {
        const t = c.translation();
        const [px, py] = d.pointer;
        d.offset = [px - t.x, py - t.y];
        d.grab = false;
      }
      for (const body of bodies) body!.wakeUp();
      const [tx, ty] = clampDragTarget(stage, [
        d.pointer[0] - d.offset[0],
        d.pointer[1] - d.offset[1],
      ]);
      c.setNextKinematicTranslation({ x: tx, y: ty, z: 0 });
    } else if (d.spin && c.isDynamic()) {
      d.spin = false;
      c.setAngvel({ x: 0, y: 14, z: 0 }, true);
    }

    if (!work.nudged && c.isDynamic()) {
      work.nudged = true;
      c.setLinvel({ x: 1.4, y: 0, z: 0 }, true);
    }

    const [l1, l2] = work.lerped as [THREE.Vector3, THREE.Vector3];
    if (!work.seeded) {
      l1.copy(b1.translation());
      l2.copy(b2.translation());
      work.seeded = true;
    }
    for (const [lerped, body] of [
      [l1, b1],
      [l2, b2],
    ] as const) {
      const distance = lerped.distanceTo(body.translation());
      const clamped = Math.max(0.1, Math.min(1, distance));
      lerped.lerp(body.translation(), Math.min(1, delta * (10 + clamped * 40)));
    }
    const points = work.curve.points as THREE.Vector3[];
    points[0]!.copy(fixed.current.translation());
    points[1]!.copy(l1);
    points[2]!.copy(l2);
    points[3]!.copy(b3.translation());
    scene.bandGeometry.setPoints(work.curve.getPoints(32));

    const ang = c.angvel();
    const rot = c.rotation();
    c.setAngvel({ x: ang.x, y: ang.y - rot.y * 0.25, z: ang.z }, false);

    const el = hit.current;
    if (el !== null) {
      cardGroup.current.updateWorldMatrix(true, false);
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const [x, y] of [
        [-cw / 2, -ch / 2],
        [cw / 2, -ch / 2],
        [-cw / 2, jointY],
        [cw / 2, jointY],
      ] as const) {
        const p = work.corner
          .set(x, y, 0)
          .applyMatrix4(cardGroup.current.matrixWorld)
          .project(state.camera);
        const sx = ((p.x + 1) / 2) * size.width;
        const sy = ((1 - p.y) / 2) * size.height;
        minX = Math.min(minX, sx);
        maxX = Math.max(maxX, sx);
        minY = Math.min(minY, sy);
        maxY = Math.max(maxY, sy);
      }
      el.style.transform = `translate(${minX}px, ${minY}px)`;
      el.style.width = `${maxX - minX}px`;
      el.style.height = `${maxY - minY}px`;
    }

    work.frames += 1;
    if (!work.ready && work.frames > 2) {
      work.ready = true;
      onReady();
    }

    const moving = dragging || bodies.some((body) => speed(body!) > restSpeed);
    work.still = moving ? 0 : work.still + 1;
    if (work.still < restFrames) state.invalidate();
  });

  return (
    <>
      <RigidBody
        ref={fixed}
        {...segmentProps}
        type="fixed"
        position={[ax, ay, 0]}
      />
      <RigidBody ref={j1} {...segmentProps} position={[ax, ay - segment, 0]}>
        <BallCollider args={[0.08]} />
      </RigidBody>
      <RigidBody
        ref={j2}
        {...segmentProps}
        position={[ax, ay - 2 * segment, 0]}
      >
        <BallCollider args={[0.08]} />
      </RigidBody>
      <RigidBody
        ref={j3}
        {...segmentProps}
        position={[ax, ay - 3 * segment, 0]}
      >
        <BallCollider args={[0.08]} />
      </RigidBody>
      <RigidBody
        ref={card}
        {...segmentProps}
        type={dragging ? 'kinematicPosition' : 'dynamic'}
        position={[ax, ay - 3 * segment - jointY, 0]}
      >
        <CuboidCollider args={[cw / 2, ch / 2, thickness / 2]} />
        <group ref={cardGroup}>
          <mesh geometry={scene.face} position={[0, 0, thickness / 2 + 1e-4]}>
            <meshPhysicalMaterial
              map={scene.front}
              clearcoat={1}
              clearcoatRoughness={0.25}
              roughness={0.55}
              metalness={0}
            />
          </mesh>
          <mesh
            geometry={scene.face}
            position={[0, 0, -thickness / 2 - 1e-4]}
            rotation={[0, Math.PI, 0]}
          >
            <meshPhysicalMaterial
              map={scene.back}
              clearcoat={1}
              clearcoatRoughness={0.25}
              roughness={0.5}
              metalness={0}
            />
          </mesh>
          <mesh geometry={scene.edge}>
            <meshStandardMaterial attach="material-0" visible={false} />
            <meshBasicMaterial attach="material-1" color={cardPalette.line} />
          </mesh>
          <group position={[0, ch / 2, 0]}>
            <mesh position={[0, 0.06, 0]}>
              <boxGeometry args={[0.15, 0.17, 0.045]} />
              <meshStandardMaterial
                color="#d4d4d2"
                metalness={0.55}
                roughness={0.3}
              />
            </mesh>
            <mesh position={[0, jointY - ch / 2 - 0.01, 0]}>
              <torusGeometry args={[0.045, 0.014, 10, 24]} />
              <meshStandardMaterial
                color="#c4c4c2"
                metalness={0.6}
                roughness={0.3}
              />
            </mesh>
          </group>
        </group>
      </RigidBody>
      <mesh
        geometry={scene.bandGeometry}
        material={scene.band}
        renderOrder={1}
      />
    </>
  );
}
