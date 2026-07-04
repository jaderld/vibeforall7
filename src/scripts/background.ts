import { BackgroundController } from './controllers/BackgroundController';
import { ContextManager } from './models/ContextManager';
import { TabContext } from './models/TabContext';
import { TabService } from './services/tabService';
import { DefaultWebPageStrategy } from './strategies/DefaultWebPageStrategy';
import { GoogleDocsStrategy } from './strategies/GoogleDocsStrategy';
import { YouTubeStrategy } from './strategies/YouTubeStrategy';
import { ExtensionMessage } from './types';

type AIProvider = 'openai' | 'gemini';

const AI_STORAGE_KEYS = {
  provider: 'failcAiProvider',
  openaiKey: 'failcOpenAiApiKey',
  geminiKey: 'failcGeminiApiKey',
} as const;

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const GEMINI_API_URL_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const GEMINI_PRIMARY_MODEL = 'models/gemini-3.1-flash-lite';
const GEMINI_MODELS_CACHE_TTL_MS = 10 * 60 * 1000;

let geminiModelsCache: {
  apiKey: string;
  models: string[];
  fetchedAt: number;
} | null = null;

// --------------------------------------------------------
// TYPES ET INTERFACES (Pour satisfaire TypeScript)
// --------------------------------------------------------
interface OpenAIRequestBody {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature: number;
  response_format?: { type: string };
}

interface GeminiRequestBody {
  systemInstruction: { parts: Array<{ text: string }> };
  contents: Array<{ role: string; parts: Array<{ text: string }> }>;
  generationConfig: {
    temperature: number;
    responseMimeType?: string;
  };
}

interface AISettings {
  provider: AIProvider;
  openaiKey: string;
  geminiKey: string;
}

interface GeminiModelInfo {
  name: string;
  supportedGenerationMethods?: string[];
}

function extractJsonResponse(content: string): string {
  const trimmed = content.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}$/);
  return jsonMatch ? jsonMatch[0] : trimmed;
}

// --------------------------------------------------------
// 1. INITIALISATION DE L'EXTENSION
// --------------------------------------------------------
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'failc-selection',
    title: 'Simplifier cette sélection avec FAILC',
    contexts: ['selection']
  });

  // Ouvre le side panel automatiquement au clic sur l'icône.
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err: unknown) => {
    console.error('FAILC: impossible d’activer le side panel au clic', err);
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'failc-selection' && info.selectionText && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'CONTEXT_SELECTION', selectionText: info.selectionText, tabId: tab.id });
  }
});

// --------------------------------------------------------
// 2. MOTEUR IA
// --------------------------------------------------------
async function getAISettings(): Promise<AISettings> {
  const result = await chrome.storage.local.get([
    AI_STORAGE_KEYS.provider,
    AI_STORAGE_KEYS.openaiKey,
    AI_STORAGE_KEYS.geminiKey,
  ]);

  return {
    provider: (result[AI_STORAGE_KEYS.provider] as AIProvider) || 'openai',
    openaiKey: String(result[AI_STORAGE_KEYS.openaiKey] || '').trim(),
    geminiKey: String(result[AI_STORAGE_KEYS.geminiKey] || '').trim(),
  };
}

async function callOpenAI(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  expectJson: boolean = false,
): Promise<any> {
  try {
    const requestBody: OpenAIRequestBody = {
      model: DEFAULT_OPENAI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
    };

    if (expectJson) {
      requestBody.response_format = { type: 'json_object' };
    }

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Erreur API OpenAI');
    }

    const data = await response.json();
    const textResponse = data.choices[0].message.content;
    
    return expectJson ? JSON.parse(textResponse) : textResponse;
  } catch (error: unknown) {
    console.error('Erreur appel OpenAI :', error);
    throw error;
  }
}

async function callGemini(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  expectJson: boolean = false,
): Promise<any> {
  const requestBody: GeminiRequestBody = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
    },
  };

  if (expectJson) {
    requestBody.generationConfig.responseMimeType = 'application/json';
  }

  let lastError: Error | null = null;

  const modelCandidates = [GEMINI_PRIMARY_MODEL];

  for (const model of modelCandidates) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        let message = errorText || 'Erreur API Gemini';

        try {
          const parsed = JSON.parse(errorText);
          message = parsed?.error?.message || message;
        } catch {
          // Non-JSON error payload; keep raw text.
        }

        if (/model|not found|unsupported/i.test(message)) {
          throw new Error(`Le modele Gemini configure (${model}) n'est pas disponible pour cette cle API. Utilisez une cle avec acces a ce modele.`);
        }

        throw new Error(message);
      }

      const data = await response.json();
      const textResponse = data?.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text || '')
        .join('')
        .trim();

      if (!textResponse) {
        throw new Error('Réponse Gemini vide');
      }

      return expectJson ? JSON.parse(extractJsonResponse(textResponse)) : textResponse;
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));
      break;
    }
  }

  console.error('Erreur appel Gemini :', lastError);
  throw lastError || new Error('Erreur API Gemini');
}

