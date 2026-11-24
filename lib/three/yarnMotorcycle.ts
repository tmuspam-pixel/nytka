import * as THREE from 'three';
import {
  createKnitCoreTextureSet,
  createTwistedYarnTextureSet,
  YarnTextureSet,
} from './yarnTextures';

export interface YarnMotorcycleOptions {
  color: string;
  sheenColor: string;
  accentColor?: string;
  yarnThickness?: number;
  fuzzDensity?: number;
  maxAnisotropy?: number;
}

export interface YarnMotorcycleAnchors {
  seatLocal: THREE.Vector3;
  leftGripObj: THREE.Object3D;
  rightGripObj: THREE.Object3D;
  leftPegLocal: THREE.Vector3;
  rightPegLocal: THREE.Vector3;
}

export interface YarnMotorcycleInstance {
  group: THREE.Group;
  exportRoot: THREE.Group;
  chassisGroup: THREE.Group;
  forkPivot: THREE.Group;
  anchors: YarnMotorcycleAnchors;
  update: (
    elapsed: number,
    delta: number,
    speed: number,
    steer: number,
    isRiding: boolean
  ) => void;
  dispose: () => void;
  getStats: () => { triangles: number; parts: number };
}

/**
 * Builds a handcrafted knitted-yarn & craft-wire motorcycle in the Unravel 2 style.
 * Bottom-center pivot sits flush on y = 0. Faces +Z by default.
 */
