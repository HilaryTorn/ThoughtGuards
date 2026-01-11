# Quick Start Guide

## Step 1: Install Dependencies

```bash
cd evaluations
pip install -r requirements.txt
```

Or install manually:
```bash
pip install anthropic openai python-dotenv
```

## Step 2: Verify Your API Keys

Check that your `.env` file has the necessary keys:

```bash
cat .env
```

Should show:
```
ANTHROPIC_API_KEY=sk-ant-...
LITELLM_BASE_URL=http://158.101.122.84:4204/v1
LITELLM_API_KEY=...
```

## Step 3: Test with List Judges

```bash
python cli.py --list-judges
```

Expected output:
```
Available judges:
  sonnet       - Claude Sonnet 4 (Anthropic) (model: claude-sonnet-4-20250514, provider: anthropic)
  haiku        - Claude Haiku 4.5 (Anthropic) (model: claude-haiku-4-5-20251001, provider: anthropic)
  mistral      - Mistral Nemo (LiteLLM) (model: mistral-nemo, provider: litellm)
  compassj     - CompassJ 7B (Judge model) (model: compassj-7b, provider: litellm)
```

## Step 4: Run Your First Analysis

Test with a single file:
```bash
python cli.py -s "../mock_data/balanced_batch_20260102_202546/clean_00001_deepseek-reasoner.json"
```

Or test with limited files (just 2):
```bash
python cli.py -i "../mock_data/balanced_batch_20260102_202546/*.json" -n 2
```

## Step 5: View Results

Results are saved to `judge_results/`:
```bash
ls judge_results/
```

You should see:
- Individual judgment files: `*_judgment.json`
- Summary file: `summary_*.json`

## Common Issues

### Issue: `ModuleNotFoundError: No module named 'anthropic'`
**Solution:** Install dependencies
```bash
pip install anthropic openai python-dotenv
```

### Issue: `No conversations found`
**Solution:** Check the path to your conversation files
```bash
ls ../mock_data/balanced_batch_20260102_202546/*.json
```

### Issue: API key errors
**Solution:** Check your `.env` file
```bash
cat .env
# Make sure ANTHROPIC_API_KEY is set
```

### Issue: `Rate limit exceeded`
**Solution:** Use fewer judges or add delays
```bash
# Use only one judge to reduce API calls
python cli.py --judges sonnet -i "*.json" -n 2
```

## Quick Commands Reference

```bash
# List judges
python cli.py --list-judges

# Single file, one judge
python cli.py --judges sonnet -s "path/to/file.json"

# Multiple files, limit to 5
python cli.py -i "path/*.json" -n 5

# All files, all judges (default)
python cli.py -i "path/*.json"

# Only Anthropic judges (no LiteLLM needed)
python cli.py --judges sonnet haiku -i "path/*.json"
```

## Next Steps

1. ✅ Install dependencies
2. ✅ Verify API keys
3. ✅ Test with `--list-judges`
4. ✅ Run on 1-2 files first
5. ✅ Scale up to full dataset
6. ✅ Check results in `judge_results/`

For more details, see:
- [USAGE_GUIDE.md](USAGE_GUIDE.md) - Comprehensive usage guide
- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture
- [README.md](README.md) - Package documentation
