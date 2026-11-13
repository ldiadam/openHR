import React from 'react';

interface PageSkeletonProps {
  cards?: number;
  rows?: number;
  className?: string;
}

export const PageSkeleton: React.FC<PageSkeletonProps> = ({ cards = 4, rows = 6, className = '' }) => (
  <div className={`space-y-6 ${className}`}>
    <div className="space-y-2">
      <div className="h-7 w-56 max-w-[70%] animate-pulse rounded-lg bg-slate-200" />
      <div className="h-3 w-80 max-w-full animate-pulse rounded bg-slate-100" />
    </div>

    {cards > 0 && (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: cards }).map((_, index) => (
          <div key={index} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="h-2.5 w-20 animate-pulse rounded bg-slate-200" />
            <div className="mt-3 h-6 w-12 animate-pulse rounded bg-slate-200" />
          </div>
        ))}
      </div>
    )}

    <div className="rounded-3xl border border-slate-200 bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
        <div className="h-8 w-24 animate-pulse rounded-xl bg-slate-100" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <div className="h-3 flex-1 animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-16 animate-pulse rounded bg-slate-100" />
            <div className="h-6 w-14 animate-pulse rounded-full bg-slate-200" />
          </div>
        ))}
      </div>
    </div>
  </div>
);

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  className?: string;
}

/** In-table loading placeholder: keeps the real header visible. */
export const TableSkeleton: React.FC<TableSkeletonProps> = ({ rows = 6, columns = 6, className = '' }) => (
  <tbody className={className}>
    {Array.from({ length: rows }).map((_, rowIndex) => (
      <tr key={rowIndex} className="animate-pulse border-b border-slate-100 last:border-0">
        {Array.from({ length: columns }).map((__, colIndex) => (
          <td key={colIndex} className="px-4 py-3.5">
            <div
              className={`h-3 rounded ${colIndex === 0 ? 'w-32 bg-slate-200' : 'w-20 bg-slate-100'}`}
            />
          </td>
        ))}
      </tr>
    ))}
  </tbody>
);

interface CardsSkeletonProps {
  cards?: number;
  className?: string;
}

/** Placeholder for metric/stat card grids. */
export const CardsSkeleton: React.FC<CardsSkeletonProps> = ({ cards = 4, className = '' }) => (
  <div className={`grid grid-cols-2 gap-3 md:grid-cols-4 ${className}`}>
    {Array.from({ length: cards }).map((_, index) => (
      <div key={index} className="animate-pulse rounded-3xl border border-slate-200/80 bg-white p-4 shadow-2xs">
        <div className="h-2.5 w-20 rounded bg-slate-200" />
        <div className="mt-2.5 h-6 w-24 rounded bg-slate-200" />
        <div className="mt-2 h-2 w-16 rounded bg-slate-100" />
      </div>
    ))}
  </div>
);

interface ListSkeletonProps {
  rows?: number;
  className?: string;
}

/** Placeholder for stacked card/list rows. */
export const ListSkeleton: React.FC<ListSkeletonProps> = ({ rows = 5, className = '' }) => (
  <div className={`space-y-2.5 ${className}`}>
    {Array.from({ length: rows }).map((_, index) => (
      <div key={index} className="animate-pulse rounded-2xl border border-slate-200/80 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="h-3.5 w-40 rounded bg-slate-200" />
          <div className="h-5 w-16 rounded-full bg-slate-100" />
        </div>
        <div className="mt-2 h-2.5 w-56 max-w-full rounded bg-slate-100" />
      </div>
    ))}
  </div>
);
