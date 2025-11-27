import React, { useState } from 'react';
import { SessionPlan, CohortState, PrintableResource } from '../types';
import { generateResource } from '../services/geminiService';
import { ShieldAlert, ClipboardList, Scissors, Brain, Clock, CheckSquare, Square, Printer, FileText, Loader2, ArrowRight, RefreshCw } from 'lucide-react';

interface Props {
  plan: SessionPlan;
  cohort: CohortState;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onRegenerateRequest: (plan: SessionPlan) => void;
  isRegenerating: boolean;
}

export const SessionCard: React.FC<Props> = ({ 
    plan, 
    cohort, 
    isExpanded = true, 
    onToggleExpand, 
    onRegenerateRequest,
    isRegenerating 
}) => {
  const [checkedAudit, setCheckedAudit] = useState<Set<number>>(new Set());
  const [generatingResource, setGeneratingResource] = useState(false);
  const [resource, setResource] = useState<PrintableResource | null>(null);

  const toggleAuditItem = (index: number) => {
    const newSet = new Set(checkedAudit);
    if (newSet.has(index)) newSet.delete(index);
    else newSet.add(index);
    setCheckedAudit(newSet);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleGenerateResource = async () => {
    setGeneratingResource(true);
    try {
        const res = await generateResource(plan.title, cohort);
        setResource(res);
    } catch (e) {
        alert("Failed to generate resource. Please try again.");
    } finally {
        setGeneratingResource(false);
    }
  };

  const closeResource = () => setResource(null);

  // Condensed View
  if (!isExpanded) {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:border-indigo-300 transition-colors cursor-pointer group" onClick={onToggleExpand}>
            <div className="flex justify-between items-center">
                <div className="flex-1">
                    <h3 className="text-lg font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">{plan.title}</h3>
                    <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
                        <span className="flex items-center gap-1"><Clock size={14}/> {plan.duration}</span>
                        <span className="bg-slate-100 px-2 py-0.5 rounded-full text-xs font-medium uppercase">{plan.therapeuticGoal}</span>
                    </div>
                </div>
                {isRegenerating ? (
                     <Loader2 className="animate-spin text-indigo-500 mx-4" size={20} />
                ) : (
                    <div className="bg-indigo-50 text-indigo-600 p-2 rounded-full group-hover:bg-indigo-600 group-hover:text-white transition-all">
                        <ArrowRight size={20} />
                    </div>
                )}
            </div>
            {plan.alternativeOption && (
                <div className="mt-3 text-xs text-slate-400 border-t border-slate-100 pt-2 flex items-center gap-1">
                    <span className="font-bold">Alternative:</span> {plan.alternativeOption.title}
                </div>
            )}
        </div>
    );
  }

  // Expanded / Detail View
  return (
    <div className={`bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-fade-in relative print:shadow-none print:border-none ${isRegenerating ? 'opacity-50 pointer-events-none' : ''}`}>
      
      {/* Modal for Resource - Styled for Print */}
      {resource && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 print:p-0 print:bg-white print:static">
            <div className="bg-white w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl print:shadow-none print:max-h-full print:rounded-none">
                <div className="p-4 border-b flex justify-between items-center print:hidden">
                    <h3 className="font-bold text-lg">🖨️ Printable Handout</h3>
                    <div className="flex gap-2">
                        <button onClick={() => window.print()} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700">Print Now</button>
                        <button onClick={closeResource} className="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-300">Close</button>
                    </div>
                </div>
                <div className="p-10 prose max-w-none">
                    <h1 className="text-3xl font-bold mb-2 text-center border-b pb-4">{resource.title}</h1>
                    <div className="whitespace-pre-wrap font-serif text-lg leading-relaxed text-slate-900">
                        {resource.content}
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Main Card Content */}
      <div className="print:hidden">
        <div className="bg-red-50 border-b border-red-100 p-4 flex gap-3 items-start justify-between">
            <div className="flex gap-3 items-start">
                <ShieldAlert className="text-red-600 shrink-0 mt-0.5" size={24} />
                <div>
                    <h3 className="text-red-800 font-bold text-sm uppercase tracking-wide">Safety Protocol Active</h3>
                    <p className="text-red-700 font-medium leading-snug">{plan.safetyAlert}</p>
                </div>
            </div>
            <button 
                onClick={(e) => { e.stopPropagation(); onRegenerateRequest(plan); }}
                className="flex items-center gap-1.5 text-xs font-bold bg-white text-slate-600 px-3 py-1.5 rounded-lg border border-slate-200 hover:text-indigo-600 hover:border-indigo-300 transition-colors shadow-sm"
            >
                {isRegenerating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Change Plan
            </button>
        </div>

        <div className="p-6">
            <div className="flex flex-col md:flex-row justify-between items-start mb-6 gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-slate-900">{plan.title}</h2>
                    <p className="text-slate-500 mt-1">{plan.rationale}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                    <button 
                        onClick={handleGenerateResource}
                        disabled={generatingResource}
                        className="flex items-center gap-2 bg-indigo-50 text-indigo-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-100 transition-colors disabled:opacity-50"
                    >
                        {generatingResource ? <Loader2 size={16} className="animate-spin"/> : <FileText size={16} />}
                        {generatingResource ? "Writing..." : "Create Handout"}
                    </button>
                    <button onClick={handlePrint} className="flex items-center gap-2 bg-slate-100 text-slate-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-200 transition-colors">
                        <Printer size={16} /> Print Plan
                    </button>
                </div>
            </div>
            
            <div className="flex items-start gap-3 bg-indigo-50 p-4 rounded-xl border border-indigo-100 mb-6">
                <Brain className="text-indigo-600 shrink-0 mt-1" size={20} />
                <div>
                    <span className="block text-xs font-bold text-indigo-500 uppercase tracking-wide mb-1">Therapeutic Goal</span>
                    <p className="text-indigo-900 font-semibold">{plan.therapeuticGoal}</p>
                </div>
            </div>

            {/* Nurse Prep Section */}
            <div className="mb-8 border-l-4 border-amber-400 pl-4 py-1 bg-amber-50/50 rounded-r-lg">
                <h3 className="flex items-center gap-2 font-bold text-amber-800 mb-3">
                    <Scissors size={18} />
                    Nurse Prep (Pre-Session)
                </h3>
                {plan.nursePrep && plan.nursePrep.length > 0 ? (
                    <ul className="space-y-3">
                        {plan.nursePrep.map((step, idx) => (
                            <li key={idx} className="flex gap-3 text-slate-700 text-sm">
                                <span className="font-bold text-amber-500">{idx + 1}.</span>
                                {step}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-slate-500 italic">No specific prep instructions provided.</p>
                )}
            </div>

            {/* Audit Checklist */}
            <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 mb-8">
                 <h3 className="flex items-center gap-2 font-bold text-slate-800 mb-3">
                    <ClipboardList size={18} />
                    Tool Audit (Count In / Count Out)
                </h3>
                {plan.toolAudit && plan.toolAudit.length > 0 ? (
                    <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                        {plan.toolAudit.map((item, idx) => (
                            <button 
                                key={idx}
                                onClick={() => toggleAuditItem(idx)}
                                className="flex items-center gap-3 w-full text-left group hover:bg-slate-100 p-2 rounded-lg transition-colors"
                            >
                                {checkedAudit.has(idx) 
                                    ? <CheckSquare className="text-emerald-500 shrink-0" /> 
                                    : <Square className="text-slate-300 group-hover:text-slate-400 shrink-0" />}
                                <span className={`${checkedAudit.has(idx) ? 'line-through text-slate-400' : 'text-slate-700 font-medium'}`}>
                                    {item}
                                </span>
                            </button>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-slate-500 italic">No specific tools to audit.</p>
                )}
            </div>

            {/* Instructions */}
            <div>
                <h3 className="font-bold text-slate-900 mb-4 text-lg">Session Guide</h3>
                {plan.instructions && plan.instructions.length > 0 ? (
                    <div className="space-y-6 relative before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
                        {plan.instructions.map((step, idx) => (
                            <div key={idx} className="relative pl-10">
                                <div className="absolute left-0 top-0 w-8 h-8 rounded-full bg-white border-2 border-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-sm shadow-sm">
                                    {idx + 1}
                                </div>
                                <p className="text-slate-700 leading-relaxed pt-1">{step}</p>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-slate-500 italic">No detailed instructions provided.</p>
                )}
            </div>

            {/* Alternative Option */}
            {plan.alternativeOption && (
                 <div className="mt-8 pt-6 border-t border-slate-100">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Plan B / Alternative</h4>
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                        <h5 className="font-bold text-slate-700">{plan.alternativeOption.title}</h5>
                        <p className="text-sm text-slate-500 mt-1">{plan.alternativeOption.description}</p>
                    </div>
                 </div>
            )}
        </div>
      </div>
      
      {/* Hidden Print Only View */}
      <div className="hidden print:block p-8">
        <h1 className="text-2xl font-bold mb-4">{plan.title}</h1>
        <h2 className="text-lg mb-2">Safety Protocol</h2>
        <p className="mb-4">{plan.safetyAlert}</p>
        <h3 className="font-bold mt-4">Prep</h3>
        <ul className="list-disc pl-5 mb-4">
            {(plan.nursePrep || []).map(s => <li key={s}>{s}</li>)}
        </ul>
        <h3 className="font-bold mt-4">Instructions</h3>
        <ul className="list-decimal pl-5">
            {(plan.instructions || []).map(s => <li key={s}>{s}</li>)}
        </ul>
      </div>
    </div>
  );
};