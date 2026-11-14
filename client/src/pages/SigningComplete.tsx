import React from 'react';
import { CheckCircle2, FileText } from 'lucide-react';

/**
 * Public post-signing landing page.
 *
 * DocuSeal's completed_redirect_url must be reachable without a session — the
 * signer is usually an external party (employee, manager, HR inbox) with no
 * openHR login. Pointing it at /documents dropped them on the auth guard and
 * bounced to /login, which looked like the signature had failed.
 *
 * The request id in the URL is an opaque id; it reveals nothing on its own and
 * the page performs no authenticated read.
 */
export const SigningComplete: React.FC = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <CheckCircle2 size={32} />
        </div>

        <h1 className="mt-4 text-xl font-black tracking-tight text-slate-900">
          Tanda tangan terkirim
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Terima kasih. Dokumen Anda sudah ditandatangani dan tersimpan dengan aman.
        </p>

        <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
          Anda dapat menutup halaman ini. HR akan menerima salinan dokumen beserta jejak auditnya
          secara otomatis.
        </p>

        <div className="mt-6 flex items-center justify-center gap-1.5 text-[10px] font-medium text-slate-400">
          <FileText size={12} />
          openHR · Dokumen &amp; Tanda Tangan
        </div>
      </div>
    </div>
  );
};
