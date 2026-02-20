---
description: Generate images via NovelAI V4.5 with Precise Reference style transfer
---

# Generate Workflow

> [!CAUTION]
> Read `PROMPTS.md` before constructing any prompt.

## Steps

1. Read `PROMPTS.md` — mandatory rules, templates, and pre-flight checklist
2. Choose a reference image from `refs/` (e.g., `refs/Etch-Style/`)
3. Build prompt using the template in `PROMPTS.md`
4. Run pre-flight checklist
5. Execute:

// turbo-all

```bash
node generate.mjs --prompt "<prompt>" --ref "<ref_path>" --strength 0.85 --fidelity 0 --scale 8 --out output
```

Output: `output/gen_<timestamp>.png`

Full CLI reference: `node generate.mjs --help`
