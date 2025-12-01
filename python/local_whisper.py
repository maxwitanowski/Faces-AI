import sys
import os
import speech_recognition as sr
import numpy as np
import warnings
from faster_whisper import WhisperModel

# Suppress warnings
warnings.filterwarnings("ignore")

def log(msg):
    print(f"[Python] {msg}", file=sys.stderr)
    sys.stderr.flush()

def send_text(text):
    # Format explicitly for the Node.js parent to parse
    print(f"TEXT:{text}")
    sys.stdout.flush()

log("Initializing High-Performance Local Whisper (tiny.en)...")

# 1. Load Faster Whisper Model (tiny.en is super fast on CPU)
# device="cpu" or "cuda"
import torch
device = "cuda" if torch.cuda.is_available() else "cpu"
compute_type = "float16" if device == "cuda" else "int8"

log(f"Device: {device}, Compute: {compute_type}")

try:
    model = WhisperModel("tiny.en", device=device, compute_type=compute_type)
    log("Model loaded successfully.")
except Exception as e:
    log(f"Error loading model: {e}")
    sys.exit(1)

# 2. Setup Microphone
recognizer = sr.Recognizer()
recognizer.energy_threshold = 300  # Adjust for sensitivity
recognizer.pause_threshold = 0.8   # Wait 0.8s of silence to consider sentence done
recognizer.dynamic_energy_threshold = True

def record_loop():
    with sr.Microphone(sample_rate=16000) as source:
        log("Calibrating microphone...")
        recognizer.adjust_for_ambient_noise(source, duration=1)
        log("Listening... (Say something!)")
        
        while True:
            try:
                # Listen for audio (blocks until phrase found)
                audio = recognizer.listen(source, timeout=None)
                
                # Convert to raw bytes
                audio_data = audio.get_wav_data()
                
                # Create a temporary file-like object or save to disk?
                # Faster-whisper accepts a binary stream if it has a read method, or a file path.
                # But get_wav_data returns bytes. 
                # We can use io.BytesIO
                import io
                audio_stream = io.BytesIO(audio_data)
                
                # Transcribe
                segments, info = model.transcribe(audio_stream, beam_size=5)
                
                full_text = ""
                for segment in segments:
                    full_text += segment.text
                
                full_text = full_text.strip()
                if full_text:
                    log(f"Recognized: {full_text}")
                    send_text(full_text)
                    
            except Exception as e:
                log(f"Error in loop: {e}")
                continue

if __name__ == "__main__":
    try:
        record_loop()
    except KeyboardInterrupt:
        pass
