import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Customer, LoyaltySettings, LoyaltyTierRule } from '../types';
import { DEFAULT_LOYALTY_SETTINGS, calculateActiveStreakCount } from '../utils/loyaltyEngine';
import { fuzzySearchCustomers, CustomerFuzzyResult, HighlightText } from '../utils/fuzzySearch';
import { SearchSuggestionsDropdown } from './SearchSuggestionsDropdown';
import { useApp } from '../context/AppContext';
import { BulkCustomerImportModal } from './BulkCustomerImportModal';
import { CustomerExportModal } from './CustomerExportModal';
import {
  PhonebookLookupModal,
  isNativeContactPickerAvailable,
  pickFromNativePhonebook
} from './PhonebookLookupModal';
import {
  Sparkles,
  Award,
  Settings2,
  Users,
  Check,
  X,
  Plus,
  Trash2,
  Edit2,
  Save,
  Search,
  AlertCircle,
  HelpCircle,
  RefreshCw,
  RotateCcw,
  Gift,
  DollarSign,
  UserCheck,
  Upload,
  Flame,
  Ticket,
  Cpu,
  ShieldCheck,
  ChevronRight,
  FileSpreadsheet,
  Globe,
  BookUser,
  Smartphone,
  Loader2
} from 'lucide-react';
import { INTERNATIONAL_COUNTRIES } from './CountryPhoneInput';

interface LoyaltyProgramSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: LoyaltySettings;
  onSaveSettings: (settings: LoyaltySettings) => Promise<void>;
  customers: Customer[];
  onAddOrUpdateCustomer: (customerData: Partial<Customer>) => Promise<Customer>;
  theme: 'light' | 'dark';
  isAgent?: boolean;
  initialTab?: 'settings' | 'customers';
  initialEditingCustomer?: Customer | null;
}

