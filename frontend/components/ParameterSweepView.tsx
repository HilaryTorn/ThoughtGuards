import React, { useState, useEffect } from 'react';
import { X, Play, Square, Download, BarChart3, Grid, TrendingUp, AlertCircle } from 'lucide-react';
import { ParameterSweepConfig, Conversation } from '../types';
import { executeParameterSweep, SweepProgress, SweepResult } from '../lib/parameterSweepExecutor';

interface ParameterSweepViewProps {
  conversation: Conversation;
  availableSkills: Array<{ id: string; name?: string }>;
  availableModels: string[];
  onClose: () => void;
  onComplete?: (sweepId: string) => void;
}

const ParameterSweepView: React.FC<ParameterSweepViewProps> = ({
  conversation,
  availableSkills,
  availableModels,
  onClose,
  onComplete
}) => {
  const [sweepName, setSweepName] = useState('');
  const [skillId, setSkillId] = useState<string>(availableSkills[0]?.id || '');
  const [modelName, setModelName] = useState<string>(availableModels[0] || '');
  const [parallel, setParallel] = useState(true);
  const [maxConcurrent, setMaxConcurrent] = useState(5);
  
  // Parameter ranges
  const [temperatureRange, setTemperatureRange] = useState({ min: 0.1, max: 1.0, step: 0.1 });
  const [topPRange, setTopPRange] = useState({ min: 0.5, max: 1.0, step: 0.1 });
  const [seedRange, setSeedRange] = useState({ min: 1, max: 10, step: 1 });
  
  const [useTemperature, setUseTemperature] = useState(true);
  const [useTopP, setUseTopP] = useState(false);
  const [useSeed, setUseSeed] = useState(false);
  
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<SweepProgress | null>(null);
  const [results, setResults] = useState<Array<{ combinationId: string; parameters: any; report?: any; error?: string }>>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'heatmap' | 'list'>('grid');

  const calculateTotalCombinations = () => {
    let total = 1;
    if (useTemperature) {
      const count = Math.floor((temperatureRange.max - temperatureRange.min) / temperatureRange.step) + 1;
      total *= count;
    }
    if (useTopP) {
      const count = Math.floor((topPRange.max - topPRange.min) / topPRange.step) + 1;
      total *= count;
    }
    if (useSeed) {
      const count = Math.floor((seedRange.max - seedRange.min) / seedRange.step) + 1;
      total *= count;
    }
    return total;
  };

  const handleStartSweep = async () => {
    if (!sweepName.trim()) {
      alert('Please enter a sweep name');
      return;
    }

    setIsRunning(true);
    setProgress({
      sweepId: '',
      totalCombinations: calculateTotalCombinations(),
      completedCount: 0,
      failedCount: 0,
      reportIds: [],
      status: 'running'
    });

    const config: ParameterSweepConfig = {
      conversation_id: conversation.conversation_id,
      sweep_name: sweepName,
      skill_id: skillId,
      model_name: modelName,
      parallel,
      max_concurrent: maxConcurrent,
      parameters: {}
    };

    if (useTemperature) {
      config.parameters.temperature = {
        min: temperatureRange.min,
        max: temperatureRange.max,
        step: temperatureRange.step
      };
    }

    if (useTopP) {
      config.parameters.top_p = {
        min: topPRange.min,
        max: topPRange.max,
        step: topPRange.step
      };
    }

    if (useSeed) {
      const seedValues: number[] = [];
      for (let s = seedRange.min; s <= seedRange.max; s += seedRange.step) {
        seedValues.push(s);
      }
      config.parameters.seed = { values: seedValues };
    }

    try {
      const sweepResult: SweepResult = await executeParameterSweep(
        config,
        conversation,
        undefined, // db - would need to pass from parent
        undefined, // cacheLookup
        undefined, // cacheStore
        (prog) => {
          setProgress(prog);
        }
      );
      
      setResults(sweepResult.results);
      setIsRunning(false);
      if (onComplete && sweepResult.sweepId) {
        onComplete(sweepResult.sweepId);
      }
    } catch (error) {
      console.error('Parameter sweep failed:', error);
      setIsRunning(false);
      alert('Parameter sweep failed. Check console for details.');
    }
  };

  const handleStop = () => {
    setIsRunning(false);
    // Would need to implement cancellation in executor
  };

  const handleExport = (format: 'csv' | 'json') => {
    if (results.length === 0) return;
    
    let content = '';
    let filename = '';
    
      if (format === 'csv') {
        filename = `sweep-${sweepName || 'results'}.csv`;
        const headers = ['temperature', 'top_p', 'seed', 'score', 'report_id', 'error'];
        content = headers.join(',') + '\n';
        for (const result of results) {
          const row = [
            result.parameters?.temperature || '',
            result.parameters?.top_p || '',
            result.parameters?.seed || '',
            result.report?.overall_score || '',
            result.report?.report_id || '',
            result.error || ''
          ];
          content += row.join(',') + '\n';
        }
    } else {
      filename = `sweep-${sweepName || 'results'}.json`;
      content = JSON.stringify(results, null, 2);
    }
    
    const blob = new Blob([content], { type: format === 'csv' ? 'text/csv' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalCombinations = calculateTotalCombinations();

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-xl border border-slate-700 w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-slate-100">Parameter Sweep</h2>
            <p className="text-sm text-slate-400 mt-1">
              Conversation: {conversation.conversation_id.substring(0, 16)}...
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {!isRunning && results.length === 0 ? (
            <>
              {/* Configuration */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-200">Sweep Configuration</h3>
                
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Sweep Name</label>
                  <input
                    type="text"
                    value={sweepName}
                    onChange={(e) => setSweepName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    placeholder="temperature-sweep-001"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">Skill</label>
                    <select
                      value={skillId}
                      onChange={(e) => setSkillId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200"
                    >
                      {availableSkills.map(skill => (
                        <option key={skill.id} value={skill.id}>{skill.name || skill.id}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-slate-400 mb-2">Model</label>
                    <select
                      value={modelName}
                      onChange={(e) => setModelName(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200"
                    >
                      {availableModels.map(model => (
                        <option key={model} value={model}>{model}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm text-slate-400">
                    <input
                      type="checkbox"
                      checked={parallel}
                      onChange={(e) => setParallel(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-cyan-500"
                    />
                    Run in parallel
                  </label>
                  {parallel && (
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-slate-400">Max Concurrent:</label>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={maxConcurrent}
                        onChange={(e) => setMaxConcurrent(parseInt(e.target.value))}
                        className="w-20 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-sm"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Parameter Ranges */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-200">Parameter Ranges</h3>
                
                {/* Temperature */}
                <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-4">
                  <label className="flex items-center gap-2 text-sm text-slate-300 mb-3">
                    <input
                      type="checkbox"
                      checked={useTemperature}
                      onChange={(e) => setUseTemperature(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-cyan-500"
                    />
                    Temperature
                  </label>
                  {useTemperature && (
                    <div className="grid grid-cols-3 gap-4 mt-2">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Min</label>
                        <input
                          type="number"
                          min="0"
                          max="2"
                          step="0.1"
                          value={temperatureRange.min}
                          onChange={(e) => setTemperatureRange({ ...temperatureRange, min: parseFloat(e.target.value) })}
                          className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Max</label>
                        <input
                          type="number"
                          min="0"
                          max="2"
                          step="0.1"
                          value={temperatureRange.max}
                          onChange={(e) => setTemperatureRange({ ...temperatureRange, max: parseFloat(e.target.value) })}
                          className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Step</label>
                        <input
                          type="number"
                          min="0.01"
                          max="1"
                          step="0.01"
                          value={temperatureRange.step}
                          onChange={(e) => setTemperatureRange({ ...temperatureRange, step: parseFloat(e.target.value) })}
                          className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-sm"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Top P */}
                <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-4">
                  <label className="flex items-center gap-2 text-sm text-slate-300 mb-3">
                    <input
                      type="checkbox"
                      checked={useTopP}
                      onChange={(e) => setUseTopP(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-cyan-500"
                    />
                    Top P
                  </label>
                  {useTopP && (
                    <div className="grid grid-cols-3 gap-4 mt-2">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Min</label>
                        <input
                          type="number"
                          min="0"
                          max="1"
                          step="0.01"
                          value={topPRange.min}
                          onChange={(e) => setTopPRange({ ...topPRange, min: parseFloat(e.target.value) })}
                          className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Max</label>
                        <input
                          type="number"
                          min="0"
                          max="1"
                          step="0.01"
                          value={topPRange.max}
                          onChange={(e) => setTopPRange({ ...topPRange, max: parseFloat(e.target.value) })}
                          className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Step</label>
                        <input
                          type="number"
                          min="0.01"
                          max="1"
                          step="0.01"
                          value={topPRange.step}
                          onChange={(e) => setTopPRange({ ...topPRange, step: parseFloat(e.target.value) })}
                          className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-sm"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Seed */}
                <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-4">
                  <label className="flex items-center gap-2 text-sm text-slate-300 mb-3">
                    <input
                      type="checkbox"
                      checked={useSeed}
                      onChange={(e) => setUseSeed(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-cyan-500"
                    />
                    Seed
                  </label>
                  {useSeed && (
                    <div className="grid grid-cols-3 gap-4 mt-2">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Min</label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={seedRange.min}
                          onChange={(e) => setSeedRange({ ...seedRange, min: parseInt(e.target.value) })}
                          className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Max</label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={seedRange.max}
                          onChange={(e) => setSeedRange({ ...seedRange, max: parseInt(e.target.value) })}
                          className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Step</label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={seedRange.step}
                          onChange={(e) => setSeedRange({ ...seedRange, step: parseInt(e.target.value) })}
                          className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-sm"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Summary */}
                <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-cyan-400 font-semibold">Total Combinations</p>
                      <p className="text-2xl font-mono text-cyan-300 mt-1">{totalCombinations}</p>
                    </div>
                    {parallel && (
                      <div className="text-right">
                        <p className="text-xs text-slate-400">Estimated Time</p>
                        <p className="text-sm text-slate-300">
                          ~{Math.ceil(totalCombinations / maxConcurrent) * 2}s
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : isRunning ? (
            <>
              {/* Progress */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-200">Sweep Progress</h3>
                {progress && (
                  <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm text-slate-300">
                        {progress.completedCount} / {progress.totalCombinations} completed
                      </span>
                      <span className="text-sm font-mono text-cyan-400">
                        {((progress.completedCount / progress.totalCombinations) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
                      <div
                        className="bg-cyan-500 h-full transition-all duration-300"
                        style={{ width: `${(progress.completedCount / progress.totalCombinations) * 100}%` }}
                      />
                    </div>
                    {progress.failedCount > 0 && (
                      <div className="mt-4 text-sm text-red-400">
                        <p className="font-semibold mb-2">Failed: {progress.failedCount}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Results */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-200">
                    Results ({results.length} reports)
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`p-2 rounded-lg ${viewMode === 'grid' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-800 text-slate-400'}`}
                    >
                      <Grid size={16} />
                    </button>
                    <button
                      onClick={() => setViewMode('heatmap')}
                      className={`p-2 rounded-lg ${viewMode === 'heatmap' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-800 text-slate-400'}`}
                    >
                      <BarChart3 size={16} />
                    </button>
                    <button
                      onClick={() => handleExport('csv')}
                      className="px-3 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/50 rounded-lg text-sm flex items-center gap-2"
                    >
                      <Download size={16} />
                      Export CSV
                    </button>
                    <button
                      onClick={() => handleExport('json')}
                      className="px-3 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/50 rounded-lg text-sm flex items-center gap-2"
                    >
                      <Download size={16} />
                      Export JSON
                    </button>
                  </div>
                </div>

                {viewMode === 'grid' && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {results.map((result, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-950/50 border border-slate-700 rounded-lg p-4 hover:border-cyan-500/50 transition-colors"
                      >
                        <div className="text-xs text-slate-500 mb-2">
                          {result.parameters?.temperature !== undefined && (
                            <div>T: {result.parameters.temperature}</div>
                          )}
                          {result.parameters?.top_p !== undefined && (
                            <div>P: {result.parameters.top_p}</div>
                          )}
                          {result.parameters?.seed !== undefined && (
                            <div>S: {result.parameters.seed}</div>
                          )}
                        </div>
                        {result.error ? (
                          <div className="text-sm text-red-400">Error: {result.error}</div>
                        ) : result.report ? (
                          <div className={`text-2xl font-mono font-bold ${
                            result.report.overall_score > 0.7 ? 'text-red-400' :
                            result.report.overall_score > 0.4 ? 'text-yellow-400' :
                            'text-green-400'
                          }`}>
                            {(result.report.overall_score * 100).toFixed(1)}%
                          </div>
                        ) : (
                          <div className="text-sm text-slate-500">No result</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {viewMode === 'heatmap' && (
                  <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-6">
                    <div className="h-64 flex items-center justify-center text-slate-500 border-2 border-dashed border-slate-700 rounded-lg">
                      <div className="text-center">
                        <BarChart3 size={48} className="mx-auto mb-2 opacity-50" />
                        <p>Heatmap visualization would be rendered here</p>
                        <p className="text-xs mt-2">(Requires charting library integration)</p>
                      </div>
                    </div>
                  </div>
                )}

                {viewMode === 'list' && (
                  <div className="space-y-2">
                    {results.map((result, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-950/50 border border-slate-700 rounded-lg p-4 flex items-center justify-between"
                      >
                        <div className="text-sm text-slate-300">
                          <span className="font-mono">
                            T:{result.parameters?.temperature || 'N/A'} 
                            P:{result.parameters?.top_p || 'N/A'}
                            S:{result.parameters?.seed || 'N/A'}
                          </span>
                        </div>
                        {result.error ? (
                          <div className="text-sm text-red-400">Error</div>
                        ) : result.report ? (
                          <div className={`text-lg font-mono font-bold ${
                            result.report.overall_score > 0.7 ? 'text-red-400' :
                            result.report.overall_score > 0.4 ? 'text-yellow-400' :
                            'text-green-400'
                          }`}>
                            {(result.report.overall_score * 100).toFixed(1)}%
                          </div>
                        ) : (
                          <div className="text-sm text-slate-500">N/A</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-800">
          {isRunning ? (
            <button
              onClick={handleStop}
              className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/50 rounded-lg transition-colors flex items-center gap-2"
            >
              <Square size={16} />
              Stop
            </button>
          ) : results.length === 0 ? (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleStartSweep}
                disabled={totalCombinations === 0 || (!useTemperature && !useTopP && !useSeed)}
                className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <Play size={16} />
                Start Sweep
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ParameterSweepView;

