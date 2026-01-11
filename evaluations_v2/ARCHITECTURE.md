# Evaluations v2 - Architecture Overview

## Module Dependency Graph

```
┌─────────────────────────────────────────────────────────────┐
│                         CLI Layer                            │
│  ┌──────────┐  ┌───────────┐                                │
│  │  cli.py  │──│__main__.py│                                │
│  └────┬─────┘  └───────────┘                                │
└───────┼──────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│                     Orchestration Layer                      │
│  ┌──────────────┐                                            │
│  │ pipeline.py  │  (Coordinates the entire workflow)         │
│  └──────┬───────┘                                            │
└─────────┼────────────────────────────────────────────────────┘
          │
          ├────────────────┬────────────────┬──────────────┐
          ▼                ▼                ▼              ▼
┌──────────────┐  ┌──────────────┐  ┌──────────┐  ┌──────────┐
│  judges.py   │  │aggregation.py│  │summary.py│  │config.py │
│              │  │              │  │          │  │          │
│ - Run judges │  │ - Combine    │  │ - Stats  │  │ - Models │
│ - API calls  │  │   results    │  │ - Report │  │ - Paths  │
│ - Parse JSON │  │ - Metadata   │  │ - Print  │  │ - Weights│
└──────┬───────┘  └──────┬───────┘  └──────────┘  └──────────┘
       │                 │
       │                 ├────────────┬─────────────┐
       ▼                 ▼            ▼             ▼
┌──────────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│ prompts.py   │  │agreement │  │confidence│  │formatters│
│              │  │   .py    │  │   .py    │  │   .py    │
│ - System     │  │          │  │          │  │          │
│   prompt     │  │ - Pattern│  │ - Multi  │  │ - Format │
│ - User       │  │   match  │  │   factor │  │   convos │
│   prompt     │  │ - Metrics│  │ - Evidence│ │ - Extract│
│ - Optimized  │  │ - Weights│  │ - Align  │  │   meta   │
└──────┬───────┘  └──────────┘  └──────────┘  └──────────┘
       │
       ▼
┌──────────────┐
│ taxonomy.py  │
│              │
│ - Definitions│
│ - Helpers    │
│ - Validation │
└──────────────┘
```

## Data Flow

```
Input: conversation.json
         │
         ▼
    ┌─────────────┐
    │ formatters  │  Format for judge
    └──────┬──────┘
           │
           ▼
    ┌─────────────┐
    │   prompts   │  Build prompts
    └──────┬──────┘
           │
           ├──────────────┐
           ▼              ▼
    ┌──────────┐   ┌──────────┐
    │ Judge 1  │   │ Judge 2  │  Run in parallel
    └────┬─────┘   └─────┬────┘
         │               │
         └───────┬───────┘
                 ▼
          ┌─────────────┐
          │  agreement  │  Match patterns
          └──────┬──────┘
                 │
                 ▼
          ┌─────────────┐
          │ confidence  │  Calculate scores
          └──────┬──────┘
                 │
                 ▼
          ┌─────────────┐
          │ aggregation │  Combine results
          └──────┬──────┘
                 │
                 ▼
          ┌─────────────┐
          │   summary   │  Generate stats
          └──────┬──────┘
                 │
                 ▼
         Output: judgment.json
```

## Module Responsibilities

### Core Modules

| Module | Lines | Purpose | Key Functions |
|--------|-------|---------|---------------|
| **config.py** | ~70 | Configuration | Models, weights, thresholds |
| **taxonomy.py** | ~120 | Taxonomy | Definitions, validation |
| **models.py** | ~170 | Data structures | Dataclasses, converters |

### Processing Modules

| Module | Lines | Purpose | Key Functions |
|--------|-------|---------|---------------|
| **formatters.py** | ~140 | Formatting | `format_conversation_for_judge()` |
| **prompts.py** | ~180 | Prompts | `build_judge_system_prompt()` |
| **judges.py** | ~150 | Evaluation | `judge_with_model()` |

### Analysis Modules

| Module | Lines | Purpose | Key Functions |
|--------|-------|---------|---------------|
| **confidence.py** | ~260 | Confidence | `calculate_final_confidence()` |
| **agreement.py** | ~210 | Matching | `find_best_pattern_matches()` |
| **aggregation.py** | ~180 | Combining | `aggregate_evaluations()` |
| **summary.py** | ~160 | Reporting | `build_summary()`, `print_summary()` |

### Interface Modules

| Module | Lines | Purpose | Key Functions |
|--------|-------|---------|---------------|
| **pipeline.py** | ~90 | Orchestration | `run_pipeline()`, `analyze_conversation()` |
| **cli.py** | ~60 | CLI | `main()` |

## Import Patterns

### Minimal Import (Use specific function)
```python
from evaluations_v2.confidence import calculate_evidence_score

score = calculate_evidence_score(pattern)
```

### Module Import (Use multiple functions)
```python
from evaluations_v2 import agreement

similarity = agreement.calculate_pattern_similarity(l1, l2)
matches = agreement.find_best_pattern_matches(p1, p2)
```

### Package Import (Use main API)
```python
from evaluations_v2.pipeline import run_pipeline

results = await run_pipeline("output/**/*.json")
```

## Configuration Flow

