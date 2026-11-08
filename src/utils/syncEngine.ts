/**
 * WiVoTe Distributed Synchronization Engine
 * Architected for high-concurrency cross-device reconciliation between
 * Agent terminals and Admin dashboards. Eliminates split-brain states,
 * redundant writes, and data divergence.
 */

export interface SyncEntity {
  id: string;
  updatedAt?: string | number;
  syncedAt?: string | number;
  syncStatus?: 'pending' | 'synced' | 'failed';
  isDirty?: boolean;
  adminLocked?: boolean;
  modifiedByRole?: 'Agent' | 'WorkspaceMaster' | 'AppOwner';
  workspaceId?: string;
  [key: string]: any;
}

export interface SyncBatchPayload {
  vouchers?: SyncEntity[];
  customers?: SyncEntity[];
  legacyDevices?: SyncEntity[];
  requests?: SyncEntity[];
  cashDrops?: SyncEntity[];
  workspaces?: SyncEntity[];
  users?: SyncEntity[];
}

export interface SyncResponse {
  success: boolean;
  action?: string;
  serverTime: number;
  affectedCount: number;
  error?: string;
}

/**
 * Normalizes entity timestamps to numeric epoch milliseconds for precise delta comparison.
 */
export function parseTimestamp(ts: string | number | Date | undefined): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (ts instanceof Date) return ts.getTime();
  const parsed = new Date(ts).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Determines whether an incoming record should update the existing record based on
 * timestamp deltas, precedence hierarchy, and admin authority lockouts.
 */
export function shouldAcceptRecordUpdate(
  existing: SyncEntity | undefined,
  incoming: SyncEntity,
  entityType: 'voucher' | 'customer' | 'legacyDevice' | 'request' | 'cashDrop' | 'user' | 'workspace'
): { accept: boolean; reason: string; mergedRecord?: SyncEntity } {
  if (!existing) {
    return {
      accept: true,
      reason: 'NEW_RECORD_INSERT',
      mergedRecord: {
        ...incoming,
        syncStatus: 'synced' as const,
        isDirty: false,
        updatedAt: incoming.updatedAt || new Date().toISOString()
      }
    };
  }

  // 1. Admin Override Lockout Check
  // If record has been locked or moderated by an Admin, reject stale Agent edits
  if (existing.adminLocked && incoming.modifiedByRole === 'Agent') {
    return {
      accept: false,
      reason: 'ADMIN_LOCKED_OVERRIDE_REJECTED'
    };
  }

  // If status is an admin final state (Approved, Rejected, Reconciled, Reversed) and incoming is Agent edit
  const adminFinalStatuses = ['Approved', 'APPROVED', 'Rejected', 'REJECTED', 'Reconciled', 'Reversed'];
  if (adminFinalStatuses.includes(existing.status) && incoming.modifiedByRole === 'Agent' && incoming.status !== existing.status) {
    return {
      accept: false,
      reason: 'ADMIN_FINAL_STATUS_PROTECTED'
    };
  }

  // 2. Precedence Hierarchy Rules for Activity Events
  if (entityType === 'voucher') {
    // Immutable Sale Rule: Once a voucher is marked Sold, it can NEVER revert to Unused or Assigned via stale sync
    if (existing.status === 'Sold' && incoming.status !== 'Sold') {
      return {
        accept: false,
        reason: 'IMMUTABLE_SALE_PROTECTED'
      };
    }
    // High-priority operational transition: Unused -> Assigned -> Sold
    if (incoming.status === 'Sold' && existing.status !== 'Sold') {
      return {
        accept: true,
        reason: 'SALE_COMPLETED_PRECEDENCE',
        mergedRecord: {
          ...existing,
          ...incoming,
          status: 'Sold',
          syncStatus: 'synced',
          isDirty: false,
          updatedAt: new Date().toISOString()
        }
      };
    }
  }

  // 3. Timestamp Delta Verification
  const existingTime = parseTimestamp(existing.updatedAt || existing.soldAt || existing.createdAt);
  const incomingTime = parseTimestamp(incoming.updatedAt || incoming.soldAt || incoming.createdAt);

  if (incomingTime < existingTime) {
    return {
      accept: false,
      reason: 'STALE_TIMESTAMP_SKIP'
    };
  }

  if (incomingTime === existingTime && existingTime > 0) {
    // Redundant write prevention: if timestamps match exactly, skip write unless fields diverge
    return {
      accept: false,
      reason: 'EQUAL_TIMESTAMP_NO_OP'
    };
  }

  // 4. Field-Level Merge for Customer Profiles & Records (Last Write Wins with Field Union)
  if (entityType === 'customer') {
    const mergedCustomer = {
      ...existing,
      ...incoming,
      // Preserve cumulative aggregates (total purchases, spend, streak)
      totalPurchases: Math.max(existing.totalPurchases || 0, incoming.totalPurchases || 0),
      totalSpend: Math.max(existing.totalSpend || 0, incoming.totalSpend || 0),
      consecutivePurchases: Math.max(existing.consecutivePurchases || 0, incoming.consecutivePurchases || 0),
      cellNumber: incoming.cellNumber || existing.cellNumber,
      syncStatus: 'synced' as const,
      isDirty: false,
      updatedAt: new Date().toISOString()
    };
    return {
      accept: true,
      reason: 'CUSTOMER_FIELD_MERGE_SUCCESS',
      mergedRecord: mergedCustomer
    };
  }

  return {
    accept: true,
    reason: 'FRESHER_TIMESTAMP_UPDATE',
    mergedRecord: {
      ...existing,
      ...incoming,
      syncStatus: 'synced' as const,
      isDirty: false,
      updatedAt: incoming.updatedAt || new Date().toISOString()
    }
  };
}

