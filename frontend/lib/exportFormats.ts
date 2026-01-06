import { AuditReport, AggregateReport, CalibrationMetrics } from '../types';

/**
 * Export formats: Export reports in publication-ready formats
 * (LaTeX tables, CSV, JSON), generate research paper-ready figures,
 * export calibration datasets.
 */

export interface ExportOptions {
  format: 'latex' | 'csv' | 'json' | 'markdown';
  include_statistics?: boolean;
  include_conversation?: boolean;
  include_parameters?: boolean;
  precision?: number; // Decimal places
}

/**
 * Export reports as LaTeX table
 */
export function exportReportsAsLaTeX(
  reports: AuditReport[],
  options: ExportOptions = { format: 'latex' }
): string {
  const precision = options.precision ?? 3;
  
  let latex = '\\begin{table}[h]\n';
  latex += '\\centering\n';
  latex += '\\caption{Audit Report Results}\n';
  latex += '\\label{tab:audit-results}\n';
  latex += '\\begin{tabular}{';
  
  // Define columns
  const columns = ['l', 'c', 'c', 'c', 'c']; // conversation_id, score, confidence, model, skill
  latex += columns.join('') + '}\n';
  latex += '\\toprule\n';
  latex += 'Conversation ID & Score & Confidence & Model & Skill \\\\\n';
  latex += '\\midrule\n';
  
  // Add rows
  for (const report of reports) {
    const score = report.overall_score.toFixed(precision);
    const conf = report.confidence;
    const model = report.model_name.replace('_', '\\_');
    const skill = report.skill_id.replace('_', '\\_');
    
    latex += `${report.conversation_id} & ${score} & ${conf} & ${model} & ${skill} \\\\\n`;
  }
  
  latex += '\\bottomrule\n';
  latex += '\\end{tabular}\n';
  latex += '\\end{table}\n';
  
  return latex;
}

/**
 * Export reports as CSV
 */
