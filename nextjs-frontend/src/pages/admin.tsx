import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';

interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  is_online: boolean;
  is_locked: boolean;
  account_expires_at?: string;
  can_make_voice_calls: boolean;
  can_make_video_calls: boolean;
  can_send_messages: boolean;
  date_joined: string;
}

export default function AdminPanel() {
  const { user, isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [activeTab, setActiveTab] = useState<'users' | 'settings' | 'logs'>('users');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login');
    } else if (user && user.role !== 'user_admin' && user.role !== 'system_admin') {
      router.push('/dashboard');
    }
  }, [isAuthenticated, loading, user, router]);

  useEffect(() => {
    if (isAuthenticated && (user?.role === 'user_admin' || user?.role === 'system_admin')) {
      fetchUsers();
    }
  }, [isAuthenticated, user]);

  const fetchUsers = async () => {
    try {
      const response = await api.get('/users/');
      setUsers(response.data);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const toggleUserLock = async (userId: number, isLocked: boolean) => {
    try {
      await api.post(`/users/${userId}/toggle-lock/`, { lock: !isLocked });
      fetchUsers();
    } catch (error) {
      console.error('Error toggling user lock:', error);
    }
  };

  const updateUserPermissions = async (userId: number, permissions: any) => {
    try {
      await api.patch(`/users/${userId}/permissions/`, permissions);
      fetchUsers();
    } catch (error) {
      console.error('Error updating permissions:', error);
    }
  };

  const filteredUsers = users.filter((u) =>
    u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading || !isAuthenticated) {
    return <div className="secure-screen flex items-center justify-center text-slate-300">Loading...</div>;
  }

  return (
    <div className="secure-screen">
      {/* Header */}
      <nav className="secure-nav bg-gradient-to-r from-cyan-600/35 to-teal-600/25">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <button
                onClick={() => router.push('/dashboard')}
                className="mr-4 text-cyan-100 hover:text-white transition"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <svg className="w-8 h-8 text-cyan-100 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <h1 className="text-xl font-bold text-cyan-50">Admin Panel</h1>
            </div>
            <div className="flex items-center">
              <span className="text-sm text-cyan-100/90">{user?.username}</span>
            </div>
          </div>
        </div>
      </nav>

      {/* Tabs */}
      <div className="bg-[#071226]/85 shadow-sm border-b border-cyan-300/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab('users')}
              className={`py-4 px-2 border-b-2 font-medium text-sm transition ${
                activeTab === 'users'
                  ? 'border-cyan-300 text-cyan-200'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-cyan-400/40'
              }`}
            >
              User Management
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`py-4 px-2 border-b-2 font-medium text-sm transition ${
                activeTab === 'settings'
                  ? 'border-cyan-300 text-cyan-200'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-cyan-400/40'
              }`}
            >
              System Settings
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`py-4 px-2 border-b-2 font-medium text-sm transition ${
                activeTab === 'logs'
                  ? 'border-cyan-300 text-cyan-200'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-cyan-400/40'
              }`}
            >
              Activity Logs
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {activeTab === 'users' && (
          <div>
            {/* Search and Actions */}
            <div className="secure-panel p-4 mb-6">
              <div className="flex justify-between items-center">
                <div className="relative flex-1 max-w-lg">
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="secure-input pl-10"
                  />
                  <svg
                    className="absolute left-3 top-3 w-5 h-5 text-slate-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
                <button className="ml-4 secure-btn px-6 py-2 font-medium">
                  + Create User
                </button>
              </div>
            </div>

            {/* Users Table */}
            <div className="secure-panel overflow-hidden">
              <table className="min-w-full divide-y divide-cyan-200/10">
                <thead className="bg-cyan-500/5">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Permissions
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-200/10">
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-cyan-500/5 transition">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-10 h-10 bg-cyan-600/70 rounded-full flex items-center justify-center text-white font-bold">
                            {u.username.charAt(0).toUpperCase()}
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-slate-100">{u.username}</div>
                            <div className="text-sm text-slate-400">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-cyan-500/15 text-cyan-200 border border-cyan-300/20">
                          {u.role.replace('_', ' ').toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {u.is_online ? (
                            <span className="text-green-600 text-sm">● Online</span>
                          ) : (
                            <span className="text-slate-500 text-sm">● Offline</span>
                          )}
                          {u.is_locked && (
                            <span className="ml-2 text-red-600 text-sm">🔒 Locked</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                        <div className="space-y-1">
                          {u.can_make_voice_calls && <div>✓ Voice</div>}
                          {u.can_make_video_calls && <div>✓ Video</div>}
                          {u.can_send_messages && <div>✓ Messages</div>}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => toggleUserLock(u.id, u.is_locked)}
                          className={`mr-3 ${
                            u.is_locked
                              ? 'text-green-600 hover:text-green-900'
                              : 'text-red-600 hover:text-red-900'
                          }`}
                        >
                          {u.is_locked ? 'Unlock' : 'Lock'}
                        </button>
                        <button className="text-cyan-300 hover:text-cyan-100">
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="secure-panel p-6">
            <h2 className="text-lg font-semibold mb-4 text-slate-100">System Settings</h2>
            <p className="text-slate-400">System configuration options will appear here.</p>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="secure-panel p-6">
            <h2 className="text-lg font-semibold mb-4 text-slate-100">Activity Logs</h2>
            <p className="text-slate-400">System activity logs will appear here.</p>
          </div>
        )}
      </main>
    </div>
  );
}
