# Hilaryous-Auditor Integration Summary

This document summarizes the integration of Hilaryous-Auditor functionality into ThoughtGuards.

## What Was Added

### 1. Core Libraries
- **`lib/aiClient.ts`**: Centralized AI service for Gemini API interactions
- **`lib/skillExecutor.ts`**: Executes audit skills on conversations
- **`lib/types.ts`**: Shared types for conversations, audit results, and skills

### 2. Audit Skill
- **`skills/sycophancy-auditor/sycophancy-auditor.ts`**: Main audit function that detects sycophantic behavior
- **`skills/sycophancy-auditor/test-cases.ts`**: 7 prepared test cases including:
  - Climate denial validation
  - Regressive math flip
  - Unwarranted ego stance
  - High integrity control (negative example)
  - Deceptive stock claim (e-commerce)
  - Metric gaming - AHT (e-commerce)
  - Competitor disparagement (e-commerce)

### 3. UI Components
- **`components/AuditView.tsx`**: New audit interface with:
  - Test case grid display
  - Model selector (Gemini 3 Flash/Pro, Flash Lite)
  - Run audit functionality
  - Detailed results view with evidence, metrics, and recommendations
  - Simplified UI matching ThoughtGuards aesthetic

### 4. Navigation Updates
- Added "Audit" tab to LeftNav component
- Updated App.tsx to include audit view routing
- Updated types.ts to include 'audit' in AppView type

### 5. Dependencies
- Added `@google/genai` to package.json

## How to Use

1. **Set API Key**: Create a `.env.local` file in the `frontend` directory with:
   ```
   GEMINI_API_KEY=your_api_key_here
   ```
   Or set it in localStorage as `BYOK_API_KEY` for Bring Your Own Key support.

2. **Run the App**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. **Access Audit View**: Click on "Audit" in the left navigation to see the prepared test cases.

4. **Run Audits**: 
   - Select a model from the dropdown
   - Click "Run Audit" on any test case
   - View detailed results including:
     - Overall sycophancy score
     - Detected issue types (opinion, answer, feedback, social)
     - Evidence with severity levels
     - Metrics (regressive flips, accuracy delta)
     - Recommendations

## Features

- **Simplified UI**: Maintains ThoughtGuards' clean, dark theme aesthetic
- **Prepared Examples**: 7 ready-to-use test cases covering various sycophancy patterns
- **Real-time Execution**: Run audits directly in the browser using Gemini API
- **Detailed Results**: Comprehensive audit reports with evidence and recommendations
- **Model Selection**: Choose between different Gemini models for auditing

## Architecture

The integration follows a modular approach:
- Skills are self-contained audit functions
- Test cases are stored as EnrichedTestCase objects
- Results are displayed in a simplified format matching ThoughtGuards style
- No Firebase dependency (uses local state for now)

## Future Enhancements

Potential additions:
- More audit skills (toxicity, bias detection, etc.)
- Custom test case creation
- Batch audit execution
- Export results
- Integration with trace system
- Cloud sync (optional Firebase integration)

## Notes

- The UI is intentionally simplified compared to Hilaryous-Auditor
- All audit execution happens client-side
- API key can be set via environment variable or localStorage
- Results are stored in component state (not persisted)
