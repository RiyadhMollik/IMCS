import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';

type OnlineStatus = 'available' | 'dnd' | 'invisible';

interface UserSettings {
  default_message_expiration_hours: number;
  app_lock_enabled: boolean;
  app_lock_timeout_minutes: number;
  show_online_status: boolean;
  show_last_seen: boolean;
  show_read_receipts: boolean;
  show_typing_indicators: boolean;
  calendar_events_enabled: boolean;
}

const defaultSettings: UserSettings = {
  default_message_expiration_hours: 24,
  app_lock_enabled: false,
  app_lock_timeout_minutes: 5,
  show_online_status: true,
  show_last_seen: true,
  show_read_receipts: true,
  show_typing_indicators: true,
  calendar_events_enabled: true,
};

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading, isAuthenticated, logout } = useAuth();

  const [onlineStatus, setOnlineStatus] = useState<OnlineStatus>('available');
  const [lastSeen, setLastSeen] = useState<string>('');
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login');
    }
  }, [loading, isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (user?.online_status === 'dnd' || user?.online_status === 'invisible' || user?.online_status === 'available') {
      setOnlineStatus(user.online_status);
    }
    setLastSeen(user?.last_seen || '');
    void loadSettings();
  }, [isAuthenticated, user?.online_status, user?.last_seen]);

  const loadSettings = async () => {
    try {
      const response = await api.get('/users/settings/');
      setSettings({ ...defaultSettings, ...(response.data || {}) });
    } catch (error) {
      console.error('Failed loading settings:', error);
    }
  };

  const saveSettings = async (next: Partial<UserSettings>) => {
    try {
      setSavingSettings(true);
      const response = await api.patch('/users/settings/', next);
      setSettings((prev) => ({ ...prev, ...(response.data || {}) }));
    } catch (error) {
      console.error('Failed saving settings:', error);
      alert('Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const updatePresence = async (nextStatus: OnlineStatus) => {
    try {
      setSavingStatus(true);
      setOnlineStatus(nextStatus);
      await api.post('/users/set_presence/', { online_status: nextStatus });
    } catch (error) {
      console.error('Failed updating presence:', error);
      alert('Failed to update online status');
    } finally {
      setSavingStatus(false);
    }
  };

  const changePassword = async () => {
    if (!currentPassword || !newPassword) {
      alert('Please enter current and new password');
      return;
    }
    if (newPassword !== confirmPassword) {
      alert('New password and confirmation do not match');
      return;
    }

    try {
      setChangingPassword(true);
      await api.post('/users/change_password/', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      alert('Password changed successfully. Please login again.');
      logout();
    } catch (error: any) {
      console.error('Failed changing password:', error);
      alert(error?.response?.data?.error || 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  const formatLastSeen = (value?: string) => {
    if (!value) return 'Unknown';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    return date.toLocaleString();
  };

  if (loading || !isAuthenticated) {
    return <div className="secure-screen flex items-center justify-center text-slate-300">Loading...</div>;
  }

  return (
    <div className="secure-screen">
      <nav className="secure-nav">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button onClick={() => router.push('/dashboard')} className="text-slate-400 hover:text-cyan-200 transition">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <h1 className="text-xl font-semibold secure-title">User Controls</h1>
          </div>
          <button onClick={logout} className="px-4 py-2 rounded-xl bg-rose-500/20 border border-rose-300/40 text-rose-100 hover:bg-rose-500/30 transition">Logout</button>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <section className="secure-panel p-5">
          <h2 className="text-lg font-semibold text-slate-100 mb-4">Presence</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Online status</label>
              <select
                value={onlineStatus}
                onChange={(e) => updatePresence(e.target.value as OnlineStatus)}
                disabled={savingStatus}
                className="secure-select"
              >
                <option value="available">Available</option>
                <option value="dnd">Do Not Disturb</option>
                <option value="invisible">Invisible</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Last seen</label>
              <p className="px-3 py-2 rounded-lg border border-cyan-200/20 bg-cyan-500/5 text-slate-300">{formatLastSeen(lastSeen)}</p>
            </div>
          </div>
        </section>

        <section className="secure-panel p-5">
          <h2 className="text-lg font-semibold text-slate-100 mb-4">Messaging Defaults</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Default message expiration</label>
              <select
                value={settings.default_message_expiration_hours}
                onChange={(e) => saveSettings({ default_message_expiration_hours: Number(e.target.value) })}
                disabled={savingSettings}
                className="secure-select"
              >
                <option value={24}>24 hours</option>
                <option value={168}>7 days</option>
                <option value={2160}>90 days</option>
              </select>
            </div>
            <div className="flex items-end">
              <p className="text-sm text-slate-400">Per-message expiration can be set in the chat composer (24h / 7d / 90d).</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
            <label className="flex items-center justify-between border border-cyan-200/20 rounded-lg px-3 py-2 bg-cyan-500/5">
              <span className="text-sm text-slate-300">Share online status</span>
              <input
                type="checkbox"
                checked={settings.show_online_status}
                onChange={(e) => saveSettings({ show_online_status: e.target.checked })}
              />
            </label>
            <label className="flex items-center justify-between border border-cyan-200/20 rounded-lg px-3 py-2 bg-cyan-500/5">
              <span className="text-sm text-slate-300">Share last seen</span>
              <input
                type="checkbox"
                checked={settings.show_last_seen}
                onChange={(e) => saveSettings({ show_last_seen: e.target.checked })}
              />
            </label>
            <label className="flex items-center justify-between border border-cyan-200/20 rounded-lg px-3 py-2 bg-cyan-500/5">
              <span className="text-sm text-slate-300">Read receipts</span>
              <input
                type="checkbox"
                checked={settings.show_read_receipts}
                onChange={(e) => saveSettings({ show_read_receipts: e.target.checked })}
              />
            </label>
            <label className="flex items-center justify-between border border-cyan-200/20 rounded-lg px-3 py-2 bg-cyan-500/5">
              <span className="text-sm text-slate-300">Typing indicators</span>
              <input
                type="checkbox"
                checked={settings.show_typing_indicators}
                onChange={(e) => saveSettings({ show_typing_indicators: e.target.checked })}
              />
            </label>
            <label className="flex items-center justify-between border border-cyan-200/20 rounded-lg px-3 py-2 bg-cyan-500/5">
              <span className="text-sm text-slate-300">Calendar suggestions</span>
              <input
                type="checkbox"
                checked={settings.calendar_events_enabled}
                onChange={(e) => saveSettings({ calendar_events_enabled: e.target.checked })}
              />
            </label>
          </div>
        </section>

        <section className="secure-panel p-5">
          <h2 className="text-lg font-semibold text-slate-100 mb-4">Chat Lock</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex items-center justify-between border border-cyan-200/20 rounded-lg px-3 py-2 bg-cyan-500/5">
              <span className="text-sm text-slate-300">Enable chat lock</span>
              <input
                type="checkbox"
                checked={settings.app_lock_enabled}
                onChange={(e) => saveSettings({ app_lock_enabled: e.target.checked })}
              />
            </label>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Lock timeout (minutes)</label>
              <input
                type="number"
                min={1}
                max={120}
                value={settings.app_lock_timeout_minutes}
                onChange={(e) => saveSettings({ app_lock_timeout_minutes: Number(e.target.value || 5) })}
                className="secure-input"
              />
            </div>
          </div>
        </section>

        <section className="secure-panel p-5">
          <h2 className="text-lg font-semibold text-slate-100 mb-4">Change Password</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="password"
              placeholder="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="secure-input"
            />
            <input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="secure-input"
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="secure-input"
            />
          </div>
          <div className="mt-3">
            <button
              onClick={changePassword}
              disabled={changingPassword}
              className="secure-btn disabled:opacity-50"
            >
              {changingPassword ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