```
config.py
   │
   ├─→ judges.py       (JUDGE_MODEL_1, JUDGE_MODEL_2)
   ├─→ agreement.py    (AXIS_WEIGHTS, PARTIAL_MATCH_THRESHOLD)
   ├─→ confidence.py   (Evidence/alignment parameters)
   ├─→ formatters.py   (MAX_REASONING_LENGTH)
   └─→ pipeline.py     (OUTPUT_DIR)
```

## Prompt Construction

```
prompts.py
   │
   ├─→ build_judge_system_prompt()
   │      │
   │      ├─→ taxonomy.py (TARGET_DESCRIPTIONS)
   │      ├─→ taxonomy.py (HOW_DESCRIPTIONS)
   │      └─→ taxonomy.py (WHY_DESCRIPTIONS)
   │
   └─→ build_analysis_prompt()
          │
          └─→ formatters.py (formatted_conversation)
```

## Confidence Calculation Pipeline

```
confidence.py
   │
   └─→ calculate_final_confidence()
          │
          ├─→ _calculate_base_confidence()
          │      └─→ Average judge confidences
          │
          ├─→ _calculate_agreement_factor()
          │      └─→ Exact/partial/single judge
          │
          ├─→ _calculate_evidence_factor()
          │      └─→ calculate_evidence_score()
          │             ├─→ _calculate_cot_bonus()
          │             └─→ _calculate_short_quote_penalty()
          │
          └─→ _calculate_calibration_factor()
                 ├─→ calculate_confidence_alignment()
                 └─→ calculate_severity_alignment()
```

## Pattern Matching Flow

```
agreement.py
   │
   └─→ find_best_pattern_matches()
          │
          ├─→ For each pattern in judge 1:
          │      └─→ calculate_pattern_similarity()
          │             └─→ Use AXIS_WEIGHTS
          │
          ├─→ Greedy matching (best similarity)
          │
          └─→ Add unmatched patterns
                 │
                 └─→ calculate_agreement_metrics()
                        └─→ Classify agreement type
```

## Error Handling Strategy

```
Try/Catch Hierarchy:
   │
   ├─→ pipeline.py
   │      └─→ Catches file-level errors
   │
   ├─→ judges.py
   │      └─→ Catches API errors
   │             └─→ Returns error result structure
   │
   └─→ Individual modules
          └─→ Validate inputs, return defaults
```

## Testing Strategy

```
Unit Tests (per module):
   ├─→ config.py       (Validate constants)
   ├─→ taxonomy.py     (Validate structure)
   ├─→ formatters.py   (Format correctness)
   ├─→ confidence.py   (Score calculations)
   └─→ agreement.py    (Pattern matching)

Integration Tests:
   ├─→ judges.py       (API mocking)
   ├─→ aggregation.py  (End-to-end flow)
   └─→ pipeline.py     (Full pipeline)

End-to-End Tests:
   └─→ cli.py          (Command-line interface)
```

## Extension Points

### Add New Taxonomy Code
1. Edit `taxonomy.py` → Add to TAXONOMY dict
2. Edit `prompts.py` → Add description
3. No other changes needed!

### Add New Confidence Factor
1. Edit `confidence.py` → Add calculation function
2. Update `calculate_final_confidence()` → Include new factor
3. Update `config.py` → Add tuning parameters

### Add New Judge
1. Edit `config.py` → Add JUDGE_MODEL_3
2. Edit `pipeline.py` → Add to asyncio.gather()
3. Edit `aggregation.py` → Handle 3-way matching

### Add New Output Format
1. Create `exporters.py` module
2. Implement format converters
3. Call from `pipeline.py` after aggregation

## Performance Characteristics

| Operation | Complexity | Notes |
|-----------|-----------|-------|
| Format conversation | O(n) | n = number of turns |
| Judge API call | O(1) | Async, parallel |
| Pattern matching | O(n²) | n = patterns per judge |
| Confidence calc | O(1) | Per pattern |
| Aggregation | O(n) | n = total patterns |
| Summary | O(n) | n = conversations |

## Memory Usage

```
Per Conversation:
   ├─→ Input JSON: ~10-50 KB
   ├─→ Formatted text: ~20-100 KB
   ├─→ Judge results: ~5-20 KB each
   └─→ Aggregated: ~15-40 KB

Total for 100 conversations: ~5-20 MB
```

## Best Practices

### When to Use Each Module

| Task | Use Module | Example |
|------|-----------|---------|
| Change settings | `config.py` | Adjust weights |
| Modify prompts | `prompts.py` | Add detection criteria |
| Add validation | `taxonomy.py` | Validate new codes |
| Format data | `formatters.py` | Custom formatting |
| Calculate scores | `confidence.py` | New scoring logic |
| Match patterns | `agreement.py` | Custom matching |
| Combine results | `aggregation.py` | Multi-judge logic |
| Generate reports | `summary.py` | Custom statistics |
| Orchestrate | `pipeline.py` | Workflow changes |

### Code Organization Rules

1. **Single Responsibility**: Each module does one thing
2. **Clear Dependencies**: Import only what you need
3. **Type Hints**: All public functions typed
4. **Docstrings**: All public functions documented
5. **Error Handling**: Graceful degradation
6. **Configuration**: Centralized in config.py
7. **Testing**: Each module testable independently

## Summary

**Total Lines of Code**: ~1,800 (vs 973 in v1)
- More code, but **much better organized**
- Each module is **small and focused**
- **Easy to understand** and modify
- **Highly reusable** components
- **Well documented** throughout

**Key Achievement**: Transformed monolithic file into **professional, maintainable architecture** while preserving 100% of functionality.
