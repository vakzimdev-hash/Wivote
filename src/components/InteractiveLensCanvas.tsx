import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  Sparkles,
  Check,
  RotateCcw,
  MousePointerClick,
  Copy,
  Search,
  Zap,
  Info,
  CheckCircle2,
  Trash2,
  ListFilter
} from 'lucide-react';
import { LensWord } from '../utils/lensOcr';
import { NormalizedPoint, gestureIntersectsRect } from '../utils/lensGeometry';
import { triggerScanVibrate } from '../utils/textRecognition';

export interface InteractiveLensCanvasProps {
  imageElement: HTMLImageElement | HTMLCanvasElement;
  words: LensWord[];
  recommendedCode?: string;
  onSelectCode: (code: string) => void;
  onRetake?: () => void;
  theme?: 'dark' | 'light';
  catalogVouchers?: Array<{ code: string; price: number; plan: string; status: string }>;
  isBatchMode?: boolean;
  selectedBatchCodes?: string[];
  onRemoveBatchCode?: (code: string) => void;
}

export const InteractiveLensCanvas: React.FC<InteractiveLensCanvasProps> = ({
  imageElement,
  words,
  recommendedCode,
  onSelectCode,
  onRetake,
  theme = 'dark',
  catalogVouchers = [],
  isBatchMode = false,
  selectedBatchCodes = [],
  onRemoveBatchCode
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Selected word IDs set
  const [selectedWordIds, setSelectedWordIds] = useState<Set<string>>(new Set());

  // Stroke drawing tracking
  const isPointerDownRef = useRef(false);
  const currentStrokeRef = useRef<NormalizedPoint[]>([]);
  const [, setForceRender] = useState(0);

  // Interaction mode tooltip & feedback
  const [interactionHint, setInteractionHint] = useState<string>(
    'Tap or drag across lines to select text, or use the Lens Home trigger below'
  );

  // Copy success indicator
  const [copiedNotification, setCopiedNotification] = useState<string | null>(null);

  // Long-press Home button simulation state
  const [isHomePressed, setIsHomePressed] = useState(false);
  const [homePressProgress, setHomePressProgress] = useState(0);
  const homePressTimerRef = useRef<number | null>(null);
  const homeProgressIntervalRef = useRef<number | null>(null);

  // Group detected words by line (grouping by similar normalized Y coordinate)
  const detectedLines = useMemo(() => {
    if (words.length === 0) return [];
    // Sort words by Y, then X
    const sorted = [...words].sort((a, b) => {
      const dy = a.normalizedRect.y - b.normalizedRect.y;
      if (Math.abs(dy) > 0.035) return dy;
      return a.normalizedRect.x - b.normalizedRect.x;
    });

    const lines: Array<{ lineIndex: number; text: string; wordIds: string[]; y: number; isCandidate: boolean }> = [];
    sorted.forEach((word) => {
      const existing = lines.find((l) => Math.abs(l.y - word.normalizedRect.y) <= 0.035);
      if (existing) {
        existing.wordIds.push(word.id);
        existing.text += ' ' + word.cleanText;
        if (word.isVoucherCandidate) existing.isCandidate = true;
      } else {
        lines.push({
          lineIndex: lines.length,
          text: word.cleanText,
          wordIds: [word.id],
          y: word.normalizedRect.y,
          isCandidate: !!word.isVoucherCandidate
        });
      }
    });

    return lines;
  }, [words]);

  // Pre-select recommended code on initial load if available
  useEffect(() => {
    if (recommendedCode) {
      const matchingWord = words.find(
        (w) => w.cleanText.toUpperCase() === recommendedCode.toUpperCase()
      );
      if (matchingWord) {
        setSelectedWordIds(new Set([matchingWord.id]));
        setInteractionHint(`Auto-detected code: ${recommendedCode}`);
      }
    }
  }, [recommendedCode, words]);

  // Extract combined selected string
  const selectedText = useMemo(() => {
    if (selectedWordIds.size === 0) return '';
    // Sort selected words according to reading order (vertical line index, then horizontal x0)
    const selectedList = words.filter((w) => selectedWordIds.has(w.id));
    selectedList.sort((a, b) => {
      const yDiff = a.normalizedRect.y - b.normalizedRect.y;
      if (Math.abs(yDiff) > 0.04) {
        return yDiff;
      }
      return a.normalizedRect.x - b.normalizedRect.x;
    });

    return selectedList.map((w) => w.cleanText).join(' ');
  }, [selectedWordIds, words]);

  // Clean single code candidate from selection (strips spaces if it looks like a single token or joined parts)
  const candidateCode = useMemo(() => {
    const raw = selectedText.trim();
    if (!raw) return '';
    const compact = raw.replace(/\s+/g, '');
    const matchedVoucher = catalogVouchers.find(
      (v) => v.code.toUpperCase() === raw.toUpperCase() || v.code.toUpperCase() === compact.toUpperCase()
    );
    if (matchedVoucher) return matchedVoucher.code;
    return raw.split(/\s+/)[0] || raw;
  }, [selectedText, catalogVouchers]);

  // Catalog voucher info for candidateCode
  const catalogMatch = useMemo(() => {
    if (!candidateCode) return null;
    return (
      catalogVouchers.find(
        (v) => v.code.toUpperCase() === candidateCode.toUpperCase()
      ) || null
    );
  }, [candidateCode, catalogVouchers]);

  // Redraw canvas with background image, bounding boxes, and active laser stroke
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // 1. Draw base captured image
    ctx.drawImage(imageElement, 0, 0, width, height);

    // 2. Dark semi-transparent scrim to highlight text overlay and laser stroke
    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.fillRect(0, 0, width, height);

    // 3. Render Detected Words with Google Lens Pill Highlights
    words.forEach((w) => {
      const isSelected = selectedWordIds.has(w.id);
      const isCandidate = w.isVoucherCandidate;

      const wx = w.normalizedRect.x * width;
      const wy = w.normalizedRect.y * height;
      const ww = w.normalizedRect.width * width;
      const wh = w.normalizedRect.height * height;
      const radius = Math.min(6, wh / 2);

      ctx.save();
      ctx.beginPath();
      // Rounded rect
      ctx.roundRect(wx - 2, wy - 2, ww + 4, wh + 4, radius);

      if (isSelected) {
        // Glowing cyan-emerald selected pill
        ctx.fillStyle = 'rgba(6, 182, 212, 0.38)';
        ctx.fill();

        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#06b6d4';
        ctx.shadowBlur = 12;
        ctx.stroke();

        // Indicator dot on selected item
        ctx.beginPath();
        ctx.arc(wx + ww + 1, wy + 2, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#34d399';
        ctx.shadowColor = '#10b981';
        ctx.shadowBlur = 8;
        ctx.fill();
      } else if (isCandidate) {
        // High-confidence voucher code candidate: noticeable gold dotted highlight
        ctx.fillStyle = 'rgba(251, 191, 36, 0.18)';
        ctx.fill();

        ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
      } else {
        // Subtle outline to show word is interactive
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      ctx.restore();
    });

    // 4. Render Active Pointer Gesture Stroke (Laser neon glow with gradient)
    const stroke = currentStrokeRef.current;
    if (stroke.length > 1) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(stroke[0].x * width, stroke[0].y * height);

      for (let i = 1; i < stroke.length; i++) {
        const pPrev = stroke[i - 1];
        const pCurr = stroke[i];
        const midX = (pPrev.x + pCurr.x) / 2 * width;
        const midY = (pPrev.y + pCurr.y) / 2 * height;
        ctx.quadraticCurveTo(pPrev.x * width, pPrev.y * height, midX, midY);
      }

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = '#0284c7';
      ctx.shadowBlur = 16;
      ctx.stroke();

      // Inner white hot core
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.8;
      ctx.shadowBlur = 0;
      ctx.stroke();

      // Sparkle particle at head of stroke
      const head = stroke[stroke.length - 1];
      ctx.beginPath();
      ctx.arc(head.x * width, head.y * height, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#67e8f9';
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 12;
      ctx.fill();

      ctx.restore();
    }
  }, [imageElement, words, selectedWordIds]);

  // Adjust canvas pixel resolution to container
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const imgWidth = (imageElement as HTMLImageElement).naturalWidth || imageElement.width || 800;
    const imgHeight = (imageElement as HTMLImageElement).naturalHeight || imageElement.height || 600;

    canvas.width = imgWidth;
    canvas.height = imgHeight;

    renderCanvas();
  }, [imageElement, renderCanvas]);

  // Convert pointer event coordinates to normalized [0, 1] relative to rendered canvas
  const getNormalizedPoint = (e: React.PointerEvent<HTMLCanvasElement>): NormalizedPoint => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return { x, y };
  };

  // Perform hit testing against detected OCR words
  const hitTestWords = (stroke: NormalizedPoint[]) => {
    if (stroke.length === 0) return;

    setSelectedWordIds((prev) => {
      const next = new Set(prev);
      let changed = false;

      words.forEach((word) => {
        const hits = gestureIntersectsRect(stroke, word.normalizedRect, 0.02);
        if (hits) {
          if (!next.has(word.id)) {
            next.add(word.id);
            changed = true;
          }
        }
      });

      if (changed) {
        triggerScanVibrate();
      }
      return changed ? next : prev;
    });
  };

  // Pointer Down (Mouse click / Finger touch start)
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    isPointerDownRef.current = true;
    const pt = getNormalizedPoint(e);
    currentStrokeRef.current = [pt];

    // Single point tap hit test
    hitTestWords([pt]);
    renderCanvas();
  };

  // Pointer Move (Drag / Swipe / Strike-through / Circle to Search)
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPointerDownRef.current) return;
    const pt = getNormalizedPoint(e);
    currentStrokeRef.current.push(pt);

    // Continuous strike-through & enclosure hit test
    hitTestWords(currentStrokeRef.current);
    renderCanvas();
  };

  // Pointer Up / Cancel
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPointerDownRef.current) return;
    isPointerDownRef.current = false;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignored
    }

    // Final hit test
    hitTestWords(currentStrokeRef.current);

    // Fade out stroke
    setTimeout(() => {
      currentStrokeRef.current = [];
      renderCanvas();
      setForceRender((n) => n + 1);
    }, 180);
  };

  // Clear selection
  const handleClearSelection = () => {
    setSelectedWordIds(new Set());
    setInteractionHint('Selection cleared. Tap or drag across any line of text.');
  };

  // Select a whole line directly by clicking its quick line badge
  const handleSelectLine = (wordIds: string[], lineText: string) => {
    setSelectedWordIds(new Set(wordIds));
    triggerScanVibrate();
    setInteractionHint(`Selected line: "${lineText}"`);
  };

  // Select all detected words
  const handleSelectAll = () => {
    setSelectedWordIds(new Set(words.map((w) => w.id)));
  };

  // Long-press Home button simulation: Selects top code or cycles through lines
  const startLongPressHome = () => {
    setIsHomePressed(true);
    setHomePressProgress(0);

    const startTime = Date.now();
    const duration = 650; // 650ms for Google Lens long press feel

    homeProgressIntervalRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.round((elapsed / duration) * 100));
      setHomePressProgress(pct);
    }, 25);

    homePressTimerRef.current = window.setTimeout(() => {
      triggerScanVibrate();
      setIsHomePressed(false);
      setHomePressProgress(100);
      if (homeProgressIntervalRef.current) clearInterval(homeProgressIntervalRef.current);

      // Trigger Google Lens-style intelligent line/voucher selection
      // Priority 1: Top voucher candidate line
      const candidateLine = detectedLines.find((l) => l.isCandidate);
      if (candidateLine) {
        setSelectedWordIds(new Set(candidateLine.wordIds));
        setInteractionHint(`Lens selected voucher line: "${candidateLine.text}"`);
        return;
      }

      // Priority 2: First top printed line
      if (detectedLines.length > 0) {
        const firstLine = detectedLines[0];
        setSelectedWordIds(new Set(firstLine.wordIds));
        setInteractionHint(`Lens selected line 1: "${firstLine.text}"`);
        return;
      }

      // Fallback: select all
      setSelectedWordIds(new Set(words.map((w) => w.id)));
      setInteractionHint('Lens selected all detected text on voucher.');
    }, duration);
  };

  const cancelLongPressHome = () => {
    setIsHomePressed(false);
    setHomePressProgress(0);
    if (homePressTimerRef.current) clearTimeout(homePressTimerRef.current);
    if (homeProgressIntervalRef.current) clearInterval(homeProgressIntervalRef.current);
  };

  // Copy selected text to clipboard
  const handleCopyText = () => {
    const textToCopy = selectedText;
    if (!textToCopy) return;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(textToCopy);
      setCopiedNotification(textToCopy);
      triggerScanVibrate();
      setTimeout(() => setCopiedNotification(null), 2500);
    }
  };

  // Trigger search / lookup confirmation
  const handleConfirmCode = (codeToUse: string) => {
    if (!codeToUse.trim()) return;
    triggerScanVibrate();
    onSelectCode(codeToUse.trim());
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full flex flex-col items-center select-none overflow-hidden ${
        theme === 'light' ? 'text-slate-900' : 'text-white'
      }`}
    >
      {/* Top Interactive Lens HUD */}
      <div className="w-full px-4 py-2.5 bg-slate-950/90 backdrop-blur-md border-b border-white/10 flex items-center justify-between gap-2 z-20">
        <div className="flex items-center gap-2 text-xs font-mono truncate">
          <div className="p-1 rounded-lg bg-sky-500/20 text-sky-400">
            <Sparkles className="w-3.5 h-3.5 animate-spin" />
          </div>
          <span className="text-sky-300 font-bold hidden sm:inline">Google Lens Text Mode:</span>
          <span className="text-slate-300 truncate text-[11px]">{interactionHint}</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {selectedWordIds.size > 0 && (
            <button
              type="button"
              onClick={handleClearSelection}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition cursor-pointer"
              title="Clear selection"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Interactive Stage with Canvas */}
      <div className="relative w-full max-h-[46vh] sm:max-h-[50vh] flex items-center justify-center bg-black overflow-hidden touch-none">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="max-w-full max-h-[46vh] sm:max-h-[50vh] object-contain cursor-crosshair touch-none transition-transform"
          style={{ touchAction: 'none' }}
        />

        {/* Floating gesture helper badge */}
        <div className="absolute top-2 left-2 pointer-events-none px-2.5 py-1 rounded-full bg-slate-950/75 border border-white/10 text-[10px] font-mono text-slate-300 flex items-center gap-1.5 backdrop-blur-sm">
          <MousePointerClick className="w-3 h-3 text-sky-400" />
          <span>Tap word or drag across line</span>
        </div>

        {/* Detected Word Count Chip */}
        <div className="absolute top-2 right-2 pointer-events-none px-2.5 py-1 rounded-full bg-slate-950/75 border border-white/10 text-[10px] font-mono text-slate-300 backdrop-blur-sm">
          {words.length} items detected
        </div>

        {/* Copied to clipboard visual toast */}
        {copiedNotification && (
          <div className="absolute inset-x-0 top-12 flex justify-center pointer-events-none z-30 animate-fade-in">
            <div className="px-3.5 py-1.5 rounded-xl bg-emerald-500 text-white font-mono text-xs font-bold shadow-xl border border-emerald-400 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" />
              <span>Copied "{copiedNotification}" to clipboard!</span>
            </div>
          </div>
        )}
      </div>

      {/* Select Desired Line of Text: Google Lens Line Selector Tray */}
      {detectedLines.length > 0 && (
        <div className="w-full px-3 py-2 bg-slate-950/70 border-t border-slate-800 flex items-center gap-2 overflow-x-auto z-20">
          <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1">
            <ListFilter className="w-3 h-3 text-sky-400" />
            <span>Select Line:</span>
          </span>
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 scrollbar-thin">
            {detectedLines.map((line, idx) => {
              const isLineActive = line.wordIds.every((id) => selectedWordIds.has(id));
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectLine(line.wordIds, line.text)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono whitespace-nowrap transition border cursor-pointer flex items-center gap-1 shrink-0 ${
                    isLineActive
                      ? 'bg-sky-500/25 border-sky-400 text-sky-300 font-bold shadow-xs'
                      : line.isCandidate
                      ? 'bg-amber-500/15 border-amber-400/50 text-amber-300 hover:bg-amber-500/25'
                      : 'bg-slate-900 border-slate-700/80 text-slate-300 hover:bg-slate-800'
                  }`}
                  title={`Click to select entire line ${idx + 1}`}
                >
                  <span className="text-[9px] opacity-70">L{idx + 1}:</span>
                  <span className="truncate max-w-[150px]">{line.text}</span>
                  {line.isCandidate && (
                    <span className="text-[8px] uppercase bg-amber-400/20 text-amber-300 px-1 rounded font-bold">
                      Code
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Google Lens Home Bar with Long-Press Trigger */}
      <div className="w-full px-4 py-2 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between gap-3 z-20">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-[11px] font-mono text-slate-400">
            <Info className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">Google Lens trigger:</span>
          </div>
        </div>

        {/* Long Press Home Button */}
        <div className="relative flex-1 max-w-xs flex flex-col items-center">
          <button
            type="button"
            onPointerDown={startLongPressHome}
            onPointerUp={cancelLongPressHome}
            onPointerLeave={cancelLongPressHome}
            className={`w-full py-1.5 px-3 rounded-xl font-mono text-xs font-bold transition-all relative overflow-hidden border cursor-pointer select-none flex items-center justify-center gap-2 ${
              isHomePressed
                ? 'bg-sky-600/40 border-sky-400 text-sky-200 scale-98 shadow-[0_0_15px_rgba(56,189,248,0.5)]'
                : 'bg-slate-800/80 hover:bg-slate-800 border-slate-700 text-slate-200 hover:text-white'
            }`}
            title="Press and hold to auto-select desired voucher line (like Google Lens)"
          >
            {/* Progress Fill Indicator */}
            {isHomePressed && (
              <div
                className="absolute inset-0 bg-sky-500/30 transition-all duration-75"
                style={{ width: `${homePressProgress}%` }}
              />
            )}
            <div className="w-3.5 h-1.5 rounded-full bg-slate-400 group-hover:bg-sky-400" />
            <span className="relative z-10">
              {isHomePressed
                ? `Hold... ${homePressProgress}%`
                : 'Hold Home Button to Select Line'}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleSelectAll}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-mono transition cursor-pointer border border-slate-700 hidden xs:inline"
          >
            Select All
          </button>
        </div>
      </div>

      {/* Extracted Text & Immediate Search Bar Footer */}
      <div className="w-full p-3.5 bg-slate-900/95 border-t border-slate-800 flex flex-col gap-2.5 z-20">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider shrink-0">
              Selected:
            </span>
            {selectedText ? (
              <div className="flex items-center gap-1.5 truncate">
                <span className="font-mono font-bold text-sm text-sky-300 bg-sky-950/60 border border-sky-400/40 px-2.5 py-0.5 rounded-lg truncate">
                  {selectedText}
                </span>
                {catalogMatch && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-mono font-bold whitespace-nowrap">
                    ✓ Matched ${(catalogMatch.price || 0).toFixed(2)} ({catalogMatch.plan})
                  </span>
                )}
              </div>
            ) : (
              <span className="text-xs text-slate-500 italic font-mono truncate">
                None selected yet. Tap a word, select a line above, or hold Home button.
              </span>
            )}
          </div>

          {/* Copying Action */}
          {selectedText && (
            <button
              type="button"
              onClick={handleCopyText}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-bold transition cursor-pointer border border-slate-700 flex items-center gap-1.5 shrink-0 shadow-sm"
              title="Copy selected text"
            >
              <Copy className="w-3.5 h-3.5 text-sky-400" />
              <span>Copy</span>
            </button>
          )}
        </div>

        {/* Action Buttons Row */}
        <div className="flex items-center gap-2">
          {onRetake && (
            <button
              type="button"
              onClick={onRetake}
              className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono font-semibold transition cursor-pointer border border-slate-700 flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retake Photo</span>
            </button>
          )}

          {/* Primary Action Button: Apply & Trigger Lookup */}
          <button
            type="button"
            disabled={!selectedText}
            onClick={() => handleConfirmCode(candidateCode || selectedText)}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-mono font-bold transition flex items-center justify-center gap-2 shadow-lg cursor-pointer ${
              selectedText
                ? 'bg-sky-500 hover:bg-sky-400 text-white shadow-sky-500/25 border border-sky-300'
                : 'bg-slate-800 text-slate-500 border border-slate-800 cursor-not-allowed'
            }`}
          >
            <Search className="w-4 h-4" />
            <span>
              {candidateCode
                ? isBatchMode
                  ? `Add Voucher "${candidateCode}" to List`
                  : `Lookup & Select "${candidateCode}"`
                : 'Select Code & Lookup'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

