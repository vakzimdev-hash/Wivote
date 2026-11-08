export interface CleanupOrphanedOptions {
  /** Optional specific email to target for cleanup. If omitted, performs a system-wide audit. */
  targetEmail?: string;
  /** If true, simulates the scan without deleting any Auth records or Firestore documents. */
  dryRun?: boolean;
}

export interface CleanupOrphanedResult {
  success: boolean;
  mode?: 'targeted' | 'system_wide';
  email?: string;
  purgedAuthCount: number;
  purgedDocCount: number;
  dryRun?: boolean;
  details: string[];
  message: string;
  error?: string;
}

export interface ReconcileShadowResult {
  success: boolean;
  mergedCount: number;
  reconciledCount?: number;
  purgedDocCount: number;
  purgedShadowDocsCount?: number;
  updatedVouchersCount: number;
  reassignedVouchersCount?: number;
  email?: string;
  dryRun?: boolean;
  details: string[];
  message: string;
  error?: string;
}

/**
 * Drastic Measure: Reconcile duplicate / shadow accounts, restoring real phone numbers,
 * real photos, assigned vouchers, and active workspace references to the authenticated UID,
 * and deleting redundant shadow accounts.
 */
export async function reconcileShadowAccounts(
  targetEmail?: string,
  dryRun: boolean = false
): Promise<ReconcileShadowResult> {
  const normalizedEmail = (targetEmail || '').trim().toLowerCase();

  try {
    const response = await fetch('/api/admin/reconcile-shadow-accounts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        targetEmail: normalizedEmail || undefined,
        dryRun
      })
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.success) {
      const errorMessage = data?.error || `Reconcile shadow accounts failed with status ${response.status}`;
      console.error('[reconcileShadowAccounts] Error:', errorMessage);
      return {
        success: false,
        mergedCount: 0,
        reconciledCount: 0,
        purgedDocCount: 0,
        purgedShadowDocsCount: 0,
        updatedVouchersCount: 0,
        reassignedVouchersCount: 0,
        email: normalizedEmail || undefined,
        dryRun,
        details: data?.details || [errorMessage],
        message: errorMessage,
        error: errorMessage
      };
    }

    console.log('[reconcileShadowAccounts] Success:', data);
    const merged = data.mergedCount || 0;
    const purged = data.purgedDocCount || 0;
    const updated = data.updatedVouchersCount || 0;

    return {
      success: true,
      mergedCount: merged,
      reconciledCount: merged,
      purgedDocCount: purged,
      purgedShadowDocsCount: purged,
      updatedVouchersCount: updated,
      reassignedVouchersCount: updated,
      email: normalizedEmail || undefined,
      dryRun: data.dryRun || false,
      details: data.details || [],
      message: data.message || 'Shadow account reconciliation complete.'
    };
  } catch (networkErr: any) {
    const errText = networkErr?.message || 'Network error while contacting shadow reconciliation service.';
    console.error('[reconcileShadowAccounts] Network error:', errText);
    return {
      success: false,
      mergedCount: 0,
      reconciledCount: 0,
      purgedDocCount: 0,
      purgedShadowDocsCount: 0,
      updatedVouchersCount: 0,
      reassignedVouchersCount: 0,
      email: normalizedEmail || undefined,
      dryRun,
      details: [errText],
      message: errText,
      error: errText
    };
  }
}

/**
 * Secure administrative utility function that programmatically cleans up
 * orphaned Firebase Auth user records and Firestore documents for deleted accounts
 * to prevent 'email-already-in-use' collisions.
 *
 * @param targetEmail - Optional specific email address to clean up. If omitted, scans globally.
 * @param dryRun - Optional boolean flag to simulate cleanup without performing destructive deletions.
 * @returns CleanupOrphanedResult with metrics and detailed logs of all actions performed.
 */
export async function cleanupOrphanedAccounts(
  targetEmail?: string,
  dryRun: boolean = false
): Promise<CleanupOrphanedResult> {
  const normalizedEmail = (targetEmail || '').trim().toLowerCase();

  try {
    const response = await fetch('/api/admin/cleanup-orphaned-accounts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        targetEmail: normalizedEmail || undefined,
        dryRun
      })
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.success) {
      const errorMessage = data?.error || `Administrative cleanup request failed with status ${response.status}`;
      console.error('[cleanupOrphanedAccounts] Error:', errorMessage);
      return {
        success: false,
        email: normalizedEmail || undefined,
        purgedAuthCount: 0,
        purgedDocCount: 0,
        dryRun,
        details: data?.details || [errorMessage],
        message: errorMessage,
        error: errorMessage
      };
    }

    console.log('[cleanupOrphanedAccounts] Success:', data);
    return {
      success: true,
      mode: data.mode,
      email: data.email,
      purgedAuthCount: data.purgedAuthCount || 0,
      purgedDocCount: data.purgedDocCount || 0,
      dryRun: data.dryRun || false,
      details: data.details || [],
      message: data.message || 'Cleanup completed successfully.'
    };
  } catch (networkErr: any) {
    const errText = networkErr?.message || 'Network error while contacting administrative cleanup service.';
    console.error('[cleanupOrphanedAccounts] Network error:', errText);
    return {
      success: false,
      email: normalizedEmail || undefined,
      purgedAuthCount: 0,
      purgedDocCount: 0,
      dryRun,
      details: [errText],
      message: errText,
      error: errText
    };
  }
}
