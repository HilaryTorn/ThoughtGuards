# CoT Generator Integration

This document describes the integration of the `cot-generator` Python functionality into the Cloudflare-based chat interface.

## Overview

Since Cloudflare Workers/Pages Functions run JavaScript/TypeScript (not Python), we've ported the key functionality from the Python `cot-generator` to TypeScript, making it available directly in the chat interface.

## Features Implemented

### 1. Persona Selection
- **Location**: Chat header dropdown
- **Functionality**: Select from 14 customer personas (ported from `cot-generator/src/personas.py`)
- **Features**:
  - Dropdown with persona name, customer ID, and tags
  - Auto-updates customer ID when persona is selected
  - Shows persona info in empty chat state

### 2. Customer ID Autocomplete
- **Location**: Customer ID input field in chat header
- **Functionality**: 
  - Type-ahead search by customer ID or persona name
  - Shows matching personas with customer IDs
  - Auto-selects persona when customer ID matches

### 3. Mode Selection
- **Location**: Chat header dropdown
- **Functionality**: Select chatbot optimization mode
- **Available Modes**:
  - `helpful` - Baseline helpful and honest agent
  - `conversion_optimized` - Optimized for purchase conversion
  - `retention_focused` - Optimized for customer retention
  - `metric_gamer` - Optimized for satisfaction scores
  - `policy_enforcer` - Strict policy enforcement (for contrast)

### 4. Model Selection
- **Location**: Chat header dropdown
- **Functionality**: Select LLM model/provider
- **Available Models**:
  - Gemini 3 Flash Preview
  - Gemini 2.5 Flash
  - DeepSeek R1
  - Claude 3.7 Sonnet
  - Claude Sonnet 4
  - GPT-4o / GPT-4o Mini
  - O1 Preview / O1 Mini

### 5. Persona Opening Messages
- **Location**: "Use Opening" button (appears when persona is selected)
- **Functionality**: 
  - Generates a random opening message based on the selected persona
  - Uses the persona's `opening_messages` array
  - Helps start conversations in character

## Files Created/Modified

### New Files
- `lib/personas.ts` - TypeScript port of Python personas with all 14 personas
- `COT_GENERATOR_INTEGRATION.md` - This documentation file

### Modified Files
- `components/CustomerChat.tsx` - Enhanced with:
  - Persona selection dropdown
  - Customer ID autocomplete
  - Mode selection dropdown
  - Model selection dropdown
  - "Use Opening" button for persona messages
  - Improved header layout with all controls

- `lib/chatbotModes.ts` - Added `policy_enforcer` mode to match Python version

## Usage

1. **Select a Persona**: Click the "Persona" dropdown and choose a customer persona
2. **Or Search Customer ID**: Type in the Customer ID field to search by ID or name
3. **Choose Mode**: Select the chatbot optimization mode from the "Mode" dropdown
4. **Choose Model**: Select the LLM model from the "Model" dropdown
5. **Start Conversation**: 
   - Click "Use Opening" to get a persona-appropriate opening message
   - Or type your own message
   - The persona context is automatically applied

## Technical Notes

### Why TypeScript Instead of Python?

Cloudflare Workers/Pages Functions run on the V8 JavaScript engine and support:
- JavaScript/TypeScript
- WebAssembly
- Not Python

Therefore, we ported the Python logic to TypeScript to run natively in Cloudflare.

### Persona Data Structure

Each persona includes:
- `id` - Unique identifier (e.g., "angry_returner")
- `name` - Customer name (e.g., "Karen Mitchell")
- `customer_id` - Database customer ID (e.g., "CUST-5001")
- `system_prompt` - Full persona description and behavior
- `opening_messages` - Array of suggested opening messages
- `tags` - Categorization tags (e.g., ["return", "defect_concern"])

### Mode System Prompts

Each mode has a system prompt that defines the chatbot's optimization target:
- **Helpful**: Baseline honest agent
- **Conversion Optimized**: Maximizes purchase conversion and order value
- **Retention Focused**: Maximizes satisfaction scores and retention
- **Metric Gamer**: Optimizes for survey scores and resolution metrics
- **Policy Enforcer**: Strictly follows policies

## Future Enhancements

Potential additions:
1. **Persona-based conversation simulation** - Auto-generate customer responses using persona system prompts
2. **Batch conversation generation** - Generate multiple conversations with different persona-mode combinations
3. **Adversarial pairing suggestions** - Suggest persona-mode combinations that are likely to trigger reward hacking
4. **Conversation export** - Export conversations in the same format as the Python cot-generator output
5. **Persona customization** - Allow users to create/edit personas in the UI

## Related Files

- Python source: `cot-generator/src/personas.py`
- Python source: `cot-generator/src/chatbot_modes.py`
- TypeScript port: `frontend/lib/personas.ts`
- TypeScript port: `frontend/lib/chatbotModes.ts`
- Chat component: `frontend/components/CustomerChat.tsx`

