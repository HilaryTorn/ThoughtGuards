import { AuditReport, AggregateReport } from '../types';
import { analyzeParameterEffects, generateCorrelationMatrix } from './parameterEffectAnalyzer';
import { compareReports, areReportsSignificantlyDifferent } from './reportComparator';
import { executeWithPositionSwap, PositionSwapResult } from './biasMitigation';
import { calculateConfidenceInterval } from './statisticalAnalysis';

/**
 * Ablation studies: Systematic ablation study framework for parameter effects,
 * skill comparisons, model comparisons, and position bias with statistical significance tests.
 */

export interface AblationStudy {
  study_id: string;
  study_type: 'parameter_effect' | 'skill_comparison' | 'model_comparison' | 'position_bias';
  baseline_reports: AuditReport[];
  variant_reports: AuditReport[];
  comparison_result: {
    baseline_mean: number;
    variant_mean: number;
    difference: number;
    effect_size: number; // Cohen's d
    statistical_significance: {
      significant: boolean;
      p_value?: number;
      confidence_interval: {
        lower: number;
        upper: number;
        level: number;
      };
    };
  };
  created_at: string;
}

/**
 * Parameter effect ablation study
 * Compare scores across different parameter values
 */
export function conductParameterEffectAblation(
  reports: AuditReport[],
  parameterName: string,
  baselineValue: number,
  variantValue: number
): AblationStudy {
  const baselineReports = reports.filter(r => {
    const value = r.llm_parameters[parameterName as keyof typeof r.llm_parameters];
    return typeof value === 'number' && Math.abs(value - baselineValue) < 0.01;
  });
  
  const variantReports = reports.filter(r => {
    const value = r.llm_parameters[parameterName as keyof typeof r.llm_parameters];
    return typeof value === 'number' && Math.abs(value - variantValue) < 0.01;
  });
  
  if (baselineReports.length === 0 || variantReports.length === 0) {
    throw new Error(`Insufficient reports for ablation study. Baseline: ${baselineReports.length}, Variant: ${variantReports.length}`);
  }
  
  const baselineScores = baselineReports.map(r => r.overall_score);
  const variantScores = variantReports.map(r => r.overall_score);
  
  const baselineMean = baselineScores.reduce((a, b) => a + b, 0) / baselineScores.length;
  const variantMean = variantScores.reduce((a, b) => a + b, 0) / variantScores.length;
  const difference = variantMean - baselineMean;
  
  // Calculate effect size (Cohen's d)
  const baselineVariance = baselineScores.reduce((sum, s) => sum + Math.pow(s - baselineMean, 2), 0) / (baselineScores.length - 1);
  const variantVariance = variantScores.reduce((sum, s) => sum + Math.pow(s - variantMean, 2), 0) / (variantScores.length - 1);
  const pooledStddev = Math.sqrt((baselineVariance + variantVariance) / 2);
  const effectSize = pooledStddev > 0 ? difference / pooledStddev : 0;
  
  // Statistical significance test (t-test approximation)
  const combinedScores = [...baselineScores, ...variantScores];
  const ci = calculateConfidenceInterval(combinedScores);
  
  // Simplified p-value (would use proper t-test in production)
  const tStat = Math.abs(effectSize) * Math.sqrt(baselineScores.length);
  const pValue = approximatePValue(tStat, baselineScores.length + variantScores.length - 2);
  const significant = pValue < 0.05;
  
  return {
    study_id: `ablation-param-${parameterName}-${Date.now()}`,
    study_type: 'parameter_effect',
    baseline_reports: baselineReports,
    variant_reports: variantReports,
    comparison_result: {
      baseline_mean: baselineMean,
      variant_mean: variantMean,
      difference,
      effect_size: effectSize,
      statistical_significance: {
        significant,
        p_value: pValue,
        confidence_interval: ci
      }
    },
    created_at: new Date().toISOString()
  };
}

/**
 * Skill comparison ablation study
 * Compare different skills on same conversations
 */
