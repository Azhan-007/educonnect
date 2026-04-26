'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { AuthService } from '@/services/authService';
import { useAuthStore } from '@/store/authStore';
import { SettingsService } from '@/services/settingsService';
import { SchoolBranding } from '@/types';
import { resolveBranding, lighten } from '@/lib/brandingUtils';
import { GraduationCap, Mail, Lock, Check, School } from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  // "" White-label branding """""""""""""""""""""""""
  const [branding, setBranding] = useState<SchoolBranding | null>(null);
  useEffect(() => {
    const unsub = SettingsService.subscribeToSettings((settings) => {
      setBranding(resolveBranding({
        primaryColor: settings.primaryColor,
        secondaryColor: settings.secondaryColor,
        logoURL: settings.logoURL,
        ...settings.branding,
      }));
    });
    return unsub;
  }, []);

  const b = branding || resolveBranding();
  const logoSizePx = b.loginLogoSize === 'sm' ? 48 : b.loginLogoSize === 'lg' ? 80 : 64;
  const mobileSizePx = b.loginLogoSize === 'sm' ? 40 : b.loginLogoSize === 'lg' ? 56 : 48;

  const validate = () => {
    const newErrors: { email?: string; password?: string } = {};

    if (!email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // --- Force password change state ---
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState<{ displayName: string; role: string } | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    setIsLoading(true);

    try {
      const user = await AuthService.signIn(email, password);
      setUser(user);

      // Set auth cookie BEFORE navigation so Next.js middleware allows the route
      const secureSuffix =
        typeof window !== 'undefined' && window.location.protocol === 'https:'
          ? '; Secure'
          : '';
      document.cookie = `SuffaCampus-token=1; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax${secureSuffix}`;
      document.cookie = `SuffaCampus-role=${encodeURIComponent(user.role)}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax${secureSuffix}`;

      // Check if user needs to change their default password
      if (user.requirePasswordChange) {
        setLoggedInUser({ displayName: user.displayName, role: user.role });
        setShowPasswordChange(true);
        setIsLoading(false);
        return;
      }

      toast.success(`Welcome back, ${user.displayName}!`);

      // Redirect SuperAdmin to their dedicated panel
      if (user.role === 'SuperAdmin') {
        router.push('/superadmin');
      } else {
        router.push('/dashboard');
      }
    } catch (error) {
      console.error('[Login] Sign in FAILED:', error);
      const msg = error instanceof Error ? error.message : 'Failed to sign in';
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setIsChangingPassword(true);
    try {
      await AuthService.changePassword(newPassword);
      toast.success('Password changed successfully! Redirecting...');

      // Now redirect to the appropriate dashboard
      const { user } = useAuthStore.getState();
      if (user?.role === 'SuperAdmin') {
        router.push('/superadmin');
      } else {
        router.push('/dashboard');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to change password';
      toast.error(msg);
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="h-screen flex bg-[linear-gradient(135deg,#e8ecf1_0%,#dfe4ea_25%,#d6dce5_50%,#cdd4df_75%,#c4ccd9_100%)] overflow-hidden">
      {/* Left Panel - Brand */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center items-center p-10 relative">
        {/* Subtle noise texture overlay */}
        <div className="absolute inset-0 opacity-[0.015]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\'/%3E%3C/svg%3E")' }} />

        {/* Refined decorative gradient orbs */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-br from-blue-100/30 via-blue-50/20 to-transparent rounded-full blur-3xl -translate-y-1/3 translate-x-1/4 animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-gradient-to-tr from-slate-200/40 via-slate-100/20 to-transparent rounded-full blur-3xl translate-y-1/3 -translate-x-1/4" />
        <div className="absolute top-1/2 left-1/2 w-[300px] h-[300px] bg-gradient-to-r from-violet-50/20 to-blue-50/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />

        {/* Content */}
        <div className="relative z-10 max-w-md text-center">
          {/* Logo */}
          <div className="flex items-center justify-center gap-4 mb-12">
            <div
              className="rounded-2xl flex items-center justify-center shadow-[0_8px_24px_-4px_rgba(37,99,235,0.35)] transition-transform duration-300 hover:scale-105 hover:shadow-[0_12px_32px_-4px_rgba(37,99,235,0.4)] overflow-hidden"
              style={{ width: logoSizePx, height: logoSizePx, backgroundColor: b.primaryColor, boxShadow: `0 8px 24px -4px ${b.primaryColor}55` }}
            >
              {b.logoURL
                ? <Image src={b.logoURL} alt="School logo" width={Math.round(logoSizePx * 0.6)} height={Math.round(logoSizePx * 0.6)} className="object-contain" unoptimized />
                : <GraduationCap className="text-white" style={{ width: logoSizePx * 0.5, height: logoSizePx * 0.5 }} />
              }
            </div>
            <span className="text-[2rem] font-semibold text-slate-800 tracking-[-0.02em]">SuffaCampus</span>
          </div>

          {/* Headline - refined typography */}
          <h1 className="text-[2.5rem] lg:text-[2.875rem] font-semibold text-slate-800 leading-[1.15] mb-4 tracking-[-0.025em]">
            School Management<br />
            <span className="bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(to right, ${b.primaryColor}, ${b.accentColor})` }}>Made Simple</span>
          </h1>

          {/* Subtitle - reduced contrast */}
          <p className="text-slate-400 text-base leading-relaxed max-w-[320px] mx-auto font-normal">
            {b.loginTagline || 'Streamline your institution with our comprehensive management platform.'}
          </p>
        </div>

        {/* Footer - more subtle */}
        {/* Footer - more subtle */}
        <p className="absolute bottom-6 text-slate-500 text-[13px] font-medium tracking-wide opacity-80">{b.footerText || '(c) 2026 SuffaCampus'}</p>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 lg:w-1/2 flex items-center justify-center px-6 py-8 relative">
        {/* Subtle ambient glow */}
        <div className="absolute top-1/4 right-1/3 w-[400px] h-[400px] bg-blue-100/25 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 left-1/4 w-[300px] h-[300px] bg-slate-200/30 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-[520px] relative z-10">
          {/* Mobile Header */}
          <div className="lg:hidden flex items-center justify-center gap-3.5 mb-10">
            <div
              className="rounded-xl flex items-center justify-center overflow-hidden"
              style={{ width: mobileSizePx, height: mobileSizePx, backgroundColor: b.primaryColor, boxShadow: `0 4px 12px ${b.primaryColor}4D` }}
            >
              {b.logoURL
                ? <Image src={b.logoURL} alt="School logo" width={Math.round(mobileSizePx * 0.55)} height={Math.round(mobileSizePx * 0.55)} className="object-contain" unoptimized />
                : <GraduationCap className="text-white" style={{ width: mobileSizePx * 0.5, height: mobileSizePx * 0.5 }} />
              }
            </div>
            <span className="text-2xl font-semibold text-slate-800 tracking-[-0.01em]">SuffaCampus</span>
          </div>

          {/* Form Card */}
          <div className="bg-white/60 backdrop-blur-md rounded-2xl p-8 lg:p-12 shadow-[0_0_0_1px_rgba(255,255,255,0.7),0_2px_4px_rgba(0,0,0,0.03),0_12px_24px_rgba(0,0,0,0.04)] relative border border-white/80">
            <h2 className="text-[1.75rem] font-semibold text-slate-900 mb-1.5 tracking-[-0.02em]">Welcome back</h2>
            <p className="text-slate-400 text-[15px] mb-8">Sign in to continue to SuffaCampus</p>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Email */}
              <div className="space-y-2">
                <label htmlFor="email" className="block text-[15px] font-medium text-slate-700 ml-1 cursor-pointer">
                  Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Mail className="w-5 h-5 text-slate-400" />
                  </div>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    disabled={isLoading}
                    style={{ caretColor: '#000000', color: '#1e293b' }}
                    className={`block w-full h-[52px] pl-12 pr-4 bg-slate-200 border-2 ${errors.email
                      ? 'border-red-400'
                      : 'border-slate-300 hover:border-slate-400 focus:border-blue-500'
                      } rounded-xl placeholder:text-slate-400 outline-none disabled:bg-slate-200 disabled:cursor-not-allowed`}
                  />
                </div>
                {errors.email && (
                  <p className="text-red-500 text-[13px] flex items-center gap-1.5 font-medium mt-1.5 ml-1">
                    {errors.email}
                  </p>
                )}
              </div>

              {/* Password */}
              <div className="space-y-2">
                <label htmlFor="password" className="block text-[14px] font-medium text-slate-700 ml-1 cursor-pointer">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="w-5 h-5 text-slate-400" />
                  </div>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    disabled={isLoading}
                    style={{ caretColor: '#000000', color: '#1e293b' }}
                    className={`block w-full h-[52px] pl-12 pr-4 bg-slate-200 border-2 ${errors.password
                      ? 'border-red-400'
                      : 'border-slate-300 hover:border-slate-400 focus:border-blue-500'
                      } rounded-xl placeholder:text-slate-400 outline-none disabled:bg-slate-200 disabled:cursor-not-allowed`}
                  />
                </div>
                {errors.password && (
                  <p className="text-red-500 text-[13px] flex items-center gap-1.5 font-medium mt-1.5 ml-1">
                    {errors.password}
                  </p>
                )}
              </div>

              {/* Options */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2.5 cursor-pointer group select-none">
                  <div className="relative">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                    />
                    <div className="w-[18px] h-[18px] rounded border border-slate-300 bg-slate-200 peer-checked:bg-blue-500 peer-checked:border-blue-500 peer-focus:ring-4 peer-focus:ring-blue-50/80 transition-colors duration-100 peer-hover:border-slate-400 ring-offset-0" />
                    <Check className="absolute w-3 h-3 text-white opacity-0 peer-checked:opacity-100 pointer-events-none top-[3px] left-[3px] stroke-[3.5] transition-opacity duration-100" />
                  </div>
                  <span className="text-[14px] text-slate-600 group-hover:text-slate-800 transition-colors">Remember me</span>
                </label>
                <Link href="/forgot-password" className="text-[14px] font-medium text-blue-500 hover:text-blue-700 transition-colors">
                  Forgot password?
                </Link>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-[56px] text-white text-[16px] font-semibold rounded-xl transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 mt-2"
                style={{
                  backgroundColor: b.primaryColor,
                  boxShadow: `0 1px 2px rgba(0,0,0,0.05), 0 4px 12px ${b.primaryColor}33`,
                }}
              >
                {isLoading ? (
                  <span className="inline-flex items-center gap-2.5">
                    <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Signing in...
                  </span>
                ) : (
                  'Sign in'
                )}
              </button>
            </form>


          </div>

          {/* Mobile Footer */}
          <p className="lg:hidden text-center text-slate-500 text-xs font-medium mt-6 opacity-80">
            {b.footerText || '(c) 2026 SuffaCampus'}
          </p>
        </div>
      </div>

      {/* ── Force Password Change Overlay ── */}
      {showPasswordChange && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 relative animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center gap-3 mb-2">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: b.primaryColor }}
              >
                <Lock className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Change Your Password</h3>
                <p className="text-sm text-slate-500">
                  Welcome, {loggedInUser?.displayName}
                </p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 mt-4">
              <p className="text-sm text-amber-800">
                Your account is using a temporary password. Please set a new password to continue.
              </p>
            </div>

            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="newPassword" className="block text-sm font-medium text-slate-700">
                  New Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="w-4 h-4 text-slate-400" />
                  </div>
                  <input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="block w-full h-11 pl-10 pr-4 bg-slate-100 border border-slate-300 rounded-lg placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-slate-800"
                    required
                    minLength={8}
                    autoFocus
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700">
                  Confirm Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="w-4 h-4 text-slate-400" />
                  </div>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your new password"
                    className="block w-full h-11 pl-10 pr-4 bg-slate-100 border border-slate-300 rounded-lg placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-slate-800"
                    required
                    minLength={8}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isChangingPassword}
                className="w-full h-11 text-white text-sm font-semibold rounded-lg transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                style={{ backgroundColor: b.primaryColor }}
              >
                {isChangingPassword ? (
                  <span className="inline-flex items-center gap-2">
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Updating password...
                  </span>
                ) : (
                  'Set New Password & Continue'
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

