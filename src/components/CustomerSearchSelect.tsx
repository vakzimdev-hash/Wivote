import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Customer } from '../types';
import { getNextCustomerNumber, calculateActiveStreakCount } from '../utils/loyaltyEngine';
import { fuzzySearchCustomers, HighlightText } from '../utils/fuzzySearch';
import {
  Search,
  UserCheck,
  Plus,
  Sparkles,
  Phone,
  X,
  Award,
  ChevronDown,
  AlertTriangle,
  BookUser,
  Smartphone,
  Users,
  Check,
  User,
  ArrowRight,
  UserPlus
} from 'lucide-react';
import { CountryPhoneInput } from './CountryPhoneInput';
import { PhonebookLookupModal, isNativeContactPickerAvailable, pickFromNativePhonebook } from './PhonebookLookupModal';

interface CustomerSearchSelectProps {
  customers: Customer[];
  selectedCustomer: Customer | null;
  onSelectCustomer: (customer: Customer | null) => void;
  customerName: string;
  onChangeCustomerName: (name: string) => void;
  customerCell: string;
  onChangeCustomerCell: (cell: string) => void;
  masterCountryCode: string;
  theme: 'light' | 'dark';
  isEnforced?: boolean;
  idPrefix?: string;
  labelTitle?: string;
  compact?: boolean;
}

/* Modal for accessing the list of all customers during a sale */
interface AllCustomersListModalProps {
  isOpen: boolean;
  onClose: () => void;
  customers: Customer[];
  onSelectCustomer: (customer: Customer) => void;
  theme: 'light' | 'dark';
  selectedCustomerId?: string;
}

