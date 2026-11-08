import React, { useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { Customer } from '../types';
import { useApp } from '../context/AppContext';
import {
  Upload,
  FileSpreadsheet,
  Clipboard,
  Check,
  AlertTriangle,
  AlertCircle,
  X,
  Plus,
  Trash2,
  Download,
  Search,
  Users,
  RefreshCw,
  Sparkles,
  ArrowRight,
  HelpCircle,
  Radio,
  Flame,
  Cpu,
  Ticket
} from 'lucide-react';

export interface ParsedCustomerRow {
  id: string;
  firstName: string;
  surname: string;
  fullName: string;
  cellNumber: string;
  customerType: 'voucher' | 'legacy_device';
  deviceModel?: string;
  macAddress?: string;
  monthlyPrice?: number;
  streak: number;
  isValid: boolean;
  validationReason?: string;
  isExistingMatch: boolean;
  isBatchDuplicate: boolean;
  duplicateReason?: string;
  matchedExistingCustomer?: Customer;
}

interface BulkCustomerImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingCustomers: Customer[];
  onImportCustomers: (
    entries: Array<{
      name: string;
      firstName?: string;
      surname?: string;
      cellNumber: string;
      customerType?: 'voucher' | 'legacy_device';
      deviceModel?: string;
      macAddress?: string;
      monthlyPrice?: number;
      streak?: number;
    }>,
    options?: {
      skipDuplicates?: boolean;
    }
  ) => Promise<{
    success: boolean;
    addedCount: number;
    updatedCount: number;
    skippedCount: number;
    errors: string[];
    customers: Customer[];
  }>;
  theme: 'light' | 'dark';
}

