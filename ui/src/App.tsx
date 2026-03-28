import { useState, useRef, useEffect } from "react";
import "./App.css";

const API_BASE = "http://localhost:8000";

const LANGUAGES = [
  { code: "english", label: "English", flag: "🇬🇧", native: "English" },
  { code: "luganda", label: "Luganda", flag: "🇺🇬", native: "Luganda" },
  { code: "acholi", label: "Acholi", flag: "🇺🇬", native: "Acholi" },
];

const SUGGESTIONS = {
  english: [
    "What programs does COCIS offer?",
    "How do I apply to COCIS?",
    "Who is the Dean of COCIS?",
  ],
  luganda: [
    "COCIS kye ki?",
    "Nsobola ntya okutuuka e COCIS?",
    "Mulimu ki ogufundibwa e COCIS?",
  ],
  acholi: [
    "COCIS en ango?",
    "Amyero donyo i COCIS nining?",
    "Gin aŋo myero opwony i COCIS?",
  ],
};

function TypingIndicator() {
  return (
    <div className="message bot-message typing-message">
      <div className="bot-avatar">
        <CocsisIcon />
      </div>
      <div className="bubble typing-bubble">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
      </div>
    </div>
  );
}

function CocsisIcon() {
  return (
    <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="36" height="36" rx="10" fill="#C2410C" />
      <path
        d="M10 18C10 13.58 13.58 10 18 10C20.39 10 22.55 11.01 24.07 12.65L27 10C24.73 7.57 21.53 6 18 6C11.37 6 6 11.37 6 18C6 24.63 11.37 30 18 30C21.53 30 24.73 28.43 27 26L24.07 23.35C22.55 24.99 20.39 26 18 26C13.58 26 10 22.42 10 18Z"
        fill="#FEF3C7"
      />
      <circle cx="26" cy="18" r="4" fill="#F59E0B" />
    </svg>
  );
}

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState("english");
  const [loading, setLoading] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const langMenuRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Close lang menu on outside click
  useEffect(() => {
    const handler = (e) => {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target)) {
        setLangMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectedLang = LANGUAGES.find((l) => l.code === language);

  const sendMessage = async (text) => {
    const question = text || input.trim();
    if (!question || loading) return;

    setInput("");
    setHasStarted(true);

    const userMsg = { role: "user", text: question, id: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, language }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error ${res.status}`);
      }

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          text: data.answer,
          meta: {
            latency: data.latency_seconds,
            englishQ: data.english_question,
            englishA: data.english_answer,
          },
          id: Date.now() + 1,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          text: "Sorry, I couldn't reach the server. Please try again.",
          error: true,
          id: Date.now() + 1,
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleLangChange = (code) => {
    setLanguage(code);
    setLangMenuOpen(false);
  };

  return (
    <div className="app">
      {/* Decorative background */}
      <div className="bg-pattern" aria-hidden />

      {/* ── Header ── */}
      <header className="header">
        <div className="header-brand">
          <CocsisIcon />
          <div>
            <span className="header-title">COCIS Assistant</span>
            <span className="header-subtitle">
              College of Computing & Information Sciences
            </span>
          </div>
        </div>

        {/* Language selector */}
        <div className="lang-selector" ref={langMenuRef}>
          <button
            className="lang-trigger"
            onClick={() => setLangMenuOpen((v) => !v)}
            aria-label="Select language"
          >
            <span className="lang-flag">{selectedLang.flag}</span>
            <span className="lang-name">{selectedLang.native}</span>
            <svg
              className={`chevron ${langMenuOpen ? "open" : ""}`}
              viewBox="0 0 16 16"
              fill="none"
            >
              <path
                d="M4 6l4 4 4-4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {langMenuOpen && (
            <div className="lang-dropdown">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  className={`lang-option ${lang.code === language ? "active" : ""}`}
                  onClick={() => handleLangChange(lang.code)}
                >
                  <span>{lang.flag}</span>
                  <span>{lang.native}</span>
                  {lang.code === language && (
                    <svg viewBox="0 0 16 16" fill="none" className="check-icon">
                      <path
                        d="M3 8l3.5 3.5L13 5"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* ── Chat area ── */}
      <main className="chat-area">
        {!hasStarted ? (
          <div className="welcome-screen">
            <div className="welcome-icon">
              <CocsisIcon />
            </div>
            <h1 className="welcome-title">Oli otya!</h1>
            <p className="welcome-sub">
              Ask me anything about COCIS — programs, admissions, faculty, and
              more. Choose your language above to get started.
            </p>
            <div className="suggestions">
              {(SUGGESTIONS[language] || SUGGESTIONS.english).map((s, i) => (
                <button
                  key={i}
                  className="suggestion-chip"
                  onClick={() => sendMessage(s)}
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="messages">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`message ${msg.role === "user" ? "user-message" : "bot-message"}`}
              >
                {msg.role === "bot" && (
                  <div className="bot-avatar">
                    <CocsisIcon />
                  </div>
                )}
                <div className={`bubble ${msg.error ? "error-bubble" : ""}`}>
                  <p>{msg.text}</p>
                  {msg.meta && (
                    <span className="meta">{msg.meta.latency.toFixed(2)}s</span>
                  )}
                </div>
              </div>
            ))}
            {loading && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>
        )}
      </main>

      {/* ── Input bar ── */}
      <footer className="input-bar">
        <div className="input-wrap">
          <textarea
            ref={inputRef}
            className="chat-input"
            rows={1}
            placeholder={
              language === "luganda"
                ? "Buuza ekintu..."
                : language === "acholi"
                  ? "Penyo gin mo..."
                  : "Ask something about COCIS..."
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={loading}
          />
          <button
            className={`send-btn ${loading ? "loading" : ""}`}
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            aria-label="Send message"
          >
            {loading ? (
              <svg className="spinner" viewBox="0 0 24 24" fill="none">
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray="40"
                  strokeDashoffset="15"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M22 2L11 13"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M22 2L15 22L11 13L2 9L22 2Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        </div>
        <p className="footer-note">
          Powered by Phi-4 · NLLB-200 · FAISS · Makerere COCIS
        </p>
      </footer>
    </div>
  );
}
