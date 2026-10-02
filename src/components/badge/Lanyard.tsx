import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import {
  BallCollider,
  CuboidCollider,
  RigidBody,
  interactionGroups,
  useBeforePhysicsStep,
  useRapier,
  useRopeJoint,
  useSphericalJoint,
  type RapierRigidBody,
} from '@react-three/rapier';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import {
  grabAnchor,
  grabPadding,
  isTap,
  limitSpeed,
  screenBounds,
  tiltDegrees,
} from '../../lib/badge/grab';
import {
  physics,
  ribbon,
  ribbonIndices,
  ropeLayout,
  ropeSegments,
  strapCoordinates,
} from '../../lib/badge/rope';
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
}

interface Props {
  stage: Stage;
  assets: BadgeAssets;
  hero: HTMLElement;
  hit: RefObject<HTMLDivElement | null>;
  active: boolean;
  onReady: () => void;
}

type World = ReturnType<typeof useRapier>['world'];

interface Drag {
  joint: ReturnType<World['createImpulseJoint']>;
  pointerId: number;
  target: [number, number];
  press: { x: number; y: number; time: number };
}

type BodyRef = RefObject<RapierRigidBody | null>;

const thickness = 0.035;
const divisions = 16;
const noCollisions = interactionGroups(0, []);

const segmentProps = {
  type: 'dynamic',
  canSleep: true,
  colliders: false,
  linearDamping: physics.segmentDamping,
  angularDamping: physics.segmentDamping,
  enabledTranslations: [true, true, false] as [boolean, boolean, boolean],
} as const;

