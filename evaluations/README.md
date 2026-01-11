# ThoughtGuards Evaluation Modules

Modular evaluation system for detecting manipulation patterns in AI conversations.

## Module Structure

### Core Configuration
- **config.py** - Configuration constants and settings
  - `AVAILABLE_JUDGES` - Available judge configurations
  - `DEFAULT_JUDGES` - Default judges to use
  - `AXIS_WEIGHTS` - Weights for pattern similarity calculation
  - `PARTIAL_MATCH_THRESHOLD` - Threshold for partial matches
  - `OUTPUT_DIR` - Output directory for results

### Taxonomy & Prompts
- **taxonomy.py** - Taxonomy definitions
  - `TAXONOMY` - WHY-HOW-TARGET taxonomy structure

- **prompts.py** - Judge prompts and templates
  - `JUDGE_SYSTEM_PROMPT` - System prompt for judges
  - `build_analysis_prompt()` - Build analysis prompt

### Data Formatting
- **formatters.py** - Conversation formatting utilities
  - `format_conversation_for_judge()` - Format conversations for judge analysis
  - `extract_conversation_metadata()` - Extract metadata from conversations

- **models.py** - Type definitions and data models
  - Judge result types and schemas

### Judge Execution
- **judges.py** - Judge execution logic
  - `run_judge()` - Main entry point for running a judge
  - `judge_with_anthropic()` - Execute judge using Anthropic API
  - `judge_with_litellm()` - Execute judge using LiteLLM API

### Agreement & Confidence
- **agreement.py** - Pattern matching and agreement calculation
  - `calculate_pattern_similarity()` - Calculate similarity between patterns
  - `match_patterns()` - Match patterns across judges
  - `calculate_agreement_metrics()` - Calculate agreement metrics

- **confidence.py** - Confidence scoring logic
  - `calculate_evidence_score()` - Score pattern evidence quality
  - `calculate_confidence_alignment()` - Calculate confidence alignment
  - `boost_confidence_on_agreement()` - Boost confidence based on agreement

### Aggregation
- **aggregation.py** - Multi-judge aggregation logic
  - `extract_patterns_from_result()` - Extract patterns from judge results
  - `find_pattern_cluster()` - Find matching pattern clusters
  - `aggregate_pattern_cluster()` - Aggregate a cluster of patterns
  - `aggregate_n_evaluations()` - Aggregate results from N judges
  - `aggregate_evaluations()` - Backward compatible 2-judge aggregation

### Summary & Reporting
- **summary.py** - Summary generation
  - `build_summary()` - Build summary statistics from results
  - `print_summary()` - Print summary to console

### Pipeline Orchestration
- **pipeline.py** - Pipeline orchestration
  - `analyze_conversation()` - Analyze a single conversation file
  - `run_pipeline()` - Run pipeline on multiple conversations

### Command-Line Interface
- **cli.py** - CLI interface
  - `main()` - Main CLI entry point
  - Argument parsing and command execution

## Data Flow

```
1. CLI (cli.py)
   └─> Parse arguments

2. Pipeline (pipeline.py)
   └─> Load conversation files
   └─> For each conversation:

3. Judge Execution (judges.py)
   └─> Format conversation (formatters.py)
   └─> Run each judge in parallel
   └─> Return individual results

4. Aggregation (aggregation.py)
   └─> Extract patterns from all judges
   └─> Calculate pattern similarity (agreement.py)
   └─> Cluster matching patterns
   └─> Aggregate clusters with confidence scoring (confidence.py)
   └─> Return aggregated result

5. Summary (summary.py)
   └─> Collect statistics across all conversations
   └─> Print summary report
   └─> Save results to OUTPUT_DIR
```

## Usage

### As a Python Module
```python
from evaluations import run_pipeline

# Run pipeline with default judges
await run_pipeline("conversations/*.json")

# Run with specific judges
await run_pipeline("conversations/*.json", judges=["sonnet", "haiku"])
```

### As a CLI Tool
```bash
# Use all judges (default)
python -m evaluations.cli -i "conversations/*.json"

# Use specific judges
python -m evaluations.cli -i "conversations/*.json" --judges sonnet haiku

# Process single file
python -m evaluations.cli -s conversation.json

# List available judges
python -m evaluations.cli --list-judges
```

## Key Concepts

### Pattern Similarity
Patterns are compared using weighted similarity across three axes:
- **HOW** (50% weight) - Observable action taken
- **TARGET** (30% weight) - What is being affected
- **WHY** (20% weight) - What signal is being optimized

### Agreement Types
- **full** - All judges fully agree
- **strong** - High agreement (>80%)
- **partial** - Moderate agreement (50-80%)
- **weak** - Low agreement (<50%)
- **none** - No agreement
- **both_clean** - All judges found no manipulation

### Confidence Boosting
Pattern confidence is adjusted based on:
1. **Agreement factor** - More judges agreeing = higher confidence
2. **Similarity factor** - Higher pattern similarity = higher confidence
3. **Evidence factor** - Better evidence (quotes) = higher confidence
4. **Calibration factor** - Aligned judge confidences = higher confidence

## Output Format

### Individual Results
Saved as `{conversation_id}_judgment.json`:
```json
{
  "conversation_id": "conv_001",
  "manipulation_evaluations": [{
    "evaluator_id": "llm-judge-aggregated",
    "model_name": "sonnet+haiku+mistral+compassj",
    "patterns": [...]
  }],
  "_meta": {
    "n_judges": 4,
    "agreement_type": "strong",
    "agreement_rate": 0.85,
    "total_tokens": 12000
  },
  "_source": {
    "file": "conversation.json",
    "chatbot_mode": "metric_gamer"
  }
}
```

### Summary Report
Saved as `summary_YYYYMMDD_HHMMSS.json`:
```json
{
  "run_timestamp": "2026-01-10T23:52:00",
  "total_conversations": 10,
  "judges_used": ["sonnet", "haiku", "mistral", "compassj"],
  "agreement_distribution": {
    "full": 2,
    "strong": 5,
    "partial": 2,
    "weak": 1
  },
  "pattern_counts_by_axis": {...},
  "triad_pattern_counts": {...}
}
```

## Dependencies

- `anthropic` - Anthropic API client
- `openai` - OpenAI/LiteLLM API client
- `python-dotenv` - Environment variable management
- `asyncio` - Async execution

## Environment Variables

Required:
- `ANTHROPIC_API_KEY` - For Claude judges
- `LITELLM_BASE_URL` - LiteLLM proxy endpoint
- `LITELLM_API_KEY` - LiteLLM API key
