import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  BookUser,
  Search,
  UserPlus,
  Smartphone,
  Phone,
  Check,
  X,
  Upload,
  UserCheck,
  Sparkles,
  Building,
  Tag,
  AlertCircle,
  Trash2,
  ExternalLink,
  Users
} from 'lucide-react';
import { Customer } from '../types';

export interface PhonebookContact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  organization?: string;
  category?: 'client' | 'lead' | 'vip' | 'supplier' | 'general';
  notes?: string;
  addedAt?: string;
}

interface PhonebookLookupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectContact: (contact: { name: string; phone: string; email?: string; notes?: string }) => void;
  theme: 'light' | 'dark';
  currentCustomerName?: string;
  currentCustomerCell?: string;
  existingCustomers?: Customer[];
}

export const PHONEBOOK_STORAGE_KEY = 'wivote_phonebook_directory';

/**
 * Checks if the Web Contact Picker API is available in the current browser/device
 */
export function isNativeContactPickerAvailable(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'contacts' in navigator &&
    'ContactsManager' in window
  );
}

/**
 * Directly prompts native mobile device phonebook to select a contact
 * Returns the selected contact's name, phone, and email immediately.
 */
export async function pickFromNativePhonebook(): Promise<{
  success: boolean;
  contact?: { name: string; phone: string; email?: string; notes?: string };
  cancelled?: boolean;
  error?: string;
  unsupported?: boolean;
}> {
  if (!isNativeContactPickerAvailable()) {
    return {
      success: false,
      unsupported: true,
      error: 'Native Contact Picker API is supported on mobile devices (Android Chrome). Use directory lookup on desktop.'
    };
  }

  try {
    const navAny = navigator as any;
    const props = ['name', 'tel', 'email'];
    const results = await navAny.contacts.select(props, { multiple: false });

    if (!results || results.length === 0) {
      return { success: false, cancelled: true };
    }

    const picked = results[0];
    const contactName = Array.isArray(picked.name) ? picked.name[0] : (picked.name || '');
    const contactTel = Array.isArray(picked.tel) ? picked.tel[0] : (picked.tel || '');
    const contactEmail = Array.isArray(picked.email) ? picked.email[0] : (picked.email || '');

    if (!contactName && !contactTel) {
      return { success: false, error: 'Selected contact had neither a name nor a phone number.' };
    }

    // Save to phonebook directory in localStorage for future quick access
    try {
      const saved = localStorage.getItem(PHONEBOOK_STORAGE_KEY);
      const list = saved ? JSON.parse(saved) : [];
      const newEntry: PhonebookContact = {
        id: `native-${Date.now()}`,
        name: contactName || 'Mobile Contact',
        phone: contactTel || '',
        email: contactEmail || undefined,
        organization: 'Native Phonebook',
        category: 'client',
        addedAt: new Date().toISOString().split('T')[0]
      };
      const filtered = Array.isArray(list) ? list.filter((c: any) => c.phone !== newEntry.phone) : [];
      localStorage.setItem(PHONEBOOK_STORAGE_KEY, JSON.stringify([newEntry, ...filtered]));
    } catch (e) {
      // Ignore
    }

    return {
      success: true,
      contact: {
        name: contactName,
        phone: contactTel,
        email: contactEmail,
        notes: 'Native Device Phonebook'
      }
    };
  } catch (err: any) {
    if (err.name === 'AbortError' || err.message?.includes('cancel') || err.message?.includes('User cancelled')) {
      return { success: false, cancelled: true };
    }
    return { success: false, error: err.message || 'Failed to open native device phonebook.' };
  }
}

