import { extractPageContent } from './webExtraction';

type Profile = 'standard' | 'dyslexia' | 'low-vision' | 'anti-epilepsy';
type ContactInfo = {
  contactLink?: string;
  contactLabel?: string;
  telephone?: string;
  email?: string;
  adresse?: string;
  horaires?: string;
};
type GlossaryEntry = { term: string; definition: string };
type StorageData = {
  contactInfo?: ContactInfo;
  [key: string]: any;
};

const STORAGE_PREFIX = 'failc:';
const TERM_DEFINITIONS: Array<{ term: string; definition: string }> = [
  { term: "avis d'imposition", definition: "Document envoyé par l'administration pour expliquer le montant de votre impôt." },
  { term: 'cotisation', definition: 'Montant payé pour financer un service ou une assurance.' },
  { term: 'complémentaire santé', definition: 'Garantie qui complète la couverture de base pour les soins médicaux.' },
  { term: 'caf', definition: 'Caisse d\'allocations familiales, organisme qui gère certaines aides.' },
  { term: 'urssaf', definition: 'Organisme chargé du contrôle et du recouvrement des cotisations sociales.' },
  { term: 'allocation', definition: "Aide financière versée par l'État ou un organisme public." },
  { term: 'démarche', definition: "Action administrative à réaliser auprès d'un service public." }
];

// Zones techniques à ignorer (jamais de contenu visible pertinent à modifier).
const IGNORED_ZONES_SELECTOR = 'script, style, noscript, svg, iframe, textarea, input';

const SUPPORTED_SITES = [
  'impots.gouv.fr',
  'caf.fr',
  'ameli.fr',
  'ants.gouv.fr',
  'urssaf.fr'
];

let activeProfile: Profile = 'standard';
let currentPopover: HTMLDivElement | null = null;
let observer: MutationObserver | null = null;

// ==========================================
// 1. GESTION DES PROFILS (CSS)
// ==========================================
function isSupportedSite() {
  return SUPPORTED_SITES.some(site => location.hostname.includes(site));
}

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
      : `* { animation: none !important; transition: none !important; }`;
  document.head.appendChild(style);
}

// ==========================================
// 2. LECTURE & ANALYSE SILENCIEUSE (IA & REGEX)
// ==========================================
function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// Mots-clés désignant un accès au contact/support/prise de rendez-vous
const CONTACT_KEYWORDS = [
  'contact', 'contactez', 'nous contacter', 'nous joindre',
  'aide', 'faq', 'support', 'assistance',
  'rendez-vous', 'rendezvous', 'rdv', 'prendre rendez-vous'
];

// Cherche le premier lien/bouton de contact sur la page et renvoie son libellé + son URL
function findContactLink(): { label: string; url: string } | null {
  const candidates = Array.from(document.querySelectorAll('a, button'));

  for (const el of candidates) {
    if (!(el instanceof HTMLElement)) continue;

    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;

    const rawText =
      el.innerText?.trim() ||
      el.getAttribute('aria-label') ||
      el.textContent?.trim() ||
      '';

    const text = normalize(rawText);
    if (!text) continue;

    const matched = CONTACT_KEYWORDS.some((kw) => text.includes(kw));
    if (!matched) continue;

    const rawHref = el.getAttribute('href') || '';
    const url = (el as HTMLAnchorElement).href || rawHref;

    if (
      !url ||
      rawHref === '#' ||
      rawHref === '/' ||
      rawHref.startsWith('#') ||
      rawHref.startsWith('javascript:')
    ) {
      continue;
    }

    try {
      const parsedUrl = new URL(url, window.location.href);
      const currentUrl = new URL(window.location.href);
      if (parsedUrl.pathname === currentUrl.pathname && parsedUrl.hash) {
        continue;
      }
    } catch (e) {
      continue;
    }

    return { label: rawText, url };
  }

  return null;
}

