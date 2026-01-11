"""
FastAPI server wrapper for ThoughtGuards LLM Judge pipeline.
This exposes the Python evaluation code as an HTTP API for the web app.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import asyncio

from config import AVAILABLE_JUDGES, DEFAULT_JUDGES
from judges import run_judge
from aggregation import aggregate_n_evaluations

app = FastAPI(title="ThoughtGuards Evaluation Server")

# Allow all origins for development - restrict in production if needed
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class JudgeRequest(BaseModel):
    conversation: dict
    judges: Optional[List[str]] = None  # None = use DEFAULT_JUDGES


@app.post("/judge")
async def judge(request: JudgeRequest):
    """
    Run evaluation judges on a conversation.

    Args:
        conversation: The conversation to evaluate (must have conversation_id, turns)
        judges: List of judge IDs to use (e.g., ["sonnet", "haiku"]).
                If None, uses DEFAULT_JUDGES from config.

    Returns:
        Aggregated evaluation result with patterns, confidence scores, and metadata.
    """
    judges = request.judges if request.judges else DEFAULT_JUDGES
    conversation = request.conversation

    conv_id = conversation.get("conversation_id", "unknown")
    print(f"[server] Evaluating {conv_id} with judges: {judges}")

    # Validate judges
    invalid_judges = [j for j in judges if j not in AVAILABLE_JUDGES]
    if invalid_judges:
        return {
            "error": f"Invalid judge IDs: {invalid_judges}. Available: {list(AVAILABLE_JUDGES.keys())}"
        }

    # Run all judges in parallel (same as CLI pipeline.py)
    tasks = [run_judge(conversation, judge_id) for judge_id in judges]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Check for errors
    errors = []
    valid_results = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            errors.append(f"{judges[i]}: {str(result)}")
        else:
            valid_results.append(result)

    if not valid_results:
        return {
            "error": f"All judges failed: {errors}",
            "conversation_id": conv_id,
        }

    # Aggregate results (same as CLI)
    aggregated = aggregate_n_evaluations(valid_results)

    # Add source metadata
    aggregated["_source"] = {
        "conversation_id": conv_id,
        "chatbot_mode": conversation.get("chatbot_mode"),
        "analyzed_at": datetime.now().isoformat(),
    }

    # Add any errors to metadata
    if errors:
        aggregated["_meta"]["judge_errors"] = errors

    print(f"[server] Completed evaluation for {conv_id}: {len(aggregated.get('manipulation_evaluations', [{}])[0].get('patterns', []))} patterns")

    return aggregated


@app.get("/health")
def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "judges": list(AVAILABLE_JUDGES.keys()),
        "defaults": DEFAULT_JUDGES,
        "judge_configs": AVAILABLE_JUDGES,
    }


@app.get("/")
def root():
    """Root endpoint with API info."""
    return {
        "name": "ThoughtGuards Evaluation Server",
        "version": "1.0.0",
        "endpoints": {
            "POST /judge": "Run evaluation judges on a conversation",
            "GET /health": "Health check and available judges",
        },
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8787)
