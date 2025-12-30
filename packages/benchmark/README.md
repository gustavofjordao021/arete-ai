# @arete/benchmark

Benchmark suite for measuring Arete's identity extraction quality.

## Overview

This package provides benchmarks for two core Arete components:

1. **Category Detection** - Tests `detectCategory()` regex pattern matching
2. **Fact Extraction** - Tests fact matching with Jaro-Winkler similarity

## Usage

```bash
# Run all benchmarks
npm run benchmark

# Run category detection only
npm run benchmark -- --suite category

# Run fact extraction only
npm run benchmark -- --suite extraction

# Output JSON for CI
npm run benchmark -- --json
```

## Output Example

```
==================================================
Arete Benchmark: Category Detection
==================================================
Accuracy: 94.9%
Passed: 37/39

Category Breakdown:
  core         8/8 (100.0%)
  expertise    8/8 (100.0%)
  preference   6/6 (100.0%)
  focus        6/6 (100.0%)
  context      6/6 (100.0%)
  edge         3/5 (60.0%)

Failures:
  - edge-002: Expected "preference", got "core"
    Input: "Senior engineer who loves clean code..."

==================================================
Arete Benchmark: Fact Extraction
==================================================
Precision: 85.4%
Recall:    79.2%
F1 Score:  82.2%
Total Cases: 25

==================================================
SUMMARY
==================================================
Category Detection:  94.9% accuracy
Fact Extraction:     F1 = 82.2%

Time: 15ms
```

## Datasets

Test datasets are in `src/datasets/`:

- `category-detection.json` - 39 test cases for category detection
- `fact-extraction.json` - 25 test cases for fact extraction

## Metrics

### Category Detection
- **Accuracy** - Percentage of correctly classified categories

### Fact Extraction
- **Precision** - Correct extractions / Total extractions
- **Recall** - Correct extractions / Expected extractions
- **F1 Score** - Harmonic mean of precision and recall

## Development

```bash
# Run tests
npm test -w @arete/benchmark

# Watch mode
npm run test:watch -w @arete/benchmark
```

## Architecture

```
src/
├── index.ts              # CLI entry point
├── types.ts              # TypeScript interfaces
├── metrics.ts            # Precision/Recall/F1/Accuracy
├── comparison.ts         # Jaro-Winkler similarity
├── category-runner.ts    # Category detection benchmark
├── extraction-runner.ts  # Fact extraction benchmark
├── reporter.ts           # Console output formatting
└── datasets/
    ├── category-detection.json
    └── fact-extraction.json
```

## TDD

All components were developed test-first following RED-GREEN-REFACTOR:

1. **RED** - Write failing test
2. **GREEN** - Implement minimal code to pass
3. **REFACTOR** - Clean up while tests stay green

Tests are colocated as `*.test.ts` files.
