import sys
import os
import json
import wave
import struct
import urllib.request
import tempfile
import uuid
import traceback

# Suppress warnings
import warnings
warnings.filterwarnings("ignore")

def download_model(model_dir):
    # Default model: en_US-lessac-medium
    model_name = "en_US-lessac-medium"
    base_url = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium"
    onnx_url = f"{base_url}/{model_name}.onnx"
    json_url = f"{base_url}/{model_name}.onnx.json"
    
    onnx_path = os.path.join(model_dir, f"{model_name}.onnx")
    json_path = os.path.join(model_dir, f"{model_name}.onnx.json")
    
    if not os.path.exists(onnx_path) or not os.path.exists(json_path):
        print(f"Downloading Piper model ({model_name})...", file=sys.stderr)
        try:
            urllib.request.urlretrieve(onnx_url, onnx_path)
            urllib.request.urlretrieve(json_url, json_path)
            print("Model downloaded.", file=sys.stderr)
        except Exception as e:
            print(f"Failed to download model: {e}", file=sys.stderr)
            return None, None
            
    return onnx_path, json_path

def main():
    try:
        # Lazy import to avoid startup delay if not used
        try:
            from piper import PiperVoice
            from piper.config import SynthesisConfig
        except ImportError:
            print(json.dumps({"success": False, "error": "piper-tts not installed. Run: pip install piper-tts"}), file=sys.stdout)
            sys.stdout.flush()
            return

        # Setup model storage
        model_dir = os.path.join(os.path.dirname(__file__), "models")
        os.makedirs(model_dir, exist_ok=True)
        
        onnx_path, json_path = download_model(model_dir)
        if not onnx_path:
            return

        print(f"Initializing Piper TTS...", file=sys.stderr)
        voice = PiperVoice.load(onnx_path, config_path=json_path)
        print("Piper TTS Ready", file=sys.stderr)
        sys.stdout.flush()

        for line in sys.stdin:
            text = line.strip()
            if not text:
                continue

            try:
                # Create temp file
                fd, wav_path = tempfile.mkstemp(suffix=".wav")
                os.close(fd)
                
                with wave.open(wav_path, "wb") as wav_file:
                    # Configure wave file
                    wav_file.setnchannels(1)
                    wav_file.setsampwidth(2) # 16-bit
                    wav_file.setframerate(voice.config.sample_rate)
                    
                    # Configure reduced noise settings
                    # noise_scale: Controls variability (lower = more robotic/stable, higher = more expressive/noisy)
                    # noise_w_scale: Controls phoneme duration variability
                    syn_config = SynthesisConfig(
                        noise_scale=0.333,  # Default is often 0.667
                        noise_w_scale=0.333, # Default is often 0.8
                        length_scale=1.0
                    )
                    
                    # Manual Synthesis Path (since direct synthesize isn't writing correctly on some systems)
                    for phoneme_list in voice.phonemize(text):
                        phoneme_ids = voice.phonemes_to_ids(phoneme_list)
                        audio_bytes = voice.phoneme_ids_to_audio(phoneme_ids, syn_config)
                        wav_file.writeframes(audio_bytes)
                
                # Send filename back
                print(json.dumps({"success": True, "file": wav_path}))
                sys.stdout.flush()
                
            except Exception as e:
                print(json.dumps({"success": False, "error": str(e)}))
                sys.stdout.flush()
                traceback.print_exc(file=sys.stderr)

    except Exception as e:
        print(f"Critical Piper Error: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()

