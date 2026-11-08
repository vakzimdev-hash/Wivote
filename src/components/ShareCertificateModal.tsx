import React from 'react';
import { InvestorStake, ShareholdingGovernance } from '../types';
import { Award, Printer, Download, X, ShieldCheck, Landmark } from 'lucide-react';
import { formatCurrency } from '../utils/investmentCalculations';
import { useApp } from '../context/AppContext';

interface ShareCertificateModalProps {
  investor: InvestorStake;
  governance: ShareholdingGovernance;
  workspaceName: string;
  onClose: () => void;
}

export const ShareCertificateModal: React.FC<ShareCertificateModalProps> = ({
  investor,
  governance,
  workspaceName,
  onClose
}) => {
  const { theme } = useApp();

  const handlePrint = () => {
    window.print();
  };

  const certNumber = investor.shareCertificateNumber || `CERT-WV-${investor.id.toUpperCase()}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto print:p-0 print:bg-white">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden print:border-none print:shadow-none print:w-full print:max-w-none">
        
        {/* Action Header - Hidden during print */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 print:hidden">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-500" />
            <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-slate-900 dark:text-white">
              Official Shareholding Certificate
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-xs font-mono font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Certificate</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Certificate Body */}
        <div className="p-8 sm:p-12 print:p-6 bg-white text-slate-900">
          <div className="border-8 border-double border-amber-600/40 rounded-xl p-8 sm:p-10 relative bg-gradient-to-b from-amber-50/20 via-white to-amber-50/20 shadow-inner">
            
            {/* Watermark Logo */}
            <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none">
              <Landmark className="w-96 h-96 text-amber-900" />
            </div>

            {/* Certificate Header */}
            <div className="text-center relative z-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-[11px] font-mono font-bold uppercase tracking-widest mb-3 border border-amber-300">
                <ShieldCheck className="w-3.5 h-3.5" />
                Capital Stock & Equity Registry
              </div>
              <h1 className="text-2xl sm:text-4xl font-serif font-black tracking-wide text-slate-900 uppercase">
                Certificate of Shareholding
              </h1>
              <p className="text-xs font-mono text-slate-500 uppercase tracking-widest mt-1">
                Certificate No: <span className="font-bold text-slate-800">{certNumber}</span>
              </p>
            </div>

            {/* Recipient & Grant Text */}
            <div className="my-8 text-center relative z-10 space-y-4">
              <p className="text-sm font-serif italic text-slate-600">
                This is to certify that
              </p>
              <h2 className="text-xl sm:text-3xl font-serif font-extrabold text-amber-900 underline decoration-amber-500/50 underline-offset-8">
                {investor.name}
              </h2>
              <p className="text-xs font-serif text-slate-700 max-w-xl mx-auto leading-relaxed pt-2">
                is the recorded and lawful proprietor of fully paid and non-assessable units of 
                <span className="font-bold text-slate-900"> {investor.investorType.replace(/([A-Z])/g, ' $1').trim()} </span> 
                representing equity participation in
              </p>
              <h3 className="text-lg sm:text-xl font-bold font-mono tracking-wide text-slate-900 uppercase">
                {workspaceName}
              </h3>
            </div>

            {/* Metrics Breakdown Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200 relative z-10 text-center font-mono my-6">
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">Shares Owned</span>
                <span className="text-base font-extrabold text-slate-900">
                  {investor.sharesCount.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">Equity Stake</span>
                <span className="text-base font-extrabold text-emerald-650">
                  {(investor.equityPercentage || 0).toFixed(2)}%
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">Capital Injected</span>
                <span className="text-base font-extrabold text-slate-900">
                  {formatCurrency(investor.contributionAmount)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">Par / Fair Value</span>
                <span className="text-base font-extrabold text-sky-700">
                  {formatCurrency(investor.currentMonetaryValue)}
                </span>
              </div>
            </div>

            {/* Legal Covenants & Signatures */}
            <div className="mt-8 pt-6 border-t border-slate-200 relative z-10 text-xs text-slate-600 space-y-6">
              <p className="text-[11px] leading-relaxed text-center italic text-slate-500">
                Issued pursuant to the governance articles under {governance.framework.replace(/_/g, ' ')}. 
                Transferable only on the books of the corporation by the holder hereof in person or by attorney upon surrender of this certificate properly endorsed.
              </p>

              <div className="grid grid-cols-2 gap-8 pt-4">
                <div className="border-t border-slate-400 pt-2 text-center">
                  <div className="h-10 flex items-center justify-center italic font-serif text-slate-700 text-sm">
                    {workspaceName} Corporate Secretary
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 uppercase">Managing Director / Board</span>
                </div>
                <div className="border-t border-slate-400 pt-2 text-center">
                  <div className="h-10 flex items-center justify-center font-mono text-slate-700 text-xs">
                    {new Date(investor.dateJoined).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 uppercase">Registry Date of Inscription</span>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Modal Footer with Close/Back Button - Hidden during print */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 print:hidden rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold tracking-wider uppercase border transition cursor-pointer active:scale-95 ${
              theme === 'light'
                ? 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
                : 'bg-slate-950 hover:bg-slate-850 border-slate-800 text-slate-350'
            }`}
          >
            Cancel / Back
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-mono font-bold flex items-center gap-2 transition shadow-sm cursor-pointer active:scale-95"
          >
            <Printer className="w-4 h-4" />
            <span>Print Certificate</span>
          </button>
        </div>

      </div>
    </div>
  );
};
