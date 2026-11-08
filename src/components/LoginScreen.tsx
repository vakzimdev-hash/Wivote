import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { motion, AnimatePresence } from 'motion/react';
import { isFirebasePlaceholder, auth } from '../firebase';
import { signInWithRedirect, getRedirectResult, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { 
  Wifi, 
  ShieldCheck, 
  UserCheck, 
  Lock, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  Smartphone, 
  Laptop, 
  ArrowRight, 
  Check, 
  HelpCircle,
  Users,
  Shield,
  Fingerprint,
  Plus,
  LogIn,
  Mail,
  User,
  Building,
  CreditCard,
  Sparkles,
  Phone,
  Globe,
  MessageSquare,
  AlertTriangle,
  Clock,
  ChevronDown,
  X,
  KeyRound,
  RefreshCw
} from 'lucide-react';
import { ContactUsSection } from './ContactUsSection';
import { SuspendedNoticeModal } from './SuspendedNoticeModal';
import { RegistrationSuccessModal } from './RegistrationSuccessModal';
import { SubscriptionSliderSelector } from './SubscriptionSliderSelector';
import { CountryPhoneInput } from './CountryPhoneInput';
import { getPlatformActiveAgentsCount } from '../utils/rbacPolicy';
import { validatePasswordPolicy } from '../utils/passwordPolicy';

const GoogleIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
  </svg>
);

