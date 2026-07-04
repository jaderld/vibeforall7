import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';

type Profile = 'standard' | 'dyslexia' | 'low-vision' | 'anti-epilepsy';
type AIProvider = 'openai' | 'gemini';
type ContactInfo = { telephone: string; email: string; adresse: string; horaires: string; };

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
  const [hasModifiedPage, setHasModifiedPage] = useState<boolean>(false);

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
        // 🔴 CORRECTION : On met à jour l'affichage immédiatement avec les données reçues
        if (message.data) {
          setAnalysis(message.data);
          setAnalysisError('');
        }
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);

    // 2. Initialisation : chargement du profil
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

    // 3. Chargement du cache d'analyse de la page courante
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

  // Déclencheur manuel (au cas où l'automatique échoue)
  const analyzePageManually = () => {
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
    chrome.storage.local.get([PROFILE_STORAGE_KEYS.settingsDone], (result) => {
      const wasFirstChoice = !Boolean(result[PROFILE_STORAGE_KEYS.settingsDone]);

      chrome.storage.local.set({ [PROFILE_STORAGE_KEYS.settingsDone]: true }, () => {
        setShowProfileSettings(false);
        setProfileStatus('Profil d\'affichage enregistré.');
        window.setTimeout(() => setProfileStatus(''), 2500);

        if (wasFirstChoice) {
          analyzePageManually();
        }
      });
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
      [AI_STORAGE_KEYS.openaiKey]: openAiApiKey.trim(),
      [AI_STORAGE_KEYS.geminiKey]: geminiApiKey.trim(),
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

  const triggerPageModifications = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'MODIFY_PAGE' }).catch(() => {
          alert("Veuillez actualiser la page (F5) pour appliquer les modifications.");
        });
        setHasModifiedPage(true);
      }
    });
  };

  return (
    <div style={{ width: '100%', minHeight: '100vh', padding: 18, paddingBottom: 72, fontFamily: 'Arial, sans-serif', background: '#f8fafc', color: '#0f172a' }}>
      
      {/* En-tête */}
      <div style={{ background: 'linear-gradient(135deg, #0b5fff 0%, #2563eb 100%)', color: '#fff', padding: 16, borderRadius: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.9 }}>FAILC Assistant</div>
        <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>Accessibilité Web</div>
      </div>

      {/* Profils d'affichage */}
      {showProfileSettings && (
        <div style={{ marginBottom: 16, padding: 16, background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>Profils d'affichage (Visuel)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {profiles.map((profile) => (
              <button
                key={profile.id}
                onClick={() => applyProfile(profile.id)}
                style={{
                  minHeight: 40, border: activeProfile === profile.id ? '2px solid #0b5fff' : '1px solid #cbd5e1',
                  borderRadius: 8, background: activeProfile === profile.id ? '#eff6ff' : '#ffffff',
                  color: activeProfile === profile.id ? '#0b5fff' : '#475569', cursor: 'pointer',
                  fontSize: 13, fontWeight: activeProfile === profile.id ? 700 : 500
                }}
              >
                {profile.label}
              </button>
            ))}
          </div>

          <button
            onClick={saveProfileSettings}
            style={{ width: '100%', padding: '12px', background: '#0b5fff', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', marginTop: 12 }}
          >
            Valider ce profil
          </button>

          {profileStatus && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#16a34a', fontWeight: 700 }}>
              {profileStatus}
            </div>
          )}
        </div>
      )}

      {/* Choix du moteur IA */}
      {showAiSettings && (
        <div style={{ marginBottom: 16, padding: 16, background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>Moteur IA</div>
          <>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
              Fournisseur
            </label>
            <select
              value={aiProvider}
              onChange={(event) => setAiProvider(event.target.value as AIProvider)}
              style={{ width: '100%', minHeight: 40, borderRadius: 8, border: '1px solid #cbd5e1', padding: '0 10px', marginBottom: 10 }}
            >
              {aiProviders.map((provider) => (
                <option key={provider.id} value={provider.id}>{provider.label}</option>
              ))}
            </select>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
              {aiProviders.find((provider) => provider.id === aiProvider)?.note}
            </p>

            {aiProvider === 'openai' && (
              <>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                  Clé API OpenAI
                </label>
                <input
                  type="password"
                  value={openAiApiKey}
                  onChange={(event) => setOpenAiApiKey(event.target.value)}
                  placeholder="sk-..."
                  style={{ width: '100%', minHeight: 40, borderRadius: 8, border: '1px solid #cbd5e1', padding: '0 10px', marginBottom: 12 }}
                />
              </>
            )}

            {aiProvider === 'gemini' && (
              <>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                  Clé API Gemini
                </label>
                <input
                  type="password"
                  value={geminiApiKey}
                  onChange={(event) => setGeminiApiKey(event.target.value)}
                  placeholder="AIza..."
                  style={{ width: '100%', minHeight: 40, borderRadius: 8, border: '1px solid #cbd5e1', padding: '0 10px', marginBottom: 12 }}
                />
              </>
            )}

            <button onClick={saveAiSettings} style={{ width: '100%', padding: '12px', background: '#0b5fff', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
              Enregistrer le moteur IA
            </button>
          </>
          {aiStatus && (
            <div style={{ marginTop: 10, fontSize: 12, color: aiStatus.includes('Veuillez') ? '#dc2626' : '#16a34a', fontWeight: 700 }}>
              {aiStatus}
            </div>
          )}
        </div>
      )}

      {showSettingsChooser && (
        <div
          style={{
            position: 'fixed',
            right: 12,
            bottom: 56,
            width: 230,
            background: '#ffffff',
            borderRadius: 12,
            border: '1px solid #e2e8f0',
            boxShadow: '0 14px 30px rgba(15, 23, 42, 0.22)',
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
              background: '#ffffff',
              borderRight: '1px solid #e2e8f0',
              borderBottom: '1px solid #e2e8f0',
              transform: 'rotate(45deg)',
            }}
          />

          <div style={{ fontSize: 12, fontWeight: 800, color: '#334155', marginBottom: 8 }}>
            Ouvrir les settings
          </div>

          <button
            onClick={openProfileSettingsFromChooser}
            style={{ width: '100%', padding: '9px', background: '#0b5fff', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', marginBottom: 6, fontSize: 12 }}
          >
            Profil d'affichage
          </button>

          <button
            onClick={openAiSettingsFromChooser}
            style={{ width: '100%', padding: '9px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', marginBottom: 6, fontSize: 12 }}
          >
            Moteur IA
          </button>

          <button
            onClick={() => setShowSettingsChooser(false)}
            style={{ width: '100%', padding: '8px', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 12 }}
          >
            Fermer
          </button>
        </div>
      )}

      {/* Si l'IA est en train de travailler */}
      {isAnalyzing && (
        <div style={{ padding: 16, background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', textAlign: 'center', marginBottom: 16 }}>
          <p style={{ margin: 0, fontWeight: 600, color: '#0b5fff' }}>Lecture et analyse de la page par l'IA...</p>
        </div>
      )}

      <button
        onClick={analyzePageManually}
        aria-label="Relancer l'analyse de la page"
        title="Relancer l'analyse"
        style={{
          position: 'fixed',
          left: 12,
          top: 12,
          width: 40,
          height: 40,
          borderRadius: 999,
          border: 'none',
          background: '#0b5fff',
          color: '#ffffff',
          fontSize: 18,
          fontWeight: 800,
          cursor: 'pointer',
          boxShadow: '0 6px 16px rgba(15, 23, 42, 0.24)',
          zIndex: 1000,
        }}
      >
        ↻
      </button>

      {/* Si l'analyse est absente (ex: erreur auto) */}
      {!isAnalyzing && !analysis && (
        <div style={{ padding: 16, background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 14, color: '#475569', lineHeight: 1.4 }}>Aucune analyse disponible pour cette page.</p>
        </div>
      )}

      {/* RÉSULTATS DE L'ANALYSE */}
      {!isAnalyzing && analysis && (
        <div style={{ padding: 16, background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 16 }}>
          
          <h3 style={{ margin: '0 0 8px', fontSize: 16, color: '#0f172a' }}>Résumé de la page</h3>
          <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.5, color: '#334155' }}>{analysis.summary}</p>
          
          {analysis.steps && analysis.steps.length > 0 && (
            <>
              <h3 style={{ margin: '0 0 8px', fontSize: 16, color: '#0f172a' }}>Étapes à suivre</h3>
              <ul style={{ margin: '0 0 16px', paddingLeft: 20, color: '#334155', fontSize: 14, lineHeight: 1.5 }}>
                {analysis.steps.map((step, idx) => <li key={idx} style={{ marginBottom: 6 }}>{step}</li>)}
              </ul>
            </>
          )}

          {/* LE BOUTON POUR MODIFIER LA PAGE */}
          <button 
            onClick={triggerPageModifications} 
            disabled={hasModifiedPage}
            style={{ 
              width: '100%', minHeight: 44, borderRadius: 8, border: 'none', 
              background: hasModifiedPage ? '#22c55e' : '#f97316', 
              color: '#fff', cursor: hasModifiedPage ? 'default' : 'pointer', 
              fontSize: 14, fontWeight: 700, marginBottom: 16
            }}
          >
            {hasModifiedPage ? '✓ Page adaptée avec succès' : 'Surligner & Simplifier la page web'}
          </button>

          {/* COORDONNÉES ET CONTACTS */}
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, color: '#0f172a' }}>Coordonnées trouvées</h3>
            {[
              ['telephone', '📞', 'Téléphone'], ['email', '✉️', 'Email'],
              ['adresse', '📍', 'Adresse'], ['horaires', '🕒', 'Horaires']
            ].map(([key, icon, label]) => {
              const value = analysis.contactInfo?.[key as keyof ContactInfo];
              if (!value) return null;
              return (
                <div key={key} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8, fontSize: 14, color: '#334155' }}>
                  <span>{icon}</span> <strong>{value}</strong>
                </div>
              );
            })}
            {(!analysis.contactInfo?.telephone && !analysis.contactInfo?.email) && (
              <span style={{ fontSize: 13, color: '#64748b' }}>Aucun contact détecté.</span>
            )}
          </div>

          {/* GLOSSAIRE (Mots compliqués détectés) */}
          {analysis.glossary && analysis.glossary.length > 0 && (
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16, marginTop: 12 }}>
              <h3 style={{ margin: '0 0 8px', fontSize: 16, color: '#0f172a' }}>Mots compliqués présents</h3>
              <div style={{ background: '#f1f5f9', padding: '12px 12px 4px 12px', borderRadius: 8 }}>
                {analysis.glossary.map((entry, idx) => (
                  <div key={idx} style={{ marginBottom: 8, fontSize: 13, color: '#334155', lineHeight: 1.4 }}>
                    <strong style={{ color: '#0b5fff' }}>{entry.term}</strong> : {entry.definition}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button onClick={analyzePageManually} disabled={isAnalyzing} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 12, textDecoration: 'underline', cursor: 'pointer' }}>
              Relancer l'analyse IA
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => {
          setShowSettingsChooser(true);
        }}
        style={{
          position: 'fixed',
          right: 12,
          bottom: 12,
          minHeight: 36,
          padding: '0 12px',
          background: '#0f172a',
          color: '#ffffff',
          border: 'none',
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 6px 16px rgba(15, 23, 42, 0.24)',
          zIndex: 999,
        }}
      >
        Settings
      </button>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><Popup /></React.StrictMode>
);