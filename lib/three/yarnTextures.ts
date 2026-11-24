import * as THREE from 'three';

export interface YarnTextureSet {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  dispose: () => void;
}

export interface StudioFloorTextures {
  woodMap: THREE.CanvasTexture;
  woodRoughness: THREE.CanvasTexture;
  shadowMap: THREE.CanvasTexture;
  dispose: () => void;
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const num = parseInt(full, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

// Deterministic pseudo-random helper so textures stay consistent across renders
function hash2D(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

/**
 * Generates seamless 512x512 twisted multi-ply wool yarn textures (albedo, bump, roughness).
 */
export function createTwistedYarnTextureSet(
  baseHex: string,
  repeatU = 6,
  repeatV = 2,
  maxAnisotropy = 4
): YarnTextureSet {
  const size = 512;
  const { r: baseR, g: baseG, b: baseB } = hexToRgb(baseHex);

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const colorCtx = colorCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bumpCtx = bumpCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const roughCtx = roughCanvas.getContext('2d')!;

  const colorImg = colorCtx.createImageData(size, size);
  const bumpImg = bumpCtx.createImageData(size, size);
  const roughImg = roughCtx.createImageData(size, size);

  const plies = 3; // 3-ply twisted wool yarn
  const twistFreq = 4;

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const idx = (y * size + x) * 4;

      // Diagonal helical ply ridges (seamless across both U and V)
      const phase = (u * twistFreq + v * plies) * Math.PI * 2;
      const plyWave = Math.sin(phase);
      const plyRidge = Math.pow(0.5 + 0.5 * plyWave, 0.72);

      // Fine longitudinal sub-fibers aligned with the twist angle
      const fiberPhase = (u * 38 + v * 28.5) * Math.PI * 2;
      const fiberNoise = 0.5 + 0.5 * Math.sin(fiberPhase + hash2D(Math.floor(x / 2), Math.floor(y / 2)) * 1.8);
      const microSpeck = (hash2D(x, y) - 0.5) * 0.14;

      // Height value for bump map (0..1)
      const height = Math.max(0, Math.min(1, plyRidge * 0.72 + fiberNoise * 0.22 + microSpeck));

      // Color shading: warm soft wool highlights on crests, rich deep crevices between plies
      const shade = 0.56 + height * 0.52;
      const highlightLift = Math.max(0, height - 0.72) * 34;

      colorImg.data[idx] = clampByte(baseR * shade + highlightLift);
      colorImg.data[idx + 1] = clampByte(baseG * shade + highlightLift * 0.85);
      colorImg.data[idx + 2] = clampByte(baseB * shade + highlightLift * 0.85);
      colorImg.data[idx + 3] = 255;

      const bumpByte = clampByte(height * 255);
      bumpImg.data[idx] = bumpByte;
      bumpImg.data[idx + 1] = bumpByte;
      bumpImg.data[idx + 2] = bumpByte;
      bumpImg.data[idx + 3] = 255;

      // Roughness: crevices very matte (250), crests slightly softer sheen (205)
      const roughByte = clampByte(250 - height * 44);
      roughImg.data[idx] = roughByte;
      roughImg.data[idx + 1] = roughByte;
      roughImg.data[idx + 2] = roughByte;
      roughImg.data[idx + 3] = 255;
    }
  }

  colorCtx.putImageData(colorImg, 0, 0);
  bumpCtx.putImageData(bumpImg, 0, 0);
  roughCtx.putImageData(roughImg, 0, 0);

  // Add subtle stray micro-fuzz strokes over the color & bump maps for organic softness
  colorCtx.lineCap = 'round';
  bumpCtx.lineCap = 'round';
  for (let i = 0; i < 420; i++) {
    const sx = hash2D(i, 1.3) * size;
    const sy = hash2D(i, 7.9) * size;
    const len = 6 + hash2D(i, 3.1) * 14;
    const ang = -0.65 + (hash2D(i, 9.7) - 0.5) * 0.5;
    const ex = sx + Math.cos(ang) * len;
    const ey = sy + Math.sin(ang) * len;

    colorCtx.strokeStyle = `rgba(${clampByte(baseR + 48)}, ${clampByte(baseG + 42)}, ${clampByte(baseB + 42)}, 0.14)`;
    colorCtx.lineWidth = 1.2;
    colorCtx.beginPath();
    colorCtx.moveTo(sx, sy);
    colorCtx.lineTo(ex, ey);
    colorCtx.stroke();

    bumpCtx.strokeStyle = 'rgba(255,255,255,0.16)';
    bumpCtx.lineWidth = 1.1;
    bumpCtx.beginPath();
    bumpCtx.moveTo(sx, sy);
    bumpCtx.lineTo(ex, ey);
    bumpCtx.stroke();
  }

  const configureTex = (canvas: HTMLCanvasElement, isColor: boolean) => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatU, repeatV);
    tex.anisotropy = maxAnisotropy;
    if (isColor) {
      tex.colorSpace = THREE.SRGBColorSpace;
    }
    tex.needsUpdate = true;
    return tex;
  };

  const map = configureTex(colorCanvas, true);
  const bumpMap = configureTex(bumpCanvas, false);
  const roughnessMap = configureTex(roughCanvas, false);

  return {
    map,
    bumpMap,
    roughnessMap,
    dispose: () => {
      map.dispose();
      bumpMap.dispose();
      roughnessMap.dispose();
    },
  };
}

