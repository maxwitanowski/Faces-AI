import React, { useState, useEffect, useRef } from 'react';
import Face2D, { DEFAULT_FACE_CONFIG } from './components/Face2D';

// Default expressions
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
export const DEFAULT_VISUALIZER_CONFIG = {
    enabled: false,
    type: 'bars', // 'bars', 'wave', 'circle', 'dots', 'mirror'
    
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
    offsetX: 0,           // Horizontal offset from center
    offsetY: 0,           // Vertical offset from position
    width: 400,           // Total width of visualizer
    height: 150,          // Total height boundary
    rotation: 0,          // Rotation in degrees
    
    // Bar settings
    barCount: 32,
    barWidth: 8,          // Individual bar width (0 = auto)
    barMinHeight: 4,
    barMaxHeight: 80,
    barGap: 3,
    barBorderRadius: 2,
    barSkew: 0,           // Skew angle for bars
    barTaper: 1.0,        // 1.0 = uniform, <1 = taper to top, >1 = taper to bottom
    
    // Wave settings
    lineWidth: 3,
    waveAmplitude: 1.0,
    waveFrequency: 4,     // Number of wave cycles
    waveSpeed: 200,       // Animation speed (ms)
    waveOffset: 0,        // Phase offset
    waveMirrorGap: 40,    // Gap between mirrored waves
    
    // Circle settings
    circleRadius: 80,
    circleStartAngle: 0,  // Start angle in degrees
    circleEndAngle: 360,  // End angle (360 = full circle)
    circleDirection: 1,   // 1 = clockwise, -1 = counter-clockwise
    circleBarLength: 1.0, // Multiplier for bar length
    
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
    reactivity: 1.0,      // How much it reacts to audio
    mirrorEffect: true,
    flipVertical: false,
    flipHorizontal: false,
    
    // Advanced
    scaleX: 1.0,
    scaleY: 1.0,
    perspective: 0,       // 3D perspective effect
    depthScale: 1.0,      // Scale based on position (for 3D effect)
};

