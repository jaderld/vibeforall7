import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';

type Profile = 'standard' | 'dyslexia' | 'low-vision' | 'anti-epilepsy';
type AIProvider = 'openai' | 'gemini';
type ContactInfo = { telephone: string; email: string; adresse: string; horaires: string; contactLink?: string; contactLabel?: string; };

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
  { id: 'anti-epilepsy', label: 'Anti-épilepsie' }
];

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
const getChatStorageKey = (url: string) => `failc:chat:${url}`;

// -----------------------------------------------------------------------
// Design tokens — palette sobre à contraste maîtrisé, pensée pour des
// utilisateurs avec troubles visuels (basse vision) et cognitifs
// (charge visuelle réduite, pas de dégradés ni de couleurs saturées,
// aucun élément clignotant). Contrastes texte/fond ≥ 4.5:1.
// -----------------------------------------------------------------------
const tokens = {
  bg: '#F5F6F8',            // fond général, gris très doux (pas de blanc pur = moins d'éblouissement)
  surface: '#FFFFFF',
  border: '#DADFE6',
  borderStrong: '#B9C2CD',
  textPrimary: '#1F2A37',   // quasi-noir bleuté, plus doux qu'un noir pur
  textSecondary: '#5B6675',
  accent: '#2F5D8A',        // bleu sourd, contraste ~6.8:1 sur blanc
  accentHover: '#264B70',
  accentSoftBg: '#E8EFF6',
  accentSoftBorder: '#C7D6E6',
  neutralDark: '#33404F',   // remplace le noir dur des boutons secondaires
  success: '#2E7D4F',
  successBg: '#E7F3EC',
  error: '#B3411F',
  errorBg: '#FBEAE4',
  radius: 10,
  fontFamily:
    '"Atkinson Hyperlegible", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
};

const focusRing: React.CSSProperties = {
  outlineOffset: 2,
};

