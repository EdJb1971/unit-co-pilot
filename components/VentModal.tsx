import React from 'react';
import { chatVent } from '../services/geminiService';

interface VentModalProps {
  onClose: () => void;
}

const VentModal: React.FC<VentModalProps> = ({ onClose }) => {
  const [messages, setMessages] = React.useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);
  const [input, setInput] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [lastSafetyFlags, setLastSafetyFlags] = React.useState<string[] | null>(null);

  const addMessage = (role: 'user' | 'assistant', text: string) => {
    setMessages(prev => [...prev, { role, text }]);
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    addMessage('user', trimmed);
    setInput('');
    setSending(true);
    try {
      const convo = [...messages, { role: 'user', text: trimmed }];
      const res = await chatVent(convo);
      if (res.safetyConcern) {
        setLastSafetyFlags(res.concernFlags || []);
      } else {
        setLastSafetyFlags(null);
      }
      addMessage('assistant', res.reply);
    } catch (e) {
      addMessage('assistant', "Sorry, I couldn't connect right now.");
    } finally {
      setSending(false);
    }
  };

  const handleCopy = async () => {
    try {
      const txt = messages.map(m => `${m.role}: ${m.text}`).join('\n\n');
      await navigator.clipboard.writeText(txt);
      alert('Transcript copied to clipboard');
    } catch (e) {
      alert('Failed to copy');
    }
  };

  const handleDownload = () => {
    const blob = new Blob([messages.map(m => `${m.role}: ${m.text}`).join('\n\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vent-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    if (!confirm('Clear this vent session? This will remove the current in-memory conversation.')) return;
    setMessages([]);
    setInput('');
    setLastSafetyFlags(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-lg shadow-xl flex flex-col">
        <div className="p-4 border-b flex items-start justify-between gap-4">
          <div>
            <h3 className="font-bold text-lg">Vent Mode — A private, supportive listener</h3>
            <p className="text-sm text-slate-500">Local-only by default. Nothing is saved unless you explicitly export or copy it.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleCopy} className="px-3 py-1 bg-slate-100 rounded">Copy</button>
            <button onClick={handleDownload} className="px-3 py-1 bg-slate-100 rounded">Download</button>
            <button onClick={() => onClose()} className="px-3 py-1 bg-slate-200 rounded">Close</button>
          </div>
        </div>

        <div className="p-4 overflow-y-auto flex-1" style={{ minHeight: 200 }}>
          {messages.length === 0 && (
            <div className="text-sm text-slate-500">Say anything — I&apos;m listening. If you&apos;re in danger, contact local emergency services immediately.</div>
          )}

          <div className="space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`p-3 rounded-lg ${m.role === 'user' ? 'bg-slate-100 self-end' : 'bg-indigo-50'}`}>
                <div className="text-sm text-slate-700 whitespace-pre-wrap">{m.text}</div>
                <div className="text-xs text-slate-400 mt-2">{m.role === 'user' ? 'You' : 'Listener'}</div>
              </div>
            ))}
          </div>

          {lastSafetyFlags && lastSafetyFlags.length > 0 && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded">
              <strong className="text-amber-800">Safety notice:</strong>
              <div className="text-sm text-amber-700 mt-2">We detected concerns (flags: {lastSafetyFlags.join(', ')}). If you are in immediate danger call emergency services now. In the US call/text 988 for the Suicide & Crisis Lifeline. If someone is at risk, contact local emergency services. Would you like breathing exercises or resources?</div>
            </div>
          )}
        </div>

        <div className="p-4 border-t">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Write whatever's on your mind..." className="w-full p-3 border rounded-md h-28 resize-none" />
          <div className="flex items-center justify-between mt-3">
            <div className="text-sm text-slate-500">Private by default — export only when you want to keep it.</div>
            <div className="flex items-center gap-2">
              <button onClick={handleClear} className="px-3 py-2 rounded bg-slate-100">Clear</button>
              <button onClick={handleSend} disabled={sending} className="px-4 py-2 rounded bg-indigo-600 text-white">{sending ? 'Sending...' : 'Send'}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VentModal;
