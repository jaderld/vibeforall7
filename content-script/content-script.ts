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

const ADMIN_KEYWORDS = ['déclaration', 'cotisation', 'avis', 'impôt', 'caf', 'urssaf', 'allocation', 'sécurité sociale', 'démarche', 'complémentaire santé', 'impot', 'retraite', 'pension'];
const STORAGE_PREFIX = 'failc:';
const VOCAL_URL = 'https://example.com/vocal';
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
    .failc-banner { position: fixed; top: 0; left: 0; right: 0; z-index: 2147483646; background: #102a43; color: #fff; padding: 10px 12px; display: flex; align-items: center; justify-content: space-between; gap: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
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

function isAdministrativePage() {
  const formCount = document.querySelectorAll('form').length;
  const text = `${document.title} ${document.querySelector('h1')?.textContent || ''} ${document.querySelector('h2')?.textContent || ''}`.toLowerCase();
  const hasKeyword = ADMIN_KEYWORDS.some((keyword) => text.includes(keyword));
  return formCount > 0 || hasKeyword || document.querySelectorAll('p, li, td').length > 6;
}

function createLoadingIndicator() {
  const existing = document.getElementById('failc-loading');
  if (existing) return existing as HTMLDivElement;
  const el = document.createElement('div');
  el.id = 'failc-loading';
  el.textContent = 'Analyse en cours...';
  el.style.cssText = `position:fixed;right:16px;bottom:16px;z-index:2147483647;background:#0b5fff;color:#fff;padding:10px 12px;border-radius:8px;font-size:13px;box-shadow:0 2px 10px rgba(0,0,0,0.2);max-width:220px;`;
  document.body.appendChild(el);
  return el;
}

function removeLoadingIndicator() {
  document.getElementById('failc-loading')?.remove();
}

function ensureFloatingAssistant() {
  if (document.getElementById('failc-floating-panel')) return;
  const panel = document.createElement('div');
  panel.id = 'failc-floating-panel';
  panel.style.cssText = `position:fixed;right:16px;bottom:16px;z-index:2147483647;width:min(320px, calc(100vw - 24px));max-height:70vh;overflow:auto;background:#ffffff;border:1px solid #cbd5e1;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.2);padding:12px;font-family:Arial,sans-serif;color:#111;`;
  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
      <strong style="font-size:15px;">FAILC Assistant</strong>
      <button id="failc-floating-close" type="button" style="border:0;background:transparent;cursor:pointer;font-size:16px;">✕</button>
    </div>
    <div id="failc-floating-body" style="font-size:13px;line-height:1.45;color:#334155;">
      L’assistant reste visible sur cette page si la fenêtre popup se referme.
    </div>
    <div style="display:flex;gap:8px;margin-top:10px;">
      <button id="failc-floating-analyze" type="button" style="flex:1;min-height:38px;border:0;border-radius:8px;background:#0b5fff;color:#fff;cursor:pointer;">Analyser</button>
    </div>
  `;
  document.body.appendChild(panel);
  panel.querySelector('#failc-floating-close')?.addEventListener('click', () => panel.remove());
  panel.querySelector('#failc-floating-analyze')?.addEventListener('click', () => {
    void analyzePage(true);
  });
}

function updateFloatingAssistant(data: AnalysisResponse | null) {
  ensureFloatingAssistant();
  const panel = document.getElementById('failc-floating-panel');
  const body = document.getElementById('failc-floating-body');
  if (!panel || !body) return;

  const summary = data?.summary || 'Aucune analyse disponible pour le moment.';
  const steps = data?.steps?.slice(0, 3) || [];
  const contacts = [
    data?.contactInfo.telephone ? `📞 ${data.contactInfo.telephone}` : '',
    data?.contactInfo.email ? `✉️ ${data.contactInfo.email}` : '',
    data?.contactInfo.adresse ? `📍 ${data.contactInfo.adresse}` : ''
  ].filter(Boolean);

  body.innerHTML = `
    <div style="margin-bottom:8px;"><strong>Résumé</strong><div style="margin-top:4px;">${summary}</div></div>
    ${steps.length ? `<div style="margin-bottom:8px;"><strong>À faire</strong><ul style="margin:4px 0 0 16px;padding:0;">${steps.map((step) => `<li>${step}</li>`).join('')}</ul></div>` : ''}
    ${contacts.length ? `<div><strong>Coordonnées</strong><div style="margin-top:4px;">${contacts.join('<br/>')}</div></div>` : ''}
  `;
}

function setBadge(status: 'ok' | 'error') {
  chrome.action.setBadgeText({ text: status === 'ok' ? '✓' : '!' });
  chrome.action.setBadgeBackgroundColor({ color: status === 'ok' ? '#2e7d32' : '#c62828' });
}

function showInlineNotice(message: string) {
  const existing = document.getElementById('failc-notice');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.id = 'failc-notice';
  el.textContent = message;
  el.style.cssText = `position:fixed;left:16px;bottom:72px;z-index:2147483647;background:#fff3cd;color:#6b4f00;padding:10px 12px;border:1px solid #ffe79a;border-radius:8px;max-width:280px;`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function showAccessibilityGuide(data: AnalysisResponse) {
  const existing = document.getElementById('failc-guide-banner');
  if (existing) existing.remove();
  const banner = document.createElement('div');
  banner.id = 'failc-guide-banner';
  banner.style.cssText = `position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#0f172a;color:#fff;padding:12px 14px;box-shadow:0 6px 18px rgba(0,0,0,0.2);font-family:Arial,sans-serif;display:flex;flex-direction:column;gap:8px;`;
  banner.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
      <div>
        <strong style="font-size:15px;">Guide FAILC</strong>
        <div style="font-size:13px;margin-top:4px;line-height:1.45;">${escapeHtml(data.summary)}</div>
      </div>
      <button id="failc-guide-close" type="button" style="border:0;background:transparent;color:#fff;cursor:pointer;font-size:16px;">✕</button>
    </div>
    <div style="font-size:13px;line-height:1.45;">${data.steps.map((step) => `<div>• ${escapeHtml(step)}</div>`).join('')}</div>
  `;
  document.body.appendChild(banner);
  document.getElementById('failc-guide-close')?.addEventListener('click', () => banner.remove());
  document.body.style.paddingTop = '110px';
}

function collectBlocks() {
  const selector = 'p, li, td, h1, h2, h3, h4, h5, h6, div, span, section, article, label, strong';
  const elements = Array.from(document.querySelectorAll(selector));
  const blocks: Array<{ id: string; text: string; html: string; tagName: string }> = [];
  elements.forEach((element) => {
    if (!(element instanceof HTMLElement)) return;
    if (element.closest('script, style, noscript, svg, form, button, input, textarea, select, iframe')) return;
    const text = element.innerText?.trim() || element.textContent?.trim() || '';
    const isVisible = element.getClientRects().length > 0 || element.tagName === 'BODY' || element.tagName === 'HTML';
    if (!text || text.length < 6 || !isVisible) return;
    const id = `failc-${Math.random().toString(36).slice(2, 10)}`;
    element.setAttribute('data-failc-id', id);
    blocks.push({ id, text, html: element.outerHTML.slice(0, 2400), tagName: element.tagName.toLowerCase() });
  });
  return blocks.slice(0, 60);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function simplifyText(text: string, html = ''): string {
  let simplified = text.replace(/\s+/g, ' ').trim();
  if (!simplified) return 'Informations à consulter.';

  const combined = `${simplified} ${html}`.toLowerCase();
  const guidance: string[] = [];
  if (/(déclar|imp[oô]t|taxe|revenu|fisc)/i.test(combined)) {
    guidance.push('Vous devez remplir un formulaire ou vérifier un document fiscal.');
  }
  if (/(paiement|cotisation|montant|versement|facture)/i.test(combined)) {
    guidance.push('Vérifiez le montant à payer ou à préparer.');
  }
  if (/(pièce|document|justificatif|renseigne|dossier)/i.test(combined)) {
    guidance.push('Préparez les pièces demandées avant de poursuivre.');
  }
  if (/(contact|adresse|téléphone|email|horaire|service)/i.test(combined)) {
    guidance.push('Repérez les coordonnées utiles et les services associés.');
  }

  const replacements: Array<[RegExp, string]> = [
    [/\bavis d['’]imposition\b/gi, 'document de l’administration'],
    [/\bcomplémentaire santé\b/gi, 'mutuelle'],
    [/\bcotisation\b/gi, 'paiement'],
    [/\bdéclaration\b/gi, 'formulaire à remplir'],
    [/\bimpôt\b/gi, 'taxe'],
    [/\ballocation\b/gi, 'aide financière'],
    [/\bcaf\b/gi, 'caisse d’allocations familiales'],
    [/\burssaf\b/gi, 'organisme chargé des cotisations sociales'],
    [/\bsécurité sociale\b/gi, 'protection sociale'],
    [/\bdémarche\b/gi, 'action administrative'],
    [/\bformulaire\b/gi, 'formulaire simple'],
    [/\bdocuments?\b/gi, 'pièces à fournir'],
    [/\bprévoir\b/gi, 'préparer']
  ];

  replacements.forEach(([pattern, replacement]) => {
    simplified = simplified.replace(pattern, replacement);
  });

  const finalText = `${simplified}${guidance.length ? ` ${guidance.join(' ')}` : ''}`.trim();
  return finalText.length > 220 ? `${finalText.slice(0, 217).trimEnd()}…` : finalText;
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

function analyzeLocally(blocks: Array<{ id: string; text: string; html: string; tagName: string }>): AnalysisResponse {
  const visibleText = blocks.map((block) => block.text).join(' ');
  const glossary = buildGlossary(visibleText);
  const contactInfo = extractContactInfo(visibleText);
  const lowerText = visibleText.toLowerCase();
  const topic = /déclar|imp[oô]t|revenu|fisc|taxe/.test(lowerText)
    ? 'une démarche fiscale ou administrative'
    : /paiement|cotisation|montant/.test(lowerText)
      ? 'un paiement ou une cotisation'
      : /document|pièce|justificatif/.test(lowerText)
        ? 'la préparation de documents'
        : 'une démarche administrative';
  const action = /déclar|imp[oô]t|revenu|taxe/.test(lowerText)
    ? 'Rassemblez les documents demandés et remplissez le formulaire avec les informations exactes.'
    : /paiement|cotisation|montant/.test(lowerText)
      ? 'Vérifiez le montant et les moyens de paiement proposés.'
      : 'Repérez les étapes principales et les coordonnées utiles.';
  const summary = visibleText.length > 0
    ? `Cette page concerne ${topic}. ${action}`
    : 'Cette page ne contient pas assez de contenu pour générer un résumé.';
  const steps = [
    'Repérez la rubrique principale et les actions demandées.',
    'Préparez les pièces justificatives ou informations utiles.',
    'Suivez les étapes affichées et gardez les coordonnées à portée de main.'
  ];
  const highlightedSelectors = ['form', 'button', 'input', 'a'];
  return {
    simplifiedBlocks: blocks.map((block) => ({ id: block.id, falc: simplifyText(block.text, block.html) })),
    glossary,
    contactInfo,
    voiceFormAvailable: document.querySelectorAll('form').length > 0,
    summary,
    steps,
    highlightedSelectors
  };
}

async function getConfiguredApiUrl(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['failcApiUrl'], (result) => {
      const value = typeof result.failcApiUrl === 'string' ? result.failcApiUrl : '';
      resolve((value || 'http://127.0.0.1:8787').replace(/\/$/, ''));
    });
  });
}

async function fetchAnalysis(blocks: Array<{ id: string; text: string; html: string; tagName: string }>): Promise<AnalysisResponse> {
  const apiUrl = await getConfiguredApiUrl();
  if (apiUrl) {
    try {
      const response = await fetch(`${apiUrl}/api/analyze-page`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: location.href,
          title: document.title,
          html: document.body?.innerHTML || '',
          blocks,
          hasForm: document.querySelectorAll('form').length > 0
        })
      });
      if (response.ok) {
        const data = await response.json() as AnalysisResponse;
        return data;
      }
    } catch (error) {
      // fallback local analysis below
    }
  }
  return analyzeLocally(blocks);
}

async function analyzePage(force = false) {
  if (!force && !isAdministrativePage()) return;
  ensureFloatingAssistant();
  const loading = createLoadingIndicator();
  const blocks = collectBlocks();
  try {
    const data = await fetchAnalysis(blocks);
    showAccessibilityGuide(data);
    data.simplifiedBlocks.forEach((block) => {
      const target = document.querySelector(`[data-failc-id="${block.id}"]`) as HTMLElement | null;
      if (target) {
        target.innerHTML = `<div style="background:#f8fafc;border-left:4px solid #0b5fff;padding:8px 10px;border-radius:6px;line-height:1.45;font-size:15px;color:#0f172a;">${escapeHtml(block.falc)}</div>`;
        target.setAttribute('data-failc-rewritten', 'true');
        target.style.setProperty('background', 'transparent', 'important');
      }
    });
    updateFloatingAssistant(data);
    const storageKey = `${STORAGE_PREFIX}${location.href}`;
    await chrome.storage.local.set({ [storageKey]: { glossary: data.glossary, contactInfo: data.contactInfo, voiceFormAvailable: data.voiceFormAvailable } });
    applyGlossaryHighlights(data.glossary);
    attachGlossaryInteractions();
    setBadge('ok');
    if (data.voiceFormAvailable) {
      showVoiceBanner();
    }
  } catch (error) {
    setBadge('error');
    showInlineNotice('Analyse indisponible, réessayez');
  } finally {
    removeLoadingIndicator();
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

function showVoiceBanner() {
  chrome.storage.local.get([`failc:voice-dismiss:${location.href}`], (result) => {
    if (result[`failc:voice-dismiss:${location.href}`]) return;
    const existing = document.getElementById('failc-voice-banner');
    if (existing) return;
    const banner = document.createElement('div');
    banner.id = 'failc-voice-banner';
    banner.className = 'failc-banner';
    banner.innerHTML = `<span>FAILC a détecté un formulaire sur cette page — voulez-vous le remplir à la voix ?</span><div style="display:flex;gap:8px;"><button id="failc-voice-yes" style="min-height:44px;border:1px solid #fff;border-radius:6px;padding:0 12px;background:#fff;color:#102a43;cursor:pointer;">Oui, m'aider</button><button id="failc-voice-no" style="min-height:44px;border:1px solid #fff;border-radius:6px;padding:0 12px;background:transparent;color:#fff;cursor:pointer;">Non merci</button></div>`;
    document.body.prepend(banner);
    document.body.style.paddingTop = '56px';
    const yes = document.getElementById('failc-voice-yes');
    const no = document.getElementById('failc-voice-no');
    yes?.addEventListener('click', () => chrome.tabs.create({ url: VOCAL_URL }));
    no?.addEventListener('click', () => {
      banner.remove();
      document.body.style.paddingTop = '';
      chrome.storage.local.set({ [`failc:voice-dismiss:${location.href}`]: true });
    });
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
  if (getCurrentProfile() === 'anti-epilepsy') {
    popover.style.transition = 'none';
  } else if (getCurrentProfile() === 'low-vision') {
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

async function analyzeSelection(selectionText: string) {
  const blocks = [{ id: `selection-${Date.now()}`, text: selectionText, html: selectionText, tagName: 'div' }];
  const loading = createLoadingIndicator();
  try {
    const data = await fetchAnalysis(blocks);
    const popover = document.createElement('div');
    popover.id = 'failc-selection-popover';
    popover.style.cssText = `position:fixed;z-index:2147483647;max-width:280px;background:#fff;border:1px solid #0b5fff;border-radius:8px;padding:10px 12px;box-shadow:0 4px 14px rgba(0,0,0,0.2);`;
    popover.innerHTML = `<strong>Résumé FAILC</strong><div style="margin-top:6px;">${data.simplifiedBlocks[0]?.falc || 'Sélection simplifiée.'}</div>`;
    document.body.appendChild(popover);
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const rect = range?.getBoundingClientRect();
    if (rect) {
      popover.style.top = `${window.scrollY + rect.bottom + 8}px`;
      popover.style.left = `${window.scrollX + rect.left}px`;
    } else {
      popover.style.top = '24px';
      popover.style.right = '24px';
    }
    setTimeout(() => popover.remove(), 6000);
  } finally {
    removeLoadingIndicator();
  }
}

function highlightImportantElements() {
  document.querySelectorAll('button, input, select, textarea, a').forEach((element, index) => {
    if (element instanceof HTMLElement) {
      element.style.outline = '2px solid #f59e0b';
      element.style.outlineOffset = '2px';
      element.setAttribute('data-failc-highlight', String(index));
    }
  });
}

function answerContextualQuestion(question: string) {
  const text = document.body.innerText.slice(0, 1800);
  const answer = question.toLowerCase().includes('faire') || question.toLowerCase().includes('étape')
    ? 'Commencez par vérifier le formulaire, préparez les pièces demandées et suivez l’ordre des étapes indiqué sur la page.'
    : `Voici ce qui semble essentiel sur cette page : ${text.slice(0, 220)}...`;
  return answer;
}

function init() {
  chrome.storage.local.get(['failcProfile'], (result) => {
    activeProfile = (result.failcProfile as Profile) || 'standard';
    applyProfileStyles(activeProfile);
  });

  if (isAdministrativePage()) {
    ensureFloatingAssistant();
    void analyzePage(false);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'SET_PROFILE') {
      activeProfile = message.profile;
      applyProfileStyles(activeProfile);
    }
    if (message.type === 'ANALYZE_PAGE') {
      void analyzePage(true);
    }
    if (message.type === 'CONTEXT_SELECTION') {
      void analyzeSelection(message.selectionText);
    }
    if (message.type === 'ASK_CONTEXT') {
      const reply = answerContextualQuestion(message.question);
      chrome.runtime.sendMessage({ type: 'CHAT_REPLY', reply });
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    attachGlossaryInteractions();
    highlightImportantElements();
  });
}

init();