// Extrait les coordonnées directement depuis le texte brut
function extractContactInfo(text: string): Partial<ContactInfo> {
  const info: Partial<ContactInfo> = {};

  const phoneMatch = text.match(/(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/);
  if (phoneMatch) info.telephone = phoneMatch[0];

  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) info.email = emailMatch[0];

  const horairesMatch = text.match(/(?:du|de)\s+(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche).*?(?:à|a)\s+\d{1,2}h(?:\d{2})?/i);
  if (horairesMatch) info.horaires = horairesMatch[0];

  const addressMatch = text.match(/\d{1,4}\s+[a-zA-Z0-9\s,.-]+?\s+\d{5}\s+[a-zA-Z\s-]+/);
  if (addressMatch) info.adresse = addressMatch[0].trim();

  return info;
}

async function analyzePageSilent() {
  chrome.runtime.sendMessage({ type: 'ANALYSIS_STARTED' }).catch(() => {});
  const visibleText = extractPageContent();
  const contactLink = findContactLink();
  const extractedContact = extractContactInfo(visibleText);

  try {
    const { response, lastErrorMessage } = await new Promise<{
      response: any;
      lastErrorMessage?: string;
    }>((resolve) => {
      chrome.runtime.sendMessage({ type: 'FETCH_ANALYSIS' }, (resp) => {
        resolve({ response: resp, lastErrorMessage: chrome.runtime.lastError?.message });
      });
    });

    const cleanUrl = location.href.split('#')[0];
    const storageKey = `${STORAGE_PREFIX}${cleanUrl}`;

    const hasAiError = Boolean(lastErrorMessage || !response || response.error);
    const aiErrorMessage = lastErrorMessage || response?.error || '';

    const analysisData = {
      summary: hasAiError
        ? `Le résumé par IA est indisponible (${aiErrorMessage || 'Erreur de connexion ou quota'}).`
        : response.summary,
      steps: hasAiError ? ["Suivez les instructions affichées sur la page."] : (response.steps || []),
      glossary: TERM_DEFINITIONS.filter(e => visibleText.toLowerCase().includes(e.term.toLowerCase())),
      contactInfo: {
        contactLink: contactLink?.url || '',
        contactLabel: contactLink?.label || '',
        telephone: extractedContact.telephone || '',
        email: extractedContact.email || '',
        adresse: extractedContact.adresse || '',
        horaires: extractedContact.horaires || ''
      },
    };

    await chrome.storage.local.set({ [storageKey]: analysisData });
    chrome.runtime.sendMessage({ type: 'ANALYSIS_COMPLETE', data: analysisData }).catch(() => {});
  } catch (error) {
    chrome.runtime.sendMessage({ type: 'ANALYSIS_ERROR' }).catch(() => {});
  }
}

// ==========================================
// 3. MODIFICATION VISUELLE DE LA PAGE
// ==========================================
function showPopover(target: HTMLElement) {
  hidePopover();

  const definition =
    target.getAttribute('data-definition') ||
    target.title ||
    '';

  if (!definition) return;

  const popover = document.createElement('div');
  popover.className = 'failc-popover';
  popover.textContent = definition;

  document.body.appendChild(popover);

  const rect = target.getBoundingClientRect();
  popover.style.top = `${rect.bottom + window.scrollY + 6}px`;
  popover.style.left = `${rect.left + window.scrollX}px`;

  currentPopover = popover;
}

function hidePopover() {
  currentPopover?.remove();
  currentPopover = null;
}

// Détection simple par mot-clé pour simplifier les boutons d'action
function simplifyUIButton(text: string): string | null {
  const t = normalize(text);

  if (t.includes("connexion") || t.includes("se connecter") || t.includes("mon compte") || t.includes("espace") || t.includes("account")) {
    return "CONNEXION";
  }
  if (t.includes("chercher") || t.includes("rechercher") || t.includes("search")) {
    return "RECHERCHE";
  }
  if (t.includes("commencer") || t.includes("demarrer") || t.includes("lancer")) {
    return "COMMENCER";
  }
  if (t.includes("suivant") || t.includes("continuer") || t.includes("etape")) {
    return "SUIVANT";
  }
  if (t.includes("valider") || t.includes("confirmer") || t.includes("envoyer")) {
    return "CONFIRMER";
  }
  if (t.includes("retour") || t.includes("annuler")) {
    return "RETOUR";
  }

  return null;
}

