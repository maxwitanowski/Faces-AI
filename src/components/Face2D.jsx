import React, { useRef, useEffect, useState } from 'react';

// Default face configuration
export const DEFAULT_FACE_CONFIG = {
    // Eye settings
    eyeSpacing: 75,
    eyeY: -24,
    eyeWidth: 44,
    eyeHeight: 30,
    pupilSize: 7,

    // Brow settings
    browY: -74,
    browLength: 54,
    browThickness: 4,
    browInnerAngleMult: -36,
    browOuterAngleMult: 16,

    // Mouth settings
    mouthY: 58,
    mouthWidth: 61,
    mouthThickness: 4,
    smileCurveMult: 45,
    mouthOpenHeight: 51,
    frownCornerDrop: 10,

    // Thinking animation
    thinkingSpeed: 1.2,
    thinkingRangeX: 12,
    thinkingRangeY: 5,
    thinkingBaseY: 8,
    thinkingFreqX: 2.5,
    thinkingFreqY: 1.7,

    // General
    lineThickness: 3,
    maxScale: 1,

    // Playful movement settings
    idleMovement: 1,
    talkBrowBounce: 1,
    talkHeadBob: 1,
};
const Face2D = ({ 
    warmth = 0,
    energy = 0,
    openness = 0,
    positivity = 0,
    intensity = 0.7,
    isTalking = false,
    isThinking = false,
    mouthOpenness = 0,
    mouthShape = 'neutral',
    lookAt = { x: 0, y: 0 },
    faceConfig = {},
    userFacePosition = { x: 0, y: 0, detected: false },
    trackingTarget = null, // Can be 'face', 'object', or null
    faceColor = '#ffffff' // Custom face color
}) => {
    const canvasRef = useRef(null);
    const animationRef = useRef(null);
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
    
    const config = { ...DEFAULT_FACE_CONFIG, ...faceConfig };
    
    const state = useRef({
        warmth: 0, energy: 0, openness: 0, positivity: 0,
        eyeOpenL: 1, eyeOpenR: 1,
        pupilX: 0, pupilY: 0, pupilSize: 1,
        browHeightL: 0, browHeightR: 0,
        browAngleL: 0, browAngleR: 0,
        mouthOpen: 0, mouthSmile: 0, mouthWidth: 1,
        blinkTimer: 2, blinkAmount: 0,
        breathPhase: 0, thinkPhase: 0,
        // Playful animation state
        idlePhase: 0,
        talkPhase: 0,
        faceX: 0, faceY: 0,
        talkBrowOffset: 0,
        headTilt: 0,
        squashStretch: 1,
        lastMouthOpen: 0,
        // Face following target - no random glancing, stay locked on!
        trackingFaceX: 0,
        trackingFaceY: 0,
        trackingTilt: 0,
    });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let lastTime = performance.now();

        const lerp = (current, target, speed) => {
            const diff = target - current;
            if (Math.abs(diff) < 0.001) return target;
            return current + diff * speed;
        };

        const draw = (timestamp) => {
            const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
            lastTime = timestamp;
            
            const s = state.current;
            const { width, height } = dimensions;
            const cx = width / 2;
            const cy = height / 2;
            const maxScale = config.maxScale || 1.0;
            const scale = Math.min(Math.min(width, height) / 600, maxScale);
            const amp = intensity * 1.5;

            // Update emotion lerping
            s.warmth = lerp(s.warmth, warmth, 0.08);
            s.energy = lerp(s.energy, energy, 0.08);
            s.openness = lerp(s.openness, openness, 0.08);
            s.positivity = lerp(s.positivity, positivity, 0.08);

            // ============================================
            // FACE TRACKING - Whole face follows user
            // ============================================
            s.idlePhase += dt * 0.5;
            s.breathPhase += dt * 0.6;
            
            const idleAmp = config.idleMovement || 1.0;
            let targetFaceX = 0;
            let targetFaceY = 0;
            let targetTilt = 0;
            
            // FACE FOLLOWING - whole face moves toward tracked target
            // NO random glancing away - stay locked on target!
            if (userFacePosition && userFacePosition.detected && !isThinking) {
                // Follow target - STRONG movement so it's obvious
                const followStrength = 120; // Increased from 80 - more pronounced movement
                const followSpeed = 0.15; // Faster response
                
                s.trackingFaceX = lerp(s.trackingFaceX, userFacePosition.x * followStrength * scale, followSpeed);
                s.trackingFaceY = lerp(s.trackingFaceY, userFacePosition.y * 80 * scale, followSpeed);
                // Tilt head more toward target
                s.trackingTilt = lerp(s.trackingTilt, -userFacePosition.x * 0.15, 0.12);
                
                targetFaceX = s.trackingFaceX;
                targetFaceY = s.trackingFaceY;
                targetTilt = s.trackingTilt;
            } else if (!isTalking && !isThinking) {
                // No face detected - very subtle idle movement
                s.trackingFaceX = lerp(s.trackingFaceX, 0, 0.02);
                s.trackingFaceY = lerp(s.trackingFaceY, 0, 0.02);
                s.trackingTilt = lerp(s.trackingTilt, 0, 0.02);
                
                // Gentle breathing animation only
                targetFaceX = Math.sin(s.idlePhase * 0.3) * 5 * idleAmp * scale + s.trackingFaceX;
                targetFaceY = Math.sin(s.idlePhase * 0.25) * 3 * idleAmp * scale + s.trackingFaceY;
                targetTilt = Math.sin(s.idlePhase * 0.2) * 0.01 * idleAmp + s.trackingTilt;
            }
            
            // Breathing adds subtle vertical movement
            const breath = Math.sin(s.breathPhase) * 3 * scale;
            targetFaceY += breath;
            
            s.faceX = lerp(s.faceX, targetFaceX, 0.06);
            s.faceY = lerp(s.faceY, targetFaceY, 0.06);
            s.headTilt = lerp(s.headTilt, targetTilt, 0.08);

            // ============================================
            // TALKING ANIMATIONS
            // ============================================
            // Only animate when actually talking AND mouth is moving
            const isActuallyTalking = isTalking && mouthOpenness > 0.05;
            
            if (isActuallyTalking) {
                s.talkPhase += dt * 8; // Fast phase for talk animations
                
                // Head bob synced to mouth movement
                const talkBobAmp = (config.talkHeadBob || 1.0) * scale;
                const mouthDelta = mouthOpenness - s.lastMouthOpen;
                s.lastMouthOpen = mouthOpenness;
                
                // Bounce on emphasis (when mouth opens quickly)
                if (mouthDelta > 0.1) {
                    s.squashStretch = 1.03;
                }
                s.squashStretch = lerp(s.squashStretch, 1, 0.15);
                
                // Add subtle talk bob ON TOP of tracking position (don't override it!)
                const talkBobX = Math.sin(s.talkPhase * 0.5) * 8 * talkBobAmp * 0.3;
                const talkBobY = Math.sin(s.talkPhase * 0.7) * 5 * talkBobAmp * 0.3;
                const talkTilt = Math.sin(s.talkPhase * 0.3) * 0.015;
                
                // If tracking something, add talk bob to tracking position
                if (userFacePosition && userFacePosition.detected) {
                    s.faceX = lerp(s.faceX, s.trackingFaceX + talkBobX, 0.1);
                    s.faceY = lerp(s.faceY, s.trackingFaceY + talkBobY + breath, 0.1);
                    s.headTilt = lerp(s.headTilt, s.trackingTilt + talkTilt, 0.1);
                } else {
                    // No tracking - just do talk bob
                    s.faceX = lerp(s.faceX, talkBobX, 0.1);
                    s.faceY = lerp(s.faceY, talkBobY + breath, 0.1);
                    s.headTilt = lerp(s.headTilt, talkTilt, 0.1);
                }
                
                // Eyebrow bounce when talking - synced to mouth openness
                const browBounceAmp = (config.talkBrowBounce || 1.0);
                s.talkBrowOffset = lerp(s.talkBrowOffset, -mouthOpenness * 8 * browBounceAmp * scale, 0.3);
            } else {
                s.talkBrowOffset = lerp(s.talkBrowOffset, 0, 0.1);
                s.squashStretch = lerp(s.squashStretch, 1, 0.1);
                s.lastMouthOpen = mouthOpenness; // Track even when not talking
            }

            // ============================================
            // THINKING ANIMATION
            // ============================================
            if (isThinking) {
                s.thinkPhase += dt * config.thinkingSpeed;
                // Thinking has subtle concentrated movement
                targetFaceX = Math.sin(s.thinkPhase * 0.3) * 10 * scale;
                targetFaceY = breath + Math.sin(s.thinkPhase * 0.2) * 5 * scale;
                s.faceX = lerp(s.faceX, targetFaceX, 0.05);
                s.faceY = lerp(s.faceY, targetFaceY, 0.05);
            }

            // ============================================
            // BLINKING
            // ============================================
            s.blinkTimer -= dt;
            if (s.blinkTimer <= 0) {
                s.blinkAmount = 1;
                // Blink more when talking (expressive)
                s.blinkTimer = isTalking ? (1.5 + Math.random() * 2) : (2.5 + Math.random() * 2.5);
            }
            if (s.blinkAmount > 0) {
                s.blinkAmount = Math.max(0, s.blinkAmount - dt * 10);
            }
            const blink = Math.sin(s.blinkAmount * Math.PI);

            // ============================================
            // EYE OPENNESS
            // ============================================
            let targetEyeOpenL = 0.85;
            let targetEyeOpenR = 0.85;

            // Squint slightly when smiling big
            if (s.positivity > 0.5 && s.warmth > 0) {
                targetEyeOpenL = 0.75;
                targetEyeOpenR = 0.75;
            }

            // Sad droopy eyes
            if (s.positivity < -0.5 && s.warmth > 0) {
                targetEyeOpenL = 0.8;
                targetEyeOpenR = 0.8;
            }

            // Angry squint
            if (s.warmth < -0.5 && s.positivity > -0.5) {
                targetEyeOpenL = 0.8;
                targetEyeOpenR = 0.8;
            }

            // Surprised wide eyes
            if (s.openness > 0.5 && s.positivity >= 0) {
                targetEyeOpenL = 1.1 + s.openness * 0.15;
                targetEyeOpenR = 1.1 + s.openness * 0.15;
            }

            // Scared wide eyes
            if (s.openness > 0.5 && s.positivity < 0 && s.warmth >= -0.3) {
                targetEyeOpenL = 1.0 + s.openness * 0.1;
                targetEyeOpenR = 1.0 + s.openness * 0.1;
            }

            // Excited bright eyes
            if (s.energy > 0.5 && s.positivity > 0.3) {
                targetEyeOpenL = 0.95;
                targetEyeOpenR = 0.95;
            }

            // Disgusted asymmetric squint
            if (s.warmth < -0.4 && s.openness < -0.3) {
                targetEyeOpenL = 0.6;
                targetEyeOpenR = 0.8;
            }

            // Skeptical one eye squint
            if (s.warmth < 0 && s.warmth > -0.5 && s.openness < -0.2) {
                targetEyeOpenL = 0.55;
                targetEyeOpenR = 0.85;
            }

            // Thinking concentrated
            if (isThinking) {
                targetEyeOpenL = 0.75;
                targetEyeOpenR = 0.75;
            }

            // Worried
            if (s.warmth > 0.3 && s.positivity < -0.3 && s.openness > 0) {
                targetEyeOpenL = 0.9;
                targetEyeOpenR = 0.9;
            }

            // Apply blink
            targetEyeOpenL *= (1 - blink * 0.95);
            targetEyeOpenR *= (1 - blink * 0.95);
            targetEyeOpenL = Math.max(0.05, Math.min(1.3, targetEyeOpenL));
            targetEyeOpenR = Math.max(0.05, Math.min(1.3, targetEyeOpenR));

            s.eyeOpenL = lerp(s.eyeOpenL, targetEyeOpenL, 0.2);
            s.eyeOpenR = lerp(s.eyeOpenR, targetEyeOpenR, 0.2);

            // ============================================
            // PUPILS - Eyes follow user within the face
            // ============================================
            // Use lookAt from CanvasWindow (which includes random idle movement)
            // Much larger multipliers for more noticeable movement
            let targetPupilX = lookAt.x * 25 * scale;  // Increased from 15
            let targetPupilY = lookAt.y * 18 * scale;  // Increased from 10
            
            // Eyes follow user (additional movement on top of face following)
            if (userFacePosition && userFacePosition.detected && !isThinking) {
                // Eyes look toward target - MORE PRONOUNCED movement
                // Pupils move MORE than the face to really lock on
                targetPupilX = userFacePosition.x * 28 * scale; // Increased from 22
                targetPupilY = userFacePosition.y * 20 * scale; // Increased from 16
                s.pupilX = lerp(s.pupilX, targetPupilX, 0.35); // Faster response
                s.pupilY = lerp(s.pupilY, targetPupilY, 0.35);
            } else if (isThinking) {
                const freqX = config.thinkingFreqX || 2.5;
                const freqY = config.thinkingFreqY || 1.7;
                targetPupilX = Math.sin(s.thinkPhase * freqX) * config.thinkingRangeX * scale;
                targetPupilY = config.thinkingBaseY * scale + Math.sin(s.thinkPhase * freqY) * config.thinkingRangeY * scale;
                s.pupilX = lerp(s.pupilX, targetPupilX, 0.08);
                s.pupilY = lerp(s.pupilY, targetPupilY, 0.08);
            } else if (isTalking) {
                // Eyes stay mostly still while talking - look forward
                targetPupilX = 0;
                targetPupilY = 0;
                s.pupilX = lerp(s.pupilX, targetPupilX, 0.1);
                s.pupilY = lerp(s.pupilY, targetPupilY, 0.1);
            } else {
                // Idle - subtle pupil movement based on lookAt
                targetPupilX = lookAt.x * 12 * scale;
                targetPupilY = lookAt.y * 8 * scale;
                s.pupilX = lerp(s.pupilX, targetPupilX, 0.08);
                s.pupilY = lerp(s.pupilY, targetPupilY, 0.08);
            }

            // Pupil size based on emotion
            let targetPupilSize = 0.9;
            if (s.warmth > 0.3) targetPupilSize += s.warmth * 0.25;
            if (s.warmth < -0.3) targetPupilSize -= Math.abs(s.warmth) * 0.15;
            if (s.openness > 0.5 && s.positivity < 0) targetPupilSize += 0.1;
            // Slightly larger pupils when excited/talking
            if (isTalking && s.positivity > 0) targetPupilSize += 0.1;
            s.pupilSize = lerp(s.pupilSize, targetPupilSize, 0.1);

            // ============================================
            // EYEBROWS
            // ============================================
            let targetBrowHeightL = 0;
            let targetBrowHeightR = 0;
            let targetBrowAngleL = 0;
            let targetBrowAngleR = 0;

            // Happy raised brows
            if (s.positivity > 0.5 && s.warmth > 0) {
                targetBrowHeightL = -5 * scale;
                targetBrowHeightR = -5 * scale;
                targetBrowAngleL = 0.05;
                targetBrowAngleR = 0.05;
            }

            // Sad inner brows raised
            if (s.positivity < -0.5 && s.warmth > 0) {
                targetBrowHeightL = -3 * scale;
                targetBrowHeightR = -3 * scale;
                targetBrowAngleL = 0.4 * amp;
                targetBrowAngleR = 0.4 * amp;
            }

            // Angry V-brows
            if (s.warmth < -0.5 && s.positivity > -0.5) {
                targetBrowHeightL = 8 * scale;
                targetBrowHeightR = 8 * scale;
                targetBrowAngleL = -0.5 * amp;
                targetBrowAngleR = -0.5 * amp;
            }

            // Surprised high arched brows
            if (s.openness > 0.5 && s.positivity >= 0) {
                targetBrowHeightL = -25 * amp * scale;
                targetBrowHeightR = -25 * amp * scale;
                targetBrowAngleL = 0.15;
                targetBrowAngleR = 0.15;
            }

            // Scared worried brows
            if (s.openness > 0.5 && s.positivity < 0 && s.warmth >= -0.3) {
                targetBrowHeightL = -18 * amp * scale;
                targetBrowHeightR = -18 * amp * scale;
                targetBrowAngleL = 0.45 * amp;
                targetBrowAngleR = 0.45 * amp;
            }

            // Excited raised brows
            if (s.energy > 0.5 && s.positivity > 0.3) {
                targetBrowHeightL = -12 * amp * scale;
                targetBrowHeightR = -12 * amp * scale;
                targetBrowAngleL = 0.1;
                targetBrowAngleR = 0.1;
            }

            // Disgusted asymmetric
            if (s.warmth < -0.4 && s.openness < -0.3) {
                targetBrowHeightL = -8 * scale;
                targetBrowHeightR = -5 * scale;
                targetBrowAngleL = -0.2;
                targetBrowAngleR = -0.1;
            }

            // Skeptical one brow raised
            if (s.warmth < 0 && s.warmth > -0.5 && s.openness < -0.2) {
                targetBrowHeightL = 5 * scale;
                targetBrowHeightR = -20 * amp * scale;
                targetBrowAngleL = -0.1;
                targetBrowAngleR = 0.2;
            }

            // Smug slight V
            if (s.warmth > 0 && s.positivity > 0.2 && s.openness < 0) {
                targetBrowHeightL = 0;
                targetBrowHeightR = 0;
                targetBrowAngleL = -0.12;
                targetBrowAngleR = -0.12;
            }

            // Thinking furrowed
            if (isThinking) {
                targetBrowHeightL = 5 * scale;
                targetBrowHeightR = 4 * scale;
                targetBrowAngleL = -0.15;
                targetBrowAngleR = -0.12;
            }

            // Worried
            if (s.warmth > 0.3 && s.positivity < -0.3 && s.openness > 0) {
                targetBrowHeightL = -10 * scale;
                targetBrowHeightR = -10 * scale;
                targetBrowAngleL = 0.5 * amp;
                targetBrowAngleR = 0.5 * amp;
            }

            // Add talk bounce to brows
            targetBrowHeightL += s.talkBrowOffset;
            targetBrowHeightR += s.talkBrowOffset;
            
            // Subtle brow movement when talking (expressive) - only when mouth is moving
            if (isTalking && mouthOpenness > 0.05) {
                const talkBrowVar = Math.sin(s.talkPhase * 0.8) * 2 * scale;
                targetBrowHeightL += talkBrowVar;
                targetBrowHeightR += talkBrowVar * 0.8; // Slight asymmetry for character
            }

            s.browHeightL = lerp(s.browHeightL, targetBrowHeightL, 0.15);
            s.browHeightR = lerp(s.browHeightR, targetBrowHeightR, 0.15);
            s.browAngleL = lerp(s.browAngleL, targetBrowAngleL, 0.1);
            s.browAngleR = lerp(s.browAngleR, targetBrowAngleR, 0.1);

            // ============================================
            // MOUTH
            // ============================================
            let targetMouthOpen = isTalking ? mouthOpenness * 0.8 : 0;
            let targetMouthSmile = 0;
            let targetMouthWidth = 1;

            // Happy smile
            if (s.positivity > 0.5 && s.warmth > 0) {
                targetMouthSmile = s.positivity * 0.8 * amp;
                targetMouthWidth = 1 + s.positivity * 0.2;
            }

            // Sad frown
            if (s.positivity < -0.5 && s.warmth > 0) {
                targetMouthSmile = -0.35 * amp;
                targetMouthWidth = 0.9;
            }

            // Angry tense mouth
            if (s.warmth < -0.5 && s.positivity > -0.5) {
                targetMouthSmile = -0.25 * amp;
                targetMouthWidth = 0.85;
                if (!isTalking) targetMouthOpen = 0.03;
            }

            // Surprised O mouth
            if (s.openness > 0.5 && s.positivity >= 0) {
                if (!isTalking) targetMouthOpen = 0.5 * amp;
                targetMouthWidth = 0.6;
                targetMouthSmile = 0;
            }

            // Scared open mouth
            if (s.openness > 0.5 && s.positivity < 0 && s.warmth >= -0.3) {
                if (!isTalking) targetMouthOpen = 0.35 * amp;
                targetMouthWidth = 0.65;
                targetMouthSmile = -0.15;
            }

            // Excited big smile
            if (s.energy > 0.5 && s.positivity > 0.3) {
                targetMouthSmile = 0.9 * amp;
                targetMouthWidth = 1.25;
            }

            // Smug smile
            if (s.warmth > 0 && s.positivity > 0.2 && s.openness < 0) {
                targetMouthSmile = 0.55 * amp;
                targetMouthWidth = 1.1;
            }

            // Thinking pursed
            if (isThinking) {
                targetMouthWidth = 0.6;
                targetMouthSmile = 0;
                targetMouthOpen = 0;
            }

            // Worried
            if (s.warmth > 0.3 && s.positivity < -0.3 && s.openness > 0) {
                targetMouthSmile = -0.3 * amp;
                targetMouthWidth = 0.85;
            }

            // Disgusted
            if (s.warmth < -0.4 && s.openness < -0.3) {
                targetMouthSmile = -0.4 * amp;
                targetMouthWidth = 0.8;
            }

            s.mouthOpen = lerp(s.mouthOpen, targetMouthOpen, 0.25);
            s.mouthSmile = lerp(s.mouthSmile, targetMouthSmile, 0.12);
            s.mouthWidth = lerp(s.mouthWidth, targetMouthWidth, 0.12);

            // ============================================
            // RENDERING
            // ============================================
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, width, height);
            
            ctx.save();
            
            // Apply face position, tilt, and squash/stretch
            ctx.translate(cx + s.faceX, cy + s.faceY);
            ctx.rotate(s.headTilt);
            ctx.scale(1 / s.squashStretch, s.squashStretch); // Squash horizontally, stretch vertically
            
            // GLOW EFFECT - subtle neon glow on lines using face color
            const glowIntensity = 0.3 + (isTalking ? 0.2 : 0) + (s.positivity > 0 ? s.positivity * 0.2 : 0);
            
            // Parse faceColor to create glow version
            let glowColor = faceColor;
            if (faceColor.startsWith('#')) {
                const r = parseInt(faceColor.slice(1, 3), 16);
                const g = parseInt(faceColor.slice(3, 5), 16);
                const b = parseInt(faceColor.slice(5, 7), 16);
                glowColor = `rgba(${r}, ${g}, ${b}, 0.6)`;
            }
            
            ctx.shadowColor = glowColor;
            ctx.shadowBlur = 15 * scale * glowIntensity;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            
            ctx.strokeStyle = faceColor;
            ctx.fillStyle = faceColor;
            ctx.lineWidth = config.lineThickness * scale;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            // --- EYES ---
            const eyeSpacing = config.eyeSpacing * scale;
            const eyeY = config.eyeY * scale;
            const baseEyeW = config.eyeWidth * scale;
            const baseEyeH = config.eyeHeight * scale;

            const leftEyeH = baseEyeH * s.eyeOpenL;
            ctx.beginPath();
            ctx.ellipse(-eyeSpacing, eyeY, baseEyeW, Math.max(3, leftEyeH), 0, 0, Math.PI * 2);
            ctx.stroke();
            
            if (leftEyeH > 6) {
                const pupilR = (config.pupilSize * s.pupilSize) * scale;
                ctx.beginPath();
                ctx.arc(-eyeSpacing + s.pupilX, eyeY + s.pupilY, pupilR, 0, Math.PI * 2);
                ctx.fill();
            }

            const rightEyeH = baseEyeH * s.eyeOpenR;
            ctx.beginPath();
            ctx.ellipse(eyeSpacing, eyeY, baseEyeW, Math.max(3, rightEyeH), 0, 0, Math.PI * 2);
            ctx.stroke();
            
            if (rightEyeH > 6) {
                const pupilR = (config.pupilSize * s.pupilSize) * scale;
                ctx.beginPath();
                ctx.arc(eyeSpacing + s.pupilX, eyeY + s.pupilY, pupilR, 0, Math.PI * 2);
                ctx.fill();
            }

            // --- EYEBROWS ---
            const browY = config.browY * scale;
            const browLen = config.browLength * scale;
            const browInnerMult = config.browInnerAngleMult || 18;
            const browOuterMult = config.browOuterAngleMult || 10;
            ctx.lineWidth = config.browThickness * scale;

            const lbInnerX = -eyeSpacing + browLen * 0.35;
            const lbOuterX = -eyeSpacing - browLen * 0.45;
            const lbInnerY = browY + s.browHeightL + s.browAngleL * browInnerMult * scale;
            const lbOuterY = browY + s.browHeightL - s.browAngleL * browOuterMult * scale;
            ctx.beginPath();
            ctx.moveTo(lbOuterX, lbOuterY);
            ctx.lineTo(lbInnerX, lbInnerY);
            ctx.stroke();

            const rbInnerX = eyeSpacing - browLen * 0.35;
            const rbOuterX = eyeSpacing + browLen * 0.45;
            const rbInnerY = browY + s.browHeightR + s.browAngleR * browInnerMult * scale;
            const rbOuterY = browY + s.browHeightR - s.browAngleR * browOuterMult * scale;
            ctx.beginPath();
            ctx.moveTo(rbOuterX, rbOuterY);
            ctx.lineTo(rbInnerX, rbInnerY);
            ctx.stroke();

            // --- MOUTH ---
            ctx.lineWidth = config.mouthThickness * scale;
            const mouthYPos = config.mouthY * scale;
            const mouthW = config.mouthWidth * scale * s.mouthWidth;
            const mouthOpenH = config.mouthOpenHeight || 28;
            const smileMult = config.smileCurveMult || 30;
            const frownDrop = config.frownCornerDrop || 10;
            
            const mouthH = s.mouthOpen * mouthOpenH * scale;
            const smileCurve = s.mouthSmile * smileMult * scale;

            const mLeftX = -mouthW;
            const mRightX = mouthW;
            const cornerDrop = s.mouthSmile < 0 ? Math.abs(s.mouthSmile) * frownDrop * scale : 0;

            if (mouthH > 5) {
                ctx.beginPath();
                ctx.moveTo(mLeftX, mouthYPos + cornerDrop);
                ctx.quadraticCurveTo(0, mouthYPos + smileCurve + mouthH, mRightX, mouthYPos + cornerDrop);
                ctx.stroke();
                
                ctx.beginPath();
                ctx.moveTo(mLeftX, mouthYPos + cornerDrop);
                ctx.quadraticCurveTo(0, mouthYPos + smileCurve * 0.3 - mouthH * 0.3, mRightX, mouthYPos + cornerDrop);
                ctx.stroke();
            } else {
                ctx.beginPath();
                ctx.moveTo(mLeftX, mouthYPos + cornerDrop);
                ctx.quadraticCurveTo(0, mouthYPos + smileCurve, mRightX, mouthYPos + cornerDrop);
                ctx.stroke();
            }

            ctx.restore();
            animationRef.current = requestAnimationFrame(draw);
        };

        animationRef.current = requestAnimationFrame(draw);
        return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
    }, [warmth, energy, openness, positivity, intensity, isTalking, isThinking, mouthOpenness, mouthShape, lookAt, dimensions, config, faceColor]);

    useEffect(() => {
        const updateDimensions = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            
            // Use the parent container's size - fill entirely
            const parent = canvas.parentElement;
            if (parent) {
                const rect = parent.getBoundingClientRect();
                const width = Math.floor(rect.width) || 800;
                const height = Math.floor(rect.height) || 600;
                setDimensions({ width, height });
            } else {
                setDimensions({ width: window.innerWidth, height: window.innerHeight });
            }
        };
        
        // Initial measurement after a small delay to ensure parent is rendered
        const timeoutId = setTimeout(updateDimensions, 50);
        
        // ResizeObserver for container size changes
        const canvas = canvasRef.current;
        const parent = canvas?.parentElement;
        let resizeObserver = null;
        
        if (parent && typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(updateDimensions);
            resizeObserver.observe(parent);
        }
        
        // Also listen to window resize as fallback
        window.addEventListener('resize', updateDimensions);
        
        return () => {
            clearTimeout(timeoutId);
            window.removeEventListener('resize', updateDimensions);
            if (resizeObserver) resizeObserver.disconnect();
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            width={dimensions.width}
            height={dimensions.height}
            style={{ 
                display: 'block', 
                width: '100%',
                height: '100%',
                backgroundColor: '#000'
            }}
        />
    );
};

export default Face2D;
