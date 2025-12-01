import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Controllable 3D Face Component
const Face3D = ({ 
    emotion = 'idle',      // idle, happy, sad, surprised, thinking, angry
    isTalking = false,     // Whether mouth should animate
    mouthOpenness = 0,     // 0-1 for lip sync
    lookAt = { x: 0, y: 0 } // Where eyes are looking (-1 to 1)
}) => {
    const groupRef = useRef();
    const leftEyeRef = useRef();
    const rightEyeRef = useRef();
    const leftPupilRef = useRef();
    const rightPupilRef = useRef();
    const mouthRef = useRef();
    const leftBrowRef = useRef();
    const rightBrowRef = useRef();
    const leftLidRef = useRef();
    const rightLidRef = useRef();

    // Blink state
    const blinkRef = useRef({ 
        nextBlink: Math.random() * 3 + 2, 
        blinking: false, 
        blinkProgress: 0 
    });

    // Idle animation state
    const idleRef = useRef({ time: 0 });

    // Emotion presets
    const emotionPresets = useMemo(() => ({
        idle: {
            browHeight: 0,
            browAngle: 0,
            eyeScale: 1,
            mouthCurve: 0,
            mouthWidth: 1
        },
        happy: {
            browHeight: 0.05,
            browAngle: 0,
            eyeScale: 0.9,
            mouthCurve: 0.3,
            mouthWidth: 1.2
        },
        sad: {
            browHeight: 0.1,
            browAngle: 0.2,
            eyeScale: 1,
            mouthCurve: -0.2,
            mouthWidth: 0.8
        },
        surprised: {
            browHeight: 0.2,
            browAngle: 0,
            eyeScale: 1.3,
            mouthCurve: 0,
            mouthWidth: 0.6
        },
        thinking: {
            browHeight: 0.05,
            browAngle: -0.15,
            eyeScale: 0.95,
            mouthCurve: 0,
            mouthWidth: 0.9
        },
        angry: {
            browHeight: -0.1,
            browAngle: -0.3,
            eyeScale: 0.85,
            mouthCurve: -0.15,
            mouthWidth: 1.1
        }
    }), []);

    useFrame((state, delta) => {
        const preset = emotionPresets[emotion] || emotionPresets.idle;
        idleRef.current.time += delta;

        // Subtle idle movement
        const idleX = Math.sin(idleRef.current.time * 0.5) * 0.02;
        const idleY = Math.sin(idleRef.current.time * 0.3) * 0.01;

        // Blink logic
        blinkRef.current.nextBlink -= delta;
        if (blinkRef.current.nextBlink <= 0 && !blinkRef.current.blinking) {
            blinkRef.current.blinking = true;
            blinkRef.current.blinkProgress = 0;
        }
        if (blinkRef.current.blinking) {
            blinkRef.current.blinkProgress += delta * 8;
            if (blinkRef.current.blinkProgress >= 1) {
                blinkRef.current.blinking = false;
                blinkRef.current.nextBlink = Math.random() * 4 + 2;
            }
        }
        const blinkAmount = blinkRef.current.blinking 
            ? Math.sin(blinkRef.current.blinkProgress * Math.PI) 
            : 0;

        // Update pupils (eye tracking)
        if (leftPupilRef.current && rightPupilRef.current) {
            const pupilRange = 0.08;
            leftPupilRef.current.position.x = lookAt.x * pupilRange + idleX;
            leftPupilRef.current.position.y = lookAt.y * pupilRange + idleY;
            rightPupilRef.current.position.x = lookAt.x * pupilRange + idleX;
            rightPupilRef.current.position.y = lookAt.y * pupilRange + idleY;
        }

        // Update eyelids (blinking)
        if (leftLidRef.current && rightLidRef.current) {
            const lidScale = 1 - blinkAmount;
            leftLidRef.current.scale.y = Math.max(0.1, lidScale * preset.eyeScale);
            rightLidRef.current.scale.y = Math.max(0.1, lidScale * preset.eyeScale);
        }

        // Update eyebrows
        if (leftBrowRef.current && rightBrowRef.current) {
            leftBrowRef.current.position.y = 0.55 + preset.browHeight;
            rightBrowRef.current.position.y = 0.55 + preset.browHeight;
            leftBrowRef.current.rotation.z = preset.browAngle;
            rightBrowRef.current.rotation.z = -preset.browAngle;
        }

        // Update mouth
        if (mouthRef.current) {
            // Mouth openness for talking
            const targetOpen = isTalking ? mouthOpenness * 0.15 : 0;
            mouthRef.current.scale.y = 0.3 + targetOpen + Math.abs(preset.mouthCurve) * 0.5;
            mouthRef.current.scale.x = preset.mouthWidth;
            
            // Mouth curve (smile/frown)
            mouthRef.current.position.y = -0.35 + preset.mouthCurve * 0.1;
        }
    });

    return (
        <group ref={groupRef}>
            {/* Head */}
            <mesh position={[0, 0, 0]}>
                <sphereGeometry args={[1, 32, 32]} />
                <meshStandardMaterial color="#FFD4B8" roughness={0.8} />
            </mesh>

            {/* Left Eye Socket */}
            <group position={[-0.35, 0.2, 0.85]}>
                {/* Eye white */}
                <mesh ref={leftEyeRef}>
                    <sphereGeometry args={[0.18, 16, 16]} />
                    <meshStandardMaterial color="white" />
                </mesh>
                {/* Pupil */}
                <mesh ref={leftPupilRef} position={[0, 0, 0.12]}>
                    <sphereGeometry args={[0.08, 16, 16]} />
                    <meshStandardMaterial color="#2C1810" />
                </mesh>
                {/* Iris */}
                <mesh position={[0, 0, 0.1]}>
                    <sphereGeometry args={[0.12, 16, 16]} />
                    <meshStandardMaterial color="#4A90D9" />
                </mesh>
                {/* Eyelid (for blinking) */}
                <mesh ref={leftLidRef} position={[0, 0.1, 0.05]} scale={[1.2, 1, 0.5]}>
                    <sphereGeometry args={[0.15, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
                    <meshStandardMaterial color="#FFD4B8" side={THREE.DoubleSide} />
                </mesh>
            </group>

            {/* Right Eye Socket */}
            <group position={[0.35, 0.2, 0.85]}>
                {/* Eye white */}
                <mesh ref={rightEyeRef}>
                    <sphereGeometry args={[0.18, 16, 16]} />
                    <meshStandardMaterial color="white" />
                </mesh>
                {/* Pupil */}
                <mesh ref={rightPupilRef} position={[0, 0, 0.12]}>
                    <sphereGeometry args={[0.08, 16, 16]} />
                    <meshStandardMaterial color="#2C1810" />
                </mesh>
                {/* Iris */}
                <mesh position={[0, 0, 0.1]}>
                    <sphereGeometry args={[0.12, 16, 16]} />
                    <meshStandardMaterial color="#4A90D9" />
                </mesh>
                {/* Eyelid (for blinking) */}
                <mesh ref={rightLidRef} position={[0, 0.1, 0.05]} scale={[1.2, 1, 0.5]}>
                    <sphereGeometry args={[0.15, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
                    <meshStandardMaterial color="#FFD4B8" side={THREE.DoubleSide} />
                </mesh>
            </group>

            {/* Left Eyebrow */}
            <mesh ref={leftBrowRef} position={[-0.35, 0.55, 0.9]} rotation={[0, 0, 0]}>
                <boxGeometry args={[0.25, 0.04, 0.05]} />
                <meshStandardMaterial color="#4A3728" />
            </mesh>

            {/* Right Eyebrow */}
            <mesh ref={rightBrowRef} position={[0.35, 0.55, 0.9]} rotation={[0, 0, 0]}>
                <boxGeometry args={[0.25, 0.04, 0.05]} />
                <meshStandardMaterial color="#4A3728" />
            </mesh>

            {/* Nose */}
            <mesh position={[0, -0.05, 0.95]} rotation={[0.3, 0, 0]}>
                <coneGeometry args={[0.08, 0.2, 8]} />
                <meshStandardMaterial color="#FFCAA8" />
            </mesh>

            {/* Mouth */}
            <mesh ref={mouthRef} position={[0, -0.35, 0.9]} scale={[1, 0.3, 1]}>
                <capsuleGeometry args={[0.08, 0.2, 8, 16]} />
                <meshStandardMaterial color="#CC6666" />
            </mesh>

            {/* Ears */}
            <mesh position={[-0.95, 0, 0]} rotation={[0, 0, 0.2]}>
                <sphereGeometry args={[0.15, 8, 8]} />
                <meshStandardMaterial color="#FFD4B8" />
            </mesh>
            <mesh position={[0.95, 0, 0]} rotation={[0, 0, -0.2]}>
                <sphereGeometry args={[0.15, 8, 8]} />
                <meshStandardMaterial color="#FFD4B8" />
            </mesh>
        </group>
    );
};

export default Face3D;



