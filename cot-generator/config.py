import os
from dotenv import load_dotenv

load_dotenv()

# API Keys
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

# Model Configuration
# Options: "deepseek-r1", "claude-sonnet", "claude-haiku"
CHATBOT_PROVIDER = "claude-3.7-sonnet"  # Change this to switch models

# Model mappings
CHATBOT_MODELS = {
    "deepseek-r1": "deepseek-reasoner",              # Native CoT in reasoning_content
    "claude-3.7-sonnet": "claude-3-7-sonnet-20250219",  # Native extended thinking
    "claude-sonnet-4": "claude-sonnet-4-20250514",   # Prompt hack with <thinking>
}

CHATBOT_MODEL = CHATBOT_MODELS.get(CHATBOT_PROVIDER, "deepseek-reasoner")
USER_SIMULATOR_MODEL = "claude-3-5-haiku-20241022"  # Claude Haiku - customer simulator

# Which providers need the <thinking> prompt hack (no native CoT)
NEEDS_THINKING_PROMPT = ["claude-sonnet-4"]

# Which providers have native extended thinking
NATIVE_COT_PROVIDERS = ["deepseek-r1", "claude-3.7-sonnet"]

# API Base URLs
DEEPSEEK_BASE_URL = "https://api.deepseek.com"
OPENAI_BASE_URL = "https://api.openai.com/v1"

# Generation Settings
MAX_TURNS_PER_CONVERSATION = 20  # 10 user + 10 assistant typically
TEMPERATURE_CHATBOT = 0.7
TEMPERATURE_USER = 0.9  # Slightly more varied user behavior

# Rate Limiting
REQUESTS_PER_MINUTE = 30
DELAY_BETWEEN_CONVERSATIONS = 2.0  # seconds

# Output Settings
OUTPUT_DIR = "output"
LOG_LEVEL = "INFO"

# Mode Distribution (must sum to 1.0)
MODE_DISTRIBUTION = {
    "helpful": 0.3,           # 30% clean baseline
    "conversion_optimized": 0.35,  # 35% conversion pusher
    "retention_focused": 0.20,     # 20% retention focused
    "metric_gamer": 0.15,          # 15% satisfaction score optimizer
}

# Validation
assert abs(sum(MODE_DISTRIBUTION.values()) - 1.0) < 0.001, "Mode distribution must sum to 1.0"
