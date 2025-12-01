import React, { useState, useEffect, useRef } from 'react';
import Face2D, { DEFAULT_FACE_CONFIG } from './components/Face2D';

// Default expression presets
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
    'Worried': { warmth: 0.6, energy: 0.1, openness: 0.4, positivity: -0.6, color: '#fb923c' },
};

// Default visualizer configuration
const DEFAULT_VISUALIZER_CONFIG = {
    enabled: false,
    type: 'bars',
    
    // Color settings
    color: '#6366f1',
    gradientStart: '#ec4899',
    gradientEnd: '#06b6d4',
    useGradient: true,
    rainbowMode: false,
    rainbowSpeed: 1.0,
    opacity: 0.8,
    
    // Position & Boundaries
    position: 'bottom',
    offsetX: 0,
    offsetY: 0,
    width: 400,
    height: 150,
    rotation: 0,
    
    // Bar settings
    barCount: 32,
    barWidth: 8,
    barMinHeight: 4,
    barMaxHeight: 80,
    barGap: 3,
    barBorderRadius: 2,
    barSkew: 0,
    barTaper: 1.0,
    
    // Wave settings
    lineWidth: 3,
    waveAmplitude: 1.0,
    waveFrequency: 4,
    waveSpeed: 200,
    waveOffset: 0,
    waveMirrorGap: 40,
    
    // Circle settings
    circleRadius: 80,
    circleStartAngle: 0,
    circleEndAngle: 360,
    circleDirection: 1,
    circleBarLength: 1.0,
    
    // Dots settings
    dotMinSize: 4,
    dotMaxSize: 20,
    dotBounceHeight: 30,
    dotBounceSpeed: 150,
    
    // Effects
    glowEnabled: true,
    glowIntensity: 0.5,
    glowSpread: 15,
    shadowEnabled: false,
    shadowOffsetX: 2,
    shadowOffsetY: 2,
    shadowBlur: 4,
    shadowColor: '#000000',
    
    // Animation
    smoothing: 0.8,
    reactivity: 1.0,
    mirrorEffect: true,
    flipVertical: false,
    flipHorizontal: false,
    
    // Advanced
    scaleX: 1.0,
    scaleY: 1.0,
    perspective: 0,
    depthScale: 1.0,
};

