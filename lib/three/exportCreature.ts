import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { YarnCreatureConfig } from './types';

/**
 * Exports the 3D knitted yarn creature group to a binary .GLB file (with embedded
 * procedural yarn textures & KHR_materials_sheen PBR materials) and triggers download.
 */
export async function exportCreatureToGLB(
  exportRoot: THREE.Object3D,
  filename = 'yarny-creature.glb'
): Promise<void> {
  const exporter = new GLTFExporter();

  // Ensure world matrices are fresh before export
  exportRoot.updateMatrixWorld(true);

  const glbBuffer = await exporter.parseAsync(exportRoot, {
    binary: true,
    onlyVisible: true,
  });

  if (glbBuffer instanceof ArrayBuffer) {
    const blob = new Blob([glbBuffer], { type: 'model/gltf-binary' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/**
 * Generates a self-contained Three.js ES module that users can drop directly
 * into their existing Three.js view (`scene.add(yarny.group)`).
 */
export function generateStandaloneThreeJsCode(
  config: YarnCreatureConfig
): string {
  return `// В'язаний персонаж у стилі Unravel 2 — готовий модуль для Three.js
// Використання:
//   import { createYarnCreature } from './createYarnCreature';
//   const yarny = createYarnCreature({ color: '${config.color}' });
//   scene.add(yarny.group);
//   // В анімаційному циклі: yarny.update(clock.getElapsedTime());

import * as THREE from 'three';

export function createYarnCreature(options = {}) {
  const colorHex = options.color ?? '${config.color}';
  const sheenHex = options.sheenColor ?? '${config.sheenColor}';
  const eyeHex = options.eyeColor ?? '${config.eyeColor}';
  const thickness = options.yarnThickness ?? ${config.yarnThickness.toFixed(2)};
  const fuzzDensity = options.fuzzDensity ?? ${config.fuzzDensity.toFixed(2)};

  const group = new THREE.Group();
  group.name = 'YarnCreature';

  // --- 1. Процедурна текстура скрученої пряжі ---
  function makeYarnTextures(hex) {
    const size = 256;
    const cCanvas = document.createElement('canvas');
    const bCanvas = document.createElement('canvas');
    cCanvas.width = bCanvas.width = size;
    cCanvas.height = bCanvas.height = size;
    const cCtx = cCanvas.getContext('2d');
    const bCtx = bCanvas.getContext('2d');

    const col = new THREE.Color(hex);
    const r0 = Math.round(col.r * 255);
    const g0 = Math.round(col.g * 255);
    const b0 = Math.round(col.b * 255);

    const cImg = cCtx.createImageData(size, size);
    const bImg = bCtx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const idx = (y * size + x) * 4;
        const phase = (u * 4 + v * 3) * Math.PI * 2;
        const ridge = Math.pow(0.5 + 0.5 * Math.sin(phase), 0.72);
        const fiber = 0.5 + 0.5 * Math.sin((u * 36 + v * 26) * Math.PI * 2);
        const h = ridge * 0.75 + fiber * 0.25;
        const shade = 0.55 + h * 0.52;

        cImg.data[idx] = Math.min(255, r0 * shade);
        cImg.data[idx + 1] = Math.min(255, g0 * shade);
        cImg.data[idx + 2] = Math.min(255, b0 * shade);
        cImg.data[idx + 3] = 255;

        const bv = Math.round(h * 255);
        bImg.data[idx] = bImg.data[idx + 1] = bImg.data[idx + 2] = bv;
        bImg.data[idx + 3] = 255;
      }
    }
    cCtx.putImageData(cImg, 0, 0);
    bCtx.putImageData(bImg, 0, 0);

    const map = new THREE.CanvasTexture(cCanvas);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(6, 2);
    map.colorSpace = THREE.SRGBColorSpace;

    const bumpMap = new THREE.CanvasTexture(bCanvas);
    bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
    bumpMap.repeat.set(6, 2);

    return { map, bumpMap };
  }

  const { map, bumpMap } = makeYarnTextures(colorHex);

  const woolMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map,
    bumpMap,
    bumpScale: 0.04,
    roughness: 0.92,
    metalness: 0.0,
    sheen: 1.0,
    sheenRoughness: 0.82,
    sheenColor: new THREE.Color(sheenHex),
  });

  const eyeMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(eyeHex),
    roughness: 0.06,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
  });

  const socketMat = new THREE.MeshStandardMaterial({
    color: 0x241e20,
    roughness: 0.95,
  });

  // --- 2. Геометрія з конусоподібним звуженням ---
  function taperedTube(curve, segs, radSegs, radiusFn) {
    const frames = curve.computeFrenetFrames(segs, false);
    const pos = [], norm = [], uv = [], idx = [];
    const P = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3();
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      curve.getPointAt(t, P);
      N.copy(frames.normals[i]);
      B.copy(frames.binormals[i]);
      const r = radiusFn(t);
      for (let j = 0; j <= radSegs; j++) {
        const a = (j / radSegs) * Math.PI * 2;
        const nx = -Math.cos(a) * N.x + Math.sin(a) * B.x;
        const ny = -Math.cos(a) * N.y + Math.sin(a) * B.y;
        const nz = -Math.cos(a) * N.z + Math.sin(a) * B.z;
        pos.push(P.x + r * nx, P.y + r * ny, P.z + r * nz);
        norm.push(nx, ny, nz);
        uv.push(t, j / radSegs);
      }
    }
    for (let j = 1; j <= segs; j++) {
      for (let i = 1; i <= radSegs; i++) {
        const a = (radSegs + 1) * (j - 1) + (i - 1);
        const b = (radSegs + 1) * j + (i - 1);
        const c = (radSegs + 1) * j + i;
        const d = (radSegs + 1) * (j - 1) + i;
        idx.push(a, b, d, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setIndex(idx);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return g;
  }

  // --- 3. Складання ієрархії тіла (pivot знизу по центру y = 0) ---
  const hips = new THREE.Group();
  hips.position.y = 0.44;
  group.add(hips);

  const torso = new THREE.Group();
  hips.add(torso);

  // В'язаний тулуб
  const torsoPts = [
    new THREE.Vector2(0.001, -0.08),
    new THREE.Vector2(0.165 * thickness, 0.0),
    new THREE.Vector2(0.142 * thickness, 0.14),
    new THREE.Vector2(0.168 * thickness, 0.28),
    new THREE.Vector2(0.092 * thickness, 0.44),
    new THREE.Vector2(0.001, 0.45),
  ];
  const torsoGeo = new THREE.LatheGeometry(torsoPts, 26);
  torsoGeo.scale(1.04, 1, 0.88);
  const torsoMesh = new THREE.Mesh(torsoGeo, woolMat);
  torsoMesh.castShadow = torsoMesh.receiveShadow = true;
  torso.add(torsoMesh);

  // Голова + знакові вигнуті вушка-ріжки
  const head = new THREE.Group();
  head.position.set(0, 0.44, 0.01);
  torso.add(head);

  const headGeo = new THREE.LatheGeometry([
    new THREE.Vector2(0.001, 0),
    new THREE.Vector2(0.195 * thickness, 0.11),
    new THREE.Vector2(0.215 * thickness, 0.21),
    new THREE.Vector2(0.185 * thickness, 0.31),
    new THREE.Vector2(0.001, 0.385),
  ], 28);
  headGeo.scale(1.12, 0.96, 0.92);
  const headMesh = new THREE.Mesh(headGeo, woolMat);
  headMesh.castShadow = headMesh.receiveShadow = true;
  head.add(headMesh);

  [-1, 1].forEach((side) => {
    const earCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.02, 0),
      new THREE.Vector3(side * 0.06, 0.09, -0.01),
      new THREE.Vector3(side * 0.105, 0.22, 0.01),
      new THREE.Vector3(side * 0.075, 0.34, 0.045),
      new THREE.Vector3(side * 0.025, 0.39, 0.065),
    ]);
    const ear = new THREE.Mesh(
      taperedTube(earCurve, 28, 12, (t) => 0.072 * (1 - t * 0.7) * thickness),
      woolMat
    );
    ear.position.set(side * 0.135, 0.295, -0.01);
    ear.castShadow = true;
    head.add(ear);

    // Очі-ґудзики
    const socket = new THREE.Mesh(
      new THREE.CylinderGeometry(0.056 * thickness, 0.06 * thickness, 0.024, 18),
      socketMat
    );
    socket.rotation.x = Math.PI / 2;
    socket.rotation.z = -side * 0.32;
    socket.position.set(side * 0.095, 0.185, 0.175 * thickness);
    head.add(socket);

    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.044 * thickness, 16, 14), eyeMat);
    eye.scale.set(1, 1.06, 0.78);
    eye.position.set(side * 0.098, 0.185, 0.187 * thickness);
    head.add(eye);
  });

  // Плетені руки, долоні-сокети (rightHandAnchor / leftHandAnchor) та ноги
  const handAnchors = { left: new THREE.Group(), right: new THREE.Group() };
  [-1, 1].forEach((side) => {
    const armCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.17, 0.36, 0.01),
      new THREE.Vector3(side * 0.29, 0.16, 0.04),
      new THREE.Vector3(side * 0.33, -0.01, 0.1),
    ]);
    const arm = new THREE.Mesh(
      taperedTube(armCurve, 24, 10, () => 0.036 * thickness),
      woolMat
    );
    arm.castShadow = true;
    torso.add(arm);

    // Сокет у центрі долоні (не на лікті/середині руки), руків'я предмета має бути в (0,0,0)
    const handAnchor = side < 0 ? handAnchors.left : handAnchors.right;
    handAnchor.position.set(side * 0.33, -0.028, 0.114);
    torso.add(handAnchor);

    const legCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.095, -0.03, 0),
      new THREE.Vector3(side * 0.11, -0.22, 0.005),
      new THREE.Vector3(side * 0.11, -0.39, 0.01),
    ]);
    const leg = new THREE.Mesh(
      taperedTube(legCurve, 22, 10, () => 0.044 * thickness),
      woolMat
    );
    leg.castShadow = true;
    hips.add(leg);

    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.056 * thickness, 16, 12), woolMat);
    foot.scale.set(0.95, 0.72, 1.48);
    foot.position.set(side * 0.11, -0.4, 0.04);
    foot.castShadow = true;
    hips.add(foot);
  });

  // Вільний хвостик нитки позаду
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.06, -0.13),
    new THREE.Vector3(-0.08, -0.24, -0.32),
    new THREE.Vector3(0.06, -0.418, -0.62),
    new THREE.Vector3(0.24, -0.418, -0.78),
  ]);
  const tail = new THREE.Mesh(
    taperedTube(tailCurve, 32, 8, (t) => 0.022 * (1 - t * 0.25) * thickness),
    woolMat
  );
  tail.castShadow = true;
  tail.visible = ${config.showTail ? 'true' : 'false'};
  hips.add(tail);

  // Вовняний ворс, прив'язаний точно до поверхні тулуба й голови
  if (fuzzDensity > 0.05) {
    const fCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.002, 0),
      new THREE.Vector3(0.003, 0.009, 0.002),
      new THREE.Vector3(0.011, 0.017, 0.005),
      new THREE.Vector3(0.018, 0.014, 0.002),
    ]);
    const fuzzGeo = taperedTube(fCurve, 5, 4, (t) => 0.002 * (1 - t * 0.78));
    const fuzzMat = new THREE.MeshStandardMaterial({ color: sheenHex, roughness: 0.96 });
    const dummy = new THREE.Object3D();
    const up = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3();

    const torsoCount = Math.round(110 * fuzzDensity);
    const torsoFuzz = new THREE.InstancedMesh(fuzzGeo, fuzzMat, torsoCount);
    for (let i = 0; i < torsoCount; i++) {
      const a = i * 2.39996;
      const h = (i / torsoCount) * 0.42;
      const r = 0.152 * thickness;
      const px = Math.cos(a) * r * 1.02;
      const pz = Math.sin(a) * r * 0.86;
      dummy.position.set(px, h, pz);
      dir.set(px, 0.15, pz).normalize();
      dummy.quaternion.setFromUnitVectors(up, dir);
      dummy.rotateY(a);
      dummy.rotateX(0.45);
      dummy.updateMatrix();
      torsoFuzz.setMatrixAt(i, dummy.matrix);
    }
    torsoFuzz.instanceMatrix.needsUpdate = true;
    torsoFuzz.computeBoundingSphere();
    torso.add(torsoFuzz);

    const headCount = Math.round(110 * fuzzDensity);
    const headFuzz = new THREE.InstancedMesh(fuzzGeo, fuzzMat, headCount);
    for (let i = 0; i < headCount; i++) {
      const a = i * 2.39996;
      const h = 0.06 + (i / headCount) * 0.28;
      const r = 0.192 * Math.sin((h / 0.38) * Math.PI) * thickness;
      const px = Math.cos(a) * r * 1.1;
      const pz = Math.sin(a) * r * 0.9;
      dummy.position.set(px, h, pz);
      dir.set(px, (h - 0.19) * 1.5, pz).normalize();
      dummy.quaternion.setFromUnitVectors(up, dir);
      dummy.rotateY(a);
      dummy.rotateX(0.45);
      dummy.updateMatrix();
      headFuzz.setMatrixAt(i, dummy.matrix);
    }
    headFuzz.instanceMatrix.needsUpdate = true;
    headFuzz.computeBoundingSphere();
    head.add(headFuzz);
  }

  return {
    group,
    leftHandAnchor: handAnchors.left,
    rightHandAnchor: handAnchors.right,
    holdItem(itemMesh, hand = 'right') {
      handAnchors.left.clear();
      handAnchors.right.clear();
      if (itemMesh) {
        (hand === 'left' ? handAnchors.left : handAnchors.right).add(itemMesh);
      }
    },
    update(elapsedTime) {
      const b = Math.sin(elapsedTime * 2.1);
      hips.position.y = 0.44 + b * 0.008;
      torso.rotation.x = 0.03 + b * 0.022;
      head.rotation.y = Math.sin(elapsedTime * 0.7) * 0.1;
      head.rotation.z = Math.sin(elapsedTime * 1.1) * 0.04;
    },
    setRidePose(steer = 0) {
      tail.visible = false;
      hips.position.set(0, 0.515, -0.2);
      hips.rotation.z = 0;
      torso.rotation.x = 0.24;
      torso.rotation.y = steer * 0.14;
      head.rotation.x = -0.18;
      head.rotation.y = steer * 0.4;
    },
    syncWithBike(bike) {
      group.position.y = bike.chassis.position.y;
      group.rotation.z = bike.chassis.rotation.z;
    },
  };
}
`;
}

/**
 * Generates a standalone Three.js ES module for the knitted-yarn motorcycle
 * that pairs directly with createYarnCreature.
 */
export function generateStandaloneMotorcycleCode(
  config: YarnCreatureConfig
): string {
  return `// Окремий файл: createYarnMotorcycle.js — В'язаний мотоцикл у стилі Unravel 2
// Використання разом із персонажем (2 окремі модулі):
//   import { createYarnCreature } from './createYarnCreature';
//   import { createYarnMotorcycle } from './createYarnMotorcycle';
//
//   const yarny = createYarnCreature({ color: '${config.color}' });
//   const bike = createYarnMotorcycle({ color: '${config.bikeColor}', accentColor: '${config.seatColor}' });
//   scene.add(bike.group, yarny.group);
//   yarny.setRidePose(0.2);
//   // В анімації (синхронна вібрація та нахил у поворотах):
//   //   bike.update(elapsed, delta, speed, steer, true);
//   //   yarny.syncWithBike(bike);

import * as THREE from 'three';

export function createYarnMotorcycle(options = {}) {
  const colorHex = options.color ?? '${config.bikeColor}';
  const sheenHex = options.sheenColor ?? '${config.bikeSheenColor}';
  const accentHex = options.accentColor ?? '${config.seatColor}';
  const thickness = options.yarnThickness ?? ${config.yarnThickness.toFixed(2)};

  const group = new THREE.Group();
  group.name = 'YarnMotorcycle';

  const chassis = new THREE.Group();
  group.add(chassis);

  const woolMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(colorHex),
    roughness: 0.92,
    sheen: 1.0,
    sheenRoughness: 0.82,
    sheenColor: new THREE.Color(sheenHex),
  });
  const tireMat = new THREE.MeshPhysicalMaterial({
    color: 0x22242a,
    roughness: 0.95,
    sheen: 0.6,
    sheenColor: new THREE.Color('#707785'),
  });
  const trimMat = new THREE.MeshPhysicalMaterial({
    color: 0xd8cab2,
    roughness: 0.92,
    sheen: 0.85,
  });
  const saddleMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(accentHex),
    roughness: 0.93,
    sheen: 0.9,
  });
  const wireMat = new THREE.MeshStandardMaterial({
    color: 0xc88f54,
    roughness: 0.26,
    metalness: 0.88,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x9aa3b0,
    roughness: 0.34,
    metalness: 0.84,
  });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6f4e37, roughness: 0.72 });
  const lightMat = new THREE.MeshPhysicalMaterial({
    color: 0xffe4a8,
    emissive: 0xffb84d,
    emissiveIntensity: 0.78,
    clearcoat: 1.0,
  });

  function makeWheel(radius, tube) {
    const w = new THREE.Group();
    const coreR = radius - tube;
    const tire = new THREE.Mesh(new THREE.TorusGeometry(coreR, tube, 16, 40), tireMat);
    tire.rotation.y = Math.PI / 2;
    tire.castShadow = true;
    w.add(tire);

    // Рельєфний в'язаний протектор
    const treadGeo = new THREE.TorusGeometry(tube * 1.02, 0.012 * thickness, 7, 14);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const tread = new THREE.Mesh(treadGeo, tireMat);
      tread.position.set(0, Math.cos(a) * coreR, Math.sin(a) * coreR);
      tread.rotation.x = a;
      tread.rotation.z = Math.PI / 2 + 0.18 * (i % 2 === 0 ? 1 : -1);
      w.add(tread);
    }

    const innerRimR = radius - tube * 1.92;
    const sidewall = new THREE.Mesh(new THREE.TorusGeometry(innerRimR + 0.012, 0.012 * thickness, 8, 32), trimMat);
    sidewall.rotation.y = Math.PI / 2;
    w.add(sidewall);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(innerRimR, 0.011, 8, 32), wireMat);
    rim.rotation.y = Math.PI / 2;
    w.add(rim);

    // 12 перехресних мідних спиць
    for (let s = 0; s < 12; s++) {
      const aRim = (s / 12) * Math.PI * 2;
      const side = s % 2 === 0 ? 1 : -1;
      const aHub = aRim + side * 0.45;
      const pHub = new THREE.Vector3(side * 0.036, Math.cos(aHub) * 0.044, Math.sin(aHub) * 0.044);
      const pRim = new THREE.Vector3(0, Math.cos(aRim) * innerRimR, Math.sin(aRim) * innerRimR);
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, pHub.distanceTo(pRim), 6), wireMat);
      spoke.position.copy(pHub).add(pRim).multiplyScalar(0.5);
      spoke.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pRim.clone().sub(pHub).normalize());
      w.add(spoke);
    }

    // Дерев'яна котушка-маточина + намотка пряжі + гальмівний диск
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.09, 16), woodMat);
    hub.rotation.z = Math.PI / 2;
    w.add(hub);

    const hubYarn = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.044, 16), woolMat);
    hubYarn.rotation.z = Math.PI / 2;
    w.add(hubYarn);

    const disc = new THREE.Mesh(new THREE.RingGeometry(0.055, 0.095, 22), steelMat);
    disc.rotation.y = Math.PI / 2;
    disc.position.x = -0.052;
    w.add(disc);
    return w;
  }

  const rearWheel = makeWheel(0.24, 0.066 * thickness);
  rearWheel.position.set(0, 0.24, -0.44);
  chassis.add(rearWheel);

  // Рульова колонка + дротяна рама + підніжки
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.15, 14), woolMat);
  neck.position.set(0, 0.56, 0.34);
  neck.rotation.x = -0.38;
  chassis.add(neck);

  [-0.068, 0.068].forEach((sx) => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sx, 0.24, -0.44),
      new THREE.Vector3(sx * 0.9, 0.37, -0.18),
      new THREE.Vector3(sx * 0.85, 0.46, 0.14),
      new THREE.Vector3(sx * 0.42, 0.58, 0.33),
    ]);
    const rail = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.016, 8, false), wireMat);
    rail.castShadow = true;
    chassis.add(rail);
  });

  const pegBar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.38, 8), wireMat);
  pegBar.rotation.z = Math.PI / 2;
  pegBar.position.set(0, 0.23, -0.05);
  chassis.add(pegBar);

  // В'язаний бак
  const tank = new THREE.Mesh(new THREE.SphereGeometry(0.132 * thickness, 20, 16), woolMat);
  tank.scale.set(0.95, 0.82, 1.45);
  tank.position.set(0, 0.51, 0.14);
  tank.rotation.x = 0.22;
  tank.castShadow = true;
  chassis.add(tank);

  // Виразне стьобане сідло + задній горб + мідна дуга + стоп-сигнал
  const seatGroup = new THREE.Group();
  seatGroup.position.set(0, 0.385, -0.2);

  const seatBase = new THREE.Mesh(new THREE.SphereGeometry(0.125 * thickness, 16, 12), saddleMat);
  seatBase.scale.set(1.02, 0.52, 1.46);
  seatBase.castShadow = true;
  seatGroup.add(seatBase);

  const ribGeo = new THREE.CapsuleGeometry(0.02 * thickness, 0.16 * thickness, 6, 12);
  ribGeo.rotateZ(Math.PI / 2);
  [0.095, 0.04, -0.015, -0.07, -0.125].forEach((rz, idx) => {
    const rib = new THREE.Mesh(ribGeo, saddleMat);
    rib.position.set(0, idx === 0 ? 0.056 : idx === 4 ? 0.052 : 0.038, rz);
    rib.scale.set(1 - Math.abs(idx - 2) * 0.06, 0.78, 1.05);
    seatGroup.add(rib);
  });

  const cowl = new THREE.Mesh(new THREE.SphereGeometry(0.088 * thickness, 16, 12), woolMat);
  cowl.scale.set(1.24, 0.74, 1.1);
  cowl.position.set(0, 0.064, -0.195);
  seatGroup.add(cowl);

  const grabCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.11, 0.032, -0.15),
    new THREE.Vector3(-0.115, 0.068, -0.245),
    new THREE.Vector3(0, 0.082, -0.275),
    new THREE.Vector3(0.115, 0.068, -0.245),
    new THREE.Vector3(0.11, 0.032, -0.15),
  ]);
  seatGroup.add(new THREE.Mesh(new THREE.TubeGeometry(grabCurve, 22, 0.013, 8, false), wireMat));

  const tailLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.024, 12, 10),
    new THREE.MeshPhysicalMaterial({ color: 0xff3b30, emissive: 0xd9261c, emissiveIntensity: 0.9 })
  );
  tailLight.position.set(0, 0.068, -0.272);
  seatGroup.add(tailLight);
  chassis.add(seatGroup);

  // Висока виразна передня вилка, траверси, стійки та кермо
  const forkPivot = new THREE.Group();
  forkPivot.position.set(0, 0.56, 0.34);
  forkPivot.rotation.x = -0.38;
  chassis.add(forkPivot);

  [-0.088, 0.088].forEach((fx) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.016, 0.51, 12), wireMat);
    leg.position.set(fx, -0.125, 0);
    forkPivot.add(leg);

    const gaiter = new THREE.Mesh(new THREE.CylinderGeometry(0.028 * thickness, 0.026 * thickness, 0.16, 12), woolMat);
    gaiter.position.set(fx, -0.18, 0);
    forkPivot.add(gaiter);
  });

  const crownGeo = new THREE.BoxGeometry(0.22, 0.026, 0.056);
  const upperCrown = new THREE.Mesh(crownGeo, woodMat);
  upperCrown.position.set(0, 0.095, 0);
  forkPivot.add(upperCrown);

  const lowerCrown = new THREE.Mesh(crownGeo, woodMat);
  lowerCrown.position.set(0, -0.055, 0);
  forkPivot.add(lowerCrown);

  [-0.048, 0.048].forEach((rx) => {
    const riser = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.075, 10), wireMat);
    riser.position.set(rx, 0.135, -0.008);
    riser.rotation.x = -0.18;
    forkPivot.add(riser);
  });

  const frontWheel = makeWheel(0.22, 0.06 * thickness);
  frontWheel.position.set(0, -0.365, 0);
  forkPivot.add(frontWheel);

  const headlight = new THREE.Mesh(new THREE.SphereGeometry(0.052, 14, 12), lightMat);
  headlight.position.set(0, 0.02, 0.09);
  forkPivot.add(headlight);

  const barCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.235, 0.195, -0.075),
    new THREE.Vector3(-0.135, 0.188, -0.022),
    new THREE.Vector3(-0.048, 0.168, -0.015),
    new THREE.Vector3(0.048, 0.168, -0.015),
    new THREE.Vector3(0.135, 0.188, -0.022),
    new THREE.Vector3(0.235, 0.195, -0.075),
  ]);
  forkPivot.add(new THREE.Mesh(new THREE.TubeGeometry(barCurve, 28, 0.016, 8, false), wireMat));

  let spin = 0;
  return {
    group,
    chassis,
    forkPivot,
    seatAnchor: new THREE.Vector3(0, 0.515, -0.2),
    update(elapsed, delta, speed = 1.5, steer = 0, isRiding = true) {
      const dt = Math.min(delta, 0.05);
      const k = 1 - Math.exp(-10 * dt);
      forkPivot.rotation.y = THREE.MathUtils.lerp(forkPivot.rotation.y, steer, k);
      spin += (speed * dt) / 0.24;
      rearWheel.rotation.x = spin;
      frontWheel.rotation.x = spin * 1.09;
      chassis.rotation.z = THREE.MathUtils.lerp(
        chassis.rotation.z,
        isRiding ? -steer * 0.34 : 0.06,
        k
      );
      const rumbleAmp = speed > 0.1 ? 0.005 : isRiding ? 0.0025 : 0;
      const rumble = Math.sin(elapsed * 24) * rumbleAmp;
      const bounce = speed > 0.1 ? Math.abs(Math.sin(elapsed * (4 + speed * 2.2))) * 0.011 : 0;
      chassis.position.y = rumble + bounce;
    },
  };
}
`;
}

/**
 * Generates a standalone Three.js ES module for procedural textured Nordic craft trees
 * (bark + foliage CanvasTextures, multi-part trunk/roots/branches/crown, and wind sway).
 */
export function generateStandaloneTreeCode(): string {
  return `// Окремий файл: createYarnTree.js — Дерева з процедурною текстурою кори та хвої/листя
// Використання:
//   import { createYarnTree, createYarnGrove } from './createYarnTree';
//
//   // Одне дерево:
//   const tree = createYarnTree({ variant: 'spruce', scale: 1.1 });
//   tree.group.position.set(-2, 0, -1.5);
//   scene.add(tree.group);
//
//   // Або одразу кілька дерев зі спільними текстурами:
//   const grove = createYarnGrove({ groundY: 0 });
//   scene.add(grove.group);
//   // В анімації: grove.update(clock.getElapsedTime());

import * as THREE from 'three';

function hash2D(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

export function createBarkTextureSet(variant = 'spruce', repeatU = 2, repeatV = 3) {
  const size = 256;
  const cCanvas = document.createElement('canvas');
  const bCanvas = document.createElement('canvas');
  cCanvas.width = bCanvas.width = size;
  cCanvas.height = bCanvas.height = size;
  const cCtx = cCanvas.getContext('2d');
  const bCtx = bCanvas.getContext('2d');

  const cImg = cCtx.createImageData(size, size);
  const bImg = bCtx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const idx = (y * size + x) * 4;

      if (variant === 'birch') {
        const grain = 0.5 + 0.5 * Math.sin((u * 14 + Math.sin(v * 12) * 0.2) * Math.PI * 2);
        const dash = hash2D(Math.floor(u * 9), Math.floor(v * 30)) > 0.75
          ? Math.max(0, 1 - Math.abs(((v * 30) % 1) - 0.5) * 3.4)
          : 0;
        const h = Math.max(0, Math.min(1, 0.74 + grain * 0.16 - dash * 0.5));
        const shade = 0.72 + h * 0.28;
        cImg.data[idx] = Math.round(205 * shade * (1 - dash * 0.78) + 42 * dash * 0.78);
        cImg.data[idx + 1] = Math.round(195 * shade * (1 - dash * 0.78) + 38 * dash * 0.78);
        cImg.data[idx + 2] = Math.round(176 * shade * (1 - dash * 0.78) + 34 * dash * 0.78);
        cImg.data[idx + 3] = 255;
        const bv = Math.round(h * 255);
        bImg.data[idx] = bImg.data[idx + 1] = bImg.data[idx + 2] = bv;
        bImg.data[idx + 3] = 255;
      } else {
        const ridge = 0.5 + 0.5 * Math.sin((u * 11 + Math.sin(v * Math.PI * 2) * 0.45) * Math.PI * 2);
        const fiber = 0.5 + 0.5 * Math.sin(u * 64 * Math.PI * 2 + hash2D(x, Math.floor(y / 2)));
        const h = Math.max(0, Math.min(1, ridge * 0.68 + fiber * 0.32));
        const shade = 0.42 + h * 0.68;
        cImg.data[idx] = Math.min(255, Math.round(98 * shade));
        cImg.data[idx + 1] = Math.min(255, Math.round(69 * shade));
        cImg.data[idx + 2] = Math.min(255, Math.round(49 * shade));
        cImg.data[idx + 3] = 255;
        const bv = Math.round(h * 255);
        bImg.data[idx] = bImg.data[idx + 1] = bImg.data[idx + 2] = bv;
        bImg.data[idx + 3] = 255;
      }
    }
  }
  cCtx.putImageData(cImg, 0, 0);
  bCtx.putImageData(bImg, 0, 0);

  const map = new THREE.CanvasTexture(cCanvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(repeatU, repeatV);
  map.colorSpace = THREE.SRGBColorSpace;

  const bumpMap = new THREE.CanvasTexture(bCanvas);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(repeatU, repeatV);

  return { map, bumpMap };
}

export function createYarnTree(options = {}) {
  const variant = options.variant ?? 'spruce';
  const scale = options.scale ?? 1.0;
  const seed = options.seed ?? 1.0;
  const barkVariant = options.barkVariant ?? (variant === 'birch' ? 'birch' : 'spruce');

  const group = new THREE.Group();
  group.name = 'YarnTree_' + variant;
  group.scale.setScalar(scale);

  const swayGroup = new THREE.Group();
  group.add(swayGroup);

  const barkTex = options.barkTex ?? createBarkTextureSet(barkVariant);
  const barkMat = options.barkMat ?? new THREE.MeshStandardMaterial({
    map: barkTex.map,
    bumpMap: barkTex.bumpMap,
    bumpScale: barkVariant === 'birch' ? 0.028 : 0.05,
    roughness: 0.94,
  });

  const foliageMat = options.foliageMat ?? new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(variant === 'birch' ? '#4c7844' : '#294f37'),
    roughness: 0.88,
    sheen: 0.85,
    sheenColor: new THREE.Color('#8ac7a3'),
  });

  const trunkH = variant === 'pine' ? 1.55 : variant === 'birch' ? 1.38 : 1.42;
  const trunkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.02, trunkH * 0.4, 0.01),
    new THREE.Vector3(0.03, trunkH, 0.02),
  ]);
  const trunk = new THREE.Mesh(new THREE.TubeGeometry(trunkCurve, 18, 0.068, 12, false), barkMat);
  trunk.castShadow = trunk.receiveShadow = true;
  swayGroup.add(trunk);

  // Коріння біля основи (y = 0)
  for (let r = 0; r < 4; r++) {
    const a = (r / 4) * Math.PI * 2 + seed * 0.3;
    const rootCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(a) * 0.04, 0.1, Math.sin(a) * 0.04),
      new THREE.Vector3(Math.cos(a) * 0.17, 0.01, Math.sin(a) * 0.17),
    ]);
    const root = new THREE.Mesh(new THREE.TubeGeometry(rootCurve, 8, 0.026, 7, false), barkMat);
    root.castShadow = true;
    group.add(root);
  }

  if (variant === 'birch') {
    [
      [0, 1.24, 0, 0.31],
      [0.2, 1.08, 0.08, 0.23],
      [-0.2, 1.12, 0.12, 0.22],
      [0.04, 1.04, -0.2, 0.23],
    ].forEach(([x, y, z, rad]) => {
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(rad, 2), foliageMat);
      puff.scale.set(1.1, 0.85, 1.05);
      puff.position.set(x, y, z);
      puff.castShadow = puff.receiveShadow = true;
      swayGroup.add(puff);
    });
  } else {
    for (let t = 0; t < 4; t++) {
      const f = t / 3;
      const tier = new THREE.Mesh(
        new THREE.ConeGeometry(0.45 * (1 - f * 0.55), 0.42 * (1 - f * 0.32), 18),
        foliageMat
      );
      tier.position.set(0.02, 0.62 + t * 0.25, 0.01);
      tier.castShadow = tier.receiveShadow = true;
      swayGroup.add(tier);
    }
  }

  return {
    group,
    update(elapsedTime) {
      swayGroup.rotation.z = Math.sin(elapsedTime * 0.9 + seed) * 0.018;
    },
  };
}

export function createYarnGrove(options = {}) {
  const groundY = options.groundY ?? 0;
  const group = new THREE.Group();
  const spruceTex = createBarkTextureSet('spruce');
  const birchTex = createBarkTextureSet('birch');
  const trees = [
    { x: -2.0, z: -1.5, scale: 1.08, variant: 'spruce', seed: 1.2 },
    { x: -2.3, z: 0.45, scale: 0.96, variant: 'birch', seed: 2.7 },
    { x: 1.45, z: -2.1, scale: 1.16, variant: 'pine', seed: 3.9 },
    { x: -0.3, z: -2.7, scale: 1.24, variant: 'spruce', seed: 5.1 },
    { x: 2.3, z: -1.1, scale: 0.92, variant: 'birch', seed: 6.4 },
  ].map((p) => {
    const t = createYarnTree({
      variant: p.variant,
      scale: p.scale,
      seed: p.seed,
      barkTex: p.variant === 'birch' ? birchTex : spruceTex,
    });
    t.group.position.set(p.x, groundY, p.z);
    group.add(t.group);
    return t;
  });

  return {
    group,
    trees,
    update(elapsedTime) {
      trees.forEach((t) => t.update(elapsedTime));
    },
  };
}
`;
}

