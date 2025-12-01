const providerBtns = document.querySelectorAll('.provider-btn');
const chatTitle = document.getElementById('current-chat-title');
const chatMessages = document.getElementById('chat-messages');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const clearChatBtn = document.getElementById('clear-chat-btn');
const apiKeyInput = document.getElementById('api-key');
const modelInput = document.getElementById('model-name');
const baseUrlInput = document.getElementById('base-url');
const baseUrlGroup = document.getElementById('base-url-group');
const saveConfigBtn = document.getElementById('save-config-btn');

let currentProvider = 'openai';

// Default configs
const defaultConfigs = {
    openai: { model: 'gpt-4o', baseUrl: '' },
    anthropic: { model: 'claude-3-5-sonnet-20241022', baseUrl: '' },
    gemini: { model: 'gemini-1.5-pro', baseUrl: '' },
    local: { model: 'llama3', baseUrl: 'http://localhost:11434/v1' }
};

// Initialize
async function init() {
    // Load stored keys/config if we had storage (for now just defaults)
    updateConfigUI(currentProvider);
}

function updateConfigUI(provider) {
    const config = defaultConfigs[provider];
    modelInput.value = config.model;
    
    if (provider === 'local') {
        baseUrlGroup.classList.remove('hidden');
        baseUrlInput.value = config.baseUrl;
    } else {
        baseUrlGroup.classList.add('hidden');
    }
    
    // Clear inputs or load from potential future local storage
    apiKeyInput.value = ''; 
}

// Provider Switching
providerBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
        // UI Update
        providerBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const provider = btn.dataset.provider;
        currentProvider = provider;
        
        // Update Header
        const names = { openai: 'OpenAI', anthropic: 'Claude', gemini: 'Gemini', local: 'Local AI' };
        chatTitle.textContent = `${names[provider]} Chat`;
        
        // Backend Switch
        await window.electronAPI.setProvider(provider);
        
        // Config UI Update
        updateConfigUI(provider);
        
        // Clear chat view and load history
        renderHistory();
    });
});

// Config Saving
saveConfigBtn.addEventListener('click', async () => {
    const config = {
        provider: currentProvider,
        apiKey: apiKeyInput.value.trim(),
        model: modelInput.value.trim(),
        baseURL: baseUrlInput.value.trim()
    };
    
    const result = await window.electronAPI.setConfig(config);
    if (result.success) {
        appendSystemMessage('Configuration saved!');
    } else {
        appendSystemMessage('Error saving config: ' + result.error);
    }
});

// Chat Logic
async function renderHistory() {
    chatMessages.innerHTML = '';
    const history = await window.electronAPI.getHistory();
    
    if (history.length === 0) {
        appendSystemMessage(`Started new chat with ${currentProvider}`);
    } else {
        history.forEach(msg => appendMessage(msg.role, msg.content));
    }
}

function appendMessage(role, text) {
    const div = document.createElement('div');
    div.classList.add('message', role);
    
    // Simple role label
    const roleLabel = document.createElement('div');
    roleLabel.classList.add('message-role');
    roleLabel.textContent = role === 'user' ? 'You' : 'AI';
    
    const contentDiv = document.createElement('div');
    contentDiv.classList.add('message-content');
    contentDiv.textContent = text;
    
    div.appendChild(roleLabel);
    div.appendChild(contentDiv);
    
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendSystemMessage(text) {
    const div = document.createElement('div');
    div.classList.add('message', 'system');
    div.textContent = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    appendMessage('user', text);
    messageInput.value = '';
    messageInput.disabled = true;
    sendBtn.disabled = true;

    const result = await window.electronAPI.sendMessage(text);
    
    messageInput.disabled = false;
    sendBtn.disabled = false;
    messageInput.focus();

    if (result.success) {
        appendMessage('assistant', result.reply);
    } else {
        appendSystemMessage('Error: ' + result.error);
    }
}

sendBtn.addEventListener('click', sendMessage);

messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

clearChatBtn.addEventListener('click', async () => {
    await window.electronAPI.clearHistory();
    renderHistory();
});

// Initial render
init();
