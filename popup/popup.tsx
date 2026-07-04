import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';

type Profile = 'standard' | 'dyslexia' | 'low-vision' | 'anti-epilepsy';
type ContactInfo = {
  telephone: string;
  email: string;
  adresse: string;
  horaires: string;
};

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
  const [chatInput, setChatInput] = useState('');
  const [chatReply, setChatReply] = useState('');

  useEffect(() => {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'CHAT_REPLY') {
        setChatReply(message.reply);
      }
    });

    chrome.storage.local.get(['failcProfile'], (result) => {
      setActiveProfile((result.failcProfile as Profile) || 'standard');
    });

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabUrl = tabs[0]?.url || '';
      setActiveUrl(tabUrl);
      if (!tabUrl) return;
      const urlKey = new URL(tabUrl).href;
      chrome.storage.local.get([`failc:${urlKey}`], (result) => {
        const data = result[`failc:${urlKey}`] as AnalysisData | undefined;
        setAnalysis(data || null);
      });
      chrome.tabs.sendMessage(tabs[0].id!, { type: 'ANALYZE_PAGE', source: 'popup' });
    });
  }, []);

  // Force high-contrast styles for the popup to avoid pale/grey text on white backgrounds
  useEffect(() => {
    const styleId = 'failc-popup-force-style';
    if (document.getElementById(styleId)) return;
    const s = document.createElement('style');
    s.id = styleId;
    s.textContent = `
      html, body, #root { background: #ffffff !important; color: #0f172a !important; }
      #root * { color: #0f172a !important; }
      input, textarea { color: #0f172a !important; background: #ffffff !important; }
      button { color: #0f172a !important; }
      .failc-strong { color: #0f172a !important; font-weight: 800 !important; }
    `;
    document.head.appendChild(s);
  }, []);

  const applyProfile = (profile: Profile) => {
    setActiveProfile(profile);
    chrome.storage.local.set({ failcProfile: profile });
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'SET_PROFILE', profile });
      }
    });
  };

  const analyzePage = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'ANALYZE_PAGE', source: 'popup' });
      }
    });
  };

  const askContextualQuestion = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'ASK_CONTEXT', question: chatInput });
      }
    });
  };

  const replaceForm = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const id = tabs[0]?.id;
      if (!id) return;
      chrome.tabs.sendMessage(id, { type: 'APPLY_REWRITE' });
    });
  };

  return (
    <div style={{ width: 360, minHeight: '100vh', padding: 18, fontFamily: 'Arial, sans-serif', background: '#f8fafc', color: '#0f172a', boxSizing: 'border-box' }}>
      <div style={{ background: '#111827', color: '#fff', padding: 14, borderRadius: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.9 }}>Chrome / FAILC</div>
        <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>Assistant d’accessibilité</div>
      </div>
      <div style={{ background: 'linear-gradient(135deg, #0b5fff 0%, #2563eb 100%)', color: '#fff', padding: 14, borderRadius: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.9 }}>FAILC Assistant</div>
        <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>Adaptation d’accessibilité</div>
        <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.45 }}>Ce panneau est destiné à simplifier la lecture et améliorer l’accessibilité sur la page ouverte.</div>
      </div>
      <div style={{ marginBottom: 12, padding: 12, border: '2px solid #0b5fff', borderRadius: 10, background: '#ffffff' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#111827', marginBottom: 8 }}>Profils d’accessibilité</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {profiles.map((profile) => (
            <button
              key={profile.id}
              onClick={() => applyProfile(profile.id)}
              style={{
                minHeight: 44,
                border: activeProfile === profile.id ? '2px solid #0b5fff' : '1px solid #111827',
                borderRadius: 8,
                background: activeProfile === profile.id ? '#0b5fff' : '#ffffff',
                color: activeProfile === profile.id ? '#ffffff' : '#111827',
                cursor: 'pointer',
                fontSize: 15,
                fontWeight: 800,
                padding: '10px 12px',
                textAlign: 'left'
              }}
            >
              {profile.label}
            </button>
          ))}
        </div>
      </div>
      <p style={{ marginTop: 0, marginBottom: 12, fontSize: 13, color: '#111827', lineHeight: 1.45, wordBreak: 'break-all' }}>{activeUrl ? activeUrl : 'Aucune page active'}</p>
      <div style={{ borderTop: '1px solid #ddd', paddingTop: 12 }}>
        {analysis ? (
          <>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, color: '#0f172a' }}>Résumé intelligent</h3>
            <p style={{ margin: '0 0 8px', fontSize: 14, lineHeight: 1.5, color: '#111827' }}>{analysis.summary}</p>
            {analysis.steps.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <strong style={{ color: '#0f172a' }}>À faire</strong>
                <ul style={{ margin: '4px 0 0 16px', padding: 0, color: '#111827' }}>
                  {analysis.steps.map((step) => <li key={step} style={{ marginBottom: 4 }}>{step}</li>)}
                </ul>
              </div>
            )}
            <h3 style={{ margin: '10px 0 8px', fontSize: 16, color: '#0f172a' }}>Coordonnées de ce site</h3>
            {[
              ['telephone', '📞'],
              ['email', '✉️'],
              ['adresse', '📍'],
              ['horaires', '🕒']
            ].map(([key, icon]) => {
              const value = analysis.contactInfo[key as keyof ContactInfo];
              if (!value) return null;
              return (
                <div key={key} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, fontSize: 14, color: '#111827' }}>
                  <span>{icon}</span>
                  <span>{value}</span>
                </div>
              );
            })}
            {analysis.glossary.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <h4 style={{ margin: '0 0 6px', fontSize: 15, color: '#0f172a' }}>Termes expliqués</h4>
                {analysis.glossary.map((entry) => (
                  <div key={entry.term} style={{ marginBottom: 6, fontSize: 13, color: '#111827' }}>
                    <strong>{entry.term}</strong> : {entry.definition}
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 10 }}>
              <strong style={{ color: '#0f172a' }}>Guide rapide</strong>
              <div style={{ fontSize: 13, marginTop: 4, color: '#111827' }}>{analysis.highlightedSelectors.length > 0 ? analysis.highlightedSelectors.join(', ') : 'Aucun repère particulier détecté.'}</div>
            </div>
            <div style={{ marginTop: 10 }}>
              <input
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                style={{ width: '100%', minHeight: 36, border: '1px solid #111827', borderRadius: 6, padding: '8px 10px', marginBottom: 6, color: '#111827', background: '#fff' }}
                placeholder="Posez une question sur cette page"
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={askContextualQuestion} style={{ minHeight: 40, flex: 1, borderRadius: 8, border: '1px solid #0b5fff', background: '#0b5fff', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>
                  Demander à FAILC
                </button>
                <button onClick={replaceForm} style={{ minHeight: 40, flex: 1, borderRadius: 8, border: '1px solid #d1d5db', background: '#ffffff', color: '#0f172a', cursor: 'pointer', fontWeight: 700 }}>
                  Remplacer la forme
                </button>
              </div>
              {chatReply ? <p style={{ fontSize: 13, marginTop: 6, color: '#0f172a' }}>{chatReply}</p> : null}
            </div>
          </>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            <p style={{ margin: 0, fontSize: 14 }}>Cette page n'a pas encore été analysée par FAILC</p>
            <button
              onClick={analyzePage}
              style={{ minHeight: 44, borderRadius: 8, border: '1px solid #0b5fff', background: '#0b5fff', color: '#fff', cursor: 'pointer', fontSize: 15, fontWeight: 700 }}
            >
              Analyser cette page maintenant
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><Popup /></React.StrictMode>
);