/**
 * Generates seamless 512x512 knitted V-stitch wool fabric texture for the body & head cores.
 */
export function createKnitCoreTextureSet(
  baseHex: string,
  repeatU = 5,
  repeatV = 4,
  maxAnisotropy = 4
): YarnTextureSet {
  const size = 512;
  const { r: baseR, g: baseG, b: baseB } = hexToRgb(baseHex);

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const colorCtx = colorCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bumpCtx = bumpCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const roughCtx = roughCanvas.getContext('2d')!;

  const colorImg = colorCtx.createImageData(size, size);
  const bumpImg = bumpCtx.createImageData(size, size);
  const roughImg = roughCtx.createImageData(size, size);

  const cols = 12;
  const rows = 14;

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const idx = (y * size + x) * 4;

      // V-shaped knit stitch loops
      const cellU = (u * cols) % 1;
      const cellV = (v * rows) % 1;
      const symU = Math.abs(cellU - 0.5) * 2; // 0 in stitch valley, 1 at side

      // Diagonal stitch ridge forming a classic knitted "V"
      const stitchWave = Math.sin((cellV + symU * 0.45) * Math.PI * 2);
      const colCrease = Math.sin(symU * Math.PI);
      const knitHeight = (0.5 + 0.5 * stitchWave) * 0.65 + colCrease * 0.35;

      const microFiber = (hash2D(x * 0.7, y * 0.7) - 0.5) * 0.14;
      const height = Math.max(0, Math.min(1, knitHeight + microFiber));

      const shade = 0.52 + height * 0.54;
      const fuzzLift = Math.max(0, height - 0.7) * 28;

      colorImg.data[idx] = clampByte(baseR * shade + fuzzLift);
      colorImg.data[idx + 1] = clampByte(baseG * shade + fuzzLift * 0.85);
      colorImg.data[idx + 2] = clampByte(baseB * shade + fuzzLift * 0.85);
      colorImg.data[idx + 3] = 255;

      const bumpByte = clampByte(height * 255);
      bumpImg.data[idx] = bumpByte;
      bumpImg.data[idx + 1] = bumpByte;
      bumpImg.data[idx + 2] = bumpByte;
      bumpImg.data[idx + 3] = 255;

      const roughByte = clampByte(252 - height * 40);
      roughImg.data[idx] = roughByte;
      roughImg.data[idx + 1] = roughByte;
      roughImg.data[idx + 2] = roughByte;
      roughImg.data[idx + 3] = 255;
    }
  }

  colorCtx.putImageData(colorImg, 0, 0);
  bumpCtx.putImageData(bumpImg, 0, 0);
  roughCtx.putImageData(roughImg, 0, 0);

  const configureTex = (canvas: HTMLCanvasElement, isColor: boolean) => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatU, repeatV);
    tex.anisotropy = maxAnisotropy;
    if (isColor) {
      tex.colorSpace = THREE.SRGBColorSpace;
    }
    tex.needsUpdate = true;
    return tex;
  };

  const map = configureTex(colorCanvas, true);
  const bumpMap = configureTex(bumpCanvas, false);
  const roughnessMap = configureTex(roughCanvas, false);

  return {
    map,
    bumpMap,
    roughnessMap,
    dispose: () => {
      map.dispose();
      bumpMap.dispose();
      roughnessMap.dispose();
    },
  };
}

/**
 * Generates procedural warm craft-table oak wood grain + radial contact shadow texture.
 */
