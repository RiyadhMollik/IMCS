import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import { useOnlineUsers } from '@/hooks/useOnlineUsers';

export default function TestWebSocket() {
  const { user, isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const { onlineUsers, connected, reconnect } = useOnlineUsers();
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, loading, router]);

  useEffect(() => {
    addLog(`Connection status: ${connected ? 'Connected' : 'Disconnected'}`);
  }, [connected]);

  useEffect(() => {
    addLog(`Online users count: ${onlineUsers.length}`);
    onlineUsers.forEach(u => {
      addLog(`  - ${u.username} (ID: ${u.id})`);
    });
  }, [onlineUsers]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`].slice(-20));
  };

  if (loading || !isAuthenticated) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold">WebSocket Test Page</h1>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              Back to Dashboard
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-gray-50 p-4 rounded">
              <div className="text-sm text-gray-600 mb-1">Connection Status</div>
              <div className={`text-lg font-semibold ${connected ? 'text-green-600' : 'text-red-600'}`}>
                {connected ? '✓ Connected' : '✗ Disconnected'}
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded">
              <div className="text-sm text-gray-600 mb-1">Current User</div>
              <div className="text-lg font-semibold">{user?.username}</div>
            </div>

            <div className="bg-gray-50 p-4 rounded">
              <div className="text-sm text-gray-600 mb-1">Online Users</div>
              <div className="text-lg font-semibold">{onlineUsers.length}</div>
            </div>

            <div className="bg-gray-50 p-4 rounded">
              <button
                onClick={reconnect}
                className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Reconnect
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Online Users</h2>
          {onlineUsers.length === 0 ? (
            <p className="text-gray-500">No other users online</p>
          ) : (
            <div className="space-y-2">
              {onlineUsers.map(user => (
                <div key={user.id} className="flex items-center p-3 bg-gray-50 rounded">
                  <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white font-bold mr-3">
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold">{user.username}</div>
                    <div className="text-sm text-gray-500">{user.email}</div>
                  </div>
                  <div className="ml-auto">
                    <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                      Online
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold mb-4">Connection Logs</h2>
          <div className="bg-gray-900 text-green-400 p-4 rounded font-mono text-sm h-64 overflow-y-auto">
            {logs.length === 0 ? (
              <div className="text-gray-500">No logs yet...</div>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="mb-1">{log}</div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
