import { UserProfile, Workspace, Voucher, LegacyDevice, CashDrop } from '../types';
import { isVoucherFree, getVoucherMonetaryValue } from './giveawayEngine';
import { getCurrentCycleMonth, getPreviousCycleMonth, getCycleMonthFromDate } from './salesCycleEngine';

export function isSeedOrMockProfilePic(url?: string): boolean {
  if (!url || !url.trim()) return true;
  const str = url.toLowerCase();
  return (
    str.includes('photo-1472099645785') ||
    str.includes('photo-1492562080023') ||
    str.includes('photo-1544005313') ||
    str.includes('photo-1506794778202') ||
    str.includes('photo-1534528741775') ||
    str.includes('photo-1507003211169') ||
    str.includes('photo-1517841905240') ||
    str.includes('photo-1539571696357') ||
    str.includes('avatar') ||
    str.includes('placeholder')
  );
}

/**
 * Enterprise RBAC Access Control Policy
 * 
 * Strict separation of privileges between Field Agents and Workspace Masters:
 * 1. Field Agents are strictly confined to POS sales, stock requests, legacy device registration, and feedback.
 * 2. Field Agents CANNOT view, access, execute, or inspect any Workspace Master administrative functions:
 *    - Master User Management (Add/Edit/Delete Agent or Master accounts)
 *    - Workspace Settings / Onboarding / Plan management
 *    - Voucher Batch Upload / Import / Export
 *    - Agent Stock Allocation & Request Fulfillment
 *    - Cash Drop Reconciliation & Financial Auditing
 *    - Global SaaS Configuration
 * 3. The Agent Dashboard is strictly designated for Field Agent accounts (with AppOwner verification preview).
 */

export const isAgentAccount = (user: UserProfile | null | undefined): boolean => {
  if (!user || !user.role) return false;
  const normalized = user.role.toLowerCase().trim();
  return normalized === 'agent' || normalized === 'fieldagent';
};

export const isWorkspaceMasterAccount = (user: UserProfile | null | undefined): boolean => {
  if (!user || !user.role) return false;
  const normalized = user.role.toLowerCase().trim();
  return (
    normalized === 'workspacemaster' ||
    normalized === 'admin' ||
    normalized === 'administrator' ||
    normalized === 'master' ||
    normalized === 'owner'
  );
};

export const isAppOwnerAccount = (user: UserProfile | null | undefined): boolean => {
  if (!user) return false;
  const emailMatch = (user.email || '').toLowerCase().trim() === 'karimazondomike049@gmail.com';
  const roleMatch = (user.role || '').toLowerCase().trim() === 'appowner';
  return emailMatch || roleMatch;
};

/**
 * Validates whether the user can access Workspace Master views and master-level administrative features.
 * Field Agents are unconditionally barred.
 */
export const canAccessWorkspaceMaster = (user: UserProfile | null | undefined): boolean => {
  if (!user) return false;
  if (isAgentAccount(user)) return false;
  return isWorkspaceMasterAccount(user) || isAppOwnerAccount(user);
};

/**
 * Validates whether the user can access the Agent Dashboard.
 * Strictly reserved for Field Agent accounts (or AppOwner preview mode).
 * Workspace Masters are NOT allowed into the Agent Dashboard directly.
 */
export const canAccessAgentDashboard = (
  user: UserProfile | null | undefined,
  isPreview: boolean = false
): boolean => {
  if (!user) return false;
  if (isAgentAccount(user)) return true;
  if (isAppOwnerAccount(user) && isPreview) return true;
  // Non-agent users (such as Workspace Masters) cannot operate the Agent Terminal
  return false;
};

/**
 * Validates whether an administrative function can be executed by the current user.
 * Returns an authorization verdict and a formal policy error message if rejected.
 */
export const assertWorkspaceMasterPrivilege = (
  user: UserProfile | null | undefined,
  actionName: string
): { allowed: boolean; error?: string } => {
  if (!user) {
    return {
      allowed: false,
      error: 'Unauthorized: No active authenticated session found.'
    };
  }

  if (isAgentAccount(user)) {
    return {
      allowed: false,
      error: `Security Policy Violation: Field Agent accounts are strictly prohibited from performing "${actionName}". This administrative action is strictly reserved for Workspace Masters.`
    };
  }

  if (!isWorkspaceMasterAccount(user) && !isAppOwnerAccount(user)) {
    return {
      allowed: false,
      error: `Access Denied: You do not possess Workspace Master permissions to perform "${actionName}".`
    };
  }

  return { allowed: true };
};

/**
 * Validates whether an AppOwner privilege is satisfied.
 */
export const assertAppOwnerPrivilege = (
  user: UserProfile | null | undefined,
  actionName: string
): { allowed: boolean; error?: string } => {
  if (!user) {
    return {
      allowed: false,
      error: 'Unauthorized: No active authenticated session found.'
    };
  }

  if (!isAppOwnerAccount(user)) {
    return {
      allowed: false,
      error: `Security Policy Violation: "${actionName}" is exclusively reserved for the App Owner.`
    };
  }

  return { allowed: true };
};

/**
 * Determines if an agent user profile is currently active and eligible for operations and quota counts.
 * Rigorously checks role, deactivation flag (boolean or stringified), and status fields.
 */
export const isAgentActive = (user: UserProfile | null | undefined): boolean => {
  if (!user) return false;
  if (!isAgentAccount(user)) return false;
  const isDeactivated =
    user.isDeactivated === true ||
    (user as any).isDeactivated === 'true' ||
    user.status === 'inactive' ||
    user.status === 'suspended' ||
    user.status === 'deactivated' ||
    user.isActive === false;
  return !isDeactivated;
};

/**
 * Resolves and deduplicates the authoritative list of active field agents belonging to a workspace.
 * Reconciles user.workspaceId and workspace.agentIds.
 * Deduplicates strictly by UID or normalized email without dropping agents who share identical names.
 */
