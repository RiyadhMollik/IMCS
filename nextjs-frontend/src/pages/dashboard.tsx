import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import ThemeToggle from '@/components/ThemeToggle';
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

export default function Dashboard() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Stats>({
    totalContacts: 0,
    unreadMessages: 0,
    activeGroups: 0,
    todayCalls: 0
  });

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
      } else if (!fingerprintVerified) {
        router.push('/auth/fingerprint');
      }
    }
  }, [isAuthenticated, loading, router]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchStats();

      const interval = setInterval(() => {
        fetchStats();
      }, 5000);

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
    }
    return undefined;
  }, [isAuthenticated]);

  const fetchStats = async () => {
    try {
      const [
        contactsResponse,
        unreadResponse,
        conversationsResponse,
        callsResponse,
      ] = await Promise.all([
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

  if (loading) {
    return <div className="secure-screen flex items-center justify-center text-slate-300">Loading...</div>;
  }

  if (!isAuthenticated) {
    return null;
  }

  const isAdmin = user?.role === 'user_admin' || user?.role === 'system_admin';
  const navItems = [
    {
      label: 'Messages',
      description: 'Encrypted chat',
      onClick: () => router.push('/messages'),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
    },
    {
      label: 'Calls',
      description: 'Voice and video',
      onClick: () => router.push('/calls'),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
      ),
    },
    {
      label: 'Contacts',
      description: 'Trusted people',
      onClick: () => router.push('/contacts'),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      label: 'Settings',
      description: 'Preferences and security',
      onClick: () => router.push('/settings'),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317a1 1 0 011.35-.936l1.122.449a1 1 0 00.74 0l1.122-.449a1 1 0 011.35.936l.09 1.204a1 1 0 00.5.82l1.03.59a1 1 0 01.366 1.366l-.59 1.03a1 1 0 000 .74l.59 1.03a1 1 0 01-.366 1.366l-1.03.59a1 1 0 00-.5.82l-.09 1.204a1 1 0 01-1.35.936l-1.122-.449a1 1 0 00-.74 0l-1.122.449a1 1 0 01-1.35-.936l-.09-1.204a1 1 0 00-.5-.82l-1.03-.59a1 1 0 01-.366-1.366l.59-1.03a1 1 0 000-.74l-.59-1.03a1 1 0 01.366-1.366l1.03-.59a1 1 0 00.5-.82l.09-1.204z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="secure-screen secure-grid-bg lg:flex">
      <aside className="w-full lg:w-72 lg:min-h-screen lg:border-r border-cyan-300/15 bg-[#060d1b]/85 backdrop-blur-xl">
        <div className="p-5 border-b border-cyan-300/15">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-300/25 flex items-center justify-center text-cyan-200">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold secure-title">IMCS</h1>
              <p className="secure-subtitle uppercase tracking-[0.14em]">Control Node</p>
            </div>
          </div>
        </div>

        <div className="p-5 border-b border-cyan-300/15">
          <p className="text-xs text-slate-500 uppercase tracking-[0.2em] mb-3">Operator</p>
          <div className="secure-panel-soft p-3">
            <p className="text-sm font-semibold text-slate-100">{user?.username}</p>
            <p className="text-xs text-slate-400 mt-1">{user?.role?.replace('_', ' ').toUpperCase()}</p>
          </div>
        </div>

        <nav className="p-5 space-y-3">
          <p className="text-xs text-slate-500 uppercase tracking-[0.2em]">Navigation</p>
          {navItems.map((item) => (
            <button
              key={item.label}
              onClick={item.onClick}
              className="w-full flex items-center gap-3 rounded-xl border border-cyan-300/15 bg-cyan-500/5 px-3 py-3 text-left text-slate-200 hover:bg-cyan-500/15 hover:border-cyan-300/30 transition"
            >
              <span className="text-cyan-200">{item.icon}</span>
              <span>
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className="block text-xs text-slate-400">{item.description}</span>
              </span>
            </button>
          ))}
          {isAdmin && (
            <button
              onClick={() => router.push('/admin')}
              className="w-full flex items-center gap-3 rounded-xl border border-amber-300/25 bg-amber-500/10 px-3 py-3 text-left text-amber-100 hover:bg-amber-500/20 transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0a1 1 0 00.95.69h.969c.969 0 1.371 1.24.588 1.81l-.784.57a1 1 0 00-.364 1.118l.3.922c.3.922-.755 1.688-1.54 1.118l-.784-.57a1 1 0 00-1.176 0l-.784.57c-.784.57-1.838-.196-1.539-1.118l.3-.922a1 1 0 00-.364-1.118l-.784-.57c-.783-.57-.38-1.81.588-1.81h.969a1 1 0 00.95-.69zM12 14v7m-4-4h8" />
              </svg>
              <span>
                <span className="block text-sm font-semibold">Admin</span>
                <span className="block text-xs text-amber-200/80">System controls</span>
              </span>
            </button>
          )}
        </nav>

        <div className="px-5 pb-6 lg:mt-auto">
          <button
            onClick={logout}
            className="w-full rounded-xl border border-rose-300/40 bg-rose-500/20 px-4 py-2 text-rose-100 hover:bg-rose-500/30 transition"
          >
            Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 w-full py-6 px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h2 className="secure-title text-2xl font-bold">Dashboard</h2>
            <p className="text-slate-400 mt-1">Internal Messaging & Calling Software</p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle placement="inline" />
            <button
              onClick={() => router.push('/settings')}
              className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-500/20 transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317a1 1 0 011.35-.936l1.122.449a1 1 0 00.74 0l1.122-.449a1 1 0 011.35.936l.09 1.204a1 1 0 00.5.82l1.03.59a1 1 0 01.366 1.366l-.59 1.03a1 1 0 000 .74l.59 1.03a1 1 0 01-.366 1.366l-1.03.59a1 1 0 00-.5.82l-.09 1.204a1 1 0 01-1.35.936l-1.122-.449a1 1 0 00-.74 0l-1.122.449a1 1 0 01-1.35-.936l-.09-1.204a1 1 0 00-.5-.82l-1.03-.59a1 1 0 01-.366-1.366l.59-1.03a1 1 0 000-.74l-.59-1.03a1 1 0 01.366-1.366l1.03-.59a1 1 0 00.5-.82l.09-1.204z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
              </svg>
              Settings
            </button>
          </div>
        </div>

        <div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <div
              className="secure-panel p-6 cursor-pointer hover:-translate-y-0.5 transition duration-200"
              onClick={() => router.push('/contacts')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  router.push('/contacts');
                }
              }}
            >
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-cyan-500/20 rounded-xl p-3 border border-cyan-300/20">
                  <svg className="w-6 h-6 text-cyan-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-slate-400">Contacts</p>
                  <p className="text-2xl font-semibold text-slate-100">{stats.totalContacts}</p>
                </div>
              </div>
            </div>

            <div
              className="secure-panel p-6 cursor-pointer hover:-translate-y-0.5 transition duration-200"
              onClick={() => router.push('/messages')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  router.push('/messages');
                }
              }}
            >
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-emerald-500/20 rounded-xl p-3 border border-emerald-300/20">
                  <svg className="w-6 h-6 text-emerald-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-slate-400">Unread Messages</p>
                  <p className="text-2xl font-semibold text-slate-100">{stats.unreadMessages}</p>
                </div>
              </div>
            </div>

            <div
              className="secure-panel p-6 cursor-pointer hover:-translate-y-0.5 transition duration-200"
              onClick={() => router.push('/groups')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  router.push('/groups');
                }
              }}
            >
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-violet-500/20 rounded-xl p-3 border border-violet-300/20">
                  <svg className="w-6 h-6 text-violet-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-slate-400">Active Groups</p>
                  <p className="text-2xl font-semibold text-slate-100">{stats.activeGroups}</p>
                </div>
              </div>
            </div>

            <div
              className="secure-panel p-6 cursor-pointer hover:-translate-y-0.5 transition duration-200"
              onClick={() => router.push('/calls')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  router.push('/calls');
                }
              }}
            >
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-sky-500/20 rounded-xl p-3 border border-sky-300/20">
                  <svg className="w-6 h-6 text-sky-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-slate-400">Today's Calls</p>
                  <p className="text-2xl font-semibold text-slate-100">{stats.todayCalls}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="secure-panel p-6 hover:-translate-y-0.5 transition duration-200 cursor-pointer" onClick={() => router.push('/messages')}>
              <div className="flex items-center mb-4">
                <svg className="w-8 h-8 text-cyan-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <h2 className="text-lg font-semibold ml-3 text-slate-100">Messages</h2>
              </div>
              <p className="text-slate-400 mb-4">Secure end-to-end encrypted messaging</p>
              <button className="secure-btn w-full" onClick={() => router.push('/messages')}>
                Open Messages
              </button>
            </div>

            <div className="secure-panel p-6 hover:-translate-y-0.5 transition duration-200 cursor-pointer" onClick={() => router.push('/calls')}>
              <div className="flex items-center mb-4">
                <svg className="w-8 h-8 text-cyan-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <h2 className="text-lg font-semibold ml-3 text-slate-100">Voice & Video Calls</h2>
              </div>
              <p className="text-slate-400 mb-4">Make encrypted voice and video calls</p>
              <button className="secure-btn w-full" onClick={() => router.push('/calls')}>
                View Calls
              </button>
            </div>

            <div className="secure-panel p-6 hover:-translate-y-0.5 transition duration-200 cursor-pointer" onClick={() => router.push('/contacts')}>
              <div className="flex items-center mb-4">
                <svg className="w-8 h-8 text-cyan-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <h2 className="text-lg font-semibold ml-3 text-slate-100">Contacts</h2>
              </div>
              <p className="text-slate-400 mb-4">Manage your secure contacts</p>
              <button className="secure-btn w-full" onClick={() => router.push('/contacts')}>
                View Contacts
              </button>
            </div>
          </div>

          {isAdmin && (
            <div
              className="secure-panel p-6 text-white bg-gradient-to-r from-cyan-600/40 to-teal-600/30 cursor-pointer hover:-translate-y-0.5 transition duration-200"
              onClick={() => router.push('/admin')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  router.push('/admin');
                }
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold mb-2">Admin Panel</h3>
                  <p className="text-cyan-50/80">Manage users, permissions, and system settings</p>
                </div>
                <button
                  onClick={() => router.push('/admin')}
                  className="secure-btn-secondary px-6 py-3 font-semibold"
                >
                  Open Admin Panel
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
