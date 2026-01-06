import React from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BoxPlot, ReferenceLine } from 'recharts';

interface StatisticalVisualizationsProps {
  runs?: Array<{
    run_number: number;
    overall_score: number;
    confidence: string;
  }>;
  statistics?: {
    mean: number;
    stddev: number;
    quantiles: { p5: number; p50: number; p95: number };
    confidenceInterval?: { lower: number; upper: number; level: number };
  };
  timeSeries?: Array<{ date: string; count: number; detections: number }>;
  calibrationData?: Array<{ threshold: number; precision: number; recall: number; f1: number }>;
  groundTruthAvailable?: boolean;
}

const StatisticalVisualizations: React.FC<StatisticalVisualizationsProps> = ({
  runs = [],
  statistics,
  timeSeries = [],
  calibrationData = [],
  groundTruthAvailable = false
}) => {
  // Prepare score distribution data for histogram
  const scoreDistribution = runs.map(r => ({
    score: Math.round(r.overall_score * 100),
    run: r.run_number
  }));

  // Prepare quantile visualization data
  const quantileData = statistics ? [
    { name: '5th', value: statistics.quantiles.p5 * 100 },
    { name: '50th (Median)', value: statistics.quantiles.p50 * 100 },
    { name: '95th', value: statistics.quantiles.p95 * 100 },
    { name: 'Mean', value: statistics.mean * 100 }
  ] : [];

  // Prepare box plot data (simplified)
  const boxPlotData = statistics ? [
    {
      name: 'Score Distribution',
      min: statistics.quantiles.p5 * 100,
      q1: statistics.quantiles.p5 * 100,
      median: statistics.quantiles.p50 * 100,
      q3: statistics.quantiles.p95 * 100,
      max: statistics.quantiles.p95 * 100,
      mean: statistics.mean * 100
    }
  ] : [];

  return (
    <div className="space-y-6">
      {/* Score Distribution Histogram */}
      {runs.length > 0 && (
        <div className="glass-panel p-6 rounded-xl border-slate-800">
          <h3 className="text-lg font-semibold text-slate-200 mb-4">Score Distribution Across Runs</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={scoreDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
              <XAxis dataKey="run" label={{ value: 'Run Number', position: 'insideBottom', offset: -5, fill: '#94a3b8' }} stroke="#94a3b8" />
              <YAxis label={{ value: 'Score (%)', angle: -90, position: 'insideLeft', fill: '#94a3b8' }} stroke="#94a3b8" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
                labelStyle={{ color: '#cbd5e1' }}
              />
              <Bar dataKey="score" fill="#06b6d4" />
              {statistics && (
                <ReferenceLine 
                  y={statistics.mean * 100} 
                  stroke="#f59e0b" 
                  strokeDasharray="3 3" 
                  label={{ value: 'Mean', position: 'right', fill: '#f59e0b' }}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Quantile Plot */}
      {quantileData.length > 0 && (
        <div className="glass-panel p-6 rounded-xl border-slate-800">
          <h3 className="text-lg font-semibold text-slate-200 mb-4">Quantile Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={quantileData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
              <XAxis dataKey="name" stroke="#94a3b8" />
              <YAxis label={{ value: 'Score (%)', angle: -90, position: 'insideLeft', fill: '#94a3b8' }} stroke="#94a3b8" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
                labelStyle={{ color: '#cbd5e1' }}
                formatter={(value: number) => `${value.toFixed(1)}%`}
              />
              <Bar dataKey="value" fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Time Series (Drift Analysis) */}
      {timeSeries.length > 0 && (
        <div className="glass-panel p-6 rounded-xl border-slate-800">
          <h3 className="text-lg font-semibold text-slate-200 mb-4">Detections Over Time</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={timeSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
              <XAxis dataKey="date" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
                labelStyle={{ color: '#cbd5e1' }}
              />
              <Legend />
              <Line type="monotone" dataKey="count" stroke="#06b6d4" name="Total Analyzed" />
              <Line type="monotone" dataKey="detections" stroke="#ef4444" name="Detections" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Calibration Plot (if ground truth available) */}
      {groundTruthAvailable && calibrationData.length > 0 && (
        <div className="glass-panel p-6 rounded-xl border-slate-800">
          <h3 className="text-lg font-semibold text-slate-200 mb-4">Calibration Metrics</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={calibrationData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
              <XAxis dataKey="threshold" label={{ value: 'Threshold', position: 'insideBottom', offset: -5, fill: '#94a3b8' }} stroke="#94a3b8" />
              <YAxis label={{ value: 'Metric Value', angle: -90, position: 'insideLeft', fill: '#94a3b8' }} stroke="#94a3b8" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
                labelStyle={{ color: '#cbd5e1' }}
              />
              <Legend />
              <Line type="monotone" dataKey="precision" stroke="#10b981" name="Precision" />
              <Line type="monotone" dataKey="recall" stroke="#3b82f6" name="Recall" />
              <Line type="monotone" dataKey="f1" stroke="#f59e0b" name="F1 Score" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ROC Curve placeholder (would need more complex data) */}
      {groundTruthAvailable && (
        <div className="glass-panel p-6 rounded-xl border-slate-800">
          <h3 className="text-lg font-semibold text-slate-200 mb-4">ROC Curve</h3>
          <p className="text-sm text-slate-400">
            ROC curve visualization requires additional data processing. 
            Use the calibration endpoint to generate ROC data.
          </p>
        </div>
      )}
    </div>
  );
};

export default StatisticalVisualizations;

