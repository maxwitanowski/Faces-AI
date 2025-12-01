"""
PyInstaller Build Script for Faces AI Python Dependencies
Builds standalone executables for YOLO, Kokoro, Whisper, Piper, and Local STT
"""

import subprocess
import sys
import os
import shutil

# Ensure PyInstaller is installed
try:
    import PyInstaller
except ImportError:
    print("Installing PyInstaller...")
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'pyinstaller'])

import PyInstaller.__main__

# Build configuration for each Python backend
BUILDS = [
    {
        'script': 'python/yolo_tracker.py',
        'name': 'yolo_tracker',
        'hidden_imports': [
            'ultralytics',
            'ultralytics.nn',
            'ultralytics.utils',
            'ultralytics.engine',
            'torch',
            'torchvision',
            'cv2',
            'PIL',
            'numpy',
        ],
        'collect_all': ['ultralytics'],
        'data_files': [
            ('yolov11n.pt', '.'),
        ],
    },
    {
        'script': 'python/kokoro_tts.py',
        'name': 'kokoro_tts',
        'hidden_imports': [
            'kokoro',
            'torch',
            'numpy',
            'soundfile',
        ],
        'collect_all': ['kokoro'],
        'data_files': [],
    },
    {
        'script': 'python/local_whisper.py',
        'name': 'local_whisper',
        'hidden_imports': [
            'faster_whisper',
            'ctranslate2',
            'torch',
            'numpy',
            'speech_recognition',
        ],
        'collect_all': ['faster_whisper'],
        'data_files': [],
    },
    {
        'script': 'python/piper_tts.py',
        'name': 'piper_tts',
        'hidden_imports': [
            'piper',
            'onnxruntime',
            'numpy',
        ],
        'collect_all': [],
        'data_files': [
            ('python/models', 'models'),
        ],
    },
    {
        'script': 'python/local_stt.py',
        'name': 'local_stt',
        'hidden_imports': [
            'faster_whisper',
            'torch',
            'numpy',
        ],
        'collect_all': ['faster_whisper'],
        'data_files': [],
    },
]

def clean_build_dirs():
    """Clean previous build artifacts"""
    dirs_to_clean = ['python-dist', 'python-build']
    for d in dirs_to_clean:
        if os.path.exists(d):
            print(f"Cleaning {d}...")
            shutil.rmtree(d)

def build_executable(config):
    """Build a single Python script into an executable"""
    script = config['script']
    name = config['name']

    if not os.path.exists(script):
        print(f"Warning: {script} not found, skipping...")
        return False

    print(f"\n{'='*60}")
    print(f"Building {name}...")
    print(f"{'='*60}\n")

    # Base PyInstaller arguments
    args = [
        script,
        '--onedir',
        '--name', name,
        '--distpath', 'python-dist',
        '--workpath', 'python-build',
        '--specpath', 'python-build',
        '--noconfirm',
        '--clean',
    ]

    # Add hidden imports
    for imp in config.get('hidden_imports', []):
        args.extend(['--hidden-import', imp])

    # Add collect-all for packages that need all submodules
    for pkg in config.get('collect_all', []):
        args.extend(['--collect-all', pkg])

    # Add data files
    for src, dst in config.get('data_files', []):
        if os.path.exists(src):
            args.extend(['--add-data', f'{src};{dst}'])
        else:
            print(f"Warning: Data file {src} not found")

    try:
        PyInstaller.__main__.run(args)
        print(f"Successfully built {name}")
        return True
    except Exception as e:
        print(f"Error building {name}: {e}")
        return False

def build_all():
    """Build all Python backends"""
    print("Faces AI - Python Dependency Builder")
    print("="*60)

    # Clean previous builds
    clean_build_dirs()

    # Build each executable
    results = {}
    for config in BUILDS:
        success = build_executable(config)
        results[config['name']] = success

    # Summary
    print("\n" + "="*60)
    print("BUILD SUMMARY")
    print("="*60)
    for name, success in results.items():
        status = "SUCCESS" if success else "FAILED"
        print(f"  {name}: {status}")

    # Calculate total size
    if os.path.exists('python-dist'):
        total_size = 0
        for root, dirs, files in os.walk('python-dist'):
            for f in files:
                total_size += os.path.getsize(os.path.join(root, f))
        print(f"\nTotal size: {total_size / (1024*1024):.1f} MB")

    print("\nBuild complete! Executables are in python-dist/")
    print("Run 'npm run package:win' to build the final Electron app")

def build_single(name):
    """Build a single executable by name"""
    for config in BUILDS:
        if config['name'] == name:
            build_executable(config)
            return
    print(f"Unknown build target: {name}")
    print(f"Available: {', '.join(c['name'] for c in BUILDS)}")

if __name__ == '__main__':
    if len(sys.argv) > 1:
        # Build specific target
        build_single(sys.argv[1])
    else:
        # Build all
        build_all()
