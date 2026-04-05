import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { AnimatePresence, motion } from 'framer-motion';

interface MobileAppShellProps {
  children: ReactNode;
}

interface TabItem {
  label: string;
  href: string;
  icon: ReactNode;
}

const tabs: TabItem[] = [
  {
    label: 'Home',
    href: '/dashboard',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M9 21V10m6 11V10M5 10l7-7 7 7" />
      </svg>
    ),
  },
  {
    label: 'Messages',
    href: '/messages',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  {
    label: 'Calls',
    href: '/calls',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
      </svg>
    ),
  },
  {
    label: 'Contacts',
    href: '/contacts',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317a1 1 0 011.35-.936l1.122.449a1 1 0 00.74 0l1.122-.449a1 1 0 011.35.936l.09 1.204a1 1 0 00.5.82l1.03.59a1 1 0 01.366 1.366l-.59 1.03a1 1 0 000 .74l.59 1.03a1 1 0 01-.366 1.366l-1.03.59a1 1 0 00-.5.82l-.09 1.204a1 1 0 01-1.35.936l-1.122-.449a1 1 0 00-.74 0l-1.122.449a1 1 0 01-1.35-.936l-.09-1.204a1 1 0 00-.5-.82l-1.03-.59a1 1 0 01-.366-1.366l.59-1.03a1 1 0 000-.74l-.59-1.03a1 1 0 01.366-1.366l1.03-.59a1 1 0 00.5-.82l.09-1.204z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
      </svg>
    ),
  },
];

const chromeHiddenRoutes = ['/', '/login', '/register', '/auth/otp', '/auth/fingerprint'];

function pageTitleFromPath(pathname: string) {
  if (pathname.startsWith('/messages')) return 'Messages';
  if (pathname.startsWith('/calls')) return 'Calls';
  if (pathname.startsWith('/contacts')) return 'Contacts';
  if (pathname.startsWith('/settings')) return 'Settings';
  if (pathname.startsWith('/groups')) return 'Groups';
  if (pathname.startsWith('/dashboard')) return 'Dashboard';
  return 'IMCS';
}

export default function MobileAppShell({ children }: MobileAppShellProps) {
  const router = useRouter();

  const chromeEnabled = useMemo(() => {
    if (chromeHiddenRoutes.includes(router.pathname)) return false;
    if (router.pathname.startsWith('/auth/')) return false;
    return true;
  }, [router.pathname]);

  const navigateTab = (href: string) => {
    if (router.pathname !== href) {
      void router.push(href);
    }
  };

  if (!chromeEnabled) {
    return (
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={router.asPath}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <div className="apk-shell">
      <header className="apk-topbar">
        <div className="apk-topbar-inner">
          <div>
            <p className="apk-brand">IMCS</p>
            <p className="apk-title">{pageTitleFromPath(router.pathname)}</p>
          </div>
        </div>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={router.asPath}
          className="apk-main-content"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
        >
          {children}
        </motion.div>
      </AnimatePresence>

      <nav className="apk-bottom-nav" aria-label="App navigation">
        <div className="apk-bottom-nav-inner">
          {tabs.map((tab) => {
            const active = router.pathname === tab.href || router.pathname.startsWith(`${tab.href}/`);

            return (
              <motion.button
                key={tab.href}
                whileTap={{ scale: 0.94 }}
                onClick={() => navigateTab(tab.href)}
                className={`apk-tab touch-target ${active ? 'apk-tab-active' : ''}`}
              >
                <span className="apk-tab-icon">{tab.icon}</span>
                <span className="apk-tab-label">{tab.label}</span>
              </motion.button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
