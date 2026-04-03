import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import { usePresence } from '@/hooks/usePresence';
import api from '@/lib/api';
import IncomingCallModal from '@/components/IncomingCallModal';
import VideoCallModal from '@/components/VideoCallModal';
import { useWebRTC } from '@/hooks/useWebRTC';
import Cookies from 'js-cookie';

interface GroupDetails {
  id: number;
  name: string;
  description: string;
  image?: string;
  created_by: {
    id: number;
    username: string;
  };
  members_count: number;
  is_member: boolean;
  user_role: string;
}

interface GroupMessage {
  id: number;
  sender: {
    id: number;
    username: string;
  };
  content: string;
  created_at: string;
}

export default function GroupChatPage() {
  const router = useRouter();
  const { id } = router.query;
  const { user, logout, isAuthenticated, loading } = useAuth();
  const [group, setGroup] = useState<GroupDetails | null>(null);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [messageContent, setMessageContent] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const { incomingCall, rejectCall, clearIncomingCall } = usePresence();
  const {
    localVideoRef,
    remoteVideoRef,
    callStatus,
    isCallActive,
    currentCall,
    audioEnabled,
    videoEnabled,
    isScreenSharing,
    acceptCall,
    endCall,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
  } = useWebRTC();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, loading, router]);

  useEffect(() => {
    if (id && isAuthenticated) {
      loadGroup();
      loadMessages();
      connectWebSocket();
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [id, isAuthenticated]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadGroup = async () => {
    try {
      const response = await api.get(`/groups/${id}/`);
      setGroup(response.data);
      
      if (!response.data.is_member) {
        alert('You are not a member of this group');
        router.push('/groups');
      }
    } catch (error) {
      console.error('Failed to load group:', error);
      router.push('/groups');
    }
  };

  const loadMessages = async () => {
    setLoadingMessages(true);
    try {
      const response = await api.get(`/groups/${id}/messages/`);
      setMessages(response.data.results || response.data);
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setLoadingMessages(false);
    }
  };

  const connectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const token = Cookies.get('access_token');
    const wsUrl = `${process.env.NEXT_PUBLIC_WS_BASE || 'ws://localhost:8001/ws'}/group/${id}/?token=${token}`;
    
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log('WebSocket connected to group chat');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'group_message') {
        setMessages((prev) => [...prev, data.message]);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
    };

    wsRef.current = ws;
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageContent.trim() || !id) return;

    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'group_message',
          message: messageContent,
        }));
        setMessageContent('');
      } else {
        // Fallback to REST API
        const response = await api.post(`/groups/${id}/messages/`, {
          content: messageContent,
        });
        setMessages((prev) => [...prev, response.data]);
        setMessageContent('');
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      alert('Failed to send message');
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    
    if (hours < 1) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (hours < 24) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString();
  };

  const handleAcceptCall = async () => {
    if (incomingCall) {
      try {
        await acceptCall(incomingCall);
        clearIncomingCall();
      } catch (error) {
        console.error('Failed to accept call:', error);
        alert('Failed to accept call');
      }
    }
  };

  const handleRejectCall = async () => {
    if (incomingCall) {
      await rejectCall(incomingCall.id);
    }
  };

  if (loading || !group) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-gray-600 text-2xl">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const callTitle = currentCall
    ? `${currentCall.call_type === 'video' ? '📹' : '🎤'} Call with ${
        currentCall.caller_username === user.username
          ? currentCall.receiver_username
          : currentCall.caller_username
      }`
    : 'Call';

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-md sticky top-0 z-10">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-8">
              <h1 className="text-2xl font-bold text-blue-600">JVAI Community</h1>
              
              <nav className="hidden md:flex space-x-4">
                <button
                  onClick={() => router.push('/social')}
                  className="text-gray-600 hover:text-blue-600 px-3 py-2 font-medium"
                >
                  Home
                </button>
                <button
                  onClick={() => router.push('/dashboard')}
                  className="text-gray-600 hover:text-blue-600 px-3 py-2 font-medium"
                >
                  Calls
                </button>
                <button
                  onClick={() => router.push('/groups')}
                  className="text-blue-600 border-b-2 border-blue-600 px-3 py-2 font-medium"
                >
                  Groups
                </button>
                <button
                  onClick={() => router.push('/messages')}
                  className="text-gray-600 hover:text-blue-600 px-3 py-2 font-medium"
                >
                  Messages
                </button>
              </nav>
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <span className="font-medium text-gray-800 hidden sm:block">{user.username}</span>
              </div>
              <button
                onClick={logout}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-medium transition"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <div className="bg-white rounded-lg shadow-md overflow-hidden" style={{ height: 'calc(100vh - 160px)' }}>
          <div className="flex flex-col h-full">
            {/* Group Header */}
            <div className="p-4 border-b border-gray-200">
              <button
                onClick={() => router.push('/groups')}
                className="text-blue-600 hover:text-blue-700 mb-3 flex items-center space-x-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span>Back to Groups</span>
              </button>
              <div className="flex items-center space-x-4">
                {group.image ? (
                  <img src={group.image} alt={group.name} className="w-16 h-16 rounded-full object-cover" />
                ) : (
                  <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
                    👥
                  </div>
                )}
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">{group.name}</h2>
                  <p className="text-sm text-gray-600">{group.members_count} members</p>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
              {loadingMessages ? (
                <div className="text-center text-gray-500">Loading messages...</div>
              ) : messages.length === 0 ? (
                <div className="text-center text-gray-500">No messages yet. Start the conversation!</div>
              ) : (
                messages.map((message) => {
                  const isOwn = message.sender?.username === user?.username;
                  return (
                    <div key={message.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-xs lg:max-w-md ${isOwn ? 'order-2' : 'order-1'}`}>
                        {!isOwn && (
                          <p className="text-xs font-semibold text-gray-700 mb-1 ml-2">
                            {message.sender?.username || 'Unknown'}
                          </p>
                        )}
                        <div
                          className={`px-4 py-2 rounded-lg ${
                            isOwn
                              ? 'bg-blue-600 text-white'
                              : 'bg-white text-gray-800 border border-gray-200'
                          }`}
                        >
                          <p>{message.content}</p>
                        </div>
                        <p className={`text-xs text-gray-500 mt-1 ${isOwn ? 'text-right' : 'text-left'} ml-2`}>
                          {formatDate(message.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <form onSubmit={sendMessage} className="p-4 border-t border-gray-200 bg-white">
              <div className="flex items-center space-x-3">
                <input
                  type="text"
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={!messageContent.trim()}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white p-3 rounded-full transition"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>

      {/* Video Call Modal */}
      <VideoCallModal
        isActive={isCallActive}
        callTitle={callTitle}
        callStatus={callStatus}
        callType={currentCall?.call_type || 'video'}
        localVideoRef={localVideoRef}
        remoteVideoRef={remoteVideoRef}
        audioEnabled={audioEnabled}
        videoEnabled={videoEnabled}
        isScreenSharing={isScreenSharing}
        onToggleAudio={toggleAudio}
        onToggleVideo={toggleVideo}
        onToggleScreenShare={toggleScreenShare}
        onEndCall={endCall}
      />

      {/* Incoming Call Modal */}
      <IncomingCallModal
        isActive={!!incomingCall && !isCallActive}
        callData={incomingCall}
        onAccept={handleAcceptCall}
        onReject={handleRejectCall}
      />
    </div>
  );
}
