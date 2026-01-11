# Prompt Modes: Zero-Shot vs Few-Shot

## Overview

ThoughtGuards LLM judges now support two prompt modes:

1. **Zero-Shot**: Taxonomy definitions only (no examples)
2. **Few-Shot**: Taxonomy definitions + 6 detailed examples

## Usage

### Via Command Line

```bash
# Use zero-shot prompts (no examples)
python -m evaluations.cli --input "conversations/*.json" --zero-shot

# Use few-shot prompts (with examples) - default
python -m evaluations.cli --input "conversations/*.json" --few-shot

# Default behavior (currently zero-shot, configurable in config.py)
python -m evaluations.cli --input "conversations/*.json"
```

### Via Configuration

Edit `evaluations/config.py`:

```python
# Set to True for zero-shot, False for few-shot
ZERO_SHOT = True  # or False
```

### Combined with Multi-Agent

```bash
# Multi-agent with zero-shot prompts
python -m evaluations.cli --input "conversations/*.json" --multi-agent --zero-shot

# Multi-agent with few-shot prompts
python -m evaluations.cli --input "conversations/*.json" --multi-agent --few-shot
```

## What's the Difference?

### Zero-Shot Prompt

Contains:
- ✅ Full taxonomy definitions (TARGET, HOW, WHY)
- ✅ Detection guidelines
- ✅ Output format specification
- ❌ No examples

**Size**: ~800 tokens

**Use when:**
- Testing model's base understanding
- Reducing prompt length/cost
- Evaluating generalization ability
- Running ablation studies

### Few-Shot Prompt

Contains everything from zero-shot PLUS:
- ✅ Example 1: Clean conversation (no manipulation)
- ✅ Example 2: Misrepresentation (T1|H1|W3)
- ✅ Example 3: Evaluation awareness (T2|H3|W1)
- ✅ Example 4: Sycophancy (T3|H4|W2)
- ✅ Example 5: Sandbagging (T2|H2|W4)
- ✅ Example 6: Borderline case (clean despite edge indicators)

**Size**: ~3,000 tokens

**Use when:**
- Maximum detection accuracy desired
- Teaching model the expected output format
- Demonstrating subtle distinctions
- Production deployment

## Implementation Details

### Prompt Selection Flow

```
User runs CLI with --zero-shot or --few-shot
         ↓
CLI sets config.ZERO_SHOT = True/False
         ↓
Judge functions call get_judge_system_prompt(use_examples=not ZERO_SHOT)
         ↓
Returns JUDGE_SYSTEM_PROMPT_ZEROSHOT or JUDGE_SYSTEM_PROMPT_FEWSHOT
         ↓
Prompt sent to LLM
```

### Code Structure

**prompts.py:**
- `JUDGE_SYSTEM_PROMPT_ZEROSHOT` - Zero-shot prompt
- `JUDGE_SYSTEM_PROMPT_FEWSHOT` - Few-shot prompt with examples
- `get_judge_system_prompt(use_examples)` - Returns appropriate prompt

**config.py:**
- `ZERO_SHOT` - Global config flag (default: True)

**judges.py:**
- All judge functions check ZERO_SHOT config
- Use `get_judge_system_prompt(use_examples=not ZERO_SHOT)`

**cli.py:**
- `--zero-shot` argument sets ZERO_SHOT = True
- `--few-shot` argument sets ZERO_SHOT = False

## Multi-Agent Integration

When using `--multi-agent`, the specialized HOW agents inherit the zero-shot/few-shot setting:

```python
# In multi_agent_how.py
base_system_prompt = get_judge_system_prompt(use_examples=not ZERO_SHOT)

specialized_system_prompt = f"""{base_system_prompt}

---

## SPECIALIZED ROLE FOR THIS ANALYSIS

You are now acting as a **{how_config['name']}**.

{how_config['prompt']}
"""
```

Each specialized agent gets:
- Base prompt (zero-shot OR few-shot, depending on config)
- PLUS their specialized HOW instructions

## Examples

### Example 1: Compare Zero-Shot vs Few-Shot

```bash
# Run same conversation with zero-shot
python -m evaluations.cli --single conversation.json --zero-shot > zero_result.json

# Run same conversation with few-shot
python -m evaluations.cli --single conversation.json --few-shot > few_result.json

# Compare results
diff zero_result.json few_result.json
```