export const BulkCustomerImportModal: React.FC<BulkCustomerImportModalProps> = ({
  isOpen,
  onClose,
  existingCustomers,
  onImportCustomers,
  theme
}) => {
  const { showToast } = useApp();
  const [activeTab, setActiveTab] = useState<'excel' | 'clipboard' | 'preview'>('excel');
  const [customerCategory, setCustomerCategory] = useState<'voucher' | 'legacy_device'>('voucher');
  const [parsedRows, setParsedRows] = useState<ParsedCustomerRow[]>([]);
  const [clipboardText, setClipboardText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchPreviewTerm, setSearchPreviewTerm] = useState('');
  const [skipDuplicates, setSkipDuplicates] = useState(true); // Default to true per user requirement

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to normalize customer names (removes extra spaces, case insensitive)
  const normalizeName = (str?: string): string => {
    if (!str) return '';
    return str.trim().toLowerCase().replace(/\s+/g, ' ');
  };

  // Fast normalized lookup maps for matching existing customers in registry
  const existingByPhone = useMemo(() => {
    const map = new Map<string, Customer>();
    for (const c of existingCustomers) {
      if (c.cellNumber) {
        const norm = c.cellNumber.replace(/\D/g, '');
        if (norm.length >= 6) {
          map.set(norm, c);
        }
      }
    }
    return map;
  }, [existingCustomers]);

  const existingByName = useMemo(() => {
    const map = new Map<string, Customer>();
    for (const c of existingCustomers) {
      if (c.name) {
        const normN = normalizeName(c.name);
        if (normN) map.set(normN, c);
      }
    }
    return map;
  }, [existingCustomers]);

  const existingByMac = useMemo(() => {
    const map = new Map<string, Customer>();
    for (const c of existingCustomers) {
      if (c.macAddress) {
        const norm = c.macAddress.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        if (norm.length >= 8) {
          map.set(norm, c);
        }
      }
    }
    return map;
  }, [existingCustomers]);

  // Statistics for Preview
  const stats = useMemo(() => {
    const total = parsedRows.length;
    const valid = parsedRows.filter(r => r.isValid).length;
    const existingDuplicates = parsedRows.filter(r => r.isExistingMatch).length;
    const batchDuplicates = parsedRows.filter(r => r.isBatchDuplicate && !r.isExistingMatch).length;
    const totalDuplicates = parsedRows.filter(r => r.isExistingMatch || r.isBatchDuplicate).length;
    const newUniqueCustomers = parsedRows.filter(r => !r.isExistingMatch && !r.isBatchDuplicate && r.isValid).length;
    const toImportCount = skipDuplicates ? newUniqueCustomers : valid;
    return {
      total,
      valid,
      existingDuplicates,
      batchDuplicates,
      totalDuplicates,
      newUniqueCustomers,
      toImportCount
    };
  }, [parsedRows, skipDuplicates]);

  const filteredPreviewRows = useMemo(() => {
    if (!searchPreviewTerm.trim()) return parsedRows;
    const term = searchPreviewTerm.toLowerCase().trim();
    return parsedRows.filter(
      r =>
        r.fullName.toLowerCase().includes(term) ||
        r.firstName.toLowerCase().includes(term) ||
        r.surname.toLowerCase().includes(term) ||
        r.cellNumber.includes(term) ||
        (r.macAddress && r.macAddress.toLowerCase().includes(term)) ||
        (r.deviceModel && r.deviceModel.toLowerCase().includes(term))
    );
  }, [parsedRows, searchPreviewTerm]);

  if (!isOpen) return null;

  // Clean raw phone number (preserves leading +, removes spaces, dashes, parentheses)
  const sanitizePhone = (raw: string): string => {
    if (!raw) return '';
    const trimmed = raw.trim();
    const hasPlus = trimmed.startsWith('+');
    const digits = trimmed.replace(/\D/g, '');
    return hasPlus ? `+${digits}` : digits;
  };

  // Clean MAC address
  const sanitizeMac = (raw: string): string => {
    if (!raw) return '';
    const clean = raw.trim().replace(/[^a-fA-F0-9]/g, '').toUpperCase();
    if (clean.length === 12) {
      return clean.match(/.{1,2}/g)?.join(':') || raw.trim();
    }
    return raw.trim();
  };

  // Convert raw records to ParsedCustomerRow objects with duplicate validation
  const processRawRecords = (
    rawRecords: Array<{
      firstName?: string;
      surname?: string;
      fullName?: string;
      cell?: string;
      deviceModel?: string;
      macAddress?: string;
      monthlyPrice?: string | number;
      streak?: string | number;
    }>,
    forcedCategory?: 'voucher' | 'legacy_device'
  ) => {
    const category = forcedCategory || customerCategory;
    const rows: ParsedCustomerRow[] = [];

    // Track duplicates within the CSV/batch itself
    const seenBatchPhones = new Set<string>();
    const seenBatchNames = new Set<string>();
    const seenBatchMacs = new Set<string>();

    for (let i = 0; i < rawRecords.length; i++) {
      const rec = rawRecords[i];
      let first = (rec.firstName || '').trim();
      let last = (rec.surname || '').trim();
      let full = (rec.fullName || '').trim();
      const rawCell = (rec.cell || '').trim();
      const cleanCell = sanitizePhone(rawCell);
      const rawMac = (rec.macAddress || '').trim();
      const cleanMac = sanitizeMac(rawMac);
      const model = (rec.deviceModel || '').trim();

      // Monthly price parsing
      let price = 10.0;
      if (rec.monthlyPrice !== undefined && rec.monthlyPrice !== '') {
        const parsedPrice = typeof rec.monthlyPrice === 'number' ? rec.monthlyPrice : parseFloat(String(rec.monthlyPrice).replace(/[^0-9.]/g, ''));
        if (!isNaN(parsedPrice) && parsedPrice >= 0) price = parsedPrice;
      }

      // Streak parsing
      let streakCount = 0;
      if (rec.streak !== undefined && rec.streak !== '') {
        const parsedStreak = typeof rec.streak === 'number' ? rec.streak : parseInt(String(rec.streak).replace(/\D/g, ''), 10);
        if (!isNaN(parsedStreak) && parsedStreak >= 0) streakCount = Math.min(12, parsedStreak);
      }

      // If full name is empty but first/surname provided
      if (!full && (first || last)) {
        full = `${first} ${last}`.trim();
      } else if (full && !first && !last) {
        const parts = full.split(/\s+/);
        if (parts.length > 1) {
          first = parts[0];
          last = parts.slice(1).join(' ');
        } else {
          first = full;
          last = '';
        }
      }

      // Skip completely blank rows
      if (!full && !first && !last && !cleanCell && !cleanMac) {
        continue;
      }

      let isValid = true;
      let validationReason: string | undefined;

      if (!full && !first) {
        isValid = false;
        validationReason = 'Customer name is missing';
      }

      const normDigits = cleanCell.replace(/\D/g, '');
      if (cleanCell && normDigits.length < 6) {
        validationReason = 'Phone number seems unusually short (< 6 digits)';
      }

      const normName = normalizeName(full);
      const normMac = cleanMac.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

      // Duplicate validation against existing Customer Registry
      let isExistingMatch = false;
      let isBatchDuplicate = false;
      let duplicateReason: string | undefined;
      let matchedExistingCustomer: Customer | undefined;

      // 1. Check MAC match
      if (normMac.length >= 8 && existingByMac.has(normMac)) {
        isExistingMatch = true;
        matchedExistingCustomer = existingByMac.get(normMac);
        duplicateReason = `MAC Address matches ${matchedExistingCustomer?.customerNumber || 'existing customer'} (${matchedExistingCustomer?.name})`;
      } else if (normDigits.length >= 6 && existingByPhone.has(normDigits)) {
        // 2. Check Phone match
        isExistingMatch = true;
        matchedExistingCustomer = existingByPhone.get(normDigits);
        duplicateReason = `Phone number matches ${matchedExistingCustomer?.customerNumber || 'existing customer'} (${matchedExistingCustomer?.name})`;
      } else if (normName && existingByName.has(normName)) {
        // 3. Check Name match
        isExistingMatch = true;
        matchedExistingCustomer = existingByName.get(normName);
        duplicateReason = `Customer name matches ${matchedExistingCustomer?.customerNumber || 'existing customer'} (${matchedExistingCustomer?.name})`;
      }

      // 4. Intra-batch duplicate check (within the uploaded CSV file)
      if (!isExistingMatch) {
        if (normMac.length >= 8 && seenBatchMacs.has(normMac)) {
          isBatchDuplicate = true;
          duplicateReason = `Duplicate MAC Address in this CSV file`;
        } else if (normDigits.length >= 6 && seenBatchPhones.has(normDigits)) {
          isBatchDuplicate = true;
          duplicateReason = `Duplicate phone number in this CSV file`;
        } else if (normName && seenBatchNames.has(normName)) {
          isBatchDuplicate = true;
          duplicateReason = `Duplicate customer name "${full}" in this CSV file`;
        }
      }

      // Record in batch tracking sets
      if (normMac.length >= 8) seenBatchMacs.add(normMac);
      if (normDigits.length >= 6) seenBatchPhones.add(normDigits);
      if (normName) seenBatchNames.add(normName);

      rows.push({
        id: `row_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
        firstName: first,
        surname: last,
        fullName: full || first,
        cellNumber: rawCell,
        customerType: category,
        deviceModel: model || (category === 'legacy_device' ? 'Legacy Terminal' : undefined),
        macAddress: cleanMac || undefined,
        monthlyPrice: price,
        streak: streakCount,
        isValid,
        validationReason,
        isExistingMatch,
        isBatchDuplicate,
        duplicateReason,
        matchedExistingCustomer
      });
    }

    if (rows.length === 0) {
      setParseError('No valid customer records could be identified from the input.');
    } else {
      setParseError(null);
      setParsedRows(rows);
      setActiveTab('preview');
    }
  };

  // 1. File Upload & CSV / Excel Parsing
  const handleFile = (file: File) => {
    setFileName(file.name);
    setParseError(null);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        if (!worksheet) {
          setParseError('The selected spreadsheet appears to be empty.');
          return;
        }

        const rawSheetData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        if (!rawSheetData || rawSheetData.length === 0) {
          setParseError('The worksheet contains no rows of data.');
          return;
        }

        // Header detection
        let headerRowIdx = -1;
        let colFirstName = -1;
        let colSurname = -1;
        let colFullName = -1;
        let colCell = -1;
        let colModel = -1;
        let colMac = -1;
        let colPrice = -1;
        let colStreak = -1;

        for (let r = 0; r < Math.min(5, rawSheetData.length); r++) {
          const row = rawSheetData[r];
          for (let c = 0; c < row.length; c++) {
            const cellVal = String(row[c] || '').trim().toLowerCase();
            if (cellVal === 'first name' || cellVal === 'firstname' || cellVal === 'fname' || cellVal === 'given name') {
              colFirstName = c;
              headerRowIdx = r;
            } else if (cellVal === 'surname' || cellVal === 'last name' || cellVal === 'lastname' || cellVal === 'lname') {
              colSurname = c;
              headerRowIdx = r;
            } else if (cellVal === 'name' || cellVal === 'full name' || cellVal === 'fullname' || cellVal === 'customer name' || cellVal === 'client name') {
              colFullName = c;
              headerRowIdx = r;
            } else if (
              cellVal.includes('cell') ||
              cellVal.includes('phone') ||
              cellVal.includes('mobile') ||
              cellVal.includes('contact') ||
              cellVal.includes('tel') ||
              cellVal.includes('whatsapp')
            ) {
              colCell = c;
              headerRowIdx = r;
            } else if (cellVal.includes('model') || cellVal.includes('device') || cellVal.includes('terminal')) {
              colModel = c;
              headerRowIdx = r;
            } else if (cellVal.includes('mac') || cellVal.includes('physical address') || cellVal.includes('hardware id')) {
              colMac = c;
              headerRowIdx = r;
            } else if (cellVal.includes('price') || cellVal.includes('fee') || cellVal.includes('rate') || cellVal.includes('cost')) {
              colPrice = c;
              headerRowIdx = r;
            } else if (cellVal.includes('streak') || cellVal.includes('consecutive') || cellVal.includes('reward count')) {
              colStreak = c;
              headerRowIdx = r;
            }
          }
          if (headerRowIdx !== -1) break;
        }

        // Auto-detect category if MAC or Model column is present
        let detectedCategory = customerCategory;
        if (colMac !== -1 || colModel !== -1) {
          detectedCategory = 'legacy_device';
          setCustomerCategory('legacy_device');
        }

        const dataStartIndex = headerRowIdx !== -1 ? headerRowIdx + 1 : 0;
        const rawRecords: Array<{
          firstName?: string;
          surname?: string;
          fullName?: string;
          cell?: string;
          deviceModel?: string;
          macAddress?: string;
          monthlyPrice?: string | number;
          streak?: string | number;
        }> = [];

        for (let r = dataStartIndex; r < rawSheetData.length; r++) {
          const row = rawSheetData[r];
          if (!row || row.length === 0) continue;

          let fName = '';
          let sName = '';
          let fullName = '';
          let cellNo = '';
          let model = '';
          let mac = '';
          let priceVal: any = '';
          let streakVal: any = '';

          if (headerRowIdx !== -1) {
            if (colFirstName !== -1) fName = String(row[colFirstName] || '');
            if (colSurname !== -1) sName = String(row[colSurname] || '');
            if (colFullName !== -1) fullName = String(row[colFullName] || '');
            if (colCell !== -1) cellNo = String(row[colCell] || '');
            if (colModel !== -1) model = String(row[colModel] || '');
            if (colMac !== -1) mac = String(row[colMac] || '');
            if (colPrice !== -1) priceVal = row[colPrice];
            if (colStreak !== -1) streakVal = row[colStreak];
          } else {
            // Positional fallback based on category
            if (detectedCategory === 'legacy_device') {
              fullName = String(row[0] || '');
              cellNo = String(row[1] || '');
              model = String(row[2] || '');
              mac = String(row[3] || '');
              priceVal = row[4];
              streakVal = row[5];
            } else {
              if (row.length >= 4) {
                fName = String(row[0] || '');
                sName = String(row[1] || '');
                cellNo = String(row[2] || '');
                streakVal = row[3];
              } else if (row.length === 3) {
                fName = String(row[0] || '');
                sName = String(row[1] || '');
                cellNo = String(row[2] || '');
              } else if (row.length === 2) {
                fullName = String(row[0] || '');
                cellNo = String(row[1] || '');
              } else if (row.length === 1) {
                fullName = String(row[0] || '');
              }
            }
          }

          rawRecords.push({
            firstName: fName,
            surname: sName,
            fullName,
            cell: cellNo,
            deviceModel: model,
            macAddress: mac,
            monthlyPrice: priceVal,
            streak: streakVal
          });
        }

        processRawRecords(rawRecords, detectedCategory);
      } catch (err: any) {
        console.error('Error parsing spreadsheet:', err);
        setParseError(`Failed to parse file: ${err?.message || 'Unsupported format'}`);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // 2. Clipboard Text Parsing (CSV / TSV / Delimited)
  const parseClipboardContent = (rawText: string) => {
    if (!rawText.trim()) {
      setParseError('Please paste some text into the box or use the paste button.');
      return;
    }

    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) {
      setParseError('No text lines found.');
      return;
    }

    const firstLine = lines[0];
    let delimiter = '\t';
    if (firstLine.includes('\t')) delimiter = '\t';
    else if (firstLine.includes(',')) delimiter = ',';
    else if (firstLine.includes(';')) delimiter = ';';
    else if (firstLine.includes('|')) delimiter = '|';

    const tokens0 = firstLine.split(delimiter).map(t => t.trim().toLowerCase());
    const isHeader0 = tokens0.some(
      t =>
        t.includes('name') ||
        t.includes('surname') ||
        t.includes('cell') ||
        t.includes('phone') ||
        t.includes('mac') ||
        t.includes('model') ||
        t.includes('streak')
    );

    const startIdx = isHeader0 ? 1 : 0;
    const rawRecords: Array<{
      firstName?: string;
      surname?: string;
      fullName?: string;
      cell?: string;
      deviceModel?: string;
      macAddress?: string;
      monthlyPrice?: string;
      streak?: string;
    }> = [];

    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i];
      const tokens = line.split(delimiter).map(t => t.replace(/^["']|["']$/g, '').trim());

      if (customerCategory === 'legacy_device') {
        // Expected: Customer Name, Cell, Device Model, MAC Address, Monthly Price, Streak
        rawRecords.push({
          fullName: tokens[0] || '',
          cell: tokens[1] || '',
          deviceModel: tokens[2] || '',
          macAddress: tokens[3] || '',
          monthlyPrice: tokens[4] || '10.00',
          streak: tokens[5] || '0'
        });
      } else {
        // Expected: First Name, Surname, Cell, Streak
        if (tokens.length >= 4) {
          rawRecords.push({
            firstName: tokens[0],
            surname: tokens[1],
            cell: tokens[2],
            streak: tokens[3]
          });
        } else if (tokens.length === 3) {
          rawRecords.push({
            firstName: tokens[0],
            surname: tokens[1],
            cell: tokens[2]
          });
        } else if (tokens.length === 2) {
          rawRecords.push({
            fullName: tokens[0],
            cell: tokens[1]
          });
        } else if (tokens.length === 1 && tokens[0]) {
          const words = tokens[0].split(/\s+/);
          if (words.length >= 3) {
            rawRecords.push({
              firstName: words[0],
              surname: words[1],
              cell: words.slice(2).join('')
            });
          } else if (words.length === 2) {
            rawRecords.push({
              fullName: words[0],
              cell: words[1]
            });
          }
        }
      }
    }

    processRawRecords(rawRecords);
  };

  const handlePasteFromClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        setClipboardText(text);
        parseClipboardContent(text);
      } else {
        setParseError('Clipboard access is not permitted by your browser. Please paste into the textarea directly using Ctrl+V or Cmd+V.');
      }
    } catch (err: any) {
      console.warn('Clipboard read error:', err);
      setParseError('Please click into the text box below and press Ctrl+V / Cmd+V to paste your customer list.');
    }
  };

  // Generate Sample CSV and Excel Templates
  const handleDownloadSample = (format: 'csv' | 'xlsx' = 'csv', category: 'voucher' | 'legacy_device' = customerCategory) => {
    if (category === 'legacy_device') {
      const sampleData = [
        {
          'Customer Name': 'Grace Ncube',
          'Cell Number': '+263 77 444 8899',
          'Device Model': 'MikroTik hEX RB750Gr3',
          'MAC Address': '00:1A:2B:3C:4D:5E',
          'Monthly Price': 10.00,
          'Streak': 2
        },
        {
          'Customer Name': 'Tendai Mutasa',
          'Cell Number': '+263 73 222 1100',
          'Device Model': 'Ubiquiti UniFi AC Lite',
          'MAC Address': 'F0:9F:C2:11:22:33',
          'Monthly Price': 15.00,
          'Streak': 1
        },
        {
          'Customer Name': 'Farai Gumbo',
          'Cell Number': '+263 77 888 9900',
          'Device Model': 'TP-Link Archer C6',
          'MAC Address': '50:C7:BF:AA:BB:CC',
          'Monthly Price': 10.00,
          'Streak': 0
        }
      ];

      if (format === 'csv') {
        const csvContent =
          'Customer Name,Cell Number,Device Model,MAC Address,Monthly Price,Streak\n' +
          sampleData.map(r => `"${r['Customer Name']}","${r['Cell Number']}","${r['Device Model']}","${r['MAC Address']}",${r['Monthly Price']},${r['Streak']}`).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'legacy_device_customers_template.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(sampleData);
        XLSX.utils.book_append_sheet(wb, ws, 'Legacy_Devices');
        XLSX.writeFile(wb, 'legacy_device_customers_template.xlsx');
      }
    } else {
      const sampleData = [
        { 'First Name': 'Tariro', 'Surname': 'Moyo', 'Cell Number': '+263 77 123 4567', 'Streak': 2 },
        { 'First Name': 'Kudakwashe', 'Surname': 'Sibanda', 'Cell Number': '+263 71 987 6543', 'Streak': 0 },
        { 'First Name': 'Blessing', 'Surname': 'Chikore', 'Cell Number': '+263 78 555 4321', 'Streak': 1 },
        { 'First Name': 'Sarah', 'Surname': 'Dube', 'Cell Number': '+263 77 111 2233', 'Streak': 2 }
      ];

      if (format === 'csv') {
        const csvContent =
          'First Name,Surname,Cell Number,Streak\n' +
          sampleData.map(r => `"${r['First Name']}","${r['Surname']}","${r['Cell Number']}",${r['Streak']}`).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'voucher_customers_template.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(sampleData);
        XLSX.utils.book_append_sheet(wb, ws, 'Voucher_Customers');
        XLSX.writeFile(wb, 'voucher_customers_template.xlsx');
      }
    }
  };

  // Row manipulation in Preview
  const handleUpdateRow = (id: string, field: keyof ParsedCustomerRow, val: any) => {
    setParsedRows(prev =>
      prev.map(row => {
        if (row.id !== id) return row;
        const updated = { ...row, [field]: val };
        if (field === 'firstName' || field === 'surname') {
          const f = field === 'firstName' ? String(val) : row.firstName;
          const s = field === 'surname' ? String(val) : row.surname;
          updated.fullName = `${f} ${s}`.trim();
        }
        updated.isValid = !!(updated.fullName.trim());
        return updated;
      })
    );
  };

  const handleDeleteRow = (id: string) => {
    setParsedRows(prev => prev.filter(r => r.id !== id));
  };

  const handleAddNewBlankRow = () => {
    const newRow: ParsedCustomerRow = {
      id: `row_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      firstName: '',
      surname: '',
      fullName: '',
      cellNumber: '',
      customerType: customerCategory,
      deviceModel: customerCategory === 'legacy_device' ? 'Terminal' : undefined,
      macAddress: '',
      monthlyPrice: 10.0,
      streak: 0,
      isValid: false,
      isExistingMatch: false,
      isBatchDuplicate: false
    };
    setParsedRows(prev => [newRow, ...prev]);
  };

  // Final Submit
  const handleConfirmImport = async () => {
    const rowsToImport = parsedRows.filter(r => {
      if (!r.isValid) return false;
      // Skip duplicates validation rule
      if (skipDuplicates && (r.isExistingMatch || r.isBatchDuplicate)) return false;
      return true;
    });

    if (rowsToImport.length === 0) {
      setParseError('No eligible customer records to import. All rows are either invalid or duplicates.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = rowsToImport.map(r => ({
        name: r.fullName,
        firstName: r.firstName,
        surname: r.surname,
        cellNumber: r.cellNumber,
        customerType: r.customerType,
        deviceModel: r.deviceModel,
        macAddress: r.macAddress,
        monthlyPrice: r.monthlyPrice,
        streak: r.streak
      }));

      const res = await onImportCustomers(payload, { skipDuplicates });
      if (res.success) {
        showToast(
          `✓ Import Successful! Added ${res.addedCount} customer(s). Skipped ${res.skippedCount} duplicate entries.`,
          'success'
        );
        onClose();
      } else {
        setParseError(res.errors.join('; ') || 'Failed to import customers.');
      }
    } catch (err: any) {
      setParseError(err?.message || 'Error occurred during import.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalElement = (
    <div className="fixed inset-0 z-[110] flex items-start justify-center p-2.5 sm:p-4 pt-3 sm:pt-6 md:pt-10 overflow-y-auto bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={`w-full max-w-4xl max-h-[92vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden transition-all my-auto sm:my-0 ${
          theme === 'light'
            ? 'bg-white border-slate-200 text-slate-900 shadow-slate-200/50'
            : 'bg-slate-900 border-slate-800 text-white shadow-black/80'
        }`}
      >
        {/* Modal Header */}
        <div className="px-6 py-4.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center border border-amber-500/20">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold font-display uppercase tracking-tight flex items-center gap-2">
                Universal Customer Registry CSV Import
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  Vouchers &amp; Legacy Terminals
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Import customer lists with duplicate skipping validation and loyalty streak initialization.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Category Selector Bar: Voucher Customers vs Legacy Device Customers */}
        <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-slate-500">Customer Category:</span>
            <div className="inline-flex rounded-xl p-1 bg-slate-200/70 dark:bg-slate-800 border border-slate-300/50 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setCustomerCategory('voucher')}
                className={`px-3 py-1 text-xs font-mono font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                  customerCategory === 'voucher'
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Ticket className="w-3.5 h-3.5" />
                <span>Voucher Customers</span>
              </button>

              <button
                type="button"
                onClick={() => setCustomerCategory('legacy_device')}
                className={`px-3 py-1 text-xs font-mono font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                  customerCategory === 'legacy_device'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>Legacy Device Customers</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleDownloadSample('csv', customerCategory)}
              className="text-[11px] font-mono font-bold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 py-1 px-2.5 rounded-lg hover:bg-amber-500/10 transition cursor-pointer"
              title={`Download sample CSV template for ${customerCategory === 'legacy_device' ? 'Legacy Devices' : 'Voucher Customers'}`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download CSV Template</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation: File vs Clipboard vs Preview */}
        <div className="px-6 pt-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0 bg-slate-50/50 dark:bg-slate-950/30">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('excel')}
              className={`px-4 py-2 text-xs font-mono font-bold rounded-t-xl border-b-2 transition flex items-center gap-2 cursor-pointer ${
                activeTab === 'excel'
                  ? 'border-amber-500 text-amber-500 bg-white dark:bg-slate-900 shadow-xs'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>1. Upload CSV / Excel File</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('clipboard')}
              className={`px-4 py-2 text-xs font-mono font-bold rounded-t-xl border-b-2 transition flex items-center gap-2 cursor-pointer ${
                activeTab === 'clipboard'
                  ? 'border-amber-500 text-amber-500 bg-white dark:bg-slate-900 shadow-xs'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Clipboard className="w-4 h-4" />
              <span>2. Paste from Clipboard</span>
            </button>

            {parsedRows.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`px-4 py-2 text-xs font-mono font-bold rounded-t-xl border-b-2 transition flex items-center gap-2 cursor-pointer ${
                  activeTab === 'preview'
                    ? 'border-amber-500 text-amber-500 bg-white dark:bg-slate-900 shadow-xs'
                    : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>3. Review &amp; Import ({parsedRows.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* Main Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {importSuccessMessage && (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-mono flex items-center gap-3">
              <Check className="w-4 h-4 shrink-0" />
              <div className="font-bold flex-1">{importSuccessMessage}</div>
            </div>
          )}

          {parseError && (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-mono flex items-start gap-3">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-bold">Notice:</span> {parseError}
              </div>
              <button
                type="button"
                onClick={() => setParseError(null)}
                className="text-rose-400 hover:text-rose-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* TAB 1: CSV / EXCEL UPLOAD */}
          {activeTab === 'excel' && (
            <div className="space-y-6">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleFile(file);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-3xl p-10 text-center transition cursor-pointer flex flex-col items-center justify-center gap-3 ${
                  isDragging
                    ? 'border-amber-500 bg-amber-500/10'
                    : theme === 'light'
                    ? 'border-slate-300 hover:border-amber-500 bg-slate-50/60'
                    : 'border-slate-800 hover:border-amber-500/60 bg-slate-950/40'
                }`}
              >
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center border border-amber-500/20 shadow-xs">
                  <Upload className="w-7 h-7" />
                </div>

                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    Drop your CSV or Excel (.xlsx, .xls) customer file here
                  </p>
                  <p className="text-xs text-slate-400 mt-1 font-mono">
                    or click anywhere to browse from your device
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                  <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
                    {customerCategory === 'legacy_device'
                      ? 'Columns: Customer Name, Cell Number, Device Model, MAC Address, Monthly Price, Streak'
                      : 'Columns: First Name, Surname, Cell Number, Streak'}
                  </span>
                  <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                    Automatic duplicate detection &amp; skip
                  </span>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.tsv,.xlsx,.xls,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                  }}
                />
              </div>

              {/* Format Guide Card */}
              <div className={`p-4 rounded-2xl border ${theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800'}`}>
                <h4 className="text-xs font-mono font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-2">
                  <HelpCircle className="w-4 h-4 text-amber-500" />
                  {customerCategory === 'legacy_device'
                    ? 'Legacy Device Customers CSV Format Guide'
                    : 'Voucher Customers CSV Format Guide'}
                </h4>
                {customerCategory === 'legacy_device' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                      <span className="text-emerald-500 font-bold block mb-0.5">Col 1: Customer Name</span>
                      e.g. Grace Ncube, John Phiri
                    </div>
                    <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                      <span className="text-emerald-500 font-bold block mb-0.5">Col 2: Cell / Phone</span>
                      e.g. +263 77 444 8899
                    </div>
                    <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                      <span className="text-emerald-500 font-bold block mb-0.5">Col 3: Device Model</span>
                      e.g. MikroTik hEX, Ubiquiti
                    </div>
                    <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                      <span className="text-emerald-500 font-bold block mb-0.5">Col 4: MAC Address</span>
                      e.g. 00:1A:2B:3C:4D:5E (Skipped if duplicate!)
                    </div>
                    <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                      <span className="text-emerald-500 font-bold block mb-0.5">Col 5: Monthly Price ($)</span>
                      e.g. 10.00, 15.00
                    </div>
                    <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                      <span className="text-emerald-500 font-bold block mb-0.5">Col 6: Streak Count</span>
                      e.g. 2 (facilitates reward immediately!)
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                      <span className="text-amber-500 font-bold block mb-0.5">Col 1: First Name</span>
                      e.g. Tariro, Kudakwashe
                    </div>
                    <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                      <span className="text-amber-500 font-bold block mb-0.5">Col 2: Surname</span>
                      e.g. Moyo, Sibanda
                    </div>
                    <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                      <span className="text-amber-500 font-bold block mb-0.5">Col 3: Cell Number</span>
                      e.g. +263 77 123 4567
                    </div>
                    <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                      <span className="text-amber-500 font-bold block mb-0.5">Col 4: Streak Count</span>
                      e.g. 2 (unlocks reward on next voucher!)
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: CLIPBOARD PASTE */}
          {activeTab === 'clipboard' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Copy rows directly from your CSV or spreadsheet file and paste below.
                </p>

                <button
                  type="button"
                  onClick={handlePasteFromClipboard}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-mono font-bold flex items-center justify-center gap-2 shadow-xs transition cursor-pointer"
                >
                  <Clipboard className="w-3.5 h-3.5" />
                  <span>Paste from System Clipboard</span>
                </button>
              </div>

              <textarea
                value={clipboardText}
                onChange={(e) => setClipboardText(e.target.value)}
                placeholder={
                  customerCategory === 'legacy_device'
                    ? `Paste CSV lines here. Example:\nGrace Ncube,+263 77 444 8899,MikroTik hEX,00:1A:2B:3C:4D:5E,10.00,2\nTendai Mutasa,+263 73 222 1100,Ubiquiti UniFi,F0:9F:C2:11:22:33,15.00,1`
                    : `Paste CSV lines here. Example:\nTariro,Moyo,+263 77 123 4567,2\nKuda,Sibanda,+263 71 987 6543,0\nBlessing,Chikore,0785554321,1`
                }
                rows={9}
                className={`w-full p-4 text-xs font-mono rounded-2xl border focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                  theme === 'light'
                    ? 'bg-slate-50 border-slate-200 text-slate-900'
                    : 'bg-slate-950 border-slate-800 text-white'
                }`}
              />

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setClipboardText('')}
                  className="px-3 py-1.5 text-xs font-mono text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  Clear text
                </button>
                <button
                  type="button"
                  disabled={!clipboardText.trim()}
                  onClick={() => parseClipboardContent(clipboardText)}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                >
                  <span>Parse &amp; Preview Records</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: PREVIEW & VERIFICATION TABLE */}
          {activeTab === 'preview' && (
            <div className="space-y-4">
              {/* Summary Metric Chips */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className={`p-3 rounded-2xl border ${theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800'}`}>
                  <span className="text-[10px] font-mono text-slate-400 block uppercase">Total Parsed</span>
                  <span className="text-lg font-black font-mono text-slate-900 dark:text-white">{stats.total}</span>
                </div>

                <div className="p-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5">
                  <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 block uppercase">Unique New</span>
                  <span className="text-lg font-black font-mono text-emerald-600 dark:text-emerald-400">+{stats.newUniqueCustomers}</span>
                </div>

                <div className="p-3 rounded-2xl border border-amber-500/20 bg-amber-500/5">
                  <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400 block uppercase">Duplicates Found</span>
                  <span className="text-lg font-black font-mono text-amber-600 dark:text-amber-400">{stats.totalDuplicates}</span>
                </div>

                <div className="p-3 rounded-2xl border border-sky-500/20 bg-sky-500/5">
                  <span className="text-[10px] font-mono text-sky-600 dark:text-sky-400 block uppercase">To Import</span>
                  <span className="text-lg font-black font-mono text-sky-600 dark:text-sky-400">{stats.toImportCount}</span>
                </div>
              </div>

              {/* Controls Bar & Duplicate Validation Settings */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={searchPreviewTerm}
                    onChange={(e) => setSearchPreviewTerm(e.target.value)}
                    placeholder="Filter preview by name, cell, MAC, model..."
                    className={`w-full pl-8.5 pr-3 py-1.5 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono ${
                      theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                    }`}
                  />
                </div>

                <div className="flex items-center gap-3">
                  {/* Validation toggle: Skip Duplicate Entries */}
                  <label className="flex items-center gap-2 text-xs font-mono font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-3 py-1.5 rounded-xl border border-amber-500/20 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={skipDuplicates}
                      onChange={(e) => setSkipDuplicates(e.target.checked)}
                      className="rounded border-amber-400 text-amber-500 focus:ring-amber-500 cursor-pointer"
                    />
                    <span>Skip Duplicate Entries (Recommended)</span>
                  </label>

                  <button
                    type="button"
                    onClick={handleAddNewBlankRow}
                    className="px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 hover:border-amber-500 rounded-xl text-xs font-mono font-bold flex items-center gap-1 cursor-pointer transition"
                  >
                    <Plus className="w-3.5 h-3.5 text-amber-500" />
                    <span>Add Row</span>
                  </button>
                </div>
              </div>

              {/* Editable Table */}
              <div className={`rounded-2xl border overflow-hidden ${theme === 'light' ? 'border-slate-200' : 'border-slate-800'}`}>
                <div className="overflow-x-auto max-h-72">
                  <table className="w-full text-left text-xs min-w-[700px]">
                    <thead className={`sticky top-0 z-10 font-mono uppercase text-[10px] tracking-wider text-slate-400 border-b ${
                      theme === 'light' ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800'
                    }`}>
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center">#</th>
                        <th className="py-2.5 px-3">Name</th>
                        <th className="py-2.5 px-3">Cell / WhatsApp</th>
                        {customerCategory === 'legacy_device' && (
                          <>
                            <th className="py-2.5 px-3">Device Model</th>
                            <th className="py-2.5 px-3">MAC Address</th>
                            <th className="py-2.5 px-2 w-20">Monthly $</th>
                          </>
                        )}
                        <th className="py-2.5 px-2 w-20 text-center">Streak</th>
                        <th className="py-2.5 px-3">Validation Status</th>
                        <th className="py-2.5 px-3 w-10 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                      {filteredPreviewRows.length > 0 ? (
                        filteredPreviewRows.map((row, idx) => {
                          const isDup = row.isExistingMatch || row.isBatchDuplicate;
                          const isSkipped = skipDuplicates && isDup;

                          return (
                            <tr
                              key={row.id}
                              className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition ${
                                isSkipped
                                  ? 'opacity-60 bg-amber-500/5'
                                  : !row.isValid
                                  ? 'bg-rose-500/5'
                                  : 'bg-emerald-500/5'
                              }`}
                            >
                              <td className="py-2 px-3 text-center text-slate-400 text-[10px]">
                                {idx + 1}
                              </td>

                              <td className="py-2 px-3">
                                <input
                                  type="text"
                                  value={row.fullName}
                                  onChange={(e) => handleUpdateRow(row.id, 'fullName', e.target.value)}
                                  placeholder="Customer Name"
                                  className={`w-full px-2 py-1 text-xs rounded-lg border ${
                                    theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800 text-white'
                                  }`}
                                />
                              </td>

                              <td className="py-2 px-3">
                                <input
                                  type="text"
                                  value={row.cellNumber}
                                  onChange={(e) => handleUpdateRow(row.id, 'cellNumber', e.target.value)}
                                  placeholder="+263 77..."
                                  className={`w-full px-2 py-1 text-xs rounded-lg border ${
                                    theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800 text-white'
                                  }`}
                                />
                              </td>

                              {customerCategory === 'legacy_device' && (
                                <>
                                  <td className="py-2 px-3">
                                    <input
                                      type="text"
                                      value={row.deviceModel || ''}
                                      onChange={(e) => handleUpdateRow(row.id, 'deviceModel', e.target.value)}
                                      placeholder="Model (e.g. MikroTik)"
                                      className={`w-full px-2 py-1 text-xs rounded-lg border ${
                                        theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800 text-white'
                                      }`}
                                    />
                                  </td>

                                  <td className="py-2 px-3">
                                    <input
                                      type="text"
                                      value={row.macAddress || ''}
                                      onChange={(e) => handleUpdateRow(row.id, 'macAddress', e.target.value)}
                                      placeholder="00:1A:2B:..."
                                      className={`w-full px-2 py-1 text-xs rounded-lg border ${
                                        theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800 text-white'
                                      }`}
                                    />
                                  </td>

                                  <td className="py-2 px-2">
                                    <input
                                      type="number"
                                      step="0.50"
                                      min={0}
                                      value={row.monthlyPrice !== undefined ? row.monthlyPrice : 10}
                                      onChange={(e) => handleUpdateRow(row.id, 'monthlyPrice', parseFloat(e.target.value) || 0)}
                                      className={`w-full px-1.5 py-1 text-xs rounded-lg border text-right ${
                                        theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800 text-white'
                                      }`}
                                    />
                                  </td>
                                </>
                              )}

                              {/* Editable Streak Counter */}
                              <td className="py-2 px-2 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <input
                                    type="number"
                                    min={0}
                                    max={12}
                                    value={row.streak}
                                    onChange={(e) => handleUpdateRow(row.id, 'streak', parseInt(e.target.value, 10) || 0)}
                                    className={`w-14 px-1.5 py-1 text-xs rounded-lg border text-center font-bold ${
                                      row.streak >= 2 ? 'text-amber-500 border-amber-500/40' : ''
                                    } ${
                                      theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800 text-white'
                                    }`}
                                  />
                                </div>
                              </td>

                              {/* Validation Status & Duplicate Indicator */}
                              <td className="py-2 px-3">
                                {isDup ? (
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                      skipDuplicates
                                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                                        : 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20'
                                    }`}
                                    title={row.duplicateReason}
                                  >
                                    <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                                    <span>
                                      {skipDuplicates ? 'Skipped: Duplicate' : 'Will Update Existing'}
                                    </span>
                                  </span>
                                ) : row.isValid ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                    <Sparkles className="w-3 h-3 text-emerald-500 shrink-0" />
                                    <span>Unique New</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                    <AlertTriangle className="w-3 h-3 text-rose-500 shrink-0" />
                                    <span>Invalid</span>
                                  </span>
                                )}
                              </td>

                              <td className="py-2 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRow(row.id)}
                                  className="p-1 text-slate-400 hover:text-rose-500 rounded-lg transition cursor-pointer"
                                  title="Remove row"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={customerCategory === 'legacy_device' ? 9 : 6} className="py-6 text-center text-xs text-slate-400">
                            No records matching your search.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 bg-slate-50/50 dark:bg-slate-950/30">
          <div className="text-xs font-mono text-slate-500">
            {parsedRows.length > 0 && (
              <span>
                Ready to import:{' '}
                <strong className="text-amber-500 font-black">
                  {stats.toImportCount} customers
                </strong>
                {skipDuplicates && stats.totalDuplicates > 0 && (
                  <span className="text-slate-400 ml-2">
                    ({stats.totalDuplicates} duplicate(s) will be safely skipped)
                  </span>
                )}
              </span>
            )}
          </div>

          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => {
                setParsedRows([]);
                setClipboardText('');
                setFileName(null);
                setActiveTab('excel');
              }}
              className="px-3.5 py-2 text-xs font-mono text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-xl transition cursor-pointer"
            >
              Reset
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 dark:border-slate-800 text-xs font-mono font-bold rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              Cancel
            </button>

            {parsedRows.length > 0 && (
              <button
                type="button"
                disabled={isSubmitting || stats.toImportCount === 0}
                onClick={handleConfirmImport}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl text-xs font-mono font-bold flex items-center gap-2 shadow-xs transition cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Processing Import...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Confirm &amp; Import ({stats.toImportCount})</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalElement, document.body) : modalElement;
};