export function createStudioFloorTextures(maxAnisotropy = 4): StudioFloorTextures {
  const size = 512;
  const woodCanvas = document.createElement('canvas');
  woodCanvas.width = size;
  woodCanvas.height = size;
  const wCtx = woodCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext('2d')!;

  const wImg = wCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const idx = (y * size + x) * 4;

      const grain =
        Math.sin((u * 14 + Math.sin(v * Math.PI * 2) * 0.45) * Math.PI * 2) * 0.5 + 0.5;
      const fine = Math.sin(u * 90 + hash2D(x, Math.floor(y / 4)) * 0.8) * 0.5 + 0.5;
      const val = grain * 0.72 + fine * 0.28;

      // Dark smoked Nordic oak studio surface
      wImg.data[idx] = clampByte(38 + val * 26);
      wImg.data[idx + 1] = clampByte(33 + val * 21);
      wImg.data[idx + 2] = clampByte(30 + val * 17);
      wImg.data[idx + 3] = 255;

      const rByte = clampByte(185 + (1 - val) * 52);
      rImg.data[idx] = rByte;
      rImg.data[idx + 1] = rByte;
      rImg.data[idx + 2] = rByte;
      rImg.data[idx + 3] = 255;
    }
  }

  wCtx.putImageData(wImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  const woodMap = new THREE.CanvasTexture(woodCanvas);
  woodMap.wrapS = THREE.RepeatWrapping;
  woodMap.wrapT = THREE.RepeatWrapping;
  woodMap.repeat.set(2, 2);
  woodMap.anisotropy = maxAnisotropy;
  woodMap.colorSpace = THREE.SRGBColorSpace;

  const woodRoughness = new THREE.CanvasTexture(roughCanvas);
  woodRoughness.wrapS = THREE.RepeatWrapping;
  woodRoughness.wrapT = THREE.RepeatWrapping;
  woodRoughness.repeat.set(2, 2);
  woodRoughness.anisotropy = maxAnisotropy;

  // Soft radial contact shadow
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 256;
  shadowCanvas.height = 256;
  const sCtx = shadowCanvas.getContext('2d')!;
  const grad = sCtx.createRadialGradient(128, 128, 12, 128, 128, 124);
  grad.addColorStop(0, 'rgba(6, 7, 10, 0.85)');
  grad.addColorStop(0.45, 'rgba(6, 7, 10, 0.42)');
  grad.addColorStop(1, 'rgba(6, 7, 10, 0)');
  sCtx.fillStyle = grad;
  sCtx.fillRect(0, 0, 256, 256);

  const shadowMap = new THREE.CanvasTexture(shadowCanvas);

  return {
    woodMap,
    woodRoughness,
    shadowMap,
    dispose: () => {
      woodMap.dispose();
      woodRoughness.dispose();
      shadowMap.dispose();
    },
  };
}

export interface TreeTextureSet {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  dispose: () => void;
}

/**
 * Generates seamless 512x512 procedural tree bark textures (spruce/oak or silver birch)
 * with vertical fibrous grain, deep bark furrows, knots, and lichen/lenticel detail.
 */
