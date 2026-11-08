import React, { useEffect, useRef } from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';

export interface SearchSuggestionsDropdownProps<T> {
  isOpen: boolean;
  onClose: () => void;
  query: string;
  items: T[];
  renderItem: (item: T, isSelected: boolean) => React.ReactNode;
  onSelectItem: (item: T) => void;
  theme?: 'light' | 'dark';
  title?: string;
  emptyMessage?: string;
  maxItems?: number;
  className?: string;
  selectedIndex?: number;
}

export function SearchSuggestionsDropdown<T>({
  isOpen,
  onClose,
  query,
  items,
  renderItem,
  onSelectItem,
  theme = 'dark',
  title = 'Real-time Suggestions',
  emptyMessage = 'No matching suggestions found',
  maxItems = 6,
  className = '',
  selectedIndex = -1
}: SearchSuggestionsDropdownProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  if (!isOpen || !query.trim()) {
    return null;
  }

  const displayedItems = items.slice(0, maxItems);

  return (
    <div
      ref={containerRef}
      className={`absolute left-0 right-0 top-full mt-1.5 z-40 rounded-2xl border shadow-2xl backdrop-blur-md overflow-hidden transition-all duration-150 animate-in fade-in slide-in-from-top-1 ${
        theme === 'light'
          ? 'bg-white/95 border-slate-200 divide-y divide-slate-100'
          : 'bg-slate-950/95 border-slate-800 divide-y divide-slate-900'
      } ${className}`}
    >
      {/* Header with suggestion count */}
      <div className={`px-3 py-1.5 flex items-center justify-between text-[10px] font-mono ${
        theme === 'light' ? 'bg-slate-50 text-slate-500' : 'bg-slate-900/60 text-slate-400'
      }`}>
        <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider">
          <Sparkles className="w-3 h-3 text-amber-500" />
          <span>{title}</span>
        </div>
        <span>
          {items.length} match{items.length === 1 ? '' : 'es'}
        </span>
      </div>

      {displayedItems.length > 0 ? (
        <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-900">
          {displayedItems.map((item, index) => {
            const isSelected = selectedIndex === index;
            return (
              <div
                key={index}
                onClick={() => {
                  onSelectItem(item);
                  onClose();
                }}
                className={`p-2.5 transition cursor-pointer flex items-center justify-between gap-3 ${
                  isSelected
                    ? theme === 'light'
                      ? 'bg-amber-50/80 text-slate-900'
                      : 'bg-amber-500/10 text-white'
                    : theme === 'light'
                    ? 'hover:bg-slate-50 text-slate-800'
                    : 'hover:bg-slate-900/60 text-slate-200'
                }`}
              >
                <div className="flex-1 min-w-0">
                  {renderItem(item, isSelected)}
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 opacity-60 shrink-0" />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-3 text-center text-xs font-mono text-slate-400">
          {emptyMessage}
        </div>
      )}
    </div>
  );
}