export function conductSkillComparisonAblation(
  reports: AuditReport[],
  skill1Id: string,
  skill2Id: string,
  conversationIds: string[]
): AblationStudy {
  const skill1Reports = reports.filter(r => 
    r.skill_id === skill1Id && conversationIds.includes(r.conversation_id)
  );
  
  const skill2Reports = reports.filter(r => 
    r.skill_id === skill2Id && conversationIds.includes(r.conversation_id)
  );
  
  if (skill1Reports.length === 0 || skill2Reports.length === 0) {
    throw new Error(`Insufficient reports for skill comparison. Skill 1: ${skill1Reports.length}, Skill 2: ${skill2Reports.length}`);
  }
  
  const skill1Scores = skill1Reports.map(r => r.overall_score);
  const skill2Scores = skill2Reports.map(r => r.overall_score);
  
  const skill1Mean = skill1Scores.reduce((a, b) => a + b, 0) / skill1Scores.length;
  const skill2Mean = skill2Scores.reduce((a, b) => a + b, 0) / skill2Scores.length;
  const difference = skill2Mean - skill1Mean;
  
  // Effect size
  const skill1Variance = skill1Scores.reduce((sum, s) => sum + Math.pow(s - skill1Mean, 2), 0) / (skill1Scores.length - 1);
  const skill2Variance = skill2Scores.reduce((sum, s) => sum + Math.pow(s - skill2Mean, 2), 0) / (skill2Scores.length - 1);
  const pooledStddev = Math.sqrt((skill1Variance + skill2Variance) / 2);
  const effectSize = pooledStddev > 0 ? difference / pooledStddev : 0;
  
  // Statistical test
  const combinedScores = [...skill1Scores, ...skill2Scores];
  const ci = calculateConfidenceInterval(combinedScores);
  const tStat = Math.abs(effectSize) * Math.sqrt(skill1Scores.length);
  const pValue = approximatePValue(tStat, skill1Scores.length + skill2Scores.length - 2);
  const significant = pValue < 0.05;
  
  return {
    study_id: `ablation-skill-${skill1Id}-vs-${skill2Id}-${Date.now()}`,
    study_type: 'skill_comparison',
    baseline_reports: skill1Reports,
    variant_reports: skill2Reports,
    comparison_result: {
      baseline_mean: skill1Mean,
      variant_mean: skill2Mean,
      difference,
      effect_size: effectSize,
      statistical_significance: {
        significant,
        p_value: pValue,
        confidence_interval: ci
      }
    },
    created_at: new Date().toISOString()
  };
}

/**
 * Model comparison ablation study
 * Compare different models on same conversations
 */
export function conductModelComparisonAblation(
  reports: AuditReport[],
  model1Name: string,
  model2Name: string,
  conversationIds: string[]
): AblationStudy {
  const model1Reports = reports.filter(r => 
    r.model_name === model1Name && conversationIds.includes(r.conversation_id)
  );
  
  const model2Reports = reports.filter(r => 
    r.model_name === model2Name && conversationIds.includes(r.conversation_id)
  );
  
  if (model1Reports.length === 0 || model2Reports.length === 0) {
    throw new Error(`Insufficient reports for model comparison. Model 1: ${model1Reports.length}, Model 2: ${model2Reports.length}`);
  }
  
  const model1Scores = model1Reports.map(r => r.overall_score);
  const model2Scores = model2Reports.map(r => r.overall_score);
  
  const model1Mean = model1Scores.reduce((a, b) => a + b, 0) / model1Scores.length;
  const model2Mean = model2Scores.reduce((a, b) => a + b, 0) / model2Scores.length;
  const difference = model2Mean - model1Mean;
  
  // Effect size
  const model1Variance = model1Scores.reduce((sum, s) => sum + Math.pow(s - model1Mean, 2), 0) / (model1Scores.length - 1);
  const model2Variance = model2Scores.reduce((sum, s) => sum + Math.pow(s - model2Mean, 2), 0) / (model2Scores.length - 1);
  const pooledStddev = Math.sqrt((model1Variance + model2Variance) / 2);
  const effectSize = pooledStddev > 0 ? difference / pooledStddev : 0;
  
  // Statistical test
  const combinedScores = [...model1Scores, ...model2Scores];
  const ci = calculateConfidenceInterval(combinedScores);
  const tStat = Math.abs(effectSize) * Math.sqrt(model1Scores.length);
  const pValue = approximatePValue(tStat, model1Scores.length + model2Scores.length - 2);
  const significant = pValue < 0.05;
  
  return {
    study_id: `ablation-model-${model1Name}-vs-${model2Name}-${Date.now()}`,
    study_type: 'model_comparison',
    baseline_reports: model1Reports,
    variant_reports: model2Reports,
    comparison_result: {
      baseline_mean: model1Mean,
      variant_mean: model2Mean,
      difference,
      effect_size: effectSize,
      statistical_significance: {
        significant,
        p_value: pValue,
        confidence_interval: ci
      }
    },
    created_at: new Date().toISOString()
  };
}

