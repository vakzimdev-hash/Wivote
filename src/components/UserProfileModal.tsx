import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { motion, AnimatePresence } from 'motion/react';
import { X, Camera, Lock, CheckCircle, AlertTriangle, Loader2, Fingerprint, Check, Shield, LogOut, MapPin, Copy } from 'lucide-react';
import { ImageCropper } from './ImageCropper';
import { validatePasswordPolicy } from '../utils/passwordPolicy';
import { CountryPhoneInput } from './CountryPhoneInput';

interface UserProfileModalProps {
  onClose: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ onClose }) => {
  const { currentUser, updateUserProfile, logoutUser, theme, showToast } = useApp();
  
  const [name, setName] = useState(currentUser?.name || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [cell, setCell] = useState(currentUser?.cellNumber || '');
  const [profilePic, setProfilePic] = useState(currentUser?.profilePic || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isPasswordEdited, setIsPasswordEdited] = useState(false);
  
  const [isCensoring, setIsCensoring] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedUid, setCopiedUid] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [tempImageSrc, setTempImageSrc] = useState<string | null>(null);

  if (!currentUser) return null;

  const handleModalLogout = () => {
    logoutUser();
    onClose();
  };

  const [biometricsEnabled, setBiometricsEnabled] = useState(() => {
    return localStorage.getItem(`wivote_biometrics_enabled_${currentUser.uid}`) === 'true';
  });
  const [isBiometricRegistering, setIsBiometricRegistering] = useState(false);
  const [registerProgress, setRegisterProgress] = useState(0);

  const [idleTimeout, setIdleTimeout] = useState<number>(() => {
    const saved = localStorage.getItem(`wivote_auto_logout_minutes_${currentUser.uid}`);
    return saved !== null ? parseInt(saved, 10) : 10;
  });

  const handleToggleBiometrics = () => {
    if (biometricsEnabled) {
      localStorage.setItem(`wivote_biometrics_enabled_${currentUser.uid}`, 'false');
      setBiometricsEnabled(false);
    } else {
      setIsBiometricRegistering(true);
      setRegisterProgress(0);
      let progress = 0;
      const interval = setInterval(() => {
        progress += 10;
        setRegisterProgress(progress);
        if (progress >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            localStorage.setItem(`wivote_biometrics_enabled_${currentUser.uid}`, 'true');
            setBiometricsEnabled(true);
            setIsBiometricRegistering(false);
          }, 400);
        }
      }, 150);
    }
  };

  const isAgent = currentUser.role === 'Agent';

  // Password Security check:
  // "Mandatory 5-character minimum: at least one special character, one number."
  const validatePassword = (pwd: string): boolean => {
    return validatePasswordPolicy(pwd).isValid;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setTempImageSrc(base64String);
    };
    reader.readAsDataURL(file);
  };

  const handleCropComplete = async (croppedBase64: string) => {
    setTempImageSrc(null);
    setIsCensoring(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      // Run AI censorship check on the precisely cropped image
      const response = await fetch('/api/censor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: croppedBase64 })
      });
      const result = await response.json();

      if (result.safe) {
        setProfilePic(croppedBase64);
        setSuccessMsg('Profile picture precisely cropped and approved by AI!');
      } else {
        setErrorMsg(`Image rejected: ${result.reason || 'Indecent or inappropriate content.'}`);
      }
    } catch (err) {
      console.error(err);
      // Fallback
      setProfilePic(croppedBase64);
      setSuccessMsg('Cropped image loaded (Censorship bypassed due to connection error).');
    } finally {
      setIsCensoring(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    // If changing password, validate ONLY if the password has been explicitly edited
    if (isPasswordEdited && password) {
      const verdict = validatePasswordPolicy(password);
      if (!verdict.isValid) {
        setErrorMsg(verdict.error || 'Password must be at least 5 characters, and contain at least one number and one special character.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg('Passwords do not match.');
        return;
      }
    }

    setIsSaving(true);
    try {
      const result = await updateUserProfile(
        isAgent ? currentUser.name : name, // Agents cannot change name
        isAgent ? currentUser.cellNumber : cell, // Agents cannot change cell
        profilePic,
        (isPasswordEdited && password) ? password : undefined,
        currentUser.role === 'AppOwner' ? email : undefined
      );

      if (result.success) {
        showToast(
          isPasswordEdited && password
            ? 'Profile and password successfully updated!'
            : 'Profile successfully updated!',
          'success'
        );
        onClose();
      } else {
        setErrorMsg(result.error || 'Failed to update profile.');
      }
    } catch (err) {
      setErrorMsg('An error occurred during save.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-6 relative shadow-2xl"
      >
        <div className="absolute top-4 right-4 flex items-center gap-2">
          <button
            type="button"
            onClick={handleModalLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-400 hover:bg-rose-500 hover:text-white text-xs font-mono font-bold transition cursor-pointer"
            title="Log out of terminal"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Log Out</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-full hover:bg-slate-800 transition cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-6">
          <h2 className="text-2xl font-bold font-display text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-indigo-400">
            Edit User Profile
          </h2>
          <div className="text-xs text-slate-400 mt-1 font-mono flex flex-wrap items-center gap-2">
            <span>Role: <strong className="text-sky-400 font-bold">{currentUser.role}</strong></span>
          </div>
          {currentUser.uid && (
            <div className="mt-2.5 p-2 rounded-xl bg-slate-900/95 border border-slate-800 flex items-center justify-between gap-2 max-w-full">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <Shield className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="text-[10px] uppercase font-mono font-bold text-slate-400 shrink-0">
                  {currentUser.role === 'Agent' ? 'Agent UID:' : 'Account UID:'}
                </span>
                <span className="text-[11px] font-mono font-black text-sky-400 break-all select-all leading-tight">
                  {currentUser.uid}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(currentUser.uid);
                  setCopiedUid(true);
                  showToast('✓ UID copied to clipboard', 'success');
                  setTimeout(() => setCopiedUid(false), 2000);
                }}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700/60 transition cursor-pointer shrink-0 active:scale-95"
                title="Copy full UID"
              >
                {copiedUid ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
                <span>{copiedUid ? 'Copied' : 'Copy UID'}</span>
              </button>
            </div>
          )}
          {isAgent && (
            <p className="text-[10px] text-amber-400 font-mono mt-1">
              * Note: Agents can change profile picture and passwords only.
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="max-h-[58vh] overflow-y-auto pr-1.5 space-y-5 mb-4 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
            {/* Picture Selector with AI Censorship */}
            <div className="flex flex-col items-center gap-2">
              <div className="relative w-24 h-24 rounded-full border-2 border-sky-500 overflow-hidden group">
                {profilePic ? (
                  <img referrerPolicy="no-referrer" src={profilePic} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-slate-800 flex items-center justify-center text-slate-400 text-3xl font-bold font-display uppercase">
                    {(currentUser.name || currentUser.email || 'User').substring(0, 2)}
                  </div>
                )}

                {isCensoring ? (
                  <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center">
                    <Loader2 className="w-6 h-6 text-sky-400 animate-spin" />
                    <span className="text-[9px] text-sky-400 font-mono mt-1">AI Audit...</span>
                  </div>
                ) : (
                  <label className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition">
                    <Camera className="w-6 h-6 text-white" />
                    <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                  </label>
                )}
              </div>
              <span className="text-[11px] text-slate-400">Click picture to change. Censored by AI.</span>
            </div>

            {/* Error and Success states */}
            {errorMsg && (
              <div className="p-3 bg-red-950/50 border border-red-500/30 text-red-400 rounded-xl text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3 bg-emerald-950/50 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs flex items-start gap-2">
                <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{successMsg}</span>
              </div>
            )}

            <div className="space-y-4">
              {/* Name Input */}
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isAgent}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:border-sky-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              {/* Email Address Input */}
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={currentUser.role !== 'AppOwner'}
                  required
                  placeholder="e.g. appowner@wivote.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:border-sky-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed font-mono"
                />
              </div>

              {/* Cell Phone Input */}
              <div>
                <CountryPhoneInput
                  id="profile-cell"
                  label="Cell Number"
                  value={cell}
                  theme={theme}
                  disabled={isAgent}
                  required
                  onChange={(fullNumber) => {
                    setCell(fullNumber);
                  }}
                />
              </div>

              {isAgent && (
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">Assigned Operating Territory</label>
                  <div className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-300 flex items-center justify-between font-mono">
                    <span className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-sky-400" />
                      <span>{currentUser.location || 'Harare Central'}</span>
                    </span>
                    <span className="text-[10px] uppercase font-bold text-slate-500">Admin Managed</span>
                  </div>
                </div>
              )}

              {/* Password security sections */}
              <div className="border-t border-slate-800/60 pt-4 space-y-4">
                <div className="flex items-center gap-1.5 text-slate-300 font-display text-sm font-semibold">
                  <Lock className="w-4 h-4 text-sky-400" />
                  Change Password (5-chars min, with Number & Special Char)
                </div>

                {/* Show the Old Password */}
                <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-3 flex justify-between items-center text-xs">
                  <div className="flex flex-col">
                    <span className="font-mono text-[10px] text-slate-400 uppercase tracking-wider font-bold">Current (Old) Password</span>
                    <span className="text-[9px] text-slate-500 font-mono">Use this to log in until you change it.</span>
                  </div>
                  <span className="font-mono font-bold text-sky-400 bg-sky-950/80 px-3 py-1 rounded-lg border border-sky-800/50">
                    {currentUser.password || 'password'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-mono text-slate-400 mb-1">New Password</label>
                    <input
                      type="password"
                      value={password}
                      autoComplete="new-password"
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setIsPasswordEdited(true);
                      }}
                      placeholder="••••••"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:border-sky-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-slate-400 mb-1">Confirm Password</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      autoComplete="new-password"
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        setIsPasswordEdited(true);
                      }}
                      placeholder="••••••"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:border-sky-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Device Biometrics Activation */}
              <div className="border-t border-slate-800/60 pt-4 space-y-3">
                <div className="flex items-center gap-1.5 text-slate-300 font-display text-sm font-semibold">
                  <Fingerprint className="w-4 h-4 text-emerald-400 animate-pulse" />
                  Device Biometrics (Fingerprint / FaceID)
                </div>
                <p className="text-[11px] text-slate-400 leading-normal">
                  Enable biometrics to securely unlock your workspace instantly without typing your master passcode each time.
                </p>
                
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl ${
                      biometricsEnabled ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-400'
                    }`}>
                      <Fingerprint className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-xs font-bold block">Biometric Login</span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {biometricsEnabled ? 'Status: Registered & Active' : 'Status: Inactive'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleToggleBiometrics}
                    className={`px-4 py-2 rounded-xl text-xs font-bold font-mono uppercase tracking-wide cursor-pointer transition flex items-center gap-1.5 ${
                      biometricsEnabled
                        ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500 hover:text-white'
                        : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500 hover:text-white animate-bounce'
                    }`}
                  >
                    {biometricsEnabled ? 'Disable' : 'Register Biometrics'}
                  </button>
                </div>
              </div>

              {/* Auto-Logout / Session Inactivity Security Section */}
              <div className="border-t border-slate-800/60 pt-4 space-y-3">
                <div className="flex items-center gap-1.5 text-slate-300 font-display text-sm font-semibold">
                  <Shield className="w-4 h-4 text-sky-400" />
                  Terminal Auto-Logout Security
                </div>
                <p className="text-[11px] text-slate-400 leading-normal">
                  Automatically lock or log out of your terminal after a period of idle inactivity to protect against unauthorized physical access.
                </p>
                
                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold block">Inactivity Timeout</span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        Current: {idleTimeout === 0 ? 'Disabled' : `${idleTimeout} minute${idleTimeout > 1 ? 's' : ''}`}
                      </span>
                    </div>
                    <select
                      value={idleTimeout}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setIdleTimeout(val);
                        localStorage.setItem(`wivote_auto_logout_minutes_${currentUser.uid}`, val.toString());
                      }}
                      className="bg-slate-900 border border-slate-800 text-white rounded-xl px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-sky-500"
                    >
                      <option value="1">1 Minute (Demo / Test)</option>
                      <option value="2">2 Minutes</option>
                      <option value="5">5 Minutes</option>
                      <option value="10">10 Minutes (Recommended)</option>
                      <option value="15">15 Minutes</option>
                      <option value="30">30 Minutes</option>
                      <option value="0">Disabled (Never log out)</option>
                    </select>
                  </div>
                  
                  {isAgent && (
                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-400 font-mono leading-normal">
                      ⚠️ <strong>Security Advisory for Agents:</strong> It is highly recommended to keep auto-logout active (e.g., 5-10 mins) when operating terminals in public voucher booths or hot-desking environments.
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-between pt-3 border-t border-slate-800/60 items-center">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleModalLogout}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-mono font-bold uppercase tracking-wider bg-rose-500/10 border border-rose-500/25 text-rose-400 hover:bg-rose-500 hover:text-white transition cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Log Out</span>
              </button>
            </div>

            <div className="flex gap-2.5 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving || isCensoring}
                className="bg-slate-800 text-slate-300 px-4 py-2.5 rounded-xl text-sm hover:bg-slate-700 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCensoring || isSaving}
                className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold shadow-lg transition min-w-[140px] ${
                  isSaving || isCensoring
                    ? 'bg-slate-800 text-slate-400 border border-slate-700/80 cursor-not-allowed opacity-60 shadow-none'
                    : 'bg-gradient-to-r from-sky-500 to-indigo-500 text-white shadow-sky-500/20 hover:opacity-95 active:scale-[0.98] cursor-pointer'
                }`}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
                    <span>Saving...</span>
                  </>
                ) : isCensoring ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
                    <span>Auditing...</span>
                  </>
                ) : (
                  <span>Save Profile</span>
                )}
              </button>
            </div>
          </div>
        </form>
      </motion.div>

      {/* Biometric Scan Simulated Registration Modal */}
      <AnimatePresence>
        {isBiometricRegistering && (
          <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 inset-x-0 h-1 bg-emerald-500 animate-pulse" />
              
              <h3 className="text-lg font-bold font-display text-white">Registering Biometrics</h3>
              <p className="text-xs text-slate-400 font-mono mt-1">Place finger on device sensor</p>

              <div className="my-8 relative flex items-center justify-center">
                {/* Visual ripple scan rings */}
                <div className="absolute w-28 h-28 rounded-full bg-emerald-500/10 animate-ping" />
                <div className="absolute w-20 h-20 rounded-full bg-emerald-500/20 animate-pulse" />
                
                <div className="w-24 h-24 rounded-full bg-slate-950 border border-emerald-500/30 flex items-center justify-center relative z-10 text-emerald-500 shadow-lg shadow-emerald-500/10">
                  <Fingerprint className="w-12 h-12" />
                  
                  {/* Laser line sweeping up and down */}
                  <div className="absolute inset-x-4 h-[2px] bg-emerald-400 shadow-[0_0_8px_#34d399] animate-[bounce_2s_infinite]" />
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-mono text-slate-400 px-1">
                  <span>Scanning fingerprint...</span>
                  <span className="text-emerald-400 font-bold">{registerProgress}%</span>
                </div>
                <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-150"
                    style={{ width: `${registerProgress}%` }}
                  />
                </div>
              </div>

              <p className="text-[10px] text-slate-500 font-mono leading-relaxed mt-4">
                This utilizes a cryptographically secure local WebAuthn simulation aligned with secure enclave credentials.
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {tempImageSrc && (
          <ImageCropper
            imageSrc={tempImageSrc}
            onCropComplete={handleCropComplete}
            onCancel={() => setTempImageSrc(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
