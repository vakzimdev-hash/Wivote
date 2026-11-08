import { createWorker, Worker } from 'tesseract.js';

let cachedWorker: Worker | null = null;
let isInitializingWorker = false;
let audioContext: AudioContext | null = null;

/**
 * Positive acoustic POS chime on successful scan
 */
export function playScanSuccessChime(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    if (!audioContext || audioContext.state === 'suspended') {
      audioContext = new AudioCtx();
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    const now = audioContext.currentTime;
    
    // Tone 1: 880Hz (A5)
    const osc1 = audioContext.createOscillator();
    const gain1 = audioContext.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.exponentialRampToValueAtTime(1320, now + 0.08);
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc1.connect(gain1);
    gain1.connect(audioContext.destination);
    osc1.start(now);
    osc1.stop(now + 0.12);

    // Tone 2: 1760Hz (A6) short crisp confirmation
    const osc2 = audioContext.createOscillator();
    const gain2 = audioContext.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1760, now + 0.08);
    gain2.gain.setValueAtTime(0.25, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc2.connect(gain2);
    gain2.connect(audioContext.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.22);
  } catch (err) {
    // Audio may be blocked until user gesture, safely ignore
    console.debug('Audio chime skipped:', err);
  }
}

/**
 * Haptic vibration feedback
 */
export function triggerScanVibrate(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([50, 40, 90]);
    }
  } catch {
    // Ignore if not supported
  }
}

/**
 * Lazily initialize and cache the Tesseract OCR worker for maximum speed
 */
export async function getTesseractWorker(): Promise<Worker> {
  if (cachedWorker) return cachedWorker;
  if (isInitializingWorker) {
    // Wait for in-progress initialization
    while (isInitializingWorker) {
      await new Promise(res => setTimeout(res, 50));
    }
    if (cachedWorker) return cachedWorker;
  }

  isInitializingWorker = true;
  try {
    const worker = await createWorker('eng', 1, {
      errorHandler: (err) => console.warn('Tesseract warning:', err),
    });

    // Whitelist alphanumeric characters (BOTH LOWERCASE AND UPPERCASE) and common separators
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_ ',
      tessedit_pageseg_mode: '6' as unknown as import('tesseract.js').PSM, // Assume a single uniform block of text
    });

    cachedWorker = worker;
    return worker;
  } finally {
    isInitializingWorker = false;
  }
}

/**
 * Preprocess image / video frame on a canvas for optimal OCR accuracy:
 * - Crops region of interest (e.g. top voucher code reticle slit)
 * - Scales up resolution for crisp character boundaries
 * - High-speed 16x16 local block-based adaptive thresholding to eliminate
 *   shadow gradients, uneven desk lighting, and thermal receipt fades
 */