/**
 * Position bias ablation study
 * Compare A-first vs B-first order results
 */
export function conductPositionBiasAblation(
  positionSwapResults: PositionSwapResult[]
): AblationStudy {
  if (positionSwapResults.length === 0) {
    throw new Error('Need at least one position swap result');
  }
  
  const aFirstScores = positionSwapResults.map(r => r.reportA.overall_score);
  const bFirstScores = positionSwapResults.map(r => r.reportB.overall_score);
  
  const aFirstMean = aFirstScores.reduce((a, b) => a + b, 0) / aFirstScores.length;
  const bFirstMean = bFirstScores.reduce((a, b) => a + b, 0) / bFirstScores.length;
  const difference = bFirstMean - aFirstMean;
  
  // Effect size
  const aFirstVariance = aFirstScores.reduce((sum, s) => sum + Math.pow(s - aFirstMean, 2), 0) / (aFirstScores.length - 1);
  const bFirstVariance = bFirstScores.reduce((sum, s) => sum + Math.pow(s - bFirstMean, 2), 0) / (bFirstScores.length - 1);
  const pooledStddev = Math.sqrt((aFirstVariance + bFirstVariance) / 2);
  const effectSize = pooledStddev > 0 ? difference / pooledStddev : 0;
  
  // Statistical test
  const combinedScores = [...aFirstScores, ...bFirstScores];
  const ci = calculateConfidenceInterval(combinedScores);
  const tStat = Math.abs(effectSize) * Math.sqrt(aFirstScores.length);
  const pValue = approximatePValue(tStat, aFirstScores.length + bFirstScores.length - 2);
  const significant = pValue < 0.05;
  
  return {
    study_id: `ablation-position-bias-${Date.now()}`,
    study_type: 'position_bias',
    baseline_reports: positionSwapResults.map(r => r.reportA),
    variant_reports: positionSwapResults.map(r => r.reportB),
    comparison_result: {
      baseline_mean: aFirstMean,
      variant_mean: bFirstMean,
      difference,
      effect_size: effectSize,
      statistical_significance: {
        significant,
        p_value: pValue,
        confidence_interval: ci
      }
    },
    created_at: new Date().toISOString()
  };
}

/**
 * Approximate p-value from t-statistic
 */
function approximatePValue(tStat: number, df: number): number {
  // Simplified approximation
  if (tStat > 3) return 0.001;
  if (tStat > 2) return 0.01;
  if (tStat > 1.5) return 0.05;
  return 0.1;
}

/**
 * Generate ablation study report
 */
export function generateAblationReport(
  studies: AblationStudy[]
): string {
  let report = '# Ablation Study Report\n\n';
  report += `Generated: ${new Date().toISOString()}\n`;
  report += `Total Studies: ${studies.length}\n\n`;
  
  for (const study of studies) {
    report += `## ${study.study_type.replace('_', ' ').toUpperCase()}\n\n`;
    report += `**Study ID**: ${study.study_id}\n\n`;
    report += `**Baseline Mean**: ${study.comparison_result.baseline_mean.toFixed(3)}\n`;
    report += `**Variant Mean**: ${study.comparison_result.variant_mean.toFixed(3)}\n`;
    report += `**Difference**: ${study.comparison_result.difference.toFixed(3)}\n`;
    report += `**Effect Size (Cohen's d)**: ${study.comparison_result.effect_size.toFixed(3)}\n`;
    report += `**Statistical Significance**: ${study.comparison_result.statistical_significance.significant ? 'Yes' : 'No'}\n`;
    
    if (study.comparison_result.statistical_significance.p_value !== undefined) {
      report += `**P-value**: ${study.comparison_result.statistical_significance.p_value.toFixed(3)}\n`;
    }
    
    report += `**95% CI**: [${study.comparison_result.statistical_significance.confidence_interval.lower.toFixed(3)}, ${study.comparison_result.statistical_significance.confidence_interval.upper.toFixed(3)}]\n\n`;
  }
  
  return report;
}

