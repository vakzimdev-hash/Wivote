import React from 'react';
import { Phone } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const WhatsAppIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg" fill="currentColor">
    <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2m.01 1.67c2.2 0 4.26.86 5.82 2.42a8.225 8.225 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.196 8.196 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24m4.52 10.23c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.17.04-.31-.02-.43s-.56-1.34-.76-1.84c-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.57.13.17 1.75 2.67 4.24 3.75.59.26 1.05.41 1.41.53.6.19 1.14.16 1.57.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.1-.23-.17-.48-.29z" />
  </svg>
);

export const GmailIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg">
    <path fill="#4285F4" d="M22.5 4.5h-3.75V19.5h3.75c.69 0 1.25-.56 1.25-1.25V5.75c0-.69-.56-1.25-1.25-1.25z" />
    <path fill="#34A853" d="M1.5 4.5h3.75V19.5H1.5c-.69 0-1.25-.56-1.25-1.25V5.75c0-.69.56-1.25 1.25-1.25z" />
    <path fill="#EA4335" d="M18.75 4.5l-6.75 5.06L5.25 4.5H1.5v2.25l10.5 7.88 10.5-7.88V4.5h-3.75z" />
    <path fill="#FBBC05" d="M5.25 4.5H1.5v2.25l3.75 2.81V4.5z" />
    <path fill="#C5221F" d="M18.75 4.5h3.75v2.25l-3.75 2.81V4.5z" />
  </svg>
);

interface ContactUsSectionProps {
  compact?: boolean;
  className?: string;
  label?: string;
}

export const ContactUsSection: React.FC<ContactUsSectionProps> = ({
  className = '',
  label = "Contact Admin"
}) => {
  const { theme } = useApp();

  return (
    <div
      className={`inline-flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-2xl border transition-all ${
        theme === 'light'
          ? 'bg-white/95 border-slate-200 shadow-sm text-slate-800'
          : 'bg-slate-900/95 border-slate-800 shadow-md text-slate-200'
      } ${className}`}
    >
      {label && (
        <span className="text-[10px] font-bold font-mono tracking-wide text-slate-400 uppercase select-none whitespace-nowrap">
          {label}
        </span>
      )}

      <div className="flex items-center gap-1.5">
        {/* Call shortcut */}
        <a
          href="tel:+263773024268"
          title="Call Administrator (+263 773 024 268)"
          aria-label="Call Administrator"
          className={`p-2 rounded-xl border transition-all duration-200 transform hover:scale-110 active:scale-95 flex items-center justify-center cursor-pointer ${
            theme === 'light'
              ? 'bg-sky-50 hover:bg-sky-500 text-sky-600 hover:text-white border-sky-200 hover:border-sky-500'
              : 'bg-sky-950/40 hover:bg-sky-500 text-sky-400 hover:text-white border-sky-800/60 hover:border-sky-500'
          }`}
        >
          <Phone className="w-4 h-4" />
        </a>

        {/* WhatsApp Meta Icon shortcut */}
        <a
          href="https://wa.me/263773024268?text=Hello%20Administrator,%20I%20need%20assistance%20with%20my%20WiVoTe%20workspace."
          target="_blank"
          rel="noopener noreferrer"
          title="Chat on WhatsApp (+263 773 024 268)"
          aria-label="Chat on WhatsApp"
          className={`p-2 rounded-xl border transition-all duration-200 transform hover:scale-110 active:scale-95 flex items-center justify-center cursor-pointer ${
            theme === 'light'
              ? 'bg-emerald-50 hover:bg-[#25D366] text-[#25D366] hover:text-white border-emerald-200 hover:border-[#25D366]'
              : 'bg-emerald-950/40 hover:bg-[#25D366] text-[#25D366] hover:text-white border-emerald-800/60 hover:border-[#25D366]'
          }`}
        >
          <WhatsAppIcon className="w-4 h-4" />
        </a>

        {/* Gmail Icon shortcut */}
        <a
          href="mailto:onlineproductfinder@gmail.com?subject=WiVoTe%20Administrator%20Support%20%26%20Activation"
          title="Email via Gmail (onlineproductfinder@gmail.com)"
          aria-label="Email via Gmail"
          className={`p-2 rounded-xl border transition-all duration-200 transform hover:scale-110 active:scale-95 flex items-center justify-center cursor-pointer ${
            theme === 'light'
              ? 'bg-white hover:bg-slate-100 border-slate-200 hover:border-red-400 shadow-sm'
              : 'bg-slate-800 hover:bg-slate-750 border-slate-700 hover:border-red-500/60'
          }`}
        >
          <GmailIcon className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
};