export const LoyaltyProgramSettingsModal: React.FC<LoyaltyProgramSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  customers,
  onAddOrUpdateCustomer,
  theme,
  isAgent = false,
  initialTab,
  initialEditingCustomer = null
}) => {
  const modalContainerRef = useRef<HTMLDivElement>(null);
  const hasInitializedRef = useRef(false);
  const [activeTab, setActiveTab] = useState<'settings' | 'customers'>(() => {
    if (initialTab) return initialTab;
    return isAgent ? 'customers' : 'settings';
  });

  // Form states for settings aligned with LoyaltySettings type
  const [isEnabled, setIsEnabled] = useState<boolean>(settings?.isEnabled ?? true);
  const [minQualifyingPrice, setMinQualifyingPrice] = useState<number>(settings?.minQualifyingPrice ?? 3.0);
  const [enforceCustomerDetailsOnSale, setEnforceCustomerDetailsOnSale] = useState<boolean>(
    settings?.enforceCustomerDetailsOnSale ?? false
  );
  const [tierRules, setTierRules] = useState<LoyaltyTierRule[]>(() => {
    return settings?.tierRules && settings.tierRules.length > 0
      ? settings.tierRules
      : DEFAULT_LOYALTY_SETTINGS.tierRules;
  });

  const [mixedRequiredConsecutive, setMixedRequiredConsecutive] = useState<number>(
    settings?.mixedRule?.requiredConsecutive ?? 3
  );
  const [mixedDiscountAmount, setMixedDiscountAmount] = useState<number>(
    settings?.mixedRule?.discountAmount ?? 1.0
  );

  const [countdownTemplate, setCountdownTemplate] = useState<string>(
    settings?.countdownTemplate || '{remaining} to go! Next time get it for ${nextPrice}'
  );
  const [regularRewardText, setRegularRewardText] = useState<string>(
    settings?.regularRewardText || '🎉 Genius Customer Reward: $1.00 Off'
  );
  const [superRewardText, setSuperRewardText] = useState<string>(
    settings?.superRewardText || '🌟 Super Genius Loyalty Reward: $2.00 Off!'
  );

  // App context for actions
  const { deleteCustomer, bulkAddCustomers, updateCustomerStreak, restoreCustomerRegistryFromPrePush, currentUser, showToast, activeWorkspace, updateWorkspaceTelephoneCode } = useApp();
  const [telephoneCode, setTelephoneCode] = useState(() => activeWorkspace?.telephoneCode || '+263');
  const [isRestoringRegistry, setIsRestoringRegistry] = useState(false);
  
  // Sync state if activeWorkspace changes
  useEffect(() => {
    if (activeWorkspace?.telephoneCode) {
      setTelephoneCode(activeWorkspace.telephoneCode);
    }
  }, [activeWorkspace?.telephoneCode]);

  const isAdmin = currentUser?.role === 'Admin' || currentUser?.role === 'WorkspaceMaster' || currentUser?.role === 'AppOwner' || !isAgent;

  // State for Customer directory search and edit
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [isCustomerExportOpen, setIsCustomerExportOpen] = useState(false);
  const [isPhonebookOpen, setIsPhonebookOpen] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [isCustomerSuggestionsOpen, setIsCustomerSuggestionsOpen] = useState(false);
  const customerSearchInputRef = useRef<HTMLInputElement>(null);
  const [customerTypeFilter, setCustomerTypeFilter] = useState<'all' | 'voucher' | 'legacy_device'>('all');
  const [editingCustomer, setEditingCustomer] = useState<Partial<Customer> | null>(null);
  const [editingStreak, setEditingStreak] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Handle selecting a contact from Phonebook Lookup & populating customer form
  const handleSelectPhonebookContact = (contact: { name: string; phone: string; email?: string; notes?: string }) => {
    if (editingCustomer) {
      setEditingCustomer(prev => ({
        ...prev,
        name: contact.name || prev?.name || '',
        cellNumber: contact.phone || prev?.cellNumber || ''
      }));
    } else {
      setEditingCustomer({
        name: contact.name,
        cellNumber: contact.phone,
        customerType: 'voucher',
        consecutivePurchases: []
      });
    }
    showToast(`✓ Populated from Phonebook: ${contact.name}${contact.phone ? ` (${contact.phone})` : ''}`, 'info');
  };

  // Always lookup directly from Native device phonebook; fallback to directory modal if unsupported
  const handleNativePhonebookLookup = async () => {
    if (isNativeContactPickerAvailable()) {
      try {
        const res = await pickFromNativePhonebook();
        if (res.success && res.contact) {
          handleSelectPhonebookContact(res.contact);
          return;
        }
        if (res.cancelled) {
          return;
        }
        if (res.error) {
          showToast(res.error, 'error');
        }
      } catch (err: any) {
        console.warn('Native contact picker error:', err);
      }
    }
    // Fallback if not on mobile / unsupported browser
    setIsPhonebookOpen(true);
  };

  // New Tier Rule helper
  const [newRulePrice, setNewRulePrice] = useState<number>(15);
  const [newRuleRequired, setNewRuleRequired] = useState<number>(2);
  const [newRuleDiscountedPrice, setNewRuleDiscountedPrice] = useState<number>(12);

  // 1. Synchronous Deduplication & Normalization pipeline
  const deduplicatedCustomers = useMemo<Customer[]>(() => {
    const seenNames = new Set<string>();
    const seenMacs = new Set<string>();
    const seenIds = new Set<string>();
    const unique: Customer[] = [];

    for (const c of customers) {
      if (!c || !c.id || !c.name) continue;
      if (seenIds.has(c.id)) continue;

      const normName = c.name.trim().toLowerCase();
      if (!normName || normName === 'walk-in client' || normName === 'customer' || normName === 'valued customer') continue;

      const normMac = (c.macAddress || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      if (seenNames.has(normName) || (normMac.length >= 8 && seenMacs.has(normMac))) {
        continue;
      }
      seenIds.add(c.id);
      seenNames.add(normName);
      if (normMac.length >= 8) seenMacs.add(normMac);
      unique.push(c);
    }
    return unique;
  }, [customers]);

  const totalRegistryCount = deduplicatedCustomers.length;

  // 2. Fuzzy Search & Category Filter
  const customerFuzzyResults = useMemo<CustomerFuzzyResult[]>(() => {
    let results = fuzzySearchCustomers(deduplicatedCustomers, customerSearchQuery);
    if (customerTypeFilter === 'voucher') {
      results = results.filter(r => !r.customer.customerType || r.customer.customerType === 'voucher');
    } else if (customerTypeFilter === 'legacy_device') {
      results = results.filter(r => r.customer.customerType === 'legacy_device');
    }
    return results;
  }, [deduplicatedCustomers, customerSearchQuery, customerTypeFilter]);

  const visibleCount = customerFuzzyResults.length;

  const filteredCustomers = useMemo(() => {
    return customerFuzzyResults.map(r => r.customer);
  }, [customerFuzzyResults]);

  const customerRealtimeSuggestions = useMemo(() => {
    if (!customerSearchQuery.trim()) return [];
    return customerFuzzyResults.slice(0, 6);
  }, [customerFuzzyResults, customerSearchQuery]);

  // Prevent background scroll and ensure popup starts from the top
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Scroll popup container directly to the top
    if (modalContainerRef.current) {
      modalContainerRef.current.scrollTop = 0;
    }

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      if (!hasInitializedRef.current) {
        hasInitializedRef.current = true;
        if (initialEditingCustomer) {
          setEditingCustomer(initialEditingCustomer);
          setActiveTab('customers');
        } else if (initialTab) {
          setActiveTab(initialTab);
        } else if (isAgent) {
          setActiveTab('customers');
        }
      }
    } else {
      hasInitializedRef.current = false;
      setEditingCustomer(null);
    }
  }, [isOpen, initialEditingCustomer, initialTab, isAgent]);

  // When editingCustomer is set, initialize editingStreak
  useEffect(() => {
    if (editingCustomer) {
      const currentStreak = calculateActiveStreakCount(editingCustomer);
      setEditingStreak(currentStreak);
    }
  }, [editingCustomer]);

  // Smoothly scroll to the top of the modal container when a customer profile starts being edited or added
  useEffect(() => {
    if (editingCustomer) {
      setTimeout(() => {
        const formEl = document.getElementById('edit-customer-form');
        if (formEl) {
          formEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else if (modalContainerRef.current) {
          modalContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }, 50);
    }
  }, [editingCustomer]);

  if (!isOpen) return null;

  const handleAddTierRule = () => {
    if (newRulePrice <= 0 || newRuleDiscountedPrice < 0 || newRuleDiscountedPrice >= newRulePrice) return;
    const rule: LoyaltyTierRule = {
      price: newRulePrice,
      requiredConsecutive: newRuleRequired,
      discountedPrice: newRuleDiscountedPrice
    };
    setTierRules(prev => [...prev, rule]);
    setNewRulePrice(newRulePrice + 5);
    setNewRuleDiscountedPrice(newRulePrice + 2);
  };

  const handleDeleteTierRule = (index: number) => {
    setTierRules(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveAllSettings = async () => {
    setIsSaving(true);
    try {
      const updated: LoyaltySettings = {
        isEnabled,
        minQualifyingPrice,
        enforceCustomerDetailsOnSale,
        tierRules,
        mixedRule: {
          minPrice: minQualifyingPrice,
          requiredConsecutive: mixedRequiredConsecutive,
          discountAmount: mixedDiscountAmount
        },
        countdownTemplate,
        regularRewardText,
        superRewardText
      };
      await onSaveSettings(updated);
      
      // Save telephone code configuration if changed
      if (telephoneCode !== activeWorkspace?.telephoneCode) {
        await updateWorkspaceTelephoneCode(telephoneCode);
      }
      
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;
    if (!editingCustomer.name || !editingCustomer.name.trim()) {
      if (editingCustomer.id) {
        setCustomerToDelete(editingCustomer as Customer);
        return;
      }
      showToast("Please enter a customer name, or delete the profile.", "error");
      return;
    }
    
    const trimmedName = editingCustomer.name.trim().toLowerCase();
    const existingDuplicate = customers.find(c => c.id !== editingCustomer.id && c.name && c.name.trim().toLowerCase() === trimmedName);
    if (existingDuplicate) {
      showToast(`Customer "${editingCustomer.name.trim()}" is already registered as ${existingDuplicate.customerNumber}. Please use a unique name.`, 'error');
      return;
    }

    try {
      setIsSaving(true);
      const isExisting = !!editingCustomer.id;
      const savedCustomer = await onAddOrUpdateCustomer({
        ...editingCustomer,
        streakCount: editingStreak
      });

      setEditingCustomer(null);
      setEditingStreak(0);
      showToast(`Customer profile "${savedCustomer?.name || editingCustomer.name.trim()}" ${isExisting ? 'updated' : 'created'} successfully!`, "success");
      onClose();
    } catch (err: any) {
      console.warn('Error saving customer:', err);
      showToast(`Failed to save customer: ${err?.message || 'Unknown error'}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Quick Streak adjustment directly from the directory row
  const handleQuickStreakAdjust = async (customer: Customer, delta: number) => {
    if (!isAdmin) return;
    const current = calculateActiveStreakCount(customer);
    const newStreak = Math.max(0, Math.min(3, current + delta));
    if (newStreak === current) return;

    const qualifyingPrice = customer.customerType === 'legacy_device'
      ? (customer.monthlyPrice || 10.0)
      : 3.0;

    await updateCustomerStreak(customer.id, newStreak, qualifyingPrice);
  };

  const modalMarkup = (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center p-2.5 sm:p-4 overflow-y-auto bg-black/75 backdrop-blur-sm animate-fade-in"
    >
      <div className={`w-full max-w-3xl max-h-[92vh] sm:max-h-[90vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden transition mt-2 sm:mt-4 md:mt-6 mb-4 ${
        theme === 'light' ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
      }`}>
        {/* Header */}
        <div className={`p-4 sm:p-5 border-b flex items-center justify-between gap-3 shrink-0 ${
          theme === 'light' ? 'bg-amber-50/50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
        }`}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black font-display tracking-tight text-slate-900 dark:text-white">
                  Genius Loyalty Program &amp; Customer Registry
                </h3>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase border ${
                  isEnabled
                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                    : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                }`}>
                  {isEnabled ? 'Active' : 'Disabled'}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Manage vouchers and legacy device customer rewards, streaks, and bulk imports.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className={`flex border-b px-4 gap-2 shrink-0 ${
          theme === 'light' ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950'
        }`}>
          {!isAgent && (
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`py-3 px-4 text-xs font-mono font-bold flex items-center gap-2 border-b-2 transition cursor-pointer ${
                activeTab === 'settings'
                  ? 'border-amber-500 text-amber-500'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Settings2 className="w-4 h-4" />
              <span>Rules &amp; Configuration</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab('customers')}
            className={`py-3 px-4 text-xs font-mono font-bold flex items-center gap-2 border-b-2 transition cursor-pointer ${
              activeTab === 'customers' || isAgent
                ? 'border-amber-500 text-amber-500'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Universal Customer Registry ({totalRegistryCount})</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div ref={modalContainerRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {activeTab === 'settings' && !isAgent && (
            <div className="space-y-6">
              {/* Main Master Enable Switch */}
              <div className={`p-4 rounded-2xl border flex items-center justify-between gap-4 ${
                isEnabled
                  ? theme === 'light' ? 'bg-amber-50/70 border-amber-200' : 'bg-amber-950/20 border-amber-500/30'
                  : theme === 'light' ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Gift className="w-4 h-4 text-amber-500" />
                    Enable Genius Loyalty Rewards Program
                  </h4>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    When active, agent terminals automatically track consecutive purchases, calculate discounts, and print rewards on thermal tickets.
                  </p>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={(e) => setIsEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500" />
                </label>
              </div>

              {/* Customer Detail Input Enforcement Toggle for Agents */}
              <div className={`p-4 rounded-2xl border flex items-center justify-between gap-4 ${
                enforceCustomerDetailsOnSale
                  ? theme === 'light' ? 'bg-sky-50/70 border-sky-300' : 'bg-sky-950/30 border-sky-500/40'
                  : theme === 'light' ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-sky-500" />
                    Enforce Customer Details During Sales
                  </h4>
                  <p className="text-xs text-slate-400 font-mono mt-0.5 max-w-lg">
                    {enforceCustomerDetailsOnSale
                      ? '🔒 Enforced (Mandatory): Field agents MUST provide customer name and phone before completing voucher sales. Option to skip is disabled.'
                      : '⚡ Optional (Default with Skip): Customer detail inputs appear by default, but agents may skip entering details after confirmation for walk-in clients.'}
                  </p>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    id="toggle-enforce-customer-details"
                    checked={enforceCustomerDetailsOnSale}
                    onChange={(e) => setEnforceCustomerDetailsOnSale(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500" />
                </label>
              </div>

              {/* Country Dial Prefix Configuration */}
              <div className={`p-4 rounded-2xl border space-y-3 ${
                theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Globe className="w-4 h-4 text-sky-500 animate-pulse" />
                    Default Country Telephone Dial Code Prefix
                  </h4>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    Configure the default telephone country code for your workspace. This dial code prefix will be pre-filled on all phone inputs across all field agent terminals.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="relative">
                    <select
                      value={telephoneCode}
                      onChange={(e) => setTelephoneCode(e.target.value)}
                      className={`border rounded-xl px-3 py-2 text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-sky-500 w-64 ${
                        theme === 'light' ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
                      }`}
                    >
                      {INTERNATIONAL_COUNTRIES.map(c => (
                        <option key={`${c.iso}-${c.code}`} value={c.code}>
                          {c.flag} {c.name} ({c.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">
                    Current Prefix: <strong className="text-sky-500">{telephoneCode}</strong>
                  </span>
                </div>
              </div>

              {/* Minimum Qualifying Criteria */}
              <div className={`p-4 rounded-2xl border space-y-2 ${
                theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}>
                <label className="block text-xs font-mono font-bold text-slate-500 dark:text-slate-400">
                  Minimum Qualifying Voucher Price Threshold
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-amber-500">$</span>
                  <input
                    type="number"
                    step="0.25"
                    min={0}
                    value={minQualifyingPrice}
                    onChange={(e) => setMinQualifyingPrice(parseFloat(e.target.value) || 3.0)}
                    className={`w-24 border rounded-xl px-3 py-2 text-xs font-mono font-bold focus:ring-1 focus:ring-amber-500 ${
                      theme === 'light' ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
                    }`}
                  />
                  <span className="text-xs font-mono text-slate-400">USD</span>
                </div>
                <p className="text-[11px] text-amber-500 font-mono">
                  Rule: Vouchers lower than ${(minQualifyingPrice || 0).toFixed(2)} (such as $0.25 or $0.50) do not qualify for loyalty rewards.
                </p>
              </div>

              {/* Specific Denomination Tier Reward Rules */}
              <div className={`p-4 rounded-2xl border space-y-4 ${
                theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-mono font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Award className="w-3.5 h-3.5 text-amber-500" />
                      Denomination Tier Reward Rules
                    </h4>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                      Consecutive purchases of identical vouchers qualify for direct discounted price on the next purchase.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  {tierRules.map((rule, idx) => {
                    const discount = rule.price - rule.discountedPrice;
                    const isSuperReward = discount >= 2.0;

                    return (
                      <div
                        key={idx}
                        className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs font-mono ${
                          theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-amber-500">${(rule.price || 0).toFixed(2)} Voucher</span>
                          <span className="text-slate-400">&bull;</span>
                          <span className="text-slate-600 dark:text-slate-300">
                            Buy {rule.requiredConsecutive} times &rarr; Next at{' '}
                            <strong className="text-emerald-500">${(rule.discountedPrice || 0).toFixed(2)}</strong>
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isSuperReward
                              ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                          }`}>
                            Save ${(discount || 0).toFixed(2)}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleDeleteTierRule(idx)}
                            className="p-1 text-slate-400 hover:text-rose-500 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Add Rule Line */}
                <div className={`p-3 rounded-xl border border-dashed flex flex-wrap items-center gap-3 ${
                  theme === 'light' ? 'border-slate-300 bg-slate-50/50' : 'border-slate-800 bg-slate-900/40'
                }`}>
                  <div className="flex items-center gap-1.5 text-xs font-mono">
                    <span className="text-slate-400">Price: $</span>
                    <input
                      type="number"
                      value={newRulePrice}
                      onChange={(e) => setNewRulePrice(parseFloat(e.target.value) || 0)}
                      className="w-16 px-2 py-1 rounded-lg border text-xs font-mono"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 text-xs font-mono">
                    <span className="text-slate-400">Req:</span>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={newRuleRequired}
                      onChange={(e) => setNewRuleRequired(parseInt(e.target.value, 10) || 2)}
                      className="w-14 px-2 py-1 rounded-lg border text-xs font-mono"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 text-xs font-mono">
                    <span className="text-slate-400">Discounted: $</span>
                    <input
                      type="number"
                      value={newRuleDiscountedPrice}
                      onChange={(e) => setNewRuleDiscountedPrice(parseFloat(e.target.value) || 0)}
                      className="w-16 px-2 py-1 rounded-lg border text-xs font-mono"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleAddTierRule}
                    className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-mono font-bold flex items-center gap-1 transition ml-auto"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Tier Rule</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'customers' && (
            <div className="space-y-4">
              {/* Customer Search & Category Filter Bar (Locked/Sticky on scroll) */}
              <div className={`sticky -top-4 sm:-top-6 z-30 pt-3.5 pb-3 -mx-4 sm:-mx-6 px-4 sm:px-6 flex flex-col gap-2.5 border-b backdrop-blur-md transition-all shadow-xs ${
                theme === 'light'
                  ? 'bg-white/95 border-slate-200/90'
                  : 'bg-slate-900/95 border-slate-800/90'
              }`}>
                {/* Search Input with Real-time Suggestions Popover & Clear Button */}
                <div className="relative w-full">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    ref={customerSearchInputRef}
                    type="text"
                    id="customer-registry-fuzzy-search-input"
                    value={customerSearchQuery}
                    onChange={(e) => {
                      setCustomerSearchQuery(e.target.value);
                      setIsCustomerSuggestionsOpen(true);
                    }}
                    onFocus={() => {
                      if (customerSearchQuery.trim()) {
                        setIsCustomerSuggestionsOpen(true);
                      }
                    }}
                    placeholder="Fuzzy search Customer No (CN:01), Name, Phone, or MAC..."
                    className={`w-full border rounded-xl pl-9 pr-9 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-amber-500 transition ${
                      theme === 'light' ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                    }`}
                  />
                  {customerSearchQuery && (
                    <button
                      type="button"
                      id="btn-clear-customer-search"
                      onClick={() => {
                        setCustomerSearchQuery('');
                        setIsCustomerSuggestionsOpen(false);
                        if (customerSearchInputRef.current) {
                          customerSearchInputRef.current.focus();
                        }
                      }}
                      className="absolute right-3 top-2 text-slate-400 hover:text-slate-200 cursor-pointer p-0.5 rounded transition"
                      title="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Real-Time Customer Suggestions Popover */}
                  <SearchSuggestionsDropdown
                    isOpen={isCustomerSuggestionsOpen && customerRealtimeSuggestions.length > 0}
                    onClose={() => setIsCustomerSuggestionsOpen(false)}
                    query={customerSearchQuery}
                    items={customerRealtimeSuggestions}
                    theme={theme}
                    title="Real-Time Customer Matches"
                    emptyMessage="No customer records match this search query"
                    onSelectItem={(result) => {
                      setCustomerSearchQuery(result.customer.customerNumber);
                      setIsCustomerSuggestionsOpen(false);
                    }}
                    renderItem={(result) => (
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0">
                            <HighlightText text={result.customer.customerNumber} indices={result.matchedFields.customerNumber} />
                          </span>
                          <div className="min-w-0">
                            <div className="text-xs font-bold truncate">
                              <HighlightText text={result.customer.name} indices={result.matchedFields.name} />
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono truncate">
                              <HighlightText text={result.customer.cellNumber || 'No Cell'} indices={result.matchedFields.cellNumber} />
                            </div>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono text-amber-500 font-bold shrink-0">
                          {result.customer.consecutivePurchases?.length || 0} Streak
                        </span>
                      </div>
                    )}
                  />
                </div>

                {/* Filter and Action Buttons: Mobile-First Responsive Layout */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 w-full">
                  {/* Category Filter Pills - Full width on mobile, 3 equal segments */}
                  <div className="grid grid-cols-3 sm:flex rounded-xl p-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full sm:w-auto shrink-0">
                    <button
                      type="button"
                      onClick={() => setCustomerTypeFilter('all')}
                      className={`px-2.5 py-1.5 sm:py-1 text-center text-[11px] font-mono font-bold rounded-lg transition ${
                        customerTypeFilter === 'all'
                          ? 'bg-amber-500 text-white shadow-xs'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomerTypeFilter('voucher')}
                      className={`px-2.5 py-1.5 sm:py-1 text-center text-[11px] font-mono font-bold rounded-lg transition ${
                        customerTypeFilter === 'voucher'
                          ? 'bg-amber-500 text-white shadow-xs'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Vouchers
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomerTypeFilter('legacy_device')}
                      className={`px-2.5 py-1.5 sm:py-1 text-center text-[11px] font-mono font-bold rounded-lg transition ${
                        customerTypeFilter === 'legacy_device'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Legacy
                    </button>
                  </div>

                  {/* Action Buttons: Import CSV, Export Registry & Add Customer - grid on mobile so they fit 100% cleanly without protruding */}
                  <div className="grid grid-cols-3 sm:flex sm:items-center gap-2 w-full sm:w-auto max-w-full">
                    <button
                      type="button"
                      onClick={() => setIsBulkImportOpen(true)}
                      className="w-full sm:w-auto px-2 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-mono font-bold flex items-center justify-center gap-1 border border-slate-300 dark:border-slate-700 transition cursor-pointer min-w-0"
                      title="Batch import names, surnames, cell numbers, legacy devices from CSV"
                    >
                      <Upload className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span className="truncate hidden sm:inline">Import CSV</span>
                      <span className="truncate sm:hidden">Import</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsCustomerExportOpen(true)}
                      className="w-full sm:w-auto px-2 py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/30 dark:hover:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl text-xs font-mono font-bold flex items-center justify-center gap-1 border border-indigo-200 dark:border-indigo-500/20 transition cursor-pointer min-w-0"
                      title="Export Customer Registry to PDF or CSV"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <span className="truncate hidden sm:inline">Export Registry</span>
                      <span className="truncate sm:hidden">Export</span>
                    </button>

                    <button
                      type="button"
                      disabled={isRestoringRegistry}
                      onClick={async () => {
                        setIsRestoringRegistry(true);
                        try {
                          await restoreCustomerRegistryFromPrePush();
                        } finally {
                          setIsRestoringRegistry(false);
                        }
                      }}
                      className="w-full sm:w-auto px-2 py-2 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl text-xs font-mono font-bold flex items-center justify-center gap-1 border border-emerald-200 dark:border-emerald-500/20 transition cursor-pointer min-w-0"
                      title="Restore customer registry list to before the last local-to-global DB push"
                    >
                      <RotateCcw className={`w-3.5 h-3.5 text-emerald-500 shrink-0 ${isRestoringRegistry ? 'animate-spin' : ''}`} />
                      <span className="truncate hidden sm:inline">{isRestoringRegistry ? 'Restoring...' : 'Restore Registry'}</span>
                      <span className="truncate sm:hidden">{isRestoringRegistry ? 'Restoring' : 'Restore'}</span>
                    </button>

                    {/* Always Lookup in Native Phonebook Button */}
                    <div className="flex items-center gap-1 w-full sm:w-auto">
                      <button
                        type="button"
                        id="btn-customer-phonebook-lookup"
                        onClick={handleNativePhonebookLookup}
                        className="flex-1 sm:flex-initial px-3 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-xl text-xs font-mono font-bold flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer min-w-0"
                        title="Always lookup directly from Native device phonebook"
                      >
                        <Smartphone className="w-3.5 h-3.5 shrink-0 text-white" />
                        <span className="truncate hidden sm:inline">Native Phonebook</span>
                        <span className="truncate sm:hidden">Native Phonebook</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsPhonebookOpen(true)}
                        className="px-2 py-2 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded-xl text-xs font-mono font-bold border border-amber-300 dark:border-amber-600/40 transition cursor-pointer"
                        title="Open saved phonebook directory & vCard file importer"
                      >
                        <BookUser className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      id="btn-add-customer-main"
                      onClick={() => setEditingCustomer({ name: '', cellNumber: '', customerType: 'voucher', consecutivePurchases: [] })}
                      className="w-full sm:w-auto px-2 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-mono font-bold flex items-center justify-center gap-1 shadow-xs transition cursor-pointer min-w-0"
                    >
                      <Plus className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate hidden sm:inline">Add Customer</span>
                      <span className="truncate sm:hidden">Add</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Edit / Add Customer Form with Admin Streak Modification */}
              {editingCustomer && (
                <form id="edit-customer-form" onSubmit={handleSaveCustomer} className={`p-3.5 sm:p-4 rounded-2xl border space-y-4 ${
                  theme === 'light' ? 'bg-amber-50/50 border-amber-200' : 'bg-amber-950/20 border-amber-500/30'
                }`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h5 className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400">
                        {editingCustomer.id ? `Edit Customer: ${editingCustomer.customerNumber}` : 'New Customer Profile'}
                      </h5>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                        {editingCustomer.customerType === 'legacy_device' ? 'Legacy Terminal Client' : 'Voucher Client'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      <button
                        type="button"
                        id="btn-form-phonebook-lookup"
                        onClick={handleNativePhonebookLookup}
                        className="px-2.5 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-lg text-[11px] font-mono font-bold flex items-center gap-1 transition cursor-pointer shadow-xs shrink-0"
                        title="Always lookup from Native phonebook"
                      >
                        <Smartphone className="w-3 h-3" />
                        <span>Native Phonebook</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsPhonebookOpen(true)}
                        className="p-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 rounded-lg text-[11px] font-mono border border-amber-500/30 transition cursor-pointer shrink-0"
                        title="Browse saved phonebook directory"
                      >
                        <BookUser className="w-3 h-3 text-amber-600" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCustomer(null);
                          if (initialEditingCustomer) {
                            onClose();
                          }
                        }}
                        className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between gap-1 flex-wrap mb-1">
                        <label className="block text-[10px] font-mono text-slate-500">Customer Name</label>
                        <button
                          type="button"
                          onClick={handleNativePhonebookLookup}
                          className="text-[10px] font-mono text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5 cursor-pointer font-bold shrink-0"
                          title="Pick contact directly from native phonebook"
                        >
                          <Smartphone className="w-2.5 h-2.5" />
                          <span>Native Phonebook</span>
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          value={editingCustomer.name || ''}
                          onChange={(e) => setEditingCustomer(prev => ({ ...prev, name: e.target.value }))}
                          required
                          placeholder="e.g. John Phiri"
                          className={`w-full border rounded-xl px-3 py-2 ${editingCustomer.name ? 'pr-8' : ''} text-xs ${
                            theme === 'light' ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
                          }`}
                        />
                        {editingCustomer.name && (
                          <button
                            type="button"
                            onClick={() => setEditingCustomer(prev => ({ ...prev, name: '' }))}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500 cursor-pointer p-0.5"
                            title="Delete customer name"
                            aria-label="Delete customer name"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-1 flex-wrap mb-1">
                        <label className="block text-[10px] font-mono text-slate-500">Cell Number / WhatsApp</label>
                        <button
                          type="button"
                          onClick={handleNativePhonebookLookup}
                          className="text-[10px] font-mono text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5 cursor-pointer font-bold shrink-0"
                          title="Pick contact directly from native phonebook"
                        >
                          <Smartphone className="w-2.5 h-2.5" />
                          <span>Native Phonebook</span>
                        </button>
                      </div>
                      <input
                        type="text"
                        value={editingCustomer.cellNumber || ''}
                        onChange={(e) => setEditingCustomer(prev => ({ ...prev, cellNumber: e.target.value }))}
                        placeholder="+263 77 123 4567"
                        className={`w-full border rounded-xl px-3 py-2 text-xs ${
                          theme === 'light' ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Customer Type Selector */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-mono text-slate-500 mb-1">Customer Category</label>
                      <select
                        value={editingCustomer.customerType || 'voucher'}
                        onChange={(e) => setEditingCustomer(prev => ({ ...prev, customerType: e.target.value as any }))}
                        className={`w-full border rounded-xl px-3 py-2 text-xs font-mono ${
                          theme === 'light' ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
                        }`}
                      >
                        <option value="voucher">🎟️ Voucher Customer (WiFi Users)</option>
                        <option value="legacy_device">📱 Legacy Device Customer (Non-WiFi Terminal)</option>
                      </select>
                    </div>

                    {editingCustomer.customerType === 'legacy_device' && (
                      <div>
                        <label className="block text-[10px] font-mono text-slate-500 mb-1">Device Model</label>
                        <input
                          type="text"
                          value={editingCustomer.deviceModel || ''}
                          onChange={(e) => setEditingCustomer(prev => ({ ...prev, deviceModel: e.target.value }))}
                          placeholder="e.g. MikroTik hEX RB750Gr3"
                          className={`w-full border rounded-xl px-3 py-2 text-xs ${
                            theme === 'light' ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
                          }`}
                        />
                      </div>
                    )}
                  </div>

                  {editingCustomer.customerType === 'legacy_device' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-mono text-slate-500 mb-1">MAC Address (Physical Address)</label>
                        <input
                          type="text"
                          value={editingCustomer.macAddress || ''}
                          onChange={(e) => setEditingCustomer(prev => ({ ...prev, macAddress: e.target.value }))}
                          placeholder="00:1A:2B:3C:4D:5E"
                          className={`w-full border rounded-xl px-3 py-2 text-xs font-mono ${
                            theme === 'light' ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
                          }`}
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-mono text-slate-500 mb-1">Monthly Service Price ($)</label>
                        <input
                          type="number"
                          step="0.50"
                          min={0}
                          value={editingCustomer.monthlyPrice !== undefined ? editingCustomer.monthlyPrice : 10.0}
                          onChange={(e) => setEditingCustomer(prev => ({ ...prev, monthlyPrice: parseFloat(e.target.value) || 0 }))}
                          className={`w-full border rounded-xl px-3 py-2 text-xs font-mono ${
                            theme === 'light' ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
                          }`}
                        />
                      </div>
                    </div>
                  )}

                  {/* ADMIN STREAK EDITOR FIELD */}
                  {isAdmin && (
                    <div className={`p-3.5 rounded-xl border space-y-2.5 ${
                      theme === 'light' ? 'bg-white border-amber-300' : 'bg-slate-900 border-amber-500/40'
                    }`}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <label className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                          <Flame className="w-4 h-4 text-amber-500 fill-amber-500 shrink-0" />
                          <span>Admin Streak Adjustment (Consecutive Purchases)</span>
                        </label>
                        <span className="text-[10px] font-mono text-slate-400">
                          Enables direct reward qualification
                        </span>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setEditingStreak(Math.max(0, editingStreak - 1))}
                            className="w-8 h-8 rounded-lg border flex items-center justify-center font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white shrink-0"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min={0}
                            max={12}
                            value={editingStreak}
                            onChange={(e) => setEditingStreak(Math.max(0, Math.min(12, parseInt(e.target.value, 10) || 0)))}
                            className="w-14 h-8 text-center text-sm font-bold font-mono rounded-lg border"
                          />
                          <button
                            type="button"
                            onClick={() => setEditingStreak(Math.min(12, editingStreak + 1))}
                            className="w-8 h-8 rounded-lg border flex items-center justify-center font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white shrink-0"
                          >
                            +
                          </button>
                        </div>

                        {/* Quick preset buttons */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingStreak(0)}
                            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-bold border transition cursor-pointer ${
                              editingStreak === 0
                                ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white border-slate-400'
                                : 'text-slate-400 border-slate-300 dark:border-slate-700'
                            }`}
                          >
                            Reset (0)
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingStreak(2)}
                            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-bold border transition cursor-pointer ${
                              editingStreak === 2
                                ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                                : 'text-amber-500 border-amber-500/30 hover:bg-amber-500/10'
                            }`}
                          >
                            🎉 Reward Ready (2)
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingStreak(3)}
                            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-bold border transition cursor-pointer ${
                              editingStreak >= 3
                                ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                                : 'text-purple-500 border-purple-500/30 hover:bg-purple-500/10'
                            }`}
                          >
                            🌟 Super Reward (3)
                          </button>
                        </div>
                      </div>

                      {/* Live explanation of reward status */}
                      <p className="text-[11px] font-mono text-slate-500">
                        {editingStreak >= 3 ? (
                          <span className="text-purple-500 font-bold">
                            🌟 Super Reward Active: Next purchase grants the maximum $2.00 super discount!
                          </span>
                        ) : editingStreak === 2 ? (
                          <span className="text-amber-500 font-bold">
                            🎉 Reward Ready: Customer will receive a $1.00 loyalty discount on their next transaction!
                          </span>
                        ) : editingStreak === 1 ? (
                          <span className="text-sky-500">
                            1 consecutive purchase logged. 1 more purchase will unlock their reward discount.
                          </span>
                        ) : (
                          <span>Streak is at 0. No active reward countdown.</span>
                        )}
                      </p>
                    </div>
                  )}

                  <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-amber-500/20">
                    {editingCustomer.id ? (
                      <button
                        type="button"
                        onClick={() => {
                          const target = customers.find(c => c.id === editingCustomer.id) || (editingCustomer as Customer);
                          setCustomerToDelete(target);
                        }}
                        className="w-full sm:w-auto px-3 py-2 text-rose-500 hover:text-white hover:bg-rose-600 rounded-xl text-xs font-mono font-bold border border-rose-500/30 transition cursor-pointer flex items-center justify-center gap-1.5"
                        title="Delete customer record from registry"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Profile</span>
                      </button>
                    ) : <div />}
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCustomer(null);
                          if (initialEditingCustomer) {
                            onClose();
                          }
                        }}
                        className="flex-1 sm:flex-none px-3 py-2 rounded-xl text-xs font-mono text-slate-400 hover:text-slate-200 cursor-pointer text-center"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSaving}
                        className={`flex-1 sm:flex-none px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl text-xs font-mono font-bold shadow-xs cursor-pointer flex items-center justify-center gap-1.5 transition ${
                          isSaving ? 'opacity-75 cursor-wait' : ''
                        }`}
                      >
                        {isSaving ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Saving Profile...</span>
                          </>
                        ) : (
                          <>
                            <Save className="w-3.5 h-3.5" />
                            <span>Save Customer</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {/* Customer Directory List */}
              <div className="space-y-2">
                {customerFuzzyResults.map(({ customer: c, matchedFields }) => {
                  const currentStreak = calculateActiveStreakCount(c);
                  const isReady = currentStreak >= 2;
                  const isLegacy = c.customerType === 'legacy_device';

                  return (
                    <div
                      key={c.id}
                      className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-850'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-10 h-10 rounded-xl text-white flex items-center justify-center font-mono font-black text-xs shrink-0 shadow-xs ${
                          isLegacy
                            ? 'bg-gradient-to-br from-emerald-600 to-teal-700'
                            : 'bg-gradient-to-br from-amber-500 to-orange-600'
                        }`}>
                          <HighlightText text={c.customerNumber} indices={matchedFields.customerNumber} />
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <h5 className="font-bold text-xs text-slate-900 dark:text-white">
                              <HighlightText text={c.name} indices={matchedFields.name} />
                            </h5>
                            
                            {/* Type badge */}
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${
                              isLegacy
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                            }`}>
                              {isLegacy ? 'Legacy Terminal' : 'Voucher'}
                            </span>

                            {/* Streak badge */}
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${
                              isReady
                                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                                : currentStreak === 1
                                ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20'
                                : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                            }`}>
                              <Flame className={`w-2.5 h-2.5 ${isReady ? 'text-amber-500 fill-amber-500' : ''}`} />
                              <span>{currentStreak} Streak</span>
                              {isReady && <span className="font-black text-[8px] bg-amber-500 text-white px-1 rounded">READY</span>}
                            </span>
                          </div>

                          <div className="text-[10px] text-slate-400 font-mono mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <HighlightText text={c.cellNumber || 'No Cell Registered'} indices={matchedFields.cellNumber} />
                            {isLegacy && c.macAddress && (
                              <span className="text-emerald-500">&bull; MAC: <HighlightText text={c.macAddress} indices={matchedFields.macAddress} /></span>
                            )}
                            {isLegacy && c.deviceModel && (
                              <span className="text-slate-400">(<HighlightText text={c.deviceModel} indices={matchedFields.deviceModel} />)</span>
                            )}
                            <span className="text-amber-500/90 font-semibold">
                              &bull; Workspace: {c.workspaceId || 'ws_vakzim'}
                            </span>
                            <span className="text-sky-400 font-semibold">
                              &bull; Saved by: {c.savedByName || c.createdByName || c.lastAgentName || 'Workspace Member'} {c.savedByUserRole || c.createdByUserRole ? `(${c.savedByUserRole || c.createdByUserRole})` : ''}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 pt-2 sm:pt-0">
                        <div className="text-left sm:text-right font-mono">
                          <div className="text-xs font-black text-emerald-500">
                            ${(c.totalSpend || 0).toFixed(2)} spent
                          </div>
                          <div className="text-[10px] text-amber-500">
                            ${(c.totalSaved || 0).toFixed(2)} saved
                          </div>
                        </div>

                        {/* Admin Quick Streak Adjust Buttons */}
                        {isAdmin && (
                          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
                            <button
                              type="button"
                              onClick={() => handleQuickStreakAdjust(c, -1)}
                              disabled={currentStreak <= 0}
                              className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-30 cursor-pointer"
                              title="Decrease Streak"
                            >
                              -
                            </button>
                            <span className="text-xs font-mono font-bold px-1.5 text-amber-500">
                              {currentStreak}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleQuickStreakAdjust(c, 1)}
                              disabled={currentStreak >= 12}
                              className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-30 cursor-pointer"
                              title="Increase Streak (Facilitates reward)"
                            >
                              +
                            </button>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => setEditingCustomer(c)}
                          className="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-500/10 rounded-lg transition cursor-pointer"
                          title="Edit Customer Profile"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setCustomerToDelete(c)}
                          className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition cursor-pointer"
                          title={`Delete ${c.name} from Customer Registry`}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-400 hover:text-rose-500" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {filteredCustomers.length === 0 && (
                  <div className="py-12 text-center text-xs text-slate-400 font-mono border border-dashed rounded-2xl border-slate-800">
                    No customers found matching search query.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`p-4 border-t flex items-center justify-between gap-3 shrink-0 ${
          theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
        }`}>
          <div className="text-[11px] font-mono text-slate-400">
            {activeTab === 'settings'
              ? 'Changes synchronize in real-time with all terminal nodes in this workspace'
              : (customerSearchQuery.trim() || customerTypeFilter !== 'all')
                ? `Showing ${visibleCount} of ${totalRegistryCount} registered customer records`
                : `${totalRegistryCount} registered customer records`}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition cursor-pointer ${
                theme === 'light' ? 'bg-slate-200 hover:bg-slate-300 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              }`}
            >
              Close
            </button>

            {activeTab === 'settings' && !isAgent && (
              <button
                type="button"
                onClick={handleSaveAllSettings}
                disabled={isSaving}
                className="px-5 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white rounded-xl text-xs font-mono font-bold shadow-md transition cursor-pointer flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Saving...' : 'Save Configuration'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Delete Customer Confirmation Modal */}
      {customerToDelete && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className={`border rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 ${
            theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <div className="flex items-center gap-3 text-rose-500">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-500" />
              </div>
              <div>
                <h4 className="font-bold text-sm font-display">Delete Customer Profile</h4>
                <p className="text-[11px] text-slate-400 font-mono">Registry Removal & Audit Trail</p>
              </div>
            </div>

            <div className="text-xs space-y-2 font-mono">
              <p className={theme === 'light' ? 'text-slate-700' : 'text-slate-300'}>
                Are you sure you want to delete customer <strong className={theme === 'light' ? 'text-slate-900' : 'text-white'}>{customerToDelete.name}</strong> ({customerToDelete.customerNumber})?
              </p>
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[11px] space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Administrative Activity Log</span>
                </div>
                <p>
                  This deletion will be permanently logged in the Admin Activity Trail: <strong>{currentUser?.name || currentUser?.email || 'Agent'} deleted customer {customerToDelete.customerNumber || customerToDelete.name}</strong>.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCustomerToDelete(null)}
                disabled={isDeleting}
                className="px-3.5 py-1.5 rounded-xl text-xs font-mono font-semibold text-slate-400 hover:text-slate-200 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!customerToDelete) return;
                  setIsDeleting(true);
                  try {
                    await deleteCustomer(customerToDelete.id);
                    const deletedName = customerToDelete.name;
                    setEditingCustomer(null);
                    setCustomerToDelete(null);
                    showToast(`✓ Customer record ${deletedName} deleted from registry.`, 'success');
                    if (initialEditingCustomer) {
                      onClose();
                    }
                  } catch (err: any) {
                    console.warn("Error deleting customer:", err);
                    showToast(`Failed to delete customer: ${err?.message || 'Unknown error'}`, 'error');
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                disabled={isDeleting}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-mono font-bold shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeleting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Confirm Deletion</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Customer Import Modal */}
      <BulkCustomerImportModal
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        existingCustomers={customers}
        onImportCustomers={bulkAddCustomers}
        theme={theme}
      />

      {/* Customer Export Registry Modal */}
      <CustomerExportModal
        isOpen={isCustomerExportOpen}
        onClose={() => setIsCustomerExportOpen(false)}
        customers={customers}
        theme={theme}
        showToast={showToast}
      />

      {/* Universal Phonebook Directory & Contact Picker Modal */}
      <PhonebookLookupModal
        isOpen={isPhonebookOpen}
        onClose={() => setIsPhonebookOpen(false)}
        onSelectContact={handleSelectPhonebookContact}
        theme={theme}
        currentCustomerName={editingCustomer?.name}
        currentCustomerCell={editingCustomer?.cellNumber}
        existingCustomers={customers}
      />
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalMarkup, document.body) : modalMarkup;
};
