interface VideoCallModalProps {
  isActive: boolean;
  callTitle: string;
  callStatus: string;
  callType: 'audio' | 'video';
  localVideoRef: React.RefObject<HTMLVideoElement>;
  remoteVideoRef: React.RefObject<HTMLVideoElement>;
  audioEnabled: boolean;
  videoEnabled: boolean;
  isScreenSharing?: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare?: () => void;
  onEndCall: () => void;
}

export default function VideoCallModal({
  isActive,
  callTitle,
  callStatus,
  callType,
  localVideoRef,
  remoteVideoRef,
  audioEnabled,
  videoEnabled,
  isScreenSharing = false,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onEndCall,
}: VideoCallModalProps) {
  if (!isActive) return null;

  const isVideoCall = callType === 'video';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary to-secondary text-white p-6">
          <h2 className="text-2xl font-bold">{callTitle}</h2>
          <span className="text-sm opacity-90">{callStatus}</span>
        </div>

        {/* Video/Audio Container */}
        <div className="relative bg-gray-900" style={{ aspectRatio: isVideoCall ? '16/9' : '16/4' }}>
          {isVideoCall ? (
            <>
              {/* Remote Video */}
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                controls
                className="w-full h-full object-cover"
              />

              {/* Local Video (PiP) */}
              <div className="absolute bottom-4 right-4 w-48 h-36 bg-gray-800 rounded-xl overflow-hidden shadow-2xl border-2 border-white">
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              </div>
            </>
          ) : (
            /* Audio Call UI */
            <div className="flex items-center justify-center h-full py-12">
              <div className="text-center text-white">
                <div className="w-32 h-32 mx-auto mb-6 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center shadow-lg">
                  <span className="text-6xl">🎤</span>
                </div>
                <h3 className="text-2xl font-semibold mb-2">Audio Call</h3>
                <p className="text-gray-300">{callStatus}</p>
              </div>
              {/* Hidden audio elements */}
              <video ref={remoteVideoRef} autoPlay playsInline className="hidden" />
              <video ref={localVideoRef} autoPlay muted playsInline className="hidden" />
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="p-6 bg-gray-50 flex justify-center space-x-4">
          <button
            onClick={onToggleAudio}
            className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl transition-all ${
              audioEnabled
                ? 'bg-gray-200 hover:bg-gray-300'
                : 'bg-red-500 hover:bg-red-600 text-white'
            }`}
            title={audioEnabled ? 'Mute Audio' : 'Unmute Audio'}
          >
            {audioEnabled ? '🎤' : '🔇'}
          </button>

          {isVideoCall && (
            <button
              onClick={onToggleVideo}
              className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl transition-all ${
                videoEnabled
                  ? 'bg-gray-200 hover:bg-gray-300'
                  : 'bg-red-500 hover:bg-red-600 text-white'
              }`}
              title={videoEnabled ? 'Stop Video' : 'Start Video'}
            >
              {videoEnabled ? '📹' : '📷'}
            </button>
          )}

          {isVideoCall && onToggleScreenShare && (
            <button
              onClick={onToggleScreenShare}
              className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl transition-all ${
                isScreenSharing
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-gray-200 hover:bg-gray-300'
              }`}
              title={isScreenSharing ? 'Stop Screen Share' : 'Start Screen Share'}
            >
              {isScreenSharing ? '🖥️' : '🪟'}
            </button>
          )}

          <button
            onClick={onEndCall}
            className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center text-2xl transition-all"
            title="End Call"
          >
            📵
          </button>
        </div>
      </div>
    </div>
  );
}
