import { AppBackupConfig, BackupSlotMetadata, WorkspaceBackupItem, EntireAppBackupItem } from '../types';

export const DEFAULT_BACKUP_CONFIG: AppBackupConfig = {
  autoBackupOnWrite: true,
  minIntervalSeconds: 30,
  maxBackupSlots: 5,
  retentionStrategy: 'intelligent_spacing',
  notifyOnAutoBackup: false,
  triggers: {
    voucherSales: true,
    voucherAssignments: true,
    userModifications: true,
    cashDrops: true,
    settingsChanges: true
  }
};

/**
 * Format relative elapsed time into a concise human-readable string
 */
export function formatTimeElapsed(timestamp: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 15) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ${diffMin % 60}m ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ${diffHr % 24}h ago`;
}

/**
 * Generate human-friendly slot metadata badge
 */
export function getSlotBadge(index: number, total: number, timestamp: number): {
  title: string;
  badge: string;
  colorClass: string;
} {
  const elapsed = formatTimeElapsed(timestamp);
  if (index === 0) {
    return {
      title: 'Slot 1: Current / Latest Write',
      badge: `⚡ Latest (${elapsed})`,
      colorClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    };
  }
  if (index === total - 1 && total >= 3) {
    return {
      title: `Slot ${index + 1}: Baseline Anchor`,
      badge: `⚓ Baseline (${elapsed})`,
      colorClass: 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    };
  }
  if (index === 1) {
    return {
      title: 'Slot 2: Recent Checkpoint',
      badge: `🕒 Recent (${elapsed})`,
      colorClass: 'bg-sky-500/20 text-sky-400 border-sky-500/30'
    };
  }
  if (index === 2) {
    return {
      title: 'Slot 3: Intermediate Checkpoint',
      badge: `🕒 Intermediate (${elapsed})`,
      colorClass: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
    };
  }
  return {
    title: `Slot ${index + 1}: Checkpoint`,
    badge: `🕒 Checkpoint (${elapsed})`,
    colorClass: 'bg-purple-500/20 text-purple-400 border-purple-500/30'
  };
}

/**
 * Intelligently prune and maintain up to N time-spaced backups.
 * 
 * Retention Logic:
 * 1. Rapid writes within minIntervalSeconds update the latest slot in place (keeping data fresh without burning slots).
 * 2. When capacity is exceeded, ALWAYS preserves:
 *    - The brand new state (Slot 1, Latest)
 *    - The oldest state (Milestone Baseline Anchor)
 * 3. Identifies the two intermediate backups closest together in time and removes the redundant one.
 *    This maximizes the time diversity across the 5 slots so the user has the highest probability
 *    of finding the exact historical state needed for recovery.
 */
export function pruneIntelligentBackups<T extends BackupSlotMetadata>(
  existing: T[],
  incoming: T,
  config: AppBackupConfig = DEFAULT_BACKUP_CONFIG
): T[] {
  const maxSlots = Math.max(3, Math.min(10, config.maxBackupSlots || 5));
  const minIntervalMs = (config.minIntervalSeconds || 30) * 1000;

  // Ensure incoming timestamp is valid
  if (!incoming.timestamp) {
    incoming.timestamp = Date.now();
  }

  // Sorted descending (newest first)
  const sorted = [...existing].sort((a, b) => b.timestamp - a.timestamp);

  if (sorted.length === 0) {
    return [incoming];
  }

  // 1. If incoming write is within minIntervalMs of latest, replace the latest slot in-place
  const latestDiff = incoming.timestamp - sorted[0].timestamp;
  if (latestDiff < minIntervalMs && latestDiff >= 0) {
    const updated = [incoming, ...sorted.slice(1)];
    return updated.slice(0, maxSlots);
  }

  // 2. Candidate list with incoming prepended
  let candidates = [incoming, ...sorted];

  // 3. If within maxSlots, return
  if (candidates.length <= maxSlots) {
    return candidates;
  }

  // 4. If FIFO strategy is chosen
  if (config.retentionStrategy === 'fifo') {
    return candidates.slice(0, maxSlots);
  }

  // 5. Intelligent Time-Spacing Thinning Algorithm
  // Keep index 0 (incoming latest) and index candidates.length - 1 (oldest anchor)
  while (candidates.length > maxSlots) {
    let minTimeDelta = Infinity;
    let redundantIndex = 1;

    for (let i = 1; i < candidates.length - 1; i++) {
      const prevDiff = candidates[i - 1].timestamp - candidates[i].timestamp;
      const nextDiff = candidates[i].timestamp - candidates[i + 1].timestamp;
      const localMin = Math.min(prevDiff, nextDiff);

      if (localMin < minTimeDelta) {
        minTimeDelta = localMin;
        redundantIndex = i;
      }
    }

    // Drop the intermediate backup that adds the least time-spacing diversity
    candidates.splice(redundantIndex, 1);
  }

  return candidates;
}

/**
 * Trigger JSON download in browser
 */
export function exportBackupToFile(data: any, filename: string): void {
  try {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Failed to export backup file:', err);
  }
}

/**
 * Clean complex objects for Firestore JSON serialization (remove undefined, functions, symbols)
 */
export function cleanForBackupSerialization(obj: any): any {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.filter(item => item !== undefined).map(cleanForBackupSerialization);

  const clean: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined && typeof value !== 'function' && typeof value !== 'symbol') {
      const nested = cleanForBackupSerialization(value);
      if (nested !== undefined) {
        clean[key] = nested;
      }
    }
  }
  return clean;
}
