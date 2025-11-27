import React, { useState } from 'react';
import { RefreshCw, X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  title: string;
}

const QUICK_REASONS = [
  "Staff Shortage (Need simpler supervision)",
  "Patient Agitation (Too dangerous)",
  "Equipment Missing",
  "Patient Refusal / Boredom",
  "Need quieter activity"
];

export const RegenerateDialog: React.FC<Props> = ({ isOpen, onClose, onConfirm, title }) => {
  const [reason, setReason] = useState("");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-fade-in">
        <div className="bg-slate-100 p-4 border-b border-slate-200 flex justify-between items-center">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <RefreshCw size={18} className="text-indigo-600"/>
            Change Plan
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6">
          <p className="text-sm text-slate-500 mb-4">
            Why are we changing <strong>"{title}"</strong>?
          </p>

          <div className="space-y-2 mb-4">
            {QUICK_REASONS.map(r => (
              <button
                key={r}
                onClick={() => setReason(r)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors border ${reason === r ? 'bg-indigo-50 border-indigo-500 text-indigo-700 font-medium' : 'border-slate-200 hover:bg-slate-50 text-slate-600'}`}
              >
                {r}
              </button>
            ))}
          </div>

          <textarea
            className="w-full p-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            rows={3}
            placeholder="Or type specific reason here..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />

          <div className="mt-6 flex gap-3">
             <button 
                onClick={onClose}
                className="flex-1 py-3 font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
             >
                Cancel
             </button>
             <button 
                onClick={() => onConfirm(reason)}
                disabled={!reason.trim()}
                className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
             >
                Generate New Option
             </button>
          </div>
        </div>
      </div>
    </div>
  );
};