// Baseline starter contacts if phonebook is empty
const INITIAL_DIRECTORY: PhonebookContact[] = [
  {
    id: 'pb-001',
    name: 'Tendai Moyo',
    phone: '+263 77 234 5678',
    email: 'tendai.moyo@gmail.com',
    organization: 'Harare CBD Hub',
    category: 'client',
    notes: 'Regular 5GB voucher buyer',
    addedAt: '2026-09-01'
  },
  {
    id: 'pb-002',
    name: 'Farai Chidzero',
    phone: '+263 71 890 1234',
    email: 'farai.ch@techzim.co.zw',
    organization: 'Avondale Plaza',
    category: 'vip',
    notes: 'Bulk office voucher coordinator',
    addedAt: '2026-09-05'
  },
  {
    id: 'pb-003',
    name: 'Grace Mutasa',
    phone: '+263 73 456 7890',
    email: 'gmutasa@econet.co.zw',
    organization: 'Mutasa Logistics',
    category: 'lead',
    notes: 'Interested in unlimited monthly plan',
    addedAt: '2026-09-10'
  },
  {
    id: 'pb-004',
    name: 'Kudakwashe Dube',
    phone: '+263 77 567 8901',
    email: 'kdube@gmail.com',
    organization: 'Bulawayo Express',
    category: 'client',
    notes: 'Loyal customer streak 6',
    addedAt: '2026-09-12'
  },
  {
    id: 'pb-005',
    name: 'Memory Sibanda',
    phone: '+263 78 123 9876',
    organization: 'Chitungwiza Unit L',
    category: 'general',
    notes: 'Walk-in referral',
    addedAt: '2026-09-15'
  }
];

