'use client';

import React, { useState } from 'react';
import { Check, Copy, Download, X } from 'lucide-react';
import { YarnCreatureConfig } from '@/lib/three/types';
import {
  generateStandaloneMotorcycleCode,
  generateStandaloneThreeJsCode,
} from '@/lib/three/exportCreature';

interface CodeExportModalProps {
  open: boolean;
  onClose: () => void;
  config: YarnCreatureConfig;
  onExportGLB: () => void;
}

export default function CodeExportModal({
  open,
  onClose,
  config,
  onExportGLB,
}: CodeExportModalProps) {
  const [copied, setCopied] = useState(false);
  const [fileTab, setFileTab] = useState<'creature' | 'motorcycle'>('creature');

  if (!open) return null;

  const code =
    fileTab === 'creature'
      ? generateStandaloneThreeJsCode(config)
      : generateStandaloneMotorcycleCode(config);

  const filename =
    fileTab === 'creature'
      ? 'createYarnCreature.js'
      : 'createYarnMotorcycle.js';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadJs = () => {
    const blob = new Blob([code], { type: 'text/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#090b0f]/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
    >
      <div className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-xl bg-[#161920] border border-white/10 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <h2
              id="export-modal-title"
              className="text-base font-semibold text-[#F2EFE9]"
            >
              Додати моделі у вашу Three.js сцену
            </h2>
            <p className="text-xs text-[#9DA4B0] mt-0.5">
              JS-код: 2 окремі модулі (персонаж + мотоцикл) • .GLB: 1 спільний файл сцени
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити вікно"
            className="p-2 rounded-lg text-[#9DA4B0] hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-3 bg-[#12141a] border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 bg-[#0b0d11] p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setFileTab('creature')}
              className={`px-2.5 py-1 rounded-md text-xs font-mono transition-colors cursor-pointer ${
                fileTab === 'creature'
                  ? 'bg-[#252a35] text-[#F2EFE9]'
                  : 'text-[#9DA4B0] hover:text-white'
              }`}
            >
              createYarnCreature.js
            </button>
            <button
              type="button"
              onClick={() => setFileTab('motorcycle')}
              className={`px-2.5 py-1 rounded-md text-xs font-mono transition-colors cursor-pointer ${
                fileTab === 'motorcycle'
                  ? 'bg-[#252a35] text-[#F2EFE9]'
                  : 'text-[#9DA4B0] hover:text-white'
              }`}
            >
              createYarnMotorcycle.js
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#F2EFE9] text-[#12151b] hover:bg-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Скопійовано
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Копіювати код
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleDownloadJs}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-[#F2EFE9] hover:bg-white/15 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              {filename}
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

        <div className="flex-1 overflow-auto p-5 bg-[#0f1116]">
          <pre className="text-xs leading-relaxed font-mono text-[#D5DBE5] whitespace-pre overflow-x-auto">
            <code>{code}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}
