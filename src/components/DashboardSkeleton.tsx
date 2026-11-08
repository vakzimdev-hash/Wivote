import React from 'react';

interface SkeletonProps {
  theme: 'light' | 'dark';
}

export const AppOwnerSkeleton: React.FC<SkeletonProps> = ({ theme }) => {
  const isLight = theme === 'light';
  const bgClass = isLight ? 'bg-slate-200' : 'bg-slate-800';
  const borderClass = isLight ? 'border-slate-200' : 'border-slate-800';

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 animate-pulse">
      {/* Top Banner Skeleton */}
      <div className={`border rounded-3xl p-6 md:p-8 space-y-4 ${borderClass} ${isLight ? 'bg-white' : 'bg-slate-900'}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className={`h-8 w-64 rounded-xl ${bgClass}`} />
            <div className={`h-4 w-96 rounded-lg ${bgClass}`} />
          </div>
          <div className={`h-10 w-36 rounded-xl ${bgClass}`} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-800/40">
          {[1, 2, 3].map((n) => (
            <div key={n} className="space-y-2">
              <div className={`h-4 w-20 rounded ${bgClass}`} />
              <div className={`h-7 w-28 rounded-lg ${bgClass}`} />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Workspaces listing */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <div className={`h-6 w-48 rounded-lg ${bgClass}`} />
            <div className={`h-8 w-24 rounded-lg ${bgClass}`} />
          </div>
          
          <div className="space-y-4">
            {[1, 2, 3].map((n) => (
              <div key={n} className={`border rounded-2xl p-5 ${borderClass} ${isLight ? 'bg-white' : 'bg-slate-900'} space-y-3`}>
                <div className="flex justify-between items-start">
                  <div className="space-y-2">
                    <div className={`h-5 w-40 rounded-lg ${bgClass}`} />
                    <div className={`h-4 w-32 rounded-lg ${bgClass}`} />
                  </div>
                  <div className={`h-6 w-16 rounded-full ${bgClass}`} />
                </div>
                <div className="flex gap-4 pt-3 border-t border-slate-800/25">
                  <div className={`h-4 w-24 rounded-lg ${bgClass}`} />
                  <div className={`h-4 w-24 rounded-lg ${bgClass}`} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: SaaS Pricing configuration */}
        <div className={`border rounded-3xl p-6 ${borderClass} ${isLight ? 'bg-white' : 'bg-slate-900'} space-y-6 h-fit`}>
          <div className="space-y-2">
            <div className={`h-6 w-40 rounded-lg ${bgClass}`} />
            <div className={`h-4 w-60 rounded-lg ${bgClass}`} />
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map((n) => (
              <div key={n} className="space-y-2">
                <div className="flex justify-between">
                  <div className={`h-4 w-16 rounded ${bgClass}`} />
                  <div className={`h-4 w-12 rounded ${bgClass}`} />
                </div>
                <div className={`h-10 w-full rounded-xl ${bgClass}`} />
              </div>
            ))}
          </div>
          <div className={`h-11 w-full rounded-xl ${bgClass}`} />
        </div>
      </div>
    </div>
  );
};

export const WorkspaceMasterSkeleton: React.FC<SkeletonProps> = ({ theme }) => {
  const isLight = theme === 'light';
  const bgClass = isLight ? 'bg-slate-200' : 'bg-slate-800';
  const borderClass = isLight ? 'border-slate-200' : 'border-slate-800';

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 animate-pulse">
      {/* Top Banner */}
      <div className={`border rounded-3xl p-6 md:p-8 ${borderClass} ${isLight ? 'bg-white' : 'bg-slate-900'} space-y-4`}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-2">
            <div className={`h-8 w-56 rounded-xl ${bgClass}`} />
            <div className={`h-4 w-80 rounded-lg ${bgClass}`} />
          </div>
          <div className={`h-10 w-44 rounded-xl ${bgClass}`} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-800/40">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="space-y-1">
              <div className={`h-3 w-16 rounded ${bgClass}`} />
              <div className={`h-6 w-24 rounded-lg ${bgClass}`} />
            </div>
          ))}
        </div>
      </div>

      {/* Tabs Row */}
      <div className="flex border-b border-slate-800/40 gap-4">
        <div className={`h-8 w-28 rounded-t-lg ${bgClass}`} />
        <div className={`h-8 w-28 rounded-t-lg ${bgClass}`} />
      </div>

      {/* Operations Content Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <div className={`h-6 w-32 rounded-lg ${bgClass}`} />
            <div className={`h-9 w-32 rounded-lg ${bgClass}`} />
          </div>
          
          <div className={`border rounded-2xl p-6 ${borderClass} ${isLight ? 'bg-white' : 'bg-slate-900'} space-y-4`}>
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="flex justify-between items-center py-2 border-b border-slate-800/20 last:border-0">
                <div className="space-y-2">
                  <div className={`h-4.5 w-36 rounded ${bgClass}`} />
                  <div className={`h-3.5 w-24 rounded ${bgClass}`} />
                </div>
                <div className={`h-6 w-20 rounded-full ${bgClass}`} />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className={`border rounded-2xl p-6 ${borderClass} ${isLight ? 'bg-white' : 'bg-slate-900'} space-y-4`}>
            <div className={`h-5 w-32 rounded-lg ${bgClass}`} />
            <div className={`h-1 w-full rounded ${bgClass}`} />
            {[1, 2].map((n) => (
              <div key={n} className="space-y-2">
                <div className={`h-4 w-12 rounded ${bgClass}`} />
                <div className={`h-10 w-full rounded-xl ${bgClass}`} />
              </div>
            ))}
            <div className={`h-11 w-full rounded-xl ${bgClass}`} />
          </div>
        </div>
      </div>
    </div>
  );
};

export const AgentSkeleton: React.FC<SkeletonProps> = ({ theme }) => {
  const isLight = theme === 'light';
  const bgClass = isLight ? 'bg-slate-200' : 'bg-slate-800';
  const borderClass = isLight ? 'border-slate-200' : 'border-slate-800';

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 animate-pulse">
      {/* Top Banner Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className={`border rounded-2xl p-5 ${borderClass} ${isLight ? 'bg-white' : 'bg-slate-900'} space-y-3`}>
            <div className="flex justify-between items-center">
              <div className={`h-4 w-20 rounded ${bgClass}`} />
              <div className={`h-8 w-8 rounded-full ${bgClass}`} />
            </div>
            <div className={`h-7 w-28 rounded-lg ${bgClass}`} />
          </div>
        ))}
      </div>

      {/* Tabs Navigation Skeleton */}
      <div className={`border rounded-2xl p-1.5 flex gap-2 ${borderClass} ${isLight ? 'bg-white' : 'bg-slate-900'}`}>
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className={`h-10 flex-1 rounded-xl ${bgClass}`} />
        ))}
      </div>

      {/* Dynamic Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <div className={`h-6 w-40 rounded-lg ${bgClass}`} />
            <div className={`h-8 w-36 rounded-lg ${bgClass}`} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className={`border rounded-2xl p-5 ${borderClass} ${isLight ? 'bg-white' : 'bg-slate-900'} space-y-4`}>
                <div className="flex justify-between">
                  <div className={`h-5 w-24 rounded-lg ${bgClass}`} />
                  <div className={`h-5 w-16 rounded-full ${bgClass}`} />
                </div>
                <div className="space-y-2">
                  <div className={`h-7 w-32 rounded-lg ${bgClass}`} />
                  <div className={`h-4.5 w-full rounded-md ${bgClass}`} />
                </div>
                <div className={`h-10 w-full rounded-xl ${bgClass}`} />
              </div>
            ))}
          </div>
        </div>

        <div className={`border rounded-2xl p-6 ${borderClass} ${isLight ? 'bg-white' : 'bg-slate-900'} space-y-6 h-fit`}>
          <div className="space-y-2">
            <div className={`h-5 w-32 rounded-lg ${bgClass}`} />
            <div className={`h-4 w-48 rounded-md ${bgClass}`} />
          </div>
          
          <div className="space-y-4">
            {[1, 2, 3].map((n) => (
              <div key={n} className="flex gap-3 items-center">
                <div className={`h-10 w-10 rounded-full shrink-0 ${bgClass}`} />
                <div className="flex-1 space-y-1.5">
                  <div className={`h-4 w-28 rounded ${bgClass}`} />
                  <div className={`h-3 w-16 rounded ${bgClass}`} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
