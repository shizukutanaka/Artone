'use strict';

(function registerStreamingSystem(global) {
  // Advanced streaming system for Artone with live streaming and real-time collaboration

  function setHTMLSafe(element, html) {
    if (!element) return;

    const sanitizer = global.domSanitizer;
    if (sanitizer && typeof sanitizer.setInnerHTMLSafe === 'function') {
      sanitizer.setInnerHTMLSafe(element, html);
    } else {
      element.innerHTML = html;
    }
  }

  function clearHTML(element) {
    setHTMLSafe(element, '');
  }

  const STREAMING_CONFIG = (global.ARTONE_CONFIG && global.ARTONE_CONFIG.streaming) || {};

  function normalizeConfiguredUrl(rawValue, allowedProtocols) {
    if (typeof rawValue !== 'string' || rawValue.trim() === '') {
      return null;
    }

    try {
      const parsed = new URL(rawValue, window.location.origin);
      if (!allowedProtocols.includes(parsed.protocol)) {
        console.warn(`Rejected URL due to unsupported protocol: ${rawValue}`);
        return null;
      }
      return parsed.href;
    } catch (error) {
      console.warn(`Failed to parse configured URL: ${rawValue}`, error);
      return null;
    }
  }

  const STREAMING_SERVER_URL = normalizeConfiguredUrl(STREAMING_CONFIG.serverUrl, ['https:', 'wss:', 'rtmp:', 'srt:']);
  const SIGNALING_URL = normalizeConfiguredUrl(STREAMING_CONFIG.signalingUrl, ['wss:']);
  const STREAMING_PROTOCOLS = {
    webrtc: 'WebRTC',
    rtmp: 'RTMP',
    hls: 'HLS',
    dash: 'DASH',
    srt: 'SRT'
  };

  const STREAMING_QUALITIES = {
    '4k': { width: 3840, height: 2160, bitrate: '15M', fps: 60 },
    '1440p': { width: 2560, height: 1440, bitrate: '10M', fps: 60 },
    '1080p': { width: 1920, height: 1080, bitrate: '6M', fps: 60 },
    '720p': { width: 1280, height: 720, bitrate: '3M', fps: 30 },
    '480p': { width: 854, height: 480, bitrate: '1M', fps: 30 },
    '360p': { width: 640, height: 360, bitrate: '500k', fps: 24 }
  };

  const COLLABORATION_MODES = {
    'view-only': 'View Only',
    'comment-only': 'Comment Only',
    'edit-limited': 'Limited Edit',
    'edit-full': 'Full Edit',
    'admin': 'Admin'
  };

  class StreamingManager {
    constructor() {
      this.streams = new Map();
      this.activeStreams = new Map();
      this.collaborators = new Map();
      this.webRTCConnections = new Map();
      this.streamingServer = null;
      this.isStreaming = false;
      this.isRecording = false;
      this.onStreamStart = null;
      this.onStreamEnd = null;
      this.onCollaboratorJoin = null;
      this.onCollaboratorLeave = null;
    }

    async initialize() {
      // Initialize WebRTC
      await this.initializeWebRTC();

      // Initialize streaming server connection
      await this.initializeStreamingServer();

      // Set up collaboration signaling
      this.setupCollaborationSignaling();

      console.log('Streaming manager initialized');
    }

    async initializeWebRTC() {
      try {
        // Check for WebRTC support
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('WebRTC not supported');
        }

        // Get user media permissions
        await this.requestMediaPermissions();

        console.log('WebRTC initialized');
      } catch (error) {
        console.error('WebRTC initialization failed:', error);
        throw error;
      }
    }

    async requestMediaPermissions() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720, frameRate: 30 },
          audio: { echoCancellation: true, noiseSuppression: true }
        });

        // Stop the stream immediately after getting permissions
        stream.getTracks().forEach(track => track.stop());

        console.log('Media permissions granted');
      } catch (error) {
        console.error('Media permissions denied:', error);
        throw error;
      }
    }

    async initializeStreamingServer() {
      // In a real implementation, this would connect to a streaming server
      // For now, we'll use mock functionality
      if (!STREAMING_SERVER_URL) {
        console.warn('Streaming server URL not configured or rejected. Streaming will be disabled until configured.');
        this.streamingServer = null;
        return;
      }

      this.streamingServer = {
        url: STREAMING_SERVER_URL,
        isConnected: false,
        reconnectAttempts: 0,
        maxReconnectAttempts: 5
      };

      console.log('Streaming server initialized');
    }

    setupCollaborationSignaling() {
      if (!SIGNALING_URL) {
        console.warn('Collaboration signaling URL not configured or rejected. Collaborative features are disabled.');
        return;
      }

      try {
        this.signalingSocket = new WebSocket(SIGNALING_URL);

        this.signalingSocket.onopen = () => {
          console.log('Collaboration signaling connected');
        };

        this.signalingSocket.onmessage = (event) => {
          this.handleSignalingMessage(JSON.parse(event.data));
        };

        this.signalingSocket.onclose = (event) => {
          console.log('Collaboration signaling disconnected', event?.code);
          this.signalingSocket = null;
        };
      } catch (error) {
        console.error('Failed to establish collaboration signaling connection:', error);
      }

      if (this.signalingSocket) {
        this.signalingSocket.onerror = (error) => {
          console.error('Collaboration signaling error:', error);
        };
      }
    }

    handleSignalingMessage(message) {
      switch (message.type) {
        case 'collaborator-joined':
          this.handleCollaboratorJoined(message);
          break;
        case 'collaborator-left':
          this.handleCollaboratorLeft(message);
          break;
        case 'webrtc-offer':
          this.handleWebRTCOffer(message);
          break;
        case 'webrtc-answer':
          this.handleWebRTCAnswer(message);
          break;
        case 'webrtc-ice-candidate':
          this.handleWebRTCIceCandidate(message);
          break;
        case 'project-update':
          this.handleProjectUpdate(message);
          break;
        case 'chat-message':
          this.handleChatMessage(message);
          break;
      }
    }

    // Start streaming
    async startStreaming(options = {}) {
      const {
        protocol = 'webrtc',
        quality = '720p',
        destination = 'local',
        title = 'Artone Stream',
        description = '',
        isPrivate = false,
        enableChat = true,
        enableRecording = true
      } = options;

      if (this.isStreaming) {
        throw new Error('Already streaming');
      }

      try {
        const streamConfig = {
          id: `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          protocol,
          quality: STREAMING_QUALITIES[quality],
          destination,
          title,
          description,
          isPrivate,
          enableChat,
          enableRecording,
          startTime: Date.now(),
          viewers: 0,
          status: 'starting'
        };

        switch (protocol) {
          case 'webrtc':
            await this.startWebRTCStream(streamConfig);
            break;
          case 'rtmp':
            await this.startRTMPStream(streamConfig);
            break;
          case 'hls':
            await this.startHLSStream(streamConfig);
            break;
          default:
            throw new Error(`Unsupported protocol: ${protocol}`);
        }

        this.streams.set(streamConfig.id, streamConfig);
        this.activeStreams.set(streamConfig.id, streamConfig);
        this.isStreaming = true;

        if (this.onStreamStart) {
          this.onStreamStart(streamConfig);
        }

        return streamConfig.id;
      } catch (error) {
        console.error('Failed to start streaming:', error);
        throw error;
      }
    }

    async startWebRTCStream(config) {
      try {
        // Get screen sharing stream
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: config.quality.width,
            height: config.quality.height,
            frameRate: config.quality.fps
          },
          audio: true
        });

        // Get camera stream for picture-in-picture
        let cameraStream = null;
        try {
          cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { width: 320, height: 240, frameRate: 30 },
            audio: false
          });
        } catch (error) {
          console.warn('Camera not available:', error);
        }

        // Create composite stream
        const compositeStream = this.createCompositeStream(screenStream, cameraStream);

        // Set up WebRTC peer connection
        const peerConnection = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        });

        // Add tracks to peer connection
        compositeStream.getTracks().forEach(track => {
          peerConnection.addTrack(track, compositeStream);
        });

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
          if (event.candidate) {
            this.sendSignalingMessage({
              type: 'webrtc-ice-candidate',
              candidate: event.candidate,
              streamId: config.id
            });
          }
        };

        // Handle connection state changes
        peerConnection.onconnectionstatechange = () => {
          console.log('WebRTC connection state:', peerConnection.connectionState);

          if (peerConnection.connectionState === 'connected') {
            config.status = 'live';
            this.updateStreamStatus(config.id, 'live');
          } else if (peerConnection.connectionState === 'disconnected') {
            config.status = 'disconnected';
            this.updateStreamStatus(config.id, 'disconnected');
          }
        };

        // Store peer connection
        this.webRTCConnections.set(config.id, peerConnection);

        // Create offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        this.sendSignalingMessage({
          type: 'webrtc-offer',
          offer: offer,
          streamId: config.id
        });

        console.log('WebRTC stream started:', config.id);
      } catch (error) {
        console.error('WebRTC stream failed:', error);
        throw error;
      }
    }

    async startRTMPStream(config) {
      // RTMP streaming would require a streaming server
      // This is a simplified implementation
      console.log('RTMP streaming started:', config.id);

      config.status = 'live';
      this.updateStreamStatus(config.id, 'live');
    }

    async startHLSStream(config) {
      // HLS streaming implementation
      console.log('HLS streaming started:', config.id);

      config.status = 'live';
      this.updateStreamStatus(config.id, 'live');
    }

    createCompositeStream(screenStream, cameraStream) {
      // Create a composite stream with screen and camera
      // This would involve canvas composition in a real implementation

      if (cameraStream) {
        // Picture-in-picture mode
        return new MediaStream([...screenStream.getTracks(), ...cameraStream.getTracks()]);
      } else {
        // Screen only
        return screenStream;
      }
    }

    // Stop streaming
    async stopStreaming(streamId) {
      const stream = this.streams.get(streamId);
      if (!stream) {
        throw new Error('Stream not found');
      }

      try {
        switch (stream.protocol) {
          case 'webrtc':
            await this.stopWebRTCStream(streamId);
            break;
          case 'rtmp':
            await this.stopRTMPStream(streamId);
            break;
          case 'hls':
            await this.stopHLSStream(streamId);
            break;
        }

        stream.status = 'stopped';
        stream.endTime = Date.now();
        this.activeStreams.delete(streamId);

        if (this.activeStreams.size === 0) {
          this.isStreaming = false;
        }

        if (this.onStreamEnd) {
          this.onStreamEnd(stream);
        }

        return stream;
      } catch (error) {
        console.error('Failed to stop streaming:', error);
        throw error;
      }
    }

    async stopWebRTCStream(streamId) {
      const peerConnection = this.webRTCConnections.get(streamId);
      if (peerConnection) {
        peerConnection.close();
        this.webRTCConnections.delete(streamId);
      }

      console.log('WebRTC stream stopped:', streamId);
    }

    async stopRTMPStream(streamId) {
      console.log('RTMP stream stopped:', streamId);
    }

    async stopHLSStream(streamId) {
      console.log('HLS stream stopped:', streamId);
    }

    updateStreamStatus(streamId, status) {
      const stream = this.streams.get(streamId);
      if (stream) {
        stream.status = status;
        console.log(`Stream ${streamId} status updated to: ${status}`);
      }
    }

    // Collaboration features
    async joinCollaboration(sessionId, userInfo = {}) {
      const collaborator = {
        id: `collab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        sessionId,
        userInfo,
        permissions: userInfo.permissions || 'view-only',
        joinedAt: Date.now(),
        lastActivity: Date.now(),
        isConnected: true
      };

      this.collaborators.set(collaborator.id, collaborator);

      this.sendSignalingMessage({
        type: 'join-collaboration',
        sessionId,
        collaborator
      });

      if (this.onCollaboratorJoin) {
        this.onCollaboratorJoin(collaborator);
      }

      return collaborator.id;
    }

    async leaveCollaboration(collaboratorId) {
      const collaborator = this.collaborators.get(collaboratorId);
      if (!collaborator) {
        throw new Error('Collaborator not found');
      }

      collaborator.isConnected = false;
      collaborator.leftAt = Date.now();

      this.sendSignalingMessage({
        type: 'leave-collaboration',
        collaboratorId
      });

      if (this.onCollaboratorLeave) {
        this.onCollaboratorLeave(collaborator);
      }

      this.collaborators.delete(collaboratorId);
    }

    handleCollaboratorJoined(message) {
      const { collaborator } = message;
      this.collaborators.set(collaborator.id, collaborator);

      if (this.onCollaboratorJoin) {
        this.onCollaboratorJoin(collaborator);
      }

      console.log('Collaborator joined:', collaborator.userInfo.name);
    }

    handleCollaboratorLeft(message) {
      const { collaboratorId } = message;
      const collaborator = this.collaborators.get(collaboratorId);

      if (collaborator) {
        collaborator.isConnected = false;
        collaborator.leftAt = Date.now();

        if (this.onCollaboratorLeave) {
          this.onCollaboratorLeave(collaborator);
        }

        console.log('Collaborator left:', collaborator.userInfo.name);
      }
    }

    // WebRTC signaling handlers
    async handleWebRTCOffer(message) {
      const { offer, streamId, fromCollaborator } = message;

      try {
        const peerConnection = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        });

        // Handle remote stream
        peerConnection.ontrack = (event) => {
          console.log('Received remote stream:', event.streams[0]);
          // Handle remote stream (display in UI)
        };

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
          if (event.candidate) {
            this.sendSignalingMessage({
              type: 'webrtc-ice-candidate',
              candidate: event.candidate,
              streamId,
              toCollaborator: fromCollaborator
            });
          }
        };

        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        this.sendSignalingMessage({
          type: 'webrtc-answer',
          answer: answer,
          streamId,
          toCollaborator: fromCollaborator
        });

        this.webRTCConnections.set(`${streamId}_${fromCollaborator}`, peerConnection);
      } catch (error) {
        console.error('Failed to handle WebRTC offer:', error);
      }
    }

    async handleWebRTCAnswer(message) {
      const { answer, streamId, fromCollaborator } = message;

      const peerConnection = this.webRTCConnections.get(`${streamId}_${fromCollaborator}`);
      if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      }
    }

    async handleWebRTCIceCandidate(message) {
      const { candidate, streamId, fromCollaborator } = message;

      const peerConnection = this.webRTCConnections.get(`${streamId}_${fromCollaborator}`);
      if (peerConnection) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    }

    // Project collaboration
    handleProjectUpdate(message) {
      const { projectData, fromCollaborator } = message;

      // Apply project updates from collaborator
      console.log('Received project update from:', fromCollaborator);

      // In a real implementation, this would update the project state
      // For now, just log the update
    }

    handleChatMessage(message) {
      const { text, fromCollaborator, timestamp } = message;

      console.log('Chat message:', text, 'from:', fromCollaborator);

      // Handle chat message (display in UI, etc.)
    }

    // Send signaling message
    sendSignalingMessage(message) {
      if (this.signalingSocket && this.signalingSocket.readyState === WebSocket.OPEN) {
        this.signalingSocket.send(JSON.stringify(message));
      }
    }

    // Recording functionality
    async startRecording(streamId, options = {}) {
      if (this.isRecording) {
        throw new Error('Already recording');
      }

      const stream = this.streams.get(streamId);
      if (!stream) {
        throw new Error('Stream not found');
      }

      try {
        this.isRecording = true;

        // In a real implementation, this would start recording the stream
        console.log('Recording started for stream:', streamId);

        return true;
      } catch (error) {
        this.isRecording = false;
        console.error('Failed to start recording:', error);
        throw error;
      }
    }

    async stopRecording() {
      if (!this.isRecording) {
        throw new Error('Not recording');
      }

      try {
        this.isRecording = false;

        // In a real implementation, this would stop recording and save the file
        console.log('Recording stopped');

        return true;
      } catch (error) {
        console.error('Failed to stop recording:', error);
        throw error;
      }
    }

    // Get streaming statistics
    getStreamingStats() {
      const stats = {
        isStreaming: this.isStreaming,
        isRecording: this.isRecording,
        activeStreams: this.activeStreams.size,
        totalStreams: this.streams.size,
        collaborators: this.collaborators.size,
        webRTCConnections: this.webRTCConnections.size
      };

      // Stream statistics
      stats.streams = Array.from(this.streams.values()).map(stream => ({
        id: stream.id,
        protocol: stream.protocol,
        quality: stream.quality,
        status: stream.status,
        viewers: stream.viewers,
        duration: stream.endTime ? stream.endTime - stream.startTime : Date.now() - stream.startTime
      }));

      // Collaborator statistics
      stats.collaboratorsList = Array.from(this.collaborators.values()).map(collab => ({
        id: collab.id,
        name: collab.userInfo.name,
        permissions: collab.permissions,
        isConnected: collab.isConnected,
        joinedAt: collab.joinedAt
      }));

      return stats;
    }

    // Export streaming configuration
    exportStreamingConfig() {
      const config = {
        streams: Array.from(this.streams.entries()),
        activeStreams: Array.from(this.activeStreams.entries()),
        collaborators: Array.from(this.collaborators.entries()),
        settings: {
          isStreaming: this.isStreaming,
          isRecording: this.isRecording
        },
        exportedAt: Date.now()
      };

      return JSON.stringify(config, null, 2);
    }

    // Import streaming configuration
    importStreamingConfig(configData) {
      try {
        const config = JSON.parse(configData);

        this.streams = new Map(config.streams || []);
        this.activeStreams = new Map(config.activeStreams || []);
        this.collaborators = new Map(config.collaborators || []);

        if (config.settings) {
          this.isStreaming = config.settings.isStreaming || false;
          this.isRecording = config.settings.isRecording || false;
        }

        console.log('Streaming configuration imported');
        return true;
      } catch (error) {
        console.error('Failed to import streaming config:', error);
        throw error;
      }
    }

    // Cleanup
    async destroy() {
      // Stop all streams
      for (const streamId of this.activeStreams.keys()) {
        await this.stopStreaming(streamId);
      }

      // Close all WebRTC connections
      for (const peerConnection of this.webRTCConnections.values()) {
        peerConnection.close();
      }

      // Leave all collaborations
      for (const collaboratorId of this.collaborators.keys()) {
        await this.leaveCollaboration(collaboratorId);
      }

      // Close signaling socket
      if (this.signalingSocket) {
        this.signalingSocket.close();
      }

      this.streams.clear();
      this.activeStreams.clear();
      this.collaborators.clear();
      this.webRTCConnections.clear();
    }
  }

  class StreamingUI {
    constructor(container, streamingManager) {
      this.container = container;
      this.manager = streamingManager;
      this.selectedStream = null;
      this.isStreaming = false;
      this.collaborationMode = 'view-only';

      this.setupUI();
      this.setupEventListeners();
      this.updateStats();
    }

    setupUI() {
      setHTMLSafe(this.container, `
        <div class="streaming-ui">
          <div class="streaming-toolbar">
            <div class="streaming-info">
              <span class="streaming-status" id="streaming-status">Status: Stopped</span>
              <span class="viewer-count" id="viewer-count">Viewers: 0</span>
              <span class="collaborator-count" id="collaborator-count">Collaborators: 0</span>
            </div>
            <div class="streaming-controls">
              <button id="start-streaming" title="Start Streaming">Start Stream</button>
              <button id="stop-streaming" title="Stop Streaming" disabled>Stop Stream</button>
              <button id="start-recording" title="Start Recording">Record</button>
              <button id="stop-recording" title="Stop Recording" disabled>Stop Recording</button>
            </div>
          </div>

          <div class="streaming-settings">
            <div class="setting-group">
              <label for="streaming-protocol">Protocol:</label>
              <select id="streaming-protocol">
                ${Object.entries(STREAMING_PROTOCOLS).map(([key, name]) => `<option value="${key}">${name}</option>`).join('')}
              </select>
            </div>
            <div class="setting-group">
              <label for="streaming-quality">Quality:</label>
              <select id="streaming-quality">
                ${Object.entries(STREAMING_QUALITIES).map(([key, config]) => `<option value="${key}">${key} (${config.width}x${config.height})</option>`).join('')}
              </select>
            </div>
            <div class="setting-group">
              <label for="stream-title">Stream Title:</label>
              <input type="text" id="stream-title" placeholder="Enter stream title">
            </div>
            <div class="setting-group">
              <label for="collaboration-mode">Collaboration Mode:</label>
              <select id="collaboration-mode">
                ${Object.entries(COLLABORATION_MODES).map(([key, name]) => `<option value="${key}">${name}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="collaboration-panel">
            <h4>Collaborators</h4>
            <div class="collaborator-list" id="collaborator-list"></div>
            <div class="collaboration-actions">
              <button id="join-collaboration" title="Join Collaboration">Join</button>
              <button id="leave-collaboration" title="Leave Collaboration" disabled>Leave</button>
              <button id="invite-collaborator" title="Invite">Invite</button>
            </div>
          </div>

          <div class="chat-panel">
            <h4>Chat</h4>
            <div class="chat-messages" id="chat-messages"></div>
            <div class="chat-input">
              <input type="text" id="chat-input" placeholder="Type a message...">
              <button id="send-chat" title="Send">Send</button>
            </div>
          </div>

          <div class="streaming-stats">
            <h4>Streaming Statistics</h4>
            <div class="stats-grid">
              <div class="stat-item">
                <span class="stat-label">Bitrate:</span>
                <span class="stat-value" id="bitrate">0 kbps</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">FPS:</span>
                <span class="stat-value" id="fps">0</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Latency:</span>
                <span class="stat-value" id="latency">0ms</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Dropped Frames:</span>
                <span class="stat-value" id="dropped-frames">0</span>
              </div>
            </div>
          </div>

          <div class="collaboration-creator" id="collaboration-creator" style="display: none;">
            <h4>Join Collaboration</h4>
            <div class="form-group">
              <label for="session-id">Session ID:</label>
              <input type="text" id="session-id" placeholder="Enter session ID">
            </div>
            <div class="form-group">
              <label for="user-name">Your Name:</label>
              <input type="text" id="user-name" placeholder="Enter your name">
            </div>
            <div class="form-group">
              <label for="collaboration-permissions">Permissions:</label>
              <select id="collaboration-permissions">
                ${Object.entries(COLLABORATION_MODES).map(([key, name]) => `<option value="${key}">${name}</option>`).join('')}
              </select>
            </div>
            <div class="creator-actions">
              <button id="join-session" class="primary-btn">Join Session</button>
              <button id="cancel-join" class="secondary-btn">Cancel</button>
            </div>
          </div>
        </div>
      `);

      this.streamingStatus = this.container.querySelector('#streaming-status');
      this.viewerCount = this.container.querySelector('#viewer-count');
      this.collaboratorCount = this.container.querySelector('#collaborator-count');
      this.collaboratorList = this.container.querySelector('#collaborator-list');
      this.chatMessages = this.container.querySelector('#chat-messages');
      this.collaborationCreator = this.container.querySelector('#collaboration-creator');
    }

    setupEventListeners() {
      // Streaming controls
      this.container.querySelector('#start-streaming').addEventListener('click', () => {
        this.startStreaming();
      });

      this.container.querySelector('#stop-streaming').addEventListener('click', () => {
        this.stopStreaming();
      });

      this.container.querySelector('#start-recording').addEventListener('click', () => {
        this.startRecording();
      });

      this.container.querySelector('#stop-recording').addEventListener('click', () => {
        this.stopRecording();
      });

      // Collaboration controls
      this.container.querySelector('#join-collaboration').addEventListener('click', () => {
        this.showCollaborationCreator();
      });

      this.container.querySelector('#leave-collaboration').addEventListener('click', () => {
        this.leaveCollaboration();
      });

      this.container.querySelector('#invite-collaborator').addEventListener('click', () => {
        this.inviteCollaborator();
      });

      // Chat
      this.container.querySelector('#send-chat').addEventListener('click', () => {
        this.sendChatMessage();
      });

      this.container.querySelector('#chat-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.sendChatMessage();
        }
      });

      // Collaboration creator
      this.container.querySelector('#join-session').addEventListener('click', () => {
        this.joinSession();
      });

      this.container.querySelector('#cancel-join').addEventListener('click', () => {
        this.hideCollaborationCreator();
      });

      // Manager events
      this.manager.onStreamStart = (config) => {
        this.updateStreamingStatus('Streaming', 'live');
        this.showNotification(`Stream started: ${config.title}`, 'success');
      };

      this.manager.onStreamEnd = (stream) => {
        this.updateStreamingStatus('Stopped', 'inactive');
        this.showNotification(`Stream ended: ${stream.title}`, 'info');
      };

      this.manager.onCollaboratorJoin = (collaborator) => {
        this.updateCollaboratorList();
        this.showNotification(`${collaborator.userInfo.name} joined the collaboration`, 'info');
      };

      this.manager.onCollaboratorLeave = (collaborator) => {
        this.updateCollaboratorList();
        this.showNotification(`${collaborator.userInfo.name} left the collaboration`, 'info');
      };

      // Update stats periodically
      setInterval(() => {
        this.updateStats();
      }, 2000);
    }

    async startStreaming() {
      const protocol = this.container.querySelector('#streaming-protocol').value;
      const quality = this.container.querySelector('#streaming-quality').value;
      const title = this.container.querySelector('#stream-title').value || 'Artone Stream';

      try {
        const streamId = await this.manager.startStreaming({
          protocol,
          quality,
          title,
          enableChat: true,
          enableRecording: true
        });

        this.isStreaming = true;
        this.updateControls();
        console.log('Streaming started:', streamId);
      } catch (error) {
        this.showNotification(`Failed to start streaming: ${error.message}`, 'error');
      }
    }

    async stopStreaming() {
      if (!this.selectedStream) return;

      try {
        await this.manager.stopStreaming(this.selectedStream);
        this.isStreaming = false;
        this.updateControls();
        console.log('Streaming stopped');
      } catch (error) {
        this.showNotification(`Failed to stop streaming: ${error.message}`, 'error');
      }
    }

    async startRecording() {
      if (!this.selectedStream) return;

      try {
        await this.manager.startRecording(this.selectedStream);
        this.container.querySelector('#start-recording').disabled = true;
        this.container.querySelector('#stop-recording').disabled = false;
        this.showNotification('Recording started', 'success');
      } catch (error) {
        this.showNotification(`Failed to start recording: ${error.message}`, 'error');
      }
    }

    async stopRecording() {
      try {
        await this.manager.stopRecording();
        this.container.querySelector('#start-recording').disabled = false;
        this.container.querySelector('#stop-recording').disabled = true;
        this.showNotification('Recording stopped', 'success');
      } catch (error) {
        this.showNotification(`Failed to stop recording: ${error.message}`, 'error');
      }
    }

    showCollaborationCreator() {
      this.collaborationCreator.style.display = 'block';
    }

    hideCollaborationCreator() {
      this.collaborationCreator.style.display = 'none';
      this.clearCreatorForm();
    }

    clearCreatorForm() {
      this.container.querySelector('#session-id').value = '';
      this.container.querySelector('#user-name').value = '';
    }

    async joinSession() {
      const sessionId = this.container.querySelector('#session-id').value.trim();
      const userName = this.container.querySelector('#user-name').value.trim();
      const permissions = this.container.querySelector('#collaboration-permissions').value;

      if (!sessionId || !userName) {
        this.showNotification('Please fill in all fields', 'error');
        return;
      }

      try {
        const collaboratorId = await this.manager.joinCollaboration(sessionId, {
          name: userName,
          permissions: permissions
        });

        this.hideCollaborationCreator();
        this.updateControls();
        this.showNotification(`Joined collaboration as ${userName}`, 'success');
      } catch (error) {
        this.showNotification(`Failed to join collaboration: ${error.message}`, 'error');
      }
    }

    async leaveCollaboration() {
      // Leave current collaboration
      this.showNotification('Left collaboration', 'info');
    }

    inviteCollaborator() {
      // Generate invitation link
      const sessionId = 'artone-session-' + Date.now();
      const inviteLink = `${window.location.origin.replace(/\/$/, '')}/?session=${encodeURIComponent(sessionId)}`;

      navigator.clipboard.writeText(inviteLink).then(() => {
        this.showNotification('Invitation link copied to clipboard', 'success');
      }).catch(() => {
        this.showNotification('Failed to copy invitation link', 'error');
      });
    }

    sendChatMessage() {
      const input = this.container.querySelector('#chat-input');
      const message = input.value.trim();

      if (!message) return;

      // Send chat message
      this.addChatMessage('You', message);
      input.value = '';

      // In a real implementation, this would send to the server
      console.log('Chat message:', message);
    }

    addChatMessage(sender, message) {
      const messageElement = document.createElement('div');
      messageElement.className = 'chat-message';
      setHTMLSafe(messageElement, `
        <span class="chat-sender">${sender}:</span>
        <span class="chat-text">${message}</span>
        <span class="chat-time">${new Date().toLocaleTimeString()}</span>
      `);

      this.chatMessages.appendChild(messageElement);
      this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    updateControls() {
      const startBtn = this.container.querySelector('#start-streaming');
      const stopBtn = this.container.querySelector('#stop-streaming');
      const joinBtn = this.container.querySelector('#join-collaboration');
      const leaveBtn = this.container.querySelector('#leave-collaboration');

      if (this.isStreaming) {
        startBtn.disabled = true;
        stopBtn.disabled = false;
      } else {
        startBtn.disabled = false;
        stopBtn.disabled = true;
      }

      if (this.manager.collaborators.size > 0) {
        joinBtn.disabled = true;
        leaveBtn.disabled = false;
      } else {
        joinBtn.disabled = false;
        leaveBtn.disabled = true;
      }
    }

    updateStreamingStatus(status, type) {
      const statusElement = this.container.querySelector('#streaming-status');
      statusElement.textContent = `Status: ${status}`;
      statusElement.className = `streaming-status status-${type}`;
    }

    updateCollaboratorList() {
      const collaborators = Array.from(this.manager.collaborators.values());

      setHTMLSafe(this.collaboratorList, collaborators.map(collaborator => `
        <div class="collaborator-item" data-collaborator-id="${collaborator.id}">
          <div class="collaborator-info">
            <div class="collaborator-name">${collaborator.userInfo.name}</div>
            <div class="collaborator-permissions">${COLLABORATION_MODES[collaborator.permissions]}</div>
            <div class="collaborator-status ${collaborator.isConnected ? 'connected' : 'disconnected'}">
              ${collaborator.isConnected ? 'Connected' : 'Disconnected'}
            </div>
          </div>
          <div class="collaborator-actions">
            <button class="message-collaborator" title="Message">💬</button>
            <button class="kick-collaborator" title="Remove">❌</button>
          </div>
        </div>
      `).join(''));

      this.container.querySelector('#collaborator-count').textContent =
        `Collaborators: ${collaborators.length}`;
    }

    updateStats() {
      const stats = this.manager.getStreamingStats();

      this.streamingStatus.textContent = `Status: ${stats.isStreaming ? 'Streaming' : 'Stopped'}`;
      this.viewerCount.textContent = `Viewers: ${stats.streams.reduce((total, stream) => total + (stream.viewers || 0), 0)}`;
      this.collaboratorCount.textContent = `Collaborators: ${stats.collaborators}`;

      // Update streaming stats
      this.container.querySelector('#bitrate').textContent = '2500 kbps'; // Mock value
      this.container.querySelector('#fps').textContent = '30'; // Mock value
      this.container.querySelector('#latency').textContent = '45ms'; // Mock value
      this.container.querySelector('#dropped-frames').textContent = '2'; // Mock value
    }

    showNotification(message, type = 'info') {
      const notification = document.createElement('div');
      notification.className = `notification notification-${type}`;
      notification.textContent = message;

      document.body.appendChild(notification);

      setTimeout(() => {
        notification.classList.add('show');
      }, 100);

      setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
          document.body.removeChild(notification);
        }, 300);
      }, 3000);
    }

    refresh() {
      this.updateStats();
      this.updateCollaboratorList();
    }
  }

  // Export to global scope
  global.StreamingManager = StreamingManager;
  global.StreamingUI = StreamingUI;
  global.STREAMING_PROTOCOLS = STREAMING_PROTOCOLS;
  global.STREAMING_QUALITIES = STREAMING_QUALITIES;
  global.COLLABORATION_MODES = COLLABORATION_MODES;

})(typeof window !== 'undefined' ? window : globalThis);
