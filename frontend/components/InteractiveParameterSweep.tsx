import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Download, Settings, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { ParameterSweepConfig, Conversation } from '../types';
import { executeParameterSweep, SweepProgress, SweepResult } from '../lib/parameterSweepExecutor';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, ZAxis } from 'recharts';

interface InteractiveParameterSweepProps {
  conversation: Conversation;
  availableSkills: Array<{ id: string; name?: string }>;
  availableModels: string[];
  onClose?: () => void;
}

const InteractiveParameterSweep: React.FC<InteractiveParameterSweepProps> = ({
  conversation,
  availableSkills,
  availableModels,
  onClose
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<SweepProgress | null>(null);
  const [results, setResults] = useState<Array<{ combinationId: string; parameters: any; report?: any; error?: string }>>([]);
  
  // Configuration
  const [skillId, setSkillId] = useState<string>(availableSkills[0]?.id || '');
  const [modelName, setModelName] = useState<string>(availableModels[0] || '');
  const [temperatureRange, setTemperatureRange] = useState({ min: 0.1, max: 1.0, step: 0.1 });
  const [topPRange, setTopPRange] = useState({ min: 0.5, max: 1.0, step: 0.1 });
  
  // Visualization controls
  const [xAxis, setXAxis] = useState<'temperature' | 'top_p' | 'seed'>('temperature');
  const [yAxis, setYAxis] = useState<'score' | 'temperature' | 'top_p'>('score');
  const [colorBy, setColorBy] = useState<'score' | 'temperature' | 'top_p'>('score');
  const [zoom, setZoom] = useState({ x: [0, 1], y: [0, 1] });
  const [autoUpdate, setAutoUpdate] = useState(true);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (autoUpdate && isRunning && progress) {
      intervalRef.current = setInterval(() => {
        // Would poll for updates in real implementation
      }, 1000);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoUpdate, isRunning, progress]);

  const handleStartSweep = async () => {
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
      sweep_name: `interactive-${Date.now()}`,
      skill_id: skillId,
      model_name: modelName,
      parallel: true,
      max_concurrent: 5,
      parameters: {
        temperature: {
          min: temperatureRange.min,
          max: temperatureRange.max,
          step: temperatureRange.step
        },
        top_p: {
          min: topPRange.min,
          max: topPRange.max,
          step: topPRange.step
        }
      }
    };

    try {
      const sweepResult: SweepResult = await executeParameterSweep(
        config,
        conversation,
        undefined,
        undefined,
        undefined,
        (prog) => {
          setProgress(prog);
        }
      );
      
      setResults(sweepResult.results);
      setIsRunning(false);
    } catch (error) {
      console.error('Parameter sweep failed:', error);
      setIsRunning(false);
    }
  };

  const handleStop = () => {
    setIsRunning(false);
  };

  const handleResetZoom = () => {
    setZoom({ x: [0, 1], y: [0, 1] });
  };

  const calculateTotalCombinations = () => {
    const tempCount = Math.floor((temperatureRange.max - temperatureRange.min) / temperatureRange.step) + 1;
    const topPCount = Math.floor((topPRange.max - topPRange.min) / topPRange.step) + 1;
    return tempCount * topPCount;
  };

  // Prepare chart data
  const chartData = results
    .filter(r => r.report && !r.error)
    .map(r => ({
      x: r.parameters[xAxis] || 0,
      y: yAxis === 'score' ? r.report.overall_score : (r.parameters[yAxis] || 0),
      z: colorBy === 'score' ? r.report.overall_score : (r.parameters[colorBy] || 0),
      report: r.report
    }));

  const handleExport = (format: 'csv' | 'json' | 'png') => {
    if (format === 'png') {
      // Placeholder for chart export
      alert('Chart export would be implemented here');
      return;
    }

    let content = '';
    let filename = '';
    
    if (format === 'csv') {
      filename = `sweep-${Date.now()}.csv`;
      const headers = ['temperature', 'top_p', 'score', 'report_id'];
      content = headers.join(',') + '\n';
      for (const result of results) {
        if (result.report) {
          const row = [
            result.parameters?.temperature || '',
            result.parameters?.top_p || '',
            result.report.overall_score || '',
            result.report.report_id || ''
          ];
          content += row.join(',') + '\n';
        }
      }
    } else {
      filename = `sweep-${Date.now()}.json`;
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

  return (
    <div className={`${onClose ? 'fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4' : ''}`}>
      <div className={`bg-slate-900 rounded-xl border border-slate-700 ${onClose ? 'w-full max-w-7xl max-h-[90vh] overflow-hidden flex flex-col' : 'w-full'}`}>
        {onClose && (
          <div className="flex items-center justify-between p-6 border-b border-slate-800">
            <div>
              <h2 className="text-xl font-bold text-slate-100">Interactive Parameter Sweep</h2>
              <p className="text-sm text-slate-400 mt-1">Real-time visualization and analysis</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
            >
              ×
            </button>
          </div>
        )}

        <div className={`${onClose ? 'flex-1 overflow-y-auto p-6' : 'p-6'} space-y-6`}>
          {/* Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Configuration */}
            <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-4">
              <h3 className="text-md font-semibold text-slate-200 mb-4 flex items-center gap-2">
                <Settings size={18} />
                Configuration
              </h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Skill</label>
                    <select
                      value={skillId}
                      onChange={(e) => setSkillId(e.target.value)}
                      disabled={isRunning}
                      className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-sm"
                    >
                      {availableSkills.map(skill => (
                        <option key={skill.id} value={skill.id}>{skill.name || skill.id}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Model</label>
                    <select
                      value={modelName}
                      onChange={(e) => setModelName(e.target.value)}
                      disabled={isRunning}
                      className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-sm"
                    >
                      {availableModels.map(model => (
                        <option key={model} value={model}>{model}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Temperature Range</label>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="number"
                      min="0"
                      max="2"
                      step="0.1"
                      value={temperatureRange.min}
                      onChange={(e) => setTemperatureRange({ ...temperatureRange, min: parseFloat(e.target.value) })}
                      disabled={isRunning}
                      className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-sm"
                      placeholder="Min"
                    />
                    <input
                      type="number"
                      min="0"
                      max="2"
                      step="0.1"
                      value={temperatureRange.max}
                      onChange={(e) => setTemperatureRange({ ...temperatureRange, max: parseFloat(e.target.value) })}
                      disabled={isRunning}
                      className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-sm"
                      placeholder="Max"
                    />
                    <input
                      type="number"
                      min="0.01"
                      max="1"
                      step="0.01"
                      value={temperatureRange.step}
                      onChange={(e) => setTemperatureRange({ ...temperatureRange, step: parseFloat(e.target.value) })}
                      disabled={isRunning}
                      className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-sm"
                      placeholder="Step"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Top P Range</label>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      value={topPRange.min}
                      onChange={(e) => setTopPRange({ ...topPRange, min: parseFloat(e.target.value) })}
                      disabled={isRunning}
                      className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-sm"
                      placeholder="Min"
                    />
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      value={topPRange.max}
                      onChange={(e) => setTopPRange({ ...topPRange, max: parseFloat(e.target.value) })}
                      disabled={isRunning}
                      className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-sm"
                      placeholder="Max"
                    />
                    <input
                      type="number"
                      min="0.01"
                      max="1"
                      step="0.01"
                      value={topPRange.step}
                      onChange={(e) => setTopPRange({ ...topPRange, step: parseFloat(e.target.value) })}
                      disabled={isRunning}
                      className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-sm"
                      placeholder="Step"
                    />
                  </div>
                </div>
                <div className="pt-2">
                  <p className="text-xs text-slate-500 mb-2">
                    Total Combinations: <span className="text-cyan-400 font-mono">{calculateTotalCombinations()}</span>
                  </p>
                  {isRunning ? (
                    <button
                      onClick={handleStop}
                      className="w-full px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/50 rounded-lg text-sm flex items-center justify-center gap-2"
                    >
                      <Square size={16} />
                      Stop Sweep
                    </button>
                  ) : (
                    <button
                      onClick={handleStartSweep}
                      className="w-full px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-sm flex items-center justify-center gap-2"
                    >
                      <Play size={16} />
                      Start Sweep
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Visualization Controls */}
            <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-4">
              <h3 className="text-md font-semibold text-slate-200 mb-4">Visualization Controls</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">X-Axis</label>
                  <select
                    value={xAxis}
                    onChange={(e) => setXAxis(e.target.value as any)}
                    className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-sm"
                  >
                    <option value="temperature">Temperature</option>
                    <option value="top_p">Top P</option>
                    <option value="seed">Seed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Y-Axis</label>
                  <select
                    value={yAxis}
                    onChange={(e) => setYAxis(e.target.value as any)}
                    className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-sm"
                  >
                    <option value="score">Score</option>
                    <option value="temperature">Temperature</option>
                    <option value="top_p">Top P</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Color By</label>
                  <select
                    value={colorBy}
                    onChange={(e) => setColorBy(e.target.value as any)}
                    className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-sm"
                  >
                    <option value="score">Score</option>
                    <option value="temperature">Temperature</option>
                    <option value="top_p">Top P</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <label className="flex items-center gap-2 text-xs text-slate-400">
                    <input
                      type="checkbox"
                      checked={autoUpdate}
                      onChange={(e) => setAutoUpdate(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-cyan-500"
                    />
                    Auto-update
                  </label>
                  <button
                    onClick={handleResetZoom}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs flex items-center gap-1"
                  >
                    <RotateCcw size={12} />
                    Reset Zoom
                  </button>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => handleExport('csv')}
                    className="flex-1 px-3 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/50 rounded-lg text-xs flex items-center justify-center gap-1"
                  >
                    <Download size={14} />
                    CSV
                  </button>
                  <button
                    onClick={() => handleExport('json')}
                    className="flex-1 px-3 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/50 rounded-lg text-xs flex items-center justify-center gap-1"
                  >
                    <Download size={14} />
                    JSON
                  </button>
                  <button
                    onClick={() => handleExport('png')}
                    className="flex-1 px-3 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/50 rounded-lg text-xs flex items-center justify-center gap-1"
                  >
                    <Download size={14} />
                    PNG
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Progress */}
          {isRunning && progress && (
            <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-300">
                  {progress.completedCount} / {progress.totalCombinations} completed
                </span>
                <span className="text-sm font-mono text-cyan-400">
                  {((progress.completedCount / progress.totalCombinations) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-cyan-500 h-full transition-all duration-300"
                  style={{ width: `${(progress.completedCount / progress.totalCombinations) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Visualization */}
          {chartData.length > 0 && (
            <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-6">
              <h3 className="text-md font-semibold text-slate-200 mb-4">Parameter Space Visualization</h3>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis
                      type="number"
                      dataKey="x"
                      name={xAxis}
                      label={{ value: xAxis, position: 'insideBottom', offset: -5 }}
                      stroke="#94a3b8"
                      tick={{ fill: '#94a3b8' }}
                    />
                    <YAxis
                      type="number"
                      dataKey="y"
                      name={yAxis}
                      label={{ value: yAxis, angle: -90, position: 'insideLeft' }}
                      stroke="#94a3b8"
                      tick={{ fill: '#94a3b8' }}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
                      labelStyle={{ color: '#cbd5e1' }}
                      formatter={(value: any, name: string) => {
                        if (name === 'score') return [(value * 100).toFixed(2) + '%', 'Score'];
                        return [value, name];
                      }}
                    />
                    <Scatter
                      name="Results"
                      data={chartData}
                      fill="#06b6d4"
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Results Summary */}
          {results.length > 0 && (
            <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-4">
              <h3 className="text-md font-semibold text-slate-200 mb-3">Results Summary</h3>
              <div className="grid grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Total</p>
                  <p className="text-lg font-mono text-slate-200">{results.length}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Successful</p>
                  <p className="text-lg font-mono text-green-400">
                    {results.filter(r => r.report && !r.error).length}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Failed</p>
                  <p className="text-lg font-mono text-red-400">
                    {results.filter(r => r.error).length}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Avg Score</p>
                  <p className="text-lg font-mono text-cyan-400">
                    {(() => {
                      const successful = results.filter(r => r.report && !r.error);
                      if (successful.length === 0) return 'N/A';
                      const avg = successful.reduce((sum, r) => sum + (r.report?.overall_score || 0), 0) / successful.length;
                      return (avg * 100).toFixed(1) + '%';
                    })()}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InteractiveParameterSweep;

