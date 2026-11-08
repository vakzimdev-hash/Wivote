import React from 'react';
import { Customer, Voucher } from '../types';
import { isPlaceholderOrWalkInClient } from '../context/AppContext';

/**
 * Levenshtein distance for fuzzy typo tolerance
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const row: number[] = [];
  for (let i = 0; i <= b.length; i++) {
    row[i] = i;
  }

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

export interface FuzzyMatchResult {
  matched: boolean;
  score: number;
  matchIndices: number[]; // Exact character indices in the target text that matched
}

/**
 * Fuzzy matches target string against query string
 * Returns whether it matched, a numeric relevance score (higher = better), and matched character indices for highlighting
 */
export function fuzzyMatch(target: string, query: string): FuzzyMatchResult {
  if (!query || !query.trim()) {
    return { matched: true, score: 0, matchIndices: [] };
  }
  if (!target) {
    return { matched: false, score: 0, matchIndices: [] };
  }

  const rawTarget = target;
  const rawQuery = query.trim();
  const lowerTarget = rawTarget.toLowerCase();
  const lowerQuery = rawQuery.toLowerCase();

  // 1. Exact match (highest priority)
  if (lowerTarget === lowerQuery) {
    const indices = Array.from({ length: target.length }, (_, i) => i);
    return { matched: true, score: 1000, matchIndices: indices };
  }

  // 2. Starts with query (prefix match)
  if (lowerTarget.startsWith(lowerQuery)) {
    const indices = Array.from({ length: rawQuery.length }, (_, i) => i);
    return { matched: true, score: 850 - (target.length - rawQuery.length) * 2, matchIndices: indices };
  }

  // 3. Substring match
  const substrIndex = lowerTarget.indexOf(lowerQuery);
  if (substrIndex !== -1) {
    const indices = Array.from({ length: rawQuery.length }, (_, i) => substrIndex + i);
    // Extra bonus if on a word boundary
    const isWordBoundary = substrIndex === 0 || /[\s_\-:/]/.test(lowerTarget[substrIndex - 1]);
    const score = isWordBoundary ? 750 - substrIndex : 650 - substrIndex;
    return { matched: true, score, matchIndices: indices };
  }

  // 4. Word boundary / Acronym match (e.g., "JP" matches "John Phiri", "VK" matches "VK92-...")
  const words = lowerTarget.split(/[\s_\-:/]+/);
  if (words.length > 1) {
    const initials = words.map(w => w[0]).join('');
    if (initials.includes(lowerQuery)) {
      const matchIndices: number[] = [];
      let currentWordIdx = 0;
      let targetIdx = 0;
      for (const char of lowerQuery) {
        while (currentWordIdx < words.length) {
          const word = words[currentWordIdx];
          const wordPos = lowerTarget.indexOf(word, targetIdx);
          currentWordIdx++;
          if (word[0] === char && wordPos !== -1) {
            matchIndices.push(wordPos);
            targetIdx = wordPos + 1;
            break;
          }
        }
      }
      if (matchIndices.length === lowerQuery.length) {
        return { matched: true, score: 600, matchIndices };
      }
    }
  }

  // 5. Non-consecutive Fuzzy Subsequence match (e.g. "jhn" matches "John", "4820" matches "VK92-4820")
  let qIdx = 0;
  const fuzzyIndices: number[] = [];
  let fuzzyScore = 0;
  let consecutiveMatches = 0;
  let prevMatchIdx = -2;

  for (let tIdx = 0; tIdx < lowerTarget.length && qIdx < lowerQuery.length; tIdx++) {
    if (lowerTarget[tIdx] === lowerQuery[qIdx]) {
      fuzzyIndices.push(tIdx);
      if (tIdx === prevMatchIdx + 1) {
        consecutiveMatches++;
        fuzzyScore += 30 + consecutiveMatches * 10;
      } else {
        consecutiveMatches = 0;
        fuzzyScore += 15 - Math.min(10, tIdx - prevMatchIdx);
      }

      // Bonus if match occurs after word separator
      if (tIdx === 0 || /[\s_\-:/]/.test(lowerTarget[tIdx - 1])) {
        fuzzyScore += 25;
      }

      prevMatchIdx = tIdx;
      qIdx++;
    }
  }

  if (qIdx === lowerQuery.length) {
    // Penalty for length difference and gaps
    const gapPenalty = (target.length - lowerQuery.length) * 2;
    return { matched: true, score: Math.max(100, 450 + fuzzyScore - gapPenalty), matchIndices: fuzzyIndices };
  }

  // 6. Typo Tolerance via Levenshtein distance on individual words
  // Only check if query length is at least 3 characters
  if (lowerQuery.length >= 3) {
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (Math.abs(word.length - lowerQuery.length) <= 2) {
        const dist = levenshteinDistance(word, lowerQuery);
        const maxDist = lowerQuery.length >= 6 ? 2 : 1;
        if (dist <= maxDist) {
          const wordPos = lowerTarget.indexOf(word);
          const indices = Array.from({ length: word.length }, (_, k) => wordPos + k);
          return {
            matched: true,
            score: 300 - dist * 80,
            matchIndices: indices
          };
        }
      }
    }

    // Also check whole string if short
    if (lowerTarget.length <= lowerQuery.length + 3) {
      const dist = levenshteinDistance(lowerTarget, lowerQuery);
      const maxDist = lowerQuery.length >= 6 ? 2 : 1;
      if (dist <= maxDist) {
        const indices = Array.from({ length: rawTarget.length }, (_, k) => k);
        return {
          matched: true,
          score: 250 - dist * 80,
          matchIndices: indices
        };
      }
    }
  }

  return { matched: false, score: 0, matchIndices: [] };
}

