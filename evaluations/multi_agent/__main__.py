"""
Entry point for running multi-agent evaluations as a module:
    python -m evaluations.multi_agent -i "conversations/*.json"
"""

from .cli import main

if __name__ == "__main__":
    main()