export const PhonebookLookupModal: React.FC<PhonebookLookupModalProps> = ({
  isOpen,
  onClose,
  onSelectContact,
  theme,
  currentCustomerName = '',
  currentCustomerCell = '',
  existingCustomers = []
}) => {
  const [contacts, setContacts] = useState<PhonebookContact[]>(() => {
    try {
      const saved = localStorage.getItem(PHONEBOOK_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      // Ignore
    }
    return INITIAL_DIRECTORY;
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [devicePickerError, setDevicePickerError] = useState<string | null>(null);
  const [isPickingFromDevice, setIsPickingFromDevice] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New Contact Form state
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newOrg, setNewOrg] = useState('');
  const [newCategory, setNewCategory] = useState<'client' | 'lead' | 'vip' | 'supplier' | 'general'>('client');
  const [newNotes, setNewNotes] = useState('');

  // Check if Web Contact Picker API is available
  const hasContactPicker = useMemo(() => {
    return (
      typeof navigator !== 'undefined' &&
      'contacts' in navigator &&
      'ContactsManager' in window
    );
  }, []);

  // Save contacts to localStorage whenever updated
  useEffect(() => {
    try {
      localStorage.setItem(PHONEBOOK_STORAGE_KEY, JSON.stringify(contacts));
    } catch (e) {
      // Ignore
    }
  }, [contacts]);

  // Merge any registered customers that have cell numbers into phonebook suggestions
  const mergedContacts = useMemo(() => {
    const map = new Map<string, PhonebookContact>();

    // 1. Add saved phonebook contacts
    for (const c of contacts) {
      const key = (c.phone || c.name).toLowerCase().replace(/[^a-z0-9]/g, '');
      if (key) map.set(key, c);
    }

    // 2. Add existing registered customers that are not yet in phonebook
    for (const cust of existingCustomers) {
      if (!cust.name || cust.name.toLowerCase() === 'walk-in client') continue;
      const key = (cust.cellNumber || cust.name).toLowerCase().replace(/[^a-z0-9]/g, '');
      if (key && !map.has(key)) {
        map.set(key, {
          id: `cust-${cust.id}`,
          name: cust.name,
          phone: cust.cellNumber || '',
          organization: 'Customer Registry',
          category: (cust.streakCount && cust.streakCount >= 5) ? 'vip' : 'client',
          notes: cust.customerNumber ? `Cust No: ${cust.customerNumber}` : 'Customer Registry',
          addedAt: cust.createdAt ? new Date(cust.createdAt).toISOString().split('T')[0] : undefined
        });
      }
    }

    return Array.from(map.values());
  }, [contacts, existingCustomers]);

  // Filtered contacts based on search query and category
  const filteredContacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return mergedContacts.filter((c) => {
      // Category filter
      if (selectedCategory !== 'all' && c.category !== selectedCategory) {
        return false;
      }

      // Query filter
      if (!q) return true;
      const matchName = c.name.toLowerCase().includes(q);
      const matchPhone = c.phone.toLowerCase().replace(/[\s-]/g, '').includes(q.replace(/[\s-]/g, ''));
      const matchOrg = c.organization?.toLowerCase().includes(q);
      const matchNotes = c.notes?.toLowerCase().includes(q);
      const matchEmail = c.email?.toLowerCase().includes(q);
      return matchName || matchPhone || matchOrg || matchNotes || matchEmail;
    });
  }, [mergedContacts, searchQuery, selectedCategory]);

  if (!isOpen) return null;

  // Handle picking from native device contacts via Web Contact Picker API
  const handlePickFromDeviceContacts = async () => {
    setDevicePickerError(null);
    setIsPickingFromDevice(true);
    try {
      const res = await pickFromNativePhonebook();
      if (res.success && res.contact) {
        onSelectContact(res.contact);
        onClose();
      } else if (res.error) {
        setDevicePickerError(res.error);
      }
    } finally {
      setIsPickingFromDevice(false);
    }
  };

  // Select a contact and populate customer form
  const handleSelect = (contact: PhonebookContact) => {
    onSelectContact({
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      notes: contact.notes || contact.organization
    });
    onClose();
  };

  // Add new contact to phonebook directory
  const handleAddNewContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const newContact: PhonebookContact = {
      id: `manual-${Date.now()}`,
      name: newName.trim(),
      phone: newPhone.trim(),
      email: newEmail.trim() || undefined,
      organization: newOrg.trim() || undefined,
      category: newCategory,
      notes: newNotes.trim() || undefined,
      addedAt: new Date().toISOString().split('T')[0]
    };

    setContacts((prev) => [newContact, ...prev]);
    setIsAddingNew(false);
    setNewName('');
    setNewPhone('');
    setNewEmail('');
    setNewOrg('');
    setNewNotes('');

    setStatusNotice(`✓ Added ${newContact.name} to Phonebook directory.`);
    setTimeout(() => setStatusNotice(null), 3000);
  };

  // Import vCard (.vcf) or CSV file
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) return;

        const imported: PhonebookContact[] = [];

        // Simple vCard parser (.vcf)
        if (file.name.toLowerCase().endsWith('.vcf')) {
          const vcardBlocks = text.split(/BEGIN:VCARD/i).filter((b) => b.trim());
          for (const block of vcardBlocks) {
            let name = '';
            let phone = '';
            let email = '';
            let org = '';

            const lines = block.split(/\r?\n/);
            for (const line of lines) {
              if (line.startsWith('FN:') || line.startsWith('FN;')) {
                name = line.substring(line.indexOf(':') + 1).trim();
              } else if (!name && (line.startsWith('N:') || line.startsWith('N;'))) {
                const parts = line.substring(line.indexOf(':') + 1).split(';');
                name = parts.filter(Boolean).reverse().join(' ').trim();
              } else if (line.includes('TEL') && line.includes(':')) {
                phone = line.substring(line.indexOf(':') + 1).trim();
              } else if (line.includes('EMAIL') && line.includes(':')) {
                email = line.substring(line.indexOf(':') + 1).trim();
              } else if (line.startsWith('ORG:')) {
                org = line.substring(4).trim();
              }
            }

            if (name || phone) {
              imported.push({
                id: `vcf-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                name: name || 'vCard Contact',
                phone: phone || '',
                email: email || undefined,
                organization: org || 'vCard Import',
                category: 'client',
                addedAt: new Date().toISOString().split('T')[0]
              });
            }
          }
        } else {
          // Simple CSV parser (Name, Phone, Email, Org)
          const lines = text.split(/\r?\n/).filter((l) => l.trim());
          for (let i = 0; i < lines.length; i++) {
            const cols = lines[i].split(',').map((c) => c.replace(/^["']|["']$/g, '').trim());
            if (cols.length >= 2) {
              const [name, phone, email, org] = cols;
              if (name.toLowerCase() === 'name' || phone.toLowerCase() === 'phone') continue;
              imported.push({
                id: `csv-${Date.now()}-${i}`,
                name,
                phone: phone || '',
                email: email || undefined,
                organization: org || 'CSV Import',
                category: 'client',
                addedAt: new Date().toISOString().split('T')[0]
              });
            }
          }
        }

        if (imported.length > 0) {
          setContacts((prev) => [...imported, ...prev]);
          setStatusNotice(`✓ Successfully imported ${imported.length} contacts into phonebook.`);
          setTimeout(() => setStatusNotice(null), 4000);
        } else {
          setStatusNotice('No valid contacts found in the uploaded file.');
        }
      } catch (err: any) {
        setStatusNotice('Error reading file. Please check file format.');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeleteContact = (id: string, name: string) => {
    setContacts((prev) => prev.filter((c) => c.id !== id));
    setStatusNotice(`Removed ${name} from phonebook directory.`);
    setTimeout(() => setStatusNotice(null), 2500);
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden text-slate-800 dark:text-slate-100">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/20 shrink-0">
              <BookUser className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold font-display flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <span>Phonebook Directory & Lookup</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-bold shrink-0">
                  {mergedContacts.length} Contacts
                </span>
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate sm:whitespace-normal">
                Look up contacts from your phonebook or device to populate the new customer profile.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer shrink-0 ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status Notice / Feedback */}
        {statusNotice && (
          <div className="px-4 sm:px-6 py-2 bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-mono flex items-center justify-between animate-in fade-in">
            <span>{statusNotice}</span>
            <button onClick={() => setStatusNotice(null)} className="text-emerald-600 hover:text-emerald-800">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Device Picker Error Banner */}
        {devicePickerError && (
          <div className="px-4 sm:px-6 py-2.5 bg-rose-50 dark:bg-rose-950/40 border-b border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span className="flex-1">{devicePickerError}</span>
            <button onClick={() => setDevicePickerError(null)} className="text-rose-400 hover:text-rose-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Quick Action Bar: Device Contact Picker & Import Options */}
        <div className="px-4 sm:px-6 py-2.5 sm:py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-800/40 flex items-center justify-between gap-2 flex-wrap">
          <button
            type="button"
            id="btn-pick-device-contacts"
            onClick={handlePickFromDeviceContacts}
            disabled={isPickingFromDevice}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs ${
              hasContactPicker
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
            }`}
            title={
              hasContactPicker
                ? 'Open native device phonebook to pick a contact'
                : 'Device Contact Picker is active on mobile browsers (Chrome on Android)'
            }
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>{isPickingFromDevice ? 'Opening Phonebook...' : 'Pick from Device Contacts'}</span>
            {hasContactPicker && (
              <span className="text-[9px] px-1 py-0.2 rounded bg-amber-800 text-amber-100 uppercase">
                Native
              </span>
            )}
          </button>

          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              accept=".vcf,.csv,text/vcard,text/csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center gap-1 transition cursor-pointer"
              title="Import contacts from vCard (.vcf) or CSV address book"
            >
              <Upload className="w-3.5 h-3.5 text-slate-500" />
              <span>Import vCard/CSV</span>
            </button>

            <button
              type="button"
              onClick={() => setIsAddingNew(!isAddingNew)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold border transition cursor-pointer flex items-center gap-1 ${
                isAddingNew
                  ? 'bg-amber-500/10 border-amber-500 text-amber-600 dark:text-amber-400'
                  : 'border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{isAddingNew ? 'Close Add Form' : 'Add Contact'}</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-3.5 sm:p-6 overflow-y-auto space-y-4 flex-1">
          
          {/* Add New Contact Form Panel */}
          {isAddingNew && (
            <form onSubmit={handleAddNewContact} className="p-4 rounded-2xl border border-amber-300 dark:border-amber-700/60 bg-amber-50/50 dark:bg-amber-950/20 space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                  <UserPlus className="w-3.5 h-3.5" />
                  Save New Entry in Phonebook Directory
                </span>
                <span className="text-[10px] text-slate-400">Available across all customer forms</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-mono text-slate-500 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Tariro Gumbo"
                    className="w-full border rounded-xl px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-slate-500 mb-1">Cell Number / WhatsApp</label>
                  <input
                    type="text"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="+263 77 000 0000"
                    className="w-full border rounded-xl px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[10px] font-mono text-slate-500 mb-1">Company / Organization</label>
                  <input
                    type="text"
                    value={newOrg}
                    onChange={(e) => setNewOrg(e.target.value)}
                    placeholder="e.g. VakZim Logistics"
                    className="w-full border rounded-xl px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-slate-500 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="tariro@example.com"
                    className="w-full border rounded-xl px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-slate-500 mb-1">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as any)}
                    className="w-full border rounded-xl px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                  >
                    <option value="client">Client / Customer</option>
                    <option value="vip">VIP / High Volume</option>
                    <option value="lead">Prospect / Lead</option>
                    <option value="supplier">Vendor / Logistics</option>
                    <option value="general">General</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-slate-500 mb-1">Internal Reference Notes</label>
                <input
                  type="text"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="e.g. Prefers 5GB weekend vouchers, prompt WhatsApp response"
                  className="w-full border rounded-xl px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsAddingNew(false)}
                  className="px-3 py-1 rounded-xl text-xs font-mono text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 rounded-xl text-xs font-mono font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-xs"
                >
                  Save to Phonebook
                </button>
              </div>
            </form>
          )}

          {/* Search Bar & Category Filters */}
          <div className="space-y-2.5">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search phonebook by name, cell number, or company..."
                className="w-full pl-9 pr-9 py-2 rounded-xl border text-xs bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] font-mono">
              {[
                { id: 'all', label: 'All Contacts' },
                { id: 'client', label: 'Clients' },
                { id: 'vip', label: 'VIP' },
                { id: 'lead', label: 'Leads' },
                { id: 'supplier', label: 'Vendors' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedCategory(tab.id)}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer whitespace-nowrap ${
                    selectedCategory === tab.id
                      ? 'bg-amber-500 text-white font-bold shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Contacts List */}
          <div className="space-y-2">
            {filteredContacts.length === 0 ? (
              <div className="p-8 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                <BookUser className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-600 dark:text-slate-400">
                  No contacts found matching &ldquo;{searchQuery}&rdquo;
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  You can click &ldquo;Add Contact&rdquo; above or use &ldquo;Pick from Device Contacts&rdquo; to populate directly.
                </p>
              </div>
            ) : (
              filteredContacts.map((contact) => {
                const initials = contact.name
                  .split(' ')
                  .map((p) => p[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join('')
                  .toUpperCase();

                const isCurrentMatch =
                  (currentCustomerName &&
                    contact.name.toLowerCase() === currentCustomerName.trim().toLowerCase()) ||
                  (currentCustomerCell &&
                    contact.phone &&
                    contact.phone.replace(/[\s-]/g, '') === currentCustomerCell.replace(/[\s-]/g, ''));

                return (
                  <div
                    key={contact.id}
                    className={`p-3 rounded-2xl border transition flex items-center justify-between gap-3 ${
                      isCurrentMatch
                        ? 'border-amber-500/60 bg-amber-50/40 dark:bg-amber-950/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/40'
                    }`}
                  >
                    {/* Left: Avatar + Details */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-xs font-bold font-mono text-slate-600 dark:text-slate-300 shrink-0">
                        {initials || 'C'}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                            {contact.name}
                          </span>
                          {contact.category && (
                            <span
                              className={`text-[9px] font-mono px-1.5 py-0.2 rounded uppercase font-bold ${
                                contact.category === 'vip'
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                  : contact.category === 'lead'
                                  ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
                                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                              }`}
                            >
                              {contact.category}
                            </span>
                          )}
                          {isCurrentMatch && (
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold">
                              Current Profile
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex-wrap">
                          {contact.phone && (
                            <span className="font-mono flex items-center gap-1 text-slate-700 dark:text-slate-300 font-medium">
                              <Phone className="w-3 h-3 text-slate-400" />
                              {contact.phone}
                            </span>
                          )}
                          {contact.organization && (
                            <span className="flex items-center gap-1 truncate text-slate-400">
                              <Building className="w-3 h-3" />
                              {contact.organization}
                            </span>
                          )}
                          {contact.notes && (
                            <span className="truncate text-slate-400 text-[10px]">
                              &bull; {contact.notes}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {contact.id.startsWith('manual-') || contact.id.startsWith('vcf-') || contact.id.startsWith('csv-') ? (
                        <button
                          type="button"
                          onClick={() => handleDeleteContact(contact.id, contact.name)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                          title="Remove contact from phonebook directory"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => handleSelect(contact)}
                        className="px-3 py-1.5 rounded-xl text-xs font-mono font-bold bg-amber-500 hover:bg-amber-600 text-white transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                        title={`Select ${contact.name} and populate customer form`}
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Pick & Populate</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex items-center justify-between">
          <span className="text-xs text-slate-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            Pick any contact to instantly populate Name & Cell in customer registry
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-mono font-bold border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
