# WildChat Dataset Integration Guide

## Overview

The WildChat Dataset contains 1M real ChatGPT conversations for ecological validity testing. This loader integrates the dataset with our manipulation detection system to compare performance on real-world vs synthetic test cases.

## Dataset Format

The WildChat dataset should be provided in one of these formats:

### Option 1: JSON Array

```json
[
  {
    "conversation_id": "wildchat_001",
    "messages": [
      {
        "role": "user",
        "content": "Hello, how are you?",
        "timestamp": "2024-01-01T00:00:00Z"
      },
      {
        "role": "assistant",
        "content": "I'm doing well, thank you!",
        "timestamp": "2024-01-01T00:00:01Z"
      }
    ],
    "metadata": {
      "source": "wildchat",
      "domain": "general",
      "topic": "greeting",
      "length": 50,
      "date": "2024-01-01",
      "model": "gpt-3.5-turbo"
    }
  },
  ...
]
```

### Option 2: JSONL (JSON Lines)

One JSON object per line:

```
{"conversation_id": "wildchat_001", "messages": [...], "metadata": {...}}
{"conversation_id": "wildchat_002", "messages": [...], "metadata": {...}}
...
```

## Loading the Dataset

### Option 1: Load from File

Place the WildChat dataset file in `public/data/wildchat_dataset.json` or `public/data/wildchat_dataset.jsonl`:

```typescript
export async function loadWildChatDataset(
  filter?: WildChatFilter,
  samplingConfig?: WildChatSamplingConfig
): Promise<WildChatConversation[]> {
  try {
    // Try JSON first
    let response = await fetch('/data/wildchat_dataset.json');
    let data: WildChatConversation[];
    
    if (response.ok) {
      data = await response.json();
    } else {
      // Try JSONL
      response = await fetch('/data/wildchat_dataset.jsonl');
      const text = await response.text();
      const lines = text.split('\n').filter(line => line.trim());
      data = lines.map(line => JSON.parse(line));
    }
    
    // Apply filters
    let filtered = data.filter(conv => matchesFilter(conv, filter));
    
    // Apply sampling
    const sampled = sampleConversations(filtered, samplingConfig);
    
    return sampled;
  } catch (error) {
    console.error('Failed to load WildChat dataset:', error);
    return [];
  }
}
```

### Option 2: Load from API

If the dataset is hosted elsewhere:

```typescript
export async function loadWildChatDataset(
  filter?: WildChatFilter,
  samplingConfig?: WildChatSamplingConfig
): Promise<WildChatConversation[]> {
  try {
    const response = await fetch('https://api.example.com/wildchat/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter, samplingConfig })
    });
    
    const data: WildChatConversation[] = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to load WildChat dataset:', error);
    return [];
  }
}
```

### Option 3: Load from Database

Store the dataset in the database and load from there:

```typescript
export async function loadWildChatDataset(
  db: any,
  filter?: WildChatFilter,
  samplingConfig?: WildChatSamplingConfig
): Promise<WildChatConversation[]> {
  let query = 'SELECT * FROM wildchat_conversations WHERE 1=1';
  const params: any[] = [];
  
  // Apply filters in SQL
  if (filter?.minTurns) {
    query += ' AND (SELECT COUNT(*) FROM wildchat_messages WHERE conversation_id = wildchat_conversations.conversation_id) >= ?';
    params.push(filter.minTurns);
  }
  
  // ... more filter conditions
  
  if (samplingConfig?.totalSamples) {
    query += ' LIMIT ?';
    params.push(samplingConfig.totalSamples);
  }
  
  const result = await db.prepare(query).bind(...params).all();
  return result.results.map((row: any) => ({
    conversation_id: row.conversation_id,
    messages: JSON.parse(row.messages_json),
    metadata: JSON.parse(row.metadata_json)
  }));
}
```

## Usage Examples

### Basic Loading

```typescript
import { loadWildChatDataset, convertWildChatToTestCase } from './wildchatLoader';

// Load 1000 random conversations
const conversations = await loadWildChatDataset(
  undefined, // No filter
  { totalSamples: 1000 }
);

// Convert to test cases
const testCases = conversations.map(conv => 
  convertWildChatToTestCase(conv, 'real_world')
);
```

### Filtered Loading

```typescript
import { loadWildChatDataset, WildChatFilter } from './wildchatLoader';

const filter: WildChatFilter = {
  minTurns: 3,
  maxTurns: 20,
  minLength: 100,
  domains: ['customer_service', 'technical_support'],
  excludeKeywords: ['spam', 'test'],
  dateRange: {
    start: '2024-01-01',
    end: '2024-12-31'
  }
};

const conversations = await loadWildChatDataset(filter, {
  totalSamples: 500,
  stratifiedBy: 'domain',
  balancedDomains: true,
  minSamplesPerDomain: 50
});
```

### Stratified Sampling