export function createTreeBarkTextureSet(
  variant: 'spruce' | 'birch' = 'spruce',
  repeatU = 2,
  repeatV = 3,
  maxAnisotropy = 4
): TreeTextureSet {
  const size = 512;

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const colorCtx = colorCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bumpCtx = bumpCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const roughCtx = roughCanvas.getContext('2d')!;

  const colorImg = colorCtx.createImageData(size, size);
  const bumpImg = bumpCtx.createImageData(size, size);
  const roughImg = roughCtx.createImageData(size, size);

  const knotU = 0.35;
  const knotV = 0.42;
  const knotU2 = 0.78;
  const knotV2 = 0.74;

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const idx = (y * size + x) * 4;

      // Wrap-aware distance to two organic bark knots
      const du1 = Math.min(Math.abs(u - knotU), 1 - Math.abs(u - knotU));
      const dv1 = Math.min(Math.abs(v - knotV), 1 - Math.abs(v - knotV));
      const d1 = Math.hypot(du1 * 1.4, dv1 * 0.8);

      const du2 = Math.min(Math.abs(u - knotU2), 1 - Math.abs(u - knotU2));
      const dv2 = Math.min(Math.abs(v - knotV2), 1 - Math.abs(v - knotV2));
      const d2 = Math.hypot(du2 * 1.4, dv2 * 0.8);

      const knotWarp =
        Math.exp(-d1 * d1 * 65) * 0.14 * Math.sign(u - knotU) +
        Math.exp(-d2 * d2 * 75) * 0.11 * Math.sign(u - knotU2);

      const warpedU = u + knotWarp;

      if (variant === 'birch') {
        // Silver birch: pale papery bark with horizontal dark lenticels & fine grain
        const verticalGrain =
          0.5 +
          0.5 *
            Math.sin(
              (warpedU * 14 + Math.sin(v * Math.PI * 4) * 0.25) * Math.PI * 2
            );
        const paperyBand =
          0.5 + 0.5 * Math.sin((v * 18 + Math.sin(warpedU * Math.PI * 6) * 0.35) * Math.PI * 2);
        const micro = (hash2D(Math.floor(x / 2), y) - 0.5) * 0.12;

        // Horizontal dark bark dashes (lenticels)
        const dashNoise = hash2D(Math.floor(u * 9), Math.floor(v * 34));
        const dashMask =
          dashNoise > 0.74
            ? Math.max(0, 1 - Math.abs(((v * 34) % 1) - 0.5) * 3.4) *
              Math.sin(((u * 9) % 1) * Math.PI)
            : 0;

        const knotDark = Math.exp(-d1 * d1 * 140) * 0.65 + Math.exp(-d2 * d2 * 150) * 0.55;
        const height = Math.max(
          0,
          Math.min(1, 0.72 + verticalGrain * 0.12 + paperyBand * 0.1 + micro - dashMask * 0.45 - knotDark * 0.35)
        );

        const baseShade = 0.72 + height * 0.28;
        const darkMix = Math.min(1, dashMask * 0.82 + knotDark * 0.75);

        const r = 206 * baseShade * (1 - darkMix) + 46 * darkMix;
        const g = 196 * baseShade * (1 - darkMix) + 41 * darkMix;
        const b = 178 * baseShade * (1 - darkMix) + 37 * darkMix;

        colorImg.data[idx] = clampByte(r);
        colorImg.data[idx + 1] = clampByte(g);
        colorImg.data[idx + 2] = clampByte(b);
        colorImg.data[idx + 3] = 255;

        const bumpByte = clampByte(height * 255);
        bumpImg.data[idx] = bumpByte;
        bumpImg.data[idx + 1] = bumpByte;
        bumpImg.data[idx + 2] = bumpByte;
        bumpImg.data[idx + 3] = 255;

        const roughByte = clampByte(218 + darkMix * 28 - height * 20);
        roughImg.data[idx] = roughByte;
        roughImg.data[idx + 1] = roughByte;
        roughImg.data[idx + 2] = roughByte;
        roughImg.data[idx + 3] = 255;
      } else {
        // Warm Nordic spruce / oak bark with deep vertical ridges & lichen hints
        const ridgePrimary =
          0.5 +
          0.5 *
            Math.sin(
              (warpedU * 11 + Math.sin(v * Math.PI * 2) * 0.45 + Math.sin(v * Math.PI * 6) * 0.14) *
                Math.PI *
                2
            );
        const ridgeSecondary =
          0.5 +
          0.5 *
            Math.sin((warpedU * 27 + Math.cos(v * Math.PI * 4) * 0.3) * Math.PI * 2);
        const barkPlateBreak =
          0.5 + 0.5 * Math.sin((v * 13 + warpedU * 3) * Math.PI * 2);
        const fiberGrain =
          0.5 + 0.5 * Math.sin(warpedU * 76 * Math.PI * 2 + hash2D(x, Math.floor(y / 3)) * 1.4);
        const micro = (hash2D(x, y) - 0.5) * 0.1;

        const height = Math.max(
          0,
          Math.min(
            1,
            ridgePrimary * 0.5 +
              ridgeSecondary * 0.24 +
              barkPlateBreak * 0.14 +
              fiberGrain * 0.12 +
              micro
          )
        );

        // Subtle moss/lichen speck in deep crevices
        const mossSpot =
          height < 0.36 && hash2D(Math.floor(x / 6), Math.floor(y / 6)) > 0.72
            ? 0.24
            : 0;

        const shade = 0.42 + height * 0.68;
        const r = 98 * shade * (1 - mossSpot) + 74 * mossSpot;
        const g = 69 * shade * (1 - mossSpot) + 92 * mossSpot;
        const b = 49 * shade * (1 - mossSpot) + 56 * mossSpot;

        colorImg.data[idx] = clampByte(r);
        colorImg.data[idx + 1] = clampByte(g);
        colorImg.data[idx + 2] = clampByte(b);
        colorImg.data[idx + 3] = 255;

        const bumpByte = clampByte(height * 255);
        bumpImg.data[idx] = bumpByte;
        bumpImg.data[idx + 1] = bumpByte;
        bumpImg.data[idx + 2] = bumpByte;
        bumpImg.data[idx + 3] = 255;

        // Crevices very rough (248), bark crests slightly burnished (202)
        const roughByte = clampByte(248 - height * 46);
        roughImg.data[idx] = roughByte;
        roughImg.data[idx + 1] = roughByte;
        roughImg.data[idx + 2] = roughByte;
        roughImg.data[idx + 3] = 255;
      }
    }
  }

  colorCtx.putImageData(colorImg, 0, 0);
  bumpCtx.putImageData(bumpImg, 0, 0);
  roughCtx.putImageData(roughImg, 0, 0);

  const configureTex = (canvas: HTMLCanvasElement, isColor: boolean) => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatU, repeatV);
    tex.anisotropy = maxAnisotropy;
    if (isColor) {
      tex.colorSpace = THREE.SRGBColorSpace;
    }
    tex.needsUpdate = true;
    return tex;
  };

  const map = configureTex(colorCanvas, true);
  const bumpMap = configureTex(bumpCanvas, false);
  const roughnessMap = configureTex(roughCanvas, false);

  return {
    map,
    bumpMap,
    roughnessMap,
    dispose: () => {
      map.dispose();
      bumpMap.dispose();
      roughnessMap.dispose();
    },
  };
}

