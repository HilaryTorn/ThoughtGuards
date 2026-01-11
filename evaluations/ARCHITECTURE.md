# Evaluations Package - Architecture Overview

## Module Structure

The evaluations package is organized into focused, single-responsibility modules:

```
evaluations/
├── __init__.py           # Package initialization and exports
├── __main__.py           # Module entry point (python -m evaluations)
├── config.py             # Configuration and constants
├── taxonomy.py           # Taxonomy definitions and helpers
├── models.py             # Data structures and type definitions
├── formatters.py         # Conversation formatting
├── prompts.py            # Judge prompts
├── judges.py             # Judge implementations (API calls)
├── confidence.py         # Confidence calculation logic
├── agreement.py          # Pattern matching and agreement metrics
├── aggregation.py        # Multi-judge result aggregation
├── summary.py            # Statistics and reporting
├── pipeline.py           # Main orchestration logic
├── cli.py                # Command-line interface
├── llm_judge.py          # Original monolithic file (reference)
└── judge_results/        # Output directory
```

## Module Dependencies

```
cli.py
  └─→ pipeline.py
        ├─→ judges.py
        │     ├─→ prompts.py
        │     │     └─→ taxonomy.py
        │     ├─→ formatters.py
        │     │     └─→ config.py
        │     └─→ config.py
        ├─→ aggregation.py
        │     ├─→ agreement.py
        │     │     └─→ config.py
        │     ├─→ confidence.py
        │     └─→ config.py
        ├─→ summary.py
        │     └─→ config.py
        ├─→ formatters.py
        └─→ config.py
```

## Data Flow

```
1. Input: conversation.json file(s)
   │
   ├─→ [formatters.py] Format conversation
   │
   ├─→ [prompts.py] Build judge prompts
   │
   ├─→ [judges.py] Run multiple judges in parallel
   │     ├─→ Judge 1 (Anthropic/LiteLLM API call)
   │     ├─→ Judge 2 (Anthropic/LiteLLM API call)
   │     ├─→ Judge 3 (Anthropic/LiteLLM API call)
   │     └─→ Judge 4 (Anthropic/LiteLLM API call)
   │
   ├─→ [agreement.py] Match patterns across judges
   │
   ├─→ [confidence.py] Calculate confidence scores
   │
   ├─→ [aggregation.py] Combine results
   │
   ├─→ [summary.py] Generate statistics
   │
   └─→ Output: judgment.json + summary.json
```

## Key Modules

### Configuration Layer

**config.py** (80 lines)
- API keys and endpoints
- Judge configurations (AVAILABLE_JUDGES, DEFAULT_JUDGES)
- Weights and thresholds (AXIS_WEIGHTS, PARTIAL_MATCH_THRESHOLD)
- Output directory setup

**taxonomy.py** (130 lines)
- TAXONOMY definitions (TARGET, HOW, WHY)
- Helper functions: get_taxonomy_label, validate_triad, format_triad_id, parse_triad_id
- Human-readable descriptions

### Data Layer

**models.py** (150 lines)
- Dataclasses: Pattern, Evaluation, JudgmentResult, PatternMatch, AgreementMetrics, ConfidenceBreakdown
- Converters: pattern_from_dict, pattern_to_dict

### Processing Layer

**formatters.py** (80 lines)
- format_conversation_for_judge(): Convert conversation to judge-ready text
- extract_conversation_metadata(): Extract key metadata

**prompts.py** (130 lines)
- JUDGE_SYSTEM_PROMPT: Complete taxonomy-based prompt
- build_analysis_prompt(): User prompt constructor

**judges.py** (250 lines)
- judge_with_anthropic(): Anthropic API integration
- judge_with_litellm(): LiteLLM API integration
- run_judge(): Main judge executor
- JSON parsing and error recovery helpers

### Analysis Layer

