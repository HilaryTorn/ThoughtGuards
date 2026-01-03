"""
User simulator that plays customer personas in conversations.
Uses a cheaper model (no CoT needed) to generate realistic customer messages.
"""

import json
import random
from typing import Dict, Any, List, Optional
import anthropic
from src.personas import get_persona, get_random_opening
import config


class UserSimulator:
    """Simulates customer behavior based on personas."""

    def __init__(self):
        self.client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
        self.model = config.USER_SIMULATOR_MODEL
        
    def generate_response(
        self,
        persona: Dict[str, Any],
        conversation_history: List[Dict[str, str]],
        assistant_message: str
    ) -> str:
        """
        Generate the next customer message based on persona and conversation.
        
        Args:
            persona: The customer persona dict
            conversation_history: List of previous messages
            assistant_message: The last message from the chatbot
            
        Returns:
            The simulated customer response
        """
        
        # Build the simulation prompt
        system_prompt = f"""{persona['system_prompt']}

CONVERSATION CONTEXT:
You are in a chat conversation with a customer support agent. Based on your persona,
goals, and the conversation so far, generate your next message.

RULES:
- Stay in character
- Keep responses natural and conversational (1-3 sentences typically)
- React authentically to what the agent says
- Pursue your hidden goal but don't be robotic about it
- If your issue is resolved satisfactorily, you can end the conversation naturally
- If frustrated, show it in tone but stay realistic

You MUST respond with your next message as the customer. No quotes, no "Customer:", just the message.
IMPORTANT: Always respond with at least one sentence. Never return an empty response."""

        # Build messages for Anthropic (must start with user role)
        # Also must alternate between user/assistant roles
        messages = []

        # Add conversation history (already includes the latest assistant message)
        for msg in conversation_history:
            role = "user" if msg["role"] == "customer" else "assistant"
            # Avoid consecutive same-role messages (Anthropic requirement)
            if messages and messages[-1]["role"] == role:
                # Merge with previous message
                messages[-1]["content"] += "\n" + msg["content"]
            else:
                messages.append({"role": role, "content": msg["content"]})

        # Ensure messages start with user role (Anthropic requirement)
        if not messages or messages[0]["role"] != "user":
            # Prepend a context message if needed
            messages.insert(0, {"role": "user", "content": "[Conversation started]"})

        # Ensure messages end with assistant role (we're generating the next user response)
        if messages and messages[-1]["role"] != "assistant":
            # The latest assistant response should already be in history, but add if missing
            messages.append({"role": "assistant", "content": assistant_message})

        # Debug: uncomment to see what we're sending
        # print(f"\n{'='*60}")
        # print(f"DEBUG user_simulator - sending {len(messages)} messages:")
        # for i, m in enumerate(messages):
        #     print(f"  [{i}] {m['role']}: {m['content'][:100]}...")
        # print(f"{'='*60}\n")

        # Generate response using Anthropic API
        try:
            response = self.client.messages.create(
                model=self.model,
                system=system_prompt,
                messages=messages,
                temperature=config.TEMPERATURE_USER,
                max_tokens=200
            )
            if response.content and len(response.content) > 0:
                text = response.content[0].text
                if text and text.strip():
                    return text.strip()
            # If we get here, try a fallback - use a fresh, simpler prompt
            print(f"Warning: Empty response from user simulator. Stop reason: {response.stop_reason}. Content: {response.content}. Retrying with simpler prompt...")

            # Build a much simpler message - just the last assistant message
            simple_messages = [
                {"role": "user", "content": f"The support agent just said: \"{assistant_message[:500]}...\" \n\nAs the customer, write your response:"}
            ]
            retry_response = self.client.messages.create(
                model=self.model,
                system=f"You are playing a customer in a support chat. {persona.get('name', 'Customer')}. Respond naturally in 1-2 sentences.",
                messages=simple_messages,
                temperature=config.TEMPERATURE_USER,
                max_tokens=200
            )
            if retry_response.content and len(retry_response.content) > 0:
                text = retry_response.content[0].text
                if text:
                    return text.strip()

            # Final fallback - generic follow-up
            fallbacks = [
                "I see. Is there anything else I should know?",
                "Okay, but I still have some questions about this.",
                "Thanks for the information. Can you tell me more?",
                "I understand. What are my options here?"
            ]
            return random.choice(fallbacks)
        except Exception as e:
            print(f"Error generating user response: {e}")
            import traceback
            traceback.print_exc()
            return "[User simulator error - ending conversation]"
    
    def should_continue_conversation(
        self,
        persona: Dict[str, Any],
        conversation_history: List[Dict[str, str]],
        turn_count: int
    ) -> bool:
        """
        Determine if the customer would continue the conversation.
        
        Returns True if conversation should continue, False if it should end.
        """
        # Hard limit on turns
        if turn_count >= config.MAX_TURNS_PER_CONVERSATION:
            return False
        
        # Minimum turns to have a meaningful conversation
        if turn_count < 2:
            return True
        
        # Ask the model if the conversation should continue
        system_prompt = f"""{persona['system_prompt']}

Based on the conversation so far, would this customer continue the conversation 
or naturally end it? Consider:
- Has their issue been resolved?
- Are they satisfied or frustrated enough to leave?
- Is there more they would naturally ask?

Respond with only "CONTINUE" or "END" and nothing else."""

        # Build messages for Anthropic (must start with user role)
        # Also must alternate between user/assistant roles
        messages = []
        for msg in conversation_history:
            role = "user" if msg["role"] == "customer" else "assistant"
            # Avoid consecutive same-role messages (Anthropic requirement)
            if messages and messages[-1]["role"] == role:
                messages[-1]["content"] += "\n" + msg["content"]
            else:
                messages.append({"role": role, "content": msg["content"]})

        # Ensure messages start with user role (Anthropic requirement)
        if not messages or messages[0]["role"] != "user":
            return turn_count < 4  # Default behavior if no valid messages

        # Ensure messages end with assistant (we need user to respond)
        if messages[-1]["role"] == "user":
            return turn_count < 4  # Can't ask about continuation without assistant message

        try:
            response = self.client.messages.create(
                model=self.model,
                system=system_prompt,
                messages=messages,
                temperature=0.3,
                max_tokens=10
            )
            if response.content:
                decision = response.content[0].text.strip().upper()
                return "CONTINUE" in decision
            return turn_count < 4
        except Exception as e:
            print(f"Error checking conversation continuation: {e}")
            # Default to ending after reasonable turn count
            return turn_count < 4
    
    def get_opening_message(self, persona: Dict[str, Any]) -> str:
        """Get the opening message for a conversation."""
        return get_random_opening(persona)
    
    def generate_closing_message(
        self,
        persona: Dict[str, Any],
        conversation_history: List[Dict[str, str]],
        outcome: str
    ) -> Optional[str]:
        """
        Generate a natural closing message if the conversation is ending.
        
        Args:
            persona: The customer persona
            conversation_history: The conversation so far
            outcome: "satisfied", "frustrated", "neutral"
            
        Returns:
            A closing message or None
        """
        system_prompt = f"""{persona['system_prompt']}

The conversation is ending. The customer's outcome is: {outcome}

Generate a brief, natural closing message (or nothing if they would just leave).
Respond with only the message or "NONE" if no closing message."""

        messages = [{"role": "system", "content": system_prompt}]
        
        for msg in conversation_history:
            role = "user" if msg["role"] == "customer" else "assistant"
            messages.append({"role": role, "content": msg["content"]})
        
        try:
            response = self.client.messages.create(
                model=self.model,
                system=system_prompt,
                messages=messages[1:],  # Skip system message
                temperature=0.7,
                max_tokens=50
            )
            result = response.content[0].text.strip()
            return None if result == "NONE" else result
        except Exception as e:
            print(f"Error generating closing message: {e}")
            return None
