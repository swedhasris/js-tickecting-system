import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  Video, VideoOff, Mic, MicOff, ArrowLeft, Play, Shield,
  User, CheckCircle, AlertCircle, RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface TSMeeting {
  tsm_id: string;
  title: string;
  description: string;
  meeting_date: string;
  meeting_time: string;
  duration: string;
  organizer: string;
  participants: string; // JSON
  meeting_type: string;
  priority: string;
  status: string;
  room_id: string;
  password?: string;
  notes?: string;
}

function buildLobbyMediaAttempts(options: {
  videoEnabled: boolean;
  audioEnabled: boolean;
  selectedCameraId: string;
  selectedMicrophoneId: string;
}): MediaStreamConstraints[] {
  const { videoEnabled, audioEnabled, selectedCameraId, selectedMicrophoneId } = options;

  const exactVideo = videoEnabled ? {
    deviceId: selectedCameraId ? { exact: selectedCameraId } : undefined,
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30, max: 30 }
  } : false;
  const exactAudio = audioEnabled ? {
    deviceId: selectedMicrophoneId ? { exact: selectedMicrophoneId } : undefined,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  } : false;

  const softVideo = videoEnabled ? {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30, max: 30 },
    ...(selectedCameraId ? { deviceId: { ideal: selectedCameraId } } : {})
  } : false;
  const softAudio = audioEnabled ? {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    ...(selectedMicrophoneId ? { deviceId: { ideal: selectedMicrophoneId } } : {})
  } : false;

  const attempts: MediaStreamConstraints[] = [
    { video: exactVideo, audio: exactAudio },
    { video: softVideo, audio: softAudio },
    { video: videoEnabled ? true : false, audio: softAudio },
    { video: videoEnabled ? true : false, audio: audioEnabled ? true : false }
  ];

  if (videoEnabled && audioEnabled) {
    attempts.push({ video: videoEnabled ? true : false, audio: false });
    attempts.push({ video: false, audio: audioEnabled ? true : false });
  }

  return attempts;
}

