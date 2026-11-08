import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Phone, X, Sparkles } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { WhatsAppIcon, GmailIcon } from './ContactUsSection';

interface RegistrationSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceName: string;
  ownerName: string;
  ownerEmail: string;
  tier: string;
}

export const RegistrationSuccessModal: React.FC<RegistrationSuccessModalProps> = ({
  isOpen,
  onClose,
  workspaceName,
  ownerName,
  ownerEmail,
  tier
}) => {
  const { theme } = useApp();

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
        <motion.div
          initial={{ scale: 0.94, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.94, opacity: 0, y: 10 }}
          className={`w-full max-w-lg rounded-3xl border shadow-2xl overflow-hidden relative ${
            theme === 'light'
              ? 'bg-white border-emerald-500/30 text-slate-900'
              : 'bg-slate-900 border-emerald-500/30 text-white'
          }`}
        >
          {/* Top Emerald Gradient */}
          <div className="h-2 bg-gradient-to-r from-emerald-500 via-sky-500 to-indigo-500" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="p-6 sm:p-7">
            {/* Header with Success Icon */}
            <div className="flex items-start gap-4 mb-5">
              <div className="p-3.5 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shrink-0">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 mb-1">
                  <Sparkles className="w-3 h-3" />
                  <span>Workspace Registered</span>
                </div>
                <h3 className="text-xl font-black font-display tracking-tight">
                  Registration Successful!
                </h3>
              </div>
            </div>

            {/* Details Box */}
            <div className={`p-4 rounded-2xl border space-y-2 mb-4 text-xs font-mono ${
              theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
            }`}>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Workspace:</span>
                <span className="font-bold text-indigo-500">{workspaceName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Owner:</span>
                <span className="font-bold">{ownerName} ({ownerEmail})</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Plan Selected:</span>
                <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 font-bold">{tier} Plan</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-slate-200 dark:border-slate-800">
                <span className="text-slate-400">Initial Status:</span>
                <span className="text-amber-500 font-bold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                  Pending Manual Activation (Suspended)
                </span>
              </div>
            </div>

            {/* Explanation Note */}
            <div className={`p-4 rounded-2xl border text-xs leading-relaxed mb-5 ${
              theme === 'light'
                ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                : 'bg-amber-950/20 border-amber-800/40 text-amber-300'
            }`}>
              <p className="font-bold mb-1">
                ⚠️ Account Activation Notice:
              </p>
              <p className="opacity-90">
                Because online automated payment is currently offline, your workspace has been registered in <strong>Pending (Suspended)</strong> status. The App Owner will verify and manually activate your account. Contact the App Owner using the shortcuts below to activate your account immediately:
              </p>
            </div>

            {/* Quick Contact shortcuts - Ultra Compact */}
            <div className="mb-6 p-4 rounded-2xl border bg-slate-50/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-center">
              <div className="text-[11px] font-bold font-mono uppercase tracking-wider text-slate-400 mb-3">
                Request Instant Activation:
              </div>

              <div className="flex items-center justify-center gap-3">
                <a
                  href="tel:+263773024268"
                  title="Call App Owner (+263 773 024 268)"
                  className="p-3 rounded-2xl border text-white transition-all transform hover:scale-110 active:scale-95 flex items-center gap-2 cursor-pointer shadow-md bg-sky-500 hover:bg-sky-600 border-sky-400"
                >
                  <Phone className="w-5 h-5" />
                  <span className="text-xs font-bold font-mono">Call</span>
                </a>

                <a
                  href={`https://wa.me/263773024268?text=Hello%20App%20Owner,%20I%20have%20registered%20a%20new%20workspace%20(${encodeURIComponent(workspaceName)})%20on%20the%20${tier}%20Plan.%20Please%20activate%20my%20account.`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="WhatsApp App Owner (+263 773 024 268)"
                  className="p-3 rounded-2xl border text-white transition-all transform hover:scale-110 active:scale-95 flex items-center gap-2 cursor-pointer shadow-md bg-[#25D366] hover:bg-[#1EBE5D] border-emerald-400"
                >
                  <WhatsAppIcon className="w-5 h-5" />
                  <span className="text-xs font-bold font-mono">WhatsApp</span>
                </a>

                <a
                  href={`mailto:onlineproductfinder@gmail.com?subject=Workspace%20Activation%20Request%20-%20${encodeURIComponent(workspaceName)}&body=Hello%20App%20Owner,%0A%0AI%20have%20registered%20a%20new%20workspace%20(${workspaceName})%20on%20the%20${tier}%20Plan.%20Owner:%20${ownerName}%20(${ownerEmail}).%0A%0APlease%20manually%20activate%20the%20account.%0A%0AThank%20you!`}
                  title="Email App Owner via Gmail (onlineproductfinder@gmail.com)"
                  className="p-3 rounded-2xl border transition-all transform hover:scale-110 active:scale-95 flex items-center gap-2 cursor-pointer shadow-md bg-white hover:bg-slate-100 text-slate-900 border-slate-300 dark:border-slate-700"
                >
                  <GmailIcon className="w-5 h-5" />
                  <span className="text-xs font-bold font-mono">Gmail</span>
                </a>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-full bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-2xl text-xs font-bold font-mono uppercase tracking-wider transition cursor-pointer text-center"
            >
              Return to Login Portal
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
