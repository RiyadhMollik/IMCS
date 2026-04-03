import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import { usePresence } from '@/hooks/usePresence';
import api from '@/lib/api';
import IncomingCallModal from '@/components/IncomingCallModal';
import VideoCallModal from '@/components/VideoCallModal';
import { useWebRTC } from '@/hooks/useWebRTC';
import Cookies from 'js-cookie';
import { NotificationBell } from '@/components/NotificationBell';
import { useOnlineUsers } from '@/hooks/useOnlineUsers';

interface User {
  id: number;
  username: string;
  is_online: boolean;
  last_seen?: string;
}

interface ConversationSummary {
  id: number;
  conversation_type: 'direct' | 'group';
  name?: string;
  updated_at?: string;
  is_pinned?: boolean;
  pinned_at?: string;
  is_hidden?: boolean;
  hidden_at?: string;
  is_locked?: boolean;
  locked_at?: string;
  participants?: Array<{
    id: number;
    username: string;
  }>;
}

interface MessageEditHistoryItem {
  edited_by?: {
    id: number;
    username: string;
  };
  previous_content: string;
  edited_at: string;
}

interface MessagePollOption {
  option_id: number;
  text: string;
  votes: number;
  voted: boolean;
}

interface MessagePoll {
  id: number;
  question: string;
  allows_multiple: boolean;
  closes_at?: string | null;
  options: MessagePollOption[];
}

interface EventSuggestion {
  title: string;
  start_at: string;
  end_at: string;
  timezone: string;
}

interface Message {
  id: number;
  conversation?: number;
  sender: {
    id: number;
    username: string;
  } | string;
  receiver: {
    id: number;
    username: string;
  } | string;
  content: string;
  is_read: boolean;
  is_pinned?: boolean;
  is_edited?: boolean;
  receipts?: Array<{
    user: {
      id: number;
    };
    status: 'sent' | 'delivered' | 'read' | 'expired';
    delivered_at?: string;
    read_at?: string;
  }>;
  reactions?: Array<{
    emoji: string;
    count: number;
    reacted: boolean;
  }>;
  mentions?: Array<{
    id: number;
    username: string;
  }>;
  edit_history?: MessageEditHistoryItem[];
  poll?: MessagePoll | null;
  event_suggestion?: EventSuggestion | null;
  created_at?: string;
  sent_at?: string;
}

interface CallHistoryItem {
  id: number;
  caller: {
    id: number;
    username: string;
  };
  receiver: {
    id: number;
    username: string;
  };
  call_type: 'audio' | 'video';
  status: string;
  initiated_at: string;
  duration: number;
}

interface ConferenceCall {
  id: number;
  title: string;
  room_id: string;
  call_type: 'audio' | 'video';
  status: string;
  participant_count?: number;
}