/**
 * Normalized matching for phone numbers and IDs
 */
export function fuzzyMatchDigits(target: string, query: string): FuzzyMatchResult {
  const targetDigits = (target || '').replace(/\D/g, '');
  const queryDigits = (query || '').replace(/\D/g, '');

  if (!queryDigits) {
    return { matched: false, score: 0, matchIndices: [] };
  }

  const idx = targetDigits.indexOf(queryDigits);
  if (idx !== -1) {
    // Map digit index back to original target indices
    const matchIndices: number[] = [];
    let dCount = 0;
    for (let i = 0; i < target.length; i++) {
      if (/\d/.test(target[i])) {
        if (dCount >= idx && dCount < idx + queryDigits.length) {
          matchIndices.push(i);
        }
        dCount++;
      }
    }
    return { matched: true, score: 700 - idx * 10, matchIndices };
  }

  return { matched: false, score: 0, matchIndices: [] };
}

export interface CustomerFuzzyResult {
  customer: Customer;
  score: number;
  matchedFields: {
    customerNumber?: number[];
    name?: number[];
    cellNumber?: number[];
    macAddress?: number[];
    deviceModel?: number[];
  };
}

/**
 * Searches customer list using multi-field fuzzy matching
 */
export function fuzzySearchCustomers(customers: Customer[], query: string): CustomerFuzzyResult[] {
  if (!query || !query.trim()) {
    return (customers || []).map(customer => ({
      customer,
      score: 0,
      matchedFields: {}
    }));
  }

  const cleanQuery = query.trim();
  const results: CustomerFuzzyResult[] = [];

  for (const customer of (customers || [])) {
    if (!customer || !customer.name || isPlaceholderOrWalkInClient(customer.name)) continue;
    let maxScore = 0;
    const matchedFields: CustomerFuzzyResult['matchedFields'] = {};

    // 1. Customer Number (e.g. "CN:01", "01", "1")
    const cnMatch = fuzzyMatch(customer.customerNumber || '', cleanQuery);
    if (cnMatch.matched && cnMatch.score > 0) {
      maxScore = Math.max(maxScore, cnMatch.score + 50); // bonus for ID
      matchedFields.customerNumber = cnMatch.matchIndices;
    } else {
      // Check customer number digits
      const cnDigitMatch = fuzzyMatchDigits(customer.customerNumber || '', cleanQuery);
      if (cnDigitMatch.matched) {
        maxScore = Math.max(maxScore, cnDigitMatch.score + 40);
        matchedFields.customerNumber = cnDigitMatch.matchIndices;
      }
    }

    // 2. Customer Name
    const nameMatch = fuzzyMatch(customer.name || '', cleanQuery);
    if (nameMatch.matched && nameMatch.score > 0) {
      maxScore = Math.max(maxScore, nameMatch.score);
      matchedFields.name = nameMatch.matchIndices;
    }

    // 3. Cell Number
    const cellMatch = fuzzyMatch(customer.cellNumber || '', cleanQuery);
    if (cellMatch.matched && cellMatch.score > 0) {
      maxScore = Math.max(maxScore, cellMatch.score);
      matchedFields.cellNumber = cellMatch.matchIndices;
    } else {
      const cellDigitMatch = fuzzyMatchDigits(customer.cellNumber || '', cleanQuery);
      if (cellDigitMatch.matched) {
        maxScore = Math.max(maxScore, cellDigitMatch.score);
        matchedFields.cellNumber = cellDigitMatch.matchIndices;
      }
    }

    // 4. MAC Address (if legacy device)
    if (customer.macAddress) {
      const macMatch = fuzzyMatch(customer.macAddress, cleanQuery);
      if (macMatch.matched && macMatch.score > 0) {
        maxScore = Math.max(maxScore, macMatch.score);
        matchedFields.macAddress = macMatch.matchIndices;
      }
    }

    // 5. Device Model (if legacy device)
    if (customer.deviceModel) {
      const modelMatch = fuzzyMatch(customer.deviceModel, cleanQuery);
      if (modelMatch.matched && modelMatch.score > 0) {
        maxScore = Math.max(maxScore, modelMatch.score);
        matchedFields.deviceModel = modelMatch.matchIndices;
      }
    }

    if (maxScore > 0) {
      results.push({ customer, score: maxScore, matchedFields });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

export interface VoucherFuzzyResult {
  voucher: Voucher;
  score: number;
  matchedFields: {
    code?: number[];
    plan?: number[];
    location?: number[];
    networkName?: number[];
    price?: number[];
    customerName?: number[];
    customerCell?: number[];
    assignedAgentName?: number[];
    soldByAgentName?: number[];
  };
}

/**
 * Searches voucher inventory using multi-field fuzzy matching
 */
export function fuzzySearchVouchers(vouchers: Voucher[], query: string): VoucherFuzzyResult[] {
  if (!query || !query.trim()) {
    return (vouchers || []).map(voucher => ({
      voucher,
      score: 0,
      matchedFields: {}
    }));
  }

  const cleanQuery = query.trim();
  const results: VoucherFuzzyResult[] = [];

  // If query contains multiple tokens (e.g. batch codes separated by spaces/commas)
  const tokens = cleanQuery.split(/[\s,;]+/).filter(Boolean);

  for (const voucher of (vouchers || [])) {
    let maxScore = 0;
    const matchedFields: VoucherFuzzyResult['matchedFields'] = {};

    // 1. Voucher Code (most important)
    const codeMatch = fuzzyMatch(voucher.code || '', cleanQuery);
    if (codeMatch.matched && codeMatch.score > 0) {
      maxScore = Math.max(maxScore, codeMatch.score + 100);
      matchedFields.code = codeMatch.matchIndices;
    } else if (tokens.length > 1) {
      // Check multi-token batch query
      for (const token of tokens) {
        const tokenMatch = fuzzyMatch(voucher.code || '', token);
        if (tokenMatch.matched && tokenMatch.score > 0) {
          maxScore = Math.max(maxScore, tokenMatch.score + 50);
          matchedFields.code = tokenMatch.matchIndices;
          break;
        }
      }
    }

    // 2. Plan (e.g. "1 Hour", "Daily", "Monthly")
    const planMatch = fuzzyMatch(voucher.plan || '', cleanQuery);
    if (planMatch.matched && planMatch.score > 0) {
      maxScore = Math.max(maxScore, planMatch.score);
      matchedFields.plan = planMatch.matchIndices;
    }

    // 3. Location / Node
    const locMatch = fuzzyMatch(voucher.location || '', cleanQuery);
    if (locMatch.matched && locMatch.score > 0) {
      maxScore = Math.max(maxScore, locMatch.score);
      matchedFields.location = locMatch.matchIndices;
    }

    // 4. WiFi SSID / Network Name
    if (voucher.networkName) {
      const netMatch = fuzzyMatch(voucher.networkName, cleanQuery);
      if (netMatch.matched && netMatch.score > 0) {
        maxScore = Math.max(maxScore, netMatch.score);
        matchedFields.networkName = netMatch.matchIndices;
      }
    }

    // 5. Price match (e.g. "$1", "1", "3.00")
    const priceStr = `$${(voucher.price || 0).toFixed(2)}`;
    const cleanPriceQuery = cleanQuery.replace('$', '');
    if (priceStr.includes(cleanQuery) || (voucher.price || 0).toString() === cleanPriceQuery) {
      maxScore = Math.max(maxScore, 500);
      matchedFields.price = [0, 1];
    }

    // 6. Customer Name & Cell (Essential for finding sales by customer across dashboards)
    if (voucher.customerName) {
      const custMatch = fuzzyMatch(voucher.customerName, cleanQuery);
      if (custMatch.matched && custMatch.score > 0) {
        maxScore = Math.max(maxScore, custMatch.score + 90);
        matchedFields.customerName = custMatch.matchIndices;
      }
    }
    if (voucher.customerCell) {
      const cellMatch = fuzzyMatch(voucher.customerCell, cleanQuery);
      if (cellMatch.matched && cellMatch.score > 0) {
        maxScore = Math.max(maxScore, cellMatch.score + 80);
        matchedFields.customerCell = cellMatch.matchIndices;
      }
    }

    // 7. Agent Name (Assigned Agent or Sold By Agent)
    const agentName = voucher.soldByAgentName || voucher.assignedAgentName || (voucher as any).assignedTo;
    if (agentName) {
      const agentMatch = fuzzyMatch(agentName, cleanQuery);
      if (agentMatch.matched && agentMatch.score > 0) {
        maxScore = Math.max(maxScore, agentMatch.score + 75);
        matchedFields.assignedAgentName = agentMatch.matchIndices;
        matchedFields.soldByAgentName = agentMatch.matchIndices;
      }
    }

    if (maxScore > 0) {
      results.push({ voucher, score: maxScore, matchedFields });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * HighlightText React Component
 * Renders target text with matched characters highlighted cleanly
 */
export interface HighlightTextProps {
  text: string;
  indices?: number[];
  query?: string;
  className?: string;
  highlightClassName?: string;
}

export const HighlightText: React.FC<HighlightTextProps> = ({
  text,
  indices,
  query,
  className = '',
  highlightClassName = 'bg-amber-400/30 text-amber-600 dark:text-amber-400 font-extrabold rounded-xs px-0.5 underline decoration-amber-500/40'
}) => {
  if (!text) return null;

  // If explicit matched character indices are provided, highlight each index
  let activeIndices = indices;
  if (!activeIndices && query && query.trim()) {
    const match = fuzzyMatch(text, query);
    if (match.matched) {
      activeIndices = match.matchIndices;
    }
  }

  if (!activeIndices || activeIndices.length === 0) {
    return <span className={className}>{text}</span>;
  }

  const indexSet = new Set(activeIndices);
  const elements: React.ReactNode[] = [];
  let currentSegment = '';
  let isCurrentHighlight = false;

  for (let i = 0; i < text.length; i++) {
    const charIsHighlight = indexSet.has(i);
    if (i === 0) {
      isCurrentHighlight = charIsHighlight;
      currentSegment = text[i];
    } else if (charIsHighlight === isCurrentHighlight) {
      currentSegment += text[i];
    } else {
      if (isCurrentHighlight) {
        elements.push(
          <mark key={i} className={highlightClassName}>
            {currentSegment}
          </mark>
        );
      } else {
        elements.push(<span key={i}>{currentSegment}</span>);
      }
      isCurrentHighlight = charIsHighlight;
      currentSegment = text[i];
    }
  }

  if (currentSegment) {
    if (isCurrentHighlight) {
      elements.push(
        <mark key="end" className={highlightClassName}>
          {currentSegment}
        </mark>
      );
    } else {
      elements.push(<span key="end">{currentSegment}</span>);
    }
  }

  return <span className={className}>{elements}</span>;
};
