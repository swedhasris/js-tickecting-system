import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useTSMeeting, RemotePeer, ChatMessage } from "../hooks/useTSMeeting";
import {
  Mic, MicOff, Video, VideoOff, Monitor, Hand, MessageSquare,
  Users, FileText, PhoneOff, Send, Paperclip, Download,
  Volume2, Shield, MoreVertical, X, Lock, CheckCircle, AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function TSMeetingRoom() {
  const { tsmId } = useParams<{ tsmId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();

  // Get configuration from Lobby, or use fallbacks
  const lobbyState = location.state || {};
  const peerName = lobbyState.name || profile?.name || user?.email?.split("@")[0] || "Guest";
  const peerId = profile?.uid || user?.email || `peer-${Math.random().toString(36).slice(2, 8)}`;
  const initialAudio = lobbyState.audioEnabled !== undefined ? lobbyState.audioEnabled : true;
  const initialVideo = lobbyState.videoEnabled !== undefined ? lobbyState.videoEnabled : true;
  const initialIsHost = lobbyState.isHost !== undefined ? lobbyState.isHost : false;

  const [activeTab, setActiveTab] = useState<"chat" | "participants" | "notes" | null>(null);
  const [meetingNotes, setMeetingNotes] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSavedTime, setNotesSavedTime] = useState<string | null>(null);
  
  // File upload state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Chat message input state
  const [chatInput, setChatInput] = useState("");
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  const handleMeetingEnded = () => {
    // Log attendance leave time before navigating away
    const leaveTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    fetch(`/api/ts-meetings/${tsmId}/leave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ peerId, name: peerName, leaveTime })
    }).finally(() => {
      navigate("/create-meeting");
    });
  };

  // Connect meeting hook
  const meeting = useTSMeeting({
    tsmId: tsmId || "",
    peerId,
    peerName,
    isHost: initialIsHost,
    preferredCameraId: lobbyState.selectedCameraId,
    preferredMicrophoneId: lobbyState.selectedMicrophoneId,
    preferredAudioEnabled: initialAudio,
    preferredVideoEnabled: initialVideo,
    onMeetingEnded: handleMeetingEnded
  });

  // Local video display
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const video = localVideoRef.current;
    if (video) {
      const stream = (meeting.isScreenSharing && meeting.screenStream)
        ? meeting.screenStream
        : meeting.localStream;

      if (stream) {
        if (video.srcObject !== stream) {
          video.srcObject = stream;
        }
        // Force play the video to prevent stuck loading/spinner state
        video.play().catch(err => {
          console.warn("Error playing local video stream:", err);
        });
      } else {
        video.srcObject = null;
      }
    }
  }, [meeting.localStream, meeting.screenStream, meeting.isScreenSharing]);

  // Log attendance join on component mount
  useEffect(() => {
    const joinTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    fetch(`/api/ts-meetings/${tsmId}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ peerId, name: peerName, joinTime })
    });

    // Load meeting notes
    fetch(`/api/ts-meetings/${tsmId}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.meeting) {
          setMeetingNotes(data.meeting.notes || "");
        }
      })
      .catch(err => console.error("Error loading notes:", err));

    return () => {
      // Log attendance leave on unmount
      const leaveTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      fetch(`/api/ts-meetings/${tsmId}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peerId, name: peerName, leaveTime })
      });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll chat to bottom on new messages
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [meeting.chatMessages]);

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    meeting.sendChat(chatInput);
    
    // Save to DB chat history
    fetch(`/api/ts-meetings/${tsmId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        senderId: peerId,
        senderName: peerName,
        text: chatInput,
        timestamp: new Date().toISOString(),
        type: "text"
      })
    });

    setChatInput("");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const formData = new FormData();
    formData.append("file", file);

    try {
      setUploadingFile(true);
      const res = await fetch("/api/moms/upload", {
        method: "POST",
        body: formData
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      
      const fileUrl = data.file_path;
      const fileName = data.file_name;

      // Send via signaling
      meeting.sendChat(`Shared file: ${fileName}`, fileUrl, fileName);

      // Save to DB
      fetch(`/api/ts-meetings/${tsmId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderId: peerId,
          senderName: peerName,
          text: `Shared file: ${fileName}`,
          timestamp: new Date().toISOString(),
          type: "file",
          fileUrl,
          fileName
        })
      });
    } catch (err) {
      console.error("Error uploading shared file:", err);
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const saveNotes = async () => {
    try {
      setNotesSaving(true);
      const res = await fetch(`/api/ts-meetings/${tsmId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: meetingNotes })
      });
      if (res.ok) {
        setNotesSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      }
    } catch (err) {
      console.error("Failed to save notes:", err);
    } finally {
      setNotesSaving(false);
    }
  };

  // Determine grid columns based on participant count
  const totalTiles = meeting.peers.length + 1; // peers + self
  const hasLocalVideo = !!meeting.localStream?.getVideoTracks().length;
  let gridCols = "grid-cols-1";
  if (totalTiles >= 2 && totalTiles <= 4) gridCols = "grid-cols-2";
  else if (totalTiles > 4) gridCols = "grid-cols-3";

  return (
    <div className="dark fixed inset-0 z-50 bg-slate-950 text-slate-100 flex flex-col font-sans overflow-hidden">
      {/* Top Bar */}
      <header className="px-6 py-3 border-b border-slate-900 bg-slate-950/80 backdrop-blur-md flex items-center justify-between z-10">
        <div className="flex items-center space-x-3">
          <div className="bg-blue-500/10 text-blue-400 p-1.5 rounded-lg border border-blue-500/20">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-wide flex items-center space-x-2">
              <span>TS Meeting: {tsmId}</span>
              {meeting.isHost && (
                <span className="bg-red-500/10 border border-red-500/20 text-red-400 px-2 py-0.5 rounded text-[10px] uppercase font-semibold">
                  HOST
                </span>
              )}
            </h1>
            <p className="text-[10px] text-slate-400">Secure Peer-to-Peer Encryption Active</p>
          </div>
        </div>

        {/* Info badges */}
        <div className="flex items-center space-x-3">
          <div className="bg-slate-900 border border-slate-800 px-3 py-1 rounded-full text-xs text-slate-400 flex items-center space-x-1.5">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            <span>{meeting.participantCount} Connected</span>
          </div>
          <div className="bg-emerald-950/40 border border-emerald-500/20 px-3 py-1 rounded-full text-xs text-emerald-400 flex items-center space-x-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Live Stream</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 px-3 py-1 rounded-full text-xs text-slate-300">
            Network: {meeting.diagnostics.networkQuality}
          </div>
        </div>
      </header>

      {/* Workspace Area: Video + Sidebar */}
      <div className="flex-grow flex relative overflow-hidden">
        {/* Left Side: Video Grid */}
        <div className="flex-grow p-6 flex flex-col justify-between bg-slate-900/30 overflow-y-auto">
          {meeting.error && (
            <div className="max-w-xl mx-auto w-full mb-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 flex items-start space-x-3 text-yellow-500 text-xs">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-bold uppercase tracking-wider mb-0.5">Media Access Issue</p>
                <p className="text-slate-400">{meeting.error} Click the lock icon in the URL bar to verify permissions.</p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => meeting.retryConnection()}
                    className="px-3 py-1.5 rounded-lg border border-yellow-500/30 bg-slate-950/60 text-yellow-400 hover:text-yellow-300"
                  >
                    Retry
                  </button>
                  <button
                    onClick={() => meeting.refreshDevices()}
                    className="px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-950/60 text-slate-300 hover:text-white"
                  >
                    Refresh Devices
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className={`grid ${gridCols} gap-4 flex-grow items-center justify-center max-w-5xl mx-auto w-full`}>
            
            {/* Local participant video tile */}
            <div className="relative glass-panel rounded-2xl overflow-hidden aspect-video bg-slate-900 border border-slate-800/80 shadow-lg flex items-center justify-center">
              {meeting.localStream && hasLocalVideo && !meeting.isCameraOff ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover scale-x-[-1]"
                />
              ) : (
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-xl font-bold text-white mx-auto mb-2">
                    {peerName[0]?.toUpperCase()}
                  </div>
                  <p className="text-slate-400 text-sm font-semibold">{peerName} (You)</p>
                </div>
              )}

              {/* Badges overlay */}
              <div className="absolute bottom-3 left-3 bg-slate-950/80 backdrop-blur px-2.5 py-1 rounded-md text-xs text-white flex items-center space-x-1.5 border border-slate-800">
                <span>{peerName} (You)</span>
                {meeting.isMuted && <MicOff className="w-3.5 h-3.5 text-red-500" />}
              </div>

              {meeting.handRaised && (
                <div className="absolute top-3 right-3 bg-yellow-500 text-slate-950 px-2 py-1 rounded-md text-xs font-bold flex items-center space-x-1 animate-bounce">
                  <span>✋ Hand Raised</span>
                </div>
              )}
            </div>

            {/* Remote participants video tiles */}
            {meeting.peers.map((p) => (
              <RemoteVideoTile key={p.peerId} peer={p} />
            ))}
          </div>
        </div>

        {/* Right Side: Sidebar Panels */}
        {activeTab !== null && (
          <aside className="w-96 border-l border-slate-900 bg-slate-950 flex flex-col shadow-2xl z-10 transition-all duration-300">
            {/* Panel Header */}
            <div className="px-5 py-4 border-b border-slate-900 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                {activeTab === "chat" && (
                  <>
                    <MessageSquare className="w-4 h-4 text-blue-400" />
                    <span>Meeting Chat</span>
                  </>
                )}
                {activeTab === "participants" && (
                  <>
                    <Users className="w-4 h-4 text-blue-400" />
                    <span>Participants ({meeting.peers.length + 1})</span>
                  </>
                )}
                {activeTab === "notes" && (
                  <>
                    <FileText className="w-4 h-4 text-blue-400" />
                    <span>Meeting Notes (MOM)</span>
                  </>
                )}
              </h3>
              <button
                onClick={() => setActiveTab(null)}
                className="p-1 text-slate-500 hover:text-white rounded-lg hover:bg-slate-900 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Panel Body */}
            <div className="flex-grow overflow-y-auto custom-scrollbar p-4">
              
              {/* Chat tab */}
              {activeTab === "chat" && (
                <div className="h-full flex flex-col justify-between">
                  <div className="flex-grow overflow-y-auto pr-1 mb-4 flex flex-col space-y-3 custom-scrollbar">
                    {meeting.chatMessages.length === 0 && (
                      <div className="text-center py-8 text-slate-600 text-sm">
                        No messages yet. Send a message to start chatting.
                      </div>
                    )}
                    {meeting.chatMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex flex-col max-w-[85%] ${
                          msg.senderId === peerId
                            ? "self-end items-end"
                            : msg.senderId === "system"
                            ? "mx-auto items-center"
                            : "self-start items-start"
                        }`}
                      >
                        {msg.type === "system" ? (
                          <div className="bg-slate-900 border border-slate-800 text-slate-400 px-3 py-1 rounded-full text-[10px] text-center font-medium my-1">
                            {msg.text}
                          </div>
                        ) : (
                          <>
                            <span className="text-[10px] text-slate-500 mb-1 px-1">{msg.senderName}</span>
                            <div
                              className={`p-3 rounded-2xl text-sm border ${
                                msg.senderId === peerId
                                  ? "bg-blue-500/10 border-blue-500/20 text-white rounded-tr-none"
                                  : "bg-slate-900 border-slate-800 text-slate-200 rounded-tl-none"
                              }`}
                            >
                              {msg.type === "file" ? (
                                <div className="flex items-center space-x-3">
                                  <div className="bg-slate-950 p-2 rounded-lg text-blue-400">
                                    <Paperclip className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <p className="text-xs font-semibold text-white truncate max-w-[150px]">{msg.fileName}</p>
                                    <a
                                      href={msg.fileUrl}
                                      download={msg.fileName}
                                      className="text-[10px] text-blue-400 hover:text-blue-300 font-bold flex items-center mt-1"
                                    >
                                      <Download className="w-3.5 h-3.5 mr-1" /> Download
                                    </a>
                                  </div>
                                </div>
                              ) : (
                                <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                    <div ref={chatBottomRef} />
                  </div>

                  {/* Chat input form */}
                  <form onSubmit={handleSendChat} className="border-t border-slate-900 pt-3 flex space-x-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={uploadingFile}
                      onClick={() => fileInputRef.current?.click()}
                      className={`p-3 rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:text-white transition-colors ${
                        uploadingFile ? "animate-pulse" : ""
                      }`}
                      title="Share File"
                    >
                      <Paperclip className="w-5 h-5" />
                    </button>
                    <div className="relative flex-grow">
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder="Type message..."
                        className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl py-3 pl-4 pr-10 text-sm text-white placeholder-slate-600 outline-none transition-all"
                      />
                      <button
                        type="submit"
                        className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-blue-500 hover:text-blue-400 transition-colors"
                      >
                        <Send className="w-5 h-5" />
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Participants tab */}
              {activeTab === "participants" && (
                <div className="flex flex-col space-y-3">
                  {/* Self participant */}
                  <div className="bg-slate-900/60 border border-slate-800 p-3.5 rounded-xl flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 font-bold flex items-center justify-center text-xs">
                        {peerName[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{peerName} (You)</p>
                        <p className="text-[10px] text-slate-500">
                          {meeting.isHost ? "Host" : "Participant"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {meeting.isMuted ? (
                        <MicOff className="w-4 h-4 text-red-500" />
                      ) : (
                        <Mic className="w-4 h-4 text-slate-400" />
                      )}
                      {meeting.isCameraOff ? (
                        <VideoOff className="w-4 h-4 text-red-500" />
                      ) : (
                        <Video className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </div>

                  <div className="bg-slate-900/30 border border-slate-800/40 p-3.5 rounded-xl space-y-3">
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Camera Device</label>
                      <select
                        value={meeting.selectedCameraId}
                        onChange={(e) => meeting.selectCamera(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 px-3 text-sm text-white outline-none"
                      >
                        {meeting.availableCameras.length === 0 && <option value="">No camera detected</option>}
                        {meeting.availableCameras.map((device, index) => (
                          <option key={device.deviceId || `room-camera-${index}`} value={device.deviceId}>
                            {device.label || `Camera ${index + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Microphone Device</label>
                      <select
                        value={meeting.selectedMicrophoneId}
                        onChange={(e) => meeting.selectMicrophone(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 px-3 text-sm text-white outline-none"
                      >
                        {meeting.availableMicrophones.length === 0 && <option value="">No microphone detected</option>}
                        {meeting.availableMicrophones.map((device, index) => (
                          <option key={device.deviceId || `room-mic-${index}`} value={device.deviceId}>
                            {device.label || `Microphone ${index + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => meeting.retryConnection()}
                        className="px-3 py-2 rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:text-white text-xs font-semibold"
                      >
                        Reconnect
                      </button>
                      <button
                        onClick={() => meeting.refreshDevices()}
                        className="px-3 py-2 rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:text-white text-xs font-semibold"
                      >
                        Refresh Devices
                      </button>
                    </div>
                  </div>

                  {/* Remote participants list */}
                  {meeting.peers.map((p) => (
                    <div
                      key={p.peerId}
                      className="bg-slate-900/30 border border-slate-800/40 p-3.5 rounded-xl flex items-center justify-between hover:bg-slate-900/50 transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-slate-800 text-slate-300 font-bold flex items-center justify-center text-xs">
                          {p.name[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">{p.name}</p>
                          <p className="text-[10px] text-slate-500">Participant</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <div className="flex items-center space-x-2">
                          {p.audioMuted ? (
                            <MicOff className="w-4 h-4 text-red-500" />
                          ) : (
                            <Mic className="w-4 h-4 text-slate-400" />
                          )}
                          {p.videoMuted ? (
                            <VideoOff className="w-4 h-4 text-red-500" />
                          ) : (
                            <Video className="w-4 h-4 text-slate-400" />
                          )}
                        </div>

                        {/* Host mute controls */}
                        {meeting.isHost && (
                          <button
                            onClick={() => meeting.mutePeer(p.peerId)}
                            className="p-1 bg-slate-800 hover:bg-red-950 border border-slate-700 text-slate-400 hover:text-red-400 rounded-lg text-xs font-semibold transition-colors"
                            title="Force Mute Peer"
                          >
                            Mute
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-400 space-y-1">
                    <p>Camera: {meeting.diagnostics.cameraStatus}</p>
                    <p>Microphone: {meeting.diagnostics.microphoneStatus}</p>
                    <p>Connection: {meeting.diagnostics.connectionStatus}</p>
                    <p>Audio: {meeting.diagnostics.audioStatus}</p>
                    <p>Video: {meeting.diagnostics.videoStatus}</p>
                    <p>Network: {meeting.diagnostics.networkQuality}</p>
                    <p>WebRTC: {meeting.diagnostics.webrtcConnectionState}</p>
                    <p>ICE: {meeting.diagnostics.iceConnectionState}</p>
                    <p>Signaling: {meeting.diagnostics.signalingState}</p>
                  </div>
                </div>
              )}

              {/* Notes tab */}
              {activeTab === "notes" && (
                <div className="h-full flex flex-col justify-between">
                  <div className="flex-grow mb-4 flex flex-col">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                      Minutes of Meeting (MOM)
                    </label>
                    <textarea
                      value={meetingNotes}
                      onChange={(e) => setMeetingNotes(e.target.value)}
                      className="w-full flex-grow bg-slate-900 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl p-4 text-sm text-slate-200 outline-none transition-all resize-none custom-scrollbar min-h-[300px]"
                      placeholder="Write notes, action items, or remarks here..."
                    />
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-900 pt-3">
                    <span className="text-[10px] text-slate-500">
                      {notesSavedTime ? `Saved at ${notesSavedTime}` : "Not saved yet"}
                    </span>
                    <Button
                      onClick={saveNotes}
                      disabled={notesSaving}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase px-4 py-2 rounded-lg"
                    >
                      {notesSaving ? "Saving..." : "Save Notes"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Bottom Control Bar */}
      <footer className="px-6 py-4 border-t border-slate-900 bg-slate-950 flex items-center justify-between z-10">
        {/* Left indicators */}
        <div className="hidden sm:flex items-center space-x-2 text-xs text-slate-500 font-semibold uppercase tracking-wider">
          <Volume2 className="w-4 h-4 text-slate-400" />
          <span>{meeting.connectionState} • {meeting.diagnostics.cameraStatus} cam • {meeting.diagnostics.microphoneStatus} mic</span>
        </div>

        {/* Center control buttons */}
        <div className="flex items-center space-x-4 mx-auto sm:mx-0">
          {/* Microphone */}
          <button
            onClick={() => meeting.toggleMute()}
            className={`p-3.5 rounded-full border transition-all duration-300 relative ${
              !meeting.isMuted
                ? "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800"
                : "bg-red-600 border-red-500 text-white hover:bg-red-700"
            }`}
            title={!meeting.isMuted ? "Mute Microphone" : "Unmute Microphone"}
          >
            {!meeting.isMuted ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>

          {/* Camera */}
          <button
            onClick={() => meeting.toggleCamera()}
            className={`p-3.5 rounded-full border transition-all duration-300 relative ${
              !meeting.isCameraOff
                ? "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800"
                : "bg-red-600 border-red-500 text-white hover:bg-red-700"
            }`}
            title={!meeting.isCameraOff ? "Turn Camera Off" : "Turn Camera On"}
          >
            {!meeting.isCameraOff ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>

          {/* Screen Share */}
          <button
            onClick={() => meeting.toggleScreenShare()}
            className={`p-3.5 rounded-full border transition-all duration-300 ${
              meeting.isScreenSharing
                ? "bg-emerald-600 border-emerald-500 text-white hover:bg-emerald-700"
                : "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800"
            }`}
            title={meeting.isScreenSharing ? "Stop Sharing Screen" : "Share Screen"}
          >
            <Monitor className="w-5 h-5" />
          </button>

          {/* Hand Raise */}
          <button
            onClick={() => meeting.raiseHand()}
            className={`p-3.5 rounded-full border transition-all duration-300 ${
              meeting.handRaised
                ? "bg-yellow-500 border-yellow-400 text-slate-950 hover:bg-yellow-600"
                : "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800"
            }`}
            title="Raise / Lower Hand"
          >
            <Hand className="w-5 h-5" />
          </button>

          {/* Leave/End Meeting */}
          {meeting.isHost ? (
            <button
              onClick={() => {
                if (window.confirm("Are you sure you want to end this meeting for everyone?")) {
                  meeting.endMeeting();
                }
              }}
              className="p-3.5 bg-red-600 hover:bg-red-700 border border-red-500 text-white rounded-full transition-all flex items-center justify-center shadow-lg hover:shadow-red-500/20"
              title="End Meeting for All"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={handleMeetingEnded}
              className="p-3.5 bg-red-600 hover:bg-red-700 border border-red-500 text-white rounded-full transition-all flex items-center justify-center shadow-lg hover:shadow-red-500/20"
              title="Leave Meeting"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Right side tab toggles */}
        <div className="flex items-center space-x-2">
          {/* Chat Toggle */}
          <button
            onClick={() => setActiveTab(activeTab === "chat" ? null : "chat")}
            className={`p-3 rounded-xl border transition-all duration-200 flex items-center space-x-1.5 ${
              activeTab === "chat"
                ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                : "bg-slate-900/60 border-slate-900 text-slate-400 hover:text-white"
            }`}
            title="Chat Sidebar"
          >
            <MessageSquare className="w-4 h-4" />
            <span className="text-xs font-semibold hidden md:inline">Chat</span>
          </button>

          {/* Participants Toggle */}
          <button
            onClick={() => setActiveTab(activeTab === "participants" ? null : "participants")}
            className={`p-3 rounded-xl border transition-all duration-200 flex items-center space-x-1.5 ${
              activeTab === "participants"
                ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                : "bg-slate-900/60 border-slate-900 text-slate-400 hover:text-white"
            }`}
            title="Participants Panel"
          >
            <Users className="w-4 h-4" />
            <span className="text-xs font-semibold hidden md:inline">Peers</span>
          </button>

          {/* Notes Toggle */}
          <button
            onClick={() => setActiveTab(activeTab === "notes" ? null : "notes")}
            className={`p-3 rounded-xl border transition-all duration-200 flex items-center space-x-1.5 ${
              activeTab === "notes"
                ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                : "bg-slate-900/60 border-slate-900 text-slate-400 hover:text-white"
            }`}
            title="Meeting Notes"
          >
            <FileText className="w-4 h-4" />
            <span className="text-xs font-semibold hidden md:inline">Notes</span>
          </button>
        </div>
      </footer>
    </div>
  );
}

// ── Remote Video Tile Component ──────────────────────────────────────────────

function RemoteVideoTile({ peer }: { peer: RemotePeer; key?: any }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (video && peer.stream) {
      if (video.srcObject !== peer.stream) {
        video.srcObject = peer.stream;
      }
      // Force play the video to prevent stuck loading/spinner state
      video.play().catch(err => {
        console.warn("Error playing remote video stream:", err);
      });
    }
  }, [peer.stream]);

  return (
    <div className="relative glass-panel rounded-2xl overflow-hidden aspect-video bg-slate-900 border border-slate-800/80 shadow-lg flex items-center justify-center">
      {peer.stream && !peer.videoMuted ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-xl font-bold text-white mx-auto mb-2">
            {peer.name[0]?.toUpperCase()}
          </div>
          <p className="text-slate-400 text-sm font-semibold">{peer.name}</p>
        </div>
      )}

      {/* Name and audio status tag */}
      <div className="absolute bottom-3 left-3 bg-slate-950/80 backdrop-blur px-2.5 py-1 rounded-md text-xs text-white flex items-center space-x-1.5 border border-slate-800">
        <span>{peer.name}</span>
        {peer.audioMuted && <MicOff className="w-3.5 h-3.5 text-red-500" />}
      </div>

      {peer.handRaised && (
        <div className="absolute top-3 right-3 bg-yellow-500 text-slate-950 px-2 py-1 rounded-md text-xs font-bold flex items-center space-x-1 animate-bounce">
          <span>✋ Hand Raised</span>
        </div>
      )}
    </div>
  );
}
