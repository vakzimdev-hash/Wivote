import React from 'react';

interface AppLogoProps {
  className?: string;
  imgClassName?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  showText?: boolean;
  textSize?: string;
  subtitle?: string;
  glow?: boolean;
}

export const AppLogo: React.FC<AppLogoProps> = ({
  className = '',
  imgClassName = '',
  size = 'md',
  showText = false,
  textSize = 'text-xl',
  subtitle,
  glow = true
}) => {
  const sizeMap = {
    xs: 'w-6 h-6',
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
    xl: 'w-20 h-20',
    '2xl': 'w-28 h-28'
  };

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <div className="relative shrink-0 flex items-center justify-center">
        {glow && (
          <div className="absolute inset-0 bg-sky-500/20 rounded-2xl blur-md scale-90 pointer-events-none" />
        )}
        <img
          src="/wivote_logo.png"
          alt="WiVoTe Logo"
          referrerPolicy="no-referrer"
          className={`${sizeMap[size]} object-contain drop-shadow-md rounded-xl relative z-10 transition-transform hover:scale-105 duration-200 ${imgClassName}`}
        />
      </div>
      {showText && (
        <div className="flex flex-col">
          <span className={`${textSize} font-black font-display tracking-tight leading-none bg-gradient-to-r from-sky-400 via-indigo-400 to-sky-300 bg-clip-text text-transparent`}>
            WiVoTe
          </span>
          {subtitle && (
            <span className="text-[9px] font-mono tracking-widest text-slate-400 uppercase mt-1">
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