/**
 * Generates seamless 512x512 felted/knitted woodland foliage texture (pine needles & soft moss wool)
 * so trees share the handmade Unravel 2 diorama look.
 */
export function createTreeFoliageTextureSet(
  baseHex = '#2e593e',
  repeatU = 4,
  repeatV = 3,
  maxAnisotropy = 4
): TreeTextureSet {
  const size = 512;
  const { r: baseR, g: baseG, b: baseB } = hexToRgb(baseHex);

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const colorCtx = colorCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bumpCtx = bumpCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const roughCtx = roughCanvas.getContext('2d')!;

  const colorImg = colorCtx.createImageData(size, size);
  const bumpImg = bumpCtx.createImageData(size, size);
  const roughImg = roughCtx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const idx = (y * size + x) * 4;

      // Diagonal wool-knit V-loops blended with layered pine-needle clusters
      const cols = 10;
      const rows = 10;
      const cellU = (u * cols) % 1;
      const cellV = (v * rows) % 1;
      const symU = Math.abs(cellU - 0.5) * 2;
      const knit = (0.5 + 0.5 * Math.sin((cellV + symU * 0.45) * Math.PI * 2)) * 0.55;

      const tuft =
        0.5 +
        0.5 *
          Math.sin((u * 18 + v * 12) * Math.PI * 2 + Math.cos(u * 9 * Math.PI * 2) * 0.9);
      const micro = (hash2D(x * 0.8, y * 0.8) - 0.5) * 0.16;

      const height = Math.max(0, Math.min(1, knit + tuft * 0.35 + micro));
      const shade = 0.58 + height * 0.52;
      const tipLift = Math.max(0, height - 0.72) * 26;

      colorImg.data[idx] = clampByte(baseR * shade + tipLift * 0.75);
      colorImg.data[idx + 1] = clampByte(baseG * shade + tipLift);
      colorImg.data[idx + 2] = clampByte(baseB * shade + tipLift * 0.65);
      colorImg.data[idx + 3] = 255;

      const bumpByte = clampByte(height * 255);
      bumpImg.data[idx] = bumpByte;
      bumpImg.data[idx + 1] = bumpByte;
      bumpImg.data[idx + 2] = bumpByte;
      bumpImg.data[idx + 3] = 255;

      const roughByte = clampByte(244 - height * 36);
      roughImg.data[idx] = roughByte;
      roughImg.data[idx + 1] = roughByte;
      roughImg.data[idx + 2] = roughByte;
      roughImg.data[idx + 3] = 255;
    }
  }

  colorCtx.putImageData(colorImg, 0, 0);
  bumpCtx.putImageData(bumpImg, 0, 0);
  roughCtx.putImageData(roughImg, 0, 0);

  const configureTex = (canvas: HTMLCanvasElement, isColor: boolean) => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatU, repeatV);
    tex.anisotropy = maxAnisotropy;
    if (isColor) {
      tex.colorSpace = THREE.SRGBColorSpace;
    }
    tex.needsUpdate = true;
    return tex;
  };

  const map = configureTex(colorCanvas, true);
  const bumpMap = configureTex(bumpCanvas, false);
  const roughnessMap = configureTex(roughCanvas, false);

  return {
    map,
    bumpMap,
    roughnessMap,
    dispose: () => {
      map.dispose();
      bumpMap.dispose();
      roughnessMap.dispose();
    },
  };
}

