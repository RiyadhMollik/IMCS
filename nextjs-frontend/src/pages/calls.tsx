import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import VideoCallModal from '@/components/VideoCallModal';
import { MediasoupConferenceClient } from '@/lib/mediasoupClient';

interface Call {
  id: number;
  caller: { id: number; username: string };
  receiver: { id: number; username: string };
  call_type: 'audio' | 'video';
  status: string;
  initiated_at: string;
  duration: number;
  encrypted: boolean;
}

interface ConferenceCall {
  id: number;
  title: string;
  room_id: string;
  call_type: 'audio' | 'video';
  status: string;
  participant_count: number;
}

type CallHistoryResponse = Call[] | { results?: Call[] };

const MEDIASOUP_URL = process.env.NEXT_PUBLIC_MEDIASOUP_URL || 'http://localhost:4000';

export default function CallsPage() {
  const { user, isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const [calls, setCalls] = useState<Call[]>([]);
  const [filter, setFilter] = useState<'all' | 'incoming' | 'outgoing' | 'missed'>('all');
  const [conferenceCall, setConferenceCall] = useState<ConferenceCall | null>(null);
  const [showConferenceModal, setShowConferenceModal] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [conferenceCallStatus, setConferenceCallStatus] = useState('');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const mediasoupClientRef = useRef<MediasoupConferenceClient | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const cameraVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const activeVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const remoteMixedStreamRef = useRef<MediaStream | null>(null);
  const remoteTrackByProducerRef = useRef<Record<string, MediaStreamTrack>>({});
  const activeConferenceRef = useRef<ConferenceCall | null>(null);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, loading, router]);

  const syncVideoElements = useCallback(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const updateRemoteMedia = useCallback((callType: 'audio' | 'video') => {
    const remoteStream = remoteMixedStreamRef.current;
    if (!remoteStream || remoteStream.getTracks().length === 0) {
      setRemoteStream(null);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
      setConferenceCallStatus('Waiting for participants...');
      return;
    }

    setRemoteStream(remoteStream);
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
    setConferenceCallStatus('Connected');
  }, []);

  const closeConferenceResources = useCallback(() => {
    if (mediasoupClientRef.current) {
      mediasoupClientRef.current.close();
      mediasoupClientRef.current = null;
    }
    remoteTrackByProducerRef.current = {};

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }

    localStreamRef.current = null;
    cameraVideoTrackRef.current = null;
    activeVideoTrackRef.current = null;
    remoteMixedStreamRef.current = null;
    activeConferenceRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setConferenceCallStatus('');
    setAudioEnabled(true);
    setVideoEnabled(true);
    setIsScreenSharing(false);

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    syncVideoElements();
  }, [syncVideoElements]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchCalls();
    }
  }, [isAuthenticated, filter]);

  useEffect(() => {
    if (isAuthenticated) {
      loadConferenceFromQuery();
    }
  }, [isAuthenticated, router.query.conference]);

  const getLocalStream = useCallback(async (callType: 'audio' | 'video') => {
    const constraints: MediaStreamConstraints = {
      video: callType === 'video',
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    setLocalStream(stream);
    localStreamRef.current = stream;
    cameraVideoTrackRef.current = stream.getVideoTracks()[0] || null;
    activeVideoTrackRef.current = stream.getVideoTracks()[0] || null;
    setAudioEnabled(true);
    setVideoEnabled(callType === 'video');
    setIsScreenSharing(false);
    return stream;
  }, []);

  const stopScreenShare = useCallback(async (restorePreview = true) => {
    if (!isScreenSharing) {
      return;
    }

    const cameraTrack = cameraVideoTrackRef.current;
    try {
      await mediasoupClientRef.current?.replaceVideoTrack(cameraTrack || null);
    } catch (error) {
      console.error('Failed restoring camera track in conference:', error);
    }

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }

    activeVideoTrackRef.current = cameraTrack || null;
    if (cameraTrack) {
      cameraTrack.enabled = videoEnabled;
    }

    if (restorePreview && localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }

    setIsScreenSharing(false);
  }, [isScreenSharing, videoEnabled]);

  const initializeConferenceCall = useCallback(
    async (conference: ConferenceCall) => {
      if (!user?.id) {
        throw new Error('You must be logged in to join conference');
      }

      closeConferenceResources();
      setConferenceCall(conference);
      setShowConferenceModal(true);
      activeConferenceRef.current = conference;

      try {
        await getLocalStream(conference.call_type);
      } catch (error) {
        console.error('Error accessing media devices:', error);
        setConferenceCallStatus('Could not access microphone/camera');
        throw error;
      }

      setConferenceCallStatus('Connecting to SFU...');

      const client = new MediasoupConferenceClient(MEDIASOUP_URL, conference.room_id, user.id);
      mediasoupClientRef.current = client;
      remoteMixedStreamRef.current = new MediaStream();

      client.onRemoteTrack((track, producerId) => {
        const currentStream = remoteMixedStreamRef.current;
        if (!currentStream) {
          return;
        }

        remoteTrackByProducerRef.current[producerId] = track;
        currentStream.addTrack(track);
        updateRemoteMedia(conference.call_type);

        track.addEventListener('ended', () => {
          const remoteStream = remoteMixedStreamRef.current;
          if (remoteStream) {
            remoteStream.removeTrack(track);
            updateRemoteMedia(conference.call_type);
          }
          delete remoteTrackByProducerRef.current[producerId];
        });
      });

      client.onProducerClosed((producerId) => {
        const track = remoteTrackByProducerRef.current[producerId];
        const remoteStream = remoteMixedStreamRef.current;
        if (track && remoteStream) {
          remoteStream.removeTrack(track);
          updateRemoteMedia(conference.call_type);
        }
        delete remoteTrackByProducerRef.current[producerId];
      });

      await client.connect();
      if (localStreamRef.current) {
        await client.startProducing(localStreamRef.current);
      }

      setConferenceCallStatus('Waiting for participants...');
    },
    [closeConferenceResources, getLocalStream, updateRemoteMedia, user?.id]
  );

  const loadConferenceFromQuery = useCallback(async () => {
    const conferenceId = Number(router.query.conference);
    if (!conferenceId || Number.isNaN(conferenceId)) {
      closeConferenceResources();
      setConferenceCall(null);
      setRemoteStream(null);
      return;
    }

    try {
      const response = await api.get(`/conference-calls/${conferenceId}/`);
      const conference = response.data as ConferenceCall;
      await api.post(`/conference-calls/${conferenceId}/join/`);
      await initializeConferenceCall(conference);
    } catch (error) {
      console.error('Error fetching conference call:', error);
      closeConferenceResources();
      setConferenceCall(null);
      setShowConferenceModal(false);
    }
  }, [closeConferenceResources, initializeConferenceCall, router.query.conference]);

  const handleToggleAudio = () => {
    if (!localStreamRef.current) {
      return;
    }

    const nextState = !audioEnabled;
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = nextState;
    });
    setAudioEnabled(nextState);
  };

  const handleToggleVideo = () => {
    const currentVideoTrack = activeVideoTrackRef.current;
    if (!currentVideoTrack) {
      return;
    }

    const nextState = !videoEnabled;
    currentVideoTrack.enabled = nextState;
    setVideoEnabled(nextState);
  };

  const handleToggleScreenShare = async () => {
    if (!conferenceCall || conferenceCall.call_type !== 'video') {
      return;
    }

    if (isScreenSharing) {
      await stopScreenShare();
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

      await mediasoupClientRef.current?.replaceVideoTrack(screenTrack);
      screenStreamRef.current = screenStream;
      activeVideoTrackRef.current = screenTrack;
      screenTrack.enabled = true;
      setVideoEnabled(true);
      setIsScreenSharing(true);

      screenTrack.onended = () => {
        stopScreenShare(false).catch((error) => {
          console.error('Failed stopping screen share after browser end:', error);
        });
      };

      if (localVideoRef.current) {
        const previewStream = new MediaStream();
        previewStream.addTrack(screenTrack);
        if (localStreamRef.current) {
          localStreamRef.current.getAudioTracks().forEach((track) => previewStream.addTrack(track));
        }
        localVideoRef.current.srcObject = previewStream;
      }
    } catch (error) {
      console.error('Failed to start screen share:', error);
    }
  };

  const handleEndConference = async () => {
    if (conferenceCall) {
      try {
        await api.post(`/conference-calls/${conferenceCall.id}/leave/`);
      } catch (error) {
        console.error('Error leaving conference call:', error);
      }
    }

    closeConferenceResources();
    setShowConferenceModal(false);
    setConferenceCall(null);
    router.push('/calls');
  };

  useEffect(() => {
    return () => {
      closeConferenceResources();
    };
  }, [closeConferenceResources]);

  const fetchCalls = async () => {
    try {
      const response = await api.get<CallHistoryResponse>('/calls/history/');
      const payload = response.data;
      if (Array.isArray(payload)) {
        setCalls(payload);
      } else {
        setCalls(payload.results || []);
      }
    } catch (error) {
      console.error('Error fetching calls:', error);
      setCalls([]);
    }
  };

  const filteredCalls = calls.filter((call) => {
    if (filter === 'all') {
      return true;
    }

    const isOutgoing = call.caller.id === user?.id;
    const isIncoming = call.receiver.id === user?.id;

    if (filter === 'incoming') {
      return isIncoming;
    }

    if (filter === 'outgoing') {
      return isOutgoing;
    }

    if (filter === 'missed') {
      return isIncoming && ['missed', 'rejected'].includes(call.status);
    }

    return true;
  });

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading || !isAuthenticated) {
    return <div className="secure-screen flex items-center justify-center text-slate-300">Loading...</div>;
  }

  return (
    <div className="secure-screen">
      {/* Header */}
      <nav className="secure-nav">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <button
                onClick={() => router.push('/dashboard')}
                className="mr-4 text-slate-400 hover:text-cyan-200 transition"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <h1 className="text-xl font-bold secure-title">Call History</h1>
            </div>
            <div className="flex items-center">
              <span className="text-sm text-slate-300">{user?.username}</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {conferenceCall && (
          <div className="secure-panel p-4 mb-6 border-cyan-300/30">
            <h2 className="text-lg font-semibold text-cyan-100 mb-1">
              {conferenceCall.title || `Conference ${conferenceCall.id}`}
            </h2>
            <p className="text-sm text-cyan-200 mb-2">
              {conferenceCall.call_type.toUpperCase()} • {conferenceCall.status} • Participants: {conferenceCall.participant_count}
            </p>
            <p className="text-sm text-slate-300 font-mono">Room ID: {conferenceCall.room_id}</p>
          </div>
        )}

        {/* Filters */}
        <div className="secure-panel p-4 mb-6">
          <div className="flex space-x-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg transition ${
                filter === 'all'
                  ? 'bg-cyan-500 text-slate-950'
                  : 'bg-cyan-500/10 text-slate-300 hover:bg-cyan-500/20'
              }`}
            >
              All Calls
            </button>
            <button
              onClick={() => setFilter('incoming')}
              className={`px-4 py-2 rounded-lg transition ${
                filter === 'incoming'
                  ? 'bg-cyan-500 text-slate-950'
                  : 'bg-cyan-500/10 text-slate-300 hover:bg-cyan-500/20'
              }`}
            >
              Incoming
            </button>
            <button
              onClick={() => setFilter('outgoing')}
              className={`px-4 py-2 rounded-lg transition ${
                filter === 'outgoing'
                  ? 'bg-cyan-500 text-slate-950'
                  : 'bg-cyan-500/10 text-slate-300 hover:bg-cyan-500/20'
              }`}
            >
              Outgoing
            </button>
            <button
              onClick={() => setFilter('missed')}
              className={`px-4 py-2 rounded-lg transition ${
                filter === 'missed'
                  ? 'bg-cyan-500 text-slate-950'
                  : 'bg-cyan-500/10 text-slate-300 hover:bg-cyan-500/20'
              }`}
            >
              Missed
            </button>
          </div>
        </div>

        {/* Call List */}
        <div className="secure-panel">
          {filteredCalls.length === 0 ? (
            <div className="p-12 text-center">
              <svg className="w-16 h-16 mx-auto text-slate-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              <p className="text-slate-400">No call history yet</p>
              <p className="text-sm text-slate-500 mt-2">Your voice and video calls will appear here</p>
            </div>
          ) : (
            <div className="divide-y divide-cyan-200/10">
              {filteredCalls.map((call) => (
                <div key={call.id} className="p-4 hover:bg-cyan-500/5 transition">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                        call.status === 'missed' ? 'bg-rose-500/20' : 'bg-cyan-500/20'
                      }`}>
                        {call.call_type === 'video' ? (
                          <svg className={`w-6 h-6 ${call.status === 'missed' ? 'text-rose-300' : 'text-cyan-200'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        ) : (
                          <svg className={`w-6 h-6 ${call.status === 'missed' ? 'text-rose-300' : 'text-cyan-200'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                        )}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-100">
                          {call.caller.id === user?.id ? call.receiver.username : call.caller.username}
                        </div>
                        <div className="text-sm text-slate-400">
                          {call.caller.id === user?.id ? 'Outgoing' : 'Incoming'} • {call.call_type}
                          {call.encrypted && (
                            <span className="ml-2 text-green-600">🔒 Encrypted</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">
                          {new Date(call.initiated_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-slate-300">
                        {call.status === 'ended' && call.duration > 0
                          ? formatDuration(call.duration)
                          : call.status}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <VideoCallModal
        isActive={showConferenceModal && !!conferenceCall}
        callTitle={conferenceCall?.title || `Group Call ${conferenceCall?.id || ''}`}
        callStatus={conferenceCallStatus || (conferenceCall?.status === 'active' ? 'Connected' : 'Waiting for participants...')}
        callType={conferenceCall?.call_type || 'video'}
        localVideoRef={localVideoRef}
        remoteVideoRef={remoteVideoRef}
        audioEnabled={audioEnabled}
        videoEnabled={videoEnabled}
        isScreenSharing={isScreenSharing}
        onToggleAudio={handleToggleAudio}
        onToggleVideo={handleToggleVideo}
        onToggleScreenShare={handleToggleScreenShare}
        onEndCall={handleEndConference}
      />
    </div>
  );
}
