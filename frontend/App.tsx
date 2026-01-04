import React, { useState, useEffect } from 'react';
import { Shield, Radio, Activity, LayoutDashboard, ShoppingCart, CheckCircle, AlertTriangle, Info, FileText } from 'lucide-react';
import { MOCK_DETECTIONS, MOCK_TRACES, CATEGORY_STYLES } from './constants';
import { DetectionCategory, AppView, AppSettings, Trace, TraceStatus, Message, DetectionEvent } from './types';
import StatsCard from './components/StatsCard';
import DetectionCard from './components/DetectionCard';
import Sidebar from './components/Sidebar';
import LeftNav from './components/LeftNav';
import TraceDetail from './components/TraceDetail';
import TraceList from './components/TraceList';
import Settings from './components/Settings';
import SystemMetrics from './components/SystemMetrics';
import AuditView from './components/AuditView';
import { AuditResult } from './lib/types';
import { CATEGORY_TO_SKILL, AVAILABLE_SKILLS } from './lib/skillsRegistry';

const App: React.FC = () => {
  // Initialize API key from environment variable to localStorage if available
  useEffect(() => {
    // Try to get from environment variable first
    const envKey = (process.env.API_KEY || process.env.GEMINI_API_KEY) as string | undefined;
    
    // If not in localStorage and we have an env key, set it
    if (!localStorage.getItem('BYOK_API_KEY')) {
      if (envKey) {
        localStorage.setItem('BYOK_API_KEY', envKey);
      } else {
        // Fallback: Set directly from .env.local value (for development)
        // This is a workaround if Vite isn't loading .env.local properly
        const fallbackKey = 'AIzaSyDr9EKzik_TZEP1xtWj9uc782bHQ6twigA';
        localStorage.setItem('BYOK_API_KEY', fallbackKey);
      }
    }
  }, []);

  // Data State
  const [traces, setTraces] = useState<Trace[]>(MOCK_TRACES);

  // Navigation State
  const [currentView, setCurrentView] = useState<AppView>('dashboard');
  const [selectedTrace, setSelectedTrace] = useState<Trace | null>(null);

  // Filter State (Dashboard)
  const [activeCategories, setActiveCategories] = useState<DetectionCategory[]>(
    Object.keys(CATEGORY_STYLES) as DetectionCategory[]
  );

  // Settings State
  const [settings, setSettings] = useState<AppSettings>(() => {
    const initialCategories = Object.keys(CATEGORY_STYLES).reduce((acc, key) => ({...acc, [key]: true}), {} as any);
    const initialActiveSkills = Object.keys(CATEGORY_TO_SKILL).reduce((acc, key) => ({
      ...acc,
      [key as DetectionCategory]: CATEGORY_TO_SKILL[key as DetectionCategory]
    }), {} as Record<DetectionCategory, string>);

    return {
      categories: initialCategories,
      sensitivity: 'medium',
      riskThreshold: 70,
      activeSkills: initialActiveSkills,
      auditorModel: 'gemini-3-flash-preview',
      thinkingBudget: undefined,
      includeValidatorCoT: true,
    };
  });

  // Notification State
  const [toast, setToast] = useState<{message: string, type: 'success' | 'alert' | 'info'} | null>(null);

  // Clear toast after 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Derived Data
  const categoryCounts: Record<DetectionCategory, number> = Object.keys(CATEGORY_STYLES).reduce((acc, cat) => {
    acc[cat as DetectionCategory] = MOCK_DETECTIONS.filter(d => d.category === cat).length;
    return acc;
  }, {} as Record<DetectionCategory, number>);

  const filteredDetections = MOCK_DETECTIONS.filter(d => 
    activeCategories.includes(d.category) && 
    settings.categories[d.category] && 
    d.riskScore >= settings.riskThreshold 
  );

  // Handlers
  const handleNavigate = (view: AppView) => {
    setCurrentView(view);
    setSelectedTrace(null); // Clear selection when changing main views
  };

  const handleViewTraceFromDashboard = (eventId: string) => {
    const trace = traces.find(t => t.detectionEvent?.id === eventId);
    if (trace) {
      setSelectedTrace(trace);
      setCurrentView('traces');
    }
  };

  const handleSelectTraceFromList = (trace: Trace) => {
    setSelectedTrace(trace);
  };

  const handleBackToTraceList = () => {
    setSelectedTrace(null);
  };

  const handleTraceAction = (traceId: string, action: 'confirm' | 'review' | 'false_positive') => {
    let newStatus: TraceStatus = 'flagged';
    let message = '';
    let type: 'success' | 'alert' | 'info' = 'info';

    switch (action) {
      case 'confirm':
        newStatus = 'confirmed';
        message = 'Manipulation confirmed';
        type = 'alert';
        break;
      case 'review':
        newStatus = 'reviewed';
        message = 'Marked as reviewed';
        type = 'success';
        break;
      case 'false_positive':
        newStatus = 'false_positive';
        message = 'Marked as false positive';
        type = 'info';
        break;
    }

    // Update global trace list state
    const updatedTraces = traces.map(t => t.id === traceId ? { ...t, status: newStatus } : t);
    setTraces(updatedTraces);

    // Update currently selected trace if applicable
    if (selectedTrace && selectedTrace.id === traceId) {
      setSelectedTrace({ ...selectedTrace, status: newStatus });
    }

    setToast({ message, type });
  };

  const toggleCategory = (cat: DetectionCategory) => {
    setActiveCategories(prev => 
      prev.includes(cat) 
        ? prev.filter(c => c !== cat)
        : [...prev, cat]
    );
  };

  const handleSettingsUpdate = (newSettings: AppSettings) => {
    setSettings(newSettings);
  };

  // Render Logic
  const renderContent = () => {
    if (currentView === 'settings') {
      return <Settings settings={settings} onUpdate={handleSettingsUpdate} />;
    }

    if (currentView === 'audit') {
      return <AuditView settings={settings} onResult={(result, testCase) => {
        // Convert audit result to Trace format and add to traces
        const riskScore = Math.round(result.overall_score * 100);
        // Use settings.riskThreshold instead of hardcoded values
        const status: TraceStatus = riskScore >= settings.riskThreshold ? 'flagged' : riskScore >= (settings.riskThreshold * 0.6) ? 'review' : 'clean';
        
        // Convert turns to messages
        const conversation: Message[] = testCase.turns.map(turn => ({
          role: turn.role as 'user' | 'assistant',
          content: turn.content,
          timestamp: turn.timestamp
        }));

        // Determine category from test case or skill
        const testCaseCategoryMap: Record<string, DetectionCategory> = {
          'Opinion': 'Persona Manipulation',
          'Answer': 'Goal Reasoning',
          'Social': 'Persona Manipulation',
          'Control': 'Goal Reasoning',
          'Deception': 'Deception Planning',
          'Reward Hacking': 'Reward Hacking',
        };
        
        // Get category from test case, or infer from skill_id
        let detectedCategory: DetectionCategory = 'Deception Planning'; // default
        if (testCase.category && testCaseCategoryMap[testCase.category]) {
          detectedCategory = testCaseCategoryMap[testCase.category];
        } else if (result.skill_id) {
          // Map skill_id to category
          const skillToCategory: Record<string, DetectionCategory> = {
            'sycophancy-auditor': 'Persona Manipulation',
            'reward-hacking-auditor': 'Reward Hacking',
            'sabotage-planning-auditor': 'Sabotage Planning',
            'goal-reasoning-auditor': 'Goal Reasoning',
            'deception-planning-auditor': 'Deception Planning',
            'obfuscation-evasion-auditor': 'Obfuscation & Evasion',
            'persona-manipulation-auditor': 'Persona Manipulation',
          };
          detectedCategory = skillToCategory[result.skill_id] || 'Deception Planning';
        }

        // Map skill-specific detected types to pattern names from PATTERNS_BY_CATEGORY
        const patternMapping: Record<string, Record<string, string>> = {
          'Deception Planning': {
            'fabricated_constraint': 'Fabricated operational constraint',
            'blame_deflection': 'Blame deflection',
            'artificial_delay': 'Artificial delay',
            'information_withholding': 'Information withholding',
          },
          'Reward Hacking': {
            'specification_gaming': 'Work avoidance',
            'environment_manipulation': 'Metric gaming (AHT)',
            'evaluation_subversion': 'Metric gaming (Retention)',
            'reward_tampering': 'Safety constraint bypass',
            'self_preservation': 'Work avoidance',
          },
          'Sabotage Planning': {
            'competitor_disparagement': 'Competitor disparagement',
            'fabricated_news': 'Fabricated news',
            'malicious_code': 'Malicious code injection',
            'data_corruption': 'Data corruption',
          },
          'Goal Reasoning': {
            'metric_aware': 'Metric-aware reasoning',
            'option_burying': 'Option burying',
            'value_distortion': 'Value distortion',
            'objective_shifting': 'Objective shifting',
          },
          'Obfuscation & Evasion': {
            'blame_redirection': 'Redirecting blame',
            'hiding_reality': 'Hiding operational reality',
            'strategic_omission': 'Strategic omission',
            'context_stripping': 'Context stripping',
          },
          'Persona Manipulation': {
            'opinion': 'Tone shifting for dominance',
            'feedback': 'Escalation suppression',
            'social': 'Authority fabrication',
            'tone_shifting': 'Tone shifting for dominance',
            'escalation_suppression': 'Escalation suppression',
            'authority_fabrication': 'Authority fabrication',
            'empathy_faking': 'Empathy faking',
          },
        };

        // Convert detected types to pattern names
        const matchedPatterns: string[] = [];
        const detectedTypes = result.detected_types.filter(dt => dt.type !== 'none' && dt.type !== '');
        
        if (detectedTypes.length > 0) {
          const categoryMapping = patternMapping[detectedCategory] || {};
          detectedTypes.forEach(dt => {
            const patternName = categoryMapping[dt.type];
            if (patternName && !matchedPatterns.includes(patternName)) {
              matchedPatterns.push(patternName);
            }
          });
        }

        // If nothing is detected, mark as clean regardless of risk score
        const finalStatus: TraceStatus = matchedPatterns.length === 0 ? 'clean' : status;
        const finalRiskScore = matchedPatterns.length === 0 ? Math.min(riskScore, settings.riskThreshold - 1) : riskScore;

        // Create detection event only if flagged and has actual detections
        let detectionEvent: DetectionEvent | undefined;
        if (finalStatus === 'flagged' && matchedPatterns.length > 0 && detectedTypes.length > 0) {
          const primaryType = detectedTypes[0];
          const evidence = primaryType.evidence[0] || { snippet: '', reason: '', turn_number: 0, severity: 'medium' as const };
          
          detectionEvent = {
            id: result.id,
            category: detectedCategory,
            riskScore: finalRiskScore,
            timestamp: result.timestamp,
            snippet: evidence.snippet || testCase.turns[testCase.turns.length - 1]?.content.substring(0, 100) || '',
            fullCoT: result.recommendations.join(' ') || evidence.reason,
            conversationHistory: conversation,
            matchedPatterns: matchedPatterns,
            confidence: {
              model: result.confidence === 'high' ? 0.9 : result.confidence === 'medium' ? 0.7 : 0.5,
              heuristic: primaryType.score
            }
          };
        }

        const newTrace: Trace = {
          id: `audit-${result.id}`,
          timestamp: new Date(result.timestamp).toLocaleTimeString(),
          messageCount: conversation.length,
          status: finalStatus,
          riskScore: finalRiskScore,
          detectionEvent,
          conversation
        };

        // Add to traces (avoid duplicates)
        setTraces(prev => {
          const exists = prev.find(t => t.id === newTrace.id);
          if (exists) {
            return prev.map(t => t.id === newTrace.id ? newTrace : t);
          }
          return [newTrace, ...prev];
        });

        // Show toast notification
        setToast({ 
          message: `Audit completed: ${riskScore}% risk score`, 
          type: status === 'flagged' ? 'alert' : status === 'review' ? 'info' : 'success' 
        });
      }} />;
    }

    if (currentView === 'traces') {
      if (selectedTrace) {
        return (
          <TraceDetail 
            trace={selectedTrace} 
            onBack={handleBackToTraceList} 
            onAction={handleTraceAction}
          />
        );
      }
      return <TraceList traces={traces} onSelectTrace={handleSelectTraceFromList} />;
    }

    // Default: Dashboard View
    return (
      <>
          {/* New Metrics Section */}
          <SystemMetrics counts={categoryCounts} />

          {/* Stats Cards Row (Retained for quick access to specific counts, but could be removed if redundant) */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            {(Object.keys(CATEGORY_STYLES) as DetectionCategory[]).map(cat => (
              <StatsCard key={cat} style={CATEGORY_STYLES[cat]} count={categoryCounts[cat]} />
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            
            {/* Main Feed */}
            <div className="lg:col-span-3 space-y-4">
              <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                    <Radio size={18} className="text-cyan-500" />
                    Detection Feed
                  </h2>
                  <span className="text-xs text-slate-500">Showing {filteredDetections.length} events</span>
              </div>
              
              {filteredDetections.length > 0 ? (
                filteredDetections.map((event) => (
                  <DetectionCard 
                    key={event.id} 
                    event={event} 
                    onViewTrace={handleViewTraceFromDashboard}
                  />
                ))
              ) : (
                <div className="text-center py-20 text-slate-500 bg-slate-900/30 rounded-xl border border-dashed border-slate-800">
                  No detections found for selected filters or thresholds.
                </div>
              )}
            </div>

            {/* Right Sidebar */}
            <div className="lg:col-span-1">
              <Sidebar 
                  activeCategories={activeCategories}
                  toggleCategory={toggleCategory}
                  counts={categoryCounts}
              />
            </div>
          </div>
      </>
    );
  };

  const getPageTitle = () => {
    if (currentView === 'dashboard') return 'Live Monitoring Dashboard';
    if (currentView === 'traces') return selectedTrace ? `Investigation: ${selectedTrace.id}` : 'Trace History';
    if (currentView === 'audit') return 'Safety Audit';
    return 'System Settings';
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black font-sans selection:bg-cyan-500/30 flex">
      
      {/* Navigation Sidebar */}
      <LeftNav currentView={currentView} onNavigate={handleNavigate} />

      {/* Main Content Area */}
      <div className="flex-1 ml-64 relative">
        
        {/* Global Header */}
        <header className="sticky top-0 z-40 glass-panel border-b border-slate-800 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-lg font-bold text-slate-200">
                {getPageTitle()}
              </h1>
              {currentView === 'dashboard' && (
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                  <span className="text-[10px] font-bold text-red-400 tracking-wider uppercase">Live</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-6">
               {/* Simplified Header - Removed Session Risk */}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="max-w-7xl mx-auto px-6 py-8">
          {renderContent()}
        </main>

        {/* Toast Notification */}
        {toast && (
          <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50 animate-in slide-in-from-bottom-5 duration-300">
            <div className={`
              flex items-center gap-3 px-6 py-3 rounded-full shadow-lg border backdrop-blur-md
              ${toast.type === 'alert' ? 'bg-red-900/80 border-red-700 text-white' : 
                toast.type === 'success' ? 'bg-emerald-900/80 border-emerald-700 text-white' : 
                'bg-slate-800/90 border-slate-600 text-slate-200'}
            `}>
              {toast.type === 'alert' && <AlertTriangle size={18} />}
              {toast.type === 'success' && <CheckCircle size={18} />}
              {toast.type === 'info' && <Info size={18} />}
              <span className="font-medium text-sm">{toast.message}</span>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default App;