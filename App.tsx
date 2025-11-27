import React, { useState, useEffect } from 'react';
import { CohortState, EnergyLevel, RiskFactor, DailyPlan, SessionPlan } from './types';
import { INITIAL_RISKS } from './constants';
import { generateDailyPlan, regenerateSession, generateExpandedSession } from './services/geminiService';
import { savePlan, loadPlan, saveExpandedSession, loadSetting, saveSetting, savePlanSmart } from './services/storageService';
import { RiskToggle } from './components/RiskToggle';
import { SessionCard } from './components/SessionCard';
import { RegenerateDialog } from './components/RegenerateDialog';
import VentModal from './components/VentModal';
import { Sparkles, Users, Calendar, Activity, Loader2, ChevronLeft, ChevronRight, UserPlus, ClipboardCopy } from 'lucide-react';
import { exportAllData, importData, loadExpandedSession, migrateExpandedSessions, clearExpandedSession, performScheduledChatCleanup } from './services/storageService';
import PlanCalendar from './components/PlanCalendar';

const LOADING_MESSAGES = [
  "Analyzing Clinical Constraints...",
  "Planning Morning Session...",
  "Designing Midday Activities...",
  "Finalizing Afternoon Schedule...",
  "Reviewing Safety Protocols...",
  "Generating Nurse Prep Lists..."
];

