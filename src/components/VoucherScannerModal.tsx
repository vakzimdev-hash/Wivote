import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  X,
  Camera,
  Flashlight,
  FlashlightOff,
  SwitchCamera,
  CheckCircle2,
  AlertCircle,
  Upload,
  Keyboard,
  Sparkles,
  Layers,
  ArrowRight,
  RefreshCw,
  Search,
  Check,
  RotateCcw,
  Trash2,
  ChevronRight,
  Tag,
  Eye,
  ListFilter,
  DollarSign
} from 'lucide-react';
import {
  getTesseractWorker,
  matchCodeAgainstCatalog,
  detectBarcodeNative,
  playScanSuccessChime,
  triggerScanVibrate
} from '../utils/textRecognition';
import { extractWordsWithBoundingBoxes, LensWord } from '../utils/lensOcr';
import { InteractiveLensCanvas } from './InteractiveLensCanvas';

export interface VoucherScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCodeScanned: (code: string) => void;
  mode?: 'single' | 'multiple';
  isBatchScanning?: boolean;
  onToggleBatchMode?: () => void;
  knownCodes?: string[];
  title?: string;
  subtitle?: string;
  theme?: 'light' | 'dark';
  alreadySelectedCount?: number;
  catalogVouchers?: Array<{ code: string; price: number; plan: string; status: string }>;
}

