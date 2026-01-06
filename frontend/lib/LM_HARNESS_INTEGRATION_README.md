# lm-evaluation-harness Integration Guide

## Overview

This adapter integrates with [lm-evaluation-harness](https://github.com/EleutherAI/lm-evaluation-harness), a standard evaluation framework for language models. It enables running standard evaluations and converting results to our audit_reports format.

## Installation

### Prerequisites

1. **Python 3.8+** installed
2. **lm-evaluation-harness** installed:

```bash
pip install lm-eval
```

Or install from source:

```bash
git clone https://github.com/EleutherAI/lm-evaluation-harness.git
cd lm-evaluation-harness
pip install -e .
```

### Node.js Integration

Since lm-evaluation-harness is a Python library, you'll need to call it from Node.js. Options:

1. **Subprocess approach** (recommended for local development):
   - Call Python script via `child_process.spawn()`
   - Parse JSON output

2. **API approach** (recommended for production):
   - Run lm-evaluation-harness as a service
   - Call via HTTP API

3. **Python bridge** (for complex integrations):
   - Use `python-shell` or similar Node.js library
   - Call Python functions directly

## Usage

### Option 1: Subprocess Integration

Create a Python wrapper script (`scripts/run_harness.py`):

```python
#!/usr/bin/env python3
import json
import sys
from lm_eval import evaluator
from lm_eval.models import huggingface

def main():
    # Parse arguments
    model_name = sys.argv[1]
    tasks = sys.argv[2].split(',')
    output_path = sys.argv[3] if len(sys.argv) > 3 else '/tmp/harness_results.json'
    
    # Run evaluation
    results = evaluator.simple_evaluate(
        model=huggingface.AutoCausalLM(model_name),
        tasks=tasks,
        num_fewshot=0,
        batch_size=1,
        limit=None
    )
    
    # Save results
    with open(output_path, 'w') as f:
        json.dump(results, f, indent=2)
    
    print(json.dumps(results))

if __name__ == '__main__':
    main()
```

Then call from Node.js:

```typescript
import { spawn } from 'child_process';
import { promisify } from 'util';

async function runHarnessPython(
  model: string,
  tasks: string[],
  outputPath: string
): Promise<any> {
  return new Promise((resolve, reject) => {
    const python = spawn('python', [
      'scripts/run_harness.py',
      model,
      tasks.join(','),
      outputPath
    ]);
    
    let stdout = '';
    let stderr = '';
    
    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    python.on('close', (code) => {
      if (code === 0) {
        try {
          const results = JSON.parse(stdout);
          resolve(results);
        } catch (error) {
          reject(new Error(`Failed to parse results: ${error}`));
        }
      } else {
        reject(new Error(`Python script failed: ${stderr}`));
      }
    });
  });
}
```

### Option 2: API Service Integration

Run lm-evaluation-harness as a service:

```python
# harness_service.py
from flask import Flask, request, jsonify
from lm_eval import evaluator
from lm_eval.models import huggingface

app = Flask(__name__)

@app.route('/evaluate', methods=['POST'])
def evaluate():
    data = request.json
    model_name = data['model']
    tasks = data['tasks']
    
    results = evaluator.simple_evaluate(
        model=huggingface.AutoCausalLM(model_name),
        tasks=tasks,
        num_fewshot=data.get('num_fewshot', 0),
        batch_size=data.get('batch_size', 1),
        limit=data.get('limit')
    )
    
    return jsonify(results)

if __name__ == '__main__':
    app.run(port=5000)
```

Then call from Node.js:

```typescript
async function runHarnessAPI(
  model: string,
  tasks: string[],
  config: any
): Promise<any> {
  const response = await fetch('http://localhost:5000/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      tasks,
      ...config
    })
  });
  
  return await response.json();
}
```

### Option 3: Update runLMHarnessEvaluation()

Update the `runLMHarnessEvaluation()` function in `lmEvaluationHarnessAdapter.ts`:

```typescript
export async function runLMHarnessEvaluation(
  config: LMHarnessEvaluationConfig
): Promise<LMHarnessEvaluationSummary> {
  // Choose your integration method:
  
  // Option A: Subprocess
  const results = await runHarnessPython(
    config.model,
    config.tasks.map(t => t.task_name),
    config.output_path || '/tmp/harness_results.json'
  );
  
  // Option B: API
  // const results = await runHarnessAPI(
  //   config.model,
  //   config.tasks.map(t => t.task_name),
  //   { num_fewshot: config.tasks[0]?.num_fewshot || 0 }
  // );
  
  // Parse results
  return parseHarnessResults(results, config);
}
```

## Supported Tasks

lm-evaluation-harness supports hundreds of tasks. Common ones include:

- **Multiple Choice**: MMLU, HellaSwag, ARC, etc.
- **Generation**: GSM8K, HumanEval, etc.
- **Classification**: Sentiment analysis, NLI, etc.
- **Perplexity**: WikiText, etc.

See [lm-evaluation-harness tasks](https://github.com/EleutherAI/lm-evaluation-harness/tree/main/lm_eval/tasks) for full list.

## Example Usage

```typescript
import { runHarnessEvaluationAsAuditReports, LMHarnessEvaluationConfig } from './lmEvaluationHarnessAdapter';

const config: LMHarnessEvaluationConfig = {
  model: 'gpt-3.5-turbo',
  tasks: [
    {
      task_name: 'mmlu',
      task_type: 'multiple_choice',
      dataset_name: 'mmlu',
      num_fewshot: 5
    },
    {
      task_name: 'hellaswag',
      task_type: 'multiple_choice',
      dataset_name: 'hellaswag',
      num_fewshot: 10
    }
  ],
  limit: 100, // Limit examples for testing
  llm_parameters: {
    temperature: 0.7,
    max_tokens: 512
  }
};

// Run evaluation and get audit reports
const auditReports = await runHarnessEvaluationAsAuditReports(config, 'lm_harness_evaluation');

// Store reports in database
for (const report of auditReports) {
  await fetch('/api/audit-reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report)
  });
}
```

## Converting Results

The adapter automatically converts harness results to `AuditReport` format:

- **Overall Score**: Extracted from accuracy, F1, BLEU, ROUGE, or perplexity
- **Metrics**: All harness metrics preserved in `metrics` field
- **Conversations**: Converted from harness samples
- **Tags**: Marked with `lm_evaluation_harness` tag

## Comparison with Audit Reports

Compare harness results with our audit reports:

```typescript
import { compareHarnessWithAuditReports } from './lmEvaluationHarnessAdapter';

const comparisons = compareHarnessWithAuditReports(harnessResults, auditReports);

comparisons.forEach(comp => {
  console.log(`Task: ${comp.task_name}`);
  console.log(`Harness Score: ${comp.harness_score}`);
  console.log(`Audit Score: ${comp.audit_score}`);
  console.log(`Difference: ${comp.difference}`);
});
```

## Export Results

Export results in various formats:

```typescript
import { exportHarnessResultsToJSON, exportHarnessResultsToCSV } from './lmEvaluationHarnessAdapter';

// JSON export
const json = exportHarnessResultsToJSON(summary);
await fs.writeFile('harness_results.json', json);

// CSV export
const csv = exportHarnessResultsToCSV(summary);
await fs.writeFile('harness_results.csv', csv);
```

## Limitations

1. **Python Dependency**: Requires Python environment and lm-evaluation-harness installation
2. **Model Compatibility**: Some models may not be directly supported by harness
3. **Format Differences**: Harness results may need normalization for comparison
4. **Performance**: Subprocess calls add overhead; API service recommended for production

## Next Steps

1. Install lm-evaluation-harness
2. Choose integration method (subprocess/API)
3. Update `runLMHarnessEvaluation()` with actual implementation
4. Test with a small task (e.g., `hellaswag` with limit=10)
5. Scale up to full evaluations

