import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Cookies from 'js-cookie';

interface OnlineUser {
  id: number;
  username: string;
  email?: string;
  is_online: boolean;
  online_status?: 'available' | 'dnd' | 'invisible' | 'offline';
  last_seen?: string;
  profile_picture?: string;
}

export function useOnlineUsers() {
  const { isAuthenticated, user } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = useCallback(() => {
    if (!isAuthenticated || !user) {
      return;
    }

    const token = Cookies.get('access_token');
    if (!token) {
      return;
    }

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.hostname;
    const wsPort = '8001'; // Django backend port
    const wsUrl = `${wsProtocol}//${wsHost}:${wsPort}/ws/status/?token=${token}`;

    console.log('Connecting to WebSocket:', wsUrl);

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('✅ WebSocket connected');
      setConnected(true);
      reconnectAttempts.current = 0;
      
      // Send ping to keep connection alive
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);

      // Store interval to clear on close
      (ws as any).pingInterval = pingInterval;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('📨 WebSocket message:', data);

        if (data.type === 'online_users') {
          setOnlineUsers(data.users || []);
        } else if (data.type === 'user_status_change') {
          // Handle individual user status changes
          setOnlineUsers((prev) => {
            if (data.is_online) {
              // User came online
              if (!prev.find((u) => u.id === data.user_id)) {
                return [...prev, {
                  id: data.user_id,
                  username: data.username,
                  is_online: true,
                  online_status: data.online_status || 'available',
                  last_seen: data.last_seen,
                  email: data.email,
                  profile_picture: data.profile_picture
                }];
              }
            } else {
              // User went offline
              return prev.filter((u) => u.id !== data.user_id);
            }
            return prev;
          });
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
      setConnected(false);
    };

    ws.onclose = (event) => {
      console.log('🔌 WebSocket closed:', event.code, event.reason);
      setConnected(false);

      // Clear ping interval
      if ((ws as any).pingInterval) {
        clearInterval((ws as any).pingInterval);
      }

      // Attempt to reconnect
      if (reconnectAttempts.current < maxReconnectAttempts) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 10000);
        console.log(`🔄 Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttempts.current++;
          connect();
        }, delay);
      }
    };

    wsRef.current = ws;
  }, [isAuthenticated, user]);

  useEffect(() => {
    connect();

    return () => {
      // Cleanup
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        if ((wsRef.current as any).pingInterval) {
          clearInterval((wsRef.current as any).pingInterval);
        }
        wsRef.current.close();
      }
    };
  }, [connect]);

  return {
    onlineUsers,
    connected,
    reconnect: connect
  };
}
