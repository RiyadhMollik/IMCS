import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';

export default function OtpVerificationPage() {
  const router = useRouter();
  const { isAuthenticated, loading, user, logout } = useAuth();
  const [otp, setOtp] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const maskedTarget = useMemo(() => {
    const email = user?.email || `${user?.username || 'operator'}@secure.imcs.local`;
    const [name, domain] = email.split('@');
    if (!name || !domain) return 'registered device';
    return `${name.slice(0, 2)}***@${domain}`;
  }, [user?.email, user?.username]);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login');
      return;
    }

    if (!loading && isAuthenticated && typeof window !== 'undefined') {
      const fingerprintVerified = sessionStorage.getItem('dummy_fingerprint_verified') === '1';
      const otpVerified = sessionStorage.getItem('dummy_otp_verified') === '1';

      if (fingerprintVerified) {
        router.push('/dashboard');
      } else if (otpVerified) {
        router.push('/auth/fingerprint');
      }
    }
  }, [isAuthenticated, loading, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (otp.trim().length !== 6) {
      setError('Enter a valid 6-digit security code');
      return;
    }

    setSubmitting(true);

    // Simulate backend OTP validation for now.
    setTimeout(() => {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('dummy_otp_verified', '1');
      }
      router.push('/auth/fingerprint');
    }, 900);
  };

  if (loading) {
    return <div className="secure-screen flex items-center justify-center text-slate-300">Loading...</div>;
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="secure-screen secure-grid-bg flex items-center justify-center p-4">
      <div className="secure-panel w-full max-w-md p-8">
        <div className="text-center mb-8">
          <p className="secure-subtitle uppercase tracking-[0.2em] mb-2">Step 1 of 2</p>
          <h1 className="secure-title text-3xl font-bold mb-2">OTP Verification</h1>
          <p className="text-slate-400">A secure code was sent to {maskedTarget}</p>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-rose-200 mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="otp" className="block text-sm font-medium text-slate-300 mb-2 uppercase tracking-wide">
              One-Time Passcode
            </label>
            <input
              id="otp"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              className="secure-input text-center text-2xl tracking-[0.35em]"
              placeholder="000000"
              required
            />
            <p className="mt-2 text-xs text-slate-500">Dummy mode: use any 6-digit code.</p>
          </div>

          <button type="submit" disabled={submitting} className="secure-btn w-full py-3 text-base">
            {submitting ? 'Verifying...' : 'Verify OTP'}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-between text-sm">
          <button type="button" className="text-cyan-300 hover:text-cyan-100 transition" onClick={() => setOtp('')}>
            Clear Code
          </button>
          <button
            type="button"
            className="text-rose-300 hover:text-rose-100 transition"
            onClick={logout}
          >
            Cancel Login
          </button>
        </div>
      </div>
    </div>
  );
}
