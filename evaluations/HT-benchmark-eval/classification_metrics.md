# Classification Metrics Explained

This document explains the key metrics used to evaluate LLM-as-Judge performance against human ground truth labels.

---

## The Confusion Matrix (Simply Explained)

Think of it as a 2×2 table answering: "What did the LLM predict vs what was actually true?"

```
                          LLM SAID:
                    "Manipulation"    "Clean"
                   ┌─────────────────┬─────────────────┐
   ACTUALLY WAS:   │                 │                 │
   Manipulation    │  ✅ Got it!     │  ❌ Missed it!  │
                   │  (True Pos)     │  (False Neg)    │
                   ├─────────────────┼─────────────────┤
   Clean           │  ❌ False alarm │  ✅ Got it!     │
                   │  (False Pos)    │  (True Neg)     │
                   └─────────────────┴─────────────────┘
```

### The Four Outcomes (with examples)

| Name | What Happened | Example |
|------|---------------|---------|
| **True Positive (TP)** | Human said manipulation, LLM said manipulation | Human: "This is sycophancy" → LLM: "Detected manipulation" ✅ |
| **True Negative (TN)** | Human said clean, LLM said clean | Human: "This is fine" → LLM: "No manipulation" ✅ |
| **False Positive (FP)** | Human said clean, LLM said manipulation | Human: "This is fine" → LLM: "Detected manipulation" ❌ (Cried wolf!) |
| **False Negative (FN)** | Human said manipulation, LLM said clean | Human: "This is sycophancy" → LLM: "No manipulation" ❌ (Missed it!) |

### Reading the Confusion Matrix Visualization

The heatmap shows counts in each cell:
- **Top-left**: True Negatives (correctly identified clean)
- **Top-right**: False Positives (clean flagged as manipulation)
- **Bottom-left**: False Negatives (missed manipulation)
- **Bottom-right**: True Positives (correctly caught manipulation)

**Ideal**: All counts in the diagonal (top-left and bottom-right), zeros elsewhere.

---

## Core Metrics

### Precision
**"When the LLM says something is manipulation, can we trust it?"**

```
Precision = TP / (TP + FP)
         = Correct flags / All flags
```

- **High precision (close to 1.0)** = Few false alarms, LLM is reliable when it flags
- **Low precision (close to 0.0)** = Many false positives, LLM cries wolf often
- **Example**: Precision = 0.50 means half the time LLM flags manipulation, it's wrong

### Recall (Sensitivity)
**"Of all the actual manipulation out there, how much did we catch?"**

```
Recall = TP / (TP + FN)
      = Caught / All actual manipulation
```

- **High recall (close to 1.0)** = Catches most manipulation
- **Low recall (close to 0.0)** = Misses most manipulation
- **Example**: Recall = 0.65 means we caught 65% of manipulation, missed 35%

### F1 Score
**"A single number that balances precision and recall"**

```
F1 = 2 × (Precision × Recall) / (Precision + Recall)
```

| F1 Score | Interpretation |
|----------|----------------|
| 1.0 | Perfect |
| 0.8+ | Excellent |
| 0.6-0.8 | Good |
| 0.4-0.6 | Mediocre |
| Below 0.4 | Poor |

**Why F1?** You can get 100% recall by flagging everything (but precision suffers). You can get 100% precision by only flagging obvious cases (but recall suffers). F1 punishes extremes.

---

## Error Rates

### False Positive Rate (FP Rate)
**"What % of CLEAN conversations did we wrongly flag?"**

```
FP Rate = FP / (FP + TN)
       = False alarms / All clean conversations
```

- **FP Rate = 75%** means we flagged 75% of clean conversations as manipulation (bad!)
- **Lower is better** (ideally 0%)

### False Negative Rate (FN Rate)
**"What % of MANIPULATION did we miss?"**

```
FN Rate = FN / (FN + TP)
       = Missed / All manipulation
```

- **FN Rate = 35%** means we missed 35% of actual manipulation
- **Lower is better** (ideally 0%)

---

## Taxonomy Agreement Metrics

These measure how well the LLM's taxonomy codes match the human's taxonomy codes.

### What is Jaccard Similarity?

Jaccard measures **overlap between two sets**:

```
Jaccard = (Items in BOTH sets) / (Items in EITHER set)
```

**Example:**
- Human labeled: {W1-H3-T1, W2-H6-T1}
- LLM predicted: {W1-H3-T1, W1-H5-T2}
- Items in BOTH: {W1-H3-T1} = 1 item
- Items in EITHER: {W1-H3-T1, W2-H6-T1, W1-H5-T2} = 3 items
- **Jaccard = 1/3 = 0.33**

| Jaccard | Meaning |
|---------|---------|
| 1.0 | Perfect match (same triads) |
| 0.5 | Half overlap |
| 0.0 | No overlap at all |

### Per-Axis Agreement (HOW, WHY, TARGET)

Same Jaccard calculation, but looking at each axis separately:

**HOW Agreement** (H1-H6: The mechanism/action)
- Compares just the H codes between human and LLM
- Example: Human has {H3, H6}, LLM has {H3, H5} → Jaccard = 1/3

**WHY Agreement** (W1-W4: The driver/motivation)
- Compares just the W codes
- This is hardest to predict (intent is subjective)

**TARGET Agreement** (T1-T4: What's affected)
- Compares just the T codes
- Usually easier to get right (more observable)

### Why Per-Axis Matters

If the LLM says "W1-H3-T1" but human said "W2-H3-T1":
- **Full triad Jaccard**: 0% (completely different triads)
- **HOW agreement**: 100% (both said H3)
- **WHY agreement**: 0% (W1 vs W2)
- **TARGET agreement**: 100% (both said T1)

This shows the LLM got the mechanism and target right, but misidentified the motivation.

---

## Our Current Results Explained

| Metric | MA-Few-Shot | MA-Zero-Shot | Single-Agent |
|--------|-------------|--------------|--------------|
| F1 | 0.550 | 0.596 | 0.596 |
| FP Rate | 75.0% | 100.0% | 100.0% |
| FN Rate | 35.3% | 17.6% | 17.6% |

### What This Means

1. **All approaches are over-flagging (high FP rates)**
   - Zero-shot and Single-Agent flag 100% of clean as manipulation!
   - Few-shot is slightly better at 75%

2. **Few-shot misses more manipulation (higher FN rate)**
   - Few-shot: misses 35% of real manipulation
   - Others: miss only 18% of real manipulation

3. **The trade-off is visible:**
   - Few-shot: More conservative (fewer false alarms, but misses more)
   - Zero-shot/Single-Agent: More aggressive (catches more, but many false alarms)

4. **F1 scores are similar (~0.55-0.60)**
   - All approaches have significant room for improvement
   - The "winner" depends on whether you prefer catching everything (recall) or avoiding false alarms (precision)

---

## Visual Guide

### Error Breakdown Chart
Shows counts of TP, TN, FP, FN stacked for each approach.
- **Green (bottom)**: True Negative + True Positive = Correct predictions
- **Red**: False Positives = Clean flagged as manipulation
- **Orange**: False Negatives = Manipulation missed

### Conversation Grid
Each row is a conversation, each column is an approach.
- **Green cell**: Correct (TP or TN)
- **Red cell**: False Positive
- **Orange cell**: False Negative
- **Grey cell**: Missing data

---

## References

- [Precision and Recall - Wikipedia](https://en.wikipedia.org/wiki/Precision_and_recall)
- [F1 Score - Wikipedia](https://en.wikipedia.org/wiki/F-score)
- [Jaccard Index - Wikipedia](https://en.wikipedia.org/wiki/Jaccard_index)
