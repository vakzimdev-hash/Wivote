import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronDown, Search, X, Globe, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../context/AppContext';

export interface CountryInfo {
  code: string;       // Dial code, e.g. "+263"
  iso: string;        // ISO 2-letter code, e.g. "ZW"
  name: string;       // Country name, e.g. "Zimbabwe"
  flag: string;       // Emoji flag, e.g. "🇿🇼"
  placeholder: string;// Example national number, e.g. "771234567"
  priority?: number;  // Higher priority shown at top
}

export const INTERNATIONAL_COUNTRIES: CountryInfo[] = [
  // Primary regional countries (high priority)
  { code: '+263', iso: 'ZW', name: 'Zimbabwe', flag: '🇿🇼', placeholder: '771234567', priority: 1 },
  { code: '+27', iso: 'ZA', name: 'South Africa', flag: '🇿🇦', placeholder: '821234567', priority: 2 },
  { code: '+260', iso: 'ZM', name: 'Zambia', flag: '🇿🇲', placeholder: '971234567', priority: 3 },
  { code: '+267', iso: 'BW', name: 'Botswana', flag: '🇧🇼', placeholder: '71234567', priority: 4 },
  { code: '+258', iso: 'MZ', name: 'Mozambique', flag: '🇲🇿', placeholder: '841234567', priority: 5 },
  { code: '+264', iso: 'NA', name: 'Namibia', flag: '🇳🇦', placeholder: '811234567', priority: 6 },
  { code: '+265', iso: 'MW', name: 'Malawi', flag: '🇲🇼', placeholder: '991234567', priority: 7 },
  { code: '+254', iso: 'KE', name: 'Kenya', flag: '🇰🇪', placeholder: '712345678', priority: 8 },
  { code: '+255', iso: 'TZ', name: 'Tanzania', flag: '🇹🇿', placeholder: '712345678', priority: 9 },
  { code: '+256', iso: 'UG', name: 'Uganda', flag: '🇺🇬', placeholder: '712345678', priority: 10 },
  { code: '+250', iso: 'RW', name: 'Rwanda', flag: '🇷🇼', placeholder: '781234567', priority: 11 },
  { code: '+234', iso: 'NG', name: 'Nigeria', flag: '🇳🇬', placeholder: '8031234567', priority: 12 },
  { code: '+233', iso: 'GH', name: 'Ghana', flag: '🇬🇭', placeholder: '241234567', priority: 13 },
  { code: '+244', iso: 'AO', name: 'Angola', flag: '🇦🇴', placeholder: '923123456', priority: 14 },
  { code: '+243', iso: 'CD', name: 'DR Congo', flag: '🇨🇩', placeholder: '812345678', priority: 15 },
  { code: '+251', iso: 'ET', name: 'Ethiopia', flag: '🇪🇹', placeholder: '911234567', priority: 16 },
  { code: '+20', iso: 'EG', name: 'Egypt', flag: '🇪🇬', placeholder: '1012345678', priority: 17 },

  // Key global commerce & diaspora hubs
  { code: '+44', iso: 'GB', name: 'United Kingdom', flag: '🇬🇧', placeholder: '7123456789', priority: 20 },
  { code: '+1', iso: 'US', name: 'United States', flag: '🇺🇸', placeholder: '2015550123', priority: 21 },
  { code: '+1', iso: 'CA', name: 'Canada', flag: '🇨🇦', placeholder: '4165550123', priority: 22 },
  { code: '+61', iso: 'AU', name: 'Australia', flag: '🇦🇺', placeholder: '412345678', priority: 23 },
  { code: '+971', iso: 'AE', name: 'United Arab Emirates', flag: '🇦🇪', placeholder: '501234567', priority: 24 },
  { code: '+966', iso: 'SA', name: 'Saudi Arabia', flag: '🇸🇦', placeholder: '512345678', priority: 25 },
  { code: '+91', iso: 'IN', name: 'India', flag: '🇮🇳', placeholder: '9812345678', priority: 26 },
  { code: '+86', iso: 'CN', name: 'China', flag: '🇨🇳', placeholder: '13812345678', priority: 27 },
  { code: '+49', iso: 'DE', name: 'Germany', flag: '🇩🇪', placeholder: '15112345678', priority: 28 },
  { code: '+33', iso: 'FR', name: 'France', flag: '🇫🇷', placeholder: '612345678', priority: 29 },
  { code: '+39', iso: 'IT', name: 'Italy', flag: '🇮🇹', placeholder: '3123456789', priority: 30 },
  { code: '+34', iso: 'ES', name: 'Spain', flag: '🇪🇸', placeholder: '612345678', priority: 31 },
  { code: '+351', iso: 'PT', name: 'Portugal', flag: '🇵🇹', placeholder: '912345678', priority: 32 },
  { code: '+31', iso: 'NL', name: 'Netherlands', flag: '🇳🇱', placeholder: '612345678', priority: 33 },
  { code: '+32', iso: 'BE', name: 'Belgium', flag: '🇧🇪', placeholder: '470123456', priority: 34 },
  { code: '+41', iso: 'CH', name: 'Switzerland', flag: '🇨🇭', placeholder: '781234567', priority: 35 },
  { code: '+46', iso: 'SE', name: 'Sweden', flag: '🇸🇪', placeholder: '701234567', priority: 36 },
  { code: '+47', iso: 'NO', name: 'Norway', flag: '🇳🇴', placeholder: '41234567', priority: 37 },
  { code: '+353', iso: 'IE', name: 'Ireland', flag: '🇮🇪', placeholder: '831234567', priority: 38 },
  { code: '+64', iso: 'NZ', name: 'New Zealand', flag: '🇳🇿', placeholder: '211234567', priority: 39 },
  { code: '+81', iso: 'JP', name: 'Japan', flag: '🇯🇵', placeholder: '9012345678', priority: 40 },
  { code: '+82', iso: 'KR', name: 'South Korea', flag: '🇰🇷', placeholder: '1012345678', priority: 41 },
  { code: '+65', iso: 'SG', name: 'Singapore', flag: '🇸🇬', placeholder: '81234567', priority: 42 },
  { code: '+60', iso: 'MY', name: 'Malaysia', flag: '🇲🇾', placeholder: '123456789', priority: 43 },
  { code: '+62', iso: 'ID', name: 'Indonesia', flag: '🇮🇩', placeholder: '8123456789', priority: 44 },
  { code: '+55', iso: 'BR', name: 'Brazil', flag: '🇧🇷', placeholder: '11912345678', priority: 45 },
  { code: '+52', iso: 'MX', name: 'Mexico', flag: '🇲🇽', placeholder: '5512345678', priority: 46 },
  { code: '+54', iso: 'AR', name: 'Argentina', flag: '🇦🇷', placeholder: '91112345678', priority: 47 },
  { code: '+90', iso: 'TR', name: 'Turkey', flag: '🇹🇷', placeholder: '5321234567', priority: 48 },
  { code: '+92', iso: 'PK', name: 'Pakistan', flag: '🇵🇰', placeholder: '3001234567', priority: 49 },
  { code: '+880', iso: 'BD', name: 'Bangladesh', flag: '🇧🇩', placeholder: '1712345678', priority: 50 },
  { code: '+63', iso: 'PH', name: 'Philippines', flag: '🇵🇭', placeholder: '9171234567', priority: 51 },
  { code: '+84', iso: 'VN', name: 'Vietnam', flag: '🇻🇳', placeholder: '901234567', priority: 52 },
  { code: '+66', iso: 'TH', name: 'Thailand', flag: '🇹🇭', placeholder: '812345678', priority: 53 },
  { code: '+212', iso: 'MA', name: 'Morocco', flag: '🇲🇦', placeholder: '612345678', priority: 54 },
  { code: '+216', iso: 'TN', name: 'Tunisia', flag: '🇹🇳', placeholder: '20123456', priority: 55 },
  { code: '+213', iso: 'DZ', name: 'Algeria', flag: '🇩🇿', placeholder: '551234567', priority: 56 },
  { code: '+230', iso: 'MU', name: 'Mauritius', flag: '🇲🇺', placeholder: '57123456', priority: 57 },
  { code: '+248', iso: 'SC', name: 'Seychelles', flag: '🇸🇨', placeholder: '2512345', priority: 58 }
];

