import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { RotateCw, RefreshCw, ZoomIn, ZoomOut, Check, X, ShieldAlert } from 'lucide-react';

interface ImageCropperProps {
  imageSrc: string;
  onCropComplete: (croppedBase64: string) => void;
  onCancel: () => void;
  theme?: 'light' | 'dark';
}

export const ImageCropper: React.FC<ImageCropperProps> = ({
  imageSrc,
  onCropComplete,
  onCancel,
  theme = 'dark',
}) => {
  const [zoom, setZoom] = useState<number>(1);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [rotation, setRotation] = useState<number>(0); // 0, 90, 180, 270

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const currentOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Baseline dimensions of container and crop circle
  const CONTAINER_SIZE = 288; // 288px (w-72 h-72)
  const CROP_SIZE = 200;      // 200px crop viewport

  // Keep ref up to date to prevent closure stale states in event handlers
  useEffect(() => {
    currentOffsetRef.current = offset;
  }, [offset]);

  // Reset offset when rotation changes to keep image inside viewport
  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
    setOffset({ x: 0, y: 0 });
  };

  const handleReset = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setRotation(0);
  };

  // Dragging event handlers supporting mouse and touch (via pointer events)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    e.preventDefault();

    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    // Adjust movement sensitivity based on rotation
    // When rotated 90 deg, x shift translates to y, etc.
    let moveX = dx;
    let moveY = dy;

    if (rotation === 90) {
      moveX = dy;
      moveY = -dx;
    } else if (rotation === 180) {
      moveX = -dx;
      moveY = -dy;
    } else if (rotation === 270) {
      moveX = -dy;
      moveY = dx;
    }

    setOffset({
      x: currentOffsetRef.current.x + moveX,
      y: currentOffsetRef.current.y + moveY,
    });

    dragStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    }
  };

  // Perform the cropping using HTML5 Canvas
  const handleApplyCrop = async () => {
    if (!imageRef.current) return;

    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // Let's output a high-quality 400x400 avatar image
        const outputSize = 400;
        canvas.width = outputSize;
        canvas.height = outputSize;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) return;

        // Draw slate dark background inside the avatar just in case
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, outputSize, outputSize);

        // Translate context origin to center of canvas
        ctx.translate(outputSize / 2, outputSize / 2);
        
        // Apply rotation
        ctx.rotate((rotation * Math.PI) / 180);

        // Fit image correctly preserving aspect ratio
        const imgAspect = img.width / img.height;
        let displayW = CONTAINER_SIZE;
        let displayH = CONTAINER_SIZE;

        if (imgAspect > 1) {
          displayH = CONTAINER_SIZE;
          displayW = CONTAINER_SIZE * imgAspect;
        } else {
          displayW = CONTAINER_SIZE;
          displayH = CONTAINER_SIZE / imgAspect;
        }

        // Compute scaling ratio from container size to high-resolution canvas size
        const scaleRatio = outputSize / CONTAINER_SIZE;

        const w = displayW * zoom * scaleRatio;
        const h = displayH * zoom * scaleRatio;
        const dx = offset.x * scaleRatio;
        const dy = offset.y * scaleRatio;

        // Draw image centered in rotated/translated space
        ctx.drawImage(img, dx - w / 2, dy - h / 2, w, h);

        const croppedBase64 = canvas.toDataURL('image/jpeg', 0.92);
        onCropComplete(croppedBase64);
      };

      img.src = imageSrc;
    } catch (err) {
      console.error('Failed to crop image:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 z-55">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className={`w-full max-w-sm rounded-3xl border shadow-2xl overflow-hidden p-6 ${
          theme === 'light'
            ? 'bg-white border-slate-200 text-slate-950'
            : 'bg-slate-900 border-slate-800 text-white'
        }`}
      >
        <div className="mb-4 text-center">
          <h3 className="text-lg font-bold font-display tracking-tight">Precise Image Cropping</h3>
          <p className="text-xs text-slate-400 mt-1 font-mono">Drag to pan • Slide to zoom</p>
        </div>

        {/* Dynamic Interactive Workspace */}
        <div className="flex justify-center my-6">
          <div
            ref={containerRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="relative select-none overflow-hidden rounded-2xl cursor-move touch-none border border-slate-700/50 bg-slate-950 shadow-inner"
            style={{ width: CONTAINER_SIZE, height: CONTAINER_SIZE }}
          >
            {/* Image rendered dynamically using CSS Transforms */}
            <img
              ref={imageRef}
              src={imageSrc}
              alt="Source Crop"
              className="max-w-none absolute pointer-events-none origin-center"
              style={{
                top: '50%',
                left: '50%',
                transform: `translate3d(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px), 0) scale(${zoom}) rotate(${rotation}deg)`,
                width: CONTAINER_SIZE,
                height: 'auto',
                aspectRatio: 'auto',
              }}
            />

            {/* Premium Circular Crop Aperture Overlay */}
            <svg
              className="absolute inset-0 pointer-events-none w-full h-full"
              viewBox={`0 0 ${CONTAINER_SIZE} ${CONTAINER_SIZE}`}
            >
              <defs>
                <mask id="crop-mask">
                  <rect width={CONTAINER_SIZE} height={CONTAINER_SIZE} fill="white" />
                  <circle cx={CONTAINER_SIZE / 2} cy={CONTAINER_SIZE / 2} r={CROP_SIZE / 2} fill="black" />
                </mask>
              </defs>
              {/* Dimmed outer region */}
              <rect
                width={CONTAINER_SIZE}
                height={CONTAINER_SIZE}
                fill="black"
                fillOpacity="0.72"
                mask="url(#crop-mask)"
              />
              {/* Neon border circle */}
              <circle
                cx={CONTAINER_SIZE / 2}
                cy={CONTAINER_SIZE / 2}
                r={CROP_SIZE / 2}
                fill="none"
                stroke="#0ea5e9"
                strokeWidth="2.5"
                strokeDasharray="4 4"
                className="animate-[spin_120s_linear_infinite]"
              />
            </svg>
          </div>
        </div>

        {/* Zoom Controls */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <ZoomOut className="w-4 h-4 text-slate-400" />
            <input
              type="range"
              min="1"
              max="4"
              step="0.01"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
            />
            <ZoomIn className="w-4 h-4 text-slate-400" />
          </div>

          {/* Quick Action Buttons */}
          <div className="flex justify-center gap-3">
            <button
              onClick={handleRotate}
              title="Rotate 90 degrees clockwise"
              className="flex items-center gap-1 text-xs font-mono font-bold bg-slate-800/80 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-xl border border-slate-700/50 transition cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5" /> Rotate
            </button>
            <button
              onClick={handleReset}
              title="Reset Zoom, Position, and Rotation"
              className="flex items-center gap-1 text-xs font-mono font-bold bg-slate-800/80 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-xl border border-slate-700/50 transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reset
            </button>
          </div>

          {/* Cancel and Confirm Buttons */}
          <div className="flex gap-3 pt-2 border-t border-slate-800/60">
            <button
              onClick={onCancel}
              className="flex-1 flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 rounded-xl text-sm font-semibold transition cursor-pointer"
            >
              <X className="w-4 h-4" /> Cancel
            </button>
            <button
              onClick={handleApplyCrop}
              className="flex-1 flex items-center justify-center gap-1.5 bg-gradient-to-r from-sky-500 to-indigo-500 hover:opacity-90 text-white py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-sky-500/20 transition cursor-pointer"
            >
              <Check className="w-4 h-4" /> Apply Crop
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
