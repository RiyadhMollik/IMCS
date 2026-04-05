import { useState, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const router = useRouter();
  const { login, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      const otpVerified = typeof window !== 'undefined' && sessionStorage.getItem('dummy_otp_verified') === '1';
      const fingerprintVerified = typeof window !== 'undefined' && sessionStorage.getItem('dummy_fingerprint_verified') === '1';

      if (!otpVerified) {
        router.push('/auth/otp');
      } else if (!fingerprintVerified) {
        router.push('/auth/fingerprint');
      } else {
        router.push('/dashboard');
      }
    }
  }, [isAuthenticated, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(username, password);
      // Router push is handled in AuthContext
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="secure-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-[1040px]">
        <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-8 items-center">
          <section className="hidden lg:block pl-2">
            <h1 className="secure-title text-6xl leading-[0.96] font-bold">IMCS</h1>
            <p className="text-slate-300 text-2xl mt-4 max-w-md">Internal Messaging & Calling Software</p>
            <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-500/10 px-4 py-2 text-xs uppercase tracking-[0.16em] text-cyan-200">
              <span className="w-2 h-2 rounded-full bg-cyan-300 animate-pulse" />
              Secure Node Active
            </div>
          </section>

          <section className="secure-panel p-8 sm:p-10 relative overflow-hidden">
            <div className="absolute -right-14 -top-14 w-40 h-40 rounded-full bg-cyan-500/10 blur-2xl" />
            <div className="absolute -left-16 -bottom-16 w-44 h-44 rounded-full bg-teal-500/10 blur-2xl" />

            <div className="relative">
              <div className="mb-8">
                <div className="inline-flex items-center rounded-md border border-cyan-300/25 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-200">
                  Classified System
                </div>
                <h2 className="secure-title text-3xl font-bold mt-4">Operator Access</h2>
                <p className="text-slate-400 mt-1">Authorized personnel only</p>
              </div>

              {error && (
                <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-rose-200 mb-6">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="username" className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-[0.14em]">
                    Operator ID
                  </label>
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    className="secure-input"
                    placeholder="Enter operator ID"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-[0.14em]">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="secure-input"
                    placeholder="Enter password"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="secure-btn w-full py-3 text-base"
                >
                  {loading ? 'Signing in...' : 'Continue'}
                </button>
              </form>

              <div className="mt-6 text-center">
                <p className="text-slate-400 text-sm">
                  Don't have an account?{' '}
                  <Link href="/register" className="text-cyan-300 hover:text-cyan-100 font-semibold transition">
                    Sign up
                  </Link>
                </p>
              </div>

              <p className="mt-8 text-center text-[11px] uppercase tracking-[0.16em] text-slate-500">
                Confidential - Authorized Personnel Only
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
