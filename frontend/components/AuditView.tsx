import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Play, CheckCircle, AlertTriangle, Loader2, FileText, X, Search, Filter, Eye, PlayCircle, Pause, ChevronLeft, ChevronRight, Clock, Zap, CheckSquare, Square, Plus, BarChart3, List, ExternalLink } from 'lucide-react';
import { EnrichedTestCase, AuditResult, Skill, Conversation } from '../lib/types';
// executeMultiSkillAuditWithCrossValidation removed - now using Python evaluation server
import { executeMultiRunAudit, RunConfig } from '../lib/multiRunExecutor';
import { loadAllTestCases } from '../lib/loadTestCases';
import { AppSettings } from '../types';
import { AVAILABLE_SKILLS, CATEGORY_TO_SKILL, getSkillById } from '../lib/skillsRegistry';
import ReasoningDisplay from './ReasoningDisplay';
import ReportCreationModal, { ReportConfig } from './ReportCreationModal';
import ParameterSweepView from './ParameterSweepView';
import { executeReport } from '../lib/reportExecutor';
import ToolCallEvidence from './ToolCallEvidence';

interface AuditViewProps {
  onResult?: (result: AuditResult, testCase: EnrichedTestCase) => void;
  settings: AppSettings;
}

type TestCaseStatus = 'pending' | 'running' | 'completed' | 'failed';

interface TestCaseWithStatus extends EnrichedTestCase {
  status: TestCaseStatus;
  result?: AuditResult;
  error?: string;
}

const ITEMS_PER_PAGE = 20;

