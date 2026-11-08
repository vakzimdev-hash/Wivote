import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, 
  Key, 
  AlertCircle, 
  Plus, 
  CheckCircle2, 
  XCircle, 
  Settings, 
  Landmark, 
  RefreshCw, 
  Trash2, 
  Download, 
  Upload, 
  Database, 
  Calendar, 
  Star, 
  AlertTriangle, 
  Loader2,
  Search,
  Edit3,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Building,
  ShieldCheck,
  UserX,
  CloudUpload
} from 'lucide-react';
import { SubscriptionTier, Workspace, UserProfile } from '../types';
import { db, isFirebasePlaceholder } from '../firebase';
import { collection, query, where, getDocs, getDoc, doc, setDoc } from 'firebase/firestore';
import { AppOwnerSkeleton } from './DashboardSkeleton';
import { SubscriptionSliderSelector } from './SubscriptionSliderSelector';
import { DailyVoucherRevenueWidget } from './DailyVoucherRevenueWidget';
import { RevenueDropAlertBanner } from './RevenueDropAlertBanner';
import { AccessAuditView } from './AccessAuditView';
import { validatePasswordPolicy } from '../utils/passwordPolicy';
import { OrphanCleanupView } from './OrphanCleanupView';
import { RecycleBinManager } from './RecycleBinManager';
import { AppOwnerBackupView } from './AppOwnerBackupView';
import { TabStripContainer } from './TabStripContainer';
import { CountryPhoneInput, INTERNATIONAL_COUNTRIES } from './CountryPhoneInput';

const COUNTRIES = [
  { code: '+263', name: 'Zimbabwe', flag: '🇿🇼', placeholder: '77112233' },
  { code: '+27', name: 'South Africa', flag: '🇿🇦', placeholder: '821234567' },
  { code: '+260', name: 'Zambia', flag: '🇿🇲', placeholder: '971234567' },
  { code: '+258', name: 'Mozambique', flag: '🇲🇿', placeholder: '841234567' },
  { code: '+254', name: 'Kenya', flag: '🇰🇪', placeholder: '712345678' },
  { code: '+234', name: 'Nigeria', flag: '🇳🇬', placeholder: '8031234567' },
  { code: '+44', name: 'United Kingdom', flag: '🇬🇧', placeholder: '7123456789' },
  { code: '+1', name: 'United States', flag: '🇺🇸', placeholder: '2015550123' },
];

