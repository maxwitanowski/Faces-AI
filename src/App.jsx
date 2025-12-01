import React, { useState, useEffect, useRef } from 'react';
import { 
  AppShell, 
  Select, 
  TextInput, 
  Button, 
  Container, 
  Paper, 
  Text, 
  Group, 
  Stack, 
  ScrollArea, 
  ActionIcon, 
  Loader,
  Center,
  Title,
  Grid,
  PasswordInput,
  Box,
  Divider,
  Avatar,
  UnstyledButton,
  Modal,
  Collapse,
  Textarea,
  Switch,
  Badge,
  Tooltip
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { 
  IconSend, 
  IconTrash, 
  IconBrandOpenai, 
  IconBrandGoogle, 
  IconBrain, 
  IconDeviceDesktop, 
  IconPlus, 
  IconArrowLeft, 
  IconSettings, 
  IconChevronDown, 
  IconChevronRight, 
  IconBulb,
  IconCopy,
  IconCheck,
  IconMicrophone,
  IconVolume,
  IconVolumeOff,
  IconPlayerPlay,
  IconSparkles,
  IconMessage2,
  IconWifi,
  IconWifiOff,
  IconDownload,
  IconPencil,
  IconSearch,
  IconX,
  IconFileText,
  IconMarkdown,
  IconEdit
} from '@tabler/icons-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import FaceEditor from './FaceEditor';

// Icons map (fallback)
const icons = {
  openai: <IconBrandOpenai size={20} />,
  anthropic: <IconBrain size={20} />,
  gemini: <IconBrandGoogle size={20} />,
  local: <IconDeviceDesktop size={20} />
};

// Model Definitions with Grouping
const allModels = [
    { 
        group: 'OpenAI', 
        provider: 'openai',
        items: [
            { value: 'gpt-4o', label: 'GPT-4o', provider: 'openai' },
            { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', provider: 'openai' },
            { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', provider: 'openai' }
        ] 
    },
    { 
        group: 'Anthropic', 
        provider: 'anthropic',
        items: [
            { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', provider: 'anthropic' },
            { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus', provider: 'anthropic' },
            { value: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet', provider: 'anthropic' },
            { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku', provider: 'anthropic' }
        ] 
    },
    { 
        group: 'Google Gemini', 
        provider: 'gemini',
        items: [
            { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', provider: 'gemini' },
            { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', provider: 'gemini' },
            { value: 'gemini-1.0-pro', label: 'Gemini 1.0 Pro', provider: 'gemini' }
        ] 
    },
    { 
        group: 'Local AI', 
        provider: 'local',
        items: [
            { value: 'default', label: 'Server Default', provider: 'local' }
        ] 
    }
];

// Flattened list for lookup
const flattenedModels = allModels.flatMap(group => group.items);

// Helper for Logo Path
const getLogoPath = (provider) => {
    const logoMap = {
        'openai': 'ChatGPT-Logo-With-Transparent-Background.png',
        'anthropic': 'Claude_AI_symbol.svg.png',
        'gemini': 'gemini-color.png',
        'local': 'local_ai.png.png'
    };
    return `./logos/${logoMap[provider] || `${provider}.png`}`;
};

// Helper to parse <think> tags
const parseMessageContent = (content) => {
    if (!content) return { thought: null, response: '' };
    
    const thinkStart = content.indexOf('<think>');
    const thinkEnd = content.indexOf('</think>');
    
    if (thinkStart !== -1) {
        let thought = '';
        let response = '';
        
        if (thinkEnd !== -1) {
            thought = content.substring(thinkStart + 7, thinkEnd).trim();
            response = content.substring(thinkEnd + 8).trim();
        } else {
            thought = content.substring(thinkStart + 7).trim();
            response = '';
        }
        return { thought, response };
    }
    
    return { thought: null, response: content };
};

// Reusable Markdown Components for Syntax Highlighting
const markdownComponents = {
    code({node, inline, className, children, ...props}) {
        const match = /language-(\w+)/.exec(className || '');
        const [copied, setCopied] = useState(false);

        const handleCopy = () => {
            navigator.clipboard.writeText(String(children).replace(/\n$/, ''));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        };

        return !inline && match ? (
            <div style={{ position: 'relative', marginTop: '1em', marginBottom: '1em' }}>
                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    background: 'linear-gradient(135deg, #1a1a24 0%, #12121a 100%)',
                    padding: '8px 14px', 
                    borderTopLeftRadius: '12px', 
                    borderTopRightRadius: '12px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    fontSize: '0.75em',
                    color: '#818cf8',
                    fontWeight: 500,
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase'
                }}>
                    <span>{match[1]}</span>
                    <ActionIcon size="sm" variant="subtle" color={copied ? "teal" : "gray"} onClick={handleCopy}>
                        {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                    </ActionIcon>
                </div>
                <SyntaxHighlighter
                    style={vscDarkPlus}
                    language={match[1]}
                    PreTag="div"
                    customStyle={{ 
                        margin: 0, 
                        borderTopLeftRadius: 0, 
                        borderTopRightRadius: 0, 
                        borderBottomLeftRadius: '12px', 
                        borderBottomRightRadius: '12px',
                        backgroundColor: '#0a0a0f',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderTop: 'none'
                    }}
                    {...props}
                >
                    {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
            </div>
        ) : (
            <code style={{
                background: '#1a1a24',
                padding: '3px 8px',
                borderRadius: '6px',
                fontSize: '0.9em',
                color: '#a5b4fc'
            }} {...props}>
                {children}
            </code>
        );
    }
};

// Component to render AI Message with potential Thinking process
const AIMessage = ({ content, provider, isStreaming }) => {
    const { thought, response } = parseMessageContent(content);
    const [opened, { toggle }] = useDisclosure(false);

    return (
        <Box style={{ width: '100%' }}>
            {thought && (
                <div className="thinking-box">
                    <div className="thinking-header" onClick={toggle}>
                        {opened ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                        <IconBulb size={14} />
                        <span>Thinking Process</span>
                    </div>
                    <Collapse in={opened}>
                        <div className="thinking-content">
                            {thought}
                            {isStreaming && !response && <span className="pulsing-circle" style={{ display: 'inline-block', width: 8, height: 8, marginLeft: 5 }} />}
                        </div>
                    </Collapse>
                </div>
            )}
            <div className="markdown-content" style={{ color: '#f8fafc', fontSize: '0.95rem', lineHeight: 1.7 }}>
                <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    components={markdownComponents}
                >
                    {response + (isStreaming && response ? ' ▋' : '')}
                </ReactMarkdown>
            </div>
        </Box>
    );
};

// Custom Select Item
const SelectItem = React.forwardRef(
  ({ label, provider, ...others }, ref) => {
    const logoPath = getLogoPath(provider);
    return (
      <div ref={ref} {...others}>
        <Group noWrap>
          <Box w={24} h={24} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
             <img src={logoPath} alt={provider} style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={(e) => {e.target.style.display = 'none';}} />
          </Box>
          <Text size="sm" fw={500} c="white">{label}</Text>
        </Group>
      </div>
    );
  }
);

import VoiceChatWindow from './VoiceChatWindow';
import CanvasWindow from './CanvasWindow';

function App() {
  const [view, setView] = useState('menu');
  
  const [mode, setMode] = useState(() => {
      const params = new URLSearchParams(window.location.search);
      const urlMode = params.get('mode');
      if (urlMode === 'voice') return 'voice-window';
      if (urlMode === 'canvas') return 'canvas-window';
      if (urlMode === 'face-editor') return 'face-editor';
      return 'app';
  });

  if (mode === 'voice-window') {
      return <VoiceChatWindow />;
  }

  if (mode === 'canvas-window') {
      return <CanvasWindow />;
  }

  if (mode === 'face-editor') {
      return <FaceEditor />;
  }

  const [isReady, setIsReady] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [configs, setConfigs] = useState({});
  const [offlineMode, setOfflineMode] = useState(false);
  const [ttsProvider, setTtsProvider] = useState('local');
  const [ttsUrl, setTtsUrl] = useState('');
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState('');
  const [elevenLabsVoiceId, setElevenLabsVoiceId] = useState('21m00Tcm4TlvDq8ikWAM');
  const [visionProvider, setVisionProvider] = useState('local');
  
  // Voice Chat QoL Settings
  const [showWaveform, setShowWaveform] = useState(false);
  const [pushToTalk, setPushToTalk] = useState(false);
  const [showTranscriptionPreview, setShowTranscriptionPreview] = useState(false);
  const [syncVoiceToChat, setSyncVoiceToChat] = useState(true);
  const [allowInterruption, setAllowInterruption] = useState(false);
  const [faceColor, setFaceColor] = useState('#ffffff');
  
  // Web Search Settings
  const [braveSearchApiKey, setBraveSearchApiKey] = useState('');
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const isListeningRef = useRef(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const isVoiceModeRef = useRef(false);

  useEffect(() => {
    isVoiceModeRef.current = isVoiceMode;
  }, [isVoiceMode]);

  useEffect(() => {
      const handleOffline = () => {
           setOfflineMode(true);
           window.electronAPI.saveSettings({ offlineMode: true });
      };
      const handleOnline = () => {};

      window.addEventListener('offline', handleOffline);
      window.addEventListener('online', handleOnline);
      
      if (!navigator.onLine) {
          setOfflineMode(true);
          window.electronAPI.saveSettings({ offlineMode: true });
      }

      return () => {
          window.removeEventListener('offline', handleOffline);
          window.removeEventListener('online', handleOnline);
      };
  }, []);

  const lastSpokenIdRef = useRef(null);

  const [audioDevices, setAudioDevices] = useState({ inputs: [], outputs: [] });
  const [selectedInput, setSelectedInput] = useState('');
  const [selectedOutput, setSelectedOutput] = useState('');
  
  const [streamingContent, setStreamingContent] = useState('');
  
  // QoL Features
  const [renameModalOpened, setRenameModalOpened] = useState(false);
  const [renameSessionId, setRenameSessionId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [exportModalOpened, setExportModalOpened] = useState(false);
  const [exportSessionId, setExportSessionId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchBar, setShowSearchBar] = useState(false);
  
  // Memory Management
  const [memories, setMemories] = useState([]);
  const [newMemoryContent, setNewMemoryContent] = useState('');
  const [newMemoryCategory, setNewMemoryCategory] = useState('other');
  const [editingMemoryId, setEditingMemoryId] = useState(null);
  const [editingMemoryContent, setEditingMemoryContent] = useState('');
  const [settingsTab, setSettingsTab] = useState('general'); // 'general' or 'memory'
  
  const viewport = useRef(null);
  const [settingsOpened, { open: openSettings, close: closeSettings }] = useDisclosure(false);

  useEffect(() => {
    async function init() {
      try {
        if (!window.electronAPI) throw new Error("Electron API missing");
        const state = await window.electronAPI.getInitialState();
        setConfigs(state.providers);
        setSessions(state.sessions);
        setOfflineMode(state.settings?.offlineMode || false);
        setTtsProvider(state.settings?.ttsProvider || 'local');
        setTtsUrl(state.settings?.ttsUrl || '');
        setElevenLabsApiKey(state.settings?.elevenLabsApiKey || '');
        setElevenLabsVoiceId(state.settings?.elevenLabsVoiceId || '21m00Tcm4TlvDq8ikWAM');
        setVisionProvider(state.settings?.visionProvider || 'local');
        // Voice Chat QoL Settings
        setShowWaveform(state.settings?.showWaveform ?? false);
        setPushToTalk(state.settings?.pushToTalk ?? false);
        setShowTranscriptionPreview(state.settings?.showTranscriptionPreview ?? false);
        setSyncVoiceToChat(state.settings?.syncVoiceToChat ?? true);
        setAllowInterruption(state.settings?.allowInterruption ?? false);
        setFaceColor(state.settings?.faceColor || '#ffffff');
        // Web Search Settings
        setBraveSearchApiKey(state.settings?.braveSearchApiKey || '');
        setWebSearchEnabled(state.settings?.webSearchEnabled ?? true);
        if (state.settings?.selectedInput) setSelectedInput(state.settings.selectedInput);
        if (state.settings?.selectedOutput) setSelectedOutput(state.settings.selectedOutput);
        setIsReady(true);

        // Listen for sessions updates from other windows (e.g., voice chat)
        window.electronAPI.onSessionsUpdated(({ sessions }) => {
            setSessions(sessions);
        });

        window.electronAPI.onStreamStart(({ sessionId }) => {
            if (sessionId === activeSessionId) {
                setLoading(true);
                setStreamingContent('');
            }
        });

        window.electronAPI.onStreamToken(({ sessionId, token }) => {
            setStreamingContent(prev => prev + token);
        });

        window.electronAPI.onStreamEnd(({ sessionId, reply, responseId }) => {
            const voiceMode = isVoiceModeRef.current; 
            const uniqueId = responseId || (sessionId + '_' + reply.length);

            if (lastSpokenIdRef.current === uniqueId) {
                return;
            }
            lastSpokenIdRef.current = uniqueId;

            if (voiceMode) {
                 const cleanText = reply
                    .replace(/<think>[\s\S]*?<\/think>/g, '')
                    .replace(/```[\s\S]*?```/g, 'Code block omitted.')
                    .replace(/[*#_]/g, '')
                    .trim();
                
                 if (!cleanText) {
                     setLoading(false);
                     setStreamingContent('');
                     window.electronAPI.getInitialState().then(state => {
                        setSessions(state.sessions);
                     });
                     return;
                 }

                 window.electronAPI.speakText(cleanText).then(res => {
                    if (res.success && res.audio) {
                        const audio = new Audio(res.audio);
                        audio.play().catch(e => console.error("Audio playback error:", e));
                    }
                    setLoading(false);
                    setStreamingContent('');
                    window.electronAPI.getInitialState().then(state => {
                        setSessions(state.sessions);
                    });
                }).catch((err) => {
                    setLoading(false);
                    setStreamingContent('');
                    window.electronAPI.getInitialState().then(state => {
                        setSessions(state.sessions);
                    });
                });

            } else {
                setLoading(false);
                setStreamingContent('');
                window.electronAPI.getInitialState().then(state => {
                    setSessions(state.sessions);
                });
            }
        });

        window.electronAPI.onStreamError(({ sessionId, error }) => {
            setLoading(false);
            setStreamingContent(''); 
            window.electronAPI.getInitialState().then(state => {
                setSessions(state.sessions);
            });
        });

      } catch (e) {
        console.error(e);
      }
    }
    init();
    
    return () => {
        if (window.electronAPI && window.electronAPI.removeStreamListeners) window.electronAPI.removeStreamListeners();
        lastSpokenIdRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (view === 'chat' && viewport.current) {
      viewport.current.scrollTo({ top: viewport.current.scrollHeight, behavior: 'smooth' });
    }
  }, [sessions, activeSessionId, view, streamingContent]);

  const activeSession = sessions.find(s => s.id === activeSessionId);

  const handleConfigChange = async (provider, key, value) => {
      const newConfig = { ...configs[provider], [key]: value };
      setConfigs(prev => ({ ...prev, [provider]: newConfig }));
      await window.electronAPI.saveProviderConfig({ provider, config: newConfig });
  };

  const handleOfflineModeChange = async (e) => {
      const checked = e.currentTarget.checked;
      setOfflineMode(checked);
      await window.electronAPI.saveSettings({ offlineMode: checked });
  };

  const handleTtsProviderChange = async (val) => {
      setTtsProvider(val);
      await window.electronAPI.saveSettings({ ttsProvider: val });
  };

  const handleTtsUrlChange = async (val) => {
      setTtsUrl(val);
      await window.electronAPI.saveSettings({ ttsUrl: val });
  };

  const handleElevenLabsApiKeyChange = async (val) => {
      setElevenLabsApiKey(val);
      await window.electronAPI.saveSettings({ elevenLabsApiKey: val });
  };

  const handleElevenLabsVoiceIdChange = async (val) => {
      setElevenLabsVoiceId(val);
      await window.electronAPI.saveSettings({ elevenLabsVoiceId: val });
  };

  const handleVisionProviderChange = async (val) => {
      setVisionProvider(val);
      await window.electronAPI.saveSettings({ visionProvider: val });
  };

  // Voice Chat QoL Settings handlers
  const handleShowWaveformChange = async (checked) => {
      setShowWaveform(checked);
      await window.electronAPI.saveSettings({ showWaveform: checked });
  };

  const handlePushToTalkChange = async (checked) => {
      setPushToTalk(checked);
      await window.electronAPI.saveSettings({ pushToTalk: checked });
  };

  const handleShowTranscriptionPreviewChange = async (checked) => {
      setShowTranscriptionPreview(checked);
      await window.electronAPI.saveSettings({ showTranscriptionPreview: checked });
  };

  const handleSyncVoiceToChatChange = async (checked) => {
      setSyncVoiceToChat(checked);
      await window.electronAPI.saveSettings({ syncVoiceToChat: checked });
  };

  const handleAllowInterruptionChange = async (checked) => {
      setAllowInterruption(checked);
      await window.electronAPI.saveSettings({ allowInterruption: checked });
  };

  const handleFaceColorChange = async (color) => {
      setFaceColor(color);
      await window.electronAPI.saveSettings({ faceColor: color });
  };

  const handleBraveSearchApiKeyChange = async (key) => {
      setBraveSearchApiKey(key);
      await window.electronAPI.saveSettings({ braveSearchApiKey: key });
  };

  const handleWebSearchEnabledChange = async (enabled) => {
      setWebSearchEnabled(enabled);
      await window.electronAPI.saveSettings({ webSearchEnabled: enabled });
  };

  const handleAudioInputChange = async (val) => {
      setSelectedInput(val);
      await window.electronAPI.saveSettings({ selectedInput: val });
  };

  const handleAudioOutputChange = async (val) => {
      setSelectedOutput(val);
      await window.electronAPI.saveSettings({ selectedOutput: val });
  };

  const createNewChat = async (provider = 'openai') => {
      if (offlineMode && provider !== 'local') {
          provider = 'local';
      }
      
      let model = configs[provider].model;
      if (provider === 'local') model = 'default'; 
      const res = await window.electronAPI.createSession({ provider, model });
      if (res.success) {
          setSessions(prev => [res.session, ...prev]);
          setActiveSessionId(res.session.id);
          setView('chat');
      }
  };

  const openSession = (id) => {
      setActiveSessionId(id);
      setView('chat');
  };

  const deleteSession = async (e, id) => {
      e.stopPropagation();
      await window.electronAPI.deleteSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
      if (activeSessionId === id) {
          setView('menu');
          setActiveSessionId(null);
      }
  };

  const handleSend = async () => {
      if (!input.trim() || loading || !activeSessionId) return;
      
      const currentInput = input;
      setInput('');
      setLoading(true);
      setStreamingContent('');

      const userMsg = { role: 'user', content: currentInput };
      updateSessionMessages(activeSessionId, userMsg);

      window.electronAPI.sendMessage({ 
          sessionId: activeSessionId, 
          message: currentInput 
      });
  };

  const updateSessionMessages = (id, msg) => {
      setSessions(prev => prev.map(s => {
          if (s.id === id) {
              return { ...s, messages: [...s.messages, msg] };
          }
          return s;
      }));
  };

  const handleModelChange = async (modelValue) => {
      if(!activeSessionId) return;
      const modelInfo = flattenedModels.find(m => m.value === modelValue);
      const newProvider = modelInfo ? modelInfo.provider : 'local'; 
      const res = await window.electronAPI.updateSessionMeta({ 
          sessionId: activeSessionId, 
          provider: newProvider,
          model: modelValue
      });
      if (res.success) {
          setSessions(prev => prev.map(s => s.id === res.session.id ? res.session : s));
      }
  };

  // Rename session
  const openRenameModal = (e, sessionId, currentName) => {
      e.stopPropagation();
      setRenameSessionId(sessionId);
      setRenameValue(currentName || 'Untitled Chat');
      setRenameModalOpened(true);
  };

  const handleRename = async () => {
      if (!renameSessionId || !renameValue.trim()) return;
      const res = await window.electronAPI.renameSession(renameSessionId, renameValue.trim());
      if (res.success) {
          setSessions(prev => prev.map(s => s.id === res.session.id ? res.session : s));
      }
      setRenameModalOpened(false);
      setRenameSessionId(null);
      setRenameValue('');
  };

  // Export session
  const openExportModal = (e, sessionId) => {
      e.stopPropagation();
      setExportSessionId(sessionId);
      setExportModalOpened(true);
  };

  const handleExport = async (format) => {
      if (!exportSessionId) return;
      await window.electronAPI.exportSession(exportSessionId, format);
      setExportModalOpened(false);
      setExportSessionId(null);
  };

  // Search within conversation
  const handleSearch = async (query) => {
      setSearchQuery(query);
      if (!query.trim() || !activeSessionId) {
          setSearchResults([]);
          return;
      }
      
      setIsSearching(true);
      const res = await window.electronAPI.searchSession(activeSessionId, query);
      setIsSearching(false);
      
      if (res.success) {
          setSearchResults(res.results);
      }
  };

  const scrollToMessage = (messageIndex) => {
      const messageElements = document.querySelectorAll('[data-message-index]');
      const target = Array.from(messageElements).find(el => 
          el.getAttribute('data-message-index') === String(messageIndex)
      );
      if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.style.animation = 'highlight-flash 1.5s ease';
          setTimeout(() => { target.style.animation = ''; }, 1500);
      }
      setShowSearchBar(false);
      setSearchQuery('');
      setSearchResults([]);
  };

  const toggleSearchBar = () => {
      setShowSearchBar(!showSearchBar);
      if (showSearchBar) {
          setSearchQuery('');
          setSearchResults([]);
      }
  };

  useEffect(() => {
      const loadDevices = async () => {
          try {
              await navigator.mediaDevices.getUserMedia({ audio: true });
              
              const devices = await navigator.mediaDevices.enumerateDevices();
              const inputs = devices.filter(d => d.kind === 'audioinput').map(d => ({ value: d.deviceId, label: d.label || `Microphone ${d.deviceId.slice(0, 5)}` }));
              const outputs = devices.filter(d => d.kind === 'audiooutput').map(d => ({ value: d.deviceId, label: d.label || `Speaker ${d.deviceId.slice(0, 5)}` }));
              
              setAudioDevices({ inputs, outputs });
              
              if (inputs.length > 0 && !selectedInput) {
                  setSelectedInput(inputs[0].value);
                  window.electronAPI.saveSettings({ selectedInput: inputs[0].value });
              }
              if (outputs.length > 0 && !selectedOutput) {
                  setSelectedOutput(outputs[0].value);
                  window.electronAPI.saveSettings({ selectedOutput: outputs[0].value });
              }
              
          } catch (e) {
              console.warn("Error loading audio devices:", e);
          }
      };
      
      if (settingsOpened) {
          loadDevices();
          loadMemories();
      }
  }, [settingsOpened]);

  // Memory management functions
  const loadMemories = async () => {
      try {
          const result = await window.electronAPI.getMemories();
          if (result.success) {
              setMemories(result.memories || []);
          }
      } catch (e) {
          console.error('Error loading memories:', e);
      }
  };

  const handleAddMemory = async () => {
      if (!newMemoryContent.trim()) return;
      try {
          const result = await window.electronAPI.addMemory(newMemoryContent.trim(), newMemoryCategory);
          if (result.success) {
              setMemories([...memories, result.memory]);
              setNewMemoryContent('');
              setNewMemoryCategory('other');
          }
      } catch (e) {
          console.error('Error adding memory:', e);
      }
  };

  const handleUpdateMemory = async (id) => {
      if (!editingMemoryContent.trim()) return;
      try {
          const result = await window.electronAPI.updateMemory(id, editingMemoryContent.trim());
          if (result.success) {
              setMemories(memories.map(m => m.id === id ? result.memory : m));
              setEditingMemoryId(null);
              setEditingMemoryContent('');
          }
      } catch (e) {
          console.error('Error updating memory:', e);
      }
  };

  const handleDeleteMemory = async (id) => {
      try {
          const result = await window.electronAPI.deleteMemory(id);
          if (result.success) {
              setMemories(memories.filter(m => m.id !== id));
          }
      } catch (e) {
          console.error('Error deleting memory:', e);
      }
  };

  const handleClearAllMemories = async () => {
      if (window.confirm('Are you sure you want to delete all memories? This cannot be undone.')) {
          try {
              const result = await window.electronAPI.clearAllMemories();
              if (result.success) {
                  setMemories([]);
              }
          } catch (e) {
              console.error('Error clearing memories:', e);
          }
      }
  };

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const harkRef = useRef(null);
  const harkInstanceRef = useRef(null);

  useEffect(() => {
      import('hark').then((module) => {
          harkInstanceRef.current = module.default || module;
      }).catch(err => console.error("Failed to load hark:", err));
  }, []);

  const toggleListening = async () => {
    if (isListening) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const startRecording = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: { 
                deviceId: selectedInput ? { exact: selectedInput } : undefined,
                channelCount: 1,
            } 
        });
        
        setIsListening(true);
        isListeningRef.current = true;
        
        if (harkInstanceRef.current) {
            const speechEvents = harkInstanceRef.current(stream, { interval: 100, threshold: -50 });
            harkRef.current = speechEvents;

            speechEvents.on('stopped_speaking', () => {
                stopRecordingAndSend(stream); 
            });
        }

        startMediaRecorder(stream);

      } catch (err) {
        alert("Could not start recording: " + err.message);
        setIsListening(false);
        isListeningRef.current = false;
      }
  };

  const startMediaRecorder = (stream) => {
      audioChunksRef.current = [];
      
      let recorder;
      try {
          recorder = new MediaRecorder(stream);
      } catch (e) {
          try {
              recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
          } catch (e2) {
              return;
          }
      }
      
      recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
              audioChunksRef.current.push(e.data);
          }
      };
      
      recorder.start(1000); 
      mediaRecorderRef.current = recorder;
  };

  const stopRecordingAndSend = async (stream) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;
      
      const recorder = mediaRecorderRef.current;
      if (!recorder) return;
      
      const finalHandler = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
          const arrayBuffer = await audioBlob.arrayBuffer();
          
          if (arrayBuffer.byteLength > 0) {
             try {
                 const res = await window.electronAPI.transcribeAudio(arrayBuffer);
                 if (res.success) {
                     setInput(prev => {
                         const cleanPrev = prev.replace('...Transcribing...', '').trim();
                         return (cleanPrev + " " + res.text).trim();
                     });
                 }
             } catch (e) {
                 console.error("IPC Error:", e);
             }
          }
      };

      recorder.onstop = finalHandler;
      recorder.stop();
  };

  const stopRecording = () => {
      setIsListening(false);
      isListeningRef.current = false;
      
      if (harkRef.current) {
          harkRef.current.stop();
          harkRef.current = null;
      }

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
      }
      
      if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
          mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      }
      mediaRecorderRef.current = null;
  };

  const toggleVoiceMode = () => {
      if (isVoiceMode) {
          window.speechSynthesis.cancel();
      }
      setIsVoiceMode(!isVoiceMode);
  };

  if (!isReady) return (
    <Center h="100vh" style={{ background: 'linear-gradient(180deg, #0a0a0f 0%, #12121a 100%)' }}>
      <Stack align="center" gap="lg">
        <div style={{ 
          width: 60, 
          height: 60, 
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 40px rgba(99, 102, 241, 0.4)'
        }}>
          <IconSparkles size={28} color="white" />
        </div>
        <Loader color="#6366f1" type="dots" size="md" />
      </Stack>
    </Center>
  );

  // Styles for inputs
  const inputStyles = {
      input: {
          backgroundColor: '#12121a',
          borderColor: 'rgba(255,255,255,0.1)',
          color: '#f8fafc',
          borderRadius: '10px',
          '&:focus': { borderColor: '#6366f1', boxShadow: '0 0 0 3px rgba(99, 102, 241, 0.2)' }
      },
      label: { color: '#94a3b8', fontWeight: 500, marginBottom: '6px' }
  };

  const selectStyles = {
      input: { 
          backgroundColor: '#12121a', 
          borderColor: 'rgba(255,255,255,0.1)', 
          color: '#f8fafc',
          borderRadius: '10px'
      }, 
      dropdown: { 
          backgroundColor: '#1a1a24', 
          borderColor: 'rgba(255,255,255,0.1)', 
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
      }, 
      option: { 
          borderRadius: '8px',
          '&:hover': { backgroundColor: '#22222e' },
          '&[data-selected]': { backgroundColor: 'rgba(99, 102, 241, 0.2)' }
      },
      label: { color: '#94a3b8', fontWeight: 500, marginBottom: '6px' }
  };

  // Menu View - Dashboard
  if (view === 'menu') {
      return (
        <Box style={{ 
          minHeight: '100vh', 
          background: 'linear-gradient(180deg, #0a0a0f 0%, #0d0d14 50%, #0a0a0f 100%)',
          position: 'relative',
          overflow: 'hidden'
        }}>
            {/* Subtle gradient orbs */}
            <div style={{
              position: 'absolute',
              top: '-20%',
              right: '-10%',
              width: '600px',
              height: '600px',
              background: 'radial-gradient(circle, rgba(99, 102, 241, 0.08) 0%, transparent 70%)',
              pointerEvents: 'none'
            }} />
            <div style={{
              position: 'absolute',
              bottom: '-30%',
              left: '-10%',
              width: '500px',
              height: '500px',
              background: 'radial-gradient(circle, rgba(139, 92, 246, 0.06) 0%, transparent 70%)',
              pointerEvents: 'none'
            }} />

            <Container size="lg" py={50} style={{ position: 'relative', zIndex: 1 }}>
                {/* Header */}
                <Group justify="space-between" mb={50}>
                    <Group gap="lg">
                        <div style={{
                          width: 48,
                          height: 48,
                          borderRadius: '14px',
                          background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 4px 20px rgba(99, 102, 241, 0.3)'
                        }}>
                          <IconSparkles size={24} color="white" />
                        </div>
                        <div>
                          <Title order={2} c="#f8fafc" style={{ fontWeight: 600, letterSpacing: '-0.02em' }}>Faces</Title>
                          <Text size="sm" c="#64748b">AI Voice Assistant</Text>
                        </div>
                    </Group>
                    <Group gap="sm">
                        <Badge 
                          leftSection={offlineMode ? <IconWifiOff size={12} /> : <IconWifi size={12} />}
                          color={offlineMode ? "orange" : "green"} 
                          variant="light"
                          size="lg"
                          style={{ textTransform: 'none', fontWeight: 500 }}
                        >
                          {offlineMode ? 'Offline' : 'Online'}
                        </Badge>
                        <ActionIcon 
                          size={44} 
                          variant="light" 
                          color="gray" 
                          onClick={openSettings}
                          style={{ borderRadius: '12px' }}
                        >
                          <IconSettings size={22} />
                        </ActionIcon>
                    </Group>
                </Group>

                {/* Provider Cards */}
                <Box mb={50}>
                    <Text size="sm" fw={600} c="#64748b" mb="md" style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      Start New Conversation
                    </Text>
                    <Grid gutter="md">
                        {(['openai', 'anthropic', 'gemini', 'local']).map(p => {
                            const isDisabled = offlineMode && p !== 'local';
                            const providerNames = {
                              openai: 'OpenAI',
                              anthropic: 'Anthropic',
                              gemini: 'Google Gemini',
                              local: 'Local AI'
                            };
                            const providerDesc = {
                              openai: 'GPT-4o, GPT-4 Turbo',
                              anthropic: 'Claude 3.5 Sonnet',
                              gemini: 'Gemini 1.5 Pro',
                              local: 'LM Studio / Ollama'
                            };
                            
                            return (
                              <Grid.Col span={{ base: 12, sm: 6, md: 3 }} key={p}>
                                <Paper 
                                    p="lg"
                                    className={`provider-card ${isDisabled ? 'disabled' : ''}`}
                                    onClick={() => !isDisabled && createNewChat(p)}
                                    style={{
                                      background: isDisabled 
                                        ? 'rgba(18, 18, 26, 0.5)' 
                                        : 'linear-gradient(135deg, #12121a 0%, #1a1a24 100%)',
                                      border: '1px solid rgba(255,255,255,0.06)',
                                      borderRadius: '16px',
                                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                                      opacity: isDisabled ? 0.4 : 1,
                                      transition: 'all 0.25s ease',
                                      height: '100%'
                                    }}
                                >
                                    <Stack gap="md">
                                        <Box 
                                          w={48} 
                                          h={48} 
                                          style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'center',
                                            background: 'rgba(255,255,255,0.05)',
                                            borderRadius: '12px'
                                          }}
                                        >
                                          <img 
                                            src={getLogoPath(p)} 
                                            style={{ width: 28, height: 28, objectFit: 'contain' }} 
                                            onError={(e) => { e.target.style.display = 'none'; }} 
                                          />
                                        </Box>
                                        <div>
                                          <Text fw={600} c="#f8fafc" size="md">{providerNames[p]}</Text>
                                          <Text size="xs" c="#64748b" mt={4}>{providerDesc[p]}</Text>
                                        </div>
                                    </Stack>
                                </Paper>
                              </Grid.Col>
                            );
                        })}
                    </Grid>
                </Box>

                {/* Recent Sessions */}
                <Box>
                    <Group justify="space-between" mb="md">
                      <Text size="sm" fw={600} c="#64748b" style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        Recent Conversations
                      </Text>
                      <Text size="xs" c="#4b5563">{sessions.length} total</Text>
                    </Group>
                    
                    {sessions.length === 0 ? (
                      <Paper 
                        p={40} 
                        style={{ 
                          background: '#12121a', 
                          border: '1px dashed rgba(255,255,255,0.1)',
                          borderRadius: '16px',
                          textAlign: 'center'
                        }}
                      >
                        <IconMessage2 size={40} color="#4b5563" style={{ marginBottom: 12 }} />
                        <Text c="#64748b" size="sm">No conversations yet. Start one above!</Text>
                      </Paper>
                    ) : (
                      <Stack gap="sm">
                          {sessions.map(session => (
                              <Paper 
                                key={session.id} 
                                p="md" 
                                className="session-card"
                                onClick={() => openSession(session.id)}
                                style={{
                                  background: 'linear-gradient(135deg, #12121a 0%, #16161f 100%)',
                                  border: '1px solid rgba(255,255,255,0.06)',
                                  borderRadius: '14px',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease'
                                }}
                              >
                                  <Group justify="space-between">
                                      <Group gap="md">
                                          <Box 
                                            w={40} 
                                            h={40} 
                                            style={{ 
                                              display: 'flex', 
                                              alignItems: 'center', 
                                              justifyContent: 'center',
                                              background: 'rgba(255,255,255,0.05)',
                                              borderRadius: '10px'
                                            }}
                                          >
                                            <img 
                                              src={getLogoPath(session.provider)} 
                                              style={{ width: 22, height: 22, objectFit: 'contain' }} 
                                              onError={(e) => { e.target.style.display = 'none'; }} 
                                            />
                                          </Box>
                                          <div>
                                              <Text fw={500} c="#f8fafc" size="sm">{session.name || 'Untitled Chat'}</Text>
                                              <Text size="xs" c="#64748b">{session.model}</Text>
                                          </div>
                                      </Group>
                                      <Group gap="xs">
                                          <Tooltip label="Start Voice Chat" position="top">
                                            <ActionIcon 
                                                size={36} 
                                                variant="light" 
                                                color="green" 
                                                onClick={(e) => { e.stopPropagation(); window.electronAPI.openVoiceWindow(session.id); }}
                                                style={{ borderRadius: '10px' }}
                                            >
                                                <IconPlayerPlay size={18} />
                                            </ActionIcon>
                                          </Tooltip>
                                          <Tooltip label="Rename" position="top">
                                            <ActionIcon 
                                              size={36} 
                                              color="blue" 
                                              variant="subtle" 
                                              onClick={(e) => openRenameModal(e, session.id, session.name)}
                                              style={{ borderRadius: '10px' }}
                                            >
                                              <IconPencil size={16} />
                                            </ActionIcon>
                                          </Tooltip>
                                          <Tooltip label="Export" position="top">
                                            <ActionIcon 
                                              size={36} 
                                              color="violet" 
                                              variant="subtle" 
                                              onClick={(e) => openExportModal(e, session.id)}
                                              style={{ borderRadius: '10px' }}
                                            >
                                              <IconDownload size={16} />
                                            </ActionIcon>
                                          </Tooltip>
                                          <Tooltip label="Delete" position="top">
                                            <ActionIcon 
                                              size={36} 
                                              color="red" 
                                              variant="subtle" 
                                              onClick={(e) => deleteSession(e, session.id)}
                                              style={{ borderRadius: '10px' }}
                                            >
                                              <IconTrash size={16} />
                                            </ActionIcon>
                                          </Tooltip>
                                      </Group>
                                  </Group>
                              </Paper>
                          ))}
                      </Stack>
                    )}
                </Box>
            </Container>

            {/* Rename Modal */}
            <Modal
              opened={renameModalOpened}
              onClose={() => setRenameModalOpened(false)}
              title={
                <Group gap="sm">
                  <IconPencil size={20} color="#3b82f6" />
                  <Text fw={600}>Rename Conversation</Text>
                </Group>
              }
              centered
              size="sm"
              styles={{ 
                content: { 
                  backgroundColor: '#12121a', 
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '20px'
                }, 
                header: { 
                  backgroundColor: '#12121a', 
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  padding: '20px 24px'
                },
                body: { padding: '24px' },
                close: { color: '#94a3b8' }
              }}
            >
                <Stack gap="md">
                    <TextInput
                        label="Conversation Name"
                        placeholder="Enter a name..."
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                        styles={inputStyles}
                        autoFocus
                    />
                    <Group justify="flex-end" gap="sm">
                        <Button variant="subtle" color="gray" onClick={() => setRenameModalOpened(false)}>
                            Cancel
                        </Button>
                        <Button 
                            onClick={handleRename}
                            style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' }}
                        >
                            Save
                        </Button>
                    </Group>
                </Stack>
            </Modal>

            {/* Export Modal */}
            <Modal
              opened={exportModalOpened}
              onClose={() => setExportModalOpened(false)}
              title={
                <Group gap="sm">
                  <IconDownload size={20} color="#8b5cf6" />
                  <Text fw={600}>Export Conversation</Text>
                </Group>
              }
              centered
              size="sm"
              styles={{ 
                content: { 
                  backgroundColor: '#12121a', 
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '20px'
                }, 
                header: { 
                  backgroundColor: '#12121a', 
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  padding: '20px 24px'
                },
                body: { padding: '24px' },
                close: { color: '#94a3b8' }
              }}
            >
                <Stack gap="md">
                    <Text size="sm" c="#94a3b8">Choose export format:</Text>
                    <Group grow>
                        <Paper
                            p="lg"
                            onClick={() => handleExport('markdown')}
                            style={{
                                background: '#1a1a24',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '12px',
                                cursor: 'pointer',
                                textAlign: 'center',
                                transition: 'all 0.2s ease'
                            }}
                            className="export-option"
                        >
                            <IconMarkdown size={32} color="#8b5cf6" style={{ marginBottom: 8 }} />
                            <Text fw={500} c="#f8fafc">Markdown</Text>
                            <Text size="xs" c="#64748b">.md file</Text>
                        </Paper>
                        <Paper
                            p="lg"
                            onClick={() => handleExport('text')}
                            style={{
                                background: '#1a1a24',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '12px',
                                cursor: 'pointer',
                                textAlign: 'center',
                                transition: 'all 0.2s ease'
                            }}
                            className="export-option"
                        >
                            <IconFileText size={32} color="#3b82f6" style={{ marginBottom: 8 }} />
                            <Text fw={500} c="#f8fafc">Plain Text</Text>
                            <Text size="xs" c="#64748b">.txt file</Text>
                        </Paper>
                    </Group>
                </Stack>
            </Modal>

            {/* Settings Modal */}
            <Modal 
              opened={settingsOpened} 
              onClose={() => { closeSettings(); setSettingsTab('general'); }}
              title={
                <Group gap="sm">
                  <IconSettings size={20} color="#6366f1" />
                  <Text fw={600}>Settings</Text>
                </Group>
              }
              centered 
              size="xl"
              styles={{ 
                content: { 
                  backgroundColor: '#12121a', 
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '20px'
                }, 
                header: { 
                  backgroundColor: '#12121a', 
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  padding: '20px 24px'
                },
                body: { padding: '24px' },
                close: { color: '#94a3b8' }
              }}
            >
                {/* Settings Tabs */}
                <Group mb="lg" gap="xs">
                    <Button
                        variant={settingsTab === 'general' ? 'filled' : 'subtle'}
                        color="violet"
                        size="sm"
                        leftSection={<IconSettings size={16} />}
                        onClick={() => setSettingsTab('general')}
                        style={{ borderRadius: '8px' }}
                    >
                        General
                    </Button>
                    <Button
                        variant={settingsTab === 'memory' ? 'filled' : 'subtle'}
                        color="violet"
                        size="sm"
                        leftSection={<IconBrain size={16} />}
                        onClick={() => setSettingsTab('memory')}
                        style={{ borderRadius: '8px' }}
                    >
                        Memory ({memories.length})
                    </Button>
                </Group>

                {settingsTab === 'general' ? (
                <Stack gap="lg">
                    {/* API Keys Section */}
                    <Box>
                      <Text size="xs" fw={600} c="#6366f1" mb="sm" style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        API Configuration
                      </Text>
                      <Stack gap="sm">
                        <PasswordInput label="OpenAI Key" placeholder="sk-..." styles={inputStyles} value={configs.openai?.apiKey || ''} onChange={(e) => handleConfigChange('openai', 'apiKey', e.target.value)} />
                        <PasswordInput label="Claude Key" placeholder="sk-ant-..." styles={inputStyles} value={configs.anthropic?.apiKey || ''} onChange={(e) => handleConfigChange('anthropic', 'apiKey', e.target.value)} />
                        <PasswordInput label="Gemini Key" placeholder="AIza..." styles={inputStyles} value={configs.gemini?.apiKey || ''} onChange={(e) => handleConfigChange('gemini', 'apiKey', e.target.value)} />
                        <TextInput label="Local AI URL" placeholder="http://localhost:1234/v1" styles={inputStyles} value={configs.local?.baseURL || ''} onChange={(e) => handleConfigChange('local', 'baseURL', e.target.value)} />
                      </Stack>
                    </Box>
                    
                    <Divider color="rgba(255,255,255,0.06)" />
                    
                    <Switch 
                        label="Offline Mode (Local Only)" 
                        checked={offlineMode} 
                        onChange={handleOfflineModeChange}
                        styles={{ 
                          label: { color: '#f8fafc', fontWeight: 500 },
                          track: { backgroundColor: offlineMode ? '#6366f1' : '#2a2a38' }
                        }}
                    />

                    <Divider color="rgba(255,255,255,0.06)" label={<Text size="xs" c="#64748b">Voice & Audio</Text>} labelPosition="center" />
                    
                    <Select
                        label="Text-to-Speech Provider"
                        data={[
                            { value: 'piper', label: 'Local (Piper)' },
                            { value: 'kokoro', label: 'Local (Kokoro)' },
                            { value: 'openai', label: 'OpenAI TTS' },
                            { value: 'elevenlabs', label: 'ElevenLabs' },
                            { value: 'external', label: 'Custom / External' }
                        ]}
                        value={ttsProvider}
                        onChange={handleTtsProviderChange}
                        disabled={offlineMode && ttsProvider !== 'piper' && ttsProvider !== 'kokoro'} 
                        styles={selectStyles}
                    />

                    {ttsProvider === 'elevenlabs' && (
                        <Stack gap="sm">
                            <PasswordInput 
                                label="ElevenLabs API Key" 
                                placeholder="sk_..." 
                                value={elevenLabsApiKey}
                                onChange={(e) => handleElevenLabsApiKeyChange(e.target.value)}
                                styles={inputStyles}
                            />
                            <Select
                                label="Voice"
                                data={[
                                    { value: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel' },
                                    { value: 'EXAVITQu4vr4xnSDxMaL', label: 'Bella' },
                                    { value: 'ErXwobaYiN019PkySvjV', label: 'Antoni' },
                                    { value: 'TxGEqnHWrfWFTfGW9XjX', label: 'Josh' },
                                    { value: 'onwK4e9ZLuTAKqWW03F9', label: 'Daniel' },
                                ]}
                                value={elevenLabsVoiceId}
                                onChange={handleElevenLabsVoiceIdChange}
                                styles={selectStyles}
                            />
                        </Stack>
                    )}

                    {ttsProvider === 'external' && (
                        <TextInput 
                            label="Custom TTS URL" 
                            placeholder="http://localhost:8080/v1/audio/speech" 
                            value={ttsUrl}
                            onChange={(e) => handleTtsUrlChange(e.target.value)}
                            styles={inputStyles}
                        />
                    )}

                    <Group grow>
                      <Select 
                          label="Microphone"  
                          placeholder="Select..." 
                          data={audioDevices.inputs} 
                          value={selectedInput}
                          onChange={handleAudioInputChange}
                          styles={selectStyles}
                      />
                      <Select 
                          label="Speaker" 
                          placeholder="Select..." 
                          data={audioDevices.outputs} 
                          value={selectedOutput}
                          onChange={handleAudioOutputChange}
                          styles={selectStyles}
                      />
                    </Group>

                    <Divider color="rgba(255,255,255,0.06)" label={<Text size="xs" c="#64748b">Vision (Camera)</Text>} labelPosition="center" />
                    
                    <Select
                        label="Vision Provider"
                        data={[
                            { value: 'local', label: '🏠 Local (LM Studio - Gemma 3)' },
                            { value: 'gpt4', label: '☁️ GPT-4.1 Vision (OpenAI)' }
                        ]}
                        value={visionProvider}
                        onChange={handleVisionProviderChange}
                        styles={selectStyles}
                    />

                    <Divider color="rgba(255,255,255,0.06)" label={<Text size="xs" c="#64748b">Web Search (Brave)</Text>} labelPosition="center" />
                    
                    <Stack gap="sm">
                        <Switch 
                            label="Enable Web Search" 
                            description="Allow AI to search the web for current information"
                            checked={webSearchEnabled} 
                            onChange={(e) => handleWebSearchEnabledChange(e.currentTarget.checked)}
                            styles={{ 
                                label: { color: '#f8fafc', fontWeight: 500 },
                                description: { color: '#64748b' },
                                track: { backgroundColor: webSearchEnabled ? '#6366f1' : '#2a2a38' }
                            }}
                        />
                        <PasswordInput 
                            label="Brave Search API Key" 
                            placeholder="BSA..." 
                            description={
                                <Text size="xs" c="#64748b">
                                    Get a free API key at{' '}
                                    <Text component="span" c="#6366f1" style={{ cursor: 'pointer' }}>
                                        api.search.brave.com
                                    </Text>
                                    {' '}(2,000 free searches/month)
                                </Text>
                            }
                            value={braveSearchApiKey}
                            onChange={(e) => handleBraveSearchApiKeyChange(e.target.value)}
                            styles={inputStyles}
                        />
                    </Stack>

                    <Divider color="rgba(255,255,255,0.06)" label={<Text size="xs" c="#64748b">Voice Chat Options</Text>} labelPosition="center" />
                    
                    <Stack gap="sm">
                        <Switch 
                            label="Show Waveform Display" 
                            description="Visual audio waveform while speaking"
                            checked={showWaveform} 
                            onChange={(e) => handleShowWaveformChange(e.currentTarget.checked)}
                            styles={{ 
                                label: { color: '#f8fafc', fontWeight: 500 },
                                description: { color: '#64748b' },
                                track: { backgroundColor: showWaveform ? '#6366f1' : '#2a2a38' }
                            }}
                        />
                        <Switch 
                            label="Push-to-Talk Mode" 
                            description="Hold spacebar to talk instead of auto-detect"
                            checked={pushToTalk} 
                            onChange={(e) => handlePushToTalkChange(e.currentTarget.checked)}
                            styles={{ 
                                label: { color: '#f8fafc', fontWeight: 500 },
                                description: { color: '#64748b' },
                                track: { backgroundColor: pushToTalk ? '#6366f1' : '#2a2a38' }
                            }}
                        />
                        <Switch 
                            label="Transcription Preview" 
                            description="Review transcription before sending"
                            checked={showTranscriptionPreview} 
                            onChange={(e) => handleShowTranscriptionPreviewChange(e.currentTarget.checked)}
                            styles={{ 
                                label: { color: '#f8fafc', fontWeight: 500 },
                                description: { color: '#64748b' },
                                track: { backgroundColor: showTranscriptionPreview ? '#6366f1' : '#2a2a38' }
                            }}
                        />
                        <Switch 
                            label="Sync Voice to Chat" 
                            description="Add voice conversations to chat history"
                            checked={syncVoiceToChat} 
                            onChange={(e) => handleSyncVoiceToChatChange(e.currentTarget.checked)}
                            styles={{ 
                                label: { color: '#f8fafc', fontWeight: 500 },
                                description: { color: '#64748b' },
                                track: { backgroundColor: syncVoiceToChat ? '#6366f1' : '#2a2a38' }
                            }}
                        />
                        <Switch 
                            label="Allow Interruption" 
                            description="Talk over the AI to interrupt its response"
                            checked={allowInterruption} 
                            onChange={(e) => handleAllowInterruptionChange(e.currentTarget.checked)}
                            styles={{ 
                                label: { color: '#f8fafc', fontWeight: 500 },
                                description: { color: '#64748b' },
                                track: { backgroundColor: allowInterruption ? '#6366f1' : '#2a2a38' }
                            }}
                        />
                    </Stack>

                    <Divider color="rgba(255,255,255,0.06)" label={<Text size="xs" c="#64748b">Face Customization</Text>} labelPosition="center" />
                    
                    <Box>
                        <Text size="sm" fw={500} c="#94a3b8" mb="xs">Face Color</Text>
                        <Group gap="sm">
                            {['#ffffff', '#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6'].map((color) => (
                                <Tooltip key={color} label={color}>
                                    <Box
                                        onClick={() => handleFaceColorChange(color)}
                                        style={{
                                            width: 32,
                                            height: 32,
                                            borderRadius: '8px',
                                            backgroundColor: color,
                                            cursor: 'pointer',
                                            border: faceColor === color ? '3px solid #fff' : '2px solid rgba(255,255,255,0.2)',
                                            boxShadow: faceColor === color ? `0 0 12px ${color}` : 'none',
                                            transition: 'all 0.2s ease'
                                        }}
                                    />
                                </Tooltip>
                            ))}
                            <TextInput
                                placeholder="#hex"
                                value={faceColor}
                                onChange={(e) => handleFaceColorChange(e.target.value)}
                                w={80}
                                size="xs"
                                styles={{
                                    input: {
                                        backgroundColor: '#12121a',
                                        borderColor: 'rgba(255,255,255,0.1)',
                                        color: '#f8fafc',
                                        borderRadius: '8px'
                                    }
                                }}
                            />
                        </Group>
                    </Box>

                    <Button
                        variant="light"
                        color="violet"
                        leftSection={<IconBrain size={18} />}
                        onClick={() => {
                            if (window.electronAPI?.openFaceEditor) {
                                window.electronAPI.openFaceEditor();
                            }
                        }}
                        style={{ borderRadius: '10px' }}
                    >
                        Open Face Editor
                    </Button>
                </Stack>
                ) : (
                /* Memory Tab */
                <Stack gap="md">
                    <Text size="sm" c="#94a3b8">
                        Memories help the AI remember important things about you across all conversations, even after chats are deleted.
                    </Text>
                    
                    {/* Add New Memory */}
                    <Box p="md" style={{ backgroundColor: 'rgba(99, 102, 241, 0.1)', borderRadius: '12px', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                        <Text size="sm" fw={600} c="#f8fafc" mb="sm">Add New Memory</Text>
                        <Group align="end" gap="sm">
                            <TextInput
                                placeholder="e.g., User's name is Max, Likes pizza, Works as a developer..."
                                value={newMemoryContent}
                                onChange={(e) => setNewMemoryContent(e.target.value)}
                                style={{ flex: 1 }}
                                styles={{
                                    input: {
                                        backgroundColor: '#12121a',
                                        borderColor: 'rgba(255,255,255,0.1)',
                                        color: '#f8fafc',
                                        borderRadius: '8px'
                                    }
                                }}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddMemory()}
                            />
                            <Select
                                data={[
                                    { value: 'personal', label: '👤 Personal' },
                                    { value: 'preference', label: '⭐ Preference' },
                                    { value: 'location', label: '📍 Location' },
                                    { value: 'work', label: '💼 Work' },
                                    { value: 'family', label: '👨‍👩‍👧 Family' },
                                    { value: 'other', label: '📝 Other' }
                                ]}
                                value={newMemoryCategory}
                                onChange={setNewMemoryCategory}
                                w={150}
                                styles={{
                                    input: {
                                        backgroundColor: '#12121a',
                                        borderColor: 'rgba(255,255,255,0.1)',
                                        color: '#f8fafc',
                                        borderRadius: '8px'
                                    },
                                    dropdown: { backgroundColor: '#1a1a24', borderColor: 'rgba(255,255,255,0.1)' },
                                    option: { color: '#f8fafc' }
                                }}
                            />
                            <Button onClick={handleAddMemory} color="violet" style={{ borderRadius: '8px' }}>
                                Add
                            </Button>
                        </Group>
                    </Box>

                    {/* Memory List */}
                    <Box style={{ maxHeight: '400px', overflowY: 'auto' }}>
                        {memories.length === 0 ? (
                            <Text c="#64748b" ta="center" py="xl">
                                No memories yet. Add some manually or chat with the AI - it will automatically remember important facts about you!
                            </Text>
                        ) : (
                            <Stack gap="xs">
                                {memories.map((memory) => (
                                    <Box
                                        key={memory.id}
                                        p="sm"
                                        style={{
                                            backgroundColor: 'rgba(255,255,255,0.03)',
                                            borderRadius: '10px',
                                            border: '1px solid rgba(255,255,255,0.06)'
                                        }}
                                    >
                                        {editingMemoryId === memory.id ? (
                                            <Group gap="sm">
                                                <TextInput
                                                    value={editingMemoryContent}
                                                    onChange={(e) => setEditingMemoryContent(e.target.value)}
                                                    style={{ flex: 1 }}
                                                    styles={{
                                                        input: {
                                                            backgroundColor: '#12121a',
                                                            borderColor: 'rgba(99, 102, 241, 0.5)',
                                                            color: '#f8fafc',
                                                            borderRadius: '8px'
                                                        }
                                                    }}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleUpdateMemory(memory.id)}
                                                />
                                                <Button size="xs" color="green" onClick={() => handleUpdateMemory(memory.id)} style={{ borderRadius: '6px' }}>
                                                    Save
                                                </Button>
                                                <Button size="xs" variant="subtle" color="gray" onClick={() => setEditingMemoryId(null)} style={{ borderRadius: '6px' }}>
                                                    Cancel
                                                </Button>
                                            </Group>
                                        ) : (
                                            <Group justify="space-between">
                                                <Box style={{ flex: 1 }}>
                                                    <Group gap="xs" mb={4}>
                                                        <Badge size="xs" color={
                                                            memory.category === 'personal' ? 'blue' :
                                                            memory.category === 'preference' ? 'yellow' :
                                                            memory.category === 'location' ? 'green' :
                                                            memory.category === 'work' ? 'violet' :
                                                            memory.category === 'family' ? 'pink' : 'gray'
                                                        }>
                                                            {memory.category}
                                                        </Badge>
                                                        <Text size="xs" c="#64748b">
                                                            {new Date(memory.createdAt).toLocaleDateString()}
                                                        </Text>
                                                        {memory.source === 'auto' && (
                                                            <Badge size="xs" variant="outline" color="cyan">auto</Badge>
                                                        )}
                                                    </Group>
                                                    <Text size="sm" c="#f8fafc">{memory.content}</Text>
                                                </Box>
                                                <Group gap={4}>
                                                    <ActionIcon
                                                        size="sm"
                                                        variant="subtle"
                                                        color="gray"
                                                        onClick={() => {
                                                            setEditingMemoryId(memory.id);
                                                            setEditingMemoryContent(memory.content);
                                                        }}
                                                    >
                                                        <IconEdit size={14} />
                                                    </ActionIcon>
                                                    <ActionIcon
                                                        size="sm"
                                                        variant="subtle"
                                                        color="red"
                                                        onClick={() => handleDeleteMemory(memory.id)}
                                                    >
                                                        <IconTrash size={14} />
                                                    </ActionIcon>
                                                </Group>
                                            </Group>
                                        )}
                                    </Box>
                                ))}
                            </Stack>
                        )}
                    </Box>

                    {/* Clear All Button */}
                    {memories.length > 0 && (
                        <Button
                            variant="subtle"
                            color="red"
                            size="sm"
                            leftSection={<IconTrash size={16} />}
                            onClick={handleClearAllMemories}
                            style={{ alignSelf: 'flex-start' }}
                        >
                            Clear All Memories
                        </Button>
                    )}
                </Stack>
                )}
            </Modal>
        </Box>
      );
  }

  // Filter models based on offline mode
  const displayedModels = offlineMode 
    ? allModels.filter(g => g.provider === 'local') 
    : allModels;

  // Chat View
  return (
    <AppShell
      header={{ height: 64 }}
      navbar={{ width: 300, breakpoint: 'sm' }}
      padding="0"
      styles={{ 
        main: { backgroundColor: '#0a0a0f' }, 
        header: { 
          backgroundColor: '#0d0d14', 
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          backdropFilter: 'blur(20px)'
        }, 
        navbar: { 
          backgroundColor: '#0d0d14', 
          borderRight: '1px solid rgba(255,255,255,0.06)' 
        } 
      }}
    >
      <AppShell.Header p="sm">
         <Group h="100%" px="md" justify="space-between" align="center">
            <Group gap="md">
                <ActionIcon 
                  variant="subtle" 
                  color="gray" 
                  onClick={() => setView('menu')}
                  style={{ borderRadius: '10px' }}
                  size={38}
                >
                  <IconArrowLeft size={20} />
                </ActionIcon>
                <Select 
                    data={displayedModels}
                    itemComponent={SelectItem}
                    value={activeSession?.model}
                    onChange={handleModelChange}
                    placeholder="Select Model"
                    searchable
                    maxDropdownHeight={400}
                    w={280}
                    styles={selectStyles}
                    leftSection={
                      <img 
                        src={getLogoPath(activeSession?.provider)} 
                        style={{ width: 18, height: 18, objectFit: 'contain' }} 
                        onError={(e) => { e.target.style.display = 'none'; }} 
                      />
                    }
                    leftSectionPointerEvents="none"
                />
            </Group>
            <Group gap="sm">
                {showSearchBar ? (
                  <Group gap="xs">
                    <TextInput
                      placeholder="Search in conversation..."
                      value={searchQuery}
                      onChange={(e) => handleSearch(e.target.value)}
                      size="sm"
                      w={250}
                      rightSection={isSearching ? <Loader size="xs" color="#6366f1" /> : null}
                      styles={{
                        input: {
                          backgroundColor: '#12121a',
                          borderColor: 'rgba(255,255,255,0.1)',
                          color: '#f8fafc',
                          borderRadius: '10px',
                          '&:focus': { borderColor: '#6366f1' }
                        }
                      }}
                      autoFocus
                    />
                    <ActionIcon 
                      variant="subtle" 
                      color="gray" 
                      onClick={toggleSearchBar}
                      style={{ borderRadius: '10px' }}
                      size={38}
                    >
                      <IconX size={18} />
                    </ActionIcon>
                  </Group>
                ) : (
                  <>
                    <Tooltip label="Search (Ctrl+F)">
                      <ActionIcon 
                        variant="subtle" 
                        color="gray" 
                        onClick={toggleSearchBar}
                        style={{ borderRadius: '10px' }}
                        size={38}
                      >
                        <IconSearch size={20} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Rename">
                      <ActionIcon 
                        variant="subtle" 
                        color="gray" 
                        onClick={(e) => openRenameModal(e, activeSessionId, activeSession?.name)}
                        style={{ borderRadius: '10px' }}
                        size={38}
                      >
                        <IconPencil size={20} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Export">
                      <ActionIcon 
                        variant="subtle" 
                        color="gray" 
                        onClick={(e) => openExportModal(e, activeSessionId)}
                        style={{ borderRadius: '10px' }}
                        size={38}
                      >
                        <IconDownload size={20} />
                      </ActionIcon>
                    </Tooltip>
                  </>
                )}
            </Group>
         </Group>
         {/* Search Results Dropdown */}
         {showSearchBar && searchResults.length > 0 && (
           <Paper
             style={{
               position: 'absolute',
               top: '100%',
               right: 16,
               width: 350,
               maxHeight: 300,
               overflow: 'auto',
               background: '#1a1a24',
               border: '1px solid rgba(255,255,255,0.1)',
               borderRadius: '12px',
               zIndex: 1000,
               boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
             }}
             p="xs"
           >
             <Text size="xs" c="#64748b" mb="xs" px="xs">
               {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found
             </Text>
             <Stack gap={4}>
               {searchResults.slice(0, 20).map((result, idx) => (
                 <Paper
                   key={idx}
                   p="sm"
                   onClick={() => scrollToMessage(result.messageIndex)}
                   style={{
                     background: '#12121a',
                     border: '1px solid rgba(255,255,255,0.06)',
                     borderRadius: '8px',
                     cursor: 'pointer',
                     transition: 'all 0.15s ease'
                   }}
                   className="search-result-item"
                 >
                   <Group gap="xs" mb={4}>
                     <Badge size="xs" color={result.role === 'user' ? 'blue' : 'violet'}>
                       {result.role === 'user' ? 'You' : 'AI'}
                     </Badge>
                   </Group>
                   <Text size="xs" c="#94a3b8" lineClamp={2}>
                     {result.excerpt}
                   </Text>
                 </Paper>
               ))}
             </Stack>
           </Paper>
         )}
      </AppShell.Header>

      <AppShell.Navbar p="md">
         <Group mb="lg" px="xs" justify="space-between">
            <Text fw={600} size="xs" c="#64748b" style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Conversations
            </Text>
            <ActionIcon 
              variant="light" 
              color="violet" 
              onClick={() => createNewChat()}
              style={{ borderRadius: '8px' }}
              size={32}
            >
              <IconPlus size={16} />
            </ActionIcon>
         </Group>
         <ScrollArea style={{ flex: 1 }}>
             <Stack gap={6}>
                {sessions.map(s => (
                    <UnstyledButton 
                      key={s.id} 
                      onClick={() => setActiveSessionId(s.id)} 
                      style={{ 
                        display: 'block', 
                        width: '100%', 
                        padding: '12px 14px', 
                        borderRadius: '12px', 
                        backgroundColor: s.id === activeSessionId ? 'rgba(99, 102, 241, 0.15)' : 'transparent', 
                        border: s.id === activeSessionId ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid transparent',
                        color: s.id === activeSessionId ? '#f8fafc' : '#94a3b8', 
                        transition: 'all 0.15s ease' 
                      }}
                    >
                        <Group noWrap gap="sm">
                            <img 
                              src={getLogoPath(s.provider)} 
                              style={{ width: 18, height: 18, objectFit: 'contain' }} 
                              onError={(e) => { e.target.style.display = 'none'; }} 
                            />
                            <div style={{ flex: 1, overflow: 'hidden' }}>
                              <Text size="sm" truncate fw={s.id === activeSessionId ? 500 : 400}>{s.name}</Text>
                            </div>
                            {s.id === activeSessionId && (
                              <ActionIcon 
                                size="xs" 
                                color="red" 
                                variant="subtle" 
                                onClick={(e) => deleteSession(e, s.id)}
                              >
                                <IconTrash size={14} />
                              </ActionIcon>
                            )}
                        </Group>
                    </UnstyledButton>
                ))}
             </Stack>
         </ScrollArea>
      </AppShell.Navbar>

      <AppShell.Main>
         <ScrollArea style={{ height: 'calc(100vh - 64px - 90px)' }} viewportRef={viewport}>
            <Container size="md" py="xl">
                <Stack gap="xl">
{activeSession?.messages.map((msg, idx) => (
                                        <Box 
                                          key={idx}
                                          data-message-index={idx}
                                          style={{ 
                                            display: 'flex',
                                            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                            width: '100%'
                                          }}
                                        >
                            <Group 
                              align="flex-start" 
                              noWrap 
                              gap="sm"
                              style={{ 
                                maxWidth: '80%',
                                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row'
                              }}
                            >
                                {msg.role === 'user' ? (
                                    <Avatar 
                                      radius="xl" 
                                      size={36}
                                      style={{ 
                                        background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                                        border: 'none',
                                        flexShrink: 0
                                      }}
                                    >
                                      U
                                    </Avatar>
                                ) : (
                                    <Box 
                                      style={{ 
                                        width: 36, 
                                        height: 36, 
                                        flexShrink: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                      }}
                                    >
                                      <img 
                                        src={getLogoPath(msg.provider || activeSession.provider)} 
                                        style={{ width: 28, height: 28, objectFit: 'contain' }} 
                                        onError={(e) => { e.target.style.display = 'none'; }} 
                                      />
                                    </Box>
                                )}
                                <Box>
                                    <Text fw={500} size="xs" mb={6} c="#64748b" style={{ textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                                      {msg.role === 'user' ? 'You' : (msg.provider || activeSession.provider).charAt(0).toUpperCase() + (msg.provider || activeSession.provider).slice(1)}
                                    </Text>
                                    <Paper 
                                      p="md" 
                                      style={{ 
                                        background: msg.role === 'user' ? 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' : '#12121a',
                                        border: msg.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.06)',
                                        borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px'
                                      }}
                                    >
                                        {msg.role === 'user' ? (
                                            <div className="markdown-content" style={{ color: 'white', fontSize: '0.95rem', lineHeight: 1.6 }}>
                                                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                                    {msg.content}
                                                </ReactMarkdown>
                                            </div>
                                        ) : (
                                            <AIMessage content={msg.content} provider={msg.provider} isStreaming={false} />
                                        )}
                                    </Paper>
                                </Box>
                            </Group>
                        </Box>
                    ))}
                    
                    {/* Streaming Message */}
                    {loading && streamingContent && !isVoiceMode && (
                        <Group align="flex-start" noWrap gap="sm">
                             <Box 
                               style={{ 
                                 width: 36, 
                                 height: 36, 
                                 flexShrink: 0,
                                 display: 'flex',
                                 alignItems: 'center',
                                 justifyContent: 'center'
                               }}
                               className="pulsing-avatar"
                             >
                               <img 
                                 src={getLogoPath(activeSession.provider)} 
                                 style={{ width: 28, height: 28, objectFit: 'contain' }} 
                                 onError={(e) => { e.target.style.display = 'none'; }} 
                               />
                             </Box>
                             <Box style={{ maxWidth: '75%' }}>
                                <Text fw={500} size="xs" mb={6} c="#64748b">
                                  {activeSession.provider.charAt(0).toUpperCase() + activeSession.provider.slice(1)}
                                </Text>
                                <Paper p="md" style={{ backgroundColor: '#12121a', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '18px 18px 18px 4px' }}>
                                    <AIMessage content={streamingContent} provider={activeSession.provider} isStreaming={true} />
                                </Paper>
                             </Box>
                        </Group>
                    )}

                    {/* Loading */}
                    {loading && (!streamingContent || isVoiceMode) && (
                        <Group align="flex-start" noWrap gap="sm">
                             <Box 
                               style={{ 
                                 width: 36, 
                                 height: 36, 
                                 flexShrink: 0,
                                 display: 'flex',
                                 alignItems: 'center',
                                 justifyContent: 'center'
                               }}
                               className="pulsing-avatar"
                             >
                               <img 
                                 src={getLogoPath(activeSession.provider)} 
                                 style={{ width: 28, height: 28, objectFit: 'contain' }} 
                                 onError={(e) => { e.target.style.display = 'none'; }} 
                               />
                             </Box>
                             <Box style={{ alignSelf: 'center', paddingLeft: 8 }}>
                                 <Loader size="sm" type="dots" color="#6366f1" />
                             </Box>
                        </Group>
                    )}
                </Stack>
            </Container>
         </ScrollArea>

         {/* Input Area */}
         <Box 
           p="md" 
           style={{ 
             position: 'absolute', 
             bottom: 0, 
             left: 300, 
             right: 0, 
             backgroundColor: '#0d0d14', 
             borderTop: '1px solid rgba(255,255,255,0.06)',
             backdropFilter: 'blur(20px)'
           }}
         >
            <Container size="md">
                <div style={{ position: 'relative' }}>
                    <Textarea 
                        placeholder={isListening ? "Listening..." : "Message..."} 
                        value={input} 
                        onChange={(e) => setInput(e.target.value)} 
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()} 
                        disabled={loading} 
                        size="md" 
                        autosize
                        minRows={1}
                        maxRows={4}
                        styles={{ 
                            input: { 
                                backgroundColor: '#12121a', 
                                borderColor: isListening ? '#6366f1' : 'rgba(255,255,255,0.1)', 
                                color: '#f8fafc', 
                                paddingRight: 110,
                                paddingLeft: 50,
                                paddingTop: 14,
                                borderRadius: '14px',
                                fontSize: '15px',
                                '&:focus': { borderColor: '#6366f1', boxShadow: '0 0 0 3px rgba(99, 102, 241, 0.15)' } 
                            } 
                        }} 
                    />
                    
                    <ActionIcon 
                        size={38} 
                        radius="xl" 
                        variant={isListening ? "filled" : "subtle"} 
                        color={isListening ? "red" : "gray"}
                        onClick={toggleListening}
                        style={{ position: 'absolute', left: 6, top: 6 }}
                    >
                        <IconMicrophone size={18} />
                    </ActionIcon>

                    <Group gap={6} style={{ position: 'absolute', right: 6, top: 6 }}>
                        <ActionIcon 
                            size={38} 
                            radius="xl" 
                            variant={isVoiceMode ? "light" : "subtle"} 
                            color={isVoiceMode ? "green" : "gray"}
                            onClick={toggleVoiceMode}
                        >
                            {isVoiceMode ? <IconVolume size={18} /> : <IconVolumeOff size={18} />}
                        </ActionIcon>

                        <ActionIcon 
                            size={38} 
                            radius="xl" 
                            variant="filled" 
                            onClick={handleSend} 
                            disabled={loading || !input.trim()} 
                            style={{ 
                              background: loading || !input.trim() ? '#2a2a38' : 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                              boxShadow: loading || !input.trim() ? 'none' : '0 4px 12px rgba(99, 102, 241, 0.3)'
                            }}
                        >
                            <IconSend size={18} />
                        </ActionIcon>
                    </Group>
                </div>
            </Container>
         </Box>
      </AppShell.Main>
    </AppShell>
  );
}

export default App;