const AuditView: React.FC<AuditViewProps> = ({ onResult, settings }) => {
  // Navigation
  const navigate = useNavigate();

  // URL params for auto-run feature
  const [searchParams, setSearchParams] = useSearchParams();
  const autoRunConversationId = searchParams.get('autorun');
  const autoRunTriggeredRef = useRef(false);

  if (!settings) {
    return <div className="text-slate-400">Settings not available</div>;
  }

  // State
  const [allTestCases, setAllTestCases] = useState<EnrichedTestCase[]>([]);
  const [isLoadingCases, setIsLoadingCases] = useState(true);
  const [isRefreshingCases, setIsRefreshingCases] = useState(false);
  const [testCasesWithStatus, setTestCasesWithStatus] = useState<Map<string, TestCaseWithStatus>>(new Map());

  // Load available models and report counts
  useEffect(() => {
    const loadModels = async () => {
      try {
        const geminiKey = localStorage.getItem('GEMINI_API_KEY') || localStorage.getItem('BYOK_API_KEY');
        if (geminiKey) {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`);
          if (response.ok) {
            const data = await response.json();
            const models = (data.models || [])
              .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
              .filter((m: any) => !m.name.includes('embedding'))
              .map((m: any) => m.name.replace('models/', ''));
            setAvailableModels(models.sort());
          }
        }
      } catch (error) {
        console.warn('Failed to load models:', error);
      }
    };
    loadModels();
  }, []);

  // Load all test cases and existing audit results on mount and when component becomes visible
  useEffect(() => {
    let mounted = true;
    
    const loadCases = async () => {
      // If we already have test cases, show refreshing state instead of blocking
      if (allTestCases.length > 0) {
        setIsRefreshingCases(true);
      } else {
        setIsLoadingCases(true);
      }
      setError(null);
      try {
        console.log('Starting to load test cases...');
        const cases = await loadAllTestCases();
        console.log(`Loaded ${cases.length} total test cases`);
        
        // Load existing audit results from database
        let existingAudits: Map<string, AuditResult> = new Map();
        try {
          const auditResponse = await fetch('/api/audit-reports?limit=10000');
          if (auditResponse.ok) {
            const auditData = await auditResponse.json();
            if (auditData.traces && Array.isArray(auditData.traces)) {
              // Create a map of conversation_id -> audit result
              auditData.traces.forEach((trace: any) => {
                // Match by conversation_id
                if (trace.conversationId) {
                  // Reconstruct AuditResult from trace data
                  const auditResult: AuditResult = {
                    id: trace.auditId || trace.id.replace('audit-', ''),
                    conversation_id: trace.conversationId,
                    timestamp: trace.createdAt || new Date().toISOString(),
                    skill_id: trace.skillId || '',
                    model_name: trace.modelName || '',
                    overall_score: trace.overallScore !== undefined ? trace.overallScore : (trace.riskScore !== undefined ? trace.riskScore / 100 : 0),
                    confidence: (trace.confidence || 'low') as 'low' | 'medium' | 'high',
                    detected_types: trace.detectedTypes || [],
                    metrics: trace.metrics || {},
                    recommendations: trace.recommendations || [],
                    limitations: trace.limitations || [],
                    usage: trace.usage,
                    // Multi-skill fields
                    skill_results: (trace as any).skillResults,
                    combined_score: (trace as any).combinedScore,
                    primary_category: (trace as any).primaryCategory,
                    secondary_categories: (trace as any).secondaryCategories,
                    detection_metadata: (trace as any).detectionMetadata,
                  };
                  // Only keep the most recent audit for each conversation
                  const existing = existingAudits.get(trace.conversationId);
                  if (!existing || new Date(trace.createdAt) > new Date(existing.timestamp)) {
                    existingAudits.set(trace.conversationId, auditResult);
                  }
                }
              });
              console.log(`Loaded ${existingAudits.size} existing audit results from database`);
            }
          }
        } catch (auditError) {
          console.warn('Failed to load existing audit results:', auditError);
        }
        
        if (mounted) {
          setAllTestCases(cases);
          // Preserve existing results from state, then merge with database results
          setTestCasesWithStatus(prev => {
            const map = new Map<string, TestCaseWithStatus>();
            cases.forEach(tc => {
              // Check if we have an existing result in state (from a recent audit)
              const existingInState = prev.get(tc.conversation_id);
              // Check if we have an audit result from database
              const existingAudit = existingAudits.get(tc.conversation_id);
              
              // Prefer state result if it's more recent, otherwise use database result
              if (existingInState && existingInState.status === 'completed' && existingInState.result) {
                // Check if database has a newer result
                if (existingAudit && new Date(existingAudit.timestamp) > new Date(existingInState.result.timestamp)) {
                  map.set(tc.conversation_id, { 
                    ...tc, 
                    status: 'completed' as TestCaseStatus,
                    result: existingAudit
                  });
                } else {
                  // Keep the existing state result
                  map.set(tc.conversation_id, existingInState);
                }
              } else if (existingAudit) {
                // Use database result
                map.set(tc.conversation_id, { 
                  ...tc, 
                  status: 'completed' as TestCaseStatus,
                  result: existingAudit
                });
              } else {
                // No audit result - mark as pending
                // But preserve running status if it was running
                if (existingInState && existingInState.status === 'running') {
                  map.set(tc.conversation_id, existingInState);
                } else {
                  map.set(tc.conversation_id, { ...tc, status: 'pending' as TestCaseStatus });
                }
              }
            });
            return map;
          });
          if (cases.length === 0 && allTestCases.length === 0) {
            setError('NO_CONVERSATIONS');
          }
        }
      } catch (error: any) {
        console.error('Failed to load test cases:', error);
        // Only show error if we don't have existing data
        if (allTestCases.length === 0) {
          setError(`Failed to load test cases: ${error.message || error}`);
        } else {
          // If we have existing data, just log the error but keep showing existing data
          console.warn('Failed to refresh test cases, using existing data:', error);
        }
      } finally {
        if (mounted) {
          setIsLoadingCases(false);
          setIsRefreshingCases(false);
        }
      }
    };

    loadCases();
    
    return () => {
      mounted = false;
    };
  }, []); // Load on mount

  // Reload audit results when component becomes visible (user navigates back to tab)
  useEffect(() => {
    if (allTestCases.length === 0) return; // Don't reload if test cases aren't loaded yet
    
    const reloadAudits = async () => {
      try {
        const auditResponse = await fetch('/api/audit-reports?limit=10000');
        if (auditResponse.ok) {
          const auditData = await auditResponse.json();
          if (auditData.traces && Array.isArray(auditData.traces)) {
            const existingAudits: Map<string, AuditResult> = new Map();
            auditData.traces.forEach((trace: any) => {
              if (trace.conversationId) {
                const auditResult: AuditResult = {
                  id: trace.auditId || trace.id.replace('audit-', ''),
                  conversation_id: trace.conversationId,
                  timestamp: trace.createdAt || new Date().toISOString(),
                  skill_id: trace.skillId || '',
                  model_name: trace.modelName || '',
                  overall_score: trace.overallScore !== undefined ? trace.overallScore : (trace.riskScore !== undefined ? trace.riskScore / 100 : 0),
                  confidence: (trace.confidence || 'low') as 'low' | 'medium' | 'high',
                  detected_types: trace.detectedTypes || [],
                  metrics: trace.metrics || {},
                  recommendations: trace.recommendations || [],
                  limitations: trace.limitations || [],
                  usage: trace.usage,
                };
                const existing = existingAudits.get(trace.conversationId);
                if (!existing || new Date(trace.createdAt) > new Date(existing.timestamp)) {
                  existingAudits.set(trace.conversationId, auditResult);
                }
              }
            });
            
            // Update test cases with audit results
            setTestCasesWithStatus(prev => {
              const map = new Map(prev);
              existingAudits.forEach((auditResult, conversationId) => {
                const existing = map.get(conversationId);
                if (existing) {
                  map.set(conversationId, {
                    ...existing,
                    status: 'completed' as TestCaseStatus,
                    result: auditResult
                  });
                }
              });
              return map;
            });
            console.log(`Reloaded ${existingAudits.size} audit results`);
          }
        }
      } catch (error) {
        console.warn('Failed to reload audit results:', error);
      }
    };
    
    // Reload when component becomes visible
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        reloadAudits();
      }
    };
    
    // Also reload on focus (when user switches back to tab)
    const handleFocus = () => {
      reloadAudits();
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    
    // Initial reload
    reloadAudits();
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [allTestCases.length]);
  
  const [selectedTestCase, setSelectedTestCase] = useState<EnrichedTestCase | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<TestCaseStatus | 'all'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [autoRunEnabled, setAutoRunEnabled] = useState(false);
  const [autoRunQueue, setAutoRunQueue] = useState<string[]>([]);
  const [currentlyRunning, setCurrentlyRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCases, setSelectedCases] = useState<Set<string>>(new Set());
  const [batchRunning, setBatchRunning] = useState(false);
  
  // New report system modals
  const [showCreateReportModal, setShowCreateReportModal] = useState(false);
  const [showParameterSweepModal, setShowParameterSweepModal] = useState(false);
  const [selectedConversationForReport, setSelectedConversationForReport] = useState<EnrichedTestCase | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  // Note: getSkillForTestCase is no longer needed with multi-skill execution
  // The intelligent detector will determine which skills to run

  // Filter and search
  const filteredTestCases = useMemo(() => {
    let filtered = Array.from(testCasesWithStatus.values());
    
    // Search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(tc => 
        tc.displayName.toLowerCase().includes(query) ||
        tc.category.toLowerCase().includes(query) ||
        tc.turns.some(t => t.content.toLowerCase().includes(query))
      );
    }

    // Status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(tc => tc.status === filterStatus);
    }
    
    return filtered;
  }, [testCasesWithStatus, searchQuery, filterStatus]);

  // Pagination
  const totalPages = Math.ceil(filteredTestCases.length / ITEMS_PER_PAGE);
  const paginatedTestCases = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredTestCases.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredTestCases, currentPage]);

  // Run audit
  const handleRunAudit = useCallback(async (testCase: EnrichedTestCase) => {
    const caseId = testCase.conversation_id;
    
    setTestCasesWithStatus(prev => {
      const updated = new Map(prev);
      const existing = updated.get(caseId) || { ...testCase, status: 'pending' as TestCaseStatus };
      updated.set(caseId, { ...existing, status: 'running' as TestCaseStatus });
      return updated;
    });
    
    setCurrentlyRunning(caseId);
    setError(null);

    try {
      // Check if multi-run mode is enabled
      const runCount = settings.multiRunCount || 1;
      const useMultiRun = runCount > 1;

      let result: AuditResult;
      
      if (useMultiRun) {
        // Use multi-run execution with statistical analysis
        const runConfig: RunConfig = {
          count: runCount,
          temperature: settings.multiRunTemperature,
          seed: settings.multiRunSeed,
        };
        
        const multiRunResult = await executeMultiRunAudit(
          testCase,
          settings.auditorModel,
          runConfig,
          {
            sensitivity: settings.sensitivity,
            includeValidatorCoT: true, // Always include CoT
          }
        );

        result = multiRunResult;
      } else {
        // Use Python evaluation server for single-run audits
        // Map old model names to new judge IDs
        const modelToJudge: Record<string, string> = {
          'gemini-2.0-flash': 'mistral',
          'gemini-2.0-flash-exp': 'mistral',
          'claude-sonnet-4-20250514': 'sonnet',
          'claude-3-5-sonnet-latest': 'sonnet',
          'claude-haiku-4-5-20251001': 'haiku',
          'sonnet': 'sonnet',
          'haiku': 'haiku',
          'mistral': 'mistral',
          'compassj': 'compassj',
          'gemini-flash': 'gemini-flash',
          'gemini-3-flash-preview': 'gemini-flash',
        };

        // Build judges from settings (defaults to open source models)
        const rawPrimary = settings.auditorModel || 'mistral';
        const rawSecondary = settings.secondaryJudgeModel ?? 'compassj';
        const primaryJudge = modelToJudge[rawPrimary] || 'mistral';
        const secondaryJudge = rawSecondary ? (modelToJudge[rawSecondary] || rawSecondary) : null;
        const judges = secondaryJudge ? [primaryJudge, secondaryJudge] : [primaryJudge];

        console.log('[AuditView] Calling Python evaluation server with judges:', judges);

        const response = await fetch('/api/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation_id: testCase.conversation_id,
            judges
          })
        });

        if (!response.ok) {
          const err = await response.json() as { error?: string };
          throw new Error(err.error || 'Evaluation failed');
        }

        const evalResult = await response.json() as {
          report_id: string;
          manipulation_evaluations?: Array<{ patterns?: any[] }>;
          _meta?: {
            judges_used?: string[];
            agreement_rate?: number;
            agreement_type?: string;
            total_tokens?: number;
          };
        };

        // Extract data from FastAPI response
        // Note: evaluate.ts already saved to DB - we just need to build UI state
        const patterns = evalResult.manipulation_evaluations?.[0]?.patterns || [];
        const meta = evalResult._meta || {};

        // Calculate overall_score from PATTERNS, not agreement_rate
        // If patterns detected, score >= 0.5 to show as "flagged"
        let overallScore = 0;
        if (patterns.length > 0) {
          const avgConfidence = patterns.reduce((sum: number, p: any) => sum + (p.confidence || 0.5), 0) / patterns.length;
          overallScore = Math.max(0.5, Math.min(1, avgConfidence));
        }

        // Confidence reflects judge agreement
        const agreementType = meta.agreement_type || 'unknown';
        let confidence: 'low' | 'medium' | 'high' = 'low';
        if (agreementType === 'full' || agreementType === 'strong' || agreementType === 'both_clean') {
          confidence = 'high';
        } else if (agreementType === 'partial') {
          confidence = 'medium';
        }

        result = {
          id: evalResult.report_id,
          conversation_id: testCase.conversation_id,
          timestamp: new Date().toISOString(),
          skill_id: 'llm-judge',
          model_name: meta.judges_used?.join('+') || 'unknown',
          overall_score: overallScore,
          confidence,
          detected_types: patterns.map((p: any) => ({
            type: p.triad_pattern_id || 'unknown',
            score: p.confidence || 0,
            evidence: (p.quotes || []).map((q: any) => ({ snippet: q.text || q, source: q.source || 'reasoning_trace' })),
          })),
          metrics: {
            skill_count: judges.length,
            agreement_rate: meta.agreement_rate || 0,
            agreement_type: agreementType,
            patterns_count: patterns.length,
          },
          recommendations: [],
          limitations: [],
          usage: { prompt_tokens: 0, candidates_tokens: meta.total_tokens || 0, total_tokens: meta.total_tokens || 0 },
        };
      }
      
      setTestCasesWithStatus(prev => {
        const updated = new Map(prev);
        updated.set(caseId, { ...testCase, status: 'completed' as TestCaseStatus, result });
        return updated;
      });

      // Note: evaluate.ts already saved to DB - no need to save again here
      console.log('[AuditView] Audit complete, report_id:', result.id);

      if (onResult) {
        onResult(result, testCase);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to run audit');
      setTestCasesWithStatus(prev => {
        const updated = new Map(prev);
        updated.set(caseId, { ...testCase, status: 'failed' as TestCaseStatus, error: err.message });
        return updated;
      });
      console.error('Audit error:', err);
    } finally {
      setCurrentlyRunning(null);
    }
  }, [settings, onResult]);

  // Auto-run queue processing
  useEffect(() => {
    if (!autoRunEnabled || currentlyRunning || autoRunQueue.length === 0) {
      return;
    }

    const nextCaseId = autoRunQueue[0];
    const testCase = testCasesWithStatus.get(nextCaseId);
    
    if (testCase && testCase.status === 'pending') {
      handleRunAudit(testCase).then(() => {
        setAutoRunQueue(prev => prev.slice(1));
      });
    } else {
      setAutoRunQueue(prev => prev.slice(1));
    }
  }, [autoRunEnabled, autoRunQueue, currentlyRunning, testCasesWithStatus, handleRunAudit]);

  // Auto-run specific conversation from URL parameter (from Red Team Lab)
  useEffect(() => {
    if (!autoRunConversationId || autoRunTriggeredRef.current || isLoadingCases || currentlyRunning) {
      return;
    }

    // Find the test case to auto-run
    const testCase = testCasesWithStatus.get(autoRunConversationId);
    if (testCase && (testCase.status === 'pending' || testCase.status === 'completed')) {
      console.log(`[AuditView] Auto-running audit for conversation: ${autoRunConversationId}`);
      autoRunTriggeredRef.current = true;

      // Clear the URL parameter to prevent re-triggering
      setSearchParams({});

      // Run the audit
      handleRunAudit(testCase);
    }
  }, [autoRunConversationId, testCasesWithStatus, isLoadingCases, currentlyRunning, handleRunAudit, setSearchParams]);

  // Initialize auto-run queue with pending cases
  const initializeAutoRunQueue = useCallback(() => {
    const pending = Array.from(testCasesWithStatus.values())
      .filter(tc => tc.status === 'pending')
      .map(tc => tc.conversation_id);
    setAutoRunQueue(pending);
  }, [testCasesWithStatus]);

  // Toggle auto-run
  const toggleAutoRun = useCallback(() => {
    if (!autoRunEnabled) {
      initializeAutoRunQueue();
    }
    setAutoRunEnabled(prev => !prev);
  }, [autoRunEnabled, initializeAutoRunQueue]);

  // Batch selection handlers
  const toggleCaseSelection = useCallback((caseId: string) => {
    setSelectedCases(prev => {
      const next = new Set(prev);
      if (next.has(caseId)) {
        next.delete(caseId);
      } else {
        next.add(caseId);
      }
      return next;
    });
  }, []);

  const selectAllFiltered = useCallback(() => {
    const filteredIds = paginatedTestCases
      .filter(tc => tc.status === 'pending' || tc.status === 'completed')
      .map(tc => tc.conversation_id);
    setSelectedCases(new Set(filteredIds));
  }, [paginatedTestCases]);

  const clearSelection = useCallback(() => {
    setSelectedCases(new Set());
  }, []);

  // Run batch audits
  const handleRunBatch = useCallback(async () => {
    if (selectedCases.size === 0) return;
    
    setBatchRunning(true);
    const casesToRun = Array.from(selectedCases)
      .map(id => testCasesWithStatus.get(id))
      .filter((tc): tc is TestCaseWithStatus => tc !== undefined && (tc.status === 'pending' || tc.status === 'completed'));
    
    // Run sequentially to avoid overwhelming the API
    for (const testCase of casesToRun) {
      if (testCase.status === 'pending' || testCase.status === 'completed') {
        await handleRunAudit(testCase);
        // Small delay between runs to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    setBatchRunning(false);
    setSelectedCases(new Set());
  }, [selectedCases, testCasesWithStatus, handleRunAudit]);

  // Get unique categories
  // Stats
  const stats = useMemo(() => {
    const cases = Array.from(testCasesWithStatus.values());
    return {
      total: cases.length,
      pending: cases.filter(c => c.status === 'pending').length,
      running: cases.filter(c => c.status === 'running').length,
      completed: cases.filter(c => c.status === 'completed').length,
      failed: cases.filter(c => c.status === 'failed').length,
    };
  }, [testCasesWithStatus]);

  const getScoreColor = (score: number) => {
    if (score >= 0.7) return 'text-red-400';
    if (score >= 0.4) return 'text-orange-400';
    return 'text-green-400';
  };

  const getScoreBg = (score: number) => {
    if (score >= 0.7) return 'bg-red-500/10 border-red-500/50';
    if (score >= 0.4) return 'bg-orange-500/10 border-orange-500/50';
    return 'bg-green-500/10 border-green-500/50';
  };

  const getStatusBadge = (status: TestCaseStatus) => {
    const styles = {
      pending: 'bg-slate-700/50 text-slate-400 border-slate-700',
      running: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50',
      completed: 'bg-green-500/20 text-green-400 border-green-500/50',
      failed: 'bg-red-500/20 text-red-400 border-red-500/50',
    };
    return styles[status];
  };

  // Always render the UI immediately, show loading state while data loads
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <FileText size={18} className="text-cyan-500" />
            Detection Queue
            {(isLoadingCases || isRefreshingCases) && (
              <Loader2 size={16} className="animate-spin text-cyan-500 ml-2" />
            )}
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            {isLoadingCases && allTestCases.length === 0 ? (
              <span className="text-cyan-400">Loading conversations from database...</span>
            ) : (
              <>
                {stats.total} total • {stats.completed} completed • {stats.pending} pending
                {(isRefreshingCases) && (
                  <span className="ml-2 text-cyan-400">(Refreshing...)</span>
                )}
              </>
            )}
          </p>
        </div>
        
        <div className="flex items-center gap-3 flex-wrap">
          {selectedCases.size > 0 && (
            <>
              <button
                onClick={handleRunBatch}
                disabled={batchRunning}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-green-500/20 text-green-400 border border-green-500/50 hover:bg-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {batchRunning ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Running {selectedCases.size}...
                  </>
                ) : (
                  <>
                    <Play size={16} />
                    Run Selected ({selectedCases.size})
                  </>
                )}
              </button>
              <button
                onClick={clearSelection}
                className="px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-600"
              >
                Clear
              </button>
            </>
          )}
          <button
            onClick={toggleAutoRun}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              autoRunEnabled
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 hover:bg-cyan-500/30'
                : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
            }`}
          >
            {autoRunEnabled ? (
              <>
                <Pause size={16} />
                Pause Auto-Run
              </>
            ) : (
              <>
                <PlayCircle size={16} />
                Start Auto-Run
              </>
            )}
          </button>
          <button
            onClick={selectAllFiltered}
            className="px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-600"
            title="Select all filtered items"
          >
            Select All
          </button>
          <span className="text-sm text-slate-400">
            Model: <strong className="text-cyan-400">{settings.auditorModel}</strong>
          </span>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3">
          <div className="text-xs text-slate-500 mb-1">Total</div>
          <div className="text-lg font-bold text-slate-200">{stats.total}</div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3">
          <div className="text-xs text-slate-500 mb-1">Pending</div>
          <div className="text-lg font-bold text-slate-400">{stats.pending}</div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3">
          <div className="text-xs text-slate-500 mb-1">Running</div>
          <div className="text-lg font-bold text-cyan-400">{stats.running}</div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3">
          <div className="text-xs text-slate-500 mb-1">Completed</div>
          <div className="text-lg font-bold text-green-400">{stats.completed}</div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3">
          <div className="text-xs text-slate-500 mb-1">Failed</div>
          <div className="text-lg font-bold text-red-400">{stats.failed}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search test cases..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full bg-slate-900/50 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
          />
        </div>

        <select
          value={filterStatus}
          onChange={(e) => {
            setFilterStatus(e.target.value as TestCaseStatus | 'all');
            setCurrentPage(1);
          }}
          className="bg-slate-900/50 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {error && error !== 'NO_CONVERSATIONS' && (
        <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle size={18} className="text-red-400" />
          <span className="text-sm text-red-400">{error}</span>
        </div>
      )}

      {error === 'NO_CONVERSATIONS' && (
        <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-slate-200 mb-4">No Conversations Found</h3>
          <p className="text-sm text-slate-300 mb-2">
            Import conversation data from JSON files using the CLI. This supports both single files and directories.
          </p>
          <p className="text-xs text-amber-400 mb-4">
            Each conversation must have a unique <code className="bg-slate-950 px-1 rounded">conversation_id</code>. Duplicates will be overwritten.
          </p>

          <div className="space-y-3">
            <div>
              <p className="text-xs text-slate-400 mb-2">Import a single file:</p>
              <code className="block bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-cyan-300 font-mono">
                npm run import -- ./path/to/conversation.json
              </code>
            </div>

            <div>
              <p className="text-xs text-slate-400 mb-2">Import an entire directory:</p>
              <code className="block bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-cyan-300 font-mono">
                npm run import -- ./mock_data/
              </code>
            </div>

            <div>
              <p className="text-xs text-slate-400 mb-2">Import to production:</p>
              <code className="block bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-cyan-300 font-mono">
                npm run import -- ./mock_data/ --api https://your-app.pages.dev
              </code>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-700">
            <p className="text-xs text-slate-500">
              <strong>JSON Format:</strong> Each file should contain either:
            </p>
            <ul className="text-xs text-slate-500 mt-2 space-y-1 list-disc list-inside">
              <li>A single conversation with <code className="bg-slate-950 px-1 rounded">turns</code> array</li>
              <li>A dataset with <code className="bg-slate-950 px-1 rounded">conversations</code> array</li>
            </ul>
          </div>
        </div>
      )}

      {/* Test Cases List */}
      <div className="space-y-2">
        {isLoadingCases && allTestCases.length === 0 ? (
          <div className="text-center py-12">
            <Loader2 size={32} className="animate-spin text-cyan-500 mx-auto mb-4" />
            <p className="text-slate-400">Loading conversations from database...</p>
          </div>
        ) : paginatedTestCases.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            {allTestCases.length === 0 
              ? "No conversations found in database. Run a sync to load conversations."
              : "No test cases found matching your filters."}
          </div>
        ) : (
          paginatedTestCases.map((testCase) => {
            const isRunning = testCase.status === 'running';
            const hasResult = testCase.status === 'completed' && testCase.result;

            const isSelected = selectedCases.has(testCase.conversation_id);
            
            return (
              <div
                key={testCase.conversation_id}
                className={`bg-slate-900/30 border rounded-lg p-4 transition-all ${
                  testCase.status === 'running' ? 'border-cyan-500/50 ring-1 ring-cyan-500/20' : 
                  isSelected ? 'border-green-500/50 ring-1 ring-green-500/20' :
                  'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <button
                    onClick={() => toggleCaseSelection(testCase.conversation_id)}
                    className="mt-1 p-1 hover:bg-slate-800 rounded transition-colors"
                    title={isSelected ? "Deselect" : "Select for batch run"}
                  >
                    {isSelected ? (
                      <CheckSquare size={18} className="text-green-400" />
                    ) : (
                      <Square size={18} className="text-slate-600" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-slate-200 truncate">{testCase.displayName}</h3>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getStatusBadge(testCase.status)}`}>
                        {testCase.status}
                      </span>
                      {hasResult && (
                        <span className={`px-2 py-0.5 rounded text-xs font-bold border ${getScoreBg(testCase.result!.overall_score)} ${getScoreColor(testCase.result!.overall_score)}`}>
                          {(testCase.result!.overall_score * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-xs text-slate-400">{testCase.category} • {testCase.display_type}</p>
                    </div>
                    <div className="text-xs text-slate-500 space-y-1">
                      {testCase.turns.slice(0, 2).map((turn, idx) => (
                        <div key={idx} className="truncate">
                          <span className="text-slate-600">{turn.role}:</span>{' '}
                          <span className="text-slate-400">{turn.content.substring(0, 100)}{turn.content.length > 100 ? '...' : ''}</span>
                        </div>
                      ))}
                      {testCase.turns.length > 2 && (
                        <div className="text-slate-600">+{testCase.turns.length - 2} more turns</div>
                      )}
                    </div>
                    {testCase.error && (
                      <div className="mt-2 text-xs text-red-400">{testCase.error}</div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => {
                        setSelectedTestCase(testCase);
                        setShowDetailModal(true);
                      }}
                      className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
                      title="View Details"
                    >
                      <Eye size={16} />
                    </button>
                    {hasResult && (
                      <button
                        onClick={() => navigate(`/traces/${testCase.result?.id}`)}
                        className="px-4 py-2 rounded-lg text-sm font-medium bg-green-500/20 text-green-400 border border-green-500/50 hover:bg-green-500/30 transition-all"
                      >
                        <ExternalLink size={14} className="inline mr-2" />
                        View Trace
                      </button>
                    )}
                    <button
                      onClick={() => handleRunAudit(testCase)}
                      disabled={isRunning}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        isRunning
                          ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
                          : hasResult
                          ? 'bg-slate-700/50 text-slate-400 border border-slate-600 hover:bg-slate-700'
                          : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 hover:bg-cyan-500/30'
                      }`}
                    >
                      {isRunning ? (
                        <>
                          <Loader2 size={14} className="animate-spin inline mr-2" />
                          Running...
                        </>
                      ) : hasResult ? (
                        <>
                          <Play size={14} className="inline mr-2" />
                          Re-run
                        </>
                      ) : (
                        <>
                          <Play size={14} className="inline mr-2" />
                          Run
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-400">
            Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredTestCases.length)} of {filteredTestCases.length}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-lg bg-slate-900/50 border border-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm text-slate-400 px-3">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg bg-slate-900/50 border border-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedTestCase && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowDetailModal(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-slate-900 border-b border-slate-800 p-6 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-100">{selectedTestCase.displayName}</h3>
                <p className="text-sm text-slate-400 mt-1">{selectedTestCase.category} • {selectedTestCase.display_type}</p>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              {selectedTestCase.metadata?.note && (
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                  <p className="text-sm text-slate-300">{selectedTestCase.metadata.note}</p>
                </div>
              )}
              
              <div>
                <h4 className="text-sm font-semibold text-slate-300 mb-3">Conversation</h4>
                <div className="space-y-3">
                  {selectedTestCase.turns.map((turn, idx) => {
                    // Get tool calls and reasoning from the turn if available
                    const enrichedTurn = turn as any;
                    const toolCalls = enrichedTurn.tool_calls || [];
                    const reasoningContent = enrichedTurn.reasoning_content ||
                      (selectedTestCase.reasoning_trace && idx === selectedTestCase.turns.length - 1
                        ? selectedTestCase.reasoning_trace
                        : null);

                    return (
                      <div key={idx} className={`p-3 rounded-lg ${
                        turn.role === 'user' ? 'bg-slate-800/50' : 'bg-slate-800/30'
                      }`}>
                        <div className="text-xs font-medium text-slate-500 mb-1 uppercase">{turn.role}</div>
                        <div className="text-sm text-slate-200 whitespace-pre-wrap">{turn.content}</div>
                        <ReasoningDisplay
                          reasoningContent={reasoningContent}
                          toolCalls={toolCalls}
                          turnNumber={turn.turn_number}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tool Call Evidence */}
              {(() => {
                const allToolCalls = selectedTestCase.turns.flatMap((turn: any) => turn.tool_calls || []);
                if (allToolCalls.length === 0) return null;

                return (
                  <ToolCallEvidence
                    toolCalls={allToolCalls}
                    reasoningContent={selectedTestCase.reasoning_trace}
                    messageContent={selectedTestCase.turns
                      .filter((t: any) => t.role === 'assistant')
                      .map((t: any) => t.content)
                      .join(' ')}
                  />
                );
              })()}
              
              {selectedTestCase.metadata?.tags && selectedTestCase.metadata.tags.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-300 mb-2">Tags</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedTestCase.metadata.tags.map((tag, idx) => (
                      <span key={idx} className="px-2 py-1 bg-slate-800/50 text-slate-400 text-xs rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="flex gap-3 pt-4 border-t border-slate-800">
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    handleRunAudit(selectedTestCase);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 rounded-lg hover:bg-cyan-500/30 transition-colors"
                >
                  <Play size={16} />
                  Run Audit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Report Modal */}
      {showCreateReportModal && (
        <ReportCreationModal
          conversation={selectedConversationForReport ? {
            conversation_id: selectedConversationForReport.conversation_id,
            turns: selectedConversationForReport.turns.map(t => ({
              turn_number: t.turn_number,
              role: t.role,
              content: t.content,
              timestamp: t.timestamp
            })),
            metadata: selectedConversationForReport.metadata,
            reasoning_trace: selectedConversationForReport.reasoning_trace
          } : {
            conversation_id: '',
            turns: []
          }}
          availableSkills={AVAILABLE_SKILLS}
          availableModels={availableModels.length > 0 ? availableModels : [settings.auditorModel]}
          onSave={async (config: ReportConfig) => {
            try {
              // Find the conversation
              const conv = selectedConversationForReport || allTestCases.find(tc => tc.conversation_id === config.conversation_id);
              if (!conv) {
                alert('Conversation not found');
                return;
              }

              // Convert EnrichedTestCase to Conversation format
              const conversation: Conversation = {
                conversation_id: conv.conversation_id,
                turns: conv.turns.map(t => ({
                  turn_number: t.turn_number,
                  role: t.role,
                  content: t.content,
                  timestamp: t.timestamp
                })),
                metadata: conv.metadata,
                reasoning_trace: conv.reasoning_trace
              };

              // Execute report via API (since executeReport needs db access)
              const response = await fetch('/api/audit-reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  conversation_id: config.conversation_id,
                  skill_id: config.skill_id,
                  model_name: config.model_name,
                  llm_parameters: config.llm_parameters,
                  enable_cache: config.enable_cache,
                  tags: config.tags,
                  notes: config.notes
                })
              });

              if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to create report');
              }

              setShowCreateReportModal(false);
              setSelectedConversationForReport(null);
              alert('Report created successfully!');
            } catch (error: any) {
              console.error('Failed to create report:', error);
              alert(`Failed to create report: ${error.message}`);
            }
          }}
          onClose={() => {
            setShowCreateReportModal(false);
            setSelectedConversationForReport(null);
          }}
        />
      )}

      {/* Parameter Sweep Modal */}
      {showParameterSweepModal && selectedConversationForReport && (
        <ParameterSweepView
          conversation={{
            conversation_id: selectedConversationForReport.conversation_id,
            turns: selectedConversationForReport.turns.map(t => ({
              turn_number: t.turn_number,
              role: t.role,
              content: t.content,
              timestamp: t.timestamp
            })),
            metadata: selectedConversationForReport.metadata,
            reasoning_trace: selectedConversationForReport.reasoning_trace
          }}
          availableSkills={AVAILABLE_SKILLS}
          availableModels={availableModels.length > 0 ? availableModels : [settings.auditorModel]}
          onClose={() => {
            setShowParameterSweepModal(false);
            setSelectedConversationForReport(null);
          }}
          onComplete={(sweepId) => {
            console.log('Parameter sweep completed:', sweepId);
          }}
        />
      )}

    </div>
  );
};

export default AuditView;