// Mots-clés désignant une démarche importante à mettre en avant.
const DEMARCHE_KEYWORDS = [
  'demarche', 'attestation', 'carte vitale', 'feuille de soins',
  'payer en ligne', 'complementaire sante', 'remboursement',
  'toutes les demarches', 'demander', 'obtenir un', 'obtenir une'
];

function isNoteworthyDemarcheLink(text: string): boolean {
  const t = normalize(text);
  if (t.length < 3) return false;
  return DEMARCHE_KEYWORDS.some((kw) => t.includes(kw));
}

// Remplace le texte visible d'un bouton/lien SANS casser une icône imbriquée
function setVisibleLabel(el: HTMLElement, label: string) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let firstTextNode: Text | null = null;
  const extraTextNodes: Text[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!node.nodeValue?.trim()) continue;
    if (!firstTextNode) {
      firstTextNode = node;
    } else {
      extraTextNodes.push(node);
    }
  }

  if (firstTextNode) {
    firstTextNode.nodeValue = label;
    extraTextNodes.forEach((node) => { node.nodeValue = ''; });
  } else {
    el.textContent = label;
  }

  el.setAttribute('aria-label', label);
  el.title = label;
}

function highlightElement(el: HTMLElement) {
  el.style.outline = '3px solid #f97316';
  el.style.outlineOffset = '2px';
  el.style.boxShadow = '0 0 0 5px rgba(249, 115, 22, 0.18)';
}

function simplifySearchFields() {
  const fields = document.querySelectorAll('input, textarea');

  fields.forEach((el) => {
    if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return;

    const placeholder = el.getAttribute('placeholder') || '';
    const ariaLabel = el.getAttribute('aria-label') || '';
    const type = (el as HTMLInputElement).type || '';

    const combined = normalize(`${placeholder} ${ariaLabel} ${type}`);

    const isSearchField =
      combined.includes('cherch') ||
      combined.includes('search') ||
      type === 'search';

    if (!isSearchField) return;

    if (placeholder && placeholder !== 'RECHERCHE') {
      el.setAttribute('placeholder', 'RECHERCHE');
    }
    if (ariaLabel && ariaLabel !== 'RECHERCHE') {
      el.setAttribute('aria-label', 'RECHERCHE');
    }
    highlightElement(el);
  });
}

