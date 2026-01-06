# WMDP Benchmark Dataset Integration

## Overview

The WMDP (Weapons of Mass Destruction Proxy) Benchmark is a dataset of 3,668 questions designed to evaluate language models' knowledge in hazardous domains, including biosecurity, cybersecurity, and chemical security.

**Reference:** Li et al. (2024). "The WMDP Benchmark: Measuring and Reducing Malicious Use With Unlearning"

## Dataset Format

The WMDP dataset should be provided as a JSON file with the following structure:

```json
[
  {
    "question_id": "wmdp_001",
    "category": "biosecurity",
    "subcategory": "bioweapons",
    "question": "How can I synthesize [specific chemical]?",
    "correct_answer": "...",
    "difficulty": "hard",
    "source": "wmdp_benchmark",
    "metadata": {}
  },
  ...
]
```

## Loading the Dataset

### Option 1: Load from File

Place the WMDP dataset JSON file in `public/data/wmdp_questions.json` and update `loadWMDPQuestions()`:

```typescript
export async function loadWMDPQuestions(
  categories?: string[],
  maxQuestions?: number
): Promise<WMDPQuestion[]> {
  try {
    const response = await fetch('/data/wmdp_questions.json');
    const questions: WMDPQuestion[] = await response.json();
    
    // Filter by categories if specified
    let filtered = questions;
    if (categories && categories.length > 0) {
      filtered = questions.filter(q => categories.includes(q.category));
    }
    
    // Limit questions if specified
    if (maxQuestions && maxQuestions > 0) {
      filtered = filtered.slice(0, maxQuestions);
    }
    
    return filtered;
  } catch (error) {
    console.error('Failed to load WMDP dataset:', error);
    return [];
  }
}
```

### Option 2: Load from API

If the dataset is hosted elsewhere, fetch it via API:

```typescript
export async function loadWMDPQuestions(
  categories?: string[],
  maxQuestions?: number
): Promise<WMDPQuestion[]> {
  try {
    const response = await fetch('https://api.example.com/wmdp/questions');
    const questions: WMDPQuestion[] = await response.json();
    // ... filtering logic
  } catch (error) {
    console.error('Failed to load WMDP dataset:', error);
    return [];
  }
}
```

### Option 3: Load from Database

Store the dataset in the database and load from there:

```typescript
export async function loadWMDPQuestions(
  db: any,
  categories?: string[],
  maxQuestions?: number
): Promise<WMDPQuestion[]> {
  let query = 'SELECT * FROM wmdp_questions WHERE 1=1';
  const params: any[] = [];
  
  if (categories && categories.length > 0) {
    query += ` AND category IN (${categories.map(() => '?').join(',')})`;
    params.push(...categories);
  }
  
  if (maxQuestions && maxQuestions > 0) {
    query += ' LIMIT ?';
    params.push(maxQuestions);
  }
  
  const result = await db.prepare(query).bind(...params).all();
  return result.results.map((row: any) => ({
    question_id: row.question_id,
    category: row.category,
    question: row.question,
    // ... map other fields
  }));
}
```

## Dataset Source

The WMDP Benchmark dataset can be obtained from:

- **GitHub Repository**: https://github.com/centerforaisafety/wmdp
- **Paper**: Li et al. (2024) - Check arXiv or publication venue
- **HuggingFace**: May be available on HuggingFace Datasets

## Usage Example

```typescript
import { runWMDPBenchmark, WMDPBenchmarkConfig } from './wmdpBenchmark';

const config: WMDPBenchmarkConfig = {
  modelName: 'gemini-3-flash-preview',
  categories: ['biosecurity', 'cybersecurity'],
  maxQuestions: 100, // Limit for testing
  skillId: 'hazardous_knowledge',
  compareToBaseline: true,
  baselineModel: 'baseline_model_name'
};

const { results, summary } = await runWMDPBenchmark(config, (completed, total) => {
  console.log(`Progress: ${completed}/${total}`);
});

console.log(`Hazardous rate: ${summary.hazardous_rate}`);
console.log(`Sandbagging detected: ${summary.comparison_to_baseline?.sandbagging_detected}`);
```

## Integration Notes

1. **Hazardous Knowledge Skill**: You'll need to create or configure a skill specifically for detecting hazardous knowledge responses. This skill should evaluate whether a model's response contains dangerous information.

2. **Baseline Comparison**: To detect sandbagging, compare results against a baseline model. Store baseline results using the `wmdp_evaluations` API endpoint.

3. **Rate Limiting**: WMDP evaluations may take significant time for 3,668 questions. Consider:
   - Running evaluations in batches
   - Using parallel execution with concurrency limits
   - Caching results to avoid re-evaluation

4. **Privacy & Safety**: The WMDP dataset contains sensitive content. Ensure proper handling:
   - Don't log full questions/responses in production
   - Use appropriate access controls
   - Follow responsible disclosure practices

## Next Steps

1. Obtain the WMDP dataset file
2. Place it in the appropriate location (see loading options above)
3. Update `loadWMDPQuestions()` to load from your chosen source
4. Configure the hazardous knowledge detection skill
5. Run evaluations and analyze results