export function buildYarnMotorcycle(
  options: YarnMotorcycleOptions
): YarnMotorcycleInstance {
  const {
    color,
    sheenColor,
    accentColor = '#8f522e',
    yarnThickness = 1.0,
    fuzzDensity = 0.85,
    maxAnisotropy = 4,
  } = options;

  const group = new THREE.Group();
  group.name = 'YarnMotorcycle';

  const exportRoot = new THREE.Group();
  exportRoot.name = 'YarnMotorcycleExport';
  group.add(exportRoot);

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: YarnTextureSet[] = [];
  let partCount = 0;

  const bodyYarnTex = createTwistedYarnTextureSet(color, 7, 2, maxAnisotropy);
  const tankKnitTex = createKnitCoreTextureSet(color, 5, 4, maxAnisotropy);
  const tireYarnTex = createTwistedYarnTextureSet('#22242a', 12, 2, maxAnisotropy);
  const saddleKnitTex = createKnitCoreTextureSet(accentColor, 5, 4, maxAnisotropy);
  const trimKnitTex = createKnitCoreTextureSet('#d8cab2', 5, 4, maxAnisotropy);
  textures.push(bodyYarnTex, tankKnitTex, tireYarnTex, saddleKnitTex, trimKnitTex);

  const bodyYarnMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: bodyYarnTex.map,
    bumpMap: bodyYarnTex.bumpMap,
    bumpScale: 0.038,
    roughnessMap: bodyYarnTex.roughnessMap,
    roughness: 0.92,
    metalness: 0.0,
    sheen: 1.0,
    sheenRoughness: 0.82,
    sheenColor: new THREE.Color(sheenColor),
  });

  const tankKnitMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: tankKnitTex.map,
    bumpMap: tankKnitTex.bumpMap,
    bumpScale: 0.034,
    roughnessMap: tankKnitTex.roughnessMap,
    roughness: 0.94,
    metalness: 0.0,
    sheen: 1.0,
    sheenRoughness: 0.85,
    sheenColor: new THREE.Color(sheenColor),
  });

  const tireMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: tireYarnTex.map,
    bumpMap: tireYarnTex.bumpMap,
    bumpScale: 0.048,
    roughnessMap: tireYarnTex.roughnessMap,
    roughness: 0.95,
    metalness: 0.0,
    sheen: 0.65,
    sheenRoughness: 0.9,
    sheenColor: new THREE.Color('#707785'),
  });

  const saddleMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: saddleKnitTex.map,
    bumpMap: saddleKnitTex.bumpMap,
    bumpScale: 0.032,
    roughnessMap: saddleKnitTex.roughnessMap,
    roughness: 0.9,
    metalness: 0.0,
    sheen: 0.88,
    sheenRoughness: 0.82,
    sheenColor: new THREE.Color('#f7dfcb'),
  });

  const trimMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: trimKnitTex.map,
    bumpMap: trimKnitTex.bumpMap,
    bumpScale: 0.028,
    roughnessMap: trimKnitTex.roughnessMap,
    roughness: 0.93,
    metalness: 0.0,
    sheen: 0.85,
    sheenRoughness: 0.85,
    sheenColor: new THREE.Color('#fff5e6'),
  });

  const copperWireMat = new THREE.MeshStandardMaterial({
    color: 0xc88f54,
    roughness: 0.26,
    metalness: 0.88,
  });

  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x9aa3b0,
    roughness: 0.34,
    metalness: 0.84,
  });

  const woodHubMat = new THREE.MeshStandardMaterial({
    color: 0x6f4e37,
    roughness: 0.72,
    metalness: 0.04,
  });

  const headlightMat = new THREE.MeshPhysicalMaterial({
    color: 0xffe4a8,
    emissive: new THREE.Color(0xffb84d),
    emissiveIntensity: 0.78,
    roughness: 0.12,
    metalness: 0.05,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
  });

  const fuzzMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(sheenColor).lerp(new THREE.Color(color), 0.5),
    roughness: 0.97,
    metalness: 0.0,
  });

  materials.push(
    bodyYarnMat,
    tankKnitMat,
    tireMat,
    saddleMat,
    trimMat,
    copperWireMat,
    steelMat,
    woodHubMat,
    headlightMat,
    fuzzMat
  );

  // Chassis pivots around ground contact (0, 0, 0)
  const chassisGroup = new THREE.Group();
  chassisGroup.name = 'BikeChassis';
  exportRoot.add(chassisGroup);

  const tScale = yarnThickness;

  // Detailed handcrafted wheel: knitted tire + 14 yarn tread ribs + cream sidewall accent +
  // 12 cross-laced copper spokes + wooden bobbin hub + yarn center wrap + brake rotor
  const buildWheel = (radius: number, tubeRadius: number): THREE.Group => {
    const wheel = new THREE.Group();
    const coreR = radius - tubeRadius;

    // Main chunky dark knitted tire
    const tireGeo = new THREE.TorusGeometry(coreR, tubeRadius, 18, 44);
    tireGeo.rotateY(Math.PI / 2);
    geometries.push(tireGeo);
    const tireMesh = new THREE.Mesh(tireGeo, tireMat);
    tireMesh.castShadow = true;
    tireMesh.receiveShadow = true;
    wheel.add(tireMesh);

    // 14 raised yarn tread ribs wrapping around the tire (scrambler look!)
    const treadCount = 14;
    const treadGeo = new THREE.TorusGeometry(
      tubeRadius * 1.02,
      0.012 * tScale,
      7,
      14
    );
    geometries.push(treadGeo);
    for (let i = 0; i < treadCount; i++) {
      const angle = (i / treadCount) * Math.PI * 2;
      const tread = new THREE.Mesh(treadGeo, tireMat);
      tread.position.set(0, Math.cos(angle) * coreR, Math.sin(angle) * coreR);
      tread.rotation.x = angle;
      tread.rotation.z = Math.PI / 2 + 0.18 * (i % 2 === 0 ? 1 : -1);
      tread.castShadow = true;
      wheel.add(tread);
    }

    // Accent yarn inner sidewall rim wrap
    const innerRimR = radius - tubeRadius * 1.92;
    const sidewallGeo = new THREE.TorusGeometry(innerRimR + 0.012, 0.012 * tScale, 8, 36);
    sidewallGeo.rotateY(Math.PI / 2);
    geometries.push(sidewallGeo);
    const sidewallMesh = new THREE.Mesh(sidewallGeo, trimMat);
    sidewallMesh.castShadow = true;
    wheel.add(sidewallMesh);

    // Copper wire outer rim ring
    const rimGeo = new THREE.TorusGeometry(innerRimR, 0.011, 8, 36);
    rimGeo.rotateY(Math.PI / 2);
    geometries.push(rimGeo);
    const rimMesh = new THREE.Mesh(rimGeo, copperWireMat);
    rimMesh.castShadow = true;
    wheel.add(rimMesh);

    // 12 cross-laced copper wire spokes (angled from left/right hub flanges to rim!)
    const spokeCount = 12;
    for (let s = 0; s < spokeCount; s++) {
      const aRim = (s / spokeCount) * Math.PI * 2;
      const side = s % 2 === 0 ? 1 : -1;
      const aHub = aRim + side * 0.45;
      const pHub = new THREE.Vector3(
        side * 0.036,
        Math.cos(aHub) * 0.044,
        Math.sin(aHub) * 0.044
      );
      const pRim = new THREE.Vector3(
        0,
        Math.cos(aRim) * innerRimR,
        Math.sin(aRim) * innerRimR
      );
      const len = pHub.distanceTo(pRim);
      const spokeGeo = new THREE.CylinderGeometry(0.0045, 0.0045, len, 6);
      geometries.push(spokeGeo);
      const spoke = new THREE.Mesh(spokeGeo, copperWireMat);
      spoke.position.copy(pHub).add(pRim).multiplyScalar(0.5);
      spoke.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        pRim.clone().sub(pHub).normalize()
      );
      wheel.add(spoke);
    }

    // Wooden bobbin/spool hub (LatheGeometry with flared flanges)
    const bobbinProfile = [
      new THREE.Vector2(0.001, -0.048),
      new THREE.Vector2(0.052, -0.048),
      new THREE.Vector2(0.052, -0.032),
      new THREE.Vector2(0.036, -0.024),
      new THREE.Vector2(0.036, 0.024),
      new THREE.Vector2(0.052, 0.032),
      new THREE.Vector2(0.052, 0.048),
      new THREE.Vector2(0.001, 0.048),
    ];
    const bobbinGeo = new THREE.LatheGeometry(bobbinProfile, 20);
    bobbinGeo.rotateZ(Math.PI / 2);
    geometries.push(bobbinGeo);
    const bobbinMesh = new THREE.Mesh(bobbinGeo, woodHubMat);
    bobbinMesh.castShadow = true;
    wheel.add(bobbinMesh);

    // Colored yarn wound around the center of the wooden bobbin hub
    const hubYarnGeo = new THREE.CylinderGeometry(0.044, 0.044, 0.044, 18);
    hubYarnGeo.rotateZ(Math.PI / 2);
    geometries.push(hubYarnGeo);
    const hubYarn = new THREE.Mesh(hubYarnGeo, bodyYarnMat);
    hubYarn.castShadow = true;
    wheel.add(hubYarn);

    // Copper axle caps + steel brake disc ring on left side
    const axleGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.118, 12);
    axleGeo.rotateZ(Math.PI / 2);
    geometries.push(axleGeo);
    const axle = new THREE.Mesh(axleGeo, copperWireMat);
    wheel.add(axle);

    const discGeo = new THREE.RingGeometry(0.055, 0.095, 24);
    discGeo.rotateY(Math.PI / 2);
    geometries.push(discGeo);
    const disc = new THREE.Mesh(discGeo, steelMat);
    disc.position.x = -0.052;
    wheel.add(disc);

    partCount++;
    return wheel;
  };

  // 1. REAR WHEEL (radius = 0.24, bottom flush at y = 0)
  const rearWheelRadius = 0.24;
  const rearWheel = buildWheel(rearWheelRadius, 0.066 * tScale);
  rearWheel.position.set(0, rearWheelRadius, -0.44);
  rearWheel.name = 'RearWheel';
  chassisGroup.add(rearWheel);

  // 2. COPPER CRAFT-WIRE & WRAPPED YARN FRAME
  const frameGroup = new THREE.Group();
  frameGroup.name = 'BikeFrame';

  // Steering head neck tube connecting frame to forkPivot
  const neckGeo = new THREE.CylinderGeometry(0.036, 0.036, 0.15, 16);
  geometries.push(neckGeo);
  const neckMesh = new THREE.Mesh(neckGeo, bodyYarnMat);
  neckMesh.position.set(0, 0.56, 0.34);
  neckMesh.rotation.x = -0.38;
  neckMesh.castShadow = true;
  frameGroup.add(neckMesh);

  [-0.068, 0.068].forEach((sideX) => {
    const railCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sideX, 0.24, -0.44),
      new THREE.Vector3(sideX * 0.9, 0.37, -0.18),
      new THREE.Vector3(sideX * 0.85, 0.46, 0.14),
      new THREE.Vector3(sideX * 0.42, 0.58, 0.33),
    ]);
    const railGeo = new THREE.TubeGeometry(railCurve, 28, 0.016, 8, false);
    geometries.push(railGeo);
    const rail = new THREE.Mesh(railGeo, copperWireMat);
    rail.castShadow = true;
    frameGroup.add(rail);

    const cradleCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sideX * 0.9, 0.24, -0.44),
      new THREE.Vector3(sideX * 0.95, 0.19, -0.05),
      new THREE.Vector3(sideX * 0.85, 0.26, 0.24),
      new THREE.Vector3(sideX * 0.42, 0.51, 0.35),
    ]);
    const cradleGeo = new THREE.TubeGeometry(cradleCurve, 24, 0.014, 8, false);
    geometries.push(cradleGeo);
    const cradle = new THREE.Mesh(cradleGeo, copperWireMat);
    cradle.castShadow = true;
    frameGroup.add(cradle);
  });

  // Rear yarn-wrapped fender arch
  const rearFenderCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.45, -0.26),
    new THREE.Vector3(0, 0.51, -0.44),
    new THREE.Vector3(0, 0.42, -0.64),
  ]);
  const rearFenderGeo = new THREE.TubeGeometry(
    rearFenderCurve,
    20,
    0.042 * tScale,
    10,
    false
  );
  geometries.push(rearFenderGeo);
  const rearFender = new THREE.Mesh(rearFenderGeo, bodyYarnMat);
  rearFender.scale.set(1.5, 0.7, 1);
  rearFender.castShadow = true;
  frameGroup.add(rearFender);

  // Footpegs aligned directly under seated character's boots
  const leftPegLocal = new THREE.Vector3(-0.185, 0.23, -0.05);
  const rightPegLocal = new THREE.Vector3(0.185, 0.23, -0.05);
  const pegBarGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.4, 8);
  pegBarGeo.rotateZ(Math.PI / 2);
  geometries.push(pegBarGeo);
  const pegBar = new THREE.Mesh(pegBarGeo, copperWireMat);
  pegBar.position.set(0, 0.23, -0.05);
  pegBar.castShadow = true;
  frameGroup.add(pegBar);

  [-0.185, 0.185].forEach((px) => {
    const capGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.055, 12);
    capGeo.rotateZ(Math.PI / 2);
    geometries.push(capGeo);
    const cap = new THREE.Mesh(capGeo, trimMat);
    cap.position.set(px, 0.23, -0.05);
    cap.castShadow = true;
    frameGroup.add(cap);
  });

  chassisGroup.add(frameGroup);
  partCount++;

  // 3. KNITTED TEARDROP FUEL TANK + WRAPPED YARN STRAP
  const tankGroup = new THREE.Group();
  tankGroup.position.set(0, 0.51, 0.14);
  tankGroup.rotation.x = 0.22;

  const tankProfile = [
    new THREE.Vector2(0.001, -0.17),
    new THREE.Vector2(0.078 * tScale, -0.14),
    new THREE.Vector2(0.122 * tScale, -0.04),
    new THREE.Vector2(0.132 * tScale, 0.06),
    new THREE.Vector2(0.105 * tScale, 0.14),
    new THREE.Vector2(0.001, 0.18),
  ];
  const tankGeo = new THREE.LatheGeometry(tankProfile, 26);
  tankGeo.rotateX(Math.PI / 2);
  tankGeo.scale(0.96, 0.85, 1.0);
  geometries.push(tankGeo);
  const tankMesh = new THREE.Mesh(tankGeo, tankKnitMat);
  tankMesh.castShadow = true;
  tankMesh.receiveShadow = true;
  tankGroup.add(tankMesh);

  const strapGeo = new THREE.TorusGeometry(0.118 * tScale, 0.019 * tScale, 8, 22);
  geometries.push(strapGeo);
  const strap = new THREE.Mesh(strapGeo, trimMat);
  strap.scale.set(0.98, 0.88, 1.0);
  strap.castShadow = true;
  tankGroup.add(strap);

  const capButtonGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.022, 16);
  geometries.push(capButtonGeo);
  const capButton = new THREE.Mesh(capButtonGeo, woodHubMat);
  capButton.position.set(0, 0.115 * tScale, 0.04);
  capButton.castShadow = true;
  tankGroup.add(capButton);

  chassisGroup.add(tankGroup);
  partCount++;

  // 4. EXPRESSIVE QUILTED SCRAMBLER YARN SADDLE + REAR COWL + GRAB HOOP + TAILLIGHT
  const seatGroup = new THREE.Group();
  const seatLocal = new THREE.Vector3(0, 0.515, -0.2);
  seatGroup.position.set(0, 0.385, -0.2);

  // Sculpted lower saddle pan (copper wire perimeter frame)
  const panCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.105, 0.018, 0.145),
    new THREE.Vector3(-0.122, -0.004, 0.0),
    new THREE.Vector3(-0.114, 0.028, -0.185),
    new THREE.Vector3(0, 0.045, -0.24),
    new THREE.Vector3(0.114, 0.028, -0.185),
    new THREE.Vector3(0.122, -0.004, 0.0),
    new THREE.Vector3(0.105, 0.018, 0.145),
  ]);
  const panGeo = new THREE.TubeGeometry(panCurve, 30, 0.013, 8, false);
  geometries.push(panGeo);
  const panWire = new THREE.Mesh(panGeo, copperWireMat);
  panWire.castShadow = true;
  seatGroup.add(panWire);

  // Main contoured knitted saddle cushion with deeper rider pocket & rising rear cowl
  const seatCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.036, 0.145),
    new THREE.Vector3(0, 0.005, 0.03),
    new THREE.Vector3(0, 0.006, -0.09),
    new THREE.Vector3(0, 0.055, -0.195),
  ]);
  const seatGeo = new THREE.TubeGeometry(seatCurve, 24, 0.095 * tScale, 14, false);
  seatGeo.scale(1.2, 0.58, 1.0);
  geometries.push(seatGeo);
  const seatMesh = new THREE.Mesh(seatGeo, saddleMat);
  seatMesh.castShadow = true;
  seatMesh.receiveShadow = true;
  seatGroup.add(seatMesh);

  // 5 plump quilted yarn bolster ribs stitched across the saddle top
  const ribZOffsets = [0.095, 0.04, -0.015, -0.07, -0.125];
  const ribGeo = new THREE.CapsuleGeometry(0.018 * tScale, 0.158 * tScale, 6, 12);
  ribGeo.rotateZ(Math.PI / 2);
  geometries.push(ribGeo);
  ribZOffsets.forEach((rz, idx) => {
    const rib = new THREE.Mesh(ribGeo, saddleMat);
    const archY = idx === 0 ? 0.048 : idx === 4 ? 0.042 : 0.028;
    rib.position.set(0, archY, rz);
    rib.scale.set(1.0 - Math.abs(idx - 2) * 0.06, 0.7, 1.05);
    rib.castShadow = true;
    rib.receiveShadow = true;
    seatGroup.add(rib);
  });

  // Contrasting cream stitched belt strap + wooden button rivets on both flanks
  const beltGeo = new THREE.TorusGeometry(0.114 * tScale, 0.014 * tScale, 8, 20);
  beltGeo.scale(1.06, 0.54, 1.0);
  geometries.push(beltGeo);
  const beltMesh = new THREE.Mesh(beltGeo, trimMat);
  beltMesh.position.set(0, 0.014, -0.02);
  beltMesh.castShadow = true;
  seatGroup.add(beltMesh);

  const rivetGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.016, 12);
  rivetGeo.rotateZ(Math.PI / 2);
  geometries.push(rivetGeo);
  [-0.124, 0.124].forEach((rx) => {
    const rivet = new THREE.Mesh(rivetGeo, woodHubMat);
    rivet.position.set(rx, 0.022, -0.135);
    rivet.castShadow = true;
    seatGroup.add(rivet);
  });

  // Plump sculpted rear cowl bolster pad behind rider + copper wire rear grab hoop
  const cowlGeo = new THREE.SphereGeometry(0.088 * tScale, 18, 14);
  cowlGeo.scale(1.24, 0.74, 1.08);
  geometries.push(cowlGeo);
  const cowlMesh = new THREE.Mesh(cowlGeo, bodyYarnMat);
  cowlMesh.position.set(0, 0.066, -0.195);
  cowlMesh.castShadow = true;
  cowlMesh.receiveShadow = true;
  seatGroup.add(cowlMesh);

  const grabCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.112, 0.032, -0.16),
    new THREE.Vector3(-0.118, 0.068, -0.255),
    new THREE.Vector3(0, 0.084, -0.285),
    new THREE.Vector3(0.118, 0.068, -0.255),
    new THREE.Vector3(0.112, 0.032, -0.16),
  ]);
  const grabGeo = new THREE.TubeGeometry(grabCurve, 24, 0.013, 8, false);
  geometries.push(grabGeo);
  const grabHoop = new THREE.Mesh(grabGeo, copperWireMat);
  grabHoop.castShadow = true;
  seatGroup.add(grabHoop);

  // Glowing ruby glass button taillight tucked under the rear cowl
  const tailLightMat = new THREE.MeshPhysicalMaterial({
    color: 0xff3b30,
    emissive: new THREE.Color(0xd9261c),
    emissiveIntensity: 0.9,
    roughness: 0.14,
    clearcoat: 1.0,
  });
  materials.push(tailLightMat);
  const tailBezelGeo = new THREE.CylinderGeometry(0.028, 0.024, 0.024, 14);
  tailBezelGeo.rotateX(Math.PI / 2);
  geometries.push(tailBezelGeo);
  const tailBezel = new THREE.Mesh(tailBezelGeo, woodHubMat);
  tailBezel.position.set(0, 0.072, -0.272);
  seatGroup.add(tailBezel);

  const tailLensGeo = new THREE.SphereGeometry(0.022, 12, 10);
  tailLensGeo.scale(1, 1, 0.5);
  geometries.push(tailLensGeo);
  const tailLens = new THREE.Mesh(tailLensGeo, tailLightMat);
  tailLens.position.set(0, 0.072, -0.284);
  seatGroup.add(tailLens);

  chassisGroup.add(seatGroup);
  partCount++;

  // 5. ENGINE YARN SPOOL & COPPER EXHAUST PIPE
  const engineGroup = new THREE.Group();
  engineGroup.position.set(0, 0.28, 0.03);

  const spoolGeo = new THREE.CylinderGeometry(0.088 * tScale, 0.088 * tScale, 0.15, 20);
  spoolGeo.rotateZ(Math.PI / 2);
  geometries.push(spoolGeo);
  const spoolMesh = new THREE.Mesh(spoolGeo, bodyYarnMat);
  spoolMesh.castShadow = true;
  engineGroup.add(spoolMesh);

  const flangeGeo = new THREE.CylinderGeometry(0.102 * tScale, 0.102 * tScale, 0.018, 20);
  flangeGeo.rotateZ(Math.PI / 2);
  geometries.push(flangeGeo);
  [-0.08, 0.08].forEach((ox) => {
    const flange = new THREE.Mesh(flangeGeo, woodHubMat);
    flange.position.x = ox;
    flange.castShadow = true;
    engineGroup.add(flange);
  });

  const exhaustCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.075, -0.01, 0.05),
    new THREE.Vector3(0.125, -0.08, -0.06),
    new THREE.Vector3(0.12, -0.06, -0.34),
    new THREE.Vector3(0.125, -0.01, -0.58),
  ]);
  const exhaustGeo = new THREE.TubeGeometry(exhaustCurve, 24, 0.022, 10, false);
  geometries.push(exhaustGeo);
  const exhaustMesh = new THREE.Mesh(exhaustGeo, copperWireMat);
  exhaustMesh.castShadow = true;
  engineGroup.add(exhaustMesh);

  chassisGroup.add(engineGroup);
  partCount++;

  // 6. TALL EXPRESSIVE FRONT FORK, TRIPLE CLAMPS, RISERS & HANDLEBARS
  const forkPivot = new THREE.Group();
  forkPivot.position.set(0, 0.56, 0.34);
  forkPivot.rotation.x = -0.38;
  forkPivot.name = 'FrontForkPivot';
  chassisGroup.add(forkPivot);

  // Tall copper fork tubes running continuously from axle (-0.365) all the way up to upper crown (+0.115)!
  const forkLength = 0.51;
  const forkLegGeo = new THREE.CylinderGeometry(0.019, 0.016, forkLength, 12);
  geometries.push(forkLegGeo);
  const forkCapGeo = new THREE.SphereGeometry(0.021, 10, 8);
  geometries.push(forkCapGeo);
  const gaiterGeo = new THREE.CylinderGeometry(0.028 * tScale, 0.026 * tScale, 0.16, 14);
  geometries.push(gaiterGeo);

  [-0.088, 0.088].forEach((fx) => {
    const leg = new THREE.Mesh(forkLegGeo, copperWireMat);
    leg.position.set(fx, -0.125, 0); // spans y = -0.380 .. +0.130!
    leg.castShadow = true;
    forkPivot.add(leg);

    // Top fork nut cap above upper triple clamp
    const topCap = new THREE.Mesh(forkCapGeo, woodHubMat);
    topCap.position.set(fx, 0.132, 0);
    forkPivot.add(topCap);

    // Expressive ribbed yarn suspension gaiter sleeve
    const gaiter = new THREE.Mesh(gaiterGeo, bodyYarnMat);
    gaiter.position.set(fx, -0.18, 0);
    gaiter.castShadow = true;
    forkPivot.add(gaiter);
  });

  // Upper & Lower Triple-Clamp Crowns joining both tall fork legs to the steering stem
  const crownGeo = new THREE.BoxGeometry(0.22, 0.026, 0.056);
  geometries.push(crownGeo);
  const upperCrown = new THREE.Mesh(crownGeo, woodHubMat);
  upperCrown.position.set(0, 0.095, 0);
  upperCrown.castShadow = true;
  forkPivot.add(upperCrown);

  const lowerCrown = new THREE.Mesh(crownGeo, woodHubMat);
  lowerCrown.position.set(0, -0.055, 0);
  lowerCrown.castShadow = true;
  forkPivot.add(lowerCrown);

  // Handlebar Riser Clamps connecting upperCrown (y = 0.105) directly to handlebar center (y = 0.165)!
  const riserGeo = new THREE.CylinderGeometry(0.016, 0.018, 0.075, 10);
  geometries.push(riserGeo);
  [-0.048, 0.048].forEach((rx) => {
    const riser = new THREE.Mesh(riserGeo, copperWireMat);
    riser.position.set(rx, 0.135, -0.008);
    riser.rotation.x = -0.18;
    riser.castShadow = true;
    forkPivot.add(riser);
  });

  // Front Wheel
  const frontWheelRadius = 0.22;
  const frontWheel = buildWheel(frontWheelRadius, 0.06 * tScale);
  frontWheel.position.set(0, -0.365, 0.0);
  frontWheel.name = 'FrontWheel';
  forkPivot.add(frontWheel);

  // Front yarn fender mounted directly onto fork legs above front wheel
  const frontFenderCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.13, 0.13),
    new THREE.Vector3(0, -0.11, 0.0),
    new THREE.Vector3(0, -0.15, -0.13),
  ]);
  const frontFenderGeo = new THREE.TubeGeometry(
    frontFenderCurve,
    16,
    0.036 * tScale,
    10,
    false
  );
  geometries.push(frontFenderGeo);
  const frontFender = new THREE.Mesh(frontFenderGeo, bodyYarnMat);
  frontFender.scale.set(1.45, 0.65, 1);
  frontFender.castShadow = true;
  forkPivot.add(frontFender);

  // Warm Glowing Button Headlight mounted between upper & lower triple clamps
  const headlightGroup = new THREE.Group();
  headlightGroup.position.set(0, 0.02, 0.075);
  headlightGroup.rotation.x = 0.38;
  const bezelGeo = new THREE.CylinderGeometry(0.062, 0.052, 0.065, 18);
  bezelGeo.rotateX(Math.PI / 2);
  geometries.push(bezelGeo);
  const bezel = new THREE.Mesh(bezelGeo, woodHubMat);
  bezel.castShadow = true;
  headlightGroup.add(bezel);

  const lensGeo = new THREE.SphereGeometry(0.052, 16, 12);
  lensGeo.scale(1, 1, 0.45);
  geometries.push(lensGeo);
  const lens = new THREE.Mesh(lensGeo, headlightMat);
  lens.position.z = 0.03;
  headlightGroup.add(lens);
  forkPivot.add(headlightGroup);

  // Swept Handlebars emerging directly from the risers (y = 0.165) -> grips swept back toward rider
  const barCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.265, 0.195, -0.09),
    new THREE.Vector3(-0.145, 0.195, -0.035),
    new THREE.Vector3(-0.048, 0.168, -0.015),
    new THREE.Vector3(0.048, 0.168, -0.015),
    new THREE.Vector3(0.145, 0.195, -0.035),
    new THREE.Vector3(0.265, 0.195, -0.09),
  ]);
  const barGeo = new THREE.TubeGeometry(barCurve, 32, 0.016, 8, false);
  geometries.push(barGeo);
  const barMesh = new THREE.Mesh(barGeo, copperWireMat);
  barMesh.castShadow = true;
  forkPivot.add(barMesh);

  const leftGripObj = new THREE.Object3D();
  leftGripObj.position.set(-0.235, 0.195, -0.075);
  forkPivot.add(leftGripObj);

  const rightGripObj = new THREE.Object3D();
  rightGripObj.position.set(0.235, 0.195, -0.075);
  forkPivot.add(rightGripObj);

  const gripGeo = new THREE.CylinderGeometry(0.026 * tScale, 0.026 * tScale, 0.11, 12);
  gripGeo.rotateZ(Math.PI / 2);
  geometries.push(gripGeo);
  [-1, 1].forEach((side) => {
    const grip = new THREE.Mesh(gripGeo, saddleMat);
    grip.position.set(side * 0.225, 0.195, -0.072);
    grip.rotation.y = side * 0.44;
    grip.castShadow = true;
    forkPivot.add(grip);
  });
  partCount += 2;

  // 7. SURFACE-ANCHORED WOOL FUZZ ON FUEL TANK
  if (fuzzDensity > 0.02) {
    const wispCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.002, 0),
      new THREE.Vector3(0.003, 0.008, 0.002),
      new THREE.Vector3(0.01, 0.015, 0.004),
      new THREE.Vector3(0.017, 0.012, 0.002),
    ]);
    const wispGeo = new THREE.TubeGeometry(wispCurve, 4, 0.0018, 4, false);
    geometries.push(wispGeo);

    const fuzzCount = Math.round(90 * fuzzDensity);
    const fuzzMesh = new THREE.InstancedMesh(wispGeo, fuzzMat, fuzzCount);
    const dummy = new THREE.Object3D();
    const up = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3();

    for (let i = 0; i < fuzzCount; i++) {
      const s1 = Math.sin(i * 17.31) * 43758.5453;
      const r1 = s1 - Math.floor(s1);
      const s2 = Math.sin(i * 53.91) * 43758.5453;
      const r2 = s2 - Math.floor(s2);

      const zLocal = -0.11 + r1 * 0.22;
      const theta = r2 * Math.PI * 2;
      const r = (0.12 - Math.abs(zLocal) * 0.28) * tScale;
      const px = Math.cos(theta) * r * 0.96;
      const py = Math.sin(theta) * r * 0.85;

      dummy.position.set(px, py, zLocal);
      dir.set(px, py, zLocal * 0.4).normalize();
      dummy.quaternion.setFromUnitVectors(up, dir);
      dummy.rotateY(r1 * Math.PI * 2);
      dummy.rotateX(0.45);
      dummy.updateMatrix();
      fuzzMesh.setMatrixAt(i, dummy.matrix);
    }
    fuzzMesh.instanceMatrix.needsUpdate = true;
    fuzzMesh.computeBoundingSphere();
    tankGroup.add(fuzzMesh);
    partCount++;
  }

  let wheelSpin = 0;
  let currentSteer = 0;

  return {
    group,
    exportRoot,
    chassisGroup,
    forkPivot,
    anchors: {
      seatLocal,
      leftGripObj,
      rightGripObj,
      leftPegLocal,
      rightPegLocal,
    },
    update: (elapsed, delta, speed, steer, isRiding) => {
      const dt = Math.min(delta, 0.05);
      const k = 1 - Math.exp(-10 * dt);

      currentSteer = THREE.MathUtils.lerp(currentSteer, steer, k);
      forkPivot.rotation.y = currentSteer;

      wheelSpin += (speed * dt) / rearWheelRadius;
      rearWheel.rotation.x = wheelSpin;
      frontWheel.rotation.x = wheelSpin * (rearWheelRadius / frontWheelRadius);

      const targetLean = isRiding ? -currentSteer * 0.34 : 0.06;
      chassisGroup.rotation.z = THREE.MathUtils.lerp(
        chassisGroup.rotation.z,
        targetLean,
        k
      );

      const rumbleAmp = speed > 0.1 ? 0.005 : isRiding ? 0.0025 : 0;
      const rumble = Math.sin(elapsed * 24) * rumbleAmp;
      const bounce =
        speed > 0.1
          ? Math.abs(Math.sin(elapsed * (4 + speed * 2.2))) * 0.011
          : 0;
      chassisGroup.position.y = rumble + bounce;
      engineGroup.position.y = 0.28 + Math.sin(elapsed * 32) * (rumbleAmp * 0.45);
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
      return { triangles: Math.round(triangles), parts: partCount };
    },
  };
}
