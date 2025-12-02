/**
 * Dependency Manager for Faces AI
 * Handles automatic installation of Python dependencies on first run
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { app } = require('electron');

// Dependency definitions
const DEPENDENCIES = {
    kokoro: {
        name: 'Kokoro TTS',
        packages: ['kokoro>=0.3.3', 'soundfile', 'numpy'],
        check: 'kokoro',
        size: '~200 MB'
    },
    whisper: {
        name: 'Whisper STT',
        packages: ['faster-whisper', 'numpy'],
        check: 'faster_whisper',
        size: '~100 MB',
        models: [{
            name: 'tiny.en',
            url: 'https://huggingface.co/Systran/faster-whisper-tiny.en/resolve/main/'
        }]
    },
    yolo: {
        name: 'YOLO 11',
        packages: ['ultralytics', 'opencv-python', 'numpy'],
        check: 'ultralytics',
        size: '~150 MB',
        models: [{
            name: 'yolov11n.pt',
            url: 'https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11n.pt'
        }]
    },
    piper: {
        name: 'Piper TTS',
        packages: ['piper-tts'],
        check: 'piper',
        size: '~80 MB'
    }
};

class DependencyManager {
    constructor(store) {
        this.store = store;
        this.pythonPath = process.platform === 'win32' ? 'python' : 'python3';
    }

    /**
     * Get user's dependency preferences from website localStorage
     * Falls back to all recommended dependencies if not set
     */
    getPreferences() {
        const prefs = this.store.get('dependencyPreferences', null);
        if (prefs) return prefs;

        // Default: all recommended dependencies
        return {
            kokoro: true,
            whisper: true,
            yolo: true,
            piper: false
        };
    }

    /**
     * Save preferences
     */
    setPreferences(prefs) {
        this.store.set('dependencyPreferences', prefs);
    }

    /**
     * Check if a Python package is installed
     */
    async checkPackageInstalled(packageName) {
        return new Promise((resolve) => {
            const proc = spawn(this.pythonPath, ['-c', `import ${packageName}`]);
            proc.on('close', (code) => {
                resolve(code === 0);
            });
            proc.on('error', () => {
                resolve(false);
            });
        });
    }

    /**
     * Check installation status of all dependencies
     */
    async checkAllDependencies() {
        const status = {};

        for (const [key, dep] of Object.entries(DEPENDENCIES)) {
            status[key] = await this.checkPackageInstalled(dep.check);
        }

        return status;
    }

    /**
     * Install a single dependency
     */
    async installDependency(depKey, progressCallback) {
        const dep = DEPENDENCIES[depKey];
        if (!dep) {
            throw new Error(`Unknown dependency: ${depKey}`);
        }

        progressCallback?.({ status: 'installing', dependency: dep.name, progress: 0 });

        // Install Python packages
        for (let i = 0; i < dep.packages.length; i++) {
            const pkg = dep.packages[i];
            progressCallback?.({
                status: 'installing',
                dependency: dep.name,
                detail: `Installing ${pkg}...`,
                progress: Math.round((i / dep.packages.length) * 80)
            });

            await this.pipInstall(pkg);
        }

        // Download models if needed
        if (dep.models) {
            progressCallback?.({
                status: 'downloading',
                dependency: dep.name,
                detail: 'Downloading models...',
                progress: 85
            });

            for (const model of dep.models) {
                await this.downloadModel(model);
            }
        }

        progressCallback?.({ status: 'complete', dependency: dep.name, progress: 100 });
        return true;
    }

    /**
     * Install a package via pip
     */
    async pipInstall(packageName) {
        return new Promise((resolve, reject) => {
            const proc = spawn(this.pythonPath, ['-m', 'pip', 'install', packageName, '--quiet']);

            let stderr = '';
            proc.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            proc.on('close', (code) => {
                if (code === 0) {
                    resolve(true);
                } else {
                    reject(new Error(`Failed to install ${packageName}: ${stderr}`));
                }
            });

            proc.on('error', (err) => {
                reject(err);
            });
        });
    }

    /**
     * Download a model file
     */
    async downloadModel(model) {
        const modelsDir = app.isPackaged
            ? path.join(process.resourcesPath, 'models')
            : path.join(__dirname, '..', 'models');

        if (!fs.existsSync(modelsDir)) {
            fs.mkdirSync(modelsDir, { recursive: true });
        }

        const modelPath = path.join(modelsDir, model.name);

        // Skip if already exists
        if (fs.existsSync(modelPath)) {
            console.log(`[DependencyManager] Model ${model.name} already exists`);
            return true;
        }

        console.log(`[DependencyManager] Downloading ${model.name}...`);

        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(modelPath);

            https.get(model.url, (response) => {
                // Handle redirects
                if (response.statusCode === 302 || response.statusCode === 301) {
                    https.get(response.headers.location, (redirectResponse) => {
                        redirectResponse.pipe(file);
                        file.on('finish', () => {
                            file.close();
                            resolve(true);
                        });
                    }).on('error', reject);
                } else {
                    response.pipe(file);
                    file.on('finish', () => {
                        file.close();
                        resolve(true);
                    });
                }
            }).on('error', (err) => {
                fs.unlink(modelPath, () => {}); // Delete partial file
                reject(err);
            });
        });
    }

    /**
     * Install all selected dependencies
     */
    async installSelectedDependencies(progressCallback) {
        const prefs = this.getPreferences();
        const status = await this.checkAllDependencies();

        const toInstall = Object.entries(prefs)
            .filter(([key, selected]) => selected && !status[key])
            .map(([key]) => key);

        if (toInstall.length === 0) {
            progressCallback?.({ status: 'complete', message: 'All dependencies already installed' });
            return { success: true, installed: [] };
        }

        const installed = [];
        const failed = [];

        for (let i = 0; i < toInstall.length; i++) {
            const depKey = toInstall[i];
            progressCallback?.({
                status: 'progress',
                current: i + 1,
                total: toInstall.length,
                dependency: DEPENDENCIES[depKey].name
            });

            try {
                await this.installDependency(depKey, progressCallback);
                installed.push(depKey);
            } catch (err) {
                console.error(`[DependencyManager] Failed to install ${depKey}:`, err);
                failed.push({ key: depKey, error: err.message });
            }
        }

        return { success: failed.length === 0, installed, failed };
    }

    /**
     * Check if first run setup is needed
     */
    async needsSetup() {
        const setupComplete = this.store.get('dependencySetupComplete', false);
        if (setupComplete) return false;

        const prefs = this.getPreferences();
        const status = await this.checkAllDependencies();

        // Check if any selected dependency is missing
        for (const [key, selected] of Object.entries(prefs)) {
            if (selected && !status[key]) {
                return true;
            }
        }

        // All dependencies installed, mark setup as complete
        this.store.set('dependencySetupComplete', true);
        return false;
    }

    /**
     * Mark setup as complete
     */
    markSetupComplete() {
        this.store.set('dependencySetupComplete', true);
    }

    /**
     * Reset setup (for testing or re-running)
     */
    resetSetup() {
        this.store.delete('dependencySetupComplete');
    }
}

module.exports = { DependencyManager, DEPENDENCIES };