export function TSMeetingLobby() {
  const { tsmId } = useParams<{ tsmId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();

  const [meeting, setMeeting] = useState<TSMeeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form / Preview States
  const [name, setName] = useState(profile?.name || user?.email?.split("@")[0] || "Guest");
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<"idle" | "requesting" | "granted" | "denied">("idle");
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [availableMicrophones, setAvailableMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState("");
  const [micLevel, setMicLevel] = useState(0);

  // Video preview element
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number | null>(null);

  // Check if we are redirection-joining or coming with query state
  useEffect(() => {
    if (profile?.name) {
      setName(profile.name);
    }
  }, [profile]);

  // Load meeting details
  useEffect(() => {
    let active = true;
    const fetchMeeting = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/ts-meetings/${tsmId}`);
        if (!res.ok) {
          throw new Error("Failed to load meeting details. Ensure the meeting room exists.");
        }
        const data = await res.json();
        if (data.success && active) {
          setMeeting(data.meeting);
        } else if (active) {
          throw new Error(data.error || "Could not retrieve meeting.");
        }
      } catch (err: any) {
        if (active) setError(err.message || "An error occurred.");
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchMeeting();
    return () => {
      active = false;
    };
  }, [tsmId]);

  useEffect(() => {
    let active = true;

    const loadDevices = async () => {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!active) return;
        const cameras = devices.filter((device) => device.kind === "videoinput");
        const microphones = devices.filter((device) => device.kind === "audioinput");
        setAvailableCameras(cameras);
        setAvailableMicrophones(microphones);
        setSelectedCameraId((prev) => prev || cameras[0]?.deviceId || "");
        setSelectedMicrophoneId((prev) => prev || microphones[0]?.deviceId || "");
      } catch (err) {
        console.warn("Failed to enumerate media devices:", err);
      }
    };

    void loadDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", loadDevices);

    return () => {
      active = false;
      navigator.mediaDevices?.removeEventListener?.("devicechange", loadDevices);
    };
  }, []);

  // Initialize and update local stream preview
  useEffect(() => {
    let active = true;

    const stopMicMeter = () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      setMicLevel(0);
    };

    const startMicMeter = (stream: MediaStream) => {
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) {
        stopMicMeter();
        return;
      }

      stopMicMeter();

      const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return;

      const audioContext = new AudioContextCtor();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteFrequencyData(data);
        const average = data.reduce((sum, value) => sum + value, 0) / Math.max(1, data.length);
        setMicLevel(Math.min(100, Math.round((average / 255) * 100)));
        animationRef.current = requestAnimationFrame(tick);
      };

      tick();
    };

    async function startPreview() {
      // Stop existing tracks first
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      stopMicMeter();

      if (!videoEnabled && !audioEnabled) {
        if (videoRef.current) videoRef.current.srcObject = null;
        setPermissionStatus("idle");
        return;
      }

      try {
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        const hasCamera = devices.some((d) => d.kind === "videoinput");
        const hasMicrophone = devices.some((d) => d.kind === "audioinput");

        const activeVideo = videoEnabled && hasCamera;
        const activeAudio = audioEnabled && hasMicrophone;

        if (!activeVideo && !activeAudio) {
          if (videoRef.current) videoRef.current.srcObject = null;
          setPermissionStatus("idle");
          return;
        }

        setPermissionStatus("requesting");
        const attempts = buildLobbyMediaAttempts({
          videoEnabled: activeVideo,
          audioEnabled: activeAudio,
          selectedCameraId,
          selectedMicrophoneId,
        });
        let stream: MediaStream | null = null;
        let lastError: any = null;

        for (const attempt of attempts) {
          try {
            stream = await navigator.mediaDevices.getUserMedia(attempt);
            break;
          } catch (err) {
            lastError = err;
          }
        }

        if (!stream) {
          throw lastError || new Error("Unable to access selected media devices");
        }
        
        if (active) {
          streamRef.current = stream;
          if (videoRef.current) {
            const hasVideo = stream.getVideoTracks().length > 0;
            videoRef.current.srcObject = hasVideo ? stream : null;
            if (hasVideo) {
              videoRef.current.play().catch(err => console.warn("Lobby video play failed:", err));
            }
          }
          startMicMeter(stream);
          setPermissionStatus("granted");
          setMediaError(null);
          setVideoEnabled(stream.getVideoTracks().length > 0);
          setAudioEnabled(stream.getAudioTracks().length > 0);
          const devices = await navigator.mediaDevices.enumerateDevices();
          if (active) {
            const cameras = devices.filter((device) => device.kind === "videoinput");
            const microphones = devices.filter((device) => device.kind === "audioinput");
            setAvailableCameras(cameras);
            setAvailableMicrophones(microphones);
            if (!selectedCameraId && cameras[0]) setSelectedCameraId(cameras[0].deviceId);
            if (!selectedMicrophoneId && microphones[0]) setSelectedMicrophoneId(microphones[0].deviceId);
          }
        } else {
          stream.getTracks().forEach(track => track.stop());
        }
      } catch (err: any) {
        console.error("Error accessing camera preview:", err);
        if (active) {
          setPermissionStatus(
            err.name === "NotAllowedError" || err.name === "PermissionDeniedError" ? "denied" : "idle"
          );
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            setMediaError("WebRTC is not supported or secure context (HTTPS/localhost) is required.");
          } else if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
            setMediaError("Camera/Microphone access was denied. Click the lock icon in your URL bar next to the domain to allow access.");
          } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
            setMediaError("No camera or microphone device was detected on your system.");
          } else {
            setMediaError(`Failed to access media devices: ${err.message || err}`);
          }
        }
        if (active) {
          setVideoEnabled(false);
          setAudioEnabled(false);
        }
      }
    }

    startPreview();

    return () => {
      active = false;
      stopMicMeter();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [videoEnabled, audioEnabled, selectedCameraId, selectedMicrophoneId]);

  const handleJoin = () => {
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }

    if (meeting?.password && meeting.password !== passwordInput) {
      setPasswordError("Incorrect meeting password.");
      return;
    }

    // Stop tracks before navigation
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }

    const isHost = meeting?.organizer === name || meeting?.organizer === profile?.name || meeting?.organizer === user?.email;

    // Navigate to room
    navigate(`/ts-meeting/${tsmId}/room`, {
      state: {
        name,
        audioEnabled,
        videoEnabled,
        selectedCameraId,
        selectedMicrophoneId,
        isHost
      }
    });
  };

  if (loading) {
    return (
      <div className="dark min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white">
        <RefreshCw className="w-12 h-12 text-cyan-400 animate-spin mb-4" />
        <p className="text-slate-400 text-lg font-medium">Loading TS Meeting Room...</p>
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="dark min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white p-6">
        <div className="glass-panel max-w-md w-full p-8 rounded-2xl border border-red-500/20 text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Access Error</h2>
          <p className="text-slate-400 mb-6">{error || "TS Meeting Room does not exist."}</p>
          <Button variant="outline" className="w-full text-slate-300 hover:text-white" onClick={() => navigate("/create-meeting")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Meetings
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="dark min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between font-sans">
      {/* Header */}
      <header className="px-8 py-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Button variant="ghost" className="p-2 text-slate-400 hover:text-white" onClick={() => navigate("/create-meeting")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-white tracking-wide">TS Meeting Lobby</h1>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">{meeting.tsm_id} &bull; Room: {meeting.room_id}</p>
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full text-xs text-cyan-400 font-semibold flex items-center space-x-1.5">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
          <span>CYBER-OPS SECURE LINK</span>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-grow max-w-6xl w-full mx-auto px-6 py-12 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        {/* Left Column: Media Preview */}
        <div className="flex flex-col items-center justify-center">
          <div className="relative w-full max-w-lg aspect-video rounded-3xl overflow-hidden bg-slate-900 border border-slate-800 shadow-2xl flex items-center justify-center">
            {mediaError ? (
              <div className="text-center max-w-xs px-4">
                <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
                <p className="text-slate-300 text-sm font-semibold mb-1">Hardware Access Issue</p>
                <p className="text-slate-400 text-xs leading-relaxed">{mediaError}</p>
              </div>
            ) : videoEnabled ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1]"
              />
            ) : (
              <div className="text-center">
                <VideoOff className="w-16 h-16 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">Camera is disabled</p>
              </div>
            )}

            {/* Quick overlay controls */}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-4">
              <button
                onClick={() => setAudioEnabled(!audioEnabled)}
                className={`p-3.5 rounded-full border transition-all duration-300 ${
                  audioEnabled
                    ? "bg-slate-800/90 border-slate-700 text-white hover:bg-slate-700"
                    : "bg-red-600/90 border-red-500 text-white hover:bg-red-700"
                }`}
                title={audioEnabled ? "Mute Microphone" : "Unmute Microphone"}
              >
                {audioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              </button>
              <button
                onClick={() => setVideoEnabled(!videoEnabled)}
                className={`p-3.5 rounded-full border transition-all duration-300 ${
                  videoEnabled
                    ? "bg-slate-800/90 border-slate-700 text-white hover:bg-slate-700"
                    : "bg-red-600/90 border-red-500 text-white hover:bg-red-700"
                }`}
                title={videoEnabled ? "Turn Camera Off" : "Turn Camera On"}
              >
                {videoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
              </button>
            </div>
          </div>
          <p className="text-slate-400 text-sm mt-4">
            Test your video and audio devices before entering the meeting.
          </p>
          <div className="w-full max-w-lg mt-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Camera
                </label>
                <select
                  value={selectedCameraId}
                  onChange={(e) => setSelectedCameraId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 px-3 text-sm text-white outline-none"
                >
                  {availableCameras.length === 0 && <option value="">No camera detected</option>}
                  {availableCameras.map((device, index) => (
                    <option key={device.deviceId || `camera-${index}`} value={device.deviceId}>
                      {device.label || `Camera ${index + 1}`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Microphone
                </label>
                <select
                  value={selectedMicrophoneId}
                  onChange={(e) => setSelectedMicrophoneId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 px-3 text-sm text-white outline-none"
                >
                  {availableMicrophones.length === 0 && <option value="">No microphone detected</option>}
                  {availableMicrophones.map((device, index) => (
                    <option key={device.deviceId || `mic-${index}`} value={device.deviceId}>
                      {device.label || `Microphone ${index + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between text-xs text-slate-300 mb-2">
                <span>Permission status: {permissionStatus}</span>
                <span>Mic test: {audioEnabled ? `${micLevel}%` : "off"}</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-cyan-400 transition-all duration-150" style={{ width: `${micLevel}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Meeting Info & Entry Form */}
        <div className="glass-panel p-8 rounded-3xl border border-slate-800 shadow-2xl flex flex-col justify-center">
          <div className="mb-6">
            <span className="bg-purple-950/40 border border-purple-500/30 text-purple-400 px-3 py-1 rounded-md text-xs font-semibold uppercase tracking-wider">
              {meeting.meeting_type} Meeting
            </span>
            <h2 className="text-3xl font-extrabold text-white mt-2 leading-tight">{meeting.title}</h2>
            {meeting.description && (
              <p className="text-slate-400 text-sm mt-2 line-clamp-2">{meeting.description}</p>
            )}
            <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-400">
              <div>Organizer: <strong className="text-slate-200">{meeting.organizer}</strong></div>
              <div>Date: <strong className="text-slate-200">{meeting.meeting_date}</strong></div>
              <div>Time: <strong className="text-slate-200">{meeting.meeting_time} ({meeting.duration})</strong></div>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-800">
            {/* Display Name Input */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Your Display Name
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                  <User className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder-slate-600 outline-none transition-all"
                  placeholder="Enter name..."
                />
              </div>
            </div>

            {/* Password input if needed */}
            {meeting.password && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Meeting Password
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                    <Shield className="w-4 h-4" />
                  </span>
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={(e) => {
                      setPasswordInput(e.target.value);
                      setPasswordError("");
                    }}
                    className={`w-full bg-slate-900 border ${
                      passwordError ? "border-red-500" : "border-slate-800 focus:border-blue-500"
                    } focus:ring-1 focus:ring-blue-500 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder-slate-600 outline-none transition-all`}
                    placeholder="Enter password to join..."
                  />
                </div>
                {passwordError && (
                  <p className="text-xs text-red-500 mt-1 font-medium">{passwordError}</p>
                )}
              </div>
            )}

            {/* Join Button */}
            <Button
              onClick={handleJoin}
              className="w-full py-4 mt-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm tracking-wider uppercase transition-all shadow-lg hover:shadow-blue-500/20"
            >
              <Play className="w-4 h-4 mr-2" /> Join Meeting Room
            </Button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center border-t border-slate-900 bg-slate-950 text-xs text-slate-600 font-medium">
        TS Meeting &bull; Powered by WebRTC Secure Peer-to-Peer &bull; &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