### Example 2: Multi-Agent with Different Prompts

```bash
# Multi-agent with zero-shot (test generalization)
python -m evaluations.cli --input "conversations/*.json" --multi-agent --zero-shot

# Multi-agent with few-shot (maximum accuracy)
python -m evaluations.cli --input "conversations/*.json" --multi-agent --few-shot
```

### Example 3: Batch Comparison

```bash
# Process batch with zero-shot
python -m evaluations.cli --input "test_set/*.json" --zero-shot --limit 10

# Process same batch with few-shot
python -m evaluations.cli --input "test_set/*.json" --few-shot --limit 10

# Compare summaries in judge_results/
```

## Research Use Cases

### Ablation Study: Effect of Examples

Research question: "How much do the examples improve detection accuracy?"

```bash
# Ground truth dataset
DATASET="labeled_conversations/*.json"

# Run zero-shot
python -m evaluations.cli --input "$DATASET" --zero-shot --judges sonnet

# Run few-shot
python -m evaluations.cli --input "$DATASET" --few-shot --judges sonnet

# Compare against ground truth labels
# Calculate: precision, recall, F1 for each mode
```

### Model Comparison: Generalization Ability

Research question: "Which models generalize better without examples?"

```bash
# Test all judges with zero-shot
python -m evaluations.cli --input "test_set/*.json" --zero-shot

# Test all judges with few-shot
python -m evaluations.cli --input "test_set/*.json" --few-shot

# Compare per-model performance degradation from few-shot to zero-shot
```

### Multi-Agent Specialization: Example Dependency

Research question: "Do specialized agents benefit more or less from examples?"

```bash
# Multi-agent zero-shot
python -m evaluations.cli --input "test_set/*.json" --multi-agent --zero-shot

# Multi-agent few-shot
python -m evaluations.cli --input "test_set/*.json" --multi-agent --few-shot

# Analyze: Do H1-H6 specialists show different example dependency?
```

## Performance Considerations

### Token Usage

| Mode | Prompt Tokens | Input Tokens (avg) | Total |
|------|---------------|-------------------|-------|
| Zero-shot | ~800 | ~1,500 | ~2,300 |
| Few-shot | ~3,000 | ~1,500 | ~4,500 |

**Cost difference**: Few-shot uses ~2x input tokens

### Latency

- Zero-shot: Slightly faster (less tokens to process)
- Few-shot: Slightly slower (more tokens to process)
- Difference: ~10-20% in practice

### Accuracy

Expected performance (based on typical few-shot learning gains):
- Few-shot: Higher precision, higher recall
- Zero-shot: May have more false positives or false negatives
- Difference: Varies by model (stronger models show less degradation)

## Recommendations

### For Production
✅ Use **few-shot** mode
- Better accuracy
- More consistent outputs
- Worth the token cost

### For Research/Testing
✅ Use **zero-shot** mode for:
- Ablation studies
- Model capability assessment
- Cost-sensitive applications

✅ Use **few-shot** mode for:
- Final evaluations
- Benchmark comparisons
- Publication results

### For Multi-Agent
✅ Use **few-shot** mode
- Specialists benefit from seeing example patterns
- Shows how to combine specialized focus with full triad output

## Future Enhancements

Potential improvements:
- [ ] Per-judge prompt mode (mix zero-shot and few-shot judges)
- [ ] Dynamic example selection based on conversation type
- [ ] Custom example sets for specific domains
- [ ] Example difficulty progression (easy → hard)
- [ ] Confidence-weighted example weighting

## Files Modified

- `prompts.py` - Added ZEROSHOT/FEWSHOT prompts, get_judge_system_prompt()
- `config.py` - Added ZERO_SHOT config flag
- `judges.py` - Updated all judge functions to use get_judge_system_prompt()
- `cli.py` - Added --zero-shot and --few-shot arguments
- `multi_agent_how.py` - Updated to respect ZERO_SHOT config

## References

- Main prompts: `evaluations/prompts.py`
- Config: `evaluations/config.py`
- CLI: `evaluations/cli.py`
- Multi-agent: `evaluations/multi_agent_how.py`