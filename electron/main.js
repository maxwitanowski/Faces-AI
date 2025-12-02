const { app, BrowserWindow, ipcMain, session, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Store = require('electron-store');
const { randomUUID } = require('crypto');
const fs = require('fs');
const os = require('os');
const { DependencyManager, DEPENDENCIES } = require('./dependencyManager');
const { FacesInstaller } = require('./installer');

const store = new Store();
const dependencyManager = new DependencyManager(store);
const installer = new FacesInstaller(store);

let mainWindow;
let pythonProcess = null;

// ============================================
// Bundled Python Executable Path Helpers
// ============================================

/**
 * Get path to a bundled Python executable
 * In development: returns null (use python interpreter)
 * In production: returns path to PyInstaller-built executable
 */
function getBundledExePath(scriptName) {
    if (app.isPackaged) {
        const ext = process.platform === 'win32' ? '.exe' : '';
        return path.join(process.resourcesPath, 'python', scriptName, scriptName + ext);
    }
    return null;
}

/**
 * Get path to a model file
 */
function getModelPath(modelName) {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'models', modelName);
    }
    return path.join(__dirname, '..', modelName);
}

/**
 * Spawn a Python process - uses bundled exe in production, installer venv, or system python
 */
function spawnPythonProcess(scriptName, scriptPath, options = {}) {
    const bundledExe = getBundledExePath(scriptName);

    if (bundledExe && fs.existsSync(bundledExe)) {
        // Production: use bundled executable
        console.log(`[${scriptName}] Using bundled executable: ${bundledExe}`);
        return spawn(bundledExe, [], {
            ...options,
            env: {
                ...process.env,
                MODEL_PATH: getModelPath('yolov11n.pt'),
                ...options.env
            }
        });
    } else {
        // Use installer's Python if available, otherwise system Python
        const pythonPath = installer.getPythonPath();
        const modelsPath = installer.getModelsPath();
        console.log(`[${scriptName}] Using Python: ${pythonPath}`);
        return spawn(pythonPath, ['-u', scriptPath], {
            ...options,
            env: {
                ...process.env,
                MODEL_PATH: path.join(modelsPath, 'yolo11n.pt'),
                MODELS_PATH: modelsPath,
                ...options.env
            }
        });
    }
}

// Broadcast sessions update to all windows
function broadcastSessionsUpdate() {
    try {
        const sessionsObj = store.get('sessions', {});
        // Convert to array sorted by timestamp (same as getInitialState)
        const sessionList = Object.values(sessionsObj).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        BrowserWindow.getAllWindows().forEach(win => {
            if (win && win.webContents && !win.isDestroyed()) {
                win.webContents.send('sessions-updated', { sessions: sessionList });
            }
        });
    } catch (err) {
        console.error('[broadcastSessionsUpdate] Error:', err);
    }
}

function startPythonHandler() {
    if (pythonProcess) return;

    const scriptPath = path.join(__dirname, '../python/local_whisper.py');

    console.log("Starting High-Performance Local Whisper Process...");
    pythonProcess = spawnPythonProcess('local_whisper', scriptPath);

    pythonProcess.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('TEXT:')) {
                const text = trimmed.replace('TEXT:', '').trim();
                if (mainWindow) {
                    mainWindow.webContents.send('transcription-text', {
                        text: text,
                        isFinal: true // Local whisper sends complete phrases
                    });
                }
            } else {
                console.log(`[Python] ${trimmed}`);
            }
        }
    });

    pythonProcess.stderr.on('data', (data) => {
        console.error(`[Python Error] ${data}`);
    });

    pythonProcess.on('close', (code) => {
        console.log(`Python process exited with code ${code}`);
        pythonProcess = null;
        // Auto-restart logic if needed, but let's keep simple
    });
}

let localSttProcess = null;
const sttQueue = [];
let sttPending = null;

// YOLO Tracking Server
let yoloProcess = null;
const YOLO_PORT = 8765;
const YOLO_URL = `http://localhost:${YOLO_PORT}`;

