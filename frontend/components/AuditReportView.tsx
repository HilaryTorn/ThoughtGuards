import React, { useState } from 'react';
import { X, FileText, Brain, Target, AlertTriangle, CheckCircle, Info, TrendingUp, TrendingDown, BarChart3, BrainCircuit, MessageSquare, Check, Minus, VenetianMask, Gift, Bomb, CloudFog, Tent } from 'lucide-react';
import { Trace, DetectionCategory } from '../types';
import { CATEGORY_STYLES, PATTERNS_BY_CATEGORY } from '../constants';

const Icons: Record<string, React.ElementType> = {
  Target,
  VenetianMask,
  Gift,
  Bomb,
  CloudFog,
  Tent,
};

interface AuditReportViewProps {
  trace: Trace;
  onClose: () => void;
}

const AuditReportView: React.FC<AuditReportViewProps> = ({ trace, onClose }) => {
  if (!trace.auditId) {
    return null;
  }

  const event = trace.detectionEvent;
  const isFlagged = trace.status === 'flagged' || trace.status === 'confirmed' || trace.status === 'reviewed' || trace.status === 'false_positive';
  const catStyle = event ? CATEGORY_STYLES[event.category] : null;

  const detectedTypes = trace.detectedTypes || [];
  const metrics = trace.metrics || {};
  const recommendations = trace.recommendations || [];
  const limitations = trace.limitations || [];
  const usage = trace.usage;
  
  // Multi-skill fields (from Trace type extensions)
  const skillResults = (trace as any).skillResults || [];
  const combinedScore = (trace as any).combinedScore;
  const primaryCategory = (trace as any).primaryCategory;
  const secondaryCategories = (trace as any).secondaryCategories || [];
  const detectionMetadata = (trace as any).detectionMetadata;
  const isMultiSkill = skillResults.length > 1 || combinedScore !== undefined;
  
  // Statistical fields (from multi-run analysis)
  const statistics = (trace as any).statistics;
  const runCount = (trace as any).runCount || 1;
  const isMultiRun = runCount > 1;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-xl border border-slate-700 w-full max-w-7xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <FileText size={24} className="text-cyan-500" />
            <div>
              <h2 className="text-xl font-bold text-slate-100">Audit Report</h2>
              <p className="text-sm text-slate-400 font-mono mt-1">Trace ID: {trace.id}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content - Two Column Layout */}
        <div className="flex-1 overflow-hidden flex gap-6 p-6">
          {/* Left Column - Conversation */}
          <div className="flex-1 overflow-y-auto min-w-0">
            {trace.conversation && trace.conversation.length > 0 && (
              <div className="glass-panel rounded-xl border-slate-800 overflow-hidden h-full flex flex-col">
                <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex-shrink-0">
                  <h3 className="font-semibold text-slate-300 flex items-center gap-2">
                    <MessageSquare size={16} className="text-cyan-500" />
                    Full Conversation Thread
                  </h3>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-950/30">
                  {trace.conversation.map((msg: any, idx: number) => {
                    const isTrigger = isFlagged && idx >= trace.conversation.length - 2;
                    return (
                      <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                        <div className={`
                          max-w-[85%] px-4 py-3 rounded-2xl text-sm relative group
                          ${msg.role === 'user' 
                            ? 'bg-slate-800 text-slate-200 rounded-tr-sm' 
                            : 'bg-gradient-to-br from-slate-900 to-slate-900 border border-slate-800 text-slate-300 rounded-tl-sm'
                          }
                          ${isTrigger && msg.role === 'assistant' && catStyle ? `ring-1 ring-offset-2 ring-offset-slate-950 ${catStyle.borderColor.replace('border-', 'ring-')}` : ''}
                        `}>
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                          <span className="text-[10px] text-slate-500 mt-1 block opacity-0 group-hover:opacity-100 transition-opacity">
                            {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : 'N/A'}
                          </span>
                          {msg.reasoning_trace && (
                            <div className="mt-3 pt-3 border-t border-slate-700">
                              <p className="text-xs font-semibold text-amber-400 mb-1">Internal Reasoning (Chain-of-Thought):</p>
                              <p className="text-xs text-slate-300 whitespace-pre-wrap bg-slate-950/50 p-2 rounded font-mono">{msg.reasoning_trace}</p>
                            </div>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-600 mt-1 px-1 uppercase tracking-wide font-bold">
                          {msg.role}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right Column - All Other Sections */}
          <div className="w-1/2 overflow-y-auto space-y-6 min-w-0">
            {/* Pre-Classification Results */}
            {detectionMetadata && detectionMetadata.categories_detected && detectionMetadata.categories_detected.length > 0 && (
            <div className="glass-panel p-6 rounded-xl border-slate-800">
              <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
                <Brain size={20} className="text-blue-500" />
                Pre-Classification Analysis
              </h3>
              <div className="mb-4 p-3 bg-slate-950/50 border border-slate-700 rounded-lg">
                <p className="text-xs text-slate-500 mb-1">Overall Detection Confidence</p>
                <p className="text-lg font-semibold text-blue-400">
                  {(detectionMetadata.detection_confidence * 100).toFixed(0)}%
                </p>
                {detectionMetadata.detection_reasoning && (
                  <p className="text-sm text-slate-300 mt-2 italic">
                    {detectionMetadata.detection_reasoning}
                  </p>
                )}
              </div>
              <div className="space-y-3">
                <p className="text-sm text-slate-400 mb-3">Detected Categories:</p>
                {detectionMetadata.categories_detected
                  .filter((cat: any) => cat.category !== 'none')
                  .map((cat: any, idx: number) => (
                    <div key={idx} className="bg-slate-950/50 border border-slate-700 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-slate-200">{cat.category}</span>
                        <span className="text-sm font-mono text-blue-400">
                          {(cat.confidence * 100).toFixed(0)}% confidence
                        </span>
                      </div>
                      {cat.reasoning && (
                        <p className="text-sm text-slate-400 mt-2 italic">{cat.reasoning}</p>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="glass-panel p-6 rounded-xl border-slate-800">
            <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <BarChart3 size={20} className="text-cyan-500" />
              Summary
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-slate-500 mb-1">
                  {isMultiSkill ? 'Combined Score' : 'Overall Score'}
                  {isMultiRun && <span className="ml-1 text-cyan-400">(mean)</span>}
                </p>
                <p className="text-2xl font-bold text-slate-100">
                  {statistics && statistics.mean !== undefined
                    ? (statistics.mean * 100).toFixed(1)
                    : isMultiSkill && combinedScore !== undefined 
                      ? (combinedScore * 100).toFixed(1)
                      : trace.overallScore 
                        ? (trace.overallScore * 100).toFixed(1) 
                        : trace.riskScore}%
                </p>
                {statistics && statistics.stddev !== undefined && (
                  <p className="text-xs text-slate-500 mt-1">
                    σ = {(statistics.stddev * 100).toFixed(1)}%
                  </p>
                )}
                {isMultiRun && (
                  <p className="text-xs text-cyan-400 mt-1">
                    {runCount} runs
                  </p>
                )}
                {isMultiSkill && trace.overallScore && !statistics && (
                  <p className="text-xs text-slate-500 mt-1">Primary: {(trace.overallScore * 100).toFixed(1)}%</p>
                )}
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Confidence</p>
                <p className="text-lg font-semibold text-slate-200 capitalize">{trace.confidence || 'N/A'}</p>
                {detectionMetadata && (
                  <p className="text-xs text-slate-500 mt-1">
                    Detection: {(detectionMetadata.detection_confidence * 100).toFixed(0)}%
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Model</p>
                <p className="text-sm font-mono text-slate-300 truncate" title={trace.modelName}>
                  {trace.modelName || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">
                  {isMultiSkill ? 'Skills' : 'Skill'}
                </p>
                <p className="text-sm text-slate-300 truncate" title={trace.skillId}>
                  {isMultiSkill ? `${skillResults.length} skills` : (trace.skillId || 'N/A')}
                </p>
              </div>
            </div>

            {/* Full Parameter Configuration */}
            {(trace as any).llmParameters && (
              <div className="mt-4 p-4 bg-slate-950/50 border border-slate-700 rounded-lg">
                <h4 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                  <BarChart3 size={16} className="text-purple-500" />
                  LLM Parameters
                </h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {(trace as any).llmParameters.temperature !== undefined && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Temperature</p>
                      <p className="text-slate-200 font-mono">{(trace as any).llmParameters.temperature}</p>
                    </div>
                  )}
                  {(trace as any).llmParameters.top_p !== undefined && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Top P</p>
                      <p className="text-slate-200 font-mono">{(trace as any).llmParameters.top_p}</p>
                    </div>
                  )}
                  {(trace as any).llmParameters.top_k !== undefined && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Top K</p>
                      <p className="text-slate-200 font-mono">{(trace as any).llmParameters.top_k}</p>
                    </div>
                  )}
                  {(trace as any).llmParameters.max_tokens !== undefined && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Max Tokens</p>
                      <p className="text-slate-200 font-mono">{(trace as any).llmParameters.max_tokens}</p>
                    </div>
                  )}
                  {(trace as any).llmParameters.seed !== undefined && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Seed</p>
                      <p className="text-slate-200 font-mono">{(trace as any).llmParameters.seed}</p>
                    </div>
                  )}
                  {(trace as any).llmParameters.presence_penalty !== undefined && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Presence Penalty</p>
                      <p className="text-slate-200 font-mono">{(trace as any).llmParameters.presence_penalty}</p>
                    </div>
                  )}
                  {(trace as any).llmParameters.frequency_penalty !== undefined && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Frequency Penalty</p>
                      <p className="text-slate-200 font-mono">{(trace as any).llmParameters.frequency_penalty}</p>
                    </div>
                  )}
                  {(trace as any).llmParameters.thinking_budget !== undefined && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Thinking Budget</p>
                      <p className="text-slate-200 font-mono">{(trace as any).llmParameters.thinking_budget}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Skill Version & Cache Status */}
            {((trace as any).skillVersion || (trace as any).cacheHit !== undefined) && (
              <div className="mt-4 p-4 bg-slate-950/50 border border-slate-700 rounded-lg">
                <h4 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                  <Info size={16} className="text-blue-500" />
                  Execution Metadata
                </h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {(trace as any).skillVersion && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Skill Version</p>
                      <p className="text-slate-200 font-mono">{(trace as any).skillVersion}</p>
                    </div>
                  )}
                  {(trace as any).cacheHit !== undefined && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Cache Status</p>
                      <p className={`font-mono ${(trace as any).cacheHit ? 'text-green-400' : 'text-slate-400'}`}>
                        {(trace as any).cacheHit ? 'Hit' : 'Miss'}
                        {(trace as any).cachedTokens && (
                          <span className="text-xs text-slate-500 ml-2">
                            ({(trace as any).cachedTokens} tokens cached)
                          </span>
                        )}
                      </p>
                    </div>
                  )}
                  {(trace as any).systemFingerprint && (
                    <div className="col-span-2">
                      <p className="text-xs text-slate-500 mb-1">System Fingerprint</p>
                      <p className="text-slate-200 font-mono text-xs break-all">{(trace as any).systemFingerprint}</p>
                    </div>
                  )}
                  {(trace as any).promptHash && (
                    <div className="col-span-2">
                      <p className="text-xs text-slate-500 mb-1">Prompt Hash</p>
                      <p className="text-slate-200 font-mono text-xs break-all">{(trace as any).promptHash}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Statistical Distribution (if multi-run) */}
            {isMultiRun && statistics && (
              <div className="mt-4 p-4 bg-slate-950/50 border border-slate-700 rounded-lg">
                <h4 className="text-sm font-semibold text-slate-300 mb-3">Statistical Distribution</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Mean ± Std Dev</p>
                    <p className="text-slate-200 font-mono">
                      {(statistics.mean * 100).toFixed(1)}% ± {(statistics.stddev * 100).toFixed(1)}%
                    </p>
                  </div>
                  {statistics.quantiles && (
                    <>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">5th / 50th / 95th Percentile</p>
                        <p className="text-slate-200 font-mono text-xs">
                          {(statistics.quantiles.p5 * 100).toFixed(1)}% / {(statistics.quantiles.p50 * 100).toFixed(1)}% / {(statistics.quantiles.p95 * 100).toFixed(1)}%
                        </p>
                      </div>
                      {statistics.confidenceInterval && (
                        <div className="col-span-2">
                          <p className="text-xs text-slate-500 mb-1">
                            {(statistics.confidenceInterval.level * 100).toFixed(0)}% Confidence Interval
                          </p>
                          <p className="text-slate-200 font-mono text-xs">
                            [{(statistics.confidenceInterval.lower * 100).toFixed(1)}%, {(statistics.confidenceInterval.upper * 100).toFixed(1)}%]
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
            
            {/* Multi-skill categories */}
            {isMultiSkill && (primaryCategory || secondaryCategories.length > 0) && (
              <div className="mt-4 pt-4 border-t border-slate-700">
                <p className="text-xs text-slate-500 mb-2">Detected Categories</p>
                <div className="flex flex-wrap gap-2">
                  {primaryCategory && (
                    <span className="px-3 py-1 bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 rounded-full text-xs font-semibold">
                      Primary: {primaryCategory}
                    </span>
                  )}
                  {secondaryCategories.map((cat: string, idx: number) => (
                    <span key={idx} className="px-3 py-1 bg-slate-700/50 text-slate-300 border border-slate-600 rounded-full text-xs">
                      {cat}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
          </div>

          {/* Multi-Skill Results */}
          {isMultiSkill && skillResults.length > 0 && (
            <div className="glass-panel p-6 rounded-xl border-slate-800">
              <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
                <BrainCircuit size={20} className="text-purple-500" />
                Individual Skill Results ({skillResults.length} skills)
              </h3>
              <div className="space-y-3">
                {skillResults.map((skillResult: any, idx: number) => (
                  <div key={idx} className="bg-slate-950/50 border border-slate-700 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="font-semibold text-slate-200">{skillResult.category || skillResult.skill_id}</span>
                        <span className="text-xs text-slate-500 ml-2">({skillResult.skill_id})</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-slate-400 capitalize">{skillResult.confidence}</span>
                        <span className="text-lg font-mono text-cyan-400">
                          {(skillResult.overall_score * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    {skillResult.error && (
                      <p className="text-xs text-red-400 mt-2">Error: {skillResult.error}</p>
                    )}
                    {skillResult.detected_types && skillResult.detected_types.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {skillResult.detected_types.slice(0, 3).map((dt: any, dtIdx: number) => (
                          <span key={dtIdx} className="text-xs px-2 py-1 bg-slate-900/50 rounded text-slate-400">
                            {dt.type}: {(dt.score * 100).toFixed(0)}%
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detected Types */}
          {detectedTypes.length > 0 && (
            <div className="glass-panel p-6 rounded-xl border-slate-800">
              <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
                <AlertTriangle size={20} className="text-red-500" />
                Detected Manipulation Types
              </h3>
              <div className="space-y-3">
                {detectedTypes.map((dt, idx) => (
                  <div key={idx} className="bg-slate-950/50 border border-slate-700 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-slate-200 capitalize">{dt.type.replace(/_/g, ' ')}</span>
                      <span className="text-sm font-mono text-cyan-400">{(dt.score * 100).toFixed(1)}%</span>
                    </div>
                    {dt.evidence && dt.evidence.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {dt.evidence.slice(0, 3).map((ev: any, evIdx: number) => (
                          <div key={evIdx} className="text-sm text-slate-400 bg-slate-900/50 rounded p-2">
                            <p className="text-slate-300 mb-1">{ev.reason || ev.snippet}</p>
                            {ev.snippet && (
                              <p className="text-xs text-slate-500 italic mt-1">"{ev.snippet.substring(0, 150)}..."</p>
                            )}
                            {ev.turn_number && (
                              <p className="text-xs text-slate-600 mt-1">Turn #{ev.turn_number}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metrics */}
          {Object.keys(metrics).length > 0 && (
            <div className="glass-panel p-6 rounded-xl border-slate-800">
              <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
                <TrendingUp size={20} className="text-amber-500" />
                Metrics
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(metrics).map(([key, value]) => (
                  <div key={key} className="bg-slate-950/50 border border-slate-700 rounded-lg p-3">
                    <p className="text-xs text-slate-500 mb-1 capitalize">{key.replace(/_/g, ' ')}</p>
                    <p className="text-lg font-semibold text-slate-200">
                      {typeof value === 'number' ? value.toFixed(2) : String(value || 'N/A')}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {recommendations.length > 0 && (
            <div className="glass-panel p-6 rounded-xl border-slate-800">
              <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
                <CheckCircle size={20} className="text-emerald-500" />
                Recommendations
              </h3>
              <ul className="space-y-2">
                {recommendations.map((rec, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-slate-300">
                    <span className="text-emerald-400 mt-1">•</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Limitations */}
          {limitations.length > 0 && (
            <div className="glass-panel p-6 rounded-xl border-slate-800">
              <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
                <Info size={20} className="text-amber-500" />
                Limitations
              </h3>
              <ul className="space-y-2">
                {limitations.map((lim, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-slate-400">
                    <span className="text-amber-400 mt-1">•</span>
                    <span>{lim}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

            {/* Token Usage */}
          {usage && (
            <div className="glass-panel p-6 rounded-xl border-slate-800">
              <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
                <Brain size={20} className="text-purple-500" />
                Token Usage
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Prompt Tokens</p>
                  <p className="text-lg font-semibold text-slate-200">{usage.prompt_tokens || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Completion Tokens</p>
                  <p className="text-lg font-semibold text-slate-200">{usage.candidates_tokens || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Total Tokens</p>
                  <p className="text-lg font-semibold text-slate-200">{usage.total_tokens || 0}</p>
                </div>
                {(trace as any).cachedTokens && (
                  <div className="col-span-3">
                    <p className="text-xs text-slate-500 mb-1">Cached Tokens</p>
                    <p className="text-sm font-semibold text-green-400">{(trace as any).cachedTokens}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Cache Efficiency: {((trace as any).cachedTokens / (usage.total_tokens || 1) * 100).toFixed(1)}%
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Related Reports */}
          {trace.conversationId && (
            <div className="glass-panel p-6 rounded-xl border-slate-800">
              <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
                <FileText size={20} className="text-cyan-500" />
                Related Reports
              </h3>
              <div className="space-y-2">
                <p className="text-sm text-slate-400">
                  View other reports for this conversation:
                </p>
                <button
                  onClick={() => {
                    // Navigate to reports list filtered by conversation_id
                    window.location.hash = `#traces?conversation_id=${trace.conversationId}`;
                  }}
                  className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/50 rounded-lg text-sm transition-colors"
                >
                  View All Reports for Conversation
                </button>
                {trace.auditId && (
                  <p className="text-xs text-slate-500 mt-2">
                    Report ID: <span className="font-mono">{trace.auditId}</span>
                  </p>
                )}
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuditReportView;

