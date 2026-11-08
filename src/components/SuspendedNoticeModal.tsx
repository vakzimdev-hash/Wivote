import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Phone, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { WhatsAppIcon, GmailIcon } from './ContactUsSection';

interface SuspendedNoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceName?: string;
  userEmail?: string;
}

export const SuspendedNoticeModal: React.FC<SuspendedNoticeModalProps> = ({
  isOpen,
  onClose,
  workspaceName,
  userEmail
}) => {
  const { theme } = useApp();

  if (!isOpen) return null;

  const contactOptions = [
    {
      name: 'Call Admin',
      value: '+263773024268',
      href: 'tel:+263773024268',
      icon: Phone,
      bg: 'bg-sky-500 hover:bg-sky-600 border-sky-400'
    },
    {
      name: 'WhatsApp',
      value: '+263773024268',
      href: `https://wa.me/263773024268?text=Hello%20App%20Owner,%20my%20workspace%20account%20(${encodeURIComponent(workspaceName || 'WiVoTe')})%20is%20suspended.%20Please%20help%20activate%20it.`,
      icon: WhatsAppIcon,
      bg: 'bg-[#25D366] hover:bg-[#1EBE5D] border-emerald-400'
    },
    {
      name: 'Gmail',
      value: 'onlineproductfinder@gmail.com',
      href: `mailto:onlineproductfinder@gmail.com?subject=Workspace%20Activation%20Request%20-%20${encodeURIComponent(workspaceName || 'WiVoTe')}&body=Hello%20App%20Owner,%0A%0AMy%20workspace%20(${workspaceName || 'My Workspace'})%20is%20currently%20suspended.%20User%20email:%20${userEmail || ''}%0A%0APlease%20manually%20activate%20the%20account.%0A%0AThank%20you!`,
      icon: GmailIcon,
      bg: 'bg-white hover:bg-slate-100 text-slate-900 border-slate-300 dark:border-slate-700'
    }
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
        <motion.div
          initial={{ scale: 0.94, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.94, opacity: 0, y: 10 }}
          className={`w-full max-w-lg rounded-3xl border shadow-2xl overflow-hidden relative ${
            theme === 'light'
              ? 'bg-white border-amber-500/30 text-slate-900'
              : 'bg-slate-900 border-amber-500/30 text-white'
          }`}
        >
          {/* Top Amber Status Bar */}
          <div className="h-2 bg-gradient-to-r from-amber-500 via-rose-500 to-amber-500" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="p-6 sm:p-7">
            {/* Header with Warning Icon */}
            <div className="flex items-start gap-4 mb-5">
              <div className="p-3.5 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0">
                <AlertTriangle className="w-8 h-8 animate-pulse" />
              </div>
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 mb-1">
                  <span>⚠️ Status: Pending / Suspended</span>
                </div>
                <h3 className="text-xl font-black font-display tracking-tight">
                  Account Suspended! Contact App Owner!
                </h3>
              </div>
            </div>

            {/* Explanation box */}
            <div className={`p-4 rounded-2xl border text-xs leading-relaxed mb-5 ${
              theme === 'light'
                ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                : 'bg-amber-950/20 border-amber-800/40 text-amber-300'
            }`}>
              <p className="font-semibold mb-1">
                {workspaceName ? `Workspace "${workspaceName}"` : 'This workspace'} is currently in suspended status.
              </p>
              <p className="opacity-90">
                Since online payment processing is in manual verification mode, all new and inactive client workspaces require manual activation by the App Owner before login is granted.
              </p>
            </div>

            {/* Contact Shortcuts - Ultra Compact Icons */}
            <div className="mb-6 p-4 rounded-2xl border bg-slate-50/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-center">
              <div className="text-[11px] font-bold font-mono uppercase tracking-wider text-slate-400 mb-3">
                Contact Administrator Directly:
              </div>

              <div className="flex items-center justify-center gap-3">
                {contactOptions.map((opt, idx) => {
                  const Icon = opt.icon;
                  return (
                    <a
                      key={idx}
                      href={opt.href}
                      target={opt.href.startsWith('http') ? '_blank' : undefined}
                      rel={opt.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                      title={opt.name}
                      className={`p-3 rounded-2xl border text-white transition-all transform hover:scale-110 active:scale-95 flex items-center gap-2 cursor-pointer shadow-md ${opt.bg}`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-xs font-bold font-mono">{opt.name.split(' ')[0]}</span>
                    </a>
                  );
                })}
              </div>
            </div>

            {/* Footer Close */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 rounded-xl border text-xs font-bold font-mono uppercase tracking-wider transition cursor-pointer text-slate-400 hover:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-center"
              >
                Close & Return
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