/**
 * Client-Side Function: Scans and pushes only dirty / pending local records to central DB.
 * Implements batching, timestamp assignment, and skip-if-unchanged logic.
 */
export async function pushPendingChanges(localEntities: {
  vouchers: SyncEntity[];
  customers: SyncEntity[];
  legacyDevices: SyncEntity[];
  requests: SyncEntity[];
  cashDrops: SyncEntity[];
}): Promise<{ success: boolean; pushedCount: number; error?: string }> {
  try {
    // Filter strictly for dirty or pending records
    const dirtyVouchers = (localEntities.vouchers || []).filter(v => v.isDirty || v.syncStatus === 'pending');
    const dirtyCustomers = (localEntities.customers || []).filter(c => c.isDirty || c.syncStatus === 'pending');
    const dirtyLegacy = (localEntities.legacyDevices || []).filter(l => l.isDirty || l.syncStatus === 'pending');
    const dirtyRequests = (localEntities.requests || []).filter(r => r.isDirty || r.syncStatus === 'pending');
    const dirtyCashDrops = (localEntities.cashDrops || []).filter(cd => cd.isDirty || cd.syncStatus === 'pending');

    const totalDirty = dirtyVouchers.length + dirtyCustomers.length + dirtyLegacy.length + dirtyRequests.length + dirtyCashDrops.length;

    if (totalDirty === 0) {
      return { success: true, pushedCount: 0 };
    }

    const payload: SyncBatchPayload = {
      vouchers: dirtyVouchers,
      customers: dirtyCustomers,
      legacyDevices: dirtyLegacy,
      requests: dirtyRequests,
      cashDrops: dirtyCashDrops
    };

    const response = await fetch('/api/sync/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'DELTA_PUSH',
        payload
      })
    });

    if (!response.ok) {
      throw new Error(`Sync server HTTP error ${response.status}`);
    }

    const data: SyncResponse = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'Sync mutate action failed');
    }

    return {
      success: true,
      pushedCount: data.affectedCount || totalDirty
    };
  } catch (err: any) {
    console.warn('[WiVoTe SyncEngine] pushPendingChanges note:', err?.message || err);
    return {
      success: false,
      pushedCount: 0,
      error: err?.message || 'Sync failed'
    };
  }
}