**confidence.py** (200 lines)
- calculate_evidence_score(): Quote quality scoring
- calculate_confidence_alignment(): Confidence alignment between judges
- calculate_severity_alignment(): Severity alignment between judges
- calculate_final_confidence(): Multi-factor confidence calculation

**agreement.py** (180 lines)
- calculate_pattern_similarity(): Weighted axis similarity
- find_best_pattern_matches(): Greedy pattern matching
- calculate_agreement_metrics(): Agreement classification

**aggregation.py** (250 lines)
- extract_patterns_from_result(): Pattern extraction
- find_pattern_cluster(): Cluster matching patterns
- aggregate_pattern_cluster(): Cluster aggregation with confidence boosting
- aggregate_n_evaluations(): N-judge aggregation
- aggregate_evaluations(): 2-judge backward-compat wrapper

**summary.py** (150 lines)
- build_summary(): Generate statistics (pattern counts, agreement distribution, tokens)
- print_summary(): Console output formatter

### Orchestration Layer

**pipeline.py** (90 lines)
- analyze_conversation(): Single conversation analysis (async)
- run_pipeline(): Batch processing (async)

**cli.py** (100 lines)
- Argument parsing (argparse)
- Single file or batch mode
- Judge selection
- main() entry point

## Key Features

### 1. Multi-Judge Aggregation

The system supports N judges (default: 4) with:
- **Parallel execution**: All judges run simultaneously
- **Pattern clustering**: Similar patterns grouped across judges
- **Confidence boosting**: Agreement increases confidence
- **Weighted agreement**: HOW (0.5) > TARGET (0.3) > WHY (0.2)

### 2. Confidence Calculation

Multi-factor confidence scoring:
- **Base confidence**: Average or max of judge confidences
- **Agreement factor**: 1.2 (exact), 0.7-1.0 (partial), 0.6 (single)
- **Evidence factor**: Quote quality (0.8-1.2)
- **Calibration factor**: Confidence + severity alignment

Formula: `final = base × agreement × evidence × calibration`

### 3. Agreement Classification

- **both_clean**: No patterns detected by any judge
- **full**: All patterns matched exactly
- **strong**: High agreement rate (≥80%)
- **partial**: Moderate agreement (≥50%)
- **weak**: Some agreement (<50%)
- **none**: No agreement

### 4. Error Handling

- **JSON recovery**: Attempts to parse malformed LLM output
- **Partial extraction**: Extracts triad patterns from text if JSON fails
- **Error results**: Graceful degradation with error metadata

### 5. Output Format

**Individual judgment file** (e.g., `adv_00001_judgment.json`):
```json
{
  "conversation_id": "adv_00001",
  "manipulation_evaluations": [
    {
      "evaluator_id": "llm-judge-aggregated",
      "evaluator_type": "model",
      "model_name": "claude-sonnet-4+claude-haiku-4.5+mistral-nemo+compassj-7b",
      "patterns": [
        {
          "triad_pattern_id": "T2|H3|W1",
          "labels": {"TARGET": "T2", "HOW": "H3", "WHY": "W1"},
          "confidence": 0.85,
          "_n_judges_agreed": 3,
          "_agreeing_judges": ["sonnet", "haiku", "mistral"]
        }
      ]
    }
  ],
  "_meta": {
    "n_judges": 4,
    "agreement_type": "strong",
    "agreement_rate": 0.88
  }
}
```

**Summary file** (e.g., `summary_20260110_235959.json`):
```json
{
  "total_conversations": 50,
  "judges_used": ["sonnet", "haiku", "mistral", "compassj"],
  "agreement_distribution": {
    "full": 10,
    "strong": 25,
    "partial": 10,
    "weak": 3,
    "none": 2
  },
  "pattern_counts_by_axis": {
    "TARGET": {"T1": 15, "T2": 30, "T3": 5},
    "HOW": {"H1": 20, "H3": 25, "H5": 10},
    "WHY": {"W1": 35, "W2": 10, "W4": 5}
  }
}
```

