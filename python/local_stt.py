import sys
import json
import os
import warnings
import traceback

# Suppress warnings
warnings.filterwarnings("ignore")

def main():
    try:
        # Try faster-whisper first
        try:
            from faster_whisper import WhisperModel
            print("Initializing Faster Whisper (small.en)...", file=sys.stderr)
            # Use int8 on CPU for speed
            model = WhisperModel("small.en", device="cpu", compute_type="int8")
            print("Faster Whisper Ready", file=sys.stderr)
            sys.stdout.flush()

            for line in sys.stdin:
                try:
                    req = json.loads(line.strip())
                    audio_path = req.get("audio_path")
                    
                    if not audio_path or not os.path.exists(audio_path):
                         print(json.dumps({"success": False, "error": "Invalid audio path"}))
                         sys.stdout.flush()
                         continue
                    
                    # Transcribe
                    segments, info = model.transcribe(audio_path, beam_size=5)
                    text = " ".join([segment.text for segment in segments]).strip()
                    
                    print(json.dumps({"success": True, "text": text}))
                    sys.stdout.flush()
                    
                except json.JSONDecodeError:
                    continue
                except Exception as e:
                    print(json.dumps({"success": False, "error": str(e)}))
                    sys.stdout.flush()

        except ImportError:
            print("faster-whisper not found. Trying transformers...", file=sys.stderr)
            # Fallback to transformers if user has that installed (from their snippet)
            import torch
            from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline
            
            device = "cuda:0" if torch.cuda.is_available() else "cpu"
            torch_dtype = torch.float16 if torch.cuda.is_available() else torch.float32
            
            # Use a smaller model for fallback
            model_id = "openai/whisper-small.en" 
            
            print(f"Loading {model_id} on {device}...", file=sys.stderr)
            
            model = AutoModelForSpeechSeq2Seq.from_pretrained(
                model_id, torch_dtype=torch_dtype, low_cpu_mem_usage=True, use_safetensors=True
            )
            model.to(device)
            processor = AutoProcessor.from_pretrained(model_id)
            
            pipe = pipeline(
                "automatic-speech-recognition",
                model=model,
                tokenizer=processor.tokenizer,
                feature_extractor=processor.feature_extractor,
                torch_dtype=torch_dtype,
                device=device,
            )
            
            print("Transformers Whisper Ready", file=sys.stderr)
            sys.stdout.flush()
            
            for line in sys.stdin:
                try:
                    req = json.loads(line.strip())
                    audio_path = req.get("audio_path")
                     
                    if not audio_path or not os.path.exists(audio_path):
                         print(json.dumps({"success": False, "error": "Invalid audio path"}))
                         sys.stdout.flush()
                         continue

                    result = pipe(audio_path)
                    text = result["text"].strip()
                    
                    print(json.dumps({"success": True, "text": text}))
                    sys.stdout.flush()
                    
                except json.JSONDecodeError:
                    continue
                except Exception as e:
                    print(json.dumps({"success": False, "error": str(e)}))
                    sys.stdout.flush()

    except Exception as e:
        print(f"Critical Error: {e}\n{traceback.format_exc()}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()

