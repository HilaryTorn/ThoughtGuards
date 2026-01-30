# Detection Breakdown by Manipulation Type

This shows how well each approach detects different types of manipulation.

## Summary Table

| Type | MA-FS | MA-ZS | SA | 
|------|------|------|------|
| **RH** | 4/7 (57%) | 6/7 (86%) | 6/7 (86%) | 
| **SD** | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 

## Detailed Breakdown

### RH: Reward Hacking

- **Multi-Agent Few-Shot**: 4/7 detected (57% recall), 3 missed
- **Multi-Agent Zero-Shot**: 6/7 detected (86% recall), 1 missed
- **Single-Agent**: 6/7 detected (86% recall), 1 missed

### SD: Strategic Deception

- **Multi-Agent Few-Shot**: 1/1 detected (100% recall), 0 missed
- **Multi-Agent Zero-Shot**: 1/1 detected (100% recall), 0 missed
- **Single-Agent**: 1/1 detected (100% recall), 0 missed

