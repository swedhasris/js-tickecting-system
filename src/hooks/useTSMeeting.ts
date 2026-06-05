import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type DevicePermissionState = "prompt" | "granted" | "denied" | "unsupported";

export interface RemotePeer {
  peerId: string;
  name: string;
  stream: MediaStream | null;
  audioMuted: boolean;
  videoMuted: boolean;
  handRaised: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
  type: "text" | "file" | "system";
  fileUrl?: string;
  fileName?: string;
}

export interface MeetingDiagnostics {
  cameraStatus: string;
  microphoneStatus: string;
  connectionStatus: string;
  audioStatus: string;
  videoStatus: string;
  networkQuality: string;
  webrtcConnectionState: string;
  iceConnectionState: string;
  signalingState: string;
}

export interface TSMeetingState {
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  peers: RemotePeer[];
  chatMessages: ChatMessage[];
  isConnected: boolean;
  isHost: boolean;
  isMuted: boolean;
  isCameraOff: boolean;
  isScreenSharing: boolean;
  handRaised: boolean;
  participantCount: number;
  connectionState: "connecting" | "connected" | "disconnected" | "error";
  error: string | null;
  availableCameras: MediaDeviceInfo[];
  availableMicrophones: MediaDeviceInfo[];
  selectedCameraId: string;
  selectedMicrophoneId: string;
  cameraPermission: DevicePermissionState;
  microphonePermission: DevicePermissionState;
  diagnostics: MeetingDiagnostics;
}

interface SignalingMessage {
  type: string;
  from?: string;
  fromName?: string;
  to?: string;
  payload?: any;
}

interface MediaSelection {
  cameraId?: string;
  microphoneId?: string;
  videoEnabled?: boolean;
  audioEnabled?: boolean;
}

type UserMediaAttempt = {
  audio: MediaStreamConstraints["audio"];
  video: MediaStreamConstraints["video"];
};

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:global.stun.twilio.com:3478" },
    {
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turn:openrelay.metered.ca:443?transport=tcp",
      ],
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
  iceCandidatePoolSize: 10,
};

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: { ideal: true },
  noiseSuppression: { ideal: true },
  autoGainControl: { ideal: true },
};

const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
};

const DEFAULT_DIAGNOSTICS: MeetingDiagnostics = {
  cameraStatus: "initializing",
  microphoneStatus: "initializing",
  connectionStatus: "connecting",
  audioStatus: "initializing",
  videoStatus: "initializing",
  networkQuality: "unknown",
  webrtcConnectionState: "new",
  iceConnectionState: "new",
  signalingState: "stable",
};

function describeMediaError(err: any, scope: "camera" | "microphone" | "camera-microphone") {
  if (!navigator.mediaDevices?.getUserMedia) {
    return "Browser media devices are unavailable. Use HTTPS or localhost in a supported browser.";
  }

  switch (err?.name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      if (scope === "camera") return "Camera access was denied. Allow camera permission in your browser and retry.";
      if (scope === "microphone") return "Microphone access was denied. Allow microphone permission in your browser and retry.";
      return "Camera and microphone access were denied. Allow permissions in your browser and retry.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      if (scope === "camera") return "No camera was detected. Connect a camera or choose another video device.";
      if (scope === "microphone") return "No microphone was detected. Connect a microphone or choose another audio device.";
      return "No compatible camera or microphone was detected on this device.";
    case "NotReadableError":
    case "TrackStartError":
      return "The selected camera or microphone is busy in another app. Close the other app and retry.";
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return "The selected media device cannot satisfy the requested quality. Choose another device and retry.";
    case "SecurityError":
      return "Camera and microphone access requires a secure browser context.";
    default:
      return err?.message || "Unable to access meeting media devices.";
  }
}

function cloneStream(stream: MediaStream | null) {
  return stream ? new MediaStream(stream.getTracks()) : null;
}

function getPreferredBackendPort() {
  const currentPort = window.location.port;
  if (!currentPort || currentPort === "80" || currentPort === "443") return currentPort;
  if (currentPort === "5173") return "3000";
  return currentPort;
}

function buildWsUrl(tsmId: string, peerId: string, peerName: string, isHost: boolean) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const port = getPreferredBackendPort();
  const host = port ? `${window.location.hostname}:${port}` : window.location.host;
  const params = new URLSearchParams({
    room: tsmId,
    peerId,
    name: peerName,
    isHost: String(isHost),
  });
  return `${protocol}//${host}/ws/ts-meeting?${params.toString()}`;
}

function createPeerRecord(peerId: string, name: string, remote?: Partial<RemotePeer>): RemotePeer {
  return {
    peerId,
    name,
    stream: null,
    audioMuted: remote?.audioMuted ?? false,
    videoMuted: remote?.videoMuted ?? false,
    handRaised: remote?.handRaised ?? false,
  };
}

