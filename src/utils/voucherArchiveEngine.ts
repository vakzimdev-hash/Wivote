import { Voucher } from '../types';
import { db } from '../firebase';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  writeBatch
} from 'firebase/firestore';

export interface ArchiveTaskResult {
  success: boolean;
  totalScanned: number;
  totalArchived: number;
  workspaceId?: string;
  dryRun?: boolean;
  details: string[];
  message: string;
  error?: string;
}

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

/**
 * Client & Server helper function that detects sold vouchers older than 60 days (2 months)
 * and safely archives them from the active 'vouchers' collection to 'vouchers_archive'.
 */
export async function archiveSoldVouchersOlderThan60Days(
  workspaceId?: string,
  dryRun: boolean = false
): Promise<ArchiveTaskResult> {
  const details: string[] = [];
  const cutoffDate = new Date(Date.now() - SIXTY_DAYS_MS);
  const cutoffIso = cutoffDate.toISOString();
  details.push(`Scanning for vouchers sold on or before cutoff date: ${cutoffDate.toLocaleDateString()}`);

  try {
    // 1. First attempt server-side express API execution for atomic admin-privilege execution
    const apiRes = await fetch('/api/admin/archive-old-vouchers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, dryRun })
    }).catch(() => null);

    if (apiRes && apiRes.ok) {
      const data = await apiRes.json();
      if (data && data.success) {
        return {
          success: true,
          totalScanned: data.totalScanned || 0,
          totalArchived: data.totalArchived || 0,
          workspaceId,
          dryRun,
          details: data.details || [data.message],
          message: data.message || `Successfully archived ${data.totalArchived || 0} vouchers.`
        };
      }
    }

    // 2. Client-side Firestore fallback if backend express API is unreachable or offline
    if (!db) {
      return {
        success: false,
        totalScanned: 0,
        totalArchived: 0,
        workspaceId,
        dryRun,
        details,
        message: 'Firestore database instance unavailable.',
        error: 'No Firestore DB connection'
      };
    }

    let vouchersToArchive: Array<{ ref: any; data: Voucher; workspaceId: string }> = [];

    if (workspaceId) {
      const vouchersRef = collection(db, 'workspaces', workspaceId, 'vouchers');
      const q = query(vouchersRef, where('status', '==', 'Sold'));
      const snap = await getDocs(q);
      snap.docs.forEach(d => {
        const v = { id: d.id, ...d.data() } as Voucher;
        const saleTimeStr = v.soldAt || v.createdAt;
        if (saleTimeStr) {
          const saleTime = new Date(saleTimeStr).getTime();
          if (!isNaN(saleTime) && saleTime <= cutoffDate.getTime() && !v.archived) {
            vouchersToArchive.push({ ref: d.ref, data: v, workspaceId });
          }
        }
      });
    } else {
      // Global scan across workspace collections
      const workspacesSnap = await getDocs(collection(db, 'workspaces')).catch(() => null);
      if (workspacesSnap) {
        for (const wsDoc of workspacesSnap.docs) {
          const wsId = wsDoc.id;
          const vouchersRef = collection(db, 'workspaces', wsId, 'vouchers');
          const q = query(vouchersRef, where('status', '==', 'Sold'));
          const snap = await getDocs(q).catch(() => null);
          if (snap) {
            snap.docs.forEach(d => {
              const v = { id: d.id, ...d.data() } as Voucher;
              const saleTimeStr = v.soldAt || v.createdAt;
              if (saleTimeStr) {
                const saleTime = new Date(saleTimeStr).getTime();
                if (!isNaN(saleTime) && saleTime <= cutoffDate.getTime() && !v.archived) {
                  vouchersToArchive.push({ ref: d.ref, data: v, workspaceId: wsId });
                }
              }
            });
          }
        }
      }
    }

    details.push(`Found ${vouchersToArchive.length} sold vouchers older than 2 months.`);

    if (dryRun) {
      return {
        success: true,
        totalScanned: vouchersToArchive.length,
        totalArchived: 0,
        workspaceId,
        dryRun: true,
        details,
        message: `[Dry Run] ${vouchersToArchive.length} sold vouchers older than 2 months identified for archival.`
      };
    }

    if (vouchersToArchive.length === 0) {
      return {
        success: true,
        totalScanned: 0,
        totalArchived: 0,
        workspaceId,
        dryRun: false,
        details,
        message: 'No sold vouchers older than 2 months require archival at this time.'
      };
    }

    // Process batched writes to archive collection & delete/update active vouchers
    let archivedCount = 0;
    const batchSize = 250;
    for (let i = 0; i < vouchersToArchive.length; i += batchSize) {
      const chunk = vouchersToArchive.slice(i, i + batchSize);
      const batch = writeBatch(db);

      chunk.forEach(item => {
        const archivedPayload: Voucher = {
          ...item.data,
          archived: true,
          archivedAt: new Date().toISOString()
        };

        // Write to workspace vouchers_archive collection
        const archiveWsRef = doc(db, 'workspaces', item.workspaceId, 'vouchers_archive', item.data.id);
        batch.set(archiveWsRef, archivedPayload);

        // Write to root vouchers_archive collection
        const archiveRootRef = doc(db, 'vouchers_archive', item.data.id);
        batch.set(archiveRootRef, archivedPayload);

        // Remove from active vouchers collection to keep query size small
        batch.delete(item.ref);

        archivedCount++;
      });

      await batch.commit();
    }

    details.push(`Successfully transferred ${archivedCount} vouchers into cold storage archive.`);

    return {
      success: true,
      totalScanned: vouchersToArchive.length,
      totalArchived: archivedCount,
      workspaceId,
      dryRun: false,
      details,
      message: `Successfully archived ${archivedCount} sold vouchers older than 2 months.`
    };
  } catch (err: any) {
    const errorMsg = err?.message || 'Error executing voucher archival task';
    console.error('[archiveSoldVouchersOlderThan60Days] Error:', err);
    return {
      success: false,
      totalScanned: 0,
      totalArchived: 0,
      workspaceId,
      dryRun,
      details: [errorMsg],
      message: errorMsg,
      error: errorMsg
    };
  }
}