const FaceEditor = () => {
    const [expressions, setExpressions] = useState(DEFAULT_EXPRESSIONS);
    const [selectedExpression, setSelectedExpression] = useState('Neutral');
    const [currentValues, setCurrentValues] = useState(DEFAULT_EXPRESSIONS['Neutral']);
    const [faceConfig, setFaceConfig] = useState(DEFAULT_FACE_CONFIG);
    const [visualizerConfig, setVisualizerConfig] = useState(DEFAULT_VISUALIZER_CONFIG);
    const [hasChanges, setHasChanges] = useState(false);
    const [activeTab, setActiveTab] = useState('expression');
    const [previewTalking, setPreviewTalking] = useState(false);
    const [previewMouthOpen, setPreviewMouthOpen] = useState(0);
    const [previewVisualizerData, setPreviewVisualizerData] = useState([]);
    const previewCanvasRef = useRef(null);

    useEffect(() => {
        const loadData = async () => {
            if (window.electronAPI?.getInitialState) {
                const state = await window.electronAPI.getInitialState();
                if (state.settings?.customExpressions) {
                    const loaded = { ...DEFAULT_EXPRESSIONS, ...state.settings.customExpressions };
                    setExpressions(loaded);
                    if (loaded[selectedExpression]) {
                        setCurrentValues(loaded[selectedExpression]);
                    }
                }
                if (state.settings?.customFaceConfig) {
                    setFaceConfig({ ...DEFAULT_FACE_CONFIG, ...state.settings.customFaceConfig });
                }
                if (state.settings?.visualizerConfig) {
                    setVisualizerConfig({ ...DEFAULT_VISUALIZER_CONFIG, ...state.settings.visualizerConfig });
                }
            }
        };
        loadData();
    }, []);

    useEffect(() => {
        setCurrentValues(expressions[selectedExpression] || DEFAULT_EXPRESSIONS['Neutral']);
        setHasChanges(false);
    }, [selectedExpression]);

    useEffect(() => {
        if (!previewTalking) {
            setPreviewMouthOpen(0);
            // Smooth fade out for visualizer
            const fadeOut = () => {
                setPreviewVisualizerData(prev => {
                    if (!prev.length || prev.every(v => v < 0.01)) {
                        return [];
                    }
                    return prev.map(v => v * 0.85);
                });
            };
            const fadeInterval = setInterval(fadeOut, 30);
            return () => clearInterval(fadeInterval);
        }
        
        // Simulate realistic audio frequency data when talking
        const interval = setInterval(() => {
            // Simulate speech patterns - varying intensity
            const speechIntensity = 0.3 + Math.sin(Date.now() / 500) * 0.3 + Math.random() * 0.2;
            setPreviewMouthOpen(speechIntensity * 0.8);
            
            // Generate frequency-like data that simulates real voice
            const data = [];
            const barCount = visualizerConfig.barCount || 32;
            for (let i = 0; i < barCount; i++) {
                // Voice frequencies are stronger in lower-mid range
                const freqPosition = i / barCount;
                // Simulate voice spectrum: strong in 100-3000Hz range
                let freqWeight;
                if (freqPosition < 0.1) {
                    freqWeight = 0.3; // Low bass
                } else if (freqPosition < 0.4) {
                    freqWeight = 1.0; // Voice fundamentals (strongest)
                } else if (freqPosition < 0.7) {
                    freqWeight = 0.6; // Upper harmonics
                } else {
                    freqWeight = 0.2; // High frequencies (weakest)
                }
                
                // Add time-based variation and randomness
                const timeVar = Math.sin((Date.now() / 150 + i * 0.5)) * 0.3;
                const random = Math.random() * 0.2;
                const value = Math.max(0, Math.min(1, (speechIntensity + timeVar + random) * freqWeight));
                data.push(value);
            }
            setPreviewVisualizerData(data);
        }, 50);
        return () => clearInterval(interval);
    }, [previewTalking, visualizerConfig.barCount]);

    const handleValueChange = (key, value) => {
        const newValues = { ...currentValues, [key]: value };
        setCurrentValues(newValues);
        setHasChanges(true);
    };

    const handleConfigChange = (key, value) => {
        const newConfig = { ...faceConfig, [key]: value };
        setFaceConfig(newConfig);
        setHasChanges(true);
    };

    const handleVisualizerChange = (key, value) => {
        const newConfig = { ...visualizerConfig, [key]: value };
        setVisualizerConfig(newConfig);
        setHasChanges(true);
    };

    const handleSave = async () => {
        if (activeTab === 'expression') {
            const newExpressions = { ...expressions, [selectedExpression]: currentValues };
            setExpressions(newExpressions);
            setHasChanges(false);
            if (window.electronAPI?.saveSettings) {
                await window.electronAPI.saveSettings({ customExpressions: newExpressions });
            }
            if (window.electronAPI?.broadcastExpressionsUpdate) {
                window.electronAPI.broadcastExpressionsUpdate({ customExpressions: newExpressions });
            }
        } else if (activeTab === 'face') {
            setHasChanges(false);
            if (window.electronAPI?.saveSettings) {
                await window.electronAPI.saveSettings({ customFaceConfig: faceConfig });
            }
            if (window.electronAPI?.broadcastExpressionsUpdate) {
                window.electronAPI.broadcastExpressionsUpdate({ customFaceConfig: faceConfig });
            }
        } else if (activeTab === 'visualizer') {
            setHasChanges(false);
            if (window.electronAPI?.saveSettings) {
                await window.electronAPI.saveSettings({ visualizerConfig: visualizerConfig });
            }
            if (window.electronAPI?.broadcastExpressionsUpdate) {
                window.electronAPI.broadcastExpressionsUpdate({ visualizerConfig: visualizerConfig });
            }
        }
    };

    const handleReset = () => {
        if (activeTab === 'expression') {
            setCurrentValues(DEFAULT_EXPRESSIONS[selectedExpression] || DEFAULT_EXPRESSIONS['Neutral']);
        } else if (activeTab === 'face') {
            setFaceConfig({ ...DEFAULT_FACE_CONFIG });
        } else if (activeTab === 'visualizer') {
            setVisualizerConfig({ ...DEFAULT_VISUALIZER_CONFIG });
        }
        setHasChanges(true);
    };

    const handleResetAll = async () => {
        const msgs = {
            expression: 'Reset ALL expressions to defaults?',
            face: 'Reset face configuration to defaults?',
            visualizer: 'Reset visualizer settings to defaults?'
        };
        if (confirm(msgs[activeTab])) {
            if (activeTab === 'expression') {
                setExpressions({ ...DEFAULT_EXPRESSIONS });
                setCurrentValues(DEFAULT_EXPRESSIONS[selectedExpression] || DEFAULT_EXPRESSIONS['Neutral']);
                setHasChanges(false);
                if (window.electronAPI?.saveSettings) {
                    await window.electronAPI.saveSettings({ customExpressions: null });
                }
            } else if (activeTab === 'face') {
                setFaceConfig({ ...DEFAULT_FACE_CONFIG });
                setHasChanges(false);
                if (window.electronAPI?.saveSettings) {
                    await window.electronAPI.saveSettings({ customFaceConfig: null });
                }
            } else if (activeTab === 'visualizer') {
                setVisualizerConfig({ ...DEFAULT_VISUALIZER_CONFIG });
                setHasChanges(false);
                if (window.electronAPI?.saveSettings) {
                    await window.electronAPI.saveSettings({ visualizerConfig: null });
                }
            }
        }
    };

    const handleExport = () => {
        const data = JSON.stringify({ expressions, faceConfig, visualizerConfig }, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'face-settings.json';
        a.click();
        URL.revokeObjectURL(url);
    };

    // Draw visualizer preview on canvas
    useEffect(() => {
        if (!visualizerConfig.enabled || !previewTalking || previewVisualizerData.length === 0) return;
        
        const canvas = previewCanvasRef.current;
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const cfg = visualizerConfig;
        
        const width = canvas.width;
        const height = canvas.height;
        const centerX = width / 2;
        const centerY = height / 2;
        
        ctx.clearRect(0, 0, width, height);
        ctx.save();
        ctx.globalAlpha = cfg.opacity || 0.8;
        
        // Apply rotation if set
        if (cfg.rotation) {
            ctx.translate(width / 2, height / 2);
            ctx.rotate((cfg.rotation * Math.PI) / 180);
            ctx.translate(-width / 2, -height / 2);
        }
        
        // Helper to get color at position
        const getColorAt = (t) => {
            if (cfg.rainbowMode) {
                const hue = ((t * 360) + (Date.now() / (1000 / (cfg.rainbowSpeed || 1)))) % 360;
                return `hsl(${hue}, 85%, 60%)`;
            } else if (cfg.useGradient) {
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
        
        // Apply effects
        const applyEffects = (color) => {
            if (cfg.glowEnabled) {
                ctx.shadowColor = color;
                ctx.shadowBlur = (cfg.glowSpread || 15) * (cfg.glowIntensity || 0.5) * 0.7;
            }
        };
        
        const clearEffects = () => {
            ctx.shadowBlur = 0;
        };
        
        // Get data with mirror effect
        const getData = () => {
            if (cfg.mirrorEffect) {
                const half = previewVisualizerData.slice(0, Math.floor(cfg.barCount / 2));
                return [...half.slice().reverse(), ...half];
            }
            return previewVisualizerData;
        };
        
        const data = getData();
        if (!data || data.length === 0) {
            ctx.restore();
            return;
        }
        
        const reactivity = cfg.reactivity || 1.0;
        
        // Calculate scale factor to fit the visualizer in the preview canvas
        const configWidth = cfg.width || 400;
        const configHeight = cfg.height || 150;
        const scaleX = width / configWidth;
        const scaleY = height / configHeight;
        const scale = Math.min(scaleX, scaleY, 1) * 0.9; // Cap at 1 to prevent over-scaling
        
        ctx.save();
        ctx.translate(width / 2, height / 2);
        ctx.scale(scale, scale);
        ctx.translate(-width / 2, -height / 2);
        
        if (cfg.type === 'wave') {
            // Smooth flowing wave visualization - IDENTICAL to CanvasWindow
            const vizWidth = cfg.width || 400;
            const startX = centerX - vizWidth / 2;
            const amplitude = cfg.waveAmplitude || 1.0;
            const speed = cfg.waveSpeed || 200;
            const mirrorGap = cfg.waveMirrorGap || 40;
            const lineW = cfg.lineWidth || 3;
            
            const numPoints = 200;
            
            const drawSmoothWave = (yOffset, direction, gradient) => {
                ctx.beginPath();
                ctx.strokeStyle = gradient;
                ctx.lineWidth = lineW;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                
                applyEffects(cfg.useGradient ? cfg.gradientStart : cfg.color);
                
                const time = Date.now() / speed;
                
                for (let i = 0; i <= numPoints; i++) {
                    const t = i / numPoints;
                    const x = startX + t * vizWidth;
                    
                    const dataIdx = Math.floor(t * (data.length - 1));
                    const audioValue = data[dataIdx] || 0;
                    
                    const wave1 = Math.sin(t * Math.PI * 8 + time * 3) * audioValue;
                    const wave2 = Math.sin(t * Math.PI * 12 + time * 2) * audioValue * 0.5;
                    const wave3 = Math.sin(t * Math.PI * 20 + time * 4) * audioValue * 0.25;
                    
                    const envelope = Math.sin(t * Math.PI);
                    const combinedWave = (wave1 + wave2 + wave3) * envelope;
                    
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
            
            drawSmoothWave(-mirrorGap / 2, -1, waveGradient);
            drawSmoothWave(mirrorGap / 2, 1, waveGradient);
            
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
        
        ctx.restore(); // Restore from scale transform
        ctx.restore(); // Restore from global save
    }, [previewVisualizerData, visualizerConfig, previewTalking]);

    // Render visualizer preview canvas
    const renderVisualizerPreview = () => {
        if (!visualizerConfig.enabled) return null;
        
        const cfg = visualizerConfig;
        const position = cfg.position || 'bottom';
        
        // Fixed preview size that fits in the editor panel
        const canvasWidth = 300;
        const canvasHeight = 150;
        
        const positionStyles = {
            bottom: { bottom: 20, left: '50%', transform: 'translateX(-50%)' },
            top: { top: 20, left: '50%', transform: 'translateX(-50%)' },
            center: { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
            behind: { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 0 },
        };
        
        return (
            <canvas
                ref={previewCanvasRef}
                width={canvasWidth}
                height={canvasHeight}
                style={{
                    position: 'absolute',
                    pointerEvents: 'none',
                    zIndex: position === 'behind' ? 0 : 10,
                    ...positionStyles[position],
                }}
            />
        );
    };

    const Slider = ({ label, value, onChange, min = -1, max = 1, step = 0.01, hint }) => {
        const percentage = ((value - min) / (max - min)) * 100;
        const [isHovered, setIsHovered] = useState(false);
        const [isDragging, setIsDragging] = useState(false);
        
        const handleMouseDown = (e) => {
            const slider = e.currentTarget;
            const rect = slider.getBoundingClientRect();
            setIsDragging(true);
            
            const updateValue = (clientX) => {
                const x = clientX - rect.left;
                const percent = Math.max(0, Math.min(1, x / rect.width));
                const newValue = min + percent * (max - min);
                const steppedValue = Math.round(newValue / step) * step;
                onChange(Math.max(min, Math.min(max, steppedValue)));
            };
            
            updateValue(e.clientX);
            
            const handleMouseMove = (moveEvent) => updateValue(moveEvent.clientX);
            const handleMouseUp = () => {
                setIsDragging(false);
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        };
        
        return (
            <div 
                style={{ marginBottom: 16 }}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    marginBottom: 6,
                    transition: 'all 0.2s ease'
                }}>
                    <label style={{ 
                        color: isHovered || isDragging ? '#f8fafc' : '#94a3b8', 
                        fontSize: 12, 
                        fontWeight: 500,
                        transition: 'color 0.2s ease'
                    }}>{label}</label>
                    <span style={{ 
                        color: '#f8fafc', 
                        fontSize: 12, 
                        fontFamily: "'JetBrains Mono', monospace",
                        background: isHovered || isDragging ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                        padding: '2px 8px',
                        borderRadius: 4,
                        transition: 'all 0.2s ease'
                    }}>
                        {typeof value === 'number' ? value.toFixed(step < 1 ? 2 : 0) : value}
                    </span>
                </div>
                <div 
                    onMouseDown={handleMouseDown}
                    style={{
                        width: '100%',
                        height: 24,
                        display: 'flex',
                        alignItems: 'center',
                        cursor: 'pointer',
                        userSelect: 'none'
                    }}
                >
                    <div style={{
                        width: '100%',
                        height: isHovered || isDragging ? 8 : 6,
                        borderRadius: 4,
                        background: `linear-gradient(to right, ${isDragging ? '#818cf8' : '#6366f1'} 0%, ${isDragging ? '#818cf8' : '#6366f1'} ${percentage}%, #1a1a24 ${percentage}%, #1a1a24 100%)`,
                        position: 'relative',
                        transition: 'height 0.15s ease, box-shadow 0.2s ease',
                        boxShadow: isHovered || isDragging ? '0 0 12px rgba(99, 102, 241, 0.4)' : 'none'
                    }}>
                        <div style={{
                            position: 'absolute',
                            left: `${percentage}%`,
                            top: '50%',
                            transform: `translate(-50%, -50%) scale(${isDragging ? 1.2 : isHovered ? 1.1 : 1})`,
                            width: 16,
                            height: 16,
                            borderRadius: '50%',
                            background: isDragging ? '#a5b4fc' : '#f8fafc',
                            boxShadow: isDragging 
                                ? '0 2px 12px rgba(0,0,0,0.5), 0 0 30px rgba(99, 102, 241, 0.6)' 
                                : isHovered 
                                    ? '0 2px 10px rgba(0,0,0,0.4), 0 0 25px rgba(99, 102, 241, 0.4)' 
                                    : '0 2px 8px rgba(0,0,0,0.4), 0 0 20px rgba(99, 102, 241, 0.3)',
                            cursor: isDragging ? 'grabbing' : 'grab',
                            transition: 'transform 0.15s ease, box-shadow 0.2s ease, background 0.2s ease'
                        }} />
                    </div>
                </div>
                {hint && <div style={{ 
                    fontSize: 10, 
                    color: isHovered ? '#94a3b8' : '#64748b', 
                    marginTop: 4,
                    transition: 'color 0.2s ease'
                }}>{hint}</div>}
            </div>
        );
    };

    const SectionHeader = ({ children }) => (
        <div style={{ 
            color: '#6366f1', 
            fontSize: 10, 
            textTransform: 'uppercase', 
            letterSpacing: 2, 
            marginTop: 20, 
            marginBottom: 12,
            paddingBottom: 8,
            borderBottom: '1px solid rgba(99, 102, 241, 0.2)',
            fontWeight: 600
        }}>
            {children}
        </div>
    );

    return (
        <div style={{ 
            display: 'flex', 
            width: '100vw', 
            height: '100vh', 
            background: 'linear-gradient(180deg, #0a0a0f 0%, #0d0d14 100%)',
            fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        }}>
            {/* Face Preview */}
            <div style={{ 
                flex: 1, 
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#000'
            }}>
                {/* Background glow */}
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '500px',
                    height: '500px',
                    background: `radial-gradient(circle, ${currentValues.color || '#64748b'}15 0%, transparent 70%)`,
                    pointerEvents: 'none'
                }} />

                <Face2D
                    warmth={currentValues.warmth}
                    energy={currentValues.energy}
                    openness={currentValues.openness}
                    positivity={currentValues.positivity}
                    intensity={0.7}
                    isThinking={currentValues.isThinking || false}
                    isTalking={previewTalking}
                    mouthOpenness={previewMouthOpen}
                    mouthShape={previewTalking ? 'open' : 'neutral'}
                    lookAt={{ x: 0, y: 0 }}
                    faceConfig={faceConfig}
                    userFacePosition={{ detected: false }}
                    faceColor={faceConfig.faceColor || '#ffffff'}
                />
                
                {/* Visualizer Preview */}
                {previewTalking && renderVisualizerPreview()}
                
                {/* Expression name overlay */}
                <div style={{
                    position: 'absolute',
                    top: 24,
                    left: 24,
                    padding: '14px 20px',
                    borderRadius: 14,
                    background: 'linear-gradient(135deg, rgba(18, 18, 26, 0.9) 0%, rgba(26, 26, 36, 0.9) 100%)',
                    backdropFilter: 'blur(20px)',
                    border: `1px solid ${currentValues.color || '#64748b'}40`,
                    boxShadow: `0 4px 30px ${currentValues.color || '#64748b'}20`
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            backgroundColor: currentValues.color || '#64748b',
                            boxShadow: `0 0 12px ${currentValues.color || '#64748b'}`
                        }} />
                        <span style={{ color: '#f8fafc', fontSize: 15, fontWeight: 600 }}>
                            {selectedExpression}
                        </span>
                        {hasChanges && (
                            <span style={{ 
                                color: '#f59e0b', 
                                fontSize: 10, 
                                fontWeight: 500,
                                padding: '2px 8px',
                                background: 'rgba(245, 158, 11, 0.15)',
                                borderRadius: 6
                            }}>
                                Unsaved
                            </span>
                        )}
                    </div>
                </div>

                {/* Preview controls */}
                <div style={{
                    position: 'absolute',
                    bottom: 24,
                    left: 24,
                    display: 'flex',
                    gap: 12
                }}>
                    <button
                        onClick={() => setPreviewTalking(!previewTalking)}
                        style={{
                            padding: '12px 20px',
                            borderRadius: 12,
                            border: previewTalking ? '1px solid #10b981' : '1px solid rgba(255,255,255,0.1)',
                            background: previewTalking 
                                ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.1) 100%)' 
                                : 'linear-gradient(135deg, #12121a 0%, #1a1a24 100%)',
                            color: previewTalking ? '#10b981' : '#94a3b8',
                            fontSize: 13,
                            fontWeight: 500,
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            fontFamily: "'Outfit', sans-serif"
                        }}
                    >
                        {previewTalking ? '🔊 Talking...' : '🔇 Preview Talk'}
                    </button>
                </div>
            </div>

            {/* Controls Panel */}
            <div style={{
                width: 400,
                background: 'linear-gradient(180deg, #0d0d14 0%, #12121a 100%)',
                borderLeft: '1px solid rgba(255,255,255,0.06)',
                display: 'flex',
                flexDirection: 'column'
            }}>
                {/* Tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {[
                        { id: 'expression', label: '😊 Expressions' },
                        { id: 'face', label: '🎨 Face' },
                        { id: 'visualizer', label: '🎵 Visualizer' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            onMouseEnter={(e) => {
                                if (activeTab !== tab.id) {
                                    e.currentTarget.style.background = 'rgba(99, 102, 241, 0.05)';
                                    e.currentTarget.style.color = '#94a3b8';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (activeTab !== tab.id) {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.color = '#64748b';
                                }
                            }}
                            style={{
                                flex: 1,
                                padding: '14px 8px',
                                border: 'none',
                                background: activeTab === tab.id ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                                color: activeTab === tab.id ? '#f8fafc' : '#64748b',
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                                borderBottom: activeTab === tab.id ? '2px solid #6366f1' : '2px solid transparent',
                                transition: 'all 0.2s ease',
                                fontFamily: "'Outfit', sans-serif"
                            }}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Scrollable content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
                    {activeTab === 'expression' ? (
                        <>
                            {/* Expression Selector */}
                            <div style={{ marginBottom: 20 }}>
                                <label style={{ 
                                    color: '#64748b', 
                                    fontSize: 10, 
                                    textTransform: 'uppercase', 
                                    letterSpacing: 1.5,
                                    fontWeight: 600
                                }}>
                                    Select Expression
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 10 }}>
                                    {Object.keys(expressions).map(name => {
                                        const isSelected = selectedExpression === name;
                                        const exprColor = expressions[name].color;
                                        return (
                                            <button
                                                key={name}
                                                onClick={() => setSelectedExpression(name)}
                                                onMouseEnter={(e) => {
                                                    if (!isSelected) {
                                                        e.currentTarget.style.background = `${exprColor}15`;
                                                        e.currentTarget.style.borderColor = `${exprColor}50`;
                                                        e.currentTarget.style.color = '#f8fafc';
                                                        e.currentTarget.style.transform = 'translateY(-2px)';
                                                        e.currentTarget.style.boxShadow = `0 4px 12px ${exprColor}30`;
                                                    }
                                                }}
                                                onMouseLeave={(e) => {
                                                    if (!isSelected) {
                                                        e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                                                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                                                        e.currentTarget.style.color = '#94a3b8';
                                                        e.currentTarget.style.transform = 'translateY(0)';
                                                        e.currentTarget.style.boxShadow = 'none';
                                                    }
                                                }}
                                                style={{
                                                    padding: '10px 6px',
                                                    borderRadius: 10,
                                                    border: isSelected 
                                                        ? `1px solid ${exprColor}` 
                                                        : '1px solid rgba(255,255,255,0.08)',
                                                    background: isSelected 
                                                        ? `${exprColor}20` 
                                                        : 'rgba(255,255,255,0.03)',
                                                    color: isSelected ? '#f8fafc' : '#94a3b8',
                                                    fontSize: 11,
                                                    fontWeight: 500,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s ease',
                                                    fontFamily: "'Outfit', sans-serif",
                                                    boxShadow: isSelected ? `0 4px 16px ${exprColor}40` : 'none',
                                                    transform: 'translateY(0)'
                                                }}
                                            >
                                                {name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <SectionHeader>Emotion Parameters</SectionHeader>
                            
                            <Slider
                                label="Warmth"
                                value={currentValues.warmth}
                                onChange={(v) => handleValueChange('warmth', v)}
                                hint="-1 Cold/Angry → +1 Warm/Friendly"
                            />
                            <Slider
                                label="Energy"
                                value={currentValues.energy}
                                onChange={(v) => handleValueChange('energy', v)}
                                hint="-1 Tired/Sad → +1 Energetic"
                            />
                            <Slider
                                label="Openness"
                                value={currentValues.openness}
                                onChange={(v) => handleValueChange('openness', v)}
                                hint="-1 Squinting → +1 Wide Eyes"
                            />
                            <Slider
                                label="Positivity"
                                value={currentValues.positivity}
                                onChange={(v) => handleValueChange('positivity', v)}
                                hint="-1 Frown → +1 Smile"
                            />

                            <SectionHeader>Appearance</SectionHeader>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                                <input
                                    type="color"
                                    value={currentValues.color || '#64748b'}
                                    onChange={(e) => handleValueChange('color', e.target.value)}
                                    style={{ 
                                        width: 44, 
                                        height: 36, 
                                        border: 'none', 
                                        borderRadius: 8, 
                                        cursor: 'pointer',
                                        background: 'transparent'
                                    }}
                                />
                                <input
                                    type="text"
                                    value={currentValues.color || '#64748b'}
                                    onChange={(e) => handleValueChange('color', e.target.value)}
                                    style={{
                                        flex: 1,
                                        padding: '10px 14px',
                                        borderRadius: 10,
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        background: '#12121a',
                                        color: '#f8fafc',
                                        fontSize: 13,
                                        fontFamily: "'JetBrains Mono', monospace"
                                    }}
                                />
                            </div>

                            <label style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: 12, 
                                cursor: 'pointer', 
                                color: '#94a3b8', 
                                fontSize: 13,
                                padding: '12px 16px',
                                background: 'rgba(255,255,255,0.03)',
                                borderRadius: 10,
                                border: '1px solid rgba(255,255,255,0.06)'
                            }}>
                                <input
                                    type="checkbox"
                                    checked={currentValues.isThinking || false}
                                    onChange={(e) => handleValueChange('isThinking', e.target.checked)}
                                    style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#6366f1' }}
                                />
                                Enable "Thinking" eye animation
                            </label>
                        </>
                    ) : activeTab === 'face' ? (
                        <>
                            <SectionHeader>Eyes</SectionHeader>
                            
                            <Slider label="Eye Spacing" value={faceConfig.eyeSpacing} onChange={(v) => handleConfigChange('eyeSpacing', v)} min={40} max={120} step={1} hint="Distance between eyes" />
                            <Slider label="Eye Y Position" value={faceConfig.eyeY} onChange={(v) => handleConfigChange('eyeY', v)} min={-80} max={20} step={1} hint="Vertical position (negative = up)" />
                            <Slider label="Eye Width" value={faceConfig.eyeWidth} onChange={(v) => handleConfigChange('eyeWidth', v)} min={20} max={70} step={1} />
                            <Slider label="Eye Height" value={faceConfig.eyeHeight} onChange={(v) => handleConfigChange('eyeHeight', v)} min={10} max={50} step={1} />
                            <Slider label="Pupil Size" value={faceConfig.pupilSize} onChange={(v) => handleConfigChange('pupilSize', v)} min={3} max={15} step={1} />

                            <SectionHeader>Eyebrows</SectionHeader>
                            
                            <Slider label="Brow Y Position" value={faceConfig.browY} onChange={(v) => handleConfigChange('browY', v)} min={-120} max={20} step={1} hint="Vertical position (negative = up)" />
                            <Slider label="Brow Length" value={faceConfig.browLength} onChange={(v) => handleConfigChange('browLength', v)} min={20} max={80} step={1} />
                            <Slider label="Brow Thickness" value={faceConfig.browThickness} onChange={(v) => handleConfigChange('browThickness', v)} min={1} max={10} step={0.5} />
                            <Slider label="Inner Angle Intensity" value={faceConfig.browInnerAngleMult ?? 18} onChange={(v) => handleConfigChange('browInnerAngleMult', v)} min={-80} max={80} step={1} hint="How much inner brow rotates (-80 to 80)" />
                            <Slider label="Outer Angle Intensity" value={faceConfig.browOuterAngleMult ?? 10} onChange={(v) => handleConfigChange('browOuterAngleMult', v)} min={-60} max={60} step={1} hint="How much outer brow rotates (-60 to 60)" />

                            <SectionHeader>Mouth</SectionHeader>
                            
                            <Slider label="Mouth Y Position" value={faceConfig.mouthY} onChange={(v) => handleConfigChange('mouthY', v)} min={20} max={100} step={1} />
                            <Slider label="Mouth Width" value={faceConfig.mouthWidth} onChange={(v) => handleConfigChange('mouthWidth', v)} min={20} max={100} step={1} />
                            <Slider label="Mouth Thickness" value={faceConfig.mouthThickness} onChange={(v) => handleConfigChange('mouthThickness', v)} min={1} max={8} step={0.5} />
                            <Slider label="Smile Curve Intensity" value={faceConfig.smileCurveMult || 30} onChange={(v) => handleConfigChange('smileCurveMult', v)} min={5} max={60} step={1} hint="How curved the smile/frown is" />
                            <Slider label="Mouth Open Height" value={faceConfig.mouthOpenHeight || 28} onChange={(v) => handleConfigChange('mouthOpenHeight', v)} min={10} max={60} step={1} hint="How big mouth opens when talking" />
                            <Slider label="Frown Corner Drop" value={faceConfig.frownCornerDrop || 10} onChange={(v) => handleConfigChange('frownCornerDrop', v)} min={0} max={30} step={1} hint="How much corners droop when frowning" />

                            <SectionHeader>General</SectionHeader>
                            
                            <Slider label="Line Thickness" value={faceConfig.lineThickness} onChange={(v) => handleConfigChange('lineThickness', v)} min={1} max={8} step={0.5} />
                            <Slider label="Max Face Scale" value={faceConfig.maxScale || 1.0} onChange={(v) => handleConfigChange('maxScale', v)} min={0.3} max={2.0} step={0.05} />
                            
                            <div style={{ marginTop: 16 }}>
                                <label style={{ color: '#94a3b8', fontSize: 12, fontWeight: 500, marginBottom: 8, display: 'block' }}>
                                    Face Color
                                </label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <input
                                        type="color"
                                        value={faceConfig.faceColor || '#ffffff'}
                                        onChange={(e) => handleConfigChange('faceColor', e.target.value)}
                                        style={{ 
                                            width: 44, 
                                            height: 36, 
                                            border: 'none', 
                                            borderRadius: 8, 
                                            cursor: 'pointer',
                                            background: 'transparent'
                                        }}
                                    />
                                    <input
                                        type="text"
                                        value={faceConfig.faceColor || '#ffffff'}
                                        onChange={(e) => handleConfigChange('faceColor', e.target.value)}
                                        style={{
                                            flex: 1,
                                            padding: '10px 14px',
                                            borderRadius: 10,
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            background: '#12121a',
                                            color: '#f8fafc',
                                            fontSize: 13,
                                            fontFamily: "'JetBrains Mono', monospace"
                                        }}
                                    />
                                </div>
                                <div style={{ fontSize: 10, color: '#64748b', marginTop: 6 }}>Color of face lines and features</div>
                            </div>
                        </>
                    ) : activeTab === 'visualizer' ? (
                        <>
                            <SectionHeader>Audio Visualizer</SectionHeader>
                            
                            <label style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: 12, 
                                cursor: 'pointer', 
                                color: '#94a3b8', 
                                fontSize: 13,
                                padding: '12px 16px',
                                background: visualizerConfig.enabled ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255,255,255,0.03)',
                                borderRadius: 10,
                                border: visualizerConfig.enabled ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid rgba(255,255,255,0.06)',
                                marginBottom: 16
                            }}>
                                <input
                                    type="checkbox"
                                    checked={visualizerConfig.enabled}
                                    onChange={(e) => handleVisualizerChange('enabled', e.target.checked)}
                                    style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#6366f1' }}
                                />
                                Enable Audio Visualizer
                            </label>

                            <div style={{ marginBottom: 16 }}>
                                <label style={{ color: '#94a3b8', fontSize: 12, fontWeight: 500, marginBottom: 8, display: 'block' }}>
                                    Visualizer Type
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                                    {[
                                        { value: 'bars', label: '▐ Bars', icon: '📊' },
                                        { value: 'wave', label: '〰 Wave', icon: '🌊' },
                                        { value: 'dots', label: '● Dots', icon: '⚫' },
                                        { value: 'circle', label: '◯ Circle', icon: '🔵' },
                                        { value: 'mirror', label: '⟺ Mirror', icon: '🪞' },
                                    ].map(({ value, label }) => (
                                        <button
                                            key={value}
                                            onClick={() => handleVisualizerChange('type', value)}
                                            style={{
                                                padding: '10px 8px',
                                                borderRadius: 10,
                                                border: visualizerConfig.type === value 
                                                    ? '1px solid #6366f1' 
                                                    : '1px solid rgba(255,255,255,0.08)',
                                                background: visualizerConfig.type === value 
                                                    ? 'rgba(99, 102, 241, 0.2)' 
                                                    : 'rgba(255,255,255,0.03)',
                                                color: visualizerConfig.type === value ? '#f8fafc' : '#94a3b8',
                                                fontSize: 11,
                                                fontWeight: 500,
                                                cursor: 'pointer',
                                                transition: 'all 0.15s ease',
                                                fontFamily: "'Outfit', sans-serif"
                                            }}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div style={{ marginBottom: 16 }}>
                                <label style={{ color: '#94a3b8', fontSize: 12, fontWeight: 500, marginBottom: 8, display: 'block' }}>
                                    Position
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                                    {['bottom', 'top', 'center', 'behind'].map((pos) => (
                                        <button
                                            key={pos}
                                            onClick={() => handleVisualizerChange('position', pos)}
                                            style={{
                                                padding: '8px',
                                                borderRadius: 8,
                                                border: visualizerConfig.position === pos 
                                                    ? '1px solid #6366f1' 
                                                    : '1px solid rgba(255,255,255,0.08)',
                                                background: visualizerConfig.position === pos 
                                                    ? 'rgba(99, 102, 241, 0.2)' 
                                                    : 'rgba(255,255,255,0.03)',
                                                color: visualizerConfig.position === pos ? '#f8fafc' : '#94a3b8',
                                                fontSize: 10,
                                                fontWeight: 500,
                                                cursor: 'pointer',
                                                textTransform: 'capitalize',
                                                fontFamily: "'Outfit', sans-serif"
                                            }}
                                        >
                                            {pos}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <SectionHeader>Color Mode</SectionHeader>

                            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                                {[
                                    { value: 'solid', label: '● Solid' },
                                    { value: 'gradient', label: '◐ Gradient' },
                                    { value: 'rainbow', label: '🌈 Rainbow' },
                                ].map(({ value, label }) => (
                                    <button
                                        key={value}
                                        onClick={() => {
                                            if (value === 'solid') {
                                                handleVisualizerChange('useGradient', false);
                                                handleVisualizerChange('rainbowMode', false);
                                            } else if (value === 'gradient') {
                                                handleVisualizerChange('useGradient', true);
                                                handleVisualizerChange('rainbowMode', false);
                                            } else {
                                                handleVisualizerChange('useGradient', false);
                                                handleVisualizerChange('rainbowMode', true);
                                            }
                                        }}
                                        style={{
                                            flex: 1,
                                            padding: '10px 8px',
                                            borderRadius: 10,
                                            border: (value === 'solid' && !visualizerConfig.useGradient && !visualizerConfig.rainbowMode) ||
                                                   (value === 'gradient' && visualizerConfig.useGradient && !visualizerConfig.rainbowMode) ||
                                                   (value === 'rainbow' && visualizerConfig.rainbowMode)
                                                ? '1px solid #6366f1' 
                                                : '1px solid rgba(255,255,255,0.1)',
                                            background: (value === 'solid' && !visualizerConfig.useGradient && !visualizerConfig.rainbowMode) ||
                                                       (value === 'gradient' && visualizerConfig.useGradient && !visualizerConfig.rainbowMode) ||
                                                       (value === 'rainbow' && visualizerConfig.rainbowMode)
                                                ? 'rgba(99, 102, 241, 0.15)' 
                                                : 'rgba(255,255,255,0.03)',
                                            color: (value === 'solid' && !visualizerConfig.useGradient && !visualizerConfig.rainbowMode) ||
                                                  (value === 'gradient' && visualizerConfig.useGradient && !visualizerConfig.rainbowMode) ||
                                                  (value === 'rainbow' && visualizerConfig.rainbowMode)
                                                ? '#f8fafc' 
                                                : '#94a3b8',
                                            fontSize: 12,
                                            fontWeight: 500,
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease',
                                            fontFamily: "'Outfit', sans-serif"
                                        }}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>

                            {/* Solid color picker */}
                            {!visualizerConfig.useGradient && !visualizerConfig.rainbowMode && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                                    <label style={{ color: '#94a3b8', fontSize: 12, width: 80 }}>Color</label>
                                    <input
                                        type="color"
                                        value={visualizerConfig.color}
                                        onChange={(e) => handleVisualizerChange('color', e.target.value)}
                                        style={{ 
                                            width: 44, 
                                            height: 36, 
                                            border: 'none', 
                                            borderRadius: 8, 
                                            cursor: 'pointer',
                                            background: 'transparent'
                                        }}
                                    />
                                    <input
                                        type="text"
                                        value={visualizerConfig.color}
                                        onChange={(e) => handleVisualizerChange('color', e.target.value)}
                                        style={{
                                            flex: 1,
                                            padding: '10px 14px',
                                            borderRadius: 10,
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            background: '#12121a',
                                            color: '#f8fafc',
                                            fontSize: 13,
                                            fontFamily: "'JetBrains Mono', monospace"
                                        }}
                                    />
                                </div>
                            )}

                            {/* Gradient color pickers */}
                            {visualizerConfig.useGradient && !visualizerConfig.rainbowMode && (
                                <>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                                        <label style={{ color: '#94a3b8', fontSize: 12, width: 80 }}>Start</label>
                                        <input
                                            type="color"
                                            value={visualizerConfig.gradientStart}
                                            onChange={(e) => handleVisualizerChange('gradientStart', e.target.value)}
                                            style={{ 
                                                width: 44, 
                                                height: 36, 
                                                border: 'none', 
                                                borderRadius: 8, 
                                                cursor: 'pointer',
                                                background: 'transparent'
                                            }}
                                        />
                                        <input
                                            type="text"
                                            value={visualizerConfig.gradientStart}
                                            onChange={(e) => handleVisualizerChange('gradientStart', e.target.value)}
                                            style={{
                                                flex: 1,
                                                padding: '10px 14px',
                                                borderRadius: 10,
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                background: '#12121a',
                                                color: '#f8fafc',
                                                fontSize: 13,
                                                fontFamily: "'JetBrains Mono', monospace"
                                            }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                                        <label style={{ color: '#94a3b8', fontSize: 12, width: 80 }}>End</label>
                                        <input
                                            type="color"
                                            value={visualizerConfig.gradientEnd}
                                            onChange={(e) => handleVisualizerChange('gradientEnd', e.target.value)}
                                            style={{ 
                                                width: 44, 
                                                height: 36, 
                                                border: 'none', 
                                                borderRadius: 8, 
                                                cursor: 'pointer',
                                                background: 'transparent'
                                            }}
                                        />
                                        <input
                                            type="text"
                                            value={visualizerConfig.gradientEnd}
                                            onChange={(e) => handleVisualizerChange('gradientEnd', e.target.value)}
                                            style={{
                                                flex: 1,
                                                padding: '10px 14px',
                                                borderRadius: 10,
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                background: '#12121a',
                                                color: '#f8fafc',
                                                fontSize: 13,
                                                fontFamily: "'JetBrains Mono', monospace"
                                            }}
                                        />
                                    </div>
                                    {/* Gradient preview */}
                                    <div style={{
                                        height: 24,
                                        borderRadius: 8,
                                        background: `linear-gradient(90deg, ${visualizerConfig.gradientStart}, ${visualizerConfig.gradientEnd})`,
                                        marginBottom: 16,
                                        boxShadow: `0 0 20px ${visualizerConfig.gradientStart}40`
                                    }} />
                                </>
                            )}

                            {/* Rainbow preview */}
                            {visualizerConfig.rainbowMode && (
                                <div style={{
                                    height: 24,
                                    borderRadius: 8,
                                    background: 'linear-gradient(90deg, #ec4899, #a855f7, #6366f1, #06b6d4, #10b981, #eab308, #f97316, #ef4444)',
                                    marginBottom: 16,
                                    boxShadow: '0 0 20px rgba(99, 102, 241, 0.3)'
                                }} />
                            )}

                            <SectionHeader>📐 Boundaries & Position</SectionHeader>

                            <Slider 
                                label="Width" 
                                value={visualizerConfig.width || 400} 
                                onChange={(v) => handleVisualizerChange('width', v)} 
                                min={100} max={800} step={10} 
                                hint="Total width of visualizer"
                            />
                            <Slider 
                                label="Height" 
                                value={visualizerConfig.height || 150} 
                                onChange={(v) => handleVisualizerChange('height', v)} 
                                min={50} max={400} step={10} 
                                hint="Total height boundary"
                            />
                            <Slider 
                                label="Offset X" 
                                value={visualizerConfig.offsetX || 0} 
                                onChange={(v) => handleVisualizerChange('offsetX', v)} 
                                min={-200} max={200} step={5} 
                                hint="Horizontal offset from center"
                            />
                            <Slider 
                                label="Offset Y" 
                                value={visualizerConfig.offsetY || 0} 
                                onChange={(v) => handleVisualizerChange('offsetY', v)} 
                                min={-200} max={200} step={5} 
                                hint="Vertical offset from position"
                            />
                            <Slider 
                                label="Rotation" 
                                value={visualizerConfig.rotation || 0} 
                                onChange={(v) => handleVisualizerChange('rotation', v)} 
                                min={-180} max={180} step={5} 
                                hint="Rotation in degrees"
                            />

                            <SectionHeader>📊 Bar Settings</SectionHeader>

                            <Slider 
                                label="Bar Count" 
                                value={visualizerConfig.barCount || 32} 
                                onChange={(v) => handleVisualizerChange('barCount', v)} 
                                min={4} max={128} step={1} 
                                hint="Number of bars/elements"
                            />
                            <Slider 
                                label="Bar Width" 
                                value={visualizerConfig.barWidth || 8} 
                                onChange={(v) => handleVisualizerChange('barWidth', v)} 
                                min={1} max={30} step={1} 
                                hint="Individual bar width"
                            />
                            <Slider 
                                label="Bar Gap" 
                                value={visualizerConfig.barGap || 3} 
                                onChange={(v) => handleVisualizerChange('barGap', v)} 
                                min={0} max={20} step={1} 
                                hint="Space between bars"
                            />
                            <Slider 
                                label="Min Height" 
                                value={visualizerConfig.barMinHeight || 4} 
                                onChange={(v) => handleVisualizerChange('barMinHeight', v)} 
                                min={0} max={30} step={1} 
                            />
                            <Slider 
                                label="Max Height" 
                                value={visualizerConfig.barMaxHeight || 80} 
                                onChange={(v) => handleVisualizerChange('barMaxHeight', v)} 
                                min={20} max={200} step={5} 
                            />
                            <Slider 
                                label="Border Radius" 
                                value={visualizerConfig.barBorderRadius || 2} 
                                onChange={(v) => handleVisualizerChange('barBorderRadius', v)} 
                                min={0} max={15} step={1} 
                                hint="Roundness of bar corners"
                            />
                            <Slider 
                                label="Bar Skew" 
                                value={visualizerConfig.barSkew || 0} 
                                onChange={(v) => handleVisualizerChange('barSkew', v)} 
                                min={-45} max={45} step={1} 
                                hint="Skew angle for bars"
                            />
                            <Slider 
                                label="Bar Taper" 
                                value={visualizerConfig.barTaper || 1.0} 
                                onChange={(v) => handleVisualizerChange('barTaper', v)} 
                                min={0.2} max={2.0} step={0.1} 
                                hint="1.0 = uniform, <1 = taper to top"
                            />

                            {/* Wave-specific settings */}
                            {visualizerConfig.type === 'wave' && (
                                <>
                                    <SectionHeader>🌊 Wave Settings</SectionHeader>
                                    <Slider 
                                        label="Line Width" 
                                        value={visualizerConfig.lineWidth || 3} 
                                        onChange={(v) => handleVisualizerChange('lineWidth', v)} 
                                        min={1} max={12} step={0.5} 
                                        hint="Thickness of wave lines"
                                    />
                                    <Slider 
                                        label="Amplitude" 
                                        value={visualizerConfig.waveAmplitude || 1.0} 
                                        onChange={(v) => handleVisualizerChange('waveAmplitude', v)} 
                                        min={0.1} max={3.0} step={0.1} 
                                        hint="Wave height multiplier"
                                    />
                                    <Slider 
                                        label="Frequency" 
                                        value={visualizerConfig.waveFrequency || 4} 
                                        onChange={(v) => handleVisualizerChange('waveFrequency', v)} 
                                        min={1} max={12} step={0.5} 
                                        hint="Number of wave cycles"
                                    />
                                    <Slider 
                                        label="Speed" 
                                        value={visualizerConfig.waveSpeed || 200} 
                                        onChange={(v) => handleVisualizerChange('waveSpeed', v)} 
                                        min={50} max={1000} step={25} 
                                        hint="Animation speed (ms)"
                                    />
                                    <Slider 
                                        label="Phase Offset" 
                                        value={visualizerConfig.waveOffset || 0} 
                                        onChange={(v) => handleVisualizerChange('waveOffset', v)} 
                                        min={0} max={360} step={15} 
                                        hint="Wave phase offset"
                                    />
                                    <Slider 
                                        label="Mirror Gap" 
                                        value={visualizerConfig.waveMirrorGap || 40} 
                                        onChange={(v) => handleVisualizerChange('waveMirrorGap', v)} 
                                        min={0} max={100} step={5} 
                                        hint="Gap between mirrored waves"
                                    />
                                </>
                            )}

                            {/* Circle-specific settings */}
                            {visualizerConfig.type === 'circle' && (
                                <>
                                    <SectionHeader>⭕ Circle Settings</SectionHeader>
                                    <Slider 
                                        label="Radius" 
                                        value={visualizerConfig.circleRadius || 80} 
                                        onChange={(v) => handleVisualizerChange('circleRadius', v)} 
                                        min={20} max={200} step={5} 
                                        hint="Inner circle radius"
                                    />
                                    <Slider 
                                        label="Start Angle" 
                                        value={visualizerConfig.circleStartAngle || 0} 
                                        onChange={(v) => handleVisualizerChange('circleStartAngle', v)} 
                                        min={0} max={360} step={5} 
                                        hint="Where the circle starts (degrees)"
                                    />
                                    <Slider 
                                        label="End Angle" 
                                        value={visualizerConfig.circleEndAngle || 360} 
                                        onChange={(v) => handleVisualizerChange('circleEndAngle', v)} 
                                        min={0} max={360} step={5} 
                                        hint="Where the circle ends (degrees)"
                                    />
                                    <Slider 
                                        label="Bar Length" 
                                        value={visualizerConfig.circleBarLength || 1.0} 
                                        onChange={(v) => handleVisualizerChange('circleBarLength', v)} 
                                        min={0.2} max={3.0} step={0.1} 
                                        hint="Multiplier for bar length"
                                    />
                                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                        <button
                                            onClick={() => handleVisualizerChange('circleDirection', 1)}
                                            style={{
                                                flex: 1,
                                                padding: '10px',
                                                borderRadius: 8,
                                                border: visualizerConfig.circleDirection === 1 ? '1px solid #6366f1' : '1px solid rgba(255,255,255,0.1)',
                                                background: visualizerConfig.circleDirection === 1 ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255,255,255,0.03)',
                                                color: visualizerConfig.circleDirection === 1 ? '#f8fafc' : '#94a3b8',
                                                fontSize: 12,
                                                cursor: 'pointer',
                                                fontFamily: "'Outfit', sans-serif"
                                            }}
                                        >
                                            ↻ Clockwise
                                        </button>
                                        <button
                                            onClick={() => handleVisualizerChange('circleDirection', -1)}
                                            style={{
                                                flex: 1,
                                                padding: '10px',
                                                borderRadius: 8,
                                                border: visualizerConfig.circleDirection === -1 ? '1px solid #6366f1' : '1px solid rgba(255,255,255,0.1)',
                                                background: visualizerConfig.circleDirection === -1 ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255,255,255,0.03)',
                                                color: visualizerConfig.circleDirection === -1 ? '#f8fafc' : '#94a3b8',
                                                fontSize: 12,
                                                cursor: 'pointer',
                                                fontFamily: "'Outfit', sans-serif"
                                            }}
                                        >
                                            ↺ Counter
                                        </button>
                                    </div>
                                </>
                            )}

                            {/* Dots-specific settings */}
                            {visualizerConfig.type === 'dots' && (
                                <>
                                    <SectionHeader>● Dots Settings</SectionHeader>
                                    <Slider 
                                        label="Min Size" 
                                        value={visualizerConfig.dotMinSize || 4} 
                                        onChange={(v) => handleVisualizerChange('dotMinSize', v)} 
                                        min={1} max={20} step={1} 
                                    />
                                    <Slider 
                                        label="Max Size" 
                                        value={visualizerConfig.dotMaxSize || 20} 
                                        onChange={(v) => handleVisualizerChange('dotMaxSize', v)} 
                                        min={5} max={50} step={1} 
                                    />
                                    <Slider 
                                        label="Bounce Height" 
                                        value={visualizerConfig.dotBounceHeight || 30} 
                                        onChange={(v) => handleVisualizerChange('dotBounceHeight', v)} 
                                        min={0} max={100} step={5} 
                                        hint="How high dots bounce"
                                    />
                                    <Slider 
                                        label="Bounce Speed" 
                                        value={visualizerConfig.dotBounceSpeed || 150} 
                                        onChange={(v) => handleVisualizerChange('dotBounceSpeed', v)} 
                                        min={50} max={500} step={25} 
                                        hint="Bounce animation speed (ms)"
                                    />
                                </>
                            )}

                            <SectionHeader>✨ Effects</SectionHeader>

                            <label style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: 12, 
                                cursor: 'pointer', 
                                color: '#94a3b8', 
                                fontSize: 13,
                                padding: '12px 16px',
                                background: visualizerConfig.glowEnabled ? 'rgba(99, 102, 241, 0.1)' : 'rgba(255,255,255,0.03)',
                                borderRadius: 10,
                                border: '1px solid rgba(255,255,255,0.06)',
                                marginBottom: 12
                            }}>
                                <input
                                    type="checkbox"
                                    checked={visualizerConfig.glowEnabled}
                                    onChange={(e) => handleVisualizerChange('glowEnabled', e.target.checked)}
                                    style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#6366f1' }}
                                />
                                Enable Glow Effect
                            </label>

                            {visualizerConfig.glowEnabled && (
                                <>
                                    <Slider 
                                        label="Glow Intensity" 
                                        value={visualizerConfig.glowIntensity || 0.5} 
                                        onChange={(v) => handleVisualizerChange('glowIntensity', v)} 
                                        min={0.1} max={2.0} step={0.1} 
                                    />
                                    <Slider 
                                        label="Glow Spread" 
                                        value={visualizerConfig.glowSpread || 15} 
                                        onChange={(v) => handleVisualizerChange('glowSpread', v)} 
                                        min={5} max={50} step={5} 
                                        hint="Blur radius of glow"
                                    />
                                </>
                            )}

                            <label style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: 12, 
                                cursor: 'pointer', 
                                color: '#94a3b8', 
                                fontSize: 13,
                                padding: '12px 16px',
                                background: visualizerConfig.shadowEnabled ? 'rgba(99, 102, 241, 0.1)' : 'rgba(255,255,255,0.03)',
                                borderRadius: 10,
                                border: '1px solid rgba(255,255,255,0.06)',
                                marginBottom: 12
                            }}>
                                <input
                                    type="checkbox"
                                    checked={visualizerConfig.shadowEnabled}
                                    onChange={(e) => handleVisualizerChange('shadowEnabled', e.target.checked)}
                                    style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#6366f1' }}
                                />
                                Enable Drop Shadow
                            </label>

                            {visualizerConfig.shadowEnabled && (
                                <>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                                        <label style={{ color: '#94a3b8', fontSize: 12, width: 80 }}>Shadow</label>
                                        <input
                                            type="color"
                                            value={visualizerConfig.shadowColor || '#000000'}
                                            onChange={(e) => handleVisualizerChange('shadowColor', e.target.value)}
                                            style={{ width: 44, height: 36, border: 'none', borderRadius: 8, cursor: 'pointer', background: 'transparent' }}
                                        />
                                    </div>
                                    <Slider 
                                        label="Shadow X" 
                                        value={visualizerConfig.shadowOffsetX || 2} 
                                        onChange={(v) => handleVisualizerChange('shadowOffsetX', v)} 
                                        min={-20} max={20} step={1} 
                                    />
                                    <Slider 
                                        label="Shadow Y" 
                                        value={visualizerConfig.shadowOffsetY || 2} 
                                        onChange={(v) => handleVisualizerChange('shadowOffsetY', v)} 
                                        min={-20} max={20} step={1} 
                                    />
                                    <Slider 
                                        label="Shadow Blur" 
                                        value={visualizerConfig.shadowBlur || 4} 
                                        onChange={(v) => handleVisualizerChange('shadowBlur', v)} 
                                        min={0} max={30} step={1} 
                                    />
                                </>
                            )}

                            <label style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: 12, 
                                cursor: 'pointer', 
                                color: '#94a3b8', 
                                fontSize: 13,
                                padding: '12px 16px',
                                background: visualizerConfig.mirrorEffect ? 'rgba(99, 102, 241, 0.1)' : 'rgba(255,255,255,0.03)',
                                borderRadius: 10,
                                border: '1px solid rgba(255,255,255,0.06)',
                                marginBottom: 12
                            }}>
                                <input
                                    type="checkbox"
                                    checked={visualizerConfig.mirrorEffect}
                                    onChange={(e) => handleVisualizerChange('mirrorEffect', e.target.checked)}
                                    style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#6366f1' }}
                                />
                                Mirror Effect (symmetric)
                            </label>

                            <SectionHeader>🎬 Animation</SectionHeader>

                            <Slider 
                                label="Smoothing" 
                                value={visualizerConfig.smoothing || 0.8} 
                                onChange={(v) => handleVisualizerChange('smoothing', v)} 
                                min={0} max={0.98} step={0.02} 
                                hint="Animation smoothness"
                            />
                            <Slider 
                                label="Reactivity" 
                                value={visualizerConfig.reactivity || 1.0} 
                                onChange={(v) => handleVisualizerChange('reactivity', v)} 
                                min={0.1} max={3.0} step={0.1} 
                                hint="How much it reacts to audio"
                            />
                            {visualizerConfig.rainbowMode && (
                                <Slider 
                                    label="Rainbow Speed" 
                                    value={visualizerConfig.rainbowSpeed || 1.0} 
                                    onChange={(v) => handleVisualizerChange('rainbowSpeed', v)} 
                                    min={0.1} max={5.0} step={0.1} 
                                    hint="Rainbow color cycle speed"
                                />
                            )}

                            <SectionHeader>🔄 Transform</SectionHeader>

                            <Slider 
                                label="Scale X" 
                                value={visualizerConfig.scaleX || 1.0} 
                                onChange={(v) => handleVisualizerChange('scaleX', v)} 
                                min={0.2} max={3.0} step={0.1} 
                                hint="Horizontal scale"
                            />
                            <Slider 
                                label="Scale Y" 
                                value={visualizerConfig.scaleY || 1.0} 
                                onChange={(v) => handleVisualizerChange('scaleY', v)} 
                                min={0.2} max={3.0} step={0.1} 
                                hint="Vertical scale"
                            />
                            <Slider 
                                label="Opacity" 
                                value={visualizerConfig.opacity || 0.8} 
                                onChange={(v) => handleVisualizerChange('opacity', v)} 
                                min={0.1} max={1} step={0.05} 
                            />

                            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                <label style={{ 
                                    flex: 1,
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center',
                                    gap: 8, 
                                    cursor: 'pointer', 
                                    color: visualizerConfig.flipHorizontal ? '#f8fafc' : '#94a3b8', 
                                    fontSize: 12,
                                    padding: '10px',
                                    background: visualizerConfig.flipHorizontal ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255,255,255,0.03)',
                                    borderRadius: 8,
                                    border: visualizerConfig.flipHorizontal ? '1px solid #6366f1' : '1px solid rgba(255,255,255,0.06)',
                                }}>
                                    <input
                                        type="checkbox"
                                        checked={visualizerConfig.flipHorizontal}
                                        onChange={(e) => handleVisualizerChange('flipHorizontal', e.target.checked)}
                                        style={{ display: 'none' }}
                                    />
                                    ↔ Flip H
                                </label>
                                <label style={{ 
                                    flex: 1,
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center',
                                    gap: 8, 
                                    cursor: 'pointer', 
                                    color: visualizerConfig.flipVertical ? '#f8fafc' : '#94a3b8', 
                                    fontSize: 12,
                                    padding: '10px',
                                    background: visualizerConfig.flipVertical ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255,255,255,0.03)',
                                    borderRadius: 8,
                                    border: visualizerConfig.flipVertical ? '1px solid #6366f1' : '1px solid rgba(255,255,255,0.06)',
                                }}>
                                    <input
                                        type="checkbox"
                                        checked={visualizerConfig.flipVertical}
                                        onChange={(e) => handleVisualizerChange('flipVertical', e.target.checked)}
                                        style={{ display: 'none' }}
                                    />
                                    ↕ Flip V
                                </label>
                            </div>
                        </>
                    ) : null}
                </div>

                {/* Action Buttons */}
                <div style={{ padding: 20, borderTop: '1px solid rgba(255,255,255,0.06)', background: '#0a0a0f' }}>
                    <button
                        onClick={handleSave}
                        disabled={!hasChanges}
                        onMouseEnter={(e) => {
                            if (hasChanges) {
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = '0 6px 25px rgba(99, 102, 241, 0.5)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (hasChanges) {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = '0 4px 20px rgba(99, 102, 241, 0.3)';
                            }
                        }}
                        style={{
                            width: '100%',
                            padding: '14px',
                            borderRadius: 12,
                            border: 'none',
                            background: hasChanges 
                                ? 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' 
                                : '#1a1a24',
                            color: hasChanges ? '#fff' : '#64748b',
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: hasChanges ? 'pointer' : 'not-allowed',
                            marginBottom: 10,
                            boxShadow: hasChanges ? '0 4px 20px rgba(99, 102, 241, 0.3)' : 'none',
                            transition: 'all 0.2s ease',
                            fontFamily: "'Outfit', sans-serif",
                            transform: 'translateY(0)'
                        }}
                    >
                        💾 Save {activeTab === 'expression' ? 'Expression' : activeTab === 'face' ? 'Face Config' : 'Visualizer'}
                    </button>
                    
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button 
                            onClick={handleReset} 
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                                e.currentTarget.style.color = '#f8fafc';
                                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.color = '#94a3b8';
                                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                            }}
                            style={{
                                flex: 1, padding: '10px', borderRadius: 10,
                                border: '1px solid rgba(255,255,255,0.1)',
                                background: 'transparent', color: '#94a3b8',
                                fontSize: 12, cursor: 'pointer', fontFamily: "'Outfit', sans-serif",
                                transition: 'all 0.2s ease'
                            }}
                        >
                            ↩ Reset
                        </button>
                        <button 
                            onClick={handleExport}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(99, 102, 241, 0.15)';
                                e.currentTarget.style.color = '#a5b4fc';
                                e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.3)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.color = '#94a3b8';
                                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                            }}
                            style={{
                                flex: 1, padding: '10px', borderRadius: 10,
                                border: '1px solid rgba(255,255,255,0.1)',
                                background: 'transparent', color: '#94a3b8',
                                fontSize: 12, cursor: 'pointer', fontFamily: "'Outfit', sans-serif",
                                transition: 'all 0.2s ease'
                            }}
                        >
                            📤 Export
                        </button>
                        <button 
                            onClick={handleResetAll}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                                e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                            }}
                            style={{
                                flex: 1, padding: '10px', borderRadius: 10,
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                background: 'transparent', color: '#ef4444',
                                fontSize: 12, cursor: 'pointer', fontFamily: "'Outfit', sans-serif",
                                transition: 'all 0.2s ease'
                            }}
                        >
                            🗑 Reset All
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FaceEditor;