export function exportReportsAsCSV(
  reports: AuditReport[],
  options: ExportOptions = { format: 'csv' }
): string {
  const precision = options.precision ?? 3;
  
  // Headers
  const headers = [
    'conversation_id',
    'report_id',
    'score',
    'confidence',
    'model_name',
    'skill_id',
    'skill_version',
    'created_at'
  ];
  
  if (options.include_parameters) {
    headers.push('temperature', 'top_p', 'seed', 'max_tokens');
  }
  
  if (options.include_statistics) {
    // Would include statistical fields if available
  }
  
  let csv = headers.join(',') + '\n';
  
  // Rows
  for (const report of reports) {
    const row = [
      report.conversation_id,
      report.report_id,
      report.overall_score.toFixed(precision),
      report.confidence,
      report.model_name,
      report.skill_id,
      report.skill_version,
      report.created_at
    ];
    
    if (options.include_parameters) {
      row.push(
        (report.llm_parameters.temperature ?? '').toString(),
        (report.llm_parameters.top_p ?? '').toString(),
        (report.llm_parameters.seed ?? '').toString(),
        (report.llm_parameters.max_tokens ?? '').toString()
      );
    }
    
    // Escape commas and quotes
    const escapedRow = row.map(cell => {
      const str = String(cell);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    
    csv += escapedRow.join(',') + '\n';
  }
  
  return csv;
}

/**
 * Export reports as JSON
 */
export function exportReportsAsJSON(
  reports: AuditReport[],
  options: ExportOptions = { format: 'json' }
): string {
  const exportData: any = {
    export_format: 'audit_reports',
    export_date: new Date().toISOString(),
    report_count: reports.length,
    reports: reports
  };
  
  if (options.include_statistics) {
    // Add statistical summary
    const scores = reports.map(r => r.overall_score);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / (scores.length - 1);
    
    exportData.statistics = {
      mean,
      stddev: Math.sqrt(variance),
      min: Math.min(...scores),
      max: Math.max(...scores),
      count: scores.length
    };
  }
  
  return JSON.stringify(exportData, null, 2);
}

/**
 * Export aggregate report as LaTeX
 */
export function exportAggregateAsLaTeX(
  aggregate: AggregateReport,
  options: ExportOptions = { format: 'latex' }
): string {
  const precision = options.precision ?? 3;
  
  let latex = '\\begin{table}[h]\n';
  latex += '\\centering\n';
  latex += '\\caption{Aggregate Audit Results}\n';
  latex += '\\label{tab:aggregate-results}\n';
  latex += '\\begin{tabular}{lc}\n';
  latex += '\\toprule\n';
  latex += 'Metric & Value \\\\\n';
  latex += '\\midrule\n';
  
  if (aggregate.aggregated_score !== undefined) {
    latex += `Aggregated Score & ${aggregate.aggregated_score.toFixed(precision)} \\\\\n`;
  }
  
  if (aggregate.score_distribution) {
    latex += `Mean & ${aggregate.score_distribution.mean.toFixed(precision)} \\\\\n`;
    latex += `Std Dev & ${aggregate.score_distribution.stddev.toFixed(precision)} \\\\\n`;
    latex += `P5 & ${aggregate.score_distribution.p5.toFixed(precision)} \\\\\n`;
    latex += `P50 (Median) & ${aggregate.score_distribution.p50.toFixed(precision)} \\\\\n`;
    latex += `P95 & ${aggregate.score_distribution.p95.toFixed(precision)} \\\\\n`;
    
    if (aggregate.score_distribution.ci_lower !== undefined && aggregate.score_distribution.ci_upper !== undefined) {
      latex += `95\\% CI & [${aggregate.score_distribution.ci_lower.toFixed(precision)}, ${aggregate.score_distribution.ci_upper.toFixed(precision)}] \\\\\n`;
    }
  }
  
  latex += `Source Reports & ${aggregate.source_count} \\\\\n`;
  latex += '\\bottomrule\n';
  latex += '\\end{tabular}\n';
  latex += '\\end{table}\n';
  
  return latex;
}

/**
 * Export calibration dataset
 */
export function exportCalibrationDataset(
  samples: Array<{
    conversation_id: string;
    ground_truth: boolean;
    predicted_score: number;
    manipulation_types?: string[];
  }>,
  format: 'csv' | 'json' = 'csv'
): string {
  if (format === 'csv') {
    let csv = 'conversation_id,ground_truth,predicted_score,manipulation_types\n';
    
    for (const sample of samples) {
      const types = sample.manipulation_types?.join(';') || '';
      csv += `${sample.conversation_id},${sample.ground_truth},${sample.predicted_score.toFixed(3)},${types}\n`;
    }
    
    return csv;
  } else {
    return JSON.stringify({
      calibration_dataset: true,
      sample_count: samples.length,
      samples
    }, null, 2);
  }
}

/**
 * Generate publication-ready figure data (for plotting libraries)
 */
export function generateFigureData(
  reports: AuditReport[],
  figureType: 'histogram' | 'scatter' | 'boxplot' | 'time_series' = 'histogram'
): {
  type: string;
  data: any;
  layout?: any;
} {
  switch (figureType) {
    case 'histogram':
      const scores = reports.map(r => r.overall_score);
      return {
        type: 'histogram',
        data: {
          x: scores,
          bins: 20,
          name: 'Score Distribution'
        },
        layout: {
          title: 'Distribution of Audit Scores',
          xaxis: { title: 'Score' },
          yaxis: { title: 'Frequency' }
        }
      };
      
    case 'scatter':
      // Scatter plot: parameter vs score
      const scatterData = reports.map(r => ({
        x: r.llm_parameters.temperature ?? 0,
        y: r.overall_score,
        model: r.model_name
      }));
      
      return {
        type: 'scatter',
        data: scatterData,
        layout: {
          title: 'Parameter Effect on Scores',
          xaxis: { title: 'Temperature' },
          yaxis: { title: 'Score' }
        }
      };
      
    case 'boxplot':
      // Group by model or skill
      const grouped = new Map<string, number[]>();
      for (const report of reports) {
        const key = report.model_name;
        if (!grouped.has(key)) {
          grouped.set(key, []);
        }
        grouped.get(key)!.push(report.overall_score);
      }
      
      return {
        type: 'boxplot',
        data: Array.from(grouped.entries()).map(([name, scores]) => ({
          y: scores,
          name
        })),
        layout: {
          title: 'Score Distribution by Model',
          yaxis: { title: 'Score' }
        }
      };
      
    case 'time_series':
      // Sort by creation date
      const sorted = [...reports].sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      
      return {
        type: 'time_series',
        data: {
          x: sorted.map(r => r.created_at),
          y: sorted.map(r => r.overall_score)
        },
        layout: {
          title: 'Score Trend Over Time',
          xaxis: { title: 'Date' },
          yaxis: { title: 'Score' }
        }
      };
      
    default:
      throw new Error(`Unknown figure type: ${figureType}`);
  }
}

/**
 * Export parameter effect analysis as LaTeX table
 */
export function exportParameterEffectsAsLaTeX(
  parameterEffects: Record<string, {
    correlation: number;
    effect_size: number;
    p_value?: number;
    samples: number;
  }>,
  options: ExportOptions = { format: 'latex' }
): string {
  const precision = options.precision ?? 3;
  
  let latex = '\\begin{table}[h]\n';
  latex += '\\centering\n';
  latex += '\\caption{Parameter Effect Analysis}\n';
  latex += '\\label{tab:parameter-effects}\n';
  latex += '\\begin{tabular}{lccc}\n';
  latex += '\\toprule\n';
  latex += 'Parameter & Correlation & Effect Size & Samples \\\\\n';
  latex += '\\midrule\n';
  
  for (const [param, effect] of Object.entries(parameterEffects)) {
    const corr = effect.correlation.toFixed(precision);
    const effectSize = effect.effect_size.toFixed(precision);
    const pValue = effect.p_value !== undefined ? effect.p_value.toFixed(precision) : 'N/A';
    const samples = effect.samples.toString();
    
    latex += `${param.replace('_', '\\_')} & ${corr} & ${effectSize} & ${samples} \\\\\n`;
  }
  
  latex += '\\bottomrule\n';
  latex += '\\end{tabular}\n';
  latex += '\\end{table}\n';
  
  return latex;
}

/**
 * Export calibration metrics as LaTeX table
 */
export function exportCalibrationMetricsAsLaTeX(
  metrics: CalibrationMetrics,
  options: ExportOptions = { format: 'latex' }
): string {
  const precision = options.precision ?? 3;
  
  let latex = '\\begin{table}[h]\n';
  latex += '\\centering\n';
  latex += '\\caption{Calibration Metrics}\n';
  latex += '\\label{tab:calibration-metrics}\n';
  latex += '\\begin{tabular}{lc}\n';
  latex += '\\toprule\n';
  latex += 'Metric & Value \\\\\n';
  latex += '\\midrule\n';
  
  latex += `Precision & ${metrics.precision.toFixed(precision)} \\\\\n`;
  latex += `Recall & ${metrics.recall.toFixed(precision)} \\\\\n`;
  latex += `F1 Score & ${metrics.f1.toFixed(precision)} \\\\\n`;
  latex += `Specificity & ${metrics.specificity.toFixed(precision)} \\\\\n`;
  latex += `Accuracy & ${metrics.accuracy.toFixed(precision)} \\\\\n`;
  latex += `True Positives & ${metrics.truePositives} \\\\\n`;
  latex += `True Negatives & ${metrics.trueNegatives} \\\\\n`;
  latex += `False Positives & ${metrics.falsePositives} \\\\\n`;
  latex += `False Negatives & ${metrics.falseNegatives} \\\\\n`;
  
  latex += '\\bottomrule\n';
  latex += '\\end{tabular}\n';
  latex += '\\end{table}\n';
  
  return latex;
}

/**
 * Export as markdown table
 */
export function exportReportsAsMarkdown(
  reports: AuditReport[],
  options: ExportOptions = { format: 'markdown' }
): string {
  const precision = options.precision ?? 3;
  
  let md = '| Conversation ID | Score | Confidence | Model | Skill |\n';
  md += '|----------------|-------|------------|-------|-------|\n';
  
  for (const report of reports) {
    md += `| ${report.conversation_id} | ${report.overall_score.toFixed(precision)} | ${report.confidence} | ${report.model_name} | ${report.skill_id} |\n`;
  }
  
  return md;
}

/**
 * Main export function
 */
export function exportReports(
  reports: AuditReport[],
  options: ExportOptions
): string {
  switch (options.format) {
    case 'latex':
      return exportReportsAsLaTeX(reports, options);
    case 'csv':
      return exportReportsAsCSV(reports, options);
    case 'json':
      return exportReportsAsJSON(reports, options);
    case 'markdown':
      return exportReportsAsMarkdown(reports, options);
    default:
      throw new Error(`Unsupported export format: ${options.format}`);
  }
}

