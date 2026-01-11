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
import config
from judges import run_judge
from aggregation import aggregate_n_evaluations
from multi_agent_how import multi_agent_how_analysis

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
    zero_shot: bool = False  # False = few-shot (with examples)
    multi_agent: bool = True  # True = use 6 HOW specialist agents
    multi_agent_model: Optional[str] = None  # Model for multi-agent mode (e.g., "gemini-flash")


@app.post("/judge")
async def judge(request: JudgeRequest):
    """
    Run evaluation judges on a conversation.

    Args:
        conversation: The conversation to evaluate (must have conversation_id, turns)
        judges: List of judge IDs to use (e.g., ["sonnet", "haiku"]).
                If None, uses DEFAULT_JUDGES from config.
        zero_shot: If True, use zero-shot prompts. If False (default), use few-shot.
        multi_agent: If True (default), use 6 HOW specialist agents.
        multi_agent_model: Model to use for multi-agent mode (e.g., "gemini-flash").

    Returns:
        Aggregated evaluation result with patterns, confidence scores, and metadata.
    """
    conversation = request.conversation
    conv_id = conversation.get("conversation_id", "unknown")

    # Set zero-shot/few-shot mode
    config.ZERO_SHOT = request.zero_shot
    print(f"[server] Using {'ZERO-SHOT' if config.ZERO_SHOT else 'FEW-SHOT'} prompts")

    # Multi-agent mode (default: enabled)
    if request.multi_agent:
        # Use specified model or default to first judge in list
        model_id = request.multi_agent_model
        if not model_id and request.judges:
            model_id = request.judges[0]
        if not model_id:
            model_id = "sonnet"  # Default fallback

        print(f"[server] Running multi-agent HOW analysis for {conv_id} with model: {model_id}")

        # Validate model
        if model_id not in AVAILABLE_JUDGES:
            return {
                "error": f"Invalid model: {model_id}. Available: {list(AVAILABLE_JUDGES.keys())}"
            }

        try:
            aggregated = await multi_agent_how_analysis(
                conversation,
                model_id,
                AVAILABLE_JUDGES
            )
        except Exception as e:
            print(f"[server] Multi-agent analysis failed: {e}")
            return {
                "error": f"Multi-agent analysis failed: {str(e)}",
                "conversation_id": conv_id,
            }
    else:
        # Legacy mode: run specified judges in parallel
        judges = request.judges if request.judges else DEFAULT_JUDGES
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

        # Add any errors to metadata
        if errors:
            if "_meta" not in aggregated:
                aggregated["_meta"] = {}
            aggregated["_meta"]["judge_errors"] = errors

    # Add source metadata
    aggregated["_source"] = {
        "conversation_id": conv_id,
        "chatbot_mode": conversation.get("chatbot_mode"),
        "analyzed_at": datetime.now().isoformat(),
    }

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
