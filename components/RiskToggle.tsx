import React from 'react';
import { RiskFactor } from '../types';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

interface Props {
  risk: RiskFactor;
  onToggle: (id: string) => void;
}

export const RiskToggle: React.FC<Props> = ({ risk, onToggle }) => {
  return (
    <button
      onClick={() => onToggle(risk.id)}
      className={`relative w-full text-left p-4 rounded-xl border-2 transition-all duration-200 flex items-start gap-3 group
        ${risk.active 
          ? 'bg-red-50 border-red-500 shadow-sm' 
          : 'bg-white border-slate-200 hover:border-slate-300'
        }`}
    >
      <div className={`mt-0.5 rounded-full p-1 ${risk.active ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-400'}`}>
        {risk.active ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
      </div>
      
      <div className="flex-1">
        <div className="flex justify-between items-center">
          <span className={`font-bold ${risk.active ? 'text-red-900' : 'text-slate-700'}`}>
            {risk.label}
          </span>
          {risk.active && (
            <span className="text-xs font-bold uppercase tracking-wider text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
              Active
            </span>
          )}
        </div>
        <p className={`text-sm mt-1 leading-relaxed ${risk.active ? 'text-red-700' : 'text-slate-500'}`}>
          {risk.description}
        </p>
      </div>
    </button>
  );
};