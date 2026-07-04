import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';

type Profile = 'standard' | 'dyslexia' | 'low-vision' | 'anti-epilepsy';
type ContactInfo = { telephone: string; email: string; adresse: string; horaires: string; };

type AnalysisData = {
  summary: string;
  steps: string[];
  glossary: { term: string; definition: string }[];
  contactInfo: ContactInfo;
  voiceFormAvailable: boolean;
  highlightedSelectors: string[];
};

const profiles: Array<{ id: Profile; label: string }> = [
  { id: 'standard', label: 'Standard' },
  { id: 'dyslexia', label: 'Dyslexie' },
  { id: 'low-vision', label: 'Basse vision' },
  { id: 'anti-epilepsy', label: 'Anti-épilepsie' }
];

const Popup = () => {
  const [activeProfile, setActiveProfile] = useState<Profile>('standard');
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [activeUrl, setActiveUrl] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [chatInput, setChatInput] = useState('');
  const [chatReply, setChatReply] = useState('');

  useEffect(() => {
    // Écouter les messages directs (ex: début/fin de l'analyse, réponses du chat)
    const messageListener = (message: any) => {
      if (message.type === 'CHAT_REPLY') setChatReply(message.reply);
      if (message.type === 'ANALYSIS_STARTED') setIsAnalyzing(true);
      if (message.type === 'ANALYSIS_ERROR') {
        setIsAnalyzing(false);
        alert("Une erreur est survenue lors de l'analyse.");
      }
      if (message.type === 'ANALYSIS_COMPLETE') {
        setIsAnalyzing(false);
        // Sécurité : on force la relecture du storage au cas où
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tabUrl = tabs[0]?.url || '';
          const urlKey = `failc:${new URL(tabUrl).href}`;
          chrome.storage.local.get([urlKey], (result) => {
            if (result[urlKey]) setAnalysis(result[urlKey] as AnalysisData);
          });
        });
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);

    // Charger le profil actif au démarrage
    chrome.storage.local.get(['failcProfile'], (result) => {
      setActiveProfile((result.failcProfile as Profile) || 'standard');
    });

    // Récupérer l'URL active et vérifier si une analyse existe déjà pour cette page
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabUrl = tabs[0]?.url || '';
      setActiveUrl(tabUrl);
      if (!tabUrl) return;

      const urlKey = `failc:${new URL(tabUrl).href}`;
      chrome.storage.local.get([urlKey], (result) => {
        if (result[urlKey]) setAnalysis(result[urlKey] as AnalysisData);
      });
    });

    // Écouter les changements dans le stockage pour mettre à jour l'UI automatiquement
    const storageListener = (changes: { [key: string]: chrome.storage.StorageChange }, namespace: string) => {
      if (namespace === 'local' && activeUrl) {
        const urlKey = `failc:${new URL(activeUrl).href}`;
        if (changes[urlKey]) {
          setAnalysis(changes[urlKey].newValue as AnalysisData);
          setIsAnalyzing(false); // L'analyse est terminée
        }
      }
    };
    chrome.storage.onChanged.addListener(storageListener);

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
      chrome.storage.onChanged.removeListener(storageListener);
    };
  }, [activeUrl]);

  // Forcer le mode clair pour la barre latérale
  useEffect(() => {
    const styleId = 'failc-popup-force-style';
    if (document.getElementById(styleId)) return;
    const s = document.createElement('style');
    s.id = styleId;
    s.textContent = `
      html, body, #root { background: #ffffff !important; color: #0f172a !important; margin: 0; padding: 0; }
      * { box-sizing: border-box; }
    `;
    document.head.appendChild(s);
  }, []);

  const applyProfile = (profile: Profile) => {
    setActiveProfile(profile);
    chrome.storage.local.set({ failcProfile: profile });
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (tabId) {
        chrome.tabs.sendMessage(tabId, { type: 'SET_PROFILE', profile }).catch(() => {
          console.log("Le profil sera appliqué au prochain rechargement de la page.");
        });
      }
    });
  };

  const analyzePage = () => {
    setIsAnalyzing(true);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      const tabUrl = tabs[0]?.url || '';
      
      // Bloquer l'analyse sur les pages système de Chrome
      if (tabUrl.startsWith('chrome://') || tabUrl.startsWith('edge://') || tabUrl.startsWith('https://chrome.google.com/webstore')) {
        setIsAnalyzing(false);
        alert("L'analyse n'est pas autorisée sur les pages système ou la boutique d'extensions.");
        return;
      }

      if (tabId) {
        chrome.tabs.sendMessage(tabId, { type: 'ANALYZE_PAGE', source: 'popup' })
          .catch((error) => {
            console.error("Erreur de connexion avec la page :", error);
            setIsAnalyzing(false);
            alert("Impossible de communiquer avec la page. Veuillez actualiser la page web (touche F5) et réessayer.");
          });
      } else {
        setIsAnalyzing(false);
      }
    });
  };

  const askContextualQuestion = () => {
    if (!chatInput.trim()) return;
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (tabId) {
        chrome.tabs.sendMessage(tabId, { type: 'ASK_CONTEXT', question: chatInput })
          .catch(() => {
            alert("La page doit être actualisée (F5) pour pouvoir répondre aux questions.");
          });
      }
    });
  };

  return (
    <div style={{ width: '100%', minHeight: '100vh', padding: 18, fontFamily: 'Arial, sans-serif', background: '#f8fafc', color: '#0f172a' }}>
      
      {/* En-tête */}
      <div style={{ background: 'linear-gradient(135deg, #0b5fff 0%, #2563eb 100%)', color: '#fff', padding: 16, borderRadius: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.9 }}>FAILC Assistant</div>
        <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>Accessibilité Web</div>
        <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.45, opacity: 0.95 }}>Simplification des démarches administratives.</div>
      </div>

      {/* Bouton d'analyse principal */}
      {!analysis && (
        <div style={{ marginBottom: 16, padding: 16, background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <p style={{ margin: '0 0 12px', fontSize: 14, color: '#475569', lineHeight: 1.5 }}>
            Cette page n'a pas encore été analysée. Lancez l'analyse pour en extraire l'essentiel.
          </p>
          <button
            onClick={analyzePage}
            disabled={isAnalyzing}
            style={{ 
              width: '100%', minHeight: 44, borderRadius: 8, border: 'none', 
              background: isAnalyzing ? '#94a3b8' : '#0b5fff', color: '#fff', 
              cursor: isAnalyzing ? 'wait' : 'pointer', fontSize: 15, fontWeight: 700,
              transition: 'background 0.2s'
            }}
          >
            {isAnalyzing ? 'Analyse en cours (IA)...' : 'Analyser cette page'}
          </button>
        </div>
      )}

      {/* Profils d'accessibilité */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>Profils d'affichage</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {profiles.map((profile) => (
            <button
              key={profile.id}
              onClick={() => applyProfile(profile.id)}
              style={{
                minHeight: 40, border: activeProfile === profile.id ? '2px solid #0b5fff' : '1px solid #cbd5e1',
                borderRadius: 8, background: activeProfile === profile.id ? '#eff6ff' : '#ffffff',
                color: activeProfile === profile.id ? '#0b5fff' : '#475569', cursor: 'pointer',
                fontSize: 13, fontWeight: activeProfile === profile.id ? 700 : 500, padding: '8px'
              }}
            >
              {profile.label}
            </button>
          ))}
        </div>
      </div>

      {/* Résultats de l'analyse */}
      {isAnalyzing && analysis && (
        <div style={{ padding: 12, background: '#fef08a', color: '#854d0e', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600, textAlign: 'center' }}>
          Mise à jour de l'analyse en cours...
        </div>
      )}

      {analysis && (
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
          
          <h3 style={{ margin: '0 0 8px', fontSize: 16, color: '#0f172a' }}>Résumé de la page</h3>
          <div style={{ padding: 12, background: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: '#334155' }}>{analysis.summary}</p>
          </div>

          {analysis.steps && analysis.steps.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ margin: '0 0 8px', fontSize: 16, color: '#0f172a' }}>Étapes à suivre</h3>
              <ul style={{ margin: 0, paddingLeft: 20, color: '#334155', fontSize: 14, lineHeight: 1.5 }}>
                {analysis.steps.map((step, idx) => <li key={idx} style={{ marginBottom: 6 }}>{step}</li>)}
              </ul>
            </div>
          )}

          <h3 style={{ margin: '0 0 8px', fontSize: 16, color: '#0f172a' }}>Coordonnées trouvées</h3>
          <div style={{ background: '#ffffff', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 16 }}>
            {[
              ['telephone', '📞', 'Téléphone'], ['email', '✉️', 'Email'],
              ['adresse', '📍', 'Adresse'], ['horaires', '🕒', 'Horaires']
            ].map(([key, icon, label]) => {
              const value = analysis.contactInfo?.[key as keyof ContactInfo];
              if (!value) return null;
              return (
                <div key={key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8, fontSize: 14, color: '#334155' }}>
                  <span>{icon}</span>
                  <div><strong style={{ display: 'block', fontSize: 12, color: '#64748b' }}>{label}</strong>{value}</div>
                </div>
              );
            })}
            {(!analysis.contactInfo?.telephone && !analysis.contactInfo?.email && !analysis.contactInfo?.adresse) && (
              <span style={{ fontSize: 13, color: '#64748b' }}>Aucune coordonnée détectée sur cette page.</span>
            )}
          </div>

          {analysis.glossary && analysis.glossary.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ margin: '0 0 8px', fontSize: 16, color: '#0f172a' }}>Mots compliqués expliqués</h3>
              <div style={{ background: '#ffffff', padding: '12px 12px 4px 12px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                {analysis.glossary.map((entry, idx) => (
                  <div key={idx} style={{ marginBottom: 8, fontSize: 13, color: '#334155', lineHeight: 1.4 }}>
                    <strong style={{ color: '#0b5fff' }}>{entry.term}</strong> : {entry.definition}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Chat contextuel */}
          <div style={{ marginTop: 24, padding: 12, background: '#f1f5f9', borderRadius: 8 }}>
            <strong style={{ display: 'block', marginBottom: 8, fontSize: 14, color: '#0f172a' }}>Une question sur cette page ?</strong>
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              style={{ width: '100%', minHeight: 38, border: '1px solid #cbd5e1', borderRadius: 6, padding: '8px 12px', marginBottom: 8, fontSize: 14 }}
              placeholder="Ex: Que dois-je remplir en premier ?"
            />
            <button onClick={askContextualQuestion} style={{ width: '100%', minHeight: 38, borderRadius: 6, border: 'none', background: '#0b5fff', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
              Demander à l'IA
            </button>
            {chatReply && (
              <div style={{ marginTop: 12, padding: 10, background: '#ffffff', borderLeft: '3px solid #0b5fff', borderRadius: 4, fontSize: 13, color: '#334155', lineHeight: 1.5 }}>
                {chatReply}
              </div>
            )}
          </div>

          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button onClick={analyzePage} disabled={isAnalyzing} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 12, textDecoration: 'underline', cursor: isAnalyzing ? 'wait' : 'pointer' }}>
              Relancer l'analyse de la page
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><Popup /></React.StrictMode>
);