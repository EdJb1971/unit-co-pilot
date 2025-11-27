import React, { useState, useEffect } from 'react';
import { SessionPlan, CohortState, PrintableResource, RiskFactor, ExpandedSession, DailyPlan } from '../types';
import { generateResource, generateExpandedSession, proposeSessionEdits } from '../services/geminiService';
import { loadExpandedSession, saveExpandedSession, loadPlan, savePlan, savePlanSmart, saveChatTranscript, loadChatTranscript, saveChangeRecord, savePlanVersion, deleteChatTranscript, scheduleChatTranscriptDeletion } from '../services/storageService';
import ChatModal from './ChatModal';
import ChangeReviewModal from './ChangeReviewModal';
import { ShieldAlert, ClipboardList, Scissors, Brain, Clock, CheckSquare, Square, Printer, FileText, Loader2, ArrowRight, RefreshCw } from 'lucide-react';

interface Props {
  plan: SessionPlan;
  cohort: CohortState;
        risks?: RiskFactor[];
        date?: string;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onRegenerateRequest: (plan: SessionPlan) => void;
  isRegenerating: boolean;
    onSavePlan?: (updated: DailyPlan) => void;
}

export const SessionCard: React.FC<Props> = ({ 
    plan, 
    cohort, 
    risks = [],
    date,
    isExpanded = true, 
    onToggleExpand, 
    onRegenerateRequest,
    isRegenerating 
}) => {
  const [checkedAudit, setCheckedAudit] = useState<Set<number>>(new Set());
  const [generatingResource, setGeneratingResource] = useState(false);
  const [resource, setResource] = useState<PrintableResource | null>(null);
    const [expanding, setExpanding] = useState(false);
    const [expandedSession, setExpandedSession] = useState<ExpandedSession | null>(null);
    const [chatOpen, setChatOpen] = useState(false);
    const [currentTranscript, setCurrentTranscript] = useState<any | null>(null);
    const [proposedChanges, setProposedChanges] = useState<Record<string, any> | null>(null);
    const [proposedExplanation, setProposedExplanation] = useState<string | undefined>(undefined);
    const [proposedSafetyFlags, setProposedSafetyFlags] = useState<string[] | undefined>(undefined);
    const [reviewOpen, setReviewOpen] = useState(false);
    const [editingContent, setEditingContent] = useState<string | null>(null);
    const [hasCached, setHasCached] = useState(false);
    // Local override for front-card instructions: either plan.instructions or expanded facilitatorScript
    const [frontInstructions, setFrontInstructions] = useState<string[]>(plan.instructions || []);
    const [showToast, setShowToast] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
        useEffect(() => {
            if (!date) {
                setHasCached(false);
                return;
            }
            try {
                const cached = loadExpandedSession(date, plan.id);
                setHasCached(Boolean(cached));
                if (cached) {
                    // Populate front instructions from cached facilitatorScript if available
                    if (Array.isArray(cached.facilitatorScript) && cached.facilitatorScript.length > 0) {
                        setFrontInstructions(cached.facilitatorScript.map((s: any) => {
                            const time = s.time ? `${s.time} - ` : '';
                            const cues = s.cues ? ` (Cues: ${s.cues})` : '';
                            const adlibs = s.adlibs ? ` (Ad-libs: ${s.adlibs})` : '';
                            return `${time}${s.step}${cues}${adlibs}`;
                        }));
                    } else if (cached.printable && cached.printable.content) {
                        // Fallback: extract first few lines from printable content
                        const lines = String(cached.printable.content).split('\n').map(l => l.trim()).filter(Boolean);
                        setFrontInstructions(lines.slice(0, 6));
                    }
                } else {
                    setFrontInstructions(plan.instructions || []);
                }
            } catch (e) {
                setHasCached(false);
            }
        }, [date, plan.id]);

  // Keep frontInstructions in sync if plan.instructions change externally
  useEffect(() => {
    if (!expandedSession) setFrontInstructions(plan.instructions || []);
  }, [plan.instructions, expandedSession]);

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
        // Prefer cached expanded session printable when available (and sufficiently detailed)
        let res: PrintableResource | null = null;
        try {
            if (typeof date !== 'undefined') {
                const cachedExpanded = loadExpandedSession(date || '', plan.id);
                if (cachedExpanded && cachedExpanded.printable && String(cachedExpanded.printable.content || '').trim().length > 120) {
                    console.debug('Using cached expanded printable for handout', date, plan.id);
                    res = { title: cachedExpanded.printable.title || `${plan.title} - Handout`, type: cachedExpanded.printable.type || 'guide', content: cachedExpanded.printable.content || '' };
                }
            }
        } catch (e) {
            console.warn('Failed reading cached expanded session', e);
        }

        if (!res) {
            // Generate a full expanded session (richer printable) rather than the lightweight resource
            try {
                const expanded = await generateExpandedSession(plan, cohort, risks || [], cohort.context);
                // Use the printable from expanded session when available
                if (expanded && expanded.printable && String(expanded.printable.content || '').trim().length > 20) {
                    res = { title: expanded.printable.title || `${plan.title} - Handout`, type: expanded.printable.type || 'guide', content: expanded.printable.content || '' };
                }
                // Persist expanded session if we have a date context
                if (typeof date !== 'undefined') {
                    try { saveExpandedSession(date || '', plan.id, expanded); setHasCached(true); } catch (e) { /* ignore save errors */ }
                }
            } catch (e) {
                console.warn('Expanded session generation failed, falling back to lightweight resource', e);
            }
        }

        // Fallback to lightweight generator if expanded path didn't return printable
        if (!res) {
            const lite = await generateResource(plan.title, cohort);
            res = lite;
        }

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
                                        <div className="flex items-center gap-3">
                                            <h3 className="text-lg font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">{plan.title}</h3>
                                            {hasCached && (
                                                <span className="inline-block bg-emerald-100 text-emerald-700 text-xs px-2 py-0.5 rounded-full">Guide ready</span>
                                            )}
                                        </div>
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

            {/* Chat Modal */}
            {chatOpen && currentTranscript && (
                <ChatModal
                    date={currentTranscript.date}
                    slotId={currentTranscript.slotId}
                    initialTranscript={currentTranscript}
                    onClose={() => setChatOpen(false)}
                    onPropose={async (transcript, opts) => {
                        // Save transcript locally
                        try { saveChatTranscript(transcript.date, transcript.slotId, transcript); } catch (e) { /* ignore */ }
                        setCurrentTranscript(transcript);
                        // Call LLM propose API with personalization option
                        const res = await proposeSessionEdits(plan, transcript, cohort, risks || [], { maxSummaryTurns: 12, allowPersonalization: !!opts?.allowPersonalization });
                        setProposedChanges(res.changes || {});
                        setProposedExplanation(res.explanation);
                        setProposedSafetyFlags(res.safetyFlags || []);
                        setChatOpen(false);
                        setReviewOpen(true);
                        return Promise.resolve();
                    }}
                />
            )}

            {/* Change Review Modal */}
            {reviewOpen && proposedChanges && (
                                <ChangeReviewModal
                                        changes={proposedChanges}
                                        explanation={proposedExplanation}
                                        safetyFlags={proposedSafetyFlags}
                                        onClose={() => { setReviewOpen(false); setProposedChanges(null); setProposedExplanation(undefined); setProposedSafetyFlags(undefined); }}
                                            onApply={async (acceptedKeys: string[], options?: { clearNow?: boolean; clearAfterMinutes?: number; keepTranscript?: boolean }) => {
                        // Apply selected keys from proposedChanges
                        if (!date) { alert('Missing date'); return; }
                        const saved = loadPlan(date || '');
                        const beforePlan = saved ? { ...saved } : null;
                        const changeId = Math.random().toString(36).slice(2);
                        const diff: Record<string, any> = {};

                        // Start with updating plan slot if proposedChanges.session exists
                        try {
                            let updatedPlan = saved ? { ...saved } : null;
                            if (proposedChanges.session && acceptedKeys.includes('session')) {
                                if (!updatedPlan) {
                                    alert('No plan found to apply changes to.');
                                } else {
                                    const updatedSlots = updatedPlan.slots.map(s => {
                                        if (s.plan.id === plan.id) {
                                            const before = { ...s.plan };
                                            const merged = { ...s.plan, ...proposedChanges.session };
                                            diff['session'] = { before, after: merged };
                                            return { ...s, plan: merged };
                                        }
                                        return s;
                                    });
                                    updatedPlan.slots = updatedSlots;
                                }
                            }

                            // If expanded changes provided
                            if (proposedChanges.expanded && acceptedKeys.includes('expanded')) {
                                // Merge with existing cached expanded session if any
                                const existingExpanded = loadExpandedSession(date || '', plan.id) || null;
                                const before = existingExpanded ? { ...existingExpanded } : null;
                                const mergedExpanded = { ...(existingExpanded || {}), ...proposedChanges.expanded };
                                saveExpandedSession(date || '', plan.id, mergedExpanded);
                                diff['expanded'] = { before, after: mergedExpanded };
                            }

                            // Basic patches support: array of {op, path, value}
                            if (Array.isArray(proposedChanges.patches) && acceptedKeys.includes('patches')) {
                                // naive apply: only handle replace at top-level session fields
                                const patches = proposedChanges.patches as any[];
                                for (const p of patches) {
                                    if (p.op === 'replace' && typeof p.path === 'string') {
                                        const path = p.path.replace(/^\//, '');
                                        if (path.startsWith('session.') && updatedPlan) {
                                            const key = path.replace('session.', '');
                                            const targetSlot = updatedPlan.slots.find(s => s.plan.id === plan.id);
                                            if (targetSlot) {
                                                const before = { ...(targetSlot.plan as any) };
                                                (targetSlot.plan as any)[key] = p.value;
                                                diff[`patch:${path}`] = { before, after: targetSlot.plan };
                                            }
                                        }
                                    }
                                }
                            }

                              // Persist updated plan if any changes to plan
                            if (diff['session'] && updatedPlan) {
                                // Save a version first
                                const version = { id: changeId, date: updatedPlan.date, timestamp: Date.now(), author: 'nurse', description: proposedExplanation || 'Applied changes from chat', plan: beforePlan || updatedPlan };
                                savePlanVersion(updatedPlan.date, version);

                                // Smart save
                                const saveRes = savePlanSmart(updatedPlan.date, updatedPlan);
                                if (!saveRes.ok && saveRes.conflict) {
                                    const overwrite = window.confirm('Plan changed elsewhere. Overwrite with local changes? OK=Overwrite');
                                    if (overwrite) savePlanSmart(updatedPlan.date, updatedPlan, { force: true });
                                    else {
                                        // abort applying
                                        alert('Aborted due to conflict.');
                                        setReviewOpen(false);
                                        return;
                                    }
                                }

                                // Save change record
                                const record = { id: changeId, date: updatedPlan.date, slotId: plan.id, author: 'nurse', timestamp: Date.now(), diff, accepted: true, reason: proposedExplanation || '' };
                                saveChangeRecord(updatedPlan.date, record as any);

                                // Handle transcript cleanup according to options (skip if user chose to keep)
                                try {
                                    if (!options?.keepTranscript) {
                                        if (options?.clearNow) {
                                            deleteChatTranscript(updatedPlan.date, plan.id);
                                        } else if (options?.clearAfterMinutes && options.clearAfterMinutes > 0) {
                                            scheduleChatTranscriptDeletion(updatedPlan.date, plan.id, options.clearAfterMinutes * 60 * 1000);
                                        }
                                    }
                                } catch (_) { /* ignore deletion scheduling errors */ }

                                // Notify parent
                                if (typeof onSavePlan === 'function') onSavePlan(updatedPlan);
                            } else if (diff['expanded']) {
                                // If only expanded changed, create plan version pointing to same plan
                                const baseDate = date || new Date().toLocaleDateString();
                                const version = { id: changeId, date: baseDate, timestamp: Date.now(), author: 'nurse', description: proposedExplanation || 'Applied expanded changes', plan: saved || { date: baseDate, slots: [] } };
                                savePlanVersion(baseDate, version);
                                const record = { id: changeId, date: baseDate, slotId: plan.id, author: 'nurse', timestamp: Date.now(), diff, accepted: true, reason: proposedExplanation || '' };
                                saveChangeRecord(baseDate, record as any);
                                // Handle transcript cleanup according to options (skip if user chose to keep)
                                try {
                                    if (!options?.keepTranscript) {
                                        if (options?.clearNow) deleteChatTranscript(baseDate, plan.id);
                                        else if (options?.clearAfterMinutes && options.clearAfterMinutes > 0) scheduleChatTranscriptDeletion(baseDate, plan.id, options.clearAfterMinutes * 60 * 1000);
                                    }
                                } catch (_) { }
                            }

                            setReviewOpen(false);
                            setProposedChanges(null);
                            setProposedExplanation(undefined);
                            setProposedSafetyFlags(undefined);
                            alert('Applied selected changes.');
                        } catch (e) {
                            console.error('Failed to apply changes', e);
                            alert('Failed to apply changes.');
                        }
                    }}
                />
            )}

      {/* Modal for Expanded Session Review / Edit */}
      {expandedSession && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl">
                <div className="p-4 border-b flex justify-between items-start">
                    <div>
                        <h3 className="font-bold text-lg">{expandedSession.specialist} Recommendation</h3>
                        <p className="text-sm text-slate-500">{expandedSession.specialistRationale}</p>
                    </div>
                            <div className="flex gap-2">
                        <button onClick={() => {
                            // Create handout from edited content and persist the edited expanded session
                            const printableTitle = expandedSession.printable?.title || `${plan.title} - Handout`;
                            const printableType = (expandedSession.printable?.type as PrintableResource['type']) || 'guide';
                            const printableContent = editingContent || expandedSession.printable?.content || '';
                            // Debug log the printable being used to create the handout
                            try { console.debug('Create Handout - printable to display:', { printableTitle, printableType, printableContent: printableContent ? String(printableContent).slice(0,500) : '(empty)' }); } catch (_) {}
                            setResource({ title: printableTitle, type: printableType, content: printableContent });

                            // Update expandedSession printable content and persist to cache if we have a date
                            const updatedExpanded = { ...expandedSession, printable: { title: printableTitle, type: printableType, content: printableContent } } as ExpandedSession;
                            if (typeof date !== 'undefined') {
                                try { saveExpandedSession(date, plan.id, updatedExpanded); setHasCached(true); } catch (e) { /* ignore save errors */ }
                            }

                            // Persist front instructions from updated facilitatorScript if present
                            if (Array.isArray(updatedExpanded.facilitatorScript) && updatedExpanded.facilitatorScript.length > 0) {
                                setFrontInstructions(updatedExpanded.facilitatorScript.map((s: any) => {
                                    const time = s.time ? `${s.time} - ` : '';
                                    const cues = s.cues ? ` (Cues: ${s.cues})` : '';
                                    const adlibs = s.adlibs ? ` (Ad-libs: ${s.adlibs})` : '';
                                    return `${time}${s.step}${cues}${adlibs}`;
                                }));
                            }
                            setExpandedSession(null);
                            setEditingContent(null);
                            setToastMessage('Guide saved — front card updated');
                            setShowToast(true);
                            setTimeout(() => setShowToast(false), 3000);
                        }} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700">Create Handout</button>
                        <button onClick={() => { setExpandedSession(null); setEditingContent(null); }} className="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-300">Close</button>
                        <button onClick={async () => {
                            // Save enriched instructions into the stored DailyPlan (append/upsert, do not replace existing steps)
                            if (!date) { alert('Cannot save: missing date context'); return; }
                            try {
                                const saved = loadPlan(date || '');
                                if (!saved) { alert('No daily plan found to update.'); return; }
                                let totalAdded = 0;
                                const updatedSlots = saved.slots.map(s => {
                                    if (s.plan.id === plan.id) {
                                        const extractedNew = (Array.isArray(expandedSession.facilitatorScript) && expandedSession.facilitatorScript.length > 0)
                                            ? expandedSession.facilitatorScript.map((fs: any) => String(fs.step).trim())
                                            : (editingContent ? String(editingContent).split('\n').map((l: string) => l.trim()).filter(Boolean) : []);

                                        const existing = Array.isArray(s.plan.instructions) ? s.plan.instructions.map((i: string) => String(i).trim()) : [];

                                        // Determine items to add (preserve order, avoid dupes)
                                        const toAdd: string[] = [];
                                        for (const item of extractedNew) {
                                            if (!item) continue;
                                            if (!existing.includes(item) && !toAdd.includes(item)) toAdd.push(item);
                                        }

                                        const merged = existing.concat(toAdd);
                                        totalAdded = toAdd.length;
                                        return { ...s, plan: { ...s.plan, instructions: merged } };
                                    }
                                    return s;
                                });
                                const updatedPlan: DailyPlan = { ...saved, slots: updatedSlots };
                                // Smart save to avoid clobbering newer edits
                                const saveRes = savePlanSmart(saved.date, updatedPlan);
                                if (!saveRes.ok && saveRes.conflict) {
                                    const overwrite = window.confirm('This daily plan was updated elsewhere. Overwrite with these additions? OK=Overwrite, Cancel=Keep remote');
                                    if (overwrite) savePlanSmart(saved.date, updatedPlan, { force: true });
                                    else {
                                        // Keep remote and update UI
                                        const remote = saveRes.existing as DailyPlan;
                                        if (typeof onSavePlan === 'function') onSavePlan(remote);
                                        setToastMessage('Kept newer plan from another tab'); setShowToast(true); setTimeout(() => setShowToast(false), 3000);
                                        setExpandedSession(null);
                                        setEditingContent(null);
                                        return;
                                    }
                                }
                                // Also persist the updated expanded session printable/facilitatorScript if present
                                try {
                                    const cached = loadExpandedSession(date || '', plan.id);
                                    const toPersist = cached ? { ...cached } : (expandedSession ? { ...expandedSession } as ExpandedSession : null);
                                    if (toPersist) {
                                        // If editable printable exists, prefer it
                                        if (editingContent) toPersist.printable = { title: toPersist.printable?.title || `${plan.title} - Handout`, type: toPersist.printable?.type || 'guide', content: String(editingContent) } as any;
                                        // If facilitatorScript is empty but we have the extractedNew, populate it
                                        if ((!Array.isArray(toPersist.facilitatorScript) || toPersist.facilitatorScript.length === 0) && Array.isArray(expandedSession?.facilitatorScript)) {
                                            toPersist.facilitatorScript = expandedSession!.facilitatorScript;
                                        }
                                        saveExpandedSession(date || '', plan.id, toPersist as ExpandedSession);
                                    }
                                } catch (e) {
                                    // ignore persistence errors
                                }

                                // notify parent if handler provided
                                if (typeof onSavePlan === 'function') onSavePlan(updatedPlan);
                                setToastMessage(totalAdded > 0 ? `Added ${totalAdded} step${totalAdded > 1 ? 's' : ''} to plan` : 'No new steps to add');
                                setShowToast(true); setTimeout(() => setShowToast(false), 3000);
                            } catch (e) {
                                console.error('Save to plan failed', e);
                                alert('Failed to save to plan.');
                            }
                        }} className="bg-amber-50 text-amber-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-amber-100">Save to Plan</button>
                    </div>
                </div>

                <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2">
                        <h4 className="font-bold mb-2">Summary</h4>
                        <p className="text-sm text-slate-700 mb-4 whitespace-pre-wrap">{expandedSession.summary}</p>

                        <h4 className="font-bold mb-2">Facilitator Script</h4>
                        <div className="space-y-3 mb-4">
                            {expandedSession.facilitatorScript.map((s, i) => (
                                <div key={i} className="p-3 border rounded-lg bg-slate-50">
                                    <div className="flex justify-between items-start">
                                        <div className="text-sm font-medium text-slate-600">{s.time || ''}</div>
                                        <div className="text-xs text-slate-400">Step {s.stepNumber ?? i + 1}</div>
                                    </div>
                                    <div className="text-sm text-slate-800 mt-1">{s.step}</div>
                                    {s.cues && <div className="text-xs text-indigo-600 mt-2">Cues: {s.cues}</div>}
                                    {s.adlibs && <div className="text-xs text-emerald-600 mt-1">Ad-libs: {s.adlibs}</div>}
                                    {s.safetyChecks && <div className="text-xs text-red-600 mt-1">Safety: {s.safetyChecks}</div>}
                                    {s.note && <div className="text-xs text-slate-500 mt-1">Note: {s.note}</div>}
                                </div>
                            ))}
                        </div>

                        <h4 className="font-bold mb-2">Printable Content (editable)</h4>
                        <textarea aria-label="Editable printable content" placeholder="Edit printable handout content here..." value={editingContent || ''} onChange={(e) => setEditingContent(e.target.value)} className="w-full h-60 p-3 border border-slate-200 rounded-md font-serif text-sm" />
                    </div>

                    <aside className="space-y-4">
                        <div>
                            <h5 className="font-bold text-sm">Tips</h5>
                            <ul className="list-disc pl-5 text-sm text-slate-700">
                                {expandedSession.tips.map((t, i) => <li key={i}>{t}</li>)}
                            </ul>
                        </div>

                        <div>
                            <h5 className="font-bold text-sm">Risk Mitigations</h5>
                            <ul className="list-disc pl-5 text-sm text-slate-700">
                                {expandedSession.riskMitigations.map((r, i) => <li key={i}>{r}</li>)}
                            </ul>
                        </div>

                        <div>
                            <h5 className="font-bold text-sm">Materials</h5>
                            <ul className="list-disc pl-5 text-sm text-slate-700">
                                {expandedSession.materials.map((m, i) => (
                                    <li key={i}>
                                        {typeof m === 'string' ? m : `${m.quantity ? m.quantity + ' ' : ''}${m.name}${m.notes ? ' — ' + m.notes : ''}`}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {expandedSession.therapeuticPrompts && expandedSession.therapeuticPrompts.length > 0 && (
                            <div>
                                <h5 className="font-bold text-sm">Therapeutic Prompts</h5>
                                <ul className="list-disc pl-5 text-sm text-slate-700">
                                    {expandedSession.therapeuticPrompts.map((p, i) => <li key={i}>{p}</li>)}
                                </ul>
                            </div>
                        )}

                        {expandedSession.accommodations && expandedSession.accommodations.length > 0 && (
                            <div>
                                <h5 className="font-bold text-sm">Accommodations</h5>
                                <ul className="list-disc pl-5 text-sm text-slate-700">
                                    {expandedSession.accommodations.map((a, i) => <li key={i}>{a}</li>)}
                                </ul>
                            </div>
                        )}

                        {expandedSession.sensoryConsiderations && expandedSession.sensoryConsiderations.length > 0 && (
                            <div>
                                <h5 className="font-bold text-sm">Sensory Considerations</h5>
                                <ul className="list-disc pl-5 text-sm text-slate-700">
                                    {expandedSession.sensoryConsiderations.map((s, i) => <li key={i}>{s}</li>)}
                                </ul>
                            </div>
                        )}

                        {expandedSession.allergyChecks && (
                            <div>
                                <h5 className="font-bold text-sm">Allergy & Risk Checklist</h5>
                                <div className="flex gap-2">
                                    <textarea aria-label="Allergy checklist" readOnly value={expandedSession.allergyChecks} className="w-full p-2 border rounded-md text-sm" />
                                    <button onClick={() => { navigator.clipboard.writeText(expandedSession.allergyChecks); setToastMessage('Checklist copied'); setShowToast(true); setTimeout(() => setShowToast(false), 3000); }} className="bg-slate-100 px-3 py-1 rounded-md">Copy</button>
                                </div>
                            </div>
                        )}
                    </aside>
                </div>
            </div>
        </div>
      )}


      {/* Toast */}
      {showToast && (
        <div className="fixed right-6 top-6 z-60">
          <div className="bg-indigo-600 text-white px-4 py-2 rounded-lg shadow-lg animate-fade-in-up">
            {toastMessage}
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
                    <div className="flex items-center gap-3">
                        <h2 className="text-3xl font-bold text-slate-900">{plan.title}</h2>
                        {hasCached && (
                            <span className="inline-block bg-emerald-100 text-emerald-700 text-xs px-2 py-0.5 rounded-full">Guide ready</span>
                        )}
                    </div>
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
                    <button 
                        onClick={async () => {
                            setExpanding(true);
                            try {
                                // Try cache first if date provided
                                const cached = (typeof date !== 'undefined') ? loadExpandedSession(date || '', plan.id) : null;
                                if (cached) {
                                    console.debug('Loaded cached expanded session for', date, plan.id, cached);
                                    setExpandedSession(cached);
                                    setEditingContent(cached.printable?.content || '');
                                } else {
                                    const expanded = await generateExpandedSession(plan, cohort, risks || [], cohort.context);
                                    console.debug('Generated expanded session for', date, plan.id, expanded);
                                    setExpandedSession(expanded);
                                    setEditingContent(expanded.printable?.content || '');
                                    if (typeof date !== 'undefined') saveExpandedSession(date || '', plan.id, expanded);
                                }
                            } catch (e) {
                                alert('Failed to expand session.');
                            } finally {
                                setExpanding(false);
                            }
                        }}
                        disabled={expanding}
                        className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-emerald-100 transition-colors disabled:opacity-50"
                    >
                        {expanding ? <Loader2 size={16} className="animate-spin"/> : <Scissors size={16} />}
                        {expanding ? 'Expanding...' : 'Expand Session'}
                    </button>
                    <button onClick={() => {
                        // Open chat modal; try to load existing transcript
                        if (!date) { alert('Chat requires a date context'); return; }
                        const t = loadChatTranscript(date || '', plan.id);
                        setCurrentTranscript(t || { id: `${date}_${plan.id}`, date: date || '', slotId: plan.id, messages: [], lastModified: Date.now() });
                        setChatOpen(true);
                    }}
                    className="flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-100 transition-colors" title="Open chat to discuss and propose edits">
                        <FileText size={16} /> Open Chat (propose edits)
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
                {(frontInstructions && frontInstructions.length > 0) ? (
                    <div className="space-y-6 relative before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
                        {frontInstructions.map((step, idx) => (
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