async function getGeminiGenerateContentModels(apiKey: string): Promise<string[]> {
  const response = await fetch(`${GEMINI_API_URL_BASE}?key=${apiKey}`);

  if (!response.ok) {
    const errorText = await response.text();
    let message = errorText || 'Impossible de récupérer la liste des modèles Gemini.';

    try {
      const parsed = JSON.parse(errorText);
      message = parsed?.error?.message || message;
    } catch {
      // Non-JSON error payload; keep raw text.
    }

    throw new Error(message);
  }

  const data = await response.json();
  const models: GeminiModelInfo[] = Array.isArray(data?.models) ? data.models : [];

  return models
    .filter((model) => model?.name && model.supportedGenerationMethods?.includes('generateContent'))
    .map((model) => model.name);
}

async function getGeminiGenerateContentModelsCached(apiKey: string): Promise<string[]> {
  const now = Date.now();
  if (
    geminiModelsCache &&
    geminiModelsCache.apiKey === apiKey &&
    now - geminiModelsCache.fetchedAt < GEMINI_MODELS_CACHE_TTL_MS
  ) {
    return geminiModelsCache.models;
  }

  const models = await getGeminiGenerateContentModels(apiKey);
  geminiModelsCache = {
    apiKey,
    models,
    fetchedAt: now,
  };
  return models;
}

async function callAI(systemPrompt: string, userPrompt: string, expectJson: boolean = false): Promise<any> {
  const settings = await getAISettings();
  const providerOrder: AIProvider[] = settings.provider === 'gemini'
    ? ['gemini', 'openai']
    : ['openai', 'gemini'];

  for (const provider of providerOrder) {
    if (provider === 'openai' && settings.openaiKey) {
      try {
        return await callOpenAI(settings.openaiKey, systemPrompt, userPrompt, expectJson);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (settings.geminiKey && /api key|authorization|unauthorized|invalid key/i.test(message)) {
          return callGemini(settings.geminiKey, systemPrompt, userPrompt, expectJson);
        }
        throw error;
      }
    }
    if (provider === 'gemini' && settings.geminiKey) {
      try {
        return await callGemini(settings.geminiKey, systemPrompt, userPrompt, expectJson);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (settings.openaiKey && /api key|authorization|unauthorized|invalid key/i.test(message)) {
          return callOpenAI(settings.openaiKey, systemPrompt, userPrompt, expectJson);
        }
        throw error;
      }
    }
  }

  throw new Error('Veuillez enregistrer une clé API OpenAI ou Gemini.');
}

const tabService = new TabService();
const tabContext = new TabContext([
  new GoogleDocsStrategy(tabService),
  new YouTubeStrategy(),
  new DefaultWebPageStrategy(tabService),
]);
const contextManager = new ContextManager(tabContext, tabService);
const backgroundController = new BackgroundController(contextManager, callAI);

// --------------------------------------------------------
// 3. GESTION DES MESSAGES
// --------------------------------------------------------
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (backgroundController.handleMessage(message, sender, sendResponse)) {
    return true;
  }
  
  // CHAT CONTEXTUEL (Question/Réponse)
  if (message?.type === 'ASK_GEMINI_CONTEXT') {
    (async () => {
      try {
        const systemPrompt = "Tu es un assistant d'accessibilité bienveillant. Réponds de manière directe, rassurante et très facile à comprendre.";
        const userPrompt = `Contexte de la page sur laquelle je me trouve : "${message.context || 'Aucun.'}"\n\nMa question : "${message.question || ''}"`;
        
        const replyText = await callAI(systemPrompt, userPrompt, false);
        chrome.runtime.sendMessage({ type: 'CHAT_REPLY', reply: replyText });
      } catch (error: unknown) {
        chrome.runtime.sendMessage({ type: 'CHAT_REPLY', reply: "❌ Désolé, erreur de connexion avec l'IA." });
      }
    })();
    return true;
  }

  // GESTION DU BADGE SUR L'ICÔNE
  if (message?.type === 'SET_BADGE') {
    try {
      const status = message.status;
      chrome.action.setBadgeText({ text: status === 'ok' ? '✓' : '!' });
      chrome.action.setBadgeBackgroundColor({ color: status === 'ok' ? '#2e7d32' : '#c62828' });
      setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000); 
    } catch (e: unknown) {
      // ignore
    }
  }

  return false;
});