const Popup = () => {
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

  // --- Chatbot (questions sur la page / les démarches, réponses via Gemini) ---
  const [currentUrl, setCurrentUrl] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [isChatSending, setIsChatSending] = useState<boolean>(false);
  const [chatError, setChatError] = useState<string>('');
  const [isListening, setIsListening] = useState<boolean>(false);
  const recognitionRef = React.useRef<any>(null);
  const chatEndRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // 1. Écoute des messages venant du content-script
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
      // Réponse du chatbot (posée via CHAT_ASK, traitée côté background.ts)
      if (message.type === 'CHAT_ANSWER') {
        setIsChatSending(false);
        setChatError('');
        setChatMessages((prev) => [...prev, { role: 'assistant' as const, content: message.answer as string, ts: Date.now() }]);
      }
      if (message.type === 'CHAT_ERROR') {
        setIsChatSending(false);
        setChatError(message.error || "La question n'a pas pu être envoyée.");
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
      if (!tabUrl) return;

      const cleanUrl = tabUrl.split('#')[0];
      const urlKey = getAnalysisStorageKey(cleanUrl);

      chrome.storage.local.get([urlKey], (result) => {
        if (result[urlKey]) {
          setAnalysis(result[urlKey] as AnalysisData);
        }
      });
    });

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  const analyzePageManually = () => {
    if (isAnalyzing) {
      return;
    }
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

  const openProfileSettingsFromChooser = () => {
    setShowProfileSettings(true);
    setShowAiSettings(false);
    setShowSettingsChooser(false);
    setAiStatus('');
  };

  const openAiSettingsFromChooser = () => {
    setShowAiSettings(true);
    setShowProfileSettings(false);
    setShowSettingsChooser(false);
    setProfileStatus('');
  };

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        padding: 18,
        paddingBottom: 76,
        fontFamily: tokens.fontFamily,
        fontSize: 15,
        lineHeight: 1.55,
        background: tokens.bg,
        color: tokens.textPrimary,
      }}
    >
      {/* En-tête — couleur pleine et sobre, plus de dégradé */}
      <div
        style={{
          background: tokens.accent,
          color: '#FFFFFF',
          padding: '14px 16px',
          borderRadius: tokens.radius,
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', opacity: 0.92 }}>
            FAILC ASSISTANT
          </div>
          <div style={{ fontSize: 21, fontWeight: 700, marginTop: 4 }}>Accessibilité Web</div>
        </div>

        {/* Bouton de relance — placé à côté du titre, jamais par-dessus */}
        <button
          onClick={analyzePageManually}
          disabled={isAnalyzing}
          aria-label="Relancer l'analyse de la page"
          title="Relancer l'analyse"
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            height: 38,
            padding: '0 12px',
            borderRadius: 999,
            border: '1px solid rgba(255, 255, 255, 0.55)',
            background: isAnalyzing ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.14)',
            color: '#ffffff',
            fontSize: 12.5,
            fontWeight: 700,
            fontFamily: 'inherit',
            cursor: isAnalyzing ? 'not-allowed' : 'pointer',
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 15, lineHeight: 1 }}>↻</span>
          Relancer
        </button>
      </div>

      {/* Profils d'affichage */}
      {showProfileSettings && (
        <div
          style={{
            marginBottom: 16,
            padding: 16,
            background: tokens.surface,
            borderRadius: tokens.radius,
            border: `1px solid ${tokens.border}`,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: tokens.textPrimary, marginBottom: 10 }}>
            Profil d'affichage
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {profiles.map((profile) => {
              const isActive = activeProfile === profile.id;
              return (
                <button
                  key={profile.id}
                  onClick={() => applyProfile(profile.id)}
                  aria-pressed={isActive}
                  style={{
                    minHeight: 44,
                    border: isActive ? `2px solid ${tokens.accent}` : `1px solid ${tokens.border}`,
                    borderRadius: 8,
                    background: isActive ? tokens.accentSoftBg : tokens.surface,
                    color: isActive ? tokens.accent : tokens.textSecondary,
                    cursor: 'pointer',
                    fontSize: 13.5,
                    fontWeight: isActive ? 700 : 500,
                    fontFamily: 'inherit',
                    ...focusRing,
                  }}
                >
                  {isActive ? '✓ ' : ''}{profile.label}
                </button>
              );
            })}
          </div>

          <button
            onClick={saveProfileSettings}
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
              marginTop: 14,
              fontFamily: 'inherit',
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = tokens.accentHover)}
            onMouseOut={(e) => (e.currentTarget.style.background = tokens.accent)}
          >
            Valider ce profil
          </button>

          {profileStatus && (
            <div
              role="status"
              style={{
                marginTop: 10,
                padding: '8px 10px',
                borderRadius: 8,
                background: tokens.successBg,
                fontSize: 13,
                color: tokens.success,
                fontWeight: 700,
              }}
            >
              ✓ {profileStatus}
            </div>
          )}
        </div>
      )}

      {/* Choix du moteur IA */}
      {showAiSettings && (
        <div
          style={{
            marginBottom: 16,
            padding: 16,
            background: tokens.surface,
            borderRadius: tokens.radius,
            border: `1px solid ${tokens.border}`,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: tokens.textPrimary, marginBottom: 10 }}>
            Moteur d'intelligence artificielle
          </div>

          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: tokens.textSecondary, marginBottom: 6 }}>
            Fournisseur
          </label>
          <select
            value={aiProvider}
            onChange={(event) => setAiProvider(event.target.value as AIProvider)}
            style={{
              width: '100%',
              minHeight: 44,
              borderRadius: 8,
              border: `1px solid ${tokens.borderStrong}`,
              padding: '0 10px',
              marginBottom: 10,
              fontSize: 14,
              fontFamily: 'inherit',
              color: tokens.textPrimary,
              background: tokens.surface,
            }}
          >
            {aiProviders.map((provider) => (
              <option key={provider.id} value={provider.id}>{provider.label}</option>
            ))}
          </select>
          <p style={{ margin: '0 0 14px', fontSize: 12.5, color: tokens.textSecondary, lineHeight: 1.6 }}>
            {aiProviders.find((provider) => provider.id === aiProvider)?.note}
          </p>

          {aiProvider === 'openai' && (
            <>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: tokens.textSecondary, marginBottom: 6 }}>
                Clé API OpenAI
              </label>
              <input
                type="password"
                value={openAiApiKey}
                onChange={(event) => setOpenAiApiKey(event.target.value)}
                placeholder="sk-..."
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

          {aiProvider === 'gemini' && (
            <>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: tokens.textSecondary, marginBottom: 6 }}>
                Clé API Gemini
              </label>
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
        </div>
      )}

      {showSettingsChooser && (
        <div
          role="menu"
          aria-label="Ouvrir les paramètres"
          style={{
            position: 'fixed',
            right: 12,
            bottom: 60,
            width: 236,
            background: tokens.surface,
            borderRadius: tokens.radius,
            border: `1px solid ${tokens.border}`,
            boxShadow: '0 12px 26px rgba(31, 42, 55, 0.16)',
            padding: 10,
            zIndex: 1000,
          }}
        >
          <div
            style={{
              position: 'absolute',
              right: 20,
              bottom: -8,
              width: 14,
              height: 14,
              background: tokens.surface,
              borderRight: `1px solid ${tokens.border}`,
              borderBottom: `1px solid ${tokens.border}`,
              transform: 'rotate(45deg)',
            }}
          />

          <div style={{ fontSize: 12, fontWeight: 700, color: tokens.textSecondary, marginBottom: 8, padding: '0 2px' }}>
            Paramètres
          </div>

          <button
            onClick={openProfileSettingsFromChooser}
            style={{
              width: '100%',
              padding: '10px',
              background: tokens.accentSoftBg,
              color: tokens.accent,
              border: `1px solid ${tokens.accentSoftBorder}`,
              borderRadius: 8,
              fontWeight: 700,
              cursor: 'pointer',
              marginBottom: 6,
              fontSize: 13,
              fontFamily: 'inherit',
              textAlign: 'left',
            }}
          >
            🎨 Profil d'affichage
          </button>

          <button
            onClick={openAiSettingsFromChooser}
            style={{
              width: '100%',
              padding: '10px',
              background: tokens.accentSoftBg,
              color: tokens.accent,
              border: `1px solid ${tokens.accentSoftBorder}`,
              borderRadius: 8,
              fontWeight: 700,
              cursor: 'pointer',
              marginBottom: 6,
              fontSize: 13,
              fontFamily: 'inherit',
              textAlign: 'left',
            }}
          >
            🤖 Moteur IA
          </button>

          <button
            onClick={() => setShowSettingsChooser(false)}
            style={{
              width: '100%',
              padding: '9px',
              background: 'transparent',
              color: tokens.textSecondary,
              border: `1px solid ${tokens.border}`,
              borderRadius: 8,
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 13,
              fontFamily: 'inherit',
            }}
          >
            Fermer
          </button>
        </div>
      )}

      {/* Si l'IA est en train de travailler */}
      {isAnalyzing && (
        <div
          role="status"
          style={{
            padding: 16,
            background: tokens.surface,
            borderRadius: tokens.radius,
            border: `1px solid ${tokens.border}`,
            textAlign: 'center',
            marginBottom: 16,
          }}
        >
          <p style={{ margin: 0, fontWeight: 600, color: tokens.accent, fontSize: 14 }}>
            Lecture et analyse de la page en cours…
          </p>
        </div>
      )}

      {analysisError && !isAnalyzing && (
        <div
          role="alert"
          style={{
            padding: 14,
            background: tokens.errorBg,
            borderRadius: tokens.radius,
            border: `1px solid ${tokens.errorBg}`,
            marginBottom: 16,
            fontSize: 13.5,
            color: tokens.error,
            fontWeight: 600,
          }}
        >
          ⚠ {analysisError}
        </div>
      )}

      {/* RÉSULTATS DE L'ANALYSE */}
      {!isAnalyzing && analysis && (
        <div
          style={{
            padding: 16,
            background: tokens.surface,
            borderRadius: tokens.radius,
            border: `1px solid ${tokens.border}`,
            marginBottom: 16,
          }}
        >
          <h3 style={{ margin: '0 0 8px', fontSize: 15.5, fontWeight: 700, color: tokens.textPrimary }}>
            Résumé de la page
          </h3>
          <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.6, color: tokens.textPrimary }}>
            {analysis.summary}
          </p>

          {analysis.steps && analysis.steps.length > 0 && (
            <>
              <h3 style={{ margin: '0 0 8px', fontSize: 15.5, fontWeight: 700, color: tokens.textPrimary }}>
                Étapes à suivre
              </h3>
              <ul style={{ margin: '0 0 16px', paddingLeft: 20, color: tokens.textPrimary, fontSize: 14, lineHeight: 1.6 }}>
                {analysis.steps.map((step, idx) => <li key={idx} style={{ marginBottom: 6 }}>{step}</li>)}
              </ul>
            </>
          )}

          {/* COORDONNÉES ET CONTACTS */}
          <div style={{ borderTop: `1px solid ${tokens.border}`, paddingTop: 16 }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 15.5, fontWeight: 700, color: tokens.textPrimary }}>
              Coordonnées trouvées
            </h3>
            {[
              ['telephone', '📞', 'Téléphone'], ['email', '✉️', 'Email'],
              ['adresse', '📍', 'Adresse'], ['horaires', '🕒', 'Horaires']
            ].map(([key, icon]) => {
              const value = analysis.contactInfo?.[key as keyof ContactInfo];
              if (!value) return null;
              return (
                <div key={key} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8, fontSize: 14, color: tokens.textPrimary }}>
                  <span aria-hidden="true">{icon}</span> <strong>{value}</strong>
                </div>
              );
            })}
            {analysis.contactInfo?.contactLink && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8, fontSize: 14 }}>
                <span aria-hidden="true">📩</span>
                <a
                  href={analysis.contactInfo.contactLink}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: tokens.accent, fontWeight: 700, textDecoration: 'underline' }}
                >
                  {analysis.contactInfo.contactLabel || 'Page de contact'}
                </a>
              </div>
            )}
            {(!analysis.contactInfo?.telephone && !analysis.contactInfo?.email && !analysis.contactInfo?.contactLink) && (
              <span style={{ fontSize: 13, color: tokens.textSecondary }}>Aucun contact détecté.</span>
            )}
          </div>

          {/* GLOSSAIRE */}
          {analysis.glossary && analysis.glossary.length > 0 && (
            <div style={{ borderTop: `1px solid ${tokens.border}`, paddingTop: 16, marginTop: 12 }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 15.5, fontWeight: 700, color: tokens.textPrimary }}>
                Mots compliqués présents
              </h3>
              <div style={{ background: tokens.bg, padding: '12px 12px 4px 12px', borderRadius: 8 }}>
                {analysis.glossary.map((entry, idx) => (
                  <div key={idx} style={{ marginBottom: 10, fontSize: 13.5, color: tokens.textPrimary, lineHeight: 1.5 }}>
                    <strong style={{ color: tokens.accent }}>{entry.term}</strong> : {entry.definition}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bouton settings — libellé et icône cohérents */}
      <button
        onClick={() => setShowSettingsChooser(true)}
        aria-haspopup="menu"
        aria-expanded={showSettingsChooser}
        style={{
          position: 'fixed',
          right: 12,
          bottom: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          minHeight: 40,
          padding: '0 14px',
          background: tokens.neutralDark,
          color: '#ffffff',
          border: 'none',
          borderRadius: 999,
          fontSize: 13,
          fontWeight: 700,
          fontFamily: 'inherit',
          cursor: 'pointer',
          boxShadow: '0 6px 14px rgba(31, 42, 55, 0.18)',
          zIndex: 999,
        }}
      >
        <span aria-hidden="true">⚙️</span>
        Paramètres
      </button>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><Popup /></React.StrictMode>
);