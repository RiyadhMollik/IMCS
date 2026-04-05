import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';

const ThemeToggle = dynamic(() => import('@/components/ThemeToggle'), { ssr: false });
const MobileAppShell = dynamic(() => import('@/components/MobileAppShell'), { ssr: false });

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const [routeLoading, setRouteLoading] = useState(false);
  const [showSplash, setShowSplash] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const splashSeen = sessionStorage.getItem('imcs_splash_seen');
    if (!splashSeen) {
      setShowSplash(true);
      const timer = window.setTimeout(() => {
        setShowSplash(false);
        sessionStorage.setItem('imcs_splash_seen', '1');
      }, 900);

      return () => {
        window.clearTimeout(timer);
      };
    }
    return undefined;
  }, []);

  useEffect(() => {
    const onStart = () => setRouteLoading(true);
    const onDone = () => {
      window.setTimeout(() => setRouteLoading(false), 160);
    };

    router.events.on('routeChangeStart', onStart);
    router.events.on('routeChangeComplete', onDone);
    router.events.on('routeChangeError', onDone);

    return () => {
      router.events.off('routeChangeStart', onStart);
      router.events.off('routeChangeComplete', onDone);
      router.events.off('routeChangeError', onDone);
    };
  }, [router.events]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = async () => {
      try {
        await navigator.serviceWorker.register('/sw.js');
      } catch (error) {
        console.error('Service worker registration failed:', error);
      }
    };

    void register();
  }, []);

  return (
    <>
      <Head>
        <title>IMCS Secure Connect</title>
        <meta name="application-name" content="IMCS Secure Connect" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="IMCS" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#041326" />
        <meta name="format-detection" content="telephone=no" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no"
        />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/icons/icon-192.svg" />
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
      </Head>

      {showSplash && (
        <div className="apk-splash-screen" role="status" aria-live="polite">
          <div className="apk-splash-badge">IMCS</div>
          <h1 className="apk-splash-title">Secure Connect</h1>
          <p className="apk-splash-subtitle">Launching encrypted workspace...</p>
        </div>
      )}

      {routeLoading && <div className="apk-route-skeleton" />}

      <ThemeProvider>
        <AuthProvider>
          <MobileAppShell>
            <Component {...pageProps} />
          </MobileAppShell>
          <ThemeToggle placement="floating" />
        </AuthProvider>
      </ThemeProvider>
    </>
  );
}
