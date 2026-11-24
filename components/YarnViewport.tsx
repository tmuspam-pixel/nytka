'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildYarnCreature, YarnCreatureInstance } from '@/lib/three/yarnCreature';
import {
  buildYarnMotorcycle,
  YarnMotorcycleInstance,
} from '@/lib/three/yarnMotorcycle';
import {
  buildYarnForest,
  buildYarnTree,
  YarnForestInstance,
  YarnTreeInstance,
} from '@/lib/three/yarnTree';
import {
  buildMotoTrackCourse,
  buildTrackObstacle,
  MotoTrackCourseInstance,
  TrackObstacleInstance,
} from '@/lib/three/yarnTrack';
import {
  createMotoTrackTextureSet,
  createStudioFloorTextures,
  TreeTextureSet,
} from '@/lib/three/yarnTextures';
import { exportCreatureToGLB } from '@/lib/three/exportCreature';
import {
  CameraPresetId,
  ObstacleType,
  StageElementId,
  TrackSurfaceId,
  TreeVariantId,
  YarnCreatureConfig,
  YarnPose,
} from '@/lib/three/types';

interface YarnViewportProps {
  config: YarnCreatureConfig;
  pose: YarnPose;
  exploded: number;
  autoRotate: boolean;
  focusElement: StageElementId;
  trackSurface: TrackSurfaceId;
  hasMotorcycle: boolean;
  showTrees: boolean;
  showObstacles: boolean;
  centerTreeVariant: TreeVariantId;
  centerTreeBark: 'spruce' | 'birch';
  centerTreeFoliage: { color: string; sheen: string };
  centerTreeScale: number;
  centerObstacleType: ObstacleType;
  centerObstacleScale: number;
  bikeSteer: number;
  bikeSpeed: number;
  rideSeatY: number;
  rideSeatZ: number;
  rideLean: number;
  onToggleRide?: () => void;
  cameraPreset: CameraPresetId;
  cameraTrigger: number;
  onStatsChange?: (stats: {
    triangles: number;
    parts: number;
    fibers: number;
  }) => void;
  exportTrigger: number;
  onExportComplete?: (success: boolean, error?: string) => void;
}

const CAMERA_PRESETS: Record<
  CameraPresetId,
  { pos: [number, number, number]; target: [number, number, number] }
> = {
  hero: { pos: [1.45, 1.2, 2.15], target: [0, 0.68, 0] },
  face: { pos: [0.18, 1.18, 1.05], target: [0, 1.08, 0.05] },
  side: { pos: [2.25, 0.92, 0.15], target: [0, 0.68, -0.05] },
  back: { pos: [-0.95, 1.05, -2.15], target: [0, 0.65, -0.15] },
  top: { pos: [0.0, 2.55, 0.95], target: [0, 0.65, -0.08] },
};

const FOCUS_CAMERA_FRAMES: Record<
  StageElementId,
  { pos: [number, number, number]; target: [number, number, number] }
> = {
  scene: { pos: [2.25, 1.55, 3.05], target: [0, 0.58, -0.05] },
  creature: { pos: [1.45, 1.2, 2.15], target: [0, 0.68, 0] },
  motorcycle: { pos: [1.35, 0.9, 1.65], target: [0, 0.42, 0] },
  tree: { pos: [1.75, 1.25, 2.35], target: [0, 0.78, 0] },
  obstacle: { pos: [1.15, 0.78, 1.45], target: [0, 0.24, 0] },
};

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