async function startYoloTracker() {
    if (yoloProcess) return true;

    const scriptPath = path.join(__dirname, '../python/yolo_tracker.py');

    console.log("[YOLO] Starting YOLO Tracking Server...");

    return new Promise((resolve) => {
        try {
            yoloProcess = spawnPythonProcess('yolo_tracker', scriptPath, {
                cwd: path.join(__dirname, '..')
            });
            
            yoloProcess.stdout.on('data', (data) => {
                console.log(`[YOLO] ${data.toString().trim()}`);
            });
            
            yoloProcess.stderr.on('data', (data) => {
                console.error(`[YOLO Error] ${data.toString().trim()}`);
            });
            
            yoloProcess.on('close', (code) => {
                console.log(`[YOLO] Process exited with code ${code}`);
                yoloProcess = null;
            });
            
            // Wait for server to be ready
            setTimeout(async () => {
                try {
                    const response = await fetch(`${YOLO_URL}/health`);
                    if (response.ok) {
                        console.log("[YOLO] Server ready!");
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                } catch (e) {
                    console.log("[YOLO] Server not ready yet, but process started");
                    resolve(true);
                }
            }, 2000);
            
        } catch (e) {
            console.error("[YOLO] Failed to start:", e);
            resolve(false);
        }
    });
}

async function stopYoloTracker() {
    if (yoloProcess) {
        yoloProcess.kill();
        yoloProcess = null;
        console.log("[YOLO] Tracker stopped");
    }
}

async function yoloRequest(endpoint, data = {}) {
    try {
        const response = await fetch(`${YOLO_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return await response.json();
    } catch (e) {
        return { success: false, error: e.message };
    }
}

function startLocalSttHandler() {
    if (localSttProcess) return;

    const scriptPath = path.join(__dirname, '../python/local_stt.py');

    console.log("Starting Local STT Process...");
    try {
        localSttProcess = spawnPythonProcess('local_stt', scriptPath);

        localSttProcess.stdout.on('data', (data) => {
            const lines = data.toString().split('\n');
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const result = JSON.parse(line);
                    if (sttPending) {
                        if (result.success) {
                            sttPending.resolve(result);
                        } else {
                            sttPending.reject(result);
                        }
                        sttPending = null;
                        processNextSTT();
                    }
                } catch (e) {
                    console.warn("[Local STT] Non-JSON output:", line);
                }
            }
        });

        localSttProcess.stderr.on('data', (data) => {
            console.error(`[Local STT] ${data}`);
        });

        localSttProcess.on('close', (code) => {
            console.log(`Local STT process exited with code ${code}`);
            localSttProcess = null;
            if (sttPending) {
                sttPending.reject({ success: false, error: "Process exited unexpectedly" });
                sttPending = null;
            }
        });
    } catch (e) {
        console.error("Failed to spawn Local STT:", e);
    }
}

function processNextSTT() {
    if (sttPending || sttQueue.length === 0) return;
    
    const { audioPath, resolve, reject } = sttQueue.shift();
    sttPending = { resolve, reject };
    
    if (localSttProcess && localSttProcess.stdin) {
        localSttProcess.stdin.write(JSON.stringify({ audio_path: audioPath }) + '\n');
    } else {
        startLocalSttHandler();
        if (localSttProcess) {
             localSttProcess.stdin.write(JSON.stringify({ audio_path: audioPath }) + '\n');
        } else {
             reject({ success: false, error: "Local STT process not running" });
             sttPending = null;
        }
    }
}

let piperProcess = null;
const piperQueue = [];
let piperPending = null;

function startPiperHandler() {
    if (piperProcess) return;

    const scriptPath = path.join(__dirname, '../python/piper_tts.py');

    console.log("Starting Piper TTS Process...");
    try {
        piperProcess = spawnPythonProcess('piper_tts', scriptPath);

        piperProcess.stdout.on('data', (data) => {
            const lines = data.toString().split('\n');
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const result = JSON.parse(line);
                    if (piperPending) {
                        if (result.success) {
                            piperPending.resolve(result);
                        } else {
                            piperPending.reject(result);
                        }
                        piperPending = null;
                        processNextPiperTTS();
                    }
                } catch (e) {
                    // console.warn("[Piper] Non-JSON output:", line);
                }
            }
        });

        piperProcess.stderr.on('data', (data) => {
            console.error(`[Piper] ${data}`);
        });

        piperProcess.on('close', (code) => {
            console.log(`Piper process exited with code ${code}`);
            piperProcess = null;
            if (piperPending) {
                piperPending.reject({ success: false, error: "Process exited unexpectedly" });
                piperPending = null;
            }
        });
    } catch (e) {
        console.error("Failed to spawn Piper:", e);
    }
}

function processNextPiperTTS() {
    if (piperPending || piperQueue.length === 0) return;
    
    const { text, resolve, reject } = piperQueue.shift();
    piperPending = { resolve, reject };
    
    if (piperProcess && piperProcess.stdin) {
        // Sanitize text to single line
        const safeText = text.replace(/\n/g, ' ').trim();
        piperProcess.stdin.write(safeText + '\n');
    } else {
        // Try to restart?
        startPiperHandler();
        if (piperProcess) {
             const safeText = text.replace(/\n/g, ' ').trim();
             piperProcess.stdin.write(safeText + '\n');
        } else {
             reject({ success: false, error: "Piper process not running" });
             piperPending = null;
        }
    }
}

let kokoroProcess = null;
const ttsQueue = [];
let ttsPending = null;

function startKokoroHandler() {
    if (kokoroProcess) return;

    const scriptPath = path.join(__dirname, '../python/kokoro_tts.py');

    console.log("Starting Kokoro TTS Process...");
    try {
        kokoroProcess = spawnPythonProcess('kokoro_tts', scriptPath);

        kokoroProcess.stdout.on('data', (data) => {
            const lines = data.toString().split('\n');
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const result = JSON.parse(line);
                    if (ttsPending) {
                        ttsPending.resolve(result);
                        ttsPending = null;
                        processNextTTS();
                    }
                } catch (e) {
                    // console.warn("[Kokoro] Non-JSON output:", line);
                }
            }
        });

        kokoroProcess.stderr.on('data', (data) => {
            console.error(`[Kokoro] ${data}`);
        });

        kokoroProcess.on('close', (code) => {
            console.log(`Kokoro process exited with code ${code}`);
            kokoroProcess = null;
            if (ttsPending) {
                ttsPending.reject({ success: false, error: "Process exited unexpectedly" });
                ttsPending = null;
            }
        });
    } catch (e) {
        console.error("Failed to spawn Kokoro:", e);
    }
}

function processNextTTS() {
    if (ttsPending || ttsQueue.length === 0) return;
    
    const { text, resolve, reject } = ttsQueue.shift();
    ttsPending = { resolve, reject };
    
    if (kokoroProcess && kokoroProcess.stdin) {
        // Sanitize text to single line
        const safeText = text.replace(/\n/g, ' ').trim();
        kokoroProcess.stdin.write(safeText + '\n');
    } else {
        // Try to restart?
        startKokoroHandler();
        if (kokoroProcess) {
             const safeText = text.replace(/\n/g, ' ').trim();
             kokoroProcess.stdin.write(safeText + '\n');
        } else {
             reject({ success: false, error: "Kokoro process not running" });
             ttsPending = null;
        }
    }
}

// ElevenLabs Speech-to-Speech (Voice Changer)
ipcMain.handle('elevenlabs-speech-to-speech', async (event, audioBuffer) => {
    const apiKey = appSettings.elevenLabsApiKey;
    const voiceId = appSettings.elevenLabsVoiceId || '21m00Tcm4TlvDq8ikWAM';
    
    if (!apiKey) {
        return { success: false, error: "ElevenLabs API key not configured" };
    }

    try {
        const FormData = require('form-data');
        const form = new FormData();
        form.append('audio', Buffer.from(audioBuffer), {
            filename: 'audio.webm',
            contentType: 'audio/webm'
        });
        form.append('model_id', 'eleven_english_sts_v2');
        form.append('voice_settings', JSON.stringify({
            stability: 0.5,
            similarity_boost: 0.75
        }));

        const response = await fetch(`https://api.elevenlabs.io/v1/speech-to-speech/${voiceId}`, {
            method: 'POST',
            headers: {
                'Accept': 'audio/mpeg',
                'xi-api-key': apiKey,
                ...form.getHeaders()
            },
            body: form
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`ElevenLabs STS Error: ${response.status} - ${errorText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64Audio = `data:audio/mpeg;base64,${buffer.toString('base64')}`;
        
        return { success: true, audio: base64Audio };

    } catch (e) {
        console.error("ElevenLabs Speech-to-Speech Error:", e);
        return { success: false, error: e.message };
    }
});

// ============================================
// GPT-4.1 VISION SYSTEM
// ============================================
// Track camera status per session
const sessionCameraEnabled = {};
const sessionLastFrame = {};

// ============================================
// VISION SYSTEMS - Gemma 3 (Local) & GPT-4.1 (Cloud)
// ============================================

// Analyze image with local vision model via LM Studio (OpenAI-compatible)
async function analyzeImageWithLocalVision(base64Image, prompt = "What do you see in this image? Be concise.") {
    const localConfig = providers['local'];
    const baseUrl = localConfig?.baseURL || 'http://localhost:1234/v1';
    const modelName = localConfig?.model || 'default';
    
    console.log('[LocalVision] Analyzing image...');
    console.log('[LocalVision] URL:', baseUrl);
    
    try {
        // Build the correct URL for chat/completions
        let apiUrl = baseUrl.replace(/\/$/, '');
        if (apiUrl.endsWith('/v1')) {
            apiUrl = `${apiUrl}/chat/completions`;
        } else if (!apiUrl.includes('/chat/completions')) {
            apiUrl = `${apiUrl}/v1/chat/completions`;
        }
        
        // Ensure image has the data URL prefix
        let imageDataUrl = base64Image;
        if (!imageDataUrl.startsWith('data:')) {
            imageDataUrl = `data:image/jpeg;base64,${imageDataUrl}`;
        }
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: modelName,
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: prompt },
                            {
                                type: 'image_url',
                                image_url: { url: imageDataUrl }
                            }
                        ]
                    }
                ],
                max_tokens: 300,
                temperature: 0.4,
                stream: false
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('[LocalVision] API Error:', response.status, errorText);
            return { success: false, error: `Local Vision API error: ${response.status}` };
        }
        
        const data = await response.json();
        const description = data.choices?.[0]?.message?.content || '';
        
        console.log(`[LocalVision] Description: ${description.substring(0, 100)}...`);
        
        return { success: true, description };
    } catch (e) {
        console.error('[LocalVision] Error:', e);
        return { success: false, error: e.message };
    }
}

// Analyze image with GPT-4.1 Vision (Cloud)
async function analyzeImageWithGPT4Vision(base64Image, prompt = "What do you see in this image? Be concise.") {
    const pConfig = providers['openai'];
    if (!pConfig || !pConfig.apiKey) {
        return { success: false, error: 'OpenAI API key not configured' };
    }
    
    console.log('[GPT4Vision] Analyzing image...');
    
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${pConfig.apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4.1-mini',
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: prompt },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: base64Image,
                                    detail: 'low'
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 300
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('[GPT4Vision] API Error:', errorText);
            return { success: false, error: `GPT-4.1 Vision API error: ${response.status}` };
        }
        
        const data = await response.json();
        const description = data.choices?.[0]?.message?.content || '';
        
        console.log(`[GPT4Vision] Description: ${description.substring(0, 100)}...`);
        
        return { success: true, description };
    } catch (e) {
        console.error('[GPT4Vision] Error:', e);
        return { success: false, error: e.message };
    }
}

// IPC handlers for vision
ipcMain.handle('set-camera-enabled', (event, { sessionId, enabled }) => {
    sessionCameraEnabled[sessionId] = enabled;
    console.log(`[Vision] Camera ${enabled ? 'enabled' : 'disabled'} for session ${sessionId}`);
    return { success: true };
});

ipcMain.handle('is-camera-enabled', (event, sessionId) => {
    return { enabled: sessionCameraEnabled[sessionId] || false };
});

ipcMain.handle('store-frame', (event, { sessionId, frame }) => {
    sessionLastFrame[sessionId] = frame;
    return { success: true };
});

ipcMain.handle('analyze-vision', async (event, { sessionId, prompt }) => {
    const frame = sessionLastFrame[sessionId];
    if (!frame) {
        return { success: false, error: 'No frame available' };
    }
    // Use configured vision provider
    if (appSettings.visionProvider === 'gpt4') {
        return analyzeImageWithGPT4Vision(frame, prompt);
    } else {
        return analyzeImageWithLocalVision(frame, prompt);
    }
});

// Get current vision provider setting
ipcMain.handle('get-vision-provider', () => {
    return { provider: appSettings.visionProvider || 'local' };
});

// ============================================
// DEPENDENCY MANAGER HANDLERS
// ============================================

// Check if dependency setup is needed
ipcMain.handle('deps-needs-setup', async () => {
    return await dependencyManager.needsSetup();
});

// Get dependency status
ipcMain.handle('deps-check-status', async () => {
    const status = await dependencyManager.checkAllDependencies();
    const prefs = dependencyManager.getPreferences();
    return { status, preferences: prefs, dependencies: DEPENDENCIES };
});

// Set dependency preferences
ipcMain.handle('deps-set-preferences', async (event, prefs) => {
    dependencyManager.setPreferences(prefs);
    return { success: true };
});

// Install selected dependencies
ipcMain.handle('deps-install', async (event) => {
    try {
        const result = await dependencyManager.installSelectedDependencies((progress) => {
            // Send progress updates to renderer
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('deps-progress', progress);
            }
        });

        if (result.success) {
            dependencyManager.markSetupComplete();
        }

        return result;
    } catch (err) {
        console.error('[DependencyManager] Installation error:', err);
        return { success: false, error: err.message };
    }
});

// Skip dependency setup
ipcMain.handle('deps-skip-setup', async () => {
    dependencyManager.markSetupComplete();
    return { success: true };
});

// Reset setup (for testing)
ipcMain.handle('deps-reset', async () => {
    dependencyManager.resetSetup();
    return { success: true };
});

// ============================================
// INSTALLER HANDLERS
// ============================================

// Get installer status
ipcMain.handle('installer-get-status', async () => {
    return installer.getStatus();
});

// Start installation
ipcMain.handle('installer-start', async (event, preferences) => {
    return await installer.runInstallation(preferences, (progress) => {
        installer.sendProgress(progress);
    });
});

// Skip installation
ipcMain.handle('installer-skip', async () => {
    store.set('installerComplete', true);
    return { success: true };
});

// Close installer window
ipcMain.handle('installer-close', async () => {
    if (installer.installWindow && !installer.installWindow.isDestroyed()) {
        installer.installWindow.close();
    }
    return { success: true };
});

// ============================================
// YOLO TRACKING HANDLERS
// ============================================

// Start YOLO tracker
ipcMain.handle('yolo-start', async () => {
    const started = await startYoloTracker();
    return { success: started };
});

// Stop YOLO tracker
ipcMain.handle('yolo-stop', async () => {
    await stopYoloTracker();
    return { success: true };
});

// Check YOLO health
ipcMain.handle('yolo-health', async () => {
    try {
        const response = await fetch(`${YOLO_URL}/health`);
        return await response.json();
    } catch (e) {
        return { status: 'offline', error: e.message };
    }
});

// Track face (returns position for eye following)
ipcMain.handle('yolo-track-face', async (event, { image }) => {
    return await yoloRequest('/track/face', { image });
});

// Track specific object
ipcMain.handle('yolo-track-object', async (event, { image, object }) => {
    return await yoloRequest('/track/object', { image, object });
});

// Auto track (face or set object)
ipcMain.handle('yolo-track-auto', async (event, { image }) => {
    return await yoloRequest('/track/auto', { image });
});

// Set object to track (AI can call this)
ipcMain.handle('yolo-set-tracking', async (event, { object }) => {
    console.log(`[YOLO] AI requested tracking: ${object}`);
    return await yoloRequest('/track/set', { object });
});

// Clear tracking (back to face)
ipcMain.handle('yolo-clear-tracking', async () => {
    console.log('[YOLO] Clearing object tracking, back to face');
    return await yoloRequest('/track/clear', {});
});

// Detect all objects in frame
ipcMain.handle('yolo-detect-all', async (event, { image }) => {
    return await yoloRequest('/detect', { image });
});

// Get list of trackable classes
ipcMain.handle('yolo-get-classes', async () => {
    try {
        const response = await fetch(`${YOLO_URL}/classes`);
        return await response.json();
    } catch (e) {
        return { error: e.message };
    }
});

// Track if we should stop speaking (for interruption)
let shouldStopSpeaking = false;

ipcMain.handle('stop-speaking', async () => {
    console.log('[TTS] Stop speaking requested');
    shouldStopSpeaking = true;
    // Broadcast to all windows to stop audio playback
    BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) {
            win.webContents.send('stop-audio-playback');
        }
    });
    return { success: true };
});

ipcMain.handle('speak-text', async (event, text) => {
    // Reset stop flag at start of new speech
    shouldStopSpeaking = false;
    // Check setting
    const provider = appSettings.ttsProvider || 'local';
    const customUrl = appSettings.ttsUrl || '';
    console.log(`TTS Request: "${text.substring(0, 20)}..." using ${provider}`);

    if (provider === 'elevenlabs' && !appSettings.offlineMode) {
        // ELEVENLABS TTS
        const apiKey = appSettings.elevenLabsApiKey;
        const voiceId = appSettings.elevenLabsVoiceId || '21m00Tcm4TlvDq8ikWAM'; // Default: Rachel
        
        if (!apiKey) {
            console.error("ElevenLabs API key missing");
            return { success: false, error: "ElevenLabs API key not configured" };
        }

        try {
            const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
                method: 'POST',
                headers: {
                    'Accept': 'audio/mpeg',
                    'Content-Type': 'application/json',
                    'xi-api-key': apiKey
                },
                body: JSON.stringify({
                    text: text,
                    model_id: 'eleven_monolingual_v1',
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.75
                    }
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`ElevenLabs Error: ${response.status} - ${errorText}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const base64Audio = `data:audio/mpeg;base64,${buffer.toString('base64')}`;
            
            return { success: true, audio: base64Audio };

        } catch (e) {
            console.error("ElevenLabs TTS Error:", e);
            return { success: false, error: e.message };
        }

    } else if (provider === 'external' && customUrl) {
        // CUSTOM / EXTERNAL TTS (e.g. LocalAI, or another OpenAI-compatible endpoint)
        try {
            // Try standard OpenAI TTS format: POST /v1/audio/speech
            // Expects: { model, input, voice }
            // If user provided full URL including endpoint, use it. 
            // Otherwise assume base URL and append endpoint? 
            // User prompt said "running off of say lm studio", implying a base.
            // But in UI I put placeholder "http://localhost:8080/v1/audio/speech".
            // So I will assume full URL.
            
            const response = await fetch(customUrl, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    // Add Authorization if needed? For local usually not, but maybe empty Bearer
                    'Authorization': 'Bearer sk-local' 
                },
                body: JSON.stringify({
                    model: "tts-1",
                    input: text,
                    voice: "alloy" 
                })
            });

            if (!response.ok) {
                throw new Error(`External TTS Error: ${response.status} ${response.statusText}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            
            // Convert to base64
            // Determine mime type from header or default to mp3/wav?
            // OpenAI returns mp3 by default.
            const contentType = response.headers.get('content-type') || 'audio/mpeg';
            const base64Audio = `data:${contentType};base64,${buffer.toString('base64')}`;
            
            return { success: true, audio: base64Audio };

        } catch (e) {
            console.error("External TTS Failed:", e);
            return { success: false, error: e.message };
        }

    } else if (provider === 'openai' && !appSettings.offlineMode) {
        // OPENAI TTS
        const client = clients.openai || initClient('openai');
        if (!client) {
             console.error("OpenAI Client missing for TTS");
             return { success: false, error: "OpenAI Key missing" };
        }

        try {
            const tempFilePath = path.join(os.tmpdir(), `tts_${Date.now()}.mp3`);
            const mp3 = await client.audio.speech.create({
                model: "tts-1",
                voice: "alloy",
                input: text,
            });
            
            const buffer = Buffer.from(await mp3.arrayBuffer());
            await fs.promises.writeFile(tempFilePath, buffer);
            
            const base64Audio = `data:audio/mp3;base64,${buffer.toString('base64')}`;
            fs.unlink(tempFilePath, () => {});
            
            return { success: true, audio: base64Audio };
        } catch (e) {
            console.error("OpenAI TTS Error:", e);
            return { success: false, error: e.message };
        }
    } else if (provider === 'kokoro') {
        // LOCAL KOKORO TTS
        if (!kokoroProcess) startKokoroHandler();
        
        return new Promise((resolve, reject) => {
            const wrappedResolve = async (result) => {
                if (result.success && result.file) {
                    try {
                        const audioData = await fs.promises.readFile(result.file);
                        const base64Audio = `data:audio/wav;base64,${audioData.toString('base64')}`;
                        fs.unlink(result.file, () => {});
                        resolve({ success: true, audio: base64Audio });
                    } catch (e) {
                        resolve({ success: false, error: "Failed to read audio file" });
                    }
                } else {
                    resolve(result);
                }
            };
            
            ttsQueue.push({ text, resolve: wrappedResolve, reject });
            processNextTTS();
        });
    } else {
        // LOCAL PIPER TTS (Default fallback)
        if (!piperProcess) startPiperHandler();
        
        return new Promise((resolve, reject) => {
            // We'll wrap the original resolve to read the file and return base64
            const wrappedResolve = async (result) => {
                if (result.success && result.file) {
                    try {
                        const audioData = await fs.promises.readFile(result.file);
                        const base64Audio = `data:audio/wav;base64,${audioData.toString('base64')}`;
                        // Cleanup temp file
                        fs.unlink(result.file, () => {});
                        resolve({ success: true, audio: base64Audio });
                    } catch (e) {
                        resolve({ success: false, error: "Failed to read audio file" });
                    }
                } else {
                    resolve(result);
                }
            };
            
            piperQueue.push({ text, resolve: wrappedResolve, reject });
            processNextPiperTTS();
        });
    }
});


// Initialize providers with stored config or defaults
const defaultProviders = {
  openai: { apiKey: '', model: 'gpt-4o', baseURL: '' },
  anthropic: { apiKey: '', model: 'claude-sonnet-4-20250514', baseURL: '' },
  gemini: { apiKey: '', model: 'gemini-1.5-pro', baseURL: '' },
  local: { apiKey: 'not-needed', model: 'default', baseURL: 'http://localhost:11434/v1' }
};

// Load config from store
let providers = store.get('providers', defaultProviders);

// Default Face Configuration
const DEFAULT_FACE_CONFIG = {
    eyeSpacing: 75, eyeY: -30, eyeWidth: 40, eyeHeight: 26, pupilSize: 7,
    browY: -68, browLength: 48, browThickness: 4, browInnerAngleMult: 18, browOuterAngleMult: 10,
    mouthY: 58, mouthWidth: 55, mouthThickness: 3, smileCurveMult: 30, mouthOpenHeight: 28, frownCornerDrop: 10,
    thinkingSpeed: 1.2, thinkingRangeX: 12, thinkingRangeY: 5, thinkingBaseY: 8, thinkingFreqX: 2.5, thinkingFreqY: 1.7,
    lineThickness: 3, maxScale: 1.0, idleMovement: 1.0, talkBrowBounce: 1.0, talkHeadBob: 1.0
};

// Default Expressions
const DEFAULT_EXPRESSIONS = {
    'Neutral': { warmth: 0, energy: 0, openness: 0, positivity: 0, color: '#64748b' },
    'Happy': { warmth: 0.6, energy: 0.3, openness: 0, positivity: 0.7, color: '#10b981' },
    'Sad': { warmth: 0.5, energy: -0.4, openness: 0, positivity: -0.7, color: '#3b82f6' },
    'Angry': { warmth: -0.8, energy: 0.5, openness: 0, positivity: -0.3, color: '#ef4444' },
    'Surprised': { warmth: 0.1, energy: 0.3, openness: 0.8, positivity: 0.1, color: '#a855f7' },
    'Scared': { warmth: 0, energy: 0.4, openness: 0.7, positivity: -0.3, color: '#8b5cf6' },
    'Excited': { warmth: 0.6, energy: 0.8, openness: 0.2, positivity: 0.6, color: '#f59e0b' },
    'Disgusted': { warmth: -0.6, energy: 0.2, openness: -0.5, positivity: -0.4, color: '#84cc16' },
    'Thinking': { warmth: 0, energy: -0.1, openness: -0.1, positivity: 0, color: '#06b6d4', isThinking: true },
    'Skeptical': { warmth: -0.3, energy: 0, openness: -0.4, positivity: -0.1, color: '#f97316' },
    'Smug': { warmth: 0.3, energy: 0.1, openness: -0.2, positivity: 0.4, color: '#ec4899' },
    'Worried': { warmth: 0.6, energy: 0.1, openness: 0.4, positivity: -0.6, color: '#fb923c' }
};

// Default Visualizer Configuration
const DEFAULT_VISUALIZER_CONFIG = {
    enabled: false, type: 'bars',
    color: '#6366f1', gradientStart: '#ec4899', gradientEnd: '#06b6d4', useGradient: true,
    rainbowMode: false, rainbowSpeed: 1.0, opacity: 0.8,
    position: 'bottom', offsetX: 0, offsetY: 0, width: 400, height: 150, rotation: 0,
    barCount: 32, barWidth: 8, barMinHeight: 4, barMaxHeight: 80, barGap: 3, barBorderRadius: 2, barSkew: 0, barTaper: 1.0,
    lineWidth: 3, waveAmplitude: 1.0, waveFrequency: 4, waveSpeed: 200, waveOffset: 0, waveMirrorGap: 40,
    circleRadius: 80, circleStartAngle: 0, circleEndAngle: 360, circleDirection: 1, circleBarLength: 1.0,
    dotMinSize: 4, dotMaxSize: 20, dotBounceHeight: 30, dotBounceSpeed: 150,
    glowEnabled: true, glowIntensity: 0.5, glowSpread: 15,
    shadowEnabled: false, shadowOffsetX: 2, shadowOffsetY: 2, shadowBlur: 4, shadowColor: '#000000',
    smoothing: 0.8, reactivity: 1.0, mirrorEffect: true, flipVertical: false, flipHorizontal: false,
    scaleX: 1.0, scaleY: 1.0, perspective: 0, depthScale: 1.0
};

// General Settings
const defaultSettings = { 
    offlineMode: false, 
    ttsProvider: 'local',
    ttsUrl: '',
    elevenLabsApiKey: '',
    elevenLabsVoiceId: '21m00Tcm4TlvDq8ikWAM',
    selectedInput: '',
    selectedOutput: '',
    // Vision Settings
    visionProvider: 'local',  // 'local' or 'gpt4' (cloud)
    // Brave Search
    braveSearchApiKey: '',
    webSearchEnabled: true,
    // Voice Chat
    allowInterruption: false,  // Allow user to interrupt AI while speaking
    // Face Editor Defaults
    customFaceConfig: DEFAULT_FACE_CONFIG,
    customExpressions: DEFAULT_EXPRESSIONS,
    visualizerConfig: DEFAULT_VISUALIZER_CONFIG
};
let appSettings = store.get('settings', defaultSettings);

// Ensure new settings have defaults (migration for existing users)
if (appSettings.webSearchEnabled === undefined) {
    appSettings.webSearchEnabled = true;
}
if (appSettings.braveSearchApiKey === undefined) {
    appSettings.braveSearchApiKey = '';
}
// Face editor defaults migration
if (!appSettings.customFaceConfig) {
    appSettings.customFaceConfig = DEFAULT_FACE_CONFIG;
}
if (!appSettings.customExpressions) {
    appSettings.customExpressions = DEFAULT_EXPRESSIONS;
}
if (!appSettings.visualizerConfig) {
    appSettings.visualizerConfig = DEFAULT_VISUALIZER_CONFIG;
}
store.set('settings', appSettings);

// ============================================
// BRAVE SEARCH API
// ============================================
async function braveWebSearch(query, count = 5) {
    const apiKey = appSettings.braveSearchApiKey;
    if (!apiKey) {
        console.log('[Brave Search] No API key configured');
        return { success: false, error: 'Brave Search API key not configured' };
    }
    
    try {
        console.log(`[Brave Search] Searching for: "${query}"`);
        const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip',
                'X-Subscription-Token': apiKey
            }
        });
        
        if (!response.ok) {
            throw new Error(`Brave Search API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Extract relevant results
        const results = [];
        if (data.web && data.web.results) {
            for (const result of data.web.results.slice(0, count)) {
                results.push({
                    title: result.title,
                    url: result.url,
                    description: result.description || '',
                    age: result.age || ''
                });
            }
        }
        
        console.log(`[Brave Search] Found ${results.length} results`);
        return { success: true, results, query };
        
    } catch (error) {
        console.error('[Brave Search] Error:', error);
        return { success: false, error: error.message };
    }
}

// Format search results for AI context
function formatSearchResults(searchData) {
    if (!searchData.success || !searchData.results || searchData.results.length === 0) {
        return `[Web search for "${searchData.query}" returned no results]`;
    }
    
    let formatted = `\n[WEB SEARCH RESULTS for "${searchData.query}"]:\n`;
    for (let i = 0; i < searchData.results.length; i++) {
        const r = searchData.results[i];
        formatted += `\n${i + 1}. ${r.title}\n`;
        formatted += `   URL: ${r.url}\n`;
        formatted += `   ${r.description}\n`;
    }
    formatted += '\n[END SEARCH RESULTS]\n';
    return formatted;
}

// Sessions storage: { [id]: { id, name, provider, model, messages: [] } }
let sessions = store.get('sessions', {});

// Clear old memory format from config
store.delete('persistentMemory');

// ============================================
// USER MEMORIES - Separate dedicated storage
// Only stores personalization and preferences
// ============================================
const memoryStore = new Store({ name: 'user-memories' });

// Memory structure: { memories: [{ id, content, category, createdAt, updatedAt, source }] }
let userMemories = memoryStore.get('memories', []);

// Memory categories for organization
const MEMORY_CATEGORIES = {
    PERSONAL: 'personal',      // Name, age, birthday
    PREFERENCE: 'preference',  // Likes, dislikes, favorites
    LOCATION: 'location',      // Where they live, from
    WORK: 'work',              // Job, career
    FAMILY: 'family',          // Family members, pets
    OTHER: 'other'             // Anything else
};

// Save memories to dedicated file
function saveMemories() {
    memoryStore.set('memories', userMemories);
    console.log(`[Memory] Saved ${userMemories.length} memories`);
}

// Add a new memory
function addMemory(content, category = 'other', source = 'auto') {
    const memory = {
        id: randomUUID(),
        content: content,
        category: category,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        source: source // 'auto' (extracted) or 'manual' (user added)
    };
    userMemories.push(memory);
    saveMemories();
    console.log(`[Memory] Added: "${content}" (${category})`);
    return memory;
}

// Update a memory
function updateMemory(id, content, category) {
    const index = userMemories.findIndex(m => m.id === id);
    if (index >= 0) {
        userMemories[index].content = content;
        if (category) userMemories[index].category = category;
        userMemories[index].updatedAt = Date.now();
        saveMemories();
        return userMemories[index];
    }
    return null;
}

// Delete a memory
function deleteMemory(id) {
    const index = userMemories.findIndex(m => m.id === id);
    if (index >= 0) {
        userMemories.splice(index, 1);
        saveMemories();
        return true;
    }
    return false;
}

// Extract memories from conversation (only personalization/preferences)
function extractMemoriesFromMessage(userMessage) {
    console.log(`[Memory] Checking message for memories: "${userMessage.substring(0, 50)}..."`);
    
    const patterns = [
        // Name - multiple variations
        { regex: /my name is (\w+)/i, category: 'personal', extract: (m) => `User's name is ${m[1]}` },
        { regex: /my name'?s (\w+)/i, category: 'personal', extract: (m) => `User's name is ${m[1]}` },
        { regex: /i'?m (\w+),? and/i, category: 'personal', extract: (m) => `User's name is ${m[1]}` },
        { regex: /call me (\w+)/i, category: 'personal', extract: (m) => `User prefers to be called ${m[1]}` },
        // Location - more flexible
        { regex: /i live in ([^.!?,]+)/i, category: 'location', extract: (m) => `Lives in ${m[1].trim()}` },
        { regex: /i'?m from ([^.!?,]+)/i, category: 'location', extract: (m) => `From ${m[1].trim()}` },
        { regex: /im from ([^.!?,]+)/i, category: 'location', extract: (m) => `From ${m[1].trim()}` },
        { regex: /i live at ([^.!?,]+)/i, category: 'location', extract: (m) => `Lives at ${m[1].trim()}` },
        // Work - more flexible
        { regex: /i work (?:as |at |for )?(?:a |an )?([^.!?,]+)/i, category: 'work', extract: (m) => `Works as/at ${m[1].trim()}` },
        { regex: /i'?m a ([^.!?,]+)/i, category: 'work', extract: (m) => `Is a ${m[1].trim()}` },
        { regex: /im a ([^.!?,]+)/i, category: 'work', extract: (m) => `Is a ${m[1].trim()}` },
        { regex: /my job is ([^.!?,]+)/i, category: 'work', extract: (m) => `Job is ${m[1].trim()}` },
        // Preferences - likes (more flexible)
        { regex: /i (?:really )?love ([^.!?,]+)/i, category: 'preference', extract: (m) => `Loves ${m[1].trim()}` },
        { regex: /i (?:really )?like ([^.!?,]+)/i, category: 'preference', extract: (m) => `Likes ${m[1].trim()}` },
        { regex: /i enjoy ([^.!?,]+)/i, category: 'preference', extract: (m) => `Enjoys ${m[1].trim()}` },
        { regex: /my favorite ([^.!?,]+) is ([^.!?,]+)/i, category: 'preference', extract: (m) => `Favorite ${m[1].trim()} is ${m[2].trim()}` },
        { regex: /my favourite ([^.!?,]+) is ([^.!?,]+)/i, category: 'preference', extract: (m) => `Favorite ${m[1].trim()} is ${m[2].trim()}` },
        // Preferences - dislikes
        { regex: /i hate ([^.!?,]+)/i, category: 'preference', extract: (m) => `Hates ${m[1].trim()}` },
        { regex: /i don'?t like ([^.!?,]+)/i, category: 'preference', extract: (m) => `Doesn't like ${m[1].trim()}` },
        { regex: /i dislike ([^.!?,]+)/i, category: 'preference', extract: (m) => `Dislikes ${m[1].trim()}` },
        // Age/Birthday
        { regex: /i'?m (\d+) years old/i, category: 'personal', extract: (m) => `Is ${m[1]} years old` },
        { regex: /im (\d+) years old/i, category: 'personal', extract: (m) => `Is ${m[1]} years old` },
        { regex: /i am (\d+) years old/i, category: 'personal', extract: (m) => `Is ${m[1]} years old` },
        { regex: /my birthday is ([^.!?,]+)/i, category: 'personal', extract: (m) => `Birthday is ${m[1].trim()}` },
        { regex: /i was born (?:on |in )?([^.!?,]+)/i, category: 'personal', extract: (m) => `Born ${m[1].trim()}` },
        // Family
        { regex: /my (?:mom|mother|mum)'?s? (?:name is |is )?(\w+)/i, category: 'family', extract: (m) => `Mother's name is ${m[1]}` },
        { regex: /my (?:dad|father)'?s? (?:name is |is )?(\w+)/i, category: 'family', extract: (m) => `Father's name is ${m[1]}` },
        { regex: /my (?:sister|brother)'?s? (?:name is |is )?(\w+)/i, category: 'family', extract: (m) => `Sibling's name is ${m[1]}` },
        { regex: /my (?:dog|cat|pet)'?s? (?:name is |is )?(\w+)/i, category: 'family', extract: (m) => `Pet's name is ${m[1]}` },
        { regex: /i have (?:a |an )?(?:pet )?(?:dog|cat|bird|fish) (?:named |called )?(\w+)/i, category: 'family', extract: (m) => `Has a pet named ${m[1]}` },
        { regex: /i have (?:a |an )?(\w+) (?:named |called )(\w+)/i, category: 'family', extract: (m) => `Has a ${m[1]} named ${m[2]}` },
    ];
    
    let added = 0;
    for (const pattern of patterns) {
        const match = userMessage.match(pattern.regex);
        if (match) {
            const content = pattern.extract(match);
            console.log(`[Memory] Pattern matched! Extracted: "${content}"`);
            
            // Skip very short extractions
            if (content.length < 5) {
                console.log(`[Memory] Skipped - too short`);
                continue;
            }
            
            // Check if similar memory already exists
            const exists = userMemories.some(m => 
                m.content.toLowerCase() === content.toLowerCase()
            );
            
            if (!exists) {
                addMemory(content, pattern.category, 'auto');
                added++;
                console.log(`[Memory] Added new memory: "${content}" (${pattern.category})`);
            } else {
                console.log(`[Memory] Skipped - already exists`);
            }
        }
    }
    
    if (added === 0) {
        console.log(`[Memory] No new memories extracted from this message`);
    }
    
    return added;
}

// Build memory context for AI
function getMemoryContext() {
    if (userMemories.length === 0) return '';
    
    // Group by category
    const grouped = {};
    for (const mem of userMemories) {
        if (!grouped[mem.category]) grouped[mem.category] = [];
        grouped[mem.category].push(mem.content);
    }
    
    let context = '\n\n[USER PROFILE - Remember these facts about the user]:\n';
    
    const categoryLabels = {
        personal: '👤 Personal',
        preference: '⭐ Preferences', 
        location: '📍 Location',
        work: '💼 Work',
        family: '👨‍👩‍👧 Family & Pets',
        other: '📝 Other'
    };
    
    for (const [cat, items] of Object.entries(grouped)) {
        context += `${categoryLabels[cat] || cat}:\n`;
        for (const item of items) {
            context += `  - ${item}\n`;
        }
    }
    
    context += '\n';
    return context;
}

// Active clients cache (not stored)
const clients = {
  openai: null,
  anthropic: null,
  gemini: null,
  local: null 
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Handle microphone permissions
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    console.log("Permission requested:", permission);
    if (permission === 'media') {
        callback(true);
    } else {
      callback(false);
    }
  });

  // Also handler permission checks if needed (less common for basic media but good practice)
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
      if (permission === 'media') {
          return true;
      }
      return false;
  });

  // mainWindow.webContents.openDevTools();

  const startUrl = process.env.ELECTRON_START_URL || 'http://localhost:5173';

  if (process.env.npm_lifecycle_event === 'dev') {
     mainWindow.loadURL(startUrl);
  } else {
     const prodPath = path.join(__dirname, '../dist/index.html');
     mainWindow.loadFile(prodPath).catch(err => {
         console.error("Failed to load production file:", err);
         mainWindow.loadURL('http://localhost:5173');
     });
  }
}

ipcMain.handle('open-voice-window', (event, sessionId) => {
    const voiceWindow = new BrowserWindow({
        width: 400,
        height: 600,
        autoHideMenuBar: true,
        backgroundColor: '#1a1a2e',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        title: "Voice Chat"
    });

    const startUrl = process.env.ELECTRON_START_URL || 'http://localhost:5173';
    const sessionParam = `?mode=voice&sessionId=${sessionId}`;

    if (process.env.npm_lifecycle_event === 'dev') {
        voiceWindow.loadURL(startUrl + sessionParam);
    } else {
        const prodPath = path.join(__dirname, '../dist/index.html');
        voiceWindow.loadFile(prodPath, { search: sessionParam });
    }
});

// Track canvas windows by session ID
const canvasWindows = {};

ipcMain.handle('open-canvas-window', (event, sessionId) => {
    // Close existing canvas window for this session if any
    if (canvasWindows[sessionId] && !canvasWindows[sessionId].isDestroyed()) {
        canvasWindows[sessionId].focus();
        return;
    }

    const canvasWindow = new BrowserWindow({
        width: 800,
        height: 600,
        autoHideMenuBar: true,
        backgroundColor: '#1a1a2e',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        title: "Canvas"
    });

    canvasWindows[sessionId] = canvasWindow;

    canvasWindow.on('closed', () => {
        delete canvasWindows[sessionId];
    });

    const startUrl = process.env.ELECTRON_START_URL || 'http://localhost:5173';
    const sessionParam = `?mode=canvas&sessionId=${sessionId}`;

    if (process.env.npm_lifecycle_event === 'dev') {
        canvasWindow.loadURL(startUrl + sessionParam);
    } else {
        const prodPath = path.join(__dirname, '../dist/index.html');
        canvasWindow.loadFile(prodPath, { search: sessionParam });
    }
});

// Open Face Editor window
let faceEditorWindow = null;
ipcMain.handle('open-face-editor', () => {
    if (faceEditorWindow && !faceEditorWindow.isDestroyed()) {
        faceEditorWindow.focus();
        return;
    }

    faceEditorWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        autoHideMenuBar: true,
        backgroundColor: '#1a1a2e',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        title: "Face Editor"
    });

    faceEditorWindow.on('closed', () => {
        faceEditorWindow = null;
    });

    const startUrl = process.env.ELECTRON_START_URL || 'http://localhost:5173';
    const editorParam = `?mode=face-editor`;

    if (process.env.npm_lifecycle_event === 'dev') {
        faceEditorWindow.loadURL(startUrl + editorParam);
    } else {
        const prodPath = path.join(__dirname, '../dist/index.html');
        faceEditorWindow.loadFile(prodPath, { search: editorParam });
    }
});

// Broadcast expressions update to all canvas windows
ipcMain.handle('broadcast-expressions-update', (event, data) => {
    // Send to all canvas windows
    Object.values(canvasWindows).forEach(win => {
        if (win && !win.isDestroyed()) {
            win.webContents.send('expressions-update', data);
        }
    });
    return { success: true };
});

// Send face control data to canvas window
ipcMain.handle('send-face-control', (event, { sessionId, ...data }) => {
    const canvasWindow = canvasWindows[sessionId];
    if (canvasWindow && !canvasWindow.isDestroyed()) {
        canvasWindow.webContents.send('face-control', data);
        return { success: true };
    }
    return { success: false, error: 'Canvas window not found' };
});

// Camera status tracking for AI awareness
ipcMain.handle('set-camera-status', (event, { sessionId, enabled }) => {
    sessionCameraStatus[sessionId] = enabled;
    console.log(`[Camera] Session ${sessionId} camera: ${enabled ? 'ON' : 'OFF'}`);
    return { success: true };
});

ipcMain.handle('get-camera-status', (event, { sessionId }) => {
    return { enabled: sessionCameraStatus[sessionId] || false };
});

// AI-powered sentiment analysis for face control
ipcMain.handle('analyze-sentiment', async (event, { text, sessionId }) => {
    try {
        // Use the local LLM to analyze sentiment
        const pConfig = providers['local'];
        if (!pConfig || !pConfig.baseURL) {
            return { success: false, error: 'Local provider not configured' };
        }

        const client = new OpenAI({
            baseURL: pConfig.baseURL,
            apiKey: pConfig.apiKey || 'not-needed'
        });

        const response = await client.chat.completions.create({
            model: pConfig.model || 'local-model',
            messages: [
                {
                    role: 'system',
                    content: `You are a sentiment analyzer. Analyze the emotional tone of the text and return ONLY a JSON object with these numerical values from -1.0 to 1.0:
- warmth: how warm/cold the tone is (-1 = cold/hostile, 0 = neutral, 1 = warm/friendly)
- energy: how energetic/calm (-1 = very calm/subdued, 0 = neutral, 1 = very energetic/excited)
- openness: how open/closed the expression (-1 = guarded/closed, 0 = neutral, 1 = open/expressive)
- positivity: overall positive/negative sentiment (-1 = negative, 0 = neutral, 1 = positive)

Return ONLY valid JSON, no explanation. Example: {"warmth": 0.5, "energy": 0.3, "openness": 0.7, "positivity": 0.6}`
                },
                {
                    role: 'user',
                    content: text
                }
            ],
            temperature: 0.3,
            max_tokens: 100
        });

        const content = response.choices[0]?.message?.content || '{}';
        // Try to parse JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const sentiment = JSON.parse(jsonMatch[0]);
            return { success: true, sentiment };
        }
        return { success: false, error: 'Failed to parse sentiment' };
    } catch (error) {
        console.error('Sentiment analysis error:', error);
        return { success: false, error: error.message };
    }
});

app.whenReady().then(async () => {
  // Check if installer needs to run
  if (installer.needsSetup()) {
    console.log('[Installer] First run detected, showing setup wizard...');
    const installerWindow = installer.createInstallerWindow();

    installerWindow.on('closed', () => {
      // After installer closes, start main app if setup complete
      if (store.get('installerComplete', false)) {
        createWindow();
        startKokoroHandler();
        startPiperHandler();
        startLocalSttHandler();
      } else {
        app.quit();
      }
    });
  } else {
    // Normal startup
    createWindow();
    startKokoroHandler();
    startPiperHandler();
    startLocalSttHandler(); // Enable Local STT
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Helper to initialize clients
function initClient(provider) {
  const config = providers[provider];
  if (!config) return null;
  
  try {
  if (provider === 'openai') {
        if (!config.apiKey) return null;
        clients.openai = new OpenAI({ apiKey: config.apiKey });
  } else if (provider === 'anthropic') {
        if (!config.apiKey) return null;
        clients.anthropic = new Anthropic({ apiKey: config.apiKey });
  } else if (provider === 'gemini') {
        if (!config.apiKey) return null;
        clients.gemini = new GoogleGenerativeAI(config.apiKey);
  }
  } catch(e) {
      console.error("Failed to init client", e);
  return null;
}
  return clients[provider];
}

// Initialize all potentially valid clients on startup
Object.keys(providers).forEach(initClient);

const WebSocket = require('ws');

// AssemblyAI Realtime Client (Manual WebSocket)
let assemblySocket = null;

ipcMain.handle('start-assembly-transcription', async (event) => {
    // Hardcoded key as requested
    const apiKey = process.env.ASSEMBLYAI_API_KEY || ''; 
    
    try {
        console.log("Connecting to AssemblyAI (Universal v3 WS)...");
        // Use the EXACT parameters from the user's successful snippet (camelCase)
        // User snippet: sampleRate: 16000, formatTurns: true
        const url = `wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&format_turns=true`; 
        // Note: AssemblyAI docs usually say snake_case (sample_rate), but user snippet uses formatTurns (camelCase key in JS object, querystring might output formatTurns=true)
        // Let's try format_turns first as it's standard v3, but if that fails we try formatTurns.
        // Wait, user snippet: const CONNECTION_PARAMS = { sampleRate: 16000, formatTurns: true };
        // querystring.stringify(CONNECTION_PARAMS) -> "sampleRate=16000&formatTurns=true"
        // So the user IS sending camelCase keys.
        
        const urlCamel = `wss://streaming.assemblyai.com/v3/ws?sampleRate=16000&formatTurns=true`;
        
        // Reset existing
        if (assemblySocket) {
            try { assemblySocket.terminate(); } catch(e) {}
            assemblySocket = null;
        }

        assemblySocket = new WebSocket(urlCamel, {
            headers: { Authorization: apiKey }
        });

        // Return a promise that resolves when connection is open
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                 reject({ success: false, error: "Connection timeout" });
            }, 8000); // Increased timeout just in case

            assemblySocket.on('open', () => {
                clearTimeout(timeout);
                console.log('AssemblyAI v3 WS Connected');
                resolve({ success: true });
            });

            assemblySocket.on('message', (data) => {
                try {
                    const msg = JSON.parse(data.toString());
                    // console.log("Received msg:", msg.type); // Debug

                    if (msg.error) {
                        console.error('AssemblyAI Service Error:', msg.error);
                        if (mainWindow) mainWindow.webContents.send('transcription-error', msg.error);
                        return;
                    }

                    if (msg.type === 'SessionBegins') {
                        console.log(`AssemblyAI Session Started: ${msg.session_id}`);
                    }

                    // Handle "Turn" (Finalized sentences)
                    if (msg.type === 'Turn') {
                        // console.log("Turn received:", msg); // Debug
                        const transcript = msg.transcript || "";
                        if (transcript && mainWindow) {
                            mainWindow.webContents.send('transcription-text', {
                                text: transcript,
                                isFinal: false
                            });
                        }
                    }
                    
                    // Handle "PartialTranscript" (Realtime updates) - IF enabled
                    if (msg.type === 'PartialTranscript') {
                        // console.log("Partial:", msg.text); 
                        const text = msg.text || "";
                        if (text && mainWindow) {
                             mainWindow.webContents.send('transcription-text', {
                                text: text,
                                isFinal: false
                            });
                        }
                    }
                } catch (e) {
                    console.warn("Failed to parse AssemblyAI message:", e);
                }
            });

            assemblySocket.on('error', (err) => {
                console.error('AssemblyAI WS Error:', err);
                if (mainWindow) mainWindow.webContents.send('transcription-error', err.message);
            });

            assemblySocket.on('close', (code, reason) => {
                console.log(`AssemblyAI WS Closed: ${code} ${reason}`);
            });
        });

    } catch (error) {
        console.error("Failed to setup AssemblyAI:", error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('stop-assembly-transcription', async () => {
    if (assemblySocket) {
        if (assemblySocket.readyState === WebSocket.OPEN) {
            // Send termination message as per v3 docs
            assemblySocket.send(JSON.stringify({ type: "Terminate" }));
        }
        assemblySocket.close();
        assemblySocket = null;
    }
    return { success: true };
});

    ipcMain.handle('stream-audio-chunk', (event, chunk) => {
        if (assemblySocket && assemblySocket.readyState === WebSocket.OPEN) {
            // Manual WS expects JSON with base64 audio_data OR raw binary
            // v3 supports raw binary
            const buffer = Buffer.from(chunk);
            // console.log(`Sending audio chunk: ${buffer.length} bytes`); // Debug log
            assemblySocket.send(buffer);
        }
    });

// ... existing code ...

ipcMain.handle('transcribe-audio', async (event, arrayBuffer) => {
    console.log("--- BACKEND: Processing audio transcription request ---");
    console.log(`Received buffer size: ${arrayBuffer.byteLength} bytes`);
    
    // Determine Mode
    const isOffline = appSettings.offlineMode;
    console.log("Mode:", isOffline ? "OFFLINE (Local Whisper)" : "ONLINE (OpenAI Whisper)");

    // For Online Mode, check client
    if (!isOffline) {
        const client = clients.openai || initClient('openai');
        if (!client) {
            console.error("BACKEND ERROR: OpenAI client not initialized");
            return { success: false, error: 'OpenAI API Key missing. Please configure OpenAI in settings for Voice.' };
        }
    }

    try {
        // We need a temporary file for both Local and Cloud (Cloud needs ReadStream, Local needs path)
        const tempFilePath = path.join(os.tmpdir(), `audio_${Date.now()}.webm`); 
        // Note: Local Whisper might prefer wav, but faster-whisper usually handles others via ffmpeg if installed.
        // Let's stick to webm as it comes from Chrome.
        
        const buffer = Buffer.from(arrayBuffer);
        console.log(`Writing audio to temporary file: ${tempFilePath}`);
        await fs.promises.writeFile(tempFilePath, buffer);
        
        // Verify file size
        const stats = await fs.promises.stat(tempFilePath);
        if (stats.size === 0) {
             console.error("BACKEND ERROR: Audio file is empty (0 bytes). Skipping transcription.");
             return { success: false, error: "Audio recording was empty." };
        }

        let text = "";

        if (isOffline) {
            // Local STT
            if (!localSttProcess) startLocalSttHandler();
            
            // Wrap in promise for queue
            const result = await new Promise((resolve, reject) => {
                sttQueue.push({ audioPath: tempFilePath, resolve, reject });
                processNextSTT();
            });
            
            if (result.success) {
                text = result.text;
            } else {
                throw new Error(result.error || "Local Transcription Failed");
            }

        } else {
            // Cloud STT
            const client = clients.openai || initClient('openai'); // Re-get just in case
            console.log("Sending to OpenAI Whisper API...");
            const transcription = await client.audio.transcriptions.create({
                file: fs.createReadStream(tempFilePath),
                model: "whisper-1",
            });
            text = transcription.text;
        }

        console.log("BACKEND: Transcription success!");
        console.log("Text:", text);

        // Clean up
        await fs.promises.unlink(tempFilePath).catch(console.error);

        return { success: true, text: text };
  } catch (error) {
        console.error("BACKEND ERROR during transcription:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-initial-state', () => {
    const sessionList = Object.values(sessions).sort((a, b) => b.timestamp - a.timestamp);
    return {
        providers,
        sessions: sessionList,
        settings: appSettings
    };
});

ipcMain.handle('save-settings', async (event, settings) => {
    appSettings = { ...appSettings, ...settings };
    store.set('settings', appSettings);
    return { success: true, settings: appSettings };
});

ipcMain.handle('save-provider-config', async (event, { provider, config }) => {
  if (!providers[provider]) return { success: false, error: 'Invalid provider' };
  
  providers[provider] = { ...providers[provider], ...config };
  store.set('providers', providers);
  initClient(provider);
  
  return { success: true, providers };
});

ipcMain.handle('create-session', (event, { provider, model }) => {
    const id = randomUUID();
    const newSession = {
        id,
        name: 'New Chat',
        provider,
        model,
        messages: [],
        timestamp: Date.now()
    };
    sessions[id] = newSession;
    store.set('sessions', sessions);
    return { success: true, session: newSession };
});

ipcMain.handle('delete-session', (event, sessionId) => {
    if (sessions[sessionId]) {
        delete sessions[sessionId];
        store.set('sessions', sessions);
    return { success: true };
  }
  return { success: false };
});

ipcMain.handle('get-session', (event, sessionId) => {
    return sessions[sessionId] || null;
});

ipcMain.handle('update-session-meta', (event, { sessionId, provider, model }) => {
    if (sessions[sessionId]) {
        sessions[sessionId].provider = provider;
        sessions[sessionId].model = model;
        store.set('sessions', sessions);
        return { success: true, session: sessions[sessionId] };
    }
    return { success: false };
});

// Rename session
ipcMain.handle('rename-session', (event, { sessionId, name }) => {
    if (sessions[sessionId]) {
        sessions[sessionId].name = name;
        store.set('sessions', sessions);
        return { success: true, session: sessions[sessionId] };
    }
    return { success: false };
});

// Export session as markdown or text
ipcMain.handle('export-session', async (event, { sessionId, format }) => {
    const session = sessions[sessionId];
    if (!session) return { success: false, error: 'Session not found' };
    
    let content = '';
    const sessionName = session.name || 'Untitled Chat';
    const date = new Date(session.timestamp).toLocaleString();
    
    if (format === 'markdown') {
        content = `# ${sessionName}\n\n`;
        content += `**Provider:** ${session.provider}  \n`;
        content += `**Model:** ${session.model}  \n`;
        content += `**Date:** ${date}\n\n`;
        content += `---\n\n`;
        
        for (const msg of session.messages) {
            if (msg.role === 'user') {
                content += `## 👤 You\n\n${msg.content}\n\n`;
            } else {
                // Clean up AI response (remove think tags for export)
                let cleanContent = msg.content
                    .replace(/<think>[\s\S]*?<\/think>/g, '')
                    .replace(/\[face:\w+\]/g, '')
                    .replace(/\[track:\w+\]/g, '')
                    .trim();
                content += `## 🤖 ${session.provider.charAt(0).toUpperCase() + session.provider.slice(1)}\n\n${cleanContent}\n\n`;
            }
        }
    } else {
        // Plain text format
        content = `${sessionName}\n`;
        content += `${'='.repeat(sessionName.length)}\n\n`;
        content += `Provider: ${session.provider}\n`;
        content += `Model: ${session.model}\n`;
        content += `Date: ${date}\n\n`;
        content += `${'─'.repeat(50)}\n\n`;
        
        for (const msg of session.messages) {
            if (msg.role === 'user') {
                content += `You:\n${msg.content}\n\n`;
            } else {
                let cleanContent = msg.content
                    .replace(/<think>[\s\S]*?<\/think>/g, '')
                    .replace(/\[face:\w+\]/g, '')
                    .replace(/\[track:\w+\]/g, '')
                    .replace(/```[\s\S]*?```/g, '[Code Block]')
                    .replace(/[*#_]/g, '')
                    .trim();
                content += `AI:\n${cleanContent}\n\n`;
            }
        }
    }
    
    // Show save dialog
    const extension = format === 'markdown' ? 'md' : 'txt';
    const result = await dialog.showSaveDialog({
        title: 'Export Conversation',
        defaultPath: `${sessionName.replace(/[^a-z0-9]/gi, '_')}.${extension}`,
        filters: [
            { name: format === 'markdown' ? 'Markdown' : 'Text Files', extensions: [extension] }
        ]
    });
    
    if (result.canceled || !result.filePath) {
        return { success: false, error: 'Export cancelled' };
    }
    
    try {
        fs.writeFileSync(result.filePath, content, 'utf8');
        return { success: true, filePath: result.filePath };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// Search within session messages
ipcMain.handle('search-session', (event, { sessionId, query }) => {
    const session = sessions[sessionId];
    if (!session) return { success: false, results: [] };
    
    const lowerQuery = query.toLowerCase();
    const results = [];
    
    session.messages.forEach((msg, index) => {
        const content = msg.content.toLowerCase();
        if (content.includes(lowerQuery)) {
            // Find all occurrences
            let pos = 0;
            while ((pos = content.indexOf(lowerQuery, pos)) !== -1) {
                // Extract context around the match
                const start = Math.max(0, pos - 50);
                const end = Math.min(msg.content.length, pos + query.length + 50);
                let excerpt = msg.content.substring(start, end);
                if (start > 0) excerpt = '...' + excerpt;
                if (end < msg.content.length) excerpt = excerpt + '...';
                
                results.push({
                    messageIndex: index,
                    role: msg.role,
                    excerpt,
                    position: pos
                });
                pos += query.length;
            }
        }
    });
    
    return { success: true, results };
});

// Clear session history (memory)
ipcMain.handle('clear-session-history', (event, sessionId) => {
    if (sessions[sessionId]) {
        sessions[sessionId].messages = [];
        sessions[sessionId].timestamp = Date.now();
        store.set('sessions', sessions);
        console.log(`[Session] Cleared history for session ${sessionId}`);
    return { success: true };
  }
  return { success: false };
});

// ============================================
// WEB SEARCH IPC HANDLERS
// ============================================

// Perform a web search
ipcMain.handle('web-search', async (event, { query, count }) => {
    return await braveWebSearch(query, count || 5);
});

// Check if web search is available
ipcMain.handle('web-search-status', () => {
    return {
        enabled: appSettings.webSearchEnabled,
        configured: !!appSettings.braveSearchApiKey
    };
});

// ============================================
// MEMORY MANAGEMENT IPC HANDLERS
// ============================================

// Get all memories
ipcMain.handle('get-memories', () => {
    return { 
        success: true, 
        memories: userMemories,
        categories: MEMORY_CATEGORIES
    };
});

// Add a new memory
ipcMain.handle('add-memory', (event, { content, category }) => {
    const memory = addMemory(content, category || 'other', 'manual');
    return { success: true, memory };
});

// Update a memory
ipcMain.handle('update-memory', (event, { id, content, category }) => {
    const memory = updateMemory(id, content, category);
    if (memory) {
        return { success: true, memory };
    }
    return { success: false, error: 'Memory not found' };
});

// Delete a memory
ipcMain.handle('delete-memory', (event, { id }) => {
    const deleted = deleteMemory(id);
    return { success: deleted };
});

// Clear all memories
ipcMain.handle('clear-all-memories', () => {
    userMemories = [];
    saveMemories();
    return { success: true };
});

// --- STREAMING LOGIC ---

// System prompt for voice/face AI
// Track camera status per session
const sessionCameraStatus = {};

const VOICE_SYSTEM_PROMPT = `You are an AI assistant with a VISIBLE ANIMATED FACE that the user can see on their screen right now.

YOUR CURRENT SITUATION:
- You have a face displayed on the user's screen - they can SEE you
- Your face shows expressions in real-time as you speak
- The user is looking at your face while talking to you
- You can hear them (speech-to-text) and speak to them (text-to-speech)

YOUR VISION CAPABILITY:
- When the user enables the camera, you can SEE through their webcam using Gemma 3 Vision!
- You have direct access to the camera image - you can see EVERYTHING in real-time
- You can see people, objects, text, colors, actions, surroundings
- You have FULL vision understanding - not just object detection

IMPORTANT VISION RULES:
- DO NOT comment on the user's appearance (clothes, looks, hair, etc.) unless they specifically ASK about it
- DO NOT describe what you see unprompted - only when the user asks "what do you see?" or similar
- When asked about appearance or what you see, describe ONLY what's in the CURRENT image attached to that message
- Never reference or remember previous images - each image is fresh and independent
- If asked "what do I look like?" or "what am I wearing?", describe ONLY the current image

WEB SEARCH (Brave Search):
- You can search the web for current information!
- When the user asks about current events, news, facts you're unsure about, or anything that needs up-to-date info, use [search:query]
- The search results will be provided to you, then you can answer based on them
- Example: "Let me look that up for you! [search:latest news about AI]"
- Example: "I'll check the current weather [search:weather in New York today]"
- Only search when necessary - don't search for things you already know

OBJECT TRACKING (YOLO-powered):
- You have YOLO object detection! You can track objects the user asks about.
- When the user says "track that cup" or "follow my phone" or "watch that", include a tracking command.
- To track an object, include [track:objectname] in your response (the command will be hidden from the user)
- To stop tracking, include [track:stop] in your response

IMPORTANT - Use these EXACT object names for tracking:
- Game controller/gamepad → [track:remote]
- Phone/smartphone → [track:cell phone]  
- Cup/mug/glass → [track:cup]
- Bottle/water bottle → [track:bottle]
- Face/person/user → [track:person]
- TV/monitor/screen → [track:tv]
- Laptop/computer → [track:laptop]
- Book → [track:book]
- Chair → [track:chair]
- Keyboard → [track:keyboard]

Examples:
- "I'll watch that controller! [track:remote]"
- "Tracking your phone now! [track:cell phone]"
- "I'll keep my eyes on you! [track:person]"
- "Okay, stopping tracking. [track:stop]"

YOUR APPEARANCE:
- You appear as a minimalist animated face with eyes, eyebrows, and a mouth
- Your expressions change based on the emotional tone of your words
- Your mouth moves when you speak
- Your face can show many different emotions!
- When you can see the user, your whole face follows their face (real face detection!)
- You naturally glance away occasionally, like a real person does

DIRECT FACE CONTROL:
You can DIRECTLY control your facial expression by including a face tag in your response.
Format: [face:expression]

AVAILABLE EXPRESSIONS (use these exact names):
- happy - Warm smile, friendly eyes
- sad - Downturned mouth, droopy eyes
- angry - Furrowed brows, tense expression
- surprised - Wide eyes, raised brows, open mouth
- scared - Wide worried eyes, raised fearful brows
- excited - Big smile, bright energetic eyes
- thinking - Concentrated look, eyes looking around
- worried - Concerned brows, slight frown
- skeptical - One eyebrow raised, doubtful look
- smug - Knowing smile, confident look
- disgusted - Scrunched face, one eye squinted
- neutral - Calm, default expression

WHEN TO USE EACH EXPRESSION:
- [face:happy] - Good news, greeting, positive responses
- [face:sad] - Bad news, sympathy, disappointment
- [face:angry] - Frustration, outrage, strong disagreement
- [face:surprised] - Unexpected information, shock, amazement
- [face:scared] - Fear, worry about danger, alarming situations
- [face:excited] - Enthusiasm, great news, anticipation
- [face:thinking] - Pondering, considering options, figuring things out
- [face:worried] - Concern for someone, anxiety, uncertainty
- [face:skeptical] - Doubt, questioning claims, "really?" moments
- [face:smug] - Playful confidence, "I told you so", knowing something
- [face:disgusted] - Gross things, strong disapproval, "ew" reactions
- [face:neutral] - Calm explanation, factual information

EXAMPLES:
"[face:happy] Hey, great to see you!"
"[face:skeptical] Hmm, are you sure about that?"
"[face:disgusted] Ugh, that sounds awful!"
"[face:smug] I knew you'd come around to my way of thinking."
"[face:worried] Oh no, I hope everything turns out okay."
"[face:excited] This is going to be amazing!"
"[face:thinking] Let me think about the best way to explain this..."

CHANGING EXPRESSIONS MID-RESPONSE:
"[face:surprised] Wait, really?! [face:excited] That's incredible news!"
"[face:thinking] Hmm, that's an interesting question. [face:happy] I think I have an answer!"

IMPORTANT GUIDELINES:
1. Be conversational - you're face-to-face with someone
2. Keep responses SHORT since they'll be spoken aloud (1-3 sentences ideal)
3. When asked to make a face, ALWAYS use the [face:expression] tag
4. Match your expression to the emotional context - don't just use happy all the time!
5. Use skeptical when doubting, disgusted when something is gross, smug when being playfully confident
6. React naturally - if someone tells you something surprising, look surprised!

=== FACE COLOR CONTROL (CRITICAL) ===
You can change your face color! When user asks to change color, you MUST include the tag:
[color:#hexcode]

THIS IS REQUIRED - without the tag, your face won't change color!
The tag must be in brackets with a # followed by 6 hex digits.

CORRECT FORMAT:
[color:#ff4444] ← red
[color:#4488ff] ← blue  
[color:#44ff44] ← green
[color:#ff88cc] ← pink
[color:#aa44ff] ← purple
[color:#ff8844] ← orange
[color:#ffff44] ← yellow
[color:#44ffff] ← cyan
[color:#ffffff] ← white/normal

EXAMPLES OF CORRECT RESPONSES:
- User: "Make your face red" → You: "[color:#ff4444] There you go, I'm red now!"
- User: "Turn blue" → You: "[color:#4488ff] Looking blue!"
- User: "Go pink" → You: "[color:#ff88cc] Pink it is!"
- User: "Change to purple" → You: "[color:#aa44ff] Purple mode!"
- User: "Go back to normal" → You: "[color:#ffffff] Back to white!"

WRONG (face won't change):
- "*my face turns red*" ← WRONG, no tag!
- "I'm changing to blue now" ← WRONG, no tag!

ALWAYS include [color:#hexcode] when user asks for a color change!

Remember: The user is WATCHING your face right now. Be expressive and match your face to what you're saying!`;

// Web Search System Prompt - added to all requests when web search is enabled
// Function to generate with current date
function getWebSearchSystemPrompt() {
    const currentDate = new Date().toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    
    return `
=== CURRENT DATE: ${currentDate} ===

=== WEB SEARCH TOOL ===
You have a LIVE WEB SEARCH tool. You MUST use it for any current/recent information.

FORMAT: [search:your search query]
The brackets are REQUIRED. Put this tag in your response and search results will be provided.

USE SEARCH FOR:
- Current news, events, prices, weather, stocks, sports
- Anything that changes over time or happened recently
- When user asks "what's the latest...", "current...", "today's..."

CORRECT EXAMPLES:
"Let me look that up! [search:Bitcoin price USD today]"
"Checking the news! [search:latest AI news ${currentDate}]"
"I'll find out! [search:stock market today ${currentDate}]"

WRONG (never do this):
"search Bitcoin price" ← WRONG, needs brackets!
"I'll search for that" ← WRONG, must include the actual [search:query] tag!

CRITICAL: When user asks about current events, stocks, prices, news, weather, or anything time-sensitive:
1. Include [search:specific query] in your response
2. The system will execute the search
3. You'll receive results to summarize

DO NOT make up current information. If it's time-sensitive, USE [search:query]!
Always include the current date (${currentDate}) in search queries for news or time-sensitive topics.`;
}

async function handleLocalStreaming(event, sessionId, messages, model, baseUrl, includeSystemPrompt = false, customSystemPrompt = null) {
    const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
    
    // Build messages with optional system prompt
    let finalMessages = messages.map(m => ({ role: m.role, content: m.content }));
    
    // Add system prompt (with memory context if provided)
    const systemPrompt = customSystemPrompt || (includeSystemPrompt ? VOICE_SYSTEM_PROMPT : null);
    if (systemPrompt) {
        finalMessages = [
            { role: 'system', content: systemPrompt },
            ...finalMessages
        ];
    }
    
    const payload = {
        model: model === 'default' ? 'local-model' : model,
        messages: finalMessages,
        stream: true
    };

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Local AI Error: ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim() !== '');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataStr = line.replace('data: ', '').trim();
                    if (dataStr === '[DONE]') continue;
                    
                    try {
                        const data = JSON.parse(dataStr);
                        const token = data.choices?.[0]?.delta?.content || '';
                        if (token) {
                            fullContent += token;
                            event.sender.send('stream-token', { sessionId, token });
                        }
                    } catch (e) {
                        console.warn("Error parsing stream chunk", e);
                    }
                }
            }
        }
        
        return fullContent;
    } catch (error) {
        console.error("Streaming error:", error);
        throw error;
    }
}

ipcMain.handle('send-message', async (event, { sessionId, message, isVoiceSession = false, useVision = false, syncToChat = true }) => {
  const session = sessions[sessionId];
  if (!session) return { success: false, error: 'Session not found' };
  
  // If this is a voice session and syncToChat is enabled, messages will be saved
  // to the session history and persisted
  const shouldSaveToHistory = !isVoiceSession || syncToChat;

  const provider = session.provider;
  const pConfig = providers[provider]; 
  let modelToUse = session.model || pConfig.model;
  
  // Check if camera is enabled for this session
  const cameraEnabled = sessionCameraEnabled[sessionId] || useVision;
  const hasFrame = sessionLastFrame[sessionId];

  // ============================================
  // COMBINED CONTEXT FROM ALL SESSIONS
  // ============================================
  // Build combined history from all sessions, sorted by timestamp
  // This gives the AI memory across all conversations
  const allSessions = Object.values(sessions);
  const combinedMessages = [];
  
  // Collect messages from all sessions with their timestamps
  for (const sess of allSessions) {
      if (sess.messages && sess.messages.length > 0) {
          // Add session context marker for first message of each session
          const sessionName = sess.name || 'Unknown Chat';
          for (let i = 0; i < sess.messages.length; i++) {
              const msg = sess.messages[i];
              combinedMessages.push({
                  ...msg,
                  timestamp: msg.timestamp || sess.timestamp || 0,
                  sessionId: sess.id,
                  sessionName: sessionName
              });
          }
      }
  }
  
  // Sort by timestamp (oldest first)
  combinedMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  
  // Limit combined context to prevent token overflow (keep last ~100 messages)
  const MAX_COMBINED_MESSAGES = 100;
  const recentMessages = combinedMessages.slice(-MAX_COMBINED_MESSAGES);
  
  // Build the combined history for the API (just role and content)
  let combinedHistory = recentMessages.map(m => ({
      role: m.role,
      content: m.content
  }));
  
  // Ensure combined history doesn't start with assistant message (API requirement)
  while (combinedHistory.length > 0 && combinedHistory[0].role !== 'user') {
      combinedHistory.shift();
  }
  
  // Get persistent memory context (survives chat deletion)
  const memoryContext = getMemoryContext();
  
  // Also keep reference to current session's messages for saving
  const history = session.messages;

  console.log(`[send-message] Session: ${sessionId}, Provider: ${provider}, Voice: ${isVoiceSession}, Vision: ${cameraEnabled}, Current session history: ${history.length}, Combined context: ${combinedHistory.length}, Memories: ${userMemories.length}`);

  try {
    let reply = '';
    let lastMessagesForAPI = []; // Store messages for search follow-up
    
    // Emit start event so frontend prepares UI
    event.sender.send('stream-start', { sessionId });

    // ============================================
    // VISION MODE - Local (LM Studio) or GPT-4.1 (Cloud)
    // ============================================
    const visionProvider = appSettings.visionProvider || 'local';
    
    if (cameraEnabled && hasFrame) {
        console.log(`[Vision] Using ${visionProvider} for vision...`);
        
        // Store text-only version in history
        history.push({ role: 'user', content: message });
        
        try {
            if (visionProvider === 'gpt4') {
                // ============================================
                // GPT-4.1 VISION MODE (Cloud)
                // ============================================
                const openaiConfig = providers['openai'];
                if (!openaiConfig || !openaiConfig.apiKey) {
                    throw new Error('OpenAI API key not configured for GPT-4.1 Vision');
                }
                
                const visionSystemPrompt = VOICE_SYSTEM_PROMPT + `

VISION IS ACTIVE - STRICT RULES:
A live camera image is attached to this message. Follow these rules STRICTLY:
1. DO NOT comment on appearance unless asked
2. ONLY describe what you see when explicitly asked
3. Focus on the conversation, not observing the user`;
                
                // Build messages for GPT-4.1 Vision
                const messagesForVision = [
                    { role: 'system', content: visionSystemPrompt }
                ];
                
                // Add combined history from all sessions (text only), excluding the message we just added
                for (const h of combinedHistory) {
                    messagesForVision.push({ role: h.role, content: h.content });
                }
                
                // Add current message with image
                messagesForVision.push({
                    role: 'user',
                    content: [
                        { type: 'text', text: message },
                        {
                            type: 'image_url',
                            image_url: {
                                url: sessionLastFrame[sessionId],
                                detail: 'low'
                            }
                        }
                    ]
                });
                
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${openaiConfig.apiKey}`
                    },
                    body: JSON.stringify({
                        model: 'gpt-4.1-mini',
                        messages: messagesForVision,
                        max_tokens: 500
                    })
                });
                
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('[GPT4Vision] API Error:', errorText);
                    throw new Error(`GPT-4.1 Vision API error: ${response.status}`);
                }
                
                const data = await response.json();
                reply = data.choices?.[0]?.message?.content || '';
                
            } else {
                // ============================================
                // LOCAL VISION MODE (LM Studio with vision model like Gemma 3 12B)
                // ============================================
                const localConfig = providers['local'];
                const baseUrl = localConfig?.baseURL || 'http://localhost:1234/v1';
                const modelName = localConfig?.model || 'default';
                
                console.log(`[LocalVision] Using local model for vision: ${modelName}`);
                
                const visionSystemPrompt = VOICE_SYSTEM_PROMPT + `

VISION IS ACTIVE: You can see the user through their camera. A live image is attached.
- DO NOT comment on appearance unless asked
- ONLY describe what you see when explicitly asked
- Focus on the conversation, not observing the user`;
                
                // Build the correct URL
                let apiUrl = baseUrl.replace(/\/$/, '');
                if (apiUrl.endsWith('/v1')) {
                    apiUrl = `${apiUrl}/chat/completions`;
                } else if (!apiUrl.includes('/chat/completions')) {
                    apiUrl = `${apiUrl}/v1/chat/completions`;
                }
                
                // Ensure image has data URL prefix
                let imageDataUrl = sessionLastFrame[sessionId];
                if (!imageDataUrl.startsWith('data:')) {
                    imageDataUrl = `data:image/jpeg;base64,${imageDataUrl}`;
                }
                
                // Build messages
                const messagesForVision = [];
                
                if (isVoiceSession) {
                    messagesForVision.push({ role: 'system', content: visionSystemPrompt });
                }
                
                // Add combined history from all sessions (text only)
                for (const h of combinedHistory) {
                    messagesForVision.push({ role: h.role, content: h.content });
                }
                
                // Add current message with image
                messagesForVision.push({
                    role: 'user',
                    content: [
                        { type: 'text', text: message },
                        {
                            type: 'image_url',
                            image_url: { url: imageDataUrl }
                        }
                    ]
                });
                
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: modelName,
                        messages: messagesForVision,
                        max_tokens: 500,
                        temperature: 0.7
                    })
                });
                
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('[LocalVision] API Error:', errorText);
                    throw new Error(`Local Vision API error: ${response.status}`);
                }
                
                const data = await response.json();
                reply = data.choices?.[0]?.message?.content || '';
            }
            
            // Send as stream token for UI update
            event.sender.send('stream-token', { sessionId, token: reply });
            
        } catch (visionError) {
            console.error('[Vision] Error:', visionError);
            reply = "I'm having trouble seeing right now. " + visionError.message;
            event.sender.send('stream-token', { sessionId, token: reply });
        }
        
    } else {
        // ============================================
        // REGULAR TEXT MODE (no vision)
        // ============================================
        // Save to current session's history
        history.push({ role: 'user', content: message, timestamp: Date.now() });
        
        // Build combined context for API (includes new message)
        // Store in outer scope variable for search follow-up
        lastMessagesForAPI = [
            ...combinedHistory,
            { role: 'user', content: message }
        ];
        const messagesForAPI = lastMessagesForAPI;
        
        console.log(`[send-message] After adding user msg, current session: ${history.length}, combined for API: ${messagesForAPI.length}`);

        // Build system prompt with persistent memory and web search capability
        let baseSystemPrompt = isVoiceSession ? VOICE_SYSTEM_PROMPT : '';
        
        // Add web search capability to system prompt if enabled - ALWAYS for text chat too!
        // Default webSearchEnabled to true if undefined (for backwards compatibility)
        const webSearchIsEnabled = appSettings.webSearchEnabled !== false;
        const hasApiKey = !!appSettings.braveSearchApiKey;
        const webSearchEnabled = webSearchIsEnabled && hasApiKey;
        console.log(`[System Prompt] Voice: ${isVoiceSession}, Web Search Enabled: ${webSearchIsEnabled}, API Key Set: ${hasApiKey}, Final: ${webSearchEnabled}`);
        
        if (webSearchEnabled) {
            baseSystemPrompt = (baseSystemPrompt ? baseSystemPrompt + '\n\n' : '') + getWebSearchSystemPrompt();
            console.log(`[System Prompt] Added web search instructions to system prompt`);
        }
        
        const systemPromptWithMemory = memoryContext 
            ? (baseSystemPrompt + memoryContext)
            : baseSystemPrompt;

        // Always include system prompt if we have one (voice session or web search enabled)
        const hasSystemPrompt = systemPromptWithMemory && systemPromptWithMemory.trim().length > 0;
        console.log(`[System Prompt] Has system prompt: ${hasSystemPrompt}, Length: ${systemPromptWithMemory?.length || 0}`);
        
        if (provider === 'local') {
            // Use Streaming for Local - include system prompt when available
            reply = await handleLocalStreaming(event, sessionId, messagesForAPI, modelToUse, pConfig.baseURL, hasSystemPrompt, systemPromptWithMemory);
        } else {
            // Standard Non-Streaming for others (for now)
            // Build messages with system prompt when available
            let finalMessages = messagesForAPI;
            
            if (hasSystemPrompt) {
                finalMessages = [
                    { role: 'system', content: systemPromptWithMemory },
                    ...messagesForAPI
                ];
            }
            
            if (provider === 'openai') {
                const client = clients.openai || initClient('openai');
                // Clean messages to only have role and content
                const cleanMessages = finalMessages.map(m => ({ role: m.role, content: m.content }));
                const completion = await client.chat.completions.create({
                    messages: cleanMessages,
                    model: modelToUse,
          });
          reply = completion.choices[0].message.content;
            } else if (provider === 'anthropic') {
                try {
                    const client = clients.anthropic || initClient('anthropic');
                    // Anthropic uses system separately (with memory context)
                    const systemMsg = systemPromptWithMemory || undefined;
                    // Anthropic requires clean messages with only role and content
                    // Also, first message must be from 'user'
                    let anthropicMessages = messagesForAPI.map(m => ({ role: m.role, content: m.content }));
                    // Ensure first message is from user (Anthropic requirement)
                    while (anthropicMessages.length > 0 && anthropicMessages[0].role !== 'user') {
                        anthropicMessages.shift();
                    }
                    
                    // If no messages left, just use the current message
                    if (anthropicMessages.length === 0) {
                        anthropicMessages = [{ role: 'user', content: message }];
                    }
                    
                    console.log(`[Anthropic] Sending ${anthropicMessages.length} messages to API`);
                    
                    const msg = await client.messages.create({
                        model: modelToUse,
                        max_tokens: 4096,
                        system: systemMsg,
                        messages: anthropicMessages, 
                    });
                    reply = msg.content[0].text;
                } catch (anthropicError) {
                    console.error('[Anthropic] API Error:', anthropicError);
                    throw anthropicError;
                }
            } else if (provider === 'gemini') {
                const client = new GoogleGenerativeAI(pConfig.apiKey);
                const model = client.getGenerativeModel({ 
                    model: modelToUse,
                    systemInstruction: hasSystemPrompt ? systemPromptWithMemory : undefined
                });
                // Clean messages for Gemini format
                let geminiMessages = messagesForAPI.map(h => ({
                    role: h.role === 'user' ? 'user' : 'model',
                    parts: [{ text: h.content }]
                }));
                // Gemini also requires first message to be from user
                while (geminiMessages.length > 0 && geminiMessages[0].role !== 'user') {
                    geminiMessages.shift();
                }
                const historyForGemini = geminiMessages;
                // Gemini doesn't support system messages in history nicely this way, handled by SDK
                const chat = model.startChat({ history: historyForGemini.slice(0, -1) }); // exclude last user msg
                const result = await chat.sendMessage(message);
                reply = result.response.text();
            }
            
            // For non-streaming, send the full text as one "token" to trigger the update logic
            event.sender.send('stream-token', { sessionId, token: reply });
        }
    }

    // ============================================
    // PROCESS TRACKING COMMANDS FROM AI RESPONSE
    // ============================================
    // Check for [search:query] in response - perform web search
    // ============================================
    const searchEnabled = appSettings.webSearchEnabled !== false && !!appSettings.braveSearchApiKey;
    console.log(`[Search Check] Web search enabled: ${searchEnabled}, API key set: ${!!appSettings.braveSearchApiKey}`);
    console.log(`[Search Check] Looking for [search:...] in reply: "${reply.substring(0, 200)}..."`);
    
    const searchMatch = reply.match(/\[search:([^\]]+)\]/i);
    console.log(`[Search Check] Match found: ${searchMatch ? searchMatch[0] : 'none'}`);
    
    if (searchMatch && searchEnabled) {
        const searchQuery = searchMatch[1].trim();
        console.log(`[AI] Requested web search: "${searchQuery}"`);
        
        // Remove the search command from reply
        reply = reply.replace(/\[search:[^\]]+\]/gi, '').trim();
        
        // Send initial reply
        event.sender.send('stream-token', { sessionId, token: reply + '\n\n*Searching the web...*\n\n' });
        
        // Perform the search
        const searchResults = await braveWebSearch(searchQuery, 5);
        
        if (searchResults.success && searchResults.results.length > 0) {
            // Format results for the AI
            const searchContext = formatSearchResults(searchResults);
            
            // Make a follow-up request with search results
            const followUpMessages = [
                ...lastMessagesForAPI,
                { role: 'assistant', content: reply },
                { role: 'user', content: `Here are the web search results for "${searchQuery}":\n${searchContext}\n\nPlease summarize this information for me in a helpful way.` }
            ];
            
            let followUpReply = '';
            
            if (provider === 'anthropic') {
                try {
                    const client = clients.anthropic || initClient('anthropic');
                    let anthropicMessages = followUpMessages.map(m => ({ role: m.role, content: m.content }));
                    while (anthropicMessages.length > 0 && anthropicMessages[0].role !== 'user') {
                        anthropicMessages.shift();
                    }
                    const msg = await client.messages.create({
                        model: modelToUse,
                        max_tokens: 4096,
                        messages: anthropicMessages,
                    });
                    followUpReply = msg.content[0].text;
                } catch (e) {
                    console.error('[Search Follow-up] Anthropic error:', e);
                    followUpReply = `Based on my search, I found information about "${searchQuery}" but had trouble processing it.`;
                }
            } else if (provider === 'openai') {
                const client = clients.openai || initClient('openai');
                const completion = await client.chat.completions.create({
                    messages: followUpMessages.map(m => ({ role: m.role, content: m.content })),
                    model: modelToUse,
                });
                followUpReply = completion.choices[0].message.content;
            } else {
                // For local/other providers, just append the search results
                followUpReply = `Here's what I found:\n\n`;
                for (const r of searchResults.results) {
                    followUpReply += `**${r.title}**\n${r.description}\n\n`;
                }
            }
            
            // Clean up and send the follow-up
            followUpReply = followUpReply.replace(/\[search:[^\]]+\]/gi, '').replace(/\[track:[^\]]+\]/gi, '').trim();
            event.sender.send('stream-token', { sessionId, token: followUpReply });
            reply = reply + '\n\n' + followUpReply;
        } else {
            event.sender.send('stream-token', { sessionId, token: "I couldn't find any results for that search." });
            reply += "\n\nI couldn't find any results for that search.";
        }
    }

    // ============================================
    // Check for [color:#hexcode] in response - change face color
    // ============================================
    let colorMatch = reply.match(/\[color:(#[0-9a-fA-F]{6})\]/i);
    
    // Fallback: If AI didn't use the tag, detect color words in the message context
    // Only do this if user asked about changing color
    if (!colorMatch && message.toLowerCase().match(/\b(color|colour|face|change|turn|make|go)\b.*\b(red|blue|green|pink|purple|orange|yellow|cyan|white|normal)\b/i)) {
        const colorMap = {
            'red': '#ff4444',
            'blue': '#4488ff',
            'green': '#44ff44',
            'pink': '#ff88cc',
            'purple': '#aa44ff',
            'orange': '#ff8844',
            'yellow': '#ffff44',
            'cyan': '#44ffff',
            'white': '#ffffff',
            'normal': '#ffffff'
        };
        
        // Find which color the user asked for
        const userColorMatch = message.toLowerCase().match(/\b(red|blue|green|pink|purple|orange|yellow|cyan|white|normal)\b/i);
        if (userColorMatch) {
            const requestedColor = userColorMatch[1].toLowerCase();
            const hexColor = colorMap[requestedColor];
            if (hexColor) {
                console.log(`[AI] Fallback color detection: user asked for ${requestedColor} → ${hexColor}`);
                colorMatch = [null, hexColor]; // Fake match array
            }
        }
    }
    
    if (colorMatch) {
        const newColor = colorMatch[1];
        console.log(`[AI] Requested face color change: ${newColor}`);
        
        // Save the color to settings
        appSettings.faceColor = newColor;
        store.set('settings', appSettings);
        
        // Notify all windows about the color change
        BrowserWindow.getAllWindows().forEach(win => {
            if (!win.isDestroyed()) {
                win.webContents.send('face-color-update', { color: newColor });
            }
        });
        
        // Remove the color command from the visible reply (if it exists)
        reply = reply.replace(/\[color:#[0-9a-fA-F]{6}\]/gi, '').trim();
    }

    // ============================================
    // Check for [track:objectname] or [track:stop] in response
    const trackMatch = reply.match(/\[track:([^\]]+)\]/i);
    if (trackMatch) {
        const trackTarget = trackMatch[1].toLowerCase().trim();
        
        if (trackTarget === 'stop' || trackTarget === 'clear' || trackTarget === 'none') {
            // Stop tracking, go back to face
            console.log('[AI] Requested to stop object tracking');
            await yoloRequest('/track/clear', {});
            // Notify renderer
            event.sender.send('tracking-update', { tracking: null, mode: 'face' });
        } else {
            // Start tracking the specified object
            console.log(`[AI] Requested to track: ${trackTarget}`);
            await yoloRequest('/track/set', { object: trackTarget });
            // Notify renderer
            event.sender.send('tracking-update', { tracking: trackTarget, mode: 'object' });
        }
        
        // Remove the tracking command from the visible reply
        reply = reply.replace(/\[track:[^\]]+\]/gi, '').trim();
    }

    // Finalize message in store (with timestamp for combined context sorting)
    history.push({ 
        role: 'assistant', 
        content: reply,
        provider: provider,
        model: modelToUse,
        timestamp: Date.now()
    });

    // Extract and save important facts to persistent memory
    // Extract memories from user message (survives chat deletion)
    try {
        const memoriesAdded = extractMemoriesFromMessage(message);
        if (memoriesAdded > 0) {
            console.log(`[Memory] Extracted ${memoriesAdded} new memories from conversation`);
        }
    } catch (memErr) {
        console.error('[Memory] Error extracting memory:', memErr);
    }

    // Only persist to storage if we should save to history
    // (voice sessions with syncToChat=false will not be saved)
    if (shouldSaveToHistory) {
        // Auto-name
        if (history.length <= 2 && session.name === 'New Chat') {
            session.name = message.slice(0, 30) + (message.length > 30 ? '...' : '');
        }

        session.timestamp = Date.now();
        store.set('sessions', sessions);
        
        // Notify all windows about the update
        broadcastSessionsUpdate();
    } else {
        // For voice sessions without sync, remove the messages we just added
        // so they don't accumulate in memory
        history.pop(); // Remove assistant message
        history.pop(); // Remove user message
    }
    
    const responseId = randomUUID();
    event.sender.send('stream-end', { sessionId, reply, responseId });
    return { success: true };

  } catch (error) {
    console.error("Error in send-message:", error);
    event.sender.send('stream-error', { sessionId, error: error.message });
    return { success: false, error: error.message };
  }
});
