type Profile = 'standard' | 'dyslexia' | 'low-vision' | 'anti-epilepsy';

type SimplifiedBlock = { id: string; falc: string };
type GlossaryEntry = { term: string; definition: string };
type ContactInfo = { telephone: string; email: string; adresse: string; horaires: string };

type AnalysisResponse = {
  simplifiedBlocks: SimplifiedBlock[];
  glossary: GlossaryEntry[];
  contactInfo: ContactInfo;
  voiceFormAvailable: boolean;
  summary: string;
  steps: string[];
  highlightedSelectors: string[];
};

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

function getCurrentProfile(): Profile {
  return activeProfile;
}

function applyProfileStyles(profile: Profile) {
  const existing = document.getElementById('failc-profile-style');
  if (existing) existing.remove();

  if (profile === 'standard') {
    const base = document.getElementById('failc-base-style');
    if (base) base.remove();
    return;
  }

  const baseStyle = document.createElement('style');
  baseStyle.id = 'failc-base-style';
  baseStyle.textContent = `
    .failc-term { border-bottom: 2px dotted #0b5fff; cursor: help; text-decoration: none; }
    .failc-popover { position: fixed; z-index: 2147483647; background: #0f172a; color: #fff; padding: 10px 12px; border-radius: 8px; max-width: 260px; font-size: 14px; line-height: 1.4; box-shadow: 0 6px 18px rgba(0,0,0,0.25); }
  `;
  document.head.appendChild(baseStyle);

  const style = document.createElement('style');
  style.id = 'failc-profile-style';
  style.textContent = profile === 'dyslexia'
    ? `
      body, body * { font-family: Arial, sans-serif !important; }
      body, body * { line-height: 1.65 !important; text-align: left !important; }
      p, li, td, h1, h2, h3, button, a { letter-spacing: 0.01em !important; }
    `
    : profile === 'low-vision'
      ? `
        body { background: #111 !important; color: #f8f8f8 !important; }
        body * { color: inherit !important; }
        body a, body button { font-size: 1.2em !important; padding: 0.4em 0.6em !important; }
        body p, body li, body td, body h1, body h2, body h3 { font-size: 1.2em !important; }
      `
      : `
        * { animation: none !important; transition: none !important; }
        video { autoplay: false !important; }
      `;

  document.head.appendChild(style);
}

function collectBlocks() {
  const selector = 'p, li, td, h1, h2, h3, h4, h5, h6, label';
  const elements = Array.from(document.querySelectorAll(selector));
  const blocks: Array<{ id: string; text: string; html: string; tagName: string }> = [];
  elements.forEach((element) => {
    if (!(element instanceof HTMLElement)) return;
    if (element.closest('script, style, noscript, svg, form, button, input, textarea, select, iframe')) return;
    const text = element.innerText?.trim() || element.textContent?.trim() || '';
    const isVisible = element.getClientRects().length > 0 || element.tagName === 'BODY' || element.tagName === 'HTML';
    if (!text || text.length < 12 || !isVisible) return;
    const id = `failc-${Math.random().toString(36).slice(2, 10)}`;
    element.setAttribute('data-failc-id', id);
    blocks.push({ id, text, html: element.outerHTML.slice(0, 2400), tagName: element.tagName.toLowerCase() });
  });
  return blocks.slice(0, 60);
}

function simplifyText(text: string, html = ''): string {
  let normalized = `${text || ''}`.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Informations à consulter.';
  return normalized;
}

