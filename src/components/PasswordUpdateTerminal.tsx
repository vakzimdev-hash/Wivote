import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { KeyRound, Eye, EyeOff, Check, X, ShieldAlert, LogOut } from 'lucide-react';
import { validatePasswordPolicy } from '../utils/passwordPolicy';

export const PasswordUpdateTerminal: React.FC = () => {
  const { currentUser, updateUserProfile, logoutUser, theme } = useApp();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Password Validation States (min 5 chars, number, special char)
  const [hasMinLen, setHasMinLen] = useState(false);
  const [hasSpecial, setHasSpecial] = useState(false);
  const [hasNumber, setHasNumber] = useState(false);

  useEffect(() => {
    const result = validatePasswordPolicy(newPassword);
    setHasMinLen(result.hasMinLength);
    setHasSpecial(result.hasSpecialChar);
    setHasNumber(result.hasNumber);
  }, [newPassword]);

  const isValid = hasMinLen && hasSpecial && hasNumber;

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setErrorMsg('');
    setSuccessMsg('');

    if (!isValid) {
      setErrorMsg('Password does not satisfy all security requirements.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await updateUserProfile(
        currentUser.name,
        currentUser.cellNumber,
        currentUser.profilePic,
        newPassword,
        currentUser.email
      );

      if (res && !res.success) {
        setErrorMsg(res.error || 'Failed to update password.');
      } else {
        setSuccessMsg('Password updated successfully! Welcome to your terminal.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`min-h-screen flex flex-col justify-between items-center px-4 py-12 transition-colors duration-300 ${
      theme === 'light' ? 'bg-slate-50 text-slate-950' : 'bg-slate-950 text-white'
    }`}>
      {/* Brand Header */}
      <div className="text-center mt-6">
        <div className="inline-flex items-center gap-2 mb-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20 text-white font-extrabold text-lg tracking-wider">
            WV
          </div>
          <span className="text-2xl font-extrabold font-display tracking-tight bg-gradient-to-r from-sky-500 via-indigo-500 to-purple-600 bg-clip-text text-transparent">
            WiVoTe
          </span>
        </div>
        <h1 className="text-xl font-bold font-display uppercase tracking-wider">Security Access Terminal</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono">
          First-Time Sign In / Mandatory Password Reset
        </p>
      </div>

      {/* Main Terminal Card */}
      <div className={`w-full max-w-md border rounded-3xl p-6 md:p-8 shadow-2xl transition-all duration-300 my-auto ${
        theme === 'light'
          ? 'bg-white border-slate-200'
          : 'bg-slate-900 border-slate-800'
      }`}>
        <div className="flex items-center gap-3 mb-6 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25">
          <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0" />
          <div className="text-xs">
            <p className="font-extrabold text-amber-600 dark:text-amber-400 font-display">PASSWORD RESET REQUIRED</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
              Your account has a temporary provisional password. You must configure a secure personal password to unlock your dashboard.
            </p>
          </div>
        </div>

        <form onSubmit={handleUpdatePassword} className="space-y-4">
          {errorMsg && (
            <div className="p-3 text-xs bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-xl font-semibold flex items-center gap-2">
              <X className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 text-xs bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-xl font-semibold flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* New Password Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">New Password</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-500">
                <KeyRound className="w-4 h-4" />
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••"
                required
                className={`w-full pl-10 pr-10 py-2.5 rounded-xl border text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-sky-500/20 ${
                  theme === 'light'
                    ? 'bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-500'
                    : 'bg-slate-950 border-slate-800 text-white focus:border-sky-500'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-500 hover:text-slate-300"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm Password Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">Confirm Password</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-500">
                <KeyRound className="w-4 h-4" />
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••"
                required
                className={`w-full pl-10 pr-10 py-2.5 rounded-xl border text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-sky-500/20 ${
                  theme === 'light'
                    ? 'bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-500'
                    : 'bg-slate-950 border-slate-800 text-white focus:border-sky-500'
                }`}
              />
            </div>
          </div>

          {/* Real-time Requirements Checklist */}
          <div className={`p-3 border rounded-2xl space-y-1.5 ${
            theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-900'
          }`}>
            <p className="text-[10px] font-bold uppercase font-mono tracking-wider text-slate-500 mb-2">Complexity Checklist</p>
            
            <div className="flex items-center gap-2 text-xs">
              {hasMinLen ? <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> : <X className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
              <span className={hasMinLen ? 'text-emerald-500 font-medium' : 'text-slate-500 font-medium'}>At least 5 characters</span>
            </div>

            <div className="flex items-center gap-2 text-xs">
              {hasNumber ? <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> : <X className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
              <span className={hasNumber ? 'text-emerald-500 font-medium' : 'text-slate-500 font-medium'}>At least one number (0-9)</span>
            </div>

            <div className="flex items-center gap-2 text-xs">
              {hasSpecial ? <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> : <X className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
              <span className={hasSpecial ? 'text-emerald-500 font-medium' : 'text-slate-500 font-medium'}>At least one special character (!@#$% etc.)</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !isValid}
            className={`w-full py-2.5 rounded-xl font-bold font-display text-sm uppercase tracking-wider cursor-pointer transition shadow-lg ${
              isValid
                ? 'bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 text-white shadow-sky-500/10'
                : 'bg-slate-700 text-slate-400 border border-slate-600/30 cursor-not-allowed shadow-none'
            }`}
          >
            {loading ? 'Securing Profile...' : 'Activate Profile'}
          </button>
        </form>

        <div className="relative flex py-3 items-center">
          <div className="flex-grow border-t border-slate-700/20"></div>
          <span className="flex-shrink mx-4 text-[10px] text-slate-500 font-mono uppercase tracking-wider">or</span>
          <div className="flex-grow border-t border-slate-700/20"></div>
        </div>

        <button
          onClick={logoutUser}
          className={`w-full py-2 border rounded-xl font-bold font-display text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition ${
            theme === 'light'
              ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              : 'bg-slate-950 border-slate-850 text-slate-300 hover:bg-slate-900'
          }`}
        >
          <LogOut className="w-3.5 h-3.5 text-rose-500" />
          Sign Out of Terminal
        </button>
      </div>

      <footer className="text-[10px] font-mono text-slate-500 tracking-wider">
        By VakZim ICT&E {new Date().getFullYear()}
      </footer>
    </div>
  );
};
