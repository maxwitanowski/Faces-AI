import { useRef, useState, useCallback, useEffect } from 'react';

/**
 * useVision hook - Camera capture with YOLO-powered face and object tracking
 * Uses Python YOLO server for accurate detection, falls back to browser APIs
 */
export const useVision = () => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [isTracking, setIsTracking] = useState(false);
    const [cameraError, setCameraError] = useState(null);
    const streamRef = useRef(null);
    const trackingIntervalRef = useRef(null);
    
    // Face position state
    const [facePosition, setFacePosition] = useState({ x: 0, y: 0, detected: false });
    const smoothedPositionRef = useRef({ x: 0, y: 0 });
    
    // Object tracking state
    const [trackedObject, setTrackedObject] = useState(null);
    const trackedObjectRef = useRef(null); // Ref to avoid re-creating callbacks
    const [objectPosition, setObjectPosition] = useState({ x: 0, y: 0, detected: false });
    const [allDetections, setAllDetections] = useState([]);
    
    // Refs for stable tracking loop
    const isTrackingRef = useRef(false);
    const yoloReadyRef = useRef(false);
    
    // YOLO server state
    const [yoloReady, setYoloReady] = useState(false);
    const [yoloStarting, setYoloStarting] = useState(false);
    
    // Callbacks
    const onFacePositionChangeRef = useRef(null);
    const onObjectPositionChangeRef = useRef(null);
    
    const SMOOTHING_FACTOR = 0.25;
    const TRACKING_INTERVAL = 100; // 10 FPS for YOLO (good balance of speed/accuracy)

    // Start YOLO server
    const startYoloServer = useCallback(async () => {
        if (yoloReady) return true;
        if (yoloStarting) return false;
        
        setYoloStarting(true);
        console.log('[Vision] Starting YOLO server...');
        
        try {
            if (window.electronAPI?.yoloStart) {
                const result = await window.electronAPI.yoloStart();
                console.log('[Vision] YOLO start result:', result);
                
                if (result.success) {
                    // Wait for server to fully initialize with retries
                    for (let i = 0; i < 5; i++) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        
                        try {
                            const health = await window.electronAPI.yoloHealth();
                            console.log('[Vision] YOLO health check:', health);
                            
                            if (health.status === 'ok' || health.model_loaded) {
                                console.log('[Vision] YOLO server ready!');
                                setYoloReady(true);
                                setYoloStarting(false);
                                return true;
                            }
                        } catch (e) {
                            console.log('[Vision] Health check attempt', i + 1, 'failed');
                        }
                    }
                    
                    // Even if health check fails, assume it's working if start succeeded
                    console.log('[Vision] YOLO assumed ready after start');
                    setYoloReady(true);
                    setYoloStarting(false);
                    return true;
                }
            }
        } catch (e) {
            console.warn('[Vision] Failed to start YOLO:', e);
        }
        
        setYoloStarting(false);
        return false;
    }, [yoloReady, yoloStarting]);

    // Capture current frame as base64
    const captureFrame = useCallback(() => {
        if (!videoRef.current || !isTracking) return null;
        
        const video = videoRef.current;
        if (video.readyState < 2) return null;
        
        if (!canvasRef.current) {
            canvasRef.current = document.createElement('canvas');
        }
        const canvas = canvasRef.current;
        
        // Use moderate resolution for YOLO (balance speed/accuracy)
        canvas.width = 640;
        canvas.height = 480;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        return canvas.toDataURL('image/jpeg', 0.8);
    }, [isTracking]);

    // Track with YOLO - use refs to avoid dependency issues
    const trackWithYolo = useCallback(async () => {
        if (!isTrackingRef.current || !yoloReadyRef.current) {
            return;
        }
        
        const frame = captureFrame();
        if (!frame) {
            return;
        }
        
        try {
            // Use auto tracking (face or tracked object)
            const result = await window.electronAPI.yoloTrackAuto(frame);
            
            if (result.success) {
                // Log occasionally for debugging
                if (Math.random() < 0.1) {
                    console.log('[Vision] YOLO result:', result.mode, result.position?.detected, 
                        result.position?.x?.toFixed(2), result.position?.y?.toFixed(2));
                }
                const pos = result.position;
                
                if (pos.detected) {
                    // Smooth the position
                    const smoothed = smoothedPositionRef.current;
                    // Invert X because camera is mirrored
                    smoothed.x = smoothed.x + (-pos.x - smoothed.x) * SMOOTHING_FACTOR;
                    smoothed.y = smoothed.y + (pos.y - smoothed.y) * SMOOTHING_FACTOR;
                    
                    const newPosition = {
                        x: smoothed.x,
                        y: smoothed.y,
                        detected: true,
                        distance: pos.distance || 'medium',
                        confidence: pos.confidence,
                        bbox: pos.bbox
                    };
                    
                    if (result.mode === 'face') {
                        setFacePosition(newPosition);
                        if (onFacePositionChangeRef.current) {
                            onFacePositionChangeRef.current(newPosition);
                        }
                    } else {
                        setObjectPosition(newPosition);
                        if (onObjectPositionChangeRef.current) {
                            onObjectPositionChangeRef.current(newPosition);
                        }
                        // Also update face position for eye tracking
                        setFacePosition(newPosition);
                        if (onFacePositionChangeRef.current) {
                            onFacePositionChangeRef.current(newPosition);
                        }
                    }
                } else {
                    // Not detected - gradually return to center
                    const smoothed = smoothedPositionRef.current;
                    smoothed.x *= 0.9;
                    smoothed.y *= 0.9;
                    
                    const newPosition = {
                        x: smoothed.x,
                        y: smoothed.y,
                        detected: false
                    };
                    
                    setFacePosition(newPosition);
                    setObjectPosition(prev => ({ ...prev, detected: false }));
                    
                    if (onFacePositionChangeRef.current) {
                        onFacePositionChangeRef.current(newPosition);
                    }
                }
                
                // Update tracked object name if changed (use ref to avoid re-render loops)
                if (result.tracking !== trackedObjectRef.current) {
                    trackedObjectRef.current = result.tracking;
                    setTrackedObject(result.tracking);
                }
            }
        } catch (e) {
            console.warn('[Vision] YOLO tracking error:', e);
        }
    }, [captureFrame]); // Only depend on captureFrame, use refs for everything else

    // Start camera and tracking
    const startTracking = useCallback(async (videoElement, callbacks = {}) => {
        try {
            setCameraError(null);
            videoRef.current = videoElement;
            onFacePositionChangeRef.current = callbacks.onFacePositionChange;
            onObjectPositionChangeRef.current = callbacks.onObjectPositionChange;

            // Start YOLO server
            const yoloStarted = await startYoloServer();
            if (!yoloStarted) {
                console.warn('[Vision] YOLO not available, tracking may be limited');
            }

            // Request camera access
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280, min: 640 },
                    height: { ideal: 720, min: 480 },
                    facingMode: 'user'
                }
            });
            
            streamRef.current = stream;
            videoElement.srcObject = stream;
            await videoElement.play();
            
            // Reset state
            smoothedPositionRef.current = { x: 0, y: 0 };
            
            setIsTracking(true);
            console.log('[Vision] Camera started with YOLO tracking');
            return true;
        } catch (error) {
            console.error('Camera error:', error);
            setCameraError(error.message);
            setIsTracking(false);
            return false;
        }
    }, [startYoloServer]);

    // Keep refs in sync with state
    useEffect(() => {
        isTrackingRef.current = isTracking;
    }, [isTracking]);
    
    useEffect(() => {
        yoloReadyRef.current = yoloReady;
    }, [yoloReady]);

    // Start tracking loop when ready - only depends on state, not callback
    useEffect(() => {
        console.log('[Vision] Tracking loop check - isTracking:', isTracking, 'yoloReady:', yoloReady);
        
        if (isTracking && yoloReady) {
            console.log('[Vision] Starting YOLO tracking loop at', TRACKING_INTERVAL, 'ms interval');
            
            // Only start if not already running
            if (!trackingIntervalRef.current) {
                // Run immediately once
                trackWithYolo();
                
                // Then run on interval
                trackingIntervalRef.current = setInterval(trackWithYolo, TRACKING_INTERVAL);
            }
            
            return () => {
                console.log('[Vision] Stopping YOLO tracking loop');
                if (trackingIntervalRef.current) {
                    clearInterval(trackingIntervalRef.current);
                    trackingIntervalRef.current = null;
                }
            };
        }
    }, [isTracking, yoloReady]); // Removed trackWithYolo from dependencies!

    // Stop camera
    const stopTracking = useCallback(() => {
        if (trackingIntervalRef.current) {
            clearInterval(trackingIntervalRef.current);
            trackingIntervalRef.current = null;
        }
        
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        
        setIsTracking(false);
        setFacePosition({ x: 0, y: 0, detected: false });
        setObjectPosition({ x: 0, y: 0, detected: false });
        setTrackedObject(null);
        smoothedPositionRef.current = { x: 0, y: 0 };
        console.log('[Vision] Camera stopped');
    }, []);

    // Set object to track (AI can call this)
    const trackObject = useCallback(async (objectName) => {
        console.log(`[Vision] Setting tracking target: ${objectName}`);
        trackedObjectRef.current = objectName;
        setTrackedObject(objectName);
        
        if (window.electronAPI?.yoloSetTracking) {
            const result = await window.electronAPI.yoloSetTracking(objectName);
            console.log('[Vision] YOLO tracking set:', result);
            return result.success;
        }
        return false;
    }, []);

    // Stop tracking object (go back to face)
    const stopTrackingObject = useCallback(async () => {
        console.log('[Vision] Clearing object tracking');
        trackedObjectRef.current = null;
        setTrackedObject(null);
        setObjectPosition({ x: 0, y: 0, detected: false });
        
        if (window.electronAPI?.yoloClearTracking) {
            await window.electronAPI.yoloClearTracking();
        }
    }, []);

    // Detect all objects in current frame
    const detectAllObjects = useCallback(async () => {
        const frame = captureFrame();
        if (!frame) return [];
        
        try {
            if (window.electronAPI?.yoloDetectAll) {
                const result = await window.electronAPI.yoloDetectAll(frame);
                if (result.success) {
                    setAllDetections(result.detections);
                    return result.detections;
                }
            }
        } catch (e) {
            console.warn('[Vision] Detection error:', e);
        }
        return [];
    }, [captureFrame]);

    // Get list of trackable classes
    const getTrackableClasses = useCallback(async () => {
        try {
            if (window.electronAPI?.yoloGetClasses) {
                const result = await window.electronAPI.yoloGetClasses();
                return result.classes || [];
            }
        } catch (e) {
            console.warn('[Vision] Failed to get classes:', e);
        }
        return [];
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopTracking();
        };
    }, [stopTracking]);

    return {
        // State
        isTracking,
        cameraError,
        facePosition,
        objectPosition,
        trackedObject,
        allDetections,
        yoloReady,
        yoloStarting,
        
        // Actions
        startTracking,
        stopTracking,
        captureFrame,
        trackObject,
        stopTrackingObject,
        detectAllObjects,
        getTrackableClasses,
        startYoloServer,
        
        // Refs
        videoRef
    };
};

export default useVision;
