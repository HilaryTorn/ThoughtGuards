import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Play, CheckCircle, AlertTriangle, Loader2, FileText, X, Search, Filter, Eye, PlayCircle, Pause, ChevronLeft, ChevronRight, Clock, Zap } from 'lucide-react';
import { EnrichedTestCase, AuditResult, Skill } from '../lib/types';
import { executeSkillAudit } from '../lib/skillExecutor';
import { loadAllTestCases } from '../lib/loadTestCases';
import { AppSettings } from '../types';
import { AVAILABLE_SKILLS, CATEGORY_TO_SKILL, getSkillById } from '../lib/skillsRegistry';

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
  const [testCasesWithStatus, setTestCasesWithStatus] = useState<Map<string, TestCaseWithStatus>>(new Map());

  // Load all test cases on mount
  useEffect(() => {
    let mounted = true;
    
    const loadCases = async () => {
      setIsLoadingCases(true);
      setError(null);
      try {
        console.log('Starting to load test cases...');
        const cases = await loadAllTestCases();
        console.log(`Loaded ${cases.length} total test cases`);
        if (mounted) {
          setAllTestCases(cases);
          const map = new Map<string, TestCaseWithStatus>();
          cases.forEach(tc => {
            map.set(tc.conversation_id, { ...tc, status: 'pending' as TestCaseStatus });
          });
          setTestCasesWithStatus(map);
          if (cases.length === 0) {
            setError('No test cases loaded. Check console for details. Make sure mock_data files are copied to public/mock_data.');
          }
        }
      } catch (error: any) {
        console.error('Failed to load test cases:', error);
        setError(`Failed to load test cases: ${error.message || error}`);
      } finally {
        if (mounted) {
          setIsLoadingCases(false);
        }
      }
    };

    loadCases();
    
    return () => {
      mounted = false;
    };
  }, []);
  
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

  // Get skill for test case
  const getSkillForTestCase = useCallback((testCase: EnrichedTestCase): Skill => {
    const categoryMap: Record<string, string> = {
      'Opinion': 'Persona Manipulation',
      'Answer': 'Goal Reasoning',
      'Social': 'Persona Manipulation',
      'Control': 'Goal Reasoning',
      'Deception': 'Deception Planning',
      'Reward Hacking': 'Reward Hacking',
    };
    
    const mappedCategory = categoryMap[testCase.category] as any;
    let skillId: string;
    
    if (mappedCategory && settings?.activeSkills?.[mappedCategory]) {
      skillId = settings.activeSkills[mappedCategory];
    } else if (mappedCategory && CATEGORY_TO_SKILL[mappedCategory]) {
      skillId = CATEGORY_TO_SKILL[mappedCategory];
    } else {
      skillId = 'sycophancy-auditor';
    }
    
    const skill = getSkillById(skillId);
    return skill || AVAILABLE_SKILLS[0];
  }, [settings]);

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
      const skill = getSkillForTestCase(testCase);
      const result = await executeSkillAudit(
        skill,
        testCase,
        settings.auditorModel,
        {
          sensitivity: settings.sensitivity,
          thinkingBudget: settings.thinkingBudget,
          includeValidatorCoT: settings.includeValidatorCoT,
        }
      );
      
      setTestCasesWithStatus(prev => {
        const updated = new Map(prev);
        updated.set(caseId, { ...testCase, status: 'completed' as TestCaseStatus, result });
        return updated;
      });
      
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
  }, [getSkillForTestCase, settings, onResult]);

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

  if (isLoadingCases) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Loader2 size={32} className="animate-spin text-cyan-500 mx-auto mb-4" />
          <p className="text-slate-400">Loading test cases...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <FileText size={18} className="text-cyan-500" />
            Audit Test Cases
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            {stats.total} total • {stats.completed} completed • {stats.pending} pending
          </p>
        </div>
        
        <div className="flex items-center gap-3">
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

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle size={18} className="text-red-400" />
          <span className="text-sm text-red-400">{error}</span>
        </div>
      )}

      {/* Test Cases List */}
      <div className="space-y-2">
        {paginatedTestCases.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            No test cases found matching your filters.
          </div>
        ) : (
          paginatedTestCases.map((testCase) => {
            const isRunning = testCase.status === 'running';
            const hasResult = testCase.status === 'completed' && testCase.result;

            return (
              <div
                key={testCase.conversation_id}
                className={`bg-slate-900/30 border rounded-lg p-4 transition-all ${
                  testCase.status === 'running' ? 'border-cyan-500/50 ring-1 ring-cyan-500/20' : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
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
                    <p className="text-xs text-slate-400 mb-2">{testCase.category} • {testCase.display_type}</p>
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
                  {selectedTestCase.turns.map((turn, idx) => (
                    <div key={idx} className={`p-3 rounded-lg ${
                      turn.role === 'user' ? 'bg-slate-800/50' : 'bg-slate-800/30'
                    }`}>
                      <div className="text-xs font-medium text-slate-500 mb-1 uppercase">{turn.role}</div>
                      <div className="text-sm text-slate-200 whitespace-pre-wrap">{turn.content}</div>
                    </div>
                  ))}
                </div>
              </div>
              
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
    </div>
  );
};

export default AuditView;
