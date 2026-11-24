import * as THREE from 'three';
import {
  createKnitCoreTextureSet,
  createTwistedYarnTextureSet,
  YarnTextureSet,
} from './yarnTextures';
import { HeldItemId, YarnCreatureConfig, YarnPose } from './types';

// Pre-allocated scratch math helpers (zero GC inside animation loop)
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _vec3C = new THREE.Vector3();
const _vec3D = new THREE.Vector3();
const _vec3E = new THREE.Vector3();
const _vec3F = new THREE.Vector3();
const _quatA = new THREE.Quaternion();
const _quatB = new THREE.Quaternion();
const _eulerA = new THREE.Euler(0, 0, 0, 'XYZ');
const _mat4A = new THREE.Matrix4();
const _mat4B = new THREE.Matrix4();

export interface CreatureInteractionState {
  bikeSteer?: number;
  bikeSpeed?: number;
  bikeLean?: number;
  seatY?: number;
  seatZ?: number;
  riderLean?: number;
  showTail?: boolean;
  leftGripChassis?: THREE.Vector3;
  rightGripChassis?: THREE.Vector3;
  leftPegChassis?: THREE.Vector3;
  rightPegChassis?: THREE.Vector3;
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

/**
 * Pole-vector 2-bone Arm IK in shoulderPivot parent (torsoGroup) local space.
 * Places the palm center (side*0.01, -0.208, 0.038 in forearmPivot) onto targetInTorso
 * while twisting around shoulder->target so the elbow ALWAYS flares outward away from the torso.
 */
function solveArmIK(
  side: -1 | 1,
  shoulderPos: THREE.Vector3,
  targetInTorso: THREE.Vector3
): { armRx: number; armRy: number; armRz: number; foreRx: number } {
  _vec3C.subVectors(targetInTorso, shoulderPos);
  const rawDist = _vec3C.length();
  const d = THREE.MathUtils.clamp(rawDist, 0.145, 0.398);
  if (rawDist > 1e-5) _vec3C.multiplyScalar(1 / rawDist);
  else _vec3C.set(0, -1, 0);

  // Binary search elbow bend foreRx in [-2.35, -0.05] so |E + Rx(foreRx)*P| === d
  const ux = side * 0.034;
  let lo = -2.35;
  let hi = -0.05;
  for (let i = 0; i < 12; i++) {
    const mid = 0.5 * (lo + hi);
    const c = Math.cos(mid);
    const s = Math.sin(mid);
    const hy = -0.19 + (-0.208 * c - 0.038 * s);
    const hz = 0.014 + (-0.208 * s + 0.038 * c);
    if (Math.hypot(ux, hy, hz) < d) lo = mid;
    else hi = mid;
  }
  const foreRx = 0.5 * (lo + hi);
  const cf = Math.cos(foreRx);
  const sf = Math.sin(foreRx);
  const uy = -0.19 + (-0.208 * cf - 0.038 * sf);
  const uz = 0.014 + (-0.208 * sf + 0.038 * cf);

  // 1. Align local hand vector U to target direction _vec3C
  _vec3D.set(ux, uy, uz).normalize();
  _quatA.setFromUnitVectors(_vec3D, _vec3C);

  // 2. Twist around _vec3C so the local elbow (side*0.024, -0.19, 0.014) points toward outward/down pole
  //    In rest frame, elbow bend side points along (side*0.024, -0.19, 0.014) -> in bent arm,
  //    elbow offset relative to shoulder->hand line is E - (E·uDir)*uDir.
  _vec3E.set(side * 0.024, -0.19, 0.014).applyQuaternion(_quatA);
  _vec3E.addScaledVector(_vec3C, -_vec3E.dot(_vec3C));
  const eLen = _vec3E.length();

  // Outward + downward + slightly back pole guarantees elbow never touches chest/tank
  _vec3F.set(side * 0.85, -0.45, -0.25).normalize();
  _vec3F.addScaledVector(_vec3C, -_vec3F.dot(_vec3C));
  const pLen = _vec3F.length();

  if (eLen > 1e-4 && pLen > 1e-4) {
    _vec3E.multiplyScalar(1 / eLen);
    _vec3F.multiplyScalar(1 / pLen);
    const cosT = THREE.MathUtils.clamp(_vec3E.dot(_vec3F), -1, 1);
    const sinT = _vec3D.crossVectors(_vec3E, _vec3F).dot(_vec3C);
    const twist = Math.atan2(sinT, cosT);
    _quatB.setFromAxisAngle(_vec3C, twist);
    _quatA.premultiply(_quatB);
  }

  _eulerA.setFromQuaternion(_quatA, 'XYZ');
  return {
    armRx: _eulerA.x,
    armRy: _eulerA.y,
    armRz: _eulerA.z,
    foreRx,
  };
}

/**
 * Pole-vector 2-bone Leg IK in hipsPivot local space.
 * Plants boot sole center (0, -0.208, 0.015 in kneePivot) onto targetInHips
 * while flaring knees outward outside the tank.
 */
function solveLegIK(
  side: -1 | 1,
  hipPos: THREE.Vector3,
  targetInHips: THREE.Vector3
): { legRx: number; legRy: number; legRz: number; kneeRx: number } {
  _vec3C.subVectors(targetInHips, hipPos);
  const rawDist = _vec3C.length();
  const d = THREE.MathUtils.clamp(rawDist, 0.145, 0.402);
  if (rawDist > 1e-5) _vec3C.multiplyScalar(1 / rawDist);
  else _vec3C.set(0, -1, 0);

  // Binary search knee bend kneeRx in [+0.08, +2.35] so |K + Rx(kneeRx)*F| === d
  const ux = side * 0.016;
  let lo = 0.08;
  let hi = 2.35;
  for (let i = 0; i < 12; i++) {
    const mid = 0.5 * (lo + hi);
    const c = Math.cos(mid);
    const s = Math.sin(mid);
    const hy = -0.195 + (-0.208 * c - 0.015 * s);
    const hz = 0.005 + (-0.208 * s + 0.015 * c);
    if (Math.hypot(ux, hy, hz) > d) lo = mid;
    else hi = mid;
  }
  const kneeRx = 0.5 * (lo + hi);
  const cf = Math.cos(kneeRx);
  const sf = Math.sin(kneeRx);
  const uy = -0.195 + (-0.208 * cf - 0.015 * sf);
  const uz = 0.005 + (-0.208 * sf + 0.015 * cf);

  _vec3D.set(ux, uy, uz).normalize();
  _quatA.setFromUnitVectors(_vec3D, _vec3C);

  // Twist around hip->peg axis so knee (side*0.016, -0.195, 0.005) points outward+forward
  _vec3E.set(side * 0.016, -0.195, 0.005).applyQuaternion(_quatA);
  _vec3E.addScaledVector(_vec3C, -_vec3E.dot(_vec3C));
  const eLen = _vec3E.length();

  _vec3F.set(side * 0.78, 0.2, 0.6).normalize();
  _vec3F.addScaledVector(_vec3C, -_vec3F.dot(_vec3C));
  const pLen = _vec3F.length();

  if (eLen > 1e-4 && pLen > 1e-4) {
    _vec3E.multiplyScalar(1 / eLen);
    _vec3F.multiplyScalar(1 / pLen);
    const cosT = THREE.MathUtils.clamp(_vec3E.dot(_vec3F), -1, 1);
    const sinT = _vec3D.crossVectors(_vec3E, _vec3F).dot(_vec3C);
    const twist = Math.atan2(sinT, cosT);
    _quatB.setFromAxisAngle(_vec3C, twist);
    _quatA.premultiply(_quatB);
  }

  _eulerA.setFromQuaternion(_quatA, 'XYZ');
  return {
    legRx: _eulerA.x,
    legRy: _eulerA.y,
    legRz: _eulerA.z,
    kneeRx,
  };
}

export interface YarnCreatureInstance {
  group: THREE.Group;
  exportRoot: THREE.Group;
  leftHandAnchor: THREE.Object3D;
  rightHandAnchor: THREE.Object3D;
  update: (
    elapsed: number,
    delta: number,
    pose: YarnPose,
    explodedAmount: number,
    interaction?: CreatureInteractionState
  ) => void;
  dispose: () => void;
  getStats: () => { triangles: number; parts: number; fibers: number };
}

/**
 * Linearly interpolates the exact radius of a LatheGeometry profile at height y.
 */
function sampleProfileRadius(profile: THREE.Vector2[], y: number): number {
  if (y <= profile[0].y) return profile[0].x;
  for (let i = 1; i < profile.length; i++) {
    const p0 = profile[i - 1];
    const p1 = profile[i];
    if (y <= p1.y) {
      const span = p1.y - p0.y;
      const t = span > 1e-5 ? (y - p0.y) / span : 0;
      return THREE.MathUtils.lerp(p0.x, p1.x, t);
    }
  }
  return profile[profile.length - 1].x;
}

/**
 * Builds a tapered TubeGeometry along a CatmullRomCurve3 using custom Frenet frames.
 */
function createTaperedTubeGeometry(
  curve: THREE.Curve<THREE.Vector3>,
  tubularSegments: number,
  radialSegments: number,
  radiusFn: (t: number) => number,
  closed = false
): THREE.BufferGeometry {
  const frames = curve.computeFrenetFrames(tubularSegments, closed);
  const vertexCount = (tubularSegments + 1) * (radialSegments + 1);
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices: number[] = [];

  const P = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();
  const vertex = new THREE.Vector3();
  const normal = new THREE.Vector3();

  let vIdx = 0;
  let uvIdx = 0;

  for (let i = 0; i <= tubularSegments; i++) {
    const t = i / tubularSegments;
    curve.getPointAt(t, P);
    N.copy(frames.normals[i]);
    B.copy(frames.binormals[i]);
    const r = Math.max(0.0004, radiusFn(t));

    for (let j = 0; j <= radialSegments; j++) {
      const v = (j / radialSegments) * Math.PI * 2;
      const sin = Math.sin(v);
      const cos = -Math.cos(v);

      normal.x = cos * N.x + sin * B.x;
      normal.y = cos * N.y + sin * B.y;
      normal.z = cos * N.z + sin * B.z;
      normal.normalize();

      vertex.x = P.x + r * normal.x;
      vertex.y = P.y + r * normal.y;
      vertex.z = P.z + r * normal.z;

      positions[vIdx] = vertex.x;
      positions[vIdx + 1] = vertex.y;
      positions[vIdx + 2] = vertex.z;

      normals[vIdx] = normal.x;
      normals[vIdx + 1] = normal.y;
      normals[vIdx + 2] = normal.z;
      vIdx += 3;

      uvs[uvIdx] = t;
      uvs[uvIdx + 1] = j / radialSegments;
      uvIdx += 2;
    }
  }

  for (let j = 1; j <= tubularSegments; j++) {
    for (let i = 1; i <= radialSegments; i++) {
      const a = (radialSegments + 1) * (j - 1) + (i - 1);
      const b = (radialSegments + 1) * j + (i - 1);
      const c = (radialSegments + 1) * j + i;
      const d = (radialSegments + 1) * (j - 1) + i;
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setIndex(indices);
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Generates two intertwined helical yarn strands along a spine curve.
 */
function createBraidedStrands(
  spineCurve: THREE.CatmullRomCurve3,
  strandRadius: number,
  helixRadius: number,
  twists: number,
  tubularSegments: number,
  material: THREE.Material,
  geometriesToDispose: THREE.BufferGeometry[],
  taperEnds = true
): THREE.Group {
  const braidGroup = new THREE.Group();
  const frames = spineCurve.computeFrenetFrames(tubularSegments, false);
  const sampleCount = 24;

  for (let strand = 0; strand < 2; strand++) {
    const phaseOffset = strand * Math.PI;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= sampleCount; i++) {
      const t = i / sampleCount;
      const frameIdx = Math.min(
        tubularSegments,
        Math.round(t * tubularSegments)
      );
      const center = spineCurve.getPointAt(t);
      const N = frames.normals[frameIdx];
      const B = frames.binormals[frameIdx];
      const angle = t * twists * Math.PI * 2 + phaseOffset;
      const endTaper = taperEnds ? Math.sin(t * Math.PI) * 0.35 + 0.65 : 1.0;
      const offsetR = helixRadius * endTaper;

      const pt = new THREE.Vector3()
        .copy(center)
        .addScaledVector(N, Math.cos(angle) * offsetR)
        .addScaledVector(B, Math.sin(angle) * offsetR);
      pts.push(pt);
    }
    const strandCurve = new THREE.CatmullRomCurve3(pts);
    const geo = createTaperedTubeGeometry(
      strandCurve,
      tubularSegments,
      9,
      (t) =>
        strandRadius *
        (taperEnds ? 0.8 + 0.22 * Math.sin(t * Math.PI) : 1.0),
      false
    );
    geometriesToDispose.push(geo);
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    braidGroup.add(mesh);
  }
  return braidGroup;
}

/**
 * Helper to create a curved, soft surface-hugging wool wisp InstancedMesh
 * from an explicit list of surface anchor points + outward normals.
 */
function createSurfaceFuzzMesh(
  samples: { pos: THREE.Vector3; normal: THREE.Vector3; scale: number }[],
  fiberGeo: THREE.BufferGeometry,
  fuzzMat: THREE.Material,
  seedOffset: number
): THREE.InstancedMesh {
  const count = samples.length;
  const inst = new THREE.InstancedMesh(fiberGeo, fuzzMat, count);
  inst.castShadow = false;
  inst.receiveShadow = false;

  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const tint = new THREE.Color();

  const rand = (i: number, ch: number) => {
    const s =
      Math.sin((i + seedOffset * 97) * 12.9898 + ch * 78.233) * 43758.5453;
    return s - Math.floor(s);
  };

  for (let i = 0; i < count; i++) {
    const sample = samples[i];
    dummy.position.copy(sample.pos);
    dummy.quaternion.setFromUnitVectors(up, sample.normal);
    // Spin randomly around local normal so curved wisps curl organically in every direction
    dummy.rotateY(rand(i, 1) * Math.PI * 2);
    // Lean slightly toward the surface so fibers look like soft curly wool rather than spikes
    dummy.rotateX(0.32 + rand(i, 2) * 0.45);
    const s = sample.scale * (0.72 + rand(i, 3) * 0.56);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);

    const bright = 0.88 + rand(i, 4) * 0.24;
    tint.setRGB(bright, bright, bright);
    inst.setColorAt(i, tint);
  }
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.computeBoundingSphere();
  return inst;
}

interface ExplodablePart {
  object: THREE.Object3D;
  restPos: THREE.Vector3;
  explodeDir: THREE.Vector3;
}

interface SingleFigureRig {
  root: THREE.Group;
  hipsPivot: THREE.Group;
  torsoGroup: THREE.Group;
  headPivot: THREE.Group;
  leftEarGroup: THREE.Group;
  rightEarGroup: THREE.Group;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  leftForearmPivot: THREE.Group;
  rightForearmPivot: THREE.Group;
  leftHandAnchor: THREE.Object3D;
  rightHandAnchor: THREE.Object3D;
  leftLegPivot: THREE.Group;
  rightLegPivot: THREE.Group;
  leftKneePivot: THREE.Group;
  rightKneePivot: THREE.Group;
  tailGroup: THREE.Group;
  tailMesh: THREE.Mesh;
  tailRestPositions: Float32Array;
  armatureParts: THREE.Object3D[];
  explodables: ExplodablePart[];
  partCount: number;
  fiberCount: number;
}

/**
 * Builds a handcrafted Unravel-style prop whose handle/grip sits strictly at local (0, 0, 0)
 * so attaching it to handAnchor places it inside the fingers, never at the elbow/mid-arm.
 */
function buildHeldProp(
  item: HeldItemId,
  colorHex: string,
  sheenHex: string,
  geometries: THREE.BufferGeometry[],
  materials: THREE.Material[],
  textures: YarnTextureSet[]
): THREE.Group | null {
  if (item === 'none') return null;

  const prop = new THREE.Group();
  prop.name = `HeldItem_${item}`;

  const copperMat = new THREE.MeshStandardMaterial({
    color: 0xc88f54,
    roughness: 0.28,
    metalness: 0.88,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x6f4e37,
    roughness: 0.72,
    metalness: 0.04,
  });
  materials.push(copperMat, woodMat);

  if (item === 'lantern') {
    // Copper handle ring sits at (0, 0, 0) inside palm; lantern hangs down along -Y
    const ringGeo = new THREE.TorusGeometry(0.022, 0.004, 8, 18);
    geometries.push(ringGeo);
    const ring = new THREE.Mesh(ringGeo, copperMat);
    ring.rotation.y = Math.PI / 2;
    prop.add(ring);

    const capGeo = new THREE.ConeGeometry(0.046, 0.032, 14);
    geometries.push(capGeo);
    const cap = new THREE.Mesh(capGeo, woodMat);
    cap.position.y = -0.042;
    cap.castShadow = true;
    prop.add(cap);

    const glowMat = new THREE.MeshPhysicalMaterial({
      color: 0xffe49e,
      emissive: new THREE.Color(0xffaa33),
      emissiveIntensity: 1.15,
      roughness: 0.15,
      clearcoat: 1.0,
    });
    materials.push(glowMat);
    const glassGeo = new THREE.CylinderGeometry(0.03, 0.026, 0.058, 14);
    geometries.push(glassGeo);
    const glass = new THREE.Mesh(glassGeo, glowMat);
    glass.position.y = -0.084;
    prop.add(glass);

    const baseGeo = new THREE.CylinderGeometry(0.036, 0.04, 0.016, 14);
    geometries.push(baseGeo);
    const base = new THREE.Mesh(baseGeo, woodMat);
    base.position.y = -0.118;
    base.castShadow = true;
    prop.add(base);

    const cageGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.072, 6);
    geometries.push(cageGeo);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const bar = new THREE.Mesh(cageGeo, copperMat);
      bar.position.set(Math.cos(a) * 0.034, -0.084, Math.sin(a) * 0.034);
      prop.add(bar);
    }
  } else if (item === 'yarn_ball') {
    const tex = createTwistedYarnTextureSet(colorHex, 6, 2, 4);
    textures.push(tex);
    const ballMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: tex.map,
      bumpMap: tex.bumpMap,
      bumpScale: 0.038,
      roughness: 0.92,
      sheen: 1.0,
      sheenColor: new THREE.Color(sheenHex),
    });
    materials.push(ballMat);

    // Ball rests nestled slightly below & forward of palm
    const coreGeo = new THREE.SphereGeometry(0.058, 18, 14);
    geometries.push(coreGeo);
    const core = new THREE.Mesh(coreGeo, ballMat);
    core.position.set(0, -0.035, 0.018);
    core.castShadow = true;
    prop.add(core);

    const bandGeo = new THREE.TorusGeometry(0.056, 0.014, 8, 22);
    geometries.push(bandGeo);
    [0.2, 1.25, 2.3].forEach((rot) => {
      const b = new THREE.Mesh(bandGeo, ballMat);
      b.position.set(0, -0.035, 0.018);
      b.rotation.set(rot, rot * 0.7, 0);
      b.castShadow = true;
      prop.add(b);
    });
  } else if (item === 'wrench') {
    // Handle centered cleanly inside palm (0, 0, 0), jaws extending forward +Z
    const shaftGeo = new THREE.BoxGeometry(0.016, 0.01, 0.16);
    geometries.push(shaftGeo);
    const shaft = new THREE.Mesh(shaftGeo, copperMat);
    shaft.position.set(0, 0, 0.035);
    shaft.castShadow = true;
    prop.add(shaft);

    const headGeo = new THREE.TorusGeometry(0.026, 0.0085, 8, 18, Math.PI * 1.45);
    headGeo.rotateX(Math.PI / 2);
    geometries.push(headGeo);
    const head = new THREE.Mesh(headGeo, copperMat);
    head.position.set(0, 0, 0.125);
    head.rotation.y = -Math.PI * 0.22;
    head.castShadow = true;
    prop.add(head);

    const pommelGeo = new THREE.TorusGeometry(0.016, 0.006, 8, 14);
    pommelGeo.rotateX(Math.PI / 2);
    geometries.push(pommelGeo);
    const pommel = new THREE.Mesh(pommelGeo, copperMat);
    pommel.position.set(0, 0, -0.052);
    prop.add(pommel);
  } else if (item === 'flower') {
    const petalTex = createKnitCoreTextureSet('#f2b84b', 4, 3, 4);
    textures.push(petalTex);
    const stemMat = new THREE.MeshStandardMaterial({
      color: 0x4b7a4f,
      roughness: 0.75,
    });
    const petalMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: petalTex.map,
      roughness: 0.9,
      sheen: 1.0,
      sheenColor: new THREE.Color('#fff0b8'),
    });
    const centerMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(colorHex),
      roughness: 0.88,
      sheen: 0.9,
    });
    materials.push(stemMat, petalMat, centerMat);

    // Stem held right at (0,0,0), rising upward + forward (+Z/+Y)
    const stemCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.05, -0.02),
      new THREE.Vector3(0, 0.01, 0.0),
      new THREE.Vector3(0, 0.085, 0.075),
      new THREE.Vector3(0, 0.145, 0.135),
    ]);
    const stemGeo = new THREE.TubeGeometry(stemCurve, 16, 0.006, 8, false);
    geometries.push(stemGeo);
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.castShadow = true;
    prop.add(stem);

    const flowerHead = new THREE.Group();
    flowerHead.position.set(0, 0.145, 0.135);
    flowerHead.rotation.x = 0.65;
    const diskGeo = new THREE.SphereGeometry(0.024, 12, 10);
    diskGeo.scale(1, 0.55, 1);
    geometries.push(diskGeo);
    flowerHead.add(new THREE.Mesh(diskGeo, centerMat));

    const petalGeo = new THREE.SphereGeometry(0.02, 10, 8);
    petalGeo.scale(0.65, 0.45, 1.35);
    geometries.push(petalGeo);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const petal = new THREE.Mesh(petalGeo, petalMat);
      petal.position.set(Math.cos(a) * 0.032, 0, Math.sin(a) * 0.032);
      petal.rotation.y = -a + Math.PI / 2;
      petal.castShadow = true;
      flowerHead.add(petal);
    }
    prop.add(flowerHead);
  }

  return prop;
}

