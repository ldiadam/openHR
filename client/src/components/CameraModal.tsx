import React, { useRef, useState, useEffect } from 'react';
import { Camera, RefreshCw, X, Check } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (base64Photo: string) => void;
  title?: string;
  facingMode?: 'user' | 'environment';
}

export const CameraModal: React.FC<CameraModalProps> = ({
  isOpen,
  onClose,
  onCapture,
  title,
  facingMode = 'user',
}) => {
  const { tr } = useLanguage();
  const resolvedTitle = title ?? tr('Ambil Foto Selfie Presensi', 'Take Attendance Selfie Photo');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err: any) {
      console.warn('Camera access issue:', err);
      setError(tr('Kamera tidak dapat diakses. Anda dapat mengunggah file foto sebagai gantinya.', 'Camera cannot be accessed. You can upload a photo file instead.'));
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
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 480;
    canvas.height = video.videoHeight || 640;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
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

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl overflow-hidden max-w-md w-full shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900 text-sm">{resolvedTitle}</h3>
          <button
            onClick={onClose}
            aria-label={tr('Tutup', 'Close')}
            title={tr('Tutup', 'Close')}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
          >
            <X size={20} />
          </button>
        </div>

        {/* Viewfinder / Preview */}
        <div className="relative aspect-4/3 bg-slate-950 flex items-center justify-center overflow-hidden">
          {error && !photo && (
            <div className="p-6 text-center text-slate-300 space-y-3">
              <p className="text-xs">{error}</p>
              <label className="inline-block bg-blue-600 text-white text-xs px-4 py-2 rounded-lg font-medium cursor-pointer shadow">
                {tr('Pilih Foto dari Galeri', 'Choose Photo from Gallery')}
                <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
          )}

          {!error && !photo && (
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover transform -scale-x-100"
            />
          )}

          {photo && (
            <img src={photo} alt={tr('Pratinjau Selfie', 'Selfie Preview')} className="w-full h-full object-cover" />
          )}
        </div>

        {/* Controls */}
        <div className="p-4 bg-slate-50 flex items-center justify-between gap-3">
          {!photo ? (
            <>
              <label className="text-xs text-slate-500 underline cursor-pointer">
                {tr('Pilih File', 'Choose File')}
                <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
              </label>
              <button
                onClick={takeSnapshot}
                disabled={!!error}
                className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-full font-medium text-sm shadow hover:bg-blue-700 disabled:opacity-50"
              >
                <Camera size={18} />
                <span>{tr('Ambil Foto', 'Take Photo')}</span>
              </button>
              <div className="w-12" />
            </>
          ) : (
            <>
              <button
                onClick={handleRetake}
                className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 font-medium px-3 py-2 rounded-lg border border-slate-200"
              >
                <RefreshCw size={14} />
                <span>{tr('Ulangi', 'Retake')}</span>
              </button>
              <button
                onClick={handleConfirm}
                className="flex items-center gap-1.5 bg-emerald-600 text-white text-xs font-semibold px-5 py-2.5 rounded-lg shadow hover:bg-emerald-700"
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
