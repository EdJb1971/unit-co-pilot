import React from 'react';

interface ChangeReviewModalProps {
  changes: Record<string, any>;
  explanation?: string;
  safetyFlags?: string[];
  onApply: (acceptedKeys: string[], options?: { clearNow?: boolean; clearAfterMinutes?: number; keepTranscript?: boolean }) => void;
  onClose: () => void;
}

const ChangeReviewModal: React.FC<ChangeReviewModalProps> = ({ changes, explanation, safetyFlags, onApply, onClose }) => {
  const keys = Object.keys(changes || {});
  const [selected, setSelected] = React.useState<string[]>(keys);
  const [clearNow, setClearNow] = React.useState(false);
  const [clearAfterMinutes, setClearAfterMinutes] = React.useState<number>(30);
  const [keepTranscript, setKeepTranscript] = React.useState<boolean>(false);

  React.useEffect(() => {
    setSelected(keys);
  }, [changes]);

  const toggle = (k: string) => {
    setSelected(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]);
  };

  return (
    <div className="change-review-modal p-4 max-w-3xl mx-auto bg-white rounded-lg shadow-lg">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="text-lg font-bold">Proposed Changes</h3>
          {explanation && <p className="text-sm text-slate-600 mt-1">{explanation}</p>}
          {safetyFlags && safetyFlags.length > 0 && (
            <div className="mt-2 text-sm text-rose-700">
              <strong>Safety flags:</strong>
              <ul className="list-disc pl-5">{safetyFlags.map(s => <li key={s}>{s}</li>)}</ul>
            </div>
          )}
        </div>
        <div className="text-xs text-slate-400">Review proposed edits and choose which to apply. No changes are saved until you confirm.</div>
      </div>

      <div className="mb-3 flex items-center gap-3">
        <button onClick={() => setSelected(keys)} className="bg-slate-100 px-3 py-1 rounded text-sm">Select all</button>
        <button onClick={() => setSelected([])} className="bg-slate-100 px-3 py-1 rounded text-sm">Select none</button>
        <div className="text-sm text-slate-500 ml-auto">{keys.length} items</div>
      </div>

      <div className="changes-list space-y-3 max-h-72 overflow-y-auto p-2 border rounded">
        {keys.length === 0 && <div className="text-sm text-slate-500">No changes proposed.</div>}
        {keys.map(k => (
          <div key={k} className="p-3 bg-slate-50 rounded border">
            <div className="flex items-start justify-between">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={selected.includes(k)} onChange={() => toggle(k)} />
                <span className="font-medium">{k}</span>
              </label>
              <div className="text-xs text-slate-400">Preview</div>
            </div>
            <div className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">
              {typeof changes[k] === 'string' ? changes[k] : JSON.stringify(changes[k], null, 2)}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 border-t pt-4">
        <div className="flex items-center gap-4 mb-3">
          <label className="flex items-center gap-2"><input type="checkbox" checked={keepTranscript} onChange={() => setKeepTranscript(k => !k)} /> <span className="text-sm">Keep transcript (do not delete)</span></label>

          <label className={`flex items-center gap-2 ${keepTranscript ? 'opacity-50' : ''}`}>
            <input type="checkbox" checked={clearNow} onChange={() => setClearNow(c => !c)} disabled={keepTranscript} />
            <span className="text-sm">Delete transcript immediately after apply</span>
          </label>

          <label className={`flex items-center gap-2 ${keepTranscript ? 'opacity-50' : ''}`}>
            <input type="checkbox" checked={!clearNow && !keepTranscript} onChange={() => setClearNow(c => !c)} disabled={keepTranscript} />
            <span className="text-sm">Schedule delete in</span>
            <select value={clearAfterMinutes} onChange={e => setClearAfterMinutes(Number(e.target.value))} disabled={clearNow || keepTranscript} className="ml-2">
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
              <option value={60}>1 hour</option>
              <option value={120}>2 hours</option>
            </select>
          </label>
        </div>

        <div className="flex gap-3">
          <button onClick={() => onApply(selected, { clearNow: keepTranscript ? false : clearNow, clearAfterMinutes: keepTranscript ? undefined : clearAfterMinutes, keepTranscript })} className="bg-indigo-600 text-white px-4 py-2 rounded">Apply selected changes</button>
          <button onClick={onClose} className="bg-slate-200 px-4 py-2 rounded">Cancel</button>
        </div>
      </div>
    </div>
  );
};

export default ChangeReviewModal;