export function preprocessFrame(
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  cropRect: { x: number; y: number; width: number; height: number },
  targetCanvas: HTMLCanvasElement
): HTMLCanvasElement {
  const ctx = targetCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return targetCanvas;

  // Scale up small crops so character x-height is ~35-50px (minimum 500px width)
  const scale = Math.max(1.5, Math.min(3.5, 750 / Math.max(cropRect.width, 100)));
  const outWidth = Math.round(cropRect.width * scale);
  const outHeight = Math.round(cropRect.height * scale);

  targetCanvas.width = outWidth;
  targetCanvas.height = outHeight;

  // Draw cropped frame with smoothing enabled
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    source,
    cropRect.x,
    cropRect.y,
    cropRect.width,
    cropRect.height,
    0,
    0,
    outWidth,
    outHeight
  );

  // Grayscale & High-Speed Local Block Adaptive Thresholding
  const imgData = ctx.getImageData(0, 0, outWidth, outHeight);
  const d = imgData.data;

  // Local adaptive thresholding using 16x16 pixel blocks
  // This completely eliminates shadow gradients, paper bends, and glare
  const blockSize = 16;
  const numBlocksX = Math.ceil(outWidth / blockSize);
  const numBlocksY = Math.ceil(outHeight / blockSize);
  const blockMeans = new Float32Array(numBlocksX * numBlocksY);
  const blockCounts = new Uint16Array(numBlocksX * numBlocksY);

  // Pass 1: compute block luminance sums
  for (let y = 0; y < outHeight; y++) {
    const by = Math.floor(y / blockSize);
    const rowOffset = y * outWidth;
    for (let x = 0; x < outWidth; x++) {
      const bx = Math.floor(x / blockSize);
      const bIdx = by * numBlocksX + bx;
      const idx = (rowOffset + x) * 4;
      const luma = 0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2];
      blockMeans[bIdx] += luma;
      blockCounts[bIdx]++;
    }
  }

  for (let i = 0; i < blockMeans.length; i++) {
    blockMeans[i] = blockCounts[i] ? blockMeans[i] / blockCounts[i] : 128;
  }

  // Pass 2: binarize against local block threshold (12 units below local mean for dark ink)
  for (let y = 0; y < outHeight; y++) {
    const by = Math.floor(y / blockSize);
    const rowOffset = y * outWidth;
    for (let x = 0; x < outWidth; x++) {
      const bx = Math.floor(x / blockSize);
      const bIdx = by * numBlocksX + bx;
      const localThreshold = blockMeans[bIdx] - 12;
      const idx = (rowOffset + x) * 4;
      const luma = 0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2];
      const val = luma > localThreshold ? 255 : 0;
      d[idx] = val;
      d[idx + 1] = val;
      d[idx + 2] = val;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return targetCanvas;
}

/**
 * Normalize code for comparison (strips hyphens, spaces, dots, lowercase)
 */
export function normalizeCode(str: string): string {
  return (str || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const row: number[] = [];
  for (let i = 0; i <= b.length; i++) row[i] = i;

  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      let val: number;
      if (a[i - 1] === b[j - 1]) {
        val = row[j - 1];
      } else {
        val = Math.min(row[j - 1] + 1, prev + 1, row[j] + 1);
      }
      row[j - 1] = prev;
      prev = val;
    }
    row[b.length] = prev;
  }
  return row[b.length];
}

/**
 * Common OCR character confusion replacements
 * e.g., 'O' <-> '0', 'I' <-> '1', 'S' <-> '5', 'B' <-> '8'
 */
function generateOcrVariants(code: string): string[] {
  const norm = normalizeCode(code);
  const variants = new Set<string>([norm]);

  const map: Record<string, string[]> = {
    '0': ['O', 'Q', 'D'],
    'O': ['0'],
    '1': ['I', 'L', 'T'],
    'I': ['1', 'L'],
    'L': ['1', 'I'],
    '5': ['S'],
    'S': ['5'],
    '8': ['B'],
    'B': ['8'],
    '2': ['Z'],
    'Z': ['2']
  };

  // If short enough, substitute one ambiguity at a time
  for (let i = 0; i < norm.length; i++) {
    const ch = norm[i];
    const replacements = map[ch];
    if (replacements) {
      for (const r of replacements) {
        const variant = norm.slice(0, i) + r + norm.slice(i + 1);
        variants.add(variant);
      }
    }
  }

  return Array.from(variants);
}

/**
 * Known noise words commonly printed on voucher slips (headers, plan details, durations, prices, provider brandings)
 * which must never be confused with the voucher code.
 */
