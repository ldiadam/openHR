import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const Sheet: React.FC<SheetProps> = ({ open, onClose, title, children }) => {
  useLockBodyScroll(open);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/50 backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="animate-sheet-up flex max-h-[88vh] w-full max-w-md flex-col rounded-t-3xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};