const CanvasWindow = () => {
    const [sessionId, setSessionId] = useState(null);
    const [expressions, setExpressions] = useState(DEFAULT_EXPRESSIONS);
    const [faceConfig, setFaceConfig] = useState(DEFAULT_FACE_CONFIG);
    const [visualizerConfig, setVisualizerConfig] = useState(DEFAULT_VISUALIZER_CONFIG);
    const [visualizerData, setVisualizerData] = useState([]);
    
    const [warmth, setWarmth] = useState(0);
    const [energy, setEnergy] = useState(0);
    const [openness, setOpenness] = useState(0);
    const [positivity, setPositivity] = useState(0);
    const [intensity, setIntensity] = useState(0.7);
    
    const [isTalking, setIsTalking] = useState(false);
    const [isThinking, setIsThinking] = useState(false);
    const [mouthOpenness, setMouthOpenness] = useState(0);
    const [mouthShape, setMouthShape] = useState('neutral');
    const [lookAt, setLookAt] = useState({ x: 0, y: 0 });
    
    const [currentExpression, setCurrentExpression] = useState('Neutral');
    const [showPicker, setShowPicker] = useState(false);
    const [manualOverride, setManualOverride] = useState(false);
    
    const [userFacePosition, setUserFacePosition] = useState({ x: 0, y: 0, detected: false });
    const [faceColor, setFaceColor] = useState('#ffffff');
    
    const visualizerAnimationRef = useRef(null);
    const previousVisualizerDataRef = useRef([]);
    const visualizerCanvasRef = useRef(null);
    
    const animationRef = useRef(null);
    const targetMouthRef = useRef(0);
    const eyeMovementRef = useRef(null);

    const applyExpression = (name) => {
        const expr = expressions[name];
        if (!expr) return;
        
        setWarmth(expr.warmth);
        setEnergy(expr.energy);
        setOpenness(expr.openness);
        setPositivity(expr.positivity);
        setIsThinking(expr.isThinking || false);
        setCurrentExpression(name);
        setManualOverride(true);
        setShowPicker(false);
        
        setTimeout(() => setManualOverride(false), 10000);
    };

    const detectExpression = (w, e, o, p, thinking) => {
        if (thinking) return 'Thinking';
        
        let bestMatch = 'Neutral';
        let bestScore = 0;
        
        for (const [name, expr] of Object.entries(expressions)) {
            if (name === 'Thinking') continue;
            
            const wDiff = Math.abs(w - expr.warmth);
            const eDiff = Math.abs(e - expr.energy);
            const oDiff = Math.abs(o - expr.openness);
            const pDiff = Math.abs(p - expr.positivity);
            
            const totalDiff = wDiff + eDiff + oDiff + pDiff;
            const score = 4 - totalDiff;
            
            if (score > bestScore) {
                bestScore = score;
                bestMatch = name;
            }
        }
        
        return bestScore > 2 ? bestMatch : 'Neutral';
    };

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const sid = params.get('sessionId');
        if (sid) setSessionId(sid);

        const loadData = async () => {
            if (window.electronAPI?.getInitialState) {
                const state = await window.electronAPI.getInitialState();
                if (state.settings?.customExpressions) {
                    setExpressions({ ...DEFAULT_EXPRESSIONS, ...state.settings.customExpressions });
                }
                if (state.settings?.customFaceConfig) {
                    setFaceConfig({ ...DEFAULT_FACE_CONFIG, ...state.settings.customFaceConfig });
                }
                if (state.settings?.faceColor) {
                    setFaceColor(state.settings.faceColor);
                }
                if (state.settings?.visualizerConfig) {
                    setVisualizerConfig({ ...DEFAULT_VISUALIZER_CONFIG, ...state.settings.visualizerConfig });
                }
            }
        };
        loadData();

        const handleFaceControl = (data) => {
            if (data.userFacePosition !== undefined) {
                setUserFacePosition(data.userFacePosition);
            }
            
            if (data.isTalking !== undefined) setIsTalking(data.isTalking);
            if (data.isThinking !== undefined) setIsThinking(data.isThinking);
            if (data.mouthOpenness !== undefined) targetMouthRef.current = data.mouthOpenness;
            if (data.mouthShape) setMouthShape(data.mouthShape);
            if (data.lookAt) setLookAt(data.lookAt);
            
            // Process real audio frequency data for visualizer
            if (data.frequencyData !== undefined) {
                if (data.frequencyData.length === 0) {
                    // No audio - let the fade out effect handle it
                } else if (visualizerConfig.enabled) {
                    const barCount = visualizerConfig.barCount || 32;
                    const smoothing = visualizerConfig.smoothing || 0.8;
                    const prevData = previousVisualizerDataRef.current;
                    const newData = [];
                    
                    // Resample frequency data to match bar count
                    const step = data.frequencyData.length / barCount;
                    for (let i = 0; i < barCount; i++) {
                        const idx = Math.floor(i * step);
                        const rawValue = data.frequencyData[Math.min(idx, data.frequencyData.length - 1)] || 0;
                        
                        // Apply smoothing for fluid animation
                        const prevValue = prevData[i] || 0;
                        const smoothedValue = prevValue * smoothing + rawValue * (1 - smoothing);
                        newData.push(smoothedValue);
                    }
                    
                    previousVisualizerDataRef.current = newData;
                    setVisualizerData(newData);
                }
            }
            
            if (manualOverride && !data.isTalking) return;
            
            if (data.warmth !== undefined) setWarmth(data.warmth);
            if (data.energy !== undefined) setEnergy(data.energy);
            if (data.openness !== undefined) setOpenness(data.openness);
            if (data.positivity !== undefined) setPositivity(data.positivity);
            if (data.intensity !== undefined) setIntensity(data.intensity);
        };

        if (window.electronAPI?.onFaceControl) {
            window.electronAPI.onFaceControl(handleFaceControl);
        }

        const handleExpressionsUpdate = (data) => {
            if (data.customExpressions) {
                setExpressions({ ...DEFAULT_EXPRESSIONS, ...data.customExpressions });
            }
            if (data.customFaceConfig) {
                setFaceConfig({ ...DEFAULT_FACE_CONFIG, ...data.customFaceConfig });
            }
            if (data.visualizerConfig) {
                setVisualizerConfig({ ...DEFAULT_VISUALIZER_CONFIG, ...data.visualizerConfig });
            }
        };

        if (window.electronAPI?.onExpressionsUpdate) {
            window.electronAPI.onExpressionsUpdate(handleExpressionsUpdate);
        }

        // Listen for face color updates from AI
        const handleFaceColorUpdate = (data) => {
            if (data.color) {
                console.log('[Canvas] Face color updated to:', data.color);
                setFaceColor(data.color);
            }
        };

        if (window.electronAPI?.onFaceColorUpdate) {
            window.electronAPI.onFaceColorUpdate(handleFaceColorUpdate);
        }

        const animateMouth = () => {
            setMouthOpenness(prev => {
                const target = targetMouthRef.current;
                // Very fast response to match audio peaks - like a sound bar
                // Fast opening (0.6) and very fast closing (0.7) for snappy lip sync
                const speed = target < prev ? 0.7 : 0.6;
                const newValue = prev + (target - prev) * speed;
                // Snap to 0 when close to prevent lingering open mouth
                return newValue < 0.03 ? 0 : newValue;
            });
            animationRef.current = requestAnimationFrame(animateMouth);
        };
        animateMouth();

        const updateEyeMovement = () => {
            // Gentle, infrequent eye movement (3000-5000ms)
            const interval = 3000 + Math.random() * 2000;
            eyeMovementRef.current = setTimeout(() => {
                if (!isTalking && !isThinking) {
                    // Subtle movement - just slight glances
                    setLookAt({
                        x: (Math.random() - 0.5) * 0.3,
                        y: (Math.random() - 0.5) * 0.2
                    });
                }
                updateEyeMovement();
            }, interval);
        };
        updateEyeMovement();

        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
            if (eyeMovementRef.current) clearTimeout(eyeMovementRef.current);
            if (window.electronAPI?.removeFaceControlListener) {
                window.electronAPI.removeFaceControlListener();
            }
            if (window.electronAPI?.removeExpressionsUpdateListener) {
                window.electronAPI.removeExpressionsUpdateListener();
            }
            if (window.electronAPI?.removeFaceColorUpdateListener) {
                window.electronAPI.removeFaceColorUpdateListener();
            }
        };
    }, [manualOverride, isTalking, isThinking]);

    useEffect(() => {
        if (!manualOverride) {
            const detected = detectExpression(warmth, energy, openness, positivity, isThinking);
            setCurrentExpression(detected);
        }
    }, [warmth, energy, openness, positivity, isThinking, manualOverride]);

    // When not talking, clear visualizer and mouth
    useEffect(() => {
        if (!isTalking) {
            targetMouthRef.current = 0;
            // Smoothly fade out visualizer data
            const fadeOut = () => {
                const prevData = previousVisualizerDataRef.current;
                if (!prevData.length || prevData.every(v => v < 0.01)) {
                    setVisualizerData([]);
                    previousVisualizerDataRef.current = [];
                    return;
                }
                const newData = prevData.map(v => v * 0.85); // Decay factor
                previousVisualizerDataRef.current = newData;
                setVisualizerData(newData);
                requestAnimationFrame(fadeOut);
            };
            fadeOut();
        }
    }, [isTalking]);

    const currentColor = expressions[currentExpression]?.color || '#64748b';

    // Draw visualizer on canvas
    useEffect(() => {
        if (!visualizerConfig.enabled || visualizerData.length === 0) return;
        
        const canvas = visualizerCanvasRef.current;
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const cfg = visualizerConfig;
        
        const width = canvas.width;
        const height = canvas.height;
        const centerX = width / 2 + (cfg.offsetX || 0);
        const centerY = height / 2 + (cfg.offsetY || 0);
        
        ctx.clearRect(0, 0, width, height);
        
        // Apply global transforms
        ctx.save();
        ctx.globalAlpha = cfg.opacity;
        
        // Apply rotation if set
        if (cfg.rotation) {
            ctx.translate(width / 2, height / 2);
            ctx.rotate((cfg.rotation * Math.PI) / 180);
            ctx.translate(-width / 2, -height / 2);
        }
        
        // Apply scale transforms
        if (cfg.scaleX !== 1 || cfg.scaleY !== 1) {
            ctx.translate(width / 2, height / 2);
            ctx.scale(cfg.scaleX || 1, cfg.scaleY || 1);
            ctx.translate(-width / 2, -height / 2);
        }
        
        // Apply flip transforms
        if (cfg.flipHorizontal || cfg.flipVertical) {
            ctx.translate(width / 2, height / 2);
            ctx.scale(cfg.flipHorizontal ? -1 : 1, cfg.flipVertical ? -1 : 1);
            ctx.translate(-width / 2, -height / 2);
        }
        
        // Helper to get color at position (0-1)
        const getColorAt = (t, rainbowOffset = 0) => {
            if (cfg.rainbowMode) {
                const hue = ((t * 360) + (Date.now() / (1000 / (cfg.rainbowSpeed || 1))) + rainbowOffset) % 360;
                return `hsl(${hue}, 85%, 60%)`;
            } else if (cfg.useGradient) {
                // Smooth interpolation between colors
                const r1 = parseInt(cfg.gradientStart.slice(1, 3), 16);
                const g1 = parseInt(cfg.gradientStart.slice(3, 5), 16);
                const b1 = parseInt(cfg.gradientStart.slice(5, 7), 16);
                const r2 = parseInt(cfg.gradientEnd.slice(1, 3), 16);
                const g2 = parseInt(cfg.gradientEnd.slice(3, 5), 16);
                const b2 = parseInt(cfg.gradientEnd.slice(5, 7), 16);
                const r = Math.round(r1 + (r2 - r1) * t);
                const g = Math.round(g1 + (g2 - g1) * t);
                const b = Math.round(b1 + (b2 - b1) * t);
                return `rgb(${r}, ${g}, ${b})`;
            }
            return cfg.color;
        };
        
        // Create gradient for stroke
        const createStrokeGradient = (x1, y1, x2, y2) => {
            const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
            if (cfg.rainbowMode) {
                const offset = Date.now() / (1000 / (cfg.rainbowSpeed || 1));
                for (let i = 0; i <= 1; i += 0.1) {
                    gradient.addColorStop(i, `hsl(${(i * 360 + offset) % 360}, 85%, 55%)`);
                }
            } else if (cfg.useGradient) {
                gradient.addColorStop(0, cfg.gradientStart);
                gradient.addColorStop(1, cfg.gradientEnd);
            } else {
                gradient.addColorStop(0, cfg.color);
                gradient.addColorStop(1, cfg.color);
            }
            return gradient;
        };
        
        // Apply shadow/glow
        const applyEffects = (color) => {
            if (cfg.glowEnabled) {
                ctx.shadowColor = color;
                ctx.shadowBlur = (cfg.glowSpread || 15) * (cfg.glowIntensity || 0.5);
            }
            if (cfg.shadowEnabled) {
                ctx.shadowColor = cfg.shadowColor || '#000000';
                ctx.shadowOffsetX = cfg.shadowOffsetX || 2;
                ctx.shadowOffsetY = cfg.shadowOffsetY || 2;
                ctx.shadowBlur = cfg.shadowBlur || 4;
            }
        };
        
        const clearEffects = () => {
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
        };
        
        // Get data with mirror effect
        const getData = () => {
            if (cfg.mirrorEffect) {
                const half = visualizerData.slice(0, Math.floor(cfg.barCount / 2));
                return [...half.slice().reverse(), ...half];
            }
            return visualizerData;
        };
        
        const data = getData();
        const reactivity = cfg.reactivity || 1.0;
        
        if (cfg.type === 'wave') {
            // Smooth flowing wave visualization like audio waveform
            const vizWidth = cfg.width || 400;
            const startX = centerX - vizWidth / 2;
            const amplitude = cfg.waveAmplitude || 1.0;
            const speed = cfg.waveSpeed || 200;
            const mirrorGap = cfg.waveMirrorGap || 40;
            const lineW = cfg.lineWidth || 3;
            
            // Calculate average audio energy for wave modulation
            const avgEnergy = data.reduce((a, b) => a + b, 0) / data.length;
            const maxEnergy = Math.max(...data);
            
            // Number of points for smooth curve (more = smoother)
            const numPoints = 200;
            
            // Draw a smooth flowing wave
            const drawSmoothWave = (yOffset, direction, gradient) => {
                ctx.beginPath();
                ctx.strokeStyle = gradient;
                ctx.lineWidth = lineW;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                
                applyEffects(cfg.useGradient ? cfg.gradientStart : cfg.color);
                
                const time = Date.now() / speed;
                
                for (let i = 0; i <= numPoints; i++) {
                    const t = i / numPoints; // 0 to 1 across the width
                    const x = startX + t * vizWidth;
                    
                    // Sample audio data at this position
                    const dataIdx = Math.floor(t * (data.length - 1));
                    const audioValue = data[dataIdx] || 0;
                    
                    // Create smooth wave with multiple frequencies modulated by audio
                    // Primary wave
                    const wave1 = Math.sin(t * Math.PI * 8 + time * 3) * audioValue;
                    // Secondary wave for complexity
                    const wave2 = Math.sin(t * Math.PI * 12 + time * 2) * audioValue * 0.5;
                    // Tertiary wave for detail
                    const wave3 = Math.sin(t * Math.PI * 20 + time * 4) * audioValue * 0.25;
                    
                    // Combine waves with envelope based on position (taper at edges)
                    const envelope = Math.sin(t * Math.PI); // 0 at edges, 1 in middle
                    const combinedWave = (wave1 + wave2 + wave3) * envelope;
                    
                    // Scale by amplitude and max height
                    const waveHeight = combinedWave * (cfg.barMaxHeight || 80) * amplitude * reactivity * direction;
                    const y = centerY + yOffset + waveHeight;
                    
                    if (i === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                }
                
                ctx.stroke();
                clearEffects();
            };
            
            // Create horizontal gradient across the wave
            const waveGradient = ctx.createLinearGradient(startX, centerY, startX + vizWidth, centerY);
            if (cfg.rainbowMode) {
                const offset = Date.now() / (1000 / (cfg.rainbowSpeed || 1));
                waveGradient.addColorStop(0, `hsl(${(0 + offset) % 360}, 85%, 55%)`);
                waveGradient.addColorStop(0.25, `hsl(${(90 + offset) % 360}, 85%, 55%)`);
                waveGradient.addColorStop(0.5, `hsl(${(180 + offset) % 360}, 85%, 55%)`);
                waveGradient.addColorStop(0.75, `hsl(${(270 + offset) % 360}, 85%, 55%)`);
                waveGradient.addColorStop(1, `hsl(${(360 + offset) % 360}, 85%, 55%)`);
            } else if (cfg.useGradient) {
                waveGradient.addColorStop(0, cfg.gradientStart);
                waveGradient.addColorStop(0.5, cfg.gradientEnd);
                waveGradient.addColorStop(1, cfg.gradientStart);
            } else {
                waveGradient.addColorStop(0, cfg.color);
                waveGradient.addColorStop(1, cfg.color);
            }
            
            // Draw two mirrored waves
            drawSmoothWave(-mirrorGap / 2, -1, waveGradient); // Top wave (inverted)
            drawSmoothWave(mirrorGap / 2, 1, waveGradient);   // Bottom wave
            
        } else if (cfg.type === 'circle') {
            const radius = cfg.circleRadius || 80;
            const startAngle = ((cfg.circleStartAngle || 0) - 90) * Math.PI / 180;
            const endAngle = ((cfg.circleEndAngle || 360) - 90) * Math.PI / 180;
            const angleRange = endAngle - startAngle;
            const direction = cfg.circleDirection || 1;
            const barLength = cfg.circleBarLength || 1.0;
            const barW = cfg.barWidth || Math.max(2, (2 * Math.PI * radius) / cfg.barCount - (cfg.barGap || 3));
            
            for (let i = 0; i < cfg.barCount; i++) {
                const t = i / cfg.barCount;
                const angle = startAngle + (direction * t * angleRange);
                const value = data[i % data.length] * reactivity;
                const barHeight = (cfg.barMinHeight || 4) + value * ((cfg.barMaxHeight || 80) - (cfg.barMinHeight || 4)) * barLength;
                
                const barColor = getColorAt(t);
                
                const innerX = centerX + Math.cos(angle) * radius;
                const innerY = centerY + Math.sin(angle) * radius;
                const outerX = centerX + Math.cos(angle) * (radius + barHeight);
                const outerY = centerY + Math.sin(angle) * (radius + barHeight);
                
                ctx.beginPath();
                ctx.strokeStyle = barColor;
                ctx.lineWidth = barW;
                ctx.lineCap = cfg.barBorderRadius > 0 ? 'round' : 'butt';
                
                applyEffects(barColor);
                
                ctx.moveTo(innerX, innerY);
                ctx.lineTo(outerX, outerY);
                ctx.stroke();
            }
            clearEffects();
            
        } else if (cfg.type === 'bars' || cfg.type === 'mirror') {
            const vizWidth = cfg.width || 400;
            const barW = cfg.barWidth || Math.max(3, (vizWidth / data.length) - (cfg.barGap || 3));
            const totalBarWidth = data.length * barW + (data.length - 1) * (cfg.barGap || 3);
            const startX = centerX - totalBarWidth / 2;
            const skew = (cfg.barSkew || 0) * Math.PI / 180;
            const taper = cfg.barTaper || 1.0;
            
            for (let i = 0; i < data.length; i++) {
                const value = data[i] * reactivity;
                const barHeight = (cfg.barMinHeight || 4) + value * ((cfg.barMaxHeight || 80) - (cfg.barMinHeight || 4));
                const x = startX + i * (barW + (cfg.barGap || 3));
                const y = centerY + (cfg.barMaxHeight || 80) / 2 - barHeight;
                
                const t = i / data.length;
                let barColor;
                if (cfg.rainbowMode || cfg.useGradient) {
                    const gradient = ctx.createLinearGradient(x, y, x, y + barHeight);
                    gradient.addColorStop(0, getColorAt(t));
                    gradient.addColorStop(1, getColorAt(t + 0.3));
                    barColor = gradient;
                } else {
                    barColor = cfg.color;
                }
                
                ctx.fillStyle = barColor;
                applyEffects(typeof barColor === 'string' ? barColor : cfg.gradientStart || cfg.color);
                
                // Apply skew and taper
                if (skew !== 0 || taper !== 1.0) {
                    ctx.save();
                    ctx.transform(1, 0, Math.tan(skew), 1, 0, 0);
                    const topWidth = barW * taper;
                    const bottomWidth = barW;
                    ctx.beginPath();
                    ctx.moveTo(x + (barW - topWidth) / 2, y);
                    ctx.lineTo(x + (barW + topWidth) / 2, y);
                    ctx.lineTo(x + bottomWidth, y + barHeight);
                    ctx.lineTo(x, y + barHeight);
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                } else {
                    ctx.beginPath();
                    ctx.roundRect(x, y, barW, barHeight, cfg.barBorderRadius || 0);
                    ctx.fill();
                }
            }
            clearEffects();
            
        } else if (cfg.type === 'dots') {
            const vizWidth = cfg.width || 400;
            const spacing = vizWidth / data.length;
            const startX = centerX - vizWidth / 2;
            const minSize = cfg.dotMinSize || 4;
            const maxSize = cfg.dotMaxSize || 20;
            const bounceHeight = cfg.dotBounceHeight || 30;
            const bounceSpeed = cfg.dotBounceSpeed || 150;
            
            for (let i = 0; i < data.length; i++) {
                const value = data[i] * reactivity;
                const dotSize = minSize + value * (maxSize - minSize);
                const x = startX + i * spacing + spacing / 2;
                const bounce = Math.sin(Date.now() / bounceSpeed + i * 0.3) * value * bounceHeight;
                const y = centerY - bounce;
                
                const t = i / data.length;
                const dotColor = getColorAt(t);
                
                ctx.fillStyle = dotColor;
                applyEffects(dotColor);
                
                ctx.beginPath();
                ctx.arc(x, y, dotSize, 0, Math.PI * 2);
                ctx.fill();
            }
            clearEffects();
        }
        
        ctx.restore();
    }, [visualizerData, visualizerConfig, isTalking]);

    // Render the audio visualizer canvas
    const renderVisualizer = () => {
        if (!visualizerConfig.enabled) return null;
        
        const cfg = visualizerConfig;
        const canvasWidth = cfg.width || 400;
        const canvasHeight = cfg.height || 150;
        
        let positionStyle = {};
        const baseTransforms = [];
        
        if (cfg.offsetX) baseTransforms.push(`translateX(${cfg.offsetX}px)`);
        if (cfg.offsetY) baseTransforms.push(`translateY(${cfg.offsetY}px)`);
        
        switch (cfg.position) {
            case 'bottom':
                positionStyle = { bottom: 30, left: '50%', transform: `translateX(-50%) ${baseTransforms.join(' ')}` };
                break;
            case 'top':
                positionStyle = { top: 30, left: '50%', transform: `translateX(-50%) ${baseTransforms.join(' ')}` };
                break;
            case 'center':
                positionStyle = { top: '50%', left: '50%', transform: `translate(-50%, -50%) ${baseTransforms.join(' ')}` };
                break;
            case 'behind':
                positionStyle = { top: '50%', left: '50%', transform: `translate(-50%, -50%) ${baseTransforms.join(' ')}`, zIndex: 0 };
                break;
            default:
                positionStyle = { bottom: 30, left: '50%', transform: `translateX(-50%) ${baseTransforms.join(' ')}` };
        }
        
        return (
            <canvas
                ref={visualizerCanvasRef}
                width={canvasWidth}
                height={canvasHeight}
                style={{
                    position: 'absolute',
                    pointerEvents: 'none',
                    zIndex: cfg.position === 'behind' ? 0 : 10,
                    ...positionStyle,
                }}
            />
        );
    };

    return (
        <div style={{ 
            width: '100vw', 
            height: '100vh', 
            background: 'linear-gradient(180deg, #0a0a0f 0%, #0d0d14 50%, #0a0a0f 100%)', 
            overflow: 'hidden',
            position: 'relative'
        }}>
            {/* Subtle background glow */}
            <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '600px',
                height: '600px',
                background: `radial-gradient(circle, ${currentColor}10 0%, transparent 70%)`,
                pointerEvents: 'none',
                transition: 'all 0.5s ease'
            }} />

            <Face2D 
                warmth={warmth}
                energy={energy}
                openness={openness}
                positivity={positivity}
                intensity={intensity}
                isTalking={isTalking}
                isThinking={isThinking}
                mouthOpenness={mouthOpenness}
                mouthShape={mouthShape}
                lookAt={lookAt}
                faceConfig={faceConfig}
                userFacePosition={userFacePosition}
                faceColor={faceColor}
            />
            
            {/* Audio Visualizer */}
            {renderVisualizer()}
            
            {/* Expression Picker Button */}
            <div 
                onClick={() => setShowPicker(!showPicker)}
                style={{
                    position: 'absolute',
                    bottom: 24,
                    right: 24,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '14px 22px',
                    borderRadius: 50,
                    background: 'linear-gradient(135deg, rgba(18, 18, 26, 0.9) 0%, rgba(26, 26, 36, 0.9) 100%)',
                    backdropFilter: 'blur(20px)',
                    border: `1px solid ${currentColor}40`,
                    boxShadow: `0 4px 30px ${currentColor}20, 0 0 60px ${currentColor}10`,
                    cursor: 'pointer',
                    transition: 'all 0.25s ease',
                    userSelect: 'none'
                }}
                onMouseEnter={e => {
                    e.currentTarget.style.transform = 'scale(1.03) translateY(-2px)';
                    e.currentTarget.style.boxShadow = `0 8px 40px ${currentColor}30, 0 0 80px ${currentColor}15`;
                }}
                onMouseLeave={e => {
                    e.currentTarget.style.transform = 'scale(1) translateY(0)';
                    e.currentTarget.style.boxShadow = `0 4px 30px ${currentColor}20, 0 0 60px ${currentColor}10`;
                }}
            >
                <div style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    backgroundColor: currentColor,
                    boxShadow: `0 0 15px ${currentColor}`,
                    animation: isThinking ? 'pulse 1.5s ease-in-out infinite' : 'none'
                }} />
                <span style={{
                    color: '#f8fafc',
                    fontFamily: "'Outfit', -apple-system, sans-serif",
                    fontSize: 13,
                    fontWeight: 600,
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase'
                }}>
                    {currentExpression}
                </span>
                <span style={{ color: '#64748b', fontSize: 10 }}>▼</span>
            </div>

            {/* Expression Picker Dropdown */}
            {showPicker && (
                <div style={{
                    position: 'absolute',
                    bottom: 90,
                    right: 24,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 8,
                    padding: 16,
                    borderRadius: 20,
                    background: 'linear-gradient(135deg, rgba(18, 18, 26, 0.95) 0%, rgba(26, 26, 36, 0.95) 100%)',
                    backdropFilter: 'blur(30px)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                    zIndex: 100
                }}>
                    {Object.entries(expressions).map(([name, expr]) => (
                        <div
                            key={name}
                            onClick={() => applyExpression(name)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                padding: '12px 16px',
                                borderRadius: 12,
                                backgroundColor: currentExpression === name ? `${expr.color}20` : 'rgba(255,255,255,0.03)',
                                border: currentExpression === name ? `1px solid ${expr.color}60` : '1px solid transparent',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={e => {
                                if (currentExpression !== name) {
                                    e.currentTarget.style.backgroundColor = `${expr.color}15`;
                                    e.currentTarget.style.borderColor = `${expr.color}30`;
                                }
                            }}
                            onMouseLeave={e => {
                                if (currentExpression !== name) {
                                    e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)';
                                    e.currentTarget.style.borderColor = 'transparent';
                                }
                            }}
                        >
                            <div style={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                backgroundColor: expr.color,
                                boxShadow: `0 0 10px ${expr.color}`
                            }} />
                            <span style={{
                                color: currentExpression === name ? '#f8fafc' : '#94a3b8',
                                fontFamily: "'Outfit', sans-serif",
                                fontSize: 12,
                                fontWeight: 500
                            }}>
                                {name}
                            </span>
                        </div>
                    ))}
                </div>
            )}
            
            {/* Click outside to close picker */}
            {showPicker && (
                <div 
                    onClick={() => setShowPicker(false)}
                    style={{
                        position: 'absolute',
                        top: 0, left: 0, right: 0, bottom: 0,
                        zIndex: 99
                    }}
                />
            )}
            
            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.5; transform: scale(1.4); }
                }
            `}</style>
        </div>
    );
};

export default CanvasWindow;
