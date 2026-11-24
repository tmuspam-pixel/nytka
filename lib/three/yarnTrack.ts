import * as THREE from 'three';
import { ObstacleType, TrackSurfaceId } from './types';
import {
  createCircularMotoTrackTextureSet,
  createMotoTrackTextureSet,
  createTreeBarkTextureSet,
  createTwistedYarnTextureSet,
  TreeTextureSet,
} from './yarnTextures';

export interface TrackObstacleOptions {
  type?: ObstacleType;
  scale?: number;
  maxAnisotropy?: number;
  sharedResources?: {
    rampMat?: THREE.MeshStandardMaterial;
    barkMat?: THREE.MeshStandardMaterial;
    yarnRedMat?: THREE.MeshPhysicalMaterial;
    yarnCreamMat?: THREE.MeshPhysicalMaterial;
    tireMat?: THREE.MeshPhysicalMaterial;
    copperMat?: THREE.MeshStandardMaterial;
    woodDarkMat?: THREE.MeshStandardMaterial;
  };
}

export interface TrackObstacleInstance {
  group: THREE.Group;
  exportRoot: THREE.Group;
  update: (elapsedTime: number) => void;
  getStats: () => { triangles: number; parts: number };
  dispose: () => void;
}

export interface MotoTrackCourseOptions {
  groundY?: number;
  surface?: TrackSurfaceId;
  maxAnisotropy?: number;
}

export interface MotoTrackCourseInstance {
  group: THREE.Group;
  trackRingGroup: THREE.Group;
  obstaclesGroup: THREE.Group;
  setSurface: (surface: TrackSurfaceId) => void;
  update: (elapsedTime: number) => void;
  getStats: () => { triangles: number; parts: number };
  dispose: () => void;
}

/**
 * Builds a composite multi-part Unravel 2 craft motocross obstacle.
 * Pivot is anchored at bottom-center (y = 0) so it sits flush on any terrain/track.
 */
