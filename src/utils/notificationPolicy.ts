import { SystemNotification, UserProfile } from '../types';

/**
 * Validates whether a system notification should be displayed to the current user.
 * 
 * Rules:
 * 1. "Only broadcasts marked for all users shows to all users" - Broadcasts with targetAudience === 'ALL' (or unspecified) show to all users.
 * 2. Broadcasts with targetAudience === 'SPECIFIC' show only to the specified agent IDs.
 * 3. Personal notifications (e.g. voucher revocation, legacy device approval/decline, cash drop approval/decline, admin declines)
 *    must show to the concerned user only (matching targetAgentIds or targetUserIds).
 * 4. Administrative notifications (e.g. agent submitted cash drop, requested reversal) show strictly to Administrators/Workspace Masters.
 * 5. Inactive / disabled draft notices never show to field agents.
 */
export function isNotificationVisibleToUser(
  notif: SystemNotification,
  currentUser: UserProfile | null
): boolean {
  if (!currentUser) return false;

  const isUserAdmin = currentUser.role === 'Admin' || 
                      currentUser.role === 'WorkspaceMaster' || 
                      currentUser.role === 'AppOwner' ||
                      currentUser.email?.toLowerCase().trim() === 'karimazondomike049@gmail.com';

  // 1. Inactive check (Drafts never show to field agents)
  if (notif.isActive === false && !isUserAdmin) {
    return false;
  }

  // 2. System update check: "Do not broadcast system updates"
  const isSystemUpdate = notif.notifType === 'system' ||
                         notif.senderName?.toLowerCase().startsWith('system') ||
                         notif.message?.toLowerCase().startsWith('system update') ||
                         notif.message?.toLowerCase().includes('system maintenance');

  if (isSystemUpdate) {
    // System updates are NEVER broadcasted to all general users
    const isAdminTargeted = notif.targetAudience === 'ADMIN' || 
                            notif.targetRole === 'Admin' || 
                            notif.targetRole === 'WorkspaceMaster';
    if (isAdminTargeted) return isUserAdmin;

    const cleanName = currentUser.name ? currentUser.name.toLowerCase().trim() : '';
    const isTargetedUser = Boolean(
      (notif.targetAgentIds && notif.targetAgentIds.includes(currentUser.uid)) ||
      (notif.targetUserIds && notif.targetUserIds.includes(currentUser.uid)) ||
      (notif.targetAgentNames && cleanName && notif.targetAgentNames.some(name => name.toLowerCase().trim() === cleanName))
    );
    if (isTargetedUser) return true;

    return isUserAdmin;
  }

  // 3. Broadcast marked for all users: "Only broadcasts marked for all users shows to all users"
  const isBroadcastForAll = Boolean(
    notif.isBroadcast && 
    (notif.targetAudience === 'ALL' || (!notif.targetAudience && (!notif.targetAgentIds || notif.targetAgentIds.length === 0) && (!notif.targetUserIds || notif.targetUserIds.length === 0)))
  );

  if (isBroadcastForAll) {
    return true;
  }

  // 4. Targeted to specific agents or specific users:
  // Must show ONLY to the concerned user whose UID or name matches!
  const hasSpecificTargets = (Array.isArray(notif.targetAgentIds) && notif.targetAgentIds.length > 0) ||
                             (Array.isArray(notif.targetUserIds) && notif.targetUserIds.length > 0) ||
                             (Array.isArray(notif.targetAgentNames) && notif.targetAgentNames.length > 0) ||
                             notif.targetAudience === 'SPECIFIC';

  if (hasSpecificTargets) {
    const cleanName = currentUser.name ? currentUser.name.toLowerCase().trim() : '';
    const isTargetedUser = Boolean(
      (notif.targetAgentIds && notif.targetAgentIds.includes(currentUser.uid)) ||
      (notif.targetUserIds && notif.targetUserIds.includes(currentUser.uid)) ||
      (notif.targetAgentNames && cleanName && notif.targetAgentNames.some(name => name.toLowerCase().trim() === cleanName))
    );
    // If the user is the targeted recipient, show it!
    if (isTargetedUser) {
      return true;
    }
    // Otherwise, NOT the concerned user -> do not show!
    return false;
  }

  // 5. Notifications intended strictly for Administrators:
  const isAdminTargeted = notif.targetAudience === 'ADMIN' || 
                          notif.targetRole === 'Admin' || 
                          notif.targetRole === 'WorkspaceMaster';

  if (isAdminTargeted) {
    return isUserAdmin;
  }

  // 6. Default safe rule: If not a broadcast marked for all users and not targeted to this user, do not show.
  return false;
}
