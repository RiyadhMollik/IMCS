import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';

export default function FingerprintVerificationPage() {
  const router = useRouter();
  const { isAuthenticated, loading, logout } = useAuth();
  const [scanning, setScanning] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login');
      return;
    }

    if (!loading && isAuthenticated && typeof window !== 'undefined') {
      const otpVerified = sessionStorage.getItem('dummy_otp_verified') === '1';
      const fingerprintVerified = sessionStorage.getItem('dummy_fingerprint_verified') === '1';

      if (!otpVerified) {
        router.push('/auth/otp');
      } else if (fingerprintVerified) {
        router.push('/dashboard');
      }
    }
  }, [isAuthenticated, loading, router]);

  const handleScan = () => {
    if (scanning || scanComplete) return;

    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      setScanComplete(true);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('dummy_fingerprint_verified', '1');
      }
      setTimeout(() => {
        router.push('/dashboard');
      }, 700);
    }, 1800);
  };

  if (loading) {
    return <div className="secure-screen flex items-center justify-center text-slate-300">Loading...</div>;
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="secure-screen secure-grid-bg flex items-center justify-center p-4">
      <div className="secure-panel w-full max-w-md p-8 text-center">
        <p className="secure-subtitle uppercase tracking-[0.2em] mb-2">Step 2 of 2</p>
        <h1 className="secure-title text-3xl font-bold mb-2">Fingerprint Scan</h1>
        <p className="text-slate-400 mb-8">Place your finger on the sensor to complete authentication.</p>

        <div className="relative mx-auto mb-8 w-56 h-56 rounded-full border border-cyan-400/30 bg-cyan-500/5 flex items-center justify-center overflow-hidden">
          <div className={`w-40 h-40 rounded-full border border-cyan-300/40 flex items-center justify-center ${scanning ? 'animate-pulse' : ''}`}>
            <svg className="w-24 h-24 text-cyan-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 11v10m5-5a5 5 0 00-10 0m10-5V9a5 5 0 10-10 0v2m10 0a5 5 0 00-10 0" />
            </svg>
          </div>

          {scanning && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute left-0 right-0 h-1 bg-cyan-300/80 shadow-[0_0_14px_rgba(34,211,238,0.8)] animate-bounce-slow" style={{ top: '45%' }} />
            </div>
          )}
        </div>

        <div className="space-y-3">
          <button
            onClick={handleScan}
            disabled={scanning || scanComplete}
            className="secure-btn w-full py-3 text-base"
          >
            {scanComplete ? 'Verified' : scanning ? 'Scanning...' : 'Scan Fingerprint'}
          </button>

          <button
            onClick={logout}
            className="w-full py-2 rounded-xl border border-rose-300/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 transition"
          >
            Cancel Login
          </button>
        </div>

        <p className="mt-5 text-xs text-slate-500">Dummy mode: this is a simulated biometric screen for future integration.</p>
      </div>
    </div>
  );
}