export function buildTrackObstacle(
  options: TrackObstacleOptions = {}
): TrackObstacleInstance {
  const type: ObstacleType = options.type ?? 'ramp';
  const scale = options.scale ?? 1.0;
  const maxAnisotropy = options.maxAnisotropy ?? 4;

  const ownedDisposables: Array<{ dispose: () => void }> = [];
  const ownedGeos: THREE.BufferGeometry[] = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    ownedGeos.push(g);
    return g;
  };

  let rampMat = options.sharedResources?.rampMat;
  if (!rampMat) {
    const rampTex = createMotoTrackTextureSet('wood_ramp', 1, 1, maxAnisotropy);
    ownedDisposables.push(rampTex);
    rampMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: rampTex.map,
      bumpMap: rampTex.bumpMap,
      bumpScale: 0.025,
      roughnessMap: rampTex.roughnessMap,
      roughness: 0.85,
      metalness: 0.04,
    });
    ownedDisposables.push(rampMat);
  }

  let barkMat = options.sharedResources?.barkMat;
  if (!barkMat) {
    const barkTex = createTreeBarkTextureSet('spruce', 2, 2, maxAnisotropy);
    ownedDisposables.push(barkTex);
    barkMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: barkTex.map,
      bumpMap: barkTex.bumpMap,
      bumpScale: 0.045,
      roughnessMap: barkTex.roughnessMap,
      roughness: 0.94,
      metalness: 0.02,
    });
    ownedDisposables.push(barkMat);
  }

  let yarnRedMat = options.sharedResources?.yarnRedMat;
  if (!yarnRedMat) {
    const tex = createTwistedYarnTextureSet('#c93838', 5, 2, maxAnisotropy);
    ownedDisposables.push(tex);
    yarnRedMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: tex.map,
      bumpMap: tex.bumpMap,
      bumpScale: 0.035,
      roughnessMap: tex.roughnessMap,
      roughness: 0.92,
      sheen: 1.0,
      sheenRoughness: 0.82,
      sheenColor: new THREE.Color('#ff9b8f'),
    });
    ownedDisposables.push(yarnRedMat);
  }

  let yarnCreamMat = options.sharedResources?.yarnCreamMat;
  if (!yarnCreamMat) {
    const tex = createTwistedYarnTextureSet('#ded0b8', 5, 2, maxAnisotropy);
    ownedDisposables.push(tex);
    yarnCreamMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: tex.map,
      bumpMap: tex.bumpMap,
      bumpScale: 0.032,
      roughnessMap: tex.roughnessMap,
      roughness: 0.92,
      sheen: 0.95,
      sheenRoughness: 0.82,
      sheenColor: new THREE.Color('#fff7eb'),
    });
    ownedDisposables.push(yarnCreamMat);
  }

  let tireMat = options.sharedResources?.tireMat;
  if (!tireMat) {
    tireMat = new THREE.MeshPhysicalMaterial({
      color: 0x22252b,
      roughness: 0.95,
      metalness: 0.04,
      sheen: 0.55,
      sheenColor: new THREE.Color('#6f7785'),
    });
    ownedDisposables.push(tireMat);
  }

  let copperMat = options.sharedResources?.copperMat;
  if (!copperMat) {
    copperMat = new THREE.MeshStandardMaterial({
      color: 0xc88f54,
      roughness: 0.28,
      metalness: 0.88,
    });
    ownedDisposables.push(copperMat);
  }

  let woodDarkMat = options.sharedResources?.woodDarkMat;
  if (!woodDarkMat) {
    woodDarkMat = new THREE.MeshStandardMaterial({
      color: 0x5c3f28,
      roughness: 0.86,
      metalness: 0.04,
    });
    ownedDisposables.push(woodDarkMat);
  }

  const group = new THREE.Group();
  group.name = `TrackObstacle_${type}`;
  group.scale.setScalar(scale);

  const animatedFlags: THREE.Mesh[] = [];

  if (type === 'ramp') {
    // 1. Sloped craft plank deck with chevron warning paint
    const deckGeo = trackGeo(new THREE.BoxGeometry(0.56, 0.038, 0.78));
    const deck = new THREE.Mesh(deckGeo, rampMat);
    deck.position.set(0, 0.145, 0);
    deck.rotation.x = -0.34;
    deck.castShadow = true;
    deck.receiveShadow = true;
    group.add(deck);

    // 2. Grounded side timber skids + vertical support struts
    const skidGeo = trackGeo(new THREE.BoxGeometry(0.045, 0.04, 0.76));
    const strutGeo = trackGeo(new THREE.BoxGeometry(0.045, 0.25, 0.045));
    const braceGeo = trackGeo(new THREE.CylinderGeometry(0.016, 0.016, 0.56, 8));
    braceGeo.rotateZ(Math.PI / 2);

    [-0.24, 0.24].forEach((sx) => {
      const skid = new THREE.Mesh(skidGeo, woodDarkMat);
      skid.position.set(sx, 0.02, 0.02);
      skid.castShadow = true;
      skid.receiveShadow = true;
      group.add(skid);

      const strut = new THREE.Mesh(strutGeo, woodDarkMat);
      strut.position.set(sx, 0.13, 0.34);
      strut.castShadow = true;
      group.add(strut);

      // Corner marker poles + knitted pennant flags
      const poleGeo = trackGeo(new THREE.CylinderGeometry(0.01, 0.012, 0.44, 8));
      const pole = new THREE.Mesh(poleGeo, copperMat);
      pole.position.set(sx * 1.12, 0.22, 0.36);
      pole.castShadow = true;
      group.add(pole);

      const flagGeo = trackGeo(new THREE.BoxGeometry(0.095, 0.055, 0.012));
      const flag = new THREE.Mesh(flagGeo, sx < 0 ? yarnRedMat : yarnCreamMat);
      flag.position.set(sx * 1.12 + (sx < 0 ? -0.045 : 0.045), 0.39, 0.36);
      flag.castShadow = true;
      group.add(flag);
      animatedFlags.push(flag);
    });

    const topBrace = new THREE.Mesh(braceGeo, barkMat);
    topBrace.position.set(0, 0.24, 0.34);
    topBrace.castShadow = true;
    group.add(topBrace);
  } else if (type === 'log_jump') {
    // 3 stacked bark-textured logs lashed together with knitted yarn cords
    const logGeo = trackGeo(new THREE.CylinderGeometry(0.095, 0.105, 0.82, 16));
    logGeo.rotateZ(Math.PI / 2);

    const logPositions: [number, number, number][] = [
      [0, 0.095, -0.09],
      [0, 0.095, 0.09],
      [0, 0.25, 0.0],
    ];
    logPositions.forEach(([lx, ly, lz], idx) => {
      const log = new THREE.Mesh(logGeo, barkMat);
      log.position.set(lx, ly, lz);
      log.rotation.y = (idx - 1) * 0.03;
      log.castShadow = true;
      log.receiveShadow = true;
      group.add(log);
    });

    // Twisted yarn lashing bands around both ends
    const lashGeo = trackGeo(new THREE.TorusGeometry(0.18, 0.02, 8, 22));
    lashGeo.rotateY(Math.PI / 2);
    [-0.27, 0.27].forEach((rx) => {
      const lash = new THREE.Mesh(lashGeo, yarnRedMat);
      lash.position.set(rx, 0.15, 0);
      lash.scale.set(1.05, 0.92, 1.15);
      lash.castShadow = true;
      group.add(lash);
    });

    // Timber chock wedges at bottom
    const chockGeo = trackGeo(new THREE.BoxGeometry(0.08, 0.055, 0.09));
    [-0.31, 0.31].forEach((cx) => {
      [-0.19, 0.19].forEach((cz) => {
        const chock = new THREE.Mesh(chockGeo, woodDarkMat);
        chock.position.set(cx, 0.027, cz);
        chock.castShadow = true;
        group.add(chock);
      });
    });
  } else if (type === 'tire_barrier') {
    // 3 chunky motocross tires with painted stripes & wooden anchor stakes
    const tireGeo = trackGeo(new THREE.TorusGeometry(0.16, 0.068, 14, 28));
    const lugGeo = trackGeo(new THREE.BoxGeometry(0.04, 0.04, 0.12));
    const stripeGeo = trackGeo(new THREE.TorusGeometry(0.162, 0.02, 8, 16, Math.PI * 0.65));

    const buildTire = (x: number, y: number, z: number, tiltX: number, ry: number, redStripe: boolean) => {
      const tGroup = new THREE.Group();
      const body = new THREE.Mesh(tireGeo, tireMat);
      body.castShadow = true;
      body.receiveShadow = true;
      tGroup.add(body);

      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const lug = new THREE.Mesh(lugGeo, tireMat);
        lug.position.set(Math.cos(a) * 0.215, Math.sin(a) * 0.215, 0);
        lug.rotation.z = a;
        tGroup.add(lug);
      }

      const stripe = new THREE.Mesh(stripeGeo, redStripe ? yarnRedMat : yarnCreamMat);
      stripe.position.z = 0.054;
      stripe.rotation.z = 0.6;
      tGroup.add(stripe);

      tGroup.position.set(x, y, z);
      tGroup.rotation.set(tiltX, ry, 0);
      group.add(tGroup);
    };

    buildTire(-0.21, 0.21, 0.03, -0.14, 0.22, true);
    buildTire(0.21, 0.21, 0.02, -0.16, -0.2, false);
    buildTire(0.0, 0.34, -0.09, -0.45, 0.05, true);

    // Grounded wooden stakes + tensioned yarn rope
    const stakeGeo = trackGeo(new THREE.CylinderGeometry(0.018, 0.022, 0.42, 8));
    [-0.42, 0.42].forEach((sx) => {
      const stake = new THREE.Mesh(stakeGeo, woodDarkMat);
      stake.position.set(sx, 0.21, 0.1);
      stake.castShadow = true;
      group.add(stake);
    });
    const cordCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.42, 0.34, 0.1),
      new THREE.Vector3(0, 0.28, 0.14),
      new THREE.Vector3(0.42, 0.34, 0.1),
    ]);
    group.add(
      new THREE.Mesh(
        trackGeo(new THREE.TubeGeometry(cordCurve, 18, 0.013, 6, false)),
        yarnRedMat
      )
    );
  } else if (type === 'spool_table') {
    // Classic Unravel 2 giant wooden thread spool obstacle + approach planks
    const flangeGeo = trackGeo(new THREE.CylinderGeometry(0.24, 0.24, 0.042, 24));
    flangeGeo.rotateZ(Math.PI / 2);
    [-0.22, 0.22].forEach((fx) => {
      const flange = new THREE.Mesh(flangeGeo, woodDarkMat);
      flange.position.set(fx, 0.24, 0);
      flange.castShadow = true;
      flange.receiveShadow = true;
      group.add(flange);

      const rim = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(0.18, 0.012, 8, 22)),
        copperMat
      );
      rim.rotation.y = Math.PI / 2;
      rim.position.set(fx + (fx < 0 ? -0.022 : 0.022), 0.24, 0);
      group.add(rim);
    });

    const coreGeo = trackGeo(new THREE.CylinderGeometry(0.155, 0.155, 0.4, 22));
    coreGeo.rotateZ(Math.PI / 2);
    const core = new THREE.Mesh(coreGeo, yarnRedMat);
    core.position.set(0, 0.24, 0);
    core.castShadow = true;
    core.receiveShadow = true;
    group.add(core);

    // Side plank bridge ramp leaning onto spool
    const bridgeGeo = trackGeo(new THREE.BoxGeometry(0.36, 0.032, 0.56));
    const bridge = new THREE.Mesh(bridgeGeo, rampMat);
    bridge.position.set(0, 0.145, 0.34);
    bridge.rotation.x = 0.48;
    bridge.castShadow = true;
    bridge.receiveShadow = true;
    group.add(bridge);
  } else {
    // 'slalom_gate': Grounded sleeper beam, twin birch poles, banner, and yarn marker cones
    const beamGeo = trackGeo(new THREE.BoxGeometry(0.92, 0.055, 0.14));
    const beam = new THREE.Mesh(beamGeo, barkMat);
    beam.position.set(0, 0.027, 0);
    beam.castShadow = true;
    beam.receiveShadow = true;
    group.add(beam);

    const postGeo = trackGeo(new THREE.CylinderGeometry(0.022, 0.026, 0.72, 10));
    const capGeo = trackGeo(new THREE.SphereGeometry(0.034, 12, 10));
    [-0.36, 0.36].forEach((px) => {
      const post = new THREE.Mesh(postGeo, woodDarkMat);
      post.position.set(px, 0.38, 0);
      post.rotation.z = px < 0 ? 0.05 : -0.05;
      post.castShadow = true;
      group.add(post);

      const cap = new THREE.Mesh(capGeo, copperMat);
      cap.position.set(px * 0.95, 0.74, 0);
      group.add(cap);
    });

    // Crossbar & craft pennant banner
    const barGeo = trackGeo(new THREE.CylinderGeometry(0.015, 0.015, 0.76, 8));
    barGeo.rotateZ(Math.PI / 2);
    const bar = new THREE.Mesh(barGeo, copperMat);
    bar.position.set(0, 0.68, 0);
    bar.castShadow = true;
    group.add(bar);

    const bannerGeo = trackGeo(new THREE.BoxGeometry(0.54, 0.12, 0.014));
    const banner = new THREE.Mesh(bannerGeo, yarnRedMat);
    banner.position.set(0, 0.6, 0);
    banner.castShadow = true;
    group.add(banner);
    animatedFlags.push(banner);

    const coneGeo = trackGeo(new THREE.ConeGeometry(0.065, 0.16, 12));
    [-0.5, 0.5].forEach((cx, i) => {
      const cone = new THREE.Mesh(coneGeo, i === 0 ? yarnRedMat : yarnCreamMat);
      cone.position.set(cx, 0.08, 0.16);
      cone.castShadow = true;
      group.add(cone);
    });
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

  return {
    group,
    exportRoot: group,
    update(elapsedTime: number) {
      for (let i = 0; i < animatedFlags.length; i++) {
        animatedFlags[i].rotation.y =
          Math.sin(elapsedTime * 3.2 + i * 1.4) * 0.12;
      }
    },
    getStats: () => ({ triangles: Math.round(triangles), parts }),
    dispose() {
      ownedGeos.forEach((g) => g.dispose());
      ownedDisposables.forEach((d) => d.dispose());
    },
  };
}

