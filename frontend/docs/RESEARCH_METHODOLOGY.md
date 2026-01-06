# Research Methodology: Statistical Rigor for LLM-as-Judge Evaluation Systems

**Version:** 1.0  
**Last Updated:** January 2026  
**Project:** ThoughtGuards - AI Manipulation Detection System

## Table of Contents

1. [Overview](#overview)
2. [Statistical Methods](#statistical-methods)
3. [Mathematical Derivations](#mathematical-derivations)
4. [Reproducibility Checklist](#reproducibility-checklist)
5. [Limitations and Assumptions](#limitations-and-assumptions)
6. [References](#references)

---

## Overview

This document provides comprehensive documentation of the statistical methods implemented in the ThoughtGuards evaluation system. The system addresses critical gaps in LLM-as-judge evaluation systems by implementing scientifically rigorous statistical analysis, bias mitigation, and proper uncertainty quantification.

### Scope

This methodology covers:

- **Distribution Metrics**: Mean, standard deviation, quantiles, variance
- **Confidence Intervals**: Bootstrap, BCa (Bias-Corrected Accelerated)
- **Calibration**: Precision, recall, specificity, sensitivity, bias-adjusted estimation
- **Bias Mitigation**: Position bias detection, Rogan-Gladen estimator
- **Hierarchical Statistics**: Cluster bootstrap, variance decomposition
- **Robust Statistics**: MAD, trimmed mean, winsorized mean
- **Model Drift Detection**: KS test, Population Stability Index (PSI)
- **Inter-Judge Reliability**: Cohen's kappa, Intraclass Correlation Coefficient (ICC)
- **Active Learning**: Uncertainty sampling, diversity sampling

### Key Principles

1. **Distributional Reporting**: Never report single scores without variance
2. **Proper Uncertainty Quantification**: Use bootstrap CIs, not normal approximations
3. **Bias Correction**: Apply Rogan-Gladen estimator when calibration data available
4. **Hierarchical Structure**: Account for clustering (conversations, runs, parameters)
5. **Reproducibility**: Track all parameters, seeds, fingerprints, and versions

---

## Statistical Methods

### 1. Distribution Metrics

#### Mean and Standard Deviation

**Formula:**
```
μ = (1/n) Σᵢ xᵢ
σ² = (1/(n-1)) Σᵢ (xᵢ - μ)²
σ = √σ²
```

**Implementation:** `calculateDistribution()` in `statisticalAnalysis.ts`

**Notes:**
- Uses Bessel's correction (n-1) for unbiased variance estimate
- Handles edge cases (n=0, n=1)

#### Quantiles

**Formula:**
```
Q(p) = x₍(n-1)p⌋ + (x₍(n-1)p⌉ - x₍(n-1)p⌋) × weight
```

Where `weight = (n-1)p - ⌊(n-1)p⌋` (linear interpolation)

**Implementation:** Quantile function in `calculateDistribution()`

**Reported Quantiles:**
- P5 (5th percentile)
- P25 (first quartile)
- P50 (median)
- P75 (third quartile)
- P95 (95th percentile)

**Reference:** Hyndman & Fan (1996) - Type 7 quantile definition

---

### 2. Confidence Intervals

#### Standard Bootstrap Confidence Interval

**Method:** Percentile bootstrap

**Algorithm:**
1. Resample with replacement B times (B ≥ 1000)
2. Calculate statistic (mean) for each bootstrap sample
3. Sort bootstrap statistics
4. Take α/2 and (1-α/2) percentiles as CI bounds

**Formula:**
```
CI = [θ*₍Bα/2⌋, θ*₍B(1-α/2)⌉]
```

Where θ*ᵢ are sorted bootstrap statistics

**Implementation:** `calculateConfidenceInterval()` in `statisticalAnalysis.ts`

**Limitations:**
- Assumes symmetric distribution
- May be inaccurate for skewed distributions
- Use BCa for better accuracy

**Reference:** Efron & Tibshirani (1993), "An Introduction to the Bootstrap"

#### BCa (Bias-Corrected Accelerated) Bootstrap

**Method:** BCa bootstrap with acceleration correction

**Formula:**
```
α₁ = Φ(z₀ + (z₀ + z_α) / (1 - â(z₀ + z_α)))
α₂ = Φ(z₀ + (z₀ + z_{1-α}) / (1 - â(z₀ + z_{1-α})))
```

Where:
- `z₀ = Φ⁻¹(#{θ*_b < θ̂} / B)` - bias correction
- `â = Σ(θ̄_jack - θ_i)³ / [6·(Σ(θ̄_jack - θ_i)²)^1.5]` - acceleration (jackknife estimate)
- `Φ` = standard normal CDF
- `θ̂` = original statistic

**Implementation:** `calculateBCaConfidenceInterval()` in `statisticalAnalysis.ts`

**Requirements:**
- Minimum n = 30 samples
- Minimum B = 1,000 bootstrap samples
- Uses jackknife for acceleration estimate

**Advantages:**
- Accounts for bias and skewness
- More accurate than percentile bootstrap
- Second-order accurate (error O(n⁻²))

**Reference:** Efron (1987), "Better Bootstrap Confidence Intervals"

---

### 3. Calibration Metrics

#### Precision, Recall, F1, Specificity

**Formulas:**
```
Precision = TP / (TP + FP)
Recall (Sensitivity) = TP / (TP + FN)
Specificity = TN / (TN + FP)
F1 = 2 × (Precision × Recall) / (Precision + Recall)
Accuracy = (TP + TN) / (TP + TN + FP + FN)
```

**Implementation:** `calculateCalibrationMetrics()` in `statisticalAnalysis.ts`

**Reference:** Standard classification metrics (Fawcett, 2006)

#### Bias-Adjusted Estimation (Rogan-Gladen Estimator)

**Problem:** Raw LLM judge scores may be systematically biased (over/under-estimate prevalence)

**Solution:** Rogan-Gladen estimator corrects for known sensitivity/specificity

**Formula:**
```
θ̂ = (p̂ + q₀ - 1) / (q₀ + q₁ - 1)
```

Where:
- `θ̂` = bias-adjusted prevalence/accuracy
- `p̂` = observed (raw) proportion
- `q₀` = specificity = P(negative | truly negative)
- `q₁` = sensitivity = P(positive | truly positive)

**Edge Cases:**
- If `q₀ + q₁ ≤ 1.1`: Fall back to raw score (judge too unreliable)
- Minimum denominator: 0.1 (require `q₀ + q₁ > 1.1`)

**Confidence Interval:**
```
Var(θ̂) = [p̂(1-p̂) + (q₀ + q₁ - 1)²Var(θ̂)] / (q₀ + q₁ - 1)²
CI = θ̂ ± z_{α/2} × √Var(θ̂)
```

**Implementation:** `calculateRoganGladenEstimator()` in `statisticalAnalysis.ts`

**Requirements:**
- Calibration dataset with ≥200 samples (for 98% coverage)
- Minimum 30 samples per category (for 88% coverage)
- Ground truth labels required

**Reference:** Rogan & Gladen (1978), "Estimating Prevalence from the Results of a Screening Test"

#### Hosmer-Lemeshow Test

**Purpose:** Test calibration curve goodness-of-fit

**Method:**
1. Bin predictions into deciles
2. Calculate observed vs. expected frequencies
3. Compute chi-squared statistic

**Formula:**
```
χ² = Σᵢ (Oᵢ - Eᵢ)² / Eᵢ
```

Where Oᵢ and Eᵢ are observed and expected frequencies in bin i

**Implementation:** `calculateHosmerLemeshowTest()` in `calibrationSystem.ts`

**Reference:** Hosmer & Lemeshow (1980), "Goodness-of-fit tests for the multiple logistic regression model"

---

### 4. Position Bias Mitigation

#### Position-Swapping Algorithm

**Problem:** LLM judges may favor responses in first position (position bias)

**Solution:** Run evaluations in both orders (A-B and B-A), average results

**Algorithm:**
1. Detect pairwise comparisons (A vs. B)
2. Run evaluation with A first
3. Run evaluation with B first
4. Average scores: `score = (score_A_first + score_B_first) / 2`
5. Test for bias using McNemar's test

**Implementation:** `applyPositionSwapping()` in `biasMitigation.ts`

#### McNemar's Test

**Purpose:** Test for position bias in pairwise comparisons

**Formula:**
```
χ² = (|b - c| - 1)² / (b + c)
```

Where:
- `b` = discordant pairs (A wins original, B wins swapped)
- `c` = discordant pairs (B wins original, A wins swapped)
- df = 1

**Effect Sizes (Cohen's h):**
- Small: 0.2
- Medium: 0.5
- Large: 0.8

**Thresholds:**
- Warning: <40% or >60% of wins go to first position
- Critical: <30% or >70% of wins go to first position

**Implementation:** `detectPositionBias()` in `biasMitigation.ts`

**Reference:** McNemar (1947), "Note on the sampling error of the difference between correlated proportions or percentages"

---

### 5. Hierarchical Bootstrap (Cluster Bootstrap)

#### Problem

Standard bootstrap assumes independent samples. In audit systems:
- Multiple runs per conversation (clustered)
- Multiple conversations per category (nested)
- Violates independence assumption

#### Solution: Cluster Bootstrap

**Algorithm:**
1. Resample at cluster level (conversation_id or audit_id)
2. Include all runs within selected clusters
3. Calculate statistic on resampled clusters
4. Repeat B times
5. Use BCa for CI calculation

**Cluster-Level Acceleration:**
```
â_cluster = Σ(θ̄_cluster_jack - θ_cluster_i)³ / [6·(Σ(θ̄_cluster_jack - θ_cluster_i)²)^1.5]
```

Where jackknife deletes entire clusters (not individual runs)

**Implementation:** `calculateClusterBootstrapCI()` in `statisticalAnalysis.ts`

**Requirements:**
- Minimum 30 clusters
- Minimum 1,000 bootstrap samples
- Check cluster balance (CV < 0.6)

**Reference:** Field & Welsh (2007), "Bootstrapping clustered data"

#### Cluster Balance Analysis

**Coefficient of Variation:**
```
CV = σ(cluster_sizes) / μ(cluster_sizes)
```

**Interpretation:**
- CV < 0.3: Balanced, use standard bootstrap
- 0.3 ≤ CV < 0.6: Moderate imbalance, consider weighting
- CV ≥ 0.6: Severe imbalance, use weighted bootstrap

**Implementation:** `analyzeClusterBalance()` in `statisticalAnalysis.ts`

---

### 6. Robust Statistics

#### Median Absolute Deviation (MAD)

**Formula:**
```
MAD = median(|xᵢ - median(x)|)
```

**Advantages:**
- Robust to outliers
- Resistant to up to 50% contamination

**Implementation:** `calculateMAD()` in `statisticalAnalysis.ts`

**Reference:** Rousseeuw & Croux (1993), "Alternatives to the median absolute deviation"

#### Trimmed Mean

**Formula:**
```
Trimmed Mean = mean(x after removing top/bottom α%)
```

**Default:** α = 10% (removes top and bottom 10%)

**Implementation:** `calculateTrimmedMean()` in `statisticalAnalysis.ts`

**Reference:** Wilcox (2012), "Introduction to Robust Estimation and Hypothesis Testing"

#### Winsorized Mean

**Formula:**
```
Winsorized Mean = mean(x with extreme values replaced by percentiles)
```

**Default:** Replace top/bottom 10% with 10th/90th percentiles

**Implementation:** `calculateWinsorizedMean()` in `statisticalAnalysis.ts`

---

### 7. Variance Decomposition

#### ANOVA-Style Variance Decomposition

**Purpose:** Separate variance into components (temperature, seed, residual)

**Formula:**
```
Total Variance = Temperature Variance + Seed Variance + Residual Variance
```

**Temperature Variance:**
```
σ²_temp = (1/k) Σᵢ (μᵢ - μ)²
```

Where:
- k = number of temperature groups
- μᵢ = mean score for temperature group i
- μ = overall mean

**Residual Variance:**
```
σ²_residual = Total Variance - σ²_temp - σ²_seed
```

**Implementation:** `decomposeVariance()` in `statisticalAnalysis.ts`

**Reference:** Standard ANOVA decomposition (Fisher, 1925)

---

### 8. Inter-Judge Reliability

#### Cohen's Kappa

**Formula:**
```
κ = (P₀ - Pₑ) / (1 - Pₑ)
```

Where:
- P₀ = observed agreement
- Pₑ = expected agreement by chance

**Interpretation:**
- κ < 0: No agreement
- 0 ≤ κ < 0.2: Slight agreement
- 0.2 ≤ κ < 0.4: Fair agreement
- 0.4 ≤ κ < 0.6: Moderate agreement
- 0.6 ≤ κ < 0.8: Substantial agreement
- κ ≥ 0.8: Almost perfect agreement

**Requirements:**
- Minimum κ ≥ 0.7 for calibration dataset (substantial agreement)

**Implementation:** `calculateInterRaterAgreement()` in `statisticalAnalysis.ts`

**Reference:** Cohen (1960), "A coefficient of agreement for nominal scales"

#### Intraclass Correlation Coefficient (ICC)

**Formula:**
```
ICC = σ²_between / (σ²_between + σ²_within)
```

Where:
- σ²_between = variance between judges/raters
- σ²_within = variance within judges/raters

**Implementation:** `calculateIntraJudgeReliability()` in `statisticalAnalysis.ts`

**Reference:** Shrout & Fleiss (1979), "Intraclass correlations: uses in assessing rater reliability"

---

### 9. Model Drift Detection

#### Kolmogorov-Smirnov Test

**Purpose:** Detect distribution shift in model outputs

**Formula:**
```
D = max |F_baseline(x) - F_current(x)|
```

Where F is the empirical cumulative distribution function

**Critical Value:**
```
D_critical = c(α) × √((n₁ + n₂) / (n₁ × n₂))
```

Where c(α) depends on significance level

**Implementation:** `calculateKSStatistic()` in `statisticalAnalysis.ts`

**Reference:** Kolmogorov (1933), "Sulla determinazione empirica di una legge di distribuzione"

#### Population Stability Index (PSI)

**Formula:**
```
PSI = Σᵢ [(current_i - baseline_i) × ln(current_i / baseline_i)]
```

**Interpretation:**
- PSI < 0.1: No significant change
- 0.1 ≤ PSI < 0.2: Moderate change
- PSI ≥ 0.2: Significant change

**Implementation:** `calculatePSI()` in `statisticalAnalysis.ts`

**Reference:** Yurdakul & Naranjo (2019), "Population Stability Index for Credit Risk Model Monitoring"

---

### 10. Active Learning

#### Uncertainty Sampling

**Least Confidence:**
```
U(x) = 1 - max P(y|x)
```

**Entropy:**
```
U(x) = -Σᵢ P(yᵢ|x) × ln P(yᵢ|x)
```

**Margin:**
```
U(x) = P(y₁|x) - P(y₂|x)
```

Where y₁ and y₂ are top two predictions

**Variance-Based:**
```
U(x) = Var[P(y|x)]
```

**Implementation:** `calculateUncertaintyScore()` in `activeLearning.ts`

**Reference:** Settles (2009), "Active Learning Literature Survey"

#### Diversity Sampling

**Core-Set Selection:**
```
Select samples that maximize minimum distance to labeled set
```

**Implementation:** `calculateDiversityScore()` in `activeLearning.ts`

**Reference:** Sener & Savarese (2018), "Active Learning for Convolutional Neural Networks: A Core-Set Approach"

---

### 11. Chain-of-Thought Faithfulness

#### Mistake Injection Test

**Method:**
1. Inject deliberate mistakes into CoT reasoning
2. Check if model corrects mistakes
3. Measure correction rate

**Faithfulness Rate:**
```
Faithfulness = (# corrections) / (# mistakes injected)
```

**Expected Range:** 25-39% (acknowledged low faithfulness rates)

**Implementation:** `performMistakeInjectionTest()` in `cotFaithfulness.ts`

**Reference:** Lanham et al. (2023), "Measuring Faithfulness in Chain-of-Thought Reasoning"

---

## Mathematical Derivations

### BCa Acceleration Derivation

The acceleration parameter `â` measures the rate of change of the standard error of the statistic with respect to the true parameter value.

**Derivation:**
```
â = (1/6) × lim_{ε→0} [SE(θ̂ + ε) - SE(θ̂)] / ε
```

Using jackknife approximation:
```
â ≈ Σ(θ̄_jack - θ_i)³ / [6·(Σ(θ̄_jack - θ_i)²)^1.5]
```

Where:
- θ̄_jack = mean of jackknife estimates
- θ_i = jackknife estimate with observation i removed

**Reference:** Efron (1987), "Better Bootstrap Confidence Intervals"

### Rogan-Gladen Estimator Derivation

**Starting Point:**
```
p̂ = θ × q₁ + (1 - θ) × (1 - q₀)
```

Where:
- p̂ = observed proportion
- θ = true prevalence
- q₁ = sensitivity
- q₀ = specificity

**Solving for θ:**
```
p̂ = θ × q₁ + (1 - θ) × (1 - q₀)
p̂ = θ × q₁ + 1 - q₀ - θ + θ × q₀
p̂ = 1 - q₀ + θ × (q₁ + q₀ - 1)
θ = (p̂ + q₀ - 1) / (q₁ + q₀ - 1)
```

**Reference:** Rogan & Gladen (1978)

---

## Reproducibility Checklist

### Required Information for Each Report

- [ ] **LLM Parameters**: temperature, top_p, top_k, max_tokens, seed, etc.
- [ ] **Model Information**: model name, version, system fingerprint
- [ ] **Skill Version**: semantic version of audit skill used
- [ ] **Prompt Version**: version of evaluation prompt
- [ ] **Execution Metadata**: timestamp, duration, cache status
- [ ] **Random Seeds**: all seeds used for reproducibility
- [ ] **Bootstrap Samples**: link to bootstrap sample IDs (if applicable)
- [ ] **Calibration Data**: reference to calibration dataset used
- [ ] **Ground Truth**: reference to ground truth labels (if applicable)

### Statistical Reporting Requirements

- [ ] **Sample Size**: n (number of runs/samples)
- [ ] **Distribution Metrics**: mean ± stddev, quantiles (P5, P50, P95)
- [ ] **Confidence Intervals**: method (bootstrap/BCa), level (95%), bounds
- [ ] **Calibration Metrics**: precision, recall, specificity, sensitivity (if applicable)
- [ ] **Bias Adjustment**: whether Rogan-Gladen estimator was applied
- [ ] **Hierarchical Structure**: cluster information (if applicable)
- [ ] **Position Bias**: whether position-swapping was applied, McNemar's test results
- [ ] **Model Drift**: baseline comparison, KS test/PSI results (if applicable)

### Code Reproducibility

- [ ] **Version Control**: Git commit hash
- [ ] **Dependencies**: package.json with exact versions
- [ ] **Environment**: Node.js version, OS, hardware (if relevant)
- [ ] **Random Seed**: fixed seed for reproducibility
- [ ] **Configuration**: all configuration files committed

### Data Reproducibility

- [ ] **Input Data**: conversation IDs, test case identifiers
- [ ] **Output Data**: all reports stored in database with full metadata
- [ ] **Bootstrap Samples**: stored in `bootstrap_samples` table
- [ ] **Calibration Data**: stored in `calibration_datasets` table
- [ ] **Ground Truth**: stored in `ground_truth_labels` table

---

## Limitations and Assumptions

### Statistical Assumptions

1. **Independence**: Assumes runs are independent (may be violated with caching)
   - **Mitigation**: Track cache status, exclude cached runs from variance analysis

2. **Normality**: Bootstrap CIs assume sufficient sample size (n ≥ 30)
   - **Mitigation**: Use BCa for non-normal distributions

3. **Stationarity**: Assumes model behavior is stable over time
   - **Mitigation**: Monitor for drift using canary prompts

4. **Calibration Validity**: Rogan-Gladen assumes calibration data is representative
   - **Mitigation**: Use stratified sampling, validate representativeness

### Known Limitations

1. **Low CoT Faithfulness**: 25-39% faithfulness rates acknowledged
   - **Impact**: CoT reasoning may not reflect actual model reasoning
   - **Mitigation**: Use Process Reward Models for step-by-step evaluation

2. **Position Bias**: May persist even after swapping
   - **Impact**: Small residual bias possible
   - **Mitigation**: Report McNemar's test results, use multiple evaluation orders

3. **Cache Effects**: Cached responses reduce variance
   - **Impact**: Underestimate true variance
   - **Mitigation**: Track cache status, report cache hit rate

4. **Sample Size Requirements**: Some methods require large samples
   - **Impact**: May not be applicable to small datasets
   - **Mitigation**: Report sample size, use appropriate methods

5. **Model-Specific**: Some methods assume specific model families
   - **Impact**: May not generalize across all models
   - **Mitigation**: Test across multiple model families

### Scope Limitations

1. **Not a Replacement for Human Evaluation**: LLM-as-judge has limitations
2. **Domain-Specific**: Calibration may not generalize across domains
3. **Temporal Drift**: Models may change over time (addressed via drift detection)
4. **Computational Cost**: Bootstrap methods require significant computation

---

## References

### Core Statistical Methods

1. **Efron, B., & Tibshirani, R. J.** (1993). *An Introduction to the Bootstrap*. Chapman & Hall/CRC.

2. **Efron, B.** (1987). Better Bootstrap Confidence Intervals. *Journal of the American Statistical Association*, 82(397), 171-185.

3. **Rogan, W. J., & Gladen, B.** (1978). Estimating Prevalence from the Results of a Screening Test. *American Journal of Epidemiology*, 107(1), 71-76.

4. **McNemar, Q.** (1947). Note on the sampling error of the difference between correlated proportions or percentages. *Psychometrika*, 12(2), 153-157.

5. **Cohen, J.** (1960). A coefficient of agreement for nominal scales. *Educational and Psychological Measurement*, 20(1), 37-46.

### Hierarchical Statistics

6. **Field, C. A., & Welsh, A. H.** (2007). Bootstrapping clustered data. *Journal of the Royal Statistical Society: Series B*, 69(3), 369-390.

7. **Shrout, P. E., & Fleiss, J. L.** (1979). Intraclass correlations: uses in assessing rater reliability. *Psychological Bulletin*, 86(2), 420-428.

### Robust Statistics

8. **Rousseeuw, P. J., & Croux, C.** (1993). Alternatives to the median absolute deviation. *Journal of the American Statistical Association*, 88(424), 1273-1283.

9. **Wilcox, R. R.** (2012). *Introduction to Robust Estimation and Hypothesis Testing* (3rd ed.). Academic Press.

### Calibration

10. **Hosmer, D. W., & Lemeshow, S.** (1980). Goodness-of-fit tests for the multiple logistic regression model. *Communications in Statistics - Theory and Methods*, 9(10), 1043-1069.

11. **Lang, Z., & Reiczigel, J.** (2014). Confidence limits for prevalence of disease adjusted for estimated sensitivity and specificity. *Preventive Veterinary Medicine*, 113(1), 13-22.

### Model Drift Detection

12. **Kolmogorov, A. N.** (1933). Sulla determinazione empirica di una legge di distribuzione. *Giornale dell'Istituto Italiano degli Attuari*, 4, 83-91.

13. **Yurdakul, B., & Naranjo, F.** (2019). Population Stability Index for Credit Risk Model Monitoring. *Journal of Risk Model Validation*, 13(2), 1-20.

### Active Learning

14. **Settles, B.** (2009). Active Learning Literature Survey. *University of Wisconsin-Madison Computer Sciences Technical Report*, 1648.

15. **Sener, O., & Savarese, S.** (2018). Active Learning for Convolutional Neural Networks: A Core-Set Approach. *International Conference on Learning Representations*.

### Chain-of-Thought Faithfulness

16. **Lanham, M., et al.** (2023). Measuring Faithfulness in Chain-of-Thought Reasoning. *arXiv preprint arXiv:2307.13702*.

### Quantiles

17. **Hyndman, R. J., & Fan, Y.** (1996). Sample Quantiles in Statistical Packages. *The American Statistician*, 50(4), 361-365.

### Classification Metrics

18. **Fawcett, T.** (2006). An introduction to ROC analysis. *Pattern Recognition Letters*, 27(8), 861-874.

---

## Appendix: Quick Reference Formulas

### Distribution Metrics
```
Mean: μ = (1/n) Σᵢ xᵢ
Variance: σ² = (1/(n-1)) Σᵢ (xᵢ - μ)²
Std Dev: σ = √σ²
```

### BCa Confidence Interval
```
α₁ = Φ(z₀ + (z₀ + z_α) / (1 - â(z₀ + z_α)))
z₀ = Φ⁻¹(#{θ*_b < θ̂} / B)
â = Σ(θ̄_jack - θ_i)³ / [6·(Σ(θ̄_jack - θ_i)²)^1.5]
```

### Rogan-Gladen Estimator
```
θ̂ = (p̂ + q₀ - 1) / (q₀ + q₁ - 1)
```

### McNemar's Test
```
χ² = (|b - c| - 1)² / (b + c)
```

### Population Stability Index
```
PSI = Σᵢ [(current_i - baseline_i) × ln(current_i / baseline_i)]
```

### Coefficient of Variation (Cluster Balance)
```
CV = σ(cluster_sizes) / μ(cluster_sizes)
```

---

**Document Status:** Complete  
**Next Review:** After major statistical method updates  
**Contact:** See project repository for issues and contributions

