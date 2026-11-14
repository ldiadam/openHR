import React, { useEffect, useRef, useState } from 'react';
import { Check, Eraser, ImageUp } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

/**
 * Draw-or-upload signature pad.
 *
 * Emits a PNG data URL, matching how the rest of the app already transports
 * images (leave attachments, camera captures). Pointer events are used so the
 * same code works with a mouse, a stylus and a finger.
 */

interface SignaturePadProps {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  label?: string;
  /** Rendered inside the pad when nothing has been drawn yet. */
  hint?: string;
  disabled?: boolean;
  height?: number;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({
  value,
  onChange,
  label,
  hint,
  disabled = false,
  height = 150,
}) => {
  const { tr } = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(Boolean(value));

  // Size the backing store to the CSS box and DPR so lines stay crisp.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0f172a';
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Reflect an externally-cleared value (e.g. the form reset itself).
  useEffect(() => {
    if (!value && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      const canvas = canvasRef.current;
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasInk(false);
    }
    if (value) setHasInk(true);
  }, [value]);

  const pointFrom = (event: React.PointerEvent): { x: number; y: number } => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const beginStroke = (event: React.PointerEvent) => {
    if (disabled) return;
    event.preventDefault();
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    drawingRef.current = true;
    lastPointRef.current = pointFrom(event);
  };

  const extendStroke = (event: React.PointerEvent) => {
    if (!drawingRef.current || disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const point = pointFrom(event);
    const last = lastPointRef.current || point;

    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();

    lastPointRef.current = point;
    if (!hasInk) setHasInk(true);
  };

  const endStroke = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;

    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange(canvas.toDataURL('image/png'));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasInk(false);
    onChange(null);
  };

  const upload = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl) return;

      // Scale the uploaded image into the pad so the preview matches the output.
      const image = new Image();
      image.onload = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        const rect = canvas.getBoundingClientRect();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const ratio = Math.min(rect.width / image.width, rect.height / image.height);
        const width = image.width * ratio;
        const drawHeight = image.height * ratio;
        ctx.drawImage(image, (rect.width - width) / 2, (rect.height - drawHeight) / 2, width, drawHeight);

        setHasInk(true);
        onChange(canvas.toDataURL('image/png'));
      };
      image.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] font-semibold text-slate-700">
          {label || tr('Tanda tangan', 'Signature')}
        </label>
        <div className="flex items-center gap-1">
          {hasInk && (
            <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
              <Check size={9} /> {tr('terisi', 'signed')}
            </span>
          )}
          <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-50">
            <ImageUp size={11} className="mr-1 inline" />
            {tr('Unggah', 'Upload')}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={disabled}
              onChange={(event) => upload(event.target.files?.[0] || null)}
            />
          </label>
          <button
            type="button"
            onClick={clear}
            disabled={disabled || !hasInk}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
          >
            <Eraser size={11} /> {tr('Hapus', 'Clear')}
          </button>
        </div>
      </div>

      <div
        className={`relative overflow-hidden rounded-xl border-2 border-dashed bg-white ${
          disabled ? 'border-slate-200 opacity-60' : 'border-slate-300'
        }`}
        style={{ height }}
      >
        <canvas
          ref={canvasRef}
          className={`block h-full w-full ${disabled ? '' : 'cursor-crosshair touch-none'}`}
          onPointerDown={beginStroke}
          onPointerMove={extendStroke}
          onPointerUp={endStroke}
          onPointerLeave={endStroke}
          onPointerCancel={endStroke}
        />
        {!hasInk && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-[10px] text-slate-300">
            {hint || tr('Tanda tangan di sini', 'Sign here')}
          </span>
        )}
      </div>
      <p className="text-[9px] text-slate-400">
        {tr(
          'Gambar tanda tangan dengan mouse/sentuhan, atau unggah gambar.',
          'Draw the signature with a mouse or finger, or upload an image.'
        )}
      </p>
    </div>
  );
};
