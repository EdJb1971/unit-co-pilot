import React, { useState, useEffect } from 'react';
import { CohortState, EnergyLevel, RiskFactor, DailyPlan, SessionPlan } from './types';
import { INITIAL_RISKS } from './constants';
import { generateDailyPlan, regenerateSession } from './services/geminiService';
import { savePlan, loadPlan } from './services/storageService';
import { RiskToggle } from './components/RiskToggle';
import { SessionCard } from './components/SessionCard';
import { RegenerateDialog } from './components/RegenerateDialog';
import { Sparkles, Users, Calendar, Activity, Loader2, ChevronLeft, ChevronRight, UserPlus, ClipboardCopy } from 'lucide-react';

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
  
  // Regeneration States
  const [regenDialogSlot, setRegenDialogSlot] = useState<SessionPlan | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  // Load plan on date change
  useEffect(() => {
    const dateKey = currentDate.toLocaleDateString();
    const saved = loadPlan(dateKey);
    setDailyPlan(saved);
    if (saved) setExpandedSlotId(null);
  }, [currentDate]);

  const handleToggleRisk = (id: string) => {
    setRisks(prev => prev.map(r => r.id === id ? { ...r, active: !r.active } : r));
  };

  const changeDate = (days: number) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + days);
    setCurrentDate(newDate);
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
      savePlan(result.date, result);
      
      if (result.slots.length > 0) {
        setExpandedSlotId(result.slots[0].plan.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "An unexpected error occurred");
    } finally {
      clearInterval(intervalId);
      setLoading(false);
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
          savePlan(dailyPlan.date, updatedDailyPlan);
          
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

  // --------------------------------------------------------------------------
  // VIEW: DAILY SCHEDULE
  // --------------------------------------------------------------------------
  if (dailyPlan) {
    return (
        <div className="min-h-screen bg-slate-50 p-4 md:p-8">
            <RegenerateDialog 
                isOpen={!!regenDialogSlot} 
                onClose={() => setRegenDialogSlot(null)}
                onConfirm={handleConfirmRegenerate}
                title={regenDialogSlot?.title || "Session"}
            />

            <header className="max-w-4xl mx-auto mb-6 flex flex-col md:flex-row items-center justify-between gap-4 print:hidden">
                 <button 
                    onClick={() => setDailyPlan(null)}
                    className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-medium transition-colors self-start md:self-auto"
                 >
                    <ChevronLeft size={20} /> New Plan
                 </button>
                <div className="flex items-center gap-4">
                    <button onClick={() => changeDate(-1)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><ChevronLeft size={20}/></button>
                    <div className="flex items-center gap-2 text-indigo-600 font-bold text-xl tracking-tight">
                        <Calendar size={24} />
                        <span>{currentDate.toLocaleDateString()}</span>
                    </div>
                    <button onClick={() => changeDate(1)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><ChevronRight size={20}/></button>
                </div>
                <button 
                    onClick={handleCopyHandover}
                    className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-50 hover:text-indigo-600 transition-colors self-end md:self-auto shadow-sm"
                >
                    <ClipboardCopy size={16} /> Copy Shift Summary
                </button>
            </header>

            <div className="max-w-4xl mx-auto space-y-8 pb-20">
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
                                isExpanded={expandedSlotId === slot.plan.id}
                                onToggleExpand={() => setExpandedSlotId(expandedSlotId === slot.plan.id ? null : slot.plan.id)}
                                onRegenerateRequest={setRegenDialogSlot}
                                isRegenerating={regeneratingId === slot.plan.id}
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
      <main className="w-full max-w-lg bg-white rounded-2xl shadow-xl shadow-slate-200/50 overflow-hidden">
        
        {/* Header */}
        <div className="bg-indigo-600 p-6 text-white text-center">
            <div className="flex items-center justify-center gap-2 mb-2 opacity-90">
                <Sparkles size={20} />
                <span className="font-bold tracking-wide text-sm uppercase">Facilitator Assistant</span>
            </div>
            <h1 className="text-2xl font-bold">Daily Planner</h1>
            <div className="flex justify-center items-center gap-4 mt-2">
                 <button onClick={() => changeDate(-1)} className="text-indigo-200 hover:text-white"><ChevronLeft size={20}/></button>
                 <p className="text-indigo-100 text-sm font-bold">{currentDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                 <button onClick={() => changeDate(1)} className="text-indigo-200 hover:text-white"><ChevronRight size={20}/></button>
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
                        <label className="block text-xs font-bold text-slate-500 mb-1">Count</label>
                        <input 
                            type="number" 
                            min="1" 
                            value={cohort.count}
                            onChange={(e) => setCohort({...cohort, count: parseInt(e.target.value) || 0})}
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-800 text-center"
                        />
                    </div>
                    <div className="col-span-1">
                        <label className="block text-xs font-bold text-slate-500 mb-1">Age Range</label>
                        <input 
                            type="text" 
                            value={cohort.ageRange}
                            onChange={(e) => setCohort({...cohort, ageRange: e.target.value})}
                            placeholder="12-16"
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-800 text-center"
                        />
                    </div>
                    <div className="col-span-1 relative">
                        <label className="block text-xs font-bold text-indigo-600 mb-1 flex items-center gap-1">
                            Staff <UserPlus size={10}/>
                        </label>
                        <input 
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
