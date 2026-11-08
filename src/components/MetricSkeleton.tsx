import React from 'react';

interface MetricSkeletonProps {
  isLoading: boolean;
  children: React.ReactNode;
  width?: string;
  height?: string;
  className?: string;
  showBlurOverlay?: boolean;
}

export const MetricSkeleton: React.FC<MetricSkeletonProps> = ({
  isLoading,
  children,
  width = 'w-24',
  height = 'h-7',
  className = ''
}) => {
  if (isLoading) {
    return (
      <div className={`relative inline-flex items-center rounded-lg overflow-hidden transition-all duration-300 ${className}`}>
        {/* Render children blurred so bounding size matches content perfectly without layout shifts or confusing changing numbers */}
        <div className="filter blur-[6px] select-none opacity-30 pointer-events-none transition-all duration-300 grayscale">
          {children}
        </div>
        {/* Shimmer sweep animation over blurred metric */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-sky-400/30 dark:via-sky-400/35 to-transparent animate-shimmer pointer-events-none" />
        <div className="absolute inset-0 bg-slate-300/20 dark:bg-slate-800/40 rounded-lg animate-pulse border border-sky-500/25 pointer-events-none" />
      </div>
    );
  }

  return <div className="transition-all duration-300 inline-flex items-baseline">{children}</div>;
};

export const MetricBlur: React.FC<{ isLoading: boolean; children: React.ReactNode; className?: string }> = ({
  isLoading,
  children,
  className = ''
}) => {
  return (
    <MetricSkeleton isLoading={isLoading} className={className}>
      {children}
    </MetricSkeleton>
  );
};
