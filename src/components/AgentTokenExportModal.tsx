import React, { useState, useMemo, useCallback } from 'react';
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
  Scissors, 
  Wifi, 
  Check, 
  AlertCircle,
  Eye,
  ArrowRight,
  RotateCcw,
  Tag,
  CheckCircle2
} from 'lucide-react';
import { Voucher, UserProfile, TransactionReversalRequest } from '../types';
import { useApp } from '../context/AppContext';

export type A4DensityChoice = 24 | 20 | 16;

interface AgentTokenExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  vouchers: Voucher[];
  agents: UserProfile[];
  workspaceName?: string;
  theme: 'light' | 'dark';
  preselectedAgentId?: string;
  preselectedVoucherIds?: string[];
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const AgentTokenExportModal: React.FC<AgentTokenExportModalProps> = ({
  isOpen,
  onClose,
  vouchers,
  agents,
  workspaceName = 'WiVoTe Network',
  theme,
  preselectedAgentId,
  preselectedVoucherIds,
  showToast
}) => {
  // --- Agent Selection ---
  const [selectedAgentId, setSelectedAgentId] = useState<string>(() => {
    if (preselectedAgentId) return preselectedAgentId;
    if (agents.length > 0) return agents[0].uid;
    return '';
  });

  // Keep selectedAgentId synced if preselectedAgentId changes
  React.useEffect(() => {
    if (preselectedAgentId) {
      setSelectedAgentId(preselectedAgentId);
    } else if (!selectedAgentId && agents.length > 0) {
      setSelectedAgentId(agents[0].uid);
    }
  }, [preselectedAgentId, agents, selectedAgentId]);

  // The active agent profile
  const selectedAgent = useMemo(() => {
    return agents.find(a => a.uid === selectedAgentId) || null;
  }, [agents, selectedAgentId]);

  // Vouchers assigned to the selected agent (unarchived)
  const agentAssignedVouchers = useMemo(() => {
    if (!selectedAgentId) return [];
    return vouchers.filter(v => v.assignedAgentId === selectedAgentId && !v.archived);
  }, [vouchers, selectedAgentId]);

  // --- Scope: All Tokens vs Selected Tokens ---
  const [scopeMode, setScopeMode] = useState<'all' | 'selected'>(() => {
    return preselectedVoucherIds && preselectedVoucherIds.length > 0 ? 'selected' : 'all';
  });

  // Selected voucher IDs when in 'selected' mode
  const [selectedVoucherIds, setSelectedVoucherIds] = useState<string[]>(() => {
    if (preselectedVoucherIds && preselectedVoucherIds.length > 0) {
      return preselectedVoucherIds;
    }
    return [];
  });

  // Update selection if user switches agent
  React.useEffect(() => {
    if (scopeMode === 'selected' && selectedVoucherIds.length === 0 && agentAssignedVouchers.length > 0) {
      setSelectedVoucherIds(agentAssignedVouchers.map(v => v.id));
    }
  }, [selectedAgentId, scopeMode, agentAssignedVouchers, selectedVoucherIds.length]);

  // Filtering inside the token selector
  const [filterSearch, setFilterSearch] = useState('');
  const [filterPlan, setFilterPlan] = useState('All');

  const plansInAgentStock = useMemo(() => {
    const set = new Set<string>();
    agentAssignedVouchers.forEach(v => {
      if (v.plan) set.add(v.plan);
    });
    return Array.from(set);
  }, [agentAssignedVouchers]);

  const filteredAgentTokens = useMemo(() => {
    const q = filterSearch.trim().toLowerCase();
    return agentAssignedVouchers.filter(v => {
      const matchSearch = !q || (v.code || '').toLowerCase().includes(q) || (v.plan || '').toLowerCase().includes(q) || (v.location || '').toLowerCase().includes(q);
      const matchPlan = filterPlan === 'All' || v.plan === filterPlan;
      return matchSearch && matchPlan;
    });
  }, [agentAssignedVouchers, filterSearch, filterPlan]);

  // The final active tokens to export or print
  const tokensToExport = useMemo(() => {
    if (scopeMode === 'all') {
      return agentAssignedVouchers;
    }
    const idSet = new Set(selectedVoucherIds);
    return agentAssignedVouchers.filter(v => idSet.has(v.id));
  }, [scopeMode, agentAssignedVouchers, selectedVoucherIds]);

  // Total face value of tokens being exported
  const totalFaceValue = useMemo(() => {
    return tokensToExport.reduce((sum, v) => sum + (v.price || 0), 0);
  }, [tokensToExport]);

  const { reversalRequests = [] } = useApp();

  // Helper to determine exact status of voucher in export
  const getExportVoucherStatus = useCallback((v: Voucher): 'sold' | 'reversed' | 'unsold' => {
    const isApprovedReversal = (v.reversalStatus === 'Approved' || !!v.reversedAt) || (
      v.status !== 'Sold' && reversalRequests.some(r => 
        r.status === 'Approved' && 
        !r.isResold && 
        r.status !== ('Resold' as any) && 
        (r.transactionId === v.id || r.referenceCode?.toLowerCase().trim() === v.code?.toLowerCase().trim() || r.id === v.reversalRequestId)
      )
    );
    if (isApprovedReversal) return 'reversed';

    const isSold = v.status === 'Sold' || (v.status as any) === 'sold' || (v.status as string)?.toLowerCase() === 'sold' || !!v.soldAt;
    if (isSold) return 'sold';

    return 'unsold';
  }, [reversalRequests]);

  // Agent Portfolio Summary breakdown
  const agentPortfolioSummary = useMemo(() => {
    let soldCount = 0;
    let soldValue = 0;
    let reversedCount = 0;
    let reversedValue = 0;
    let unsoldCount = 0;
    let unsoldValue = 0;

    tokensToExport.forEach(v => {
      const st = getExportVoucherStatus(v);
      const val = v.price || 0;
      if (st === 'sold') {
        soldCount++;
        soldValue += val;
      } else if (st === 'reversed') {
        reversedCount++;
        reversedValue += val;
      } else {
        unsoldCount++;
        unsoldValue += val;
      }
    });

    const totalCount = tokensToExport.length;
    const totalValue = totalFaceValue;

    return {
      totalCount,
      totalValue,
      soldCount,
      soldValue,
      reversedCount,
      reversedValue,
      unsoldCount,
      unsoldValue,
      soldPercent: totalCount > 0 ? (soldCount / totalCount) * 100 : 0,
      unsoldPercent: totalCount > 0 ? (unsoldCount / totalCount) * 100 : 0,
      reversedPercent: totalCount > 0 ? (reversedCount / totalCount) * 100 : 0
    };
  }, [tokensToExport, totalFaceValue, getExportVoucherStatus]);

  // --- Selectable A4 Layout Density ---
  // Must be selectable choices: 24 vouchers in two columns, 20 vouchers in two columns, or 16 vouchers in two columns
  const [a4Density, setA4Density] = useState<A4DensityChoice>(24);

  // Computed page count based on selected A4 density
  const totalPagesRequired = useMemo(() => {
    if (tokensToExport.length === 0) return 0;
    return Math.ceil(tokensToExport.length / a4Density);
  }, [tokensToExport.length, a4Density]);

  // Selection toggle helpers
  const handleToggleVoucher = (id: string) => {
    setSelectedVoucherIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllFiltered = () => {
    const filteredIds = filteredAgentTokens.map(v => v.id);
    setSelectedVoucherIds(prev => Array.from(new Set([...prev, ...filteredIds])));
  };

  const handleDeselectAll = () => {
    setSelectedVoucherIds([]);
  };

  // Vector drawing helper for printable backward circular arrow reversal symbol (↺) in jsPDF
  const drawReversalArrowVector = (doc: jsPDF, centerX: number, centerY: number, radius: number = 2) => {
    doc.setDrawColor(217, 119, 6); // amber-600
    doc.setFillColor(217, 119, 6);
    doc.setLineWidth(0.4);

    const steps = 12;
    const startAngle = 0.4;
    const endAngle = 5.8;
    let prevX = centerX + radius * Math.cos(startAngle);
    let prevY = centerY + radius * Math.sin(startAngle);

    for (let i = 1; i <= steps; i++) {
      const angle = startAngle + ((endAngle - startAngle) * i) / steps;
      const currX = centerX + radius * Math.cos(angle);
      const currY = centerY + radius * Math.sin(angle);
      doc.line(prevX, prevY, currX, currY);
      prevX = currX;
      prevY = currY;
    }

    const tipX = centerX + radius * Math.cos(startAngle);
    const tipY = centerY + radius * Math.sin(startAngle);
    doc.triangle(
      tipX, tipY - 0.6,
      tipX + 1.0, tipY + 0.4,
      tipX - 0.4, tipY + 0.8,
      'F'
    );
  };

  // --- Export Actions ---

  // 1. Export to PDF (A4 size with Agent Portfolio Summary, Crossed-Out Sold Vouchers & Reversed Arrow Signs)
  const handleExportPDF = () => {
    if (tokensToExport.length === 0) {
      if (showToast) showToast('No vouchers available to export for this agent.', 'error');
      else alert('No vouchers available to export for this agent.');
      return;
    }

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = 210;
    const pageHeight = 297;
    const marginX = 8;
    const colGap = 6;
    const colWidth = (pageWidth - (marginX * 2) - colGap) / 2; // ~94mm

    // Row configuration based on density (2 columns)
    const rowsPerPage = a4Density / 2; // 12, 10, or 8 rows
    const baseHeaderHeight = 12; // Top banner height
    const portfolioSummaryHeight = 18; // Portfolio summary card height on Page 1
    const footerHeight = 8;

    const agentName = selectedAgent ? selectedAgent.name : 'Unassigned Agent';
    const agentCell = selectedAgent?.cellNumber || 'N/A';
    const totalCount = tokensToExport.length;

    for (let i = 0; i < totalCount; i++) {
      const pageIndex = Math.floor(i / a4Density);
      const indexInPage = i % a4Density;
      const col = indexInPage % 2; // 0 or 1
      const row = Math.floor(indexInPage / 2); // 0 to (rowsPerPage - 1)

      const isPageOne = pageIndex === 0;
      const effectiveHeaderHeight = isPageOne ? baseHeaderHeight + portfolioSummaryHeight + 2 : baseHeaderHeight;
      const printableHeight = pageHeight - effectiveHeaderHeight - footerHeight - 6;
      const rowHeight = printableHeight / rowsPerPage;
      const cardHeight = rowHeight - 1.2;

      // If starting a new page (and not the first page)
      if (indexInPage === 0 && pageIndex > 0) {
        doc.addPage('a4', 'portrait');
      }

      // Render Page Header & Agent Portfolio Summary on Page 1
      if (indexInPage === 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(30, 41, 59); // Slate-800
        doc.text(`${workspaceName.toUpperCase()} - AGENT VOUCHER DISPATCH & PORTFOLIO MANIFEST`, marginX, 6);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        const infoStr = `Agent: ${agentName} (${agentCell}) | Density: ${a4Density} Vouchers/Sheet (2 Columns) | Page ${pageIndex + 1} of ${totalPagesRequired}`;
        doc.text(infoStr, marginX, 9.5);

        // Header divider line
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.3);
        doc.line(marginX, 11, pageWidth - marginX, 11);

        // Render Agent Portfolio Summary Box on Page 1
        if (isPageOne) {
          const summaryY = 12.5;
          const summaryW = pageWidth - (marginX * 2);

          doc.setFillColor(241, 245, 249); // slate-100 fill
          doc.setDrawColor(203, 213, 225); // slate-300 border
          doc.setLineWidth(0.4);
          doc.roundedRect(marginX, summaryY, summaryW, portfolioSummaryHeight, 1.5, 1.5, 'FD');

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(15, 23, 42);
          doc.text('AGENT INVENTORY PORTFOLIO SUMMARY', marginX + 3, summaryY + 4.5);

          doc.setFontSize(7);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(71, 85, 105);
          doc.text(`Total Allocated:`, marginX + 3, summaryY + 8.5);
          doc.setFont('helvetica', 'normal');
          doc.text(`${agentPortfolioSummary.totalCount} Vouchers ($${agentPortfolioSummary.totalValue.toFixed(2)})`, marginX + 27, summaryY + 8.5);

          doc.setFont('helvetica', 'bold');
          doc.setTextColor(3, 105, 161); // sky-700
          doc.text(`Unsold Stock:`, marginX + 3, summaryY + 12.5);
          doc.setFont('helvetica', 'normal');
          doc.text(`${agentPortfolioSummary.unsoldCount} ($${agentPortfolioSummary.unsoldValue.toFixed(2)}) - ${agentPortfolioSummary.unsoldPercent.toFixed(0)}%`, marginX + 27, summaryY + 12.5);

          doc.setFont('helvetica', 'bold');
          doc.setTextColor(220, 38, 38); // red-600
          doc.text(`Sold Out (<s>Crossed</s>):`, marginX + summaryW / 2, summaryY + 8.5);
          doc.setFont('helvetica', 'normal');
          doc.text(`${agentPortfolioSummary.soldCount} ($${agentPortfolioSummary.soldValue.toFixed(2)}) - ${agentPortfolioSummary.soldPercent.toFixed(0)}%`, marginX + summaryW / 2 + 28, summaryY + 8.5);

          doc.setFont('helvetica', 'bold');
          doc.setTextColor(217, 119, 6); // amber-600
          doc.text(`Reversed (↺ Arrow):`, marginX + summaryW / 2, summaryY + 12.5);
          doc.setFont('helvetica', 'normal');
          doc.text(`${agentPortfolioSummary.reversedCount} ($${agentPortfolioSummary.reversedValue.toFixed(2)}) - ${agentPortfolioSummary.reversedPercent.toFixed(0)}%`, marginX + summaryW / 2 + 28, summaryY + 12.5);

          // Portfolio ratio mini bar at bottom of summary box
          const barY = summaryY + 14.5;
          const barW = summaryW - 6;
          const barX = marginX + 3;
          const barH = 1.8;

          doc.setFillColor(226, 232, 240);
          doc.roundedRect(barX, barY, barW, barH, 0.5, 0.5, 'F');

          let currentBarX = barX;
          if (agentPortfolioSummary.unsoldPercent > 0) {
            const segW = (barW * agentPortfolioSummary.unsoldPercent) / 100;
            doc.setFillColor(56, 189, 248); // sky-400
            doc.rect(currentBarX, barY, segW, barH, 'F');
            currentBarX += segW;
          }
          if (agentPortfolioSummary.soldPercent > 0) {
            const segW = (barW * agentPortfolioSummary.soldPercent) / 100;
            doc.setFillColor(34, 197, 94); // emerald-500
            doc.rect(currentBarX, barY, segW, barH, 'F');
            currentBarX += segW;
          }
          if (agentPortfolioSummary.reversedPercent > 0) {
            const segW = (barW * agentPortfolioSummary.reversedPercent) / 100;
            doc.setFillColor(245, 158, 11); // amber-500
            doc.rect(currentBarX, barY, segW, barH, 'F');
          }
        }
      }

      const v = tokensToExport[i];
      const vStatus = getExportVoucherStatus(v);
      const isSold = vStatus === 'sold';
      const isReversed = vStatus === 'reversed';

      const cardX = marginX + col * (colWidth + colGap);
      const cardY = effectiveHeaderHeight + 1 + row * rowHeight;

      // Draw dashed cutting boundary around each voucher card
      doc.setDrawColor(180, 190, 205);
      doc.setLineDashPattern([1.5, 1.5], 0);
      doc.setLineWidth(0.3);
      doc.rect(cardX, cardY, colWidth, cardHeight);
      doc.setLineDashPattern([], 0); // reset dash

      // Card background fill based on voucher status
      if (isSold) {
        doc.setFillColor(241, 245, 249); // slate-100 muted fill
      } else if (isReversed) {
        doc.setFillColor(254, 243, 199); // amber-100 fill
      } else {
        doc.setFillColor(248, 250, 252); // slate-50 active fill
      }
      doc.roundedRect(cardX + 0.8, cardY + 0.8, colWidth - 1.6, cardHeight - 1.6, 1, 1, 'F');

      // Top row in card: Network/SSID & Price
      const ssid = v.networkName || workspaceName || 'WiVoTe WiFi';
      const planName = v.plan || 'Standard Plan';
      const priceText = `$${(v.price || 0).toFixed(2)}`;

      // Plan & Network
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(a4Density === 16 ? 8.5 : a4Density === 20 ? 7.5 : 7);
      if (isSold) {
        doc.setTextColor(100, 116, 139);
      } else if (isReversed) {
        doc.setTextColor(180, 83, 9);
      } else {
        doc.setTextColor(15, 23, 42);
      }
      doc.text(planName.toUpperCase(), cardX + 3, cardY + (a4Density === 16 ? 5 : 4.2));

      // Network SSID subtitle
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(a4Density === 16 ? 7 : 6);
      doc.setTextColor(100, 116, 139);
      doc.text(`SSID: ${ssid}`, cardX + 3, cardY + (a4Density === 16 ? 8.5 : 7.5));

      // Top-Right Price / Status Pill Tag
      const priceWidth = a4Density === 16 ? 18 : 16;
      if (isSold) {
        doc.setFillColor(226, 232, 240); // slate-200
        doc.roundedRect(cardX + colWidth - priceWidth - 2.5, cardY + 2.5, priceWidth, a4Density === 16 ? 5.5 : 4.8, 1, 1, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(a4Density === 16 ? 7.5 : 6.5);
        doc.setTextColor(100, 116, 139);
        doc.text('SOLD OUT', cardX + colWidth - priceWidth / 2 - 2.5, cardY + (a4Density === 16 ? 6.2 : 5.8), { align: 'center' });
      } else if (isReversed) {
        doc.setFillColor(253, 230, 138); // amber-200
        doc.roundedRect(cardX + colWidth - priceWidth - 2.5, cardY + 2.5, priceWidth, a4Density === 16 ? 5.5 : 4.8, 1, 1, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(a4Density === 16 ? 7.5 : 6.5);
        doc.setTextColor(180, 83, 9);
        doc.text('↺ REVERSED', cardX + colWidth - priceWidth / 2 - 2.5, cardY + (a4Density === 16 ? 6.2 : 5.8), { align: 'center' });
      } else {
        doc.setFillColor(220, 252, 231); // emerald-100
        doc.roundedRect(cardX + colWidth - priceWidth - 2.5, cardY + 2.5, priceWidth, a4Density === 16 ? 5.5 : 4.8, 1, 1, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(a4Density === 16 ? 8.5 : 7.5);
        doc.setTextColor(5, 150, 105);
        doc.text(priceText, cardX + colWidth - priceWidth / 2 - 2.5, cardY + (a4Density === 16 ? 6.2 : 5.8), { align: 'center' });
      }

      // Middle: Voucher Code Box
      const codeStr = v.code || 'VCH-0000-0000';
      const codeY = cardY + (a4Density === 16 ? 17.5 : a4Density === 20 ? 14.5 : 12.5);

      // Monospace code background strip
      if (isSold) {
        doc.setFillColor(226, 232, 240);
      } else if (isReversed) {
        doc.setFillColor(254, 243, 199);
      } else {
        doc.setFillColor(241, 245, 249);
      }
      doc.roundedRect(cardX + 2.5, codeY - 4.5, colWidth - 5, a4Density === 16 ? 8.5 : 7, 1, 1, 'F');

      doc.setFont('courier', 'bold');
      doc.setFontSize(a4Density === 16 ? 13 : a4Density === 20 ? 11 : 9.5);
      if (isSold) {
        doc.setTextColor(100, 116, 139);
      } else if (isReversed) {
        doc.setTextColor(180, 83, 9);
      } else {
        doc.setTextColor(3, 105, 161);
      }
      doc.text(codeStr, cardX + colWidth / 2, codeY + (a4Density === 16 ? 0.8 : 0.2), { align: 'center' });

      // --- FINELY CROSSED OUT MARKINGS FOR SOLD OUT VOUCHERS ---
      if (isSold) {
        // Razor-sharp fine strikethrough line horizontally across code
        doc.setDrawColor(220, 38, 38); // Red-600
        doc.setLineWidth(0.6);
        doc.line(cardX + 3.5, codeY - 0.8, cardX + colWidth - 3.5, codeY - 0.8);

        // Secondary fine diagonal strikethrough line across entire card for distinct printable cross-out
        doc.setDrawColor(220, 38, 38);
        doc.setLineWidth(0.35);
        doc.line(cardX + 2, cardY + 2, cardX + colWidth - 2, cardY + cardHeight - 2);
      }

      // --- REVERSAL MARKING (BACKWARD CIRCULAR ARROW ↺) FOR REVERSED VOUCHERS ---
      if (isReversed) {
        // Printable text symbol
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(a4Density === 16 ? 10 : 8.5);
        doc.setTextColor(180, 83, 9);
        doc.text('↺ REVERSED', cardX + colWidth / 2, codeY - 5.5, { align: 'center' });

        // Printable vector backward circular arrow icons
        drawReversalArrowVector(doc, cardX + 5, codeY - 0.8, 1.8);
        drawReversalArrowVector(doc, cardX + colWidth - 5, codeY - 0.8, 1.8);
      }

      // Bottom Row: Duration, Site Location & Agent Dispatch
      const durStr = v.duration || 'Standard Access';
      const bottomY = cardY + cardHeight - (a4Density === 16 ? 3.5 : 2.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(a4Density === 16 ? 7 : 6);
      doc.setTextColor(71, 85, 105);
      doc.text(`Access: ${durStr}`, cardX + 3, bottomY);

      doc.setFont('helvetica', 'italic');
      doc.setFontSize(a4Density === 16 ? 6.5 : 5.5);
      doc.setTextColor(148, 163, 184);
      doc.text(`Agent: ${agentName}`, cardX + colWidth - 3, bottomY, { align: 'right' });
    }

    const safeAgent = (agentName || 'Agent').replace(/[^a-zA-Z0-9_-]/g, '_');
    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `Vouchers_${safeAgent}_${a4Density}perPage_${dateStr}.pdf`;
    doc.save(fileName);

    if (showToast) {
      showToast(`Exported ${tokensToExport.length} vouchers to A4 PDF with Portfolio Summary & Status Markings.`, 'success');
    }
    onClose();
  };

  // 2. Direct Print via Standard Printer
  const handleDirectPrint = () => {
    if (tokensToExport.length === 0) {
      if (showToast) showToast('No vouchers available to print.', 'error');
      else alert('No vouchers available to print.');
      return;
    }

    const agentName = selectedAgent ? selectedAgent.name : 'Agent';
    const agentCell = selectedAgent?.cellNumber || 'N/A';
    const dateFormatted = new Date().toLocaleString();

    // Group vouchers into pages of a4Density (24, 20, or 16)
    const pages: Voucher[][] = [];
    for (let i = 0; i < tokensToExport.length; i += a4Density) {
      pages.push(tokensToExport.slice(i, i + a4Density));
    }

    // Generate clean printable HTML string with exact A4 2-column grid and Portfolio Summary
    const printWindowHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Print Vouchers - ${agentName}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 6mm 6mm;
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: #fff;
            color: #0f172a;
          }
          .a4-page {
            width: 100%;
            min-height: 285mm;
            max-height: 285mm;
            page-break-after: always;
            break-after: page;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            padding: 4mm 2mm;
          }
          .page-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #cbd5e1;
            padding-bottom: 3px;
            margin-bottom: 4px;
            font-size: 10px;
            color: #475569;
          }
          .page-header strong {
            color: #0f172a;
            font-size: 11px;
          }
          .portfolio-summary-box {
            background: #f1f5f9;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            padding: 6px 10px;
            margin-bottom: 8px;
            font-size: 9px;
          }
          .portfolio-summary-title {
            font-weight: 800;
            font-size: 10px;
            color: #0f172a;
            margin-bottom: 4px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .portfolio-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 6px;
          }
          .portfolio-stat {
            display: flex;
            flex-direction: column;
          }
          .portfolio-stat .label {
            font-size: 8px;
            color: #64748b;
            text-transform: uppercase;
            font-weight: 700;
          }
          .portfolio-stat .val {
            font-size: 10px;
            font-weight: 800;
            color: #0f172a;
          }
          .portfolio-stat.unsold .val { color: #0284c7; }
          .portfolio-stat.sold .val { color: #dc2626; }
          .portfolio-stat.reversed .val { color: #d97706; }

          .voucher-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: ${a4Density === 16 ? '5px 8px' : a4Density === 20 ? '4px 6px' : '3px 6px'};
            flex: 1;
          }
          .voucher-card {
            border: 1px dashed #94a3b8;
            border-radius: 6px;
            padding: ${a4Density === 16 ? '8px 10px' : a4Density === 20 ? '6px 8px' : '4px 7px'};
            background: #f8fafc;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            height: ${a4Density === 16 ? '32.5mm' : a4Density === 20 ? '26.0mm' : '21.5mm'};
            position: relative;
            overflow: hidden;
          }
          .voucher-card.sold-card {
            background: #f1f5f9;
            border-color: #cbd5e1;
          }
          .voucher-card.reversed-card {
            background: #fef3c7;
            border-color: #f59e0b;
          }
          .voucher-top {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
          }
          .plan-title {
            font-size: ${a4Density === 16 ? '11px' : a4Density === 20 ? '10px' : '9px'};
            font-weight: 700;
            color: #0f172a;
            text-transform: uppercase;
          }
          .ssid-sub {
            font-size: ${a4Density === 16 ? '9px' : '8px'};
            color: #64748b;
          }
          .price-badge {
            background: #dcfce7;
            color: #059669;
            font-weight: 800;
            font-size: ${a4Density === 16 ? '11px' : a4Density === 20 ? '10px' : '9px'};
            padding: 2px 6px;
            border-radius: 4px;
            border: 1px solid #bbf7d0;
          }
          .price-badge.sold-badge {
            background: #e2e8f0;
            color: #64748b;
            border-color: #cbd5e1;
          }
          .price-badge.reversed-badge {
            background: #fde68a;
            color: #b45309;
            border-color: #f59e0b;
          }
          .code-strip {
            background: #e2e8f0;
            border-radius: 4px;
            text-align: center;
            padding: ${a4Density === 16 ? '4px 0' : '2px 0'};
            margin: 2px 0;
            position: relative;
          }
          .code-strip.sold-strip {
            background: #cbd5e1;
          }
          .code-strip.reversed-strip {
            background: #fde68a;
          }
          .voucher-code {
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: ${a4Density === 16 ? '15px' : a4Density === 20 ? '13px' : '11px'};
            font-weight: 800;
            letter-spacing: 1px;
            color: #0369a1;
          }
          .voucher-code.crossed-code {
            color: #64748b;
            text-decoration: line-through;
            text-decoration-color: #dc2626;
            text-decoration-thickness: 2px;
          }
          .strikethrough-red-line {
            position: absolute;
            top: 50%;
            left: 4px;
            right: 4px;
            height: 2px;
            background: #dc2626;
            transform: translateY(-50%);
          }
          .diagonal-cross-line {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
          }
          .reversal-arrow-text {
            font-size: 10px;
            font-weight: 800;
            color: #b45309;
            text-transform: uppercase;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
          }
          .voucher-bottom {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: ${a4Density === 16 ? '9px' : '8px'};
            color: #64748b;
          }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        ${pages.map((pageVouchers, pIdx) => `
          <div class="a4-page">
            <div class="page-header">
              <div>
                <strong>${workspaceName}</strong> &bull; Agent: ${agentName} (${agentCell})
              </div>
              <div>
                Layout: ${a4Density} Vouchers/Sheet (2 Columns) &bull; Page ${pIdx + 1} of ${pages.length} &bull; ${dateFormatted}
              </div>
            </div>

            ${pIdx === 0 ? `
              <div class="portfolio-summary-box">
                <div class="portfolio-summary-title">AGENT INVENTORY PORTFOLIO SUMMARY</div>
                <div class="portfolio-grid">
                  <div class="portfolio-stat">
                    <span class="label">Total Allocated</span>
                    <span class="val">${agentPortfolioSummary.totalCount} ($${agentPortfolioSummary.totalValue.toFixed(2)})</span>
                  </div>
                  <div class="portfolio-stat unsold">
                    <span class="label">Unsold Stock</span>
                    <span class="val">${agentPortfolioSummary.unsoldCount} ($${agentPortfolioSummary.unsoldValue.toFixed(2)})</span>
                  </div>
                  <div class="portfolio-stat sold">
                    <span class="label">Sold Out (<s>Crossed</s>)</span>
                    <span class="val">${agentPortfolioSummary.soldCount} ($${agentPortfolioSummary.soldValue.toFixed(2)})</span>
                  </div>
                  <div class="portfolio-stat reversed">
                    <span class="label">Reversed (↺ Arrow)</span>
                    <span class="val">${agentPortfolioSummary.reversedCount} ($${agentPortfolioSummary.reversedValue.toFixed(2)})</span>
                  </div>
                </div>
              </div>
            ` : ''}

            <div class="voucher-grid">
              ${pageVouchers.map(v => {
                const st = getExportVoucherStatus(v);
                const isSold = st === 'sold';
                const isReversed = st === 'reversed';

                return `
                  <div class="voucher-card ${isSold ? 'sold-card' : ''} ${isReversed ? 'reversed-card' : ''}">
                    ${isSold ? `
                      <svg class="diagonal-cross-line" viewBox="0 0 100 100" preserveAspectRatio="none">
                        <line x1="0" y1="0" x2="100" y2="100" stroke="#dc2626" stroke-width="1.5" />
                      </svg>
                    ` : ''}

                    <div class="voucher-top">
                      <div>
                        <div class="plan-title">${v.plan || 'Standard Plan'}</div>
                        <div class="ssid-sub">SSID: ${v.networkName || workspaceName || 'WiVoTe WiFi'}</div>
                      </div>
                      <div class="price-badge ${isSold ? 'sold-badge' : ''} ${isReversed ? 'reversed-badge' : ''}">
                        ${isSold ? 'SOLD OUT' : isReversed ? '↺ REVERSED' : '$' + (v.price || 0).toFixed(2)}
                      </div>
                    </div>

                    <div class="code-strip ${isSold ? 'sold-strip' : ''} ${isReversed ? 'reversed-strip' : ''}">
                      ${isReversed ? `<div class="reversal-arrow-text">↺ REVERSED</div>` : ''}
                      <div class="voucher-code ${isSold ? 'crossed-code' : ''}">${v.code}</div>
                      ${isSold ? '<div class="strikethrough-red-line"></div>' : ''}
                    </div>

                    <div class="voucher-bottom">
                      <div>Access: <strong>${v.duration || 'Active'}</strong></div>
                      <div>Agent: <strong>${agentName}</strong></div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `).join('')}
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `;

    // Try printing via hidden iframe for seamless in-app printing
    try {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentWindow?.document;
      if (iframeDoc) {
        iframeDoc.open();
        iframeDoc.write(printWindowHtml);
        iframeDoc.close();

        iframe.contentWindow?.focus();
        setTimeout(() => {
          iframe.contentWindow?.print();
          setTimeout(() => {
            document.body.removeChild(iframe);
          }, 60000);
        }, 500);

        if (showToast) showToast(`Standard print dialog opened for ${tokensToExport.length} vouchers.`, 'info');
        onClose();
        return;
      }
    } catch {
      // Fallback to opening popup window if iframe print is blocked by container
    }

    const printWin = window.open('', '_blank');
    if (printWin) {
      printWin.document.open();
      printWin.document.write(printWindowHtml);
      printWin.document.close();
    } else {
      alert('Pop-up window was blocked. Please allow popups for this site to print directly.');
    }
  };

  // 3. Export to CSV (Spreadsheet)
  const handleExportCSV = () => {
    if (tokensToExport.length === 0) {
      if (showToast) showToast('No vouchers available to export.', 'error');
      else alert('No vouchers available to export.');
      return;
    }

    const agentName = selectedAgent ? selectedAgent.name : 'Unassigned';
    const agentCell = selectedAgent?.cellNumber || 'N/A';

    const headers = [
      'Voucher Code',
      'Plan Name',
      'Price (USD)',
      'Duration',
      'Location',
      'Network SSID',
      'Status',
      'Assigned Agent',
      'Agent Cell',
      'Created Date'
    ];

    const summaryRows = [
      [`"AGENT INVENTORY PORTFOLIO SUMMARY"`],
      [`"Total Allocated Vouchers"`, agentPortfolioSummary.totalCount, `"$${agentPortfolioSummary.totalValue.toFixed(2)}"`],
      [`"Active Unsold Stock"`, agentPortfolioSummary.unsoldCount, `"$${agentPortfolioSummary.unsoldValue.toFixed(2)}"`, `"${agentPortfolioSummary.unsoldPercent.toFixed(1)}%"`],
      [`"Sold Out (Crossed Out)"`, agentPortfolioSummary.soldCount, `"$${agentPortfolioSummary.soldValue.toFixed(2)}"`, `"${agentPortfolioSummary.soldPercent.toFixed(1)}%"`],
      [`"Reversed (↺ Arrow)"`, agentPortfolioSummary.reversedCount, `"$${agentPortfolioSummary.reversedValue.toFixed(2)}"`, `"${agentPortfolioSummary.reversedPercent.toFixed(1)}%"`],
      []
    ];

    const rows = tokensToExport.map(v => {
      const st = getExportVoucherStatus(v);
      const statusLabel = st === 'sold' ? 'Sold Out (<s>Crossed</s>)' : st === 'reversed' ? 'Reversed (↺ Arrow)' : (v.status || 'Assigned');

      return [
        `"${(v.code || '').replace(/"/g, '""')}"`,
        `"${(v.plan || '').replace(/"/g, '""')}"`,
        (v.price || 0).toFixed(2),
        `"${(v.duration || '').replace(/"/g, '""')}"`,
        `"${(v.location || '').replace(/"/g, '""')}"`,
        `"${(v.networkName || workspaceName || '').replace(/"/g, '""')}"`,
        `"${statusLabel.replace(/"/g, '""')}"`,
        `"${agentName.replace(/"/g, '""')}"`,
        `"${agentCell.replace(/"/g, '""')}"`,
        `"${v.assignedAt || new Date().toISOString()}"`
      ];
    });

    const csvContent = [
      ...summaryRows.map(r => r.join(',')),
      headers.join(','), 
      ...rows.map(r => r.join(','))
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeAgent = (agentName || 'Agent').replace(/[^a-zA-Z0-9_-]/g, '_');
    link.download = `Vouchers_${safeAgent}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    if (showToast) showToast(`Exported ${tokensToExport.length} vouchers to CSV manifest.`, 'success');
    onClose();
  };

  // 4. Export to Text (.txt)
  const handleExportText = () => {
    if (tokensToExport.length === 0) {
      if (showToast) showToast('No vouchers available to export.', 'error');
      else alert('No vouchers available to export.');
      return;
    }

    const agentName = selectedAgent ? selectedAgent.name : 'Unassigned';
    const agentCell = selectedAgent?.cellNumber || 'N/A';
    const dateFormatted = new Date().toLocaleString();

    let textContent = `======================================================================\r\n`;
    textContent += `${workspaceName.toUpperCase()} - VOUCHER TOKENS DISPATCH & PORTFOLIO MANIFEST\r\n`;
    textContent += `======================================================================\r\n`;
    textContent += `Assigned Agent: ${agentName} (Cell: ${agentCell})\r\n`;
    textContent += `Total Vouchers: ${agentPortfolioSummary.totalCount} | Total Face Value: $${agentPortfolioSummary.totalValue.toFixed(2)}\r\n`;
    textContent += `Unsold Stock: ${agentPortfolioSummary.unsoldCount} ($${agentPortfolioSummary.unsoldValue.toFixed(2)}) - ${agentPortfolioSummary.unsoldPercent.toFixed(1)}%\r\n`;
    textContent += `Sold Out (<s>Crossed</s>): ${agentPortfolioSummary.soldCount} ($${agentPortfolioSummary.soldValue.toFixed(2)}) - ${agentPortfolioSummary.soldPercent.toFixed(1)}%\r\n`;
    textContent += `Reversed (↺ Arrow): ${agentPortfolioSummary.reversedCount} ($${agentPortfolioSummary.reversedValue.toFixed(2)}) - ${agentPortfolioSummary.reversedPercent.toFixed(1)}%\r\n`;
    textContent += `Generated Date: ${dateFormatted}\r\n`;
    textContent += `A4 Print Density: ${a4Density} vouchers per sheet (2 columns)\r\n`;
    textContent += `======================================================================\r\n\r\n`;

    tokensToExport.forEach((v, idx) => {
      const st = getExportVoucherStatus(v);
      const markTag = st === 'sold' ? '[<s>SOLD OUT - CROSSED OUT</s>]' : st === 'reversed' ? '[↺ REVERSED]' : '[ACTIVE UNSOLD]';

      textContent += `[${idx + 1}] CODE: ${v.code}  ${markTag}\r\n`;
      textContent += `    Plan: ${v.plan} | Price: $${(v.price || 0).toFixed(2)} | Duration: ${v.duration || 'N/A'}\r\n`;
      textContent += `    SSID: ${v.networkName || workspaceName} | Location: ${v.location || 'N/A'}\r\n`;
      textContent += `----------------------------------------------------------------------\r\n`;
    });

    textContent += `\r\nReceived By (Agent Signature): ____________________  Date: __________\r\n`;

    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeAgent = (agentName || 'Agent').replace(/[^a-zA-Z0-9_-]/g, '_');
    link.download = `Vouchers_${safeAgent}_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    if (showToast) showToast(`Exported ${tokensToExport.length} vouchers to plain text manifest.`, 'success');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div 
        id="agent-token-export-modal"
        className={`w-full max-w-4xl rounded-3xl border shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh] transition-all duration-300 ${
          theme === 'light' 
            ? 'bg-white border-slate-200 text-slate-900 shadow-slate-900/10' 
            : 'bg-slate-900 border-slate-800 text-white shadow-slate-950/80'
        }`}
      >
        {/* Modal Header */}
        <div className={`p-4 sm:p-5 border-b flex items-center justify-between shrink-0 ${
          theme === 'light' ? 'bg-slate-50/80 border-slate-200' : 'bg-slate-950/70 border-slate-800'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-500/20">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold font-display leading-tight">
                Export & Print Agent Tokens
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                Workspace Master Dispatch &bull; Standard A4 2-Column Printing & Multi-Format Generator
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 text-xs">

          {/* 1. AGENT PORTFOLIO SUMMARY CARD */}
          <div className={`p-4 rounded-2xl border ${
            theme === 'light' ? 'bg-indigo-50/70 border-indigo-200 text-indigo-950' : 'bg-indigo-950/30 border-indigo-500/30 text-indigo-100'
          }`}>
            <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-indigo-200/60 dark:border-indigo-800/40">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span className="font-mono font-bold text-xs uppercase tracking-wider">Current Agent Portfolio Summary</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 font-bold border border-indigo-500/20">
                Agent: {selectedAgent?.name || 'Assigned Agent'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
              <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-indigo-200 dark:border-indigo-800/50">
                <span className="text-[10px] text-slate-500 font-mono uppercase block">Total Allocated</span>
                <strong className="text-sm font-black font-mono text-slate-900 dark:text-white">
                  {agentPortfolioSummary.totalCount}
                </strong>
                <span className="text-[10px] text-slate-400 font-mono block">${agentPortfolioSummary.totalValue.toFixed(2)}</span>
              </div>

              <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800/50">
                <span className="text-[10px] text-sky-600 dark:text-sky-400 font-mono uppercase block">Unsold Stock</span>
                <strong className="text-sm font-black font-mono text-sky-600 dark:text-sky-400">
                  {agentPortfolioSummary.unsoldCount}
                </strong>
                <span className="text-[10px] text-sky-600/80 dark:text-sky-400/80 font-mono block">${agentPortfolioSummary.unsoldValue.toFixed(2)} ({agentPortfolioSummary.unsoldPercent.toFixed(0)}%)</span>
              </div>

              <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/50">
                <span className="text-[10px] text-rose-600 dark:text-rose-400 font-mono uppercase block">Sold Out (<s>Crossed</s>)</span>
                <strong className="text-sm font-black font-mono text-rose-600 dark:text-rose-400 line-through">
                  {agentPortfolioSummary.soldCount}
                </strong>
                <span className="text-[10px] text-rose-600/80 dark:text-rose-400/80 font-mono block">${agentPortfolioSummary.soldValue.toFixed(2)} ({agentPortfolioSummary.soldPercent.toFixed(0)}%)</span>
              </div>

              <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/50">
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-mono uppercase block flex items-center justify-center gap-1">
                  <span>↺</span> Reversed
                </span>
                <strong className="text-sm font-black font-mono text-amber-600 dark:text-amber-400">
                  {agentPortfolioSummary.reversedCount}
                </strong>
                <span className="text-[10px] text-amber-600/80 dark:text-amber-400/80 font-mono block">${agentPortfolioSummary.reversedValue.toFixed(2)} ({agentPortfolioSummary.reversedPercent.toFixed(0)}%)</span>
              </div>
            </div>
          </div>

          {/* 2. SAMPLE VOUCHER TICKET PREVIEW WITH PRINTABLE MARKINGS */}
          <div className={`p-4 rounded-2xl border ${
            theme === 'light' ? 'bg-slate-50/50 border-slate-200' : 'bg-slate-950/40 border-slate-800'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                <Scissors className="w-3.5 h-3.5 text-indigo-500" />
                <span>Live Sample Ticket Status Markings ({a4Density} vouchers/A4 in 2 columns)</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">Printable Perforated Cutting Layout</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Sample Ticket 1: Active Unsold */}
              <div className="border border-dashed border-slate-400 dark:border-slate-600 rounded-xl p-2.5 bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs space-y-1.5 relative overflow-hidden">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-[11px] uppercase tracking-tight">Active Unsold Stock</div>
                    <div className="text-[9px] text-slate-400 font-mono">SSID: {workspaceName}</div>
                  </div>
                  <span className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-extrabold text-[10px] px-1.5 py-0.5 rounded border border-emerald-300 dark:border-emerald-800">
                    $5.00
                  </span>
                </div>
                <div className="bg-slate-100 dark:bg-slate-800 rounded-lg py-1 text-center font-mono font-black text-xs tracking-wider text-sky-600 dark:text-sky-400">
                  LUS-FAST-4921
                </div>
                <div className="flex justify-between text-[8px] text-slate-500 font-mono">
                  <span>Access: 30 Days</span>
                  <span>Status: Active</span>
                </div>
              </div>

              {/* Sample Ticket 2: Sold Out (Finely Crossed Out) */}
              <div className="border border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-2.5 bg-slate-100 dark:bg-slate-950 text-slate-500 shadow-2xs space-y-1.5 relative overflow-hidden">
                <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <line x1="0" y1="0" x2="100" y2="100" stroke="#dc2626" strokeWidth="1.5" />
                </svg>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-[11px] uppercase tracking-tight text-slate-600 dark:text-slate-400">Sold Out Voucher</div>
                    <div className="text-[9px] text-slate-400 font-mono">SSID: {workspaceName}</div>
                  </div>
                  <span className="bg-slate-200 text-slate-600 font-extrabold text-[9px] px-1.5 py-0.5 rounded border border-slate-300">
                    <s>SOLD OUT</s>
                  </span>
                </div>
                <div className="bg-slate-200 dark:bg-slate-900 rounded-lg py-1 text-center font-mono font-black text-xs tracking-wider text-slate-500 relative">
                  <span className="line-through decoration-rose-600 decoration-2">LUS-GOLD-7812</span>
                  <div className="absolute top-1/2 left-1 right-1 h-0.5 bg-rose-600 -translate-y-1/2" />
                </div>
                <div className="flex justify-between text-[8px] text-slate-400 font-mono">
                  <span>Access: Completed</span>
                  <span className="text-rose-600 font-bold"><s>Crossed Out</s></span>
                </div>
              </div>

              {/* Sample Ticket 3: Reversed (Backward Circular Arrow ↺) */}
              <div className="border border-dashed border-amber-400 dark:border-amber-600 rounded-xl p-2.5 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 shadow-2xs space-y-1.5 relative overflow-hidden">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-[11px] uppercase tracking-tight text-amber-800 dark:text-amber-300">Reversed Voucher</div>
                    <div className="text-[9px] text-amber-600/80 font-mono">SSID: {workspaceName}</div>
                  </div>
                  <span className="bg-amber-200 text-amber-800 font-extrabold text-[9px] px-1.5 py-0.5 rounded border border-amber-300 flex items-center gap-0.5">
                    <span>↺</span> REVERSED
                  </span>
                </div>
                <div className="bg-amber-100 dark:bg-amber-900/60 rounded-lg py-1 text-center font-mono font-black text-xs tracking-wider text-amber-800 dark:text-amber-300 relative">
                  <div className="text-[9px] text-amber-700 font-bold flex items-center justify-center gap-1 mb-0.5">
                    <span>↺</span> REVERSED
                  </div>
                  <span>LUS-STAR-3301</span>
                </div>
                <div className="flex justify-between text-[8px] text-amber-700 dark:text-amber-400 font-mono">
                  <span>Access: Returned</span>
                  <span className="font-bold flex items-center gap-0.5"><span>↺</span> Reversal Sign</span>
                </div>
              </div>
            </div>
          </div>

          {/* 1. AGENT SELECTION & SCOPE */}
          <div className={`p-4 rounded-2xl border ${
            theme === 'light' ? 'bg-slate-50/60 border-slate-200' : 'bg-slate-950/50 border-slate-800'
          }`}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Agent Selector */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 font-mono">
                  1. Target Field Agent
                </label>
                <select
                  id="export-agent-select"
                  value={selectedAgentId}
                  onChange={(e) => {
                    setSelectedAgentId(e.target.value);
                    setSelectedVoucherIds([]);
                  }}
                  className={`w-full border rounded-xl px-3.5 py-2.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer ${
                    theme === 'light' ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
                  }`}
                >
                  {agents.map(a => {
                    const count = vouchers.filter(v => v.assignedAgentId === a.uid && !v.archived).length;
                    return (
                      <option key={a.uid} value={a.uid}>
                        {a.name} ({count} assigned tokens) {a.cellNumber ? `- ${a.cellNumber}` : ''}
                      </option>
                    );
                  })}
                </select>
                {selectedAgent && (
                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 font-mono px-1">
                    <span>Assigned Tokens: <strong className="text-indigo-600 dark:text-indigo-400">{agentAssignedVouchers.length}</strong></span>
                    <span>Total Face Value: <strong className="text-emerald-600 dark:text-emerald-400">${agentAssignedVouchers.reduce((s, v) => s + v.price, 0).toFixed(2)}</strong></span>
                  </div>
                )}
              </div>

              {/* Scope Selector: All vs Selected Tokens */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 font-mono">
                  2. Token Scope
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setScopeMode('all')}
                    className={`py-2 px-3 rounded-xl border font-semibold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      scopeMode === 'all'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : theme === 'light'
                          ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    All Tokens ({agentAssignedVouchers.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setScopeMode('selected');
                      if (selectedVoucherIds.length === 0) {
                        setSelectedVoucherIds(agentAssignedVouchers.map(v => v.id));
                      }
                    }}
                    className={`py-2 px-3 rounded-xl border font-semibold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      scopeMode === 'selected'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : theme === 'light'
                          ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    Selected ({selectedVoucherIds.length})
                  </button>
                </div>

                <div className="mt-2 text-[11px] text-slate-500 font-mono px-1">
                  {scopeMode === 'all' ? (
                    <span>Exporting all vouchers currently assigned to {selectedAgent?.name || 'this agent'}</span>
                  ) : (
                    <span>Custom pick specific tokens below ({selectedVoucherIds.length} chosen)</span>
                  )}
                </div>
              </div>
            </div>

            {/* If Selected Mode is active, show the voucher picker list */}
            {scopeMode === 'selected' && (
              <div className="mt-4 pt-4 border-t border-dashed border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
                  <div className="flex items-center gap-2 w-full sm:w-auto flex-1">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={filterSearch}
                        onChange={(e) => setFilterSearch(e.target.value)}
                        placeholder="Filter agent tokens by code, plan, location..."
                        className={`w-full border rounded-xl pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500 ${
                          theme === 'light' ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
                        }`}
                      />
                    </div>
                    {plansInAgentStock.length > 1 && (
                      <select
                        value={filterPlan}
                        onChange={(e) => setFilterPlan(e.target.value)}
                        className={`border rounded-xl px-2.5 py-1.5 text-xs focus:outline-none ${
                          theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
                        }`}
                      >
                        <option value="All">All Plans</option>
                        {plansInAgentStock.map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleSelectAllFiltered}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-800 hover:bg-sky-100 transition cursor-pointer"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={handleDeselectAll}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 transition cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {/* Scrollable list of checkboxes */}
                <div className={`max-h-48 overflow-y-auto rounded-xl border p-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 ${
                  theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                }`}>
                  {filteredAgentTokens.length === 0 ? (
                    <div className="col-span-full py-4 text-center text-slate-400 font-mono">
                      No vouchers matched your filter criteria
                    </div>
                  ) : (
                    filteredAgentTokens.map(v => {
                      const isChecked = selectedVoucherIds.includes(v.id);
                      return (
                        <div
                          key={v.id}
                          onClick={() => handleToggleVoucher(v.id)}
                          className={`p-2 rounded-xl border flex items-center gap-2.5 transition cursor-pointer ${
                            isChecked
                              ? theme === 'light'
                                ? 'bg-indigo-50/70 border-indigo-300 text-indigo-900'
                                : 'bg-indigo-950/40 border-indigo-700 text-indigo-200'
                              : theme === 'light'
                                ? 'bg-slate-50/50 border-slate-200 hover:bg-slate-100'
                                : 'bg-slate-950/40 border-slate-800 hover:bg-slate-800'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer pointer-events-none"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-mono font-black text-xs sm:text-sm text-slate-900 dark:text-white select-all break-all">{v.code}</div>
                            <div className="text-[11px] font-mono text-slate-600 dark:text-slate-300 font-semibold flex justify-between mt-0.5">
                              <span>{v.plan}</span>
                              <span className="font-bold text-emerald-600 dark:text-emerald-400">${(v.price || 0).toFixed(2)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 2. SELECTABLE A4 DOCUMENT LAYOUT (24, 20, or 16 vouchers in two columns) */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                3. Select A4 Document Layout (Two Columns)
              </label>
              <span className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 font-semibold">
                {tokensToExport.length} vouchers to export &bull; {totalPagesRequired} A4 Sheet{totalPagesRequired === 1 ? '' : 's'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Option A: 24 vouchers in two columns (12 rows x 2 cols) */}
              <div
                onClick={() => setA4Density(24)}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer relative flex flex-col justify-between ${
                  a4Density === 24
                    ? theme === 'light'
                      ? 'bg-sky-50 border-sky-500 ring-2 ring-sky-500/20 shadow-sm'
                      : 'bg-sky-950/40 border-sky-500 ring-2 ring-sky-500/20 shadow-sm'
                    : theme === 'light'
                      ? 'bg-white border-slate-200 hover:border-slate-300'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold font-display">24 Vouchers / Sheet</span>
                    {a4Density === 24 && <Check className="w-4 h-4 text-sky-500" />}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono leading-relaxed">
                    <strong>12 rows &times; 2 columns</strong>
                    <br />
                    Maximum density. Ideal for pocket cut vouchers and high volume paper economy.
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-[10px] font-mono text-sky-600 dark:text-sky-400 font-bold">
                  High Density (24/page)
                </div>
              </div>

              {/* Option B: 20 vouchers in two columns (10 rows x 2 cols) */}
              <div
                onClick={() => setA4Density(20)}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer relative flex flex-col justify-between ${
                  a4Density === 20
                    ? theme === 'light'
                      ? 'bg-sky-50 border-sky-500 ring-2 ring-sky-500/20 shadow-sm'
                      : 'bg-sky-950/40 border-sky-500 ring-2 ring-sky-500/20 shadow-sm'
                    : theme === 'light'
                      ? 'bg-white border-slate-200 hover:border-slate-300'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold font-display">20 Vouchers / Sheet</span>
                    {a4Density === 20 && <Check className="w-4 h-4 text-sky-500" />}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono leading-relaxed">
                    <strong>10 rows &times; 2 columns</strong>
                    <br />
                    Balanced density. Generous padding with comfortable tear/cut margin lines.
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-[10px] font-mono text-sky-600 dark:text-sky-400 font-bold">
                  Balanced (20/page)
                </div>
              </div>

              {/* Option C: 16 vouchers in two columns (8 rows x 2 cols) */}
              <div
                onClick={() => setA4Density(16)}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer relative flex flex-col justify-between ${
                  a4Density === 16
                    ? theme === 'light'
                      ? 'bg-sky-50 border-sky-500 ring-2 ring-sky-500/20 shadow-sm'
                      : 'bg-sky-950/40 border-sky-500 ring-2 ring-sky-500/20 shadow-sm'
                    : theme === 'light'
                      ? 'bg-white border-slate-200 hover:border-slate-300'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold font-display">16 Vouchers / Sheet</span>
                    {a4Density === 16 && <Check className="w-4 h-4 text-sky-500" />}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono leading-relaxed">
                    <strong>8 rows &times; 2 columns</strong>
                    <br />
                    Large cards. High-legibility font size, prominent SSID, and extended details.
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-[10px] font-mono text-sky-600 dark:text-sky-400 font-bold">
                  Large Cards (16/page)
                </div>
              </div>
            </div>
          </div>

          {/* 3. SAMPLE VOUCHER TICKET PREVIEW */}
          <div className={`p-4 rounded-2xl border ${
            theme === 'light' ? 'bg-slate-50/50 border-slate-200' : 'bg-slate-950/40 border-slate-800'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                <Scissors className="w-3.5 h-3.5 text-indigo-500" />
                <span>Live Sample Ticket Preview ({a4Density} vouchers/A4 in 2 columns)</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">Perforated cutting guide</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto">
              {/* Sample Ticket 1 */}
              <div className="border border-dashed border-slate-400 dark:border-slate-600 rounded-xl p-3 bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-xs uppercase tracking-tight">
                      {tokensToExport[0]?.plan || 'Gold Plan'}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      SSID: {tokensToExport[0]?.networkName || workspaceName}
                    </div>
                  </div>
                  <span className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-extrabold text-[11px] px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-800">
                    ${(tokensToExport[0]?.price || 1.0).toFixed(2)}
                  </span>
                </div>

                <div className="bg-slate-100 dark:bg-slate-800 rounded-lg py-1.5 text-center font-mono font-black text-sm tracking-wider text-sky-600 dark:text-sky-400">
                  {tokensToExport[0]?.code || 'LUS-GOLD-4921'}
                </div>

                <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                  <span>Access: {tokensToExport[0]?.duration || '24 Hours'}</span>
                  <span>Agent: {selectedAgent?.name || 'Assigned Agent'}</span>
                </div>
              </div>

              {/* Sample Ticket 2 */}
              <div className="border border-dashed border-slate-400 dark:border-slate-600 rounded-xl p-3 bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-xs uppercase tracking-tight">
                      {tokensToExport[1]?.plan || '30Days_Unlimited'}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      SSID: {tokensToExport[1]?.networkName || workspaceName}
                    </div>
                  </div>
                  <span className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-extrabold text-[11px] px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-800">
                    ${(tokensToExport[1]?.price || 0.5).toFixed(2)}
                  </span>
                </div>

                <div className="bg-slate-100 dark:bg-slate-800 rounded-lg py-1.5 text-center font-mono font-black text-sm tracking-wider text-sky-600 dark:text-sky-400">
                  {tokensToExport[1]?.code || 'LUS-STAR-7812'}
                </div>

                <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                  <span>Access: {tokensToExport[1]?.duration || '2 Hours'}</span>
                  <span>Agent: {selectedAgent?.name || 'Assigned Agent'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer: Action Buttons (PDF, Direct Print, CSV, Text) */}
        <div className={`p-4 sm:p-5 border-t shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3 ${
          theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
        }`}>
          <div className="text-xs font-mono text-slate-500 text-center sm:text-left">
            Total Manifest: <strong className="text-slate-900 dark:text-white">{tokensToExport.length} vouchers</strong> &bull; Face Value: <strong className="text-emerald-600 dark:text-emerald-400">${(totalFaceValue || 0).toFixed(2)}</strong>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto">
            {/* Direct Print Button */}
            <button
              id="btn-direct-print-agent-tokens"
              onClick={handleDirectPrint}
              type="button"
              disabled={tokensToExport.length === 0}
              className={`px-3.5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition shadow-xs cursor-pointer ${
                tokensToExport.length > 0
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
              }`}
              title="Print directly to standard printer"
            >
              <Printer className="w-4 h-4" />
              Direct Print (A4)
            </button>

            {/* Export PDF Button */}
            <button
              id="btn-export-pdf-agent-tokens"
              onClick={handleExportPDF}
              type="button"
              disabled={tokensToExport.length === 0}
              className={`px-3.5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition shadow-xs cursor-pointer ${
                tokensToExport.length > 0
                  ? 'bg-rose-600 hover:bg-rose-700 text-white'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
              }`}
              title="Download A4 PDF document"
            >
              <FileText className="w-4 h-4" />
              Export PDF ({a4Density}/pg)
            </button>

            {/* Export CSV Button */}
            <button
              id="btn-export-csv-agent-tokens"
              onClick={handleExportCSV}
              type="button"
              disabled={tokensToExport.length === 0}
              className={`px-3.5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition shadow-xs cursor-pointer ${
                tokensToExport.length > 0
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
              }`}
              title="Download spreadsheet CSV file"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Export CSV
            </button>

            {/* Export Text Button */}
            <button
              id="btn-export-txt-agent-tokens"
              onClick={handleExportText}
              type="button"
              disabled={tokensToExport.length === 0}
              className={`px-3 py-2.5 rounded-xl font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer ${
                theme === 'light'
                  ? 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                  : 'bg-slate-900 border border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
              title="Download plain text manifest"
            >
              <Download className="w-3.5 h-3.5" />
              Text (.txt)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