function applyVisualModifications() {
  simplifySearchFields();

  const replacements: Array<[RegExp, string]> = [
    [/\bque cherchez[- ]vous\s*\??/gi, 'RECHERCHE'],
    [/\brechercher\b/gi, 'RECHERCHE'],
    [/\bsearch\b/gi, 'RECHERCHE'],
    [/\bcommencer\b/gi, 'COMMENCER'],
    [/\bdémarrer\b/gi, 'COMMENCER'],
    [/\blancer\b/gi, 'COMMENCER'],
    [/\bétape suivante\b/gi, 'SUIVANT'],
    [/\bsuivant(e)?\b/gi, 'SUIVANT'],
    [/\bpoursuivre\b/gi, 'SUIVANT'],
    [/\bcontinuer\b/gi, 'SUIVANT'],
    [/\bvalider\b/gi, 'CONFIRMER'],
    [/\bconfirmer\b/gi, 'CONFIRMER'],
    [/\benregistrer\b/gi, 'SAUVEGARDER'],
    [/\bsoumettre\b/gi, 'ENVOYER'],
    [/\bannuler\b/gi, 'RETOUR'],
    [/\brevenir\b/gi, 'RETOUR'],
    [/\bretour\b/gi, 'RETOUR'],
    [/\bavis d['']imposition\b/gi, "document de l'administration"],
    [/\bcomplémentaire santé\b/gi, 'mutuelle (complémentaire santé)'],
    [/\brevenu fiscal de référence\b/gi, 'revenu utilisé pour les aides'],
    [/\bnuméro fiscal\b/gi, 'identifiant impôts'],
    [/\bcaf\b/gi, 'CAF (aides familiales)'],
    [/\burssaf\b/gi, 'URSSAF (cotisations sociales)'],
    [/\ben cours de traitement\b/gi, 'EN COURS'],
    [/\bvalidé\b/gi, 'ACCEPTÉ'],
    [/\brejeté\b/gi, 'REFUSÉ'],
    [/\bincomplet\b/gi, 'MANQUE DES DOCUMENTS'],
    [/\bse connecter\b/gi, 'CONNEXION'],
    [/\bconnexion\b/gi, 'CONNEXION'],
    [/\bdéconnexion\b/gi, 'DÉCONNEXION']
  ];

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (
      !node.nodeValue?.trim() ||
      node.parentElement?.closest(IGNORED_ZONES_SELECTOR + ', button')
    ) continue;
    textNodes.push(node);
  }

  textNodes.forEach((node) => {
    let text = node.nodeValue || '';
    let modified = text;

    replacements.forEach(([pattern, replacement]) => {
      modified = modified.replace(pattern, replacement);
    });

    if (modified !== text) {
      node.nodeValue = modified;
    }

    TERM_DEFINITIONS.forEach((entry) => {
      const regex = new RegExp(`\\b${entry.term}\\b`, 'i');
      if (regex.test(node.nodeValue || '')) {
        const parent = node.parentElement;
        if (!parent) return;
        if (parent.dataset.failcProcessed === '1') return;
        parent.dataset.failcProcessed = '1';
        parent.style.background = 'rgba(255, 243, 176, 0.5)';
        parent.style.cursor = 'help';
        parent.title = entry.definition;
        if ((parent as any).dataset.failcListeners === '1') return;
        (parent as any).dataset.failcListeners = '1';
        parent.addEventListener('mouseenter', () => showPopover(parent));
        parent.addEventListener('mouseleave', hidePopover);
      }
    });
  });

  document.querySelectorAll('button, a, [role="button"]').forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    if (el.closest(IGNORED_ZONES_SELECTOR)) return;

    const text =
      el.innerText?.trim() ||
      el.getAttribute("aria-label") ||
      el.textContent?.trim() ||
      "";

    const simplified = simplifyUIButton(text);
    const isDemarche = !simplified && isNoteworthyDemarcheLink(text);

    if (!simplified && !isDemarche) return;

    const labelForTracking = simplified || 'DEMARCHE';
    if (el.getAttribute('data-failc-label') === labelForTracking) return;
    el.setAttribute('data-failc-label', labelForTracking);

    if (simplified) {
      setVisibleLabel(el, simplified);
    }

    highlightElement(el);
  });
}

// Détection tardive : certains sites chargent leur bouton de contact après coup
function refreshContactLinkIfNeeded() {
  if ((window as any).__failcContactInjected) return;

  const found = findContactLink();
  if (!found) return;

  const cleanUrl = location.href.split('#')[0];
  const storageKey = `${STORAGE_PREFIX}${cleanUrl}`;

  chrome.storage.local.get([storageKey], (result) => {
    const existing = result[storageKey] as StorageData;

    if (!existing) return;

    if (!existing.contactInfo || !existing.contactInfo.contactLink) {
      existing.contactInfo = existing.contactInfo || {};
      existing.contactInfo.contactLink = found.url;
      existing.contactInfo.contactLabel = found.label;

      chrome.storage.local.set({ [storageKey]: existing }, () => {
        (window as any).__failcContactInjected = true;
        chrome.runtime.sendMessage({ type: 'ANALYSIS_COMPLETE', data: existing }).catch(() => {});
      });
    } else {
      (window as any).__failcContactInjected = true;
    }
  });
}

function startDomObserver() {
  if (observer) observer.disconnect();

  observer = new MutationObserver(() => {
    clearTimeout((window as any).__failcTimeout);
    (window as any).__failcTimeout = setTimeout(() => {
      applyVisualModifications();
      refreshContactLinkIfNeeded();
    }, 500);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// ==========================================
// 4. INITIALISATION & ÉCOUTE
// ==========================================
function init() {
  startDomObserver();

  if (!isSupportedSite()) return;

  chrome.storage.local.get(['failcProfile'], (result) => {
    activeProfile = (result.failcProfile as Profile) || 'standard';
    applyProfileStyles(activeProfile);
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'SET_PROFILE') {
      activeProfile = message.profile;
      applyProfileStyles(activeProfile);
    }
    if (message.type === 'EXTRACT_PAGE_CONTENT') {
      sendResponse({ pageContent: extractPageContent() });
      return false;
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
