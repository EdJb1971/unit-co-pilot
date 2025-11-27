import React, { useState, useEffect } from 'react';
import { ChatTranscript } from '../types';
import { saveChatTranscript } from '../services/storageService';
import { chatAssistant } from '../services/geminiService';

interface ChatModalProps {
  date: string;
  slotId: string;
  initialTranscript?: ChatTranscript | null;
  onClose: () => void;
  // onPropose now accepts options: { allowPersonalization }
  onPropose: (transcript: ChatTranscript, options?: { allowPersonalization?: boolean }) => Promise<void>;
}

const QuickPromptBtn: React.FC<{ text: string; onClick: () => void }> = ({ text, onClick }) => (
  <button onClick={onClick} className="bg-slate-100 px-3 py-1 rounded-md text-sm">{text}</button>
);

const ChatModal: React.FC<ChatModalProps> = ({ date, slotId, initialTranscript, onClose, onPropose }) => {
  const [transcript, setTranscript] = useState<ChatTranscript>(initialTranscript || {
    id: `${date}_${slotId}`,
    date,
    slotId,
    messages: [],
    lastModified: Date.now()
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [allowPersonalization, setAllowPersonalization] = useState(true);
  const [lastSaved, setLastSaved] = useState<number | null>(transcript.lastModified || null);

  useEffect(() => {
    // update local transcript if initialTranscript changes
    if (initialTranscript) setTranscript(initialTranscript);
  }, [initialTranscript]);

  const persist = (next: ChatTranscript) => {
    try {
      saveChatTranscript(next.date, next.slotId, next);
      setLastSaved(Date.now());
    } catch (_) { /* ignore save failures */ }
  };

  const addMessage = (text: string) => {
    if (!text || !String(text).trim()) return;
    const msg = { id: Math.random().toString(36).slice(2), role: 'nurse' as const, text: String(text).trim(), ts: Date.now() };
    const next = { ...transcript, messages: [...transcript.messages, msg], lastModified: Date.now() };
    setTranscript(next);
    persist(next);
    // kick off assistant reply in background (non-blocking)
    (async () => {
      try {
        setAssistantLoading(true);
        const reply = await chatAssistant(next.messages);
        if (reply && String(reply).trim()) {
          const am = { id: Math.random().toString(36).slice(2), role: 'assistant' as const, text: String(reply).trim(), ts: Date.now() };
          const withAssistant = { ...next, messages: [...next.messages, am], lastModified: Date.now() };
          setTranscript(withAssistant);
          persist(withAssistant);
        }
      } catch (_) {
        // ignore assistant failures
      } finally {
        setAssistantLoading(false);
      }
    })();
  };

  const removeMessage = (id: string) => {
    const next = { ...transcript, messages: transcript.messages.filter(m => m.id !== id), lastModified: Date.now() };
    setTranscript(next);
    persist(next);
  };

  const send = () => {
    if (!input.trim()) return;
    addMessage(input.trim());
    setInput('');
  };

  const quick = (t: string) => {
    // append to input for editing or directly add if input is empty
    if (input.trim()) setInput(prev => prev + ' ' + t);
    else addMessage(t);
  };

  const propose = async () => {
    setLoading(true);
    try {
      await onPropose(transcript, { allowPersonalization });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chat-modal p-4 max-w-2xl mx-auto bg-white rounded-lg shadow-lg">
      <div className="chat-header flex justify-between items-center mb-3">
        <div>
          <h3 className="text-lg font-bold">Chat — {slotId} <span className="text-sm text-slate-500">({date})</span></h3>
          <div className="text-xs text-slate-500">This chat is saved locally. Avoid pasting patient-identifying information.</div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" checked={allowPersonalization} onChange={() => setAllowPersonalization(v => !v)} />
            Allow personalization
          </label>
          <button onClick={onClose} aria-label="Close chat" className="bg-slate-100 px-3 py-1 rounded-md">Close</button>
        </div>
      </div>

      <div className="chat-body border rounded p-3 mb-3 max-h-64 overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm text-slate-500">Messages ({transcript.messages.length})</div>
          <div className="text-xs text-slate-400">Saved locally • Private</div>
        </div>
        {transcript.messages.length === 0 && <div className="text-sm text-slate-400">No messages yet. Use quick prompts or type a message.</div>}
        {transcript.messages.map(m => (
          <div key={m.id} className={`msg mb-2 flex items-start ${m.role === 'nurse' ? 'justify-end' : 'justify-start'}`}>
            <div className={`inline-block px-3 py-2 rounded max-w-[80%] ${m.role === 'nurse' ? 'bg-indigo-50 text-indigo-900' : 'bg-slate-100 text-slate-900'}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-semibold capitalize">{m.role}</div>
                <div className="text-xs text-slate-400">{new Date(m.ts).toLocaleTimeString()}</div>
              </div>
              <div className="text-sm mt-1">{m.text}</div>
            </div>
            <button onClick={() => removeMessage(m.id)} aria-label="Delete message" className="ml-2 text-xs text-rose-600">Remove</button>
          </div>
        ))}
      </div>

      <div className="mb-2 flex gap-2">
        <QuickPromptBtn text="Shorten steps" onClick={() => quick('Please shorten the steps into 3 bullet points.')} />
        <QuickPromptBtn text="Add safety checklist" onClick={() => quick('Add a short safety checklist for the activity.')} />
        <QuickPromptBtn text="Simplify language" onClick={() => quick('Rewrite in simpler, plain language for easy reading.')} />
        <QuickPromptBtn text="Encouragement" onClick={() => quick("Add a short encouraging note to the nurse (1 sentence).")} />
      </div>

      <div className="chat-input mb-2">
        <textarea value={input} onChange={e => setInput(e.target.value)} placeholder="Type your message here... (press Add to save)" className="w-full p-3 border rounded h-24" autoFocus />
        <div className="flex items-center justify-between mt-2">
          <div className="text-xs text-slate-500">{lastSaved ? `Saved ${new Date(lastSaved).toLocaleTimeString()}` : 'Not saved yet'}</div>
          <div className="flex gap-2">
            <button onClick={send} className="bg-emerald-500 text-white px-4 py-2 rounded">Add message</button>
            <button onClick={propose} disabled={loading || transcript.messages.length === 0} className="bg-indigo-600 text-white px-4 py-2 rounded">{loading ? 'Proposing...' : 'Propose changes to plan'}</button>
          </div>
        </div>
        <div className="text-xs text-slate-400 mt-2">Propose changes will summarize this chat and generate suggested edits. You will be shown a review screen before any plan is changed.</div>
      </div>
    </div>
  );
};

export default ChatModal;
