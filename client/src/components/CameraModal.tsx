import React, { useRef, useState, useEffect } from 'react';
import { ArrowLeft, Camera, RefreshCw, Check, Clock, MapPin, Eye, EyeOff, Upload } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useCompany } from '../context/CompanyContext';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (base64Photo: string) => void;
  title?: string;
  facingMode?: 'user' | 'environment';
  attendanceTime?: string;
  distanceMeters?: number | null;
  isOutsideOffice?: boolean;
  officeName?: string;
  coordsText?: string;
}

export const CameraModal: React.FC<CameraModalProps> = ({
  isOpen,
  onClose,
  onCapture,
  title,
  facingMode = 'user',
  attendanceTime,
  distanceMeters,
  isOutsideOffice,
  officeName,
  coordsText,
}) => {
  const { tr } = useLanguage();
  const { palette } = useCompany();
  const resolvedTitle = title ?? tr('Ambil Foto Selfie Presensi', 'Take Attendance Selfie Photo');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCoordsDetail, setShowCoordsDetail] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setPhoto(null);
      setError(null);
      return;
    }

    startCamera();

    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async () => {
    setError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(tr('Kamera tidak didukung pada browser ini.', 'Camera is not supported in this browser.'));
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 640 }, height: { ideal: 640 } },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err: any) {
      console.warn('Camera access issue:', err);
      setError(
        tr(
          'Kamera tidak dapat diakses. Anda dapat mengunggah file foto sebagai gantinya.',
          'Camera cannot be accessed. You can upload a photo file instead.'
        )
      );
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const takeSnapshot = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const rawW = video.videoWidth || 480;
    const rawH = video.videoHeight || 640;
    const maxDim = 640;
    const scale = Math.min(1, maxDim / Math.max(rawW, rawH));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(rawW * scale));
    canvas.height = Math.max(1, Math.round(rawH * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
    setPhoto(dataUrl);
    stopCamera();
  };

  const handleRetake = () => {
    setPhoto(null);
    startCamera();
  };

  const handleConfirm = () => {
    if (photo) {
      onCapture(photo);
      onClose();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setPhoto(reader.result as string);
        stopCamera();
      };
      reader.readAsDataURL(file);
    }
  };

  if (!isOpen) return null;

  const isFaceMode = facingMode === 'user';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="bg-[#1C1C1E] text-white sm:rounded-3xl overflow-hidden max-w-md w-full h-full sm:h-auto sm:max-h-[90vh] shadow-2xl flex flex-col justify-between">
        {/* Top Bar */}
        <div className="px-4 pt-5 pb-3 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            aria-label={tr('Kembali', 'Back')}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition cursor-pointer"
          >
            <ArrowLeft size={18} />
          </button>
          <h3 className="font-bold text-base tracking-tight text-white">{resolvedTitle}</h3>
        </div>

        {/* Circular Face Frame / Viewfinder */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-4 relative">
          <div className="relative w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center">
            {/* Corner Brackets */}
            <span className="absolute -top-2 -left-2 w-6 h-6 border-t-2 border-l-2 border-white/80 rounded-tl-sm pointer-events-none" />
            <span className="absolute -top-2 -right-2 w-6 h-6 border-t-2 border-r-2 border-white/80 rounded-tr-sm pointer-events-none" />
            <span className="absolute -bottom-2 -left-2 w-6 h-6 border-b-2 border-l-2 border-white/80 rounded-bl-sm pointer-events-none" />
            <span className="absolute -bottom-2 -right-2 w-6 h-6 border-b-2 border-r-2 border-white/80 rounded-br-sm pointer-events-none" />

            <div
              className={`w-full h-full overflow-hidden border-2 border-dashed border-white/80 bg-zinc-900 flex items-center justify-center ${
                isFaceMode ? 'rounded-full' : 'rounded-2xl'
              }`}
            >
              {error && !photo && (
                <div className="p-6 text-center text-zinc-300 space-y-3">
                  <p className="text-xs leading-relaxed">{error}</p>
                  <label
                    className="inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded-full font-semibold cursor-pointer shadow"
                    style={{ backgroundColor: palette.primary, color: palette.onPrimary }}
                  >
                    <Upload size={14} />
                    <span>{tr('Pilih Foto', 'Choose Photo')}</span>
                    <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                  </label>
                </div>
              )}

              {!error && !photo && (
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${isFaceMode ? 'transform -scale-x-100' : ''}`}
                />
              )}

              {photo && (
                <img src={photo} alt={tr('Pratinjau Selfie', 'Selfie Preview')} className="w-full h-full object-cover" />
              )}
            </div>
          </div>

          {/* Info Cards (Waktu Kehadiran & Radius GPS) */}
          {(attendanceTime || distanceMeters !== undefined) && (
            <div className="w-full mt-5 space-y-2">
              {attendanceTime && (
                <div className="bg-zinc-900/90 border border-white/10 rounded-xl px-3 py-2.5 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                    <Clock size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-zinc-400">{tr('Waktu Kehadiran', 'Attendance Time')}</p>
                    <p className="text-xs font-bold text-white font-mono">{attendanceTime}</p>
                  </div>
                </div>
              )}

              {distanceMeters !== undefined && distanceMeters !== null && (
                <div className="bg-zinc-900/90 border border-white/10 rounded-xl px-3 py-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        isOutsideOffice ? 'bg-rose-500/15 text-rose-400' : 'bg-emerald-500/15 text-emerald-400'
                      }`}
                    >
                      <MapPin size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">
                        {tr(
                          `Radius ${Math.round(distanceMeters)} meter dari kantor (${
                            isOutsideOffice ? 'di luar kantor' : 'dalam area'
                          })`,
                          `${Math.round(distanceMeters)}m from ${officeName || 'office'} (${
                            isOutsideOffice ? 'outside' : 'inside'
                          })`
                        )}
                      </p>
                      {showCoordsDetail && coordsText && (
                        <p className="text-[10px] text-zinc-400 font-mono mt-0.5">{coordsText}</p>
                      )}
                    </div>
                  </div>
                  {coordsText && (
                    <button
                      type="button"
                      onClick={() => setShowCoordsDetail((v) => !v)}
                      className="p-1.5 text-zinc-400 hover:text-white shrink-0 cursor-pointer"
                      aria-label={tr('Detail GPS', 'GPS Detail')}
                    >
                      {showCoordsDetail ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Controls */}
        <div className="px-5 py-4 bg-zinc-900/95 border-t border-white/10 flex items-center justify-between gap-3">
          {!photo ? (
            <>
              <label className="text-xs text-zinc-400 hover:text-white underline cursor-pointer">
                {tr('Pilih File', 'Choose File')}
                <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
              </label>
              <button
                type="button"
                onClick={takeSnapshot}
                disabled={!!error}
                style={{ backgroundColor: palette.primary, color: palette.onPrimary }}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full font-bold text-sm shadow-lg hover:opacity-95 disabled:opacity-40 cursor-pointer"
              >
                <Camera size={18} />
                <span>{tr('Ambil Foto', 'Take Photo')}</span>
              </button>
              <div className="w-12" />
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleRetake}
                className="flex items-center gap-1.5 text-xs text-zinc-200 hover:text-white font-semibold px-4 py-2.5 rounded-full border border-white/15 bg-white/5 cursor-pointer"
              >
                <RefreshCw size={14} />
                <span>{tr('Ulangi', 'Retake')}</span>
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex items-center gap-1.5 bg-emerald-500 text-white text-xs font-bold px-6 py-2.5 rounded-full shadow-lg hover:bg-emerald-600 cursor-pointer"
              >
                <Check size={16} />
                <span>{tr('Gunakan Foto Ini', 'Use This Photo')}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