export default function YarnViewport({
  config,
  pose,
  exploded,
  autoRotate,
  focusElement,
  trackSurface,
  hasMotorcycle,
  showTrees,
  showObstacles,
  centerTreeVariant,
  centerTreeBark,
  centerTreeFoliage,
  centerTreeScale,
  centerObstacleType,
  centerObstacleScale,
  bikeSteer,
  bikeSpeed,
  rideSeatY,
  rideSeatZ,
  rideLean,
  onToggleRide,
  cameraPreset,
  cameraTrigger,
  onStatsChange,
  exportTrigger,
  onExportComplete,
}: YarnViewportProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [contextLost, setContextLost] = useState(false);

  // Mutable refs for 60fps loop without tearing down WebGL
  const poseRef = useRef<YarnPose>(pose);
  const explodedRef = useRef<number>(exploded);
  const autoRotateRef = useRef<boolean>(autoRotate);
  const focusElementRef = useRef<StageElementId>(focusElement);
  const trackSurfaceRef = useRef<TrackSurfaceId>(trackSurface);
  const hasMotorcycleRef = useRef<boolean>(hasMotorcycle);
  const showTreesRef = useRef<boolean>(showTrees);
  const showObstaclesRef = useRef<boolean>(showObstacles);
  const bikeSteerRef = useRef<number>(bikeSteer);
  const bikeSpeedRef = useRef<number>(bikeSpeed);
  const rideSeatYRef = useRef<number>(rideSeatY);
  const rideSeatZRef = useRef<number>(rideSeatZ);
  const rideLeanRef = useRef<number>(rideLean);
  const showTailRef = useRef<boolean>(config.showTail);
  const onToggleRideRef = useRef(onToggleRide);
  const onStatsChangeRef = useRef(onStatsChange);

  const creatureRef = useRef<YarnCreatureInstance | null>(null);
  const bikeRef = useRef<YarnMotorcycleInstance | null>(null);
  const forestRef = useRef<YarnForestInstance | null>(null);
  const trackCourseRef = useRef<MotoTrackCourseInstance | null>(null);
  const centerTreeRef = useRef<YarnTreeInstance | null>(null);
  const centerObstacleRef = useRef<TrackObstacleInstance | null>(null);
  const applyPlinthSurfaceRef = useRef<((s: TrackSurfaceId) => void) | null>(
    null
  );
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const maxAnisotropyRef = useRef<number>(4);

  const camTransitionRef = useRef<{
    active: boolean;
    targetPos: THREE.Vector3;
    targetLook: THREE.Vector3;
  }>({
    active: false,
    targetPos: new THREE.Vector3(2.25, 1.55, 3.05),
    targetLook: new THREE.Vector3(0, 0.58, -0.05),
  });

  useEffect(() => {
    poseRef.current = pose;
  }, [pose]);

  useEffect(() => {
    explodedRef.current = exploded;
  }, [exploded]);

  useEffect(() => {
    autoRotateRef.current = autoRotate;
    if (controlsRef.current) {
      controlsRef.current.autoRotate = autoRotate;
    }
  }, [autoRotate]);

  useEffect(() => {
    focusElementRef.current = focusElement;
    const frame = FOCUS_CAMERA_FRAMES[focusElement];
    camTransitionRef.current.targetPos.set(...frame.pos);
    camTransitionRef.current.targetLook.set(...frame.target);
    camTransitionRef.current.active = true;
  }, [focusElement]);

  useEffect(() => {
    trackSurfaceRef.current = trackSurface;
    applyPlinthSurfaceRef.current?.(trackSurface);
    trackCourseRef.current?.setSurface(trackSurface);
  }, [trackSurface]);

  useEffect(() => {
    hasMotorcycleRef.current = hasMotorcycle;
  }, [hasMotorcycle]);

  useEffect(() => {
    showTreesRef.current = showTrees;
  }, [showTrees]);

  useEffect(() => {
    showObstaclesRef.current = showObstacles;
  }, [showObstacles]);

  useEffect(() => {
    bikeSteerRef.current = bikeSteer;
  }, [bikeSteer]);

  useEffect(() => {
    bikeSpeedRef.current = bikeSpeed;
  }, [bikeSpeed]);

  useEffect(() => {
    rideSeatYRef.current = rideSeatY;
  }, [rideSeatY]);

  useEffect(() => {
    rideSeatZRef.current = rideSeatZ;
  }, [rideSeatZ]);

  useEffect(() => {
    rideLeanRef.current = rideLean;
  }, [rideLean]);

  useEffect(() => {
    showTailRef.current = config.showTail;
  }, [config.showTail]);

  useEffect(() => {
    onToggleRideRef.current = onToggleRide;
  }, [onToggleRide]);

  useEffect(() => {
    onStatsChangeRef.current = onStatsChange;
  }, [onStatsChange]);

  const reportCombinedStats = () => {
    const focus = focusElementRef.current;
    let triangles = 0;
    let parts = 0;
    let fibers = 0;

    if (focus === 'tree') {
      const s = centerTreeRef.current?.getStats() ?? { triangles: 0, parts: 0 };
      triangles += s.triangles;
      parts += s.parts;
    } else if (focus === 'obstacle') {
      const s = centerObstacleRef.current?.getStats() ?? {
        triangles: 0,
        parts: 0,
      };
      triangles += s.triangles;
      parts += s.parts;
    } else if (focus === 'motorcycle') {
      const s = bikeRef.current?.getStats() ?? { triangles: 0, parts: 0 };
      triangles += s.triangles;
      parts += s.parts;
    } else {
      const cStats = creatureRef.current?.getStats() ?? {
        triangles: 0,
        parts: 0,
        fibers: 0,
      };
      triangles += cStats.triangles;
      parts += cStats.parts;
      fibers = cStats.fibers;

      if (
        bikeRef.current &&
        (hasMotorcycleRef.current || poseRef.current === 'ride')
      ) {
        const bStats = bikeRef.current.getStats();
        triangles += bStats.triangles;
        parts += bStats.parts;
      }
      if (focus === 'scene') {
        if (forestRef.current && showTreesRef.current) {
          const fStats = forestRef.current.getStats();
          triangles += fStats.triangles;
          parts += fStats.parts;
        }
        if (trackCourseRef.current) {
          const tStats = trackCourseRef.current.getStats();
          triangles += tStats.triangles;
          parts += tStats.parts;
        }
      }
    }

    onStatsChangeRef.current?.({ triangles, parts, fibers });
  };

  // Trigger camera preset transition
  useEffect(() => {
    if (cameraTrigger === 0) return;
    const preset = CAMERA_PRESETS[cameraPreset];
    const duoOffset =
      focusElementRef.current === 'scene' || config.duoMode || hasMotorcycle
        ? 0.45
        : 0;
    camTransitionRef.current.targetPos.set(
      preset.pos[0],
      preset.pos[1] + duoOffset * 0.2,
      preset.pos[2] + duoOffset
    );
    camTransitionRef.current.targetLook.set(
      preset.target[0],
      preset.target[1],
      preset.target[2]
    );
    camTransitionRef.current.active = true;
  }, [cameraPreset, cameraTrigger, config.duoMode, hasMotorcycle]);

  // Trigger GLB export matching the current stage focus
  useEffect(() => {
    if (exportTrigger === 0) return;
    const focus = focusElementRef.current;

    if (focus === 'tree' && centerTreeRef.current) {
      exportCreatureToGLB(
        centerTreeRef.current.exportRoot,
        `yarny-tree-${centerTreeVariant}.glb`
      )
        .then(() => onExportComplete?.(true))
        .catch((err) =>
          onExportComplete?.(
            false,
            err instanceof Error ? err.message : 'Помилка експорту'
          )
        );
      return;
    }

    if (focus === 'obstacle' && centerObstacleRef.current) {
      exportCreatureToGLB(
        centerObstacleRef.current.exportRoot,
        `yarny-obstacle-${centerObstacleType}.glb`
      )
        .then(() => onExportComplete?.(true))
        .catch((err) =>
          onExportComplete?.(
            false,
            err instanceof Error ? err.message : 'Помилка експорту'
          )
        );
      return;
    }

    if (focus === 'motorcycle' && bikeRef.current) {
      exportCreatureToGLB(bikeRef.current.exportRoot, 'yarny-motorcycle.glb')
        .then(() => onExportComplete?.(true))
        .catch((err) =>
          onExportComplete?.(
            false,
            err instanceof Error ? err.message : 'Помилка експорту'
          )
        );
      return;
    }

    const creature = creatureRef.current;
    if (!creature) return;

    const bikeActive =
      (hasMotorcycleRef.current || poseRef.current === 'ride') &&
      bikeRef.current;
    const treesActive =
      focus === 'scene' && showTreesRef.current && forestRef.current;
    const trackActive = focus === 'scene' && trackCourseRef.current;

    if (
      (bikeActive && bikeRef.current) ||
      (treesActive && forestRef.current) ||
      trackActive
    ) {
      const tempWrapper = new THREE.Group();
      tempWrapper.name = 'YarnySceneExport';
      const cClone = creature.exportRoot;
      const cParent = cClone.parent;
      cClone.position.copy(creature.group.position);
      cClone.rotation.copy(creature.group.rotation);
      tempWrapper.add(cClone);

      const bClone =
        bikeActive && bikeRef.current ? bikeRef.current.exportRoot : null;
      const bParent = bClone ? bClone.parent : null;
      if (bClone && bikeRef.current) {
        bClone.position.copy(bikeRef.current.group.position);
        bClone.rotation.copy(bikeRef.current.group.rotation);
        tempWrapper.add(bClone);
      }

      const fClone =
        treesActive && forestRef.current ? forestRef.current.group : null;
      const fParent = fClone ? fClone.parent : null;
      if (fClone) tempWrapper.add(fClone);

      const tClone =
        trackActive && trackCourseRef.current
          ? trackCourseRef.current.group
          : null;
      const tParent = tClone ? tClone.parent : null;
      if (tClone) tempWrapper.add(tClone);

      const restoreRoots = () => {
        cClone.position.set(0, 0, 0);
        cClone.rotation.set(0, 0, 0);
        if (cParent) cParent.add(cClone);
        if (bClone) {
          bClone.position.set(0, 0, 0);
          bClone.rotation.set(0, 0, 0);
          if (bParent) bParent.add(bClone);
        }
        if (fClone && fParent) fParent.add(fClone);
        if (tClone && tParent) tParent.add(tClone);
      };

      const filename =
        focus === 'scene'
          ? 'yarny-full-mototrack-scene.glb'
          : 'yarny-motorcycle-scene.glb';
      exportCreatureToGLB(tempWrapper, filename)
        .then(() => {
          restoreRoots();
          onExportComplete?.(true);
        })
        .catch((err) => {
          restoreRoots();
          onExportComplete?.(
            false,
            err instanceof Error ? err.message : 'Помилка експорту'
          );
        });
      return;
    }

    exportCreatureToGLB(
      creature.exportRoot,
      config.duoMode ? 'yarny-duo-unravel2.glb' : 'yarny-unravel2.glb'
    )
      .then(() => onExportComplete?.(true))
      .catch((err) =>
        onExportComplete?.(
          false,
          err instanceof Error ? err.message : 'Помилка експорту'
        )
      );
  }, [
    exportTrigger,
    config.duoMode,
    centerTreeVariant,
    centerObstacleType,
    onExportComplete,
  ]);

  // Mount Three.js scene once
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2)
    );
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    maxAnisotropyRef.current = renderer.capabilities.getMaxAnisotropy();

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const handleContextRestored = () => {
      setContextLost(false);
    };
    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    const scene = new THREE.Scene();
    const bgHex = 0x12151b;
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.FogExp2(bgHex, 0.065);
    sceneRef.current = scene;

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.08, 45);
    camera.position.set(1.45, 1.2, 2.15);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.target.set(0, 0.68, 0);
    controls.minDistance = 0.65;
    controls.maxDistance = 5.5;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.autoRotate = autoRotateRef.current;
    controls.autoRotateSpeed = 0.85;
    controlsRef.current = controls;

    const onControlStart = () => {
      camTransitionRef.current.active = false;
    };
    controls.addEventListener('start', onControlStart);

    // 3-Point Warm/Cool Studio Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0xa4c6ff, 0x2a231e, 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1de, 2.35);
    keyLight.position.set(2.4, 3.8, 2.6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    const d = 3.6;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 12;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xffcda3, 1.75);
    rimLight.position.set(-2.2, 2.1, -2.5);
    scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0x93b7ff, 0.65);
    fillLight.position.set(-2.4, 1.2, 1.8);
    scene.add(fillLight);

    // Grounded Wooden Craft Studio Plinth + switchable Moto-Track top cap
    const floorTextures = createStudioFloorTextures(maxAnisotropyRef.current);
    const mudPlinthTex: TreeTextureSet = createMotoTrackTextureSet(
      'mud_ruts',
      2,
      2,
      maxAnisotropyRef.current
    );
    const gravelPlinthTex: TreeTextureSet = createMotoTrackTextureSet(
      'gravel_berm',
      2,
      2,
      maxAnisotropyRef.current
    );

    const plinthProfile = [
      new THREE.Vector2(0.0, -0.14),
      new THREE.Vector2(1.58, -0.14),
      new THREE.Vector2(1.62, -0.1),
      new THREE.Vector2(1.62, -0.02),
      new THREE.Vector2(1.57, 0.0),
      new THREE.Vector2(0.0, 0.0),
    ];
    const plinthGeo = new THREE.LatheGeometry(plinthProfile, 64);
    const plinthMat = new THREE.MeshStandardMaterial({
      map: floorTextures.woodMap,
      roughnessMap: floorTextures.woodRoughness,
      roughness: 0.78,
      metalness: 0.04,
    });
    const plinthMesh = new THREE.Mesh(plinthGeo, plinthMat);
    plinthMesh.receiveShadow = true;
    scene.add(plinthMesh);

    const plinthTopGeo = new THREE.CircleGeometry(1.57, 64);
    plinthTopGeo.rotateX(-Math.PI / 2);
    const plinthTopMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: floorTextures.woodMap,
      roughnessMap: floorTextures.woodRoughness,
      roughness: 0.85,
      metalness: 0.03,
    });
    const plinthTopMesh = new THREE.Mesh(plinthTopGeo, plinthTopMat);
    plinthTopMesh.position.y = 0.001;
    plinthTopMesh.receiveShadow = true;
    scene.add(plinthTopMesh);

    const applyPlinthSurface = (surface: TrackSurfaceId) => {
      if (surface === 'moto_track') {
        plinthTopMat.map = mudPlinthTex.map;
        plinthTopMat.bumpMap = mudPlinthTex.bumpMap;
        plinthTopMat.bumpScale = 0.042;
        plinthTopMat.roughnessMap = mudPlinthTex.roughnessMap;
        plinthTopMat.roughness = 0.92;
      } else if (surface === 'gravel') {
        plinthTopMat.map = gravelPlinthTex.map;
        plinthTopMat.bumpMap = gravelPlinthTex.bumpMap;
        plinthTopMat.bumpScale = 0.035;
        plinthTopMat.roughnessMap = gravelPlinthTex.roughnessMap;
        plinthTopMat.roughness = 0.9;
      } else {
        plinthTopMat.map = floorTextures.woodMap;
        plinthTopMat.bumpMap = null;
        plinthTopMat.roughnessMap = floorTextures.woodRoughness;
        plinthTopMat.roughness = 0.78;
      }
      plinthTopMat.needsUpdate = true;
    };
    applyPlinthSurfaceRef.current = applyPlinthSurface;
    applyPlinthSurface(trackSurfaceRef.current);

    const studioGroundGeo = new THREE.CircleGeometry(18, 48);
    studioGroundGeo.rotateX(-Math.PI / 2);
    const studioGroundMat = new THREE.MeshStandardMaterial({
      color: 0x101318,
      roughness: 0.94,
      metalness: 0.02,
    });
    const studioGround = new THREE.Mesh(studioGroundGeo, studioGroundMat);
    studioGround.position.y = -0.141;
    studioGround.receiveShadow = true;
    scene.add(studioGround);

    const shadowPlaneGeo = new THREE.PlaneGeometry(1.85, 1.85);
    shadowPlaneGeo.rotateX(-Math.PI / 2);
    const shadowPlaneMat = new THREE.MeshBasicMaterial({
      map: floorTextures.shadowMap,
      transparent: true,
      depthWrite: false,
      opacity: 0.65,
    });
    const contactShadow = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
    contactShadow.position.y = 0.002;
    scene.add(contactShadow);

    // Studio wooden climbing beam (only during 'climb' pose)
    const climbWallGroup = new THREE.Group();
    climbWallGroup.position.set(-0.46, 0, 0.24);
    climbWallGroup.rotation.y = -0.35;
    climbWallGroup.scale.set(1, 0.001, 1);
    climbWallGroup.visible = false;

    const beamGeo = new THREE.BoxGeometry(0.24, 1.75, 0.24);
    const beamMat = new THREE.MeshStandardMaterial({
      map: floorTextures.woodMap,
      roughnessMap: floorTextures.woodRoughness,
      roughness: 0.82,
      metalness: 0.04,
    });
    const beamMesh = new THREE.Mesh(beamGeo, beamMat);
    beamMesh.position.y = 0.875;
    beamMesh.castShadow = true;
    beamMesh.receiveShadow = true;
    climbWallGroup.add(beamMesh);

    const pegGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.08, 10);
    pegGeo.rotateZ(Math.PI / 2);
    const pegMat = new THREE.MeshStandardMaterial({
      color: 0x8a6a4b,
      roughness: 0.72,
      metalness: 0.08,
    });
    for (let p = 0; p < 5; p++) {
      const peg = new THREE.Mesh(pegGeo, pegMat);
      peg.position.set(0.13, 0.28 + p * 0.28, (p % 2 === 0 ? 1 : -1) * 0.045);
      peg.castShadow = true;
      climbWallGroup.add(peg);
    }
    scene.add(climbWallGroup);

    // Build initial creature & motorcycle
    const initialCreature = buildYarnCreature(config, maxAnisotropyRef.current);
    scene.add(initialCreature.group);
    creatureRef.current = initialCreature;

    const initialBike = buildYarnMotorcycle({
      color: config.bikeColor,
      sheenColor: config.bikeSheenColor,
      accentColor: config.seatColor,
      yarnThickness: config.yarnThickness,
      fuzzDensity: config.fuzzDensity,
      maxAnisotropy: maxAnisotropyRef.current,
    });
    initialBike.group.visible = hasMotorcycleRef.current || poseRef.current === 'ride';
    scene.add(initialBike.group);
    bikeRef.current = initialBike;

    const initialForest = buildYarnForest({
      groundY: -0.141,
      maxAnisotropy: maxAnisotropyRef.current,
    });
    initialForest.group.visible =
      showTreesRef.current && focusElementRef.current === 'scene';
    scene.add(initialForest.group);
    forestRef.current = initialForest;

    const initialCourse = buildMotoTrackCourse({
      groundY: -0.141,
      surface: trackSurfaceRef.current,
      maxAnisotropy: maxAnisotropyRef.current,
    });
    initialCourse.group.visible = focusElementRef.current === 'scene';
    initialCourse.obstaclesGroup.visible = showObstaclesRef.current;
    scene.add(initialCourse.group);
    trackCourseRef.current = initialCourse;

    const initialCenterTree = buildYarnTree({
      variant: centerTreeVariant,
      barkVariant: centerTreeBark,
      foliageColor: centerTreeFoliage.color,
      foliageSheenColor: centerTreeFoliage.sheen,
      scale: centerTreeScale,
      seed: 1.5,
      maxAnisotropy: maxAnisotropyRef.current,
    });
    initialCenterTree.group.visible = focusElementRef.current === 'tree';
    scene.add(initialCenterTree.group);
    centerTreeRef.current = initialCenterTree;

    const initialCenterObstacle = buildTrackObstacle({
      type: centerObstacleType,
      scale: centerObstacleScale,
      maxAnisotropy: maxAnisotropyRef.current,
    });
    initialCenterObstacle.group.visible = focusElementRef.current === 'obstacle';
    scene.add(initialCenterObstacle.group);
    centerObstacleRef.current = initialCenterObstacle;

    // Frame initial focus cleanly on mount
    const initFrame = FOCUS_CAMERA_FRAMES[focusElementRef.current];
    camera.position.set(...initFrame.pos);
    controls.target.set(...initFrame.target);
    controls.update();

    reportCombinedStats();

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Raycaster click interaction on the motorcycle (click to hop on / off!)
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downX = 0;
    let downY = 0;

    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };
    const onPointerUp = (e: PointerEvent) => {
      const dist = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (dist > 6 || !bikeRef.current || !bikeRef.current.group.visible) return;
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObject(bikeRef.current.group, true);
      if (hits.length > 0) {
        onToggleRideRef.current?.();
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!bikeRef.current || !bikeRef.current.group.visible) {
        canvas.style.cursor = 'grab';
        return;
      }
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObject(bikeRef.current.group, true);
      canvas.style.cursor = hits.length > 0 ? 'pointer' : 'grab';
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointermove', onPointerMove);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;
    let climbWallScale = 0.001;
    const scratchLeftGrip = new THREE.Vector3();
    const scratchRightGrip = new THREE.Vector3();
    const scratchLeftPeg = new THREE.Vector3();
    const scratchRightPeg = new THREE.Vector3();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const dt = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.getElapsedTime();

      const focus = focusElementRef.current;
      const activePose = poseRef.current;
      const isRiding = activePose === 'ride' && (focus === 'scene' || focus === 'creature');
      const showCreature = focus === 'scene' || focus === 'creature';
      const showBike =
        focus === 'motorcycle' ||
        (showCreature && (hasMotorcycleRef.current || isRiding));
      const dampK = 1 - Math.exp(-9 * dt);

      if (bikeRef.current) {
        bikeRef.current.group.visible = showBike;
        if (showBike) {
          const soloBike = focus === 'motorcycle';
          const targetBikeX = soloBike || isRiding ? 0 : -0.45;
          const targetBikeZ = soloBike || isRiding ? 0 : -0.05;
          const targetBikeRy = soloBike ? 0.28 : isRiding ? 0 : 0.42;

          bikeRef.current.group.position.x = THREE.MathUtils.lerp(
            bikeRef.current.group.position.x,
            targetBikeX,
            dampK
          );
          bikeRef.current.group.position.z = THREE.MathUtils.lerp(
            bikeRef.current.group.position.z,
            targetBikeZ,
            dampK
          );
          bikeRef.current.group.rotation.y = THREE.MathUtils.lerp(
            bikeRef.current.group.rotation.y,
            targetBikeRy,
            dampK
          );

          bikeRef.current.update(
            elapsed,
            dt,
            isRiding || soloBike ? bikeSpeedRef.current : 0,
            isRiding || soloBike ? bikeSteerRef.current : 0.25,
            isRiding
          );

          if (isRiding) {
            bikeRef.current.forkPivot.updateMatrix();
            scratchLeftGrip
              .copy(bikeRef.current.anchors.leftGripObj.position)
              .applyMatrix4(bikeRef.current.forkPivot.matrix);
            scratchRightGrip
              .copy(bikeRef.current.anchors.rightGripObj.position)
              .applyMatrix4(bikeRef.current.forkPivot.matrix);
            scratchLeftPeg
              .copy(bikeRef.current.anchors.leftPegLocal)
              .setY(bikeRef.current.anchors.leftPegLocal.y + 0.022);
            scratchRightPeg
              .copy(bikeRef.current.anchors.rightPegLocal)
              .setY(bikeRef.current.anchors.rightPegLocal.y + 0.022);
          }
        }
      }

      if (creatureRef.current) {
        creatureRef.current.group.visible = showCreature;
        if (showCreature) {
          const targetCharX = isRiding ? 0 : showBike ? 0.38 : 0;
          const targetCharRy = isRiding ? 0 : showBike ? -0.22 : 0;
          creatureRef.current.group.position.x = THREE.MathUtils.lerp(
            creatureRef.current.group.position.x,
            targetCharX,
            dampK
          );
          creatureRef.current.group.rotation.y = THREE.MathUtils.lerp(
            creatureRef.current.group.rotation.y,
            targetCharRy,
            dampK
          );

          if (isRiding && bikeRef.current) {
            creatureRef.current.group.position.y =
              bikeRef.current.chassisGroup.position.y;
            creatureRef.current.group.rotation.z =
              bikeRef.current.chassisGroup.rotation.z;
          } else {
            creatureRef.current.group.position.y = THREE.MathUtils.lerp(
              creatureRef.current.group.position.y,
              0,
              dampK
            );
            creatureRef.current.group.rotation.z = THREE.MathUtils.lerp(
              creatureRef.current.group.rotation.z,
              0,
              dampK
            );
          }

          creatureRef.current.update(
            elapsed,
            dt,
            activePose,
            explodedRef.current,
            isRiding
              ? {
                  bikeSteer: bikeSteerRef.current,
                  bikeSpeed: bikeSpeedRef.current,
                  bikeLean: 0,
                  seatY:
                    (bikeRef.current?.anchors.seatLocal.y ?? 0.515) +
                    rideSeatYRef.current,
                  seatZ:
                    (bikeRef.current?.anchors.seatLocal.z ?? -0.2) +
                    rideSeatZRef.current,
                  riderLean: rideLeanRef.current,
                  showTail: showTailRef.current,
                  leftGripChassis: bikeRef.current ? scratchLeftGrip : undefined,
                  rightGripChassis: bikeRef.current
                    ? scratchRightGrip
                    : undefined,
                  leftPegChassis: bikeRef.current ? scratchLeftPeg : undefined,
                  rightPegChassis: bikeRef.current ? scratchRightPeg : undefined,
                }
              : {
                  showTail: showTailRef.current,
                }
          );
        }
      }

      // Smoothly reveal climbing beam during 'climb' pose
      const targetWall =
        showCreature && activePose === 'climb' ? 1 : 0.001;
      climbWallScale = THREE.MathUtils.damp(climbWallScale, targetWall, 10, dt);
      climbWallGroup.visible = climbWallScale > 0.02;
      climbWallGroup.scale.set(1, climbWallScale, 1);

      if (forestRef.current) {
        const treesVisible = focus === 'scene' && showTreesRef.current;
        forestRef.current.group.visible = treesVisible;
        if (treesVisible) {
          forestRef.current.update(elapsed);
        }
      }

      if (trackCourseRef.current) {
        const courseVisible = focus === 'scene';
        trackCourseRef.current.group.visible = courseVisible;
        trackCourseRef.current.obstaclesGroup.visible =
          courseVisible && showObstaclesRef.current;
        if (courseVisible && showObstaclesRef.current) {
          trackCourseRef.current.update(elapsed);
        }
      }

      if (centerTreeRef.current) {
        centerTreeRef.current.group.visible = focus === 'tree';
        if (focus === 'tree') {
          centerTreeRef.current.update(elapsed);
        }
      }

      if (centerObstacleRef.current) {
        centerObstacleRef.current.group.visible = focus === 'obstacle';
        if (focus === 'obstacle') {
          centerObstacleRef.current.update(elapsed);
        }
      }

      const trans = camTransitionRef.current;
      if (trans.active) {
        const damp = 1 - Math.exp(-7 * dt);
        camera.position.lerp(trans.targetPos, damp);
        controls.target.lerp(trans.targetLook, damp);
        if (
          camera.position.distanceTo(trans.targetPos) < 0.008 &&
          controls.target.distanceTo(trans.targetLook) < 0.008
        ) {
          camera.position.copy(trans.targetPos);
          controls.target.copy(trans.targetLook);
          trans.active = false;
        }
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      controls.removeEventListener('start', onControlStart);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);

      controls.dispose();
      creatureRef.current?.dispose();
      bikeRef.current?.dispose();
      forestRef.current?.dispose();
      trackCourseRef.current?.dispose();
      centerTreeRef.current?.dispose();
      centerObstacleRef.current?.dispose();
      plinthGeo.dispose();
      plinthMat.dispose();
      plinthTopGeo.dispose();
      plinthTopMat.dispose();
      mudPlinthTex.dispose();
      gravelPlinthTex.dispose();
      studioGroundGeo.dispose();
      studioGroundMat.dispose();
      shadowPlaneGeo.dispose();
      shadowPlaneMat.dispose();
      beamGeo.dispose();
      beamMat.dispose();
      pegGeo.dispose();
      pegMat.dispose();
      floorTextures.dispose();
      envTex.dispose();
      renderer.dispose();
      if (canvas.parentElement === container) {
        container.removeChild(canvas);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasMountedRef = useRef(false);

  // Rebuild creature & motorcycle cleanly whenever color / thickness / fuzz / duoMode changes
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    const scene = sceneRef.current;
    if (!scene) return;

    const prevCreature = creatureRef.current;
    const nextCreature = buildYarnCreature(config, maxAnisotropyRef.current);
    if (prevCreature) {
      nextCreature.group.position.copy(prevCreature.group.position);
      nextCreature.group.rotation.copy(prevCreature.group.rotation);
      scene.remove(prevCreature.group);
      prevCreature.dispose();
    }
    scene.add(nextCreature.group);
    creatureRef.current = nextCreature;

    const prevBike = bikeRef.current;
    const nextBike = buildYarnMotorcycle({
      color: config.bikeColor,
      sheenColor: config.bikeSheenColor,
      accentColor: config.seatColor,
      yarnThickness: config.yarnThickness,
      fuzzDensity: config.fuzzDensity,
      maxAnisotropy: maxAnisotropyRef.current,
    });
    if (prevBike) {
      nextBike.group.position.copy(prevBike.group.position);
      nextBike.group.rotation.copy(prevBike.group.rotation);
      nextBike.group.visible = prevBike.group.visible;
      scene.remove(prevBike.group);
      prevBike.dispose();
    }
    scene.add(nextBike.group);
    bikeRef.current = nextBike;

    reportCombinedStats();
  }, [config]);

  // Rebuild centered tree when tree editor controls change
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const prev = centerTreeRef.current;
    const next = buildYarnTree({
      variant: centerTreeVariant,
      barkVariant: centerTreeBark,
      foliageColor: centerTreeFoliage.color,
      foliageSheenColor: centerTreeFoliage.sheen,
      scale: centerTreeScale,
      seed: 1.5,
      maxAnisotropy: maxAnisotropyRef.current,
    });
    next.group.visible = focusElementRef.current === 'tree';
    if (prev) {
      scene.remove(prev.group);
      prev.dispose();
    }
    scene.add(next.group);
    centerTreeRef.current = next;
    reportCombinedStats();
  }, [centerTreeVariant, centerTreeBark, centerTreeFoliage, centerTreeScale]);

  // Rebuild centered obstacle when obstacle editor controls change
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const prev = centerObstacleRef.current;
    const next = buildTrackObstacle({
      type: centerObstacleType,
      scale: centerObstacleScale,
      maxAnisotropy: maxAnisotropyRef.current,
    });
    next.group.visible = focusElementRef.current === 'obstacle';
    if (prev) {
      scene.remove(prev.group);
      prev.dispose();
    }
    scene.add(next.group);
    centerObstacleRef.current = next;
    reportCombinedStats();
  }, [centerObstacleType, centerObstacleScale]);

  // Update stats when focus, motorcycle, trees, obstacles, or track surface toggles
  useEffect(() => {
    reportCombinedStats();
  }, [focusElement, hasMotorcycle, pose, showTrees, showObstacles, trackSurface]);

  return (
    <div className="relative w-full h-full">
      <div ref={mountRef} className="w-full h-full" />
      {contextLost && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#12151b]/95 text-center p-6">
          <div className="max-w-sm space-y-2">
            <p className="text-base font-semibold text-[#F2EFE9]">
              WebGL-контекст тимчасово призупинено
            </p>
            <p className="text-sm text-[#9DA4B0]">
              Відбувається відновлення 3D-сцени. Спробуйте оновити сторінку, якщо
              відображення не повернеться.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
