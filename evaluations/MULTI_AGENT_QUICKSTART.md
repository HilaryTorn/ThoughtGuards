# Multi-Agent HOW Assessment - Quick Start

## What Is It?

Instead of having one judge look at all 6 HOW dimensions, we use **6 specialized judges** from the same model - each an expert in one HOW dimension.

## Quick Commands

```bash
# Test with single file
python -m evaluations.cli --single conversation.json --multi-agent

# Process batch with multi-agent (default: sonnet)
python -m evaluations.cli --input "conversations/*.json" --multi-agent

# Use different model for multi-agent
python -m evaluations.cli --input "conversations/*.json" --multi-agent --multi-agent-model haiku

# Test the implementation
python evaluations/test_multi_agent.py
```

## Available Models for Multi-Agent

Any judge can be used as the base model:
- `sonnet` - Claude Sonnet 4 (default, recommended)
- `haiku` - Claude Haiku 4.5
- `mistral` - Mistral Nemo
- `compassj` - CompassJ 7B
- `gemini-flash` - Gemini 3 Flash

## How It Works

```
                    Conversation
                         |
        +----------------+----------------+
        |                                |
    6 Specialized Agents (Same Model)   |
        |                                |
    +-------+-------+-------+-------+-------+-------+
    |  H1   |  H2   |  H3   |  H4   |  H5   |  H6   |
    | Misrep|Sandbag|Eval   |Influ  |Omit   |Miscal |
    +-------+-------+-------+-------+-------+-------+
        |       |       |       |       |       |
        +-------+-------+-------+-------+-------+
                         |
                   Aggregation
                         |
                   Final Result
```

## The 6 Specialists

| Code | Specialist | Detects |
|------|-----------|---------|
| H1 | Misrepresentation | False claims, fabricated results |
| H2 | Capability Suppression | Sandbagging, hiding ability |
| H3 | Oversight Awareness | Evaluation detection, test awareness |
| H4 | Influence Tactics | Pressure, urgency, flattery |
| H5 | Omission/Obfuscation | Hidden info, withheld risks |
| H6 | Miscalibration | Overconfidence, spurious precision |

## Example Output

```json
{
  "conversation_id": "conv_001",
  "manipulation_evaluations": [{
    "patterns": [
      {
        "triad_pattern_id": "T1|H1|W3",
        "labels": {"TARGET": "T1", "HOW": "H1", "WHY": "W3"},
        "confidence": 0.95,
        "_detected_by": ["sonnet-H1", "sonnet-H5"]
      }
    ]
  }],
  "_meta": {
    "multi_agent_how": true,
    "model": "claude-sonnet-4-20250514",
    "num_agents": 6,
    "agreement_type": "majority"
  }
}
```

## Key Differences from Standard Mode

| Feature | Standard Mode | Multi-Agent HOW |
|---------|--------------|-----------------|
| Models | 5 different models | 1 model, 6 specialists |
| Focus | General taxonomy | HOW-specific |
| Validation | Cross-model | Within-model |
| Best for | Model robustness | Fine-grained HOW detection |

## When to Use Multi-Agent

✅ **Use Multi-Agent when:**
- You want detailed HOW mechanism analysis
- You're studying specific manipulation techniques
- You need focused detection per HOW dimension
- You want to know which HOW patterns are most salient

❌ **Use Standard Mode when:**
- You want cross-model validation
- You're testing model robustness
- You care about inter-model agreement

## Files Added

- `multi_agent_how.py` - Core multi-agent implementation
- `pipeline_multi_agent.py` - Batch processing pipeline
- `MULTI_AGENT_HOW.md` - Full documentation
- `test_multi_agent.py` - Test script

## Files Modified

- `judges.py` - Added custom prompt support
- `cli.py` - Added `--multi-agent` argument

## Next Steps

1. Test with single file: `python evaluations/test_multi_agent.py`
2. Try on real data: `python -m evaluations.cli --input "your_files/*.json" --multi-agent --limit 5`
3. Compare results: Run same files with and without `--multi-agent` flag
4. Analyze HOW patterns: Check which specialists detected what

## Troubleshooting

**Issue:** ImportError
**Fix:** Make sure you're in the root directory: `cd ThoughtGuards`

**Issue:** API key errors
**Fix:** Check `.env` file has `ANTHROPIC_API_KEY` (for sonnet/haiku)

**Issue:** No patterns detected
**Fix:** This might be correct! Try a conversation with known manipulation.

## Questions?

See `MULTI_AGENT_HOW.md` for detailed documentation.