export interface AppThemePreset {
  id: string;
  name: string;
  base: 'light' | 'dark';
  variables: {
    bg: string;
    cardBg: string;
    border: string;
    accent: string;
    accentBg: string;
    accentHover: string;
    textMain: string;
    textMuted: string;
    accentGlow: string;
  };
}

export const APP_THEMES: AppThemePreset[] = [
  {
    id: 'carbon-blue',
    name: 'Carbon Blue (Cool Dark)',
    base: 'dark',
    variables: {
      bg: '#090d16',
      cardBg: '#111625',
      border: '#1e293b',
      accent: '#38bdf8',
      accentBg: '#0ea5e9',
      accentHover: '#0284c7',
      textMain: '#f1f5f9',
      textMuted: '#94a3b8',
      accentGlow: 'rgba(14, 165, 233, 0.15)'
    }
  },
  {
    id: 'solar-amber',
    name: 'Solar Amber (Warm Sepia)',
    base: 'light',
    variables: {
      bg: '#fbf9f4',
      cardBg: '#ffffff',
      border: '#e2dcd5',
      accent: '#d97706',
      accentBg: '#d97706',
      accentHover: '#b45309',
      textMain: '#1e293b',
      textMuted: '#57534e',
      accentGlow: 'rgba(217, 119, 6, 0.1)'
    }
  },
  {
    id: 'forest-sage',
    name: 'Forest Sage (Calming Spruce)',
    base: 'dark',
    variables: {
      bg: '#060f0e',
      cardBg: '#0e1b1a',
      border: '#1b2d2a',
      accent: '#10b981',
      accentBg: '#10b981',
      accentHover: '#059669',
      textMain: '#f0fdf4',
      textMuted: '#86efac',
      accentGlow: 'rgba(16, 185, 129, 0.15)'
    }
  },
  {
    id: 'classic-light',
    name: 'Classic Off-White (Contrast Light)',
    base: 'light',
    variables: {
      bg: '#f8fafc',
      cardBg: '#ffffff',
      border: '#e2e8f0',
      accent: '#4f46e5',
      accentBg: '#4f46e5',
      accentHover: '#4338ca',
      textMain: '#0f172a',
      textMuted: '#475569',
      accentGlow: 'rgba(79, 70, 229, 0.1)'
    }
  },
  {
    id: 'midnight-orchid',
    name: 'Midnight Orchid (Velvet Violet)',
    base: 'dark',
    variables: {
      bg: '#0d081b',
      cardBg: '#150e2a',
      border: '#2b1a4a',
      accent: '#ec4899',
      accentBg: '#d946ef',
      accentHover: '#c084fc',
      textMain: '#fdf4ff',
      textMuted: '#c084fc',
      accentGlow: 'rgba(217, 70, 239, 0.15)'
    }
  }
];

export function applyThemeVariables(themeId: string) {
  const currentTheme = APP_THEMES.find(t => t.id === themeId) || APP_THEMES[0];
  const root = document.documentElement;
  
  // Set global CSS variables
  root.style.setProperty('--theme-bg', currentTheme.variables.bg);
  root.style.setProperty('--theme-card-bg', currentTheme.variables.cardBg);
  root.style.setProperty('--theme-border', currentTheme.variables.border);
  root.style.setProperty('--theme-accent', currentTheme.variables.accent);
  root.style.setProperty('--theme-accent-bg', currentTheme.variables.accentBg);
  root.style.setProperty('--theme-accent-hover', currentTheme.variables.accentHover);
  root.style.setProperty('--theme-text-main', currentTheme.variables.textMain);
  root.style.setProperty('--theme-text-muted', currentTheme.variables.textMuted);
  root.style.setProperty('--theme-accent-glow', currentTheme.variables.accentGlow);
  
  // Apply a class corresponding to theme base on document.documentElement for high-contrast toggles
  if (currentTheme.base === 'light') {
    root.classList.remove('dark');
    root.classList.add('light');
  } else {
    root.classList.remove('light');
    root.classList.add('dark');
  }
}