export const LoginScreen: React.FC = () => {
  const { 
    users, 
    loginUser, 
    loginWithGoogle,
    loginWithBiometrics,
    theme, 
    toggleTheme, 
    showSplash,
    workspaces,
    workspacesRecordedCount,
    agentsRecordedCount,
    selfRegisterWorkspace,
    pricingPackages,
    requestedRole,
    setRequestedRole,
    requestPasswordResetOtp,
    resetPasswordWithOtp,
    showToast
  } = useApp();

  const activeWorkspacesCount = typeof workspacesRecordedCount === 'number' && workspacesRecordedCount >= 0
    ? workspacesRecordedCount
    : (workspaces?.length || 0);

  const totalAgentsCount = useMemo(() => {
    if (typeof agentsRecordedCount === 'number' && agentsRecordedCount >= 0) {
      return agentsRecordedCount;
    }
    return getPlatformActiveAgentsCount(users || [], workspaces || []);
  }, [agentsRecordedCount, users, workspaces]);
  const [agentCountDisplay, setAgentCountDisplay] = useState(0);

  useEffect(() => {
    const target = totalAgentsCount || 0;
    if (target === 0) {
      setAgentCountDisplay(0);
      return;
    }
    let start = 0;
    const duration = 1200; // 1.2 seconds total duration
    const intervalTime = Math.max(15, Math.floor(duration / target));
    
    const timer = setInterval(() => {
      start += Math.ceil(target / 15) || 1; // Increment by chunk
      if (start >= target) {
        setAgentCountDisplay(target);
        clearInterval(timer);
      } else {
        setAgentCountDisplay(start);
      }
    }, intervalTime);

    return () => clearInterval(timer);
  }, [totalAgentsCount]);

  const [role, setRole] = useState<'Admin' | 'Agent' | 'AppOwner'>('Admin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Modals and Notices for Suspended Workspaces and Registration ---
  const [suspendedModalInfo, setSuspendedModalInfo] = useState<{
    isOpen: boolean;
    workspaceName?: string;
    userEmail?: string;
  }>({ isOpen: false });

  const [registrationSuccessInfo, setRegistrationSuccessInfo] = useState<{
    isOpen: boolean;
    workspaceName: string;
    ownerName: string;
    ownerEmail: string;
    tier: string;
  }>({
    isOpen: false,
    workspaceName: '',
    ownerName: '',
    ownerEmail: '',
    tier: 'Starter'
  });

  // --- Self-Registration states ---
  const COUNTRIES = useMemo(() => [
    { code: '+263', name: 'Zimbabwe', flag: '🇿🇼', placeholder: '77112233' },
    { code: '+27', name: 'South Africa', flag: '🇿🇦', placeholder: '821234567' },
    { code: '+260', name: 'Zambia', flag: '🇿🇲', placeholder: '971234567' },
    { code: '+258', name: 'Mozambique', flag: '🇲🇿', placeholder: '841234567' },
    { code: '+254', name: 'Kenya', flag: '🇰🇪', placeholder: '712345678' },
    { code: '+234', name: 'Nigeria', flag: '🇳🇬', placeholder: '8031234567' },
    { code: '+44', name: 'United Kingdom', flag: '🇬🇧', placeholder: '7123456789' },
    { code: '+1', name: 'United States', flag: '🇺🇸', placeholder: '2015550123' },
  ], []);
  const [selectedRegCountry, setSelectedRegCountry] = useState({ code: '+263', name: 'Zimbabwe', flag: '🇿🇼', placeholder: '77112233' });
  const [isRegCountryDropdownOpen, setIsRegCountryDropdownOpen] = useState(false);

  // --- Forgot Password states ---
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotRole, setForgotRole] = useState<'Admin' | 'Agent'>('Admin');
  const [forgotStep, setForgotStep] = useState<'request' | 'verify'>('request');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [forgotOtpSent, setForgotOtpSent] = useState('');
  const [forgotUid, setForgotUid] = useState('');
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);
  const [isForgotSubmitting, setIsForgotSubmitting] = useState(false);

  const [isRegistering, setIsRegistering] = useState(false);
  const [regWorkspaceName, setRegWorkspaceName] = useState('');
  const [regOwnerName, setRegOwnerName] = useState('');
  const [regOwnerEmail, setRegOwnerEmail] = useState('');
  const [regOwnerCell, setRegOwnerCell] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regTier, setRegTier] = useState<'Starter' | 'Gold' | 'Lithium'>('Starter');
  const [regTrialMode, setRegTrialMode] = useState<'trial' | 'payment'>('trial');
  const [regMonths, setRegMonths] = useState<number>(1);
  
  // Payment simulation fields
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'momo'>('momo');
  const [momoProvider, setMomoProvider] = useState<'MTN' | 'Airtel' | 'Zamtel'>('MTN');
  const [momoNumber, setMomoNumber] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardName, setCardName] = useState('');

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!regWorkspaceName.trim() || !regOwnerName.trim() || !regOwnerEmail.trim() || !regOwnerCell.trim() || !regPassword.trim()) {
      setError('Please fill in all registration fields.');
      return;
    }

    setIsSubmitting(true);

    try {
      const fullCellNumber = selectedRegCountry.code + ' ' + regOwnerCell.trim();
      const res = await selfRegisterWorkspace(
        regWorkspaceName.trim(),
        regTier,
        regOwnerEmail.trim(),
        regOwnerName.trim(),
        fullCellNumber,
        regTrialMode,
        regPassword.trim(),
        regMonths
      );

      setIsSubmitting(false);

      if (res && !res.success) {
        setError(res.error || 'Registration failed.');
      } else {
        localStorage.setItem('wivote_device_registered', 'true');
        setIsUsedDevice(true);
        // Show rich registration success modal with activation guidance & contact shortcuts
        setRegistrationSuccessInfo({
          isOpen: true,
          workspaceName: regWorkspaceName.trim(),
          ownerName: regOwnerName.trim(),
          ownerEmail: regOwnerEmail.trim(),
          tier: regTier
        });
        setIsRegistering(false);
        // Reset registration fields
        setRegWorkspaceName('');
        setRegOwnerName('');
        setRegOwnerEmail('');
        setRegOwnerCell('');
        setRegPassword('');
      }
    } catch (err: any) {
      setIsSubmitting(false);
      setError(err.message || 'An unexpected error occurred during registration.');
    }
  };

  // --- Biometric Authentication states ---
  const [isScanningBiometrics, setIsScanningBiometrics] = useState(false);
  const [biometricScanUser, setBiometricScanUser] = useState<any>(null);
  const [biometricScanProgress, setBiometricScanProgress] = useState(0);
  const [biometricScanError, setBiometricScanError] = useState<string | null>(null);
  const [showBiometricNoProfile, setShowBiometricNoProfile] = useState(false);

  // --- Google Sign-In states ---
  const [showGoogleChooser, setShowGoogleChooser] = useState(false);
  const [customGoogleEmail, setCustomGoogleEmail] = useState('');
  const [customGoogleName, setCustomGoogleName] = useState('');
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);

  // Device simulation state: Used Device vs New Device
  const [isUsedDevice, setIsUsedDevice] = useState<boolean>(() => {
    const registered = localStorage.getItem('wivote_device_registered');
    return registered === 'true';
  });

  const passwordRef = useRef<HTMLInputElement>(null);

  // Check if logged out due to inactivity
  useEffect(() => {
    const reason = sessionStorage.getItem('wivote_logout_reason');
    if (reason === 'inactivity') {
      setError('You have been logged out automatically due to inactivity to protect your terminal.');
      sessionStorage.removeItem('wivote_logout_reason');
    }
  }, []);

  // Seed default remembered accounts on first render if simulated as Used Device (emails/names only, no passwords)
  useEffect(() => {
    const remembered = localStorage.getItem('wivote_remembered_users');
    if (!remembered) {
      const defaultRemembered = [
        { email: 'master@wivote.com', name: 'VakZim Admin Director', role: 'Admin' },
        { email: 'karimazondomike049@gmail.com', name: 'Mike Karim (App Owner)', role: 'AppOwner' }
      ];
      localStorage.setItem('wivote_remembered_users', JSON.stringify(defaultRemembered));
    }
  }, []);

  // Sync role to context requestedRole
  useEffect(() => {
    setRequestedRole(role);
  }, [role, setRequestedRole]);

  // Listen for Google Redirect Sign-In results when returning to portal
  useEffect(() => {
    if (isFirebasePlaceholder) return;

    const checkRedirectResult = async () => {
      const isRedirectPending = localStorage.getItem('wivote_google_auth_redirect_pending') === 'true';
      if (!isRedirectPending) {
        // Silently consume any redirect results (without showing any spinner or affecting the UI)
        try {
          await getRedirectResult(auth);
        } catch (e) {
          console.warn('Silent redirect check error:', e);
        }
        return;
      }

      try {
        setIsGoogleSigningIn(true);
        const result = await getRedirectResult(auth);
        if (result && result.user) {
          const user = result.user;
          if (user.email) {
            const emailTerm = user.email.toLowerCase().trim();
            const targetRole = (localStorage.getItem('wivote_google_auth_role') || 'Admin') as 'Admin' | 'Agent' | 'AppOwner';
            setRole(targetRole);

            if (targetRole === 'AppOwner') {
              if (emailTerm !== 'karimazondomike049@gmail.com') {
                setError('Security Alert: You cannot sign in with a workspace master or agent account when the AppOwner tab is active.');
                setIsGoogleSigningIn(false);
                localStorage.removeItem('wivote_google_auth_redirect_pending');
                localStorage.removeItem('wivote_google_auth_role');
                return;
              }
            } else {
              if (emailTerm === 'karimazondomike049@gmail.com') {
                setError('Security Alert: The App Owner account is not allowed for sign-in when Workspace Master or Agent is selected.');
                setIsGoogleSigningIn(false);
                localStorage.removeItem('wivote_google_auth_redirect_pending');
                localStorage.removeItem('wivote_google_auth_role');
                return;
              }
            }

            const res = await loginWithGoogle(user.email, user.displayName || 'Google User', user.photoURL || undefined);
            if (res && !res.success) {
              setError(res.error || 'Google Sign-In failed.');
            }
          }
        }
      } catch (err: any) {
        console.error('Error handling redirect sign-in result:', err);
        setError(err?.message || 'Google Redirect Sign-In failed.');
      } finally {
        setIsGoogleSigningIn(false);
        localStorage.removeItem('wivote_google_auth_redirect_pending');
        localStorage.removeItem('wivote_google_auth_role');
      }
    };

    checkRedirectResult();
  }, [isFirebasePlaceholder]);

  // Update persistent device state in localStorage when simulated state changes
  const handleDeviceTypeChange = (isUsed: boolean) => {
    setIsUsedDevice(isUsed);
    if (isUsed) {
      localStorage.setItem('wivote_device_registered', 'true');
    } else {
      localStorage.removeItem('wivote_device_registered');
    }
  };

  // Get remembered users from localStorage
  const rememberedUsers = useMemo(() => {
    try {
      const saved = localStorage.getItem('wivote_remembered_users');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }, [username, isUsedDevice]); // re-read when device type shifts

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sanitizedUsername = username.trim();
    const sanitizedPassword = password.trim();

    if (!sanitizedUsername || !sanitizedPassword) {
      setError('Please fill in all fields.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const res = await loginUser(sanitizedUsername, role, sanitizedPassword);
      setIsSubmitting(false);
      if (!res.success) {
        if (res.isSuspended) {
          setSuspendedModalInfo({
            isOpen: true,
            workspaceName: res.workspaceName || '',
            userEmail: sanitizedUsername
          });
        }
        setError(res.error || 'Authentication failed. Please check credentials.');
      } else {
        // Successful login, set device as registered
        localStorage.setItem('wivote_device_registered', 'true');
        setIsUsedDevice(true);
      }
    } catch (err: any) {
      setIsSubmitting(false);
      setError(err?.message || 'An error occurred during authentication.');
    }
  };

  // --- Filter and list users who have biometrics registered on this device ---
  const biometricUsers = useMemo(() => {
    return users.filter(u => localStorage.getItem(`wivote_biometrics_enabled_${u.uid}`) === 'true');
  }, [users]);

  // --- Handle Biometric Login trigger ---
  const handleBiometricLoginClick = () => {
    if (biometricUsers.length === 0) {
      setShowBiometricNoProfile(true);
      return;
    }

    // Attempt to match the currently selected workspace tab role
    const roleMap: Record<string, string> = {
      'Admin': 'WorkspaceMaster',
      'Agent': 'Agent',
      'AppOwner': 'AppOwner'
    };
    const targetRole = roleMap[role];
    let candidate = biometricUsers.find(u => u.role === targetRole);
    if (!candidate) {
      // fallback to the first biometric user
      candidate = biometricUsers[0];
    }

    setBiometricScanUser(candidate);
    setIsScanningBiometrics(true);
    setBiometricScanProgress(0);
    setBiometricScanError(null);

    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      setBiometricScanProgress(progress);
      if (progress >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          const res = loginWithBiometrics(candidate!.uid);
          setIsScanningBiometrics(false);
          if (!res.success) {
            if (res.isSuspended) {
              setSuspendedModalInfo({
                isOpen: true,
                workspaceName: res.workspaceName || '',
                userEmail: candidate?.email || ''
              });
            }
            setError(res.error || 'Biometric verification failed.');
          } else {
            localStorage.setItem('wivote_device_registered', 'true');
            setIsUsedDevice(true);
          }
        }, 400);
      }
    }, 150);
  };

  // --- Handle Google Login trigger ---
  const handleGoogleLoginClick = async () => {
    if (!isFirebasePlaceholder) {
      setError(null);
      setIsGoogleSigningIn(true);
      try {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });

        const inIframe = typeof window !== 'undefined' && window.self !== window.top;

        if (inIframe) {
          // Inside embedded preview iframes, Google blocks redirects due to X-Frame-Options.
          // signInWithPopup executes in a separate browser window and passes tokens via postMessage.
          try {
            const result = await signInWithPopup(auth, provider);
            const user = result.user;
            if (user && user.email) {
              const emailTerm = user.email.toLowerCase().trim();
              if (role === 'AppOwner') {
                if (emailTerm !== 'karimazondomike049@gmail.com') {
                  setError('Security Alert: You cannot sign in with a workspace master or agent account when the AppOwner tab is active.');
                  setIsGoogleSigningIn(false);
                  return;
                }
              } else {
                if (emailTerm === 'karimazondomike049@gmail.com') {
                  setError('Security Alert: The App Owner account is not allowed for sign-in when Workspace Master or Agent is selected.');
                  setIsGoogleSigningIn(false);
                  return;
                }
              }
              const res = await loginWithGoogle(user.email, user.displayName || 'Google User', user.photoURL || undefined);
              if (res && !res.success) {
                if (res.isSuspended) {
                  setSuspendedModalInfo({
                    isOpen: true,
                    workspaceName: res.workspaceName || '',
                    userEmail: user.email
                  });
                }
                setError(res.error || 'Google Sign-In failed.');
              }
            }
            setIsGoogleSigningIn(false);
            return;
          } catch (popupErr: any) {
            if (popupErr?.code === 'auth/popup-closed-by-user' || popupErr?.code === 'auth/cancelled-popup-request') {
              setIsGoogleSigningIn(false);
              return;
            }
            if (popupErr?.code === 'auth/popup-blocked') {
              setError('Popup was blocked by your browser. Please allow popups or use the manual Google Chooser below.');
              setShowGoogleChooser(true);
              setIsGoogleSigningIn(false);
              return;
            }
            console.warn('Popup error in iframe, falling back to chooser:', popupErr);
            setError(popupErr?.message || 'Google Sign-In failed.');
            setIsGoogleSigningIn(false);
            return;
          }
        }

        // Standalone tab / Direct browser session:
        try {
          const result = await signInWithPopup(auth, provider);
          const user = result.user;
          if (user && user.email) {
            const emailTerm = user.email.toLowerCase().trim();
            if (role === 'AppOwner') {
              if (emailTerm !== 'karimazondomike049@gmail.com') {
                setError('Security Alert: You cannot sign in with a workspace master or agent account when the AppOwner tab is active.');
                setIsGoogleSigningIn(false);
                return;
              }
            } else {
              if (emailTerm === 'karimazondomike049@gmail.com') {
                setError('Security Alert: The App Owner account is not allowed for sign-in when Workspace Master or Agent is selected.');
                setIsGoogleSigningIn(false);
                return;
              }
            }
            const res = await loginWithGoogle(user.email, user.displayName || 'Google User', user.photoURL || undefined);
            if (res && !res.success) {
              setError(res.error || 'Google Sign-In failed.');
            }
          }
          setIsGoogleSigningIn(false);
        } catch (popupErr: any) {
          if (popupErr?.code === 'auth/popup-closed-by-user' || popupErr?.code === 'auth/cancelled-popup-request') {
            setIsGoogleSigningIn(false);
            return;
          }
          // If popup is blocked or fails on mobile/standalone, fallback to standard redirect
          localStorage.setItem('wivote_google_auth_redirect_pending', 'true');
          localStorage.setItem('wivote_google_auth_role', role);
          await signInWithRedirect(auth, provider);
        }
      } catch (err: any) {
        console.error('Failed to trigger Google Sign-In:', err);
        setError(err?.message || 'Google Sign-In failed.');
        setIsGoogleSigningIn(false);
        localStorage.removeItem('wivote_google_auth_redirect_pending');
        localStorage.removeItem('wivote_google_auth_role');
      }
    } else {
      setShowGoogleChooser(true);
    }
  };

  const handleGoogleChooserSelect = async (email: string, name: string) => {
    const term = email.toLowerCase().trim();
    if (role === 'AppOwner') {
      if (term !== 'karimazondomike049@gmail.com') {
        setError('Security Alert: You cannot sign in with a workspace master or agent account when the AppOwner tab is active.');
        setShowGoogleChooser(false);
        return;
      }
    } else {
      if (term === 'karimazondomike049@gmail.com') {
        setError('Security Alert: The App Owner account is not allowed for sign-in when Workspace Master or Agent is selected.');
        setShowGoogleChooser(false);
        return;
      }
    }

    setShowGoogleChooser(false);
    setIsSubmitting(true);
    try {
      const res = await loginWithGoogle(email, name);
      if (res && !res.success) {
        setError(res.error || 'Google Sign-In failed.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCustomGoogleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customGoogleEmail.trim()) return;
    
    const email = customGoogleEmail.trim();
    const term = email.toLowerCase().trim();
    const name = customGoogleName.trim() || email.split('@')[0];

    if (role === 'AppOwner') {
      if (term !== 'karimazondomike049@gmail.com') {
        setError('Security Alert: You cannot sign in with a workspace master or agent account when the AppOwner tab is active.');
        setShowGoogleChooser(false);
        return;
      }
    } else {
      if (term === 'karimazondomike049@gmail.com') {
        setError('Security Alert: The App Owner account is not allowed for sign-in when Workspace Master or Agent is selected.');
        setShowGoogleChooser(false);
        return;
      }
    }
    
    setShowGoogleChooser(false);
    setIsSubmitting(true);
    try {
      const res = await loginWithGoogle(email, name);
      if (res && !res.success) {
        setError(res.error || 'Google Sign-In failed.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`min-h-screen flex flex-col justify-between transition-colors duration-300 ${
      theme === 'light' ? 'bg-slate-50 text-slate-900' : 'bg-slate-950 text-slate-100'
    }`}>
      
      {/* Top spacing / Theme toggle and Compact Contact bar */}
      <div className="max-w-7xl w-full mx-auto px-6 py-4 flex justify-between items-center">
        {/* Extremely compact contact administrator icons */}
        <ContactUsSection label="Contact Admin" />

        <button
          onClick={toggleTheme}
          className={`p-2.5 border rounded-2xl transition duration-200 cursor-pointer ${
            theme === 'light'
              ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white'
          }`}
        >
          {theme === 'light' ? (
            <span className="text-xs font-bold font-mono text-indigo-600 flex items-center gap-1.5">🌙 Dark Mode</span>
          ) : (
            <span className="text-xs font-bold font-mono text-amber-400 flex items-center gap-1.5">☀️ Light Mode</span>
          )}
        </button>
      </div>

      {/* Main Login Card container */}
      <div className="flex-grow flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          
          {/* Logo Branding */}
          <div className="text-center mb-5">
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 100 }}
              className="inline-flex relative mb-2"
            >
              <div className="absolute inset-0 bg-sky-500/25 rounded-3xl blur-xl scale-95 pointer-events-none" />
              <img
                src="/wivote_logo.png"
                alt="WiVoTe Logo"
                referrerPolicy="no-referrer"
                className="w-20 h-20 sm:w-24 sm:h-24 object-contain drop-shadow-xl rounded-2xl relative z-10 transition-transform hover:scale-105 duration-200"
              />
            </motion.div>
            <h1 className="text-2xl sm:text-3xl font-black font-display tracking-wider uppercase bg-gradient-to-r from-sky-400 via-indigo-400 to-sky-300 bg-clip-text text-transparent">
              WiVoTe
            </h1>
            <p className="text-[10px] font-mono tracking-widest text-slate-400 uppercase mt-0.5">
              wifi voucher terminal
            </p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-2xl border shadow-xl overflow-hidden p-6 relative ${
              theme === 'light'
                ? 'bg-white border-slate-200/80'
                : 'bg-slate-900 border-slate-800/80'
            }`}
          >
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-sky-500 via-indigo-500 to-purple-500" />

            <div className="text-center mb-4">
              <h2 className="text-lg font-extrabold uppercase font-display tracking-tight">
                {isRegistering ? "Client Self-Registration" : "Secure Portal Login"}
              </h2>
              <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
                {isRegistering ? "Deploy your brand new WiFi Voucher Terminal workspace" : "Select Role to Access Database"}
              </p>
            </div>

            {!isRegistering ? (
              <>
                {/* Device State Simulator Badge / Selector */}
                <div className={`p-2 rounded-xl mb-4 border flex items-center justify-between ${
                  theme === 'light'
                    ? 'bg-slate-50 border-slate-150'
                    : 'bg-slate-950 border-slate-850'
                }`}>
                  <div className="flex items-center gap-2">
                    {isUsedDevice ? (
                      <Smartphone className="w-3.5 h-3.5 text-sky-500 animate-pulse" />
                    ) : (
                      <Laptop className="w-3.5 h-3.5 text-emerald-500" />
                    )}
                    <div>
                      <div className="text-[9px] font-bold font-mono uppercase text-slate-400 leading-none">Device Detection</div>
                      <div className={`text-[10px] font-bold mt-0.5 ${isUsedDevice ? 'text-sky-500' : 'text-emerald-500'}`}>
                        {isUsedDevice ? 'Recognized Device' : 'New Device (Manual)'}
                      </div>
                    </div>
                  </div>
                  
                  {/* Simulator toggles */}
                  <div className="flex bg-slate-200 dark:bg-slate-900 p-0.5 rounded-lg border border-slate-300 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => handleDeviceTypeChange(true)}
                      className={`px-1.5 py-0.5 rounded-md text-[8px] font-bold uppercase transition ${
                        isUsedDevice 
                          ? 'bg-sky-500 text-white shadow-sm' 
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Simulate a device that has signed in before"
                    >
                      Used
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeviceTypeChange(false)}
                      className={`px-1.5 py-0.5 rounded-md text-[8px] font-bold uppercase transition ${
                        !isUsedDevice 
                          ? 'bg-emerald-500 text-white shadow-sm' 
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Simulate a brand new device (all manual)"
                    >
                      New
                    </button>
                  </div>
                </div>

                {/* Role Tab Selector (Admin vs Agent vs AppOwner) */}
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200/60 dark:border-slate-850 mb-4">
                  <button
                    type="button"
                    onClick={() => {
                      setRole('Admin');
                      setUsername('');
                      setPassword('');
                      setError(null);
                    }}
                    className={`py-2 rounded-lg text-xs font-bold font-mono uppercase tracking-wider transition-all duration-200 flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                      role === 'Admin'
                        ? theme === 'light'
                          ? 'bg-sky-50 text-sky-700 shadow-md border border-sky-200/60'
                          : 'bg-sky-950/30 text-sky-400 shadow-md border border-sky-900/60'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Users className={`w-3.5 h-3.5 ${role === 'Admin' ? 'text-sky-500' : ''}`} />
                    <span>Admin</span>
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => {
                      setRole('Agent');
                      setUsername('');
                      setPassword('');
                      setError(null);
                    }}
                    className={`py-2 rounded-lg text-xs font-bold font-mono uppercase tracking-wider transition-all duration-200 flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                      role === 'Agent'
                        ? theme === 'light'
                          ? 'bg-emerald-50 text-emerald-700 shadow-md border border-emerald-200/60'
                          : 'bg-emerald-950/30 text-emerald-400 shadow-md border border-emerald-900/60'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Smartphone className={`w-3.5 h-3.5 ${role === 'Agent' ? 'text-emerald-500' : ''}`} />
                    <span>Agent</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setRole('AppOwner');
                      setUsername('');
                      setPassword('');
                      setError(null);
                    }}
                    className={`py-2 rounded-lg text-xs font-bold font-mono uppercase tracking-wider transition-all duration-200 flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                      role === 'AppOwner'
                        ? theme === 'light'
                          ? 'bg-purple-50 text-purple-700 shadow-md border border-purple-200/60'
                          : 'bg-purple-950/30 text-purple-400 shadow-md border border-purple-900/60'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Shield className={`w-3.5 h-3.5 ${role === 'AppOwner' ? 'text-purple-500' : ''}`} />
                    <span>AppOwner</span>
                  </button>
                </div>

                {/* Login Form */}
                <form onSubmit={handleSubmit} className="space-y-3">
                  
                  {/* Username Input */}
                  <div className="relative">
                    <label className="text-[10px] font-bold font-mono uppercase tracking-wider text-slate-400 mb-1 block">
                      {role === 'AppOwner' ? 'AppOwner Email / ID' : `${role} Name or Email`}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <UserCheck className="w-3.5 h-3.5" />
                      </div>
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => {
                          setUsername(e.target.value);
                          setError(null);
                        }}
                        required
                        placeholder={
                          role === 'Admin'
                            ? 'e.g. master@wivote.com'
                            : role === 'Agent'
                              ? 'e.g. agent@wivote.com'
                              : 'e.g. appowner@wivote.com'
                        }
                        className={`w-full border rounded-xl pl-9 pr-4 py-2.5 text-xs focus:outline-none transition ${
                          theme === 'light'
                            ? 'bg-slate-50 border-slate-200 text-slate-950 focus:border-sky-500 focus:bg-white'
                            : 'bg-slate-950 border-slate-800 text-white focus:border-sky-500 focus:bg-slate-950'
                        }`}
                      />
                    </div>

                    {/* Standard clean username input without intrusive unconsented auto-fill overlays */}
                  </div>

                  {/* Password Input */}
                  <div className="relative">
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[10px] font-bold font-mono uppercase tracking-wider text-slate-400 block">
                        Security Password
                      </label>
                      {role !== 'AppOwner' && (
                        <button
                          type="button"
                          onClick={() => {
                            setForgotEmail(username || '');
                            setForgotRole(role === 'Admin' ? 'Admin' : 'Agent');
                            setForgotStep('request');
                            setForgotOtp('');
                            setForgotNewPassword('');
                            setForgotConfirmPassword('');
                            setForgotOtpSent('');
                            setForgotError(null);
                            setForgotSuccess(null);
                            setIsForgotPasswordOpen(true);
                          }}
                          className="text-[9px] font-mono text-sky-500 hover:text-sky-400 uppercase tracking-wider font-extrabold hover:underline cursor-pointer transition select-none"
                        >
                          Forgot Password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Lock className="w-3.5 h-3.5" />
                      </div>
                      <input
                        ref={passwordRef}
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setError(null);
                        }}
                        required
                        placeholder="••••••••"
                        className={`w-full border rounded-xl pl-9 pr-9 py-2.5 text-xs focus:outline-none transition ${
                          theme === 'light'
                            ? 'bg-slate-50 border-slate-200 text-slate-950 focus:border-sky-500 focus:bg-white'
                            : 'bg-slate-950 border-slate-800 text-white focus:border-sky-500 focus:bg-slate-950'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 transition cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Error block */}
                  {error && (
                    <div className="flex items-start gap-1.5 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[11px] font-semibold">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}

                  {/* Submit button */}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={`w-full bg-gradient-to-r ${
                      role === 'Admin'
                        ? 'from-sky-500 to-indigo-600 shadow-indigo-500/15'
                        : role === 'Agent'
                          ? 'from-emerald-500 to-teal-600 shadow-emerald-500/15'
                          : 'from-purple-500 to-indigo-600 shadow-purple-500/15'
                    } hover:opacity-95 text-white py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-200 flex items-center justify-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50`}
                  >
                    {isSubmitting ? (
                      <span className="flex items-center gap-1.5">
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Authenticating...
                      </span>
                    ) : (
                      <>
                        <span>Enter {role === 'AppOwner' ? 'AppOwner' : role} Workspace</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </form>

                {/* Alternative Gateways Section */}
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200 dark:border-slate-800" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className={`px-3 font-mono text-[9px] font-bold tracking-widest ${
                      theme === 'light' ? 'bg-white text-slate-400' : 'bg-slate-900 text-slate-500'
                    }`}>
                      Alternative Gateways
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  {/* Google Sign-In Button */}
                  <button
                    type="button"
                    onClick={handleGoogleLoginClick}
                    disabled={isGoogleSigningIn || isSubmitting}
                    className={`px-3 py-2 rounded-xl border transition duration-200 flex items-center justify-center gap-1.5 text-xs font-bold font-mono uppercase tracking-wider cursor-pointer disabled:opacity-50 ${
                      theme === 'light'
                        ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        : 'bg-slate-950 border-slate-850 text-slate-200 hover:bg-slate-900'
                    }`}
                  >
                    <GoogleIcon className="w-3.5 h-3.5" />
                    <span>{isGoogleSigningIn ? 'Loading...' : 'Google'}</span>
                  </button>

                  {/* Biometrics Sign-In Button */}
                  <button
                    type="button"
                    onClick={handleBiometricLoginClick}
                    disabled={isSubmitting}
                    className={`px-3 py-2 rounded-xl border transition duration-200 flex items-center justify-center gap-1.5 text-xs font-bold font-mono uppercase tracking-wider cursor-pointer disabled:opacity-50 ${
                      biometricUsers.length > 0
                        ? theme === 'light'
                          ? 'bg-emerald-50/50 border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                          : 'bg-emerald-950/20 border-emerald-800 text-emerald-400 hover:bg-emerald-950/40 animate-pulse'
                        : theme === 'light'
                          ? 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'
                          : 'bg-slate-950 border-slate-850 text-slate-500 hover:bg-slate-900'
                    }`}
                  >
                    <Fingerprint className={`w-3.5 h-3.5 ${biometricUsers.length > 0 ? 'text-emerald-500 animate-pulse' : 'text-slate-500'}`} />
                    <span>Biometrics</span>
                  </button>
                </div>

                {/* Become a Client Section */}
                <div className={`mt-5 p-3.5 rounded-2xl text-center border transition-all ${
                  theme === 'light'
                    ? 'bg-indigo-50/40 border-indigo-100/80'
                    : 'bg-indigo-950/5 border-indigo-900/20'
                }`}>
                  <div className="flex items-center justify-center gap-1.5 mb-2.5">
                    <Sparkles className="w-4 h-4 text-indigo-500 animate-bounce" />
                    <p className={`text-xs font-black uppercase tracking-wider ${theme === 'light' ? 'text-indigo-950' : 'text-indigo-200'}`}>
                      Deploy Workspace
                    </p>
                  </div>

                  {/* Compact Dual Metric Stats Counters */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {/* Workspaces Counter */}
                    <div className={`py-1.5 px-2 rounded-xl border flex flex-col items-center justify-center ${
                      theme === 'light'
                        ? 'bg-white border-indigo-100'
                        : 'bg-slate-950/60 border-indigo-950/40'
                    }`}>
                      <span className="text-xl font-extrabold font-mono tracking-tight text-indigo-600 dark:text-indigo-400">
                        {activeWorkspacesCount}
                      </span>
                      <span className="text-[8px] font-black font-mono uppercase tracking-wider text-slate-400/80 mt-0.5">
                        Workspaces
                      </span>
                    </div>

                    {/* Agents Counter */}
                    <div className={`py-1.5 px-2 rounded-xl border flex flex-col items-center justify-center ${
                      theme === 'light'
                        ? 'bg-white border-indigo-100'
                        : 'bg-slate-950/60 border-indigo-950/40'
                    }`}>
                      <span className="text-xl font-extrabold font-mono tracking-tight text-emerald-600 dark:text-emerald-400">
                        {agentCountDisplay}
                      </span>
                      <span className="text-[8px] font-black font-mono uppercase tracking-wider text-slate-400/80 mt-0.5">
                        Active Agents
                      </span>
                    </div>
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsRegistering(true);
                        setError(null);
                      }}
                      className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[9px] font-bold font-mono uppercase tracking-widest cursor-pointer transition shadow-md shadow-indigo-600/10"
                    >
                      Register Terminal
                    </button>
                  </div>
                </div>
              </>
            ) : (
              /* Self-Registration form */
              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                <div className={`p-3 rounded-2xl text-center border text-[11px] font-mono leading-relaxed flex items-center justify-center gap-2 ${
                  theme === 'light'
                    ? 'bg-emerald-50 border-emerald-100 text-emerald-800'
                    : 'bg-emerald-950/10 border-emerald-900/30 text-emerald-400'
                }`}>
                  <span>🤝</span>
                  <span>Join our growing network! <strong>Trusted by {activeWorkspacesCount} active workspaces</strong> globally.
                  </span>
                </div>
                
                {/* Workspace Name & Owner Name */}
                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <label className="text-[10px] font-bold font-mono uppercase tracking-wider text-slate-400 mb-1 block">
                      Workspace Name
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Building className="w-3.5 h-3.5" />
                      </div>
                      <input
                        type="text"
                        required
                        value={regWorkspaceName}
                        onChange={(e) => setRegWorkspaceName(e.target.value)}
                        placeholder="e.g. VakZim Highspeed"
                        className={`w-full border rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none transition ${
                          theme === 'light'
                            ? 'bg-slate-50 border-slate-200 text-slate-950 focus:border-sky-500 focus:bg-white'
                            : 'bg-slate-950 border-slate-800 text-white focus:border-sky-500 focus:bg-slate-950'
                        }`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold font-mono uppercase tracking-wider text-slate-400 mb-1 block">
                      Owner Full Name
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <User className="w-3.5 h-3.5" />
                      </div>
                      <input
                        type="text"
                        required
                        value={regOwnerName}
                        onChange={(e) => setRegOwnerName(e.target.value)}
                        placeholder="e.g. Mike Karim"
                        className={`w-full border rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none transition ${
                          theme === 'light'
                            ? 'bg-slate-50 border-slate-200 text-slate-950 focus:border-sky-500 focus:bg-white'
                            : 'bg-slate-950 border-slate-800 text-white focus:border-sky-500 focus:bg-slate-950'
                        }`}
                      />
                    </div>
                  </div>
                </div>

                {/* Email & Cell Number */}
                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <label className="text-[10px] font-bold font-mono uppercase tracking-wider text-slate-400 mb-1 block">
                      Gmail Address
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Mail className="w-3.5 h-3.5" />
                      </div>
                      <input
                        type="email"
                        required
                        value={regOwnerEmail}
                        onChange={(e) => setRegOwnerEmail(e.target.value)}
                        placeholder="e.g. mike@gmail.com"
                        className={`w-full border rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none transition ${
                          theme === 'light'
                            ? 'bg-slate-50 border-slate-200 text-slate-950 focus:border-sky-500 focus:bg-white'
                            : 'bg-slate-950 border-slate-800 text-white focus:border-sky-500 focus:bg-slate-950'
                        }`}
                      />
                    </div>
                  </div>

                  <CountryPhoneInput
                    id="login-reg-owner-cell"
                    label="Cell Phone Number"
                    value={regOwnerCell}
                    countryCode={selectedRegCountry.code}
                    onChange={(fullNumber, nationalNumber, country) => {
                      setRegOwnerCell(nationalNumber || '');
                      if (country) {
                        setSelectedRegCountry({
                          code: country.code,
                          name: country.name,
                          flag: country.flag,
                          placeholder: country.placeholder
                        });
                      }
                    }}
                    required
                    theme={theme}
                  />
                </div>

                {/* Password / Passcode */}
                <div>
                  <label className="text-[10px] font-bold font-mono uppercase tracking-wider text-slate-400 mb-1.5 block">
                    Security Password / passcode
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type="password"
                      required
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Enter strong admin password"
                      className={`w-full border rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none transition ${
                        theme === 'light'
                          ? 'bg-slate-50 border-slate-200 text-slate-950 focus:border-sky-500 focus:bg-white'
                          : 'bg-slate-950 border-slate-800 text-white focus:border-sky-500 focus:bg-slate-950'
                      }`}
                    />
                  </div>
                </div>

                {/* Plan Selector (Compact Sliding) */}
                <SubscriptionSliderSelector
                  selectedTier={regTier}
                  onChange={(tier) => setRegTier(tier)}
                  packages={pricingPackages}
                  theme={theme}
                  label="Subscription Plan Tier"
                  id="reg-subscription-slider"
                />

                {/* Activation Mode / Duration Selector */}
                <div>
                  <label className="text-[10px] font-bold font-mono uppercase tracking-wider text-slate-400 mb-2 block">
                    Subscription term / billing mode
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setRegTrialMode('trial')}
                      className={`p-3 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
                        regTrialMode === 'trial'
                          ? 'bg-emerald-600/10 border-emerald-500 ring-1 ring-emerald-500'
                          : theme === 'light'
                            ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Sparkles className="w-4 h-4 text-emerald-500" />
                        <span className="text-xs font-black uppercase font-display text-emerald-500">7-Day Free Trial</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Evaluate terminal for 7 days before billing
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setRegTrialMode('payment')}
                      className={`p-3 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
                        regTrialMode === 'payment'
                          ? 'bg-indigo-600/10 border-indigo-500 ring-1 ring-indigo-500'
                          : theme === 'light'
                            ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="w-4 h-4 text-indigo-500" />
                        <span className="text-xs font-black uppercase font-display text-indigo-500">Fixed Term Lease</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Select desired billing duration (1-24 Mo)
                      </span>
                    </button>
                  </div>
                </div>

                {/* Lease Length Selection (If payment lease mode selected) */}
                {regTrialMode === 'payment' && (
                  <div className={`p-4 rounded-2xl border ${
                    theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                  }`}>
                    <label className="block text-[10px] font-bold font-mono text-slate-400 uppercase mb-2">
                      Desired Lease Length
                    </label>
                    <div className="flex items-center gap-3">
                      <select
                        value={regMonths}
                        onChange={(e) => setRegMonths(parseInt(e.target.value) || 1)}
                        className={`flex-grow border rounded-xl px-3.5 py-2 text-xs focus:outline-none font-mono ${
                          theme === 'light'
                            ? 'bg-white border-slate-200 text-slate-950 focus:border-indigo-500'
                            : 'bg-slate-900 border-slate-800 text-white focus:border-indigo-500'
                        }`}
                      >
                        {[1, 2, 3, 4, 5, 6, 12, 24].map((m) => (
                          <option key={m} value={m}>
                            {m} {m === 1 ? 'Month' : 'Months'} Active
                          </option>
                        ))}
                      </select>
                      <div className="text-[10px] text-slate-400 font-mono text-right leading-tight shrink-0">
                        <div>Tier: {regTier}</div>
                        <div className="text-indigo-500 font-extrabold mt-0.5">
                          ${((pricingPackages.find(p => p.id === regTier)?.price || 0) * regMonths).toFixed(2)} total
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Notice regarding Manual Verification & Activation */}
                <div className={`p-3.5 rounded-2xl border flex items-start gap-2.5 text-xs ${
                  theme === 'light'
                    ? 'bg-amber-50/70 border-amber-200/80 text-amber-900'
                    : 'bg-amber-950/20 border-amber-800/40 text-amber-300'
                }`}>
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <p className="font-bold">Manual Verification & Activation Notice:</p>
                    <p className="opacity-90 mt-0.5 text-[11px]">
                      Because automated online payments are currently offline, your workspace will be registered immediately in <strong>Pending (Suspended)</strong> status. The App Owner will verify and manually activate your account upon receipt of registration.
                    </p>
                  </div>
                </div>

                {/* Error Block */}
                {error && (
                  <div className="flex items-start gap-2 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-semibold">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Submit / Back Action buttons */}
                <div className="space-y-2 pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-gradient-to-r from-indigo-600 to-sky-500 hover:opacity-95 text-white py-4 rounded-2xl text-sm font-black uppercase tracking-widest transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/15 cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Registering Client Workspace...</span>
                      </span>
                    ) : (
                      <>
                        <span>Register {regTier} Workspace (Pending Activation)</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsRegistering(false);
                      setError(null);
                    }}
                    className="w-full py-3 rounded-2xl text-xs font-bold font-mono uppercase tracking-wider text-slate-400 hover:text-slate-200 text-center transition cursor-pointer"
                  >
                    Back to Login Portal
                  </button>
                </div>
              </form>
            )}

          </motion.div>
        </div>
      </div>

      {/* --- Overlay Modals for Biometrics and Google Authentication --- */}
      
      {/* 1. Biometric Scanning Overlay */}
      <AnimatePresence>
        {isScanningBiometrics && biometricScanUser && (
          <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 inset-x-0 h-1 bg-sky-500 animate-pulse" />
              
              <h3 className="text-lg font-bold font-display text-white">Biometric Verification</h3>
              <p className="text-xs text-slate-400 font-mono mt-1">
                Verifying secure key for <span className="text-sky-400 font-bold">{biometricScanUser.name}</span>
              </p>

              <div className="my-8 relative flex items-center justify-center">
                <div className="absolute w-28 h-28 rounded-full bg-sky-500/10 animate-ping" />
                <div className="absolute w-20 h-20 rounded-full bg-sky-500/20 animate-pulse" />
                
                <div className="w-24 h-24 rounded-full bg-slate-950 border border-sky-500/30 flex items-center justify-center relative z-10 text-sky-400 shadow-lg shadow-sky-500/10">
                  <Fingerprint className="w-12 h-12" />
                  <div className="absolute inset-x-4 h-[2px] bg-sky-400 shadow-[0_0_8px_#38bdf8] animate-[bounce_2s_infinite]" />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-mono text-slate-400 px-1">
                  <span>Contacting Secure Enclave...</span>
                  <span className="text-sky-400 font-bold">{biometricScanProgress}%</span>
                </div>
                <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="h-full bg-gradient-to-r from-sky-500 to-indigo-400 transition-all duration-150"
                    style={{ width: `${biometricScanProgress}%` }}
                  />
                </div>
              </div>

              <p className="text-[10px] text-slate-500 font-mono leading-relaxed mt-4">
                Enclave authentication matches encrypted private key to device signature.
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 2. Biometrics No-Profile Registered Notice */}
      <AnimatePresence>
        {showBiometricNoProfile && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm p-6 text-center shadow-2xl"
            >
              <div className="w-12 h-12 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center mx-auto text-amber-500 mb-4">
                <AlertCircle className="w-6 h-6" />
              </div>
              
              <h3 className="text-md font-bold font-display text-white">No Biometrics Registered</h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                No biometric keys have been registered on this browser session yet. To configure biometric login:
              </p>
              
              <div className="my-4 text-left p-3 rounded-xl bg-slate-950 border border-slate-850 space-y-1.5 text-[11px] font-mono text-slate-300">
                <p className="flex items-start gap-1.5">
                  <span className="text-emerald-500">1.</span> Enter workspace with your password first.
                </p>
                <p className="flex items-start gap-1.5">
                  <span className="text-emerald-500">2.</span> Click your Profile icon (top-right header).
                </p>
                <p className="flex items-start gap-1.5">
                  <span className="text-emerald-500">3.</span> Toggle and register your <span className="text-emerald-400 font-bold">Biometric Login</span> keys.
                </p>
              </div>
              
              <button
                type="button"
                onClick={() => setShowBiometricNoProfile(false)}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-semibold py-2.5 rounded-xl text-xs uppercase font-mono tracking-wider cursor-pointer transition"
              >
                Got It
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 3. Google Account Chooser Overlay */}
      <AnimatePresence>
        {showGoogleChooser && (
          <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white text-slate-900 rounded-3xl w-full max-w-md p-6 shadow-2xl relative border border-slate-100"
            >
              {/* Google Brand Header */}
              <div className="text-center mb-6">
                <div className="flex justify-center mb-2">
                  <GoogleIcon className="w-8 h-8" />
                </div>
                <div className="inline-flex items-center justify-center gap-1 font-bold text-xl font-sans mb-1 select-none">
                  <span className="text-blue-500">G</span>
                  <span className="text-red-500">o</span>
                  <span className="text-yellow-500">o</span>
                  <span className="text-blue-500">g</span>
                  <span className="text-green-500">l</span>
                  <span className="text-red-500">e</span>
                </div>
                <h3 className="text-md font-bold text-slate-800">Sign in with Google</h3>
                <p className="text-xs text-slate-400 mt-1">to access WiVoTe WiFi Terminal</p>
              </div>

              {/* Active portal information banner */}
              <div className="mb-4 px-3.5 py-2.5 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-between text-xs font-mono font-bold text-indigo-700">
                <span>ACTIVE PORTAL TAB:</span>
                <span className="uppercase text-indigo-600 bg-white border px-2 py-0.5 rounded-lg">{role === 'AppOwner' ? 'AppOwner' : role}</span>
              </div>

              {/* Account selection list */}
              <div className="space-y-2 max-h-56 overflow-y-auto mb-4 pr-1">
                {role === 'Admin' && (
                  <button
                    type="button"
                    onClick={() => handleGoogleChooserSelect('master@wivote.com', 'VakZim Admin Director')}
                    className="w-full p-3 border border-slate-100 rounded-2xl flex items-center justify-between text-left hover:bg-slate-50 transition cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <img referrerPolicy="no-referrer" src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150" className="w-8 h-8 rounded-full object-cover border" alt="Master" />
                      <div>
                        <span className="text-xs font-bold block text-slate-800">VakZim Admin Director</span>
                        <span className="text-[10px] text-slate-400 font-mono">master@wivote.com</span>
                      </div>
                    </div>
                    <span className="text-[9px] bg-sky-50 text-sky-600 font-bold px-2 py-0.5 rounded-full uppercase">Admin</span>
                  </button>
                )}



                {role === 'AppOwner' && (
                  <button
                    type="button"
                    onClick={() => handleGoogleChooserSelect('karimazondomike049@gmail.com', 'Mike Karim (App Owner)')}
                    className="w-full p-3 border border-slate-100 rounded-2xl flex items-center justify-between text-left hover:bg-slate-50 transition cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <img referrerPolicy="no-referrer" src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150" className="w-8 h-8 rounded-full object-cover border" alt="Karim" />
                      <div>
                        <span className="text-xs font-bold block text-slate-800">Mike Karim (App Owner)</span>
                        <span className="text-[10px] text-slate-400 font-mono text-indigo-500 font-bold">karimazondomike049@gmail.com</span>
                      </div>
                    </div>
                    <span className="text-[9px] bg-indigo-50 text-indigo-600 font-bold px-2 py-0.5 rounded-full uppercase">System Owner</span>
                  </button>
                )}
              </div>

              {/* Or type a custom Google account to provision a master profile on-the-fly! */}
              <form onSubmit={handleCustomGoogleSubmit} className="border-t border-slate-100 pt-4 space-y-3">
                <div className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-wider mb-1">
                  Connect personal Google account
                </div>
                
                <div>
                  <label className="block text-[9px] font-mono text-slate-400 uppercase mb-1">Google Email address</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                      <Mail className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type="email"
                      required
                      value={customGoogleEmail}
                      onChange={(e) => setCustomGoogleEmail(e.target.value)}
                      placeholder="e.g. mike@gmail.com"
                      className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none focus:border-blue-500 bg-slate-50 text-slate-800"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[9px] font-mono text-slate-400 uppercase mb-1">Your Full Name</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                      <User className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type="text"
                      value={customGoogleName}
                      onChange={(e) => setCustomGoogleName(e.target.value)}
                      placeholder="e.g. Karim Mike"
                      className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none focus:border-blue-500 bg-slate-50 text-slate-800"
                    />
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setShowGoogleChooser(false)}
                    className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-md shadow-blue-500/10 cursor-pointer transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Auto-Provision Workspace</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Compact Contact Administrator Bar on Login Screen */}
      <div className="w-full flex justify-center px-6 pb-6">
        <ContactUsSection label="Contact Administrator" />
      </div>

      {/* Suspended Notice Modal */}
      <SuspendedNoticeModal
        isOpen={suspendedModalInfo.isOpen}
        onClose={() => setSuspendedModalInfo({ isOpen: false })}
        workspaceName={suspendedModalInfo.workspaceName}
        userEmail={suspendedModalInfo.userEmail}
      />

      {/* Registration Success Modal */}
      <RegistrationSuccessModal
        isOpen={registrationSuccessInfo.isOpen}
        onClose={() => setRegistrationSuccessInfo({ ...registrationSuccessInfo, isOpen: false })}
        workspaceName={registrationSuccessInfo.workspaceName}
        ownerName={registrationSuccessInfo.ownerName}
        ownerEmail={registrationSuccessInfo.ownerEmail}
        tier={registrationSuccessInfo.tier}
      />

      {/* Secure Forgot Password Verification Modal */}
      <AnimatePresence>
        {isForgotPasswordOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (!isForgotSubmitting) setIsForgotPasswordOpen(false);
              }}
              className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            />

            {/* Modal Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className={`relative w-full max-w-md rounded-2xl border p-6 shadow-2xl overflow-hidden ${
                theme === 'light'
                  ? 'bg-white border-slate-200 text-slate-800'
                  : 'bg-slate-900 border-slate-800 text-white'
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b pb-4 mb-5 border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-sky-500/10 text-sky-500">
                    <KeyRound className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold tracking-tight uppercase font-mono">
                      Credential Recovery
                    </h3>
                    <p className="text-[10px] text-slate-400 font-mono">
                      Secure password reset terminal
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isForgotSubmitting}
                  onClick={() => setIsForgotPasswordOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-200 transition hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Error & Success indicators */}
              {forgotError && (
                <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="font-mono text-[11px] leading-relaxed">{forgotError}</span>
                </div>
              )}

              {forgotSuccess && (
                <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs flex items-start gap-2">
                  <Check className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="font-mono text-[11px] leading-relaxed">{forgotSuccess}</span>
                </div>
              )}

              {forgotStep === 'request' ? (
                /* Step 1: Request OTP code */
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!forgotEmail.trim()) {
                      setForgotError('Please enter your account email address.');
                      return;
                    }
                    setForgotError(null);
                    setForgotSuccess(null);
                    setIsForgotSubmitting(true);
                    try {
                      const res = await requestPasswordResetOtp(forgotEmail, forgotRole);
                      if (res.success) {
                        setForgotUid(res.uid || '');
                        setForgotOtpSent(res.otp || '');
                        setForgotStep('verify');
                        setForgotSuccess(`Secure 6-digit verification code has been dispatched to ${forgotEmail}.`);
                      } else {
                        setForgotError(res.error || 'Failed to dispatch verification code.');
                      }
                    } catch (err: any) {
                      setForgotError(err?.message || 'An unexpected error occurred during OTP request.');
                    } finally {
                      setIsForgotSubmitting(false);
                    }
                  }}
                  className="space-y-4"
                >
                  {/* Select Role */}
                  <div>
                    <label className="text-[10px] font-bold font-mono uppercase tracking-wider text-slate-400 mb-2 block">
                      Verify Your Role Type
                    </label>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setForgotRole('Admin')}
                        className={`py-3.5 px-4 rounded-xl border text-xs font-bold font-mono transition flex flex-col items-center gap-1.5 cursor-pointer ${
                          forgotRole === 'Admin'
                            ? 'border-sky-500 bg-sky-500/10 text-sky-500'
                            : theme === 'light'
                              ? 'border-slate-200 hover:bg-slate-50 text-slate-600'
                              : 'border-slate-800 hover:bg-slate-850 text-slate-400'
                        }`}
                      >
                        <Shield className="w-4 h-4" />
                        <span>WORKSPACE ADMIN</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setForgotRole('Agent')}
                        className={`py-3.5 px-4 rounded-xl border text-xs font-bold font-mono transition flex flex-col items-center gap-1.5 cursor-pointer ${
                          forgotRole === 'Agent'
                            ? 'border-emerald-500 bg-emerald-500/10 text-emerald-500'
                            : theme === 'light'
                              ? 'border-slate-200 hover:bg-slate-50 text-slate-600'
                              : 'border-slate-800 hover:bg-slate-850 text-slate-400'
                        }`}
                      >
                        <Users className="w-4 h-4" />
                        <span>FIELD AGENT</span>
                      </button>
                    </div>
                  </div>

                  {/* Registered Email */}
                  <div>
                    <label className="text-[10px] font-bold font-mono uppercase tracking-wider text-slate-400 mb-1.5 block">
                      Account Registered Email
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        type="email"
                        required
                        value={forgotEmail}
                        onChange={(e) => {
                          setForgotEmail(e.target.value);
                          setForgotError(null);
                        }}
                        placeholder="e.g. mike@gmail.com"
                        className={`w-full border rounded-xl pl-11 pr-3 py-2.5 text-xs focus:outline-none transition ${
                          theme === 'light'
                            ? 'bg-slate-50 border-slate-200 text-slate-950 focus:border-sky-500 focus:bg-white'
                            : 'bg-slate-950 border-slate-800 text-white focus:border-sky-500 focus:bg-slate-950'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Submit Request */}
                  <button
                    type="submit"
                    disabled={isForgotSubmitting}
                    className="w-full py-3 bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-sky-500/15 cursor-pointer transition disabled:opacity-50"
                  >
                    {isForgotSubmitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>DISPATCHING VERIFICATION...</span>
                      </>
                    ) : (
                      <>
                        <KeyRound className="w-4 h-4" />
                        <span>REQUEST SECURE RESET OTP</span>
                      </>
                    )}
                  </button>
                </form>
              ) : (
                /* Step 2: Verify code and update password */
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!forgotOtp.trim()) {
                      setForgotError('Please enter the 6-digit verification code.');
                      return;
                    }
                    if (!forgotNewPassword.trim()) {
                      setForgotError('Please enter a new security password.');
                      return;
                    }
                    const pwdVerdict = validatePasswordPolicy(forgotNewPassword);
                    if (!pwdVerdict.isValid) {
                      setForgotError(pwdVerdict.error || 'Password must be at least 5 characters including a number and a special character.');
                      return;
                    }
                    if (forgotNewPassword !== forgotConfirmPassword) {
                      setForgotError('Password confirmation mismatch. Please match your entries.');
                      return;
                    }

                    setForgotError(null);
                    setForgotSuccess(null);
                    setIsForgotSubmitting(true);
                    try {
                      const res = await resetPasswordWithOtp(forgotUid, forgotOtp.trim(), forgotNewPassword);
                      if (res.success) {
                        showToast?.('SUCCESS! Your password has been updated securely.', 'success');
                        setPassword(forgotNewPassword);
                        setIsForgotPasswordOpen(false);
                        setForgotStep('request');
                        setForgotSuccess(null);
                      } else {
                        setForgotError(res.error || 'Password verification update failed.');
                      }
                    } catch (err: any) {
                      setForgotError(err?.message || 'Failed to authorize password update.');
                    } finally {
                      setIsForgotSubmitting(false);
                    }
                  }}
                  className="space-y-4"
                >
                  {/* Dynamic Simulation Banner */}
                  {forgotOtpSent && (
                    <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-500 text-[11px] font-mono leading-relaxed">
                      <span className="font-bold uppercase block mb-1">🔐 [Simulation/OTP Logger Channel]</span>
                      To expedite sandbox preview, enter the security OTP generated: <strong className="text-white bg-slate-950 px-2 py-0.5 rounded font-black text-xs select-all">{forgotOtpSent}</strong>
                    </div>
                  )}

                  {/* OTP Code */}
                  <div>
                    <label className="text-[10px] font-bold font-mono uppercase tracking-wider text-slate-400 mb-1.5 block">
                      6-Digit Verification OTP
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        required
                        maxLength={6}
                        value={forgotOtp}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          setForgotOtp(val);
                          setForgotError(null);
                        }}
                        placeholder="e.g. 543829"
                        className={`w-full tracking-widest text-center font-bold text-base border rounded-xl py-2.5 focus:outline-none transition ${
                          theme === 'light'
                            ? 'bg-slate-50 border-slate-200 text-slate-950 focus:border-sky-500 focus:bg-white'
                            : 'bg-slate-950 border-slate-800 text-white focus:border-sky-500 focus:bg-slate-950'
                        }`}
                      />
                    </div>
                  </div>

                  {/* New Password */}
                  <div>
                    <label className="text-[10px] font-bold font-mono uppercase tracking-wider text-slate-400 mb-1.5 block">
                      New Security Password
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        type="password"
                        required
                        value={forgotNewPassword}
                        onChange={(e) => {
                          setForgotNewPassword(e.target.value);
                          setForgotError(null);
                        }}
                        placeholder="Min 6 chars, uppercase, digit, special"
                        className={`w-full border rounded-xl pl-11 pr-3 py-2.5 text-xs focus:outline-none transition ${
                          theme === 'light'
                            ? 'bg-slate-50 border-slate-200 text-slate-950 focus:border-sky-500 focus:bg-white'
                            : 'bg-slate-950 border-slate-800 text-white focus:border-sky-500 focus:bg-slate-950'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <label className="text-[10px] font-bold font-mono uppercase tracking-wider text-slate-400 mb-1.5 block">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        type="password"
                        required
                        value={forgotConfirmPassword}
                        onChange={(e) => {
                          setForgotConfirmPassword(e.target.value);
                          setForgotError(null);
                        }}
                        placeholder="Re-enter security password"
                        className={`w-full border rounded-xl pl-11 pr-3 py-2.5 text-xs focus:outline-none transition ${
                          theme === 'light'
                            ? 'bg-slate-50 border-slate-200 text-slate-950 focus:border-sky-500 focus:bg-white'
                            : 'bg-slate-950 border-slate-800 text-white focus:border-sky-500 focus:bg-slate-950'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Password Strength Checklist */}
                  <div className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 text-[10px] space-y-1 bg-slate-50 dark:bg-slate-950 font-mono text-slate-400">
                    <span className="font-bold text-slate-500 dark:text-slate-400 uppercase block mb-1">
                      WiVoTe Security Policy Requirements:
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className={forgotNewPassword.length >= 5 ? "text-emerald-500" : "text-slate-400"}>
                        {forgotNewPassword.length >= 5 ? "✓" : "○"} At least 5 characters minimum
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={/[0-9]/.test(forgotNewPassword) ? "text-emerald-500" : "text-slate-400"}>
                        {/[0-9]/.test(forgotNewPassword) ? "✓" : "○"} Contains at least one digit (0-9)
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={/[^A-Za-z0-9]/.test(forgotNewPassword) ? "text-emerald-500" : "text-slate-400"}>
                        {/[^A-Za-z0-9]/.test(forgotNewPassword) ? "✓" : "○"} Contains special character (!@#$...)
                      </span>
                    </div>
                  </div>

                  {/* Submit Reset */}
                  <div className="flex gap-2.5 pt-1">
                    <button
                      type="button"
                      disabled={isForgotSubmitting}
                      onClick={() => setForgotStep('request')}
                      className={`px-4 py-2.5 border rounded-xl text-xs font-bold font-mono transition cursor-pointer ${
                        theme === 'light'
                          ? 'border-slate-200 text-slate-600 hover:bg-slate-50'
                          : 'border-slate-800 text-slate-400 hover:bg-slate-850'
                      }`}
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={isForgotSubmitting}
                      className="flex-grow py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/15 cursor-pointer transition disabled:opacity-50"
                    >
                      {isForgotSubmitting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>UPDATING CREDENTIALS...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-4 h-4" />
                          <span>RESET & AUTHORIZE</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer Branding Attribution - Locked just like the Header */}
      <footer className={`sticky bottom-0 z-40 w-full border-t transition-all duration-300 backdrop-blur-md text-center text-[10px] font-mono py-2.5 ${
        theme === 'light' ? 'bg-white/95 border-slate-200/90 text-slate-500 shadow-md shadow-slate-900/5' : 'bg-slate-900/95 border-slate-800 text-slate-400 shadow-lg shadow-black/35'
      }`}>
        VakZim ICT&E {new Date().getFullYear()}
      </footer>
    </div>
  );
};
