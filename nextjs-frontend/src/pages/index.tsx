import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (isAuthenticated) {
        router.push('/dashboard');
      } else {
        router.push('/login');
      }
    }
  }, [isAuthenticated, loading, router]);

  return (
    <div className="secure-screen secure-grid-bg flex items-center justify-center px-4">
      <div className="secure-panel px-8 py-6 text-center">
        <p className="secure-subtitle uppercase tracking-[0.18em] mb-2">IMCS</p>
        <div className="secure-title text-2xl">Initializing secure workspace...</div>
      </div>
    </div>
  );
}
