'use client';

import React, { useEffect, useState } from 'react';
import {
  Bike,
  Camera,
  ChevronDown,
  ChevronUp,
  Code2,
  Download,
  Layers,
  Palette,
  Play,
  RotateCw,
  Users,
} from 'lucide-react';
import {
  BIKE_PRESETS,
  CameraPresetId,
  HELD_ITEMS,
  SEAT_PRESETS,
  YARN_PRESETS,
  YarnCreatureConfig,
  YarnPose,
} from '@/lib/three/types';

type DockTab = 'yarn' | 'motion' | 'export';

interface ControlDockProps {
  config: YarnCreatureConfig;
  onConfigChange: (next: YarnCreatureConfig) => void;
  pose: YarnPose;
  onPoseChange: (pose: YarnPose) => void;
  exploded: number;
  onExplodedChange: (val: number) => void;
  autoRotate: boolean;
  onAutoRotateChange: (val: boolean) => void;
  hasMotorcycle: boolean;
  onToggleMotorcycle: () => void;
  bikeSteer: number;
  onBikeSteerChange: (val: number) => void;
  bikeSpeed: number;
  onBikeSpeedChange: (val: number) => void;
  rideSeatY: number;
  onRideSeatYChange: (val: number) => void;
  rideSeatZ: number;
  onRideSeatZChange: (val: number) => void;
  rideLean: number;
  onRideLeanChange: (val: number) => void;
  cameraPreset: CameraPresetId;
  onCameraPresetSelect: (preset: CameraPresetId) => void;
  onExportGLB: () => void;
  onOpenCodeModal: () => void;
  exportMessage: string | null;
}

const POSE_OPTIONS: { id: YarnPose; label: string }[] = [
  { id: 'idle', label: 'Дихання' },
  { id: 'wave', label: 'Привітання' },
  { id: 'run', label: 'Біг' },
  { id: 'jump', label: 'Стрибок' },
  { id: 'climb', label: 'Лазіння' },
  { id: 'pull', label: 'Натяг' },
  { id: 'ride', label: 'На байку' },
  { id: 'tpose', label: 'T-поза' },
];

const CAMERA_OPTIONS: { id: CameraPresetId; label: string }[] = [
  { id: 'hero', label: 'Загальний' },
  { id: 'face', label: 'Обличчя' },
  { id: 'side', label: 'Профіль' },
  { id: 'back', label: 'Хвіст' },
  { id: 'top', label: 'Зверху' },
];

