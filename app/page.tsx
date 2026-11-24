'use client';

import React, { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  CameraPresetId,
  DEFAULT_CREATURE_CONFIG,
  YarnCreatureConfig,
  YarnPose,
} from '@/lib/three/types';
import ControlDock from '@/components/ControlDock';
import CodeExportModal from '@/components/CodeExportModal';

const YarnViewport = dynamic(() => import('@/components/YarnViewport'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#12151b] text-sm text-[#9DA4B0]">
      Підготовка 3D-сцени...
    </div>
  ),
});

export default function HomePage() {
  const [config, setConfig] = useState<YarnCreatureConfig>(
    DEFAULT_CREATURE_CONFIG
  );
  const [pose, setPose] = useState<YarnPose>('idle');
  const [exploded, setExploded] = useState<number>(0);
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [hasMotorcycle, setHasMotorcycle] = useState<boolean>(false);
  const [bikeSteer, setBikeSteer] = useState<number>(0);
  const [bikeSpeed, setBikeSpeed] = useState<number>(1.8);
  const [rideSeatY, setRideSeatY] = useState<number>(0);
  const [rideSeatZ, setRideSeatZ] = useState<number>(0);
  const [rideLean, setRideLean] = useState<number>(0.24);
  const [cameraPreset, setCameraPreset] = useState<CameraPresetId>('hero');
  const [cameraTrigger, setCameraTrigger] = useState<number>(0);
  const [exportTrigger, setExportTrigger] = useState<number>(0);
  const [codeModalOpen, setCodeModalOpen] = useState<boolean>(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    triangles: number;
    parts: number;
    fibers: number;
  }>({ triangles: 0, parts: 0, fibers: 0 });

  const handlePoseChange = useCallback((nextPose: YarnPose) => {
    setPose(nextPose);
    if (nextPose === 'ride') {
      setHasMotorcycle(true);
    }
  }, []);

  const handleToggleMotorcycle = useCallback(() => {
    setHasMotorcycle((prev) => {
      const next = !prev;
      if (!next && pose === 'ride') {
        setPose('idle');
      } else if (next && pose === 'idle') {
        setPose('ride');
      }
      return next;
    });
  }, [pose]);

  const handleToggleRide = useCallback(() => {
    setHasMotorcycle(true);
    setPose((prev) => (prev === 'ride' ? 'idle' : 'ride'));
  }, []);

  const handleCameraPresetSelect = useCallback((preset: CameraPresetId) => {
    setCameraPreset(preset);
    setCameraTrigger((n) => n + 1);
  }, []);

  const handleExportGLB = useCallback(() => {
    setExportMessage(null);
    setExportTrigger((n) => n + 1);
  }, []);

  const handleExportComplete = useCallback(
    (success: boolean, error?: string) => {
      if (success) {
        setExportMessage('Файл .GLB збережено');
      } else {
        setExportMessage(error || 'Помилка експорту');
      }
      setTimeout(() => setExportMessage(null), 3500);
    },
    []
  );

  // Keyboard shortcuts: R = reset camera, A/D = steer when riding, W/S = throttle
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key === 'r') {
        handleCameraPresetSelect('hero');
      } else if (pose === 'ride') {
        if (key === 'a' || e.key === 'ArrowLeft') {
          setBikeSteer((s) => Math.max(-0.55, s - 0.12));
        } else if (key === 'd' || e.key === 'ArrowRight') {
          setBikeSteer((s) => Math.min(0.55, s + 0.12));
        } else if (key === 'w' || e.key === 'ArrowUp') {
          setBikeSpeed((sp) => Math.min(4, sp + 0.35));
        } else if (key === 's' || e.key === 'ArrowDown') {
          setBikeSpeed((sp) => Math.max(0, sp - 0.35));
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleCameraPresetSelect, pose]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#12151b]">
      <div className="absolute inset-0">
        <YarnViewport
          config={config}
          pose={pose}
          exploded={exploded}
          autoRotate={autoRotate}
          hasMotorcycle={hasMotorcycle}
          bikeSteer={bikeSteer}
          bikeSpeed={bikeSpeed}
          rideSeatY={rideSeatY}
          rideSeatZ={rideSeatZ}
          rideLean={rideLean}
          onToggleRide={handleToggleRide}
          cameraPreset={cameraPreset}
          cameraTrigger={cameraTrigger}
          onStatsChange={setStats}
          exportTrigger={exportTrigger}
          onExportComplete={handleExportComplete}
        />
      </div>

      {/* Minimal Top-Left Header */}
      <header className="fixed top-5 left-6 z-20 pointer-events-none select-none">
        <h1 className="text-lg font-semibold tracking-tight text-[#F2EFE9]">
          Вʼязана 3D-фігурка
        </h1>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-[#9DA4B0]">
          <span>Стиль Unravel 2</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">{stats.parts} вузлів</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">{stats.fibers} ворсинок</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">
            {stats.triangles.toLocaleString('uk-UA')} трикутників
          </span>
        </div>
      </header>

      <ControlDock
        config={config}
        onConfigChange={setConfig}
        pose={pose}
        onPoseChange={handlePoseChange}
        exploded={exploded}
        onExplodedChange={setExploded}
        autoRotate={autoRotate}
        onAutoRotateChange={setAutoRotate}
        hasMotorcycle={hasMotorcycle}
        onToggleMotorcycle={handleToggleMotorcycle}
        bikeSteer={bikeSteer}
        onBikeSteerChange={setBikeSteer}
        bikeSpeed={bikeSpeed}
        onBikeSpeedChange={setBikeSpeed}
        rideSeatY={rideSeatY}
        onRideSeatYChange={setRideSeatY}
        rideSeatZ={rideSeatZ}
        onRideSeatZChange={setRideSeatZ}
        rideLean={rideLean}
        onRideLeanChange={setRideLean}
        cameraPreset={cameraPreset}
        onCameraPresetSelect={handleCameraPresetSelect}
        onExportGLB={handleExportGLB}
        onOpenCodeModal={() => setCodeModalOpen(true)}
        exportMessage={exportMessage}
      />

      <CodeExportModal
        open={codeModalOpen}
        onClose={() => setCodeModalOpen(false)}
        config={config}
        onExportGLB={handleExportGLB}
      />
    </main>
  );
}
