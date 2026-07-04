type Profile = 'standard' | 'dyslexia' | 'low-vision' | 'anti-epilepsy';
type ContactInfo = { telephone: string; email: string; adresse: string; horaires: string };
type GlossaryEntry = { term: string; definition: string };

const STORAGE_PREFIX = 'failc:';
const TERM_DEFINITIONS: Array<{ term: string; definition: string }> = [
  { term: 'avis d\'imposition', definition: 'Document envoyé par l’administration pour expliquer le montant de votre impôt.' },
  { term: 'cotisation', definition: 'Montant payé pour financer un service ou une assurance.' },
  { term: 'complémentaire santé', definition: 'Garantie qui complète la couverture de base pour les soins médicaux.' },
  { term: 'caf', definition: 'Caisse d’allocations familiales, organisme qui gère certaines aides.' },
  { term: 'urssaf', definition: 'Organisme chargé du contrôle et du recouvrement des cotisations sociales.' },
  { term: 'allocation', definition: 'Aide financière versée par l’État ou un organisme public.' },
  { term: 'démarche', definition: 'Action administrative à réaliser auprès d’un service public.' }
];

let activeProfile: Profile = 'standard';
let currentPopover: HTMLDivElement | null = null;

// ==========================================
// 1. GESTION DES PROFILS (CSS)
// ==========================================
function applyProfileStyles(profile: Profile) {
  const existing = document.getElementById('failc-profile-style');
  if (existing) existing.remove();

  const baseStyle = document.getElementById('failc-base-style') || document.createElement('style');
  baseStyle.id = 'failc-base-style';
  baseStyle.textContent = `
    .failc-term { border-bottom: 2px dotted #0b5fff; cursor: help; text-decoration: none; color: #0b5fff; font-weight: bold; }
    .failc-popover { position: fixed; z-index: 2147483647; background: #0f172a; color: #fff; padding: 10px 12px; border-radius: 8px; max-width: 260px; font-size: 14px; line-height: 1.4; box-shadow: 0 6px 18px rgba(0,0,0,0.25); }
  `;
  if (!document.getElementById('failc-base-style')) document.head.appendChild(baseStyle);

  if (profile === 'standard') return;

  const style = document.createElement('style');
  style.id = 'failc-profile-style';
  style.textContent = profile === 'dyslexia'
    ? `body, body * { font-family: Arial, sans-serif !important; line-height: 1.65 !important; text-align: left !important; letter-spacing: 0.01em !important; }`
    : profile === 'low-vision'
      ? `body { background: #111 !important; color: #f8f8f8 !important; } body * { color: inherit !important; } body a, body button, body p, body li, body h1, body h2 { font-size: 1.2em !important; }`
      : `* { animation: none !important; transition: none !important; } video { autoplay: false !important; }`;
  document.head.appendChild(style);
}

// ==========================================
// 2. LECTURE & ANALYSE SILENCIEUSE (IA)
// ==========================================
function collectBlocks() {
  const elements = Array.from(document.querySelectorAll('p, li, td, h1, h2, h3, h4, h5, h6, label'));
  const blocks: Array<{ text: string }> = [];
  elements.forEach((element) => {
    if (!(element instanceof HTMLElement)) return;
    if (element.closest('script, style, noscript, svg, form, button, input, textarea, select, iframe')) return;
    const text = element.innerText?.trim() || element.textContent?.trim() || '';
    if (text.length > 12 && (element.getClientRects().length > 0 || element.tagName === 'BODY')) {
      blocks.push({ text });
    }
  });
  return blocks.slice(0, 60);
}

function extractContactInfo(text: string): ContactInfo {
  const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(text)?.[0] || '';
  const telephone = /(\+33|0)[0-9 .-]{8,14}/.exec(text)?.[0] || '';
  return { telephone, email, adresse: '', horaires: '' };
}

