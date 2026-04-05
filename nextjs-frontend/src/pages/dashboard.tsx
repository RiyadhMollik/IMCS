import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { NotificationBell } from '@/components/NotificationBell';
import api from '@/lib/api';

interface Stats {
  totalContacts: number;
  unreadMessages: number;
  activeGroups: number;
  todayCalls: number;
}

interface ConversationSummary {
  id: number;
  conversation_type: 'direct' | 'group';
}

interface CallHistoryItem {
  id: number;
  initiated_at: string;
}

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Calls', path: '/calls' },
  { label: 'Contacts', path: '/contacts' },
  { label: 'Messages', path: '/messages' },
];

const RECENT_ACTIVITY = [
  { initials: 'PH', name: 'Patrick Hendricks', action: 'sent you a message', time: '2 min ago', color: 'bg-orange-500' },
  { initials: 'DB', name: 'Doris Brown', action: 'started a video call', time: '15 min ago', color: 'bg-pink-500' },
  { initials: 'SO', name: 'SecureOps Team', action: 'shared a document', time: '1 hour ago', color: 'bg-blue-500' },
  { initials: 'AR', name: 'Albert Rodarte', action: 'joined the network', time: '2 hours ago', color: 'bg-violet-500' },
  { initials: 'SW', name: 'Steve Walker', action: 'updated their profile', time: '3 hours ago', color: 'bg-emerald-500' },
];

function ThemeToggleButton() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="inline-flex items-center justify-center rounded-full p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800 transition"
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
    >
      {theme === 'dark' ? (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.2M12 18.8V21M5.64 5.64l1.56 1.56M16.8 16.8l1.56 1.56M3 12h2.2M18.8 12H21M5.64 18.36l1.56-1.56M16.8 7.2l1.56-1.56" />
          <circle cx="12" cy="12" r="4" />
        </svg>
      ) : (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.8A8.5 8.5 0 1111.2 3a6.5 6.5 0 009.8 9.8z" />
        </svg>
      )}
    </button>
  );
}