/**
 * Builds the circular textured motocross dirt track loop + 5 varied obstacles
 * placed around the diorama perimeter.
 */
export function buildMotoTrackCourse(
  options: MotoTrackCourseOptions = {}
): MotoTrackCourseInstance {
  const groundY = options.groundY ?? -0.141;
  const maxAnisotropy = options.maxAnisotropy ?? 4;
  let currentSurface: TrackSurfaceId = options.surface ?? 'moto_track';

  const group = new THREE.Group();
  group.name = 'MotoTrackCourse';

  const trackRingGroup = new THREE.Group();
  trackRingGroup.name = 'MotoTrackRing';
  group.add(trackRingGroup);

  const obstaclesGroup = new THREE.Group();
  obstaclesGroup.name = 'MotoTrackObstacles';
  group.add(obstaclesGroup);

  // Track ring surface (surrounding the central stage at groundY + 0.004 to avoid z-fighting)
  const mudRingTex: TreeTextureSet = createCircularMotoTrackTextureSet(
    'mud_ruts',
    maxAnisotropy
  );
  const gravelRingTex: TreeTextureSet = createCircularMotoTrackTextureSet(
    'gravel_berm',
    maxAnisotropy
  );

  // Use planar CircleGeometry UVs mapped across the full outer track loop (radius 3.25)
  const trackDiscGeo = new THREE.RingGeometry(1.58, 3.25, 72, 2);
  trackDiscGeo.rotateX(-Math.PI / 2);
  // Remap RingGeometry UVs to planar normalized [0..1] radial disc coordinates
  const posAttr = trackDiscGeo.attributes.position;
  const uvAttr = trackDiscGeo.attributes.uv;
  for (let i = 0; i < posAttr.count; i++) {
    const px = posAttr.getX(i);
    const pz = posAttr.getZ(i);
    uvAttr.setXY(i, 0.5 + px / 6.5, 0.5 + pz / 6.5);
  }
  uvAttr.needsUpdate = true;

  const trackMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: mudRingTex.map,
    bumpMap: mudRingTex.bumpMap,
    bumpScale: 0.045,
    roughnessMap: mudRingTex.roughnessMap,
    roughness: 0.92,
    metalness: 0.02,
  });

  const trackMesh = new THREE.Mesh(trackDiscGeo, trackMat);
  trackMesh.position.y = groundY + 0.004;
  trackMesh.receiveShadow = true;
  trackRingGroup.add(trackMesh);

  // Shared obstacle materials
  const rampTex = createMotoTrackTextureSet('wood_ramp', 1, 1, maxAnisotropy);
  const barkTex = createTreeBarkTextureSet('spruce', 2, 2, maxAnisotropy);
  const redYarnTex = createTwistedYarnTextureSet('#c93838', 5, 2, maxAnisotropy);
  const creamYarnTex = createTwistedYarnTextureSet('#ded0b8', 5, 2, maxAnisotropy);

  const sharedResources = {
    rampMat: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: rampTex.map,
      bumpMap: rampTex.bumpMap,
      bumpScale: 0.025,
      roughnessMap: rampTex.roughnessMap,
      roughness: 0.85,
      metalness: 0.04,
    }),
    barkMat: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: barkTex.map,
      bumpMap: barkTex.bumpMap,
      bumpScale: 0.045,
      roughnessMap: barkTex.roughnessMap,
      roughness: 0.94,
      metalness: 0.02,
    }),
    yarnRedMat: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: redYarnTex.map,
      bumpMap: redYarnTex.bumpMap,
      bumpScale: 0.035,
      roughnessMap: redYarnTex.roughnessMap,
      roughness: 0.92,
      sheen: 1.0,
      sheenRoughness: 0.82,
      sheenColor: new THREE.Color('#ff9b8f'),
    }),
    yarnCreamMat: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: creamYarnTex.map,
      bumpMap: creamYarnTex.bumpMap,
      bumpScale: 0.032,
      roughnessMap: creamYarnTex.roughnessMap,
      roughness: 0.92,
      sheen: 0.95,
      sheenRoughness: 0.82,
      sheenColor: new THREE.Color('#fff7eb'),
    }),
    tireMat: new THREE.MeshPhysicalMaterial({
      color: 0x22252b,
      roughness: 0.95,
      metalness: 0.04,
      sheen: 0.55,
      sheenColor: new THREE.Color('#6f7785'),
    }),
    copperMat: new THREE.MeshStandardMaterial({
      color: 0xc88f54,
      roughness: 0.28,
      metalness: 0.88,
    }),
    woodDarkMat: new THREE.MeshStandardMaterial({
      color: 0x5c3f28,
      roughness: 0.86,
      metalness: 0.04,
    }),
  };

  // Place 5 motocross obstacles around the outer track loop (clear of main camera sightlines)
  const coursePlacements: Array<{
    type: ObstacleType;
    x: number;
    z: number;
    ry: number;
    scale: number;
  }> = [
    { type: 'ramp', x: -1.85, z: -0.72, ry: 0.38, scale: 0.92 },
    { type: 'log_jump', x: 1.98, z: 0.92, ry: -1.1, scale: 0.9 },
    { type: 'tire_barrier', x: -0.82, z: -2.18, ry: 0.35, scale: 0.92 },
    { type: 'spool_table', x: 1.95, z: -1.35, ry: -0.65, scale: 0.88 },
    { type: 'slalom_gate', x: -0.15, z: 2.25, ry: 0.08, scale: 0.86 },
  ];

  const obstacles = coursePlacements.map((p) => {
    const obs = buildTrackObstacle({
      type: p.type,
      scale: p.scale,
      maxAnisotropy,
      sharedResources,
    });
    obs.group.position.set(p.x, groundY + 0.004, p.z);
    obs.group.rotation.y = p.ry;
    obstaclesGroup.add(obs.group);
    return obs;
  });

  const applySurface = (surface: TrackSurfaceId) => {
    currentSurface = surface;
    const tex = surface === 'gravel' ? gravelRingTex : mudRingTex;
    trackMat.map = tex.map;
    trackMat.bumpMap = tex.bumpMap;
    trackMat.roughnessMap = tex.roughnessMap;
    trackMat.needsUpdate = true;
    trackRingGroup.visible = surface !== 'oak';
  };
  applySurface(currentSurface);

  return {
    group,
    trackRingGroup,
    obstaclesGroup,
    setSurface: applySurface,
    update(elapsedTime: number) {
      for (let i = 0; i < obstacles.length; i++) {
        obstacles[i].update(elapsedTime);
      }
    },
    getStats() {
      let triangles = 0;
      let parts = 0;
      if (trackRingGroup.visible) {
        parts += 1;
        triangles += trackDiscGeo.index ? trackDiscGeo.index.count / 3 : 0;
      }
      if (obstaclesGroup.visible) {
        for (let i = 0; i < obstacles.length; i++) {
          const s = obstacles[i].getStats();
          triangles += s.triangles;
          parts += s.parts;
        }
      }
      return { triangles: Math.round(triangles), parts };
    },
    dispose() {
      obstacles.forEach((o) => o.dispose());
      trackDiscGeo.dispose();
      trackMat.dispose();
      mudRingTex.dispose();
      gravelRingTex.dispose();
      rampTex.dispose();
      barkTex.dispose();
      redYarnTex.dispose();
      creamYarnTex.dispose();
      Object.values(sharedResources).forEach((m) => m.dispose());
    },
  };
}
