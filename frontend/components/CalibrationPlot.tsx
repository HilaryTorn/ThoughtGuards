import React, { useState } from 'react';
import { Download, Info, BarChart3 } from 'lucide-react';
import { CalibrationMetrics } from '../types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';

interface CalibrationPlotProps {
  calibrationMetrics: CalibrationMetrics;
  calibrationCurvePoints?: Array<{
    predicted_probability: number;
    observed_frequency: number;
    sample_count: number;
  }>;
  onClose?: () => void;
}

const CalibrationPlot: React.FC<CalibrationPlotProps> = ({
  calibrationMetrics,
  calibrationCurvePoints,
  onClose
}) => {
  const [selectedBin, setSelectedBin] = useState<number | null>(null);
  const [exportFormat, setExportFormat] = useState<'png' | 'svg' | 'pdf'>('png');

  // Generate calibration curve data if not provided
  const curveData = calibrationCurvePoints || generateCalibrationCurve(calibrationMetrics);

  // Perfect calibration line (y = x)
  const perfectCalibration = curveData.map(point => ({
    predicted_probability: point.predicted_probability,
    observed_frequency: point.predicted_probability,
    sample_count: 0
  }));

  const handleExport = () => {
    // Placeholder for export functionality
    // Would use a charting library's export feature
    alert(`Export to ${exportFormat} would be implemented here`);
  };

  return (
    <div className={`${onClose ? 'fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4' : ''}`}>
      <div className={`bg-slate-900 rounded-xl border border-slate-700 ${onClose ? 'w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col' : 'w-full'}`}>
        {onClose && (
          <div className="flex items-center justify-between p-6 border-b border-slate-800">
            <div>
              <h2 className="text-xl font-bold text-slate-100">Calibration Plot</h2>
              <p className="text-sm text-slate-400 mt-1">Model calibration analysis</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value as 'png' | 'svg' | 'pdf')}
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm"
              >
                <option value="png">PNG</option>
                <option value="svg">SVG</option>
                <option value="pdf">PDF</option>
              </select>
              <button
                onClick={handleExport}
                className="px-3 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/50 rounded-lg text-sm flex items-center gap-2"
              >
                <Download size={16} />
                Export
              </button>
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                ×
              </button>
            </div>
          </div>
        )}

        <div className={`${onClose ? 'flex-1 overflow-y-auto p-6' : 'p-6'} space-y-6`}>
          {/* Summary Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-4">
              <p className="text-xs text-slate-500 mb-1">Precision</p>
              <p className="text-lg font-mono text-slate-200">
                {(calibrationMetrics.precision * 100).toFixed(2)}%
              </p>
            </div>
            <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-4">
              <p className="text-xs text-slate-500 mb-1">Recall</p>
              <p className="text-lg font-mono text-slate-200">
                {(calibrationMetrics.recall * 100).toFixed(2)}%
              </p>
            </div>
            <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-4">
              <p className="text-xs text-slate-500 mb-1">F1 Score</p>
              <p className="text-lg font-mono text-slate-200">
                {(calibrationMetrics.f1 * 100).toFixed(2)}%
              </p>
            </div>
            <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-4">
              <p className="text-xs text-slate-500 mb-1">Accuracy</p>
              <p className="text-lg font-mono text-slate-200">
                {(calibrationMetrics.accuracy * 100).toFixed(2)}%
              </p>
            </div>
          </div>

          {/* Calibration Curve */}
          <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <BarChart3 size={20} className="text-purple-500" />
              Calibration Curve
            </h3>
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={curveData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="predicted_probability"
                    label={{ value: 'Predicted Probability', position: 'insideBottom', offset: -5 }}
                    stroke="#94a3b8"
                    tick={{ fill: '#94a3b8' }}
                  />
                  <YAxis
                    label={{ value: 'Observed Frequency', angle: -90, position: 'insideLeft' }}
                    stroke="#94a3b8"
                    tick={{ fill: '#94a3b8' }}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
                    labelStyle={{ color: '#cbd5e1' }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="observed_frequency"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    dot={{ r: 4, fill: '#06b6d4' }}
                    name="Observed"
                  />
                  <Line
                    type="monotone"
                    data={perfectCalibration}
                    dataKey="observed_frequency"
                    stroke="#10b981"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    name="Perfect Calibration"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Perfect calibration would follow the diagonal line (y = x)
            </p>
          </div>

          {/* Binned Calibration */}
          {calibrationMetrics.perTypeMetrics && Object.keys(calibrationMetrics.perTypeMetrics).length > 0 && (
            <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-slate-200 mb-4">Calibration by Type</h3>
              <div className="space-y-3">
                {Object.entries(calibrationMetrics.perTypeMetrics).map(([type, metrics]: [string, any]) => (
                  <div key={type} className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-slate-200 capitalize">{type}</span>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-slate-400">
                          Precision: <span className="text-slate-200 font-mono">{(metrics.precision * 100).toFixed(1)}%</span>
                        </span>
                        <span className="text-slate-400">
                          Recall: <span className="text-slate-200 font-mono">{(metrics.recall * 100).toFixed(1)}%</span>
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Statistical Tests */}
          {calibrationMetrics.hosmerLemeshowPValue !== undefined && (
            <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-slate-200 mb-4">Statistical Tests</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Hosmer-Lemeshow Test (p-value):</span>
                  <span className={`font-mono ${
                    calibrationMetrics.hosmerLemeshowPValue < 0.05 ? 'text-red-400' : 'text-green-400'
                  }`}>
                    {calibrationMetrics.hosmerLemeshowPValue.toFixed(4)}
                  </span>
                </div>
                {calibrationMetrics.calibrationSlope !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Calibration Slope:</span>
                    <span className="text-slate-200 font-mono">
                      {calibrationMetrics.calibrationSlope.toFixed(3)}
                    </span>
                  </div>
                )}
                {calibrationMetrics.calibrationIntercept !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Calibration Intercept:</span>
                    <span className="text-slate-200 font-mono">
                      {calibrationMetrics.calibrationIntercept.toFixed(3)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Bin Details */}
          {selectedBin !== null && curveData[selectedBin] && (
            <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-slate-200 mb-2">Bin Details</h4>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Predicted Probability</p>
                  <p className="text-slate-200 font-mono">
                    {curveData[selectedBin].predicted_probability.toFixed(3)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Observed Frequency</p>
                  <p className="text-slate-200 font-mono">
                    {curveData[selectedBin].observed_frequency.toFixed(3)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Sample Count</p>
                  <p className="text-slate-200 font-mono">
                    {curveData[selectedBin].sample_count}
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

/**
 * Generate calibration curve data from metrics
 */
function generateCalibrationCurve(metrics: CalibrationMetrics): Array<{
  predicted_probability: number;
  observed_frequency: number;
  sample_count: number;
}> {
  // Generate 10 bins from 0 to 1
  const bins: Array<{
    predicted_probability: number;
    observed_frequency: number;
    sample_count: number;
  }> = [];

  for (let i = 0; i <= 10; i++) {
    const predicted = i / 10;
    // Use overall metrics to estimate observed frequency
    // In practice, this would come from actual binned data
    const observed = metrics.accuracy; // Simplified - would use actual bin data
    
    bins.push({
      predicted_probability: predicted,
      observed_frequency: observed,
      sample_count: 100 // Placeholder
    });
  }

  return bins;
}

export default CalibrationPlot;

