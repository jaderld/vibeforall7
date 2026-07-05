import React, { useEffect, useState, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { CHAT_HISTORY_LIMIT, CHAT_STORAGE_PREFIX } from '../scripts/constants';

type Profile = 'standard' | 'dyslexia' | 'low-vision' | 'anti-epilepsy';
type AIProvider = 'openai' | 'gemini';
type ContactInfo = { telephone: string; email: string; adresse: string; horaires: string; contactLink?: string; contactLabel?: string; };
type DetectedFormField = { fieldId: string; selector: string; label: string; type: string; required: boolean; options?: string[] };
type DetectedForm = { formSelector: string; fields: DetectedFormField[]; submitSelector?: string };

type AnalysisData = {
  summary: string;
  steps: string[];
  glossary: { term: string; definition: string }[];
  contactInfo: ContactInfo;
};

const profiles: Array<{ id: Profile; label: string }> = [
  { id: 'standard', label: 'Standard' },
  { id: 'dyslexia', label: 'Dyslexie' },
  { id: 'low-vision', label: 'Basse vision' },
  { id: 'anti-epilepsy', label: 'Photosensible' }
];

const SIDEBAR_TEXT_SELECTOR = [
  'p', 'li', 'label', 'small', 'strong', 'em', 'b', 'u',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'button', 'input', 'select', 'textarea', 'option', 'span'
].join(', ');

const SIDEBAR_INTERACTIVE_SELECTOR = [
  'button', 'a', 'input', 'select', 'textarea', '[role="button"]'
].join(', ');

function getSidebarProfileCss(profile: Profile) {
  if (profile === 'standard') {
    return '';
  }

  if (profile === 'dyslexia') {
    return `
      .failc-sidebar-root.failc-profile-dyslexia ${SIDEBAR_TEXT_SELECTOR} {
        font-family: Verdana, Arial, sans-serif !important;
        line-height: 1.6 !important;
        letter-spacing: 0.05em !important;
        word-spacing: 0.16em !important;
        text-align: left !important;
      }

      .failc-sidebar-root.failc-profile-dyslexia p {
        max-width: 70ch !important;
        margin-bottom: 1.5em !important;
      }

      .failc-sidebar-root.failc-profile-dyslexia .material-icons,
      .failc-sidebar-root.failc-profile-dyslexia .material-symbols-outlined,
      .failc-sidebar-root.failc-profile-dyslexia .fa,
      .failc-sidebar-root.failc-profile-dyslexia [class^="fa-"],
      .failc-sidebar-root.failc-profile-dyslexia [class*=" fa-"],
      .failc-sidebar-root.failc-profile-dyslexia .bi,
      .failc-sidebar-root.failc-profile-dyslexia [class^="bi-"],
      .failc-sidebar-root.failc-profile-dyslexia [class*=" bi-"] {
        font-family: revert !important;
        letter-spacing: normal !important;
        word-spacing: normal !important;
      }
    `;
  }

  if (profile === 'low-vision') {
    return `
      .failc-sidebar-root.failc-profile-low-vision ${SIDEBAR_TEXT_SELECTOR} {
        font-size: max(1.25rem, 1em) !important;
        font-weight: 550 !important;
        line-height: 1.6 !important;
      }

      .failc-sidebar-root.failc-profile-low-vision ${SIDEBAR_INTERACTIVE_SELECTOR} {
        min-width: 2.75rem !important;
        min-height: 2.75rem !important;
      }

      .failc-sidebar-root.failc-profile-low-vision :where(button, a, input, select, textarea, [tabindex]):focus-visible {
        outline: 3px solid #f59e0b !important;
        outline-offset: 3px !important;
        box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.32) !important;
      }
    `;
  }

  return `
    .failc-sidebar-root.failc-profile-anti-epilepsy,
    .failc-sidebar-root.failc-profile-anti-epilepsy * {
      animation: none !important;
      transition: none !important;
      scroll-behavior: auto !important;
    }
  `;
}

const aiProviders: Array<{ id: AIProvider; label: string; note: string }> = [
  { id: 'openai', label: 'OpenAI', note: 'Utilise l’API OpenAI avec GPT-4o mini.' },
  { id: 'gemini', label: 'Gemini', note: 'Utilise l’API Gemini avec Gemini 1.5 Flash.' },
];

const AI_STORAGE_KEYS = {
  provider: 'failcAiProvider',
  openaiKey: 'failcOpenAiApiKey',
  geminiKey: 'failcGeminiApiKey',
  settingsDone: 'failcAiSettingsDone',
} as const;

const PROFILE_STORAGE_KEYS = {
  profile: 'failcProfile',
  settingsDone: 'failcProfileSettingsDone',
} as const;

const getAnalysisStorageKey = (url: string) => `failc:${url}`;

type ChatMessage = { role: 'user' | 'assistant'; content: string; ts: number };
const getChatStorageKey = (url: string) => `${CHAT_STORAGE_PREFIX}${url}`;

const tokens = {
  bg: '#F5F6F8',
  surface: '#FFFFFF',
  border: '#DADFE6',
  borderStrong: '#B9C2CD',
  textPrimary: '#1F2A37',
  textSecondary: '#5B6675',
  accent: '#2F5D8A',
  accentHover: '#264B70',
  accentSoftBg: '#E8EFF6',
  accentSoftBorder: '#C7D6E6',
  neutralDark: '#33404F',
  success: '#2E7D4F',
  successBg: '#E7F3EC',
  error: '#B3411F',
  errorBg: '#FBEAE4',
  radius: 10,
  fontFamily: '"Atkinson Hyperlegible", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
};

const focusRing: React.CSSProperties = {
  outlineOffset: 2,
};

// Fonction pour parser le Markdown basique (Gras et sauts de ligne)
const renderMarkdown = (text: string) => {
  const parts = text.split(/(\*\*.*?\*\*|\n)/g);
  return parts.map((part, index) => {
    if (part === '\n') return <br key={index} />;
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return <span key={index}>{part}</span>;
  });
};

const Sidebar = () => {
  const [activeProfile, setActiveProfile] = useState<Profile>('standard');
  const [aiProvider, setAiProvider] = useState<AIProvider>('openai');
  const [openAiApiKey, setOpenAiApiKey] = useState<string>('');
  const [geminiApiKey, setGeminiApiKey] = useState<string>('');
  const [aiStatus, setAiStatus] = useState<string>('');
  const [showAiSettings, setShowAiSettings] = useState<boolean>(true);
  const [showProfileSettings, setShowProfileSettings] = useState<boolean>(true);
  const [showSettingsChooser, setShowSettingsChooser] = useState<boolean>(false);
  const [profileStatus, setProfileStatus] = useState<string>('');
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [analysisError, setAnalysisError] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

  // --- Chatbot ---
  const [currentUrl, setCurrentUrl] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [isChatSending, setIsChatSending] = useState<boolean>(false);
  const [chatError, setChatError] = useState<string>('');
  const [isListening, setIsListening] = useState<boolean>(false);
  const recognitionRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const pendingChatRequestRef = useRef<string | null>(null);
  const currentTabIdRef = useRef<number | null>(null);
  const voiceCancelledRef = useRef(false);
  const activeRecognitionRef = useRef<any>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null); // NOUVEAU: Référence pour empêcher le Garbage Collector

  const [isBotSpeaking, setIsBotSpeaking] = useState<boolean>(false);
  const stopBotSpeech = () => {
    window.speechSynthesis.cancel();
    setIsBotSpeaking(false);
  };

  // --- Formulaire Vocal ---
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);
  const [detectedForm, setDetectedForm] = useState<DetectedForm | null>(null);
  const [voiceFormActive, setVoiceFormActive] = useState<boolean>(false);
  const [voiceFormStatus, setVoiceFormStatus] = useState<'idle' | 'speaking' | 'listening' | 'processing'>('idle');
  const [voiceFormProgress, setVoiceFormProgress] = useState<{ index: number; total: number } | null>(null);
  const [voiceFormError, setVoiceFormError] = useState<string>('');
  const [voiceFormHistory, setVoiceFormHistory] = useState<{ role: 'bot' | 'user'; text: string }[]>([]);
  const formEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const messageListener = (message: any) => {
      if (message.type === 'ANALYSIS_STARTED') {
        setIsAnalyzing(true);
        setAnalysisError('');
      }
      if (message.type === 'ANALYSIS_ERROR') {
        setIsAnalyzing(false);
        setAnalysisError(message.error || 'Une erreur est survenue pendant l’analyse.');
      }
      if (message.type === 'ANALYSIS_COMPLETE') {
        setIsAnalyzing(false);
        if (message.data) {
          setAnalysis(message.data);
          setAnalysisError('');
        }
      }
      if (message.type === 'CHAT_REPLY') {
        if (message.requestId && message.requestId !== pendingChatRequestRef.current) return;
        
        setIsChatSending(false);
        pendingChatRequestRef.current = null;
        const replyText = String(message.reply || '');
        const isErrorReply = replyText.trim().startsWith('❌');
        
        setChatError(isErrorReply ? replyText.replace(/^❌\s*/, '') : '');
        setChatMessages((prev) => [...prev, { role: 'assistant' as const, content: replyText, ts: Date.now() }]);

        if (!isErrorReply) {
          window.speechSynthesis.cancel();
          
          const cleanTextForSpeech = replyText.replace(/\*/g, '');
          const utterance = new SpeechSynthesisUtterance(cleanTextForSpeech);
          utterance.lang = 'fr-FR';
          
          // FIX : Stocker dans la référence pour éviter le Garbage Collector de Chrome
          currentUtteranceRef.current = utterance;
          
          utterance.onstart = () => setIsBotSpeaking(true);
          utterance.onend = () => setIsBotSpeaking(false);
          utterance.onerror = (e) => {
            console.warn("Erreur de synthèse vocale :", e);
            setIsBotSpeaking(false);
          };
          
          window.speechSynthesis.speak(utterance);
        }
      }
      if (message.type === 'FORM_DETECTED') {
        setDetectedForm(message.form);
      }
      if (message.type === 'VOICE_FORM_QUESTION') {
        setVoiceFormError('');
        setVoiceFormProgress({ index: message.index, total: message.total });
        setVoiceFormHistory((prev) => [...prev, { role: 'bot', text: message.question }]);
        void runVoiceQuestionCycle(message.question);
      }
      if (message.type === 'VOICE_FORM_FIELD_ERROR') {
        setVoiceFormError(message.message);
        setVoiceFormHistory((prev) => [...prev, { role: 'bot', text: `⚠ ${message.message}` }]);
        void runVoiceQuestionCycle(message.message);
      }
      if (message.type === 'VOICE_FORM_CONFIRM_REQUEST') {
        const confirmText = `${message.confirmationText} Dites oui ou non.`;
        setVoiceFormHistory((prev) => [...prev, { role: 'bot', text: confirmText }]);
        void runVoiceConfirmCycle(confirmText);
      }
      if (message.type === 'VOICE_FORM_COMPLETE') {
        void runVoiceSubmitCycle();
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);

    chrome.storage.local.get([PROFILE_STORAGE_KEYS.profile, PROFILE_STORAGE_KEYS.settingsDone], (result) => {
      setActiveProfile((result[PROFILE_STORAGE_KEYS.profile] as Profile) || 'standard');
      setShowProfileSettings(!Boolean(result[PROFILE_STORAGE_KEYS.settingsDone]));
    });

    chrome.storage.local.get(
      [AI_STORAGE_KEYS.provider, AI_STORAGE_KEYS.openaiKey, AI_STORAGE_KEYS.geminiKey, AI_STORAGE_KEYS.settingsDone],
      (result) => {
        const savedProvider = result[AI_STORAGE_KEYS.provider] as AIProvider | undefined;
        const savedOpenAiKey = (result[AI_STORAGE_KEYS.openaiKey] as string) || '';
        const savedGeminiKey = (result[AI_STORAGE_KEYS.geminiKey] as string) || '';
        const savedSettingsDone = Boolean(result[AI_STORAGE_KEYS.settingsDone]);

        if (savedProvider) {
          setAiProvider(savedProvider);
        } else if (savedGeminiKey && !savedOpenAiKey) {
          setAiProvider('gemini');
        } else {
          setAiProvider('openai');
        }
        setOpenAiApiKey(savedOpenAiKey);
        setGeminiApiKey(savedGeminiKey);

        const hasAnyKey = Boolean(savedOpenAiKey.trim() || savedGeminiKey.trim());
        setShowAiSettings(!(savedSettingsDone && hasAnyKey));
      },
    );

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabUrl = tabs[0]?.url || '';
      if (tabs[0]?.id) {
        setCurrentTabId(tabs[0].id);
        currentTabIdRef.current = tabs[0].id;
      }
      if (!tabUrl) return;

      const cleanUrl = tabUrl.split('#')[0];
      setCurrentUrl(cleanUrl);
      const urlKey = getAnalysisStorageKey(cleanUrl);
      const chatKey = getChatStorageKey(cleanUrl);

      chrome.storage.local.get([urlKey, chatKey], (result) => {
        if (result[urlKey]) setAnalysis(result[urlKey] as AnalysisData);
        if (Array.isArray(result[chatKey])) setChatMessages(result[chatKey] as ChatMessage[]);
      });
    });

    return () => { chrome.runtime.onMessage.removeListener(messageListener); };
  }, []);

  useEffect(() => {
    if (!currentUrl || chatMessages.length === 0) return;
    chrome.storage.local.set({ [getChatStorageKey(currentUrl)]: chatMessages });
  }, [chatMessages, currentUrl]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [chatMessages, isChatSending]);
  useEffect(() => { formEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [voiceFormHistory]);

  const analyzePageManually = () => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    setAnalysisError('');
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'ANALYZE_PAGE' }).catch(() => {
          setIsAnalyzing(false);
          setAnalysisError("Veuillez actualiser la page web (F5) pour que l'extension puisse se connecter.");
        });
      }
    });
  };

  const applyProfile = (profile: Profile) => {
    setActiveProfile(profile);
    chrome.storage.local.set({ [PROFILE_STORAGE_KEYS.profile]: profile });
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) chrome.tabs.sendMessage(tabs[0].id, { type: 'SET_PROFILE', profile }).catch(() => {});
    });
  };

  const saveProfileSettings = () => {
    chrome.storage.local.set({ [PROFILE_STORAGE_KEYS.settingsDone]: true }, () => {
      setShowProfileSettings(false);
      setProfileStatus('Profil d\'affichage enregistré.');
      window.setTimeout(() => setProfileStatus(''), 2500);
    });
  };

  const saveAiSettings = () => {
    const selectedKey = aiProvider === 'openai' ? openAiApiKey.trim() : geminiApiKey.trim();
    if (!selectedKey) {
      setAiStatus('Veuillez renseigner la clé API du fournisseur sélectionné.');
      window.setTimeout(() => setAiStatus(''), 3000);
      return;
    }
    chrome.storage.local.set({
      [AI_STORAGE_KEYS.provider]: aiProvider,
      [AI_STORAGE_KEYS.openaiKey]: aiProvider === 'openai' ? openAiApiKey.trim() : '',
      [AI_STORAGE_KEYS.geminiKey]: aiProvider === 'gemini' ? geminiApiKey.trim() : '',
      [AI_STORAGE_KEYS.settingsDone]: true,
    }, () => {
      setAiStatus('Paramètres IA enregistrés.');
      setShowAiSettings(false);
      window.setTimeout(() => setAiStatus(''), 2500);
    });
  };

  const openProfileSettingsFromChooser = () => { setShowProfileSettings(true); setShowAiSettings(false); setShowSettingsChooser(false); setAiStatus(''); };
  const openAiSettingsFromChooser = () => { setShowAiSettings(true); setShowProfileSettings(false); setShowSettingsChooser(false); setProfileStatus(''); };

  const buildPageContext = (): string => {
    if (!analysis) return "Aucune analyse n'a encore été faite pour cette page.";
    const stepsText = analysis.steps && analysis.steps.length > 0 ? `Étapes identifiées : ${analysis.steps.join(' ; ')}.` : '';
    const contact = analysis.contactInfo;
    const contactText = contact && (contact.telephone || contact.email || contact.adresse || contact.horaires)
      ? `Coordonnées disponibles : ${[contact.telephone, contact.email, contact.adresse, contact.horaires].filter(Boolean).join(', ')}.` : '';
    return [`Résumé de la page : ${analysis.summary}`, stepsText, contactText].filter(Boolean).join(' ');
  };

  const sendChatMessage = () => {
    const question = chatInput.trim();
    if (!question || isChatSending) return;

    // FIX : Débloquer les droits audio du navigateur via une action utilisateur immédiate
    const unlockUtterance = new SpeechSynthesisUtterance('');
    unlockUtterance.volume = 0; // Silencieux
    window.speechSynthesis.speak(unlockUtterance);
    window.speechSynthesis.cancel();

    const requestId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    pendingChatRequestRef.current = requestId;
    const history = chatMessages.slice(-CHAT_HISTORY_LIMIT).map((entry) => ({ role: entry.role, content: entry.content }));

    setChatMessages((prev) => [...prev, { role: 'user' as const, content: question, ts: Date.now() }]);
    setChatInput('');
    setChatError('');
    setIsChatSending(true);

    chrome.runtime.sendMessage({
      type: 'ASK_GEMINI_CONTEXT',
      context: buildPageContext(),
      question,
      history,
      requestId,
    }).catch(() => {
      setIsChatSending(false);
      setChatError("Impossible de contacter l'assistant. Vérifiez votre connexion.");
    });
  };

  const handleChatKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendChatMessage(); }
  };

  const requestMicrophonePermission = async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (err) {
      return false;
    }
  };

  const toggleVoiceInput = async () => {
    const SpeechRecognitionCtor: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) { setChatError("La reconnaissance vocale n'est pas prise en charge par ce navigateur."); return; }
    if (isListening) { recognitionRef.current?.stop(); return; }

    const hasPermission = await requestMicrophonePermission();
    if (!hasPermission) {
      setChatError("Accès au microphone refusé. Cliquez sur l'icône de réglage dans la barre d'adresse pour l'autoriser.");
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'fr-FR';
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = () => { setIsListening(true); setChatError(''); };
    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i += 1) { transcript += event.results[i][0].transcript; }
      setChatInput(transcript);
    };
    recognition.onerror = (event: any) => {
      setIsListening(false);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setChatError('Accès au microphone refusé. Autorisez le micro pour utiliser la dictée vocale.');
      } else if (event.error !== 'no-speech') {
        setChatError('La reconnaissance vocale a rencontré une erreur.');
      }
    };
    recognition.onend = () => { setIsListening(false); };
    recognitionRef.current = recognition;
    recognition.start();
  };

  const speak = (text: string): Promise<void> => {
    return new Promise((resolve) => {
      setVoiceFormStatus('speaking');
      const utterance = new SpeechSynthesisUtterance(text.replace(/\*/g, ''));
      utterance.lang = 'fr-FR';
      
      currentUtteranceRef.current = utterance; // FIX Garbage Collector

      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  };

  const listenOnce = (): Promise<{ transcript: string; errorType?: string }> => {
    return new Promise(async (resolve) => {
      const SpeechRecognitionCtor: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognitionCtor) {
        setVoiceFormError("La reconnaissance vocale n'est pas prise en charge par ce navigateur.");
        resolve({ transcript: '', errorType: 'unsupported' });
        return;
      }

      const hasPermission = await requestMicrophonePermission();
      if (!hasPermission) {
        setVoiceFormError("Accès au microphone refusé. Autorisez-le dans la barre d'adresse.");
        resolve({ transcript: '', errorType: 'not-allowed' });
        return;
      }

      setVoiceFormStatus('listening');
      const recognition = new SpeechRecognitionCtor();
      recognition.lang = 'fr-FR';
      recognition.interimResults = false;
      recognition.continuous = false;

      let finalTranscript = '';
      let errorType: string | undefined;

      recognition.onresult = (event: any) => { finalTranscript = event.results[0]?.[0]?.transcript || ''; };
      recognition.onerror = (event: any) => { errorType = event.error; };
      recognition.onend = () => {
        activeRecognitionRef.current = null;
        resolve({ transcript: finalTranscript, errorType });
      };

      activeRecognitionRef.current = recognition;
      recognition.start();
    });
  };

  const runVoiceQuestionCycle = async (textToSpeak: string) => {
    if (!currentTabIdRef.current || voiceCancelledRef.current) return;
    await speak(textToSpeak);
    if (voiceCancelledRef.current) return;

    const { transcript, errorType } = await listenOnce();
    if (voiceCancelledRef.current) return;

    setVoiceFormStatus('processing');

    if (errorType === 'not-allowed' || errorType === 'service-not-allowed') {
      setVoiceFormError("Accès au microphone refusé. Autorisez le micro pour ce site puis relancez.");
      setVoiceFormStatus('idle');
      return;
    }

    if (!transcript.trim()) {
      setVoiceFormError("Je n'ai rien entendu, réessayons.");
      void runVoiceQuestionCycle(textToSpeak);
      return;
    }

    setVoiceFormHistory((prev) => [...prev, { role: 'user', text: transcript }]);
    chrome.runtime.sendMessage({ type: 'VOICE_FORM_ANSWER', tabId: currentTabIdRef.current, answerText: transcript }).catch(() => {});
  };

  const runVoiceConfirmCycle = async (confirmationText: string) => {
    if (!currentTabIdRef.current || voiceCancelledRef.current) return;
    await speak(confirmationText);
    if (voiceCancelledRef.current) return;
    const { transcript } = await listenOnce();
    if (voiceCancelledRef.current) return;
    setVoiceFormStatus('processing');
    
    if (transcript.trim()) {
      setVoiceFormHistory((prev) => [...prev, { role: 'user', text: transcript }]);
    }
    const confirmed = /\b(oui|ouais|exact|correct|c'est ça|c'est ca|voila|voilà)\b/i.test(transcript);
    chrome.runtime.sendMessage({ type: 'VOICE_FORM_CONFIRM', tabId: currentTabIdRef.current, confirmed }).catch(() => {});
  };

  const runVoiceSubmitCycle = async () => {
    if (!currentTabIdRef.current || voiceCancelledRef.current) return;
    
    const submitText = 'Le formulaire est complet. Voulez-vous l’envoyer maintenant ? Dites oui ou non.';
    setVoiceFormHistory((prev) => [...prev, { role: 'bot', text: submitText }]);
    await speak(submitText);
    
    if (voiceCancelledRef.current) return;
    const { transcript } = await listenOnce();
    setVoiceFormStatus('idle');
    
    if (transcript.trim()) {
      setVoiceFormHistory((prev) => [...prev, { role: 'user', text: transcript }]);
    }

    const confirmed = /\b(oui|ouais|exact|correct|envoie|envoyer)\b/i.test(transcript);
    if (confirmed) {
      chrome.runtime.sendMessage({ type: 'VOICE_FORM_SUBMIT_CONFIRMED', tabId: currentTabIdRef.current }).catch(() => {});
    }
    setVoiceFormActive(false);
    setDetectedForm(null);
  };

  const startVoiceFormFill = () => {
    if (!currentTabIdRef.current || !detectedForm) return;
    voiceCancelledRef.current = false;
    setVoiceFormHistory([]); // Reset l'historique au démarrage
    setVoiceFormActive(true);
    setVoiceFormError('');
    chrome.runtime.sendMessage({ type: 'START_VOICE_FORM_FILL', tabId: currentTabIdRef.current, form: detectedForm }).catch(() => {});
  };

  const cancelVoiceFormFill = () => {
    voiceCancelledRef.current = true;
    activeRecognitionRef.current?.abort();
    if (currentTabIdRef.current) {
      chrome.runtime.sendMessage({ type: 'VOICE_FORM_CANCEL', tabId: currentTabIdRef.current }).catch(() => {});
    }
    window.speechSynthesis.cancel();
    setVoiceFormActive(false);
    setVoiceFormStatus('idle');
    setVoiceFormError('');
  };

  const profileClass = `failc-profile-${activeProfile}`;
  const profileCss = getSidebarProfileCss(activeProfile);

  return (
    <div className={`failc-sidebar-root ${profileClass}`} style={{ width: '100%', minHeight: '100vh', padding: 18, paddingBottom: 72, fontFamily: 'Arial, sans-serif',  background: '#f8fafc', color: '#0f172a' }}>
      {profileCss && <style>{profileCss}</style>}
      {/* En-tête */}
      <div style={{ background: tokens.accent, color: '#FFFFFF', padding: '14px 16px', borderRadius: tokens.radius, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', opacity: 0.92 }}>FAILC ASSISTANT</div>
          <div style={{ fontSize: 21, fontWeight: 700, marginTop: 4 }}>Accessibilité Web</div>
        </div>
        <button onClick={analyzePageManually} disabled={isAnalyzing} aria-label="Relancer l'analyse de la page" title="Relancer l'analyse" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, height: 38, padding: '0 12px', borderRadius: 999, border: '1px solid rgba(255, 255, 255, 0.55)', background: isAnalyzing ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.14)', color: '#ffffff', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', cursor: isAnalyzing ? 'not-allowed' : 'pointer' }}>
          <span aria-hidden="true" style={{ fontSize: 15, lineHeight: 1 }}>↻</span> Relancer
        </button>
      </div>

      {/* Profils d'affichage */}
      {showProfileSettings && (
        <div style={{ marginBottom: 16, padding: 16, background: tokens.surface, borderRadius: tokens.radius, border: `1px solid ${tokens.border}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: tokens.textPrimary, marginBottom: 10 }}>Profil d'affichage</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {profiles.map((profile) => {
              const isActive = activeProfile === profile.id;
              return (
                <button key={profile.id} onClick={() => applyProfile(profile.id)} aria-pressed={isActive} style={{ minHeight: 44, border: isActive ? `2px solid ${tokens.accent}` : `1px solid ${tokens.border}`, borderRadius: 8, background: isActive ? tokens.accentSoftBg : tokens.surface, color: isActive ? tokens.accent : tokens.textSecondary, cursor: 'pointer', fontSize: 13.5, fontWeight: isActive ? 700 : 500, fontFamily: 'inherit', ...focusRing }}>
                  {isActive ? '✓ ' : ''}{profile.label}
                </button>
              );
            })}
          </div>
          <button onClick={saveProfileSettings} style={{ width: '100%', padding: '12px', background: tokens.accent, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer', marginTop: 14, fontFamily: 'inherit' }} onMouseOver={(e) => (e.currentTarget.style.background = tokens.accentHover)} onMouseOut={(e) => (e.currentTarget.style.background = tokens.accent)}>Valider ce profil</button>
          {profileStatus && <div role="status" style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: tokens.successBg, fontSize: 13, color: tokens.success, fontWeight: 700 }}>✓ {profileStatus}</div>}
        </div>
      )}

      {/* IA Settings */}
      {showAiSettings && (
        <div style={{ marginBottom: 16, padding: 16, background: tokens.surface, borderRadius: tokens.radius, border: `1px solid ${tokens.border}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: tokens.textPrimary, marginBottom: 10 }}>Moteur d'intelligence artificielle</div>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: tokens.textSecondary, marginBottom: 6 }}>Fournisseur</label>
          <select value={aiProvider} onChange={(event) => setAiProvider(event.target.value as AIProvider)} style={{ width: '100%', minHeight: 44, borderRadius: 8, border: `1px solid ${tokens.borderStrong}`, padding: '0 10px', marginBottom: 10, fontSize: 14, fontFamily: 'inherit', color: tokens.textPrimary, background: tokens.surface }}>
            {aiProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}
          </select>
          <p style={{ margin: '0 0 14px', fontSize: 12.5, color: tokens.textSecondary, lineHeight: 1.6 }}>{aiProviders.find((provider) => provider.id === aiProvider)?.note}</p>
          {aiProvider === 'openai' && (
            <><label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: tokens.textSecondary, marginBottom: 6 }}>Clé API OpenAI</label><input type="password" value={openAiApiKey} onChange={(event) => setOpenAiApiKey(event.target.value)} placeholder="sk-..." style={{ width: '100%', minHeight: 44, borderRadius: 8, border: `1px solid ${tokens.borderStrong}`, padding: '0 10px', marginBottom: 14, fontSize: 14, fontFamily: 'inherit' }} /></>
          )}
          {aiProvider === 'gemini' && (
            <>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: tokens.textSecondary, marginBottom: 6 }}>
                Clé API Gemini
              </label>
              <div className="api-key-help" style={{ marginTop: -2, marginBottom: 8, fontSize: 12.5, color: tokens.textSecondary }}>
                Gratuit avec {' '}
                <a
                  href="https://aistudio.google.com/api-keys"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: tokens.accent, fontWeight: 700 }}
                >
                  Google AI Studio
                </a>
              </div>
              <input
                type="password"
                value={geminiApiKey}
                onChange={(event) => setGeminiApiKey(event.target.value)}
                placeholder="AIza..."
                style={{
                  width: '100%',
                  minHeight: 44,
                  borderRadius: 8,
                  border: `1px solid ${tokens.borderStrong}`,
                  padding: '0 10px',
                  marginBottom: 14,
                  fontSize: 14,
                  fontFamily: 'inherit',
                }}
              />
            </>
          )}

          <button
            onClick={saveAiSettings}
            style={{
              width: '100%',
              padding: '12px',
              background: tokens.accent,
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = tokens.accentHover)}
            onMouseOut={(e) => (e.currentTarget.style.background = tokens.accent)}
          >
            Enregistrer le moteur IA
          </button>

          {aiStatus && (
            <div
              role="status"
              style={{
                marginTop: 10,
                padding: '8px 10px',
                borderRadius: 8,
                background: aiStatus.includes('Veuillez') ? tokens.errorBg : tokens.successBg,
                fontSize: 13,
                color: aiStatus.includes('Veuillez') ? tokens.error : tokens.success,
                fontWeight: 700,
              }}
            >
              {aiStatus.includes('Veuillez') ? '⚠ ' : '✓ '}{aiStatus}
            </div>
          )}
          
          {aiStatus && <div role="status" style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: aiStatus.includes('Veuillez') ? tokens.errorBg : tokens.successBg, fontSize: 13, color: aiStatus.includes('Veuillez') ? tokens.error : tokens.success, fontWeight: 700 }}>{aiStatus.includes('Veuillez') ? '⚠ ' : '✓ '}{aiStatus}</div>}
        </div>
      )}

      {/* Menu paramètre flottant */}
      {showSettingsChooser && (
        <div role="menu" aria-label="Ouvrir les paramètres" style={{ position: 'fixed', right: 12, bottom: 60, width: 236, background: tokens.surface, borderRadius: tokens.radius, border: `1px solid ${tokens.border}`, boxShadow: '0 12px 26px rgba(31, 42, 55, 0.16)', padding: 10, zIndex: 1000 }}>
          <div style={{ position: 'absolute', right: 20, bottom: -8, width: 14, height: 14, background: tokens.surface, borderRight: `1px solid ${tokens.border}`, borderBottom: `1px solid ${tokens.border}`, transform: 'rotate(45deg)' }} />
          <div style={{ fontSize: 12, fontWeight: 700, color: tokens.textSecondary, marginBottom: 8, padding: '0 2px' }}>Paramètres</div>
          <button onClick={openProfileSettingsFromChooser} style={{ width: '100%', padding: '10px', background: tokens.accentSoftBg, color: tokens.accent, border: `1px solid ${tokens.accentSoftBorder}`, borderRadius: 8, fontWeight: 700, cursor: 'pointer', marginBottom: 6, fontSize: 13, fontFamily: 'inherit', textAlign: 'left' }}>🎨 Profil d'affichage</button>
          <button onClick={openAiSettingsFromChooser} style={{ width: '100%', padding: '10px', background: tokens.accentSoftBg, color: tokens.accent, border: `1px solid ${tokens.accentSoftBorder}`, borderRadius: 8, fontWeight: 700, cursor: 'pointer', marginBottom: 6, fontSize: 13, fontFamily: 'inherit', textAlign: 'left' }}>🤖 Moteur IA</button>
          <button onClick={() => setShowSettingsChooser(false)} style={{ width: '100%', padding: '9px', background: 'transparent', color: tokens.textSecondary, border: `1px solid ${tokens.border}`, borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>Fermer</button>
        </div>
      )}

      {isAnalyzing && (
        <div role="status" style={{ padding: 16, background: tokens.surface, borderRadius: tokens.radius, border: `1px solid ${tokens.border}`, textAlign: 'center', marginBottom: 16 }}>
          <p style={{ margin: 0, fontWeight: 600, color: tokens.accent, fontSize: 14 }}>Lecture et analyse de la page en cours…</p>
        </div>
      )}

      {analysisError && !isAnalyzing && (
        <div role="alert" style={{ padding: 14, background: tokens.errorBg, borderRadius: tokens.radius, border: `1px solid ${tokens.errorBg}`, marginBottom: 16, fontSize: 13.5, color: tokens.error, fontWeight: 600 }}>⚠ {analysisError}</div>
      )}

      {!isAnalyzing && analysis && (
        <div style={{ padding: 16, background: tokens.surface, borderRadius: tokens.radius, border: `1px solid ${tokens.border}`, marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 15.5, fontWeight: 700, color: tokens.textPrimary }}>Résumé de la page</h3>
          <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.6, color: tokens.textPrimary }}>{analysis.summary}</p>
          {analysis.steps && analysis.steps.length > 0 && (
            <><h3 style={{ margin: '0 0 8px', fontSize: 15.5, fontWeight: 700, color: tokens.textPrimary }}>Étapes à suivre</h3><ul style={{ margin: '0 0 16px', paddingLeft: 20, color: tokens.textPrimary, fontSize: 14, lineHeight: 1.6 }}>{analysis.steps.map((step, idx) => <li key={idx} style={{ marginBottom: 6 }}>{step}</li>)}</ul></>
          )}
          <div style={{ borderTop: `1px solid ${tokens.border}`, paddingTop: 16 }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 15.5, fontWeight: 700, color: tokens.textPrimary }}>Coordonnées trouvées</h3>
            {[['telephone', '📞', 'Téléphone'], ['email', '✉️', 'Email'], ['adresse', '📍', 'Adresse'], ['horaires', '🕒', 'Horaires']].map(([key, icon]) => {
              const value = analysis.contactInfo?.[key as keyof ContactInfo];
              if (!value) return null;
              return <div key={key} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8, fontSize: 14, color: tokens.textPrimary }}><span aria-hidden="true">{icon}</span> <strong>{value}</strong></div>;
            })}
            {analysis.contactInfo?.contactLink && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8, fontSize: 14 }}><span aria-hidden="true">📩</span><a href={analysis.contactInfo.contactLink} target="_blank" rel="noreferrer" style={{ color: tokens.accent, fontWeight: 700, textDecoration: 'underline' }}>{analysis.contactInfo.contactLabel || 'Page de contact'}</a></div>
            )}
            {(!analysis.contactInfo?.telephone && !analysis.contactInfo?.email && !analysis.contactInfo?.contactLink) && <span style={{ fontSize: 13, color: tokens.textSecondary }}>Aucun contact détecté.</span>}
          </div>
          {analysis.glossary && analysis.glossary.length > 0 && (
            <div style={{ borderTop: `1px solid ${tokens.border}`, paddingTop: 16, marginTop: 12 }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 15.5, fontWeight: 700, color: tokens.textPrimary }}>Mots compliqués présents</h3>
              <div style={{ background: tokens.bg, padding: '12px 12px 4px 12px', borderRadius: 8 }}>
                {analysis.glossary.map((entry, idx) => <div key={idx} style={{ marginBottom: 10, fontSize: 13.5, color: tokens.textPrimary, lineHeight: 1.5 }}><strong style={{ color: tokens.accent }}>{entry.term}</strong> : {entry.definition}</div>)}
              </div>
            </div>
          )}
        </div>
      )}

      {detectedForm && !voiceFormActive && (
        <div style={{ padding: 16, background: tokens.accentSoftBg, borderRadius: tokens.radius, border: `1px solid ${tokens.accentSoftBorder}`, marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 15.5, fontWeight: 700, color: tokens.textPrimary }}>🎙️ Formulaire détecté</h3>
          <p style={{ margin: '0 0 12px', fontSize: 13.5, color: tokens.textSecondary, lineHeight: 1.6 }}>Ce formulaire contient {detectedForm.fields.length} champs. Voulez-vous que je vous les fasse remplir à la voix, un par un ?</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={startVoiceFormFill} style={{ flex: 1, minHeight: 44, background: tokens.accent, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Remplir à la voix</button>
            <button onClick={() => setDetectedForm(null)} style={{ minHeight: 44, padding: '0 14px', background: 'transparent', color: tokens.textSecondary, border: `1px solid ${tokens.border}`, borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Non merci</button>
          </div>
        </div>
      )}

      {/* HISTORIQUE DU FORMULAIRE VISUEL */}
      {voiceFormActive && (
        <div style={{ padding: 16, background: tokens.surface, borderRadius: tokens.radius, border: `1px solid ${tokens.border}`, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: tokens.textPrimary }}>Remplissage vocal</h3>
            {voiceFormProgress && <span style={{ fontSize: 12.5, color: tokens.textSecondary, fontWeight: 600 }}>{voiceFormProgress.index + 1} / {voiceFormProgress.total}</span>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto', marginBottom: 12, paddingRight: 4 }}>
            {voiceFormHistory.map((msg, idx) => (
              <div key={idx} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%', background: msg.role === 'user' ? tokens.accentSoftBg : tokens.bg, color: tokens.textPrimary, border: `1px solid ${msg.role === 'user' ? tokens.accentSoftBorder : tokens.border}`, borderRadius: 10, padding: '8px 12px', fontSize: 13.5, lineHeight: 1.5 }}>
                {renderMarkdown(msg.text)}
              </div>
            ))}
            <div ref={formEndRef} />
          </div>

          <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: tokens.accent, textAlign: 'center' }}>
            {voiceFormStatus === 'speaking' && '🔊 Je parle…'}
            {voiceFormStatus === 'listening' && '🎙️ Je vous écoute…'}
            {voiceFormStatus === 'processing' && '⏳ Vérification…'}
          </p>

          {voiceFormError && <div role="alert" style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 8, background: tokens.errorBg, fontSize: 12.5, color: tokens.error, fontWeight: 600 }}>⚠ {voiceFormError}</div>}

          <button onClick={cancelVoiceFormFill} style={{ width: '100%', minHeight: 40, background: 'transparent', color: tokens.textSecondary, border: `1px solid ${tokens.border}`, borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Annuler</button>
        </div>
      )}

      {/* CHATBOT */}
      <div style={{ padding: 16, background: tokens.surface, borderRadius: tokens.radius, border: `1px solid ${tokens.border}`, marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 15.5, fontWeight: 700, color: tokens.textPrimary }}>Poser une question</h3>
        {chatMessages.length === 0 && <p style={{ margin: '0 0 12px', fontSize: 13.5, color: tokens.textSecondary, lineHeight: 1.6 }}>{analysis ? 'Posez une question sur cette page ou sur les démarches à suivre.' : "Lancez d'abord une analyse pour poser des questions précises sur cette page."}</p>}
        
        {chatMessages.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto', marginBottom: 12, paddingRight: 4 }}>
            {chatMessages.map((entry, idx) => (
              <div key={idx} style={{ alignSelf: entry.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%', background: entry.role === 'user' ? tokens.accentSoftBg : tokens.bg, color: tokens.textPrimary, border: `1px solid ${entry.role === 'user' ? tokens.accentSoftBorder : tokens.border}`, borderRadius: 10, padding: '8px 12px', fontSize: 13.5, lineHeight: 1.5 }}>
                {renderMarkdown(entry.content)}
              </div>
            ))}
            {isChatSending && <div role="status" style={{ alignSelf: 'flex-start', fontSize: 13, color: tokens.textSecondary, fontStyle: 'italic' }}>L'assistant réfléchit…</div>}
            <div ref={chatEndRef} />
          </div>
        )}

        {chatError && <div role="alert" style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 8, background: tokens.errorBg, fontSize: 12.5, color: tokens.error, fontWeight: 600 }}>⚠ {chatError}</div>}

        {/* BOUTON POUR COUPER LA VOIX DU BOT */}
        {isBotSpeaking && (
          <button
            onClick={stopBotSpeech}
            style={{
              alignSelf: 'center',
              margin: '0 auto 10px auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '6px 14px',
              background: tokens.errorBg,
              color: tokens.error,
              border: `1px solid ${tokens.error}`,
              borderRadius: 999,
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              width: 'max-content'
            }}
          >
            <span aria-hidden="true">🔇</span> ARRETER LA VOIX
          </button>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea value={chatInput} onChange={(event) => setChatInput(event.target.value)} onKeyDown={handleChatKeyDown} placeholder="Écrivez votre question ici…" rows={2} style={{ flex: 1, resize: 'none', borderRadius: 8, border: `1px solid ${tokens.borderStrong}`, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', color: tokens.textPrimary, background: tokens.surface }} />
          <button onClick={toggleVoiceInput} aria-pressed={isListening} aria-label={isListening ? 'Arrêter la dictée vocale' : 'Poser la question à la voix'} title={isListening ? 'Arrêter la dictée vocale' : 'Dicter la question'} style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 8, border: `1px solid ${isListening ? tokens.error : tokens.borderStrong}`, background: isListening ? tokens.errorBg : tokens.surface, color: isListening ? tokens.error : tokens.textSecondary, fontSize: 18, cursor: 'pointer' }}>
            <span aria-hidden="true">{isListening ? '⏹' : '🎤'}</span>
          </button>
          <button onClick={sendChatMessage} disabled={isChatSending || !chatInput.trim()} aria-label="Envoyer la question" style={{ flexShrink: 0, height: 44, padding: '0 16px', borderRadius: 8, border: 'none', background: (isChatSending || !chatInput.trim()) ? tokens.borderStrong : tokens.accent, color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: (isChatSending || !chatInput.trim()) ? 'not-allowed' : 'pointer' }}>Envoyer</button>
        </div>
        {isListening && <p style={{ margin: '8px 0 0', fontSize: 12, color: tokens.textSecondary }}>🎙️ Écoute en cours… parlez, puis cliquez à nouveau sur le micro pour arrêter.</p>}
      </div>

      <button onClick={() => setShowSettingsChooser(true)} aria-haspopup="menu" aria-expanded={showSettingsChooser} style={{ position: 'fixed', right: 12, bottom: 12, display: 'flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 14px', background: tokens.neutralDark, color: '#ffffff', border: 'none', borderRadius: 999, fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', boxShadow: '0 6px 14px rgba(31, 42, 55, 0.18)', zIndex: 999 }}>
        <span aria-hidden="true">⚙️</span> Paramètres
      </button>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Sidebar /></React.StrictMode>);