export type MotoTrackTextureStyle = 'mud_ruts' | 'gravel_berm' | 'wood_ramp';

/**
 * Generates seamless 512x512 procedural motocross track textures:
 * - 'mud_ruts': loamy dirt track with knobby tire ruts, damp sheen in grooves, and pebbles
 * - 'gravel_berm': compacted sandy-ochre gravel with skid marks and stone grit
 * - 'wood_ramp': weathered craft wooden planks with painted chevron warning stripes
 */
export function createMotoTrackTextureSet(
  style: MotoTrackTextureStyle = 'mud_ruts',
  repeatU = 2,
  repeatV = 2,
  maxAnisotropy = 4
): TreeTextureSet {
  const size = 512;

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const colorCtx = colorCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bumpCtx = bumpCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const roughCtx = roughCanvas.getContext('2d')!;

  const colorImg = colorCtx.createImageData(size, size);
  const bumpImg = bumpCtx.createImageData(size, size);
  const roughImg = roughCtx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const idx = (y * size + x) * 4;

      if (style === 'wood_ramp') {
        const plank = Math.floor(u * 5);
        const plankLocal = (u * 5) % 1;
        const seam = plankLocal < 0.035 || plankLocal > 0.965 ? 1 : 0;
        const grain =
          0.5 +
          0.5 *
            Math.sin((u * 42 + Math.sin(v * Math.PI * 2 + plank) * 0.45) * Math.PI * 2);
        const micro = (hash2D(x, Math.floor(y / 2)) - 0.5) * 0.1;

        const symU = Math.abs(u - 0.5);
        const chevronBand = ((v * 4 + symU * 1.6) % 1 + 1) % 1;
        const isStripe = symU < 0.36 && chevronBand < 0.24;
        const isRedStripe = isStripe && Math.floor(v * 4 + symU * 1.6) % 2 === 0;

        const h = Math.max(0, Math.min(1, (0.62 + grain * 0.25 + micro) * (1 - seam * 0.85)));
        const shade = 0.55 + h * 0.5;
        let r = (122 + (plank % 2) * 10) * shade;
        let g = (88 + (plank % 2) * 7) * shade;
        let b = (58 + (plank % 2) * 5) * shade;

        if (isStripe && !seam) {
          const wear = 0.72 + micro * 1.2;
          if (isRedStripe) {
            r = r * (1 - wear) + 196 * wear;
            g = g * (1 - wear) + 56 * wear;
            b = b * (1 - wear) + 48 * wear;
          } else {
            r = r * (1 - wear) + 232 * wear;
            g = g * (1 - wear) + 224 * wear;
            b = b * (1 - wear) + 208 * wear;
          }
        }
        if (seam) {
          r *= 0.35;
          g *= 0.35;
          b *= 0.35;
        }

        colorImg.data[idx] = clampByte(r);
        colorImg.data[idx + 1] = clampByte(g);
        colorImg.data[idx + 2] = clampByte(b);
        colorImg.data[idx + 3] = 255;

        const bumpByte = clampByte(h * 255);
        bumpImg.data[idx] = bumpByte;
        bumpImg.data[idx + 1] = bumpByte;
        bumpImg.data[idx + 2] = bumpByte;
        bumpImg.data[idx + 3] = 255;

        const roughByte = clampByte(seam ? 245 : isStripe ? 175 : 210 - grain * 25);
        roughImg.data[idx] = roughByte;
        roughImg.data[idx + 1] = roughByte;
        roughImg.data[idx + 2] = roughByte;
        roughImg.data[idx + 3] = 255;
      } else if (style === 'gravel_berm') {
        const stone = hash2D(Math.floor(x / 3), Math.floor(y / 3));
        const fine = hash2D(x, y);
        const rut =
          Math.exp(-Math.pow((u - 0.38) * 6, 2)) +
          Math.exp(-Math.pow((u - 0.64) * 6, 2));
        const knob = 0.5 + 0.5 * Math.sin(v * 48 * Math.PI * 2);

        const h = Math.max(
          0,
          Math.min(1, 0.45 + stone * 0.36 + fine * 0.14 - rut * 0.2 + rut * knob * 0.12)
        );
        const shade = 0.62 + h * 0.48;
        const r = (132 - rut * 22) * shade;
        const g = (111 - rut * 19) * shade;
        const b = (84 - rut * 16) * shade;

        colorImg.data[idx] = clampByte(r);
        colorImg.data[idx + 1] = clampByte(g);
        colorImg.data[idx + 2] = clampByte(b);
        colorImg.data[idx + 3] = 255;

        const bumpByte = clampByte(h * 255);
        bumpImg.data[idx] = bumpByte;
        bumpImg.data[idx + 1] = bumpByte;
        bumpImg.data[idx + 2] = bumpByte;
        bumpImg.data[idx + 3] = 255;

        const roughByte = clampByte(244 - rut * 42 - stone * 18);
        roughImg.data[idx] = roughByte;
        roughImg.data[idx + 1] = roughByte;
        roughImg.data[idx + 2] = roughByte;
        roughImg.data[idx + 3] = 255;
      } else {
        const wobble = Math.sin(v * Math.PI * 2) * 0.035;
        const rut1 = Math.exp(-Math.pow(u + wobble - 0.34, 2) * 90);
        const rut2 = Math.exp(-Math.pow(u - wobble * 0.7 - 0.66, 2) * 90);
        const rutDepth = Math.min(1, rut1 + rut2);

        const knobby =
          0.5 +
          0.5 *
            Math.sin((v * 44 + Math.sin(u * 20) * 0.35) * Math.PI * 2);
        const clod = hash2D(Math.floor(x / 4), Math.floor(y / 4));
        const grit = hash2D(x, y);

        const h = Math.max(
          0,
          Math.min(
            1,
            0.55 +
              clod * 0.25 +
              grit * 0.12 -
              rutDepth * 0.36 +
              rutDepth * knobby * 0.18
          )
        );
        const pebble = grit > 0.965 ? 0.35 : 0;

        const shade = 0.48 + h * 0.62 - rutDepth * 0.14;
        const r = 92 * shade + pebble * 55;
        const g = 69 * shade + pebble * 48;
        const b = 47 * shade + pebble * 40;

        colorImg.data[idx] = clampByte(r);
        colorImg.data[idx + 1] = clampByte(g);
        colorImg.data[idx + 2] = clampByte(b);
        colorImg.data[idx + 3] = 255;

        const bumpByte = clampByte(h * 255);
        bumpImg.data[idx] = bumpByte;
        bumpImg.data[idx + 1] = bumpByte;
        bumpImg.data[idx + 2] = bumpByte;
        bumpImg.data[idx + 3] = 255;

        const roughByte = clampByte(242 - rutDepth * 88 - knobby * rutDepth * 15);
        roughImg.data[idx] = roughByte;
        roughImg.data[idx + 1] = roughByte;
        roughImg.data[idx + 2] = roughByte;
        roughImg.data[idx + 3] = 255;
      }
    }
  }

  colorCtx.putImageData(colorImg, 0, 0);
  bumpCtx.putImageData(bumpImg, 0, 0);
  roughCtx.putImageData(roughImg, 0, 0);

  const configureTex = (canvas: HTMLCanvasElement, isColor: boolean) => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatU, repeatV);
    tex.anisotropy = maxAnisotropy;
    if (isColor) {
      tex.colorSpace = THREE.SRGBColorSpace;
    }
    tex.needsUpdate = true;
    return tex;
  };

  const map = configureTex(colorCanvas, true);
  const bumpMap = configureTex(bumpCanvas, false);
  const roughnessMap = configureTex(roughCanvas, false);

  return {
    map,
    bumpMap,
    roughnessMap,
    dispose: () => {
      map.dispose();
      bumpMap.dispose();
      roughnessMap.dispose();
    },
  };
}

