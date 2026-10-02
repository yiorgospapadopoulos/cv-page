import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import {
  BallCollider,
  CuboidCollider,
  RigidBody,
  interactionGroups,
  useBeforePhysicsStep,
  useSpringJoint,
  type RapierRigidBody,
} from '@react-three/rapier';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { chainLayout, chainSprings, segmentCount } from '../../lib/badge/chain';
import {
  grabAnchor,
  grabPadding,
  gripImpulse,
  hoverImpulse,
  isTap,
  screenBounds,
  tiltDegrees,
} from '../../lib/badge/grab';
import {
  freeDamping,
  toWorld,
  twistRate,
  unwrapAngle,
  yawAngle,
} from '../../lib/badge/physics';
import { ribbon, ribbonIndices, strapCoordinates } from '../../lib/badge/rope';
import { arcAt, labelPhase, visibleArc } from '../../lib/badge/strap';
import {
  clampToFrustum,
  screenToPlane,
  worldToScreen,
  type Stage,
  type Vec3,
} from '../../lib/badge/stage';

export interface BadgeAssets {
  front: HTMLCanvasElement;
  back: HTMLCanvasElement;
  strap: HTMLCanvasElement;
  strapLength: number;
  strapLabel: number;
}

interface Props {
  stage: Stage;
  assets: BadgeAssets;
  hero: HTMLElement;
  hit: RefObject<HTMLDivElement | null>;
  active: boolean;
  onReady: () => void;
}

interface Drag {
  pointerId: number;
  target: [number, number];
  local: THREE.Vector3;
  press: { x: number; y: number; time: number };
}

interface Hover {
  x: number;
  y: number;
  impulse: Vec3;
  point: THREE.Vector3;
}

type BodyRef = RefObject<RapierRigidBody | null>;

const world = toWorld();
const thickness = 0.035;
const divisions = 6;
const noCollisions = interactionGroups(0, []);
const planar: [boolean, boolean, boolean] = [true, true, false];

function SpringLink({
  a,
  b,
  anchorA,
  anchorB,
  rest,
  stiffness,
  damping,
}: {
  a: BodyRef;
  b: BodyRef;
  anchorA: Vec3;
  anchorB: Vec3;
  rest: number;
  stiffness: number;
  damping: number;
}) {
  useSpringJoint(
    a as RefObject<RapierRigidBody>,
    b as RefObject<RapierRigidBody>,
    [anchorA, anchorB, rest, stiffness, damping],
  );
  return null;
}

function roundedRect(width: number, height: number, radius: number) {
  const shape = new THREE.Shape();
  const x = width / 2;
  const y = height / 2;
  shape.moveTo(-x + radius, -y);
  shape.lineTo(x - radius, -y);
  shape.absarc(x - radius, -y + radius, radius, -Math.PI / 2, 0, false);
  shape.lineTo(x, y - radius);
  shape.absarc(x - radius, y - radius, radius, 0, Math.PI / 2, false);
  shape.lineTo(-x + radius, y);
  shape.absarc(-x + radius, y - radius, radius, Math.PI / 2, Math.PI, false);
  shape.lineTo(-x, -y + radius);
  shape.absarc(-x + radius, -y + radius, radius, Math.PI, Math.PI * 1.5, false);
  return shape;
}