function buildUserMediaAttempts(selection: {
  videoEnabled: boolean;
  audioEnabled: boolean;
  cameraId?: string;
  microphoneId?: string;
}): UserMediaAttempt[] {
  const { videoEnabled, audioEnabled, cameraId, microphoneId } = selection;

  const exactVideo = videoEnabled
    ? {
        ...VIDEO_CONSTRAINTS,
        ...(cameraId ? { deviceId: { exact: cameraId } } : {}),
      }
    : false;
  const exactAudio = audioEnabled
    ? {
        ...AUDIO_CONSTRAINTS,
        ...(microphoneId ? { deviceId: { exact: microphoneId } } : {}),
      }
    : false;

  const softVideo = videoEnabled
    ? {
        ...VIDEO_CONSTRAINTS,
        ...(cameraId ? { deviceId: { ideal: cameraId } } : {}),
      }
    : false;
  const softAudio = audioEnabled
    ? {
        ...AUDIO_CONSTRAINTS,
        ...(microphoneId ? { deviceId: { ideal: microphoneId } } : {}),
      }
    : false;

  const genericVideo = videoEnabled ? true : false;
  const genericAudio = audioEnabled ? true : false;

  const attempts: UserMediaAttempt[] = [
    { video: exactVideo, audio: exactAudio },
    { video: softVideo, audio: softAudio },
    { video: genericVideo, audio: softAudio },
    { video: genericVideo, audio: genericAudio },
  ];

  if (videoEnabled && audioEnabled) {
    attempts.push({ video: genericVideo, audio: false });
    attempts.push({ video: softVideo, audio: false });
    attempts.push({ video: false, audio: genericAudio });
  }

  return attempts;
}

