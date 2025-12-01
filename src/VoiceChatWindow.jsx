import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Center, ActionIcon, Text, Stack, Select, Group, Box, Badge, Tooltip, Paper, Button, Modal, Textarea } from '@mantine/core';
import { IconMicrophone, IconPlayerPause, IconPlayerPlay, IconCamera, IconCameraOff, IconTrash, IconSparkles, IconEye, IconTarget, IconSend, IconX } from '@tabler/icons-react';
import useVision from './hooks/useVision';

const VoiceChatWindow = () => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [status, setStatus] = useState('Idle');
    const [sessionId, setSessionId] = useState(null);
    const [session, setSession] = useState(null);
    const [settings, setSettings] = useState({});
    
    // Audio & VAD
    const mediaRecorderRef = useRef(null);
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const animationFrameRef = useRef(null);
    const audioChunksRef = useRef([]);
    const silenceTimerRef = useRef(null);
    const isSpeakingRef = useRef(false);
    const [volume, setVolume] = useState(0);
    const [inputDevices, setInputDevices] = useState([]);
    const [selectedInput, setSelectedInput] = useState('');
    const currentAudioRef = useRef(null);
    const lipSyncIntervalRef = useRef(null);
    const currentSentimentRef = useRef({ warmth: 0, energy: 0, openness: 0, positivity: 0 });
    
    // QoL Features
    const [showWaveform, setShowWaveform] = useState(false);
    const [pushToTalk, setPushToTalk] = useState(false);
    const [showTranscriptionPreview, setShowTranscriptionPreview] = useState(false);
    const [syncVoiceToChat, setSyncVoiceToChat] = useState(true);
    const [allowInterruption, setAllowInterruption] = useState(false);
    const [waveformData, setWaveformData] = useState(new Array(32).fill(0));
    const [transcriptionPreview, setTranscriptionPreview] = useState('');
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const isPushToTalkActiveRef = useRef(false);
    const audioQueueRef = useRef([]);
    const isPlayingQueueRef = useRef(false);
    
    // Vision
    const { 
        isTracking, 
        cameraError, 
        facePosition,
        trackedObject,
        objectPosition,
        startTracking, 
        stopTracking, 
        captureFrame, 
        trackObject,
        stopTrackingObject,
        yoloReady,
        yoloStarting,
        videoRef 
    } = useVision();
    const [cameraEnabled, setCameraEnabled] = useState(false);
    const [visionProvider, setVisionProvider] = useState('local');
    const visionIntervalRef = useRef(null);
    const VISION_ANALYSIS_INTERVAL = 3000;
    
    // Constants
    const SILENCE_THRESHOLD = 30;
    const SILENCE_DURATION = 2500;

    // AI-powered sentiment analysis
    const analyzeSentiment = async (text) => {
        try {
            if (window.electronAPI?.analyzeSentiment) {
                const result = await window.electronAPI.analyzeSentiment({ text, sessionId });
                if (result.success && result.sentiment) {
                    return result.sentiment;
                }
            }
        } catch (e) {
            console.error('Sentiment analysis failed:', e);
        }
        return detectEmotionFallback(text);
    };

    // Fallback emotion detection
    const detectEmotionFallback = (text) => {
        const lowerText = text.toLowerCase();
        let warmth = 0, energy = 0, openness = 0, positivity = 0;
        
        // Joy/Happiness
        if (/\b(happy|joyful|cheerful|delighted|elated|ecstatic|blissful|gleeful)\b/.test(lowerText)) {
            warmth += 0.5; positivity += 0.7; energy += 0.4;
        }
        
        // Love/Affection
        if (/\b(love|adore|cherish|caring|affectionate|warm|tender)\b/.test(lowerText)) {
            warmth += 0.8; positivity += 0.5; energy += 0.2;
        }
        
        // Gratitude
        if (/\b(thank|grateful|thankful|appreciate|blessed)\b/.test(lowerText)) {
            warmth += 0.6; positivity += 0.5;
        }
        
        // Excitement
        if (/\b(excited|thrilled|eager|enthusiastic|pumped|stoked|hyped)\b/.test(lowerText)) {
            energy += 0.7; positivity += 0.5; openness += 0.3;
        }
        
        // General positive
        if (/\b(good|great|nice|wonderful|awesome|fantastic|amazing|excellent|brilliant|perfect)\b/.test(lowerText)) {
            warmth += 0.3; positivity += 0.5; energy += 0.2;
        }
        
        // Smug / Confident
        if (/\b(told you|knew it|obviously|clearly|of course|i was right|predictable)\b/.test(lowerText)) {
            warmth += 0.3; positivity += 0.4; openness -= 0.3;
        }
        
        // Anger
        if (/\b(angry|furious|enraged|livid|irate|outraged|mad|pissed)\b/.test(lowerText)) {
            warmth -= 0.9; positivity -= 0.8; energy += 0.8; openness -= 0.4;
        }
        
        // Disgust
        if (/\b(disgusting|disgusted|gross|ew+|yuck|nasty|revolting|repulsive|vile)\b/.test(lowerText)) {
            warmth -= 0.7; positivity -= 0.5; energy += 0.3; openness -= 0.6;
        }
        
        // Sadness
        if (/\b(sad|unhappy|sorrowful|heartbroken|devastated|miserable|depressed|gloomy)\b/.test(lowerText)) {
            warmth += 0.4; positivity -= 0.8; energy -= 0.5; openness -= 0.1;
        }
        
        // Fear
        if (/\b(scared|afraid|frightened|terrified|panicked|fearful|spooked)\b/.test(lowerText)) {
            warmth -= 0.1; positivity -= 0.5; energy += 0.5; openness += 0.6;
        }
        
        // Worry
        if (/\b(worried|anxious|nervous|uneasy|apprehensive|concerned)\b/.test(lowerText)) {
            warmth += 0.5; positivity -= 0.5; energy += 0.2; openness += 0.3;
        }
        
        // Skepticism
        if (/\b(really\?|are you sure|doubtful|skeptical|suspicious|hard to believe)\b/.test(lowerText)) {
            warmth -= 0.4; positivity -= 0.2; openness -= 0.5;
        }
        
        // Surprise
        if (/\b(surprised|shocked|astonished|amazed|stunned|wow|whoa|oh my|omg|no way)\b/.test(lowerText)) {
            openness += 0.8; energy += 0.5;
        }
        
        // Thinking
        if (/\b(think|thinking|consider|ponder|wonder|let me see|interesting|curious)\b/.test(lowerText)) {
            openness -= 0.3; energy -= 0.2;
        }
        
        // Greeting
        if (/\b(hello|hi|hey|greetings|welcome|how are you)\b/.test(lowerText)) {
            warmth += 0.5; positivity += 0.4; energy += 0.2;
        }
        
        // Intensifiers
        if (/\b(very|really|extremely|incredibly|absolutely|totally|so)\b/.test(lowerText)) {
            warmth *= 1.3; energy *= 1.3; openness *= 1.3; positivity *= 1.3;
        }
        
        // Exclamation marks
        const exclamations = (text.match(/!/g) || []).length;
        energy += Math.min(0.4, exclamations * 0.15);
        
        return {
            warmth: Math.max(-1, Math.min(1, warmth)),
            energy: Math.max(-1, Math.min(1, energy)),
            openness: Math.max(-1, Math.min(1, openness)),
            positivity: Math.max(-1, Math.min(1, positivity))
        };
    };

    // Parse [face:expression] tags
    const parseFaceTag = (expression) => {
        const expressions = {
            'happy': { warmth: 0.6, energy: 0.3, openness: 0, positivity: 0.7 },
            'sad': { warmth: 0.5, energy: -0.4, openness: 0, positivity: -0.7 },
            'angry': { warmth: -0.8, energy: 0.5, openness: 0, positivity: -0.3 },
            'surprised': { warmth: 0.1, energy: 0.3, openness: 0.8, positivity: 0.1 },
            'scared': { warmth: 0, energy: 0.4, openness: 0.7, positivity: -0.3 },
            'excited': { warmth: 0.6, energy: 0.8, openness: 0.2, positivity: 0.6 },
            'disgusted': { warmth: -0.6, energy: 0.2, openness: -0.5, positivity: -0.4 },
            'thinking': { warmth: 0, energy: -0.1, openness: -0.1, positivity: 0 },
            'thoughtful': { warmth: 0, energy: -0.1, openness: -0.1, positivity: 0 },
            'skeptical': { warmth: -0.3, energy: 0, openness: -0.4, positivity: -0.1 },
            'smug': { warmth: 0.3, energy: 0.1, openness: -0.2, positivity: 0.4 },
            'worried': { warmth: 0.6, energy: 0.1, openness: 0.4, positivity: -0.6 },
            'concerned': { warmth: 0.6, energy: 0.1, openness: 0.4, positivity: -0.6 },
            'neutral': { warmth: 0, energy: 0, openness: 0, positivity: 0 },
            'confused': { warmth: 0, energy: 0, openness: 0.3, positivity: -0.1 },
            'curious': { warmth: 0.2, energy: 0.1, openness: 0.3, positivity: 0.1 },
            'annoyed': { warmth: -0.5, energy: 0.3, openness: -0.2, positivity: -0.4 },
            'proud': { warmth: 0.4, energy: 0.3, openness: 0, positivity: 0.5 },
            'embarrassed': { warmth: 0.2, energy: -0.2, openness: -0.3, positivity: -0.3 },
            'playful': { warmth: 0.5, energy: 0.4, openness: 0.1, positivity: 0.5 },
        };
        return expressions[expression.toLowerCase()] || null;
    };

    const extractFaceTags = (text) => {
        const faceTagRegex = /\[face:(\w+)\]/gi;
        let lastSentiment = null;
        let match;
        
        while ((match = faceTagRegex.exec(text)) !== null) {
            const sentiment = parseFaceTag(match[1]);
            if (sentiment) lastSentiment = sentiment;
        }
        
        const cleanText = text.replace(faceTagRegex, '').trim();
        return { cleanText, sentiment: lastSentiment };
    };
    
    const extractTrackTags = (text) => {
        const trackTagRegex = /\[track:(\w+)\]/gi;
        let trackCommand = null;
        let match;
        
        while ((match = trackTagRegex.exec(text)) !== null) {
            trackCommand = match[1].toLowerCase();
        }
        
        if (trackCommand) {
            if (trackCommand === 'stop') {
                stopTrackingObject();
            } else {
                trackObject(trackCommand);
            }
        }
        
        const cleanText = text.replace(trackTagRegex, '').trim();
        return cleanText;
    };

    const sendFaceControl = (data) => {
        if (sessionId && window.electronAPI?.sendFaceControl) {
            window.electronAPI.sendFaceControl({ sessionId, ...data });
        }
    };
    
    const storeVisionFrame = async () => {
        if (!cameraEnabled || !sessionId) return;
        
        const frame = captureFrame();
        if (!frame) return;
        
        if (window.electronAPI?.storeFrame) {
            await window.electronAPI.storeFrame(sessionId, frame);
        }
    };
    
    useEffect(() => {
        if (cameraEnabled && facePosition) {
            sendFaceControl({ userFacePosition: facePosition });
        }
    }, [facePosition, cameraEnabled, trackedObject]);
    
    useEffect(() => {
        if (cameraEnabled && sessionId) {
            storeVisionFrame();
            visionIntervalRef.current = setInterval(storeVisionFrame, VISION_ANALYSIS_INTERVAL);
            
            return () => {
                if (visionIntervalRef.current) clearInterval(visionIntervalRef.current);
            };
        }
    }, [cameraEnabled, sessionId]);
    
    const handleFacePositionChange = (position) => {
        if (!trackedObject) {
            sendFaceControl({ userFacePosition: position });
        }
    };
    
    const toggleCamera = async () => {
        console.log('[VoiceChat] toggleCamera called, cameraEnabled:', cameraEnabled, 'videoRef:', videoRef.current);
        
        if (cameraEnabled) {
            stopTracking();
            setCameraEnabled(false);
            if (visionIntervalRef.current) clearInterval(visionIntervalRef.current);
            sendFaceControl({ userFacePosition: { detected: false } });
            if (window.electronAPI?.setCameraEnabled && sessionId) {
                window.electronAPI.setCameraEnabled(sessionId, false);
            }
        } else {
            // Video element should always exist now (just hidden)
            if (!videoRef.current) {
                console.error('[VoiceChat] Video element not found!');
                return;
            }
            
            console.log('[VoiceChat] Starting camera tracking...');
            const success = await startTracking(videoRef.current, {
                onFacePositionChange: handleFacePositionChange
            });
            
            console.log('[VoiceChat] startTracking result:', success);
            
            if (success) {
                setCameraEnabled(true);
                if (window.electronAPI?.setCameraEnabled && sessionId) {
                    window.electronAPI.setCameraEnabled(sessionId, true);
                }
            } else {
                console.error('[VoiceChat] Failed to start camera tracking');
            }
        }
    };

    // Push-to-talk keyboard handlers
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.code === 'Space' && pushToTalk && isPlaying && !isPushToTalkActiveRef.current && !showPreviewModal) {
                e.preventDefault();
                isPushToTalkActiveRef.current = true;
                setStatus('Listening...');
            }
        };

        const handleKeyUp = (e) => {
            if (e.code === 'Space' && pushToTalk && isPlaying && isPushToTalkActiveRef.current) {
                e.preventDefault();
                isPushToTalkActiveRef.current = false;
                if (isSpeakingRef.current) {
                    stopRecordingAndSend();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [pushToTalk, isPlaying, showPreviewModal]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const sid = params.get('sessionId');
        if (sid) {
            setSessionId(sid);
            loadSession(sid);
        }
        
        loadDevices();
        
        if (window.electronAPI?.onTrackingUpdate) {
            window.electronAPI.onTrackingUpdate((data) => {
                if (data.tracking) {
                    trackObject(data.tracking);
                } else {
                    stopTrackingObject();
                }
            });
        }

        return () => {
            stopListening();
            stopTracking();
            if (audioContextRef.current) audioContextRef.current.close();
            if (window.electronAPI?.removeTrackingUpdateListener) {
                window.electronAPI.removeTrackingUpdateListener();
            }
        };
    }, []);

    const loadDevices = async () => {
        try {
            await navigator.mediaDevices.getUserMedia({ audio: true });
            const devices = await navigator.mediaDevices.enumerateDevices();
            const inputs = devices.filter(d => d.kind === 'audioinput').map(d => ({ value: d.deviceId, label: d.label || `Microphone ${d.deviceId.slice(0, 5)}` }));
            setInputDevices(inputs);
        } catch (e) {
            console.error("Failed to load devices:", e);
        }
    };

    const loadSession = async (sid) => {
        const state = await window.electronAPI.getInitialState();
        setSession(state.sessions.find(s => s.id === sid));
        const savedSettings = state.settings || {};
        setSettings(savedSettings);
        if (savedSettings.selectedInput) {
            setSelectedInput(savedSettings.selectedInput);
        } else if (inputDevices.length > 0) {
            setSelectedInput(inputDevices[0].value);
        }
        setVisionProvider(savedSettings.visionProvider || 'local');
        // Load QoL settings
        setShowWaveform(savedSettings.showWaveform ?? false);
        setPushToTalk(savedSettings.pushToTalk ?? false);
        setShowTranscriptionPreview(savedSettings.showTranscriptionPreview ?? false);
        setSyncVoiceToChat(savedSettings.syncVoiceToChat ?? true);
        setAllowInterruption(savedSettings.allowInterruption ?? false);
    };

    const handleInputChange = (val) => {
        setSelectedInput(val);
        if (isPlaying) {
            stopListening();
            setTimeout(() => startListening(val), 500);
        }
    };

    const startListening = async (overrideDeviceId = null) => {
        try {
            const deviceId = overrideDeviceId || selectedInput || (settings.selectedInput);
            const audioConstraints = { audio: { deviceId: deviceId ? { exact: deviceId } : undefined } };
            
            const stream = await navigator.mediaDevices.getUserMedia(audioConstraints);
            
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            await audioContextRef.current.resume();

            const source = audioContextRef.current.createMediaStreamSource(stream);
            analyserRef.current = audioContextRef.current.createAnalyser();
            analyserRef.current.fftSize = 256;
            source.connect(analyserRef.current);
            
            const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);

            const checkVolume = () => {
                if (!isPlaying) return;
                
                analyserRef.current.getByteFrequencyData(dataArray);
                let sum = 0;
                for(let i=0; i<dataArray.length; i++) sum += dataArray[i];
                const avg = sum / dataArray.length;
                setVolume(avg);
                
                // Update waveform data for visualization
                if (showWaveform) {
                    const waveData = [];
                    const step = Math.floor(dataArray.length / 32);
                    for (let i = 0; i < 32; i++) {
                        waveData.push(dataArray[i * step] / 255);
                    }
                    setWaveformData(waveData);
                }

                // Push-to-talk mode: only listen while spacebar is held
                if (pushToTalk) {
                    if (isPushToTalkActiveRef.current && avg > 10) {
                        if (!isSpeakingRef.current) {
                            isSpeakingRef.current = true;
                            setStatus('Listening...');
                        }
                    }
                } else {
                    // Auto-detect mode (original behavior)
                    if (avg > SILENCE_THRESHOLD) {
                        if (currentAudioRef.current && status === 'Speaking...') {
                            currentAudioRef.current.pause();
                            currentAudioRef.current.currentTime = 0;
                            currentAudioRef.current = null;
                        }
                        
                        if (silenceTimerRef.current) {
                            clearTimeout(silenceTimerRef.current);
                            silenceTimerRef.current = null;
                        }
                        if (!isSpeakingRef.current) {
                            isSpeakingRef.current = true;
                            setStatus('Listening...');
                            
                            // If interruption is enabled and AI is speaking, stop it
                            if (allowInterruption && currentAudioRef.current) {
                                console.log('[Voice] User interrupted AI - stopping audio');
                                currentAudioRef.current.pause();
                                currentAudioRef.current.currentTime = 0;
                                currentAudioRef.current = null;
                                audioQueueRef.current = []; // Clear pending audio
                                isPlayingQueueRef.current = false;
                                sendFaceControl({ isTalking: false, mouthOpenness: 0, frequencyData: [] });
                                if (window.electronAPI?.stopSpeaking) {
                                    window.electronAPI.stopSpeaking();
                                }
                            }
                        }
                    } else {
                        if (isSpeakingRef.current && !silenceTimerRef.current) {
                            silenceTimerRef.current = setTimeout(() => {
                                stopRecordingAndSend();
                            }, SILENCE_DURATION);
                        }
                    }
                }

                animationFrameRef.current = requestAnimationFrame(checkVolume);
            };
            
            checkVolume();

            audioChunksRef.current = [];
            let options = {};
            if (MediaRecorder.isTypeSupported('audio/webm')) options = { mimeType: 'audio/webm' };
            
            mediaRecorderRef.current = new MediaRecorder(stream, options);
            mediaRecorderRef.current.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };
            mediaRecorderRef.current.start(1000);
            
            setIsPlaying(true);
            setStatus('Listening...');

        } catch (e) {
            console.error("Failed to start listening:", e);
            setStatus('Error: Mic Access Failed');
        }
    };

    const stopListening = () => {
        setIsPlaying(false);
        setStatus('Idle');
        
        if (currentAudioRef.current) {
            currentAudioRef.current.pause();
            currentAudioRef.current.currentTime = 0;
            currentAudioRef.current = null;
        }
        
        if (lipSyncIntervalRef.current) cancelAnimationFrame(lipSyncIntervalRef.current);
        
        sendFaceControl({ isTalking: false, mouthOpenness: 0 });
        
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
             mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
        }
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        
        isSpeakingRef.current = false;
    };

    const stopRecordingAndSend = () => {
        if (!mediaRecorderRef.current) return;
        
        const recorder = mediaRecorderRef.current;
        
        recorder.onstop = async () => {
            const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
            const buffer = await blob.arrayBuffer();
            
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            
            setStatus('Transcribing...');
            
            try {
                const res = await window.electronAPI.transcribeAudio(buffer);
                if (res.success && res.text.trim()) {
                    // If transcription preview is enabled, show modal
                    if (showTranscriptionPreview) {
                        setTranscriptionPreview(res.text);
                        setShowPreviewModal(true);
                        setStatus('Review transcription...');
                    } else {
                        // Send directly
                        await sendTranscribedMessage(res.text);
                    }
                } else {
                    restartListening();
                }
            } catch (e) {
                console.error(e);
                restartListening();
            }
        };
        
        recorder.stop();
    };

    const sendTranscribedMessage = async (text) => {
        setStatus('Thinking...');
        
        sendFaceControl({ 
            warmth: 0.15, energy: -0.1, openness: -0.15, positivity: 0.05,
            intensity: 0.5, isThinking: true, isTalking: false 
        });
        
        if (cameraEnabled) {
            const frame = captureFrame();
            if (frame && window.electronAPI?.storeFrame) {
                await window.electronAPI.storeFrame(sessionId, frame);
            }
        }
        
        window.electronAPI.sendMessage({ 
            sessionId, 
            message: text, 
            isVoiceSession: true, 
            useVision: cameraEnabled,
            syncToChat: syncVoiceToChat
        });
    };

    const handlePreviewSend = () => {
        setShowPreviewModal(false);
        sendTranscribedMessage(transcriptionPreview);
        setTranscriptionPreview('');
    };

    const handlePreviewCancel = () => {
        setShowPreviewModal(false);
        setTranscriptionPreview('');
        restartListening();
    };

    const restartListening = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
             mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
        }
        startListening();
    };

    // Handle AI Responses
    useEffect(() => {
        if (!sessionId) return;

        let streamingText = '';
        let lastSentimentUpdate = 0;
        const SENTIMENT_UPDATE_INTERVAL = 300;
        
        const handleStreamToken = ({ sessionId: sid, token }) => {
            if (sid !== sessionId) return;
            
            streamingText += token;
            
            const now = Date.now();
            if (now - lastSentimentUpdate > SENTIMENT_UPDATE_INTERVAL && streamingText.length > 10) {
                lastSentimentUpdate = now;
                
                const { sentiment: tagSentiment } = extractFaceTags(streamingText);
                let sentiment = tagSentiment || detectEmotionFallback(streamingText);
                
                currentSentimentRef.current = sentiment;
                sendFaceControl({ ...sentiment, isThinking: true, isTalking: false, intensity: 0.7 });
            }
        };

        const handleStreamEnd = async ({ sessionId: sid, reply, responseId }) => {
             if (sid !== sessionId) return;
             
             streamingText = '';
             setStatus('Preparing speech...');
             
             const replyWithoutTrack = extractTrackTags(reply);
             
             const cleanText = replyWithoutTrack
                .replace(/<think>[\s\S]*?<\/think>/g, '')
                .replace(/```[\s\S]*?```/g, '')
                .replace(/[*#_]/g, '')
                .trim();
             
             if (!cleanText) {
                 sendFaceControl({ isTalking: false, isThinking: false });
                 if (isPlaying) restartListening();
                 return;
             }
             
             const sentences = cleanText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleanText];
             
             const audioClips = new Array(sentences.length).fill(null);
             const sentimentData = [];
             const audioPromises = [];
             
             let cumulativeSentiment = { warmth: 0, energy: 0, openness: 0, positivity: 0 };
             
             const cleanForTTS = (text) => text
                 .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
                 .replace(/[\u{2600}-\u{27BF}]/gu, '')
                 .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
                 .replace(/[\u{200D}]/gu, '')
                 .replace(/[\u{20E3}]/gu, '')
                 .replace(/[\u{E0020}-\u{E007F}]/gu, '')
                 .replace(/[:;][-']?[)(\[\]DPpOo3><|\\\/]+/g, '')
                 .replace(/[<>]3/g, '')
                 .replace(/\^\^+/g, '')
                 .replace(/[xX][Dd]/g, '')
                 .replace(/[+\-_=(){}[\]<>|\\/@#$%^&*~`"]+/g, ' ')
                 .replace(/\*/g, '')
                 .replace(/_/g, ' ')
                 .replace(/(?<!\d):(?!\d)/g, ' ')
                 .replace(/\s+/g, ' ')
                 .trim();
             
             for (let i = 0; i < sentences.length; i++) {
                 const sentence = sentences[i].trim();
                 if (!sentence) { sentimentData.push(null); continue; }
                 
                 const { cleanText: sentenceWithoutTags, sentiment: tagSentiment } = extractFaceTags(sentence);
                 
                 let sentenceSentiment;
                 if (tagSentiment) {
                     sentenceSentiment = tagSentiment;
                     cumulativeSentiment = tagSentiment;
                 } else {
                     sentenceSentiment = detectEmotionFallback(sentenceWithoutTags);
                     cumulativeSentiment = {
                         warmth: cumulativeSentiment.warmth * 0.5 + sentenceSentiment.warmth,
                         energy: cumulativeSentiment.energy * 0.5 + sentenceSentiment.energy,
                         openness: cumulativeSentiment.openness * 0.5 + sentenceSentiment.openness,
                         positivity: cumulativeSentiment.positivity * 0.5 + sentenceSentiment.positivity
                     };
                 }
                 
                 const clampedSentiment = {
                     warmth: Math.max(-1, Math.min(1, cumulativeSentiment.warmth)),
                     energy: Math.max(-1, Math.min(1, cumulativeSentiment.energy)),
                     openness: Math.max(-1, Math.min(1, cumulativeSentiment.openness)),
                     positivity: Math.max(-1, Math.min(1, cumulativeSentiment.positivity))
                 };
                 
                 const exclamations = (sentence.match(/!/g) || []).length;
                 const questions = (sentence.match(/\?/g) || []).length;
                 const capsWords = (sentence.match(/\b[A-Z]{2,}\b/g) || []).length;
                 const baseIntensity = tagSentiment ? 0.85 : 0.5;
                 const intensity = Math.min(1, baseIntensity + exclamations * 0.1 + questions * 0.05 + capsWords * 0.1);
                 
                 sentimentData.push({ sentiment: clampedSentiment, intensity, sentence: sentenceWithoutTags });
                 
                 const ttsCleanSentence = cleanForTTS(sentenceWithoutTags);
                 
                 if (ttsCleanSentence && ttsCleanSentence.length > 1) {
                     const idx = i;
                     const promise = window.electronAPI.speakText(ttsCleanSentence)
                         .then(res => { if (res.success && res.audio) audioClips[idx] = res.audio; })
                         .catch(e => console.error('TTS error:', e));
                     audioPromises.push(promise);
                 }
             }
             
             const firstSentiment = sentimentData.find(s => s)?.sentiment || { warmth: 0, energy: 0, openness: 0, positivity: 0 };
             const firstIntensity = sentimentData.find(s => s)?.intensity || 0.5;
             
             sendFaceControl({ ...firstSentiment, intensity: firstIntensity, isThinking: false, isTalking: false });
             
             setStatus('Speaking...');
             
             if (audioPromises.length > 0) await audioPromises[0];
             
             const playClip = async (clipIndex) => {
                 if (clipIndex >= audioClips.length) {
                     sendFaceControl({ isTalking: false, isThinking: false, mouthOpenness: 0, mouthShape: 'neutral', frequencyData: [] });
                     if (isPlaying) restartListening();
                     return;
                 }
                 
                 if (!audioClips[clipIndex] && audioPromises[clipIndex]) await audioPromises[clipIndex];
                 
                 const audioData = audioClips[clipIndex];
                 const sentData = sentimentData[clipIndex];
                 const sentiment = sentData?.sentiment;
                 const intensity = sentData?.intensity;
                 
                 if (!audioData || !sentData) { playClip(clipIndex + 1); return; }
                 
                 const currentSentiment = sentiment || { warmth: 0, energy: 0, openness: 0, positivity: 0 };
                 const currentIntensity = intensity || 0.5;
                 
                 currentSentimentRef.current = currentSentiment;
                 sendFaceControl({ ...currentSentiment, intensity: currentIntensity, isThinking: false, isTalking: true });
                 
                 const audio = new Audio(audioData);
                 currentAudioRef.current = audio;
                 
                 const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                 const source = audioContext.createMediaElementSource(audio);
                 const analyser = audioContext.createAnalyser();
                 analyser.fftSize = 512;
                 source.connect(analyser);
                 analyser.connect(audioContext.destination);
                 
                 const dataArray = new Uint8Array(analyser.frequencyBinCount);
                 const sampleRate = audioContext.sampleRate;
                 const binSize = sampleRate / analyser.fftSize;
                 
                 const getFreqEnergy = (lowHz, highHz) => {
                     const lowBin = Math.floor(lowHz / binSize);
                     const highBin = Math.min(Math.floor(highHz / binSize), dataArray.length - 1);
                     let sum = 0;
                     for (let i = lowBin; i <= highBin; i++) sum += dataArray[i];
                     return sum / (highBin - lowBin + 1);
                 };
                 
                 const detectMouthShape = () => {
                     const lowEnergy = getFreqEnergy(100, 400);
                     const midLowEnergy = getFreqEnergy(400, 800);
                     const midEnergy = getFreqEnergy(800, 1500);
                     const midHighEnergy = getFreqEnergy(1500, 2500);
                     const highEnergy = getFreqEnergy(2500, 4000);
                     
                     const totalEnergy = lowEnergy + midLowEnergy + midEnergy + midHighEnergy + highEnergy;
                     
                     if (totalEnergy < 15) return 'closed';
                     
                     const lowRatio = lowEnergy / totalEnergy;
                     const midLowRatio = midLowEnergy / totalEnergy;
                     const midRatio = midEnergy / totalEnergy;
                     const highRatio = (midHighEnergy + highEnergy) / totalEnergy;
                     
                     if (lowRatio > 0.35 && highRatio < 0.25) return 'round';
                     if (highRatio > 0.4 && midRatio < 0.25) return 'wide';
                     if (midLowRatio > 0.3 || midRatio > 0.35) return 'open';
                     if (totalEnergy < 40 && highRatio > 0.3) return 'teeth';
                     
                     return 'open';
                 };
                 
                 const updateLipSync = () => {
                     if (!currentAudioRef.current || audio.paused || audio.ended) return;
                     
                     analyser.getByteFrequencyData(dataArray);
                     
                     // Find the peak frequency value in voice range (like the most sensitive bar)
                     let peakValue = 0;
                     const bufferLen = dataArray.length;
                     const nyquist = audioContext.sampleRate / 2;
                     const voiceStartBin = Math.floor(80 * bufferLen / nyquist);
                     const voiceEndBin = Math.floor(4000 * bufferLen / nyquist);
                     
                     for (let i = voiceStartBin; i < voiceEndBin && i < bufferLen; i++) {
                         if (dataArray[i] > peakValue) {
                             peakValue = dataArray[i];
                         }
                     }
                     
                     // Check if there's any audio at all
                     let totalEnergy = 0;
                     for (let i = voiceStartBin; i < voiceEndBin && i < bufferLen; i++) {
                         totalEnergy += dataArray[i];
                     }
                     const hasAudio = totalEnergy > 500; // Threshold for "is speaking"
                     
                     // Exaggerated mouth movement - opens and closes a lot while talking
                     let clampedOpenness = 0;
                     if (hasAudio) {
                         // Base openness from audio energy
                         const normalizedEnergy = Math.min(1, totalEnergy / 8000);
                         const baseOpen = 0.3 + normalizedEnergy * 0.5; // 0.3 to 0.8 base
                         
                         // Add random variation for more lively movement
                         const randomVar = (Math.random() - 0.3) * 0.5; // Bias toward opening
                         
                         // Add time-based oscillation for constant movement
                         const timeOscillation = Math.sin(Date.now() / 80) * 0.25;
                         
                         // Combine everything
                         clampedOpenness = baseOpen + randomVar + timeOscillation;
                         clampedOpenness = Math.max(0.15, Math.min(1.0, clampedOpenness)); // Keep mouth somewhat open while talking
                     }
                     
                     const mouthShape = clampedOpenness > 0.1 ? detectMouthShape() : 'closed';
                     
                     // Extract frequency data for visualizer (normalized 0-1)
                     const visualizerBars = 64;
                     const frequencyData = [];
                     const step = Math.floor(dataArray.length / visualizerBars);
                     for (let i = 0; i < visualizerBars; i++) {
                         const idx = Math.min(i * step, dataArray.length - 1);
                         const boost = i < visualizerBars / 4 ? 1.3 : 1.0;
                         frequencyData.push(Math.min(1, (dataArray[idx] / 255) * boost));
                     }
                     
                     sendFaceControl({ 
                         ...currentSentiment, intensity: currentIntensity,
                         mouthOpenness: clampedOpenness, mouthShape, isTalking: true, isThinking: false,
                         frequencyData
                     });
                     
                     lipSyncIntervalRef.current = requestAnimationFrame(updateLipSync);
                 };
                 
                 audio.onplay = () => {
                     sendFaceControl({ ...currentSentiment, intensity: currentIntensity, isTalking: true, isThinking: false });
                     updateLipSync();
                     if (clipIndex + 1 < audioClips.length && !audioClips[clipIndex + 1] && audioPromises[clipIndex + 1]) {
                         audioPromises[clipIndex + 1];
                     }
                 };
                 
                 audio.onended = () => {
                     currentAudioRef.current = null;
                     if (lipSyncIntervalRef.current) cancelAnimationFrame(lipSyncIntervalRef.current);
                     audioContext.close();
                     playClip(clipIndex + 1);
                 };
                 
                 audio.onpause = () => {
                     if (lipSyncIntervalRef.current) cancelAnimationFrame(lipSyncIntervalRef.current);
                     sendFaceControl({ mouthOpenness: 0, mouthShape: 'neutral', frequencyData: [] });
                 };
                 
                 audio.onerror = () => { audioContext.close(); playClip(clipIndex + 1); };
                 
                 audio.play();
             };
             
             playClip(0);
        };

        window.electronAPI.onStreamToken(handleStreamToken);
        window.electronAPI.onStreamEnd(handleStreamEnd);

        return () => {
            if (window.electronAPI.removeStreamListeners) window.electronAPI.removeStreamListeners();
        };
    }, [sessionId, isPlaying]);


    const togglePlay = () => {
        if (isPlaying) stopListening();
        else startListening();
    };

    const openCanvasWindow = () => {
        window.electronAPI.openCanvasWindow(sessionId);
    };

    // Get status color
    const getStatusColor = () => {
        switch (status) {
            case 'Listening...': return '#3b82f6';
            case 'Speaking...': return '#10b981';
            case 'Thinking...': return '#f59e0b';
            case 'Transcribing...': return '#8b5cf6';
            default: return '#64748b';
        }
    };

    const getStatusBg = () => {
        switch (status) {
            case 'Listening...': return 'rgba(59, 130, 246, 0.15)';
            case 'Speaking...': return 'rgba(16, 185, 129, 0.15)';
            case 'Thinking...': return 'rgba(245, 158, 11, 0.15)';
            case 'Transcribing...': return 'rgba(139, 92, 246, 0.15)';
            default: return 'rgba(100, 116, 139, 0.1)';
        }
    };

    return (
        <Box 
          style={{ 
            minHeight: '100vh', 
            background: 'linear-gradient(180deg, #0a0a0f 0%, #0d0d14 50%, #0a0a0f 100%)',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
            {/* Background gradient orbs */}
            <div style={{
              position: 'absolute',
              top: '-10%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '600px',
              height: '600px',
              background: `radial-gradient(circle, ${getStatusColor()}15 0%, transparent 70%)`,
              pointerEvents: 'none',
              transition: 'all 0.5s ease'
            }} />

            <Center h="100vh" style={{ position: 'relative', zIndex: 1 }}>
                <Stack align="center" gap="xl">
                    {/* Header */}
                    <Stack align="center" gap="xs">
                        <Text size="lg" fw={600} c="#f8fafc" style={{ letterSpacing: '-0.02em' }}>
                            {session?.name || 'Voice Chat'}
                        </Text>
                        <Badge 
                          size="lg"
                          style={{ 
                            background: getStatusBg(),
                            color: getStatusColor(),
                            border: `1px solid ${getStatusColor()}30`,
                            textTransform: 'none',
                            fontWeight: 500
                          }}
                        >
                            {status}
                        </Badge>
                    </Stack>
                    
                    {/* Camera Preview - always render video element so ref is available */}
                    <Paper 
                      p={4}
                      style={{
                        background: '#12121a',
                        border: facePosition?.detected 
                          ? '2px solid #10b981' 
                          : '2px solid #f59e0b',
                        borderRadius: '16px',
                        boxShadow: facePosition?.detected 
                          ? '0 0 30px rgba(16, 185, 129, 0.2)' 
                          : '0 0 30px rgba(245, 158, 11, 0.2)',
                        position: 'relative',
                        overflow: 'hidden',
                        display: cameraEnabled ? 'block' : 'none'
                      }}
                    >
                        <video 
                            ref={videoRef} 
                            style={{ 
                                width: 200,
                                height: 150,
                                borderRadius: '12px',
                                transform: 'scaleX(-1)',
                                display: 'block'
                            }} 
                            autoPlay 
                            playsInline 
                            muted 
                        />
                        {facePosition?.detected && !trackedObject && (
                            <div className="tracking-dot" style={{
                                left: `${50 - facePosition.x * 40}%`,
                                top: `${50 + facePosition.y * 40}%`,
                            }} />
                        )}
                    </Paper>
                    
                    {/* Camera Status */}
                    {cameraEnabled && (
                        <Stack gap={6} align="center">
                            {trackedObject ? (
                                <Badge leftSection={<IconTarget size={12} />} color="cyan" variant="light">
                                    Tracking: {trackedObject}
                                </Badge>
                            ) : (
                                <Badge 
                                  leftSection={<IconEye size={12} />} 
                                  color={facePosition?.detected ? 'green' : 'yellow'} 
                                  variant="light"
                                >
                                    {facePosition?.detected ? 'Face Tracked' : 'No Face Detected'}
                                </Badge>
                            )}
                            <Group gap="xs">
                                <Badge size="xs" color={visionProvider === 'local' ? 'violet' : 'blue'} variant="dot">
                                    {visionProvider === 'local' ? 'Local Vision' : 'GPT-4.1 Vision'}
                                </Badge>
                                <Badge size="xs" color={yoloReady ? 'teal' : yoloStarting ? 'yellow' : 'gray'} variant="dot">
                                    {yoloReady ? 'YOLO Active' : yoloStarting ? 'Starting YOLO...' : 'YOLO Offline'}
                                </Badge>
                            </Group>
                        </Stack>
                    )}
                    
                    {/* Main Orb */}
                    <div 
                      className={`voice-orb ${isPlaying ? 'active' : ''} ${status === 'Listening...' ? 'listening' : ''} ${status === 'Speaking...' ? 'speaking' : ''}`}
                      style={{
                        width: 180,
                        height: 180,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #12121a 0%, #1a1a24 100%)',
                        border: `2px solid ${isPlaying ? getStatusColor() : 'rgba(255,255,255,0.1)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.3s ease',
                        boxShadow: isPlaying ? `0 0 60px ${getStatusColor()}40` : 'none',
                        transform: isPlaying && status === 'Listening...' ? `scale(${1 + Math.min(volume / 150, 0.15)})` : 'scale(1)'
                      }}
                    >
                        <IconMicrophone 
                          size={70} 
                          color={isPlaying ? getStatusColor() : '#64748b'} 
                          style={{ transition: 'color 0.3s ease' }}
                        />
                    </div>

                    {/* Waveform Display */}
                    {isPlaying && showWaveform && (
                        <Box style={{ 
                            width: 280, 
                            height: 60, 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            gap: 3,
                            background: 'rgba(18, 18, 26, 0.8)',
                            borderRadius: '12px',
                            padding: '8px 12px',
                            border: '1px solid rgba(255,255,255,0.1)'
                        }}>
                            {waveformData.map((value, i) => (
                                <Box
                                    key={i}
                                    style={{
                                        width: 4,
                                        height: `${Math.max(4, value * 50)}px`,
                                        background: value > 0.3 
                                            ? `linear-gradient(180deg, ${getStatusColor()} 0%, ${getStatusColor()}80 100%)`
                                            : 'rgba(100, 116, 139, 0.4)',
                                        borderRadius: 2,
                                        transition: 'height 50ms ease'
                                    }}
                                />
                            ))}
                        </Box>
                    )}

                    {/* Volume Indicator (simple bar when waveform is off) */}
                    {isPlaying && !showWaveform && (
                        <Box style={{ width: 200, height: 4, background: '#1a1a24', borderRadius: 2, overflow: 'hidden' }}>
                            <Box 
                              style={{ 
                                width: `${Math.min(100, (volume / SILENCE_THRESHOLD) * 100)}%`, 
                                height: '100%', 
                                background: volume > SILENCE_THRESHOLD ? '#10b981' : '#3b82f6',
                                borderRadius: 2,
                                transition: 'width 50ms ease'
                              }} 
                            />
                        </Box>
                    )}
                    
                    {/* Push-to-talk hint */}
                    {isPlaying && pushToTalk && (
                        <Badge 
                          color={isPushToTalkActiveRef.current ? 'green' : 'gray'} 
                          variant="light"
                          size="lg"
                        >
                            Hold SPACE to talk
                        </Badge>
                    )}

                    {/* Control Buttons */}
                    <Group gap="md">
                        <Tooltip label={isPlaying ? "Stop" : "Start Voice Chat"}>
                            <ActionIcon 
                                size={80} 
                                radius="xl" 
                                onClick={togglePlay}
                                style={{
                                    background: isPlaying 
                                      ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' 
                                      : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                    boxShadow: isPlaying 
                                      ? '0 8px 30px rgba(239, 68, 68, 0.4)' 
                                      : '0 8px 30px rgba(16, 185, 129, 0.4)',
                                    border: 'none',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                {isPlaying ? <IconPlayerPause size={36} color="white" /> : <IconPlayerPlay size={36} color="white" />}
                            </ActionIcon>
                        </Tooltip>
                        
                        <Tooltip label={cameraEnabled ? "Disable Camera" : "Enable Camera & Face Tracking"}>
                            <ActionIcon 
                                size={60} 
                                radius="xl" 
                                onClick={toggleCamera}
                                style={{
                                    background: cameraEnabled 
                                      ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' 
                                      : '#1a1a24',
                                    border: cameraEnabled ? 'none' : '1px solid rgba(255,255,255,0.1)',
                                    boxShadow: cameraEnabled ? '0 4px 20px rgba(59, 130, 246, 0.3)' : 'none'
                                }}
                            >
                                {cameraEnabled ? <IconCamera size={28} color="white" /> : <IconCameraOff size={28} color="#64748b" />}
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                    
                    {!isPlaying && (
                        <Text size="sm" c="#64748b">Press play to start voice chat</Text>
                    )}

                    {/* Bottom Controls */}
                    <Group align="center" gap="md" mt="md">
                        <Select 
                            data={inputDevices} 
                            value={selectedInput} 
                            onChange={handleInputChange}
                            placeholder="Select Microphone"
                            w={220}
                            size="sm"
                            styles={{ 
                                input: { 
                                    backgroundColor: '#12121a', 
                                    borderColor: 'rgba(255,255,255,0.1)', 
                                    color: '#f8fafc',
                                    borderRadius: '10px'
                                }, 
                                dropdown: { 
                                    backgroundColor: '#1a1a24', 
                                    borderColor: 'rgba(255,255,255,0.1)',
                                    borderRadius: '12px'
                                }, 
                                option: { 
                                    borderRadius: '8px',
                                    '&:hover': { backgroundColor: '#22222e' } 
                                } 
                            }}
                        />

                        <Tooltip label="Clear AI Memory">
                            <ActionIcon
                                size={40}
                                radius="xl"
                                variant="light"
                                color="red"
                                onClick={async () => {
                                    if (sessionId && window.electronAPI?.clearSessionHistory) {
                                        await window.electronAPI.clearSessionHistory(sessionId);
                                    }
                                }}
                            >
                                <IconTrash size={18} />
                            </ActionIcon>
                        </Tooltip>

                        <Tooltip label="Open Face Window">
                            <ActionIcon
                                size={50}
                                radius="xl"
                                onClick={openCanvasWindow}
                                style={{ 
                                    background: '#12121a', 
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    overflow: 'hidden'
                                }}
                            >
                                <img src="./logos/app_logo.png.png" alt="Canvas" style={{ width: 40, height: 40, borderRadius: '50%' }} />
                            </ActionIcon>
                        </Tooltip>
                    </Group>

                    {cameraError && (
                        <Text size="xs" c="red">{cameraError}</Text>
                    )}
                </Stack>
            </Center>

            {/* Transcription Preview Modal */}
            <Modal
                opened={showPreviewModal}
                onClose={handlePreviewCancel}
                title={
                    <Group gap="sm">
                        <IconMicrophone size={20} color="#6366f1" />
                        <Text fw={600}>Review Transcription</Text>
                    </Group>
                }
                centered
                size="md"
                styles={{ 
                    content: { 
                        backgroundColor: '#12121a', 
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '20px'
                    }, 
                    header: { 
                        backgroundColor: '#12121a', 
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                        padding: '20px 24px'
                    },
                    body: { padding: '24px' },
                    close: { color: '#94a3b8' }
                }}
            >
                <Stack gap="md">
                    <Text size="sm" c="#94a3b8">Edit your message before sending:</Text>
                    <Textarea
                        value={transcriptionPreview}
                        onChange={(e) => setTranscriptionPreview(e.target.value)}
                        minRows={3}
                        maxRows={6}
                        autosize
                        styles={{
                            input: {
                                backgroundColor: '#1a1a24',
                                borderColor: 'rgba(255,255,255,0.1)',
                                color: '#f8fafc',
                                borderRadius: '12px',
                                fontSize: '15px',
                                '&:focus': { borderColor: '#6366f1' }
                            }
                        }}
                    />
                    <Group justify="flex-end" gap="sm">
                        <Button 
                            variant="subtle" 
                            color="gray" 
                            onClick={handlePreviewCancel}
                            leftSection={<IconX size={16} />}
                        >
                            Cancel
                        </Button>
                        <Button 
                            onClick={handlePreviewSend}
                            leftSection={<IconSend size={16} />}
                            disabled={!transcriptionPreview.trim()}
                            style={{ 
                                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                                border: 'none'
                            }}
                        >
                            Send
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Box>
    );
};

export default VoiceChatWindow;
