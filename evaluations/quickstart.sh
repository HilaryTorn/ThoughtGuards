#!/bin/bash
# Quick start script for testing evaluations restructuring

set -e  # Exit on error

echo "=================================="
echo "ThoughtGuards Evaluations Quick Start"
echo "=================================="
echo ""

# Check Python version
echo "1. Checking Python version..."
python --version || python3 --version

# Check if we're in the right directory
if [ ! -f "requirements.txt" ]; then
    echo "Error: Please run this script from the evaluations/ directory"
    exit 1
fi

# Install dependencies
echo ""
echo "2. Installing dependencies..."
pip install -r requirements.txt

# Check environment variables
echo ""
echo "3. Checking environment variables..."

if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "⚠  Warning: ANTHROPIC_API_KEY not set"
    echo "   Set it with: export ANTHROPIC_API_KEY='your_key'"
else
    echo "✓ ANTHROPIC_API_KEY is set"
fi

if [ -z "$LITELLM_API_KEY" ]; then
    echo "⚠  Warning: LITELLM_API_KEY not set"
    echo "   Set it with: export LITELLM_API_KEY='your_key'"
else
    echo "✓ LITELLM_API_KEY is set"
fi

# List available judges
echo ""
echo "4. Available judges:"
python -m evaluations.cli --list-judges

# Run a quick test
echo ""
echo "5. Running quick test (single file)..."
echo "   Finding test file..."

TEST_FILE=$(find ../mock_data -name "clean_*.json" -o -name "conv_*.json" | head -1)

if [ -z "$TEST_FILE" ]; then
    TEST_FILE=$(find ../mock_data -name "adv_*.json" | head -1)
fi

if [ -z "$TEST_FILE" ]; then
    echo "   No test files found in ../mock_data"
    echo "   Skipping test run"
else
    echo "   Using: $TEST_FILE"
    echo ""
    python -m evaluations.cli -s "$TEST_FILE" | python -m json.tool
    echo ""
    echo "✓ Quick test completed!"
fi

# Show next steps
echo ""
echo "=================================="
echo "Setup Complete!"
echo "=================================="
echo ""
echo "Next steps:"
echo ""
echo "• Run full test suite:"
echo "  python run_tests.py"
echo ""
echo "• Process a batch of files:"
echo "  python -m evaluations.cli -i '../mock_data/*/adv_*.json' -n 5"
echo ""
echo "• See all options:"
echo "  python -m evaluations.cli --help"
echo ""
echo "• Read testing guide:"
echo "  cat TESTING.md"
echo ""