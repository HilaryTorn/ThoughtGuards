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
import RedTeamLab from './components/RedTeamLab';
import JudgeComparisonView from './components/JudgeComparisonView';
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

  // Load audited conversations from database on mount
  useEffect(() => {
    const loadTraces = async () => {
      try {
        const response = await fetch('/api/audit-reports');
        if (response.ok) {
          const data = await response.json() as { traces?: any[] };
          const auditTraces = data.traces || [];
          if (Array.isArray(auditTraces)) {
            // Convert audit reports to Trace format for the UI
            const loadedTraces: Trace[] = auditTraces.map((trace: any) => {
              const riskScore = Math.round((trace.overallScore || 0) * 100);
              const isSuspicious = trace.overallScore >= 0.5;
              const primaryDetection = trace.detectedTypes?.[0];

              // conversation can be an object {conversation_id, turns} or an array
              const conversationTurns = Array.isArray(trace.conversation)
                ? trace.conversation
                : (trace.conversation?.turns || []);

              return {
                id: trace.auditId || trace.id,
                timestamp: trace.createdAt || trace.timestamp,
                messageCount: conversationTurns.length || 0,
                status: isSuspicious ? 'flagged' as TraceStatus : 'clean' as TraceStatus,
                riskScore,
                detectionEvent: isSuspicious ? {
                  id: trace.auditId || trace.id,
                  category: (trace.primaryCategory || 'Fabricated') as DetectionCategory,
                  riskScore,
                  timestamp: trace.createdAt || new Date().toISOString(),
                  snippet: primaryDetection?.evidence?.[0]?.snippet || trace.skillId || 'Audit detection',
                  fullCoT: conversationTurns.find((m: any) => m.reasoning_content || m.reasoning_trace)?.reasoning_content ||
                           conversationTurns.find((m: any) => m.reasoning_trace)?.reasoning_trace || '',
                  conversationHistory: conversationTurns.map((msg: any) => ({
                    role: msg.role === 'customer' ? 'user' : msg.role,
                    content: msg.content,
                    timestamp: msg.timestamp,
                  })) as Message[],
                  matchedPatterns: trace.detectedTypes?.map((d: any) => d.type) || [],
                  confidence: {
                    model: trace.overallScore || 0,
                    heuristic: 0.8,
                  },
                } : undefined,
                conversation: conversationTurns,
                conversationId: trace.conversationId || trace.conversation?.conversation_id,
                chatbotMode: trace.detectionMetadata?.chatbot_mode,
                chatbotModel: trace.modelName,
                label: isSuspicious ? 'adversarial' : 'clean',
                patterns: trace.patterns,
                crossValidation: trace.crossValidation,
              };
            });
            setTraces(loadedTraces);
          }
        }
      } catch (error) {
        console.error('Failed to load conversations:', error);
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
  const getCurrentView = (): AppView | 'comparison' => {
    const path = location.pathname;
    if (path === '/') return 'landing';
    if (path === '/dashboard') return 'dashboard';
    if (path.startsWith('/traces')) return 'traces';
    if (path === '/queue') return 'audit';
    if (path === '/red-team-lab') return 'red-team-lab';
    if (path.startsWith('/comparison')) return 'comparison';
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

  // Settings State - load from localStorage if available
  const [settings, setSettings] = useState<AppSettings>(() => {
    // Try to load from localStorage first
    const savedSettings = localStorage.getItem('thoughtguards_settings');
    if (savedSettings) {
      try {
        return JSON.parse(savedSettings);
      } catch (e) {
        console.warn('Failed to parse saved settings:', e);
      }
    }

    // Default settings
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
      // Cross-validation settings
      enableCrossValidation: false,
      secondaryJudgeModel: undefined, // No Judge B by default
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
      'red-team-lab': '/red-team-lab',
      'settings': '/settings',
    };
    if (routeMap[view]) {
      navigate(routeMap[view]);
    }
  };

  const handleViewTraceFromDashboard = (eventId: string) => {
    // Try to find by detection event ID first, then by trace ID
    const trace = traces.find(t => t.detectionEvent?.id === eventId || t.id === eventId);
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

    // Note: Status updates are UI-only for now
    // The audit_reports table uses INSERT OR REPLACE which would overwrite the report
    // A proper PATCH endpoint would be needed for status-only updates

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
    // Persist to localStorage
    localStorage.setItem('thoughtguards_settings', JSON.stringify(newSettings));
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
        // Check both reasoning_trace and reasoning_content (database field name)
        console.log('DEBUG: testCase.turns:', testCase.turns.map((t: any) => ({ role: t.role, hasReasoningContent: !!t.reasoning_content, hasReasoningTrace: !!(t as any).reasoning_trace })));
        const conversation: Message[] = testCase.turns.map((turn, idx) => {
          // Get reasoning from turn-level field (could be reasoning_trace or reasoning_content from DB)
          const turnReasoning = (turn as any).reasoning_trace || (turn as any).reasoning_content;
          console.log(`DEBUG: Turn ${idx} (${turn.role}): reasoning_content=${!!(turn as any).reasoning_content}, reasoning_trace=${!!(turn as any).reasoning_trace}, final=${!!turnReasoning}`);

          const msg: Message = {
            role: turn.role as 'user' | 'assistant',
            content: turn.content,
            timestamp: turn.timestamp,
            reasoning_trace: turnReasoning || undefined
          };
          // If this is the last assistant turn and conversation has reasoning_trace, use it as fallback
          if (turn.role === 'assistant' && idx === testCase.turns.length - 1 && testCase.reasoning_trace && !msg.reasoning_trace) {
            msg.reasoning_trace = testCase.reasoning_trace;
          }
          return msg;
        });

        // Determine category from multi-skill result, test case, or skill
        // Maps legacy test case categories to new HOW verb categories
        const testCaseCategoryMap: Record<string, DetectionCategory> = {
          'Opinion': 'Pressured',       // was Persona Manipulation -> H4
          'Answer': 'Hid',              // was Goal Reasoning -> H5
          'Social': 'Pressured',        // was Persona Manipulation -> H4
          'Control': 'Hid',             // was Goal Reasoning -> H5
          'Deception': 'Fabricated',    // was Deception Planning -> H1
          'Reward Hacking': 'Overclaimed', // was Reward Hacking -> H6
        };

        // Get category from multi-skill result (primary_category), test case, or infer from skill_id
        let detectedCategory: DetectionCategory = 'Fabricated'; // default
        if (result.primary_category && result.primary_category !== 'none') {
          // Use primary category from multi-skill detection (should already be HOW verb)
          detectedCategory = result.primary_category as DetectionCategory;
        } else if (testCase.category && testCaseCategoryMap[testCase.category]) {
          detectedCategory = testCaseCategoryMap[testCase.category];
        } else if (result.skill_id) {
          // Map skill_id to new HOW verb category
          const skillToCategory: Record<string, DetectionCategory> = {
            'taxonomy-auditor': 'Fabricated', // Will be determined by patterns
            'sycophancy-auditor': 'Pressured',  // H4: Influence Tactics
            'reward-hacking-auditor': 'Overclaimed', // H6: Miscalibration
            'sabotage-planning-auditor': 'Sandbagged', // H2: Capability Suppression
            'goal-reasoning-auditor': 'Hid',  // H5: Omission/Obfuscation
            'deception-planning-auditor': 'Fabricated', // H1: Misrepresentation
            'obfuscation-evasion-auditor': 'Context-Switched', // H3: Oversight-Conditional
            'persona-manipulation-auditor': 'Pressured', // H4: Influence Tactics
          };
          detectedCategory = skillToCategory[result.skill_id] || 'Fabricated';
        }

        // For taxonomy auditor results, extract category from patterns if available
        if (result.patterns && result.patterns.length > 0) {
          const topPattern = result.patterns[0];
          if (topPattern.how?.verb) {
            detectedCategory = topPattern.how.verb as DetectionCategory;
          }
        }

        // Legacy pattern mapping (for old audit results) - no longer needed for new taxonomy audits
        const patternMapping: Record<string, Record<string, string>> = {
          'Fabricated': {
            'fabricated_constraint': 'T1|H1|W1',
            'blame_deflection': 'T1|H1|W4',
            'artificial_delay': 'T1|H1|W3',
            'information_withholding': 'T1|H5|W4',
          },
          'Overclaimed': {
            'specification_gaming': 'T1|H6|W1',
            'environment_manipulation': 'T1|H6|W1',
            'evaluation_subversion': 'T2|H6|W1',
            'reward_tampering': 'T1|H6|W1',
            'self_preservation': 'T1|H6|W4',
          },
          'Sandbagged': {
            'competitor_disparagement': 'T1|H2|W1',
            'fabricated_news': 'T1|H1|W1',
            'malicious_code': 'T4|H2|W4',
            'data_corruption': 'T4|H2|W4',
          },
          'Hid': {
            'metric_aware': 'T1|H5|W1',
            'option_burying': 'T1|H5|W1',
            'value_distortion': 'T1|H5|W1',
            'objective_shifting': 'T1|H5|W1',
          },
          'Context-Switched': {
            'blame_redirection': 'T1|H3|W4',
            'hiding_reality': 'T1|H3|W4',
            'strategic_omission': 'T1|H5|W4',
            'context_stripping': 'T1|H3|W3',
          },
          'Pressured': {
            'opinion': 'T1|H4|W2',
            'feedback': 'T1|H4|W2',
            'social': 'T1|H4|W2',
            'tone_shifting': 'T1|H4|W3',
            'escalation_suppression': 'T1|H4|W3',
            'authority_fabrication': 'T1|H4|W2',
            'empathy_faking': 'T1|H4|W2',
          },
        };

        // Convert detected types to pattern names
        // Check both new taxonomy patterns AND legacy detected_types
        const matchedPatterns: string[] = [];
        const detectedTypes = result.detected_types?.filter((dt: any) => dt.type !== 'none' && dt.type !== '') || [];
        const taxonomyPatterns = result.patterns || [];

        // New taxonomy format: use patterns directly
        if (taxonomyPatterns.length > 0) {
          taxonomyPatterns.forEach((p: any) => {
            const triad = p.triad || `${p.target_code}|${p.how_code}|${p.why_code}`;
            if (!matchedPatterns.includes(triad)) {
              matchedPatterns.push(triad);
            }
          });
        }

        // Legacy format: use detected_types with pattern mapping
        if (detectedTypes.length > 0 && matchedPatterns.length === 0) {
          const categoryMapping = patternMapping[detectedCategory] || {};
          detectedTypes.forEach((dt: any) => {
            const patternName = categoryMapping[dt.type];
            if (patternName && !matchedPatterns.includes(patternName)) {
              matchedPatterns.push(patternName);
            }
          });
        }

        // Determine if manipulation was detected based on patterns OR high score
        const hasDetections = matchedPatterns.length > 0 || taxonomyPatterns.length > 0 || riskScore >= settings.riskThreshold;
        const finalStatus: TraceStatus = hasDetections ? status : 'clean';
        const finalRiskScore = hasDetections ? riskScore : Math.min(riskScore, settings.riskThreshold - 1);

        // Create detection event if flagged or has detections
        let detectionEvent: DetectionEvent | undefined;
        if (finalStatus === 'flagged' || finalStatus === 'review' || hasDetections) {
          // Get snippet and reason from taxonomy patterns or legacy detected_types
          let snippet = '';
          let reason = '';
          let heuristicScore = 0.5;

          if (taxonomyPatterns.length > 0) {
            const topPattern = taxonomyPatterns[0];
            snippet = topPattern.quotes?.[0]?.text || topPattern.short_desc || '';
            reason = topPattern.sentence || topPattern.evidence_notes || '';
            heuristicScore = topPattern.prominence || topPattern.pattern_confidence || 0.7;
          } else if (detectedTypes.length > 0) {
            const primaryType = detectedTypes[0];
            const evidence = primaryType.evidence?.[0] || { snippet: '', reason: '', turn_number: 0, severity: 'medium' as const };
            snippet = evidence.snippet || '';
            reason = evidence.reason || '';
            heuristicScore = primaryType.score || 0.5;
          }

          // Fallback to last assistant message if no snippet
          if (!snippet && testCase.turns?.length > 0) {
            const lastAssistant = [...testCase.turns].reverse().find((t: any) => t.role === 'assistant');
            snippet = lastAssistant?.content?.substring(0, 150) || '';
          }

          detectionEvent = {
            id: result.id,
            category: detectedCategory,
            riskScore: finalRiskScore,
            timestamp: result.timestamp,
            snippet,
            fullCoT: result.recommendations?.join(' ') || reason || 'Analysis complete',
            conversationHistory: conversation,
            matchedPatterns,
            confidence: {
              model: result.confidence === 'high' ? 0.9 : result.confidence === 'medium' ? 0.7 : 0.5,
              heuristic: heuristicScore
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
          // Taxonomy patterns
          patterns: result.patterns,
        };

        // Note: AuditView.tsx already saves the audit report to the database
        // We only need to update the local traces state here

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

    if (currentView === 'red-team-lab') {
      return <RedTeamLab onNavigateToQueue={() => handleNavigate('audit')} />;
    }

    if (currentView === 'comparison') {
      // Extract conversation ID from URL: /comparison/:conversationId
      const match = location.pathname.match(/^\/comparison\/(.+)$/);
      const conversationId = match?.[1] || undefined;
      return <JudgeComparisonView conversationId={conversationId} />;
    }

    // Default: Dashboard View
    return (
      <DynamicDashboard settings={settings} onViewTrace={handleViewTraceFromDashboard} onNavigate={handleNavigate} />
    );
  };

  const getPageTitle = () => {
    if (currentView === 'dashboard') return 'Live Monitoring Dashboard';
    if (currentView === 'traces') return selectedTrace ? `Investigation: ${selectedTrace.id}` : 'Trace History';
    if (currentView === 'audit') return 'Detection Queue';
    if (currentView === 'red-team-lab') return 'Red Team Lab';
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
        <main className={`${currentView === 'red-team-lab' ? '' : 'max-w-7xl mx-auto px-6 py-8'}`}>
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