/**
 * Generates a radial 512x512 circular motocross dirt-track loop texture (UV centered at 0.5, 0.5)
 * with concentric tire ruts, gravel berms, mossy edge, and painted start/finish chalk line.
 */
export function createCircularMotoTrackTextureSet(
  style: 'mud_ruts' | 'gravel_berm' = 'mud_ruts',
  maxAnisotropy = 4
): TreeTextureSet {
  const size = 512;

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const colorCtx = colorCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bumpCtx = bumpCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const roughCtx = roughCanvas.getContext('2d')!;

  const colorImg = colorCtx.createImageData(size, size);
  const bumpImg = bumpCtx.createImageData(size, size);
  const roughImg = roughCtx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    const dy = y / size - 0.5;
    for (let x = 0; x < size; x++) {
      const dx = x / size - 0.5;
      const idx = (y * size + x) * 4;

      const rad = Math.hypot(dx, dy) * 2;
      const ang = Math.atan2(dy, dx);

      const wobble = Math.sin(ang * 3 + 0.6) * 0.02 + Math.cos(ang * 5) * 0.01;
      const rTrack = rad + wobble;

      const trackCenter = 0.71;
      const distFromTrack = Math.abs(rTrack - trackCenter);
      const inTrack = Math.max(0, 1 - Math.max(0, (distFromTrack - 0.14) * 14));

      const rutA = Math.exp(-Math.pow((rTrack - 0.66) * 26, 2));
      const rutB = Math.exp(-Math.pow((rTrack - 0.76) * 26, 2));
      const rut = Math.min(1, rutA + rutB);
      const knobby = 0.5 + 0.5 * Math.sin(ang * 140);

      const clod = hash2D(Math.floor(x / 3), Math.floor(y / 3));
      const grit = hash2D(x, y);

      const isStartZone =
        Math.abs(ang) < 0.045 && rTrack > 0.56 && rTrack < 0.86;
      const checker =
        ((Math.floor((rTrack - 0.56) * 40) + Math.floor((ang + 0.045) * 60)) & 1) === 0;

      const h = Math.max(
        0,
        Math.min(
          1,
          0.55 + clod * 0.24 + grit * 0.12 - rut * 0.34 + rut * knobby * 0.16
        )
      );

      let r: number;
      let g: number;
      let b: number;

      if (style === 'gravel_berm') {
        const shade = 0.58 + h * 0.48 - rut * 0.12;
        const mossBlend = (1 - inTrack) * 0.52;
        r = 128 * shade * (1 - mossBlend) + 64 * mossBlend;
        g = 106 * shade * (1 - mossBlend) + 84 * mossBlend;
        b = 80 * shade * (1 - mossBlend) + 52 * mossBlend;
      } else {
        const shade = 0.48 + h * 0.58 - rut * 0.16;
        const mossBlend = (1 - inTrack) * 0.65;
        r = 94 * shade * (1 - mossBlend) + 52 * mossBlend;
        g = 68 * shade * (1 - mossBlend) + 76 * mossBlend;
        b = 46 * shade * (1 - mossBlend) + 46 * mossBlend;
      }

      if (isStartZone && checker) {
        r = r * 0.35 + 225 * 0.65;
        g = g * 0.35 + 218 * 0.65;
        b = b * 0.35 + 202 * 0.65;
      }

      colorImg.data[idx] = clampByte(r);
      colorImg.data[idx + 1] = clampByte(g);
      colorImg.data[idx + 2] = clampByte(b);
      colorImg.data[idx + 3] = 255;

      const bumpByte = clampByte(h * 255);
      bumpImg.data[idx] = bumpByte;
      bumpImg.data[idx + 1] = bumpByte;
      bumpImg.data[idx + 2] = bumpByte;
      bumpImg.data[idx + 3] = 255;

      const roughByte = clampByte(242 - rut * 85 - (isStartZone ? 25 : 0));
      roughImg.data[idx] = roughByte;
      roughImg.data[idx + 1] = roughByte;
      roughImg.data[idx + 2] = roughByte;
      roughImg.data[idx + 3] = 255;
    }
  }

  colorCtx.putImageData(colorImg, 0, 0);
  bumpCtx.putImageData(bumpImg, 0, 0);
  roughCtx.putImageData(roughImg, 0, 0);

  const configureTex = (canvas: HTMLCanvasElement, isColor: boolean) => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = maxAnisotropy;
    if (isColor) {
      tex.colorSpace = THREE.SRGBColorSpace;
    }
    tex.needsUpdate = true;
    return tex;
  };

  const map = configureTex(colorCanvas, true);
  const bumpMap = configureTex(bumpCanvas, false);
  const roughnessMap = configureTex(roughCanvas, false);

  return {
    map,
    bumpMap,
    roughnessMap,
    dispose: () => {
      map.dispose();
      bumpMap.dispose();
      roughnessMap.dispose();
    },
  };
}
