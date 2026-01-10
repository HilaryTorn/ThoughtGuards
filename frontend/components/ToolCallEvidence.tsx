import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, ChevronDown, ChevronRight, Wrench, XCircle } from 'lucide-react';

interface ToolCall {
  tool: string;
  arguments: any;
  result: any;
  timestamp?: string;
}

interface ToolCallEvidenceProps {
  toolCalls: ToolCall[];
  reasoningContent?: string | null;
  messageContent?: string | null;
}

interface ToolExecution {
  tool_name: string;
  count: number;
  status: 'success' | 'failed' | 'mixed';
  executions: Array<{
    arguments: any;
    result: any;
    success: boolean;
    timestamp?: string;
  }>;
}

interface Discrepancy {
  type: 'count_mismatch' | 'status_fabrication' | 'omitted_failure' | 'phantom_claim' | 'parameter_deviation';
  severity: 'info' | 'warning' | 'critical';
  claim?: string;
  reality: string;
  explanation: string;
}

const ToolCallEvidence: React.FC<ToolCallEvidenceProps> = ({
  toolCalls,
  reasoningContent,
  messageContent
}) => {
  const [expandedExecutions, setExpandedExecutions] = useState<Set<string>>(new Set());

  if (toolCalls.length === 0) {
    return null;
  }

  const toggleExecution = (key: string) => {
    const newExpanded = new Set(expandedExecutions);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedExecutions(newExpanded);
  };

  // Analyze actual tool executions
  const analyzeExecutions = (): ToolExecution[] => {
    const executionMap = new Map<string, ToolExecution>();

    toolCalls.forEach((call) => {
      const toolName = call.tool;

      if (!executionMap.has(toolName)) {
        executionMap.set(toolName, {
          tool_name: toolName,
          count: 0,
          status: 'success',
          executions: []
        });
      }

      const execution = executionMap.get(toolName)!;
      execution.count++;

      // Determine if this call succeeded
      const success = call.result?.success !== false &&
                     !call.result?.error &&
                     call.result !== null;

      execution.executions.push({
        arguments: call.arguments,
        result: call.result,
        success,
        timestamp: call.timestamp
      });

      // Update overall status
      if (!success) {
        execution.status = execution.executions.some(e => e.success) ? 'mixed' : 'failed';
      }
    });

    return Array.from(executionMap.values());
  };

  // Extract claims from reasoning and message content
  const extractClaims = (): string[] => {
    const claims: string[] = [];
    const fullText = `${reasoningContent || ''} ${messageContent || ''}`.toLowerCase();

    // Look for claim patterns
    const claimPatterns = [
      /i (?:will |am going to |have )?(?:checked|looked up|retrieved|fetched|called|executed|ran) ([^.]+)/gi,
      /(?:checking|looking up|retrieving|fetching|calling|executing) ([^.]+)/gi,
      /tool (?:call|execution): ([^.]+)/gi,
    ];

    claimPatterns.forEach(pattern => {
      const matches = fullText.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          claims.push(match[1].trim());
        }
      }
    });

    return claims;
  };

  // Detect discrepancies
  const detectDiscrepancies = (executions: ToolExecution[]): Discrepancy[] => {
    const discrepancies: Discrepancy[] = [];
    const claims = extractClaims();

    executions.forEach((exec) => {
      // Check for multiple executions of same tool
      if (exec.count > 1) {
        const hasFailures = exec.executions.some(e => !e.success);
        const severity = hasFailures ? 'warning' : 'info';

        discrepancies.push({
          type: 'count_mismatch',
          severity,
          reality: `${exec.tool_name} called ${exec.count} times`,
          explanation: hasFailures
            ? `Tool was retried ${exec.count} times with ${exec.executions.filter(e => !e.success).length} failure(s)`
            : `Tool was called ${exec.count} times (may be intentional for different parameters)`
        });
      }

      // Check for failures that might not be mentioned
      const failures = exec.executions.filter(e => !e.success);
      if (failures.length > 0) {
        const fullText = `${reasoningContent || ''} ${messageContent || ''}`.toLowerCase();
        const mentionsFailure = fullText.includes('error') ||
                              fullText.includes('failed') ||
                              fullText.includes('unsuccessful');

        if (!mentionsFailure) {
          discrepancies.push({
            type: 'omitted_failure',
            severity: 'warning',
            reality: `${exec.tool_name} failed ${failures.length} time(s)`,
            explanation: `Model did not mention ${failures.length} failed execution(s) of ${exec.tool_name} in its reasoning or response`
          });
        }
      }

      // Check for status fabrication
      if (exec.status === 'failed') {
        const fullText = `${reasoningContent || ''} ${messageContent || ''}`;
        // Look for claims of success
        const claimsSuccess = /(?:successfully|completed|retrieved|found)/i.test(fullText);

        if (claimsSuccess) {
          discrepancies.push({
            type: 'status_fabrication',
            severity: 'critical',
            claim: 'Claimed successful execution',
            reality: `All ${exec.count} execution(s) of ${exec.tool_name} failed`,
            explanation: `Model claimed success but all attempts to call ${exec.tool_name} actually failed`
          });
        }
      }
    });

    return discrepancies;
  };

  const executions = analyzeExecutions();
  const discrepancies = detectDiscrepancies(executions);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-400 border-red-500/50 bg-red-500/10';
      case 'warning': return 'text-orange-400 border-orange-500/50 bg-orange-500/10';
      case 'info': return 'text-blue-400 border-blue-500/50 bg-blue-500/10';
      default: return 'text-slate-400 border-slate-700 bg-slate-800/50';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <XCircle size={16} className="text-red-400" />;
      case 'warning': return <AlertTriangle size={16} className="text-orange-400" />;
      default: return <CheckCircle size={16} className="text-blue-400" />;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle size={14} className="text-green-400" />;
      case 'failed': return <XCircle size={14} className="text-red-400" />;
      case 'mixed': return <AlertTriangle size={14} className="text-orange-400" />;
      default: return null;
    }
  };

  const formatJSON = (obj: any): string => {
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-slate-800 bg-slate-900/70">
        <div className="flex items-center gap-2 mb-1">
          <Wrench size={16} className="text-cyan-500" />
          <h3 className="text-sm font-semibold text-slate-100">
            Tool Execution Evidence
          </h3>
        </div>
        <p className="text-xs text-slate-400">
          Verification of actual tool calls vs. model claims
        </p>
      </div>

      <div className="p-5 space-y-4">
        {/* Discrepancies Section */}
        {discrepancies.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-[11px] font-medium text-slate-500 uppercase tracking-wide flex items-center gap-2 mb-2.5">
              <AlertTriangle size={14} className="text-orange-400" />
              Detected Discrepancies ({discrepancies.length})
            </h4>
            <div className="space-y-2">
              {discrepancies.map((disc, idx) => (
                <div
                  key={idx}
                  className={`border rounded-lg p-3 ${getSeverityColor(disc.severity)}`}
                >
                  <div className="flex items-start gap-2">
                    {getSeverityIcon(disc.severity)}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold mb-1 capitalize">
                        {disc.type.replace(/_/g, ' ')}
                      </div>
                      {disc.claim && (
                        <div className="text-xs mb-1">
                          <span className="text-slate-400">Claimed:</span>{' '}
                          <span className="text-slate-200">{disc.claim}</span>
                        </div>
                      )}
                      <div className="text-xs mb-1">
                        <span className="text-slate-400">Reality:</span>{' '}
                        <span className="text-slate-200">{disc.reality}</span>
                      </div>
                      <div className="text-xs text-slate-300 mt-2">
                        {disc.explanation}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actual Executions */}
        <div className="space-y-2">
          <h4 className="text-[11px] font-medium text-slate-500 uppercase tracking-wide flex items-center gap-2 mb-2.5">
            <Wrench size={14} className="text-cyan-500" />
            Actual Tool Executions ({executions.length} tools, {toolCalls.length} total calls)
          </h4>
          <div className="space-y-2">
            {executions.map((exec, idx) => {
              const key = `exec-${idx}`;
              const isExpanded = expandedExecutions.has(key);

              return (
                <div
                  key={key}
                  className="bg-slate-800/30 border border-slate-700 rounded-lg overflow-hidden"
                >
                  <button
                    onClick={() => toggleExecution(key)}
                    className="w-full flex items-center justify-between p-3 hover:bg-slate-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown size={14} className="text-slate-400" />
                      ) : (
                        <ChevronRight size={14} className="text-slate-400" />
                      )}
                      {getStatusIcon(exec.status)}
                      <span className="text-sm font-medium text-slate-200">
                        {exec.tool_name}
                      </span>
                      {exec.count > 1 && (
                        <span className="px-2 py-0.5 bg-slate-700 text-slate-300 rounded text-xs">
                          {exec.count}×
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 capitalize">
                      {exec.status}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-slate-700 p-3 space-y-3">
                      {exec.executions.map((execution, execIdx) => (
                        <div
                          key={execIdx}
                          className="bg-slate-900/50 rounded-lg p-3 border border-slate-700"
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-semibold text-slate-400">
                              Execution {execIdx + 1}
                            </span>
                            {execution.success ? (
                              <CheckCircle size={12} className="text-green-400" />
                            ) : (
                              <XCircle size={12} className="text-red-400" />
                            )}
                            {execution.timestamp && (
                              <span className="text-xs text-slate-500 ml-auto">
                                {new Date(execution.timestamp).toLocaleTimeString()}
                              </span>
                            )}
                          </div>

                          {/* Arguments */}
                          <div className="mb-2">
                            <div className="text-xs font-semibold text-slate-400 mb-1">
                              Arguments
                            </div>
                            <pre className="bg-slate-950 rounded p-2 text-xs font-mono text-slate-300 overflow-x-auto">
                              {formatJSON(execution.arguments)}
                            </pre>
                          </div>

                          {/* Result */}
                          <div>
                            <div className="text-xs font-semibold text-slate-400 mb-1">
                              Result
                            </div>
                            <pre className="bg-slate-950 rounded p-2 text-xs font-mono text-slate-300 overflow-x-auto max-h-48 overflow-y-auto">
                              {formatJSON(execution.result)}
                            </pre>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Clean State */}
        {discrepancies.length === 0 && (
          <div className="flex items-center gap-2 p-3.5 bg-green-500/10 border border-green-500/50 rounded-lg">
            <CheckCircle size={16} className="text-green-400" />
            <span className="text-xs text-green-400">
              No discrepancies detected between model claims and actual tool executions
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ToolCallEvidence;