function buildSingleFigure(
  colorHex: string,
  sheenHex: string,
  eyeHex: string,
  yarnThickness: number,
  fuzzDensity: number,
  maxAnisotropy: number,
  seedOffset: number,
  geometries: THREE.BufferGeometry[],
  materials: THREE.Material[],
  textures: YarnTextureSet[]
): SingleFigureRig {
  const root = new THREE.Group();
  root.name = 'YarnCreature';

  const explodables: ExplodablePart[] = [];
  const armatureParts: THREE.Object3D[] = [];
  let partCount = 0;

  const registerExplode = (
    object: THREE.Object3D,
    dx: number,
    dy: number,
    dz: number
  ) => {
    explodables.push({
      object,
      restPos: object.position.clone(),
      explodeDir: new THREE.Vector3(dx, dy, dz),
    });
  };

  // Procedural Yarn & Knit Textures
  const yarnTex = createTwistedYarnTextureSet(colorHex, 7, 2, maxAnisotropy);
  const knitTex = createKnitCoreTextureSet(colorHex, 5, 4, maxAnisotropy);
  const darkKnitTex = createTwistedYarnTextureSet('#1e191a', 3, 2, maxAnisotropy);
  textures.push(yarnTex, knitTex, darkKnitTex);

  // Soft wool PBR materials with sheen
  const yarnStrandMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: yarnTex.map,
    bumpMap: yarnTex.bumpMap,
    bumpScale: 0.042,
    roughnessMap: yarnTex.roughnessMap,
    roughness: 0.92,
    metalness: 0.0,
    sheen: 1.0,
    sheenRoughness: 0.82,
    sheenColor: new THREE.Color(sheenHex),
  });

  const knitCoreMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: knitTex.map,
    bumpMap: knitTex.bumpMap,
    bumpScale: 0.036,
    roughnessMap: knitTex.roughnessMap,
    roughness: 0.94,
    metalness: 0.0,
    sheen: 1.0,
    sheenRoughness: 0.85,
    sheenColor: new THREE.Color(sheenHex),
  });

  const socketMat = new THREE.MeshStandardMaterial({
    color: 0x262022,
    map: darkKnitTex.map,
    bumpMap: darkKnitTex.bumpMap,
    bumpScale: 0.02,
    roughness: 0.95,
    metalness: 0.0,
  });

  const eyeBeadMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(eyeHex),
    roughness: 0.06,
    metalness: 0.04,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    ior: 1.58,
    reflectivity: 0.95,
  });

  const wireCoreMat = new THREE.MeshStandardMaterial({
    color: 0xc28a53,
    roughness: 0.3,
    metalness: 0.85,
  });

  const fuzzMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(sheenHex).lerp(new THREE.Color(colorHex), 0.52),
    roughness: 0.97,
    metalness: 0.0,
  });

  materials.push(
    yarnStrandMat,
    knitCoreMat,
    socketMat,
    eyeBeadMat,
    wireCoreMat,
    fuzzMat
  );

  // Shared delicate curved wool wisp geometry for InstancedMesh (hugs surface instead of spiking)
  const wispCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.002, 0),
    new THREE.Vector3(0.003, 0.009, 0.002),
    new THREE.Vector3(0.011, 0.017, 0.005),
    new THREE.Vector3(0.019, 0.014, 0.002),
  ]);
  const wispGeo = createTaperedTubeGeometry(
    wispCurve,
    6,
    4,
    (t) => 0.0021 * (1 - t * 0.78)
  );
  geometries.push(wispGeo);

  // Hips / Center of Gravity Pivot (bottom-center of character sits at y = 0)
  const hipsPivot = new THREE.Group();
  hipsPivot.position.set(0, 0.44, 0);
  hipsPivot.name = 'HipsPivot';
  root.add(hipsPivot);

  const tScale = yarnThickness;

  // Pelvis / Hip Bridge Cap (keeps legs & waist seamless when torso sways)
  const pelvisGeo = new THREE.SphereGeometry(0.148 * tScale, 20, 14);
  pelvisGeo.scale(1.06, 0.72, 0.88);
  geometries.push(pelvisGeo);
  const pelvisMesh = new THREE.Mesh(pelvisGeo, knitCoreMat);
  pelvisMesh.position.set(0, -0.02, 0);
  pelvisMesh.castShadow = true;
  pelvisMesh.receiveShadow = true;
  hipsPivot.add(pelvisMesh);

  // 1. KNITTED TORSO GROUP
  const torsoGroup = new THREE.Group();
  torsoGroup.name = 'TorsoGroup';
  hipsPivot.add(torsoGroup);

  // Soft tapered knitted torso core (LatheGeometry extending cleanly into pelvis & neck)
  const torsoProfile = [
    new THREE.Vector2(0.001, -0.10),
    new THREE.Vector2(0.115 * tScale, -0.075),
    new THREE.Vector2(0.165 * tScale, 0.0),
    new THREE.Vector2(0.144 * tScale, 0.14),
    new THREE.Vector2(0.168 * tScale, 0.28),
    new THREE.Vector2(0.146 * tScale, 0.38),
    new THREE.Vector2(0.102 * tScale, 0.44),
    new THREE.Vector2(0.001, 0.46),
  ];
  const torsoCoreGeo = new THREE.LatheGeometry(torsoProfile, 28);
  torsoCoreGeo.scale(1.04, 1.0, 0.88);
  geometries.push(torsoCoreGeo);
  const torsoCore = new THREE.Mesh(torsoCoreGeo, knitCoreMat);
  torsoCore.castShadow = true;
  torsoCore.receiveShadow = true;
  torsoGroup.add(torsoCore);
  partCount++;

  // Internal Torso Wire Armature (hidden at exploded = 0 so it never pokes through during sway!)
  const torsoWireGroup = new THREE.Group();
  torsoWireGroup.visible = false;
  const spineGeo = new THREE.CylinderGeometry(0.013, 0.013, 0.46, 10);
  geometries.push(spineGeo);
  const spineWire = new THREE.Mesh(spineGeo, wireCoreMat);
  spineWire.position.set(0, 0.22, 0);
  torsoWireGroup.add(spineWire);

  const shoulderBarGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.33, 8);
  shoulderBarGeo.rotateZ(Math.PI / 2);
  geometries.push(shoulderBarGeo);
  const shoulderWire = new THREE.Mesh(shoulderBarGeo, wireCoreMat);
  shoulderWire.position.set(0, 0.365, 0.01);
  torsoWireGroup.add(shoulderWire);

  const hipBarGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.2, 8);
  hipBarGeo.rotateZ(Math.PI / 2);
  geometries.push(hipBarGeo);
  const hipWire = new THREE.Mesh(hipBarGeo, wireCoreMat);
  hipWire.position.set(0, -0.02, 0);
  torsoWireGroup.add(hipWire);

  torsoGroup.add(torsoWireGroup);
  armatureParts.push(torsoWireGroup);
  partCount++;

  // Overlapping criss-cross yarn coils wrapping around the torso
  const torsoCoilsGroup = new THREE.Group();
  torsoCoilsGroup.name = 'TorsoYarnWraps';
  const coilSpecs = [
    { y0: -0.04, y1: 0.14, r: 0.166 * tScale, tilt: 0.34, phase: 0 },
    { y0: 0.04, y1: 0.23, r: 0.162 * tScale, tilt: -0.38, phase: 1.2 },
    { y0: 0.14, y1: 0.32, r: 0.172 * tScale, tilt: 0.3, phase: 2.1 },
    { y0: 0.22, y1: 0.39, r: 0.168 * tScale, tilt: -0.32, phase: 0.7 },
    { y0: 0.34, y1: 0.42, r: 0.132 * tScale, tilt: 0.14, phase: 1.8 },
    { y0: 0.07, y1: 0.09, r: 0.156 * tScale, tilt: 0.04, phase: 0.3 },
  ];

  coilSpecs.forEach((spec, idx) => {
    const pts: THREE.Vector3[] = [];
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2 + spec.phase;
      const y =
        THREE.MathUtils.lerp(spec.y0, spec.y1, 0.5 + 0.5 * Math.sin(a)) +
        Math.cos(a * 2) * 0.01;
      const rX = spec.r * 1.04;
      const rZ = spec.r * 0.88;
      pts.push(
        new THREE.Vector3(
          Math.cos(a) * rX,
          y + Math.sin(a) * spec.tilt * 0.07,
          Math.sin(a) * rZ
        )
      );
    }
    const curve = new THREE.CatmullRomCurve3(pts, true);
    const coilGeo = new THREE.TubeGeometry(
      curve,
      44,
      0.028 * tScale,
      10,
      true
    );
    geometries.push(coilGeo);
    const coilMesh = new THREE.Mesh(coilGeo, yarnStrandMat);
    coilMesh.castShadow = true;
    coilMesh.receiveShadow = true;
    coilMesh.name = `TorsoCoil_${idx}`;
    torsoCoilsGroup.add(coilMesh);
  });
  torsoGroup.add(torsoCoilsGroup);
  registerExplode(torsoCoilsGroup, 0, 0.05, 0.22);
  partCount++;

  // 2. HEAD & ICONIC CURVED YARNY EAR-HORNS
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.44, 0.01);
  headPivot.name = 'HeadPivot';
  torsoGroup.add(headPivot);
  registerExplode(headPivot, 0, 0.26, 0);

  // Knitted rounded neck overlap collar (prevents any neck gap when head tilts!)
  const neckCollarGeo = new THREE.SphereGeometry(0.112 * tScale, 18, 12);
  neckCollarGeo.scale(1.04, 0.78, 0.9);
  geometries.push(neckCollarGeo);
  const neckCollar = new THREE.Mesh(neckCollarGeo, knitCoreMat);
  neckCollar.position.set(0, 0.0, 0);
  neckCollar.castShadow = true;
  neckCollar.receiveShadow = true;
  headPivot.add(neckCollar);

  // Internal Head Wire Loop (hidden unless exploded > 0)
  const headWireGroup = new THREE.Group();
  headWireGroup.visible = false;
  const headLoopGeo = new THREE.TorusGeometry(0.085, 0.01, 8, 20);
  geometries.push(headLoopGeo);
  const headLoopWire = new THREE.Mesh(headLoopGeo, wireCoreMat);
  headLoopWire.position.set(0, 0.19, 0);
  headWireGroup.add(headLoopWire);
  headPivot.add(headWireGroup);
  armatureParts.push(headWireGroup);

  // Knitted rounded head core (overlapping slightly below 0 into torso neck)
  const headProfile = [
    new THREE.Vector2(0.001, -0.02),
    new THREE.Vector2(0.118 * tScale, 0.015),
    new THREE.Vector2(0.195 * tScale, 0.11),
    new THREE.Vector2(0.215 * tScale, 0.21),
    new THREE.Vector2(0.185 * tScale, 0.31),
    new THREE.Vector2(0.11 * tScale, 0.37),
    new THREE.Vector2(0.001, 0.385),
  ];
  const headCoreGeo = new THREE.LatheGeometry(headProfile, 30);
  headCoreGeo.scale(1.12, 0.96, 0.92);
  geometries.push(headCoreGeo);
  const headCore = new THREE.Mesh(headCoreGeo, knitCoreMat);
  headCore.castShadow = true;
  headCore.receiveShadow = true;
  headPivot.add(headCore);
  partCount++;

  // Braided yarn forehead & cheek wrap bands
  const headWrapsGroup = new THREE.Group();
  headWrapsGroup.name = 'HeadYarnWraps';

  const browPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const rx = 0.232 * tScale;
    const rz = 0.192 * tScale;
    const dip = Math.sin(a) > 0 ? Math.sin(a) * 0.018 : 0;
    browPts.push(
      new THREE.Vector3(Math.cos(a) * rx, 0.262 - dip, Math.sin(a) * rz)
    );
  }
  const browCurve = new THREE.CatmullRomCurve3(browPts, true);
  const browGeo = new THREE.TubeGeometry(browCurve, 56, 0.029 * tScale, 10, true);
  geometries.push(browGeo);
  const browMesh = new THREE.Mesh(browGeo, yarnStrandMat);
  browMesh.castShadow = true;
  browMesh.receiveShadow = true;
  headWrapsGroup.add(browMesh);

  const cheekPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const rx = 0.208 * tScale;
    const rz = 0.172 * tScale;
    cheekPts.push(
      new THREE.Vector3(
        Math.cos(a) * rx,
        0.095 + Math.cos(a * 2) * 0.014,
        Math.sin(a) * rz
      )
    );
  }
  const cheekCurve = new THREE.CatmullRomCurve3(cheekPts, true);
  const cheekGeo = new THREE.TubeGeometry(
    cheekCurve,
    52,
    0.025 * tScale,
    10,
    true
  );
  geometries.push(cheekGeo);
  const cheekMesh = new THREE.Mesh(cheekGeo, yarnStrandMat);
  cheekMesh.castShadow = true;
  cheekMesh.receiveShadow = true;
  headWrapsGroup.add(cheekMesh);

  headPivot.add(headWrapsGroup);
  registerExplode(headWrapsGroup, 0, 0.08, 0.16);
  partCount++;

  // Iconic Dual Curved Ear-Horns (Left & Right) + Exact Surface-Anchored Fuzz
  let totalFibers = 0;
  const buildEarHorn = (side: -1 | 1): THREE.Group => {
    const earGroup = new THREE.Group();
    earGroup.position.set(side * 0.135, 0.295, -0.01);
    earGroup.name = side < 0 ? 'LeftEarHorn' : 'RightEarHorn';

    const hornCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.02, 0),
      new THREE.Vector3(side * 0.055, 0.09, -0.01),
      new THREE.Vector3(side * 0.105, 0.22, 0.01),
      new THREE.Vector3(side * 0.075, 0.34, 0.045),
      new THREE.Vector3(side * 0.025, 0.39, 0.065),
    ]);

    const hornRadiusFn = (t: number) =>
      (0.072 * (1 - t * 0.72) + 0.014 * Math.sin(t * Math.PI)) * tScale;

    const hornGeo = createTaperedTubeGeometry(
      hornCurve,
      34,
      14,
      hornRadiusFn,
      false
    );
    geometries.push(hornGeo);
    const hornMesh = new THREE.Mesh(hornGeo, yarnStrandMat);
    hornMesh.castShadow = true;
    hornMesh.receiveShadow = true;
    earGroup.add(hornMesh);

    // Rounded yarn tip cap
    const tipPt = hornCurve.getPointAt(1);
    const tipGeo = new THREE.SphereGeometry(0.022 * tScale, 12, 10);
    geometries.push(tipGeo);
    const tipMesh = new THREE.Mesh(tipGeo, yarnStrandMat);
    tipMesh.position.copy(tipPt);
    tipMesh.castShadow = true;
    earGroup.add(tipMesh);

    // Spiral wrapped collar rings around the horn base
    for (let r = 0; r < 2; r++) {
      const tPos = 0.16 + r * 0.18;
      const ringPt = hornCurve.getPointAt(tPos);
      const ringGeo = new THREE.TorusGeometry(
        (0.062 - r * 0.01) * tScale,
        0.02 * tScale,
        10,
        22
      );
      geometries.push(ringGeo);
      const ringMesh = new THREE.Mesh(ringGeo, yarnStrandMat);
      ringMesh.position.copy(ringPt);
      ringMesh.rotation.x = Math.PI / 2 - 0.15;
      ringMesh.rotation.y = side * 0.32;
      ringMesh.castShadow = true;
      earGroup.add(ringMesh);
    }

    // Surface-anchored wool fuzz on the curved ear-horn
    if (fuzzDensity > 0.02) {
      const earFiberCount = Math.max(12, Math.round(52 * fuzzDensity));
      const frames = hornCurve.computeFrenetFrames(40, false);
      const samples: { pos: THREE.Vector3; normal: THREE.Vector3; scale: number }[] = [];

      for (let i = 0; i < earFiberCount; i++) {
        const s1 = Math.sin((i + seedOffset * 31 + side * 7) * 19.31) * 43758.5453;
        const r1 = s1 - Math.floor(s1);
        const s2 = Math.sin((i + seedOffset * 17) * 73.19) * 43758.5453;
        const r2 = s2 - Math.floor(s2);

        const t = 0.08 + r1 * 0.88;
        const idx = Math.min(40, Math.round(t * 40));
        const angle = r2 * Math.PI * 2;
        const center = hornCurve.getPointAt(t);
        const N = frames.normals[idx];
        const B = frames.binormals[idx];
        const normal = new THREE.Vector3()
          .addScaledVector(N, Math.cos(angle))
          .addScaledVector(B, Math.sin(angle))
          .normalize();
        // Embed root 2mm inside surface so zero fibers ever float
        const rSurf = Math.max(0.008, hornRadiusFn(t) - 0.0025);
        const pos = new THREE.Vector3().copy(center).addScaledVector(normal, rSurf);
        samples.push({ pos, normal, scale: 0.72 + (1 - t) * 0.35 });
      }
      const earFuzz = createSurfaceFuzzMesh(
        samples,
        wispGeo,
        fuzzMat,
        seedOffset + (side < 0 ? 10 : 20)
      );
      earGroup.add(earFuzz);
      totalFibers += earFiberCount;
    }

    registerExplode(earGroup, side * 0.18, 0.22, 0);
    partCount++;
    return earGroup;
  };

  const leftEarGroup = buildEarHorn(-1);
  const rightEarGroup = buildEarHorn(1);
  headPivot.add(leftEarGroup, rightEarGroup);

  // Expressive Eyes (dark wool stitched sockets + glossy glass button beads)
  const eyesGroup = new THREE.Group();
  eyesGroup.name = 'EyesGroup';
  [-1, 1].forEach((side) => {
    const eyeSocketGeo = new THREE.CylinderGeometry(
      0.056 * tScale,
      0.062 * tScale,
      0.026,
      20
    );
    eyeSocketGeo.rotateX(Math.PI / 2);
    geometries.push(eyeSocketGeo);
    const socket = new THREE.Mesh(eyeSocketGeo, socketMat);
    socket.position.set(side * 0.095, 0.185, 0.175 * tScale);
    socket.rotation.y = side * 0.34;
    socket.receiveShadow = true;
    eyesGroup.add(socket);

    const beadGeo = new THREE.SphereGeometry(0.044 * tScale, 20, 16);
    beadGeo.scale(1.0, 1.06, 0.78);
    geometries.push(beadGeo);
    const bead = new THREE.Mesh(beadGeo, eyeBeadMat);
    bead.position.set(side * 0.098, 0.185, 0.187 * tScale);
    bead.rotation.y = side * 0.34;
    bead.castShadow = true;
    eyesGroup.add(bead);
  });
  headPivot.add(eyesGroup);
  registerExplode(eyesGroup, 0, 0.04, 0.26);
  partCount++;

  // 3. ARTICULATED BRAIDED ARMS & LOOPED YARN HANDS
  // Note: Local arm hangs cleanly DOWNWARD along -Y so rotation.z:
  //   side = -1 (left, -X): negative rotation.z swings OUTWARD (-X) & UP (+Y)
  //   side = +1 (right, +X): positive rotation.z swings OUTWARD (+X) & UP (+Y)
  const buildArm = (side: -1 | 1) => {
    const shoulderPivot = new THREE.Group();
    shoulderPivot.position.set(side * 0.168, 0.365, 0.01);
    shoulderPivot.name = side < 0 ? 'LeftArmPivot' : 'RightArmPivot';

    // Rounded yarn shoulder cap so arm never disconnects from chest
    const shoulderCapGeo = new THREE.SphereGeometry(0.048 * tScale, 12, 10);
    geometries.push(shoulderCapGeo);
    const shoulderCap = new THREE.Mesh(shoulderCapGeo, knitCoreMat);
    shoulderCap.castShadow = true;
    shoulderPivot.add(shoulderCap);

    const upperCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(side * 0.016, -0.095, 0.008),
      new THREE.Vector3(side * 0.024, -0.19, 0.014),
    ]);
    const upperBraid = createBraidedStrands(
      upperCurve,
      0.028 * tScale,
      0.019 * tScale,
      2.6,
      24,
      yarnStrandMat,
      geometries
    );
    shoulderPivot.add(upperBraid);

    const forearmPivot = new THREE.Group();
    forearmPivot.position.set(side * 0.024, -0.19, 0.014);
    forearmPivot.name = side < 0 ? 'LeftForearmPivot' : 'RightForearmPivot';
    shoulderPivot.add(forearmPivot);

    const foreCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(side * 0.008, -0.09, 0.016),
      new THREE.Vector3(side * 0.01, -0.172, 0.028),
    ]);
    const foreBraid = createBraidedStrands(
      foreCurve,
      0.025 * tScale,
      0.016 * tScale,
      2.3,
      20,
      yarnStrandMat,
      geometries
    );
    forearmPivot.add(foreBraid);

    // Wrist cuff wrap
    const cuffGeo = new THREE.TorusGeometry(
      0.034 * tScale,
      0.014 * tScale,
      8,
      18
    );
    geometries.push(cuffGeo);
    const cuff = new THREE.Mesh(cuffGeo, yarnStrandMat);
    cuff.position.set(side * 0.01, -0.168, 0.028);
    cuff.rotation.x = Math.PI / 2 - 0.15;
    cuff.castShadow = true;
    forearmPivot.add(cuff);

    // Soft looped mitten hand (3 cozy yarn loops)
    const handGroup = new THREE.Group();
    handGroup.position.set(side * 0.01, -0.185, 0.03);
    [-0.017, 0, 0.017].forEach((offsetX, i) => {
      const fingerCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(offsetX, 0, 0),
        new THREE.Vector3(
          offsetX + side * 0.004,
          -0.042 - (i === 1 ? 0.012 : 0),
          0.01
        ),
        new THREE.Vector3(offsetX * 0.6, -0.055 - (i === 1 ? 0.012 : 0), 0.018),
      ]);
      const fGeo = createTaperedTubeGeometry(
        fingerCurve,
        10,
        8,
        (t) => 0.015 * (1 - t * 0.25) * tScale
      );
      geometries.push(fGeo);
      const fMesh = new THREE.Mesh(fGeo, yarnStrandMat);
      fMesh.castShadow = true;
      handGroup.add(fMesh);

      const fTipGeo = new THREE.SphereGeometry(0.012 * tScale, 8, 8);
      geometries.push(fTipGeo);
      const fTip = new THREE.Mesh(fTipGeo, yarnStrandMat);
      fTip.position.copy(fingerCurve.getPointAt(1));
      handGroup.add(fTip);
    });
    forearmPivot.add(handGroup);

    // Explicit palm-center socket inside curled fingers (NOT at elbow pivot (0,0,0)!)
    const handAnchor = new THREE.Object3D();
    handAnchor.name = side < 0 ? 'LeftHandAnchor' : 'RightHandAnchor';
    handAnchor.position.set(0, -0.028, 0.014);
    handGroup.add(handAnchor);

    registerExplode(shoulderPivot, side * 0.28, 0.04, 0);
    partCount += 2;
    return { shoulderPivot, forearmPivot, handAnchor };
  };

  const leftArm = buildArm(-1);
  const rightArm = buildArm(1);
  torsoGroup.add(leftArm.shoulderPivot, rightArm.shoulderPivot);

  // 4. ARTICULATED BRAIDED LEGS & KNITTED BOOTS (resting flush at y = 0)
  const buildLeg = (side: -1 | 1) => {
    const legPivot = new THREE.Group();
    legPivot.position.set(side * 0.095, -0.03, 0);
    legPivot.name = side < 0 ? 'LeftLegPivot' : 'RightLegPivot';

    // Rounded yarn hip ball so leg swings smoothly inside pelvis with zero gaps
    const hipBallGeo = new THREE.SphereGeometry(0.056 * tScale, 12, 10);
    geometries.push(hipBallGeo);
    const hipBall = new THREE.Mesh(hipBallGeo, knitCoreMat);
    hipBall.castShadow = true;
    legPivot.add(hipBall);

    const thighCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(side * 0.012, -0.1, 0.012),
      new THREE.Vector3(side * 0.016, -0.195, 0.005),
    ]);
    const thighBraid = createBraidedStrands(
      thighCurve,
      0.034 * tScale,
      0.022 * tScale,
      2.2,
      22,
      yarnStrandMat,
      geometries
    );
    legPivot.add(thighBraid);

    const kneePivot = new THREE.Group();
    kneePivot.position.set(side * 0.016, -0.195, 0.005);
    kneePivot.name = side < 0 ? 'LeftKneePivot' : 'RightKneePivot';
    legPivot.add(kneePivot);

    const shinCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, -0.09, -0.008),
      new THREE.Vector3(0, -0.17, 0.0),
    ]);
    const shinBraid = createBraidedStrands(
      shinCurve,
      0.03 * tScale,
      0.019 * tScale,
      2.0,
      20,
      yarnStrandMat,
      geometries
    );
    kneePivot.add(shinBraid);

    const ankleCuffGeo = new THREE.TorusGeometry(
      0.044 * tScale,
      0.016 * tScale,
      8,
      20
    );
    geometries.push(ankleCuffGeo);
    const ankleCuff = new THREE.Mesh(ankleCuffGeo, yarnStrandMat);
    ankleCuff.position.set(0, -0.15, 0);
    ankleCuff.rotation.x = Math.PI / 2;
    ankleCuff.castShadow = true;
    kneePivot.add(ankleCuff);

    const footGroup = new THREE.Group();
    footGroup.position.set(0, -0.175, 0.035);
    const footGeo = new THREE.SphereGeometry(0.056 * tScale, 18, 14);
    footGeo.scale(0.95, 0.72, 1.48);
    geometries.push(footGeo);
    const footMesh = new THREE.Mesh(footGeo, knitCoreMat);
    footMesh.castShadow = true;
    footMesh.receiveShadow = true;
    footGroup.add(footMesh);

    const toeWrapGeo = new THREE.TorusGeometry(
      0.046 * tScale,
      0.015 * tScale,
      8,
      20
    );
    geometries.push(toeWrapGeo);
    const toeWrap = new THREE.Mesh(toeWrapGeo, yarnStrandMat);
    toeWrap.position.set(0, -0.004, 0.032);
    toeWrap.scale.set(1.0, 0.78, 1.0);
    toeWrap.castShadow = true;
    footGroup.add(toeWrap);

    kneePivot.add(footGroup);
    registerExplode(legPivot, side * 0.16, -0.22, 0);
    partCount += 2;
    return { legPivot, kneePivot };
  };

  const leftLeg = buildLeg(-1);
  const rightLeg = buildLeg(1);
  hipsPivot.add(leftLeg.legPivot, rightLeg.legPivot);

  // 5. TRAILING UNRAVELED YARN TETHER STRAND
  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, 0.04, -0.125);
  tailGroup.name = 'YarnTetherTail';

  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(-0.04, -0.14, -0.14),
    new THREE.Vector3(-0.14, -0.32, -0.28),
    new THREE.Vector3(-0.08, -0.45, -0.46),
    new THREE.Vector3(0.08, -0.458, -0.66),
    new THREE.Vector3(0.24, -0.458, -0.78),
  ]);
  const tailGeo = createTaperedTubeGeometry(
    tailCurve,
    48,
    10,
    (t) => 0.022 * (1 - t * 0.25) * tScale
  );
  geometries.push(tailGeo);
  const tailMesh = new THREE.Mesh(tailGeo, yarnStrandMat);
  tailMesh.castShadow = true;
  tailMesh.receiveShadow = true;
  tailGroup.add(tailMesh);
  const tailRestPositions = new Float32Array(
    (tailGeo.attributes.position as THREE.BufferAttribute).array
  );

  hipsPivot.add(tailGroup);
  registerExplode(tailGroup, 0, -0.08, -0.28);
  partCount++;

  // 6. SURFACE-ANCHORED WOOL MICRO-FIBERS ON TORSO & HEAD (Zero floating!)
  if (fuzzDensity > 0.02) {
    // A. Torso Fuzz (parented to torsoGroup, sampled directly from torsoProfile)
    const torsoFiberCount = Math.round(140 * fuzzDensity);
    const torsoSamples: { pos: THREE.Vector3; normal: THREE.Vector3; scale: number }[] = [];
    for (let i = 0; i < torsoFiberCount; i++) {
      const s1 = Math.sin((i + seedOffset * 41) * 17.13) * 43758.5453;
      const r1 = s1 - Math.floor(s1);
      const s2 = Math.sin((i + seedOffset * 53) * 89.47) * 43758.5453;
      const r2 = s2 - Math.floor(s2);

      const h = -0.04 + r1 * 0.45;
      const theta = r2 * Math.PI * 2;
      // Match torsoCoreGeo scale (1.04, 1.0, 0.88) and embed root 3mm inside
      const rBase = Math.max(0.03, sampleProfileRadius(torsoProfile, h) - 0.003);
      const rx = rBase * 1.04;
      const rz = rBase * 0.88;
      const px = Math.cos(theta) * rx;
      const pz = Math.sin(theta) * rz;

      const normal = new THREE.Vector3(px / (rx * rx), 0.12, pz / (rz * rz)).normalize();
      torsoSamples.push({ pos: new THREE.Vector3(px, h, pz), normal, scale: 0.9 });
    }
    const torsoFuzz = createSurfaceFuzzMesh(
      torsoSamples,
      wispGeo,
      fuzzMat,
      seedOffset + 100
    );
    torsoFuzz.name = 'TorsoWoolFuzz';
    torsoGroup.add(torsoFuzz);
    totalFibers += torsoFiberCount;

    // B. Head Fuzz (parented to headPivot, sampled directly from headProfile!)
    const headFiberCount = Math.round(160 * fuzzDensity);
    const headSamples: { pos: THREE.Vector3; normal: THREE.Vector3; scale: number }[] = [];
    for (let i = 0; i < headFiberCount * 2; i++) {
      if (headSamples.length >= headFiberCount) break;
      const s1 = Math.sin((i + seedOffset * 61) * 23.71) * 43758.5453;
      const r1 = s1 - Math.floor(s1);
      const s2 = Math.sin((i + seedOffset * 71) * 59.17) * 43758.5453;
      const r2 = s2 - Math.floor(s2);

      const h = 0.03 + r1 * 0.34;
      const theta = r2 * Math.PI * 2;
      const rBase = Math.max(0.03, sampleProfileRadius(headProfile, h) - 0.003);
      const rx = rBase * 1.12;
      const ry = h * 0.96;
      const rz = rBase * 0.92;
      const px = Math.cos(theta) * rx;
      const pz = Math.sin(theta) * rz;

      // Avoid placing fuzz inside the glossy eye beads
      if (pz > 0.11 && Math.abs(px) > 0.035 && Math.abs(px) < 0.16 && ry > 0.12 && ry < 0.25) {
        continue;
      }

      const normal = new THREE.Vector3(
        px / (rx * rx),
        (ry - 0.19) * 1.8,
        pz / (rz * rz)
      ).normalize();
      headSamples.push({ pos: new THREE.Vector3(px, ry, pz), normal, scale: 0.85 });
    }
    const headFuzz = createSurfaceFuzzMesh(
      headSamples,
      wispGeo,
      fuzzMat,
      seedOffset + 200
    );
    headFuzz.name = 'HeadWoolFuzz';
    headPivot.add(headFuzz);
    totalFibers += headSamples.length;
    partCount += 2;
  }

  return {
    root,
    hipsPivot,
    torsoGroup,
    headPivot,
    leftEarGroup,
    rightEarGroup,
    leftArmPivot: leftArm.shoulderPivot,
    rightArmPivot: rightArm.shoulderPivot,
    leftForearmPivot: leftArm.forearmPivot,
    rightForearmPivot: rightArm.forearmPivot,
    leftHandAnchor: leftArm.handAnchor,
    rightHandAnchor: rightArm.handAnchor,
    leftLegPivot: leftLeg.legPivot,
    rightLegPivot: rightLeg.legPivot,
    leftKneePivot: leftLeg.kneePivot,
    rightKneePivot: rightLeg.kneePivot,
    tailGroup,
    tailMesh,
    tailRestPositions,
    armatureParts,
    explodables,
    partCount,
    fiberCount: totalFibers,
  };
}