export const VOUCHER_NOISE_WORDS = new Set([
  'PROFILE', 'NAME', 'PROFILENAME', 'PROFILE_NAME', 'PROFILE-NAME',
  'PERIOD', 'PERIOD:', 'TIME', 'DURATION', 'VALIDITY', 'EXPIRE', 'EXPIRY', 'DATE',
  'DAYS', 'DAY', '30DAYS', '7DAYS', '14DAYS', '1DAY', '2DAYS', '3DAYS', '60DAYS', '90DAYS', '365DAYS',
  'HOURS', 'HOUR', '24HOURS', '12HOURS', '8HOURS', '6HOURS', '4HOURS', '2HOURS', '1HOUR',
  'MINS', 'MINUTES', '30MINS', '60MINS', '15MINS',
  'MONTH', 'MONTHLY', 'WEEK', 'WEEKLY', 'DAILY', 'NIGHT', 'UNLIMITED', 'UNLIM',
  'VAKZIM', 'CONNECT', 'VAKZIMCONNECT', 'VAKZIM_CONNECT', 'VAKZIM-CONNECT',
  'WIVOTE', 'NETWORK', 'WIFI', 'HOTSPOT', 'INTERNET',
  'VOUCHER', 'TICKET', 'TOKEN', 'COUPON', 'CARD',
  'LOGIN', 'USERNAME', 'USER', 'PASSWORD', 'PASS', 'PIN', 'SERIAL', 'MAC', 'DEVICE',
  'PRICE', 'AMOUNT', 'COST', 'TOTAL', 'BALANCE', 'USD', 'ZMW', 'ZMK', 'RAND', 'KSH', 'UGX',
  'SPEED', 'MBPS', 'GBPS', 'DATA', 'BANDWIDTH'
]);

/**
 * Checks if a token matches noise, duration, plan, or currency patterns on a printed voucher.
 */