export interface CountryPhoneInputProps {
  id?: string;
  value: string;
  onChange: (fullNumber: string, nationalNumber?: string, country?: CountryInfo) => void;
  defaultCountryCode?: string;
  countryCode?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  theme?: 'light' | 'dark';
  className?: string;
  label?: string;
  helperText?: string;
  compact?: boolean;
}

export const CountryPhoneInput: React.FC<CountryPhoneInputProps> = ({
  id = 'country-phone-input',
  value,
  onChange,
  defaultCountryCode = '+263',
  countryCode,
  placeholder,
  required = false,
  disabled = false,
  theme = 'dark',
  className = '',
  label,
  helperText,
  compact = false
}) => {
  let context: any = null;
  try {
    context = useApp();
  } catch (e) {
    // Ignore context errors in non-app contexts (e.g. login screen if context not fully ready or fallback)
  }
  const adminCountryCode = context?.activeWorkspace?.telephoneCode;

  // Parse initial value to identify selected country code & national number
  const parseValue = (raw: string, explicitCode?: string): { country: CountryInfo; national: string } => {
    const trimmed = (raw || '').trim();
    const effectiveCode = explicitCode || countryCode || adminCountryCode || defaultCountryCode;
    const def = INTERNATIONAL_COUNTRIES.find(c => c.code === effectiveCode) || INTERNATIONAL_COUNTRIES[0];
    if (!trimmed) {
      return { country: def, national: '' };
    }

    if (trimmed.startsWith('+')) {
      // Try finding matching prefix from our countries list, sorting longest codes first
      const sortedCountries = [...INTERNATIONAL_COUNTRIES].sort((a, b) => b.code.length - a.code.length);
      for (const c of sortedCountries) {
        if (trimmed.startsWith(c.code)) {
          let nationalPart = trimmed.slice(c.code.length).replace(/\D/g, '');
          if (nationalPart.startsWith('0')) {
            nationalPart = nationalPart.slice(1);
          }
          return { country: c, national: nationalPart };
        }
      }
    }

    let fallbackDigits = trimmed.replace(/\D/g, '');
    if (fallbackDigits.startsWith('0')) {
      fallbackDigits = fallbackDigits.slice(1);
    }
    // Fallback: Default country, clean digits
    return { country: def, national: fallbackDigits };
  };

  const initialParsed = parseValue(value, countryCode);
  const [selectedCountry, setSelectedCountry] = useState<CountryInfo>(initialParsed.country);
  const [nationalNumber, setNationalNumber] = useState<string>(initialParsed.national);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const popupRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);

  // Sync state if external adminCountryCode changes
  useEffect(() => {
    if (adminCountryCode && !countryCode) {
      const match = INTERNATIONAL_COUNTRIES.find(c => c.code === adminCountryCode);
      if (match) {
        setSelectedCountry(match);
      }
    }
  }, [adminCountryCode, countryCode]);

  // Sync state if external countryCode changes
  useEffect(() => {
    if (countryCode && countryCode !== selectedCountry.code) {
      const match = INTERNATIONAL_COUNTRIES.find(c => c.code === countryCode);
      if (match) {
        setSelectedCountry(match);
      }
    }
  }, [countryCode]);

  // Sync state if external value changes drastically
  useEffect(() => {
    const parsed = parseValue(value, countryCode);
    const currentCombined = `${selectedCountry.code}${nationalNumber}`;
    if (value && value !== currentCombined && value !== nationalNumber) {
      setSelectedCountry(parsed.country);
      setNationalNumber(parsed.national);
    }
  }, [value]);

  // Focus search input on popup open
  useEffect(() => {
    if (isPopupOpen) {
      setSearchQuery('');
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isPopupOpen]);

  // Click outside to close popup
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setIsPopupOpen(false);
      }
    };
    if (isPopupOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isPopupOpen]);

  // Filter countries by search query
  const filteredCountries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return INTERNATIONAL_COUNTRIES;
    return INTERNATIONAL_COUNTRIES.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      c.iso.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const handleNationalNumberChange = (digits: string) => {
    let cleaned = digits.replace(/\D/g, '');
    if (cleaned.startsWith('0')) {
      cleaned = cleaned.slice(1);
    }
    setNationalNumber(cleaned);
    const full = cleaned ? `${selectedCountry.code}${cleaned}` : '';
    onChange(full, cleaned, selectedCountry);
  };

  const handleSelectCountry = (country: CountryInfo) => {
    setSelectedCountry(country);
    setIsPopupOpen(false);
    const full = nationalNumber ? `${country.code}${nationalNumber}` : '';
    onChange(full, nationalNumber, country);
    phoneInputRef.current?.focus();
  };

  return (
    <div className={`relative ${className}`} id={`${id}-container`}>
      {label && (
        <label
          htmlFor={`${id}-input`}
          className={`block font-mono font-bold uppercase tracking-wider ${
            compact ? 'text-[10px] mb-0.5' : 'text-xs mb-1'
          } ${
            theme === 'light' ? 'text-slate-600' : 'text-slate-400'
          }`}
        >
          {label}
        </label>
      )}

      <div className="relative flex items-stretch">
        {/* Country Selector Trigger Button */}
        <button
          type="button"
          id={`${id}-country-btn`}
          disabled={disabled}
          onClick={() => setIsPopupOpen(!isPopupOpen)}
          aria-haspopup="dialog"
          aria-expanded={isPopupOpen}
          aria-label={`Selected country ${selectedCountry.name} (${selectedCountry.code}). Click to open country code popup selector.`}
          title={`Select Country Code (Current: ${selectedCountry.name} ${selectedCountry.code})`}
          className={`flex items-center gap-1.5 border rounded-l-xl text-xs font-bold font-mono transition cursor-pointer select-none border-r-0 shrink-0 ${
            compact ? 'px-2 py-1.5' : 'px-3 py-2.5'
          } ${
            disabled ? 'opacity-50 cursor-not-allowed' : ''
          } ${
            theme === 'light'
              ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-800'
              : 'bg-slate-800/90 hover:bg-slate-750 border-slate-700 text-slate-100'
          }`}
        >
          <span className="text-base leading-none" role="img" aria-label={selectedCountry.name}>
            {selectedCountry.flag}
          </span>
          <span className="font-bold tracking-tight text-sky-400 font-mono">
            {selectedCountry.code}
          </span>
          <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
            isPopupOpen ? 'rotate-180' : ''
          }`} />
        </button>

        {/* National Number Input Field */}
        <div className="relative flex-grow">
          <input
            ref={phoneInputRef}
            id={`${id}-input`}
            type="tel"
            required={required}
            disabled={disabled}
            value={nationalNumber}
            onChange={(e) => handleNationalNumberChange(e.target.value)}
            placeholder={placeholder || `e.g. ${selectedCountry.placeholder}`}
            className={`w-full border rounded-r-xl text-xs font-mono tracking-wider focus:outline-none transition-all ${
              compact ? 'px-2.5 py-1.5' : 'px-3.5 py-2.5'
            } ${
              theme === 'light'
                ? 'bg-white border-slate-200 text-slate-950 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/20'
                : 'bg-slate-950 border-slate-700 text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500/20'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          />
        </div>
      </div>

      {helperText && (
        <p className={`text-[10px] font-mono mt-1 ${
          theme === 'light' ? 'text-slate-500' : 'text-slate-400'
        }`}>
          {helperText}
        </p>
      )}

      {/* Popover / Modal Popup Selector for Country Telephone Codes */}
      <AnimatePresence>
        {isPopupOpen && (
          <div
            ref={popupRef}
            id={`${id}-popup`}
            role="dialog"
            aria-modal="true"
            aria-label="Country Telephone Code Selector"
            className={`absolute left-0 top-full mt-2 w-72 sm:w-80 rounded-2xl border shadow-2xl z-[100] p-2.5 overflow-hidden backdrop-blur-md ${
              theme === 'light'
                ? 'bg-white/95 border-slate-200 text-slate-900 shadow-slate-300/50'
                : 'bg-slate-900/95 border-slate-700 text-white shadow-black/80'
            }`}
          >
            {/* Header with Search and Close button */}
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-1.5 text-xs font-bold font-display uppercase tracking-wider text-sky-500">
                <Globe className="w-3.5 h-3.5 text-sky-400" />
                <span>Select Country Dial Code</span>
              </div>
              <button
                type="button"
                id={`${id}-close-btn`}
                onClick={() => setIsPopupOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition cursor-pointer"
                title="Close selector"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Live Search Input */}
            <div className="relative mb-2">
              <input
                ref={searchInputRef}
                type="text"
                id={`${id}-search-input`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search country or code (+263)..."
                className={`w-full pl-8 pr-3 py-1.5 rounded-xl border text-xs font-mono focus:outline-none transition ${
                  theme === 'light'
                    ? 'bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-500'
                    : 'bg-slate-950 border-slate-800 text-white focus:border-sky-500'
                }`}
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Country List */}
            <div className="max-h-60 overflow-y-auto space-y-0.5 pr-1 text-xs">
              {filteredCountries.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400 font-mono">
                  No matching country dial code found
                </div>
              ) : (
                filteredCountries.map((country) => {
                  const isSelected = selectedCountry.code === country.code && selectedCountry.iso === country.iso;
                  return (
                    <button
                      key={`${country.iso}-${country.code}`}
                      id={`${id}-item-${country.iso.toLowerCase()}`}
                      type="button"
                      onClick={() => handleSelectCountry(country)}
                      className={`w-full text-left px-2.5 py-2 rounded-xl text-xs font-mono transition flex items-center justify-between gap-2 cursor-pointer ${
                        isSelected
                          ? theme === 'light'
                            ? 'bg-sky-50 text-sky-700 font-bold border border-sky-200'
                            : 'bg-sky-500/15 text-sky-300 font-bold border border-sky-500/30'
                          : theme === 'light'
                            ? 'hover:bg-slate-100 text-slate-800'
                            : 'hover:bg-slate-800/70 text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-base leading-none shrink-0" role="img" aria-label={country.name}>
                          {country.flag}
                        </span>
                        <span className="truncate">{country.name}</span>
                        <span className="text-[10px] uppercase font-bold text-slate-400 px-1 py-0.5 rounded bg-slate-500/10">
                          {country.iso}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="font-bold text-sky-400 font-mono">{country.code}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-sky-400" />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Quick footer showing example formatted number */}
            <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-slate-400">
              <span>Preview:</span>
              <span className="text-sky-400 font-bold">
                {selectedCountry.code}{nationalNumber || selectedCountry.placeholder}
              </span>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