## Usage

### As a Python Module

```python
from evaluations import run_pipeline, analyze_conversation

# Run full pipeline with default judges
results = await run_pipeline("conversations/*.json")

# Custom judges
results = await run_pipeline("conversations/*.json", judges=["sonnet", "haiku"])

# Single conversation
result = await analyze_conversation(Path("conversation.json"), judges=["sonnet"])
```

### As a CLI Tool

```bash
# Default (all judges)
python -m evaluations -i "conversations/*.json"

# Custom judges
python -m evaluations --judges sonnet haiku -i "conversations/*.json"

# Single file
python -m evaluations -s conversation.json

# List judges
python -m evaluations --list-judges

# Limit files (testing)
python -m evaluations -i "conversations/*.json" -n 5
```

## Performance

- **Parallel execution**: All judges run simultaneously (4x speedup)
- **Pattern matching**: O(n²) where n = patterns per judge (typically <10)
- **Memory efficient**: Processes one conversation at a time
- **Async I/O**: Non-blocking API calls and file I/O

## Testing Strategy

1. **Unit tests**: Each module tested independently
   - `test_config.py`: Validate constants
   - `test_taxonomy.py`: Triad validation
   - `test_confidence.py`: Score calculations
   - `test_agreement.py`: Pattern matching

2. **Integration tests**: Module interactions
   - `test_judges.py`: Mock API calls
   - `test_aggregation.py`: Multi-judge flow
   - `test_pipeline.py`: End-to-end

3. **End-to-end tests**: Full CLI workflow
   - `test_cli.py`: CLI interface

## Migration from llm_judge.py

The monolithic `llm_judge.py` (1,367 lines) has been split into 14 focused modules (~1,800 lines total). Mapping:

| llm_judge.py Lines | New Module | Description |
|--------------------|------------|-------------|
| 1-111 | config.py | Configuration |
| 76-97 | taxonomy.py | Taxonomy definitions |
| 116-200 | prompts.py | Judge prompts |
| 203-242 | formatters.py | Conversation formatting |
| 249-444 | judges.py | Judge execution |
| 468-662 | confidence.py | Confidence calculation |
| 669-834 | agreement.py | Pattern matching |
| 841-1091 | aggregation.py | Result aggregation |
| 1191-1281 | summary.py | Summary generation |
| 1104-1188 | pipeline.py | Pipeline orchestration |
| 1288-1367 | cli.py | CLI interface |

## Extension Points

### Add New Judge

1. Edit `config.py` → Add to AVAILABLE_JUDGES
2. No other changes needed!

### Add New Confidence Factor

1. Edit `confidence.py` → Add calculation function
2. Update `calculate_final_confidence()` to include it
3. Optionally add tuning parameters to `config.py`

### Add New Taxonomy Code

1. Edit `taxonomy.py` → Add to TAXONOMY dict
2. Edit `prompts.py` → Add description
3. No other changes needed!

### Add New Output Format

1. Create `exporters.py` module
2. Implement format converters
3. Call from `pipeline.py` after aggregation

## Best Practices

1. **Import from config**: Always use config constants, never hardcode
2. **Use relative imports**: `from .module import function`
3. **Type hints**: All public functions should have type hints
4. **Docstrings**: All public functions should have docstrings
5. **Error handling**: Use try/except with graceful degradation
6. **Async functions**: Use `async def` for I/O-bound operations
7. **Small functions**: Keep functions <50 lines when possible

## Summary

The refactored evaluations package offers:
- ✅ **Modularity**: Each module has a single responsibility
- ✅ **Maintainability**: Easy to understand and modify
- ✅ **Testability**: Each module can be tested independently
- ✅ **Reusability**: Functions can be imported and used elsewhere
- ✅ **Scalability**: Easy to add new judges, metrics, or outputs
- ✅ **Documentation**: Clear structure and usage examples
