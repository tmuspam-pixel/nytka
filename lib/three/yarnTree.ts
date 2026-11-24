import * as THREE from 'three';
import {
  createTreeBarkTextureSet,
  createTreeFoliageTextureSet,
  TreeTextureSet,
} from './yarnTextures';

export type YarnTreeVariant = 'spruce' | 'pine' | 'birch';

export interface YarnTreeOptions {
  variant?: YarnTreeVariant;
  barkVariant?: 'spruce' | 'birch';
  foliageColor?: string;
  foliageSheenColor?: string;
  scale?: number;
  seed?: number;
  maxAnisotropy?: number;
  /** Optional shared resources supplied by buildYarnForest to avoid duplicate CanvasTextures */
  sharedResources?: {
    barkMat?: THREE.MeshStandardMaterial;
    foliageMat?: THREE.MeshPhysicalMaterial;
    mossMat?: THREE.MeshStandardMaterial;
    coneMat?: THREE.MeshStandardMaterial;
    yarnAccentMat?: THREE.MeshPhysicalMaterial;
  };
}

export interface YarnTreeInstance {
  group: THREE.Group;
  exportRoot: THREE.Group;
  update: (elapsedTime: number) => void;
  getStats: () => { triangles: number; parts: number };
  dispose: () => void;
}

export interface YarnForestOptions {
  groundY?: number;
  maxAnisotropy?: number;
}

export interface YarnForestInstance {
  group: THREE.Group;
  trees: YarnTreeInstance[];
  update: (elapsedTime: number) => void;
  getStats: () => { triangles: number; parts: number };
  dispose: () => void;
}

