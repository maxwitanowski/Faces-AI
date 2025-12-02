/**
 * Faces AI - Dependency Installer
 * Handles first-run setup and dependency installation
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn, execSync, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const os = require('os');

class FacesInstaller {
    constructor(store) {
        this.store = store;
        this.installWindow = null;
        this.isInstalling = false;

        // Paths
        this.appDataPath = path.join(app.getPath('userData'), 'faces-deps');
        this.pythonPath = path.join(this.appDataPath, 'python');
        this.modelsPath = path.join(this.appDataPath, 'models');
        this.venvPath = path.join(this.appDataPath, 'venv');

        // Python executable path (platform specific)
        this.pythonExe = process.platform === 'win32'
            ? path.join(this.venvPath, 'Scripts', 'python.exe')
            : path.join(this.venvPath, 'bin', 'python');

        this.pipExe = process.platform === 'win32'
            ? path.join(this.venvPath, 'Scripts', 'pip.exe')
            : path.join(this.venvPath, 'bin', 'pip');

        // Dependency definitions
        this.dependencies = {
            kokoro: {
                name: 'Kokoro TTS',
                description: 'High-quality text-to-speech',
                packages: ['kokoro>=0.3.4', 'soundfile', 'numpy'],
                size: '~200 MB',
                recommended: true
            },
            whisper: {
                name: 'Whisper STT',
                description: 'Speech recognition',
                packages: ['faster-whisper', 'numpy'],
                size: '~150 MB',
                recommended: true,
                models: [{
                    name: 'tiny.en',
                    files: ['model.bin', 'config.json', 'tokenizer.json', 'vocabulary.txt'],
                    baseUrl: 'https://huggingface.co/Systran/faster-whisper-tiny.en/resolve/main/'
                }]
            },
            yolo: {
                name: 'YOLO 11',
                description: 'Object detection & face tracking',
                packages: ['ultralytics', 'opencv-python', 'numpy', 'flask'],
                size: '~200 MB',
                recommended: true,
                models: [{
                    name: 'yolo11n.pt',
                    url: 'https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11n.pt'
                }]
            },
            piper: {
                name: 'Piper TTS',
                description: 'Lightweight text-to-speech alternative',
                packages: ['piper-tts'],
                size: '~80 MB',
                recommended: false
            }
        };
    }

    /**
     * Check if setup is needed
     */
    needsSetup() {
        const setupComplete = this.store.get('installerComplete', false);
        if (setupComplete) {
            // Verify Python venv still exists
            return !fs.existsSync(this.pythonExe);
        }
        return true;
    }

    /**
     * Get installation status
     */
    getStatus() {
        const prefs = this.store.get('dependencyPreferences', {
            kokoro: true,
            whisper: true,
            yolo: true,
            piper: false
        });

        const installed = {};
        for (const key of Object.keys(this.dependencies)) {
            installed[key] = this.checkDependencyInstalled(key);
        }

        return {
            setupComplete: this.store.get('installerComplete', false),
            pythonInstalled: fs.existsSync(this.pythonExe),
            preferences: prefs,
            installed,
            dependencies: this.dependencies,
            paths: {
                appData: this.appDataPath,
                python: this.pythonExe,
                models: this.modelsPath
            }
        };
    }

    /**
     * Check if a specific dependency is installed
     */
    checkDependencyInstalled(depKey) {
        const dep = this.dependencies[depKey];
        if (!dep) return false;

        // Check if Python package is importable
        if (!fs.existsSync(this.pythonExe)) return false;

        try {
            const checkPkg = dep.packages[0].split('>=')[0].split('==')[0].replace('-', '_');
            execSync(`"${this.pythonExe}" -c "import ${checkPkg}"`, {
                stdio: 'pipe',
                timeout: 10000
            });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Send progress update to renderer
     */
    sendProgress(data) {
        if (this.installWindow && !this.installWindow.isDestroyed()) {
            this.installWindow.webContents.send('install-progress', data);
        }
    }

    /**
     * Create the installer window
     */
    createInstallerWindow() {
        this.installWindow = new BrowserWindow({
            width: 600,
            height: 500,
            resizable: false,
            frame: false,
            transparent: false,
            backgroundColor: '#0a0a0f',
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'installerPreload.js')
            }
        });

        // Load installer HTML
        this.installWindow.loadFile(path.join(__dirname, 'installer.html'));

        return this.installWindow;
    }

    /**
     * Run a command and return promise
     */
    runCommand(command, args = [], options = {}) {
        return new Promise((resolve, reject) => {
            const proc = spawn(command, args, {
                ...options,
                shell: true
            });

            let stdout = '';
            let stderr = '';

            proc.stdout?.on('data', (data) => {
                stdout += data.toString();
                if (options.onStdout) options.onStdout(data.toString());
            });

            proc.stderr?.on('data', (data) => {
                stderr += data.toString();
                if (options.onStderr) options.onStderr(data.toString());
            });

            proc.on('close', (code) => {
                if (code === 0) {
                    resolve({ stdout, stderr, code });
                } else {
                    reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
                }
            });

            proc.on('error', reject);
        });
    }

    /**
     * Download a file
     */
    downloadFile(url, destPath, onProgress) {
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(destPath);
            const protocol = url.startsWith('https') ? https : http;

            const request = protocol.get(url, (response) => {
                // Handle redirects
                if (response.statusCode === 301 || response.statusCode === 302) {
                    file.close();
                    fs.unlinkSync(destPath);
                    return this.downloadFile(response.headers.location, destPath, onProgress)
                        .then(resolve)
                        .catch(reject);
                }

                const totalSize = parseInt(response.headers['content-length'], 10);
                let downloadedSize = 0;

                response.on('data', (chunk) => {
                    downloadedSize += chunk.length;
                    if (onProgress && totalSize) {
                        onProgress(Math.round((downloadedSize / totalSize) * 100));
                    }
                });

                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    resolve(destPath);
                });
            });

            request.on('error', (err) => {
                fs.unlink(destPath, () => {});
                reject(err);
            });

            file.on('error', (err) => {
                fs.unlink(destPath, () => {});
                reject(err);
            });
        });
    }

    /**
     * Find system Python
     */
    async findSystemPython() {
        const pythonCommands = process.platform === 'win32'
            ? ['python', 'python3', 'py -3', 'py']
            : ['python3', 'python'];

        for (const cmd of pythonCommands) {
            try {
                const result = execSync(`${cmd} --version`, { stdio: 'pipe', timeout: 5000 });
                const version = result.toString().trim();
                if (version.includes('3.')) {
                    // Get the actual path
                    const pathCmd = process.platform === 'win32'
                        ? `${cmd} -c "import sys; print(sys.executable)"`
                        : `${cmd} -c "import sys; print(sys.executable)"`;
                    const pythonPath = execSync(pathCmd, { stdio: 'pipe', timeout: 5000 }).toString().trim();
                    return { command: cmd, path: pythonPath, version };
                }
            } catch {
                continue;
            }
        }
        return null;
    }

    /**
     * Setup Python virtual environment
     */
    async setupPythonEnvironment(progressCallback) {
        progressCallback({ step: 'python', status: 'Checking Python installation...' });

        // Create directories
        if (!fs.existsSync(this.appDataPath)) {
            fs.mkdirSync(this.appDataPath, { recursive: true });
        }
        if (!fs.existsSync(this.modelsPath)) {
            fs.mkdirSync(this.modelsPath, { recursive: true });
        }

        // Find system Python
        const systemPython = await this.findSystemPython();
        if (!systemPython) {
            throw new Error('Python 3 is not installed. Please install Python 3.10+ from python.org');
        }

        progressCallback({
            step: 'python',
            status: `Found ${systemPython.version}`,
            detail: systemPython.path
        });

        // Create virtual environment
        progressCallback({ step: 'venv', status: 'Creating virtual environment...' });

        if (!fs.existsSync(this.venvPath)) {
            await this.runCommand(systemPython.command, ['-m', 'venv', this.venvPath]);
        }

        // Upgrade pip
        progressCallback({ step: 'pip', status: 'Upgrading pip...' });
        await this.runCommand(this.pythonExe, ['-m', 'pip', 'install', '--upgrade', 'pip', '--quiet']);

        return true;
    }

    /**
     * Install a single dependency
     */
    async installDependency(depKey, progressCallback) {
        const dep = this.dependencies[depKey];
        if (!dep) throw new Error(`Unknown dependency: ${depKey}`);

        progressCallback({
            step: 'packages',
            dependency: dep.name,
            status: `Installing ${dep.name}...`,
            progress: 0
        });

        // Install Python packages
        for (let i = 0; i < dep.packages.length; i++) {
            const pkg = dep.packages[i];
            progressCallback({
                step: 'packages',
                dependency: dep.name,
                status: `Installing ${pkg}...`,
                progress: Math.round((i / dep.packages.length) * 70)
            });

            try {
                await this.runCommand(this.pipExe, ['install', pkg, '--quiet'], {
                    timeout: 300000 // 5 min timeout for large packages
                });
            } catch (err) {
                console.error(`Failed to install ${pkg}:`, err.message);
                // Try without --quiet to see errors
                await this.runCommand(this.pipExe, ['install', pkg]);
            }
        }

        // Download models if needed
        if (dep.models) {
            for (const model of dep.models) {
                progressCallback({
                    step: 'models',
                    dependency: dep.name,
                    status: `Downloading ${model.name}...`,
                    progress: 75
                });

                if (model.url) {
                    // Single file download
                    const modelPath = path.join(this.modelsPath, model.name);
                    if (!fs.existsSync(modelPath)) {
                        await this.downloadFile(model.url, modelPath, (p) => {
                            progressCallback({
                                step: 'models',
                                dependency: dep.name,
                                status: `Downloading ${model.name}... ${p}%`,
                                progress: 75 + Math.round(p * 0.25)
                            });
                        });
                    }
                } else if (model.files && model.baseUrl) {
                    // Multiple files
                    const modelDir = path.join(this.modelsPath, model.name);
                    if (!fs.existsSync(modelDir)) {
                        fs.mkdirSync(modelDir, { recursive: true });
                    }

                    for (const file of model.files) {
                        const filePath = path.join(modelDir, file);
                        if (!fs.existsSync(filePath)) {
                            await this.downloadFile(model.baseUrl + file, filePath);
                        }
                    }
                }
            }
        }

        progressCallback({
            step: 'complete',
            dependency: dep.name,
            status: `${dep.name} installed!`,
            progress: 100
        });

        return true;
    }

    /**
     * Run full installation
     */
    async runInstallation(preferences, progressCallback) {
        this.isInstalling = true;

        try {
            // Step 1: Setup Python environment
            progressCallback({
                phase: 'python',
                overall: 10,
                status: 'Setting up Python environment...'
            });
            await this.setupPythonEnvironment(progressCallback);

            // Step 2: Install selected dependencies
            const toInstall = Object.entries(preferences)
                .filter(([_, selected]) => selected)
                .map(([key]) => key);

            const depCount = toInstall.length;
            for (let i = 0; i < toInstall.length; i++) {
                const depKey = toInstall[i];
                const baseProgress = 20 + Math.round((i / depCount) * 70);

                progressCallback({
                    phase: 'dependencies',
                    overall: baseProgress,
                    current: i + 1,
                    total: depCount,
                    status: `Installing ${this.dependencies[depKey].name}...`
                });

                await this.installDependency(depKey, (update) => {
                    const depProgress = update.progress || 0;
                    progressCallback({
                        phase: 'dependencies',
                        overall: baseProgress + Math.round((depProgress / 100) * (70 / depCount)),
                        current: i + 1,
                        total: depCount,
                        status: update.status,
                        detail: update.detail
                    });
                });
            }

            // Step 3: Verify installation
            progressCallback({
                phase: 'verify',
                overall: 95,
                status: 'Verifying installation...'
            });

            // Save preferences and mark complete
            this.store.set('dependencyPreferences', preferences);
            this.store.set('installerComplete', true);
            this.store.set('pythonPath', this.pythonExe);
            this.store.set('modelsPath', this.modelsPath);

            progressCallback({
                phase: 'complete',
                overall: 100,
                status: 'Installation complete!'
            });

            this.isInstalling = false;
            return { success: true };

        } catch (err) {
            this.isInstalling = false;
            console.error('Installation failed:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Get Python executable path for the app to use
     */
    getPythonPath() {
        const stored = this.store.get('pythonPath');
        if (stored && fs.existsSync(stored)) {
            return stored;
        }
        if (fs.existsSync(this.pythonExe)) {
            return this.pythonExe;
        }
        return 'python'; // Fallback to system Python
    }

    /**
     * Get models path
     */
    getModelsPath() {
        return this.store.get('modelsPath', this.modelsPath);
    }
}

module.exports = { FacesInstaller };
