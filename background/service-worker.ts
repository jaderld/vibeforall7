// 🔴 REMPLACEZ CECI PAR VOTRE VRAIE CLÉ OPENAI
declare var process: any;

const OPENAI_API_KEY = ""
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

// --------------------------------------------------------
// TYPES ET INTERFACES (Pour satisfaire TypeScript)
// --------------------------------------------------------
interface OpenAIRequestBody {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature: number;
  response_format?: { type: string };
}

interface Block {
  text: string;
}

interface ExtensionMessage {
  type: string;
  payload?: { blocks?: Block[] };
  context?: string;
  question?: string;
  status?: 'ok' | 'error';
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
// 2. MOTEUR OPENAI
// --------------------------------------------------------
async function callOpenAI(systemPrompt: string, userPrompt: string, expectJson: boolean = false): Promise<any> {
  try {
    const requestBody: OpenAIRequestBody = {
      model: "gpt-4o-mini", // ou gpt-3.5-turbo / gpt-4o
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.2
    };

    if (expectJson) {
      requestBody.response_format = { type: "json_object" };
    }

    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || "Erreur API OpenAI");
    }

    const data = await response.json();
    const textResponse = data.choices[0].message.content;
    
    return expectJson ? JSON.parse(textResponse) : textResponse;
  } catch (error: unknown) {
    console.error("Erreur appel OpenAI :", error);
    throw error;
  }
}

// --------------------------------------------------------
// 3. GESTION DES MESSAGES
// --------------------------------------------------------
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  
  // ANALYSE DE LA PAGE (Résumé + Étapes)
  if (message?.type === 'FETCH_ANALYSIS') {
    (async () => {
      try {
        // Extraction du texte envoyé par le content script
        const blocks = message.payload?.blocks || [];
        const pageText = blocks.map((b: Block) => b.text).join(' ').slice(0, 5000); 
        
        const systemPrompt = `Tu es un expert en accessibilité administrative et en langage FALC (Facile À Lire et à Comprendre). 
        Tu dois IMPÉRATIVEMENT répondre au format JSON strict avec exactement deux clés :
        - "summary" : Un résumé très simple de la page en 2 ou 3 phrases.
        - "steps" : Un tableau (array) de strings contenant 3 ou 4 étapes claires à suivre.`;

        const userPrompt = `Voici le texte extrait de la page web administrative :\n"""${pageText}"""\n\nGénère le JSON demandé.`;
        
        const openAiResult = await callOpenAI(systemPrompt, userPrompt, true);
        
        sendResponse({ 
          simplifiedBlocks: [], 
          summary: openAiResult.summary || "Résumé non disponible.", 
          steps: openAiResult.steps || []
        });
      } catch (err: unknown) {
        console.error("Erreur FETCH_ANALYSIS:", err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        sendResponse({ error: errorMessage });
      }
    })();
    return true; 
  }

  // CHAT CONTEXTUEL (Question/Réponse)
  if (message?.type === 'ASK_GEMINI_CONTEXT') {
    (async () => {
      try {
        const systemPrompt = "Tu es un assistant d'accessibilité bienveillant. Réponds de manière directe, rassurante et très facile à comprendre.";
        const userPrompt = `Contexte de la page sur laquelle je me trouve : "${message.context || 'Aucun.'}"\n\nMa question : "${message.question || ''}"`;
        
        const replyText = await callOpenAI(systemPrompt, userPrompt, false);
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