function faceGeometry(shape: THREE.Shape, width: number, height: number) {
  const geometry = new THREE.ShapeGeometry(shape, 16);
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
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function speed(body: RapierRigidBody): number {
  const v = body.linvel();
  const w = body.angvel();
  return Math.hypot(v.x, v.y, v.z) + Math.hypot(w.x, w.y, w.z);
}

const toVec3 = (v: { x: number; y: number; z: number }): Vec3 => [
  v.x,
  v.y,
  v.z,
];

export default function Lanyard({
  stage,
  assets,
  hero,
  hit,
  active,
  onReady,
}: Props) {
  const { gl, camera, clock, invalidate } = useThree();
  const fixed = useRef<RapierRigidBody>(null);
  const card = useRef<RapierRigidBody>(null);
  const cardGroup = useRef<THREE.Group>(null!);
  const drag = useRef<Drag | null>(null);
  const hover = useRef<Hover | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);

  const { width: cw, height: ch } = stage.card;
  const clipTop = stage.clipGap;
  const jointY = ch / 2 + clipTop;
  const segments = segmentCount(stage.ropeLength, world.strap.segment);
  const layout = useMemo(
    () =>
      chainLayout({
        anchor: stage.anchor,
        length: stage.ropeLength,
        segments,
        stiffness: world.strap.stiffness,
        dampingRatio: world.strap.dampingRatio,
        linkMass: world.strap.linkMass,
        endMass: world.card.mass,
        gravity: world.gravity,
      }),
    [stage.anchor, stage.ropeLength, segments],
  );
  const springs = useMemo(
    () =>
      chainSprings(
        segments + 1,
        layout.segment,
        world.strap.stiffness,
        world.strap.dampingRatio,
        layout.restScale,
      ),
    [segments, layout],
  );
  const links = useMemo(
    () =>
      Array.from({ length: segments - 1 }, () => ({
        body: { current: null } as RefObject<RapierRigidBody | null>,
        marker: { current: null } as RefObject<THREE.Group | null>,
      })),
    [segments],
  );
  const node = (i: number): BodyRef =>
    i === 0 ? fixed : i === segments ? card : links[i - 1]!.body;
  const nodeAnchor = (i: number): Vec3 =>
    i === segments ? [0, jointY, 0] : [0, 0, 0];
  const [ax, ay] = stage.anchor;
  const [cx, clipY] = layout.nodes[segments]!;
  const cy = clipY - jointY;

  const scene = useMemo(() => {
    const anisotropy = gl.capabilities.getMaxAnisotropy();
    const shape = roundedRect(cw, ch, (14 / 220) * cw);
    const face = faceGeometry(shape, cw, ch);
    const edge = new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: false,
      curveSegments: 16,
    });
    edge.translate(0, 0, -thickness / 2);
    const pad = grabPadding / stage.pxPerUnit;
    const target = new THREE.PlaneGeometry(
      cw + 2 * pad,
      ch + clipTop + 2 * pad,
    );
    target.translate(0, clipTop / 2, 0);
    const strap = canvasTexture(assets.strap, anisotropy);
    strap.wrapS = THREE.RepeatWrapping;
    strap.wrapT = THREE.ClampToEdgeWrapping;
    const count = segments * divisions + 1;
    const band = new THREE.BufferGeometry();
    band.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(count * 6), 3),
    );
    band.setAttribute(
      'uv',
      new THREE.BufferAttribute(new Float32Array(count * 4), 2),
    );
    band.setIndex(new THREE.BufferAttribute(ribbonIndices(count), 1));
    return {
      face,
      edge,
      target,
      front: canvasTexture(assets.front, anisotropy),
      back: canvasTexture(assets.back, anisotropy),
      strap,
      band,
      u: strapCoordinates(
        segments,
        divisions,
        layout.segment * stage.pxPerUnit,
        assets.strapLength,
        labelPhase(stage.strapVisible, assets.strapLabel, assets.strapLength),
      ),
      labelEnd: assets.strapLabel / assets.strapLength,
    };
  }, [
    gl,
    assets,
    cw,
    ch,
    clipTop,
    stage.pxPerUnit,
    stage.strapVisible,
    layout.segment,
    segments,
  ]);

  useEffect(
    () => () => {
      for (const item of [
        scene.face,
        scene.edge,
        scene.target,
        scene.front,
        scene.back,
        scene.strap,
        scene.band,
      ]) {
        item.dispose();
      }
    },
    [scene],
  );

  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = stage.fov;
      camera.position.set(0, 0, stage.cameraZ);
      camera.updateProjectionMatrix();
    }
    invalidate();
  }, [stage, camera, invalidate]);

  const work = useMemo(
    () => ({
      curve: new THREE.CatmullRomCurve3(
        Array.from({ length: segments + 1 }, () => new THREE.Vector3()),
        false,
        'centripetal',
      ),
      v: new THREE.Vector3(),
      p: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      frames: 0,
      yaw: 0,
      facing: 0,
      still: 0,
      nudged: false,
      ready: false,
    }),
    [segments],
  );

  const wake = () => {
    if (work.still >= world.restFrames) clock.getDelta();
    work.still = 0;
    invalidate();
  };

  useEffect(() => {
    if (active) wake();
  }, [active]);

  const bodies = () =>
    [fixed, ...links.map((l) => l.body), card].map((r) => r.current);

  const handTarget = (clientX: number, clientY: number): [number, number] => {
    const rect = hero.getBoundingClientRect();
    const [x, y] = screenToPlane(stage, [
      clientX - rect.left,
      clientY - rect.top,
    ]);
    return clampToFrustum(stage, [x, y], world.frustumMargin);
  };

  const release = (event?: PointerEvent) => {
    const d = drag.current;
    if (d === null) return;
    if (event && event.pointerId !== d.pointerId) return;
    drag.current = null;
    const c = card.current;
    const tap =
      event?.type === 'pointerup' &&
      isTap(d.press, {
        x: event.clientX,
        y: event.clientY,
        time: performance.now(),
      });
    if (c !== null && tap) {
      work.facing += 2 * Math.PI;
      c.setAngvel({ x: 0, y: world.flipSpin, z: 0 }, true);
    }
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    setDragging(false);
    wake();
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: PointerEvent) => {
      const d = drag.current;
      if (d === null || event.pointerId !== d.pointerId) return;
      d.target = handTarget(event.clientX, event.clientY);
      wake();
    };
    const onEnd = (event: PointerEvent) => release(event);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
    hero.addEventListener('lostpointercapture', onEnd);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      hero.removeEventListener('lostpointercapture', onEnd);
    };
  });

  useEffect(() => {
    hero.style.cursor = dragging ? 'grabbing' : hovered ? 'grab' : '';
  }, [hero, dragging, hovered]);

  useEffect(
    () => () => {
      hero.style.cursor = '';
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      drag.current = null;
    },
    [hero],
  );

  const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
    const native = event.nativeEvent;
    const c = card.current;
    if (native.button !== 0 || drag.current !== null || !c) return;
    event.stopPropagation();
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    window.getSelection()?.removeAllRanges();
    const local = cardGroup.current.worldToLocal(work.v.copy(event.point));
    const [gx, gy] = grabAnchor(
      [local.x, local.y, local.z],
      stage.card,
      clipTop,
    );
    for (const b of bodies()) b?.wakeUp();
    hover.current = null;
    drag.current = {
      pointerId: native.pointerId,
      target: handTarget(native.clientX, native.clientY),
      local: new THREE.Vector3(gx, gy, 0),
      press: { x: native.clientX, y: native.clientY, time: performance.now() },
    };
    try {
      hero.setPointerCapture(native.pointerId);
    } catch {
      // Capture is a convenience; window listeners still end the drag.
    }
    setDragging(true);
    wake();
  };

  const onPointerMove = (event: ThreeEvent<PointerEvent>) => {
    const native = event.nativeEvent;
    if (drag.current !== null || native.pointerType !== 'mouse') return;
    const last = hover.current;
    hover.current = {
      x: native.clientX,
      y: native.clientY,
      impulse: [0, 0, 0],
      point: event.point.clone(),
    };
    if (last === null) return;
    const [ix, iy] = hoverImpulse(
      native.clientX - last.x,
      native.clientY - last.y,
      world.hover,
    );
    hover.current.impulse = [last.impulse[0] + ix, last.impulse[1] + iy, 0];
    wake();
  };

  useBeforePhysicsStep(() => {
    const c = card.current;
    if (!c) return;
    const dt = world.timeStep;
    const d = drag.current;
    const pos = c.translation();
    const rot = c.rotation();
    if (d !== null) {
      for (const b of bodies()) b?.wakeUp();
      const point = work.p
        .copy(d.local)
        .applyQuaternion(work.q.set(rot.x, rot.y, rot.z, rot.w))
        .add(work.v.set(pos.x, pos.y, pos.z));
      const [ix, iy] = gripImpulse(
        {
          target: [d.target[0], d.target[1], 0],
          point: [point.x, point.y, point.z],
          centre: [pos.x, pos.y, pos.z],
          linvel: toVec3(c.linvel()),
          angvel: toVec3(c.angvel()),
          mass: c.mass(),
          dt,
        },
        world.grip,
      );
      c.applyImpulseAtPoint({ x: ix, y: iy, z: 0 }, point, true);
    }
    const h = hover.current;
    if (
      d === null &&
      h !== null &&
      (h.impulse[0] !== 0 || h.impulse[1] !== 0)
    ) {
      c.applyImpulseAtPoint(
        { x: h.impulse[0], y: h.impulse[1], z: 0 },
        h.point,
        true,
      );
      h.impulse = [0, 0, 0];
    }
    work.yaw = unwrapAngle(work.yaw, yawAngle(rot));
    if (!c.isSleeping()) {
      const ang = c.angvel();
      c.setAngvel(
        {
          x: ang.x,
          y: ang.y + twistRate(work.yaw - work.facing, ang.y, dt, world.twist),
          z: ang.z,
        },
        false,
      );
      const { linearDamping, angularDamping } = world.card;
      const s = speed(c);
      c.setLinearDamping(
        d === null
          ? freeDamping(linearDamping, s, world.settle)
          : linearDamping,
      );
      c.setAngularDamping(
        d === null
          ? freeDamping(angularDamping, s, {
              ...world.settle,
              air: 0,
              boost: 0,
            })
          : angularDamping,
      );
    }
    if (!work.nudged) {
      work.nudged = true;
      c.setLinvel({ x: world.nudge, y: 0, z: 0 }, true);
    }
  });

  useFrame((state) => {
    const all = bodies();
    if (all.some((b) => b === null)) return;
    const group = cardGroup.current;
    group.updateWorldMatrix(true, false);

    const points = work.curve.points as THREE.Vector3[];
    points[0]!.set(ax, ay, 0);
    for (let i = 0; i < segments - 1; i++) {
      links[i]!.marker.current?.getWorldPosition(points[i + 1]!);
    }
    group.localToWorld(points[segments]!.set(0, jointY, 0));
    const curve = work.curve
      .getPoints(segments * divisions)
      .map((p): Vec3 => [p.x, p.y, thickness / 2 + 0.004]);
    const { positions, uvs } = ribbon(curve, stage.bandWidth / 2, scene.u);
    const position = scene.band.attributes.position as THREE.BufferAttribute;
    const uv = scene.band.attributes.uv as THREE.BufferAttribute;
    (position.array as Float32Array).set(positions);
    (uv.array as Float32Array).set(uvs);
    position.needsUpdate = true;
    uv.needsUpdate = true;

    const el = hit.current;
    if (el !== null) {
      const corners = (
        [
          [-cw / 2, -ch / 2],
          [cw / 2, -ch / 2],
          [-cw / 2, ch / 2 + clipTop],
          [cw / 2, ch / 2 + clipTop],
        ] as const
      ).map(([x, y]) => {
        const p = group.localToWorld(work.v.set(x, y, 0));
        return worldToScreen(stage, [p.x, p.y, p.z]);
      });
      const box = screenBounds(corners, grabPadding);
      el.style.transform = `translate(${box.left}px, ${box.top}px)`;
      el.style.width = `${box.width}px`;
      el.style.height = `${box.height}px`;
      const centre = group.getWorldPosition(work.v);
      const [sx, sy] = worldToScreen(stage, [centre.x, centre.y, centre.z]);
      el.dataset.x = sx.toFixed(1);
      el.dataset.y = sy.toFixed(1);
      el.dataset.angle = tiltDegrees(group.getWorldQuaternion(work.q)).toFixed(
        1,
      );
      const screen = curve.map((p) => worldToScreen(stage, p));
      el.dataset.strap = visibleArc(screen, 0).toFixed(1);
      el.dataset.labelTop = arcAt(screen, scene.u, 0).toFixed(1);
      el.dataset.labelBottom = arcAt(screen, scene.u, scene.labelEnd).toFixed(
        1,
      );
    }

    work.frames += 1;
    if (!work.ready && work.frames > 2) {
      work.ready = true;
      onReady();
    }
    const moving =
      drag.current !== null ||
      all.some((b) => b!.isDynamic() && speed(b!) > world.restSpeed);
    work.still = moving ? 0 : work.still + 1;
    if (work.still < world.restFrames) state.invalidate();
  });

  return (
    <>
      <RigidBody
        ref={fixed}
        type="fixed"
        colliders={false}
        position={[ax, ay, 0]}
      />
      {links.map((link, i) => {
        const [x, y] = layout.nodes[i + 1]!;
        return (
          <RigidBody
            key={i}
            ref={link.body}
            type="dynamic"
            canSleep
            colliders={false}
            linearDamping={world.strap.linkDamping}
            angularDamping={world.strap.linkDamping}
            enabledTranslations={planar}
            enabledRotations={[false, false, false]}
            position={[x, y, 0]}
          >
            <BallCollider
              args={[0.05]}
              mass={world.strap.linkMass}
              collisionGroups={noCollisions}
            />
            <group ref={link.marker} />
          </RigidBody>
        );
      })}
      <RigidBody
        ref={card}
        type="dynamic"
        canSleep
        colliders={false}
        linearDamping={world.card.linearDamping}
        angularDamping={world.card.angularDamping}
        enabledTranslations={planar}
        enabledRotations={[false, true, true]}
        position={[cx, cy, 0]}
      >
        <CuboidCollider
          args={[cw / 2, ch / 2, thickness / 2]}
          mass={world.card.mass}
          collisionGroups={noCollisions}
        />
        <group ref={cardGroup}>
          <mesh geometry={scene.face} position={[0, 0, thickness / 2]}>
            <meshPhysicalMaterial
              map={scene.front}
              clearcoat={1}
              clearcoatRoughness={0.25}
              roughness={0.55}
              metalness={0}
              polygonOffset
              polygonOffsetFactor={-1}
              polygonOffsetUnits={-1}
            />
          </mesh>
          <mesh
            geometry={scene.face}
            position={[0, 0, -thickness / 2]}
            rotation={[0, Math.PI, 0]}
          >
            <meshPhysicalMaterial
              map={scene.back}
              clearcoat={1}
              clearcoatRoughness={0.25}
              roughness={0.5}
              metalness={0}
              polygonOffset
              polygonOffsetFactor={-1}
              polygonOffsetUnits={-1}
            />
          </mesh>
          <mesh geometry={scene.edge}>
            <meshBasicMaterial attach="material-0" visible={false} />
            <meshStandardMaterial
              attach="material-1"
              color="#d8d5ce"
              roughness={0.7}
              metalness={0}
            />
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
            <mesh position={[0, clipTop - 0.01, 0]}>
              <torusGeometry args={[0.045, 0.014, 10, 24]} />
              <meshStandardMaterial
                color="#c4c4c2"
                metalness={0.6}
                roughness={0.3}
              />
            </mesh>
          </group>
          <mesh
            geometry={scene.target}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerOver={() => setHovered(true)}
            onPointerOut={() => {
              hover.current = null;
              setHovered(false);
            }}
          >
            <meshBasicMaterial visible={false} side={THREE.DoubleSide} />
          </mesh>
        </group>
      </RigidBody>
      {springs.map((spring, i) => (
        <SpringLink
          key={i}
          a={node(spring.a)}
          b={node(spring.b)}
          anchorA={nodeAnchor(spring.a)}
          anchorB={nodeAnchor(spring.b)}
          rest={spring.rest}
          stiffness={spring.stiffness}
          damping={spring.damping}
        />
      ))}
      <mesh geometry={scene.band} frustumCulled={false}>
        <meshBasicMaterial map={scene.strap} side={THREE.DoubleSide} />
      </mesh>
    </>
  );
}
