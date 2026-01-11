# How to Run the Evaluations Package

## Quick Start

### Option 1: Run as a Python module (Recommended)

```bash
# Navigate to the project root
cd c:\Alignment\Hackathon\ThoughtGuards

# Run with all default judges on conversations from cot-generator
python -m evaluations.cli -i "../cot-generator/output/**/*.json"

# Or use a shorter command with specific judges
python -m evaluations.cli --judges sonnet haiku -i "../cot-generator/output/**/*.json"
```

### Option 2: Run directly with Python

```bash
cd c:\Alignment\Hackathon\ThoughtGuards\evaluations

# List available judges
python cli.py --list-judges

# Run on a single file
python cli.py -s path/to/conversation.json

# Run on multiple files
python cli.py -i "path/to/conversations/*.json"

# Use specific judges only
python cli.py --judges sonnet haiku -i "path/to/conversations/*.json"

# Limit number of files (for testing)
python cli.py -i "path/to/conversations/*.json" -n 5
```

### Option 3: Use the original llm_judge.py (still works)

```bash
cd c:\Alignment\Hackathon\ThoughtGuards\evaluations

# Run with original monolithic file
python llm_judge.py -i "../cot-generator/output/**/*.json"

# Or use specific judges
python llm_judge.py --judges sonnet haiku -i "../cot-generator/output/**/*.json"
```

## Prerequisites

### 1. Install Dependencies

Make sure you have the required Python packages:

```bash
pip install anthropic openai python-dotenv
```

### 2. Configure API Keys

Your `.env` file in the `evaluations` folder should contain:

```bash
# Anthropic API (for Claude judges)
ANTHROPIC_API_KEY=your_anthropic_key_here

# LiteLLM endpoint (for Mistral/CompassJ judges)
LITELLM_BASE_URL=http://158.101.122.84:4204/v1
LITELLM_API_KEY=your_litellm_key_here
```

Check your current `.env` file:
```bash
cat evaluations/.env
```

## Command-Line Options

### Available Arguments

```
--input, -i       Glob pattern for input files (default: "../cot-generator/output/**/*.json")
--single, -s      Process a single file
--judges, -j      Specific judges to use (default: all 4)
--limit, -n       Limit number of files to process
--list-judges     List available judges and exit
```

### Available Judges

- **sonnet** - Claude Sonnet 4 (Anthropic) - Most capable
- **haiku** - Claude Haiku 4.5 (Anthropic) - Fast and efficient
- **mistral** - Mistral Nemo (LiteLLM) - Open source
- **compassj** - CompassJ 7B (LiteLLM) - Judge-specific model

## Example Commands

### 1. Test with a Single File

```bash
cd evaluations
python -m cli -s path/to/test_conversation.json
```

### 2. Process All Conversations from cot-generator

```bash
cd evaluations
python -m cli -i "../cot-generator/output/**/*.json"
```

### 3. Quick Test (5 files, 2 judges)

```bash
cd evaluations
python -m cli --judges sonnet haiku -i "../cot-generator/output/**/*.json" -n 5
```

### 4. Use Only Anthropic Judges (no LiteLLM required)

```bash
cd evaluations
python -m cli --judges sonnet haiku -i "../cot-generator/output/**/*.json"
```

### 5. Use Only LiteLLM Judges (no Anthropic API required)

```bash
cd evaluations
python -m cli --judges mistral compassj -i "../cot-generator/output/**/*.json"
```

### 6. Process Specific Conversation Types

```bash
# Only adversarial conversations
cd evaluations
python -m cli -i "../cot-generator/output/adv_*.json"

# Only metric gamer conversations
cd evaluations
python -m cli -i "../cot-generator/output/*metric_gamer*.json"
```

## Output

### Where Results are Saved

All results are saved to `evaluations/judge_results/`:

```
evaluations/judge_results/
├── adv_00001_metric_gamer_judgment.json
├── adv_00002_sycophant_judgment.json
├── ...
└── summary_20260111_001234.json
```

### Output Format

**Individual judgment file:**
```json
{
  "conversation_id": "adv_00001",
  "manipulation_evaluations": [
    {
      "evaluator_id": "llm-judge-aggregated",
      "model_name": "claude-sonnet-4+claude-haiku-4.5+mistral-nemo+compassj-7b",
      "patterns": [
        {
          "triad_pattern_id": "T2|H3|W1",
          "labels": {"TARGET": "T2", "HOW": "H3", "WHY": "W1"},
          "confidence": 0.85,
          "severity": 4,
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

**Summary file:**
```json
{
  "total_conversations": 50,
  "judges_used": ["sonnet", "haiku", "mistral", "compassj"],
  "conversations_with_patterns": 35,
  "agreement_distribution": {
    "full": 10,
    "strong": 20,
    "partial": 8
  },
  "pattern_counts_by_axis": {
    "TARGET": {"T1": 15, "T2": 30},
    "HOW": {"H1": 20, "H3": 25},
    "WHY": {"W1": 35, "W2": 10}
  }
}
```

## Programmatic Usage

You can also import and use the package in your own Python scripts:

```python
import asyncio
from pathlib import Path
from evaluations import run_pipeline, analyze_conversation

# Example 1: Run full pipeline
async def run_analysis():
    results = await run_pipeline(
        input_pattern="../cot-generator/output/**/*.json",
        judges=["sonnet", "haiku"],
        limit=10  # Optional: limit to 10 files
    )
    return results

# Example 2: Analyze single conversation
async def analyze_single():
    result = await analyze_conversation(
        filepath=Path("conversation.json"),
        judges=["sonnet"]
    )
    return result

# Run it
results = asyncio.run(run_analysis())
```

## Troubleshooting

### ModuleNotFoundError: No module named 'anthropic'

```bash
pip install anthropic openai python-dotenv
```

### API Key Not Found

Check your `.env` file:
```bash
cat evaluations/.env
```

Make sure it contains:
```
ANTHROPIC_API_KEY=sk-ant-...
```

### No Conversations Found

Check your input path:
```bash
# List available conversations
ls ../cot-generator/output/*.json

# Or use absolute path
python -m cli -i "C:/full/path/to/conversations/*.json"
```

### Import Errors

If you get import errors, make sure you're running from the correct directory:

```bash
# If running as module
cd c:\Alignment\Hackathon\ThoughtGuards
python -m evaluations.cli -i "conversations/*.json"

# If running directly
cd c:\Alignment\Hackathon\ThoughtGuards\evaluations
python cli.py -i "conversations/*.json"
```

## Performance Tips

1. **Use fewer judges for faster results:**
   ```bash
   python -m cli --judges sonnet -i "conversations/*.json"
   ```

2. **Test with limit first:**
   ```bash
   python -m cli -i "conversations/*.json" -n 5
   ```

3. **Use Haiku for speed:**
   ```bash
   python -m cli --judges haiku -i "conversations/*.json"
   ```

4. **Use Sonnet for accuracy:**
   ```bash
   python -m cli --judges sonnet -i "conversations/*.json"
   ```

## Next Steps

- View results in `evaluations/judge_results/`
- Check the summary file for overall statistics
- Import individual judgments into your analysis pipeline
- Compare with evaluations_v2 results for consistency

## Support

For questions or issues:
- Check [ARCHITECTURE.md](ARCHITECTURE.md) for module details
- Check [README.md](README.md) for package documentation
- Review [MODULE_STRUCTURE.md](MODULE_STRUCTURE.md) for code organization
