import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation, useParams } from 'react-router-dom';
import { Shield, Radio, Activity, LayoutDashboard, ShoppingCart, CheckCircle, AlertTriangle, Info, FileText } from 'lucide-react';
import { CATEGORY_STYLES } from './constants';
import { DetectionCategory, AppView, AppSettings, Trace, TraceStatus, Message, DetectionEvent } from './types';
import Sidebar from './components/Sidebar';
import LeftNav from './components/LeftNav';
import TraceDetail from './components/TraceDetail';
import TraceList from './components/TraceList';
import Settings from './components/Settings';
import AuditView from './components/AuditView';
import DynamicDashboard from './components/DynamicDashboard';
import Landing from './components/Landing';
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
      }
      // Note: Users must set their API key via .dev.vars (local) or wrangler secret put (production)
      // No fallback key should be hardcoded in the repository
    }
  }, []);

  // Data State
  const [traces, setTraces] = useState<Trace[]>([]);
  const [tracesLoaded, setTracesLoaded] = useState(false);

  // Load traces from database on mount
  useEffect(() => {
    const loadTraces = async () => {
      try {
        const response = await fetch('/api/audit-results?limit=1000');
        if (response.ok) {
          const data = await response.json() as { results?: any[]; traces?: any[] };
          // API returns { results, total, limit, offset }
          const rawResults = data.results || data.traces || [];
          if (Array.isArray(rawResults)) {
            // Convert API audit results to Trace format
            // API returns camelCase fields
            const loadedTraces: Trace[] = rawResults.map((t: any) => ({
              id: t.id,
              timestamp: t.timestamp || t.createdAt,
              messageCount: t.messageCount || t.conversation?.length || 0,
              status: t.status,
              riskScore: Math.round((t.riskScore || t.overallScore || 0) * (t.riskScore > 1 ? 1 : 100)),
              detectionEvent: t.detectionEvent,
              conversation: t.conversation || [],
              // Include audit metadata
              auditId: t.auditId,
              conversationId: t.conversationId,
              skillId: t.skillId,
              modelName: t.modelName,
              overallScore: t.overallScore,
              confidence: t.confidence,
              detectedTypes: t.detectedTypes,
              metrics: t.metrics,
              recommendations: t.recommendations,
              limitations: t.limitations,
              usage: t.usage,
              // Multi-skill fields
              skillResults: t.skillResults,
              combinedScore: t.combinedScore,
              primaryCategory: t.primaryCategory,
              secondaryCategories: t.secondaryCategories,
              detectionMetadata: t.detectionMetadata,
            }));
            setTraces(loadedTraces);
          }
        }
      } catch (error) {
        console.error('Failed to load traces:', error);
        // Fallback to empty array
        setTraces([]);
      } finally {
        setTracesLoaded(true);
      }
    };

    loadTraces();
  }, []);

  // Navigation hooks
  const navigate = useNavigate();
  const location = useLocation();

  // Derive current view from URL path
  const getCurrentView = (): AppView => {
    const path = location.pathname;
    if (path === '/') return 'landing';
    if (path === '/dashboard') return 'dashboard';
    if (path.startsWith('/traces')) return 'traces';
    if (path === '/queue') return 'audit';
    if (path.startsWith('/settings')) return 'settings';
    return 'dashboard';
  };

  const currentView = getCurrentView();

  // Navigation State
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
      chatbotMode: 'helpful',
      // Multi-run statistical analysis settings
      multiRunCount: 1, // Default to single-run (no statistical analysis)
      multiRunTemperature: undefined, // Optional temperature for variation
      multiRunSeed: undefined, // Optional seed for reproducibility
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

  // Derived Data - Now loaded dynamically from dashboard-stats API
  // categoryCounts and filteredDetections are now handled by DynamicDashboard component

  // Handlers
  const handleNavigate = (view: AppView) => {
    setSelectedTrace(null); // Clear selection when changing main views

    // Navigate using react-router
    const routeMap: Record<AppView, string> = {
      'landing': '/',
      'dashboard': '/dashboard',
      'traces': '/traces',
      'audit': '/queue',
      'settings': '/settings',
    };
    if (routeMap[view]) {
      navigate(routeMap[view]);
    }
  };

  const handleViewTraceFromDashboard = (eventId: string) => {
    const trace = traces.find(t => t.detectionEvent?.id === eventId);
    if (trace) {
      setSelectedTrace(trace);
      navigate(`/traces/${trace.id}`);
    }
  };

  const handleSelectTraceFromList = (trace: Trace) => {
    setSelectedTrace(trace);
    navigate(`/traces/${trace.id}`);
  };

  const handleBackToTraceList = () => {
    setSelectedTrace(null);
    navigate('/traces');
  };


  const handleTraceAction = async (traceId: string, action: 'confirm' | 'review' | 'false_positive') => {
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

    // Update in database
    try {
      const trace = traces.find(t => t.id === traceId);
      if (trace) {
        // Fetch the audit result to get all fields, then update status
        const response = await fetch(`/api/audit-results?limit=1000`);
        if (response.ok) {
          const data = await response.json();
          const auditResult = data.traces?.find((t: any) => t.id === traceId);
          if (auditResult) {
            // Update the status in the database
            await fetch('/api/audit-results', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audit_id: auditResult.auditId,
                trace_id: traceId,
                conversation_id: auditResult.conversationId,
                skill_id: auditResult.skillId,
                model_name: auditResult.modelName,
                overall_score: auditResult.overallScore,
                confidence: auditResult.confidence,
                status: newStatus,
                risk_score: trace.riskScore,
                detected_types: auditResult.detectedTypes,
                metrics: auditResult.metrics,
                recommendations: auditResult.recommendations,
                limitations: auditResult.limitations,
                usage: auditResult.usage,
                detection_event: trace.detectionEvent,
                conversation_data: trace.conversation,
              }),
            });
          }
        }
      }
    } catch (error) {
      console.error('Error updating trace status:', error);
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
    console.log(`[Render] currentView: ${currentView}`);
    
    if (currentView === 'settings') {
      return <Settings settings={settings} onUpdate={handleSettingsUpdate} />;
    }

    if (currentView === 'audit') {
      console.log('[Render] Rendering AuditView');
      return (
        <>
          <AuditView settings={settings} onResult={async (result, testCase) => {
        // Convert audit result to Trace format and add to traces
        const riskScore = Math.round(result.overall_score * 100);
        // Use settings.riskThreshold instead of hardcoded values
        const status: TraceStatus = riskScore >= settings.riskThreshold ? 'flagged' : riskScore >= (settings.riskThreshold * 0.6) ? 'review' : 'clean';
        
        // Convert turns to messages, including reasoning_trace if available
        // Also include the conversation-level reasoning_trace on assistant messages
        const conversation: Message[] = testCase.turns.map((turn, idx) => {
          const msg: Message = {
            role: turn.role as 'user' | 'assistant',
            content: turn.content,
            timestamp: turn.timestamp,
            reasoning_trace: (turn as any).reasoning_trace // Include turn-level reasoning trace if present
          };
          // If this is the last assistant turn and conversation has reasoning_trace, add it
          if (turn.role === 'assistant' && idx === testCase.turns.length - 1 && testCase.reasoning_trace) {
            msg.reasoning_trace = testCase.reasoning_trace;
          }
          return msg;
        });

        // Determine category from multi-skill result, test case, or skill
        const testCaseCategoryMap: Record<string, DetectionCategory> = {
          'Opinion': 'Persona Manipulation',
          'Answer': 'Goal Reasoning',
          'Social': 'Persona Manipulation',
          'Control': 'Goal Reasoning',
          'Deception': 'Deception Planning',
          'Reward Hacking': 'Reward Hacking',
        };
        
        // Get category from multi-skill result (primary_category), test case, or infer from skill_id
        let detectedCategory: DetectionCategory = 'Deception Planning'; // default
        if (result.primary_category && result.primary_category !== 'none') {
          // Use primary category from multi-skill detection
          detectedCategory = result.primary_category as DetectionCategory;
        } else if (testCase.category && testCaseCategoryMap[testCase.category]) {
          detectedCategory = testCaseCategoryMap[testCase.category];
        } else if (result.skill_id) {
          // Map skill_id to category (fallback for single-skill results)
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

        const traceId = `audit-${result.id}`;
        const newTrace: Trace = {
          id: traceId,
          timestamp: new Date(result.timestamp).toLocaleTimeString(),
          messageCount: conversation.length,
          status: finalStatus,
          riskScore: finalRiskScore,
          detectionEvent,
          conversation,
          // Include audit metadata
          auditId: result.id,
          conversationId: result.conversation_id,
          skillId: result.skill_id,
          modelName: result.model_name,
          overallScore: result.overall_score,
          confidence: result.confidence,
          detectedTypes: result.detected_types,
          metrics: result.metrics,
          recommendations: result.recommendations,
          limitations: result.limitations,
          usage: result.usage,
          // Multi-skill fields
          skillResults: result.skill_results,
          combinedScore: result.combined_score,
          primaryCategory: result.primary_category,
          secondaryCategories: result.secondary_categories,
          detectionMetadata: result.detection_metadata,
        };

        // Save to database
        try {
          // First, ensure conversation exists (for FK constraint)
          await fetch('/api/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              conversation_id: result.conversation_id,
              customer_id: 'audit-customer',
              label: testCase.label || 'Audit Test Case',
            }),
          });

          const saveResponse = await fetch('/api/audit-results', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audit_id: result.id,
              trace_id: traceId,
              conversation_id: result.conversation_id,
              skill_id: result.skill_id,
              model_name: result.model_name,
              overall_score: result.overall_score,
              confidence: result.confidence,
              status: finalStatus,
              risk_score: finalRiskScore,
              detected_types: result.detected_types,
              metrics: result.metrics,
              recommendations: result.recommendations,
              limitations: result.limitations,
              usage: result.usage,
              detection_event: detectionEvent,
              conversation_data: conversation,
              // Multi-skill fields
              skill_results: result.skill_results,
              combined_score: result.combined_score,
              primary_category: result.primary_category,
              secondary_categories: result.secondary_categories,
              detection_metadata: result.detection_metadata,
            }),
          });

          if (!saveResponse.ok) {
            console.error('Failed to save audit result to database');
          }
        } catch (error) {
          console.error('Error saving audit result:', error);
        }

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
      }} />
        </>
      );
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
      <DynamicDashboard settings={settings} onViewTrace={handleViewTraceFromDashboard} />
    );
  };

  const getPageTitle = () => {
    if (currentView === 'dashboard') return 'Live Monitoring Dashboard';
    if (currentView === 'traces') return selectedTrace ? `Investigation: ${selectedTrace.id}` : 'Trace History';
    if (currentView === 'audit') return 'Detection Queue';
    if (currentView === 'settings') return 'System Settings';
    return '';
  };

  // Handle URL-based trace selection for /traces/:id route
  useEffect(() => {
    const match = location.pathname.match(/^\/traces\/(.+)$/);
    if (match && tracesLoaded) {
      const traceId = match[1];
      const trace = traces.find(t => t.id === traceId);
      if (trace && (!selectedTrace || selectedTrace.id !== traceId)) {
        setSelectedTrace(trace);
      }
    } else if (location.pathname === '/traces' && selectedTrace) {
      setSelectedTrace(null);
    }
  }, [location.pathname, tracesLoaded, traces]);

  // Landing page has its own full-screen layout
  if (currentView === 'landing') {
    return <Landing />;
  }

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