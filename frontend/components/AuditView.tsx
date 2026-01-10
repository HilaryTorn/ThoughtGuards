import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Play, CheckCircle, AlertTriangle, Loader2, FileText, X, Search, Filter, Eye, PlayCircle, Pause, ChevronLeft, ChevronRight, Clock, Zap, CheckSquare, Square, Plus, BarChart3, List } from 'lucide-react';
import { EnrichedTestCase, AuditResult, Skill, Conversation } from '../lib/types';
import { executeMultiSkillAudit } from '../lib/multiSkillExecutor';
import { executeMultiRunAudit, RunConfig } from '../lib/multiRunExecutor';
import { loadAllTestCases } from '../lib/loadTestCases';
import { AppSettings } from '../types';
import { AVAILABLE_SKILLS, CATEGORY_TO_SKILL, getSkillById } from '../lib/skillsRegistry';
import ReasoningDisplay from './ReasoningDisplay';
import ReportCreationModal, { ReportConfig } from './ReportCreationModal';
import ParameterSweepView from './ParameterSweepView';
import ReportListView from './ReportListView';
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

  // Load report counts for all conversations
  useEffect(() => {
    const loadReportCounts = async () => {
      if (allTestCases.length === 0) return;
      
      try {
        const conversationIds = allTestCases.map(tc => tc.conversation_id);
        const counts = new Map<string, number>();
        
        // Load reports in batches
        for (let i = 0; i < conversationIds.length; i += 50) {
          const batch = conversationIds.slice(i, i + 50);
          for (const convId of batch) {
            try {
              const response = await fetch(`/api/audit-reports?conversation_id=${convId}&limit=1`);
              if (response.ok) {
                const data = await response.json();
                counts.set(convId, data.total || 0);
              }
            } catch (error) {
              // Ignore individual errors
            }
          }
        }
        
        setReportCounts(counts);
      } catch (error) {
        console.warn('Failed to load report counts:', error);
      }
    };
    
    loadReportCounts();
  }, [allTestCases]);

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
          const auditResponse = await fetch('/api/audit-results?limit=10000');
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
        const auditResponse = await fetch('/api/audit-results?limit=10000');
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
  const [filterCategory, setFilterCategory] = useState<string>('all');
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
  const [showReportsListModal, setShowReportsListModal] = useState(false);
  const [selectedConversationForReport, setSelectedConversationForReport] = useState<EnrichedTestCase | null>(null);
  const [reportCounts, setReportCounts] = useState<Map<string, number>>(new Map());
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
    
    // Category filter
    if (filterCategory !== 'all') {
      filtered = filtered.filter(tc => tc.category === filterCategory);
    }
    
    // Status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(tc => tc.status === filterStatus);
    }
    
    return filtered;
  }, [testCasesWithStatus, searchQuery, filterCategory, filterStatus]);

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
            thinkingBudget: settings.thinkingBudget,
            includeValidatorCoT: settings.includeValidatorCoT,
          }
        );
        
        result = multiRunResult;
      } else {
        // Use single-run intelligent multi-skill execution
        result = await executeMultiSkillAudit(
          testCase,
          settings.auditorModel,
          {
            sensitivity: settings.sensitivity,
            thinkingBudget: settings.thinkingBudget,
            includeValidatorCoT: settings.includeValidatorCoT,
          }
        );
      }
      
      setTestCasesWithStatus(prev => {
        const updated = new Map(prev);
        updated.set(caseId, { ...testCase, status: 'completed' as TestCaseStatus, result });
        return updated;
      });

      // Save to database - derive missing fields
      try {
        // Calculate risk_score and status from overall_score and detected_types
        const riskScore = result.combined_score || result.overall_score || 0;
        const hasDetections = (result.detected_types && result.detected_types.length > 0) ||
                            (result.patterns && result.patterns.length > 0);
        const status = riskScore >= 0.7 ? 'flagged' : riskScore >= 0.4 ? 'review' : 'clean';

        // Create detection_event from first detection if present
        let detection_event = null;
        if (hasDetections && result.detected_types && result.detected_types.length > 0) {
          const firstDetection = result.detected_types[0];
          const firstEvidence = firstDetection.evidence?.[0];
          detection_event = {
            id: `det_${Date.now()}`,
            trace_id: testCase.conversation_id,
            timestamp: new Date().toISOString(),
            category: firstDetection.category || result.primary_category || 'unknown',
            pattern_name: firstDetection.type,
            snippet: firstEvidence?.snippet || '',
            reason: firstEvidence?.reason || '',
            turn_number: firstEvidence?.turn_number || 0,
            severity: firstEvidence?.severity || 'medium',
            heuristic_score: firstDetection.score || 0,
            llm_score: result.overall_score,
            model_name: result.model_name,
          };
        }

        // Clean testCase to avoid circular references - only include serializable data
        const cleanTestCase = {
          conversation_id: testCase.conversation_id,
          turns: testCase.turns,
          metadata: testCase.metadata,
          reasoning_trace: testCase.reasoning_trace,
          category: testCase.category,
          display_type: testCase.display_type,
        };

        console.log('About to POST audit result:', {
          audit_id: result.id,
          trace_id: testCase.conversation_id,
          conversation_id: result.conversation_id || testCase.conversation_id,
        });

        const response = await fetch('/api/audit-results', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audit_id: result.id,
            trace_id: testCase.conversation_id,
            conversation_id: result.conversation_id || testCase.conversation_id,
            skill_id: result.skill_id,
            model_name: result.model_name,
            overall_score: result.overall_score,
            confidence: result.confidence,
            status,
            risk_score: riskScore,
            detected_types: result.detected_types,
            metrics: result.metrics,
            recommendations: result.recommendations,
            limitations: result.limitations,
            usage: result.usage,
            detection_event,
            conversation_data: cleanTestCase,
            // Multi-skill fields
            skill_results: result.skill_results,
            combined_score: result.combined_score,
            primary_category: result.primary_category,
            secondary_categories: result.secondary_categories,
            detection_metadata: result.detection_metadata,
            // Taxonomy patterns
            patterns: result.patterns,
          }),
        });

        console.log('POST response status:', response.status);
        if (!response.ok) {
          const errorData = await response.json();
          console.error('Server error response:', errorData);
        }
      } catch (saveErr) {
        console.error('Failed to save audit result to database:', saveErr);
        console.error('Error type:', saveErr instanceof Error ? saveErr.constructor.name : typeof saveErr);
        console.error('Error message:', saveErr instanceof Error ? saveErr.message : String(saveErr));
        // Don't fail the audit if save fails - data is still in UI
      }

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
  const categories = useMemo(() => {
    const cats = new Set(allTestCases.map(tc => tc.category));
    return Array.from(cats);
  }, [allTestCases]);

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
          value={filterCategory}
          onChange={(e) => {
            setFilterCategory(e.target.value);
            setCurrentPage(1);
          }}
          className="bg-slate-900/50 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
        >
          <option value="all">All Categories</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        
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
                      {reportCounts.has(testCase.conversation_id) && reportCounts.get(testCase.conversation_id)! > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedConversationForReport(testCase);
                            setShowReportsListModal(true);
                          }}
                          className="text-xs px-2 py-0.5 bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 rounded hover:bg-cyan-500/30"
                          title={`${reportCounts.get(testCase.conversation_id)} report(s) available`}
                        >
                          {reportCounts.get(testCase.conversation_id)} report{reportCounts.get(testCase.conversation_id)! !== 1 ? 's' : ''}
                        </button>
                      )}
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
                    <button
                      onClick={() => handleRunAudit(testCase)}
                      disabled={isRunning}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        isRunning
                          ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
                          : hasResult
                          ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/50 hover:bg-cyan-500/20'
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

              // Refresh report counts
              const counts = new Map(reportCounts);
              counts.set(config.conversation_id, (counts.get(config.conversation_id) || 0) + 1);
              setReportCounts(counts);

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
            // Refresh report counts
            if (selectedConversationForReport) {
              const counts = new Map(reportCounts);
              // Increment count (exact count would come from API)
              counts.set(selectedConversationForReport.conversation_id, (counts.get(selectedConversationForReport.conversation_id) || 0) + 1);
              setReportCounts(counts);
            }
          }}
        />
      )}

      {/* Reports List Modal */}
      {showReportsListModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-xl border border-slate-700 w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-800">
              <h2 className="text-xl font-bold text-slate-100">All Reports</h2>
              <button
                onClick={() => {
                  setShowReportsListModal(false);
                  setSelectedConversationForReport(null);
                }}
                className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ReportListView
                conversationId={selectedConversationForReport?.conversation_id}
                onDeleteReports={async (reportIds) => {
                  for (const reportId of reportIds) {
                    await fetch(`/api/audit-reports/${reportId}`, { method: 'DELETE' });
                  }
                  // Refresh report counts
                  const counts = new Map(reportCounts);
                  if (selectedConversationForReport) {
                    const current = counts.get(selectedConversationForReport.conversation_id) || 0;
                    counts.set(selectedConversationForReport.conversation_id, Math.max(0, current - reportIds.length));
                  }
                  setReportCounts(counts);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditView;