function RopeLink({
  a,
  b,
  length,
}: {
  a: BodyRef;
  b: BodyRef;
  length: number;
}) {
  useRopeJoint(
    a as RefObject<RapierRigidBody>,
    b as RefObject<RapierRigidBody>,
    [[0, 0, 0], [0, 0, 0], length],
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

export default function Lanyard({
  stage,
  assets,
  hero,
  hit,
  active,
  onReady,
}: Props) {
  const { world, rapier } = useRapier();
  const { gl, camera, clock, invalidate } = useThree();
  const fixed = useRef<RapierRigidBody>(null);
  const card = useRef<RapierRigidBody>(null);
  const hand = useRef<RapierRigidBody>(null);
  const links = useMemo(
    () =>
      Array.from({ length: ropeSegments }, () => ({
        body: { current: null } as RefObject<RapierRigidBody | null>,
        marker: { current: null } as RefObject<THREE.Group | null>,
      })),
    [],
  );
  const cardGroup = useRef<THREE.Group>(null!);
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);

  const { width: cw, height: ch } = stage.card;
  const clipTop = stage.clipGap;
  const jointY = ch / 2 + clipTop;
  const layout = ropeLayout(stage.anchor, stage.ropeLength, jointY);
  const [ax, ay] = stage.anchor;
  const [cx, cy] = layout.card;

  useSphericalJoint(
    links[ropeSegments - 1]!.body as RefObject<RapierRigidBody>,
    card as RefObject<RapierRigidBody>,
    [
      [0, 0, 0],
      [0, jointY, 0],
    ],
  );

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
    const count = ropeSegments * divisions + 1;
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
        ropeSegments,
        divisions,
        layout.segment * stage.pxPerUnit,
        assets.strapLength,
      ),
    };
  }, [gl, assets, cw, ch, clipTop, stage.pxPerUnit, layout.segment]);

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
        Array.from({ length: ropeSegments + 1 }, () => new THREE.Vector3()),
        false,
        'centripetal',
      ),
      v: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      frames: 0,
      still: 0,
      nudged: false,
      ready: false,
    }),
    [],
  );

  const wake = () => {
    if (work.still >= physics.restFrames) clock.getDelta();
    work.still = 0;
    invalidate();
  };

  useEffect(() => {
    if (active) wake();
  }, [active]);

  const bodies = () =>
    [fixed, ...links.map((l) => l.body), card, hand].map((r) => r.current);

  const handTarget = (clientX: number, clientY: number): [number, number] => {
    const rect = hero.getBoundingClientRect();
    const [x, y] = screenToPlane(stage, [
      clientX - rect.left,
      clientY - rect.top,
    ]);
    return clampToFrustum(stage, [x, y], physics.frustumMargin);
  };

  const release = (event?: PointerEvent) => {
    const d = drag.current;
    if (d === null) return;
    if (event && event.pointerId !== d.pointerId) return;
    drag.current = null;
    if (d.joint.isValid()) world.removeImpulseJoint(d.joint, true);
    const c = card.current;
    if (c !== null) {
      const tap =
        event?.type === 'pointerup' &&
        isTap(d.press, {
          x: event.clientX,
          y: event.clientY,
          time: performance.now(),
        });
      if (tap) c.setAngvel({ x: 0, y: physics.flipSpin, z: 0 }, true);
      else c.setLinvel(limitSpeed(c.linvel(), physics.maxSpeed), true);
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
      const d = drag.current;
      if (d !== null && d.joint.isValid()) {
        world.removeImpulseJoint(d.joint, false);
      }
      drag.current = null;
    },
    [hero, world],
  );

  const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
    const native = event.nativeEvent;
    const c = card.current;
    const h = hand.current;
    if (native.button !== 0 || drag.current !== null || !c || !h) return;
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
    const grip = work.v.set(gx, gy, 0);
    cardGroup.current.localToWorld(grip);
    h.setTranslation({ x: grip.x, y: grip.y, z: 0 }, true);
    const target = handTarget(native.clientX, native.clientY);
    h.setNextKinematicTranslation({ x: target[0], y: target[1], z: 0 });
    const joint = world.createImpulseJoint(
      rapier.JointData.spring(
        0,
        physics.handStiffness,
        physics.handDamping,
        { x: 0, y: 0, z: 0 },
        { x: gx, y: gy, z: 0 },
      ),
      h,
      c,
      true,
    );
    for (const b of bodies()) b?.wakeUp();
    drag.current = {
      joint,
      pointerId: native.pointerId,
      target,
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

  useBeforePhysicsStep(() => {
    const c = card.current;
    const h = hand.current;
    if (!c || !h) return;
    const d = drag.current;
    if (d !== null) {
      h.setNextKinematicTranslation({ x: d.target[0], y: d.target[1], z: 0 });
      for (const b of bodies()) b?.wakeUp();
    }
    if (!c.isSleeping()) {
      const ang = c.angvel();
      const rot = c.rotation();
      c.setAngvel(
        { x: ang.x, y: ang.y - rot.y * physics.facing, z: ang.z },
        false,
      );
    }
    if (!work.nudged) {
      work.nudged = true;
      c.setLinvel({ x: physics.nudge, y: 0, z: 0 }, true);
    }
  });

  useFrame((state) => {
    const all = bodies();
    if (all.some((b) => b === null)) return;
    const group = cardGroup.current;
    group.updateWorldMatrix(true, false);

    const points = work.curve.points as THREE.Vector3[];
    points[0]!.set(ax, ay, 0);
    for (let i = 0; i < ropeSegments - 1; i++) {
      links[i]!.marker.current?.getWorldPosition(points[i + 1]!);
    }
    group.localToWorld(points[ropeSegments]!.set(0, jointY, 0));
    const curve = work.curve
      .getPoints(ropeSegments * divisions)
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
    }

    work.frames += 1;
    if (!work.ready && work.frames > 2) {
      work.ready = true;
      onReady();
    }
    const moving =
      drag.current !== null ||
      all.some((b) => b!.isDynamic() && speed(b!) > physics.restSpeed);
    work.still = moving ? 0 : work.still + 1;
    if (work.still < physics.restFrames) state.invalidate();
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
        const [x, y] = layout.joints[i]!;
        return (
          <RigidBody
            key={i}
            ref={link.body}
            {...segmentProps}
            position={[x, y, 0]}
          >
            <BallCollider
              args={[0.05]}
              mass={physics.segmentMass}
              collisionGroups={noCollisions}
            />
            <group ref={link.marker} />
          </RigidBody>
        );
      })}
      {links.map((link, i) => (
        <RopeLink
          key={i}
          a={i === 0 ? fixed : links[i - 1]!.body}
          b={link.body}
          length={layout.segment}
        />
      ))}
      <RigidBody
        ref={hand}
        type="kinematicPosition"
        colliders={false}
        position={[cx, cy, 0]}
      />
      <RigidBody
        ref={card}
        type="dynamic"
        canSleep
        colliders={false}
        linearDamping={physics.cardLinearDamping}
        angularDamping={physics.cardAngularDamping}
        enabledTranslations={[true, true, false]}
        position={[cx, cy, 0]}
      >
        <CuboidCollider
          args={[cw / 2, ch / 2, thickness / 2]}
          mass={physics.cardMass}
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
            onPointerOver={() => setHovered(true)}
            onPointerOut={() => setHovered(false)}
          >
            <meshBasicMaterial visible={false} side={THREE.DoubleSide} />
          </mesh>
        </group>
      </RigidBody>
      <mesh geometry={scene.band} frustumCulled={false}>
        <meshBasicMaterial map={scene.strap} side={THREE.DoubleSide} />
      </mesh>
    </>
  );
}