/**
 * Builds the full Unravel 2-inspired Soft Knitted Yarn Creature (Solo or Co-op Duo).
 */
export function buildYarnCreature(
  config: YarnCreatureConfig,
  maxAnisotropy = 4
): YarnCreatureInstance {
  const group = new THREE.Group();
  group.name = 'YarnyStudioAssembly';

  const exportRoot = new THREE.Group();
  exportRoot.name = 'YarnCreatureExport';
  group.add(exportRoot);

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: YarnTextureSet[] = [];

  const figures: SingleFigureRig[] = [];

  if (!config.duoMode) {
    const primary = buildSingleFigure(
      config.color,
      config.sheenColor,
      config.eyeColor,
      config.yarnThickness,
      config.fuzzDensity,
      maxAnisotropy,
      1,
      geometries,
      materials,
      textures
    );
    exportRoot.add(primary.root);
    figures.push(primary);
  } else {
    const leftFig = buildSingleFigure(
      config.color,
      config.sheenColor,
      config.eyeColor,
      config.yarnThickness,
      config.fuzzDensity,
      maxAnisotropy,
      1,
      geometries,
      materials,
      textures
    );
    leftFig.root.position.set(-0.34, 0, 0);
    leftFig.root.rotation.y = 0.16;

    const rightFig = buildSingleFigure(
      config.secondaryColor,
      config.secondarySheenColor,
      '#14171c',
      config.yarnThickness,
      config.fuzzDensity,
      maxAnisotropy,
      2,
      geometries,
      materials,
      textures
    );
    rightFig.root.position.set(0.34, 0, 0.04);
    rightFig.root.rotation.y = -0.18;

    const bridgeTex = createTwistedYarnTextureSet(
      config.color,
      6,
      1,
      maxAnisotropy
    );
    textures.push(bridgeTex);
    const bridgeMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: bridgeTex.map,
      bumpMap: bridgeTex.bumpMap,
      bumpScale: 0.03,
      roughness: 0.92,
      sheen: 1.0,
      sheenRoughness: 0.8,
      sheenColor: new THREE.Color(config.sheenColor),
    });
    materials.push(bridgeMat);

    const bridgeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.24, 0.52, -0.06),
      new THREE.Vector3(-0.1, 0.36, -0.02),
      new THREE.Vector3(0.0, 0.32, 0.02),
      new THREE.Vector3(0.12, 0.37, 0.0),
      new THREE.Vector3(0.24, 0.52, -0.02),
    ]);
    const bridgeGeo = new THREE.TubeGeometry(
      bridgeCurve,
      36,
      0.019 * config.yarnThickness,
      8,
      false
    );
    geometries.push(bridgeGeo);
    const bridgeMesh = new THREE.Mesh(bridgeGeo, bridgeMat);
    bridgeMesh.castShadow = true;
    bridgeMesh.name = 'CoopTetherBridge';

    exportRoot.add(leftFig.root, rightFig.root, bridgeMesh);
    figures.push(leftFig, rightFig);
  }

  // Attach held prop directly to the selected palm socket of the primary figure
  const heldProp = buildHeldProp(
    config.heldItem,
    config.secondaryColor || '#3474cc',
    config.secondarySheenColor || '#9ac8ff',
    geometries,
    materials,
    textures
  );
  if (heldProp && figures[0]) {
    const anchor =
      config.heldHand === 'left'
        ? figures[0].leftHandAnchor
        : figures[0].rightHandAnchor;
    anchor.add(heldProp);
  }

  let currentExploded = 0;

  const updateSingleRig = (
    rig: SingleFigureRig,
    t: number,
    dt: number,
    pose: YarnPose,
    exploded: number,
    phaseOffset: number,
    baseRotY: number,
    interaction?: CreatureInteractionState
  ) => {
    const k = 1 - Math.exp(-11 * dt);
    const phase = t + phaseOffset;

    // Target joint angles & hip position
    let hipY = 0.44;
    let hipZ = 0;
    let hipRy = 0;
    let hipRz = 0;
    let torsoRx = 0;
    let torsoRy = 0;
    let torsoRz = 0;
    let headRx = 0;
    let headRy = 0;
    let headRz = 0;
    // IMPORTANT: Left arm (-X) outward = negative Z; Right arm (+X) outward = positive Z
    let lArmRx = 0;
    let lArmRy = 0;
    let lArmRz = -0.18;
    let lForeRx = -0.18;
    let lForeRz = 0;
    let rArmRx = 0;
    let rArmRy = 0;
    let rArmRz = 0.18;
    let rForeRx = -0.18;
    let rForeRz = 0;
    let lLegRx = 0;
    let lLegRy = 0;
    let rLegRx = 0;
    let rLegRy = 0;
    let lLegRz = 0;
    let rLegRz = 0;
    let lKneeRx = 0;
    let rKneeRx = 0;
    let earBob = 0;

    if (pose === 'idle') {
      const breathe = Math.sin(phase * 2.1);
      hipY = 0.44 + breathe * 0.008;
      torsoRx = 0.03 + breathe * 0.022;
      torsoRy = Math.sin(phase * 0.9) * 0.045;
      headRx = -0.04 + Math.sin(phase * 2.1 - 0.6) * 0.035;
      headRy = Math.sin(phase * 0.7) * 0.11;
      headRz = Math.sin(phase * 1.1) * 0.04;
      lArmRz = -0.18 - breathe * 0.03;
      rArmRz = 0.18 + breathe * 0.03;
      lArmRx = Math.sin(phase * 1.4) * 0.05;
      rArmRx = -Math.sin(phase * 1.4) * 0.05;
      lForeRx = -0.22;
      rForeRx = -0.22;
      if (config.heldItem !== 'none' && phaseOffset === 0) {
        if (config.heldHand === 'left') {
          lArmRx = -0.35 + breathe * 0.03;
          lForeRx = -1.05;
        } else {
          rArmRx = -0.35 + breathe * 0.03;
          rForeRx = -1.05;
        }
      }
      earBob = Math.sin(phase * 2.1 - 0.9) * 0.045;
    } else if (pose === 'wave') {
      const wave = Math.sin(phase * 6.5);
      hipY = 0.445 + Math.sin(phase * 3.2) * 0.012;
      torsoRz = 0.06;
      headRz = -0.11;
      headRy = -0.08;
      rArmRz = 2.38 + wave * 0.22;
      rArmRx = -0.22;
      rForeRx = -0.28;
      rForeRz = 0.25 + Math.sin(phase * 6.5 - 0.5) * 0.34;
      lArmRz = -0.24;
      lForeRx = config.heldItem !== 'none' && config.heldHand === 'left' ? -1.05 : -0.26;
      if (config.heldItem !== 'none' && config.heldHand === 'left') {
        lArmRx = -0.35;
      }
      earBob = Math.sin(phase * 3.2 - 0.5) * 0.06;
    } else if (pose === 'run') {
      const cyc = phase * 10.5;
      const stride = Math.sin(cyc);
      const flight = Math.abs(Math.sin(cyc));
      hipY = 0.42 + flight * 0.11;
      torsoRx = 0.34 + Math.cos(cyc * 2) * 0.045;
      torsoRy = stride * 0.28;
      torsoRz = -stride * 0.08;
      headRx = -0.22 + Math.cos(cyc * 2) * 0.04;
      headRy = -stride * 0.14;
      lLegRx = stride * 0.95;
      rLegRx = -stride * 0.95;
      lKneeRx = Math.max(0, -stride) * 1.15 + 0.14;
      rKneeRx = Math.max(0, stride) * 1.15 + 0.14;
      lArmRx = -stride * 1.15;
      rArmRx = stride * 1.15;
      lArmRz = -0.24;
      rArmRz = 0.24;
      lForeRx = -1.15 - stride * 0.22;
      rForeRx = -1.15 + stride * 0.22;
      earBob = Math.sin(cyc - 0.6) * 0.14;
    } else if (pose === 'jump') {
      const u = (phase * 0.85) % 1;
      if (u < 0.22) {
        const c = Math.sin((u / 0.22) * Math.PI * 0.5);
        hipY = 0.44 - c * 0.11;
        torsoRx = 0.28 * c;
        headRx = -0.14 * c;
        lLegRx = -0.45 * c;
        rLegRx = -0.45 * c;
        lKneeRx = 0.85 * c;
        rKneeRx = 0.85 * c;
        lArmRx = 0.85 * c;
        rArmRx = 0.85 * c;
        lArmRz = -0.28;
        rArmRz = 0.28;
      } else if (u < 0.74) {
        const air = (u - 0.22) / 0.52;
        const arc = Math.sin(air * Math.PI);
        hipY = 0.42 + arc * 0.46;
        torsoRx = THREE.MathUtils.lerp(-0.18, 0.16, air);
        headRx = -0.15 * arc;
        lLegRx = -0.58 * arc;
        rLegRx = -0.35 * arc;
        lKneeRx = 0.95 * arc;
        rKneeRx = 0.65 * arc;
        lArmRx = -1.35 * arc;
        rArmRx = -1.25 * arc;
        lArmRz = -0.48 * arc - 0.18;
        rArmRz = 0.48 * arc + 0.18;
        lForeRx = -0.35;
        rForeRx = -0.35;
        earBob = -0.16 * arc;
      } else {
        const land = 1 - (u - 0.74) / 0.26;
        const dip = Math.sin(land * Math.PI);
        hipY = 0.44 - dip * 0.08;
        torsoRx = 0.2 * dip;
        lLegRx = -0.35 * dip;
        rLegRx = -0.35 * dip;
        lKneeRx = 0.65 * dip;
        rKneeRx = 0.65 * dip;
        lArmRz = -0.24;
        rArmRz = 0.24;
      }
    } else if (pose === 'climb') {
      const cyc = phase * 5.2;
      const reach = Math.sin(cyc);
      hipRy = -0.78;
      hipY = 0.45 + Math.abs(Math.cos(cyc)) * 0.065;
      torsoRx = 0.14;
      torsoRy = reach * 0.18;
      headRx = -0.36;
      headRy = -reach * 0.1;
      lArmRx = -1.95 + reach * 0.55;
      rArmRx = -1.95 - reach * 0.55;
      lArmRz = -0.22;
      rArmRz = 0.22;
      lForeRx = -0.55 - reach * 0.25;
      rForeRx = -0.55 + reach * 0.25;

      rLegRx = -0.65 + reach * 0.45;
      lLegRx = -0.65 - reach * 0.45;
      rKneeRx = 1.05 - reach * 0.35;
      lKneeRx = 1.05 + reach * 0.35;
      earBob = Math.sin(cyc * 2) * 0.06;
    } else if (pose === 'ride') {
      const steer = interaction?.bikeSteer ?? 0;
      const speed = interaction?.bikeSpeed ?? 1.2;

      // Sit high and upright on top of the quilted saddle (zero chest/pelvis sinking into tank/seat)
      hipY = interaction?.seatY ?? 0.515;
      hipZ = interaction?.seatZ ?? -0.2;
      hipRz = 0;
      torsoRx = (interaction?.riderLean ?? 0.24) + Math.min(0.08, speed * 0.02);
      torsoRy = steer * 0.12;
      headRx = -0.18;
      headRy = steer * 0.4;
      headRz = steer * 0.08;

      earBob = Math.sin(phase * (4 + speed * 4)) * (0.04 + speed * 0.03);
    } else if (pose === 'pull') {
      const tug = Math.sin(phase * 3.5) * 0.05;
      hipY = 0.395;
      torsoRx = -0.24 + tug;
      headRx = 0.16;
      lLegRx = -0.45;
      lKneeRx = 0.38;
      rLegRx = 0.32;
      rKneeRx = 0.25;
      lArmRx = -0.95 + tug;
      rArmRx = -0.95 + tug;
      lArmRz = -0.14;
      rArmRz = 0.14;
      lForeRx = -0.45;
      rForeRx = -0.45;
    } else if (pose === 'tpose') {
      hipY = 0.44;
      lArmRz = -1.48;
      rArmRz = 1.48;
      lForeRx = 0;
      rForeRx = 0;
    }

    // Apply smooth exponential damping to hips, torso & head first
    rig.hipsPivot.position.y = THREE.MathUtils.lerp(
      rig.hipsPivot.position.y,
      hipY,
      k
    );
    rig.hipsPivot.position.z = THREE.MathUtils.lerp(
      rig.hipsPivot.position.z,
      hipZ,
      k
    );
    rig.hipsPivot.rotation.y = THREE.MathUtils.lerp(
      rig.hipsPivot.rotation.y,
      baseRotY + hipRy,
      k
    );
    rig.hipsPivot.rotation.z = THREE.MathUtils.lerp(
      rig.hipsPivot.rotation.z,
      hipRz,
      k
    );
    rig.torsoGroup.rotation.x = THREE.MathUtils.lerp(
      rig.torsoGroup.rotation.x,
      torsoRx,
      k
    );
    rig.torsoGroup.rotation.y = THREE.MathUtils.lerp(
      rig.torsoGroup.rotation.y,
      torsoRy,
      k
    );
    rig.torsoGroup.rotation.z = THREE.MathUtils.lerp(
      rig.torsoGroup.rotation.z,
      torsoRz,
      k
    );

    // Solve exact Pole-Vector 2-bone Arm IK & Leg IK when riding
    if (pose === 'ride') {
      rig.hipsPivot.updateMatrix();
      rig.torsoGroup.updateMatrix();
      _mat4A.multiplyMatrices(rig.hipsPivot.matrix, rig.torsoGroup.matrix);
      _mat4B.copy(_mat4A).invert();

      if (interaction?.leftGripChassis) {
        _vec3B.copy(interaction.leftGripChassis).applyMatrix4(_mat4B);
      } else {
        _vec3B.set(-0.235, 0.712, 0.197).applyMatrix4(_mat4B);
      }
      const lIK = solveArmIK(-1, rig.leftArmPivot.position, _vec3B);
      lArmRx = lIK.armRx;
      lArmRy = lIK.armRy;
      lArmRz = lIK.armRz;
      lForeRx = lIK.foreRx;

      if (interaction?.rightGripChassis) {
        _vec3B.copy(interaction.rightGripChassis).applyMatrix4(_mat4B);
      } else {
        _vec3B.set(0.235, 0.712, 0.197).applyMatrix4(_mat4B);
      }
      const rIK = solveArmIK(1, rig.rightArmPivot.position, _vec3B);
      rArmRx = rIK.armRx;
      rArmRy = rIK.armRy;
      rArmRz = rIK.armRz;
      rForeRx = rIK.foreRx;

      // Leg IK in hipsPivot space onto footpegs (+2.2cm peg radius)
      _mat4B.copy(rig.hipsPivot.matrix).invert();
      if (interaction?.leftPegChassis) {
        _vec3B.copy(interaction.leftPegChassis);
      } else {
        _vec3B.set(-0.185, 0.252, -0.05);
      }
      _vec3B.applyMatrix4(_mat4B);
      const lLegIK = solveLegIK(-1, rig.leftLegPivot.position, _vec3B);
      lLegRx = lLegIK.legRx;
      lLegRy = lLegIK.legRy;
      lLegRz = lLegIK.legRz;
      lKneeRx = lLegIK.kneeRx;

      if (interaction?.rightPegChassis) {
        _vec3B.copy(interaction.rightPegChassis);
      } else {
        _vec3B.set(0.185, 0.252, -0.05);
      }
      _vec3B.applyMatrix4(_mat4B);
      const rLegIK = solveLegIK(1, rig.rightLegPivot.position, _vec3B);
      rLegRx = rLegIK.legRx;
      rLegRy = rLegIK.legRy;
      rLegRz = rLegIK.legRz;
      rKneeRx = rLegIK.kneeRx;
    }

    rig.headPivot.rotation.x = THREE.MathUtils.lerp(
      rig.headPivot.rotation.x,
      headRx,
      k
    );
    rig.headPivot.rotation.y = THREE.MathUtils.lerp(
      rig.headPivot.rotation.y,
      headRy,
      k
    );
    rig.headPivot.rotation.z = THREE.MathUtils.lerp(
      rig.headPivot.rotation.z,
      headRz,
      k
    );

    rig.leftEarGroup.rotation.z = THREE.MathUtils.lerp(
      rig.leftEarGroup.rotation.z,
      earBob,
      k
    );
    rig.rightEarGroup.rotation.z = THREE.MathUtils.lerp(
      rig.rightEarGroup.rotation.z,
      -earBob,
      k
    );

    const kArm = pose === 'ride' ? 1 - Math.exp(-26 * dt) : k;
    rig.leftArmPivot.rotation.x = lerpAngle(
      rig.leftArmPivot.rotation.x,
      lArmRx,
      kArm
    );
    rig.leftArmPivot.rotation.y = lerpAngle(
      rig.leftArmPivot.rotation.y,
      lArmRy,
      kArm
    );
    rig.leftArmPivot.rotation.z = lerpAngle(
      rig.leftArmPivot.rotation.z,
      lArmRz,
      kArm
    );
    rig.leftForearmPivot.rotation.x = THREE.MathUtils.lerp(
      rig.leftForearmPivot.rotation.x,
      lForeRx,
      kArm
    );
    rig.leftForearmPivot.rotation.z = THREE.MathUtils.lerp(
      rig.leftForearmPivot.rotation.z,
      lForeRz,
      kArm
    );

    rig.rightArmPivot.rotation.x = lerpAngle(
      rig.rightArmPivot.rotation.x,
      rArmRx,
      kArm
    );
    rig.rightArmPivot.rotation.y = lerpAngle(
      rig.rightArmPivot.rotation.y,
      rArmRy,
      kArm
    );
    rig.rightArmPivot.rotation.z = lerpAngle(
      rig.rightArmPivot.rotation.z,
      rArmRz,
      kArm
    );
    rig.rightForearmPivot.rotation.x = THREE.MathUtils.lerp(
      rig.rightForearmPivot.rotation.x,
      rForeRx,
      kArm
    );
    rig.rightForearmPivot.rotation.z = THREE.MathUtils.lerp(
      rig.rightForearmPivot.rotation.z,
      rForeRz,
      kArm
    );

    const kLeg = pose === 'ride' ? 1 - Math.exp(-22 * dt) : k;
    rig.leftLegPivot.rotation.x = lerpAngle(
      rig.leftLegPivot.rotation.x,
      lLegRx,
      kLeg
    );
    rig.leftLegPivot.rotation.y = lerpAngle(
      rig.leftLegPivot.rotation.y,
      lLegRy,
      kLeg
    );
    rig.leftLegPivot.rotation.z = lerpAngle(
      rig.leftLegPivot.rotation.z,
      lLegRz,
      kLeg
    );
    rig.rightLegPivot.rotation.x = lerpAngle(
      rig.rightLegPivot.rotation.x,
      rLegRx,
      kLeg
    );
    rig.rightLegPivot.rotation.y = lerpAngle(
      rig.rightLegPivot.rotation.y,
      rLegRy,
      kLeg
    );
    rig.rightLegPivot.rotation.z = lerpAngle(
      rig.rightLegPivot.rotation.z,
      rLegRz,
      kLeg
    );
    rig.leftKneePivot.rotation.x = THREE.MathUtils.lerp(
      rig.leftKneePivot.rotation.x,
      lKneeRx,
      kLeg
    );
    rig.rightKneePivot.rotation.x = THREE.MathUtils.lerp(
      rig.rightKneePivot.rotation.x,
      rKneeRx,
      kLeg
    );

    // Reveal internal copper armature only when exploded slider > 0.015
    const showArmature = exploded > 0.015;
    for (let i = 0; i < rig.armatureParts.length; i++) {
      rig.armatureParts[i].visible = showArmature;
    }

    // Exploded view layer separation
    for (let i = 0; i < rig.explodables.length; i++) {
      const item = rig.explodables[i];
      _vec3A.copy(item.restPos).addScaledVector(item.explodeDir, exploded);
      item.object.position.copy(_vec3A);
    }

    // Hide tail when user disabled it OR while riding motorcycle
    const shouldShowTail = (interaction?.showTail ?? false) && pose !== 'ride';
    rig.tailGroup.visible = shouldShowTail;

    // Subtle organic tail wave (zero GC)
    if (pose !== 'tpose' && rig.tailGroup.visible) {
      const posAttr = rig.tailMesh.geometry.attributes
        .position as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      const rest = rig.tailRestPositions;
      const waveAmp =
        pose === 'run' ? 0.065 : pose === 'jump' ? 0.04 : 0.016;
      const waveFreq = pose === 'run' ? 10.5 : 1.8;

      for (let i = 0; i < arr.length; i += 3) {
        const z = rest[i + 2];
        const factor = Math.min(1, Math.abs(z) / 0.78);
        arr[i] =
          rest[i] + Math.sin(phase * waveFreq + z * 5.0) * waveAmp * factor;
        arr[i + 1] =
          rest[i + 1] +
          Math.max(0, Math.cos(phase * waveFreq + z * 4.0) * waveAmp * 0.45) *
            factor;
      }
      posAttr.needsUpdate = true;
    }
  };

  return {
    group,
    exportRoot,
    leftHandAnchor: figures[0].leftHandAnchor,
    rightHandAnchor: figures[0].rightHandAnchor,
    update: (elapsed, delta, pose, targetExploded, interaction) => {
      const dt = Math.min(delta, 0.05);
      currentExploded = THREE.MathUtils.damp(
        currentExploded,
        targetExploded,
        8,
        dt
      );
      for (let i = 0; i < figures.length; i++) {
        updateSingleRig(
          figures[i],
          elapsed,
          dt,
          pose,
          currentExploded,
          i * 1.4,
          0,
          interaction
        );
      }
    },
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
    getStats: () => {
      let triangles = 0;
      exportRoot.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          const idx = mesh.geometry.index;
          const pos = mesh.geometry.attributes.position;
          const baseTris = idx
            ? idx.count / 3
            : pos
              ? pos.count / 3
              : 0;
          if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
            triangles += baseTris * (mesh as THREE.InstancedMesh).count;
          } else {
            triangles += baseTris;
          }
        }
      });
      return {
        triangles: Math.round(triangles),
        parts: figures.reduce((acc, f) => acc + f.partCount, 0),
        fibers: figures.reduce((acc, f) => acc + f.fiberCount, 0),
      };
    },
  };
}