async function analyzePageSilent() {
  chrome.runtime.sendMessage({ type: 'ANALYSIS_STARTED' }).catch(() => {});
  const blocks = collectBlocks();
  const visibleText = blocks.map(b => b.text).join(' ');
  
  try {
    const response = await new Promise<any>((resolve) => {
      chrome.runtime.sendMessage({ type: 'FETCH_ANALYSIS', payload: { blocks } }, resolve);
    });

    const cleanUrl = location.href.split('#')[0];
    const storageKey = `${STORAGE_PREFIX}${cleanUrl}`;
    
    // On vérifie si l'IA a échoué, mais ON NE FAIT PLUS CRASHER LE SCRIPT (pas de "throw")
    const hasAiError = chrome.runtime.lastError || !response || response.error;
    const aiErrorMessage = chrome.runtime.lastError?.message || response?.error || '';

    // On prépare le paquet de données (IA + Local)
    const analysisData = { 
      // Si l'IA a planté, on met un message par défaut, sinon on met le vrai résumé
      summary: hasAiError
        ? `Le résumé par IA est indisponible (${aiErrorMessage || 'Erreur de connexion ou quota'}).`
        : response.summary,
      steps: hasAiError ? ["Suivez les instructions affichées sur la page."] : (response.steps || []),
      
      // La partie locale (contacts et glossaire) fonctionnera TOUJOURS
      glossary: TERM_DEFINITIONS.filter(e => visibleText.toLowerCase().includes(e.term.toLowerCase())), 
      contactInfo: extractContactInfo(visibleText),
    };

    // On sauvegarde tout
    await chrome.storage.local.set({ [storageKey]: analysisData });

    // On envoie à la barre latérale
    chrome.runtime.sendMessage({ type: 'ANALYSIS_COMPLETE', data: analysisData }).catch(() => {});
  } catch (error) {
    chrome.runtime.sendMessage({ type: 'ANALYSIS_ERROR' }).catch(() => {});
  }
}

// ==========================================
// 3. MODIFICATION VISUELLE DE LA PAGE
// ==========================================
function applyVisualModifications() {
  // 1. Simplification des termes courants dans les noeuds textuels
  const replacements: Array<[RegExp, string]> = [
    [/\bavis d['’]imposition\b/gi, 'document de l’administration'],
    [/\bcomplémentaire santé\b/gi, 'mutuelle (complémentaire santé)'],
    [/\bdocuments?\b/gi, 'pièces à fournir']
  ];

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    if (walker.currentNode.nodeValue?.trim() && !walker.currentNode.parentElement?.closest('script, style, noscript')) {
      textNodes.push(walker.currentNode as Text);
    }
  }

  textNodes.forEach((node) => {
    let text = node.nodeValue || '';
    let originalText = text;

    // Remplacements FALC
    replacements.forEach(([pattern, replacement]) => {
      text = text.replace(pattern, replacement);
    });

    // Création des spans pour le glossaire
    TERM_DEFINITIONS.forEach((entry) => {
      const escapedTerm = entry.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedTerm}\\b`, 'gi');
      text = text.replace(regex, (match) => `<span class="failc-term" tabindex="0" data-definition="${entry.definition}">${match}</span>`);
    });

    if (text !== originalText) {
      const fragment = document.createRange().createContextualFragment(text);
      node.parentNode?.replaceChild(fragment, node);
    }
  });

  // 2. Écouteurs pour les bulles d'aide du glossaire
  document.querySelectorAll('.failc-term').forEach((element) => {
    element.addEventListener('mouseenter', (e) => showPopover(e.currentTarget as HTMLElement));
    element.addEventListener('focus', (e) => showPopover(e.currentTarget as HTMLElement));
    element.addEventListener('mouseleave', hidePopover);
    element.addEventListener('blur', hidePopover);
  });

  // 3. Encadrer les éléments importants (champs, boutons)
  document.querySelectorAll('button, input, select, textarea').forEach((element) => {
    if (element instanceof HTMLElement) {
      element.style.outline = '3px solid #f97316'; // Orange vif
      element.style.outlineOffset = '2px';
    }
  });
}

function showPopover(target: HTMLElement) {
  hidePopover();
  const definition = target.getAttribute('data-definition') || '';
  if (!definition) return;
  const popover = document.createElement('div');
  popover.className = 'failc-popover';
  popover.textContent = definition;
  document.body.appendChild(popover);
  const rect = target.getBoundingClientRect();
  popover.style.top = `${window.scrollY + rect.bottom + 6}px`;
  popover.style.left = `${window.scrollX + rect.left}px`;
  currentPopover = popover;
}

function hidePopover() {
  currentPopover?.remove();
  currentPopover = null;
}

// ==========================================
// 4. INITIALISATION & ÉCOUTE
// ==========================================
function init() {
  chrome.storage.local.get(['failcProfile'], (result) => {
    activeProfile = (result.failcProfile as Profile) || 'standard';
    applyProfileStyles(activeProfile);
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'SET_PROFILE') {
      activeProfile = message.profile;
      applyProfileStyles(activeProfile);
    }
    if (message.type === 'ANALYZE_PAGE') {
      void analyzePageSilent();
    }
    if (message.type === 'MODIFY_PAGE') {
      applyVisualModifications();
    }
  });
}

init();