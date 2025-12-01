import sys
import os
import json
import soundfile as sf
from kokoro import KPipeline
import torch
import warnings
import tempfile
import uuid

# Suppress warnings
warnings.filterwarnings("ignore")

def main():
    try:
        # Initialize pipeline (lang_code='a' is American English)
        print(f"Initializing Kokoro TTS...", file=sys.stderr)
        
        # This triggers model download on first run
        pipeline = KPipeline(lang_code='a') 
        
        print("Kokoro TTS Ready", file=sys.stderr)
        sys.stdout.flush()

        for line in sys.stdin:
            text = line.strip()
            if not text:
                continue

            try:
                # Generate audio
                # voice='af_heart' is from the snippet
                generator = pipeline(text, voice='af_heart', speed=1)
                
                # Combine all chunks if multiple
                all_audio = []
                for i, (gs, ps, audio) in enumerate(generator):
                    if len(audio) > 0:
                        all_audio.extend(audio)
                
                if not all_audio:
                    continue
                    
                # Save to a temporary file
                filename = os.path.join(tempfile.gettempdir(), f"faces_tts_{uuid.uuid4()}.wav")
                
                sf.write(filename, all_audio, 24000)
                
                # Send filename back to Electron
                print(json.dumps({"success": True, "file": filename}))
                sys.stdout.flush()
            except Exception as e:
                print(json.dumps({"success": False, "error": str(e)}))
                sys.stdout.flush()

    except Exception as e:
        print(f"Critical Error: {e}", file=sys.stderr)
        # Keep running so we don't crash the Electron process immediately, but maybe exit?
        # Better to exit if init fails.
        sys.exit(1)

if __name__ == "__main__":
    main()