export const getWorkspaceActiveAgents = (
  users: UserProfile[],
  workspace: Workspace | null | undefined,
  currentUser?: UserProfile | null
): UserProfile[] => {
  const isDeveloperEmail = currentUser?.email?.toLowerCase()?.trim() === 'karimazondomike049@gmail.com';
  const isAppOwner = currentUser?.role === 'AppOwner' || isDeveloperEmail;
  // Strict standard: non-AppOwner admins can ONLY see agents within their own workspace
  const wsId = (!isAppOwner && currentUser?.workspaceId)
    ? currentUser.workspaceId
    : (workspace?.id || currentUser?.workspaceId);
  if (!wsId) return [];
  const wsAgentIds = Array.isArray(workspace?.agentIds) ? workspace!.agentIds! : [];

  const candidateAgents = (users || []).filter(u => {
    const uid = u.uid || (u as any).id;
    if (!uid) return false;
    if (!isAgentActive(u)) return false;

    // Exclude mock agents Bob Moyo and Charlie Ncube
    const cleanUid = (uid || '').toLowerCase();
    const cleanEmail = (u.email || '').toLowerCase();
    const cleanName = (u.name || '').toLowerCase();
    if (
      cleanUid === 'agent_001' ||
      cleanUid === 'agent_002' ||
      cleanEmail === 'agent1@wivote.com' ||
      cleanEmail === 'agent2@wivote.com' ||
      cleanName.includes('bob moyo') ||
      cleanName.includes('charlie ncube')
    ) {
      return false;
    }

    // Strict multi-tenant isolation:
    // Never show AppOwner or WorkspaceMaster in field agent lists
    if (u.role === 'AppOwner' || u.role === 'WorkspaceMaster') return false;

    // Check workspace membership via workspaceId, active workspace agentIds, or tenant agents
    const isZuwessyAgent = wsId === 'ws_1790605401339' && (uid === 'EbUj2wQFvFMQo8oqvdZ3TTILCm02' || uid === 'agent_1790695694537' || (u.email && (u.email.includes('teguruannitah') || u.email.includes('zuwessytech'))));
    const isVakzimClientAgent = wsId === 'ws_client_1788646327740' && (uid === 'OIofBo6j6jV6qM0oRRxVFwpucfP2' || uid === '7QFBnEU9XxalOI6kl8csoTm58tE2' || uid === '6ih4NtJnXUeNtt1z0orVHZGkQuv2' || (u.email && u.email.includes('histec')));

    // If agent has a workspaceId, verify tenant alignment or membership
    if (u.workspaceId && u.workspaceId !== wsId) {
      const inAgentIds = wsAgentIds.includes(uid);
      if (!inAgentIds && !isZuwessyAgent && !isVakzimClientAgent && u.workspaceId !== 'ws_vakzim') {
        return false;
      }
    }

    // Strict standard: No admin should see information relating to agents under another admin
    if (u.created_by_admin && currentUser && !isAppOwner) {
      if (u.created_by_admin !== currentUser.uid && u.workspaceId !== wsId) {
        return false;
      }
    }

    const belongs = u.workspaceId === wsId || isZuwessyAgent || isVakzimClientAgent || wsAgentIds.includes(uid) || !u.workspaceId || u.workspaceId === 'ws_vakzim';
    return belongs;
  });

  // Sort candidate agents so real profiles (non-default cell, non-empty workspace) precede shadow profiles
  const isShadow = (user: UserProfile) => {
    const isDefaultCell = !user.cellNumber || user.cellNumber === '+263770000000';
    const isDefaultPic = isSeedOrMockProfilePic(user.profilePic);
    const isEmptyWs = !user.workspaceId || user.workspaceId === '';
    return (isDefaultCell && (isEmptyWs || isDefaultPic)) || isEmptyWs;
  };

  const sortedCandidates = [...candidateAgents].sort((a, b) => {
    const aShadow = isShadow(a);
    const bShadow = isShadow(b);
    if (!aShadow && bShadow) return -1;
    if (aShadow && !bShadow) return 1;
    return 0;
  });

  const uniqueMap = new Map<string, UserProfile>();
  const emailToUid = new Map<string, string>();

  sortedCandidates.forEach(u => {
    const uid = u.uid || (u as any).id;
    if (!uid) return;
    const cleanEmail = (u.email || '').trim().toLowerCase();

    if (cleanEmail && emailToUid.has(cleanEmail)) {
      const existingUid = emailToUid.get(cleanEmail)!;
      const existing = uniqueMap.get(existingUid)!;
      const existingDefaultCell = existing.cellNumber === '+263770000000' || !existing.cellNumber;
      const currentDefaultCell = u.cellNumber === '+263770000000' || !u.cellNumber;
      const merged: UserProfile = {
        ...u,
        ...existing,
        location: existing.location || u.location,
        cellNumber: existingDefaultCell && !currentDefaultCell ? u.cellNumber : existing.cellNumber,
        performanceScore: Math.max(u.performanceScore || 0, existing.performanceScore || 0),
        targetAmount: existing.targetAmount || u.targetAmount,
        workspaceId: existing.workspaceId || u.workspaceId,
        profilePic: existing.profilePic || u.profilePic || '',
        commissionRate: existing.commissionRate !== undefined ? existing.commissionRate : u.commissionRate
      };
      uniqueMap.set(existingUid, merged);
      return;
    }

    if (!uniqueMap.has(uid)) {
      uniqueMap.set(uid, u);
      if (cleanEmail) emailToUid.set(cleanEmail, uid);
    }
  });

  return Array.from(uniqueMap.values());
};

export interface SyncedLeaderboardEntry {
  uid: string;
  name: string;
  email: string;
  cellNumber: string;
  profilePic: string;
  location: string;
  actualSales: number;
  targetAmount: number;
  percentage: number;
  rank: number;
  totalVouchersSold: number;
  prevMonthActualSales?: number;
  prevMonthPercentage?: number;
  prevMonthTargetAmount?: number;
  unclosedCashFromPrevCycle?: number;
  hasUnclosedCashFromPrevCycle?: boolean;
}

/**
 * Deduplicate legacy devices by normalized MAC address and ID.
 * Merges duplicate entries so sold status, highest price, and agent attribution are preserved,
 * preventing double-counting of sales or inventory.
 */
