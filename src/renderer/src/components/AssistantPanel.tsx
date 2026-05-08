import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bot,
  Send,
  X,
  Eye,
  EyeOff,
  Trash2,
  AlertTriangle,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { USAGE_MD } from '../data/usageContent';

const KEY_STORAGE = 'forge.assistant.openaiKey';
const MODEL_STORAGE = 'forge.assistant.model';
const HISTORY_STORAGE = 'forge.assistant.history';
const DEFAULT_MODEL = 'gpt-4o-mini';

const MODELS = [
  { id: 'gpt-4o-mini', label: 'gpt-4o-mini', sub: 'fast, very cheap (~$0.0001/q)' },
  { id: 'gpt-4o', label: 'gpt-4o', sub: 'smarter, ~10x more expensive' },
];

type Role = 'user' | 'assistant' | 'system';
interface ChatMsg {
  role: Role;
  content: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  currentTab?: string; // injected into the system prompt for context
}

const SYSTEM_PROMPT = (currentTab?: string) => `You are the **Forge Assistant** — a helpful, concise support agent embedded in the Forge desktop app. You have ONE job: help people use Forge to process images and videos in bulk.

## What Forge is
Forge is an open-source desktop app (Electron + React) for bulk media processing. It runs entirely on the user's machine. Four tools:
- **Image upscale** — Real-ESRGAN AI on the GPU (Lanczos fallback). Makes images bigger.
- **Image compress** — Sharp/libvips. Shrinks files, converts formats (HEIC → JPEG works), strips/rewrites metadata.
- **Video upscale** — Real-ESRGAN per frame + FFmpeg. Slow, heavy. Audio preserved.
- **Video compress** — Single-pass FFmpeg H.264. Fast. Optional resolution downscale.

## Behavior rules
1. **Be concise.** 2–4 short sentences for most answers. Bullets when listing options.
2. **Match the user's level.** If they ask "what's CRF?", explain plainly. If they ask "what preset for VBR?", be technical.
3. **Always recommend the right tab/tool** when answering. If they want smaller files, point at compress. If sharper/bigger, point at upscale.
4. **HEIC iPhone photos**: tell them to use Image compress with output format JPEG, quality 85. This is the canonical workflow.
5. **Speed worries**: video upscale is genuinely slow (minutes per second of footage at 4×). Set realistic expectations.
6. **If asked something Forge can't do**, say so plainly. Suggest alternatives if obvious.
7. **Never make up features.** Only reference what exists in the manual.
8. **Never claim to do things**: you can't drop files for them, click buttons, or trigger jobs. You can only explain.
${currentTab ? `\n## Current context\nThe user is currently on the **${currentTab}** tab. Bias your answers toward that workflow when relevant.` : ''}