export function useTSMeeting(params: {
  tsmId: string;
  peerId: string;
  peerName: string;
  isHost: boolean;
  preferredCameraId?: string;
  preferredMicrophoneId?: string;
  preferredAudioEnabled?: boolean;
  preferredVideoEnabled?: boolean;
  onMeetingEnded?: () => void;
}) {
  const {
    tsmId,
    peerId,
    peerName,
    isHost,
    preferredCameraId,
    preferredMicrophoneId,
    preferredAudioEnabled = true,
    preferredVideoEnabled = true,
    onMeetingEnded,
  } = params;

  const wsRef = useRef<WebSocket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const intentionalCloseRef = useRef(false);
  const selectedCameraIdRef = useRef(preferredCameraId || "");
  const selectedMicrophoneIdRef = useRef(preferredMicrophoneId || "");
  const isMutedRef = useRef(!preferredAudioEnabled);
  const isCameraOffRef = useRef(!preferredVideoEnabled);
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const acquireLocalMediaRef = useRef<((selection?: MediaSelection) => Promise<MediaStream>) | null>(null);

  const [state, setState] = useState<TSMeetingState>({
    localStream: null,
    screenStream: null,
    peers: [],
    chatMessages: [],
    isConnected: false,
    isHost,
    isMuted: !preferredAudioEnabled,
    isCameraOff: !preferredVideoEnabled,
    isScreenSharing: false,
    handRaised: false,
    participantCount: 1,
    connectionState: "connecting",
    error: null,
    availableCameras: [],
    availableMicrophones: [],
    selectedCameraId: preferredCameraId || "",
    selectedMicrophoneId: preferredMicrophoneId || "",
    cameraPermission: "prompt",
    microphonePermission: "prompt",
    diagnostics: {
      ...DEFAULT_DIAGNOSTICS,
      cameraStatus: preferredVideoEnabled ? "requesting-permission" : "disabled",
      microphoneStatus: preferredAudioEnabled ? "requesting-permission" : "disabled",
      audioStatus: preferredAudioEnabled ? "initializing" : "muted",
      videoStatus: preferredVideoEnabled ? "initializing" : "disabled",
    },
  });

  const syncLocalState = useCallback(() => {
    setState((prev) => ({
      ...prev,
      localStream: cloneStream(localStreamRef.current),
      screenStream: cloneStream(screenStreamRef.current),
      selectedCameraId: selectedCameraIdRef.current,
      selectedMicrophoneId: selectedMicrophoneIdRef.current,
    }));
  }, []);

  const updateDiagnostics = useCallback((patch: Partial<MeetingDiagnostics>) => {
    setState((prev) => ({
      ...prev,
      diagnostics: {
        ...prev.diagnostics,
        ...patch,
      },
    }));
  }, []);

  const setConnectionError = useCallback((message: string | null) => {
    setState((prev) => ({ ...prev, error: message }));
  }, []);

  const updatePeer = useCallback((remotePeerId: string, updater: (peer: RemotePeer) => RemotePeer) => {
    setState((prev) => ({
      ...prev,
      peers: prev.peers.map((peer) => (peer.peerId === remotePeerId ? updater(peer) : peer)),
      participantCount: prev.peers.length + 1,
    }));
  }, []);

  const replacePeerList = useCallback((updater: (prevPeers: RemotePeer[]) => RemotePeer[]) => {
    setState((prev) => {
      const peers = updater(prev.peers);
      return {
        ...prev,
        peers,
        participantCount: peers.length + 1,
      };
    });
  }, []);

  const sendSignal = useCallback((msg: SignalingMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return { cameras: [], microphones: [] };

    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind === "videoinput");
    const microphones = devices.filter((device) => device.kind === "audioinput");

    if (!selectedCameraIdRef.current && cameras[0]) selectedCameraIdRef.current = cameras[0].deviceId;
    if (!selectedMicrophoneIdRef.current && microphones[0]) selectedMicrophoneIdRef.current = microphones[0].deviceId;

    setState((prev) => ({
      ...prev,
      availableCameras: cameras,
      availableMicrophones: microphones,
      selectedCameraId: selectedCameraIdRef.current,
      selectedMicrophoneId: selectedMicrophoneIdRef.current,
    }));

    return { cameras, microphones };
  }, []);

  const readPermissionState = useCallback(async (name: "camera" | "microphone"): Promise<DevicePermissionState> => {
    try {
      const permissionsApi = (navigator as Navigator & {
        permissions?: {
          query: (descriptor: { name: string }) => Promise<{ state: DevicePermissionState }>;
        };
      }).permissions;
      if (!permissionsApi?.query) return "unsupported";
      const result = await permissionsApi.query({ name });
      return result.state || "prompt";
    } catch {
      return "unsupported";
    }
  }, []);

  const syncPermissionState = useCallback(async () => {
    const [cameraPermission, microphonePermission] = await Promise.all([
      readPermissionState("camera"),
      readPermissionState("microphone"),
    ]);
    setState((prev) => ({ ...prev, cameraPermission, microphonePermission }));
  }, [readPermissionState]);

  const renegotiatePeer = useCallback(async (remotePeerId: string) => {
    const pc = peerConnectionsRef.current.get(remotePeerId);
    if (!pc || pc.signalingState !== "stable") return;
    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await pc.setLocalDescription(offer);
      sendSignal({
        type: "offer",
        from: peerId,
        fromName: peerName,
        to: remotePeerId,
        payload: pc.localDescription,
      });
    } catch (err) {
      console.warn("[TS Meeting] Renegotiation failed:", remotePeerId, err);
    }
  }, [peerId, peerName, sendSignal]);

  const replaceOutgoingTrack = useCallback(async (kind: "audio" | "video", track: MediaStreamTrack | null) => {
    const renegotiateTargets = new Set<string>();
    const stream = localStreamRef.current;

    for (const [remotePeerId, pc] of peerConnectionsRef.current.entries()) {
      const sender = pc.getSenders().find((candidate) => candidate.track?.kind === kind);

      if (sender) {
        try {
          await sender.replaceTrack(track);
        } catch (err) {
          console.warn(`[TS Meeting] Failed replacing ${kind} track for peer ${remotePeerId}:`, err);
        }
      } else if (track && stream) {
        pc.addTrack(track, stream);
        renegotiateTargets.add(remotePeerId);
      }
    }

    await Promise.all(Array.from(renegotiateTargets).map((remotePeerId) => renegotiatePeer(remotePeerId)));
  }, [renegotiatePeer]);

  const attachTrackLifecycle = useCallback((track: MediaStreamTrack) => {
    track.onended = () => {
      const manuallyDisabled = track.kind === "video" ? isCameraOffRef.current : isMutedRef.current;
      updateDiagnostics(
        track.kind === "video"
          ? { cameraStatus: manuallyDisabled ? "disabled" : "disconnected", videoStatus: manuallyDisabled ? "disabled" : "reconnecting" }
          : { microphoneStatus: manuallyDisabled ? "muted" : "disconnected", audioStatus: manuallyDisabled ? "muted" : "reconnecting" }
      );

      if (!manuallyDisabled) {
        setTimeout(() => {
          acquireLocalMediaRef.current?.({
            cameraId: selectedCameraIdRef.current || undefined,
            microphoneId: selectedMicrophoneIdRef.current || undefined,
            videoEnabled: !isCameraOffRef.current,
            audioEnabled: !isMutedRef.current,
          }).catch((err) => {
            console.warn(`[TS Meeting] ${track.kind} recovery failed:`, err);
          });
        }, 800);
      }
    };
  }, [updateDiagnostics]);

  const closeAllPeerConnections = useCallback(() => {
    for (const pc of peerConnectionsRef.current.values()) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.onnegotiationneeded = null;
      pc.close();
    }
    peerConnectionsRef.current.clear();
    pendingCandidatesRef.current.clear();
    replacePeerList(() => []);
    updateDiagnostics({
      webrtcConnectionState: "new",
      iceConnectionState: "new",
      signalingState: "stable",
    });
  }, [replacePeerList, updateDiagnostics]);

  const createPeerConnection = useCallback((remotePeerId: string): RTCPeerConnection => {
    const existing = peerConnectionsRef.current.get(remotePeerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection(RTC_CONFIG);

    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        pc.addTrack(track, localStreamRef.current);
      }
    }

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        sendSignal({
          type: "ice-candidate",
          from: peerId,
          fromName: peerName,
          to: remotePeerId,
          payload: candidate,
        });
      }
    };

    pc.ontrack = ({ streams, track }) => {
      const remoteStream = streams[0] || new MediaStream([track]);
      replacePeerList((prevPeers) =>
        prevPeers.map((peer) => (peer.peerId === remotePeerId ? { ...peer, stream: remoteStream } : peer))
      );
      updateDiagnostics({
        audioStatus: remoteStream.getAudioTracks().length ? "receiving" : "active",
        videoStatus: remoteStream.getVideoTracks().length ? "receiving" : state.isCameraOff ? "disabled" : "active",
      });
    };

    pc.onconnectionstatechange = () => {
      const connectionState = pc.connectionState;
      updateDiagnostics({ webrtcConnectionState: connectionState, connectionStatus: connectionState });

      if (connectionState === "failed") {
        updatePeer(remotePeerId, (peer) => ({ ...peer, stream: null }));
        renegotiatePeer(remotePeerId);
      }

      if (connectionState === "disconnected") {
        updatePeer(remotePeerId, (peer) => ({ ...peer, stream: peer.stream }));
      }
    };

    pc.oniceconnectionstatechange = () => {
      updateDiagnostics({ iceConnectionState: pc.iceConnectionState });
      if (pc.iceConnectionState === "failed") {
        renegotiatePeer(remotePeerId);
      }
    };

    pc.onsignalingstatechange = () => {
      updateDiagnostics({ signalingState: pc.signalingState });
    };

    pc.onnegotiationneeded = async () => {
      if (pc.signalingState === "stable") {
        await renegotiatePeer(remotePeerId);
      }
    };

    peerConnectionsRef.current.set(remotePeerId, pc);
    return pc;
  }, [peerId, peerName, replacePeerList, renegotiatePeer, sendSignal, state.isCameraOff, updateDiagnostics, updatePeer]);

  const flushPendingCandidates = useCallback(async (remotePeerId: string) => {
    const pc = peerConnectionsRef.current.get(remotePeerId);
    const pending = pendingCandidatesRef.current.get(remotePeerId) || [];
    if (!pc || !pc.remoteDescription) return;

    for (const candidate of pending) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn("[TS Meeting] Failed to add pending ICE candidate:", err);
      }
    }

    pendingCandidatesRef.current.delete(remotePeerId);
  }, []);

  const acquireLocalMedia = useCallback(async (selection: MediaSelection = {}) => {
    const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    const hasCamera = devices.some((d) => d.kind === "videoinput");
    const hasMicrophone = devices.some((d) => d.kind === "audioinput");

    const videoEnabled = (selection.videoEnabled ?? !isCameraOffRef.current) && hasCamera;
    const audioEnabled = (selection.audioEnabled ?? !isMutedRef.current) && hasMicrophone;
    const cameraId = selection.cameraId ?? selectedCameraIdRef.current;
    const microphoneId = selection.microphoneId ?? selectedMicrophoneIdRef.current;

    if (!videoEnabled && !audioEnabled) {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      localStreamRef.current = new MediaStream();
      isCameraOffRef.current = true;
      isMutedRef.current = true;
      syncLocalState();
      updateDiagnostics({
        cameraStatus: "disabled",
        microphoneStatus: "muted",
        audioStatus: "muted",
        videoStatus: "disabled",
      });
      return localStreamRef.current;
    }

    updateDiagnostics({
      cameraStatus: videoEnabled ? "requesting-permission" : "disabled",
      microphoneStatus: audioEnabled ? "requesting-permission" : "muted",
    });

    const attempts = buildUserMediaAttempts({
      videoEnabled,
      audioEnabled,
      cameraId: cameraId || undefined,
      microphoneId: microphoneId || undefined,
    });

    try {
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
        throw lastError || new Error("Unable to capture local media");
      }

      await refreshDevices();
      await syncPermissionState();

      const nextStream = localStreamRef.current || new MediaStream();
      const oldTracks = nextStream.getTracks();
      const nextAudioTrack = stream.getAudioTracks()[0] || null;
      const nextVideoTrack = stream.getVideoTracks()[0] || null;

      if (nextAudioTrack) {
        attachTrackLifecycle(nextAudioTrack);
        const previousAudioTrack = nextStream.getAudioTracks()[0];
        if (previousAudioTrack) nextStream.removeTrack(previousAudioTrack);
        nextStream.addTrack(nextAudioTrack);
        await replaceOutgoingTrack("audio", nextAudioTrack);
      }

      if (!nextAudioTrack) {
        const previousAudioTrack = nextStream.getAudioTracks()[0];
        if (previousAudioTrack) {
          nextStream.removeTrack(previousAudioTrack);
          previousAudioTrack.stop();
        }
        await replaceOutgoingTrack("audio", null);
      }

      if (nextVideoTrack) {
        attachTrackLifecycle(nextVideoTrack);
        const previousVideoTrack = nextStream.getVideoTracks()[0];
        if (previousVideoTrack) nextStream.removeTrack(previousVideoTrack);
        nextStream.addTrack(nextVideoTrack);
        await replaceOutgoingTrack("video", nextVideoTrack);
      }

      if (!nextVideoTrack) {
        const previousVideoTrack = nextStream.getVideoTracks()[0];
        if (previousVideoTrack) {
          nextStream.removeTrack(previousVideoTrack);
          previousVideoTrack.stop();
        }
        await replaceOutgoingTrack("video", null);
      }

      for (const oldTrack of oldTracks) {
        if (!nextStream.getTracks().includes(oldTrack)) {
          oldTrack.stop();
        }
      }

      const hasAudioTrack = nextStream.getAudioTracks().length > 0;
      const hasVideoTrack = nextStream.getVideoTracks().length > 0;

      localStreamRef.current = nextStream;
      isMutedRef.current = !hasAudioTrack || !audioEnabled;
      isCameraOffRef.current = !hasVideoTrack || !videoEnabled;

      if (cameraId) selectedCameraIdRef.current = cameraId;
      if (microphoneId) selectedMicrophoneIdRef.current = microphoneId;

      setState((prev) => ({
        ...prev,
        localStream: cloneStream(nextStream),
        isMuted: !hasAudioTrack || !audioEnabled,
        isCameraOff: !hasVideoTrack || !videoEnabled,
        selectedCameraId: selectedCameraIdRef.current,
        selectedMicrophoneId: selectedMicrophoneIdRef.current,
        error: null,
      }));

      updateDiagnostics({
        cameraStatus: hasVideoTrack ? "connected" : videoEnabled ? "unavailable" : "disabled",
        microphoneStatus: hasAudioTrack ? "connected" : audioEnabled ? "unavailable" : "muted",
        audioStatus: hasAudioTrack ? "active" : "muted",
        videoStatus: hasVideoTrack ? "active" : "disabled",
      });

      return nextStream;
    } catch (err: any) {
      const errorMessage = describeMediaError(err, videoEnabled && audioEnabled ? "camera-microphone" : videoEnabled ? "camera" : "microphone");
      setConnectionError(errorMessage);
      updateDiagnostics({
        cameraStatus: videoEnabled ? "error" : "disabled",
        microphoneStatus: audioEnabled ? "error" : "muted",
        audioStatus: audioEnabled ? "error" : "muted",
        videoStatus: videoEnabled ? "error" : "disabled",
      });
      throw err;
    }
  }, [
    attachTrackLifecycle,
    refreshDevices,
    replaceOutgoingTrack,
    setConnectionError,
    syncLocalState,
    syncPermissionState,
    updateDiagnostics,
  ]);

  acquireLocalMediaRef.current = acquireLocalMedia;

  const handleSignalingMessage = useCallback(async (msg: SignalingMessage) => {
    const { type, from, fromName, payload, to } = msg;

    switch (type) {
      case "room-state": {
        const existingPeers = Array.isArray(payload?.peers) ? payload.peers : [];
        replacePeerList(() =>
          existingPeers
            .filter((peer: { peerId: string }) => peer.peerId !== peerId)
            .map((peer: any) =>
              createPeerRecord(peer.peerId, peer.name || "Participant", {
                audioMuted: peer.audioMuted,
                videoMuted: peer.videoMuted,
                handRaised: peer.handRaised,
              })
            )
        );

        for (const peer of existingPeers) {
          if (peer.peerId === peerId) continue;
          const pc = createPeerConnection(peer.peerId);
          if (pc.signalingState === "stable") {
            const offer = await pc.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: true,
            });
            await pc.setLocalDescription(offer);
            sendSignal({
              type: "offer",
              from: peerId,
              fromName: peerName,
              to: peer.peerId,
              payload: pc.localDescription,
            });
          }
        }

        setState((prev) => ({
          ...prev,
          participantCount: existingPeers.length + 1,
          isConnected: true,
          connectionState: "connected",
        }));
        updateDiagnostics({ connectionStatus: "connected" });
        break;
      }

      case "peer-joined": {
        if (!from || from === peerId) break;
        replacePeerList((prevPeers) =>
          prevPeers.some((peer) => peer.peerId === from)
            ? prevPeers
            : [...prevPeers, createPeerRecord(from, fromName || "Participant")]
        );
        break;
      }

      case "peer-left": {
        if (!from) break;
        peerConnectionsRef.current.get(from)?.close();
        peerConnectionsRef.current.delete(from);
        pendingCandidatesRef.current.delete(from);
        replacePeerList((prevPeers) => prevPeers.filter((peer) => peer.peerId !== from));
        break;
      }

      case "offer": {
        if (!from || to !== peerId) break;
        const pc = createPeerConnection(from);

        replacePeerList((prevPeers) =>
          prevPeers.some((peer) => peer.peerId === from)
            ? prevPeers
            : [...prevPeers, createPeerRecord(from, fromName || "Participant")]
        );

        if (pc.signalingState !== "stable") {
          try {
            await pc.setLocalDescription({ type: "rollback" } as RTCSessionDescriptionInit);
          } catch {
            console.warn("[TS Meeting] Offer glare rollback not supported for peer:", from);
          }
        }

        await pc.setRemoteDescription(new RTCSessionDescription(payload));
        await flushPendingCandidates(from);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal({
          type: "answer",
          from: peerId,
          fromName: peerName,
          to: from,
          payload: pc.localDescription,
        });
        break;
      }

      case "answer": {
        if (!from || to !== peerId) break;
        const pc = peerConnectionsRef.current.get(from);
        if (!pc) break;
        await pc.setRemoteDescription(new RTCSessionDescription(payload));
        await flushPendingCandidates(from);
        break;
      }

      case "ice-candidate": {
        if (!from || to !== peerId) break;
        const pc = peerConnectionsRef.current.get(from);
        if (pc?.remoteDescription) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(payload));
          } catch (err) {
            console.warn("[TS Meeting] Failed to add ICE candidate:", err);
          }
        } else {
          const list = pendingCandidatesRef.current.get(from) || [];
          list.push(payload);
          pendingCandidatesRef.current.set(from, list);
        }
        break;
      }

      case "chat": {
        if (!payload) break;
        setState((prev) => ({ ...prev, chatMessages: [...prev.chatMessages, payload as ChatMessage] }));
        break;
      }

      case "mute-state": {
        if (!from) break;
        updatePeer(from, (peer) => ({ ...peer, audioMuted: !!payload?.muted }));
        break;
      }

      case "camera-state": {
        if (!from) break;
        updatePeer(from, (peer) => ({ ...peer, videoMuted: !!payload?.off }));
        break;
      }

      case "raise-hand": {
        if (!from) break;
        updatePeer(from, (peer) => ({ ...peer, handRaised: !!payload?.raised }));
        break;
      }

      case "host-mute": {
        if (payload?.targetId === peerId) {
          const audioTrack = localStreamRef.current?.getAudioTracks()[0];
          if (audioTrack) {
            audioTrack.enabled = false;
          }
          isMutedRef.current = true;
          setState((prev) => ({ ...prev, isMuted: true }));
          updateDiagnostics({ microphoneStatus: "muted", audioStatus: "muted" });
          sendSignal({ type: "mute-state", from: peerId, fromName: peerName, payload: { muted: true } });
        }
        break;
      }

      case "meeting-ended": {
        onMeetingEnded?.();
        break;
      }

      case "system-message": {
        const sysMessage: ChatMessage = {
          id: `sys-${Date.now()}`,
          senderId: "system",
          senderName: "System",
          text: payload?.text || "Meeting update",
          timestamp: new Date().toISOString(),
          type: "system",
        };
        setState((prev) => ({ ...prev, chatMessages: [...prev.chatMessages, sysMessage] }));
        break;
      }

      default:
        break;
    }
  }, [
    createPeerConnection,
    flushPendingCandidates,
    onMeetingEnded,
    peerId,
    peerName,
    replacePeerList,
    sendSignal,
    updateDiagnostics,
    updatePeer,
  ]);

  const connectWebSocket = useCallback(() => {
    if (!tsmId) return;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return;
    }

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    closeAllPeerConnections();
    updateDiagnostics({ connectionStatus: "connecting" });
    setState((prev) => ({ ...prev, connectionState: "connecting", isConnected: false }));

    const ws = new WebSocket(buildWsUrl(tsmId, peerId, peerName, isHost));
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptsRef.current = 0;
      setConnectionError(null);
      setState((prev) => ({ ...prev, isConnected: true, connectionState: "connected" }));
      updateDiagnostics({ connectionStatus: "connected", networkQuality: navigator.onLine ? "online" : "offline" });
    };

    ws.onmessage = (event) => {
      try {
        handleSignalingMessage(JSON.parse(event.data) as SignalingMessage);
      } catch (err) {
        console.warn("[TS Meeting] Invalid signaling message:", err);
      }
    };

    ws.onerror = () => {
      setState((prev) => ({ ...prev, connectionState: "error", isConnected: false }));
      setConnectionError("Meeting signaling connection failed. Retrying automatically.");
      updateDiagnostics({ connectionStatus: "error" });
    };

    ws.onclose = () => {
      wsRef.current = null;
      setState((prev) => ({ ...prev, isConnected: false, connectionState: "disconnected" }));
      updateDiagnostics({ connectionStatus: "disconnected" });

      if (intentionalCloseRef.current) return;

      reconnectAttemptsRef.current += 1;
      const delayMs = Math.min(8000, 1500 * reconnectAttemptsRef.current);
      reconnectTimerRef.current = setTimeout(() => {
        connectWebSocket();
      }, delayMs);
    };
  }, [
    closeAllPeerConnections,
    handleSignalingMessage,
    isHost,
    peerId,
    peerName,
    setConnectionError,
    tsmId,
    updateDiagnostics,
  ]);

  const retryConnection = useCallback(async () => {
    setConnectionError(null);
    updateDiagnostics({ connectionStatus: "retrying" });
    try {
      await acquireLocalMedia({
        audioEnabled: !isMutedRef.current,
        videoEnabled: !isCameraOffRef.current,
      });
    } catch {
      // Keep reconnecting signaling even if device recovery fails.
    }

    intentionalCloseRef.current = false;
    wsRef.current?.close();
    connectWebSocket();
  }, [acquireLocalMedia, connectWebSocket, setConnectionError, updateDiagnostics]);

  const toggleMute = useCallback((forceMute?: boolean) => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    const nextMuted = forceMute !== undefined ? forceMute : !isMutedRef.current;

    isMutedRef.current = nextMuted;

    if (track) {
      track.enabled = !nextMuted;
    }

    setState((prev) => ({ ...prev, isMuted: nextMuted }));
    updateDiagnostics({
      microphoneStatus: nextMuted ? "muted" : "connected",
      audioStatus: nextMuted ? "muted" : "active",
    });
    sendSignal({ type: "mute-state", from: peerId, fromName: peerName, payload: { muted: nextMuted } });
  }, [peerId, peerName, sendSignal, updateDiagnostics]);

  const toggleCamera = useCallback(async () => {
    const currentTrack = localStreamRef.current?.getVideoTracks()[0];
    const nextOff = !isCameraOffRef.current;

    if (!nextOff && !currentTrack) {
      try {
        await acquireLocalMedia({
          audioEnabled: !isMutedRef.current,
          videoEnabled: true,
          cameraId: selectedCameraIdRef.current || undefined,
          microphoneId: selectedMicrophoneIdRef.current || undefined,
        });
        isCameraOffRef.current = false;
        setState((prev) => ({ ...prev, isCameraOff: false }));
        sendSignal({ type: "camera-state", from: peerId, fromName: peerName, payload: { off: false } });
        return;
      } catch {
        return;
      }
    }

    if (currentTrack) {
      currentTrack.enabled = !nextOff;
    }

    isCameraOffRef.current = nextOff;
    setState((prev) => ({ ...prev, isCameraOff: nextOff }));
    updateDiagnostics({
      cameraStatus: nextOff ? "disabled" : "connected",
      videoStatus: nextOff ? "disabled" : "active",
    });
    sendSignal({ type: "camera-state", from: peerId, fromName: peerName, payload: { off: nextOff } });
  }, [acquireLocalMedia, peerId, peerName, sendSignal, updateDiagnostics]);

  const selectCamera = useCallback(async (cameraId: string) => {
    selectedCameraIdRef.current = cameraId;
    setState((prev) => ({ ...prev, selectedCameraId: cameraId }));
    if (!isCameraOffRef.current) {
      await acquireLocalMedia({
        cameraId,
        microphoneId: selectedMicrophoneIdRef.current || undefined,
        videoEnabled: true,
        audioEnabled: !isMutedRef.current,
      });
    }
  }, [acquireLocalMedia]);

  const selectMicrophone = useCallback(async (microphoneId: string) => {
    selectedMicrophoneIdRef.current = microphoneId;
    setState((prev) => ({ ...prev, selectedMicrophoneId: microphoneId }));
    if (!isMutedRef.current) {
      await acquireLocalMedia({
        cameraId: selectedCameraIdRef.current || undefined,
        microphoneId,
        videoEnabled: !isCameraOffRef.current,
        audioEnabled: true,
      });
    }
  }, [acquireLocalMedia]);

  const toggleScreenShare = useCallback(async () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;

      const cameraTrack = localStreamRef.current?.getVideoTracks()[0] || null;
      await replaceOutgoingTrack("video", cameraTrack);

      setState((prev) => ({ ...prev, isScreenSharing: false, screenStream: null }));
      updateDiagnostics({ videoStatus: isCameraOffRef.current ? "disabled" : "active" });
      return;
    }

    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920, max: 2560 },
          height: { ideal: 1080, max: 1440 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: true,
      });

      screenStreamRef.current = screen;
      const screenTrack = screen.getVideoTracks()[0] || null;
      if (screenTrack) {
        screenTrack.onended = () => {
          if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach((track) => track.stop());
            screenStreamRef.current = null;
            const cameraTrack = localStreamRef.current?.getVideoTracks()[0] || null;
            void replaceOutgoingTrack("video", cameraTrack);
            setState((prev) => ({ ...prev, isScreenSharing: false, screenStream: null }));
            updateDiagnostics({ videoStatus: isCameraOffRef.current ? "disabled" : "active" });
          }
        };
        await replaceOutgoingTrack("video", screenTrack);
      }

      setState((prev) => ({ ...prev, isScreenSharing: true, screenStream: cloneStream(screen) }));
      updateDiagnostics({ videoStatus: "screen-sharing" });
    } catch (err) {
      console.warn("[TS Meeting] Screen share cancelled:", err);
    }
  }, [replaceOutgoingTrack, updateDiagnostics]);

  const raiseHand = useCallback(() => {
    setState((prev) => {
      const handRaised = !prev.handRaised;
      sendSignal({ type: "raise-hand", from: peerId, fromName: peerName, payload: { raised: handRaised } });
      return { ...prev, handRaised };
    });
  }, [peerId, peerName, sendSignal]);

  const sendChat = useCallback((text: string, fileUrl?: string, fileName?: string) => {
    const message: ChatMessage = {
      id: `${peerId}-${Date.now()}`,
      senderId: peerId,
      senderName: peerName,
      text,
      timestamp: new Date().toISOString(),
      type: fileUrl ? "file" : "text",
      fileUrl,
      fileName,
    };
    setState((prev) => ({ ...prev, chatMessages: [...prev.chatMessages, message] }));
    sendSignal({ type: "chat", from: peerId, fromName: peerName, payload: message });
  }, [peerId, peerName, sendSignal]);

  const endMeeting = useCallback(() => {
    sendSignal({ type: "meeting-ended", from: peerId, fromName: peerName, payload: {} });
    onMeetingEnded?.();
  }, [onMeetingEnded, peerId, peerName, sendSignal]);

  const mutePeer = useCallback((targetId: string) => {
    if (!isHost) return;
    sendSignal({ type: "host-mute", from: peerId, fromName: peerName, payload: { targetId } });
  }, [isHost, peerId, peerName, sendSignal]);

  const cleanup = useCallback(() => {
    intentionalCloseRef.current = true;

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }

    wsRef.current?.close();
    wsRef.current = null;

    closeAllPeerConnections();

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    screenStreamRef.current = null;
  }, [closeAllPeerConnections]);

  useEffect(() => {
    let mounted = true;

    const initializeMeeting = async () => {
      intentionalCloseRef.current = false;
      await refreshDevices();
      await syncPermissionState();

      try {
        await acquireLocalMedia({
          cameraId: preferredCameraId,
          microphoneId: preferredMicrophoneId,
          videoEnabled: preferredVideoEnabled,
          audioEnabled: preferredAudioEnabled,
        });
      } catch (err) {
        console.warn("[TS Meeting] Initial media capture failed:", err);
      }

      if (mounted) {
        connectWebSocket();
      }
    };

    void initializeMeeting();

    const handleDeviceChange = () => {
      void refreshDevices();
      if (!isCameraOffRef.current || !isMutedRef.current) {
        void retryConnection();
      }
    };

    const handleOnline = () => {
      updateDiagnostics({ networkQuality: "online" });
      void retryConnection();
    };

    const handleOffline = () => {
      updateDiagnostics({ networkQuality: "offline", connectionStatus: "offline" });
      setState((prev) => ({ ...prev, connectionState: "disconnected", isConnected: false }));
    };

    navigator.mediaDevices?.addEventListener?.("devicechange", handleDeviceChange);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      mounted = false;
      navigator.mediaDevices?.removeEventListener?.("devicechange", handleDeviceChange);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      cleanup();
    };
  }, [
    acquireLocalMedia,
    cleanup,
    connectWebSocket,
    preferredAudioEnabled,
    preferredCameraId,
    preferredMicrophoneId,
    preferredVideoEnabled,
    refreshDevices,
    retryConnection,
    syncPermissionState,
    updateDiagnostics,
  ]);

  useEffect(() => {
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }

    statsIntervalRef.current = setInterval(async () => {
      const peerConnections = Array.from(peerConnectionsRef.current.values()) as RTCPeerConnection[];
      const firstConnectedPc = peerConnections.find(
        (pc) => pc.connectionState === "connected" || pc.iceConnectionState === "connected"
      );

      if (!firstConnectedPc) {
        updateDiagnostics({
          networkQuality: navigator.onLine ? "standby" : "offline",
          connectionStatus: wsRef.current?.readyState === WebSocket.OPEN ? "signaling-only" : "disconnected",
        });
        return;
      }

      try {
        const stats = await firstConnectedPc.getStats();
        let currentRoundTripTime: number | null = null;
        let totalPacketsLost = 0;
        let totalPackets = 0;

        stats.forEach((report) => {
          if (report.type === "candidate-pair" && (report as RTCStats & { state?: string }).state === "succeeded") {
            currentRoundTripTime = (report as RTCStats & { currentRoundTripTime?: number }).currentRoundTripTime ?? currentRoundTripTime;
          }

          if (report.type === "inbound-rtp" || report.type === "remote-inbound-rtp") {
            const typedReport = report as RTCStats & { packetsLost?: number; packetsReceived?: number };
            totalPacketsLost += typedReport.packetsLost || 0;
            totalPackets += typedReport.packetsReceived || 0;
          }
        });

        let networkQuality = "good";
        if (!navigator.onLine) {
          networkQuality = "offline";
        } else if ((currentRoundTripTime ?? 0) > 0.35 || (totalPackets > 0 && totalPacketsLost / totalPackets > 0.08)) {
          networkQuality = "poor";
        } else if ((currentRoundTripTime ?? 0) > 0.18 || (totalPackets > 0 && totalPacketsLost / totalPackets > 0.03)) {
          networkQuality = "fair";
        }

        updateDiagnostics({
          networkQuality,
          connectionStatus: firstConnectedPc.connectionState,
          webrtcConnectionState: firstConnectedPc.connectionState,
          iceConnectionState: firstConnectedPc.iceConnectionState,
          signalingState: firstConnectedPc.signalingState,
        });
      } catch (err) {
        console.warn("[TS Meeting] Failed to collect WebRTC stats:", err);
      }
    }, 5000);

    return () => {
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
        statsIntervalRef.current = null;
      }
    };
  }, [updateDiagnostics]);

  useEffect(() => {
    const diagnosticsPayload = {
      roomId: tsmId,
      peerId,
      peerName,
      selectedCameraId: state.selectedCameraId,
      selectedMicrophoneId: state.selectedMicrophoneId,
      cameraPermission: state.cameraPermission,
      microphonePermission: state.microphonePermission,
      isConnected: state.isConnected,
      isMuted: state.isMuted,
      isCameraOff: state.isCameraOff,
      participantCount: state.participantCount,
      diagnostics: state.diagnostics,
      peers: state.peers.map((peer) => ({
        peerId: peer.peerId,
        name: peer.name,
        audioMuted: peer.audioMuted,
        videoMuted: peer.videoMuted,
        handRaised: peer.handRaised,
        hasStream: !!peer.stream,
      })),
    };

    (window as Window & { __TS_MEETING_DIAGNOSTICS__?: unknown }).__TS_MEETING_DIAGNOSTICS__ = diagnosticsPayload;
    console.debug("[TS Meeting Diagnostics]", diagnosticsPayload);
  }, [peerId, peerName, state, tsmId]);

  return useMemo(() => ({
    ...state,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
    raiseHand,
    sendChat,
    endMeeting,
    mutePeer,
    initLocalMedia: acquireLocalMedia,
    selectCamera,
    selectMicrophone,
    refreshDevices,
    retryConnection,
  }), [
    acquireLocalMedia,
    endMeeting,
    mutePeer,
    raiseHand,
    refreshDevices,
    retryConnection,
    selectCamera,
    selectMicrophone,
    sendChat,
    state,
    toggleCamera,
    toggleMute,
    toggleScreenShare,
  ]);
}