const AllCustomersListModal: React.FC<AllCustomersListModalProps> = ({
  isOpen,
  onClose,
  customers,
  onSelectCustomer,
  theme,
  selectedCustomerId
}) => {
  const [modalSearch, setModalSearch] = useState('');

  if (!isOpen) return null;

  const filteredCustomers = customers.filter((c) => {
    if (!modalSearch.trim()) return true;
    const q = modalSearch.toLowerCase().trim();
    return (
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.cellNumber && c.cellNumber.toLowerCase().includes(q)) ||
      (c.customerNumber && c.customerNumber.toLowerCase().includes(q))
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/80 backdrop-blur-xs animate-fade-in">
      <div
        className={`w-full max-w-2xl max-h-[85vh] rounded-3xl border shadow-2xl flex flex-col overflow-hidden transition ${
          theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-white'
        }`}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-500/5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-500">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base">All Registered Workspace Customers</h3>
              <p className="text-[11px] font-mono text-slate-400">
                {customers.length} Total Customers in Workspace Directory
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Search Input */}
        <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-800">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
            <input
              type="text"
              value={modalSearch}
              onChange={(e) => setModalSearch(e.target.value)}
              placeholder="Filter by Customer No (e.g. CN:01), Name, or Phone..."
              className={`w-full border rounded-xl pl-9 pr-8 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-sky-500 transition ${
                theme === 'light' ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
              }`}
            />
            {modalSearch && (
              <button
                type="button"
                onClick={() => setModalSearch('')}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* List of Customers */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 divide-y divide-slate-100 dark:divide-slate-900 space-y-1">
          {filteredCustomers.length > 0 ? (
            filteredCustomers.map((cust) => {
              const isSelected = selectedCustomerId === cust.id;
              return (
                <div
                  key={cust.id}
                  className={`p-3 rounded-2xl flex items-center justify-between gap-3 transition ${
                    isSelected
                      ? 'bg-sky-500/10 border border-sky-500/30'
                      : theme === 'light'
                      ? 'hover:bg-slate-50'
                      : 'hover:bg-slate-900/60'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white flex items-center justify-center font-mono font-black text-xs shrink-0 shadow-xs">
                      {cust.customerNumber || 'CN'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-xs truncate text-slate-900 dark:text-white">
                          {cust.name}
                        </h4>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 shrink-0">
                          {calculateActiveStreakCount(cust)} Streak
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono truncate flex items-center gap-2 mt-0.5">
                        <span>{cust.cellNumber || 'No Cell Registered'}</span>
                        <span>&bull;</span>
                        <span>{cust.totalPurchases || 0} sales</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onSelectCustomer(cust);
                      onClose();
                    }}
                    className={`px-3 py-1.5 rounded-xl font-mono text-xs font-bold transition flex items-center gap-1 shrink-0 cursor-pointer ${
                      isSelected
                        ? 'bg-sky-500 text-white shadow-xs'
                        : 'bg-sky-500/10 text-sky-600 dark:text-sky-400 hover:bg-sky-500 hover:text-white'
                    }`}
                  >
                    {isSelected ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> Selected
                      </>
                    ) : (
                      <>
                        Select Customer <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              );
            })
          ) : (
            <div className="py-12 text-center text-slate-400 font-mono text-xs">
              No customers match your filter "{modalSearch}".
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-500/5 text-right">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-mono font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 transition cursor-pointer"
          >
            Close Directory
          </button>
        </div>
      </div>
    </div>
  );
};

export const CustomerSearchSelect: React.FC<CustomerSearchSelectProps> = ({
  customers,
  selectedCustomer,
  onSelectCustomer,
  customerName,
  onChangeCustomerName,
  customerCell,
  onChangeCustomerCell,
  masterCountryCode,
  theme,
  isEnforced = false,
  idPrefix = 'customer',
  labelTitle = 'Customer Name & Search',
  compact = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isPhonebookOpen, setIsPhonebookOpen] = useState(false);
  const [isAllCustomersOpen, setIsAllCustomersOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const nextAutoNumber = useMemo(() => getNextCustomerNumber(customers), [customers]);

  // Real-time fuzzy search using whatever text is currently in the integrated Customer Name box
  const fuzzyResults = useMemo(() => {
    if (!customerName.trim()) return [];
    return fuzzySearchCustomers(customers, customerName);
  }, [customers, customerName]);

  // Guard against identical names in customer registry when entering a new name manually
  const duplicateNameMatch = useMemo(() => {
    if (selectedCustomer) return null;
    const trimmed = customerName.trim().toLowerCase();
    if (!trimmed || trimmed === 'walk-in client') return null;
    return customers.find((c) => c.name && c.name.trim().toLowerCase() === trimmed) || null;
  }, [customers, selectedCustomer, customerName]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (customer: Customer) => {
    onSelectCustomer(customer);
    onChangeCustomerName(customer.name);
    onChangeCustomerCell(customer.cellNumber || '');
    setIsOpen(false);
  };

  const handleClearSelected = () => {
    onSelectCustomer(null);
    onChangeCustomerName('');
    onChangeCustomerCell('');
    setIsOpen(true);
  };

  const handleSelectFromPhonebook = (contact: { name: string; phone: string; email?: string }) => {
    const match = customers.find(
      (c) =>
        (contact.phone && c.cellNumber && c.cellNumber.replace(/[\s-]/g, '') === contact.phone.replace(/[\s-]/g, '')) ||
        (c.name && c.name.toLowerCase() === contact.name.toLowerCase())
    );
    if (match) {
      handleSelect(match);
    } else {
      onSelectCustomer(null);
      onChangeCustomerName(contact.name);
      onChangeCustomerCell(contact.phone);
    }
  };

  const handleNativePhonebookLookup = async () => {
    if (isNativeContactPickerAvailable()) {
      try {
        const res = await pickFromNativePhonebook();
        if (res.success && res.contact) {
          handleSelectFromPhonebook(res.contact);
          return;
        }
        if (res.cancelled) {
          return;
        }
      } catch (e) {
        console.warn('Native contact picker error:', e);
      }
    }
    setIsPhonebookOpen(true);
  };

  return (
    <div ref={containerRef} className={compact ? 'space-y-2' : 'space-y-3'}>
      {/* Header with Title and "All Customers List" button */}
      <div className={`flex items-center justify-between flex-wrap gap-1 ${compact ? 'mb-1' : 'mb-1.5'}`}>
        <label
          className={`font-mono font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5 ${
            compact ? 'text-[10px]' : 'text-[11px]'
          }`}
        >
          <UserCheck className="w-3.5 h-3.5 text-sky-500" />
          <span>{labelTitle}</span>
          {isEnforced && <span className="text-red-500 font-bold">*Required</span>}
        </label>

        <div className="flex items-center gap-2">
          {/* Access All Customers List Button */}
          <button
            type="button"
            id={`${idPrefix}-btn-all-customers`}
            onClick={() => setIsAllCustomersOpen(true)}
            className="px-2 py-0.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 text-[10px] font-mono font-bold flex items-center gap-1 transition cursor-pointer border border-sky-500/20"
            title="Access complete list of all registered customers during sale"
          >
            <Users className="w-3 h-3 text-sky-500" />
            <span>All Customers ({customers.length})</span>
          </button>

          <span className="text-[10px] font-mono text-slate-400 hidden sm:inline">
            Next: <strong className="text-sky-600 dark:text-sky-400">{nextAutoNumber}</strong>
          </span>
        </div>
      </div>

      {/* Selected Customer Card or Integrated Input Box */}
      {selectedCustomer ? (
        /* Linked Existing Customer Card */
        <div
          className={`${compact ? 'p-2' : 'p-3'} rounded-2xl border flex items-center justify-between gap-3 transition shadow-xs ${
            theme === 'light'
              ? 'bg-sky-50/80 border-sky-200 text-slate-800'
              : 'bg-sky-950/40 border-sky-500/30 text-white'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`${
                compact ? 'w-8 h-8 text-[11px]' : 'w-10 h-10 text-xs'
              } rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white flex items-center justify-center font-mono font-black shrink-0 shadow-xs`}
            >
              {selectedCustomer.customerNumber}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h5 className="font-bold text-xs truncate text-slate-900 dark:text-white">
                  {selectedCustomer.name}
                </h5>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                  {calculateActiveStreakCount(selectedCustomer)} Streak
                </span>
              </div>
              <div className="text-[10px] text-slate-400 font-mono truncate flex items-center gap-2 mt-0.5">
                <span>{selectedCustomer.cellNumber || 'No Cell Registered'}</span>
                <span>&bull;</span>
                <span>{selectedCustomer.totalPurchases || 0} sales</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            id={`${idPrefix}-btn-change`}
            onClick={handleClearSelected}
            className="px-2 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 transition cursor-pointer flex items-center gap-1 text-[10px] font-mono font-bold shrink-0"
            title="Deselect customer or enter a different name"
            aria-label="Change customer"
          >
            <X className="w-3.5 h-3.5" />
            <span>Change</span>
          </button>
        </div>
      ) : (
        /* Integrated Single Input Box (Searches dynamically as user types new name) */
        <div className="relative">
          <div className="relative flex items-center">
            <Search className={`w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none`} />
            <input
              type="text"
              id={`${idPrefix}-name`}
              value={customerName}
              onChange={(e) => {
                const val = e.target.value;
                onChangeCustomerName(val);
                setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              placeholder="Enter customer name, phone, or CN:01..."
              required={isEnforced}
              className={`w-full border rounded-xl pl-8 pr-10 ${
                compact ? 'py-2 text-xs' : 'py-2.5 text-xs'
              } font-mono focus:outline-none focus:ring-1 focus:ring-sky-500 transition ${
                theme === 'light'
                  ? 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400'
                  : 'bg-slate-900 border-slate-800 text-white placeholder:text-slate-500'
              }`}
            />
            {customerName ? (
              <button
                type="button"
                id={`${idPrefix}-btn-clear`}
                onClick={() => {
                  onChangeCustomerName('');
                  onChangeCustomerCell('');
                  onSelectCustomer(null);
                }}
                className="absolute right-2.5 text-slate-400 hover:text-slate-200 cursor-pointer p-0.5"
                title="Clear input"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 pointer-events-none" />
            )}
          </div>

          {/* Integrated Real-Time Search & Match Dropdown */}
          {isOpen && (
            <div
              className={`absolute left-0 right-0 top-full mt-1.5 z-30 rounded-2xl border shadow-xl max-h-64 overflow-y-auto overflow-x-hidden transition ${
                theme === 'light'
                  ? 'bg-white border-slate-200 divide-y divide-slate-100'
                  : 'bg-slate-950 border-slate-800 divide-y divide-slate-900'
              }`}
            >
              {customerName.trim() ? (
                <>
                  {fuzzyResults.length > 0 ? (
                    <>
                      <div className="p-2 bg-sky-500/5 text-[10px] font-mono font-bold text-sky-600 dark:text-sky-400 flex items-center justify-between">
                        <span>Matching Existing Customers ({fuzzyResults.length})</span>
                        <span className="text-slate-400 font-normal">Click to select right match</span>
                      </div>
                      {fuzzyResults.map(({ customer: cust, matchedFields }) => (
                        <button
                          key={cust.id}
                          type="button"
                          onClick={() => handleSelect(cust)}
                          className="w-full text-left p-2.5 flex items-center justify-between gap-3 transition cursor-pointer hover:bg-sky-50 dark:hover:bg-sky-950/50"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="px-2 py-0.5 rounded-lg text-[10px] font-mono font-black bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 shrink-0">
                              <HighlightText text={cust.customerNumber} indices={matchedFields.customerNumber} />
                            </span>
                            <div className="min-w-0">
                              <div className="text-xs font-bold truncate text-slate-800 dark:text-slate-200">
                                <HighlightText text={cust.name} indices={matchedFields.name} />
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono truncate">
                                <HighlightText text={cust.cellNumber || 'No phone'} indices={matchedFields.cellNumber} />
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="text-[10px] font-mono font-bold text-amber-500 flex items-center gap-1">
                              <Award className="w-3 h-3" />
                              {calculateActiveStreakCount(cust)} Streak
                            </span>
                          </div>
                        </button>
                      ))}

                      {/* Option to proceed with new name even if matches exist */}
                      <button
                        type="button"
                        onClick={() => setIsOpen(false)}
                        className="w-full p-2.5 bg-slate-50 dark:bg-slate-900/60 text-left hover:bg-slate-100 dark:hover:bg-slate-900 transition flex items-center gap-2 text-xs font-mono text-slate-600 dark:text-slate-300"
                      >
                        <UserPlus className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span className="truncate">
                          Proceed as new customer: <strong className="text-emerald-600 dark:text-emerald-400">"{customerName}"</strong>
                        </span>
                        <span className="text-[10px] text-slate-400 ml-auto shrink-0">({nextAutoNumber})</span>
                      </button>
                    </>
                  ) : (
                    /* No matches found - option to proceed with new name */
                    <div className="p-3 text-center space-y-2">
                      <p className="text-xs text-slate-400 font-mono">
                        No existing customer matching "<strong className="text-slate-700 dark:text-slate-200">{customerName}</strong>"
                      </p>
                      <button
                        type="button"
                        onClick={() => setIsOpen(false)}
                        className="w-full py-2 px-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs font-mono font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Proceed with "{customerName}" as New Customer ({nextAutoNumber})</span>
                      </button>
                    </div>
                  )}
                </>
              ) : (
                /* Empty query state: Quick actions & All Customers link */
                <div className="p-2 space-y-1">
                  <div className="px-2 py-1 text-[10px] font-mono text-slate-400 flex items-center justify-between">
                    <span>Quick Select / Directory</span>
                    <button
                      type="button"
                      onClick={() => {
                        onChangeCustomerName('Walk-in Client');
                        onChangeCustomerCell('N/A');
                        onSelectCustomer(null);
                        setIsOpen(false);
                      }}
                      className="text-sky-500 hover:underline cursor-pointer"
                    >
                      Fill "Walk-in Client"
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      setIsAllCustomersOpen(true);
                    }}
                    className="w-full p-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 text-xs font-mono font-bold flex items-center gap-2 transition cursor-pointer"
                  >
                    <Users className="w-4 h-4 text-sky-500" />
                    <span>Browse All Registered Customers ({customers.length})</span>
                  </button>

                  {customers.length > 0 && (
                    <div className="pt-1 border-t border-slate-100 dark:border-slate-900">
                      <span className="px-2 text-[9px] font-mono text-slate-400 block mb-1">
                        Recent Customers:
                      </span>
                      {customers.slice(0, 4).map((cust) => (
                        <button
                          key={cust.id}
                          type="button"
                          onClick={() => handleSelect(cust)}
                          className="w-full text-left p-1.5 px-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 text-xs font-mono flex items-center justify-between transition cursor-pointer"
                        >
                          <span className="truncate text-slate-800 dark:text-slate-200 font-bold">{cust.name}</span>
                          <span className="text-[10px] text-sky-500 font-mono shrink-0">{cust.customerNumber}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Duplicate Name Guard Warning (when manual name matches existing registry customer) */}
      {duplicateNameMatch && !selectedCustomer && (
        <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-[10px] font-mono flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 animate-fade-in">
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="truncate">
              Match in Registry: <strong>{duplicateNameMatch.name}</strong> ({duplicateNameMatch.customerNumber})
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleSelect(duplicateNameMatch)}
            className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded text-[9px] font-bold shrink-0 cursor-pointer transition shadow-xs self-end sm:self-auto"
            title="Link this existing customer record"
          >
            Link Matching Record
          </button>
        </div>
      )}

      {/* Cell / WhatsApp Phone Input with Directory Lookups */}
      <div className="pt-0.5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
            Phone / WhatsApp Number
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              id={`${idPrefix}-btn-phonebook-lookup`}
              onClick={handleNativePhonebookLookup}
              className="text-[10px] font-mono font-bold text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1 cursor-pointer"
              title="Lookup from mobile device phonebook"
            >
              <Smartphone className="w-3 h-3 text-sky-500" />
              <span>Native Phonebook</span>
            </button>
            <button
              type="button"
              onClick={() => setIsPhonebookOpen(true)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-0.5"
              title="Open phonebook directory"
            >
              <BookUser className="w-3 h-3" />
            </button>
          </div>
        </div>

        <CountryPhoneInput
          id={`${idPrefix}-cell`}
          label=""
          value={customerCell}
          countryCode={masterCountryCode}
          defaultCountryCode={masterCountryCode}
          theme={theme}
          required={isEnforced}
          compact={compact}
          placeholder="771234567"
          onChange={(fullNumber) => {
            onChangeCustomerCell(fullNumber);
          }}
        />
      </div>

      {/* Phonebook Directory Modal */}
      <PhonebookLookupModal
        isOpen={isPhonebookOpen}
        onClose={() => setIsPhonebookOpen(false)}
        onSelectContact={handleSelectFromPhonebook}
        theme={theme}
        currentCustomerName={customerName}
        currentCustomerCell={customerCell}
        existingCustomers={customers}
      />

      {/* All Workspace Customers Directory Modal */}
      <AllCustomersListModal
        isOpen={isAllCustomersOpen}
        onClose={() => setIsAllCustomersOpen(false)}
        customers={customers}
        onSelectCustomer={handleSelect}
        theme={theme}
        selectedCustomerId={selectedCustomer?.id}
      />
    </div>
  );
};