export default function Dashboard() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Stats>({
    totalContacts: 0,
    unreadMessages: 0,
    activeGroups: 0,
    todayCalls: 0,
  });

  const isAdmin = user?.role === 'user_admin' || user?.role === 'system_admin';

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, loading, router]);

  useEffect(() => {
    if (!isAuthenticated) {
      return undefined;
    }

    const fetchStats = async () => {
      try {
        const [contactsResponse, unreadResponse, conversationsResponse, callsResponse] = await Promise.all([
          api.get('/users/contacts/'),
          api.get('/messages/unread_count/'),
          api.get('/conversations/'),
          api.get('/calls/history/'),
        ]);

        const contacts = contactsResponse.data.results || contactsResponse.data || [];
        const conversations: ConversationSummary[] = conversationsResponse.data.results || conversationsResponse.data || [];
        const calls: CallHistoryItem[] = callsResponse.data.results || callsResponse.data || [];
        const unreadMessages = Number(unreadResponse.data?.count || 0);

        const activeGroups = conversations.filter(
          (conversation) => conversation.conversation_type === 'group'
        ).length;

        const today = new Date();
        const todayCalls = calls.filter((call) => {
          const callDate = new Date(call.initiated_at);
          return (
            callDate.getFullYear() === today.getFullYear() &&
            callDate.getMonth() === today.getMonth() &&
            callDate.getDate() === today.getDate()
          );
        }).length;

        setStats({
          totalContacts: Array.isArray(contacts) ? contacts.length : 0,
          unreadMessages,
          activeGroups,
          todayCalls,
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
      }
    };

    fetchStats();

    const interval = setInterval(fetchStats, 7000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchStats();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated]);

  const metrics = useMemo(
    () => [
      {
        title: 'Total Contacts',
        value: stats.totalContacts,
        growth: '+12%',
        iconBg: 'bg-sky-500',
        icon: (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.35-1.86M17 20H7m10 0v-2a5 5 0 00-10 0v2m10-9a3 3 0 10-6 0 3 3 0 006 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        ),
      },
      {
        title: 'Messages Today',
        value: stats.unreadMessages,
        growth: '+24%',
        iconBg: 'bg-violet-500',
        icon: (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.42-4.03 8-9 8-1.48 0-2.87-.31-4.12-.87L3 20l1.48-3.44A7.7 7.7 0 013 12c0-4.42 4.03-8 9-8s9 3.58 9 8z" />
        ),
      },
      {
        title: 'Active Groups',
        value: stats.activeGroups,
        growth: '+8%',
        iconBg: 'bg-emerald-500',
        icon: (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.35-1.86M17 20H7m10 0v-2a5 5 0 00-10 0v2m8-9a3 3 0 11-6 0 3 3 0 016 0z" />
        ),
      },
      {
        title: 'Calls Today',
        value: stats.todayCalls,
        growth: '+18%',
        iconBg: 'bg-gradient-to-br from-violet-500 to-sky-500',
        icon: (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.95.68l1.5 4.5a1 1 0 01-.5 1.2l-2.26 1.13a11.04 11.04 0 005.52 5.52l1.13-2.26a1 1 0 011.2-.5l4.5 1.5a1 1 0 01.68.95V19a2 2 0 01-2 2h-1C9.72 21 3 14.28 3 6V5z" />
        ),
      },
    ],
    [stats]
  );

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-600 dark:text-slate-300">Loading...</div>;
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#050816] dark:text-slate-100 transition-colors">
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-[#0c1326]/90">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={() => router.push('/dashboard')}
              className="text-2xl font-extrabold tracking-tight text-sky-500"
            >
              IMCS
            </button>

            <nav className="hidden md:flex items-center gap-1">
              {NAV_ITEMS.map((item) => {
                const active = router.pathname === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => router.push(item.path)}
                    className={`px-3 py-1.5 rounded-full text-sm font-semibold transition ${
                      active
                        ? 'bg-sky-500 text-white'
                        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggleButton />
            <NotificationBell />

            <div className="hidden sm:flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-200 flex items-center justify-center text-xs font-bold">
                {(user?.username || 'U').charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{user?.username}</span>
            </div>

            <button
              onClick={logout}
              className="inline-flex items-center gap-2 bg-red-500 text-white px-3 py-1.5 rounded-xl text-sm font-semibold hover:bg-red-600 transition"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h8a2 2 0 002-2v-2" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 5V3a2 2 0 00-2-2H3" />
              </svg>
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6 sm:py-7">
        <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-1">Welcome back, {user?.username}</h1>
            <p className="text-slate-500 dark:text-slate-400">Your secure communication hub, all systems operational.</p>
          </div>
          <div className="inline-flex items-center self-start px-4 py-1.5 rounded-full bg-emerald-100 text-emerald-700 text-sm font-semibold dark:bg-emerald-900/30 dark:text-emerald-300">
            <span className="mr-2 h-2 w-2 rounded-full bg-emerald-500" />
            All Systems Secure
          </div>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
          {metrics.map((metric) => (
            <article
              key={metric.title}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/60"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`h-10 w-10 rounded-xl ${metric.iconBg} text-white flex items-center justify-center`}>
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                    {metric.icon}
                  </svg>
                </div>
                <span className="text-sm font-semibold text-emerald-500">{metric.growth}</span>
              </div>
              <div className="text-4xl font-bold leading-none mb-2">{metric.value}</div>
              <p className="text-slate-500 dark:text-slate-400">{metric.title}</p>
            </article>
          ))}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
          <article className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-2xl font-bold">Recent Activity</h2>
              <button className="text-sm font-semibold text-sky-500 hover:text-sky-600">View All</button>
            </div>
            <div>
              {RECENT_ACTIVITY.map((entry) => (
                <div key={`${entry.name}-${entry.time}`} className="flex items-center gap-4 px-5 py-4 border-b border-slate-100 last:border-b-0 dark:border-slate-800/80">
                  <div className={`h-9 w-9 rounded-full ${entry.color} text-white flex items-center justify-center text-xs font-bold`}>
                    {entry.initials}
                  </div>
                  <div>
                    <p className="text-base">
                      <span className="font-bold">{entry.name}</span>
                      <span className="text-slate-500 dark:text-slate-400"> {entry.action}</span>
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-500">{entry.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
            <h2 className="text-2xl font-bold mb-4">Security Status</h2>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-xl bg-sky-100 dark:bg-slate-800 text-sky-500 flex items-center justify-center">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" /></svg>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Encryption Status</p>
                  <p className="font-bold">AES-256 Active</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-xl bg-sky-100 dark:bg-slate-800 text-sky-500 flex items-center justify-center">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.35-1.86M17 20H7m10 0v-2a5 5 0 00-10 0v2" /></svg>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Active Sessions</p>
                  <p className="font-bold">2 Devices</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-xl bg-sky-100 dark:bg-slate-800 text-sky-500 flex items-center justify-center">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Uptime</p>
                  <p className="font-bold">99.97%</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-xl bg-sky-100 dark:bg-slate-800 text-sky-500 flex items-center justify-center">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3M12 3a9 9 0 100 18 9 9 0 000-18z" /></svg>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Last Backup</p>
                  <p className="font-bold">2 min ago</p>
                </div>
              </li>
            </ul>
          </article>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
          <button
            onClick={() => router.push('/messages')}
            className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm hover:shadow-md transition dark:border-slate-800 dark:bg-slate-900/60"
          >
            <div className="h-10 w-10 rounded-xl bg-sky-500 text-white flex items-center justify-center mb-4">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.42-4.03 8-9 8-1.48 0-2.87-.31-4.12-.87L3 20l1.48-3.44A7.7 7.7 0 013 12c0-4.42 4.03-8 9-8s9 3.58 9 8z" /></svg>
            </div>
            <h3 className="text-3xl font-bold mb-1">Messages</h3>
            <p className="text-slate-500 dark:text-slate-400">End-to-end encrypted messaging with ephemeral messages.</p>
          </button>

          <button
            onClick={() => router.push('/calls')}
            className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm hover:shadow-md transition dark:border-slate-800 dark:bg-slate-900/60"
          >
            <div className="h-10 w-10 rounded-xl bg-violet-500 text-white flex items-center justify-center mb-4">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.95.68l1.5 4.5a1 1 0 01-.5 1.2l-2.26 1.13a11.04 11.04 0 005.52 5.52l1.13-2.26a1 1 0 011.2-.5l4.5 1.5a1 1 0 01.68.95V19a2 2 0 01-2 2h-1C9.72 21 3 14.28 3 6V5z" /></svg>
            </div>
            <h3 className="text-3xl font-bold mb-1">Voice and Video</h3>
            <p className="text-slate-500 dark:text-slate-400">Encrypted calls with conference support and screen sharing.</p>
          </button>

          <button
            onClick={() => router.push('/contacts')}
            className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm hover:shadow-md transition dark:border-slate-800 dark:bg-slate-900/60"
          >
            <div className="h-10 w-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center mb-4">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.35-1.86M17 20H7m10 0v-2a5 5 0 00-10 0v2m8-9a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </div>
            <h3 className="text-3xl font-bold mb-1">Contacts</h3>
            <p className="text-slate-500 dark:text-slate-400">Manage your secure contact network and trust settings.</p>
          </button>
        </section>

        {isAdmin && (
          <section className="rounded-2xl p-6 bg-gradient-to-r from-sky-500 to-violet-500 text-white shadow-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-2xl font-extrabold mb-1">Admin Control Center</h3>
              <p className="text-white/90">Manage users, permissions, and policy enforcement from one secure view.</p>
            </div>
            <button
              onClick={() => router.push('/admin')}
              className="px-5 py-2.5 rounded-xl bg-white text-slate-900 font-bold hover:bg-slate-100 transition"
            >
              Open Admin Panel
            </button>
          </section>
        )}
      </main>
    </div>
  );
}