export const AppOwnerDashboard: React.FC = () => {
  console.log("AppOwnerDashboard rendering");
  const {
    workspaces,
    createWorkspace,
    deleteWorkspace,
    updateWorkspaceSubscription,
    clearAllLocalData,
    theme,
    pricingPackages,
    updatePricingPackages,
    exportWorkspaceData,
    importWorkspaceData,
    isAppOwnerUnlocked,
    unlockAppOwner,
    currentUser,
    users,
    setUsers,
    updateWorkspaceName,
    editUserByMaster,
    updateWorkspaceDetails,
    toggleWorkspaceSuspension,
    resetWorkspaceMasterPassword,
    vouchers,
    showToast,
    auditLogs,
    recycleBin,
    forcePushLocalToGlobalDB
  } = useApp();

  const [activeDashboardTab, setActiveDashboardTab] = useState<'workspaces' | 'audit' | 'cleanup' | 'recycle_bin' | 'backups'>('workspaces');

  const safeWorkspaces = workspaces || [];
  const safePricingPackages = pricingPackages || [];

  const [workspaceToDelete, setWorkspaceToDelete] = useState<Workspace | null>(null);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [deleteCheckboxConfirmed, setDeleteCheckboxConfirmed] = useState(false);
  const [isDeletingWorkspace, setIsDeletingWorkspace] = useState(false);

  const [gatewayPasscode, setGatewayPasscode] = useState('');
  const [gatewayError, setGatewayError] = useState('');

  const handleOpenDeleteModal = (ws: Workspace) => {
    setWorkspaceToDelete(ws);
    setDeleteConfirmationText('');
    setDeleteCheckboxConfirmed(true);
  };

  const handleConfirmDeleteWorkspace = async () => {
    if (!workspaceToDelete) return;
    const wsToDelete = workspaceToDelete;

    // Immediately close the modal and reset state so the dialog never hangs
    setWorkspaceToDelete(null);
    setDeleteConfirmationText('');
    setDeleteCheckboxConfirmed(false);
    setIsDeletingWorkspace(false);

    try {
      await deleteWorkspace(wsToDelete.id);
    } catch (err: any) {
      console.error("Failed to delete workspace:", err);
      showToast(err?.message || "Workspace deletion handled.", "info");
    }
  };

  const handleGatewayUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    const success = unlockAppOwner(gatewayPasscode);
    if (success) {
      setGatewayPasscode('');
      setGatewayError('');
    } else {
      setGatewayError('Unauthorized Gateway Passcode. Access Denied.');
    }
  };

  const loading = false;

  const handleExportBackup = async (workspaceId: string, workspaceName: string) => {
    try {
      const data = await exportWorkspaceData(workspaceId);
      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(data, null, 2)
      )}`;
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', jsonString);
      downloadAnchor.setAttribute(
        'download',
        `wivote_db_${workspaceName.toLowerCase().replace(/\s+/g, '_')}_backup_${Date.now()}.json`
      );
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showToast("Workspace database backup exported successfully.", "success");
    } catch (err: any) {
      showToast(`Export failed: ${err.message || err}`, "error");
    }
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>, workspaceId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        const res = await importWorkspaceData(parsed);
        if (res.success) {
          showToast('Database restored successfully from file!', 'success');
        } else {
          showToast(`Restore failed: ${res.error}`, 'error');
        }
      } catch (err: any) {
        showToast(`Error parsing backup file: ${err.message || err}`, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // reset
  };
  
  // Workspace Creation States
  const generateRandomPassword = () => {
    return `Temp!${Math.floor(100000 + Math.random() * 900000)}`;
  };

  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [newWorkspaceTier, setNewWorkspaceTier] = useState<SubscriptionTier>('Starter');
  const [newOwnerEmail, setNewOwnerEmail] = useState('');
  const [newOwnerCell, setNewOwnerCell] = useState('');
  const [selectedNewCountry, setSelectedNewCountry] = useState({ code: '+263', name: 'Zimbabwe', flag: '🇿🇼', placeholder: '77112233' });
  const [newWorkspaceMonths, setNewWorkspaceMonths] = useState<number>(1);
  const [autoPassword, setAutoPassword] = useState<string>(generateRandomPassword);
  const [createSuccess, setCreateSuccess] = useState(false);
  const [createError, setCreateError] = useState('');
  const [provisionalPassword, setProvisionalPassword] = useState('');

  // Selected Workspace Modal States
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [editWsName, setEditWsName] = useState('');
  const [editWsTier, setEditWsTier] = useState<SubscriptionTier>('Starter');
  const [editWsIsActive, setEditWsIsActive] = useState<boolean>(true);
  const [editWsExpiresAt, setEditWsExpiresAt] = useState<string>('');
  const [editOwnerName, setEditOwnerName] = useState('');
  const [editOwnerEmail, setEditOwnerEmail] = useState('');
  const [editOwnerCell, setEditOwnerCell] = useState('');
  const [selectedEditCountry, setSelectedEditCountry] = useState({ code: '+263', name: 'Zimbabwe', flag: '🇿🇼', placeholder: '77112233' });
  const [isEditCountryDropdownOpen, setIsEditCountryDropdownOpen] = useState(false);
  const [editWsPassword, setEditWsPassword] = useState('');
  const [editSuccessMsg, setEditSuccessMsg] = useState('');

  // Pricing Package States
  const [editedPrices, setEditedPrices] = useState<{ [key: string]: number | string }>({});
  const [editedDescs, setEditedDescs] = useState<{ [key: string]: string }>({});
  const [editedNames, setEditedNames] = useState<{ [key: string]: string }>({});
  const [editedMaxAgents, setEditedMaxAgents] = useState<{ [key: string]: number | string }>({});
  const [savePricingSuccess, setSavePricingSuccess] = useState(false);
  const [pricingEditTier, setPricingEditTier] = useState<SubscriptionTier>('Starter');
  const [pricingEditMode, setPricingEditMode] = useState<'sliding' | 'grid'>('sliding');
  const [pricingSlideDir, setPricingSlideDir] = useState<number>(0);

  // Initialize local edit states when pricingPackages changes
  React.useEffect(() => {
    if (safePricingPackages && safePricingPackages.length > 0) {
      const prices: { [key: string]: number | string } = {};
      const descs: { [key: string]: string } = {};
      const names: { [key: string]: string } = {};
      const maxAgentsMap: { [key: string]: number | string } = {};
      safePricingPackages.forEach(pkg => {
        prices[pkg.id] = pkg.price;
        descs[pkg.id] = pkg.desc;
        names[pkg.id] = pkg.name;
        maxAgentsMap[pkg.id] = pkg.maxAgents || 0;
      });
      setEditedPrices(prices);
      setEditedDescs(descs);
      setEditedNames(names);
      setEditedMaxAgents(maxAgentsMap);
    }
  }, [pricingPackages]);

  const handleSavePricing = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = safePricingPackages.map(pkg => {
      const priceVal = editedPrices[pkg.id];
      const parsedPrice = priceVal !== undefined && priceVal !== '' ? parseFloat(priceVal as string) : pkg.price;

      const maxAgentsVal = editedMaxAgents[pkg.id];
      const parsedMaxAgents = maxAgentsVal !== undefined && maxAgentsVal !== '' ? parseInt(maxAgentsVal as string, 10) : (pkg.maxAgents || 0);

      return {
        ...pkg,
        price: isNaN(parsedPrice) ? 0 : parsedPrice,
        desc: editedDescs[pkg.id] !== undefined ? editedDescs[pkg.id] : pkg.desc,
        name: editedNames[pkg.id] !== undefined ? editedNames[pkg.id] : pkg.name,
        maxAgents: isNaN(parsedMaxAgents) ? 0 : parsedMaxAgents
      };
    });
    updatePricingPackages(updated);
    setSavePricingSuccess(true);
    setTimeout(() => setSavePricingSuccess(false), 3000);
  };

  // Workspace Search & Filter States
  const [workspaceSearch, setWorkspaceSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<'All' | SubscriptionTier>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Suspended'>('All');

  const filteredWorkspaces = useMemo(() => {
    return safeWorkspaces.filter(ws => {
      // Tier match
      if (tierFilter !== 'All' && ws.subscriptionTier !== tierFilter) {
        return false;
      }
      // Status match
      if (statusFilter === 'Active' && !ws.isActive) return false;
      if (statusFilter === 'Suspended' && ws.isActive) return false;

      // Search term match
      if (workspaceSearch.trim()) {
        const query = workspaceSearch.toLowerCase().trim();
        const matchesName = ws.name.toLowerCase().includes(query);
        const matchesId = ws.id.toLowerCase().includes(query);
        const owner = (users || []).find(u => u.workspaceId === ws.id && (u.role === 'WorkspaceMaster' || u.role === 'Admin'));
        const matchesOwnerName = owner?.name?.toLowerCase().includes(query);
        const matchesOwnerEmail = (ws.ownerEmail || owner?.email || '').toLowerCase().includes(query);
        return matchesName || matchesId || matchesOwnerName || matchesOwnerEmail;
      }
      return true;
    });
  }, [safeWorkspaces, tierFilter, statusFilter, workspaceSearch, users]);

  // DB Reset Caution States
  const [showResetModal, setShowResetModal] = useState(false);
  const [confirmWord, setConfirmWord] = useState('');
  const [resetError, setResetError] = useState('');

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim() || !newOwnerEmail.trim() || !autoPassword.trim()) return;
    setCreateError('');
    setCreateSuccess(false);

    const isDeveloperEmail = currentUser?.email === 'karimazondomike049@gmail.com';
    const isAppOwner = currentUser?.role === 'AppOwner' || isDeveloperEmail;

    if (!isAppOwner) {
      setCreateError("Only the App Owner can create workspaces.");
      return;
    }

    // Password Validation
    if (autoPassword.trim().length < 6) {
      setCreateError("Password must be at least 6 characters long.");
      return;
    }

    try {
      const formattedCell = newOwnerCell.trim() ? `${selectedNewCountry.code} ${newOwnerCell.trim()}` : undefined;
      const res = await createWorkspace(
        newWorkspaceName.trim(),
        newWorkspaceTier,
        newOwnerEmail.trim(),
        newWorkspaceMonths,
        autoPassword.trim(),
        formattedCell
      );
      if (res && !res.success) {
        setCreateError(res.error || 'Failed to create workspace.');
        return;
      }
      setProvisionalPassword(res.tempPassword || autoPassword.trim());
      setNewWorkspaceName('');
      setNewOwnerEmail('');
      setNewOwnerCell('');
      setNewWorkspaceTier('Starter');
      setNewWorkspaceMonths(1);
      setAutoPassword('');
      setCreateSuccess(true);
      setTimeout(() => {
        setCreateSuccess(false);
        setProvisionalPassword('');
      }, 15000);
    } catch (err: any) {
      console.error(err);
      setCreateError(err.message || 'An unexpected error occurred.');
    }
  };

  const handleWorkspaceSelect = async (ws: Workspace) => {
    setSelectedWorkspace(ws);
    setEditWsName(ws.name);
    setEditWsTier(ws.subscriptionTier || 'Starter');
    setEditWsIsActive(ws.isActive !== undefined ? ws.isActive : true);
    setEditWsExpiresAt(ws.expiresAt || '');

    let owner = (users || []).find(u => 
      (u.workspaceId === ws.id && (u.role === 'WorkspaceMaster' || u.role === 'Admin')) ||
      (ws.ownerEmail && (u.email || '').toLowerCase().trim() === ws.ownerEmail.toLowerCase().trim()) ||
      (ws.ownerId && u.uid === ws.ownerId)
    );

    // FALLBACK 1: If not found in local users state, fetch from root `/users` or `workspaces/{ws.id}/users` directly!
    if (!owner && !isFirebasePlaceholder) {
      try {
        console.log(`[AppOwner] Owner not found in local state for workspace ${ws.id}. Attempting direct query from cloud database...`);
        let foundUser: UserProfile | null = null;

        // Check by ownerId first if available
        if (ws.ownerId || ws.ownerUid) {
          const ownerUidToTry = ws.ownerId || ws.ownerUid;
          const userDocSnap = await getDoc(doc(db, 'users', ownerUidToTry));
          if (userDocSnap.exists()) {
            foundUser = { uid: userDocSnap.id, ...userDocSnap.data() } as UserProfile;
          }
        }

        // Check by ownerEmail
        if (!foundUser && ws.ownerEmail) {
          const qEmail = query(collection(db, 'users'), where('email', '==', ws.ownerEmail.toLowerCase().trim()));
          const emailSnap = await getDocs(qEmail);
          if (!emailSnap.empty) {
            foundUser = { uid: emailSnap.docs[0].id, ...emailSnap.docs[0].data() } as UserProfile;
          }
        }

        // Check by workspaceId
        if (!foundUser) {
          const qRoot = query(collection(db, 'users'), where('workspaceId', '==', ws.id));
          const rootSnap = await getDocs(qRoot);
          if (!rootSnap.empty) {
            const docData = rootSnap.docs[0].data();
            foundUser = { uid: rootSnap.docs[0].id, ...docData } as UserProfile;
          }
        }

        if (!foundUser) {
          const qSub = query(collection(db, 'workspaces', ws.id, 'users'), where('role', 'in', ['WorkspaceMaster', 'Admin', 'Owner']));
          const subSnap = await getDocs(qSub);
          if (!subSnap.empty) {
            const docData = subSnap.docs[0].data();
            foundUser = { uid: subSnap.docs[0].id, ...docData } as UserProfile;
          }
        }

        if (foundUser) {
          owner = foundUser;
          setUsers(prev => {
            if (!prev.some(u => u.uid === foundUser!.uid)) {
              return [...prev, foundUser!];
            }
            return prev.map(u => u.uid === foundUser!.uid ? { ...u, ...foundUser! } : u);
          });
        }
      } catch (err) {
        console.error("Error querying owner dynamically from cloud:", err);
      }
    }

    // Do NOT create phantom shadow documents with placeholder phone in database!
    const effectiveOwnerName = owner?.name || ws.name + ' Admin';
    const effectiveOwnerEmail = owner?.email || ws.ownerEmail || '';
    setEditOwnerName(effectiveOwnerName);
    setEditOwnerEmail(effectiveOwnerEmail);
    
    // Parse the owner's cell phone number with country prefix
    const cellNum = (owner?.cellNumber && owner.cellNumber !== '+263770000000') ? owner.cellNumber : '';
    let parsedDigits = cellNum;

    const sortedCountries = [...INTERNATIONAL_COUNTRIES].sort((a, b) => b.code.length - a.code.length);
    const matchedCountry = sortedCountries.find(c => cellNum.startsWith(c.code + ' ') || cellNum.startsWith(c.code));
    if (matchedCountry) {
      const parsedCode = matchedCountry.code;
      parsedDigits = cellNum.substring(parsedCode.length).trim();
      setSelectedEditCountry({
        code: matchedCountry.code,
        name: matchedCountry.name,
        flag: matchedCountry.flag,
        placeholder: matchedCountry.placeholder
      });
    } else {
      setSelectedEditCountry({ code: '+263', name: 'Zimbabwe', flag: '🇿🇼', placeholder: '77112233' });
    }
    setEditOwnerCell(parsedDigits);
    setEditWsPassword(owner.password || '');
    setEditSuccessMsg('');
  };

  const handleSaveWorkspaceDetails = async () => {
    if (!selectedWorkspace) return;

    // Find Owner Profile
    const owner = (users || []).find(u => u.workspaceId === selectedWorkspace.id && (u.role === 'WorkspaceMaster' || u.role === 'Admin'));
    if (!owner) {
      alert("No workspace master owner user found for this workspace.");
      return;
    }

    if (editWsPassword.trim() && editWsPassword !== owner.password) {
      const pwdVerdict = validatePasswordPolicy(editWsPassword.trim());
      if (!pwdVerdict.isValid) {
        alert(pwdVerdict.error || "Password must be at least 5 characters long and contain at least one number and one special character.");
        return;
      }
    }

    try {
      const fullCellNumber = selectedEditCountry.code + ' ' + editOwnerCell.trim();
      const res = await updateWorkspaceDetails(
        selectedWorkspace.id,
        editWsName.trim(),
        owner.uid,
        editOwnerName.trim(),
        editOwnerEmail.trim(),
        fullCellNumber,
        editWsPassword.trim() !== owner.password ? editWsPassword.trim() : undefined,
        editWsTier,
        editWsIsActive,
        editWsExpiresAt || undefined
      );

      if (res && !res.success) {
        alert(res.error || 'Failed to save workspace details.');
        return;
      }

      // Success triggered only after the promise successfully resolves
      showToast('Workspace plan and details saved successfully!', 'success');
      setEditSuccessMsg('');
      setSelectedWorkspace(null);
    } catch (err: any) {
      console.error(err);
      alert(err?.message || 'An unexpected error occurred while saving details.');
    }
  };

  const handleResetWorkspacePassword = async () => {
    if (!selectedWorkspace) return;
    const owner = (users || []).find(u => u.workspaceId === selectedWorkspace.id && (u.role === 'WorkspaceMaster' || u.role === 'Admin'));
    if (!owner) {
      alert("No workspace master owner user found for this workspace.");
      return;
    }

    try {
      const res = await resetWorkspaceMasterPassword(selectedWorkspace.id, owner.uid);
      if (res && !res.success) {
        alert(res.error || 'Failed to reset password.');
        return;
      }
      
      const randomPass = res.tempPassword || '';
      setEditWsPassword(randomPass);
      setEditSuccessMsg(`Password successfully reset to: ${randomPass}`);
    } catch (err: any) {
      console.error(err);
      alert(err?.message || 'An unexpected error occurred while resetting password.');
    }
  };

  const handleToggleWorkspaceSuspension = async (workspaceId: string, currentStatus: boolean) => {
    try {
      const res = await toggleWorkspaceSuspension(workspaceId, !currentStatus);
      if (res && !res.success) {
        alert(res.error || 'Failed to update suspension status.');
      }
    } catch (err: any) {
      console.error(err);
      alert(err?.message || 'An unexpected error occurred.');
    }
  };

  if (loading) {
    return <AppOwnerSkeleton theme={theme} />;
  }

  try {
    const isUnlocked = isAppOwnerUnlocked === true;
    console.log("DEBUG Render: AppOwnerDashboard - isUnlocked =", isUnlocked, "isAppOwnerUnlocked =", isAppOwnerUnlocked, "theme =", theme);
    if (!isUnlocked) {
      return (
        <div className="flex-grow flex items-center justify-center min-h-[70vh] px-4 py-12">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className={`w-full max-w-md border rounded-3xl p-8 shadow-2xl relative overflow-hidden transition-all duration-300 ${
              theme === 'light'
                ? 'bg-white border-slate-200 text-slate-900 shadow-sm'
                : 'bg-slate-900 border-slate-800 text-white shadow-xl'
            }`}
          >
            {/* Subtle Glow Ring */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-red-500/10 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

            <div className="flex flex-col items-center text-center space-y-6">
              <div className={`p-4 rounded-2xl border ${
                theme === 'light'
                  ? 'bg-red-50 border-red-100 text-red-600'
                  : 'bg-red-500/10 border-red-500/20 text-red-400 animate-pulse'
              }`}>
                <Shield className="w-10 h-10" />
              </div>

              <div className="space-y-2">
                <span className={`text-[10px] font-mono uppercase tracking-widest px-2.5 py-1 rounded-full font-bold ${
                  theme === 'light'
                    ? 'bg-red-50 text-red-600'
                    : 'bg-red-500/10 text-red-400'
                }`}>
                  SYSTEM GATEWAY RESTRICTED
                </span>
                <h1 className="text-2xl font-black font-display tracking-tight">App Owner Authenticator</h1>
                <p className={`text-xs ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
                  Enter the master control passcode to open the SaaS Workspace terminal.
                </p>
              </div>

              <form onSubmit={handleGatewayUnlock} className="w-full space-y-4 pt-2">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Key className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    value={gatewayPasscode}
                    onChange={(e) => {
                      setGatewayPasscode(e.target.value);
                      setGatewayError('');
                    }}
                    placeholder="Master Passcode"
                    required
                    className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm text-center font-mono tracking-widest focus:outline-none transition-all ${
                      theme === 'light'
                        ? 'bg-slate-50 border-slate-200 text-slate-950 focus:border-red-500 focus:ring-1 focus:ring-red-500/50'
                        : 'bg-slate-950 border-slate-800 text-white focus:border-red-500 focus:ring-1 focus:ring-red-500/50'
                    }`}
                  />
                </div>

                {gatewayError && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3.5 bg-red-950/20 border border-red-500/20 rounded-xl text-xs flex items-center gap-2.5 font-mono text-red-400"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="text-left leading-snug">{gatewayError}</span>
                  </motion.div>
                )}

                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-red-600 to-orange-600 text-white py-3 rounded-xl text-xs font-bold uppercase tracking-wider hover:opacity-95 transition-all shadow-lg shadow-red-600/10 cursor-pointer"
                >
                  Verify & Open Gateway
                </button>
              </form>

              <div className="text-[10px] font-mono text-slate-500 pt-2 flex flex-col gap-0.5">
                <span>SECURITY LOG RECORDED VIA PORT 3000</span>
                <span>VakZim ICT&E 2026</span>
              </div>
            </div>
          </motion.div>
        </div>
      );
    }

    return (
      <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 w-full max-w-full overflow-x-hidden">
      {/* SaaS Welcome Banner */}
      <div className={`border rounded-3xl p-5 sm:p-6 md:p-8 relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-6 transition-all duration-300 w-full max-w-full ${
        theme === 'light'
          ? 'bg-white border-slate-200 text-slate-900 shadow-sm'
          : 'bg-slate-900 border-slate-800 text-white shadow-xl'
      }`}>
        <div className="absolute top-0 right-0 w-96 h-96 bg-red-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="relative shrink-0 flex items-center justify-center">
            <div className="absolute inset-0 bg-red-500/15 rounded-2xl blur-lg scale-90 pointer-events-none" />
            <img
              src="/wivote_logo.png"
              alt="WiVoTe Logo"
              referrerPolicy="no-referrer"
              className="w-14 h-14 sm:w-16 sm:h-16 object-contain drop-shadow-xl rounded-2xl relative z-10"
            />
          </div>
          <div>
            <span className={`border text-[10px] font-mono uppercase px-2.5 py-1 rounded-full font-bold ${
              theme === 'light'
                ? 'bg-red-50 border-red-100 text-red-600'
                : 'bg-red-500/10 border-red-500/20 text-red-400'
            }`}>
              Master Console Active
            </span>
            <h1 className={`text-2xl sm:text-3xl font-extrabold font-display mt-2 break-words ${
              theme === 'light' ? 'text-slate-950' : 'text-white'
            }`}>
              WiVoTe SaaS Operations
            </h1>
            <p className={`text-sm mt-1 max-w-2xl ${
              theme === 'light' ? 'text-slate-500' : 'text-slate-400'
            }`}>
              Provision workspaces, configure pricing tiers, oversee active leases, and enforce trials.
            </p>
            <div className="flex flex-wrap items-center gap-3.5 mt-3">
              <div className={`px-2.5 py-1 rounded-xl border text-[11px] font-mono font-bold flex items-center gap-1.5 shadow-sm ${
                theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-slate-950 border-slate-800 text-slate-300'
              }`}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>SaaS Live Sync Connected</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <button
            type="button"
            onClick={() => forcePushLocalToGlobalDB?.()}
            className="px-3.5 py-2.5 rounded-xl text-xs font-bold font-mono bg-emerald-600 hover:bg-emerald-700 text-white transition cursor-pointer shadow-md flex items-center gap-2"
            title="Push all locally stored sales, customer names, & devices on this device to the central global database"
          >
            <CloudUpload className="w-4 h-4" />
            <span>Push Local Data to Global DB</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveDashboardTab('cleanup')}
            className={`font-mono text-xs px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl flex items-center justify-center gap-2 transition cursor-pointer w-full sm:w-auto ${
              activeDashboardTab === 'cleanup'
                ? 'bg-rose-600 text-white shadow-md'
                : theme === 'light'
                  ? 'bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100'
                  : 'bg-rose-950/20 border border-rose-900/50 text-rose-400 hover:bg-rose-950/40'
            }`}
          >
            <UserX className="w-3.5 h-3.5" />
            Cleanup Orphan Accounts
          </button>

          <button
            type="button"
            onClick={() => {
              setConfirmWord('');
              setResetError('');
              setShowResetModal(true);
            }}
            className={`font-mono text-xs px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl flex items-center justify-center gap-2 transition cursor-pointer w-full sm:w-auto ${
              theme === 'light'
                ? 'bg-red-50 border border-red-200 text-red-600 hover:bg-red-100'
                : 'bg-red-950/20 border border-red-900/50 text-red-400 hover:bg-red-950/40'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Factory Reset App DB
          </button>
        </div>
      </div>

      {/* Chrome Tab System with App Theme Background & Continuous Accent Line */}
      <TabStripContainer
        theme={theme}
        activeTabLineGradient={
          activeDashboardTab === 'workspaces'
            ? 'bg-sky-500'
            : activeDashboardTab === 'audit'
            ? 'bg-emerald-600'
            : activeDashboardTab === 'cleanup'
            ? 'bg-rose-600'
            : activeDashboardTab === 'recycle_bin'
            ? 'bg-violet-600'
            : 'bg-amber-500'
        }
      >
        {[
          {
            id: 'workspaces' as const,
            label: 'Workspaces & Operations',
            icon: Building,
            count: safeWorkspaces.length,
            activeLine: 'bg-sky-500',
            startTextColor: 'text-sky-500',
            endTextColor: 'text-sky-500',
          },
          {
            id: 'audit' as const,
            label: 'Access Audit Trail',
            icon: ShieldCheck,
            count: auditLogs?.length || 0,
            activeLine: 'bg-emerald-600',
            startTextColor: 'text-emerald-600',
            endTextColor: 'text-emerald-600',
          },
          {
            id: 'cleanup' as const,
            label: 'Auth & Orphan Cleanup',
            icon: UserX,
            activeLine: 'bg-rose-600',
            startTextColor: 'text-rose-600',
            endTextColor: 'text-rose-600',
          },
          {
            id: 'recycle_bin' as const,
            label: 'System Recycle Bin & DB Vault',
            icon: Trash2,
            count: recycleBin?.length || 0,
            activeLine: 'bg-violet-600',
            startTextColor: 'text-violet-600',
            endTextColor: 'text-violet-600',
          },
          {
            id: 'backups' as const,
            label: 'Continuous DB Backups',
            icon: Database,
            activeLine: 'bg-amber-500',
            startTextColor: 'text-amber-500',
            endTextColor: 'text-amber-500',
          }
        ].map((tab, idx, arr) => {
          const Icon = tab.icon;
          const isActive = activeDashboardTab === tab.id;
          const isFirst = idx === 0;
          return (
            <button
              key={tab.id}
              id={`tab-appowner-${tab.id}-btn`}
              type="button"
              onClick={() => setActiveDashboardTab(tab.id)}
              className={`group relative min-h-[44px] sm:h-11 px-2.5 sm:px-5 py-1.5 sm:py-0 flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 rounded-t-xl sm:rounded-t-2xl font-display text-[10px] sm:text-xs md:text-sm font-black uppercase tracking-wider shrink-0 transition-all select-none cursor-pointer ${
                isActive
                  ? `bg-gradient-to-r ${tab.activeLine} text-white shadow-xl z-20 -mb-[3px] border-0 outline-none ring-0`
                  : theme === 'light'
                    ? `bg-slate-200/90 hover:bg-slate-300 text-slate-800 border-t border-r ${isFirst ? 'border-l' : ''} border-slate-300/90 shadow-xs`
                    : `bg-slate-900/90 hover:bg-slate-800 text-slate-200 border-t border-r ${isFirst ? 'border-l' : ''} border-slate-700/90 shadow-xs`
              }`}
            >
              {/* Outward Curving Bottom Left Wing for Active Tab */}
              {isActive && (
                <svg className={`absolute -left-3.5 sm:-left-4.5 -bottom-[3px] w-3.5 h-3.5 sm:w-4.5 sm:h-4.5 ${tab.startTextColor} fill-current pointer-events-none z-30`} viewBox="0 0 20 20">
                  <path d="M 20 0 C 20 11.05 11.05 20 0 20 L 20 20 Z" />
                </svg>
              )}

              {/* Outward Curving Bottom Right Wing for Active Tab */}
              {isActive && (
                <svg className={`absolute -right-3.5 sm:-right-4.5 -bottom-[3px] w-3.5 h-3.5 sm:w-4.5 sm:h-4.5 ${tab.endTextColor} fill-current pointer-events-none z-30`} viewBox="0 0 20 20">
                  <path d="M 0 0 C 0 11.05 8.95 20 20 20 L 0 20 Z" />
                </svg>
              )}

              <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 transition-colors ${
                isActive ? 'text-white drop-shadow-xs' : theme === 'light' ? 'text-slate-700' : 'text-slate-400 group-hover:text-white'
              }`} />

              <span className={`whitespace-normal sm:whitespace-nowrap text-center sm:text-left leading-tight max-w-[110px] sm:max-w-none line-clamp-2 sm:line-clamp-none ${
                isActive ? 'text-white font-black drop-shadow-xs' : theme === 'light' ? 'text-slate-800 font-bold' : 'text-slate-300 font-bold group-hover:text-white'
              }`}>
                {tab.label}
              </span>

              {typeof tab.count === 'number' && (
                <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-mono font-black shrink-0 ${
                  isActive
                    ? 'bg-white/30 text-white border border-white/40 shadow-xs'
                    : theme === 'light'
                      ? 'bg-slate-300 text-slate-800'
                      : 'bg-slate-800 text-slate-300'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </TabStripContainer>

      {activeDashboardTab === 'workspaces' ? (
        <>
          {/* Threshold-Based Revenue Drop Notification Banner */}
          <RevenueDropAlertBanner allVouchers={vouchers || []} />

          {/* 30-Day Daily Voucher Sales Revenue Widget */}
          <DailyVoucherRevenueWidget />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Create Workspace */}
        <div className={`border rounded-3xl p-6 shadow-xl h-fit transition-all duration-300 ${
          theme === 'light'
            ? 'bg-white border-slate-200 text-slate-900 shadow-sm'
            : 'bg-slate-900 border-slate-800 text-white shadow-xl'
        }`}>
          <div className="flex items-center gap-3 mb-6">
            <div className={`p-2.5 rounded-xl border ${
              theme === 'light'
                ? 'bg-sky-50 border-sky-100 text-sky-600'
                : 'bg-sky-500/10 border-sky-500/20 text-sky-400'
            }`}>
              <Plus className="w-5 h-5" />
            </div>
            <h2 className={`text-lg font-bold font-display ${
              theme === 'light' ? 'text-slate-950' : 'text-white'
            }`}>Create New Workspace</h2>
          </div>

          <form onSubmit={handleCreateWorkspace} className="space-y-4">
            <div>
              <label className={`block text-xs font-mono mb-1 ${
                theme === 'light' ? 'text-slate-500' : 'text-slate-400'
              }`}>Company/Workspace Name</label>
              <input
                type="text"
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                placeholder="e.g. Copperbelt Wifi Ltd"
                required
                className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none ${
                  theme === 'light'
                    ? 'bg-slate-50 border-slate-200 text-slate-950 focus:border-sky-500'
                    : 'bg-slate-950 border-slate-800 text-white focus:border-sky-500'
                }`}
              />
            </div>

            <div>
              <label className={`block text-xs font-mono mb-1 ${
                theme === 'light' ? 'text-slate-500' : 'text-slate-400'
              }`}>Workspace Owner Email</label>
              <input
                type="email"
                value={newOwnerEmail}
                onChange={(e) => setNewOwnerEmail(e.target.value)}
                placeholder="e.g. owner@example.com"
                required
                className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none font-mono ${
                  theme === 'light'
                    ? 'bg-slate-50 border-slate-200 text-slate-950 focus:border-sky-500'
                    : 'bg-slate-950 border-slate-800 text-white focus:border-sky-500'
                }`}
              />
            </div>

            <div>
              <CountryPhoneInput
                id="appowner-create-owner-cell"
                label="Owner Cell Phone (Optional)"
                value={newOwnerCell}
                countryCode={selectedNewCountry.code}
                onChange={(fullNumber, nationalNumber, country) => {
                  setNewOwnerCell(nationalNumber || '');
                  if (country) {
                    setSelectedNewCountry({
                      code: country.code,
                      name: country.name,
                      flag: country.flag,
                      placeholder: country.placeholder
                    });
                  }
                }}
                theme={theme}
              />
            </div>

            <div>
              <label className={`block text-xs font-mono mb-1 flex justify-between items-center ${
                theme === 'light' ? 'text-slate-500' : 'text-slate-400'
              }`}>
                <span>Auto-Generated Password</span>
                <button
                  type="button"
                  onClick={() => setAutoPassword(generateRandomPassword())}
                  className="text-[10px] text-sky-500 hover:underline flex items-center gap-1 font-semibold"
                >
                  <RefreshCw className="w-3 h-3 animate-spin-slow" /> Regenerate
                </button>
              </label>
              <input
                type="text"
                value={autoPassword}
                onChange={(e) => setAutoPassword(e.target.value)}
                placeholder="Secure Password"
                required
                className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none font-mono ${
                  theme === 'light'
                    ? 'bg-slate-50 border-slate-200 text-slate-950 focus:border-sky-500'
                    : 'bg-slate-950 border-slate-800 text-white focus:border-sky-500'
                }`}
              />
              <p className="text-[9px] text-amber-500 font-mono mt-1">
                * Min 6 characters, 1 uppercase, 1 special char, 1 number.
              </p>
            </div>

            {/* Subscription Tier (Compact Sliding Selector) */}
            <SubscriptionSliderSelector
              selectedTier={newWorkspaceTier}
              onChange={(tier) => setNewWorkspaceTier(tier)}
              packages={safePricingPackages}
              theme={theme}
              label="Subscription Tier"
              id="appowner-create-ws-slider"
            />

            <div>
              <label className={`block text-xs font-mono mb-1 ${
                theme === 'light' ? 'text-slate-500' : 'text-slate-400'
              }`}>Lease Duration (Months)</label>
              <select
                value={newWorkspaceMonths}
                onChange={(e) => setNewWorkspaceMonths(parseInt(e.target.value) || 1)}
                className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none ${
                  theme === 'light'
                    ? 'bg-slate-50 border-slate-200 text-slate-950 focus:border-sky-500'
                    : 'bg-slate-950 border-slate-800 text-white focus:border-sky-500'
                }`}
              >
                {[1, 2, 3, 4, 5, 6, 12, 24].map((m) => (
                  <option key={m} value={m}>
                    {m} {m === 1 ? 'Month' : 'Months'} Active
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-500 font-mono mt-1">
                Lease expiration date will be auto-calculated relative to this active duration.
              </p>
            </div>

            {createError && (
              <div className={`p-3 border rounded-xl text-xs flex items-center gap-2 ${
                theme === 'light'
                  ? 'bg-red-50 border-red-100 text-red-700'
                  : 'bg-red-950/40 border-red-500/30 text-red-400'
              }`}>
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            {createSuccess && (
              <div className={`p-3 border rounded-xl text-xs flex flex-col gap-1.5 ${
                theme === 'light'
                  ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                  : 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400'
              }`}>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span className="font-bold">Workspace & Workspace Master created!</span>
                </div>
                {provisionalPassword && (
                  <div className="p-2 bg-black/10 rounded-lg mt-1 font-mono text-[11px] border border-emerald-500/10">
                    Provisional Password: <span className="font-extrabold select-all tracking-wider text-rose-500">{provisionalPassword}</span>
                    <span className="block text-[9px] text-slate-400 mt-1">* Mandatory 1st login reset flag requirePasswordChange is active.</span>
                  </div>
                )}
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-sky-500 to-indigo-500 text-white py-3 rounded-xl text-xs font-semibold hover:opacity-90 transition shadow-lg shadow-sky-500/10 cursor-pointer"
            >
              Provision Workspace
            </button>
          </form>
        </div>

        {/* Right Column: Manage Workspaces */}
        <div className={`border rounded-3xl p-4 sm:p-6 shadow-xl lg:col-span-2 transition-all duration-300 ${
          theme === 'light'
            ? 'bg-white border-slate-200 text-slate-900 shadow-sm'
            : 'bg-slate-900 border-slate-800 text-white shadow-xl'
        }`}>
          {/* Header & Status Counters */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl border shrink-0 ${
                theme === 'light'
                  ? 'bg-indigo-50 border-indigo-100 text-indigo-600'
                  : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
              }`}>
                <Landmark className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className={`text-lg font-bold font-display ${
                    theme === 'light' ? 'text-slate-950' : 'text-white'
                  }`}>Active SaaS Workspaces</h2>
                  <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-mono font-bold border ${
                    theme === 'light'
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                      : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                  }`}>
                    {safeWorkspaces.length}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Oversee live tenant instances, update subscriptions, manage master logins, and export data.
                </p>
              </div>
            </div>

            {/* Quick Filters */}
            <div className="flex items-center gap-1.5 self-start sm:self-auto flex-wrap">
              <button
                type="button"
                onClick={() => setStatusFilter('All')}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition cursor-pointer border ${
                  statusFilter === 'All'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : theme === 'light'
                    ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('Active')}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition cursor-pointer border ${
                  statusFilter === 'Active'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : theme === 'light'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                    : 'bg-emerald-950/30 border-emerald-900/50 text-emerald-400 hover:bg-emerald-950/60'
                }`}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('Suspended')}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition cursor-pointer border ${
                  statusFilter === 'Suspended'
                    ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                    : theme === 'light'
                    ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                    : 'bg-rose-950/30 border-rose-900/50 text-rose-400 hover:bg-rose-950/60'
                }`}
              >
                Suspended
              </button>
            </div>
          </div>

          {/* Search and Tier Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3 mb-5">
            <div className="relative flex-grow">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
              <input
                type="text"
                value={workspaceSearch}
                onChange={(e) => setWorkspaceSearch(e.target.value)}
                placeholder="Search workspaces by name, ID, or owner email..."
                className={`w-full pl-9 pr-8 py-2.5 rounded-xl border text-xs focus:outline-none transition ${
                  theme === 'light'
                    ? 'bg-slate-50 border-slate-200 text-slate-900 focus:border-indigo-500 focus:bg-white'
                    : 'bg-slate-950 border-slate-800 text-white focus:border-indigo-500 focus:bg-slate-900'
                }`}
              />
              {workspaceSearch && (
                <button
                  type="button"
                  onClick={() => setWorkspaceSearch('')}
                  className="absolute right-2.5 top-2.5 p-0.5 text-slate-400 hover:text-slate-200 rounded-full"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <select
                value={tierFilter}
                onChange={(e) => setTierFilter(e.target.value as any)}
                className={`px-3 py-2.5 rounded-xl border text-xs font-mono focus:outline-none cursor-pointer w-full sm:w-auto ${
                  theme === 'light'
                    ? 'bg-slate-50 border-slate-200 text-slate-800'
                    : 'bg-slate-950 border-slate-800 text-slate-300'
                }`}
              >
                <option value="All">All Plans</option>
                <option value="Starter">Starter Plan</option>
                <option value="Gold">Gold Plan</option>
                <option value="Lithium">Lithium Plan</option>
              </select>
            </div>
          </div>

          {filteredWorkspaces.length === 0 ? (
            <div className={`p-8 rounded-2xl border text-center my-4 ${
              theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-500' : 'bg-slate-950/50 border-slate-800 text-slate-400'
            }`}>
              <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-400 opacity-60" />
              <div className="text-sm font-bold text-slate-300">No workspaces matched the filter</div>
              <p className="text-xs text-slate-500 mt-1">Try adjusting your search keywords or tier filter selection.</p>
              {(workspaceSearch || tierFilter !== 'All' || statusFilter !== 'All') && (
                <button
                  type="button"
                  onClick={() => {
                    setWorkspaceSearch('');
                    setTierFilter('All');
                    setStatusFilter('All');
                  }}
                  className="mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500 hover:text-white transition cursor-pointer border border-indigo-500/20"
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
            <>
              {/* MOBILE VIEW: Dedicated Cards Layout (< md breakpoint) */}
              <div className="block md:hidden space-y-4">
                {filteredWorkspaces.map((ws) => {
                  const owner = (users || []).find(u => u.workspaceId === ws.id && (u.role === 'WorkspaceMaster' || u.role === 'Admin'));
                  return (
                    <div
                      key={ws.id}
                      className={`p-4 rounded-2xl border transition-all duration-200 ease-out hover:scale-[1.012] ${
                        theme === 'light'
                          ? 'bg-slate-50/70 border-slate-200 hover:border-indigo-300 hover:shadow-md hover:bg-slate-50'
                          : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 hover:shadow-lg hover:bg-slate-950/90'
                      }`}
                    >
                      {/* Top Bar: Name, Tier Badge & Active Status */}
                      <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-800/10">
                        <div className="min-w-0 flex-1">
                          <h3 className={`font-bold text-base truncate font-display ${
                            theme === 'light' ? 'text-slate-900' : 'text-white'
                          }`}>
                            {ws.name}
                          </h3>
                          <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                            <span>ID:</span>
                            <span className="truncate select-all text-sky-400 font-semibold">{ws.id}</span>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold font-mono uppercase border ${
                            ws.subscriptionTier === 'Lithium' 
                              ? 'bg-purple-500/15 text-purple-400 border-purple-500/30'
                              : ws.subscriptionTier === 'Gold'
                              ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                              : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                          }`}>
                            {ws.subscriptionTier}
                          </span>
                          {ws.isActive ? (
                            <span className="inline-flex items-center gap-1 text-emerald-400 text-[10px] font-bold font-mono">
                              <CheckCircle2 className="w-3 h-3" /> ACTIVE
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-rose-400 text-[10px] font-bold font-mono">
                              <XCircle className="w-3 h-3" /> SUSPENDED
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Lease Expiration */}
                      {ws.expiresAt && (
                        <div className="text-[11px] text-indigo-400 font-mono font-semibold py-2 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          <span>Lease Expiry: {new Date(ws.expiresAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                        </div>
                      )}

                      {/* Owner Information Box */}
                      {owner && (
                        <div className={`p-3 rounded-xl text-xs space-y-1.5 border my-2.5 ${
                          theme === 'light'
                            ? 'bg-white border-slate-200 text-slate-700'
                            : 'bg-slate-900/90 border-slate-800 text-slate-300'
                        }`}>
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="text-slate-400 font-mono">Owner Name:</span>
                            <span className="font-semibold text-slate-200">{owner.name || 'Owner'}</span>
                          </div>
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="text-slate-400 font-mono">Owner Email:</span>
                            <span className="font-mono text-slate-300 select-all">{owner.email}</span>
                          </div>
                          {owner.initialPassword && (
                            <div className="flex justify-between items-center pt-1 border-t border-slate-800/40 text-[11px]">
                              <span className="text-amber-400 font-mono uppercase font-bold text-[10px]">Temp Pass:</span>
                              <span className="font-mono font-bold select-all text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                {owner.initialPassword}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Mobile Controls & Quick Action Dropdowns */}
                      <div className="grid grid-cols-2 gap-2 pt-1 pb-2.5">
                        {/* Plan Selector */}
                        <div>
                          <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">
                            Change Plan
                          </label>
                          <select
                            value={ws.subscriptionTier}
                            onChange={(e) => updateWorkspaceSubscription(ws.id, e.target.value as SubscriptionTier, ws.isActive, ws.expiresAt)}
                            className={`w-full border rounded-xl px-2.5 py-2 text-xs font-mono focus:outline-none cursor-pointer ${
                              theme === 'light'
                                ? 'bg-white border-slate-200 text-slate-800'
                                : 'bg-slate-900 border-slate-800 text-slate-200'
                            }`}
                          >
                            <option value="Starter">Starter Plan</option>
                            <option value="Gold">Gold Plan</option>
                            <option value="Lithium">Lithium Plan</option>
                          </select>
                        </div>

                        {/* Lease Term Extender */}
                        <div>
                          <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">
                            Extend Lease
                          </label>
                          <select
                            value=""
                            onChange={(e) => {
                              const val = e.target.value;
                              if (!val) return;
                              let months = 1;
                              if (val === 'custom') {
                                const customPrompt = prompt('Enter custom number of months for the lease duration (from today):', '6');
                                const parsed = parseInt(customPrompt || '');
                                if (parsed && !isNaN(parsed)) {
                                  months = parsed;
                                } else {
                                  return;
                                }
                              } else {
                                months = parseInt(val) || 1;
                              }
                              const newExpiry = new Date();
                              newExpiry.setMonth(newExpiry.getMonth() + months);
                              updateWorkspaceSubscription(ws.id, ws.subscriptionTier, ws.isActive, newExpiry.toISOString());
                            }}
                            className={`w-full border rounded-xl px-2.5 py-2 text-xs font-mono focus:outline-none cursor-pointer ${
                              theme === 'light'
                                ? 'bg-white border-slate-200 text-slate-800'
                                : 'bg-slate-900 border-slate-800 text-slate-200'
                            }`}
                          >
                            <option value="">Extend...</option>
                            <option value="1">+1 Month</option>
                            <option value="3">+3 Months</option>
                            <option value="6">+6 Months</option>
                            <option value="12">+12 Months</option>
                            <option value="24">+24 Months</option>
                            <option value="custom">Custom...</option>
                          </select>
                        </div>
                      </div>

                      {/* Mobile Action Buttons Bar */}
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/20">
                        <button
                          type="button"
                          onClick={() => handleToggleWorkspaceSuspension(ws.id, ws.isActive)}
                          className={`py-2.5 px-3 rounded-xl text-xs font-mono font-bold transition flex items-center justify-center gap-1.5 cursor-pointer border ${
                            ws.isActive 
                              ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/20'
                              : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20'
                          }`}
                        >
                          {ws.isActive ? (
                            <>
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Suspend</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Activate</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleWorkspaceSelect(ws)}
                          className={`py-2.5 px-3 rounded-xl text-xs font-mono font-bold transition flex items-center justify-center gap-1.5 cursor-pointer border ${
                            theme === 'light'
                              ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
                              : 'bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border-indigo-500/30'
                          }`}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Manage Details</span>
                        </button>
                      </div>

                      {/* Secondary Mobile Actions: Backup, Restore, Delete */}
                      <div className="flex items-center justify-between gap-2 pt-2 mt-2 border-t border-slate-800/10 text-xs">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleExportBackup(ws.id, ws.name)}
                            title="Export & Backup Workspace Database"
                            className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-indigo-400 hover:bg-indigo-500/10 transition flex items-center gap-1.5 border border-indigo-500/20 cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Backup</span>
                          </button>

                          <label
                            title="Restore Workspace Database File"
                            className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-sky-400 hover:bg-sky-500/10 transition flex items-center gap-1.5 border border-sky-500/20 cursor-pointer"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            <span>Restore</span>
                            <input
                              type="file"
                              accept=".json"
                              onChange={(e) => handleImportBackup(e, ws.id)}
                              className="hidden"
                            />
                          </label>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleOpenDeleteModal(ws)}
                          title="Delete Workspace (Archive & Purge Sub-collections)"
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-rose-400 hover:bg-rose-500/10 transition flex items-center gap-1.5 border border-rose-500/20 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* DESKTOP VIEW: High-Precision Table Layout (>= md breakpoint) */}
              <div className="hidden md:block overflow-x-auto no-scrollbar rounded-2xl border border-slate-800/40 w-full max-w-full">
                <table className="w-full text-left border-collapse table-auto">
                  <thead>
                    <tr className={`border-b text-xs font-mono uppercase tracking-wider font-semibold ${
                      theme === 'light' ? 'bg-slate-100/70 border-slate-200 text-slate-600' : 'bg-slate-950/80 border-slate-800 text-slate-400'
                    }`}>
                      <th className="py-3.5 px-4 whitespace-nowrap">Workspace Info</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">Subscription</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">State Gateway</th>
                      <th className="py-3.5 px-4 text-right whitespace-nowrap">Actions & Controls</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${
                    theme === 'light' ? 'divide-slate-100' : 'divide-slate-800/50'
                  }`}>
                    {filteredWorkspaces.map((ws) => (
                      <tr
                        key={ws.id}
                        onClick={() => handleWorkspaceSelect(ws)}
                        className={`transition-all duration-200 ease-out text-sm cursor-pointer group hover:scale-[1.008] origin-center ${
                          theme === 'light' 
                            ? 'hover:bg-slate-100/90 hover:shadow-xs text-slate-700' 
                            : 'hover:bg-slate-800/40 hover:shadow-xs text-slate-300'
                        }`}
                        title="Click to edit workspace details, reset/edit master password"
                      >
                        <td className="py-4 px-4 align-top">
                          <div className={`font-bold font-display ${theme === 'light' ? 'text-slate-950' : 'text-white'}`}>{ws.name}</div>
                          <div className="text-xs text-slate-500 font-mono mt-0.5">ID: {ws.id}</div>
                          
                          {/* Owner and Password Info */}
                          {(() => {
                            const owner = (users || []).find(u => u.workspaceId === ws.id && (u.role === 'WorkspaceMaster' || u.role === 'Admin'));
                            if (!owner) return null;
                            return (
                              <div className={`mt-2 p-2.5 rounded-xl text-[11px] space-y-1 border ${
                                theme === 'light'
                                  ? 'bg-slate-50 border-slate-200 text-slate-700'
                                  : 'bg-slate-900 border-slate-800 text-slate-300'
                              }`}>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-slate-400">Owner:</span>
                                  <span className="font-semibold text-slate-200">{owner.name || 'Owner'}</span>
                                </div>
                                <div className="flex items-center justify-between gap-2 font-mono text-[10px]">
                                  <span className="text-slate-400">Email:</span>
                                  <span className="select-all font-semibold text-slate-300">{owner.email}</span>
                                </div>
                                {owner.initialPassword && (
                                  <div className="flex items-center justify-between gap-1.5 text-amber-500 font-mono mt-1 pt-1 border-t border-slate-800/40 font-bold">
                                    <span className="px-1 py-0.2 bg-amber-500/10 border border-amber-500/20 rounded text-[9px] uppercase font-bold">Temp Pass:</span>
                                    <span className="select-all bg-amber-500/15 px-1.5 py-0.5 rounded text-amber-400 border border-amber-500/10 font-bold">{owner.initialPassword}</span>
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {ws.expiresAt && (
                            <div className="text-xs text-indigo-400 font-mono font-bold mt-2 flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                              <span>Lease Exp: {new Date(ws.expiresAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                            </div>
                          )}
                        </td>
                        
                        <td className="py-4 px-4 align-top">
                          <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold font-mono uppercase border inline-block ${
                            ws.subscriptionTier === 'Lithium' 
                              ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                              : ws.subscriptionTier === 'Gold'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                          }`}>
                            {ws.subscriptionTier}
                          </span>
                        </td>
                        
                        <td className="py-4 px-4 align-top">
                          {ws.isActive ? (
                            <span className="inline-flex items-center gap-1.5 text-emerald-400 text-xs font-bold font-mono">
                              <CheckCircle2 className="w-4 h-4 text-emerald-400" /> ACTIVE LEASE
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-rose-400 text-xs font-bold font-mono">
                              <XCircle className="w-4 h-4 text-rose-400" /> SUSPENDED
                            </span>
                          )}
                        </td>

                        <td className="py-4 px-4 text-right align-top" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-wrap justify-end items-center gap-2">
                            {/* Change Sub Toggle */}
                            <div className="flex flex-col items-start gap-0.5">
                              <span className="text-[9px] font-mono text-slate-400 uppercase">Plan</span>
                              <select
                                value={ws.subscriptionTier}
                                onChange={(e) => updateWorkspaceSubscription(ws.id, e.target.value as SubscriptionTier, ws.isActive, ws.expiresAt)}
                                className={`border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none cursor-pointer ${
                                  theme === 'light'
                                    ? 'bg-slate-50 border-slate-200 text-slate-800'
                                    : 'bg-slate-950 border-slate-800 text-slate-300'
                                }`}
                              >
                                <option value="Starter">Starter</option>
                                <option value="Gold">Gold</option>
                                <option value="Lithium">Lithium</option>
                              </select>
                            </div>

                            {/* Lease Duration Editor */}
                            <div className="flex flex-col items-start gap-0.5">
                              <span className="text-[9px] font-mono text-slate-400 uppercase">Lease Term</span>
                              <select
                                value=""
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (!val) return;
                                  
                                  let months = 1;
                                  if (val === 'custom') {
                                    const customPrompt = prompt('Enter custom number of months for the lease duration (from today):', '6');
                                    const parsed = parseInt(customPrompt || '');
                                    if (parsed && !isNaN(parsed)) {
                                      months = parsed;
                                    } else {
                                      return;
                                    }
                                  } else {
                                    months = parseInt(val) || 1;
                                  }

                                  const newExpiry = new Date();
                                  newExpiry.setMonth(newExpiry.getMonth() + months);
                                  updateWorkspaceSubscription(ws.id, ws.subscriptionTier, ws.isActive, newExpiry.toISOString());
                                }}
                                className={`border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none cursor-pointer ${
                                  theme === 'light'
                                    ? 'bg-slate-50 border-slate-200 text-slate-800'
                                    : 'bg-slate-950 border-slate-800 text-slate-300'
                                }`}
                              >
                                <option value="">Extend/Set...</option>
                                <option value="1">1 Month</option>
                                <option value="3">3 Months</option>
                                <option value="6">6 Months</option>
                                <option value="12">12 Months</option>
                                <option value="24">24 Months</option>
                                <option value="custom">Custom (Months)...</option>
                              </select>
                            </div>

                            {/* Toggle Active status */}
                            <div className="flex flex-col items-start gap-0.5 pt-3.5">
                              <button
                                onClick={() => handleToggleWorkspaceSuspension(ws.id, ws.isActive)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition cursor-pointer ${
                                  ws.isActive 
                                    ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20'
                                    : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20'
                                }`}
                              >
                                {ws.isActive ? 'Suspend' : 'Activate'}
                              </button>
                            </div>

                            {/* Edit Details */}
                            <div className="pt-3.5">
                              <button
                                type="button"
                                onClick={() => handleWorkspaceSelect(ws)}
                                title="Manage Workspace Details & Credentials"
                                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer border border-slate-700/40 flex items-center justify-center"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                            </div>

                            {/* Export Backup */}
                            <div className="pt-3.5">
                              <button
                                onClick={() => handleExportBackup(ws.id, ws.name)}
                                title="Export & Backup Workspace Database"
                                className="p-2 rounded-lg text-indigo-400 hover:text-white hover:bg-indigo-600 transition cursor-pointer border border-indigo-500/25 flex items-center justify-center"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            </div>

                            {/* Import Restore */}
                            <div className="pt-3.5">
                              <label
                                title="Restore Workspace Database File"
                                className="p-2 rounded-lg text-sky-400 hover:text-white hover:bg-sky-600 transition cursor-pointer border border-sky-500/25 flex items-center justify-center"
                              >
                                <Upload className="w-4 h-4" />
                                <input
                                  type="file"
                                  accept=".json"
                                  onChange={(e) => handleImportBackup(e, ws.id)}
                                  className="hidden"
                                />
                              </label>
                            </div>

                            {/* Delete Workspace */}
                            <div className="pt-3.5">
                              <button
                                type="button"
                                onClick={() => handleOpenDeleteModal(ws)}
                                title="Delete Workspace (Archive & Purge Sub-collections)"
                                className="p-2 rounded-lg text-rose-400 hover:text-white hover:bg-rose-600 transition cursor-pointer border border-rose-500/25 flex items-center justify-center"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* SaaS Subscription Pricing Panel - Ultra Compact & Modern */}
      <div className={`border rounded-2xl p-4 sm:p-5 mt-6 shadow-md transition-all duration-300 ${
        theme === 'light'
          ? 'bg-white border-slate-200 text-slate-900 shadow-sm'
          : 'bg-slate-900/95 border-slate-800 text-white shadow-lg'
      }`}>
        {/* Compact Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3.5 border-b border-slate-200/60 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-lg border ${
              theme === 'light'
                ? 'bg-amber-50 border-amber-200 text-amber-600'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
            }`}>
              <Settings className="w-4 h-4 animate-spin-slow" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className={`text-sm sm:text-base font-bold font-display ${
                  theme === 'light' ? 'text-slate-950' : 'text-white'
                }`}>SaaS Subscription Pricing Schema</h2>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border border-indigo-500/20">
                  Global Plans
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Configure global billing tiers, agent quotas, and specifications</p>
            </div>
          </div>

          {/* Compact View Switch & Active Indicator */}
          <div className="flex items-center gap-2 self-start md:self-auto">
            <button
              type="button"
              onClick={() => setPricingEditMode(prev => prev === 'sliding' ? 'grid' : 'sliding')}
              className={`px-2.5 py-1 rounded-lg border text-[11px] font-mono font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                theme === 'light'
                  ? 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                  : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
              title="Toggle Layout View"
            >
              <SlidersHorizontal className="w-3 h-3" />
              <span>{pricingEditMode === 'sliding' ? 'Grid View' : 'Sliding View'}</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleSavePricing} className="mt-3.5 space-y-3.5">
          {pricingEditMode === 'sliding' ? (
            <div className="space-y-3">
              {/* Compact Sliding Navigation Strip */}
              <div className={`p-1.5 sm:p-2 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-2 ${
                theme === 'light' ? 'bg-slate-50/80 border-slate-200' : 'bg-slate-950/60 border-slate-800/80'
              }`}>
                {/* Stepper Buttons & Sliding Pill Tabs */}
                <div className="flex items-center gap-1.5 w-full sm:w-auto">
                  <button
                    type="button"
                    disabled={pricingEditTier === 'Starter'}
                    onClick={() => {
                      const tiers: SubscriptionTier[] = ['Starter', 'Gold', 'Lithium'];
                      const idx = tiers.indexOf(pricingEditTier);
                      if (idx > 0) {
                        setPricingSlideDir(-1);
                        setPricingEditTier(tiers[idx - 1]);
                      }
                    }}
                    className={`p-1.5 rounded-lg border transition cursor-pointer ${
                      pricingEditTier === 'Starter'
                        ? 'opacity-25 cursor-not-allowed border-transparent'
                        : theme === 'light'
                        ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                    title="Previous tier"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>

                  <div className={`flex-1 sm:flex-initial flex items-center p-0.5 rounded-lg border ${
                    theme === 'light' ? 'bg-slate-200/50 border-slate-300/60' : 'bg-slate-900 border-slate-800'
                  }`}>
                    {(['Starter', 'Gold', 'Lithium'] as SubscriptionTier[]).map((tier, idx) => {
                      const isSelected = pricingEditTier === tier;
                      const currentPrice = editedPrices[tier] !== undefined ? editedPrices[tier] : (safePricingPackages.find(p => p.id === tier)?.price || 0);
                      return (
                        <button
                          key={tier}
                          type="button"
                          onClick={() => {
                            const tiers: SubscriptionTier[] = ['Starter', 'Gold', 'Lithium'];
                            const oldIdx = tiers.indexOf(pricingEditTier);
                            setPricingSlideDir(idx > oldIdx ? 1 : -1);
                            setPricingEditTier(tier);
                          }}
                          className={`relative px-2.5 sm:px-3 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                            isSelected
                              ? 'text-white'
                              : theme === 'light'
                              ? 'text-slate-600 hover:text-slate-950'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {isSelected && (
                            <motion.div
                              layoutId="pricing-edit-active-tab-compact"
                              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                              className={`absolute inset-0 rounded-md shadow-sm ${
                                tier === 'Starter'
                                  ? 'bg-gradient-to-r from-sky-500 to-sky-600'
                                  : tier === 'Gold'
                                  ? 'bg-gradient-to-r from-amber-500 to-amber-600'
                                  : 'bg-gradient-to-r from-purple-600 to-indigo-600'
                              }`}
                            />
                          )}
                          <span className="relative z-10 uppercase tracking-wider">{tier}</span>
                          <span className="relative z-10 text-[10px] font-mono font-medium opacity-90">${currentPrice}/mo</span>
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    disabled={pricingEditTier === 'Lithium'}
                    onClick={() => {
                      const tiers: SubscriptionTier[] = ['Starter', 'Gold', 'Lithium'];
                      const idx = tiers.indexOf(pricingEditTier);
                      if (idx < tiers.length - 1) {
                        setPricingSlideDir(1);
                        setPricingEditTier(tiers[idx + 1]);
                      }
                    }}
                    className={`p-1.5 rounded-lg border transition cursor-pointer ${
                      pricingEditTier === 'Lithium'
                        ? 'opacity-25 cursor-not-allowed border-transparent'
                        : theme === 'light'
                        ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                    title="Next tier"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1.5">
                  <span className={`px-2 py-0.5 rounded font-bold uppercase ${
                    pricingEditTier === 'Lithium'
                      ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                      : pricingEditTier === 'Gold'
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                  }`}>
                    Editing: {pricingEditTier} Plan
                  </span>
                </div>
              </div>

              {/* Active Sliding Plan Configuration Card - Ultra Compact */}
              <div className="overflow-hidden">
                <AnimatePresence mode="wait" initial={false}>
                  {(() => {
                    const pkg = safePricingPackages.find(p => p.id === pricingEditTier) || {
                      id: pricingEditTier,
                      name: pricingEditTier,
                      price: pricingEditTier === 'Lithium' ? 20 : pricingEditTier === 'Gold' ? 15 : 10,
                      desc: '',
                      maxAgents: pricingEditTier === 'Lithium' ? 15 : pricingEditTier === 'Gold' ? 7 : 3
                    };

                    const borderTheme = pkg.id === 'Lithium' 
                      ? 'border-purple-500/25 bg-purple-500/[0.03]' 
                      : pkg.id === 'Gold' 
                      ? 'border-amber-500/25 bg-amber-500/[0.03]' 
                      : 'border-sky-500/25 bg-sky-500/[0.03]';
                      
                    const labelTheme = pkg.id === 'Lithium' 
                      ? 'text-purple-400' 
                      : pkg.id === 'Gold' 
                      ? 'text-amber-400' 
                      : 'text-sky-400';

                    return (
                      <motion.div
                        key={pkg.id}
                        initial={{ opacity: 0, x: pricingSlideDir * 24 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: pricingSlideDir * -24 }}
                        transition={{ duration: 0.16, ease: 'easeOut' }}
                        className={`border rounded-xl p-3.5 sm:p-4 space-y-3 ${borderTheme}`}
                      >
                        <div className="flex justify-between items-center pb-2 border-b border-slate-200/50 dark:border-slate-800/80">
                          <span className={`text-[11px] font-bold font-mono uppercase ${labelTheme} flex items-center gap-1.5`}>
                            {pkg.id === 'Lithium' ? <Sparkles className="w-3.5 h-3.5" /> : pkg.id === 'Gold' ? <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> : <Shield className="w-3.5 h-3.5" />}
                            {pkg.id} Plan Parameters
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            Auto-syncs to onboarding & billing
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                          <div>
                            <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">Display Name</label>
                            <input
                              type="text"
                              value={editedNames[pkg.id] !== undefined ? editedNames[pkg.id] : pkg.name}
                              onChange={(e) => setEditedNames(prev => ({ ...prev, [pkg.id]: e.target.value }))}
                              placeholder={pkg.name}
                              required
                              className={`w-full border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none ${
                                theme === 'light'
                                  ? 'bg-white border-slate-200 text-slate-950 focus:border-indigo-500'
                                  : 'bg-slate-950/80 border-slate-800 text-white focus:border-indigo-500'
                              }`}
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">Monthly Cost ($ USD)</label>
                            <div className="relative">
                              <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400 text-xs font-mono">$</span>
                              <input
                                type="number"
                                min="0"
                                value={editedPrices[pkg.id] !== undefined ? editedPrices[pkg.id] : pkg.price}
                                onChange={(e) => setEditedPrices(prev => ({ ...prev, [pkg.id]: e.target.value }))}
                                placeholder={pkg.price.toString()}
                                required
                                className={`w-full border rounded-lg pl-6 pr-2.5 py-1.5 text-xs focus:outline-none font-mono ${
                                  theme === 'light'
                                    ? 'bg-white border-slate-200 text-slate-950 focus:border-indigo-500'
                                    : 'bg-slate-950/80 border-slate-800 text-white focus:border-indigo-500'
                                }`}
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">Max Agents Quota</label>
                            <input
                              type="number"
                              min="1"
                              value={editedMaxAgents[pkg.id] !== undefined ? editedMaxAgents[pkg.id] : (pkg.maxAgents || 3)}
                              onChange={(e) => setEditedMaxAgents(prev => ({ ...prev, [pkg.id]: e.target.value }))}
                              placeholder={pkg.maxAgents ? pkg.maxAgents.toString() : '3'}
                              required
                              className={`w-full border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none font-mono ${
                                theme === 'light'
                                  ? 'bg-white border-slate-200 text-slate-950 focus:border-indigo-500'
                                  : 'bg-slate-950/80 border-slate-800 text-white focus:border-indigo-500'
                              }`}
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">Description / Specs</label>
                            <input
                              type="text"
                              value={editedDescs[pkg.id] !== undefined ? editedDescs[pkg.id] : pkg.desc}
                              onChange={(e) => setEditedDescs(prev => ({ ...prev, [pkg.id]: e.target.value }))}
                              placeholder={pkg.desc}
                              required
                              className={`w-full border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none ${
                                theme === 'light'
                                  ? 'bg-white border-slate-200 text-slate-950 focus:border-indigo-500'
                                  : 'bg-slate-950/80 border-slate-800 text-white focus:border-indigo-500'
                              }`}
                            />
                          </div>
                        </div>
                      </motion.div>
                    );
                  })()}
                </AnimatePresence>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {safePricingPackages.map((pkg) => {
                const borderTheme = pkg.id === 'Lithium' 
                  ? 'border-purple-500/20 bg-purple-500/5' 
                  : pkg.id === 'Gold' 
                  ? 'border-amber-500/20 bg-amber-500/5' 
                  : 'border-sky-500/20 bg-sky-500/5';
                  
                const labelTheme = pkg.id === 'Lithium' 
                  ? 'text-purple-400' 
                  : pkg.id === 'Gold' 
                  ? 'text-amber-400' 
                  : 'text-sky-400';

                return (
                  <div key={pkg.id} className={`border rounded-xl p-3.5 space-y-3 ${borderTheme}`}>
                    <div className="flex justify-between items-center pb-2 border-b border-slate-800/10">
                      <span className={`text-[11px] font-bold font-mono uppercase ${labelTheme}`}>
                        {pkg.id} Tier Config
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold font-mono ${
                        pkg.id === 'Lithium' 
                          ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                          : pkg.id === 'Gold'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                      }`}>
                        GLOBAL PLAN
                      </span>
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">Display Name</label>
                      <input
                        type="text"
                        value={editedNames[pkg.id] !== undefined ? editedNames[pkg.id] : pkg.name}
                        onChange={(e) => setEditedNames(prev => ({ ...prev, [pkg.id]: e.target.value }))}
                        placeholder={pkg.name}
                        required
                        className={`w-full border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none ${
                          theme === 'light'
                            ? 'bg-white border-slate-200 text-slate-950 focus:border-indigo-500'
                            : 'bg-slate-950 border-slate-800 text-white focus:border-indigo-500'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">Monthly Cost ($ USD)</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400 text-xs font-mono">$</span>
                        <input
                          type="number"
                          min="0"
                          value={editedPrices[pkg.id] !== undefined ? editedPrices[pkg.id] : pkg.price}
                          onChange={(e) => setEditedPrices(prev => ({ ...prev, [pkg.id]: e.target.value }))}
                          placeholder={pkg.price.toString()}
                          required
                          className={`w-full border rounded-lg pl-6 pr-2.5 py-1.5 text-xs focus:outline-none font-mono ${
                            theme === 'light'
                              ? 'bg-white border-slate-200 text-slate-950 focus:border-indigo-500'
                              : 'bg-slate-950 border-slate-800 text-white focus:border-indigo-500'
                          }`}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">Max Agents Allowed</label>
                      <input
                        type="number"
                        min="1"
                        value={editedMaxAgents[pkg.id] !== undefined ? editedMaxAgents[pkg.id] : (pkg.maxAgents || 3)}
                        onChange={(e) => setEditedMaxAgents(prev => ({ ...prev, [pkg.id]: e.target.value }))}
                        placeholder={pkg.maxAgents ? pkg.maxAgents.toString() : '3'}
                        required
                        className={`w-full border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none font-mono ${
                          theme === 'light'
                            ? 'bg-white border-slate-200 text-slate-950 focus:border-indigo-500'
                            : 'bg-slate-950 border-slate-800 text-white focus:border-indigo-500'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">Description / Specs</label>
                      <input
                        type="text"
                        value={editedDescs[pkg.id] !== undefined ? editedDescs[pkg.id] : pkg.desc}
                        onChange={(e) => setEditedDescs(prev => ({ ...prev, [pkg.id]: e.target.value }))}
                        placeholder={pkg.desc}
                        required
                        className={`w-full border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none ${
                          theme === 'light'
                            ? 'bg-white border-slate-200 text-slate-950 focus:border-indigo-500'
                            : 'bg-slate-950 border-slate-800 text-white focus:border-indigo-500'
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Compact Footer Strip with Live Pricing Summary and Save Action */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-200/60 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-slate-400">
              <span className="font-semibold text-slate-500 dark:text-slate-400">Active Schema:</span>
              <span className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-500 dark:text-sky-400 font-bold border border-sky-500/20">
                Starter: ${editedPrices['Starter'] !== undefined ? editedPrices['Starter'] : (safePricingPackages.find(p => p.id === 'Starter')?.price || 10)}/mo
              </span>
              <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 dark:text-amber-400 font-bold border border-amber-500/20">
                Gold: ${editedPrices['Gold'] !== undefined ? editedPrices['Gold'] : (safePricingPackages.find(p => p.id === 'Gold')?.price || 15)}/mo
              </span>
              <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-500 dark:text-purple-400 font-bold border border-purple-500/20">
                Lithium: ${editedPrices['Lithium'] !== undefined ? editedPrices['Lithium'] : (safePricingPackages.find(p => p.id === 'Lithium')?.price || 20)}/mo
              </span>
            </div>

            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5">
              {savePricingSuccess && (
                <div className={`px-2.5 py-1.5 border rounded-lg text-[11px] flex items-center gap-1.5 ${
                  theme === 'light'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400'
                }`}>
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Schema updated!</span>
                </div>
              )}
              <button
                type="submit"
                className="w-full sm:w-auto bg-gradient-to-r from-indigo-500 to-sky-500 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:opacity-95 transition shadow-sm cursor-pointer text-center"
              >
                Save Pricing Schema
              </button>
            </div>
          </div>
        </form>
      </div>
      </>
      ) : activeDashboardTab === 'audit' ? (
        <AccessAuditView />
      ) : activeDashboardTab === 'cleanup' ? (
        <OrphanCleanupView />
      ) : activeDashboardTab === 'backups' ? (
        <AppOwnerBackupView />
      ) : (
        <RecycleBinManager isAppOwnerView={true} />
      )}

      {/* Critical DB Factory Reset Caution Modal */}
      <AnimatePresence>
        {showResetModal && (
          <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`w-full max-w-lg rounded-3xl border shadow-2xl p-6 relative overflow-hidden ${
                theme === 'light'
                  ? 'bg-white border-red-200 text-slate-900'
                  : 'bg-slate-900 border-red-950 text-white'
              }`}
            >
              <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-red-600 via-orange-500 to-red-600 animate-pulse" />
              
              <div className="flex items-start gap-4 mb-5">
                <div className="p-3 bg-red-500/10 text-red-500 rounded-2xl border border-red-500/20 shrink-0">
                  <Shield className="w-8 h-8 animate-bounce" />
                </div>
                <div>
                  <h3 className="text-lg font-black font-display uppercase tracking-wider text-red-500">
                    Critical System Factory Reset
                  </h3>
                  <p className={`text-xs mt-1 font-mono ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
                    RESTRICTED VAKZIM OPERATIONS DIRECTIVE
                  </p>
                </div>
              </div>

              <div className={`p-4 rounded-2xl mb-5 text-xs space-y-2.5 border leading-relaxed ${
                theme === 'light'
                  ? 'bg-red-50/70 border-red-100 text-slate-700'
                  : 'bg-red-950/10 border-red-950/40 text-slate-300'
              }`}>
                <div className="font-bold text-red-500 uppercase tracking-wider flex items-center gap-1.5 mb-1">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  Irreversible Destruction of All Active Assets
                </div>
                <p>Executing this factory reset will permanently purge the following from the application database:</p>
                <ul className="list-disc list-inside space-y-1.5 pl-1.5 font-mono text-[11px] opacity-90">
                  <li>All SaaS tenant structures & active leases (workspaces)</li>
                  <li>All tenant master profiles, administrators, and agents</li>
                  <li>Entire voucher catalog (Green, Orange, and Red)</li>
                  <li>Sales ledger, cash drop logs, and historic archives</li>
                  <li>Enrolled legacy non-WiFi devices</li>
                </ul>
                <p className="font-bold text-red-500 mt-1">This action cannot be undone and will terminate all active terminal operations globally.</p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (confirmWord !== '26@Votewix') {
                    setResetError('Master password invalid. Authorization failed.');
                    return;
                  }
                  clearAllLocalData();
                  setShowResetModal(false);
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-xs font-mono mb-1 text-slate-400">
                    Type SaaS Authenticator Passcode to Confirm:
                  </label>
                  <input
                    type="password"
                    value={confirmWord}
                    onChange={(e) => {
                      setConfirmWord(e.target.value);
                      setResetError('');
                    }}
                    required
                    placeholder="26@Votewix"
                    className={`w-full border rounded-xl px-4 py-3 text-sm focus:outline-none font-mono tracking-widest ${
                      theme === 'light'
                        ? 'bg-slate-50 border-slate-200 text-slate-950 focus:border-red-500'
                        : 'bg-slate-950 border-slate-800 text-white focus:border-red-500'
                    }`}
                  />
                </div>

                {resetError && (
                  <div className="p-3 bg-red-950/40 border border-red-500/20 rounded-xl text-xs flex items-center gap-2 font-mono text-red-400">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{resetError}</span>
                  </div>
                )}

                <div className="flex gap-3 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setShowResetModal(false)}
                    className="bg-slate-800 text-slate-300 px-4 py-2 rounded-xl text-sm hover:bg-slate-700 transition cursor-pointer"
                  >
                    Abort Operation
                  </button>
                  <button
                    type="submit"
                    className="bg-gradient-to-r from-red-600 to-orange-600 text-white px-5 py-2 rounded-xl text-sm font-bold uppercase tracking-wider hover:opacity-90 transition cursor-pointer shadow-lg shadow-red-600/10"
                  >
                    Confirm Destructive Reset
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Workspace Detail, Edit, and Password Reset Modal */}
      <AnimatePresence>
        {selectedWorkspace && (
          <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`w-full max-w-xl rounded-3xl border shadow-2xl p-6 relative overflow-hidden ${
                theme === 'light'
                  ? 'bg-white border-slate-200 text-slate-900'
                  : 'bg-slate-900 border-slate-800 text-white'
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between border-b pb-4 mb-4 border-slate-800/10">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl border ${
                    theme === 'light'
                      ? 'bg-indigo-50 border-indigo-100 text-indigo-600'
                      : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                  }`}>
                    <Settings className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold font-display leading-tight">
                      Manage Workspace
                    </h3>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      ID: {selectedWorkspace.id}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedWorkspace(null)}
                  className={`p-1.5 rounded-lg border hover:opacity-85 cursor-pointer ${
                    theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                  }`}
                >
                  <XCircle className="w-5 h-5 text-slate-400 hover:text-slate-200" />
                </button>
              </div>

              {/* Success Message */}
              {editSuccessMsg && (
                <div className={`p-3 border rounded-xl text-xs flex items-center gap-2 mb-4 font-semibold font-mono ${
                  theme === 'light'
                    ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                    : 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400'
                }`}>
                  <CheckCircle2 className="w-4 h-4 shrink-0 animate-bounce" />
                  <span>{editSuccessMsg}</span>
                </div>
              )}

              {/* Details and Inputs */}
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                {/* 1. Subscription Plan Upgrade / Downgrade Controls (Compact Sliding Selector) */}
                <div className="space-y-3">
                  <SubscriptionSliderSelector
                    selectedTier={editWsTier}
                    onChange={(tier) => setEditWsTier(tier)}
                    packages={safePricingPackages}
                    theme={theme}
                    label="Subscription Plan Tier"
                    id="appowner-edit-ws-slider"
                  />

                  {/* Lease Expiry Extension and Active Status */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-white/5">
                    <div>
                      <label className="block text-[11px] font-mono mb-1 text-slate-400">
                        Lease Duration Extension
                      </label>
                      <select
                        value=""
                        onChange={(e) => {
                          const val = e.target.value;
                          if (!val) return;
                          let months = 1;
                          if (val === 'custom') {
                            const customPrompt = prompt('Enter custom number of months for the lease duration (from today):', '6');
                            const parsed = parseInt(customPrompt || '');
                            if (parsed && !isNaN(parsed)) {
                              months = parsed;
                            } else {
                              return;
                            }
                          } else {
                            months = parseInt(val) || 1;
                          }
                          const newExp = new Date();
                          newExp.setMonth(newExp.getMonth() + months);
                          setEditWsExpiresAt(newExp.toISOString());
                        }}
                        className={`w-full border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none cursor-pointer ${
                          theme === 'light'
                            ? 'bg-slate-50 border-slate-200 text-slate-900'
                            : 'bg-slate-950 border-slate-800 text-slate-200'
                        }`}
                      >
                        <option value="">
                          {editWsExpiresAt ? `Extend from today (Current: ${new Date(editWsExpiresAt).toLocaleDateString()})` : 'Set Lease Expiration...'}
                        </option>
                        <option value="1">+1 Month Active</option>
                        <option value="3">+3 Months Active</option>
                        <option value="6">+6 Months Active</option>
                        <option value="12">+12 Months (1 Year)</option>
                        <option value="24">+24 Months (2 Years)</option>
                        <option value="custom">Custom Months...</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-mono mb-1 text-slate-400">
                        Workspace Operating Status
                      </label>
                      <button
                        type="button"
                        onClick={() => setEditWsIsActive(prev => !prev)}
                        className={`w-full py-1.5 px-3 rounded-lg text-xs font-mono font-bold transition flex items-center justify-center gap-1.5 border cursor-pointer ${
                          editWsIsActive
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
                            : 'bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/25'
                        }`}
                      >
                        {editWsIsActive ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span>ACTIVE LEASE</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3.5 h-3.5 text-red-400" />
                            <span>SUSPENDED LEASE</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2. Workspace Name Editor */}
                <div>
                  <label className="block text-xs font-mono mb-1 text-slate-400">
                    Workspace Name
                  </label>
                  <input
                    type="text"
                    value={editWsName}
                    onChange={(e) => setEditWsName(e.target.value)}
                    className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none ${
                      theme === 'light'
                        ? 'bg-slate-50 border-slate-200 text-slate-950 focus:border-indigo-500'
                        : 'bg-slate-950 border-slate-800 text-white focus:border-indigo-500'
                    }`}
                  />
                </div>

                {/* 3. Workspace Master Profile Details */}
                <div className="p-3.5 border rounded-2xl border-white/5 space-y-3 bg-black/5">
                  <h4 className="text-xs font-bold font-mono text-indigo-400 uppercase tracking-wider">
                    Workspace Master Owner Account
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-mono mb-1 text-slate-400">
                        Owner Name
                      </label>
                      <input
                        type="text"
                        value={editOwnerName}
                        onChange={(e) => setEditOwnerName(e.target.value)}
                        className={`w-full border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none ${
                          theme === 'light'
                            ? 'bg-slate-50 border-slate-200 text-slate-950 focus:border-indigo-500'
                            : 'bg-slate-950 border-slate-800 text-white focus:border-indigo-500'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-mono mb-1 text-slate-400">
                        Owner Email
                      </label>
                      <input
                        type="email"
                        value={editOwnerEmail}
                        onChange={(e) => setEditOwnerEmail(e.target.value)}
                        className={`w-full border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none font-mono ${
                          theme === 'light'
                            ? 'bg-slate-50 border-slate-200 text-slate-950 focus:border-indigo-500'
                            : 'bg-slate-950 border-slate-800 text-white focus:border-indigo-500'
                        }`}
                      />
                    </div>

                    <div className="md:col-span-2">
                      <CountryPhoneInput
                        id="appowner-edit-owner-cell"
                        label="Owner Cell Number"
                        value={editOwnerCell}
                        countryCode={selectedEditCountry.code}
                        onChange={(fullNumber, nationalNumber, country) => {
                          setEditOwnerCell(nationalNumber || '');
                          if (country) {
                            setSelectedEditCountry({
                              code: country.code,
                              name: country.name,
                              flag: country.flag,
                              placeholder: country.placeholder
                            });
                          }
                        }}
                        theme={theme}
                      />
                    </div>
                  </div>
                </div>

                {/* 4. Edit/Reset Password Section */}
                <div className="p-3.5 border rounded-2xl border-white/5 space-y-3 bg-black/5">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold font-mono text-amber-400 uppercase tracking-wider">
                      Master Password Security
                    </h4>
                    <button
                      type="button"
                      onClick={handleResetWorkspacePassword}
                      className="text-[10px] text-amber-500 hover:underline flex items-center gap-1.5 font-bold uppercase font-mono"
                    >
                      <RefreshCw className="w-3 h-3" /> Reset to Temp Password
                    </button>
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono mb-1 text-slate-400">
                      Edit Password Manually (6 chars min)
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={editWsPassword}
                        onChange={(e) => setEditWsPassword(e.target.value)}
                        placeholder="Type new secure password"
                        className={`w-full border rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none font-mono ${
                          theme === 'light'
                            ? 'bg-slate-50 border-slate-200 text-slate-950 focus:border-indigo-500'
                            : 'bg-slate-950 border-slate-800 text-white focus:border-indigo-500'
                        }`}
                      />
                      <Key className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    </div>
                    <p className="text-[9px] text-amber-500 font-mono mt-1">
                      * Password must be at least 5 characters including a number and a special character. Modifying password enforces requirePasswordChange trigger on owner next login.
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800/10 mt-5">
                <button
                  type="button"
                  onClick={() => setSelectedWorkspace(null)}
                  className="bg-slate-800 text-slate-300 px-4 py-2 rounded-xl text-xs hover:bg-slate-700 transition cursor-pointer font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveWorkspaceDetails}
                  className="bg-gradient-to-r from-indigo-500 to-sky-500 text-white px-5 py-2 rounded-xl text-xs font-bold hover:opacity-90 transition cursor-pointer shadow-lg shadow-indigo-500/10"
                >
                  Save Workspace & Account Details
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Delete Workspace Confirmation Modal */}
        {workspaceToDelete && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`border rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl relative max-h-[90vh] overflow-y-auto ${
                theme === 'light' ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
              }`}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-rose-500/15 border border-rose-500/30 text-rose-500 rounded-2xl">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold font-display text-rose-500">
                    Delete Workspace & Purge Sub-collections
                  </h3>
                  <p className="text-xs text-slate-400">
                    Permanent Tenant Removal & Recursive Firestore Cleanup
                  </p>
                </div>
              </div>

              <div className="space-y-4 mb-6 text-xs">
                <div className={`p-4 rounded-2xl border ${
                  theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800/80'
                }`}>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-slate-400 font-mono">Workspace Name:</span>
                    <span className="font-bold text-slate-200">{workspaceToDelete.name}</span>
                  </div>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-slate-400 font-mono">Workspace ID:</span>
                    <span className="font-mono text-[11px] text-sky-400">{workspaceToDelete.id}</span>
                  </div>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-slate-400 font-mono">Plan Tier:</span>
                    <span className="font-semibold text-amber-400">{workspaceToDelete.subscriptionTier}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-mono">Owner Email:</span>
                    <span className="font-mono text-[11px] text-slate-300">{workspaceToDelete.ownerEmail || '—'}</span>
                  </div>
                </div>

                <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-300 space-y-1.5">
                  <div className="font-bold text-xs flex items-center gap-1.5 text-rose-400">
                    <AlertCircle className="w-4 h-4" />
                    <span>Recursive Cleanup Scope:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-300 pl-1">
                    <li>All <span className="text-amber-300 font-medium">Vouchers</span> (Sold, Assigned, & Available inventory)</li>
                    <li>All <span className="text-amber-300 font-medium">Agents, Admins & User Profiles</span> in tenant and root directories</li>
                    <li>All <span className="text-amber-300 font-medium">Top-up Requests, Cash Drops, & Legacy Devices</span></li>
                    <li>System Notifications, Feedback entries, & Audit ledgers</li>
                  </ul>
                  <p className="text-[10px] text-slate-400 pt-1">
                    A comprehensive snapshot will be saved to <span className="font-mono text-sky-400">/archived_workspaces/{workspaceToDelete.id}</span> in Cloud Firestore before removal.
                  </p>
                </div>

                {/* Optional Quick Backup button */}
                <div className="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-slate-950/40">
                  <div className="text-[11px] text-slate-400">
                    Need a copy before deleting?
                  </div>
                  <button
                    type="button"
                    onClick={() => handleExportBackup(workspaceToDelete.id, workspaceToDelete.name)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-500/10 text-sky-400 hover:bg-sky-500 hover:text-white border border-sky-500/30 transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download JSON Backup</span>
                  </button>
                </div>

                {/* Intent Confirmation Input */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-300">
                    To confirm intent, type <span className="font-mono font-bold text-rose-400">DELETE</span> or the workspace name (<span className="font-mono text-amber-300">{workspaceToDelete.name}</span>):
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmationText}
                    onChange={(e) => setDeleteConfirmationText(e.target.value)}
                    placeholder="Type DELETE or workspace name to confirm"
                    className={`w-full px-3.5 py-2.5 rounded-xl text-xs border font-mono transition focus:outline-none ${
                      theme === 'light'
                        ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-rose-500'
                        : 'bg-slate-950 border-slate-700 text-white focus:border-rose-500'
                    }`}
                  />
                </div>

                {/* Intent Confirmation Checkbox */}
                <label className="flex items-start gap-2.5 cursor-pointer select-none pt-1">
                  <input
                    type="checkbox"
                    checked={deleteCheckboxConfirmed}
                    onChange={(e) => setDeleteCheckboxConfirmed(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded text-rose-600 bg-slate-900 border-slate-700 focus:ring-rose-500"
                  />
                  <span className="text-[11px] text-slate-400 leading-snug">
                    I confirm that I want to permanently delete this workspace and recursively wipe all associated sub-collections (agents, vouchers, and transactions).
                  </span>
                </label>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-800/20">
                <button
                  type="button"
                  onClick={() => {
                    setWorkspaceToDelete(null);
                    setDeleteConfirmationText('');
                    setDeleteCheckboxConfirmed(false);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={
                    deleteConfirmationText.trim().toUpperCase() !== 'DELETE' &&
                    deleteConfirmationText.trim().toLowerCase() !== workspaceToDelete.name.trim().toLowerCase()
                  }
                  onClick={handleConfirmDeleteWorkspace}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition cursor-pointer flex items-center gap-2 shadow-lg shadow-rose-600/20 disabled:opacity-40 disabled:cursor-not-allowed active:scale-98"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Purge & Delete Workspace</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
} catch (error: any) {
  console.error("AppOwnerDashboard render exception caught:", error);
  return (
    <div className="flex-grow flex items-center justify-center min-h-[50vh] p-6">
      <div className="max-w-md w-full border border-red-500/20 bg-red-500/5 p-8 rounded-3xl text-center">
        <h2 className="text-xl font-bold text-red-500 mb-3">System Rendering Interrupted</h2>
        <p className="text-xs font-mono text-slate-400 mb-5 leading-relaxed bg-black/30 p-3 rounded-xl border border-white/5 text-left overflow-auto max-h-40">
          {error?.stack || error?.message || String(error)}
        </p>
        <button
          onClick={() => {
            localStorage.clear();
            sessionStorage.clear();
            window.location.reload();
          }}
          className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs uppercase font-bold tracking-wider cursor-pointer transition"
        >
          Clear Stale Cache & Reload
        </button>
      </div>
    </div>
  );
}
};