const App: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const [cohort, setCohort] = useState<CohortState>({
    count: 5,
    ageRange: '13-16',
    energy: EnergyLevel.MIXED,
    context: '',
    staffCount: 3 // Default reasonable staff count
  });
  
  const [risks, setRisks] = useState<RiskFactor[]>(INITIAL_RISKS);
  const [dailyPlan, setDailyPlan] = useState<DailyPlan | null>(null);
  
  // UI States
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0]);
  const [error, setError] = useState<string | null>(null);
  const [expandedSlotId, setExpandedSlotId] = useState<string | null>(null);
    const [autoGenerateExpanded, setAutoGenerateExpanded] = useState<boolean>(() => Boolean(loadSetting('autoGenerateExpanded', false)));
    const [autoGenProgress, setAutoGenProgress] = useState<{ running: boolean; completed: number; total: number; failed: number }>({ running: false, completed: 0, total: 0, failed: 0 });
    const [apiKeyEncState, setApiKeyEncState] = useState<string | null>(() => loadSetting('GEMINI_API_KEY', null));
    const [apiInput, setApiInput] = useState('');
    // Whether we currently require the API key entry (true when no key saved)
    const requireApiKey = !apiKeyEncState;
  
  // Regeneration States
  const [regenDialogSlot, setRegenDialogSlot] = useState<SessionPlan | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
    const [showCalendar, setShowCalendar] = useState(false);
    const [ventOpen, setVentOpen] = useState(false);

  // Load plan on date change
  useEffect(() => {
    const dateKey = currentDate.toLocaleDateString();
    const saved = loadPlan(dateKey);
    setDailyPlan(saved);
        // Always clear expanded slot selection when changing the date/loaded plan
        setExpandedSlotId(null);
  }, [currentDate]);

    // Run a one-time migration to normalize any cached expanded sessions
    useEffect(() => {
        try {
            const res = migrateExpandedSessions();
            if (res && res.ok && res.migrated && res.migrated > 0) {
                console.info('Migrated expanded sessions:', res.migrated);
            }
        } catch (e) {
            // ignore migration failures
        }
        try {
            // Run any pending scheduled chat transcript cleanups (deletions)
            performScheduledChatCleanup();
        } catch (e) {
            // non-fatal
        }
    }, []);

  const handleToggleRisk = (id: string) => {
    setRisks(prev => prev.map(r => r.id === id ? { ...r, active: !r.active } : r));
  };

  const changeDate = (days: number) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + days);
    setCurrentDate(newDate);
  };

    // Modal that blocks the UI until an API key is provided on first run.
    const ApiKeyModal = () => {
        if (!requireApiKey) return null;
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                <div className="bg-white p-6 rounded-lg max-w-md w-full shadow-lg">
                    <h3 className="text-lg font-bold mb-2">Enter Google API Key</h3>
                    <p className="text-sm text-slate-600 mb-4">To enable AI features, paste your Google API key below. Get one from <a className="underline" href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer">aistudio.google.com</a>.</p>
                    <input value={apiInput} onChange={(e) => setApiInput(e.target.value)} placeholder="Paste API key here" className="w-full p-2 border rounded-md" />
                    <div className="flex justify-end gap-2 mt-4">
                        <button onClick={() => {
                            const raw = apiInput.trim();
                            if (!raw) { alert('Paste your API key then click Save.'); return; }
                            try {
                                saveSetting('GEMINI_API_KEY', btoa(raw));
                                setApiKeyEncState(btoa(raw));
                                alert('API key saved.');
                            } catch (e) { alert('Failed to save API key.'); }
                        }} className="bg-indigo-600 text-white px-3 py-2 rounded-md">Save</button>
                    </div>
                </div>
            </div>
        );
    };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    let msgIndex = 0;
    setLoadingMsg(LOADING_MESSAGES[0]);

    // Rotate messages to show activity
    const intervalId = setInterval(() => {
        msgIndex = (msgIndex + 1) % LOADING_MESSAGES.length;
        setLoadingMsg(LOADING_MESSAGES[msgIndex]);
    }, 3000); // Slower rotation as 3 loops take longer

    try {
      const result = await generateDailyPlan(cohort, risks);
      // Override date with selected date
      result.date = currentDate.toLocaleDateString();
      
            setDailyPlan(result);
            // Smart save: detect if there's a newer plan in another tab
            const saveRes = savePlanSmart(result.date, result);
            if (!saveRes.ok && saveRes.conflict) {
                const keep = window.confirm('A newer plan exists for this date (modified elsewhere). Overwrite with generated plan? Click OK to overwrite, Cancel to keep existing.');
                if (keep) savePlanSmart(result.date, result, { force: true });
                else {
                    const existing = saveRes.existing as DailyPlan;
                    setDailyPlan(existing);
                }
            }
      
      if (result.slots.length > 0) {
        setExpandedSlotId(result.slots[0].plan.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "An unexpected error occurred");
    } finally {
      clearInterval(intervalId);
      setLoading(false);
    }

        // If auto-generate is enabled, pre-generate expanded sessions in background
        if (autoGenerateExpanded && result && result.slots && result.slots.length > 0) {
            (async () => {
                setAutoGenProgress({ running: true, completed: 0, total: result.slots.length, failed: 0 });
                for (const slot of result.slots) {
                    try {
                        const expanded = await generateExpandedSession(slot.plan, cohort, risks, cohort.context);
                        saveExpandedSession(result.date, slot.plan.id, expanded);
                        setAutoGenProgress(prev => ({ ...prev, completed: prev.completed + 1 }));
                    } catch (err) {
                        console.error('Auto-generate expanded session failed for slot', slot.period, err);
                        setAutoGenProgress(prev => ({ ...prev, failed: prev.failed + 1 }));
                    }
                }
                setAutoGenProgress(prev => ({ ...prev, running: false }));
            })();
        }
  };

  const handleConfirmRegenerate = async (reason: string) => {
      if (!regenDialogSlot || !dailyPlan) return;
      
      const planToUpdate = regenDialogSlot;
      setRegenDialogSlot(null); // Close dialog
      setRegeneratingId(planToUpdate.id);
      
      try {
          const newPlan = await regenerateSession(planToUpdate, reason, cohort, risks);
          
          // Update the specific slot in the daily plan
          const updatedSlots = dailyPlan.slots.map(slot => {
              if (slot.plan.id === planToUpdate.id) {
                  return { ...slot, plan: newPlan };
              }
              return slot;
          });
          
                    const updatedDailyPlan = { ...dailyPlan, slots: updatedSlots };
                    setDailyPlan(updatedDailyPlan);
                    // Smart save: prefer existing if it's newer, otherwise save
                    const saveRes = savePlanSmart(dailyPlan.date, updatedDailyPlan);
                    if (!saveRes.ok && saveRes.conflict) {
                        const overwrite = window.confirm('This daily plan was updated elsewhere since you opened it. Overwrite with changes? OK=Overwrite, Cancel=Keep remote.');
                        if (overwrite) savePlanSmart(dailyPlan.date, updatedDailyPlan, { force: true });
                        else {
                            // Keep remote version and update UI
                            setDailyPlan(saveRes.existing as DailyPlan);
                        }
                    }
          try {
              // Clear any cached expanded session for this slot — it's stale after regeneration
              clearExpandedSession(dailyPlan.date, planToUpdate.id);
          } catch (e) {
              // ignore
          }
          
      } catch (e) {
          alert("Failed to regenerate session. Try again.");
      } finally {
          setRegeneratingId(null);
      }
  };

  const handleCopyHandover = () => {
    if (!dailyPlan) return;
    const activeRisks = risks.filter(r => r.active).map(r => r.label).join(", ");
    
    const summary = 
`🏥 SHIFT HANDOVER SUMMARY
Date: ${dailyPlan.date}
Cohort: ${cohort.count} Patients | Age: ${cohort.ageRange}
Energy: ${cohort.energy} | Staff: ${cohort.staffCount}
Active Risks: ${activeRisks || "None Specified"}

📋 SESSION PLAN
${dailyPlan.slots.map(s => `
[${s.period}] ${s.plan.title}
Goal: ${s.plan.therapeuticGoal}
Safety Alert: ${s.plan.safetyAlert}
Status: Planned
`).join('')}
`;
    navigator.clipboard.writeText(summary);
    alert("Shift summary copied to clipboard!");
  };

    const handleExportBackup = () => {
        const exported = exportAllData();
        if (!exported.ok) {
            alert('Failed to prepare backup.');
            return;
        }

        const blob = new Blob([JSON.stringify({ exported: exported.data, timestamp: new Date().toISOString() }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `unit-copilot-backup-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImportBackup = (file: File | null) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(String(reader.result));
                const payload = parsed.exported || parsed;
                const res = importData(payload);
                if (!res.ok) throw new Error(res.error || 'Import failed');
                alert('Import successful. Reloading plan view.');
                // Reload current date plan
                const dateKey = currentDate.toLocaleDateString();
                const saved = loadPlan(dateKey);
                setDailyPlan(saved);
            } catch (e) {
                alert('Failed to import backup file.');
            }
        };
        reader.readAsText(file);
    };

    const handleDownloadPDF = () => {
        if (!dailyPlan) { alert('No plan to export'); return; }

        // Small helper: convert a tiny subset of Markdown to simple HTML for printable guides
        const mdToHtml = (md: string) => {
            if (!md) return '';
            let out = md
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            // Headings
            out = out.replace(/^### (.*$)/gim, '<h4>$1</h4>');
            out = out.replace(/^## (.*$)/gim, '<h3>$1</h3>');
            out = out.replace(/^# (.*$)/gim, '<h2>$1</h2>');
            // Bold
            out = out.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
            // Lists (unordered)
            out = out.replace(/^[-\*] (.*$)/gim, '<li>$1</li>');
            // Ordered lists (1. )
            out = out.replace(/^\d+\. (.*$)/gim, '<li>$1</li>');
            // Paragraphs - split by double newline
            const blocks = out.split(/\n\s*\n/).map(b => b.trim());
            const htmlBlocks = blocks.map(b => {
                if (b.startsWith('<h2') || b.startsWith('<h3') || b.startsWith('<h4')) return b;
                if (b.match(/<li>/)) {
                    // wrap list items in <ul>
                    const items = b.match(/<li>.*?<\/li>/g) || [];
                    return `<ul>${items.join('')}</ul>`;
                }
                // single newlines -> <br/>
                return `<p>${b.replace(/\n/g, '<br/>')}</p>`;
            });
            return htmlBlocks.join('\n');
        };

        const parts: string[] = [];
        parts.push(`<header class="plan-header"><h1>${dailyPlan.date} — Session Plan</h1><p class="meta">Cohort: ${cohort.count} | Age: ${cohort.ageRange} | Staff: ${cohort.staffCount} | Energy: ${cohort.energy}</p></header>`);
        for (const slot of dailyPlan.slots) {
            parts.push(`<section class="slot">`);
            parts.push(`<h2 class="slot-title">${slot.period} — ${slot.plan.title}</h2>`);
            parts.push(`<p class="goal"><strong>Goal:</strong> ${slot.plan.therapeuticGoal}</p>`);
            parts.push(`<p class="safety"><strong>Safety:</strong> ${slot.plan.safetyAlert}</p>`);
            if (slot.plan.instructions && slot.plan.instructions.length > 0) {
                parts.push('<h3>Steps</h3>');
                parts.push('<ol class="steps">' + slot.plan.instructions.map(s => `<li>${s}</li>`).join('') + '</ol>');
            }

            // Include cached expanded printable if exists
            try {
                const cached = loadExpandedSession(dailyPlan.date, slot.plan.id);
                if (cached && cached.printable && cached.printable.content) {
                    parts.push(`<h3>Expanded Guide — ${cached.specialist}</h3>`);
                    parts.push(`<div class="expanded">${mdToHtml(cached.printable.content)}</div>`);
                }
            } catch (e) {
                // ignore caching errors
            }

            parts.push('</section>');
        }

        const style = `
            body{font-family: Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; color:#111; padding:24px;}
            .plan-header{border-bottom:1px solid #eee;padding-bottom:8px;margin-bottom:12px}
            h1{font-size:22px;margin:0 0 6px}
            .meta{color:#555;margin:0 0 12px}
            .slot{page-break-after:always;padding:10px 0;border-bottom:1px dashed #eee}
            .slot-title{font-size:18px;margin:0 0 6px}
            .goal,.safety{margin:4px 0;color:#222}
            .steps{margin:8px 0 12px}
            .expanded{background:#fff;border:1px solid #f0f0f0;padding:12px;border-radius:6px}
            h2{color:#0f172a}
            h3{color:#0b1220}
            ul{margin:6px 0 12px}
            p{line-height:1.4}
            @media print { .slot{page-break-after:always} .plan-header{page-break-after:avoid} }
        `;

        const html = `<!doctype html><html><head><meta charset="utf-8"><title>${dailyPlan.date} - Plan</title><style>${style}</style></head><body>${parts.join('\n')}</body></html>`;

        const win = window.open('', '_blank');
        if (!win) { alert('Unable to open window - popup blocked.'); return; }
        win.document.write(html);
        win.document.close();
        setTimeout(() => { try { win.print(); } catch (e) { /* ignore */ } }, 600);
    };

        const handleOpenCalendar = () => setShowCalendar(true);
        const handleSelectDateFromCalendar = (dateStr: string) => {
            try {
                const d = new Date(dateStr);
                if (!isNaN(d.getTime())) setCurrentDate(d);
                setShowCalendar(false);
                const saved = loadPlan(dateStr);
                setDailyPlan(saved);
                setExpandedSlotId(null);
            } catch (e) {
                setShowCalendar(false);
            }
        };

  // --------------------------------------------------------------------------
  // VIEW: DAILY SCHEDULE
  // --------------------------------------------------------------------------
  if (dailyPlan) {
    return (
        <div className="min-h-screen bg-slate-50 p-4 md:p-8">
            {requireApiKey && <ApiKeyModal />}
            {/* API key is required on first run; use the blocking modal instead. */}
            <RegenerateDialog 
                isOpen={!!regenDialogSlot} 
                onClose={() => setRegenDialogSlot(null)}
                onConfirm={handleConfirmRegenerate}
                title={regenDialogSlot?.title || "Session"}
            />

            <header className="max-w-4xl mx-auto mb-6 flex flex-col md:flex-row items-center justify-between gap-4 print:hidden">
                 <button 
                    onClick={() => setDailyPlan(null)}
                          onMouseDown={() => setExpandedSlotId(null)}
                          className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-medium transition-colors self-start md:self-auto"
                 >
                    <ChevronLeft size={20} /> New Plan
                 </button>
                <div className="flex items-center gap-4">
                    <button aria-label="Open calendar" onClick={handleOpenCalendar} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><Calendar size={18} /></button>
                    <button aria-label="Previous day" onClick={() => changeDate(-1)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><ChevronLeft size={20}/></button>
                    <div className="flex items-center gap-2 text-indigo-600 font-bold text-xl tracking-tight">
                        <Calendar size={24} />
                        <span>{currentDate.toLocaleDateString()}</span>
                    </div>
                    <button aria-label="Next day" onClick={() => changeDate(1)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><ChevronRight size={20}/></button>
                    <label className="flex items-center gap-2 text-sm text-slate-500 ml-4">
                        <input aria-label="Auto-generate session guides" type="checkbox" checked={autoGenerateExpanded} onChange={(e) => { setAutoGenerateExpanded(e.target.checked); saveSetting('autoGenerateExpanded', e.target.checked); }} />
                        <span className="text-xs">Auto generate guides</span>
                        {autoGenProgress.running && <Loader2 className="ml-2 animate-spin text-indigo-500" size={16} />}
                    </label>
                </div>
                <button 
                    onClick={handleCopyHandover}
                    className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-50 hover:text-indigo-600 transition-colors self-end md:self-auto shadow-sm"
                >
                    <ClipboardCopy size={16} /> Copy Shift Summary
                </button>
                <div className="flex items-center gap-2">
                    <button onClick={handleDownloadPDF} className="bg-indigo-600 text-white px-3 py-2 rounded-md text-sm hover:bg-indigo-700">Download PDF</button>
                    <button onClick={handleExportBackup} className="bg-slate-100 text-slate-700 px-3 py-2 rounded-md text-sm hover:bg-slate-200">Export Backup</button>
                    <label className="bg-slate-50 px-3 py-2 rounded-md text-sm hover:bg-slate-100 cursor-pointer">
                        <input type="file" accept="application/json" onChange={(e) => handleImportBackup(e.target.files ? e.target.files[0] : null)} className="hidden" />
                        Import Backup
                    </label>
                    <button onClick={() => setVentOpen(true)} className="bg-amber-500 text-white px-3 py-2 rounded-md text-sm hover:bg-amber-600">Vent</button>
                </div>
            </header>

            {showCalendar && (
                <PlanCalendar initialDate={currentDate} onSelectDate={handleSelectDateFromCalendar} onClose={() => setShowCalendar(false)} />
            )}

            {ventOpen && (
                <VentModal onClose={() => setVentOpen(false)} />
            )}

            <div className="max-w-4xl mx-auto space-y-8 pb-20">
                {/* Auto-generate confirmation / progress banner */}
                {autoGenProgress.total > 0 && !autoGenProgress.running && (
                    <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 p-4 rounded-lg mb-4 flex items-center justify-between">
                        <div>
                            <strong>Session guides prepared:</strong> {autoGenProgress.completed} / {autoGenProgress.total}
                            {autoGenProgress.failed > 0 && <span className="ml-2 text-sm text-amber-600">{autoGenProgress.failed} failed</span>}
                        </div>
                        <div>
                            <button onClick={() => setAutoGenProgress({ running: false, completed: 0, total: 0, failed: 0 })} className="bg-emerald-600 text-white px-3 py-1 rounded-md text-sm">Dismiss</button>
                        </div>
                    </div>
                )}

                {autoGenProgress.running && (
                    <div className="bg-white border border-slate-100 p-3 rounded-md mb-4 flex items-center gap-3">
                        <Loader2 className="animate-spin text-indigo-500" size={18} />
                        <div className="text-sm text-slate-600">Preparing session guides ({autoGenProgress.completed}/{autoGenProgress.total})</div>
                    </div>
                )}
                {/* Timeline Header */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 text-center print:hidden">
                    <p className="text-slate-500 font-medium">
                        {cohort.count} Patients ({cohort.ageRange}) • Staff: {cohort.staffCount} • {cohort.energy}
                    </p>
                </div>

                <div className="space-y-6 relative before:absolute before:left-4 md:before:left-8 before:top-4 before:bottom-4 before:w-0.5 before:bg-slate-200 before:print:hidden">
                    {dailyPlan.slots.map((slot, idx) => (
                        <div key={idx} className="relative pl-12 md:pl-20">
                            {/* Timeline Dot & Time */}
                            <div className="absolute left-0 top-0 flex flex-col items-center w-8 md:w-16 print:hidden">
                                <div className="w-8 h-8 rounded-full bg-white border-4 border-indigo-100 flex items-center justify-center z-10">
                                    <div className="w-3 h-3 bg-indigo-500 rounded-full"></div>
                                </div>
                            </div>
                            
                            <div className="mb-2">
                                <span className="text-sm font-bold text-indigo-600 uppercase tracking-wider">{slot.period}</span>
                            </div>
                            
                            <SessionCard 
                                plan={slot.plan} 
                                cohort={cohort}
                                risks={risks}
                                date={dailyPlan.date}
                                isExpanded={expandedSlotId === slot.plan.id}
                                onToggleExpand={() => setExpandedSlotId(expandedSlotId === slot.plan.id ? null : slot.plan.id)}
                                onRegenerateRequest={setRegenDialogSlot}
                                isRegenerating={regeneratingId === slot.plan.id}
                                onSavePlan={(updated) => { setDailyPlan(updated); }}
                            />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
  }

  // --------------------------------------------------------------------------
  // VIEW: INPUT DASHBOARD
  // --------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center p-4 md:p-6">
            {requireApiKey && <ApiKeyModal />}
      <main className="w-full max-w-lg bg-white rounded-2xl shadow-xl shadow-slate-200/50 overflow-hidden">
        
        {/* Header */}
        <div className="bg-indigo-600 p-6 text-white text-center">
            <div className="flex items-center justify-center gap-2 mb-2 opacity-90">
                <Sparkles size={20} />
                <span className="font-bold tracking-wide text-sm uppercase">Facilitator Assistant</span>
            </div>
            <h1 className="text-2xl font-bold">Daily Planner</h1>
            <div className="flex justify-center items-center gap-4 mt-2">
                 <button aria-label="Previous date" onClick={() => changeDate(-1)} className="text-indigo-200 hover:text-white"><ChevronLeft size={20}/></button>
                 <p className="text-indigo-100 text-sm font-bold">{currentDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                 <button aria-label="Next date" onClick={() => changeDate(1)} className="text-indigo-200 hover:text-white"><ChevronRight size={20}/></button>
            </div>
        </div>

        <div className="p-6 space-y-8">
            
            {/* Cohort Section */}
            <section className="space-y-4">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <Users size={14} /> Unit Details
                </h2>
                
                <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-1">
                        <label htmlFor="cohort-count" className="block text-xs font-bold text-slate-500 mb-1">Count</label>
                        <input id="cohort-count" title="Count" placeholder="Number of patients" 
                            type="number" 
                            min="1" 
                            value={cohort.count}
                            onChange={(e) => setCohort({...cohort, count: parseInt(e.target.value) || 0})}
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-800 text-center"
                        />
                    </div>
                    <div className="col-span-1">
                        <label htmlFor="cohort-age" className="block text-xs font-bold text-slate-500 mb-1">Age Range</label>
                        <input id="cohort-age" title="Age range" placeholder="e.g. 12-16" 
                            type="text" 
                            value={cohort.ageRange}
                            onChange={(e) => setCohort({...cohort, ageRange: e.target.value})}
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-800 text-center"
                        />
                    </div>
                    <div className="col-span-1 relative">
                        <label htmlFor="cohort-staff" className="block text-xs font-bold text-indigo-600 mb-1 flex items-center gap-1">
                            Staff <UserPlus size={10}/>
                        </label>
                        <input id="cohort-staff" title="Staff count" placeholder="Number of staff" 
                            
                            type="number" 
                            min="1" 
                            max="10"
                            value={cohort.staffCount}
                            onChange={(e) => setCohort({...cohort, staffCount: parseInt(e.target.value) || 1})}
                            className="w-full p-2.5 bg-indigo-50 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-indigo-700 text-center"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2">Unit Vibe</label>
                    <div className="grid grid-cols-1 gap-2">
                        {Object.values(EnergyLevel).map((level) => (
                            <button
                                key={level}
                                onClick={() => setCohort({...cohort, energy: level})}
                                className={`p-2.5 rounded-lg text-sm font-medium transition-all text-left flex items-center justify-between
                                    ${cohort.energy === level 
                                        ? 'bg-indigo-50 border border-indigo-200 text-indigo-700 ring-1 ring-indigo-500' 
                                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                                    }`}
                            >
                                {level}
                                {cohort.energy === level && <Activity size={16} />}
                            </button>
                        ))}
                    </div>
                </div>

                 <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Additional Context</label>
                    <textarea 
                        value={cohort.context}
                        onChange={(e) => setCohort({...cohort, context: e.target.value})}
                        placeholder="e.g. Raining heavily, near Christmas, low staffing today..."
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700 text-sm h-16 resize-none"
                    />
                </div>
            </section>

            <hr className="border-slate-100" />

            {/* Risks Section */}
            <section className="space-y-4">
                 <h2 className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-2">
                    <Activity size={14} /> Risk Assessment
                </h2>
                <div className="space-y-3">
                    {risks.map(risk => (
                        <RiskToggle key={risk.id} risk={risk} onToggle={handleToggleRisk} />
                    ))}
                </div>
            </section>

            {/* Error Message */}
            {error && (
                <div className="p-4 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 flex items-start gap-2">
                    <span className="font-bold">Error:</span> {error}
                </div>
            )}

            {/* Action Button */}
            <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold text-lg py-4 rounded-xl shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-3 relative overflow-hidden"
            >
                {loading ? (
                    <div className="flex flex-col items-center justify-center w-full animate-fade-in">
                        <div className="flex items-center gap-2 mb-1">
                             <Loader2 className="animate-spin" size={20} />
                             <span>Working...</span>
                        </div>
                        <span className="text-xs font-medium text-indigo-200 animate-pulse">{loadingMsg}</span>
                    </div>
                ) : (
                    <>
                        <Calendar />
                        Generate Day Plan
                    </>
                )}
            </button>
        </div>
      </main>
      
      <footer className="mt-8 text-slate-400 text-xs text-center max-w-xs">
        <p>AI-generated content. Always verify output against unit clinical protocols.</p>
      </footer>
    </div>
  );
};

export default App;