export default function ControlDock({
  config,
  onConfigChange,
  pose,
  onPoseChange,
  exploded,
  onExplodedChange,
  autoRotate,
  onAutoRotateChange,
  hasMotorcycle,
  onToggleMotorcycle,
  bikeSteer,
  onBikeSteerChange,
  bikeSpeed,
  onBikeSpeedChange,
  rideSeatY,
  onRideSeatYChange,
  rideSeatZ,
  onRideSeatZChange,
  rideLean,
  onRideLeanChange,
  cameraPreset,
  onCameraPresetSelect,
  onExportGLB,
  onOpenCodeModal,
  exportMessage,
}: ControlDockProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<DockTab>('yarn');

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key.toLowerCase() === 'h') {
        setCollapsed((c) => !c);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center pointer-events-none"
      style={{ width: 'min(940px, 95vw)' }}
    >
      {/* Collapse / Expand toggle tab */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="pointer-events-auto mb-1.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-t-lg rounded-b-md bg-[#161920]/95 border border-white/10 text-xs font-medium text-[#C5CBD6] hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
      >
        {collapsed ? (
          <>
            <ChevronUp className="w-3.5 h-3.5" />
            Показати панель
          </>
        ) : (
          <>
            <ChevronDown className="w-3.5 h-3.5" />
            Приховати панель
          </>
        )}
      </button>

      {/* Main Dock Surface (solid rgba, NO backdrop-filter over WebGL) */}
      <div
        className={`pointer-events-auto w-full rounded-xl bg-[#161920]/95 border border-white/10 shadow-2xl transition-all duration-200 ease-out overflow-hidden ${
          collapsed
            ? 'opacity-0 translate-y-6 pointer-events-none max-h-0 border-transparent'
            : 'opacity-100 translate-y-0 max-h-[420px]'
        }`}
      >
        {/* Top segmented navigation + quick actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 border-b border-white/10">
          <div className="flex items-center gap-1 bg-[#0f1116] p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab('yarn')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'yarn'
                  ? 'bg-[#252a35] text-[#F2EFE9]'
                  : 'text-[#9DA4B0] hover:text-white'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              Пряжа та форма
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('motion')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'motion'
                  ? 'bg-[#252a35] text-[#F2EFE9]'
                  : 'text-[#9DA4B0] hover:text-white'
              }`}
            >
              <Play className="w-3.5 h-3.5" />
              Поза та байк
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('export')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'export'
                  ? 'bg-[#252a35] text-[#F2EFE9]'
                  : 'text-[#9DA4B0] hover:text-white'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              Додати в Three.js
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleMotorcycle}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                hasMotorcycle || pose === 'ride'
                  ? 'bg-[#d18e2c]/20 border-[#d18e2c]/60 text-[#ffe0a3]'
                  : 'bg-white/5 border-white/10 text-[#C5CBD6] hover:text-white'
              }`}
            >
              <Bike className="w-3.5 h-3.5" />
              Мотоцикл
            </button>
            <button
              type="button"
              onClick={() =>
                onConfigChange({ ...config, duoMode: !config.duoMode })
              }
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                config.duoMode
                  ? 'bg-[#3474cc]/20 border-[#3474cc]/60 text-[#cfe2ff]'
                  : 'bg-white/5 border-white/10 text-[#C5CBD6] hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Дует
            </button>
            <button
              type="button"
              onClick={() => onAutoRotateChange(!autoRotate)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                autoRotate
                  ? 'bg-white/12 border-white/25 text-white'
                  : 'bg-white/5 border-white/10 text-[#9DA4B0] hover:text-white'
              }`}
            >
              <RotateCw className="w-3.5 h-3.5" />
              Оберт
            </button>
            <button
              type="button"
              onClick={onExportGLB}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#C93838] text-white hover:bg-[#d94444] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              .GLB
            </button>
          </div>
        </div>

        {/* Tab content */}
        <div className="px-4 py-3">
          {activeTab === 'yarn' && (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-medium text-[#9DA4B0] whitespace-nowrap">
                    Нитки
                  </span>
                  <div className="flex items-center gap-1.5">
                    {YARN_PRESETS.map((preset) => {
                      const active =
                        config.color.toLowerCase() === preset.color.toLowerCase();
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          title={preset.label}
                          onClick={() =>
                            onConfigChange({
                              ...config,
                              color: preset.color,
                              sheenColor: preset.sheenColor,
                              eyeColor: preset.eyeColor,
                            })
                          }
                          className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer ${
                            active
                              ? 'border-white scale-110'
                              : 'border-white/20 hover:scale-105'
                          }`}
                          style={{ backgroundColor: preset.color }}
                        />
                      );
                    })}
                    <label
                      title="Власний колір пряжі"
                      className="ml-1 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 border border-white/10 text-xs text-[#C5CBD6] hover:text-white cursor-pointer whitespace-nowrap"
                    >
                      <input
                        type="color"
                        value={config.color}
                        onChange={(e) =>
                          onConfigChange({
                            ...config,
                            color: e.target.value,
                            sheenColor: '#f5e8e4',
                          })
                        }
                        className="w-4 h-4 rounded border-0 bg-transparent p-0 cursor-pointer"
                      />
                      <span className="font-mono tabular-nums uppercase text-[11px]">
                        {config.color}
                      </span>
                    </label>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-xs text-[#C5CBD6]">
                    <span className="whitespace-nowrap">Товщина</span>
                    <input
                      type="range"
                      min={0.78}
                      max={1.28}
                      step={0.02}
                      value={config.yarnThickness}
                      onChange={(e) =>
                        onConfigChange({
                          ...config,
                          yarnThickness: parseFloat(e.target.value),
                        })
                      }
                      className="studio-slider w-20"
                    />
                    <span className="font-mono tabular-nums text-[11px] text-[#9DA4B0] w-8">
                      {config.yarnThickness.toFixed(2)}
                    </span>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-[#C5CBD6]">
                    <span className="whitespace-nowrap">Ворс</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={config.fuzzDensity}
                      onChange={(e) =>
                        onConfigChange({
                          ...config,
                          fuzzDensity: parseFloat(e.target.value),
                        })
                      }
                      className="studio-slider w-20"
                    />
                    <span className="font-mono tabular-nums text-[11px] text-[#9DA4B0] w-8">
                      {Math.round(config.fuzzDensity * 100)}%
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={() =>
                      onConfigChange({ ...config, showTail: !config.showTail })
                    }
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      config.showTail
                        ? 'bg-[#252a35] border-white/25 text-white'
                        : 'bg-white/5 border-white/10 text-[#9DA4B0] hover:text-white'
                    }`}
                  >
                    Хвіст: {config.showTail ? 'є' : 'приховано'}
                  </button>
                </div>
              </div>

              {/* Held item in palm socket */}
              <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-medium text-[#9DA4B0] mr-1 whitespace-nowrap">
                    У руці
                  </span>
                  {HELD_ITEMS.map((item) => {
                    const active = config.heldItem === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() =>
                          onConfigChange({ ...config, heldItem: item.id })
                        }
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          active
                            ? 'bg-[#F2EFE9] text-[#12151b]'
                            : 'bg-white/5 text-[#C5CBD6] hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>

                {config.heldItem !== 'none' && (
                  <div className="flex items-center gap-1 bg-[#0f1116] p-0.5 rounded-md">
                    <button
                      type="button"
                      onClick={() =>
                        onConfigChange({ ...config, heldHand: 'left' })
                      }
                      className={`px-2.5 py-0.5 rounded text-xs font-medium transition-colors cursor-pointer ${
                        config.heldHand === 'left'
                          ? 'bg-[#252a35] text-white'
                          : 'text-[#9DA4B0] hover:text-white'
                      }`}
                    >
                      Ліва рука
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onConfigChange({ ...config, heldHand: 'right' })
                      }
                      className={`px-2.5 py-0.5 rounded text-xs font-medium transition-colors cursor-pointer ${
                        config.heldHand === 'right'
                          ? 'bg-[#252a35] text-white'
                          : 'text-[#9DA4B0] hover:text-white'
                      }`}
                    >
                      Права рука
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'motion' && (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {POSE_OPTIONS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onPoseChange(p.id)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        pose === p.id
                          ? 'bg-[#F2EFE9] text-[#12151b]'
                          : 'bg-white/5 text-[#C5CBD6] hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <label className="flex items-center gap-2 text-xs text-[#C5CBD6]">
                  <Layers className="w-3.5 h-3.5 text-[#9DA4B0]" />
                  <span className="whitespace-nowrap">Розбір</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={exploded}
                    onChange={(e) => onExplodedChange(parseFloat(e.target.value))}
                    className="studio-slider w-20"
                  />
                  <span className="font-mono tabular-nums text-[11px] text-[#9DA4B0] w-8">
                    {Math.round(exploded * 100)}%
                  </span>
                </label>

                <div className="flex items-center gap-1 flex-wrap">
                  <Camera className="w-3.5 h-3.5 text-[#9DA4B0] mr-1" />
                  {CAMERA_OPTIONS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onCameraPresetSelect(c.id)}
                      className={`px-2 py-1 rounded-md text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        cameraPreset === c.id
                          ? 'bg-[#252a35] text-white border border-white/20'
                          : 'text-[#9DA4B0] hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {(hasMotorcycle || pose === 'ride') && (
                <div className="pt-2 border-t border-white/10 space-y-2">
                  {/* Bike & saddle colors */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[#9DA4B0] whitespace-nowrap">
                          Байк
                        </span>
                        <div className="flex items-center gap-1.5">
                          {BIKE_PRESETS.map((preset) => {
                            const active =
                              config.bikeColor.toLowerCase() ===
                              preset.color.toLowerCase();
                            return (
                              <button
                                key={preset.id}
                                type="button"
                                title={preset.label}
                                onClick={() =>
                                  onConfigChange({
                                    ...config,
                                    bikeColor: preset.color,
                                    bikeSheenColor: preset.sheenColor,
                                  })
                                }
                                className={`w-5 h-5 rounded-full border-2 transition-transform cursor-pointer ${
                                  active
                                    ? 'border-white scale-110'
                                    : 'border-white/20 hover:scale-105'
                                }`}
                                style={{ backgroundColor: preset.color }}
                              />
                            );
                          })}
                          <label
                            title="Власний колір байка"
                            className="inline-flex items-center px-1 py-0.5 rounded bg-white/5 border border-white/10 cursor-pointer"
                          >
                            <input
                              type="color"
                              value={config.bikeColor}
                              onChange={(e) =>
                                onConfigChange({
                                  ...config,
                                  bikeColor: e.target.value,
                                  bikeSheenColor: '#e6edf2',
                                })
                              }
                              className="w-4 h-4 rounded border-0 bg-transparent p-0 cursor-pointer"
                            />
                          </label>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[#9DA4B0] whitespace-nowrap">
                          Сідло
                        </span>
                        <div className="flex items-center gap-1.5">
                          {SEAT_PRESETS.map((preset) => {
                            const active =
                              config.seatColor.toLowerCase() ===
                              preset.color.toLowerCase();
                            return (
                              <button
                                key={preset.id}
                                type="button"
                                title={preset.label}
                                onClick={() =>
                                  onConfigChange({
                                    ...config,
                                    seatColor: preset.color,
                                  })
                                }
                                className={`w-5 h-5 rounded-full border-2 transition-transform cursor-pointer ${
                                  active
                                    ? 'border-white scale-110'
                                    : 'border-white/20 hover:scale-105'
                                }`}
                                style={{ backgroundColor: preset.color }}
                              />
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        onBikeSteerChange(0);
                        onRideSeatYChange(0);
                        onRideSeatZChange(0);
                        onRideLeanChange(0.24);
                      }}
                      className="text-[11px] text-[#9DA4B0] hover:text-white underline-offset-2 hover:underline cursor-pointer"
                    >
                      Скинути посадку
                    </button>
                  </div>

                  {/* Riding & posture sliders */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <label className="flex items-center gap-2 text-xs text-[#C5CBD6]">
                      <span className="whitespace-nowrap">Кермо</span>
                      <input
                        type="range"
                        min={-0.55}
                        max={0.55}
                        step={0.02}
                        value={bikeSteer}
                        onChange={(e) =>
                          onBikeSteerChange(parseFloat(e.target.value))
                        }
                        className="studio-slider w-20"
                      />
                      <span className="font-mono tabular-nums text-[11px] text-[#9DA4B0] w-8">
                        {Math.round((bikeSteer * 180) / Math.PI)}°
                      </span>
                    </label>

                    <label className="flex items-center gap-2 text-xs text-[#C5CBD6]">
                      <span className="whitespace-nowrap">Швидкість</span>
                      <input
                        type="range"
                        min={0}
                        max={4}
                        step={0.1}
                        value={bikeSpeed}
                        onChange={(e) =>
                          onBikeSpeedChange(parseFloat(e.target.value))
                        }
                        className="studio-slider w-20"
                      />
                      <span className="font-mono tabular-nums text-[11px] text-[#9DA4B0] w-7">
                        {bikeSpeed.toFixed(1)}
                      </span>
                    </label>

                    <label className="flex items-center gap-2 text-xs text-[#C5CBD6]">
                      <span className="whitespace-nowrap">Висота</span>
                      <input
                        type="range"
                        min={-0.06}
                        max={0.08}
                        step={0.005}
                        value={rideSeatY}
                        onChange={(e) =>
                          onRideSeatYChange(parseFloat(e.target.value))
                        }
                        className="studio-slider w-20"
                      />
                      <span className="font-mono tabular-nums text-[11px] text-[#9DA4B0] w-10">
                        {rideSeatY >= 0 ? `+${rideSeatY.toFixed(2)}` : rideSeatY.toFixed(2)}
                      </span>
                    </label>

                    <label className="flex items-center gap-2 text-xs text-[#C5CBD6]">
                      <span className="whitespace-nowrap">Позиція</span>
                      <input
                        type="range"
                        min={-0.08}
                        max={0.08}
                        step={0.005}
                        value={rideSeatZ}
                        onChange={(e) =>
                          onRideSeatZChange(parseFloat(e.target.value))
                        }
                        className="studio-slider w-20"
                      />
                      <span className="font-mono tabular-nums text-[11px] text-[#9DA4B0] w-10">
                        {rideSeatZ >= 0 ? `+${rideSeatZ.toFixed(2)}` : rideSeatZ.toFixed(2)}
                      </span>
                    </label>

                    <label className="flex items-center gap-2 text-xs text-[#C5CBD6]">
                      <span className="whitespace-nowrap">Нахил</span>
                      <input
                        type="range"
                        min={0.05}
                        max={0.55}
                        step={0.02}
                        value={rideLean}
                        onChange={(e) =>
                          onRideLeanChange(parseFloat(e.target.value))
                        }
                        className="studio-slider w-20"
                      />
                      <span className="font-mono tabular-nums text-[11px] text-[#9DA4B0] w-9">
                        {Math.round((rideLean * 180) / Math.PI)}°
                      </span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'export' && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-[#C5CBD6] leading-relaxed">
                Окремі модулі{' '}
                <span className="font-mono text-[#F2EFE9]">
                  createYarnCreature.js
                </span>{' '}
                та{' '}
                <span className="font-mono text-[#F2EFE9]">
                  createYarnMotorcycle.js
                </span>{' '}
                або спільний <span className="font-mono text-[#F2EFE9]">.GLB</span>.
                {exportMessage && (
                  <span className="ml-2 text-[#9bd6a8] font-medium">
                    · {exportMessage}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={onOpenCodeModal}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-[#F2EFE9] hover:bg-white/15 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Code2 className="w-3.5 h-3.5" />
                  Код для Three.js
                </button>
                <button
                  type="button"
                  onClick={onExportGLB}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-[#C93838] text-white hover:bg-[#d94444] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Завантажити .GLB
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
