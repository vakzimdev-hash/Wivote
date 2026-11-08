import { getTesseractWorker, isVoucherNoiseToken, normalizeCode } from './textRecognition';
import { NormalizedRect } from './lensGeometry';

export interface LensWord {
  id: string;
  text: string;
  cleanText: string;
  confidence: number;
  lineIndex: number;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
  normalizedRect: NormalizedRect;
  isVoucherCandidate: boolean;
  catalogMatch?: string;
}

export interface LensOcrResult {
  fullText: string;
  words: LensWord[];
  imageWidth: number;
  imageHeight: number;
  recommendedCode?: string;
}

/**
 * Extracts OCR words alongside their exact bounding box coordinates (x, y, width, height)
 * using client-side Tesseract.js.
 */
export async function extractWordsWithBoundingBoxes(
  imageSource: HTMLCanvasElement | HTMLImageElement | ImageData | string,
  knownCodes: string[] = []
): Promise<LensOcrResult> {
  const worker = await getTesseractWorker();

  // Determine source dimensions
  let srcWidth = 800;
  let srcHeight = 600;

  if (imageSource instanceof HTMLCanvasElement) {
    srcWidth = imageSource.width;
    srcHeight = imageSource.height;
  } else if (imageSource instanceof HTMLImageElement) {
    srcWidth = imageSource.naturalWidth || imageSource.width || 800;
    srcHeight = imageSource.naturalHeight || imageSource.height || 600;
  }

  let targetImage: any = imageSource;
  if (typeof ImageData !== 'undefined' && imageSource instanceof ImageData) {
    srcWidth = imageSource.width;
    srcHeight = imageSource.height;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = imageSource.width;
    tempCanvas.height = imageSource.height;
    const ctx = tempCanvas.getContext('2d');
    if (ctx) {
      ctx.putImageData(imageSource, 0, 0);
      targetImage = tempCanvas;
    }
  }

  // Execute Tesseract OCR recognition
  const ocrData = await worker.recognize(targetImage);
  const page = ocrData?.data as any;
  const rawText: string = page?.text || '';

  const rawWords: any[] = page?.words || page?.lines?.flatMap((l: any) => l.words || []) || [];
  const processedWords: LensWord[] = [];

  rawWords.forEach((w, idx) => {
    const origText = (w.text || '').trim();
    if (!origText) return;

    // Clean extraneous boundary symbols
    const clean = origText.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
    if (!clean) return;

    const x0 = Math.max(0, w.bbox?.x0 ?? 0);
    const y0 = Math.max(0, w.bbox?.y0 ?? 0);
    const x1 = Math.min(srcWidth, w.bbox?.x1 ?? 0);
    const y1 = Math.min(srcHeight, w.bbox?.y1 ?? 0);

    const width = Math.max(1, x1 - x0);
    const height = Math.max(1, y1 - y0);

    // Normalize coordinates (0 to 1) for responsive canvas scaling
    const normalizedRect: NormalizedRect = {
      x: srcWidth > 0 ? x0 / srcWidth : 0,
      y: srcHeight > 0 ? y0 / srcHeight : 0,
      width: srcWidth > 0 ? width / srcWidth : 0,
      height: srcHeight > 0 ? height / srcHeight : 0,
    };

    // Determine candidate status
    const isNoise = isVoucherNoiseToken(clean);
    const isAlphanumericCode = /^[a-zA-Z0-9_-]{4,18}$/.test(clean);
    const hasMixedOrDigits = /\d/.test(clean) || clean.includes('-') || clean.includes('_');

    // Check catalog matches
    let catalogMatch: string | undefined = undefined;
    if (knownCodes.length > 0) {
      const match = knownCodes.find(
        (kc) => normalizeCode(kc) === normalizeCode(clean)
      );
      if (match) {
        catalogMatch = match;
      }
    }

    const isVoucherCandidate =
      !isNoise && (Boolean(catalogMatch) || (isAlphanumericCode && hasMixedOrDigits));

    processedWords.push({
      id: `word_${idx}_${clean}`,
      text: origText,
      cleanText: clean,
      confidence: w.confidence || 0,
      lineIndex: (w as unknown as { line?: { id?: number } })?.line?.id ?? 0,
      bbox: { x0, y0, x1, y1 },
      normalizedRect,
      isVoucherCandidate,
      catalogMatch,
    });
  });

  // Pick top recommended voucher code
  let recommendedCode: string | undefined = undefined;

  // 1. Direct catalog match
  const matchedCandidate = processedWords.find((w) => w.catalogMatch);
  if (matchedCandidate) {
    recommendedCode = matchedCandidate.catalogMatch;
  } else {
    // 2. Highest confidence candidate near the top of the voucher
    const candidates = processedWords.filter((w) => w.isVoucherCandidate);
    if (candidates.length > 0) {
      // Sort primarily by vertical position (top of ticket first), then confidence
      candidates.sort((a, b) => {
        const topDiff = a.normalizedRect.y - b.normalizedRect.y;
        if (Math.abs(topDiff) > 0.15) {
          return topDiff; // prefer top lines
        }
        return b.confidence - a.confidence;
      });
      recommendedCode = candidates[0].cleanText;
    }
  }

  return {
    fullText: rawText,
    words: processedWords,
    imageWidth: srcWidth,
    imageHeight: srcHeight,
    recommendedCode,
  };
}
