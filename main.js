const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

let mainWindow;

// Store instances and histories for each provider
const providers = {
  openai: { client: null, history: [], apiKey: '', model: 'gpt-4o' },
  anthropic: { client: null, history: [], apiKey: '', model: 'claude-3-5-sonnet-20241022' },
  gemini: { client: null, history: [], apiKey: '', model: 'gemini-1.5-pro' },
  local: { client: null, history: [], apiKey: 'not-needed', baseURL: 'http://localhost:11434/v1', model: 'llama3' }
};

let currentProvider = 'openai';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Helper to initialize clients
function initClient(provider, key, options = {}) {
  if (provider === 'openai') {
    return new OpenAI({ apiKey: key });
  } else if (provider === 'anthropic') {
    return new Anthropic({ apiKey: key });
  } else if (provider === 'gemini') {
    return new GoogleGenerativeAI(key);
  } else if (provider === 'local') {
    return new OpenAI({ apiKey: 'local', baseURL: options.baseURL || 'http://localhost:11434/v1' });
  }
  return null;
}

// IPC Handlers

ipcMain.handle('set-provider', (event, provider) => {
  if (providers[provider]) {
    currentProvider = provider;
    return { success: true, currentProvider };
  }
  return { success: false, error: 'Invalid provider' };
});

ipcMain.handle('set-config', async (event, { provider, apiKey, baseURL, model }) => {
  if (!providers[provider]) return { success: false, error: 'Invalid provider' };
  
  const p = providers[provider];
  if (apiKey) p.apiKey = apiKey;
  if (baseURL) p.baseURL = baseURL;
  if (model) p.model = model;
  
  // Reset client if config changes
  try {
    p.client = initClient(provider, p.apiKey, { baseURL: p.baseURL });
    p.history = []; // Optional: Reset history on config change? Let's do it for safety.
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-history', (event) => {
  return providers[currentProvider].history;
});

ipcMain.handle('clear-history', (event) => {
  if(providers[currentProvider]) {
    providers[currentProvider].history = [];
    return { success: true };
  }
  return { success: false };
});

ipcMain.handle('send-message', async (event, message) => {
  const p = providers[currentProvider];
  if (!p.client && currentProvider !== 'gemini') { // Gemini client is the factory, not the chat instance
     // Try to init if key exists
     if (p.apiKey || currentProvider === 'local') {
        p.client = initClient(currentProvider, p.apiKey, { baseURL: p.baseURL });
     } else {
        return { success: false, error: `${currentProvider} API Key not set` };
     }
  }
  
  // Double check for Gemini which works differently
  if (currentProvider === 'gemini' && !p.client && !p.apiKey) {
      return { success: false, error: 'Gemini API Key not set' };
  } else if (currentProvider === 'gemini' && !p.client) {
       p.client = initClient('gemini', p.apiKey);
  }

  try {
    let reply = '';
    
    if (currentProvider === 'openai' || currentProvider === 'local') {
      p.history.push({ role: 'user', content: message });
      const completion = await p.client.chat.completions.create({
        messages: p.history,
        model: p.model,
      });
      reply = completion.choices[0].message.content;
      p.history.push({ role: 'assistant', content: reply });

    } else if (currentProvider === 'anthropic') {
      p.history.push({ role: 'user', content: message });
      // Anthropic system messages are separate, but for simplicity we just use messages
      const msg = await p.client.messages.create({
        model: p.model,
        max_tokens: 1024,
        messages: p.history,
      });
      reply = msg.content[0].text;
      p.history.push({ role: 'assistant', content: reply });

    } else if (currentProvider === 'gemini') {
      // Google GenAI history format is different ({ role: 'user'|'model', parts: [{ text: ... }] })
      // We'll maintain our own history array for UI consistency, but convert for the API
      // Actually, Google's SDK manages history in a ChatSession
      
      // Convert our history to Gemini format
      const historyForGemini = p.history.map(h => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }]
      }));

      const model = p.client.getGenerativeModel({ model: p.model });
      const chat = model.startChat({
        history: historyForGemini,
      });

      const result = await chat.sendMessage(message);
      const response = await result.response;
      reply = response.text();
      
      // Update our standard history
      p.history.push({ role: 'user', content: message });
      p.history.push({ role: 'assistant', content: reply });
    }

    return { success: true, reply };
  } catch (error) {
    console.error("Error in send-message:", error);
    return { success: false, error: error.message };
  }
});
