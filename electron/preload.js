const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getInitialState: () => ipcRenderer.invoke('get-initial-state'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  saveProviderConfig: (data) => ipcRenderer.invoke('save-provider-config', data),
  createSession: (data) => ipcRenderer.invoke('create-session', data),
  deleteSession: (id) => ipcRenderer.invoke('delete-session', id),
  getSession: (id) => ipcRenderer.invoke('get-session', id),
  updateSessionMeta: (data) => ipcRenderer.invoke('update-session-meta', data),
  renameSession: (sessionId, name) => ipcRenderer.invoke('rename-session', { sessionId, name }),
  exportSession: (sessionId, format) => ipcRenderer.invoke('export-session', { sessionId, format }),
  searchSession: (sessionId, query) => ipcRenderer.invoke('search-session', { sessionId, query }),
  clearSessionHistory: (sessionId) => ipcRenderer.invoke('clear-session-history', sessionId),
  sendMessage: (data) => ipcRenderer.invoke('send-message', data),
  transcribeAudio: (buffer) => ipcRenderer.invoke('transcribe-audio', buffer),
  startAssemblyTranscription: () => ipcRenderer.invoke('start-assembly-transcription'),
  stopAssemblyTranscription: () => ipcRenderer.invoke('stop-assembly-transcription'),
  streamAudioChunk: (chunk) => ipcRenderer.invoke('stream-audio-chunk', chunk),
  speakText: (text) => ipcRenderer.invoke('speak-text', text),
  stopSpeaking: () => ipcRenderer.invoke('stop-speaking'),
  elevenLabsSpeechToSpeech: (audioBuffer) => ipcRenderer.invoke('elevenlabs-speech-to-speech', audioBuffer),
  openVoiceWindow: (sessionId) => ipcRenderer.invoke('open-voice-window', sessionId),
  openCanvasWindow: (sessionId) => ipcRenderer.invoke('open-canvas-window', sessionId),
  openFaceEditor: () => ipcRenderer.invoke('open-face-editor'),
  sendFaceControl: (data) => ipcRenderer.invoke('send-face-control', data),
  analyzeSentiment: (data) => ipcRenderer.invoke('analyze-sentiment', data),
  setCameraStatus: (sessionId, enabled) => ipcRenderer.invoke('set-camera-status', { sessionId, enabled }),
  getCameraStatus: (sessionId) => ipcRenderer.invoke('get-camera-status', { sessionId }),
  // Vision (Gemma 3 or GPT-4.1)
  setCameraEnabled: (sessionId, enabled) => ipcRenderer.invoke('set-camera-enabled', { sessionId, enabled }),
  isCameraEnabled: (sessionId) => ipcRenderer.invoke('is-camera-enabled', sessionId),
  storeFrame: (sessionId, frame) => ipcRenderer.invoke('store-frame', { sessionId, frame }),
  analyzeVision: (sessionId, prompt) => ipcRenderer.invoke('analyze-vision', { sessionId, prompt }),
  getVisionProvider: () => ipcRenderer.invoke('get-vision-provider'),
  
  // YOLO Tracking
  yoloStart: () => ipcRenderer.invoke('yolo-start'),
  yoloStop: () => ipcRenderer.invoke('yolo-stop'),
  yoloHealth: () => ipcRenderer.invoke('yolo-health'),
  yoloTrackFace: (image) => ipcRenderer.invoke('yolo-track-face', { image }),
  yoloTrackObject: (image, object) => ipcRenderer.invoke('yolo-track-object', { image, object }),
  yoloTrackAuto: (image) => ipcRenderer.invoke('yolo-track-auto', { image }),
  yoloSetTracking: (object) => ipcRenderer.invoke('yolo-set-tracking', { object }),
  yoloClearTracking: () => ipcRenderer.invoke('yolo-clear-tracking'),
  yoloDetectAll: (image) => ipcRenderer.invoke('yolo-detect-all', { image }),
  yoloGetClasses: () => ipcRenderer.invoke('yolo-get-classes'),
  onTrackingUpdate: (callback) => ipcRenderer.on('tracking-update', (event, data) => callback(data)),
  removeTrackingUpdateListener: () => ipcRenderer.removeAllListeners('tracking-update'),
  onFaceControl: (callback) => ipcRenderer.on('face-control', (event, data) => callback(data)),
  removeFaceControlListener: () => ipcRenderer.removeAllListeners('face-control'),
  broadcastExpressionsUpdate: (data) => ipcRenderer.invoke('broadcast-expressions-update', data),
  onExpressionsUpdate: (callback) => ipcRenderer.on('expressions-update', (event, data) => callback(data)),
  removeExpressionsUpdateListener: () => ipcRenderer.removeAllListeners('expressions-update'),
  
  // Sessions update listener (for cross-window sync)
  onSessionsUpdated: (callback) => ipcRenderer.on('sessions-updated', (event, data) => callback(data)),
  removeSessionsUpdatedListener: () => ipcRenderer.removeAllListeners('sessions-updated'),
  
  // Face color update listener
  onFaceColorUpdate: (callback) => ipcRenderer.on('face-color-update', (event, data) => callback(data)),
  removeFaceColorUpdateListener: () => ipcRenderer.removeAllListeners('face-color-update'),
  
  // Audio playback control
  onStopAudioPlayback: (callback) => ipcRenderer.on('stop-audio-playback', () => callback()),
  removeStopAudioPlaybackListener: () => ipcRenderer.removeAllListeners('stop-audio-playback'),
  
  // Memory management
  getMemories: () => ipcRenderer.invoke('get-memories'),
  addMemory: (content, category) => ipcRenderer.invoke('add-memory', { content, category }),
  updateMemory: (id, content, category) => ipcRenderer.invoke('update-memory', { id, content, category }),
  deleteMemory: (id) => ipcRenderer.invoke('delete-memory', { id }),
  clearAllMemories: () => ipcRenderer.invoke('clear-all-memories'),
  
  // Web Search
  webSearch: (query, count) => ipcRenderer.invoke('web-search', { query, count }),
  webSearchStatus: () => ipcRenderer.invoke('web-search-status'),
  
  // Event Listeners for Streaming
  onStreamStart: (callback) => ipcRenderer.on('stream-start', (event, ...args) => callback(...args)),
  onStreamToken: (callback) => ipcRenderer.on('stream-token', (event, ...args) => callback(...args)),
  onStreamEnd: (callback) => ipcRenderer.on('stream-end', (event, ...args) => callback(...args)),
  onStreamError: (callback) => ipcRenderer.on('stream-error', (event, ...args) => callback(...args)),
  onTranscriptionText: (callback) => {
      const subscription = (event, ...args) => callback(...args);
      ipcRenderer.on('transcription-text', subscription);
      return () => ipcRenderer.removeListener('transcription-text', subscription);
  },
  // Cleanup
  removeStreamListeners: () => {
      ipcRenderer.removeAllListeners('stream-start');
      ipcRenderer.removeAllListeners('stream-token');
      ipcRenderer.removeAllListeners('stream-end');
      ipcRenderer.removeAllListeners('stream-error');
      ipcRenderer.removeAllListeners('transcription-text');
  }
});
