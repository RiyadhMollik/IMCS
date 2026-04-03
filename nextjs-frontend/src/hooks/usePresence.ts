import { useState, useEffect, useRef, useCallback } from 'react';
import api from '@/lib/api';
import { getValidAccessToken } from '@/lib/authTokens';
import { CallData } from './useWebRTC';

const WS_BASE = process.env.NEXT_PUBLIC_WS_BASE || 'ws://localhost:8001/ws';
const PRESENCE_WS_URL = `${WS_BASE}/presence/`;

export interface OnlineUser {
  id: number;
  username: string;
  is_online: boolean;
}

export interface IncomingGroupCallData {
  conference_id: number;
  conversation_id?: number;
  title: string;
  host_id?: number;
  host_username: string;
  call_type: 'audio' | 'video';
  room_id: string;
}

export interface CallHistoryItem {
  id: number;
  caller: { id: number; username: string };
  receiver: { id: number; username: string };
  call_type: 'audio' | 'video';
  status: string;
  initiated_at: string;
  accepted_at?: string;
  ended_at?: string;
  duration?: number;
}

export function usePresence(onCallEnded?: (callData: CallHistoryItem) => void) {
  const [incomingCall, setIncomingCall] = useState<CallData | null>(null);
  const [incomingGroupCall, setIncomingGroupCall] = useState<IncomingGroupCallData | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const shouldReconnectRef = useRef(true);

  // Setup presence WebSocket
  const setupPresenceWebSocket = useCallback(() => {
    if (!shouldReconnectRef.current) return;

    const connect = async () => {
      const token = await getValidAccessToken();
      if (!token || !shouldReconnectRef.current) return;

      // Clean up existing connection
      if (wsRef.current) {
        if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
          return; // Already connected or connecting
        }
      }

      const wsUrl = `${PRESENCE_WS_URL}?token=${token}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      let pingInterval: NodeJS.Timeout;

      const handleOpen = () => {
        console.log('✅ Presence WebSocket connected');
        // Keepalive ping
        pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
      };

      const handleMessage = (event: MessageEvent) => {
        const data = JSON.parse(event.data);
        console.log('📨 Presence message:', data.type);

        switch (data.type) {
          case 'incoming-call':
            console.log('🔔 INCOMING CALL!', data);
            // Map call_id to id for CallData interface
            const incomingCallData: CallData = {
              id: data.call_id,
              room_id: data.room_id,
              caller_username: data.caller_username,
              receiver_username: '', // Will be current user
              call_type: data.call_type,
              status: 'ringing'
            };
            setIncomingCall(incomingCallData);
            break;
          case 'incoming-group-call':
            setIncomingGroupCall({
              conference_id: data.conference_id,
              conversation_id: data.conversation_id,
              title: data.title || '',
              host_id: data.host_id,
              host_username: data.host_username || '',
              call_type: data.call_type || 'video',
              room_id: data.room_id || '',
            });
            break;
          case 'call-cancelled':
            setIncomingCall(null);
            break;
          case 'call-ended':
            setIncomingCall(null);
            // Notify about call end with call data
            if (data.call_data && onCallEnded) {
              onCallEnded(data.call_data);
            }
            break;
        }
      };

      const handleError = () => {
        // Silently handle errors - they're expected during React StrictMode
      };

      const handleClose = () => {
        if (pingInterval) clearInterval(pingInterval);

        // Only reconnect if we should (not during cleanup)
        if (shouldReconnectRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            setupPresenceWebSocket();
          }, 3000);
        }
      };

      ws.addEventListener('open', handleOpen);
      ws.addEventListener('message', handleMessage);
      ws.addEventListener('error', handleError);
      ws.addEventListener('close', handleClose);
    };

    void connect();
  }, [onCallEnded]);

  const rejectCall = useCallback(async (callId: string) => {
    try {
      await api.post(`/calls/${callId}/reject/`);
      setIncomingCall(null);
    } catch (error) {
      console.error('Error rejecting call:', error);
      setIncomingCall(null);
    }
  }, []);

  const clearIncomingCall = useCallback(() => {
    setIncomingCall(null);
  }, []);

  const clearIncomingGroupCall = useCallback(() => {
    setIncomingGroupCall(null);
  }, []);

  useEffect(() => {
    shouldReconnectRef.current = true;
    setupPresenceWebSocket();

    return () => {
      // Cleanup: prevent reconnection
      shouldReconnectRef.current = false;
      
      // Clear any pending reconnection timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      // Close WebSocket connection gracefully
      if (wsRef.current) {
        const ws = wsRef.current;
        // Only close if not already closing or closed
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close(1000, 'Component unmounting'); // 1000 = normal closure
        }
        wsRef.current = null;
      }
    };
  }, [setupPresenceWebSocket]);

  return {
    incomingCall,
    incomingGroupCall,
    rejectCall,
    clearIncomingCall,
    clearIncomingGroupCall,
  };
}