function seededRand(seed: number): () => number {
  let s = (Math.floor(seed * 9973) + 12345) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function createTaperedTubeGeometry(
  curve: THREE.CatmullRomCurve3,
  tubularSegments: number,
  radialSegments: number,
  radiusFn: (t: number, angle: number) => number
): THREE.BufferGeometry {
  const frames = curve.computeFrenetFrames(tubularSegments, false);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const P = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();
  const vPos = new THREE.Vector3();

  for (let i = 0; i <= tubularSegments; i++) {
    const t = i / tubularSegments;
    curve.getPointAt(t, P);
    N.copy(frames.normals[i]);
    B.copy(frames.binormals[i]);

    for (let j = 0; j <= radialSegments; j++) {
      const u = j / radialSegments;
      const angle = u * Math.PI * 2;
      const r = radiusFn(t, angle);

      const sin = Math.sin(angle);
      const cos = -Math.cos(angle);

      const nx = cos * N.x + sin * B.x;
      const ny = cos * N.y + sin * B.y;
      const nz = cos * N.z + sin * B.z;

      vPos.set(P.x + r * nx, P.y + r * ny, P.z + r * nz);
      positions.push(vPos.x, vPos.y, vPos.z);
      normals.push(nx, ny, nz);
      uvs.push(u, t);
    }
  }

  for (let j = 1; j <= tubularSegments; j++) {
    for (let i = 1; i <= radialSegments; i++) {
      const a = (radialSegments + 1) * (j - 1) + (i - 1);
      const b = (radialSegments + 1) * j + (i - 1);
      const c = (radialSegments + 1) * j + i;
      const d = (radialSegments + 1) * (j - 1) + i;
      indices.push(a, b, d, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setIndex(indices);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds an organic scalloped evergreen tier with ruffled wool-felt edges
 * (bottom rim sits at y = 0, peak at y = height).
 */
function createEvergreenTierGeometry(
  radius: number,
  height: number,
  radialSegments = 24,
  heightSegments = 8,
  seed = 1
): THREE.BufferGeometry {
  const geo = new THREE.ConeGeometry(
    radius,
    height,
    radialSegments,
    heightSegments,
    false
  );
  // Shift so bottom sits at y = 0
  geo.translate(0, height * 0.5, 0);

  const pos = geo.attributes.position;
  const lobes = 7 + Math.floor((seed * 5) % 4);
  const phase = seed * 2.17;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const t = Math.max(0, Math.min(1, y / height));
    const r = Math.hypot(x, z);
    if (r > 0.001) {
      const ang = Math.atan2(z, x);
      const scallop =
        1 +
        0.13 * Math.sin(ang * lobes + phase + t * 1.8) * (1 - t * 0.72) +
        0.06 * Math.cos(ang * (lobes + 3) - phase);
      const droop = -0.055 * height * (1 - t) * (0.5 + 0.5 * Math.sin(ang * lobes + phase));
      pos.setXYZ(i, x * scallop, Math.max(0, y + droop), z * scallop);
    }
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function createFoliageBlobGeometry(
  radius: number,
  seed: number
): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(radius, 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n =
      1 +
      0.16 *
        Math.sin(x * 7.5 + seed * 3.1) *
        Math.cos(y * 6.5 - seed * 1.9) *
        Math.sin(z * 7.0 + seed * 2.7);
    pos.setXYZ(i, x * n * 1.08, y * n * 0.84, z * n * 1.04);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a composite multi-part procedural Nordic craft tree (trunk, flared roots,
 * branches, moss collar, sculpted foliage tiers/clusters, and craft accents).
 * Pivot is anchored at bottom-center (y = 0) so the tree sits flush on the ground.
 */
export function buildYarnTree(options: YarnTreeOptions = {}): YarnTreeInstance {
  const variant: YarnTreeVariant = options.variant ?? 'spruce';
  const barkVariant: 'spruce' | 'birch' =
    options.barkVariant ?? (variant === 'birch' ? 'birch' : 'spruce');
  const foliageColor =
    options.foliageColor ??
    (variant === 'birch' ? '#4a7a47' : variant === 'pine' ? '#2c5942' : '#2e553b');
  const foliageSheenColor =
    options.foliageSheenColor ??
    (variant === 'birch' ? '#a5d48e' : '#7eb88c');
  const scale = options.scale ?? 1.0;
  const seed = options.seed ?? 1.0;
  const maxAnisotropy = options.maxAnisotropy ?? 4;
  const rand = seededRand(seed);

  const ownedDisposables: Array<{ dispose: () => void }> = [];
  const ownedGeos: THREE.BufferGeometry[] = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    ownedGeos.push(g);
    return g;
  };

  let barkMat = options.sharedResources?.barkMat;
  if (!barkMat) {
    const barkTex: TreeTextureSet = createTreeBarkTextureSet(
      barkVariant,
      2,
      3,
      maxAnisotropy
    );
    ownedDisposables.push(barkTex);
    barkMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: barkTex.map,
      bumpMap: barkTex.bumpMap,
      bumpScale: barkVariant === 'birch' ? 0.028 : 0.048,
      roughnessMap: barkTex.roughnessMap,
      roughness: 0.94,
      metalness: 0.02,
    });
    ownedDisposables.push(barkMat);
  }

  let foliageMat = options.sharedResources?.foliageMat;
  if (!foliageMat) {
    const folTex: TreeTextureSet = createTreeFoliageTextureSet(
      foliageColor,
      4,
      3,
      maxAnisotropy
    );
    ownedDisposables.push(folTex);
    foliageMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: folTex.map,
      bumpMap: folTex.bumpMap,
      bumpScale: 0.032,
      roughnessMap: folTex.roughnessMap,
      roughness: 0.88,
      metalness: 0.0,
      sheen: 0.85,
      sheenRoughness: 0.78,
      sheenColor: new THREE.Color(foliageSheenColor),
    });
    ownedDisposables.push(foliageMat);
  }

  let mossMat = options.sharedResources?.mossMat;
  if (!mossMat) {
    mossMat = new THREE.MeshStandardMaterial({
      color: 0x3b5835,
      roughness: 0.96,
      metalness: 0.0,
    });
    ownedDisposables.push(mossMat);
  }

  let coneMat = options.sharedResources?.coneMat;
  if (!coneMat) {
    coneMat = new THREE.MeshStandardMaterial({
      color: 0x7b5235,
      roughness: 0.84,
      metalness: 0.04,
    });
    ownedDisposables.push(coneMat);
  }

  let yarnAccentMat = options.sharedResources?.yarnAccentMat;
  if (!yarnAccentMat) {
    yarnAccentMat = new THREE.MeshPhysicalMaterial({
      color: 0xc93838,
      roughness: 0.9,
      sheen: 0.9,
      sheenColor: new THREE.Color('#ff9b8f'),
    });
    ownedDisposables.push(yarnAccentMat);
  }

  const group = new THREE.Group();
  group.name = `YarnTree_${variant}`;
  group.scale.setScalar(scale);

  // Sway pivot near ground base so trunk & crown bend organically in wind
  const swayGroup = new THREE.Group();
  swayGroup.name = 'TreeSwayRig';
  group.add(swayGroup);

  const trunkHeight =
    variant === 'pine' ? 1.55 : variant === 'birch' ? 1.38 : 1.42;
  const leanX = (rand() - 0.5) * 0.09;
  const leanZ = (rand() - 0.5) * 0.09;

  // 1. Primary furrowed bark trunk with flared root collar
  const trunkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.01, 0),
    new THREE.Vector3(leanX * 0.35, trunkHeight * 0.3, leanZ * 0.35),
    new THREE.Vector3(leanX * 0.85, trunkHeight * 0.65, leanZ * 0.85),
    new THREE.Vector3(leanX * 0.55, trunkHeight, leanZ * 0.55),
  ]);

  const baseRadius = variant === 'birch' ? 0.072 : 0.092;
  const trunkGeo = trackGeo(
    createTaperedTubeGeometry(trunkCurve, 22, 14, (t, angle) => {
      const flare = Math.exp(-t * 9.0) * 0.046 * (1 + 0.25 * Math.sin(angle * 4 + seed));
      const taper = baseRadius * (1 - t * 0.72);
      return Math.max(0.018, taper + flare);
    })
  );
  const trunkMesh = new THREE.Mesh(trunkGeo, barkMat);
  trunkMesh.castShadow = true;
  trunkMesh.receiveShadow = true;
  swayGroup.add(trunkMesh);

  // 2. Mossy collar & exposed buttress roots anchored flush to ground (y = 0)
  const rootCount = 4;
  for (let r = 0; r < rootCount; r++) {
    const ang = (r / rootCount) * Math.PI * 2 + rand() * 0.45;
    const reach = 0.16 + rand() * 0.07;
    const rootCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(ang) * 0.045, 0.11, Math.sin(ang) * 0.045),
      new THREE.Vector3(
        Math.cos(ang) * reach * 0.55,
        0.042,
        Math.sin(ang) * reach * 0.55
      ),
      new THREE.Vector3(Math.cos(ang) * reach, 0.008, Math.sin(ang) * reach),
    ]);
    const rootGeo = trackGeo(
      createTaperedTubeGeometry(rootCurve, 10, 8, (t) => 0.036 * (1 - t * 0.68))
    );
    const rootMesh = new THREE.Mesh(rootGeo, barkMat);
    rootMesh.castShadow = true;
    rootMesh.receiveShadow = true;
    group.add(rootMesh);
  }

  const mossPadGeo = trackGeo(new THREE.CylinderGeometry(0.115, 0.15, 0.038, 12));
  const mossPad = new THREE.Mesh(mossPadGeo, mossMat);
  mossPad.position.y = 0.018;
  mossPad.scale.set(1.06, 1, 0.94);
  mossPad.receiveShadow = true;
  group.add(mossPad);

  if (variant === 'birch') {
    // 3. Forked birch boughs & secondary twigs
    const boughAngles = [0.2, 2.25, 4.35];
    boughAngles.forEach((bAng, bIdx) => {
      const startY = 0.72 + bIdx * 0.14;
      const p0 = trunkCurve.getPointAt(startY / trunkHeight);
      const bLen = 0.28 + rand() * 0.08;
      const bCurve = new THREE.CatmullRomCurve3([
        p0,
        new THREE.Vector3(
          p0.x + Math.cos(bAng) * bLen * 0.5,
          p0.y + 0.16,
          p0.z + Math.sin(bAng) * bLen * 0.5
        ),
        new THREE.Vector3(
          p0.x + Math.cos(bAng) * bLen,
          p0.y + 0.34,
          p0.z + Math.sin(bAng) * bLen
        ),
      ]);
      const bGeo = trackGeo(
        createTaperedTubeGeometry(bCurve, 10, 8, (t) => 0.032 * (1 - t * 0.6))
      );
      const bMesh = new THREE.Mesh(bGeo, barkMat);
      bMesh.castShadow = true;
      swayGroup.add(bMesh);
    });

    // 4. Layered organic felt foliage canopy puffs
    const canopyDefs = [
      { x: 0, y: 1.24, z: 0, r: 0.31 },
      { x: 0.21, y: 1.08, z: 0.08, r: 0.24 },
      { x: -0.2, y: 1.12, z: 0.12, r: 0.23 },
      { x: 0.04, y: 1.04, z: -0.21, r: 0.24 },
      { x: 0.02, y: 1.44, z: 0.02, r: 0.21 },
    ];
    canopyDefs.forEach((c, cIdx) => {
      const blobGeo = trackGeo(createFoliageBlobGeometry(c.r, seed + cIdx * 1.7));
      const blob = new THREE.Mesh(blobGeo, foliageMat);
      blob.position.set(c.x + leanX * 0.5, c.y, c.z + leanZ * 0.5);
      blob.rotation.y = rand() * Math.PI * 2;
      blob.castShadow = true;
      blob.receiveShadow = true;
      swayGroup.add(blob);
    });

    // 5. Craft detail: tiny red yarn strand tied around lower trunk
    const tieCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.065, 0.42, 0.0),
      new THREE.Vector3(0.0, 0.415, 0.068),
      new THREE.Vector3(-0.065, 0.425, 0.0),
      new THREE.Vector3(0.0, 0.43, -0.068),
      new THREE.Vector3(0.065, 0.42, 0.0),
    ]);
    const tieGeo = trackGeo(new THREE.TubeGeometry(tieCurve, 20, 0.011, 6, true));
    const tieMesh = new THREE.Mesh(tieGeo, yarnAccentMat);
    swayGroup.add(tieMesh);
  } else {
    // Spruce or Pine: lower woody side branches + scalloped layered wool-felt crown tiers + cones
    const tierCount = variant === 'pine' ? 4 : 4;
    const startY = variant === 'pine' ? 0.54 : 0.44;
    const totalCrownH = variant === 'pine' ? 1.12 : 1.08;

    // 3 visible wooden side limbs peeking under lower tiers
    for (let b = 0; b < 3; b++) {
      const ang = b * 2.1 + seed;
      const limbY = startY + b * 0.21;
      const p0 = trunkCurve.getPointAt(Math.min(0.85, limbY / trunkHeight));
      const limbCurve = new THREE.CatmullRomCurve3([
        p0,
        new THREE.Vector3(
          p0.x + Math.cos(ang) * 0.16,
          p0.y - 0.03,
          p0.z + Math.sin(ang) * 0.16
        ),
        new THREE.Vector3(
          p0.x + Math.cos(ang) * 0.27,
          p0.y - 0.04,
          p0.z + Math.sin(ang) * 0.27
        ),
      ]);
      const limbGeo = trackGeo(
        createTaperedTubeGeometry(limbCurve, 8, 6, (t) => 0.022 * (1 - t * 0.65))
      );
      const limb = new THREE.Mesh(limbGeo, barkMat);
      limb.castShadow = true;
      swayGroup.add(limb);
    }

    const coneGeo = trackGeo(new THREE.ConeGeometry(0.022, 0.065, 8));
    coneGeo.rotateX(Math.PI);

    for (let t = 0; t < tierCount; t++) {
      const frac = t / (tierCount - 1);
      const radius =
        (variant === 'pine' ? 0.42 : 0.47) * (1 - frac * 0.56);
      const tierH =
        (variant === 'pine' ? 0.38 : 0.44) * (1 - frac * 0.34);
      const yPos = startY + t * (totalCrownH / (tierCount + 0.35));

      const tierGeo = trackGeo(
        createEvergreenTierGeometry(radius, tierH, 24, 7, seed + t * 2.3)
      );
      const tierMesh = new THREE.Mesh(tierGeo, foliageMat);
      const trunkAtY = trunkCurve.getPointAt(Math.min(0.98, yPos / trunkHeight));
      tierMesh.position.set(trunkAtY.x, yPos, trunkAtY.z);
      tierMesh.rotation.y = rand() * Math.PI * 2;
      tierMesh.castShadow = true;
      tierMesh.receiveShadow = true;
      swayGroup.add(tierMesh);

      // Hang 2 decorative craft pinecones from lower 2 tiers
      if (t < 2) {
        for (let c = 0; c < 2; c++) {
          const cAng = (c * Math.PI + t * 1.4 + seed) % (Math.PI * 2);
          const cone = new THREE.Mesh(coneGeo, coneMat);
          cone.position.set(
            trunkAtY.x + Math.cos(cAng) * radius * 0.72,
            yPos - 0.025,
            trunkAtY.z + Math.sin(cAng) * radius * 0.72
          );
          cone.rotation.z = Math.cos(cAng) * 0.14;
          cone.castShadow = true;
          swayGroup.add(cone);
        }
      }
    }
  }

  let parts = 0;
  let triangles = 0;
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      parts += 1;
      const g = obj.geometry;
      if (g.index) triangles += g.index.count / 3;
      else if (g.attributes.position) triangles += g.attributes.position.count / 3;
    }
  });

  const swayPhase = seed * 1.9;
  const swaySpeed = 0.85 + (seed % 0.45);

  return {
    group,
    exportRoot: group,
    update(elapsedTime: number) {
      swayGroup.rotation.z = Math.sin(elapsedTime * swaySpeed + swayPhase) * 0.018;
      swayGroup.rotation.x = Math.cos(elapsedTime * swaySpeed * 0.75 + swayPhase) * 0.012;
    },
    getStats: () => ({ triangles: Math.round(triangles), parts }),
    dispose() {
      ownedGeos.forEach((g) => g.dispose());
      ownedDisposables.forEach((d) => d.dispose());
    },
  };
}