## The full manual (your knowledge base)
${USAGE_MD}`;

export function AssistantPanel({ open, onClose, currentTab }: Props) {
  const [apiKey, setApiKey] = useState<string>('');
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const [keyVisible, setKeyVisible] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load persisted state on mount
  useEffect(() => {
    try {
      setApiKey(localStorage.getItem(KEY_STORAGE) ?? '');
      setModel(localStorage.getItem(MODEL_STORAGE) ?? DEFAULT_MODEL);
      const hist = localStorage.getItem(HISTORY_STORAGE);
      if (hist) setMessages(JSON.parse(hist) as ChatMsg[]);
    } catch { /* localStorage unavailable */ }
  }, []);

  // Persist message history
  useEffect(() => {
    if (messages.length === 0) return;
    try {
      localStorage.setItem(HISTORY_STORAGE, JSON.stringify(messages.slice(-30)));
    } catch { /* ignore */ }
  }, [messages]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streaming]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  // ESC closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const saveKey = () => {
    const trimmed = keyDraft.trim();
    if (!trimmed) return;
    try { localStorage.setItem(KEY_STORAGE, trimmed); } catch { /* ignore */ }
    setApiKey(trimmed);
    setKeyDraft('');
    setShowSettings(false);
  };

  const clearKey = () => {
    try { localStorage.removeItem(KEY_STORAGE); } catch { /* ignore */ }
    setApiKey('');
  };

  const setModelPersisted = (m: string) => {
    setModel(m);
    try { localStorage.setItem(MODEL_STORAGE, m); } catch { /* ignore */ }
  };

  const clearHistory = () => {
    setMessages([]);
    try { localStorage.removeItem(HISTORY_STORAGE); } catch { /* ignore */ }
  };

  const send = async () => {
    const trimmed = input.trim();
    if (!trimmed || streaming || !apiKey) return;

    const next: ChatMsg[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(next);
    setInput('');
    setError(null);
    setStreaming(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      // Trim conversation to last 12 turns to stay cheap and fast
      const trimmedHistory = next.slice(-12);
      const apiMessages = [
        { role: 'system', content: SYSTEM_PROMPT(currentTab) },
        ...trimmedHistory,
      ];

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: apiMessages,
          stream: true,
          temperature: 0.4,
        }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        throw new Error(`OpenAI ${res.status}: ${text.slice(0, 240) || res.statusText}`);
      }

      // Add empty assistant placeholder we'll fill as tokens stream in
      setMessages((m) => [...m, { role: 'assistant', content: '' }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE format: lines starting with "data: "
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine.startsWith('data: ')) continue;
          const payload = trimmedLine.slice(6);
          if (payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload);
            const delta: string = json.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              setMessages((m) => {
                const last = m[m.length - 1];
                if (!last || last.role !== 'assistant') return m;
                const updated = [...m];
                updated[m.length - 1] = { ...last, content: last.content + delta };
                return updated;
              });
            }
          } catch { /* skip malformed chunks */ }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setMessages((m) => {
          const last = m[m.length - 1];
          if (last?.role === 'assistant' && last.content === '') return m.slice(0, -1);
          return m;
        });
      } else {
        const msg = (err as Error).message;
        setError(msg);
        // Roll back the empty assistant placeholder if request never produced content
        setMessages((m) => {
          const last = m[m.length - 1];
          if (last?.role === 'assistant' && last.content === '') return m.slice(0, -1);
          return m;
        });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const stopStream = () => {
    abortRef.current?.abort();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const needsKey = !apiKey;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="assistant-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 z-[58] bg-black/40 backdrop-blur-sm"
          />
          <motion.aside
            key="assistant-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="fixed inset-y-0 right-0 z-[59] w-[min(440px,100%)] glass-strong border-l border-white/[0.08] flex flex-col"
            role="complementary"
            aria-label="Forge assistant"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary-gradient-soft border border-forge-primary/30 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-forge-primaryHi" />
                </div>
                <div>
                  <div className="text-[13px] font-semibold text-forge-text">Forge Assistant</div>
                  <div className="text-[10.5px] text-forge-mute">
                    {needsKey ? 'API key required' : `OpenAI · ${model}`}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button
                    onClick={clearHistory}
                    className="btn-icon"
                    title="Clear chat history"
                    aria-label="Clear chat history"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => setShowSettings((s) => !s)}
                  data-active={showSettings}
                  className="btn-icon data-[active=true]:text-forge-primaryHi data-[active=true]:bg-white/[0.05]"
                  title="Settings"
                  aria-label="Assistant settings"
                >
                  <Eye className="w-4 h-4" />
                </button>
                <button onClick={onClose} className="btn-icon" title="Close (Esc)">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Privacy / setup notice */}
            {(needsKey || showSettings) && (
              <div className="px-5 py-4 border-b border-white/[0.06] bg-black/20 space-y-3 shrink-0">
                {needsKey && (
                  <div className="flex items-start gap-2 text-[12px] text-amber-200/85 leading-relaxed">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                    <div>
                      The assistant sends your messages to <strong>OpenAI</strong> (not to us). It needs your own
                      API key. Forge stores the key only on this device — it never leaves except in the
                      direct API calls you make.
                      <button
                        onClick={() =>
                          window.forge.openExternal('https://platform.openai.com/api-keys')
                        }
                        className="inline-flex items-center gap-1 ml-1 text-forge-primaryHi hover:underline"
                      >
                        Get a key <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <label className="label-eyebrow">OpenAI API key</label>
                  {apiKey ? (
                    <div className="flex items-center gap-2">
                      <code className="input-base flex-1 text-[12px] flex items-center font-mono text-forge-text/80">
                        {keyVisible ? apiKey : `sk-···${apiKey.slice(-6)}`}
                      </code>
                      <button
                        onClick={() => setKeyVisible((v) => !v)}
                        className="btn-icon"
                        title={keyVisible ? 'Hide' : 'Show'}
                      >
                        {keyVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button onClick={clearKey} className="btn-icon" title="Remove key">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        type="password"
                        className="input-base flex-1 font-mono text-[12px]"
                        placeholder="sk-..."
                        value={keyDraft}
                        onChange={(e) => setKeyDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveKey();
                        }}
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <button onClick={saveKey} disabled={!keyDraft.trim()} className="btn-primary">
                        Save
                      </button>
                    </div>
                  )}
                </div>

                {showSettings && (
                  <div>
                    <label className="label-eyebrow">Model</label>
                    <div className="flex flex-col gap-1.5">
                      {MODELS.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => setModelPersisted(m.id)}
                          data-active={model === m.id}
                          className="text-left p-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] data-[active=true]:bg-primary-gradient-soft data-[active=true]:border-forge-primary/40 transition-colors"
                        >
                          <div className="text-[12.5px] font-semibold text-forge-text">{m.label}</div>
                          <div className="text-[11px] text-forge-text/55">{m.sub}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
              {messages.length === 0 && !needsKey && (
                <Suggestions
                  onPick={(s) => {
                    setInput(s);
                    setTimeout(() => inputRef.current?.focus(), 0);
                  }}
                />
              )}
              {messages.map((m, i) => (
                <Message key={i} role={m.role} content={m.content} />
              ))}
              {streaming && messages[messages.length - 1]?.role !== 'assistant' && (
                <div className="flex items-center gap-2 text-[12px] text-forge-mute">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Thinking…
                </div>
              )}
              {error && (
                <div className="text-[12px] text-rose-300/90 bg-rose-500/10 border border-rose-400/20 rounded-lg p-3 leading-relaxed">
                  <strong>Request failed:</strong> {error}
                </div>
              )}
            </div>

            {/* Composer */}
            <div className="border-t border-white/[0.06] p-3 shrink-0">
              <div className="relative">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  disabled={needsKey || streaming}
                  rows={2}
                  placeholder={
                    needsKey
                      ? 'Add an API key above to start chatting'
                      : 'Ask anything — "How do I convert HEIC photos?"'
                  }
                  className="input-base !h-auto py-2.5 pr-11 resize-none text-[13px] leading-snug"
                />
                <button
                  onClick={streaming ? stopStream : send}
                  disabled={(!streaming && (!input.trim() || needsKey))}
                  className="absolute right-2 bottom-2 w-8 h-8 rounded-md flex items-center justify-center bg-primary-gradient text-white disabled:opacity-30 disabled:cursor-not-allowed hover:filter hover:brightness-110 transition-all"
                  title={streaming ? 'Stop generating' : 'Send (Enter)'}
                >
                  {streaming ? <X className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
              <div className="text-[10px] text-forge-text/40 mt-2 leading-relaxed">
                Enter to send · Shift+Enter for newline · ESC to close
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Message({ role, content }: { role: Role; content: string }) {
  if (role === 'system') return null;
  const isUser = role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[88%] rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-primary-gradient text-white shadow-primarySoft'
            : 'bg-white/[0.04] border border-white/[0.06] text-forge-text/90'
        }`}
      >
        {content || <span className="text-forge-text/40 italic">…</span>}
      </div>
    </div>
  );
}

function Suggestions({ onPick }: { onPick: (s: string) => void }) {
  const items = [
    'How do I convert iPhone HEIC photos to JPEG?',
    'Which model should I use to upscale a screenshot?',
    'My video file is too big — what tab do I use?',
    "What's a good CRF for compressing a 4K phone video?",
    'Why is video upscale so slow?',
  ];
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider3 text-forge-mute font-semibold mb-3">
        Try asking
      </div>
      <div className="space-y-1.5">
        {items.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="w-full text-left p-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:border-forge-primary/40 hover:bg-primary-gradient-soft transition-colors text-[12.5px] text-forge-text/85"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