export const VoucherScannerModal: React.FC<VoucherScannerModalProps> = ({
  isOpen,
  onClose,
  onCodeScanned,
  mode = 'single',
  isBatchScanning = false,
  onToggleBatchMode,
  knownCodes = [],
  title = 'Capture & Lens Text Selector',
  subtitle,
  theme = 'dark',
  alreadySelectedCount = 0,
  catalogVouchers = []
}) => {
  // Determine effective operational mode (continuous batch vs one-time scan)
  const effectiveMode = isBatchScanning !== undefined ? (isBatchScanning ? 'multiple' : 'single') : mode;

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [engineReady, setEngineReady] = useState(false);
  const [scanningStatus, setScanningStatus] = useState<string>('Ready to capture photo');
  const [scannedSessionList, setScannedSessionList] = useState<string[]>([]);
  const [manualCodeInput, setManualCodeInput] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);

  // Workflow State: 'viewfinder' (Aim camera and snap) | 'lens' (Captured photo + Google Lens text selection)
  const [scannerStage, setScannerStage] = useState<'viewfinder' | 'lens'>('viewfinder');
  const [capturedImage, setCapturedImage] = useState<HTMLCanvasElement | HTMLImageElement | null>(null);
  const [lensWords, setLensWords] = useState<LensWord[]>([]);
  const [lensRecommendedCode, setLensRecommendedCode] = useState<string | undefined>(undefined);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Initialize OCR Worker in the background once modal opens
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setEngineReady(false);
    setScanningStatus('Warming up Lens engine...');

    getTesseractWorker()
      .then(() => {
        if (isMounted) {
          setEngineReady(true);
          setScanningStatus('Camera ready — Frame voucher and click "Capture Photo"');
        }
      })
      .catch((err) => {
        console.warn('OCR engine notice:', err);
        if (isMounted) {
          setEngineReady(true);
          setScanningStatus('Camera ready — Frame voucher and click "Capture Photo"');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Start Camera Stream
  const startCamera = useCallback(async () => {
    setCameraError(null);
    setCameraActive(false);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera stream is not supported in this browser environment.');
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920, min: 640 },
          height: { ideal: 1080, min: 480 }
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraActive(true);
      }

      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities?.() as { torch?: boolean } | undefined;
      setTorchAvailable(!!capabilities?.torch);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Camera access error:', message);
      setCameraError(
        message.includes('Permission') || message.includes('denied')
          ? 'Camera permission denied. Please grant camera permission or use Upload Photo / Manual Input.'
          : 'Could not activate camera. Please use Upload Photo or Manual Input.'
      );
      setCameraActive(false);
    }
  }, [facingMode]);

  // Reset modal state on open/close
  useEffect(() => {
    if (isOpen) {
      setScannerStage('viewfinder');
      setCapturedImage(null);
      setLensWords([]);
      setLensRecommendedCode(undefined);
      setIsAnalyzing(false);
      setScannedSessionList([]);
      setManualCodeInput('');
      setShowManualInput(false);
      startCamera();
    } else {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setCameraActive(false);
      setTorchOn(false);
    }

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [isOpen, startCamera]);

  // Toggle Torch/Flashlight
  const toggleTorch = async () => {
    if (!streamRef.current || !torchAvailable) return;
    try {
      const track = streamRef.current.getVideoTracks()[0];
      const newTorchState = !torchOn;
      await (track as unknown as { applyConstraints: (c: unknown) => Promise<void> }).applyConstraints({
        advanced: [{ torch: newTorchState }]
      });
      setTorchOn(newTorchState);
    } catch (err) {
      console.warn('Torch toggle failed:', err);
    }
  };

  // Switch between front and back camera
  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // CAPTURE PHOTO ACTION: Freezes the current frame and transitions to Google Lens text selector
  const handleCapturePhoto = async () => {
    if (!videoRef.current || !cameraActive) return;
    const video = videoRef.current;
    if (video.videoWidth === 0) return;

    triggerScanVibrate();

    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      setCapturedImage(canvas);
      setScannerStage('lens');
      setIsAnalyzing(true);
      setScanningStatus('Extracting text & lines from photo...');

      // Run OCR & bounding box extraction
      const result = await extractWordsWithBoundingBoxes(canvas, knownCodes);
      setLensWords(result.words);
      setLensRecommendedCode(result.recommendedCode);
      setScanningStatus(
        result.words.length > 0
          ? `Extracted ${result.words.length} words. Tap any word, select a line, or hold Home button to select.`
          : 'No clear text detected. Please retake photo with better lighting.'
      );
    } catch (err) {
      console.error('Photo capture OCR error:', err);
      setScanningStatus('OCR extraction failed. You can retake or type the code manually.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Retake photo: return to viewfinder
  const handleRetake = () => {
    setScannerStage('viewfinder');
    setCapturedImage(null);
    setLensWords([]);
    setLensRecommendedCode(undefined);
    setIsAnalyzing(false);
    setScanningStatus('Position voucher in frame and tap "Capture Photo"');
    if (!cameraActive) {
      startCamera();
    }
  };

  // Handle Photo Upload directly into Lens mode
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanningStatus('Loading uploaded photo...');
    try {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.src = objectUrl;

      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
      });

      // Quick barcode check
      const nativeBarcode = await detectBarcodeNative(img);
      if (nativeBarcode) {
        const matched = matchCodeAgainstCatalog(nativeBarcode, knownCodes);
        const finalCode = matched ? matched.matchedCode : nativeBarcode;
        handleApplyCode(finalCode);
        URL.revokeObjectURL(objectUrl);
        return;
      }

      setCapturedImage(img);
      setScannerStage('lens');
      setIsAnalyzing(true);
      setScanningStatus('Extracting text and words for Lens selector...');

      const result = await extractWordsWithBoundingBoxes(img, knownCodes);
      setLensWords(result.words);
      setLensRecommendedCode(result.recommendedCode);
      setScanningStatus(
        result.words.length > 0
          ? `Extracted ${result.words.length} text items. Select your line of text.`
          : 'No text found in photo. Please upload a clear photo.'
      );
    } catch (err) {
      console.error('Uploaded photo extraction error:', err);
      setScanningStatus('Could not read image. Please type the code manually.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Apply selected code (single or multiple mode)
  const handleApplyCode = (code: string) => {
    const cleanCode = code.trim();
    if (!cleanCode) return;

    playScanSuccessChime();
    triggerScanVibrate();

    // In batch/multiple mode: append to scanned session list if not already added
    if (effectiveMode === 'multiple') {
      setScannedSessionList((prev) => {
        if (prev.includes(cleanCode)) return prev;
        return [...prev, cleanCode];
      });
      onCodeScanned(cleanCode);
      setScanningStatus(`Added "${cleanCode}" to batch queue! Capture another voucher or click Done.`);
      // Return to viewfinder for next capture in batch mode
      handleRetake();
    } else {
      // In single mode: fire callback and close
      onCodeScanned(cleanCode);
      onClose();
    }
  };

  // Handle manual input submit
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = manualCodeInput.trim();
    if (!clean) return;

    const matched = matchCodeAgainstCatalog(clean, knownCodes);
    const finalCode = matched ? matched.matchedCode : clean;

    handleApplyCode(finalCode);
    setManualCodeInput('');
  };

  // Detailed preview list of all matched vouchers in batch mode
  const batchMatchedVouchers = useMemo(() => {
    return scannedSessionList.map((code) => {
      const match = catalogVouchers.find(
        (v) => v.code.toUpperCase() === code.toUpperCase()
      );
      return {
        code,
        price: match ? match.price : null,
        plan: match ? match.plan : 'Standard Voucher',
        status: match ? match.status : 'assigned'
      };
    });
  }, [scannedSessionList, catalogVouchers]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md">
      <div
        className={`w-full max-w-xl rounded-3xl border shadow-2xl overflow-hidden flex flex-col transition-all max-h-[96vh] ${
          theme === 'light' ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
        }`}
      >
        {/* Prominent Header with Fully Visible Cancel / Back Button */}
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50 dark:bg-slate-950/70">
          <div className="flex items-center gap-3">
            {/* Back Button when in Lens review mode to return to viewfinder */}
            {scannerStage === 'lens' ? (
              <button
                type="button"
                onClick={handleRetake}
                className="p-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition cursor-pointer flex items-center gap-1.5 border border-slate-300 dark:border-slate-700"
                title="Back to Camera Viewfinder"
              >
                <RotateCcw className="w-4 h-4" />
                <span className="text-xs font-mono font-bold hidden xs:inline">Retake</span>
              </button>
            ) : (
              <div className="p-2 rounded-xl bg-sky-500/15 text-sky-400 border border-sky-500/25">
                <Camera className="w-5 h-5" />
              </div>
            )}

            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base font-mono tracking-tight text-slate-900 dark:text-white">
                  {scannerStage === 'lens' ? 'Select Voucher Line' : title}
                </h3>
                {effectiveMode === 'multiple' ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-purple-500/15 text-purple-400 border border-purple-500/20">
                    Batch Mode
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                    Single Mode
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                {scannerStage === 'lens'
                  ? 'Tap any word, select a line, or hold Home button to select desired text'
                  : subtitle || 'Capture a photo of the voucher, then select the code'}
              </p>
            </div>
          </div>

          {/* Fully Visible Cancel / Close Button */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-mono text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-sm"
              title="Cancel & Close Scanner"
            >
              <X className="w-4 h-4 text-rose-400" />
              <span>Cancel</span>
            </button>
          </div>
        </div>

        {/* Scanner Stage Content */}
        {scannerStage === 'lens' ? (
          <div className="relative bg-slate-950 flex-1 min-h-[320px] sm:min-h-[380px] flex items-center justify-center overflow-hidden">
            {isAnalyzing ? (
              <div className="flex flex-col items-center justify-center p-8 space-y-4 text-center">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full border-4 border-sky-500/20 border-t-sky-400 animate-spin" />
                  <Camera className="w-6 h-6 text-sky-400 absolute inset-0 m-auto animate-pulse" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-sm text-white font-mono">Analyzing Captured Voucher...</h4>
                  <p className="text-xs text-slate-400 font-mono">
                    Extracting text lines for Google Lens selection
                  </p>
                </div>
              </div>
            ) : capturedImage ? (
              <InteractiveLensCanvas
                imageElement={capturedImage}
                words={lensWords}
                recommendedCode={lensRecommendedCode}
                onSelectCode={handleApplyCode}
                onRetake={handleRetake}
                theme={theme}
                catalogVouchers={catalogVouchers}
                isBatchMode={effectiveMode === 'multiple'}
                selectedBatchCodes={scannedSessionList}
              />
            ) : null}
          </div>
        ) : (
          /* Viewfinder Stage (Capture Only - NO automatic scanner) */
          <div className="relative bg-black flex-1 min-h-[320px] sm:min-h-[380px] flex items-center justify-center overflow-hidden">
            {/* Live Camera Feed */}
            <video
              ref={videoRef}
              playsInline
              autoPlay
              muted
              className={`w-full h-full object-cover transition-opacity duration-300 ${cameraActive ? 'opacity-100' : 'opacity-0'}`}
            />

            {/* Camera Error Message */}
            {cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-950/95 space-y-3 z-20">
                <div className="p-3 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <h4 className="font-bold text-sm text-white">Camera Unavailable</h4>
                <p className="text-xs text-slate-300 max-w-xs font-mono">{cameraError}</p>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={startCamera}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold font-mono transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Retry Camera
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowManualInput(true)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold font-mono transition cursor-pointer"
                  >
                    Type Code
                  </button>
                </div>
              </div>
            )}

            {/* Fully Visible Framing Overlay Reticle UI (Framing guide for user to aim before capturing) */}
            {cameraActive && !cameraError && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                {/* Semi-transparent dark mask */}
                <div className="absolute inset-0 bg-black/40" />

                {/* High-visibility bounding frame */}
                <div className="relative w-[84%] sm:w-[76%] h-[40%] max-h-[160px] rounded-2xl border-2 border-sky-400/90 shadow-[0_0_30px_rgba(56,189,248,0.35)] overflow-hidden">
                  {/* 4 Crisp Corner Brackets */}
                  <div className="absolute top-0 left-0 w-5 h-5 border-t-4 border-l-4 border-white" />
                  <div className="absolute top-0 right-0 w-5 h-5 border-t-4 border-r-4 border-white" />
                  <div className="absolute bottom-0 left-0 w-5 h-5 border-b-4 border-l-4 border-white" />
                  <div className="absolute bottom-0 right-0 w-5 h-5 border-b-4 border-r-4 border-white" />

                  {/* Framing Reticle Center Line */}
                  <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[1px] bg-sky-300/40" />

                  {/* Header Badge */}
                  <div className="absolute top-2 inset-x-0 text-center">
                    <span className="text-[10px] font-mono font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-black/75 text-sky-200 border border-sky-400/30 backdrop-blur-sm">
                      FRAME VOUCHER PRINT
                    </span>
                  </div>

                  {/* Instruction Footer Badge */}
                  <div className="absolute bottom-2 inset-x-0 text-center">
                    <span className="text-[10px] font-mono font-semibold px-2.5 py-0.5 rounded-full bg-black/75 text-slate-200 backdrop-blur-sm">
                      Align voucher then tap "Capture Photo" below
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Primary Action Button Floating Over Live Camera */}
            {cameraActive && !cameraError && (
              <div className="absolute bottom-4 inset-x-0 flex flex-col items-center gap-2 z-20 pointer-events-auto px-4">
                <div className="flex items-center justify-center gap-2.5 w-full max-w-sm">
                  {/* Flashlight toggle */}
                  {torchAvailable && (
                    <button
                      type="button"
                      onClick={toggleTorch}
                      className={`p-3 rounded-2xl backdrop-blur-md border text-xs font-mono transition cursor-pointer shadow-lg ${
                        torchOn
                          ? 'bg-amber-500/90 border-amber-400 text-white shadow-amber-500/30'
                          : 'bg-black/70 border-white/20 text-white hover:bg-black/90'
                      }`}
                      title="Toggle Flashlight"
                    >
                      {torchOn ? <Flashlight className="w-5 h-5" /> : <FlashlightOff className="w-5 h-5" />}
                    </button>
                  )}

                  {/* Camera flip toggle */}
                  <button
                    type="button"
                    onClick={toggleFacingMode}
                    className="p-3 rounded-2xl bg-black/70 hover:bg-black/90 backdrop-blur-md border border-white/20 text-white transition cursor-pointer shadow-lg"
                    title="Switch Camera (Front/Back)"
                  >
                    <SwitchCamera className="w-5 h-5" />
                  </button>

                  {/* Capture Photo Button (Google Lens Trigger) */}
                  <button
                    type="button"
                    onClick={handleCapturePhoto}
                    className="flex-1 py-3 px-5 rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-mono font-bold text-sm shadow-xl shadow-sky-500/30 transition flex items-center justify-center gap-2 cursor-pointer border border-sky-300"
                  >
                    <Camera className="w-5 h-5" />
                    <span>Capture Photo</span>
                  </button>

                  {/* Manual Keyboard toggle */}
                  <button
                    type="button"
                    onClick={() => setShowManualInput((prev) => !prev)}
                    className={`p-3 rounded-2xl backdrop-blur-md border text-xs transition cursor-pointer shadow-lg ${
                      showManualInput
                        ? 'bg-sky-600 border-sky-400 text-white'
                        : 'bg-black/70 border-white/20 text-white hover:bg-black/90'
                    }`}
                    title="Enter Voucher Manually"
                  >
                    <Keyboard className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Status Bar & Upload Photo option */}
        <div className="px-5 py-2.5 bg-slate-100 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs font-mono shrink-0">
          <div className="flex items-center gap-2 truncate">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                engineReady ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span className="text-slate-600 dark:text-slate-300 truncate">{scanningStatus}</span>
          </div>

          <label className="text-xs text-sky-500 hover:text-sky-400 font-bold hover:underline cursor-pointer flex items-center gap-1.5 shrink-0 ml-2">
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Photo</span>
            <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
          </label>
        </div>

        {/* Manual Input Drawer */}
        {showManualInput && (
          <form
            onSubmit={handleManualSubmit}
            className="p-3 bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2"
          >
            <input
              ref={manualInputRef}
              type="text"
              value={manualCodeInput}
              onChange={(e) => setManualCodeInput(e.target.value)}
              placeholder="Type or paste voucher code (e.g. 4n33u4)..."
              autoFocus
              className="flex-1 px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:border-sky-500"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-mono font-bold text-xs cursor-pointer shadow-sm"
            >
              Submit
            </button>
          </form>
        )}

        {/* BATCH SCANNER: Detailed Preview List of Matched Vouchers */}
        {effectiveMode === 'multiple' && (
          <div className="p-4 bg-slate-50 dark:bg-slate-950/80 border-t border-slate-200 dark:border-slate-800 shrink-0 space-y-3">
            <div className="flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-400" />
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  Batch Matched Vouchers Preview
                </span>
              </div>
              <span className="font-bold text-purple-400 bg-purple-500/15 px-2.5 py-0.5 rounded-lg border border-purple-500/25">
                {scannedSessionList.length} captured in session
              </span>
            </div>

            {/* List preview of all matched vouchers */}
            {batchMatchedVouchers.length > 0 ? (
              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-200 dark:divide-slate-800/80">
                {batchMatchedVouchers.map((item, index) => (
                  <div
                    key={`${item.code}-${index}`}
                    className="pt-1.5 first:pt-0 flex items-center justify-between gap-2 text-xs font-mono"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] text-slate-400 w-4 font-bold">{index + 1}.</span>
                      <span className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-300 font-bold border border-purple-500/20 truncate">
                        {item.code}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400 text-[11px] truncate">
                        {item.plan}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {item.price !== null ? (
                        <span className="font-bold text-emerald-500 dark:text-emerald-400 text-[11px]">
                          ${(item.price || 0).toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[10px]">Unpriced</span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setScannedSessionList((prev) => prev.filter((c) => c !== item.code));
                        }}
                        className="p-1 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                        title="Remove voucher from queue"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                  No vouchers captured in this batch session yet. Capture a photo to add vouchers.
                </p>
              </div>
            )}

            {/* Bottom Actions for Batch Mode */}
            <div className="pt-2 flex items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-mono font-semibold transition cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={onClose}
                className="flex-1 max-w-xs py-2 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-mono font-bold text-xs shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>Done ({scannedSessionList.length} Vouchers)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Single Mode Footer with Fully Visible Cancel */}
        {effectiveMode === 'single' && (
          <div className="p-3.5 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs font-mono shrink-0">
            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-sky-400" />
              Capture photo & select code with Google Lens
            </span>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-mono font-bold transition cursor-pointer shadow-xs"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