export function isVoucherNoiseToken(token: string): boolean {
  if (!token) return true;
  const upper = token.toUpperCase().trim().replace(/^[:;.,_|\-\/\\#]+|[:;.,_|\-\/\\#]+$/g, '');
  if (!upper || upper.length < 2) return true;
  if (VOUCHER_NOISE_WORDS.has(upper)) return true;

  // Currency amounts: e.g. $5.00, $5, 5.00, 10.00, $1.50, 5USD
  // (Requires explicit currency symbol, decimal cents, or currency code suffix so pure numeric voucher codes like 984123 are preserved)
  if (/^\$\d+(?:\.\d{1,2})?$/.test(upper) || /^\d+(?:\.\d{1,2})?\$$/.test(upper)) return true;
  if (/^\d+\.\d{1,2}$/.test(upper)) return true;
  if (/^\d+(?:\.\d{1,2})?(?:USD|ZMW|ZMK|RAND|KSH|UGX)$/.test(upper)) return true;

  // Data quota expressions: e.g. 20GB, 10GB, 1GB, 500MB, 2GB
  if (/^\d+(?:[GMK]B|MB|GB|KB)$/i.test(upper)) return true;

  // Duration expressions: e.g. 30Days, 7Days, 24Hours, 60Mins
  if (/^\d+(?:DAYS?|HOURS?|HRS?|MINS?)$/i.test(upper)) return true;

  // Combined plan profiles: e.g. MONTH_20GB, DAY_1GB, WEEK_5GB, UNLIMITED_1M
  if (/^(?:MONTH|DAY|WEEK|HOUR|PLAN|DATA|SPEED|UNLIMITED)[_\-\s]?(?:\d+[GMK]B|\d+D|\d+H)?$/i.test(upper)) return true;

  // Common brand phrases
  if (/^(?:VAKZIM|CONNECT|WIVOTE)[_\-\s]?(?:CONNECT|NETWORK|WIFI)?$/i.test(upper)) return true;

  // Repeated punctuation or dashes
  if (/^[-=_*#./\\]+$/.test(upper)) return true;

  return false;
}

/**
 * Match recognized OCR text against a catalog of known voucher codes.
 * Returns the exact matched voucher code or null.
 */
export function matchCodeAgainstCatalog(
  rawRecognizedText: string,
  knownCodes: string[]
): { matchedCode: string; confidence: number } | null {
  if (!rawRecognizedText || !knownCodes.length) return null;

  const upperRaw = rawRecognizedText.toUpperCase();
  const normalizedRaw = normalizeCode(upperRaw);

  // 1. Direct whole-token comparison (avoid matching substrings in noise words)
  const tokens = upperRaw
    .split(/[\s,;:|]+/)
    .map(t => t.trim().replace(/^[:;.,_|\-\/\\#]+|[:;.,_|\-\/\\#]+$/g, ''))
    .filter(t => t.length >= 4 && !isVoucherNoiseToken(t));

  for (const token of tokens) {
    const normToken = normalizeCode(token);
    for (const code of knownCodes) {
      if (!code) continue;
      const cleanCode = code.toUpperCase().trim();
      const normCode = normalizeCode(cleanCode);

      if (token === cleanCode || normToken === normCode) {
        return { matchedCode: code, confidence: 1.0 };
      }
    }

    // OCR Ambiguity variants check
    const variants = generateOcrVariants(token);
    for (const code of knownCodes) {
      if (!code) continue;
      const normCode = normalizeCode(code);
      if (variants.includes(normCode)) {
        return { matchedCode: code, confidence: 0.94 };
      }
    }

    // Levenshtein fuzzy match for codes >= 5 chars
    for (const code of knownCodes) {
      if (!code) continue;
      const normCode = normalizeCode(code);
      if (Math.abs(normToken.length - normCode.length) <= 1 && normCode.length >= 5) {
        const dist = levenshtein(normToken, normCode);
        if (dist <= 1) {
          return { matchedCode: code, confidence: 0.89 };
        }
      }
    }
  }

  // 2. Normalized search across whole block as fallback
  for (const code of knownCodes) {
    if (!code) continue;
    const normCode = normalizeCode(code);
    if (normCode.length >= 5 && !isVoucherNoiseToken(normCode) && normalizedRaw.includes(normCode)) {
      return { matchedCode: code, confidence: 0.92 };
    }
  }

  return null;
}

/**
 * Regex-based pre-processing step that explicitly targets the first line of the scanned voucher text.
 * - Isolates the topmost line containing alphanumeric characters, completely ignoring all secondary lines.
 * - Cleans extraneous noise characters (symbols, brackets, punctuation, hashes, asterisks).
 * - Strips common ticket label prefixes (e.g. "Profile name", "Voucher Code:", "Token:", "PIN:", "Code:").
 * - Applies targeted regex patterns to extract only the voucher code pattern reliably.
 */
export function extractFirstLineVoucherCodeRegex(
  rawText: string,
  knownCodes: string[] = []
): string | null {
  if (!rawText) return null;

  // 1. Explicitly isolate the first line containing alphanumeric characters (ignoring secondary lines)
  const lines = rawText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => /[a-zA-Z0-9]/.test(l));

  if (lines.length === 0) return null;
  const firstLine = lines[0];

  // 2. Check if any known catalog code is explicitly present on this first line
  if (knownCodes.length > 0) {
    const firstLineUpper = firstLine.toUpperCase();
    for (const kc of knownCodes) {
      if (!kc) continue;
      const cleanKc = kc.toUpperCase().trim();
      const escaped = cleanKc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(?:^|[^a-zA-Z0-9])${escaped}(?:$|[^a-zA-Z0-9])`, 'i');
      if (re.test(firstLineUpper)) {
        return kc;
      }
    }
  }

  // 3. Remove outer bounding noise characters from the first line
  // e.g. "*** [ Profile name: 4n33u4 ] ***" -> "Profile name: 4n33u4"
  let cleanedLine = firstLine
    .replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '')
    .trim();

  // 4. Strip common ticket labels and noise prefixes using regex (case-insensitive)
  // e.g., "Profile name 4n33u4" -> "4n33u4"
  // e.g., "Profile Name: 4n33u4" -> "4n33u4"
  // e.g., "Voucher # 4n33u4" -> "4n33u4"
  // e.g., "Code: 4n33u4" -> "4n33u4"
  const labelPrefixRegex = /^(?:profile\s*name|profile_name|profile-name|profile|voucher\s*code|voucher|token|ticket|pin|code|user(?:name)?|login|serial|card|wifi\s*voucher|id)[\s:=#\-_|]+/i;
  cleanedLine = cleanedLine.replace(labelPrefixRegex, '').trim();

  // Strip any residual boundary punctuation left after removing label prefix
  cleanedLine = cleanedLine.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '').trim();

  // 5. Direct match if the cleaned first line is already a clean voucher code
  // Delimited code (e.g., HRE-9214, WIF-1234-XYZ)
  const isDelimited = /^[a-zA-Z0-9]{2,8}(?:[-_][a-zA-Z0-9]{2,8})+$/.test(cleanedLine);
  // Alphanumeric code (e.g., 4n33u4, 829103)
  const isAlphanumeric = /^[a-zA-Z0-9]{4,16}$/.test(cleanedLine);

  if ((isDelimited || isAlphanumeric) && !isVoucherNoiseToken(cleanedLine)) {
    return cleanedLine;
  }

  // 6. Regex token extraction targeting voucher code patterns within the first line:
  // Extracts delimited patterns like HRE-9214 or alphanumeric patterns of 4-16 characters
  const tokenPatternRegex = /\b([a-zA-Z0-9]{2,8}(?:[-_][a-zA-Z0-9]{2,8})+|[a-zA-Z0-9]{4,16})\b/g;
  const matches = cleanedLine.match(tokenPatternRegex);

  if (matches && matches.length > 0) {
    const validTokens = matches.filter(token => {
      const cleanToken = token.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
      return cleanToken.length >= 4 && cleanToken.length <= 16 && !isVoucherNoiseToken(cleanToken);
    });

    if (validTokens.length > 0) {
      // Prioritize:
      // a) Matches in knownCodes
      if (knownCodes.length > 0) {
        for (const token of validTokens) {
          const match = knownCodes.find(kc => kc.toUpperCase() === token.toUpperCase());
          if (match) return match;
        }
      }

      // b) Mixed alphanumeric codes (both letters and numbers, e.g. 4n33u4) or hyphenated codes (e.g. HRE-9214)
      const mixedOrHyphenated = validTokens.find(token => 
        (token.includes('-') || token.includes('_')) || (/\d/.test(token) && /[a-zA-Z]/.test(token))
      );
      if (mixedOrHyphenated) return mixedOrHyphenated;

      // c) Return the first valid non-noise token on the first line
      return validTokens[0];
    }
  }

  // 7. Fallback: match any contiguous 4-16 alphanumeric sequence on the first line
  const fallbackMatch = cleanedLine.match(/[a-zA-Z0-9]{4,16}/);
  if (fallbackMatch && !isVoucherNoiseToken(fallbackMatch[0])) {
    return fallbackMatch[0];
  }

  return null;
}

/**
 * Intelligent Top-First Voucher Code Extractor:
 * Tailor-made for printed voucher tickets (such as thermal or paper slips).
 * - Applies a regex-based pre-processing step explicitly targeting the first line of the scanned voucher text.
 * - Completely ignores all extraneous noise characters and secondary lines ("MONTH_20GB", "Period", "30Days", "$5.00", "Vakzim Connect").
 * - Supports mixed case, numbers, and standard voucher formats.
 */
export function extractTargetedVoucherCode(
  rawText: string,
  knownCodes: string[] = []
): string | null {
  if (!rawText) return null;
  const cleanRaw = rawText.trim();
  if (!cleanRaw) return null;

  // 1. REGEX PRE-PROCESSING STEP: Explicitly targets the FIRST line of the scanned voucher text.
  // Ignores extraneous noise characters and completely ignores secondary lines.
  const firstLineCode = extractFirstLineVoucherCodeRegex(cleanRaw, knownCodes);
  if (firstLineCode) {
    return firstLineCode;
  }

  // 2. Secondary check if any active catalog voucher code matches full text
  const catalogMatch = matchCodeAgainstCatalog(cleanRaw, knownCodes);
  if (catalogMatch) {
    return catalogMatch.matchedCode;
  }

  // 3. Line-by-Line Parsing prioritizing the TOPMOST FIRST LINE
  const lines = cleanRaw
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length === 0) return null;

  interface Candidate {
    code: string;
    score: number;
    lineIdx: number;
    tokenIdx: number;
  }
  const candidates: Candidate[] = [];

  lines.forEach((line, lineIdx) => {
    const tokens = line
      .split(/[\s,;:|]+/)
      .map(t => t.trim().replace(/^[:;.,_|\-\/\\#]+|[:;.,_|\-\/\\#]+$/g, ''))
      .filter(Boolean);

    tokens.forEach((token, tokenIdx) => {
      // Discard noise words
      if (isVoucherNoiseToken(token)) return;

      const cleanToken = token.replace(/[^a-zA-Z0-9_-]/g, '');
      if (cleanToken.length < 4 || cleanToken.length > 18) return;

      let score = 0;

      // TOPMOST FIRST LINE PRIORITY: Massive scoring boost for line 0!
      if (lineIdx === 0) {
        score += 150;
      } else if (lineIdx === 1) {
        score += 30;
      }

      // Token position bonus: if preceded by labels (like "Profile name"), it's the target code!
      if (tokenIdx > 0) {
        score += 30;
      }

      // Alphanumeric mixture (contains both letters and numbers, like 4n33u4)
      const hasDigit = /\d/.test(cleanToken);
      const hasLetter = /[a-zA-Z]/.test(cleanToken);
      if (hasDigit && hasLetter) {
        score += 50;
      }

      // Typical voucher code length (5 to 10 chars, like 4n33u4)
      if (cleanToken.length >= 5 && cleanToken.length <= 10) {
        score += 35;
      }

      // Matches voucher format regex
      if (/^[a-zA-Z0-9]{5,10}$/.test(cleanToken) || /^[a-zA-Z0-9]{3,6}-[a-zA-Z0-9]{3,6}$/.test(cleanToken)) {
        score += 25;
      }

      // Exact match against catalog vouchers
      for (const kc of knownCodes) {
        if (kc.toUpperCase() === cleanToken.toUpperCase()) {
          score += 300;
          return candidates.push({ code: kc, score, lineIdx, tokenIdx });
        }
      }

      candidates.push({ code: cleanToken, score, lineIdx, tokenIdx });
    });
  });

  if (candidates.length === 0) return null;

  // Sort descending by score
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].code;
}

/**
 * Fallback: Extract the most likely voucher code pattern from raw text.
 * Delegates to extractTargetedVoucherCode for maximum precision.
 */
export function extractVoucherCodePattern(rawText: string, knownCodes: string[] = []): string | null {
  const targeted = extractTargetedVoucherCode(rawText, knownCodes);
  if (targeted) return targeted;

  // Secondary fallback: delimited pattern AAA-BBB-1234
  const patternMatch = rawText.match(/[A-Z0-9]{2,6}[-\s_][A-Z0-9]{2,6}(?:[-\s_][A-Z0-9]{2,6})?/i);
  if (patternMatch) {
    const candidate = patternMatch[0].trim().replace(/\s+/g, '-');
    if (!isVoucherNoiseToken(candidate)) {
      return candidate;
    }
  }

  return null;
}

interface DetectedBarcode {
  rawValue: string;
  format?: string;
}

interface NativeBarcodeDetector {
  detect: (source: ImageBitmapSource) => Promise<DetectedBarcode[]>;
}

/**
 * Fast Native BarcodeDetector (Chrome/Android hardware accelerated, ~5-15ms)
 */
export async function detectBarcodeNative(
  source: ImageBitmapSource
): Promise<string | null> {
  try {
    const BarcodeDetectorClass = (window as unknown as {
      BarcodeDetector?: new (options?: { formats: string[] }) => NativeBarcodeDetector;
    }).BarcodeDetector;
    if (!BarcodeDetectorClass) return null;

    const detector = new BarcodeDetectorClass({
      formats: ['qr_code', 'code_128', 'code_39', 'codabar', 'ean_13', 'data_matrix']
    });

    const barcodes = await detector.detect(source);
    if (barcodes && barcodes.length > 0) {
      const raw = barcodes[0].rawValue;
      if (raw && raw.trim().length > 0) {
        return raw.trim();
      }
    }
  } catch {
    // BarcodeDetector not supported or errored, fallback silently
  }
  return null;
}