/**
 * Builds a curated Nordic woodland grove of several textured trees positioned around
 * the diorama perimeter with shared procedural bark & foliage texture sets.
 */
export function buildYarnForest(
  options: YarnForestOptions = {}
): YarnForestInstance {
  const groundY = options.groundY ?? -0.141;
  const maxAnisotropy = options.maxAnisotropy ?? 4;

  const group = new THREE.Group();
  group.name = 'YarnWoodlandGrove';

  // Shared texture sets & materials across all trees in the grove
  const spruceBarkTex = createTreeBarkTextureSet('spruce', 2, 3, maxAnisotropy);
  const birchBarkTex = createTreeBarkTextureSet('birch', 2, 3, maxAnisotropy);
  const deepFoliageTex = createTreeFoliageTextureSet('#294f37', 4, 3, maxAnisotropy);
  const pineFoliageTex = createTreeFoliageTextureSet('#2f5d47', 4, 3, maxAnisotropy);
  const birchFoliageTex = createTreeFoliageTextureSet('#4c7844', 3, 3, maxAnisotropy);

  const spruceBarkMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: spruceBarkTex.map,
    bumpMap: spruceBarkTex.bumpMap,
    bumpScale: 0.05,
    roughnessMap: spruceBarkTex.roughnessMap,
    roughness: 0.94,
    metalness: 0.02,
  });

  const birchBarkMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: birchBarkTex.map,
    bumpMap: birchBarkTex.bumpMap,
    bumpScale: 0.028,
    roughnessMap: birchBarkTex.roughnessMap,
    roughness: 0.9,
    metalness: 0.02,
  });

  const makeFoliageMat = (tex: TreeTextureSet, sheenHex: string) =>
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: tex.map,
      bumpMap: tex.bumpMap,
      bumpScale: 0.032,
      roughnessMap: tex.roughnessMap,
      roughness: 0.88,
      metalness: 0.0,
      sheen: 0.85,
      sheenRoughness: 0.78,
      sheenColor: new THREE.Color(sheenHex),
    });

  const deepFoliageMat = makeFoliageMat(deepFoliageTex, '#78b587');
  const pineFoliageMat = makeFoliageMat(pineFoliageTex, '#8ac7a3');
  const birchFoliageMat = makeFoliageMat(birchFoliageTex, '#b3df94');

  const mossMat = new THREE.MeshStandardMaterial({
    color: 0x3b5835,
    roughness: 0.96,
    metalness: 0.0,
  });
  const coneMat = new THREE.MeshStandardMaterial({
    color: 0x7b5235,
    roughness: 0.84,
    metalness: 0.04,
  });
  const yarnAccentMat = new THREE.MeshPhysicalMaterial({
    color: 0xc93838,
    roughness: 0.9,
    sheen: 0.9,
    sheenColor: new THREE.Color('#ff9b8f'),
  });

  // Carefully placed outside the wooden plinth (radius 1.62) and clear of all camera presets
  const placements: Array<{
    x: number;
    z: number;
    ry: number;
    scale: number;
    variant: YarnTreeVariant;
    seed: number;
  }> = [
    { x: -2.05, z: -1.55, ry: 0.4, scale: 1.08, variant: 'spruce', seed: 1.2 },
    { x: -2.35, z: 0.45, ry: 1.8, scale: 0.96, variant: 'birch', seed: 2.7 },
    { x: 1.45, z: -2.1, ry: 2.6, scale: 1.16, variant: 'pine', seed: 3.9 },
    { x: -0.3, z: -2.75, ry: 0.9, scale: 1.24, variant: 'spruce', seed: 5.1 },
    { x: 2.35, z: -1.1, ry: 4.1, scale: 0.92, variant: 'birch', seed: 6.4 },
    { x: -1.7, z: 1.8, ry: 5.2, scale: 0.86, variant: 'spruce', seed: 7.8 },
  ];

  const trees: YarnTreeInstance[] = placements.map((p) => {
    const isBirch = p.variant === 'birch';
    const tree = buildYarnTree({
      variant: p.variant,
      scale: p.scale,
      seed: p.seed,
      maxAnisotropy,
      sharedResources: {
        barkMat: isBirch ? birchBarkMat : spruceBarkMat,
        foliageMat:
          isBirch
            ? birchFoliageMat
            : p.variant === 'pine'
              ? pineFoliageMat
              : deepFoliageMat,
        mossMat,
        coneMat,
        yarnAccentMat,
      },
    });
    tree.group.position.set(p.x, groundY, p.z);
    tree.group.rotation.y = p.ry;
    group.add(tree.group);
    return tree;
  });

  return {
    group,
    trees,
    update(elapsedTime: number) {
      for (let i = 0; i < trees.length; i++) {
        trees[i].update(elapsedTime);
      }
    },
    getStats() {
      let triangles = 0;
      let parts = 0;
      for (let i = 0; i < trees.length; i++) {
        const s = trees[i].getStats();
        triangles += s.triangles;
        parts += s.parts;
      }
      return { triangles, parts };
    },
    dispose() {
      trees.forEach((t) => t.dispose());
      spruceBarkTex.dispose();
      birchBarkTex.dispose();
      deepFoliageTex.dispose();
      pineFoliageTex.dispose();
      birchFoliageTex.dispose();
      spruceBarkMat.dispose();
      birchBarkMat.dispose();
      deepFoliageMat.dispose();
      pineFoliageMat.dispose();
      birchFoliageMat.dispose();
      mossMat.dispose();
      coneMat.dispose();
      yarnAccentMat.dispose();
    },
  };
}