type SignalMessage = {
  type: string;
  user_id?: number;
  sender_id?: number;
  target_id?: number;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

const WS_BASE = process.env.NEXT_PUBLIC_WS_BASE || 'ws://localhost:8001/ws';

const rtcConfig: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

type TimelineItem =
  | { kind: 'message'; item: Message; timestamp: string }
  | { kind: 'call'; item: CallHistoryItem; timestamp: string };

export default function MessagesPage() {
  const router = useRouter();
  const { user, logout, isAuthenticated, loading } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedGroupConversationId, setSelectedGroupConversationId] = useState<number | null>(null);
  const [selectedGroupName, setSelectedGroupName] = useState<string>('');
  const [selectedGroupParticipantIds, setSelectedGroupParticipantIds] = useState<number[]>([]);
  const [groupConversations, setGroupConversations] = useState<ConversationSummary[]>([]);
  const [directConversations, setDirectConversations] = useState<ConversationSummary[]>([]);
  const [selectedDirectConversationId, setSelectedDirectConversationId] = useState<number | null>(null);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupMemberIds, setNewGroupMemberIds] = useState<number[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [showGroupCallModal, setShowGroupCallModal] = useState(false);
  const [showGroupActionsMenu, setShowGroupActionsMenu] = useState(false);
  const [showRenameGroupModal, setShowRenameGroupModal] = useState(false);
  const [showGroupDetailsModal, setShowGroupDetailsModal] = useState(false);
  const [renamingGroup, setRenamingGroup] = useState(false);
  const [newGroupTitle, setNewGroupTitle] = useState('');
  const [groupCallType, setGroupCallType] = useState<'audio' | 'video'>('audio');
  const [startingGroupCall, setStartingGroupCall] = useState(false);
  const [conferenceCall, setConferenceCall] = useState<ConferenceCall | null>(null);
  const [isConferenceCallActive, setIsConferenceCallActive] = useState(false);
  const [conferenceCallStatus, setConferenceCallStatus] = useState('');
  const [conferenceAudioEnabled, setConferenceAudioEnabled] = useState(true);
  const [conferenceVideoEnabled, setConferenceVideoEnabled] = useState(true);
  const [conferenceScreenSharing, setConferenceScreenSharing] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [callHistory, setCallHistory] = useState<CallHistoryItem[]>([]);
  const [recentInteractionByUser, setRecentInteractionByUser] = useState<Record<number, string>>({});
  const [messageContent, setMessageContent] = useState('');
  const [messageExpirationHours, setMessageExpirationHours] = useState(24);
  const [defaultExpirationHours, setDefaultExpirationHours] = useState(24);
  const [searchTerm, setSearchTerm] = useState('');
  const [messageFilter, setMessageFilter] = useState<'all' | 'pinned' | 'polls' | 'mentions'>('all');
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [pollMultiple, setPollMultiple] = useState(false);
  const [pollSelections, setPollSelections] = useState<Record<number, number[]>>({});
  const [draftByConversation, setDraftByConversation] = useState<Record<string, string>>({});
  const [showHiddenChats, setShowHiddenChats] = useState(false);
  const [unlockingConversationId, setUnlockingConversationId] = useState<number | null>(null);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [unlockedConversations, setUnlockedConversations] = useState<Record<number, boolean>>({});
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' | 'info' } | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [reactionPickerForMessageId, setReactionPickerForMessageId] = useState<number | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [typingByConversation, setTypingByConversation] = useState<Record<string, string>>({});
  const [mentionSuggestions, setMentionSuggestions] = useState<Array<{ id: number; username: string }>>([]);
  const [mentionTokenStart, setMentionTokenStart] = useState<number | null>(null);
  const [mentionTokenEnd, setMentionTokenEnd] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const conferenceWsRef = useRef<WebSocket | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageInputRef = useRef<HTMLInputElement | null>(null);
  const conferenceLocalStreamRef = useRef<MediaStream | null>(null);
  const conferenceScreenStreamRef = useRef<MediaStream | null>(null);
  const conferenceCameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const conferenceActiveVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const conferencePeerConnectionsRef = useRef<Record<number, RTCPeerConnection>>({});
  const conferenceRemoteStreamsRef = useRef<Record<number, MediaStream>>({});
  const conferencePendingIceCandidatesRef = useRef<Record<number, RTCIceCandidateInit[]>>({});
  const conferenceLocalVideoRef = useRef<HTMLVideoElement>(null);
  const conferenceRemoteVideoRef = useRef<HTMLVideoElement>(null);
  const typingStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localTypingActiveRef = useRef(false);
  
  // WebSocket hook for online status
  const { onlineUsers, connected } = useOnlineUsers();
  const emojiList = ['😀', '😂', '😍', '👍', '🙏', '🔥', '🎉', '❤️', '😎', '😢', '😮', '👏'];
  const reactionEmojiList = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👏'];

  // Merge friends list with online status from WebSocket
  const usersWithOnlineStatus = useMemo(() => {
    const onlineUserIds = new Set(onlineUsers.map(u => u.id));
    console.log('🔄 Merging user status:', {
      totalUsers: users.length,
      onlineUsersFromWS: onlineUsers.length,
      onlineUserIds: Array.from(onlineUserIds)
    });
    return users.map(user => ({
      ...user,
      is_online: onlineUserIds.has(user.id)
    }));
  }, [users, onlineUsers]);

  const currentConversationKey = useMemo(() => {
    if (selectedGroupConversationId) return `group:${selectedGroupConversationId}`;
    if (selectedDirectConversationId) return `direct:${selectedDirectConversationId}`;
    if (selectedUser?.id) return `direct-user:${selectedUser.id}`;
    return '';
  }, [selectedGroupConversationId, selectedDirectConversationId, selectedUser?.id]);

  const showToast = useCallback((message: string, tone: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, tone });
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 3000);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem('chat_drafts_v1');
      if (raw) {
        setDraftByConversation(JSON.parse(raw));
      }
    } catch (error) {
      console.error('Failed to parse drafts:', error);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!currentConversationKey) return;
    const savedDraft = draftByConversation[currentConversationKey] || '';
    setMessageContent(savedDraft);
  }, [currentConversationKey, draftByConversation]);

  useEffect(() => {
    if (!messageContent.trim() && mentionSuggestions.length > 0) {
      setMentionSuggestions([]);
      setMentionTokenStart(null);
      setMentionTokenEnd(null);
    }
  }, [messageContent, mentionSuggestions.length]);

  const saveDraft = useCallback((conversationKey: string, content: string) => {
    if (!conversationKey || typeof window === 'undefined') return;
    setDraftByConversation((prev) => {
      const next = { ...prev, [conversationKey]: content };
      if (!content.trim()) {
        delete next[conversationKey];
      }
      localStorage.setItem('chat_drafts_v1', JSON.stringify(next));
      return next;
    });
  }, []);

  const sortedUsersWithOnlineStatus = useMemo(() => {
    const mergedUsers = new Map<number, User>();
    usersWithOnlineStatus.forEach((entry) => {
      mergedUsers.set(entry.id, entry);
    });

    directConversations.forEach((conversation) => {
      const other = conversation.participants?.find((participant) => participant.id !== user?.id);
      if (!other || mergedUsers.has(other.id)) {
        return;
      }
      mergedUsers.set(other.id, {
        id: other.id,
        username: other.username,
        is_online: false,
      });
    });

    const combinedUsers = Array.from(mergedUsers.values());

    const getTimestamp = (value?: string) => {
      if (!value) return 0;
      const ts = new Date(value).getTime();
      return Number.isNaN(ts) ? 0 : ts;
    };

    const directPinByUser = new Map<number, boolean>();
    directConversations.forEach((conversation) => {
      const other = conversation.participants?.find((participant) => participant.id !== user?.id);
      if (other) {
        directPinByUser.set(other.id, !!conversation.is_pinned);
      }
    });

    return combinedUsers.sort((a, b) => {
      const aPinned = directPinByUser.get(a.id) ? 1 : 0;
      const bPinned = directPinByUser.get(b.id) ? 1 : 0;
      if (aPinned !== bPinned) {
        return bPinned - aPinned;
      }

      const aRecent = getTimestamp(recentInteractionByUser[a.id]);
      const bRecent = getTimestamp(recentInteractionByUser[b.id]);

      if (aRecent !== bRecent) {
        return bRecent - aRecent;
      }

      if (a.is_online !== b.is_online) {
        return a.is_online ? -1 : 1;
      }

      return a.username.localeCompare(b.username);
    });
  }, [usersWithOnlineStatus, recentInteractionByUser, directConversations, user?.id]);

  const hiddenDirectUserIds = useMemo(() => {
    const hidden = new Set<number>();
    directConversations.forEach((conversation) => {
      if (!conversation.is_hidden) return;
      const other = conversation.participants?.find((participant) => participant.id !== user?.id);
      if (other) {
        hidden.add(other.id);
      }
    });
    return hidden;
  }, [directConversations, user?.id]);

  const visibleUsers = useMemo(
    () => sortedUsersWithOnlineStatus.filter((u) => !hiddenDirectUserIds.has(u.id)),
    [sortedUsersWithOnlineStatus, hiddenDirectUserIds]
  );

  const hiddenUsers = useMemo(
    () => sortedUsersWithOnlineStatus.filter((u) => hiddenDirectUserIds.has(u.id)),
    [sortedUsersWithOnlineStatus, hiddenDirectUserIds]
  );

  const sortedGroupConversations = useMemo(() => {
    return [...groupConversations].sort((a, b) => {
      if (!!a.is_pinned !== !!b.is_pinned) {
        return a.is_pinned ? -1 : 1;
      }
      const aTs = new Date(a.updated_at || 0).getTime();
      const bTs = new Date(b.updated_at || 0).getTime();
      return bTs - aTs;
    });
  }, [groupConversations]);

  const hiddenGroupConversations = useMemo(
    () => sortedGroupConversations.filter((conversation) => conversation.is_hidden),
    [sortedGroupConversations]
  );

  const visibleGroupConversations = useMemo(
    () => sortedGroupConversations.filter((conversation) => !conversation.is_hidden),
    [sortedGroupConversations]
  );

  useEffect(() => {
    const hasOnlyHiddenDirect = visibleUsers.length === 0 && hiddenUsers.length > 0;
    const hasOnlyHiddenGroups = visibleGroupConversations.length === 0 && hiddenGroupConversations.length > 0;
    if (hasOnlyHiddenDirect || hasOnlyHiddenGroups) {
      setShowHiddenChats(true);
    }
  }, [visibleUsers.length, hiddenUsers.length, visibleGroupConversations.length, hiddenGroupConversations.length]);

  const selectedUserWithStatus = useMemo(() => {
    if (!selectedUser) return null;
    return usersWithOnlineStatus.find((u) => u.id === selectedUser.id) || selectedUser;
  }, [selectedUser, usersWithOnlineStatus]);

  const selectedConversationId = useMemo(
    () => selectedGroupConversationId || selectedDirectConversationId || null,
    [selectedGroupConversationId, selectedDirectConversationId]
  );

  const selectedConversationMeta = useMemo(() => {
    if (selectedGroupConversationId) {
      return groupConversations.find((conversation) => conversation.id === selectedGroupConversationId) || null;
    }
    if (selectedDirectConversationId) {
      return directConversations.find((conversation) => conversation.id === selectedDirectConversationId) || null;
    }
    return null;
  }, [selectedGroupConversationId, selectedDirectConversationId, groupConversations, directConversations]);

  const isConversationLocked = !!(selectedConversationMeta && selectedConversationMeta.is_locked);
  const isLockedForView = !!(
    selectedConversationId
    && isConversationLocked
    && !unlockedConversations[selectedConversationId]
  );

  const mentionCandidates = useMemo(() => {
    const next = new Map<number, { id: number; username: string }>();

    if (selectedGroupConversationId) {
      (selectedConversationMeta?.participants || []).forEach((participant) => {
        if (participant.id !== user?.id) {
          next.set(participant.id, { id: participant.id, username: participant.username });
        }
      });
    } else if (selectedUserWithStatus) {
      next.set(selectedUserWithStatus.id, { id: selectedUserWithStatus.id, username: selectedUserWithStatus.username });
    }

    return Array.from(next.values()).sort((a, b) => a.username.localeCompare(b.username));
  }, [selectedGroupConversationId, selectedConversationMeta?.participants, selectedUserWithStatus, user?.id]);

  useEffect(() => {
    if (!selectedConversationId || !isConversationLocked) {
      setUnlockingConversationId(null);
      setUnlockPassword('');
      setUnlockError('');
      return;
    }

    if (!unlockedConversations[selectedConversationId]) {
      setUnlockingConversationId(selectedConversationId);
    } else {
      setUnlockingConversationId(null);
    }
  }, [selectedConversationId, isConversationLocked, unlockedConversations]);

  // Helper function to get username from sender/receiver
  const getUsername = (person: any): string => {
    if (typeof person === 'string') return person;
    return person?.username || 'Unknown';
  };

  // Handle call ended notification in real-time
  const handleCallEnded = useCallback((callData: any) => {
    console.log('📞 Call ended, updating history:', callData);

    // Update call history with the new call data
    setCallHistory((prev) => {
      // Check if this call already exists in history
      const existingIndex = prev.findIndex((call) => call.id === callData.id);
      if (existingIndex >= 0) {
        // Update existing call
        const updated = [...prev];
        updated[existingIndex] = callData;
        return updated;
      }
      // Add new call to the beginning
      return [callData, ...prev];
    });
  }, []);

  const {
    incomingCall,
    incomingGroupCall,
    rejectCall,
    clearIncomingCall,
    clearIncomingGroupCall,
  } = usePresence(handleCallEnded);
  const {
    localVideoRef: directLocalVideoRef,
    remoteVideoRef: directRemoteVideoRef,
    callStatus,
    isCallActive,
    currentCall,
    audioEnabled,
    videoEnabled,
    isScreenSharing,
    startCall,
    acceptCall,
    endCall,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
  } = useWebRTC();

  const updateConferenceRemoteMedia = useCallback((callType: 'audio' | 'video') => {
    const streams = Object.values(conferenceRemoteStreamsRef.current);

    if (streams.length === 0) {
      if (conferenceRemoteVideoRef.current) {
        conferenceRemoteVideoRef.current.srcObject = null;
      }
      setConferenceCallStatus('Waiting for participants...');
      return;
    }

    if (callType === 'audio') {
      const mixedAudio = new MediaStream();
      streams.forEach((stream) => {
        stream.getAudioTracks().forEach((track) => mixedAudio.addTrack(track));
      });
      const streamToPlay = mixedAudio.getAudioTracks().length > 0 ? mixedAudio : streams[0];
      if (conferenceRemoteVideoRef.current) {
        conferenceRemoteVideoRef.current.srcObject = streamToPlay;
      }
      setConferenceCallStatus('Connected');
      return;
    }

    const remoteVideoStream = streams.find((stream) => stream.getVideoTracks().length > 0) || streams[0];
    if (conferenceRemoteVideoRef.current) {
      conferenceRemoteVideoRef.current.srcObject = remoteVideoStream;
    }
    setConferenceCallStatus('Connected');
  }, []);

  const cleanupConferenceResources = useCallback(() => {
    if (conferenceWsRef.current) {
      conferenceWsRef.current.close();
      conferenceWsRef.current = null;
    }

    Object.values(conferencePeerConnectionsRef.current).forEach((pc) => pc.close());
    conferencePeerConnectionsRef.current = {};
    conferenceRemoteStreamsRef.current = {};
    conferencePendingIceCandidatesRef.current = {};

    if (conferenceLocalStreamRef.current) {
      conferenceLocalStreamRef.current.getTracks().forEach((track) => track.stop());
      conferenceLocalStreamRef.current = null;
    }

    if (conferenceScreenStreamRef.current) {
      conferenceScreenStreamRef.current.getTracks().forEach((track) => track.stop());
      conferenceScreenStreamRef.current = null;
    }
    conferenceCameraTrackRef.current = null;
    conferenceActiveVideoTrackRef.current = null;

    if (conferenceLocalVideoRef.current) {
      conferenceLocalVideoRef.current.srcObject = null;
    }
    if (conferenceRemoteVideoRef.current) {
      conferenceRemoteVideoRef.current.srcObject = null;
    }

    setConferenceCall(null);
    setIsConferenceCallActive(false);
    setConferenceCallStatus('');
    setConferenceAudioEnabled(true);
    setConferenceVideoEnabled(true);
    setConferenceScreenSharing(false);
  }, []);

  const replaceConferenceOutgoingVideoTrack = useCallback(async (nextTrack: MediaStreamTrack | null) => {
    const pcs = Object.values(conferencePeerConnectionsRef.current);
    await Promise.all(
      pcs.map(async (pc) => {
        const sender = pc.getSenders().find((item) => item.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(nextTrack);
        }
      })
    );
  }, []);

  const stopConferenceScreenShare = useCallback(async (restorePreview = true) => {
    if (!conferenceScreenSharing) {
      return;
    }

    const cameraTrack = conferenceCameraTrackRef.current;
    try {
      await replaceConferenceOutgoingVideoTrack(cameraTrack || null);
    } catch (error) {
      console.error('Failed to restore conference camera track:', error);
    }

    if (conferenceScreenStreamRef.current) {
      conferenceScreenStreamRef.current.getTracks().forEach((track) => track.stop());
      conferenceScreenStreamRef.current = null;
    }

    conferenceActiveVideoTrackRef.current = cameraTrack || null;
    if (cameraTrack) {
      cameraTrack.enabled = conferenceVideoEnabled;
    }

    if (restorePreview && conferenceLocalVideoRef.current && conferenceLocalStreamRef.current) {
      conferenceLocalVideoRef.current.srcObject = conferenceLocalStreamRef.current;
    }

    setConferenceScreenSharing(false);
  }, [conferenceScreenSharing, conferenceVideoEnabled, replaceConferenceOutgoingVideoTrack]);

  const removeConferencePeerConnection = useCallback((remoteUserId: number, callType: 'audio' | 'video') => {
    const existing = conferencePeerConnectionsRef.current[remoteUserId];
    if (existing) {
      existing.close();
      delete conferencePeerConnectionsRef.current[remoteUserId];
    }
    delete conferenceRemoteStreamsRef.current[remoteUserId];
    delete conferencePendingIceCandidatesRef.current[remoteUserId];
    updateConferenceRemoteMedia(callType);
  }, [updateConferenceRemoteMedia]);

  const drainConferencePendingIceCandidates = useCallback(async (remoteUserId: number, pc: RTCPeerConnection) => {
    const pending = conferencePendingIceCandidatesRef.current[remoteUserId] || [];
    if (!pending.length) {
      return;
    }

    for (const candidate of pending) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error('Failed adding queued conference ICE candidate:', error);
      }
    }
    delete conferencePendingIceCandidatesRef.current[remoteUserId];
  }, []);

  const getOrCreateConferencePeerConnection = useCallback(
    (remoteUserId: number, callType: 'audio' | 'video', ws: WebSocket) => {
      const existing = conferencePeerConnectionsRef.current[remoteUserId];
      if (existing) {
        return existing;
      }

      const pc = new RTCPeerConnection(rtcConfig);
      conferencePeerConnectionsRef.current[remoteUserId] = pc;

      if (conferenceLocalStreamRef.current) {
        conferenceLocalStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, conferenceLocalStreamRef.current as MediaStream);
        });
      }

      pc.onicecandidate = (event) => {
        if (!event.candidate || ws.readyState !== WebSocket.OPEN) {
          return;
        }

        ws.send(
          JSON.stringify({
            type: 'ice-candidate',
            candidate: event.candidate,
            target_id: remoteUserId,
          })
        );
      };

      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          conferenceRemoteStreamsRef.current[remoteUserId] = event.streams[0];
        } else {
          const fallbackStream = conferenceRemoteStreamsRef.current[remoteUserId] || new MediaStream();
          fallbackStream.addTrack(event.track);
          conferenceRemoteStreamsRef.current[remoteUserId] = fallbackStream;
        }
        updateConferenceRemoteMedia(callType);
      };

      pc.onconnectionstatechange = () => {
        if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
          removeConferencePeerConnection(remoteUserId, callType);
        }
      };

      return pc;
    },
    [removeConferencePeerConnection, updateConferenceRemoteMedia]
  );

  const handleConferenceSignalMessage = useCallback(
    async (data: SignalMessage, conference: ConferenceCall, ws: WebSocket) => {
      const selfUserId = user?.id;
      if (!selfUserId) {
        return;
      }

      switch (data.type) {
        case 'user-joined': {
          if (!data.user_id || data.user_id === selfUserId) {
            return;
          }

          const pc = getOrCreateConferencePeerConnection(data.user_id, conference.call_type, ws);
          const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: conference.call_type === 'video',
          });
          await pc.setLocalDescription(offer);

          ws.send(
            JSON.stringify({
              type: 'call-offer',
              offer,
              call_type: conference.call_type,
              target_id: data.user_id,
            })
          );
          break;
        }

        case 'call-offer': {
          const senderId = data.sender_id;
          if (!senderId || senderId === selfUserId || !data.offer) {
            return;
          }
          if (data.target_id && data.target_id !== selfUserId) {
            return;
          }

          const pc = getOrCreateConferencePeerConnection(senderId, conference.call_type, ws);
          await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
          await drainConferencePendingIceCandidates(senderId, pc);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          ws.send(
            JSON.stringify({
              type: 'call-answer',
              answer,
              target_id: senderId,
            })
          );
          break;
        }

        case 'call-answer': {
          const senderId = data.sender_id;
          if (!senderId || senderId === selfUserId || !data.answer) {
            return;
          }
          if (data.target_id && data.target_id !== selfUserId) {
            return;
          }

          const pc = conferencePeerConnectionsRef.current[senderId];
          if (!pc) {
            return;
          }

          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          await drainConferencePendingIceCandidates(senderId, pc);
          break;
        }

        case 'ice-candidate': {
          const senderId = data.sender_id;
          if (!senderId || senderId === selfUserId || !data.candidate) {
            return;
          }
          if (data.target_id && data.target_id !== selfUserId) {
            return;
          }

          const pc = conferencePeerConnectionsRef.current[senderId];
          if (!pc || !pc.remoteDescription) {
            if (!conferencePendingIceCandidatesRef.current[senderId]) {
              conferencePendingIceCandidatesRef.current[senderId] = [];
            }
            conferencePendingIceCandidatesRef.current[senderId].push(data.candidate);
            return;
          }

          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          break;
        }

        case 'user-left': {
          if (!data.user_id || data.user_id === selfUserId) {
            return;
          }
          removeConferencePeerConnection(data.user_id, conference.call_type);
          break;
        }

        case 'call-end': {
          if (data.sender_id && data.sender_id !== selfUserId) {
            setConferenceCallStatus('A participant ended the call');
          }
          break;
        }

        default:
          break;
      }
    },
    [
      drainConferencePendingIceCandidates,
      getOrCreateConferencePeerConnection,
      removeConferencePeerConnection,
      user?.id,
    ]
  );

  const initializeConferenceCall = useCallback(async (conference: ConferenceCall) => {
    cleanupConferenceResources();
    setConferenceCall(conference);
    setIsConferenceCallActive(true);

    const localMedia = await navigator.mediaDevices.getUserMedia({
      video: conference.call_type === 'video',
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    conferenceLocalStreamRef.current = localMedia;
    conferenceCameraTrackRef.current = localMedia.getVideoTracks()[0] || null;
    conferenceActiveVideoTrackRef.current = localMedia.getVideoTracks()[0] || null;
    setConferenceAudioEnabled(true);
    setConferenceVideoEnabled(conference.call_type === 'video');
    setConferenceScreenSharing(false);

    if (conferenceLocalVideoRef.current) {
      conferenceLocalVideoRef.current.srcObject = localMedia;
    }

    const token = Cookies.get('access_token');
    const ws = new WebSocket(`${WS_BASE}/call/${conference.room_id}/?token=${token}`);
    conferenceWsRef.current = ws;
    setConferenceCallStatus('Connecting...');

    ws.onopen = () => {
      setConferenceCallStatus('Waiting for participants...');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as SignalMessage;
        handleConferenceSignalMessage(data, conference, ws).catch((error) => {
          console.error('Error handling conference signal:', error);
        });
      } catch (error) {
        console.error('Invalid conference socket payload:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('Conference socket error:', error);
      setConferenceCallStatus('Connection error');
    };

    ws.onclose = () => {
      setConferenceCallStatus('Disconnected');
    };
  }, [cleanupConferenceResources, handleConferenceSignalMessage]);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, loading, router]);

  useEffect(() => {
    if (isAuthenticated) {
      loadUserSettings();
      loadUsers();
      loadGroupConversations();
      loadRecentInteractions();
    }
  }, [isAuthenticated]);

  const loadUserSettings = async () => {
    try {
      const response = await api.get('/users/settings/');
      const hours = Number(response.data?.default_message_expiration_hours || 24);
      setDefaultExpirationHours(hours);
      setMessageExpirationHours(hours);
    } catch (error) {
      console.error('Failed to load user settings:', error);
    }
  };

  useEffect(() => {
    if (!router.isReady || !isAuthenticated) return;

    const conversationParam = router.query.conversation;
    if (conversationParam) {
      const conversationId = Number(conversationParam);
      if (!Number.isNaN(conversationId)) {
        setSelectedUser(null);
        setSelectedGroupConversationId(conversationId);
        loadConversationMeta(conversationId);
        loadMessagesByConversation(conversationId);
      }
      return;
    }

    // Reset group mode if no conversation query is present.
    setSelectedGroupConversationId(null);
    setSelectedGroupName('');
    setSelectedGroupParticipantIds([]);
  }, [router.isReady, router.query.conversation, isAuthenticated]);

  useEffect(() => {
    if (selectedGroupConversationId) {
      setCallHistory([]);
      connectGroupWebSocket(selectedGroupConversationId);
      return;
    }

    const selectedUserId = selectedUser?.id;
    if (selectedUserId) {
      loadMessages(selectedUserId);
      loadCallHistory(selectedUserId);
      connectWebSocket(selectedUserId);
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [selectedUser?.id, selectedGroupConversationId]);

  useEffect(() => {
    if (selectedGroupConversationId) {
      loadMessagesByConversation(selectedGroupConversationId);
      return;
    }
    if (selectedUser?.id) {
      loadMessages(selectedUser.id);
    }
  }, [searchTerm, messageFilter]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadUsers = async () => {
    try {
      // Load all users for IMCS (not just friends)
      const response = await api.get('/users/');
      const allUsers = response.data.results || response.data;
      // Filter out current user
      const otherUsers = allUsers.filter((u: User) => u.id !== user?.id);
      setUsers(otherUsers);
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  };

  const loadGroupConversations = async () => {
    try {
      const response = await api.get('/conversations/?include_hidden=true');
      const conversations: ConversationSummary[] = response.data.results || response.data || [];
      const directs = conversations
        .filter((conversation) => conversation.conversation_type === 'direct');
      const groups = conversations
        .filter((conversation) => conversation.conversation_type === 'group')
        .sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime());
      setDirectConversations(directs);
      setGroupConversations(groups);
    } catch (error) {
      console.error('Failed to load groups:', error);
      setDirectConversations([]);
      setGroupConversations([]);
    }
  };

  const openGroupConversation = (conversation: ConversationSummary) => {
    setSelectedUser(null);
    setSelectedDirectConversationId(null);
    setSelectedGroupConversationId(conversation.id);
    setSelectedGroupName(conversation.name || `Group ${conversation.id}`);
    const participantIds = (conversation.participants || [])
      .map((participant) => participant.id)
      .filter((id) => id !== user?.id);
    setSelectedGroupParticipantIds(participantIds);
    setShowGroupActionsMenu(false);
    loadMessagesByConversation(conversation.id);
    router.replace(`/messages?conversation=${conversation.id}`, undefined, { shallow: true });
  };

  const openDirectConversation = (targetUser: User) => {
    setSelectedGroupConversationId(null);
    setSelectedGroupName('');
    setSelectedGroupParticipantIds([]);
    setSelectedUser(targetUser);
    const existingConversation = directConversations.find((conversation) =>
      (conversation.participants || []).some((participant) => participant.id === targetUser.id)
    );
    setSelectedDirectConversationId(existingConversation?.id || null);
    router.replace('/messages', undefined, { shallow: true });
  };

  const toggleNewGroupMember = (memberId: number) => {
    setNewGroupMemberIds((prev) => {
      if (prev.includes(memberId)) {
        return prev.filter((id) => id !== memberId);
      }
      return [...prev, memberId];
    });
  };

  const createGroupConversation = async () => {
    if (newGroupMemberIds.length === 0 || creatingGroup) {
      return;
    }

    try {
      setCreatingGroup(true);
      const payload: Record<string, any> = {
        conversation_type: 'group',
        participant_ids: newGroupMemberIds,
      };

      if (newGroupName.trim()) {
        payload.name = newGroupName.trim();
      }

      const response = await api.post('/conversations/', payload);
      const created: ConversationSummary = response.data;

      setShowCreateGroupModal(false);
      setNewGroupName('');
      setNewGroupMemberIds([]);

      await loadGroupConversations();
      openGroupConversation(created);
    } catch (error) {
      console.error('Failed to create group:', error);
      alert('Failed to create group');
    } finally {
      setCreatingGroup(false);
    }
  };

  const loadMessages = async (userId: number) => {
    setLoadingMessages(true);
    try {
      const queryParts = [`other_user=${userId}`];
      if (searchTerm.trim()) {
        queryParts.push(`q=${encodeURIComponent(searchTerm.trim())}`);
      }
      if (messageFilter === 'pinned') queryParts.push('pinned=true');
      if (messageFilter === 'polls') queryParts.push('has_poll=true');
      if (messageFilter === 'mentions') queryParts.push('mentioned=true');

      const response = await api.get(`/messages/?${queryParts.join('&')}`);
      const fetchedMessages: Message[] = response.data.results || response.data;
      setMessages(fetchedMessages);
      const conversationId = fetchedMessages[0]?.conversation;
      if (conversationId) {
        setSelectedDirectConversationId(conversationId);
      }
      void markVisibleMessagesAsRead(fetchedMessages);
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setLoadingMessages(false);
    }
  };

  const loadConversationMeta = async (conversationId: number) => {
    try {
      const response = await api.get(`/conversations/${conversationId}/`);
      const data = response.data;
      setSelectedGroupName(data.name || `Group ${conversationId}`);
      const participants = (data.participants || [])
        .map((participant: any) => participant.id)
        .filter((id: number) => id !== user?.id);
      setSelectedGroupParticipantIds(participants);
    } catch (error) {
      console.error('Failed to load conversation metadata:', error);
      setSelectedGroupName(`Group ${conversationId}`);
      setSelectedGroupParticipantIds([]);
    }
  };

  const startGroupCall = async (callType: 'audio' | 'video') => {
    if (!selectedGroupConversationId) return;

    try {
      setStartingGroupCall(true);
      const response = await api.post('/conference-calls/', {
        title: selectedGroupName || `Group ${selectedGroupConversationId} Call`,
        call_type: callType,
        conversation_id: selectedGroupConversationId,
        participant_ids: selectedGroupParticipantIds,
      });

      setShowGroupCallModal(false);
      await api.post(`/conference-calls/${response.data.id}/join/`);
      await initializeConferenceCall(response.data as ConferenceCall);
    } catch (error) {
      console.error(`Failed to start ${callType} group call:`, error);
      alert(`Failed to start ${callType} group call`);
    } finally {
      setStartingGroupCall(false);
    }
  };

  const openGroupCallModal = (callType: 'audio' | 'video') => {
    setGroupCallType(callType);
    setShowGroupActionsMenu(false);
    setShowGroupCallModal(true);
  };

  const openRenameGroupModal = () => {
    setNewGroupTitle(selectedGroupName || '');
    setShowGroupActionsMenu(false);
    setShowRenameGroupModal(true);
  };

  const handleRenameGroup = async () => {
    if (!selectedGroupConversationId || !newGroupTitle.trim() || renamingGroup) {
      return;
    }

    try {
      setRenamingGroup(true);
      await api.patch(`/conversations/${selectedGroupConversationId}/`, {
        name: newGroupTitle.trim(),
      });

      setSelectedGroupName(newGroupTitle.trim());
      setShowRenameGroupModal(false);
      await loadGroupConversations();
    } catch (error) {
      console.error('Failed to rename group:', error);
      alert('Failed to rename group');
    } finally {
      setRenamingGroup(false);
    }
  };

  const handleLeaveGroup = async () => {
    if (!selectedGroupConversationId || !user?.id) {
      return;
    }

    try {
      await api.post(`/conversations/${selectedGroupConversationId}/remove_participant/`, {
        user_id: user.id,
      });

      setShowGroupActionsMenu(false);
      setSelectedGroupConversationId(null);
      setSelectedGroupName('');
      setSelectedGroupParticipantIds([]);
      setMessages([]);
      await loadGroupConversations();
      router.replace('/messages', undefined, { shallow: true });
    } catch (error) {
      console.error('Failed to leave group:', error);
      alert('Failed to leave group');
    }
  };

  const loadMessagesByConversation = async (conversationId: number) => {
    setLoadingMessages(true);
    try {
      const queryParts = [`conversation=${conversationId}`];
      if (searchTerm.trim()) {
        queryParts.push(`q=${encodeURIComponent(searchTerm.trim())}`);
      }
      if (messageFilter === 'pinned') queryParts.push('pinned=true');
      if (messageFilter === 'polls') queryParts.push('has_poll=true');
      if (messageFilter === 'mentions') queryParts.push('mentioned=true');

      const response = await api.get(`/messages/?${queryParts.join('&')}`);
      const fetchedMessages: Message[] = response.data.results || response.data;
      setMessages(fetchedMessages);
      void markVisibleMessagesAsRead(fetchedMessages);
      setCallHistory([]);
    } catch (error) {
      console.error('Failed to load group messages:', error);
    } finally {
      setLoadingMessages(false);
    }
  };

  const loadCallHistory = async (userId: number) => {
    try {
      const response = await api.get(`/calls/history/?other_user=${userId}`);
      const data = response.data.results || response.data;
      setCallHistory(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load call history:', error);
      setCallHistory([]);
    }
  };

  const markVisibleMessagesAsRead = async (messageItems: Message[]) => {
    if (!user?.id) {
      return;
    }

    const unreadIds = messageItems
      .filter((message) => {
        const senderId = typeof message.sender === 'string' ? undefined : message.sender?.id;
        if (!senderId || senderId === user.id) {
          return false;
        }

        const myReceipt = (message.receipts || []).find((receipt) => receipt.user?.id === user.id);
        return !myReceipt || myReceipt.status !== 'read';
      })
      .map((message) => message.id);

    if (!unreadIds.length) {
      return;
    }

    await Promise.allSettled(unreadIds.map((id) => api.post(`/messages/${id}/mark_read/`)));
  };

  const connectWebSocket = (userId: number) => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const token = Cookies.get('access_token');
    const wsUrl = `${process.env.NEXT_PUBLIC_WS_BASE || 'ws://localhost:8001/ws'}/chat/${userId}/?token=${token}`;
    
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'chat_message') {
        setMessages((prev) => {
          const incomingId = data?.message?.id;
          if (incomingId && prev.some((m) => m.id === incomingId)) {
            return prev;
          }
          return [...prev, data.message];
        });

        const message = data.message;
        const senderId = typeof message?.sender === 'string' ? undefined : message?.sender?.id;
        if (senderId && senderId !== user?.id && message?.id) {
          api.post(`/messages/${message.id}/mark_delivered/`).catch(() => undefined);
          api.post(`/messages/${message.id}/mark_read/`).catch(() => undefined);
        }

        const receiverId = typeof message?.receiver === 'string' ? undefined : message?.receiver?.id;
        const counterpartId = senderId === user?.id ? receiverId : senderId;
        const timestamp = message?.created_at || message?.sent_at || new Date().toISOString();
        if (counterpartId) {
          updateRecentInteraction(counterpartId, timestamp);
        }
      } else if (data.type === 'message-reaction') {
        setMessages((prev) => prev.map((message) => {
          if (message.id !== data.message_id) {
            return message;
          }
          return {
            ...message,
            reactions: data.reactions || [],
          };
        }));
      } else if (data.type === 'typing') {
        if (data.user_id === user?.id) {
          return;
        }
        const conversationKey = `direct:${userId}`;
        setTypingByConversation((prev) => {
          const next = { ...prev };
          if (data.is_typing) {
            next[conversationKey] = data.username || 'Someone';
          } else {
            delete next[conversationKey];
          }
          return next;
        });
      } else if (data.type === 'message-receipt-update') {
        setMessages((prev) => prev.map((message) => {
          if (message.id !== data.message_id) {
            return message;
          }

          const existingReceipts = message.receipts || [];
          const receiptIndex = existingReceipts.findIndex((receipt) => receipt.user?.id === data.user_id);
          const nextReceipt = {
            user: { id: data.user_id },
            status: data.status,
            delivered_at: data.delivered_at || undefined,
            read_at: data.read_at || undefined,
          };

          const nextReceipts = [...existingReceipts];
          if (receiptIndex >= 0) {
            nextReceipts[receiptIndex] = { ...nextReceipts[receiptIndex], ...nextReceipt };
          } else {
            nextReceipts.push(nextReceipt);
          }

          return {
            ...message,
            receipts: nextReceipts,
          };
        }));
      } else if (data.type === 'message-update') {
        if (!data.payload) return;

        // For poll votes, fetch the updated message to get the correct user-specific data
        if (data.action === 'poll_vote') {
          api.get(`/messages/${data.message_id}/`).then((response) => {
            setMessages((prev) => {
              const idx = prev.findIndex((message) => message.id === data.message_id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = response.data;
                return next;
              }
              return prev;
            });
          }).catch((error) => {
            console.error('Failed to fetch updated message:', error);
          });
        } else {
          // For other updates (edit, pin, etc.), use the payload directly
          setMessages((prev) => {
            const idx = prev.findIndex((message) => message.id === data.message_id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = data.payload;
              return next;
            }
            return [...prev, data.payload];
          });
        }
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

  const connectGroupWebSocket = (conversationId: number) => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const token = Cookies.get('access_token');
    const wsUrl = `${process.env.NEXT_PUBLIC_WS_BASE || 'ws://localhost:8001/ws'}/group/${conversationId}/?token=${token}`;

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('Group WebSocket connected');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'group_message' || data.type === 'message') {
        const incomingMessage: Message = {
          id: data.message_id,
          sender: {
            id: data.sender_id,
            username: data.sender_username || 'Unknown',
          },
          receiver: '',
          content: data.content,
          is_read: false,
          sent_at: data.created_at,
        };

        setMessages((prev) => {
          if (incomingMessage.id && prev.some((m) => m.id === incomingMessage.id)) {
            return prev;
          }
          return [...prev, incomingMessage];
        });

        if (incomingMessage.sender && typeof incomingMessage.sender !== 'string' && incomingMessage.sender.id !== user?.id && incomingMessage.id) {
          api.post(`/messages/${incomingMessage.id}/mark_delivered/`).catch(() => undefined);
          api.post(`/messages/${incomingMessage.id}/mark_read/`).catch(() => undefined);
        }
      } else if (data.type === 'message-reaction') {
        setMessages((prev) => prev.map((message) => {
          if (message.id !== data.message_id) {
            return message;
          }
          return {
            ...message,
            reactions: data.reactions || [],
          };
        }));
      } else if (data.type === 'typing') {
        if (data.user_id === user?.id) {
          return;
        }
        const conversationKey = `group:${conversationId}`;
        setTypingByConversation((prev) => {
          const next = { ...prev };
          if (data.is_typing) {
            next[conversationKey] = data.username || 'Someone';
          } else {
            delete next[conversationKey];
          }
          return next;
        });
      } else if (data.type === 'message-receipt-update') {
        setMessages((prev) => prev.map((message) => {
          if (message.id !== data.message_id) {
            return message;
          }

          const existingReceipts = message.receipts || [];
          const receiptIndex = existingReceipts.findIndex((receipt) => receipt.user?.id === data.user_id);
          const nextReceipt = {
            user: { id: data.user_id },
            status: data.status,
            delivered_at: data.delivered_at || undefined,
            read_at: data.read_at || undefined,
          };

          const nextReceipts = [...existingReceipts];
          if (receiptIndex >= 0) {
            nextReceipts[receiptIndex] = { ...nextReceipts[receiptIndex], ...nextReceipt };
          } else {
            nextReceipts.push(nextReceipt);
          }

          return {
            ...message,
            receipts: nextReceipts,
          };
        }));
      } else if (data.type === 'message-update') {
        if (!data.payload) return;

        // For poll votes, fetch the updated message to get the correct user-specific data
        if (data.action === 'poll_vote') {
          api.get(`/messages/${data.message_id}/`).then((response) => {
            setMessages((prev) => {
              const idx = prev.findIndex((message) => message.id === data.message_id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = response.data;
                return next;
              }
              return prev;
            });
          }).catch((error) => {
            console.error('Failed to fetch updated message:', error);
          });
        } else {
          // For other updates (edit, pin, etc.), use the payload directly
          setMessages((prev) => {
            const idx = prev.findIndex((message) => message.id === data.message_id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = data.payload;
              return next;
            }
            return [...prev, data.payload];
          });
        }
      }
    };

    ws.onerror = (error) => {
      console.error('Group WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('Group WebSocket disconnected');
    };

    wsRef.current = ws;
  };

  const buildAttachmentContent = (fileUrl: string, fileName: string, mimeType: string) => {
    return `[ATTACHMENT]${fileName}|${fileUrl}|${mimeType}`;
  };

  const getBackendOrigin = () => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api';
    return apiBase.replace(/\/api\/?$/, '');
  };

  const resolveAttachmentUrl = (fileUrl: string) => {
    if (!fileUrl) return fileUrl;
    if (/^https?:\/\//i.test(fileUrl)) return fileUrl;

    const normalizedPath = fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`;
    return `${getBackendOrigin()}${normalizedPath}`;
  };

  const parseAttachmentContent = (content: string) => {
    if (!content.startsWith('[ATTACHMENT]')) {
      return null;
    }

    const payload = content.replace('[ATTACHMENT]', '');
    const [fileName, fileUrl, mimeType] = payload.split('|');
    if (!fileName || !fileUrl) {
      return null;
    }

    const resolvedUrl = resolveAttachmentUrl(fileUrl);
    const lowerName = fileName.toLowerCase();
    const hasImageExtension = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(lowerName);
    const isImageMime = (mimeType || '').startsWith('image/');

    return {
      fileName,
      fileUrl: resolvedUrl,
      mimeType: mimeType || 'application/octet-stream',
      isImage: isImageMime || hasImageExtension,
    };
  };

  const parseCallEventContent = (content: string) => {
    if (!content.startsWith('[CALL_EVENT]')) {
      return null;
    }

    const payload = content.replace('[CALL_EVENT]', '');
    const [username, eventText, conferenceId, callType] = payload.split('|');
    if (!username || !eventText) {
      return null;
    }

    return {
      username,
      eventText,
      conferenceId: conferenceId || '',
      callType: callType === 'audio' ? 'audio' : 'video',
    };
  };

  const renderMessageWithMentions = (content: string, isOwn: boolean) => {
    const mentionRegex = /(^|\s)(@[A-Za-z0-9_.-]+)/g;
    const parts: Array<{ text: string; isMention: boolean }> = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = mentionRegex.exec(content)) !== null) {
      const start = match.index;
      const mention = match[2];

      if (start > lastIndex) {
        parts.push({ text: content.slice(lastIndex, start + match[1].length), isMention: false });
      }

      parts.push({ text: mention, isMention: true });
      lastIndex = start + match[0].length;
    }

    if (lastIndex < content.length) {
      parts.push({ text: content.slice(lastIndex), isMention: false });
    }

    if (!parts.length) {
      return <span>{content}</span>;
    }

    return (
      <>
        {parts.map((part, index) => (
          <span
            key={`${part.text}-${index}`}
            className={part.isMention ? (isOwn ? 'font-semibold text-yellow-200' : 'font-semibold text-indigo-700') : ''}
          >
            {part.text}
          </span>
        ))}
      </>
    );
  };

  const detectFileType = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.includes('pdf')) return 'pdf';
    if (
      mimeType.includes('word')
      || mimeType.includes('excel')
      || mimeType.includes('sheet')
      || mimeType.includes('text')
      || mimeType.includes('document')
    ) {
      return 'document';
    }
    return 'other';
  };

  const sendAttachmentMessage = async (content: string) => {
    if (selectedGroupConversationId) {
      const shouldUseRest = messageExpirationHours !== defaultExpirationHours;
      if (!shouldUseRest && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'message',
          content,
        }));
        return;
      }

      const response = await api.post('/messages/', {
        conversation: selectedGroupConversationId,
        content,
        expiration_hours: messageExpirationHours,
      });
      setMessages((prev) => [...prev, response.data]);
      saveDraft(currentConversationKey, '');
      return;
    }

    if (!selectedUserWithStatus) {
      throw new Error('No selected user');
    }

    const shouldUseRest = messageExpirationHours !== defaultExpirationHours;
    if (!shouldUseRest && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'message',
        content,
      }));
      updateRecentInteraction(selectedUserWithStatus.id, new Date().toISOString());
      return;
    }

    const response = await api.post('/messages/', {
      receiver: selectedUserWithStatus.id,
      content,
      expiration_hours: messageExpirationHours,
    });
    setMessages((prev) => [...prev, response.data]);
    if (response.data?.conversation) {
      setSelectedDirectConversationId(response.data.conversation);
    }
    saveDraft(currentConversationKey, '');
    updateRecentInteraction(
      selectedUserWithStatus.id,
      response.data?.sent_at || response.data?.created_at || new Date().toISOString()
    );
  };

  const handleSelectAttachment = () => {
    fileInputRef.current?.click();
  };

  const handleAttachmentChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';

    if (!file) return;
    if (!selectedUserWithStatus && !selectedGroupConversationId) {
      alert('Please select a conversation first');
      return;
    }

    try {
      setUploadingAttachment(true);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', file.name);
      formData.append('mime_type', file.type || 'application/octet-stream');
      formData.append('file_type', detectFileType(file.type || 'application/octet-stream'));

      if (selectedGroupConversationId) {
        formData.append('conversation', String(selectedGroupConversationId));
        selectedGroupParticipantIds.forEach((id) => {
          formData.append('recipient_ids', String(id));
        });
      } else if (selectedUserWithStatus) {
        formData.append('recipient_ids', String(selectedUserWithStatus.id));
      }

      const uploadResponse = await api.post('/files/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const uploaded = uploadResponse.data;
      const rawUrl = uploaded.file_url || uploaded.file;
      const absoluteUrl = resolveAttachmentUrl(rawUrl);
      const attachmentContent = buildAttachmentContent(
        absoluteUrl,
        uploaded.name || file.name,
        uploaded.mime_type || file.type || 'application/octet-stream'
      );

      await sendAttachmentMessage(attachmentContent);
    } catch (error) {
      console.error('Failed to upload/send attachment:', error);
      alert('Failed to send attachment');
    } finally {
      setUploadingAttachment(false);
    }
  };

  const reactToMessage = async (messageId: number, emoji: string) => {
    try {
      const response = await api.post(`/messages/${messageId}/react/`, { emoji });
      const updatedReactions = response.data?.reactions || [];

      setMessages((prev) => prev.map((message) => {
        if (message.id !== messageId) {
          return message;
        }
        return {
          ...message,
          reactions: updatedReactions,
        };
      }));
      setReactionPickerForMessageId(null);
    } catch (error) {
      console.error('Failed to react to message:', error);
      alert('Failed to add reaction');
    }
  };

  const appendEmoji = (emoji: string) => {
    setMessageContent((prev) => `${prev}${emoji}`);
  };

  const emitTypingState = useCallback((isTyping: boolean) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    wsRef.current.send(JSON.stringify({
      type: 'typing',
      is_typing: isTyping,
    }));
  }, []);

  const updateMentionSuggestions = (value: string, caretPosition: number) => {
    const beforeCaret = value.slice(0, caretPosition);
    const match = beforeCaret.match(/(?:^|\s)@([A-Za-z0-9_.-]*)$/);
    if (!match) {
      setMentionSuggestions([]);
      setMentionTokenStart(null);
      setMentionTokenEnd(null);
      return;
    }

    const query = (match[1] || '').toLowerCase();
    const atIndex = beforeCaret.lastIndexOf('@');
    const suggestions = mentionCandidates.filter((candidate) => candidate.username.toLowerCase().startsWith(query));
    setMentionSuggestions(suggestions.slice(0, 6));
    setMentionTokenStart(atIndex);
    setMentionTokenEnd(caretPosition);
  };

  const insertMention = (username: string) => {
    if (mentionTokenStart === null || mentionTokenEnd === null) {
      return;
    }

    const nextValue = `${messageContent.slice(0, mentionTokenStart)}@${username} ${messageContent.slice(mentionTokenEnd)}`;
    const nextCaret = mentionTokenStart + username.length + 2;

    setMessageContent(nextValue);
    saveDraft(currentConversationKey, nextValue);
    setMentionSuggestions([]);
    setMentionTokenStart(null);
    setMentionTokenEnd(null);

    requestAnimationFrame(() => {
      if (messageInputRef.current) {
        messageInputRef.current.focus();
        messageInputRef.current.setSelectionRange(nextCaret, nextCaret);
      }
    });
  };

  const handleMessageInputChange = (value: string, caretPosition?: number) => {
    setMessageContent(value);
    saveDraft(currentConversationKey, value);
    updateMentionSuggestions(value, caretPosition ?? value.length);

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    const hasText = value.trim().length > 0;
    if (hasText && !localTypingActiveRef.current) {
      emitTypingState(true);
      localTypingActiveRef.current = true;
    }

    if (typingStopTimeoutRef.current) {
      clearTimeout(typingStopTimeoutRef.current);
    }

    typingStopTimeoutRef.current = setTimeout(() => {
      if (localTypingActiveRef.current) {
        emitTypingState(false);
        localTypingActiveRef.current = false;
      }
    }, 1200);

    if (!hasText && localTypingActiveRef.current) {
      emitTypingState(false);
      localTypingActiveRef.current = false;
    }
  };

  const handleMessageInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (mentionSuggestions.length === 0) {
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      insertMention(mentionSuggestions[0].username);
      return;
    }

    if (e.key === 'Escape') {
      setMentionSuggestions([]);
      setMentionTokenStart(null);
      setMentionTokenEnd(null);
    }
  };

  useEffect(() => {
    if (localTypingActiveRef.current) {
      emitTypingState(false);
      localTypingActiveRef.current = false;
    }
    if (typingStopTimeoutRef.current) {
      clearTimeout(typingStopTimeoutRef.current);
      typingStopTimeoutRef.current = null;
    }
  }, [emitTypingState, selectedGroupConversationId, selectedUser?.id]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageContent.trim()) return;

    if (selectedGroupConversationId) {
      try {
        const shouldUseRest = messageExpirationHours !== defaultExpirationHours;
        if (!shouldUseRest && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'message',
            content: messageContent,
          }));
          setMessageContent('');
          saveDraft(currentConversationKey, '');
          if (localTypingActiveRef.current) {
            emitTypingState(false);
            localTypingActiveRef.current = false;
          }
          return;
        }

        const response = await api.post('/messages/', {
          conversation: selectedGroupConversationId,
          content: messageContent,
          expiration_hours: messageExpirationHours,
        });
        setMessages((prev) => [...prev, response.data]);
        setMessageContent('');
        saveDraft(currentConversationKey, '');
        if (localTypingActiveRef.current) {
          emitTypingState(false);
          localTypingActiveRef.current = false;
        }
      } catch (error) {
        console.error('Failed to send group message:', error);
        alert('Failed to send message');
      }
      return;
    }

    if (!selectedUserWithStatus) return;

    try {
      const shouldUseRest = messageExpirationHours !== defaultExpirationHours;
      if (!shouldUseRest && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'message',
          content: messageContent,
        }));
        setMessageContent('');
        saveDraft(currentConversationKey, '');
        if (localTypingActiveRef.current) {
          emitTypingState(false);
          localTypingActiveRef.current = false;
        }
        updateRecentInteraction(selectedUserWithStatus.id, new Date().toISOString());
      } else {
        // Fallback to REST API
        const response = await api.post('/messages/', {
          receiver: selectedUserWithStatus.id,
          content: messageContent,
          expiration_hours: messageExpirationHours,
        });
        setMessages((prev) => [...prev, response.data]);
        if (response.data?.conversation) {
          setSelectedDirectConversationId(response.data.conversation);
        }
        setMessageContent('');
        saveDraft(currentConversationKey, '');
        if (localTypingActiveRef.current) {
          emitTypingState(false);
          localTypingActiveRef.current = false;
        }
        updateRecentInteraction(
          selectedUserWithStatus.id,
          response.data?.sent_at || response.data?.created_at || new Date().toISOString()
        );
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      alert('Failed to send message');
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const updateRecentInteraction = (userId: number, timestamp: string) => {
    setRecentInteractionByUser((prev) => {
      const existing = prev[userId];
      if (!existing || new Date(timestamp).getTime() > new Date(existing).getTime()) {
        return { ...prev, [userId]: timestamp };
      }
      return prev;
    });
  };

  const getDeliveryStatusLabel = (message: Message) => {
    const senderId = typeof message.sender === 'string' ? undefined : message.sender?.id;
    if (!senderId || senderId !== user?.id) {
      return '';
    }

    const receipts = message.receipts || [];
    if (!receipts.length) {
      return 'sent';
    }

    if (selectedGroupConversationId) {
      const readCount = receipts.filter((receipt) => receipt.status === 'read').length;
      const deliveredCount = receipts.filter((receipt) => ['delivered', 'read'].includes(receipt.status)).length;
      if (readCount > 0) {
        return `read ${readCount}/${receipts.length}`;
      }
      if (deliveredCount > 0) {
        return `delivered ${deliveredCount}/${receipts.length}`;
      }
      return 'sent';
    }

    const status = receipts[0]?.status;
    if (status === 'read') return 'read';
    if (status === 'delivered') return 'delivered';
    return 'sent';
  };

  const resolveActiveConversationId = async () => {
    let conversationId = selectedGroupConversationId || selectedDirectConversationId;
    if (!conversationId && selectedUserWithStatus) {
      try {
        const response = await api.get(`/conversations/direct_with/?user_id=${selectedUserWithStatus.id}`);
        conversationId = response.data?.id || response.data?.conversation?.id || null;
        if (conversationId) {
          setSelectedDirectConversationId(conversationId);
        }
      } catch (error) {
        console.error('Failed to resolve direct conversation:', error);
      }
    }
    return conversationId;
  };

  const toggleConversationPin = async () => {
    const conversationId = await resolveActiveConversationId();
    if (!conversationId) return;

    const inGroups = !!selectedGroupConversationId;
    const source = inGroups ? groupConversations : directConversations;
    const target = source.find((conversation) => conversation.id === conversationId);
    const nextPinned = !target?.is_pinned;

    try {
      await api.post(`/conversations/${conversationId}/pin/`, { is_pinned: nextPinned });
      await loadGroupConversations();
    } catch (error) {
      console.error('Failed to pin conversation:', error);
      alert('Failed to pin conversation');
    }
  };

  const toggleConversationHidden = async () => {
    const conversationId = await resolveActiveConversationId();
    if (!conversationId) return;

    const inGroups = !!selectedGroupConversationId;
    const source = inGroups ? groupConversations : directConversations;
    const target = source.find((conversation) => conversation.id === conversationId);
    const nextHidden = !target?.is_hidden;

    try {
      await api.post(`/conversations/${conversationId}/hide/`, { is_hidden: nextHidden });
      await loadGroupConversations();
      showToast(nextHidden ? 'Chat hidden' : 'Chat unhidden', 'success');
      if (nextHidden) {
        setSelectedGroupConversationId(null);
        setSelectedGroupName('');
        setSelectedGroupParticipantIds([]);
        setSelectedUser(null);
        setSelectedDirectConversationId(null);
        setMessages([]);
        router.replace('/messages', undefined, { shallow: true });
      }
    } catch (error) {
      console.error('Failed to hide conversation:', error);
      showToast('Failed to update hidden chat', 'error');
    }
  };

  const toggleConversationLock = async () => {
    const conversationId = await resolveActiveConversationId();
    if (!conversationId) return;

    const inGroups = !!selectedGroupConversationId;
    const source = inGroups ? groupConversations : directConversations;
    const target = source.find((conversation) => conversation.id === conversationId);
    const nextLocked = !target?.is_locked;

    try {
      await api.post(`/conversations/${conversationId}/lock/`, { is_locked: nextLocked });
      await loadGroupConversations();
      showToast(nextLocked ? 'Chat locked' : 'Chat unlocked', 'success');
      setUnlockedConversations((prev) => {
        const next = { ...prev };
        if (nextLocked) {
          delete next[conversationId];
        } else {
          next[conversationId] = true;
        }
        return next;
      });
    } catch (error) {
      console.error('Failed to lock conversation:', error);
      showToast('Failed to update chat lock', 'error');
    }
  };

  const toggleMessagePin = async (message: Message) => {
    try {
      await api.post(`/messages/${message.id}/pin/`, {
        is_pinned: !message.is_pinned,
      });
      setMessages((prev) => prev.map((item) => item.id === message.id ? { ...item, is_pinned: !item.is_pinned } : item));
    } catch (error) {
      console.error('Failed to pin message:', error);
      alert('Failed to pin message');
    }
  };

  const editMessage = async (message: Message) => {
    const next = window.prompt('Edit message', message.content || '');
    if (next === null) return;
    if (!next.trim()) {
      alert('Message cannot be empty');
      return;
    }

    try {
      const response = await api.post(`/messages/${message.id}/edit/`, { content: next.trim() });
      setMessages((prev) => prev.map((item) => item.id === message.id ? response.data : item));
    } catch (error) {
      console.error('Failed to edit message:', error);
      alert('Failed to edit message');
    }
  };

  const showEditHistory = async (message: Message) => {
    try {
      const response = await api.get(`/messages/${message.id}/history/`);
      const history: MessageEditHistoryItem[] = response.data || [];
      if (!history.length) {
        alert('No edit history for this message');
        return;
      }
      const rendered = history
        .map((entry) => `${formatDate(entry.edited_at)}: ${entry.previous_content}`)
        .join('\n\n');
      alert(`Edit history:\n\n${rendered}`);
    } catch (error) {
      console.error('Failed to load edit history:', error);
      alert('Failed to load edit history');
    }
  };

  const createPoll = async () => {
    const question = pollQuestion.trim();
    const options = pollOptions.map((item) => item.trim()).filter(Boolean);
    const conversationId = selectedGroupConversationId || selectedDirectConversationId;

    if (!conversationId) {
      alert('Select a conversation first');
      return;
    }
    if (!question || options.length < 2) {
      alert('Poll requires a question and at least two options');
      return;
    }

    try {
      await api.post('/messages/create_poll/', {
        conversation: conversationId,
        question,
        options,
        allows_multiple: pollMultiple,
      });
      // Don't add to messages locally - let WebSocket broadcast handle it
      setShowPollModal(false);
      setPollQuestion('');
      setPollOptions(['', '']);
      setPollMultiple(false);
    } catch (error) {
      console.error('Failed to create poll:', error);
      alert('Failed to create poll');
    }
  };

  const votePoll = async (messageId: number, optionId?: number) => {
    try {
      const message = messages.find(m => m.id === messageId);
      const isMultiple = message?.poll?.allows_multiple;

      let optionIds: number[];
      if (isMultiple) {
        // For multiple select, use the tracked selections
        optionIds = pollSelections[messageId] || [];
        if (optionIds.length === 0) {
          alert('Please select at least one option');
          return;
        }
      } else {
        // For single select, use the clicked option
        if (!optionId) return;
        optionIds = [optionId];
      }

      const response = await api.post(`/messages/${messageId}/vote_poll/`, { option_ids: optionIds });
      setMessages((prev) => prev.map((item) => item.id === messageId ? response.data : item));

      // Clear selections after voting
      if (isMultiple) {
        setPollSelections((prev) => {
          const next = { ...prev };
          delete next[messageId];
          return next;
        });
      }
    } catch (error) {
      console.error('Failed to vote poll:', error);
      alert('Failed to vote');
    }
  };

  const togglePollOption = (messageId: number, optionId: number) => {
    setPollSelections((prev) => {
      const current = prev[messageId] || [];
      const isSelected = current.includes(optionId);

      return {
        ...prev,
        [messageId]: isSelected
          ? current.filter((id) => id !== optionId)
          : [...current, optionId],
      };
    });
  };

  const toCalendarDate = (value: string) => {
    const date = new Date(value);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
  };

  const downloadIcsEvent = (event: EventSuggestion) => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//IMCS//Chat Calendar//EN',
      'BEGIN:VEVENT',
      `UID:${Date.now()}@imcs.chat`,
      `DTSTAMP:${toCalendarDate(new Date().toISOString())}`,
      `DTSTART:${toCalendarDate(event.start_at)}`,
      `DTEND:${toCalendarDate(event.end_at)}`,
      `SUMMARY:${event.title.replace(/\n/g, ' ')}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chat-event.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const openGoogleCalendar = (event: EventSuggestion) => {
    const url = new URL('https://calendar.google.com/calendar/render');
    url.searchParams.set('action', 'TEMPLATE');
    url.searchParams.set('text', event.title);
    url.searchParams.set('dates', `${toCalendarDate(event.start_at)}/${toCalendarDate(event.end_at)}`);
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  };

  const unlockConversation = async () => {
    if (!unlockingConversationId) return;
    if (!unlockPassword) {
      setUnlockError('Password is required');
      return;
    }

    try {
      setUnlockError('');
      const conversationId = unlockingConversationId;
      const response = await api.post('/users/verify_password/', { password: unlockPassword });
      if (response.data?.valid) {
        const conversation = [...directConversations, ...groupConversations].find((item) => item.id === conversationId);
        const wasHidden = !!conversation?.is_hidden;

        if (wasHidden) {
          await api.post(`/conversations/${conversationId}/hide/`, { is_hidden: false });
          await loadGroupConversations();
        }

        setUnlockedConversations((prev) => ({ ...prev, [conversationId]: true }));
        setUnlockPassword('');
        setUnlockingConversationId(null);
        if (wasHidden) {
          showToast('Chat unlocked and moved to main list', 'success');
        } else {
          showToast('Chat unlocked', 'success');
        }
        return;
      }
      setUnlockError('Incorrect password');
    } catch (error) {
      console.error('Failed to verify password:', error);
      setUnlockError('Failed to verify password');
    }
  };

  const loadRecentInteractions = async () => {
    try {
      const [conversationResponse, callResponse] = await Promise.all([
        api.get('/conversations/?include_hidden=true'),
        api.get('/calls/history/'),
      ]);

      const conversations: ConversationSummary[] = conversationResponse.data.results || conversationResponse.data || [];
      const calls: CallHistoryItem[] = callResponse.data.results || callResponse.data || [];

      const nextMap: Record<number, string> = {};
      const upsertRecent = (otherUserId: number, timestamp?: string) => {
        if (!timestamp) return;
        const existing = nextMap[otherUserId];
        if (!existing || new Date(timestamp).getTime() > new Date(existing).getTime()) {
          nextMap[otherUserId] = timestamp;
        }
      };

      conversations.forEach((conversation) => {
        if (conversation.conversation_type !== 'direct') return;
        const other = conversation.participants?.find((participant) => participant.id !== user?.id);
        if (other) {
          upsertRecent(other.id, conversation.updated_at);
        }
      });

      calls.forEach((call) => {
        const otherId = call.caller.id === user?.id ? call.receiver.id : call.caller.id;
        upsertRecent(otherId, call.initiated_at);
      });

      setRecentInteractionByUser(nextMap);
    } catch (error) {
      console.error('Failed to load recent interactions:', error);
    }
  };

  const formatLastSeen = (lastSeen?: string) => {
    if (!lastSeen) return 'Offline';

    const date = new Date(lastSeen);
    if (Number.isNaN(date.getTime())) return 'Offline';

    const now = Date.now();
    const diffMs = Math.max(0, now - date.getTime());
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diffMs < minute) return 'Just now';

    const minutes = Math.floor(diffMs / minute);
    if (minutes < 60) return `${minutes} min ago`;

    const hours = Math.floor(diffMs / hour);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

    const days = Math.floor(diffMs / day);
    return `${days} day${days === 1 ? '' : 's'} ago`;
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

  const getMessageDate = (message: Message) => message.created_at || message.sent_at || '';

  const timelineItems: TimelineItem[] = useMemo(() => {
    const messageItems: TimelineItem[] = messages.map((message) => ({
      kind: 'message',
      item: message,
      timestamp: getMessageDate(message),
    }));

    const callItems: TimelineItem[] = selectedGroupConversationId
      ? []
      : callHistory.map((call) => ({
          kind: 'call',
          item: call,
          timestamp: call.initiated_at,
        }));

    return [...messageItems, ...callItems].sort((a, b) => {
      const t1 = new Date(a.timestamp || 0).getTime();
      const t2 = new Date(b.timestamp || 0).getTime();
      return t1 - t2;
    });
  }, [messages, callHistory, selectedGroupConversationId]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getCallSummary = (call: CallHistoryItem) => {
    const isOutgoing = call.caller.id === user?.id;
    const direction = isOutgoing ? 'Outgoing' : 'Incoming';
    const callTypeLabel = call.call_type === 'video' ? 'Video call' : 'Audio call';

    if (call.status === 'ended' && call.duration > 0) {
      return `${direction} ${callTypeLabel} • ${formatDuration(call.duration)}`;
    }

    return `${direction} ${callTypeLabel} • ${call.status}`;
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

  const handleJoinIncomingGroupCall = async () => {
    if (!incomingGroupCall) {
      return;
    }

    try {
      const response = await api.get(`/conference-calls/${incomingGroupCall.conference_id}/`);
      await api.post(`/conference-calls/${incomingGroupCall.conference_id}/join/`);
      await initializeConferenceCall(response.data as ConferenceCall);
      clearIncomingGroupCall();
    } catch (error) {
      console.error('Failed to join group call:', error);
      alert('Failed to join group call');
    }
  };

  const handleDismissIncomingGroupCall = () => {
    clearIncomingGroupCall();
  };

  const toggleConferenceAudio = () => {
    if (!conferenceLocalStreamRef.current) {
      return;
    }

    const nextState = !conferenceAudioEnabled;
    conferenceLocalStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = nextState;
    });
    setConferenceAudioEnabled(nextState);
  };

  const toggleConferenceVideo = () => {
    const currentVideoTrack = conferenceActiveVideoTrackRef.current;
    if (!currentVideoTrack) {
      return;
    }

    const nextState = !conferenceVideoEnabled;
    currentVideoTrack.enabled = nextState;
    setConferenceVideoEnabled(nextState);
  };

  const toggleConferenceScreenShare = async () => {
    if (!conferenceCall || conferenceCall.call_type !== 'video' || !isConferenceCallActive) {
      return;
    }

    if (conferenceScreenSharing) {
      await stopConferenceScreenShare();
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });

      const screenTrack = screenStream.getVideoTracks()[0];
      if (!screenTrack) {
        return;
      }

      await replaceConferenceOutgoingVideoTrack(screenTrack);

      conferenceScreenStreamRef.current = screenStream;
      conferenceActiveVideoTrackRef.current = screenTrack;
      screenTrack.enabled = true;
      setConferenceVideoEnabled(true);
      setConferenceScreenSharing(true);

      screenTrack.onended = () => {
        stopConferenceScreenShare(false).catch((error) => {
          console.error('Failed stopping conference screen share after browser end:', error);
        });
      };

      if (conferenceLocalVideoRef.current) {
        const previewStream = new MediaStream();
        previewStream.addTrack(screenTrack);
        if (conferenceLocalStreamRef.current) {
          conferenceLocalStreamRef.current.getAudioTracks().forEach((track) => previewStream.addTrack(track));
        }
        conferenceLocalVideoRef.current.srcObject = previewStream;
      }
    } catch (error) {
      console.error('Failed to start conference screen sharing:', error);
    }
  };

  const endConferenceCall = async () => {
    if (conferenceWsRef.current?.readyState === WebSocket.OPEN) {
      conferenceWsRef.current.send(JSON.stringify({ type: 'call-end', reason: 'left' }));
    }

    if (conferenceCall?.id) {
      try {
        await api.post(`/conference-calls/${conferenceCall.id}/leave/`);
      } catch (error) {
        console.error('Failed to leave conference call:', error);
      }
    }

    cleanupConferenceResources();
  };

  useEffect(() => {
    return () => {
      cleanupConferenceResources();
      if (localTypingActiveRef.current) {
        emitTypingState(false);
        localTypingActiveRef.current = false;
      }
      if (typingStopTimeoutRef.current) {
        clearTimeout(typingStopTimeoutRef.current);
      }
    };
  }, [cleanupConferenceResources, emitTypingState]);

  if (loading) {
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
              <h1 className="text-2xl font-bold text-blue-600">IMCS</h1>
              
              <nav className="hidden md:flex space-x-4">
                <button
                  onClick={() => router.push('/dashboard')}
                  className="text-gray-600 hover:text-blue-600 px-3 py-2 font-medium"
                >
                  Dashboard
                </button>
                <button
                  onClick={() => router.push('/calls')}
                  className="text-gray-600 hover:text-blue-600 px-3 py-2 font-medium"
                >
                  Calls
                </button>
                <button
                  onClick={() => router.push('/contacts')}
                  className="text-gray-600 hover:text-blue-600 px-3 py-2 font-medium"
                >
                  Contacts
                </button>
                <button
                  onClick={() => router.push('/messages')}
                  className="text-blue-600 border-b-2 border-blue-600 px-3 py-2 font-medium"
                >
                  Messages
                </button>
              </nav>
            </div>

            <div className="flex items-center space-x-4">
              <NotificationBell />
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
        <div className="bg-white rounded-lg shadow-md overflow-visible" style={{ height: 'calc(100vh - 160px)' }}>
          <div className="flex h-full">
            {/* Users List */}
            <div className="w-1/3 border-r border-gray-200 overflow-y-auto">
              <div className="p-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-gray-800">Messages</h2>
                  <button
                    onClick={() => setShowCreateGroupModal(true)}
                    className="text-xs bg-indigo-100 text-indigo-700 px-3 py-1 rounded hover:bg-indigo-200"
                  >
                    Create Group
                  </button>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <button
                    onClick={() => setShowHiddenChats((prev) => !prev)}
                    className="text-xs text-gray-600 hover:text-gray-800"
                  >
                    {showHiddenChats ? 'Hide hidden chats' : 'Show hidden chats'}
                  </button>
                </div>
                {connected ? (
                  <p className="text-xs text-green-600 flex items-center mt-1">
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-1 animate-pulse"></span>
                    Live ({onlineUsers.length} online)
                  </p>
                ) : (
                  <p className="text-xs text-red-600 flex items-center mt-1">
                    <span className="w-2 h-2 bg-red-500 rounded-full mr-1"></span>
                    Connecting...
                  </p>
                )}
              </div>
              <div className="border-b border-gray-100">
                <div className="px-4 py-2 text-xs uppercase tracking-wide text-gray-500 font-semibold">
                  Direct Messages
                </div>
                {sortedUsersWithOnlineStatus.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    No users found
                  </div>
                ) : (
                  visibleUsers.map((u) => (
                  (() => {
                    const conversation = directConversations.find((entry) =>
                      (entry.participants || []).some((participant) => participant.id === u.id)
                    );
                    return (
                  <button
                    key={u.id}
                    onClick={() => openDirectConversation(u)}
                    className={`w-full p-4 flex items-center space-x-3 hover:bg-gray-50 transition ${
                      selectedUser?.id === u.id ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="relative">
                      <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">
                        {u.username.charAt(0).toUpperCase()}
                      </div>
                      {u.is_online && (
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <h3 className="font-semibold text-gray-800">
                        {conversation?.is_pinned ? '📌 ' : ''}
                        {u.username}
                      </h3>
                      <p className="text-sm text-gray-500">{u.is_online ? 'Online' : formatLastSeen(u.last_seen)}</p>
                    </div>
                  </button>
                    );
                  })()
                  ))
                )}
              </div>

              <div>
                <div className="px-4 py-2 text-xs uppercase tracking-wide text-gray-500 font-semibold">
                  Groups
                </div>
                {visibleGroupConversations.length === 0 ? (
                  <div className="p-4 text-sm text-gray-500">
                    No groups yet. Create one to start group chat and calls.
                  </div>
                ) : (
                  visibleGroupConversations.map((group) => {
                    const memberCount = group.participants?.length || 0;
                    return (
                      <button
                        key={group.id}
                        onClick={() => openGroupConversation(group)}
                        className={`w-full p-4 flex items-center space-x-3 hover:bg-gray-50 transition ${
                          selectedGroupConversationId === group.id ? 'bg-indigo-50' : ''
                        }`}
                      >
                        <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold">
                          {(group.name || 'G').charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 text-left">
                          <h3 className="font-semibold text-gray-800">
                            {group.is_pinned ? '📌 ' : ''}
                            {group.name || `Group ${group.id}`}
                          </h3>
                          <p className="text-sm text-gray-500">{memberCount} members</p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {showHiddenChats && (hiddenUsers.length > 0 || hiddenGroupConversations.length > 0) && (
                <div className="border-t border-gray-100">
                  <div className="px-4 py-2 text-xs uppercase tracking-wide text-gray-500 font-semibold">
                    Hidden Chats
                  </div>
                  {hiddenUsers.map((u) => (
                    <button
                      key={`hidden-${u.id}`}
                      onClick={() => openDirectConversation(u)}
                      className={`w-full p-4 flex items-center space-x-3 hover:bg-gray-50 transition ${
                        selectedUser?.id === u.id ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div className="w-12 h-12 bg-gray-500 rounded-full flex items-center justify-center text-white font-bold">
                        {u.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 text-left">
                        <h3 className="font-semibold text-gray-800">🙈 {u.username}</h3>
                        <p className="text-sm text-gray-500">Hidden</p>
                      </div>
                    </button>
                  ))}
                  {hiddenGroupConversations.map((group) => (
                    <button
                      key={`hidden-group-${group.id}`}
                      onClick={() => openGroupConversation(group)}
                      className={`w-full p-4 flex items-center space-x-3 hover:bg-gray-50 transition ${
                        selectedGroupConversationId === group.id ? 'bg-indigo-50' : ''
                      }`}
                    >
                      <div className="w-12 h-12 bg-gray-600 rounded-full flex items-center justify-center text-white font-bold">
                        {(group.name || 'G').charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 text-left">
                        <h3 className="font-semibold text-gray-800">🙈 {group.name || `Group ${group.id}`}</h3>
                        <p className="text-sm text-gray-500">Hidden group</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Chat Area */}
            <div className="flex-1 flex flex-col">
              {selectedUserWithStatus || selectedGroupConversationId ? (
                <>
                  {/* Chat Header */}
                  <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                    {selectedGroupConversationId ? (
                      <div className="flex items-center justify-between w-full">
                        <div>
                          <h3 className="font-semibold text-gray-800">{selectedGroupName || 'Group Chat'}</h3>
                          <p className="text-sm text-gray-500">Group conversation</p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={toggleConversationPin}
                            className="p-2 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded"
                            title="Pin or unpin chat"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l14-6M5 9l14 6M10 20h4" />
                            </svg>
                          </button>
                          <button
                            onClick={toggleConversationHidden}
                            className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded"
                            title={selectedConversationMeta?.is_hidden ? 'Unhide chat' : 'Hide chat'}
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18M10.58 10.58a2 2 0 002.83 2.83M9.88 5.1A9.97 9.97 0 0112 5c4.4 0 8.16 2.78 9.5 6.5a10.53 10.53 0 01-4.26 4.94M6.23 6.23A10.53 10.53 0 002.5 11.5a10.1 10.1 0 004.48 5.15" />
                            </svg>
                          </button>
                          <button
                            onClick={toggleConversationLock}
                            className="p-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded"
                            title={isConversationLocked ? 'Unlock chat' : 'Lock chat'}
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11V7a4 4 0 00-8 0v4M7 11h10a2 2 0 012 2v6a2 2 0 01-2 2H7a2 2 0 01-2-2v-6a2 2 0 012-2z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => openGroupCallModal('audio')}
                            className="p-2 bg-green-100 hover:bg-green-200 text-green-700 rounded"
                            title="Start audio group call"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => openGroupCallModal('video')}
                            className="p-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded"
                            title="Start video group call"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                          <div className="relative">
                            <button
                              onClick={() => setShowGroupActionsMenu((prev) => !prev)}
                              className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded"
                              title="Group actions"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5h.01M12 12h.01M12 19h.01" />
                              </svg>
                            </button>

                            {showGroupActionsMenu && (
                              <div className="absolute right-0 mt-2 w-52 bg-white border border-gray-200 rounded-lg shadow-lg z-30 py-1">
                                <button
                                  onClick={openRenameGroupModal}
                                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                  Change Group Name
                                </button>
                                <button
                                  onClick={() => {
                                    setShowGroupActionsMenu(false);
                                    setShowGroupDetailsModal(true);
                                  }}
                                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                  Group Details
                                </button>
                                <button
                                  onClick={handleLeaveGroup}
                                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                                >
                                  Leave Group
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : selectedUserWithStatus ? (
                      <>
                        <div className="flex items-center space-x-3">
                          <div className="relative">
                            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">
                              {selectedUserWithStatus.username.charAt(0).toUpperCase()}
                            </div>
                            {selectedUserWithStatus.is_online && (
                              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
                            )}
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-800">{selectedUserWithStatus.username}</h3>
                            <p className="text-sm text-gray-500">
                              {selectedUserWithStatus.is_online ? 'Online' : formatLastSeen(selectedUserWithStatus.last_seen)}
                            </p>
                          </div>
                        </div>

                        {/* Call Buttons */}
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={toggleConversationPin}
                            className="p-2 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded"
                            title="Pin or unpin chat"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l14-6M5 9l14 6M10 20h4" />
                            </svg>
                          </button>
                          <button
                            onClick={toggleConversationHidden}
                            className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded"
                            title={selectedConversationMeta?.is_hidden ? 'Unhide chat' : 'Hide chat'}
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18M10.58 10.58a2 2 0 002.83 2.83M9.88 5.1A9.97 9.97 0 0112 5c4.4 0 8.16 2.78 9.5 6.5a10.53 10.53 0 01-4.26 4.94M6.23 6.23A10.53 10.53 0 002.5 11.5a10.1 10.1 0 004.48 5.15" />
                            </svg>
                          </button>
                          <button
                            onClick={toggleConversationLock}
                            className="p-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded"
                            title={isConversationLocked ? 'Unlock chat' : 'Lock chat'}
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11V7a4 4 0 00-8 0v4M7 11h10a2 2 0 012 2v6a2 2 0 01-2 2H7a2 2 0 01-2-2v-6a2 2 0 012-2z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => startCall(selectedUserWithStatus.username, 'audio')}
                            disabled={isCallActive}
                            className="p-2 hover:bg-gray-100 rounded-full transition disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Audio Call"
                          >
                            <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => startCall(selectedUserWithStatus.username, 'video')}
                            disabled={isCallActive}
                            className="p-2 hover:bg-gray-100 rounded-full transition disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Video Call"
                          >
                            <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </div>
                      </>
                    ) : null}
                  </div>

                  {isLockedForView ? (
                    <div className="flex-1 flex items-center justify-center p-8">
                      <div className="max-w-md text-center">
                        <div className="w-16 h-16 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center mx-auto mb-4">
                          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11V7a4 4 0 00-8 0v4M7 11h10a2 2 0 012 2v6a2 2 0 01-2 2H7a2 2 0 01-2-2v-6a2 2 0 012-2z" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900">Chat locked</h3>
                        <p className="text-sm text-gray-600 mt-2">Enter your password to view and send messages.</p>
                        <button
                          onClick={() => setUnlockingConversationId(selectedConversationId)}
                          className="mt-4 px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                        >
                          Unlock chat
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {(() => {
                        const typingKey = selectedGroupConversationId
                          ? `group:${selectedGroupConversationId}`
                          : selectedUserWithStatus
                            ? `direct:${selectedUserWithStatus.id}`
                            : '';
                        const typingUser = typingKey ? typingByConversation[typingKey] : '';
                        if (!typingUser) return null;
                        return (
                          <div className="px-4 pb-2 text-xs text-blue-600 animate-pulse">
                            {typingUser} is typing...
                          </div>
                        );
                      })()}

                      <div className="px-4 pb-2 flex items-center gap-2">
                        <input
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          placeholder="Search messages"
                          className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm"
                        />
                        <select
                          value={messageFilter}
                          onChange={(e) => setMessageFilter(e.target.value as 'all' | 'pinned' | 'polls' | 'mentions')}
                          className="px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                        >
                          <option value="all">All</option>
                          <option value="pinned">Pinned</option>
                          <option value="polls">Polls</option>
                          <option value="mentions">Mentions</option>
                        </select>
                      </div>

                      {/* Messages */}
                      <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {loadingMessages ? (
                          <div className="text-center text-gray-500">Loading messages...</div>
                        ) : timelineItems.length === 0 ? (
                          <div className="text-center text-gray-500">No messages yet. Start the conversation!</div>
                        ) : (
                          timelineItems.map((timelineItem, index) => {
                            if (timelineItem.kind === 'call') {
                              const call = timelineItem.item;
                              return (
                                <div key={`call-${call.id}-${index}`} className="flex justify-center">
                                  <div className="px-3 py-2 rounded-full bg-gray-100 text-gray-700 text-sm border border-gray-200">
                                    <span className="font-medium">
                                      {call.call_type === 'video' ? '📹' : '📞'} {getCallSummary(call)}
                                    </span>
                                    <span className="ml-2 text-xs text-gray-500">{formatDate(call.initiated_at)}</span>
                                  </div>
                                </div>
                              );
                            }

                            const message = timelineItem.item;
                            const callEvent = parseCallEventContent(message.content || '');
                            if (callEvent) {
                              return (
                                <div key={`call-event-${message.id}-${index}`} className="flex justify-center">
                                  <div className="px-3 py-2 rounded-full bg-indigo-50 text-indigo-800 text-sm border border-indigo-200">
                                    <span className="font-medium">
                                      {callEvent.callType === 'video' ? '📹' : '📞'} {callEvent.username} {callEvent.eventText}
                                    </span>
                                    <span className="ml-2 text-xs text-indigo-600">{formatDate(getMessageDate(message))}</span>
                                  </div>
                                </div>
                              );
                            }

                            const senderUsername = getUsername(message.sender);
                            const isOwn = senderUsername === user?.username;
                            const attachment = parseAttachmentContent(message.content || '');
                            const isPollMessage = !!message.poll;
                            return (
                              <div key={`message-${message.id}-${index}`} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-xs lg:max-w-md ${isOwn ? 'order-2' : 'order-1'}`}>
                                  <div
                                    className={`px-4 py-2 rounded-lg ${
                                      isOwn
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-200 text-gray-800'
                                    }`}
                                  >
                                    {attachment ? (
                                      <div className="space-y-2">
                                        {attachment.isImage ? (
                                          <a href={attachment.fileUrl} target="_blank" rel="noreferrer">
                                            <img
                                              src={attachment.fileUrl}
                                              alt={attachment.fileName}
                                              className="max-w-[260px] max-h-56 rounded-md object-cover border border-black/10"
                                            />
                                          </a>
                                        ) : (
                                          <a
                                            href={attachment.fileUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className={`inline-flex items-center gap-2 underline ${isOwn ? 'text-white' : 'text-blue-700'}`}
                                          >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3 3m0 0l-3-3m3 3V8" />
                                            </svg>
                                            {attachment.fileName}
                                          </a>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="space-y-2">
                                        {isPollMessage ? (
                                          <div className="min-w-[280px]">
                                            <div className="flex items-start justify-between gap-2 mb-3">
                                              <p className="font-semibold text-base">{message.poll?.question}</p>
                                              <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                                <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                                              </svg>
                                            </div>

                                            {message.poll?.allows_multiple && (
                                              <div className={`text-xs mb-2 ${isOwn ? 'text-white/80' : 'text-gray-600'}`}>
                                                Multiple selections allowed
                                              </div>
                                            )}

                                            <div className="space-y-2">
                                              {(() => {
                                                const totalVotes = (message.poll?.options || []).reduce((sum, opt) => sum + opt.votes, 0);
                                                const selectedOptions = pollSelections[message.id] || [];
                                                const hasVoted = (message.poll?.options || []).some((opt) => opt.voted);

                                                return (message.poll?.options || []).map((option) => {
                                                  const percentage = totalVotes > 0 ? Math.round((option.votes / totalVotes) * 100) : 0;
                                                  const isSelected = selectedOptions.includes(option.option_id);

                                                  return (
                                                    <div
                                                      key={option.option_id}
                                                      className={`relative rounded-lg border transition-all ${
                                                        option.voted
                                                          ? isOwn
                                                            ? 'border-white bg-white/20'
                                                            : 'border-indigo-400 bg-indigo-100'
                                                          : isSelected
                                                            ? isOwn
                                                              ? 'border-white bg-white/15'
                                                              : 'border-indigo-300 bg-indigo-50'
                                                            : isOwn
                                                              ? 'border-white/40 hover:border-white/60'
                                                              : 'border-gray-300 hover:border-gray-400'
                                                      }`}
                                                    >
                                                      {/* Progress bar background */}
                                                      {hasVoted && (
                                                        <div
                                                          className={`absolute inset-0 rounded-lg ${
                                                            isOwn ? 'bg-white/10' : 'bg-indigo-200/50'
                                                          }`}
                                                          style={{ width: `${percentage}%` }}
                                                        />
                                                      )}

                                                      <button
                                                        onClick={() => {
                                                          if (message.poll?.allows_multiple) {
                                                            togglePollOption(message.id, option.option_id);
                                                          } else {
                                                            votePoll(message.id, option.option_id);
                                                          }
                                                        }}
                                                        disabled={hasVoted}
                                                        className="relative w-full text-left px-3 py-2.5 flex items-center gap-2"
                                                      >
                                                        {/* Checkbox/Radio indicator */}
                                                        {!hasVoted && (
                                                          <div
                                                            className={`flex-shrink-0 w-4 h-4 border-2 flex items-center justify-center ${
                                                              message.poll?.allows_multiple ? 'rounded' : 'rounded-full'
                                                            } ${
                                                              isSelected
                                                                ? isOwn
                                                                  ? 'border-white bg-white'
                                                                  : 'border-indigo-600 bg-indigo-600'
                                                                : isOwn
                                                                  ? 'border-white/60'
                                                                  : 'border-gray-400'
                                                            }`}
                                                          >
                                                            {isSelected && (
                                                              message.poll?.allows_multiple ? (
                                                                <svg className={`w-3 h-3 ${isOwn ? 'text-blue-600' : 'text-white'}`} fill="currentColor" viewBox="0 0 20 20">
                                                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                                </svg>
                                                              ) : (
                                                                <div className={`w-2 h-2 rounded-full ${isOwn ? 'bg-blue-600' : 'bg-white'}`} />
                                                              )
                                                            )}
                                                          </div>
                                                        )}

                                                        {/* Option text and vote count */}
                                                        <div className="flex-1 flex items-center justify-between">
                                                          <span className="text-sm font-medium">{option.text}</span>
                                                          <div className="flex items-center gap-2">
                                                            {hasVoted && (
                                                              <span className={`text-xs ${isOwn ? 'text-white/70' : 'text-gray-600'}`}>
                                                                {percentage}%
                                                              </span>
                                                            )}
                                                            <span className={`text-sm font-semibold ${isOwn ? 'text-white/90' : 'text-gray-700'}`}>
                                                              {option.votes}
                                                            </span>
                                                          </div>
                                                        </div>

                                                        {/* Voted indicator */}
                                                        {option.voted && (
                                                          <svg className={`w-5 h-5 flex-shrink-0 ${isOwn ? 'text-white' : 'text-indigo-600'}`} fill="currentColor" viewBox="0 0 20 20">
                                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                          </svg>
                                                        )}
                                                      </button>
                                                    </div>
                                                  );
                                                });
                                              })()}
                                            </div>

                                            {/* Multiple select submit button */}
                                            {message.poll?.allows_multiple && !(message.poll?.options || []).some((opt) => opt.voted) && (
                                              <button
                                                onClick={() => votePoll(message.id)}
                                                disabled={(pollSelections[message.id] || []).length === 0}
                                                className={`w-full mt-3 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                                                  (pollSelections[message.id] || []).length === 0
                                                    ? isOwn
                                                      ? 'bg-white/20 text-white/50 cursor-not-allowed'
                                                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                                    : isOwn
                                                      ? 'bg-white text-blue-600 hover:bg-white/90'
                                                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
                                                }`}
                                              >
                                                Submit Vote
                                              </button>
                                            )}

                                            {/* Total votes footer */}
                                            <div className={`text-xs mt-2 ${isOwn ? 'text-white/70' : 'text-gray-500'}`}>
                                              {(() => {
                                                const totalVotes = (message.poll?.options || []).reduce((sum, opt) => sum + opt.votes, 0);
                                                return `${totalVotes} ${totalVotes === 1 ? 'vote' : 'votes'}`;
                                              })()}
                                            </div>
                                          </div>
                                        ) : (
                                          <p>{renderMessageWithMentions(message.content, isOwn)}</p>
                                        )}

                                        {message.event_suggestion && (
                                          <div className={`mt-2 p-2 rounded border ${isOwn ? 'border-white/30 bg-white/10' : 'border-emerald-200 bg-emerald-50'}`}>
                                            <p className={`text-xs ${isOwn ? 'text-emerald-100' : 'text-emerald-700'} mb-2`}>Event detected: {message.event_suggestion.title}</p>
                                            <div className="flex gap-2">
                                              <button
                                                onClick={() => downloadIcsEvent(message.event_suggestion as EventSuggestion)}
                                                className={`text-xs px-2 py-1 rounded ${isOwn ? 'bg-white/20 text-white' : 'bg-white border border-emerald-300 text-emerald-700'}`}
                                              >
                                                Add to Device Calendar
                                              </button>
                                              <button
                                                onClick={() => openGoogleCalendar(message.event_suggestion as EventSuggestion)}
                                                className={`text-xs px-2 py-1 rounded ${isOwn ? 'bg-white/20 text-white' : 'bg-white border border-emerald-300 text-emerald-700'}`}
                                              >
                                                Open in Google Calendar
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  <div className={`mt-1 flex items-center gap-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                                    {selectedGroupConversationId && (
                                      <button
                                        onClick={() => toggleMessagePin(message)}
                                        className="px-2 py-0.5 rounded-full text-xs border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                                        title="Pin message"
                                      >
                                        {message.is_pinned ? '📌' : '📍'}
                                      </button>
                                    )}

                                    {isOwn && (
                                      <>
                                        <button
                                          onClick={() => editMessage(message)}
                                          className="px-2 py-0.5 rounded-full text-xs border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                                        >
                                          Edit
                                        </button>
                                        <button
                                          onClick={() => showEditHistory(message)}
                                          className="px-2 py-0.5 rounded-full text-xs border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                                        >
                                          History
                                        </button>
                                      </>
                                    )}

                                    {(message.reactions || []).map((reaction) => (
                                      <button
                                        key={`${message.id}-${reaction.emoji}`}
                                        onClick={() => reactToMessage(message.id, reaction.emoji)}
                                        className={`px-2 py-0.5 rounded-full text-xs border transition ${
                                          reaction.reacted
                                            ? 'bg-blue-100 text-blue-700 border-blue-300'
                                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                        }`}
                                      >
                                        {reaction.emoji} {reaction.count}
                                      </button>
                                    ))}

                                    <div className="relative">
                                      <button
                                        onClick={() => setReactionPickerForMessageId((prev) => prev === message.id ? null : message.id)}
                                        className="px-2 py-0.5 rounded-full text-xs border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                                      >
                                        +
                                      </button>

                                      {reactionPickerForMessageId === message.id && (
                                        <div
                                          className={`absolute mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-1 z-20 flex gap-1 whitespace-nowrap ${
                                            isOwn ? 'right-0' : 'left-0'
                                          }`}
                                        >
                                          {reactionEmojiList.map((emoji) => (
                                            <button
                                              key={`${message.id}-${emoji}`}
                                              onClick={() => reactToMessage(message.id, emoji)}
                                              className="w-7 h-7 rounded hover:bg-gray-100"
                                            >
                                              {emoji}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div className={`mt-1 flex items-center gap-2 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                                    <p className="text-xs text-gray-500">{formatDate(getMessageDate(message))}</p>
                                    {message.is_edited && (
                                      <p className="text-xs text-gray-500">edited</p>
                                    )}
                                    {message.is_pinned && (
                                      <p className="text-xs text-amber-600">pinned</p>
                                    )}
                                    {isOwn && (
                                      <p className="text-xs text-gray-500 uppercase tracking-wide">{getDeliveryStatusLabel(message)}</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                        <div ref={messagesEndRef} />
                      </div>

                      {/* Message Input */}
                      <form onSubmit={sendMessage} className="p-4 border-t border-gray-200">
                        {currentConversationKey && draftByConversation[currentConversationKey] && (
                          <p className="text-xs text-gray-500 mb-2">Draft saved</p>
                        )}
                        <div className="flex items-center space-x-3">
                          <input
                            ref={fileInputRef}
                            type="file"
                            className="hidden"
                            onChange={handleAttachmentChange}
                          />
                          <button
                            type="button"
                            onClick={handleSelectAttachment}
                            disabled={uploadingAttachment}
                            className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-50"
                            title="Send image or file"
                          >
                            {uploadingAttachment ? (
                              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                              </svg>
                            ) : (
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828L18 9.414a4 4 0 00-5.656-5.656L5.93 10.172a6 6 0 108.485 8.485L20.5 12" />
                              </svg>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowPollModal(true)}
                            className="p-2 rounded-full bg-violet-100 hover:bg-violet-200 text-violet-700"
                            title="Create poll"
                          >
                            <span className="text-sm font-semibold">Poll</span>
                          </button>
                          <select
                            value={messageExpirationHours}
                            onChange={(e) => setMessageExpirationHours(Number(e.target.value))}
                            className="px-2 py-1 text-xs border border-gray-300 rounded-md bg-white text-gray-700"
                            title="Message expiration"
                          >
                            <option value={24}>24h</option>
                            <option value={168}>7d</option>
                            <option value={2160}>90d</option>
                          </select>
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setShowEmojiPicker((prev) => !prev)}
                              className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700"
                              title="Add emoji"
                            >
                              <span className="text-lg">😊</span>
                            </button>
                            {showEmojiPicker && (
                              <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-white border border-gray-200 rounded-xl shadow-xl p-2 grid grid-cols-6 gap-1 z-50 w-56 max-h-48 overflow-y-auto">
                                {emojiList.map((emoji) => (
                                  <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => appendEmoji(emoji)}
                                    className="w-8 h-8 rounded hover:bg-gray-100 flex items-center justify-center"
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="relative flex-1">
                            {mentionSuggestions.length > 0 && (
                              <div className="absolute bottom-12 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-40 max-h-44 overflow-y-auto">
                                {mentionSuggestions.map((candidate) => (
                                  <button
                                    key={`mention-${candidate.id}`}
                                    type="button"
                                    onClick={() => insertMention(candidate.username)}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                  >
                                    <span className="font-medium text-indigo-700">@{candidate.username}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                            <input
                              ref={messageInputRef}
                              type="text"
                              value={messageContent}
                              onChange={(e) => handleMessageInputChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
                              onKeyDown={handleMessageInputKeyDown}
                              placeholder="Type a message, emoji, or send a file..."
                              className="w-full px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
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
                    </>
                  )}
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center text-gray-500">
                    <svg className="w-24 h-24 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <h3 className="text-xl font-semibold mb-2">Select a conversation</h3>
                    <p>Choose a user from the list or open a group from the Groups page.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {toast && (
        <div className="fixed top-20 right-6 z-50">
          <div
            className={`px-4 py-2 rounded-lg shadow-lg text-sm font-medium border animate-toast-in ${
              toast.tone === 'success'
                ? 'bg-green-50 text-green-800 border-green-200'
                : toast.tone === 'error'
                  ? 'bg-red-50 text-red-800 border-red-200'
                  : 'bg-blue-50 text-blue-800 border-blue-200'
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}

      {/* Video Call Modal */}
      <VideoCallModal
        isActive={isCallActive}
        callTitle={callTitle}
        callStatus={callStatus}
        callType={currentCall?.call_type || 'video'}
        localVideoRef={directLocalVideoRef}
        remoteVideoRef={directRemoteVideoRef}
        audioEnabled={audioEnabled}
        videoEnabled={videoEnabled}
        isScreenSharing={isScreenSharing}
        onToggleAudio={toggleAudio}
        onToggleVideo={toggleVideo}
        onToggleScreenShare={toggleScreenShare}
        onEndCall={endCall}
      />

      <VideoCallModal
        isActive={isConferenceCallActive && !!conferenceCall}
        callTitle={conferenceCall?.title || 'Group Call'}
        callStatus={conferenceCallStatus || 'Waiting for participants...'}
        callType={conferenceCall?.call_type || 'video'}
        localVideoRef={conferenceLocalVideoRef}
        remoteVideoRef={conferenceRemoteVideoRef}
        audioEnabled={conferenceAudioEnabled}
        videoEnabled={conferenceVideoEnabled}
        isScreenSharing={conferenceScreenSharing}
        onToggleAudio={toggleConferenceAudio}
        onToggleVideo={toggleConferenceVideo}
        onToggleScreenShare={toggleConferenceScreenShare}
        onEndCall={endConferenceCall}
      />

      {/* Incoming Call Modal */}
      <IncomingCallModal
        isActive={!!incomingCall && !isCallActive}
        callData={incomingCall}
        onAccept={handleAcceptCall}
        onReject={handleRejectCall}
      />

      {incomingGroupCall && !isConferenceCallActive && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Incoming Group Call</h3>
            <p className="text-sm text-gray-700">
              <span className="font-medium">{incomingGroupCall.host_username || 'Someone'}</span>
              {' '}started a {incomingGroupCall.call_type} call.
            </p>
            <p className="text-sm text-gray-700 mt-1">
              Room: <span className="font-medium">{incomingGroupCall.title || `Conference ${incomingGroupCall.conference_id}`}</span>
            </p>

            <div className="flex items-center justify-end space-x-2 mt-6">
              <button
                onClick={handleDismissIncomingGroupCall}
                className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                Dismiss
              </button>
              <button
                onClick={handleJoinIncomingGroupCall}
                className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700"
              >
                Join Call
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateGroupModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Create Group</h3>
              <button
                onClick={() => setShowCreateGroupModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Group Name (optional)</label>
                <input
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g. Ops Team"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Members</label>
                <div className="max-h-52 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {sortedUsersWithOnlineStatus.map((member) => (
                    <label key={member.id} className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-50">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{member.username}</p>
                        <p className="text-xs text-gray-500">{member.is_online ? 'Online' : formatLastSeen(member.last_seen)}</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={newGroupMemberIds.includes(member.id)}
                        onChange={() => toggleNewGroupMember(member.id)}
                        className="w-4 h-4"
                      />
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">Selected: {newGroupMemberIds.length}</p>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 mt-6">
              <button
                onClick={() => setShowCreateGroupModal(false)}
                className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={createGroupConversation}
                disabled={newGroupMemberIds.length === 0 || creatingGroup}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-400"
              >
                {creatingGroup ? 'Creating...' : 'Create Group'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showGroupCallModal && selectedGroupConversationId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Start {groupCallType === 'video' ? 'Video' : 'Audio'} Group Call
              </h3>
              <button
                onClick={() => setShowGroupCallModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-5">
              <p className="text-sm text-gray-700">
                Group: <span className="font-medium">{selectedGroupName || `Group ${selectedGroupConversationId}`}</span>
              </p>
              <p className="text-sm text-gray-700 mt-1">
                Participants: <span className="font-medium">{selectedGroupParticipantIds.length + 1}</span>
              </p>
              <p className="text-xs text-gray-500 mt-3">
                The group call will open directly on this page.
              </p>
            </div>

            <div className="flex items-center justify-end space-x-2">
              <button
                onClick={() => setShowGroupCallModal(false)}
                className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={() => startGroupCall(groupCallType)}
                disabled={startingGroupCall}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-400"
              >
                {startingGroupCall ? 'Starting...' : 'Start Call'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRenameGroupModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Change Group Name</h3>
            <input
              value={newGroupTitle}
              onChange={(e) => setNewGroupTitle(e.target.value)}
              placeholder="Enter new group name"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />

            <div className="flex items-center justify-end space-x-2 mt-6">
              <button
                onClick={() => setShowRenameGroupModal(false)}
                className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleRenameGroup}
                disabled={!newGroupTitle.trim() || renamingGroup}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-400"
              >
                {renamingGroup ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showGroupDetailsModal && selectedGroupConversationId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Group Details</h3>
            <p className="text-sm text-gray-700">
              Name: <span className="font-medium">{selectedGroupName || `Group ${selectedGroupConversationId}`}</span>
            </p>
            <p className="text-sm text-gray-700 mt-2">
              Members: <span className="font-medium">{selectedGroupParticipantIds.length + 1}</span>
            </p>
            <p className="text-sm text-gray-700 mt-2">
              Conversation ID: <span className="font-medium">{selectedGroupConversationId}</span>
            </p>

            <div className="flex items-center justify-end mt-6">
              <button
                onClick={() => setShowGroupDetailsModal(false)}
                className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showPollModal && (selectedGroupConversationId || selectedDirectConversationId) && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Create Poll</h3>

            <div className="space-y-3">
              <input
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                placeholder="Poll question"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />

              {pollOptions.map((option, index) => (
                <input
                  key={`poll-option-${index}`}
                  value={option}
                  onChange={(e) => {
                    setPollOptions((prev) => {
                      const next = [...prev];
                      next[index] = e.target.value;
                      return next;
                    });
                  }}
                  placeholder={`Option ${index + 1}`}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              ))}

              <div className="flex items-center justify-between">
                <button
                  onClick={() => setPollOptions((prev) => [...prev, ''])}
                  className="text-sm text-indigo-700 hover:text-indigo-900"
                >
                  + Add option
                </button>

                <label className="text-sm text-gray-700 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={pollMultiple}
                    onChange={(e) => setPollMultiple(e.target.checked)}
                  />
                  Allow multiple votes
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 mt-6">
              <button
                onClick={() => setShowPollModal(false)}
                className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={createPoll}
                className="px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700"
              >
                Send Poll
              </button>
            </div>
          </div>
        </div>
      )}

      {unlockingConversationId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900">Unlock Chat</h3>
            <p className="text-sm text-gray-600 mt-1">Enter your password to unlock this chat.</p>
            <div className="mt-4 space-y-2">
              <input
                type="password"
                value={unlockPassword}
                onChange={(e) => setUnlockPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="Password"
              />
              {unlockError && <p className="text-sm text-red-600">{unlockError}</p>}
            </div>
            <div className="flex items-center justify-end space-x-2 mt-6">
              <button
                onClick={() => {
                  setUnlockingConversationId(null);
                  setUnlockPassword('');
                  setUnlockError('');
                }}
                className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={unlockConversation}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
              >
                Unlock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
