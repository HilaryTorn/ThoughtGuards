# Evaluations Module Structure

## Overview
The evaluations package has been refactored from a monolithic `llm_judge.py` file into modular components.

## Module Breakdown

### 1. **__init__.py**
Package initialization and public API exports.

**Exports:**
- Configuration constants (AVAILABLE_JUDGES, DEFAULT_JUDGES, etc.)
- Core functions (run_judge, aggregate_n_evaluations, run_pipeline, etc.)

---

### 2. **config.py** (Lines 1-80 from llm_judge.py)
Configuration constants and environment setup.

**Exports:**
- `ANTHROPIC_API_KEY` - Anthropic API key
- `LITELLM_BASE_URL` - LiteLLM proxy URL
- `LITELLM_API_KEY` - LiteLLM API key
- `AVAILABLE_JUDGES` - Dict of judge configurations
- `DEFAULT_JUDGES` - List of default judges
- `AXIS_WEIGHTS` - Weights for similarity calculation
- `PARTIAL_MATCH_THRESHOLD` - Threshold for partial matches
- `OUTPUT_DIR` - Output directory path

---

### 3. **taxonomy.py** (Lines 76-102 from llm_judge.py)
Taxonomy definitions for WHY-HOW-TARGET framework.

**Exports:**
- `TAXONOMY` - Full taxonomy structure with descriptions

---

### 4. **prompts.py** (Lines 113-240 from llm_judge.py)
Prompt templates for judge models.

**Functions:**
- `build_analysis_prompt(formatted_conversation: str) -> str`

**Constants:**
- `JUDGE_SYSTEM_PROMPT` - System prompt for judges
- `TAXONOMY_PROMPT_SECTION` - Taxonomy explanation for judges

---

### 5. **formatters.py** (Lines 245-300 from llm_judge.py)
Conversation formatting utilities.

**Functions:**
- `format_conversation_for_judge(conversation: dict) -> str`
- `extract_conversation_metadata(conversation: dict) -> dict`

---

### 6. **models.py** (Created)
Type definitions and data models for judge results.

---

### 7. **judges.py** (Lines 305-465 from llm_judge.py)
Judge execution logic for Anthropic and LiteLLM.

**Functions:**
- `run_judge(conversation: dict, judge_id: str) -> dict`
- `judge_with_anthropic(conversation: dict, model: str, judge_id: str) -> dict`
- `judge_with_litellm(conversation: dict, model: str, judge_id: str) -> dict`
- `_make_error_result(conversation_id: str, model: str, judge_id: str, error: str) -> dict`

---

### 8. **confidence.py** (Lines 468-665 from llm_judge.py)
Confidence scoring and calibration logic.

**Functions:**
- `calculate_evidence_score(pattern: dict) -> float`
- `calculate_severity_score(severity: int) -> float`
- `calculate_reasoning_score(reasoning: str, severity: int) -> float`
- `calculate_confidence_alignment(conf1: float, conf2: float) -> float`
- `boost_confidence_on_agreement(pattern1: dict, pattern2: dict, similarity: float) -> tuple`

---

### 9. **agreement.py** (Lines 669-835 from llm_judge.py)
Pattern matching and agreement calculation.

**Functions:**
- `calculate_pattern_similarity(labels1: dict, labels2: dict) -> float`
- `match_patterns(patterns1: list, patterns2: list, threshold: float) -> list`
- `calculate_agreement_metrics(matches: list) -> dict`

---

### 10. **aggregation.py** (Lines 840-1098 from llm_judge.py)
Multi-judge aggregation logic.

**Functions:**
- `extract_patterns_from_result(result: dict) -> list`
- `find_pattern_cluster(pattern: dict, all_patterns: list, used_indices: set, threshold: float) -> list`
- `aggregate_pattern_cluster(patterns: list, similarities: list) -> dict`
- `aggregate_n_evaluations(results: list) -> dict`
- `aggregate_evaluations(result1: dict, result2: dict) -> dict` (backward compat)
- `_build_empty_aggregation(results: list, conv_id: str) -> dict`

---

### 11. **pipeline.py** (Lines 1104-1188 from llm_judge.py)
Pipeline orchestration for running multi-judge analysis.

**Functions:**
- `analyze_conversation(filepath: Path, judges: list) -> dict` (async)
- `run_pipeline(input_pattern: str, limit: int, judges: list) -> list` (async)

---

### 12. **summary.py** (Lines 1191-1281 from llm_judge.py)
Summary generation and reporting.

**Functions:**
- `build_summary(results: list, judges: list) -> dict`
- `print_summary(summary: dict) -> None`

---

### 13. **cli.py** (Lines 1288-1366 from llm_judge.py)
Command-line interface for the evaluation pipeline.

**Functions:**
- `main()` - CLI entry point with argparse

---

### 14. **llm_judge.py** (Original monolithic file)
Original file kept for backward compatibility. Will be deprecated once all code is verified to work with the modular structure.

---

## Dependency Graph

```
cli.py
└─> pipeline.py
    ├─> judges.py
    │   ├─> prompts.py
    │   │   └─> taxonomy.py
    │   ├─> formatters.py
    │   │   └─> config.py
    │   └─> config.py
    ├─> aggregation.py
    │   ├─> agreement.py
    │   │   └─> config.py
    │   └─> confidence.py
    │       └─> config.py
    └─> summary.py
        └─> config.py
```

## Migration Status

✅ **Completed Modules:**
1. config.py - Configuration and constants
2. taxonomy.py - Taxonomy definitions
3. prompts.py - Judge prompts
4. formatters.py - Conversation formatting
5. models.py - Type definitions
6. judges.py - Judge execution
7. confidence.py - Confidence scoring
8. agreement.py - Pattern matching
9. aggregation.py - Multi-judge aggregation
10. summary.py - Summary generation
11. pipeline.py - Pipeline orchestration
12. cli.py - Command-line interface
13. __init__.py - Package initialization
14. README.md - Package documentation

## Usage After Refactor

### As a Module
```python
from evaluations import run_pipeline, analyze_conversation

# Run pipeline
results = await run_pipeline("conversations/*.json", judges=["sonnet", "haiku"])

# Analyze single conversation
result = await analyze_conversation(Path("conv.json"), judges=["sonnet"])
```

### As a CLI
```bash
# Run with all judges
python -m evaluations.cli -i "conversations/*.json"

# Run with specific judges
python -m evaluations.cli -i "conversations/*.json" --judges sonnet haiku

# Process single file
python -m evaluations.cli -s conversation.json
```

## Testing

To verify the refactor:
1. Run the CLI with test data
2. Compare outputs with original llm_judge.py
3. Verify all functions are accessible via __init__.py
4. Check that imports work correctly across modules

## Next Steps

1. Test the modular structure with real data
2. Update any external code that imports from llm_judge.py
3. Deprecate llm_judge.py once migration is complete
4. Add unit tests for each module