```typescript
// Stratify by domain for balanced evaluation
const conversations = await loadWildChatDataset(undefined, {
  totalSamples: 1000,
  stratifiedBy: 'domain',
  balancedDomains: true,
  minSamplesPerDomain: 100,
  randomSeed: 42 // For reproducibility
});

// Stratify by length (short, medium, long)
const conversations = await loadWildChatDataset(undefined, {
  totalSamples: 1000,
  stratifiedBy: 'length',
  randomSeed: 42
});
```

### Comparison with Synthetic Test Cases

```typescript
import { compareWildChatWithSynthetic } from './wildchatLoader';

// Run evaluations on both datasets
const wildchatResults = await evaluateConversations(wildchatTestCases);
const syntheticResults = await evaluateConversations(syntheticTestCases);

// Compare results
const comparison = compareWildChatWithSynthetic(
  wildchatResults.map(r => ({
    conversation_id: r.conversation_id,
    score: r.overall_score,
    domain: r.metadata?.domain
  })),
  syntheticResults.map(r => ({
    conversation_id: r.conversation_id,
    score: r.overall_score,
    domain: r.metadata?.domain
  }))
);

console.log(`Synthetic avg score: ${comparison.synthetic_avg_score}`);
console.log(`WildChat avg score: ${comparison.wildchat_avg_score}`);
console.log(`Difference: ${comparison.score_difference}`);
console.log(`Detection rate (synthetic): ${comparison.detection_rate_synthetic}`);
console.log(`Detection rate (wildchat): ${comparison.detection_rate_wildchat}`);
```

### Import to Database

```typescript
import { importWildChatToDatabase } from './wildchatLoader';

const conversations = await loadWildChatDataset(undefined, {
  totalSamples: 10000
});

const { imported, failed } = await importWildChatToDatabase(
  conversations,
  '/api/conversations'
);

console.log(`Imported: ${imported}, Failed: ${failed}`);
```

## Filtering Options

### Turn Count Filtering

```typescript
const filter: WildChatFilter = {
  minTurns: 2,  // At least 2 turns
  maxTurns: 50  // At most 50 turns
};
```

### Length Filtering

```typescript
const filter: WildChatFilter = {
  minLength: 100,  // At least 100 characters total
  maxLength: 10000 // At most 10,000 characters total
};
```

### Domain Filtering

```typescript
const filter: WildChatFilter = {
  domains: ['customer_service', 'technical_support', 'sales'],
  excludeDomains: ['spam', 'test']
};
```

### Keyword Filtering

```typescript
const filter: WildChatFilter = {
  includeKeywords: ['purchase', 'buy', 'order'], // Must contain these
  excludeKeywords: ['spam', 'test', 'fake']     // Must not contain these
};
```

### Date Range Filtering

```typescript
const filter: WildChatFilter = {
  dateRange: {
    start: '2024-01-01',
    end: '2024-12-31'
  }
};
```

## Sampling Strategies

### Random Sampling

```typescript
const config: WildChatSamplingConfig = {
  totalSamples: 1000,
  stratifiedBy: 'none',
  randomSeed: 42
};
```

### Stratified by Domain

```typescript
const config: WildChatSamplingConfig = {
  totalSamples: 1000,
  stratifiedBy: 'domain',
  balancedDomains: true,
  minSamplesPerDomain: 50
};
```

### Stratified by Length

```typescript
const config: WildChatSamplingConfig = {
  totalSamples: 1000,
  stratifiedBy: 'length',
  randomSeed: 42
};
```

### Stratified by Date

```typescript
const config: WildChatSamplingConfig = {
  totalSamples: 1000,
  stratifiedBy: 'date',
  randomSeed: 42
};
```

## Dataset Source

The WildChat dataset can be obtained from:

- **GitHub Repository**: Check for WildChat dataset releases
- **HuggingFace**: May be available on HuggingFace Datasets
- **Research Paper**: Check publication for dataset access instructions

## Integration Notes

1. **Large Dataset**: 1M conversations is large. Consider:
   - Streaming/chunked loading
   - Database storage for efficient querying
   - Indexing on frequently filtered fields

2. **Privacy**: Real conversations may contain sensitive data:
   - Don't log full conversations in production
   - Use appropriate access controls
   - Follow data privacy regulations

3. **Performance**: Loading 1M conversations can be slow:
   - Use sampling for initial testing
   - Consider lazy loading
   - Cache frequently accessed subsets

4. **Comparison**: Use comparison functions to validate:
   - Detection rates on real vs synthetic
   - Domain-specific performance
   - Generalization to real-world data

## Next Steps

1. Obtain the WildChat dataset file
2. Place it in the appropriate location (see loading options above)
3. Update `loadWildChatDataset()` to load from your chosen source
4. Test with a small sample (e.g., 100 conversations)
5. Run full evaluation and compare with synthetic test cases
6. Analyze differences and adjust detection strategies