function extractContactInfo(text: string): ContactInfo {
  const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(text)?.[0] || '';
  const telephone = /(\+33|0)[0-9 .-]{8,14}/.exec(text)?.[0] || '';
  const adresseMatch = /adresse[^\n:]{0,80}([A-ZÀ-ÿ0-9'’., -]{4,80})/i.exec(text);
  const horairesMatch = /horaires?[^\n:]{0,80}([A-ZÀ-ÿ0-9'’., -]{4,80})/i.exec(text);
  return {
    telephone,
    email,
    adresse: adresseMatch?.[1]?.trim() || '',
    horaires: horairesMatch?.[1]?.trim() || ''
  };
}

function buildGlossary(text: string): GlossaryEntry[] {
  const glossary: GlossaryEntry[] = [];
  TERM_DEFINITIONS.forEach((entry) => {
    if (text.toLowerCase().includes(entry.term.toLowerCase())) {
      glossary.push(entry);
    }
  });
  return glossary;
}

// Fallback d'analyse locale si le LLM n'est pas disponible
function analyzeLocally(blocks: Array<{ id: string; text: string; html: string; tagName: string }>): AnalysisResponse {
  const visibleText = blocks.map((block) => block.text).join(' ');
  const glossary = buildGlossary(visibleText);
  const contactInfo = extractContactInfo(visibleText);
  const isForm = document.querySelectorAll('form').length > 0;
  
  const headings = Array.from(document.querySelectorAll('h1, h2, h3')).map(h => (h.textContent || '').trim()).filter(Boolean);
  const firstHeading = headings[0] || document.title || '';

  const summary = firstHeading ? `Titre principal : ${firstHeading}. Suivez les instructions affichées à l'écran.` : 'Cette page semble contenir des informations administratives.';
  const steps = firstHeading ? [`Vérifier la rubrique : ${firstHeading}`, 'Préparez les pièces demandées.'] : ['Lisez attentivement les instructions.'];

  return {
    simplifiedBlocks: blocks.map((block) => ({ id: block.id, falc: simplifyText(block.text, block.html) })),
    glossary, contactInfo, voiceFormAvailable: isForm, summary, steps, highlightedSelectors: ['form', 'button', 'input', 'a']
  };
}

async function fetchAnalysis(blocks: Array<{ id: string; text: string; html: string; tagName: string }>): Promise<AnalysisResponse> {
  return new Promise<AnalysisResponse>((resolve) => {
    try {
      chrome.runtime.sendMessage({ 
        type: 'FETCH_ANALYSIS', 
        payload: { url: location.href, title: document.title, html: document.body?.innerHTML || '', blocks, hasForm: document.querySelectorAll('form').length > 0 } 
      }, (response) => {
        if (chrome.runtime.lastError || !response || !(response as any).simplifiedBlocks) {
          resolve(analyzeLocally(blocks));
        } else {
          resolve(response as AnalysisResponse);
        }
      });
    } catch (e) {
      resolve(analyzeLocally(blocks));
    }
  });
}

async function analyzePage() {
  // Notifie la barre latérale que le chargement a commencé
  chrome.runtime.sendMessage({ type: 'ANALYSIS_STARTED' }).catch(() => {});
  
  const blocks = collectBlocks();
  try {
    const data = await fetchAnalysis(blocks);
    const storageKey = `${STORAGE_PREFIX}${location.href}`;
    
    // Sauvegarder dans Chrome Storage (la Sidebar va écouter cet événement)
    await chrome.storage.local.set({ 
      [storageKey]: { 
        summary: data.summary,
        steps: data.steps,
        glossary: data.glossary, 
        contactInfo: data.contactInfo, 
        voiceFormAvailable: data.voiceFormAvailable,
        highlightedSelectors: data.highlightedSelectors
      } 
    });
    
    applyGlossaryHighlights(data.glossary);
    attachGlossaryInteractions();
  } catch (error) {
    console.error("Erreur d'analyse:", error);
  }
}

function applyGlossaryHighlights(glossary: GlossaryEntry[]) {
  document.querySelectorAll('.failc-term').forEach((element) => element.remove());
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
  while (walker.nextNode()) {
    const current = walker.currentNode as Text;
    if (current.nodeValue && current.nodeValue.trim()) nodes.push(current);
  }

  nodes.forEach((node) => {
    const text = node.nodeValue || '';
    let updated = text;
    glossary.forEach((entry) => {
      const escapedTerm = entry.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedTerm}\\b`, 'gi');
      updated = updated.replace(regex, (match) => {
        const span = document.createElement('span');
        span.className = 'failc-term';
        span.setAttribute('tabindex', '0');
        span.setAttribute('data-definition', entry.definition);
        span.textContent = match;
        return span.outerHTML;
      });
    });

    if (updated !== text) {
      const fragment = document.createRange().createContextualFragment(updated);
      node.parentNode?.replaceChild(fragment, node);
    }
  });
}

function attachGlossaryInteractions() {
  document.querySelectorAll('.failc-term').forEach((element) => {
    element.addEventListener('mouseenter', (event) => showPopover(event.currentTarget as HTMLElement));
    element.addEventListener('focus', (event) => showPopover(event.currentTarget as HTMLElement));
    element.addEventListener('mouseleave', hidePopover);
    element.addEventListener('blur', hidePopover);
    element.addEventListener('keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Escape') hidePopover();
    });
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
  if (getCurrentProfile() === 'anti-epilepsy') popover.style.transition = 'none';
  if (getCurrentProfile() === 'low-vision') {
    popover.style.background = '#000';
    popover.style.color = '#fff';
    popover.style.fontSize = '15px';
  }
  currentPopover = popover;
}

function hidePopover() {
  currentPopover?.remove();
  currentPopover = null;
}

function answerContextualQuestion(question: string) {
  const text = document.body.innerText.slice(0, 1800);
  return question.toLowerCase().includes('faire') 
    ? 'Commencez par vérifier le formulaire, préparez les pièces demandées et suivez l’ordre des étapes.'
    : `Voici ce qui semble essentiel : ${text.slice(0, 220)}...`;
}

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
      void analyzePage(); // Appelé depuis la sidebar
    }
    if (message.type === 'ASK_CONTEXT') {
      const reply = answerContextualQuestion(message.question);
      chrome.runtime.sendMessage({ type: 'CHAT_REPLY', reply });
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    attachGlossaryInteractions();
  });
}

init();