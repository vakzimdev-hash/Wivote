import React, { useState, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import { 
  X, 
  Printer, 
  Download, 
  FileText, 
  FileSpreadsheet, 
  CheckSquare, 
  Square, 
  Search, 
  Layers, 
  User, 
  Check, 
  AlertCircle,
  Copy,
  Users,
  Award,
  Calendar,
  Smartphone
} from 'lucide-react';
import { Customer } from '../types';
import { calculateActiveStreakCount } from '../utils/loyaltyEngine';

interface CustomerExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  customers: Customer[];
  workspaceName?: string;
  theme: 'light' | 'dark';
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const CustomerExportModal: React.FC<CustomerExportModalProps> = ({
  isOpen,
  onClose,
  customers,
  workspaceName = 'WiVoTe Network',
  theme,
  showToast
}) => {
  // --- Form Filters & Sorting ---
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'voucher' | 'legacy_device'>('all');
  const [streakFilter, setStreakFilter] = useState<'all' | 'has_streak' | 'no_streak'>('all');
  const [sortBy, setSortBy] = useState<'number' | 'name' | 'streak' | 'spend' | 'created'>('number');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // --- Selected Customer IDs ---
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Filter and sort the customer registry list based on controls
  const processedCustomers = useMemo(() => {
    let result = [...customers];

    // 1. Text Search Filter (Fuzzy-like or straightforward search on key fields)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c => 
        c.customerNumber.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        (c.cellNumber && c.cellNumber.toLowerCase().includes(q)) ||
        (c.macAddress && c.macAddress.toLowerCase().includes(q)) ||
        (c.deviceModel && c.deviceModel.toLowerCase().includes(q))
      );
    }

    // 2. Type Filter
    if (typeFilter !== 'all') {
      result = result.filter(c => {
        const type = c.customerType || 'voucher';
        return type === typeFilter;
      });
    }

    // 3. Streak Filter
    if (streakFilter === 'has_streak') {
      result = result.filter(c => calculateActiveStreakCount(c) > 0);
    } else if (streakFilter === 'no_streak') {
      result = result.filter(c => calculateActiveStreakCount(c) === 0);
    }

    // 4. Sorting
    result.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'number') {
        comparison = (a.customerNumber || '').localeCompare(b.customerNumber || '', undefined, { numeric: true });
      } else if (sortBy === 'name') {
        comparison = (a.name || '').localeCompare(b.name || '');
      } else if (sortBy === 'streak') {
        const streakA = calculateActiveStreakCount(a);
        const streakB = calculateActiveStreakCount(b);
        comparison = streakA - streakB;
      } else if (sortBy === 'spend') {
        comparison = (a.totalSpend ?? 0) - (b.totalSpend ?? 0);
      } else if (sortBy === 'created') {
        comparison = (a.createdAt ?? 0) - (b.createdAt ?? 0);
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [customers, searchQuery, typeFilter, streakFilter, sortBy, sortOrder]);

  // Keep selected ids bounded by processed customers on load
  React.useEffect(() => {
    // Select all by default
    setSelectedIds(processedCustomers.map(c => c.id));
  }, [processedCustomers]);

  const toggleSelectAll = () => {
    if (selectedIds.length === processedCustomers.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(processedCustomers.map(c => c.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(x => x !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  // Customers filtered and checked
  const activeSelection = useMemo(() => {
    return processedCustomers.filter(c => selectedIds.includes(c.id));
  }, [processedCustomers, selectedIds]);

  // --- EXPORT TO CSV ACTION ---
  const handleExportCSV = () => {
    if (activeSelection.length === 0) {
      showToast?.('Please select at least one customer to export.', 'error');
      return;
    }

    try {
      const headers = [
        'Customer Number',
        'Name',
        'Cell Number',
        'Customer Type',
        'Streak Count',
        'Total Purchases',
        'Total Spend ($)',
        'MAC Address',
        'Device Model',
        'Monthly Price ($)',
        'Date Registered'
      ];

      const rows = activeSelection.map(c => {
        const type = c.customerType || 'voucher';
        const streak = calculateActiveStreakCount(c);
        const regDate = c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '';
        return [
          c.customerNumber,
          `"${c.name.replace(/"/g, '""')}"`,
          `"${(c.cellNumber || '').replace(/"/g, '""')}"`,
          type.toUpperCase(),
          streak,
          c.totalPurchases ?? 0,
          (c.totalSpend ?? 0).toFixed(2),
          c.macAddress || '',
          `"${(c.deviceModel || '').replace(/"/g, '""')}"`,
          (c.monthlyPrice ?? 0).toFixed(2),
          regDate
        ];
      });

      const csvContent = "data:text/csv;charset=utf-8," 
        + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `WiVoTe_Customer_Registry_${workspaceName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showToast?.(`Successfully exported ${activeSelection.length} customers to CSV!`, 'success');
      onClose();
    } catch (err) {
      console.error(err);
      showToast?.('Failed to generate CSV export.', 'error');
    }
  };

  // --- EXPORT TO PLAIN TEXT / CLIPBOARD ---
  const handleCopyClipboard = () => {
    if (activeSelection.length === 0) {
      showToast?.('Please select at least one customer to copy.', 'error');
      return;
    }

    try {
      let text = `========================================================\n`;
      text += ` WIVOTE UNIVERSAL CUSTOMER REGISTRY - ${workspaceName.toUpperCase()}\n`;
      text += ` Exported On: ${new Date().toLocaleString()}\n`;
      text += ` Total Count: ${activeSelection.length} Clients\n`;
      text += `========================================================\n\n`;

      text += `| No | Code | Name | Cell Number | Type | Streak | Purchases | Spend ($) | MAC Address / Device |\n`;
      text += `|---|---|---|---|---|---|---|---|---|\n`;

      activeSelection.forEach((c, idx) => {
        const typeStr = (c.customerType || 'voucher').toUpperCase();
        const streak = calculateActiveStreakCount(c);
        const detail = typeStr === 'LEGACY_DEVICE' 
          ? `${c.deviceModel || 'Legacy'} (${c.macAddress || 'No MAC'})` 
          : 'WiFi Voucher Client';
        text += `| ${idx + 1} | ${c.customerNumber} | ${c.name} | ${c.cellNumber || 'N/A'} | ${typeStr} | ${streak} | ${c.totalPurchases || 0} | $${(c.totalSpend || 0).toFixed(2)} | ${detail} |\n`;
      });

      text += `\nGenerated by WiVoTe (WiFi Voucher Terminal) - VakZim ICT&E 2026\n`;

      navigator.clipboard.writeText(text);
      showToast?.(`Copied ${activeSelection.length} customers to clipboard!`, 'success');
      onClose();
    } catch (err) {
      console.error(err);
      showToast?.('Failed to copy text to clipboard.', 'error');
    }
  };

  // --- EXPORT TO BEAUTIFUL PDF ACTION ---
  const handleExportPDF = () => {
    if (activeSelection.length === 0) {
      showToast?.('Please select at least one customer to generate a PDF.', 'error');
      return;
    }

    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      let currentY = 15;

      // Draw Top Branding Accent Banner (Amber Accent)
      doc.setFillColor(245, 158, 11); // amber-500
      doc.rect(0, 0, pageWidth, 5, 'F');

      // Title & Metadata Header
      doc.setTextColor(30, 41, 59); // slate-800
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(20);
      doc.text('WiVoTe', 14, currentY + 7);

      doc.setFontSize(10);
      doc.setFont('Helvetica', 'normal');
      doc.setTextColor(100, 116, 139); // slate-500
      doc.text('WiFi Voucher Terminal Registry', 14, currentY + 12);

      // Workspace metadata
      doc.setFont('Helvetica', 'bold');
      doc.setTextColor(15, 23, 42); // slate-900
      doc.setFontSize(11);
      doc.text(workspaceName.toUpperCase(), pageWidth - 14, currentY + 7, { align: 'right' });

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text(`Registry Export Date: ${new Date().toLocaleString()}`, pageWidth - 14, currentY + 12, { align: 'right' });

      currentY += 22;

      // Dividers
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.setLineWidth(0.5);
      doc.line(14, currentY, pageWidth - 14, currentY);

      currentY += 8;

      // Quick Summary KPIs boxes
      const boxWidth = (pageWidth - 28 - 6) / 3;
      const voucherCount = activeSelection.filter(c => (c.customerType || 'voucher') === 'voucher').length;
      const legacyCount = activeSelection.filter(c => c.customerType === 'legacy_device').length;
      const totalStreak = activeSelection.reduce((acc, curr) => acc + calculateActiveStreakCount(curr), 0);

      // KPI Box 1: Total
      doc.setFillColor(248, 250, 252); // slate-50
      doc.rect(14, currentY, boxWidth, 16, 'F');
      doc.setDrawColor(241, 245, 249);
      doc.rect(14, currentY, boxWidth, 16, 'S');
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59);
      doc.text(activeSelection.length.toString(), 18, currentY + 6);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text('TOTAL REGISTRY CLIENTS', 18, currentY + 12);

      // KPI Box 2: Split
      doc.setFillColor(248, 250, 252);
      doc.rect(14 + boxWidth + 3, currentY, boxWidth, 16, 'F');
      doc.rect(14 + boxWidth + 3, currentY, boxWidth, 16, 'S');
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59);
      doc.text(`${voucherCount} WiFi / ${legacyCount} Legacy`, 14 + boxWidth + 7, currentY + 6);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text('CLIENT TYPE SEGMENTATION', 14 + boxWidth + 7, currentY + 12);

      // KPI Box 3: Total Streaks
      doc.setFillColor(248, 250, 252);
      doc.rect(14 + (boxWidth * 2) + 6, currentY, boxWidth, 16, 'F');
      doc.rect(14 + (boxWidth * 2) + 6, currentY, boxWidth, 16, 'S');
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(217, 119, 6); // amber-600
      doc.text(totalStreak.toString(), 14 + (boxWidth * 2) + 10, currentY + 6);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text('CONSECUTIVE STREAKS', 14 + (boxWidth * 2) + 10, currentY + 12);

      currentY += 24;

      // Table Header Definitions
      const tableX = 14;
      const colWidths = [18, 38, 28, 18, 12, 14, 18, 36]; // fits exactly 182mm (page width A4 is 210mm, margins are 14+14=28mm, remaining 182mm)
      const colNames = ['No/ID', 'Customer Name', 'Phone/WhatsApp', 'Type', 'Streak', 'Purch', 'Spend', 'MAC/Device Model'];

      // Header Fill
      doc.setFillColor(30, 41, 59); // slate-800
      doc.rect(tableX, currentY, 182, 7.5, 'F');

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);

      let headerX = tableX;
      colNames.forEach((name, i) => {
        doc.text(name, headerX + 2, currentY + 5);
        headerX += colWidths[i];
      });

      currentY += 7.5;

      // Render Rows
      activeSelection.forEach((c, index) => {
        // Handle pagination safely
        if (currentY > pageHeight - 20) {
          doc.addPage();
          // Top accent
          doc.setFillColor(245, 158, 11);
          doc.rect(0, 0, pageWidth, 5, 'F');

          currentY = 20;

          // Header on new page
          doc.setFillColor(30, 41, 59);
          doc.rect(tableX, currentY, 182, 7.5, 'F');
          doc.setFont('Helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(255, 255, 255);

          let hX = tableX;
          colNames.forEach((name, i) => {
            doc.text(name, hX + 2, currentY + 5);
            hX += colWidths[i];
          });
          currentY += 7.5;
        }

        // Zebra striping
        if (index % 2 === 1) {
          doc.setFillColor(248, 250, 252); // slate-50
          doc.rect(tableX, currentY, 182, 7.5, 'F');
        }

        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(51, 65, 85); // slate-700

        let rowX = tableX;

        // Column 0: Code
        doc.setFont('Helvetica', 'bold');
        doc.text(c.customerNumber, rowX + 2, currentY + 5);
        rowX += colWidths[0];

        // Column 1: Name
        doc.setFont('Helvetica', 'normal');
        const truncatedName = c.name.length > 20 ? c.name.substring(0, 18) + '..' : c.name;
        doc.text(truncatedName, rowX + 2, currentY + 5);
        rowX += colWidths[1];

        // Column 2: Cell
        doc.text(c.cellNumber || 'N/A', rowX + 2, currentY + 5);
        rowX += colWidths[2];

        // Column 3: Type
        const typeLabel = (c.customerType || 'voucher') === 'legacy_device' ? 'LEGACY' : 'WIFI';
        doc.text(typeLabel, rowX + 2, currentY + 5);
        rowX += colWidths[3];

        // Column 4: Streak
        const strVal = calculateActiveStreakCount(c);
        doc.text(strVal.toString(), rowX + 2, currentY + 5);
        rowX += colWidths[4];

        // Column 5: Purchases
        doc.text((c.totalPurchases ?? 0).toString(), rowX + 2, currentY + 5);
        rowX += colWidths[5];

        // Column 6: Spend
        doc.text(`$${(c.totalSpend ?? 0).toFixed(2)}`, rowX + 2, currentY + 5);
        rowX += colWidths[6];

        // Column 7: Device details / MAC
        const devDetail = c.customerType === 'legacy_device' 
          ? `${c.deviceModel || 'Enrolled'} (${c.macAddress || 'No MAC'})`
          : 'Voucher Customer';
        const truncatedDev = devDetail.length > 22 ? devDetail.substring(0, 20) + '..' : devDetail;
        doc.text(truncatedDev, rowX + 2, currentY + 5);

        // Grid row separator lines
        doc.setDrawColor(241, 245, 249);
        doc.setLineWidth(0.3);
        doc.line(tableX, currentY + 7.5, tableX + 182, currentY + 7.5);

        currentY += 7.5;
      });

      // Footer
      currentY += 15;
      if (currentY > pageHeight - 15) {
        doc.addPage();
        currentY = 20;
      }
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text('Generated via WiVoTe High-Security Universal Registry. VakZim ICT&E 2026', tableX, currentY);

      doc.save(`WiVoTe_Customer_Registry_${workspaceName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
      showToast?.(`Successfully exported PDF for ${activeSelection.length} customers!`, 'success');
      onClose();
    } catch (err) {
      console.error(err);
      showToast?.('Failed to generate PDF document.', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className={`w-full max-w-4xl rounded-3xl border shadow-2xl flex flex-col max-h-[90vh] overflow-hidden ${
        theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-mono font-bold">Export Customer Registry Directory</h3>
              <p className="text-[10px] sm:text-xs text-slate-400 font-mono">
                {customers.length} total customers available • Selected: <span className="text-amber-500 font-bold font-mono">{activeSelection.length}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filters and Search Bar inside Export popup */}
        <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-950/40">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Name, No, Phone, MAC..."
              className={`w-full pl-9 pr-3 py-2 border rounded-xl text-xs font-mono focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
              }`}
            />
          </div>

          {/* Client Type Filter */}
          <div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className={`w-full px-3 py-2 border rounded-xl text-xs font-mono focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
              }`}
            >
              <option value="all">📁 All Client Types</option>
              <option value="voucher">🎟️ Voucher Clients</option>
              <option value="legacy_device">📡 Legacy Device Clients</option>
            </select>
          </div>

          {/* Streak Filter */}
          <div>
            <select
              value={streakFilter}
              onChange={(e) => setStreakFilter(e.target.value as any)}
              className={`w-full px-3 py-2 border rounded-xl text-xs font-mono focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
              }`}
            >
              <option value="all">🔥 All Streaks</option>
              <option value="has_streak">🔥 Active Streak (&gt; 0)</option>
              <option value="no_streak">❄️ No Consecutive Streak</option>
            </select>
          </div>

          {/* Sort Control */}
          <div className="flex items-center gap-1.5">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className={`w-2/3 px-3 py-2 border rounded-xl text-xs font-mono focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
              }`}
            >
              <option value="number">CN Number</option>
              <option value="name">Customer Name</option>
              <option value="streak">Active Streak</option>
              <option value="spend">Total Spend</option>
              <option value="created">Created Date</option>
            </select>
            <button
              type="button"
              onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
              className={`w-1/3 py-2 border rounded-xl text-xs font-mono font-bold transition flex items-center justify-center ${
                theme === 'light' ? 'bg-white hover:bg-slate-100 border-slate-200' : 'bg-slate-900 hover:bg-slate-800 border-slate-800'
              }`}
            >
              {sortOrder.toUpperCase()}
            </button>
          </div>
        </div>

        {/* Main Content Area - Grid Selection of Customers */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {processedCustomers.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <AlertCircle className="w-10 h-10 text-slate-500 mb-2" />
              <p className="text-xs font-mono text-slate-400">No customer records matched your query filters.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Batch Selector Header */}
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 pb-3">
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="flex items-center gap-2 text-xs font-mono font-bold text-slate-500 hover:text-slate-300 transition"
                >
                  {selectedIds.length === processedCustomers.length ? (
                    <CheckSquare className="w-4 h-4 text-amber-500" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                  <span>
                    {selectedIds.length === processedCustomers.length ? 'Deselect All' : 'Select All Filtered'} ({processedCustomers.length})
                  </span>
                </button>
                <span className="text-[10px] font-mono font-bold text-slate-400">
                  Select items to include in export package
                </span>
              </div>

              {/* Compact Responsive List of Customers */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {processedCustomers.map((c) => {
                  const isSelected = selectedIds.includes(c.id);
                  const isLegacy = c.customerType === 'legacy_device';
                  const streak = calculateActiveStreakCount(c);

                  return (
                    <div
                      key={c.id}
                      onClick={() => toggleSelectOne(c.id)}
                      className={`p-3.5 rounded-2xl border transition duration-200 cursor-pointer flex items-start gap-3 select-none ${
                        isSelected
                          ? theme === 'light'
                            ? 'bg-amber-50/50 border-amber-300 text-slate-900'
                            : 'bg-amber-500/5 border-amber-500/30 text-white'
                          : theme === 'light'
                            ? 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                            : 'bg-slate-950/40 border-slate-800/80 hover:bg-slate-800/30 text-slate-300'
                      }`}
                    >
                      {/* Checkbox */}
                      <div className="mt-0.5 shrink-0">
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-amber-500" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-500" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 shrink-0">
                            {c.customerNumber}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold shrink-0 ${
                            isLegacy 
                              ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
                              : 'bg-sky-500/10 text-sky-500 border border-sky-500/20'
                          }`}>
                            {isLegacy ? 'LEGACY' : 'WIFI'}
                          </span>
                        </div>

                        <div>
                          <div className="text-xs font-bold truncate">{c.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono truncate">
                            {c.cellNumber || 'No Phone/WhatsApp'}
                          </div>
                        </div>

                        {/* Extra stats */}
                        <div className="grid grid-cols-3 gap-2 border-t border-slate-100 dark:border-slate-800/60 pt-2 text-[10px] font-mono">
                          <div>
                            <div className="text-slate-400 text-[8px] uppercase">Streak</div>
                            <div className="font-bold text-amber-500 flex items-center gap-0.5">
                              <Award className="w-3 h-3 text-amber-500" />
                              <span>{streak}</span>
                            </div>
                          </div>
                          <div>
                            <div className="text-slate-400 text-[8px] uppercase">Purchases</div>
                            <div className="font-bold">{c.totalPurchases ?? 0}</div>
                          </div>
                          <div>
                            <div className="text-slate-400 text-[8px] uppercase">Spend</div>
                            <div className="font-bold text-emerald-500">${(c.totalSpend ?? 0).toFixed(2)}</div>
                          </div>
                        </div>

                        {/* Legacy specifics */}
                        {isLegacy && (c.macAddress || c.deviceModel) && (
                          <div className="text-[9px] font-mono p-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200/40 dark:border-slate-800/40 text-slate-400 space-y-0.5">
                            {c.deviceModel && <div className="truncate">Model: {c.deviceModel}</div>}
                            {c.macAddress && <div className="truncate">MAC: {c.macAddress}</div>}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950/40">
          <div className="text-[10px] sm:text-xs text-slate-400 font-mono text-center sm:text-left">
            Select standard, compact layout for reporting/offline audits.
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
            {/* Copy Plain Text */}
            <button
              type="button"
              onClick={handleCopyClipboard}
              disabled={activeSelection.length === 0}
              className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-mono font-bold flex items-center justify-center gap-1.5 transition border border-slate-300 dark:border-slate-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title="Copy details as beautifully aligned Markdown table"
            >
              <Copy className="w-3.5 h-3.5 shrink-0 text-slate-400" />
              <span>Copy Table</span>
            </button>

            {/* Export CSV */}
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={activeSelection.length === 0}
              className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl bg-emerald-600/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600/20 text-xs font-mono font-bold flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title="Download direct spreadsheet-compatible standard CSV"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
              <span>Export CSV</span>
            </button>

            {/* Export PDF */}
            <button
              type="button"
              onClick={handleExportPDF}
              disabled={activeSelection.length === 0}
              className="flex-1 sm:flex-initial px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-mono font-bold flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title="Generate ultra-high-resolution printable A4 PDF Directory"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>Generate PDF Directory</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
