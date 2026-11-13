import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Plus, Share, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useCompany } from '../context/CompanyContext';
import { usePwaInstall } from '../hooks/usePwaInstall';

const DISMISS_KEY = 'openhr_pwa_install_dismissed_at';
const DISMISS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const InstallPwaPrompt: React.FC = () => {
  const { tr } = useLanguage();
  const { companyName } = useCompany();
  const { canInstall, isIOS, installed, promptInstall } = usePwaInstall();
  const [hidden, setHidden] = useState(() => {
    try {
      const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
      return dismissedAt > 0 && Date.now() - dismissedAt < DISMISS_WINDOW_MS;
    } catch {
      return false;
    }
  });
  const [installing, setInstalling] = useState(false);
  const [showIOSHelp, setShowIOSHelp] = useState(false);

  if (installed || hidden || !canInstall) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore storage errors
    }
    setHidden(true);
  };

  const handleInstall = async () => {
    if (isIOS) {
      setShowIOSHelp(true);
      return;
    }
    setInstalling(true);
    const accepted = await promptInstall();
    setInstalling(false);
    if (accepted) setHidden(true);
  };

  return createPortal(
    <>
      <div className="fixed inset-x-3 bottom-[84px] z-[60] md:bottom-6 md:left-auto md:right-6 md:w-[360px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xl">
          <div className="flex items-start gap-3">
            <img src="/icon-192.png" alt="" className="h-11 w-11 shrink-0 rounded-xl shadow-sm" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-900">
                {tr(`Pasang ${companyName}`, `Install ${companyName}`)}
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                {tr(
                  'Akses lebih cepat langsung dari layar utama, tanpa membuka browser.',
                  'Get quick access straight from your home screen without opening the browser.'
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={dismiss}
              aria-label={tr('Tutup', 'Close')}
              className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={dismiss}
              className="flex-1 rounded-xl bg-slate-100 py-2 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-200 cursor-pointer"
            >
              {tr('Nanti', 'Later')}
            </button>
            <button
              type="button"
              onClick={handleInstall}
              disabled={installing}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-900 py-2 text-[11px] font-bold text-white transition hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
            >
              <Download size={13} />
              <span>{installing ? tr('Memasang...', 'Installing...') : tr('Pasang', 'Install')}</span>
            </button>
          </div>
        </div>
      </div>

      {showIOSHelp && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/60 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setShowIOSHelp(false)}
        >
          <div
            className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <Plus size={18} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {tr('Pasang di iPhone / iPad', 'Install on iPhone / iPad')}
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {tr('Gunakan Safari untuk menambahkan ke Layar Utama.', 'Use Safari to add it to your Home Screen.')}
                </p>
              </div>
            </div>

            <ol className="space-y-2 rounded-xl bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-700">
              <li className="flex items-start gap-2">
                <Share size={14} className="mt-0.5 shrink-0 text-blue-600" />
                <span>{tr('Ketuk tombol Bagikan (Share) di Safari.', 'Tap the Share button in Safari.')}</span>
              </li>
              <li className="flex items-start gap-2">
                <Plus size={14} className="mt-0.5 shrink-0 text-blue-600" />
                <span>{tr('Pilih “Tambah ke Layar Utama”.', 'Choose “Add to Home Screen”.')}</span>
              </li>
              <li className="flex items-start gap-2">
                <Download size={14} className="mt-0.5 shrink-0 text-blue-600" />
                <span>{tr('Ketuk “Tambah” untuk memasang aplikasi.', 'Tap “Add” to install the app.')}</span>
              </li>
            </ol>

            <button
              type="button"
              onClick={() => setShowIOSHelp(false)}
              className="w-full rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-white transition hover:bg-slate-800 cursor-pointer"
            >
              {tr('Mengerti', 'Got it')}
            </button>
          </div>
        </div>
      )}
    </>,
    document.body
  );
};