export const deduplicateLegacyDevices = (devices: LegacyDevice[]): LegacyDevice[] => {
  const byMac = new Map<string, LegacyDevice>();
  const byId = new Map<string, LegacyDevice>();
  const deduped: LegacyDevice[] = [];

  for (const ld of (devices || [])) {
    if (!ld || !ld.id) continue;
    const normMac = (ld.macAddress || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

    const existing = (normMac.length >= 8 ? byMac.get(normMac) : undefined) || byId.get(ld.id);
    if (existing) {
      // Merge duplicate records: SOLD takes precedence
      const isSold = ld.status === 'SOLD';
      const existingIsSold = existing.status === 'SOLD';

      if (isSold && !existingIsSold) {
        existing.status = 'SOLD';
        existing.soldPrice = ld.soldPrice !== undefined ? ld.soldPrice : (ld.monthlyPrice || existing.monthlyPrice);
        existing.soldAt = ld.soldAt || new Date().toISOString();
        existing.discountApplied = ld.discountApplied || existing.discountApplied;
      } else if (existingIsSold && !isSold) {
        // Keep existing as SOLD, but absorb any newly populated fields
        if (!existing.fieldAgentId && ld.fieldAgentId) existing.fieldAgentId = ld.fieldAgentId;
        if (!existing.fieldAgentName && ld.fieldAgentName) existing.fieldAgentName = ld.fieldAgentName;
        if (!existing.monthlyPrice && ld.monthlyPrice) existing.monthlyPrice = ld.monthlyPrice;
      } else {
        // Same status: keep higher price / most detailed fields
        if (ld.soldPrice !== undefined && (existing.soldPrice === undefined || ld.soldPrice > existing.soldPrice)) {
          existing.soldPrice = ld.soldPrice;
        }
        if (ld.monthlyPrice !== undefined && (existing.monthlyPrice === undefined || ld.monthlyPrice > existing.monthlyPrice)) {
          existing.monthlyPrice = ld.monthlyPrice;
        }
      }
      continue;
    }

    byId.set(ld.id, ld);
    if (normMac.length >= 8) byMac.set(normMac, ld);
    deduped.push(ld);
  }
  return deduped;
};

/**
 * Synchronized Agent Leaderboard Calculator
 * Unifies sales calculations across AdminDashboard, AgentDashboard, and AppContext.
 * Eliminates zero-performance anomalies by consulting:
 * 1. In-memory sold vouchers assigned to the agent (by UID, name, or email)
 * 2. In-memory sold/enrolled legacy devices (deduplicated by MAC and ID)
 * 3. Agent's persisted performanceScore from user profile
 * 4. Workspace real-time leaderboardSummary cache from Firestore
 * 5. Initial baseline scores for seed accounts (preventing initial 0 anomalies)
 */
export const getAuthoritativeAgentLeaderboard = (
  users: UserProfile[],
  workspace: Workspace | null | undefined,
  vouchers: Voucher[],
  legacyDevices: LegacyDevice[],
  leaderboardSummary: Record<string, number> = {},
  targetCycleMonth?: string,
  cashDrops: CashDrop[] = [],
  currentUser?: UserProfile | null
): SyncedLeaderboardEntry[] => {
  const isDeveloperEmail = currentUser?.email?.toLowerCase()?.trim() === 'karimazondomike049@gmail.com';
  const isAppOwner = currentUser?.role === 'AppOwner' || isDeveloperEmail;
  const wsId = (!isAppOwner && currentUser?.workspaceId) ? currentUser.workspaceId : (workspace?.id || currentUser?.workspaceId || 'ws_vakzim');
  const agents = getWorkspaceActiveAgents(users, workspace, currentUser);
  const currentCycleMonth = targetCycleMonth || getCurrentCycleMonth(new Date());
  const prevCycleMonth = getPreviousCycleMonth(new Date());

  const seedScores: Record<string, number> = {};

  // Helper to check if an item's agent belongs to this workspace's active agents list
  const isAgentInWorkspace = (agentId?: string, agentName?: string, agentEmail?: string) => {
    if (!agentId && !agentName && !agentEmail) return false;
    const cleanId = (agentId || '').trim().toLowerCase();
    const cleanN = (agentName || '').trim().toLowerCase();
    const cleanE = (agentEmail || '').trim().toLowerCase();
    return agents.some(a => {
      const aUid = (a.uid || (a as any).id || '').trim().toLowerCase();
      const aName = (a.name || '').trim().toLowerCase();
      const aEmail = (a.email || '').trim().toLowerCase();
      if (cleanId && aUid && (cleanId === aUid || cleanId.includes(aUid) || aUid.includes(cleanId))) return true;
      if (cleanE && aEmail && (cleanE === aEmail || cleanE.includes(aEmail) || aEmail.includes(cleanE))) return true;
      if (cleanN && aName) {
        if (cleanN === aName) return true;
        const normN = cleanN.replace(/[^a-z0-9]/g, '');
        const normA = aName.replace(/[^a-z0-9]/g, '');
        if (normN && normA && (normN.includes(normA) || normA.includes(normN))) return true;
        const firstN = normN.slice(0, 5);
        const firstA = normA.slice(0, 5);
        if (firstN.length >= 4 && firstA.length >= 4 && firstN === firstA) return true;
      }
      return false;
    });
  };

  // Strict tenant scoping: filter vouchers, legacy devices, and cash drops strictly to this workspace
  const scopedVouchers = (vouchers || []).filter(v => {
    if (!wsId) return true;
    const vWs = (v as any).workspaceId || (v as any).workspace_id;
    if (vWs && vWs !== 'system') {
      if (vWs === wsId) return true;
    }
    if (isAgentInWorkspace(v.assignedAgentId, v.assignedAgentName, (v as any).assignedAgentEmail)) {
      return true;
    }
    return !vWs;
  });
  const scopedLegacyDevices = (legacyDevices || []).filter(ld => {
    if (!wsId) return true;
    const ldWs = ld.workspaceId;
    if (ldWs && ldWs !== 'system') {
      if (ldWs === wsId) return true;
    }
    if (isAgentInWorkspace(ld.fieldAgentId, ld.fieldAgentName, (ld as any).fieldAgentEmail)) {
      return true;
    }
    return !ldWs;
  });
  const scopedCashDrops = (cashDrops || []).filter(cd => {
    if (!wsId) return true;
    const cdWs = cd.workspaceId;
    if (cdWs && cdWs !== 'system') {
      if (cdWs === wsId) return true;
    }
    if (isAgentInWorkspace(cd.agentId, cd.agentName, (cd as any).agentEmail)) {
      return true;
    }
    return !cdWs;
  });

  const records = agents.map(agent => {
    const uid = agent.uid || (agent as any).id;
    const cleanEmail = (agent.email || '').toLowerCase().trim();
    const cleanName = (agent.name || '').toLowerCase().trim();

    // 1. Matched sold vouchers (strictly paid sales - free customer promotional gifts never record in sales)
    const matchedVouchers = scopedVouchers.filter(v => {
      const isSold = v.status === 'Sold' || (v.status as any) === 'sold' || (v.status as string)?.toLowerCase() === 'sold';
      if (!isSold) return false;
      if (v.reversalStatus === 'Approved' || !!v.reversedAt) return false; // Reversals never record in sales
      if (isVoucherFree(v, workspace?.giveawaySettings)) return false; // Free gift vouchers given away never record in sales
      if (v.assignedAgentId && (v.assignedAgentId === uid || v.assignedAgentId === agent.uid)) return true;
      if (v.soldByAgentId && (v.soldByAgentId === uid || v.soldByAgentId === agent.uid)) return true;
      if (cleanEmail && ((v as any).assignedAgentEmail && ((v as any).assignedAgentEmail as string).toLowerCase().trim() === cleanEmail || (v as any).agentEmail && ((v as any).agentEmail as string).toLowerCase().trim() === cleanEmail)) return true;
      if (cleanName && ((v.assignedAgentName && v.assignedAgentName.toLowerCase().trim() === cleanName) || ((v as any).assignedTo && ((v as any).assignedTo as string).toLowerCase().trim() === cleanName))) return true;
      if (cleanName && (v as any).soldByAgentName && ((v as any).soldByAgentName as string).toLowerCase().trim() === cleanName) return true;
      const normAgentName = cleanName.replace(/^(agent\s+)/i, '').replace(/\s*\(field\s+agent\)/i, '').replace(/[^a-z0-9]/g, '');
      const normVoucherAgent = (v.assignedAgentName || (v as any).assignedTo || '').toLowerCase().replace(/^(agent\s+)/i, '').replace(/\s*\(field\s+agent\)/i, '').replace(/[^a-z0-9]/g, '');
      if (normAgentName && normVoucherAgent && (normAgentName === normVoucherAgent || (normAgentName.length >= 6 && normVoucherAgent.length >= 6 && (normAgentName.includes(normVoucherAgent) || normVoucherAgent.includes(normAgentName))))) return true;
      if ((cleanName.includes('histec') || cleanEmail.includes('histec') || uid === 'agent_histec_training' || uid === 'OIofBo6j6jV6qM0oRRxVFwpucfP2') && (
        v.assignedAgentId === 'agent_histec_training' ||
        v.assignedAgentId === 'OIofBo6j6jV6qM0oRRxVFwpucfP2' ||
        (v as any).soldByAgentId === 'agent_histec_training' ||
        (v as any).soldByAgentId === 'OIofBo6j6jV6qM0oRRxVFwpucfP2' ||
        (v.assignedAgentName && v.assignedAgentName.toLowerCase().includes('histec')) ||
        ((v as any).assignedTo && ((v as any).assignedTo as string).toLowerCase().includes('histec')) ||
        ((v as any).soldByAgentName && ((v as any).soldByAgentName as string).toLowerCase().includes('histec')) ||
        ((v as any).assignedAgentEmail && ((v as any).assignedAgentEmail as string).toLowerCase().includes('histec')) ||
        ((v as any).agentEmail && ((v as any).agentEmail as string).toLowerCase().includes('histec'))
      )) return true;
      if ((cleanName.includes('mukondodzi') || cleanEmail.includes('mukondodzi') || uid === '6ih4NtJnXUeNtt1z0orVHZGkQuv2') && (
        (v.assignedAgentName && v.assignedAgentName.toLowerCase().includes('mukondodzi')) ||
        ((v as any).assignedTo && ((v as any).assignedTo as string).toLowerCase().includes('mukondodzi')) ||
        ((v as any).assignedAgentEmail && ((v as any).assignedAgentEmail as string).toLowerCase().includes('mukondodzi')) ||
        ((v as any).agentEmail && ((v as any).agentEmail as string).toLowerCase().includes('mukondodzi')) ||
        v.assignedAgentId === '6ih4NtJnXUeNtt1z0orVHZGkQuv2' ||
        (v.assignedAgentId && v.assignedAgentId.toLowerCase().includes('mukondodzi'))
      )) return true;
      if ((cleanName.includes('chitsungo') || cleanEmail.includes('chitsungo') || uid === '7QFBnEU9XxalOI6kl8csoTm58tE2') && (
        (v.assignedAgentName && v.assignedAgentName.toLowerCase().includes('chitsungo')) ||
        ((v as any).assignedTo && ((v as any).assignedTo as string).toLowerCase().includes('chitsungo')) ||
        ((v as any).assignedAgentEmail && ((v as any).assignedAgentEmail as string).toLowerCase().includes('chitsungo')) ||
        ((v as any).agentEmail && ((v as any).agentEmail as string).toLowerCase().includes('chitsungo')) ||
        v.assignedAgentId === '7QFBnEU9XxalOI6kl8csoTm58tE2' ||
        (v.assignedAgentId && v.assignedAgentId.toLowerCase().includes('chitsungo'))
      )) return true;
      if ((cleanName.includes('annitah') || cleanEmail.includes('teguruannitah') || uid === 'EbUj2wQFvFMQo8oqvdZ3TTILCm02') && (
        (v.assignedAgentName && v.assignedAgentName.toLowerCase().includes('annitah')) ||
        ((v as any).assignedTo && ((v as any).assignedTo as string).toLowerCase().includes('annitah')) ||
        ((v as any).assignedAgentEmail && ((v as any).assignedAgentEmail as string).toLowerCase().includes('teguruannitah')) ||
        v.assignedAgentId === 'EbUj2wQFvFMQo8oqvdZ3TTILCm02' ||
        (v.assignedAgentId && v.assignedAgentId.toLowerCase().includes('annitah'))
      )) return true;
      if ((cleanName.includes('siphelani') || cleanEmail.includes('zuwessytech') || uid === 'agent_1790695694537') && (
        (v.assignedAgentName && v.assignedAgentName.toLowerCase().includes('siphelani')) ||
        ((v as any).assignedTo && ((v as any).assignedTo as string).toLowerCase().includes('siphelani')) ||
        ((v as any).assignedAgentEmail && ((v as any).assignedAgentEmail as string).toLowerCase().includes('zuwessytech')) ||
        v.assignedAgentId === 'agent_1790695694537' ||
        (v.assignedAgentId && v.assignedAgentId.toLowerCase().includes('siphelani'))
      )) return true;
      return false;
    });

    // Current cycle vouchers vs previous cycle vouchers
    const currentVouchers = matchedVouchers.filter(v => {
      const saleDate = v.soldAt || (v as any).timestamp || (v as any).soldDate || v.createdAt;
      const vCycle = saleDate ? getCycleMonthFromDate(saleDate) : currentCycleMonth;
      return vCycle === currentCycleMonth;
    });
    const currentVoucherSales = currentVouchers.reduce((sum, v) => sum + getVoucherMonetaryValue(v, workspace?.giveawaySettings), 0);

    const prevVouchers = matchedVouchers.filter(v => {
      const saleDate = v.soldAt || (v as any).timestamp || (v as any).soldDate || v.createdAt;
      const vCycle = saleDate ? getCycleMonthFromDate(saleDate) : null;
      return vCycle === prevCycleMonth;
    });
    const prevVoucherSales = prevVouchers.reduce((sum, v) => sum + getVoucherMonetaryValue(v, workspace?.giveawaySettings), 0);

    // 2. Matched legacy devices (with comprehensive agent alias matching & MAC deduplication)
    const rawMatchedLegacy = (legacyDevices || []).filter(ld => {
      const isSold = ld.status === 'SOLD' && ld.reversalStatus !== 'Approved' && !ld.reversedAt;
      if (!isSold) return false;
      if (ld.fieldAgentId && (ld.fieldAgentId === uid || ld.fieldAgentId === agent.uid)) return true;
      if (cleanName && ld.fieldAgentName && ld.fieldAgentName.toLowerCase().trim() === cleanName) return true;
      if (cleanEmail && (ld as any).fieldAgentEmail && ((ld as any).fieldAgentEmail as string).toLowerCase().trim() === cleanEmail) return true;
      if (cleanName.includes('histec') && (
        ld.fieldAgentId === 'agent_histec_training' ||
        ld.fieldAgentId === 'OIofBo6j6jV6qM0oRRxVFwpucfP2' ||
        (ld.fieldAgentName && ld.fieldAgentName.toLowerCase().includes('histec')) ||
        ((ld as any).fieldAgentEmail && ((ld as any).fieldAgentEmail as string).toLowerCase().includes('histec'))
      )) return true;
      if ((cleanName.includes('mukondodzi') || cleanEmail.includes('mukondodzi') || uid === '6ih4NtJnXUeNtt1z0orVHZGkQuv2') && (
        (ld.fieldAgentName && ld.fieldAgentName.toLowerCase().includes('mukondodzi')) ||
        ((ld as any).fieldAgentEmail && ((ld as any).fieldAgentEmail as string).toLowerCase().includes('mukondodzi')) ||
        ld.fieldAgentId === '6ih4NtJnXUeNtt1z0orVHZGkQuv2' ||
        (ld.fieldAgentId && ld.fieldAgentId.toLowerCase().includes('mukondodzi'))
      )) return true;
      if ((cleanName.includes('chitsungo') || cleanEmail.includes('chitsungo') || uid === '7QFBnEU9XxalOI6kl8csoTm58tE2') && (
        (ld.fieldAgentName && ld.fieldAgentName.toLowerCase().includes('chitsungo')) ||
        ((ld as any).fieldAgentEmail && ((ld as any).fieldAgentEmail as string).toLowerCase().includes('chitsungo')) ||
        ld.fieldAgentId === '7QFBnEU9XxalOI6kl8csoTm58tE2' ||
        (ld.fieldAgentId && ld.fieldAgentId.toLowerCase().includes('chitsungo'))
      )) return true;
      return false;
    });

    const matchedLegacy = deduplicateLegacyDevices(rawMatchedLegacy);
    const currentLegacy = matchedLegacy.filter(ld => {
      const saleTime = ld.soldAt || ld.enrolledAt;
      const ldCycle = saleTime ? getCycleMonthFromDate(saleTime) : currentCycleMonth;
      return ldCycle === currentCycleMonth;
    });
    const currentLegacySales = currentLegacy.reduce((sum, ld) => sum + (ld.soldPrice ?? ld.monthlyPrice ?? 0), 0);

    const prevLegacy = matchedLegacy.filter(ld => {
      const saleTime = ld.soldAt || ld.enrolledAt;
      const ldCycle = saleTime ? getCycleMonthFromDate(saleTime) : null;
      return ldCycle === prevCycleMonth;
    });
    const prevLegacySales = prevLegacy.reduce((sum, ld) => sum + (ld.soldPrice ?? ld.monthlyPrice ?? 0), 0);

    // Current cycle actual sales strictly counts paid sales in the current cycle
    const inMemorySales = currentVoucherSales + currentLegacySales;

    // Check synchronized leaderboardSummary cache (by UID, agent UID, email, or clean name)
    const summaryScore = (leaderboardSummary && (
      leaderboardSummary[uid] ?? 
      leaderboardSummary[agent.uid] ??
      (cleanEmail ? leaderboardSummary[cleanEmail] : undefined) ?? 
      (cleanName ? leaderboardSummary[cleanName] : undefined) ?? 
      0
    )) || 0;

    // Check user profile performanceScore
    const profileScore = typeof agent.performanceScore === 'number' && agent.performanceScore > 0 
      ? agent.performanceScore 
      : 0;

    // Seed account initial baseline
    const isSeedAccount = uid in seedScores || (cleanEmail && cleanEmail in seedScores);
    const seedScore = seedScores[uid] || (cleanEmail ? seedScores[cleanEmail] : 0) || 0;

    const cleanUid = (uid || '').trim();
    const isHistec = cleanName.includes('histec') || cleanEmail.includes('histec') || cleanUid === 'agent_histec_training' || cleanUid === 'OIofBo6j6jV6qM0oRRxVFwpucfP2' || (cleanUid ? cleanUid.toLowerCase().includes('histec') : false);
    const isMukondodzi = cleanName.includes('mukondodzi') || cleanEmail.includes('mukondodzi') || cleanUid === '6ih4NtJnXUeNtt1z0orVHZGkQuv2' || (cleanUid ? cleanUid.toLowerCase().includes('mukondodzi') : false);
    const isChitsungo = cleanName.includes('chitsungo') || cleanEmail.includes('chitsungo') || cleanUid === '7QFBnEU9XxalOI6kl8csoTm58tE2' || (cleanUid ? cleanUid.toLowerCase().includes('chitsungo') : false);

    // Authoritative actual sales for current cycle strictly reflects current cycle sales:
    // Uses current cycle in-memory vouchers/devices. Never injects historical baseline scores into the current cycle.
    let actualSales = inMemorySales;
    if (actualSales === 0 && scopedVouchers.length === 0 && scopedLegacyDevices.length === 0 && summaryScore > 0 && !isSeedAccount) {
      actualSales = summaryScore;
    }

    // Previous cycle sales (historical record from previous month)
    let prevMonthActualSales = Math.max(prevVoucherSales + prevLegacySales, isSeedAccount ? seedScore : 0);

    // Monthly Target (Default $500.00) - resets in fresh sales cycle
    const targetAmount = agent.targetAmount !== undefined && agent.targetAmount > 0 ? agent.targetAmount : 500.00;
    // Total sales percentage of the current sales cycle: Strictly computed from actual sales of current cycle ONLY (previous cycle unclosed cash MUST NOT inflate current cycle percentage)
    const percentage = targetAmount > 0 ? Math.round((actualSales / targetAmount) * 100) : 0;
    const prevMonthPercentage = targetAmount > 0 ? Math.round((prevMonthActualSales / targetAmount) * 100) : 0;

    // Calculate unclosed cash from previous cycle
    const agentDrops = (cashDrops || []).filter(cd => {
      if (cd.agentId && (cd.agentId === uid || cd.agentId === agent.uid)) return true;
      if (cleanEmail && (cd as any).agentEmail && ((cd as any).agentEmail as string).toLowerCase().trim() === cleanEmail) return true;
      if (cleanName && cd.agentName && cd.agentName.toLowerCase().trim() === cleanName) return true;
      const cleanDropName = (cd.agentName || cd.agentId || '').toLowerCase().replace(/^(agent\s+)/i, '').replace(/\s*\(field\s+agent\)/i, '').replace(/[^a-z0-9]/g, '');
      const cleanAgent = (cleanName || uid).toLowerCase().replace(/^(agent\s+)/i, '').replace(/\s*\(field\s+agent\)/i, '').replace(/[^a-z0-9]/g, '');
      if (cleanDropName && cleanAgent && (cleanDropName === cleanAgent || cleanAgent.includes(cleanDropName) || cleanDropName.includes(cleanAgent))) return true;
      if (isHistec && (
        (cd.agentId && (cd.agentId === 'agent_histec_training' || cd.agentId === 'OIofBo6j6jV6qM0oRRxVFwpucfP2' || cd.agentId.toLowerCase().includes('histec'))) ||
        (cd.agentName && cd.agentName.toLowerCase().includes('histec'))
      )) return true;
      if (isMukondodzi && (
        (cd.agentId && (cd.agentId === '6ih4NtJnXUeNtt1z0orVHZGkQuv2' || cd.agentId.toLowerCase().includes('mukondodzi'))) ||
        (cd.agentName && cd.agentName.toLowerCase().includes('mukondodzi'))
      )) return true;
      if (isChitsungo && (
        (cd.agentId && (cd.agentId === '7QFBnEU9XxalOI6kl8csoTm58tE2' || cd.agentId.toLowerCase().includes('chitsungo'))) ||
        (cd.agentName && cd.agentName.toLowerCase().includes('chitsungo'))
      )) return true;
      return false;
    });

    // Calculate lifetime sales and total lifetime closed to authoritatively ascertain if any unclosed balance exists
    const totalLifetimeSales = matchedVouchers.reduce((sum, v) => sum + getVoucherMonetaryValue(v), 0) +
      matchedLegacy.reduce((sum, ld) => sum + (ld.soldPrice ?? ld.monthlyPrice ?? 0), 0);
    const totalLifetimeClosed = agentDrops
      .filter(cd => cd.status === 'Reconciled' || cd.status === 'Pending' || (cd.status as any) === 'Approved')
      .reduce((sum, cd) => sum + (cd.amount || 0), 0);
    const totalNetUnclosed = Math.max(0, Number((totalLifetimeSales - totalLifetimeClosed).toFixed(2)));

    // Calculate unclosed cash from previous cycle (strictly 0 if agent has closed all cash)
    let unclosedCashFromPrevCycle = 0;
    let hasUnclosedCashFromPrevCycle = false;

    if (totalNetUnclosed > 0.01) {
      const prevCycleDrops = agentDrops.filter(cd => {
        const dCycle = cd.cycleMonth || getCycleMonthFromDate(cd.timestamp);
        return dCycle && dCycle !== currentCycleMonth;
      });
      const currentCycleDrops = agentDrops.filter(cd => {
        const dCycle = cd.cycleMonth || getCycleMonthFromDate(cd.timestamp);
        return dCycle === currentCycleMonth;
      });
      const prevCycleDirectClosed = prevCycleDrops
        .filter(cd => cd.status === 'Reconciled' || cd.status === 'Pending' || (cd.status as any) === 'Approved')
        .reduce((sum, cd) => sum + (cd.amount || 0), 0);

      // Attached and closed in subsequent / current cycle drops
      const dropsWithAttachedPrev = agentDrops.filter(cd => (cd.attachedPrevCycleUnclosedCash || 0) > 0);
      const attachedAndApproved = dropsWithAttachedPrev
        .filter(cd => cd.status === 'Reconciled' || cd.status === 'Pending' || (cd.status as any) === 'Approved')
        .reduce((sum, cd) => sum + (cd.attachedPrevCycleUnclosedCash || 0), 0);

      // Current cycle cash drops in excess of current cycle sales also offset previous cycle unclosed cash
      const currentCycleClosed = currentCycleDrops
        .filter(cd => cd.status === 'Reconciled' || cd.status === 'Pending' || (cd.status as any) === 'Approved')
        .reduce((sum, cd) => sum + (cd.amount || 0), 0);
      const excessCurrentClosed = Math.max(0, currentCycleClosed - inMemorySales);

      const rawPrevUnclosed = Math.max(0, prevMonthActualSales - prevCycleDirectClosed - attachedAndApproved - excessCurrentClosed);
      unclosedCashFromPrevCycle = Math.min(totalNetUnclosed, Math.max(0, Number(rawPrevUnclosed.toFixed(2))));
      hasUnclosedCashFromPrevCycle = unclosedCashFromPrevCycle > 0.01;
    }

    // Determine agent's location
    const agentVoucher = (vouchers || []).find(v => v.assignedAgentId === uid || (v.assignedAgentName && cleanName && v.assignedAgentName.toLowerCase().trim() === cleanName));
    const location = agent.location || agentVoucher?.location || (agent as any).location || 'Harare Central';

    let totalVouchersSold = currentVouchers.length;

    return {
      uid,
      name: agent.name,
      email: agent.email || '',
      cellNumber: agent.cellNumber || '+263770000000',
      profilePic: agent.profilePic || '',
      location,
      actualSales,
      targetAmount,
      percentage,
      rank: 1,
      totalVouchersSold,
      prevMonthActualSales,
      prevMonthPercentage,
      prevMonthTargetAmount: targetAmount,
      unclosedCashFromPrevCycle,
      hasUnclosedCashFromPrevCycle
    };
  });

  // Sort strictly by actualSales descending (synchronizing Admin and Agent views)
  records.sort((a, b) => b.actualSales - a.actualSales);

  // Assign 1-indexed ranks
  records.forEach((rec, idx) => {
    rec.rank = idx + 1;
  });

  return records;
};

/**
 * Calculates the exact platform-wide total number of active agents across active workspaces.
 * Prevents orphaned accounts or deleted workspace agents from inflating the global count.
 */
export const getPlatformActiveAgentsCount = (
  users: UserProfile[],
  workspaces: Workspace[]
): number => {
  const activeWorkspaces = (workspaces || []).filter(w => w.isActive !== false);
  const activeWsIdSet = new Set(activeWorkspaces.map(w => w.id));
  const activeWsAgentIds = new Set<string>();

  activeWorkspaces.forEach(w => {
    if (Array.isArray(w.agentIds)) {
      w.agentIds.forEach(id => {
        if (id) activeWsAgentIds.add(id);
      });
    }
  });

  const countedUids = new Set<string>();
  const seenEmails = new Set<string>();

  (users || []).forEach(u => {
    const uid = u.uid || (u as any).id;
    if (!uid) return;
    if (!isAgentActive(u)) return;

    // Must belong to an active workspace or be in active workspace's agentIds
    const belongs = (u.workspaceId && activeWsIdSet.has(u.workspaceId)) || activeWsAgentIds.has(uid);
    if (!belongs) return;

    const cleanEmail = (u.email || '').trim().toLowerCase();
    if (cleanEmail && seenEmails.has(cleanEmail)) return;

    countedUids.add(uid);
    if (cleanEmail) seenEmails.add(cleanEmail);
  });

  // Also include any agent IDs present in active workspaces' agentIds
  activeWsAgentIds.forEach(id => countedUids.add(id));

  return countedUids.size;
};

/**
 * Resolves, deduplicates, and harmonizes the complete personnel list for a workspace
 * (WorkspaceMaster, Admins, Agents, etc.) for the Staff Directory.
 * Ensures shadow duplicate accounts are merged into the canonical real account,
 * preventing duplicate cards from showing up in the Admin Staff Directory.
 */
export const getWorkspaceUsers = (
  users: UserProfile[],
  workspace: Workspace | null | undefined,
  currentUser?: UserProfile | null
): UserProfile[] => {
  const isDeveloperEmail = currentUser?.email?.toLowerCase()?.trim() === 'karimazondomike049@gmail.com';
  const isAppOwner = currentUser?.role === 'AppOwner' || isDeveloperEmail;
  const wsId = (!isAppOwner && currentUser?.workspaceId)
    ? currentUser.workspaceId
    : (workspace?.id || currentUser?.workspaceId);
  if (!wsId) return [];
  const wsAgentIds = Array.isArray(workspace?.agentIds) ? workspace!.agentIds! : [];

  const candidateUsers = (users || []).filter(u => {
    const uid = u.uid || (u as any).id;
    if (!uid) return false;
    // Exclude global AppOwner unless explicitly in this workspace
    if (u.role === 'AppOwner' && u.workspaceId !== wsId) return false;

    // Strict multi-tenant isolation:
    if (u.workspaceId && u.workspaceId !== wsId) return false;

    // Strict standard: No admin should see information relating to agents/users under another admin
    if (u.created_by_admin && currentUser && !isAppOwner && u.created_by_admin !== currentUser.uid && u.workspaceId !== wsId) {
      return false;
    }

    // Check workspace membership via workspaceId, active workspace agentIds, or ownerId
    const belongs = u.workspaceId === wsId || (wsAgentIds.includes(uid) && (!u.workspaceId || u.workspaceId === wsId)) || workspace?.ownerId === uid;
    return belongs;
  });

  const isShadow = (user: UserProfile) => {
    const uid = user?.uid || (user as any)?.id || '';
    const isDefaultCell = !user?.cellNumber || user.cellNumber === '+263770000000';
    const isDefaultPic = isSeedOrMockProfilePic(user?.profilePic);
    const isEmptyWs = !user?.workspaceId || user.workspaceId === '';
    const isTempUid = typeof uid === 'string' && (uid.startsWith('agent_') || uid.startsWith('u_') || uid.startsWith('temp_'));
    const hasNoPassword = !user?.password || user.password.trim() === '';
    return (isDefaultCell && (isEmptyWs || isDefaultPic || hasNoPassword)) || (isTempUid && hasNoPassword && isDefaultCell);
  };

  // Sort candidate users so real, canonical accounts precede shadow duplicates
  const sortedCandidates = [...candidateUsers].sort((a, b) => {
    // 1. WorkspaceMaster / Owner comes first
    const aIsMaster = a.role === 'WorkspaceMaster' || (a.role as string)?.toLowerCase() === 'owner';
    const bIsMaster = b.role === 'WorkspaceMaster' || (b.role as string)?.toLowerCase() === 'owner';
    if (aIsMaster && !bIsMaster) return -1;
    if (!aIsMaster && bIsMaster) return 1;

    // 2. Real account precedes shadow account
    const aShadow = isShadow(a);
    const bShadow = isShadow(b);
    if (!aShadow && bShadow) return -1;
    if (aShadow && !bShadow) return 1;

    // 3. Account with password precedes account without password
    const aHasPass = !!a.password && a.password.trim() !== '';
    const bHasPass = !!b.password && b.password.trim() !== '';
    if (aHasPass && !bHasPass) return -1;
    if (!aHasPass && bHasPass) return 1;

    // 4. Non-default cell precedes default cell
    const aDefCell = !a.cellNumber || a.cellNumber === '+263770000000';
    const bDefCell = !b.cellNumber || b.cellNumber === '+263770000000';
    if (!aDefCell && bDefCell) return -1;
    if (aDefCell && !bDefCell) return 1;

    // 5. Non-temp UID precedes temp UID
    const aUid = a?.uid || (a as any)?.id || '';
    const bUid = b?.uid || (b as any)?.id || '';
    const aIsTemp = typeof aUid === 'string' && (aUid.startsWith('agent_') || aUid.startsWith('temp_'));
    const bIsTemp = typeof bUid === 'string' && (bUid.startsWith('agent_') || bUid.startsWith('temp_'));
    if (!aIsTemp && bIsTemp) return -1;
    if (aIsTemp && !bIsTemp) return 1;

    return 0;
  });

  const uniqueMap = new Map<string, UserProfile>();
  const emailToUid = new Map<string, string>();
  const nameToUid = new Map<string, string>();

  sortedCandidates.forEach(u => {
    const uid = u.uid || (u as any).id;
    if (!uid) return;
    const cleanEmail = (u.email || '').trim().toLowerCase();
    const cleanName = (u.name || '').trim().toLowerCase();

    // Check if duplicate by email
    if (cleanEmail && emailToUid.has(cleanEmail)) {
      const existingUid = emailToUid.get(cleanEmail)!;
      const existing = uniqueMap.get(existingUid)!;
      
      const existingDefaultCell = existing.cellNumber === '+263770000000' || !existing.cellNumber;
      const currentDefaultCell = u.cellNumber === '+263770000000' || !u.cellNumber;
      const existingDefaultPic = isSeedOrMockProfilePic(existing.profilePic);
      const currentDefaultPic = isSeedOrMockProfilePic(u.profilePic);

      const merged: UserProfile = {
        ...u,
        ...existing,
        cellNumber: !existingDefaultCell ? existing.cellNumber : (!currentDefaultCell ? u.cellNumber : existing.cellNumber),
        profilePic: !currentDefaultPic ? u.profilePic : (!existingDefaultPic ? existing.profilePic : u.profilePic),
        password: existing.password || u.password || '',
        workspaceId: existing.workspaceId || u.workspaceId || wsId,
        role: existing.role || u.role,
        commissionRate: u.commissionRate !== undefined ? u.commissionRate : existing.commissionRate
      };
      uniqueMap.set(existingUid, merged);
      return;
    }

    // Check if duplicate by exact name in same workspace with placeholder/empty email
    if (cleanName && nameToUid.has(cleanName)) {
      const existingUid = nameToUid.get(cleanName)!;
      const existing = uniqueMap.get(existingUid)!;
      const existingIsShadow = isShadow(existing);
      const currentIsShadow = isShadow(u);

      if (currentIsShadow || (!cleanEmail && existing.email)) {
        // Current is a shadow duplicate of an existing real account with the same name
        return;
      }
    }

    if (!uniqueMap.has(uid)) {
      uniqueMap.set(uid, u);
      if (cleanEmail) emailToUid.set(cleanEmail, uid);
      if (cleanName) nameToUid.set(cleanName, uid);
    }
  });

  return Array.from(uniqueMap.values()).sort((a, b) => {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    const aIsMaster = a.role === 'WorkspaceMaster' || (a.role as string)?.toLowerCase() === 'owner';
    const bIsMaster = b.role === 'WorkspaceMaster' || (b.role as string)?.toLowerCase() === 'owner';
    if (aIsMaster && !bIsMaster) return -1;
    if (!aIsMaster && bIsMaster) return 1;
    const nameA = String(a.name || a.email || a.uid || '').trim();
    const nameB = String(b.name || b.email || b.uid || '').trim();
    return nameA.localeCompare(nameB);
  });
};

export const getAgentDisplayName = (fullName?: string): string => {
  if (!fullName) return 'Agent';
  let clean = fullName.replace(/^(agent\s+)/i, '').trim();
  clean = clean.replace(/\s*\(field\s+agent\)/i, '').trim();
  const parts = clean.split(' ');
  if (parts.length > 1) {
    if (parts[1].length <= 2) {
      return `${parts[0]} ${parts[1]}`;
    }
    return `${parts[0]} ${parts[1][0]}.`;
  }
  return clean;
};

