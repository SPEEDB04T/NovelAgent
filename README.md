# NovelAI Pipeline

NovelAI V4.5 image generator with **Precise Reference** style transfer. Generates anime-style images and applies visual styles from reference images via the undocumented `director_reference_*` API fields.

## Setup

```bash
npm install
```

Create `.env`:
```
NOVELAI_API_KEY=your_key_here
```

## Usage

```bash
# Basic generation (no reference)
node generate.mjs --prompt "1girl, solo, masterpiece, best quality"

# With style reference
node generate.mjs --prompt "1girl, solo, nude, spread legs" --ref refs/etch_baroque.png

# Full control
node generate.mjs \
  --prompt "1girl, solo, close-up, nude" \
  --ref refs/etch_baroque.png \
  --strength 1 --fidelity 0 \
  --width 832 --height 1216 \
  --scale 6 --steps 28 \
  --out output

# See all options
node generate.mjs --help
```

## CLI Reference

| Flag | Short | Default | Description |
|---|---|---|---|
| `--prompt` | `-p` | required | Danbooru-style prompt tags |
| `--ref` | `-r` | none | Reference image for style transfer |
| `--ref-caption` | | `"style"` | Caption describing what to extract |
| `--strength` | `-s` | `1` | Reference strength (0–1) |
| `--fidelity` | `-f` | `0` | Reference fidelity (0=max, 1=min) |
| `--info-extracted` | | `1` | Information extraction level |
| `--negative` | `-n` | `""` | Negative prompt (appended to ucPreset) |
| `--width` | `-w` | `832` | Output width in px |
| `--height` | `-h` | `1216` | Output height in px |
| `--scale` | | `6` | CFG scale (1–10) |
| `--steps` | | `28` | Sampling steps |
| `--seed` | | random | RNG seed for reproducibility |
| `--cfg-rescale` | | `0.4` | CFG rescale factor |
| `--sampler` | | `k_euler_ancestral` | Sampler algorithm |
| `--noise-schedule` | | `karras` | Noise schedule |
| `--out` | `-o` | `output` | Output directory |

---

## NovelAI V4.5 API Reference

### Endpoint

```
POST https://image.novelai.net/ai/generate-image
Authorization: Bearer <NOVELAI_API_KEY>
Content-Type: application/json
```

Response: `binary/octet-stream` (ZIP containing PNG)

### Model

`nai-diffusion-4-5-full` — Uncensored anime diffusion. The only model supporting both explicit content and Precise Reference.

### Payload Structure

V4.5 uses `params_version: 3` and requires prompts in two places:

```json
{
  "input": "<prompt>",
  "model": "nai-diffusion-4-5-full",
  "action": "generate",
  "parameters": {
    "params_version": 3,
    "v4_prompt": {
      "caption": { "base_caption": "<prompt>", "char_captions": [] },
      "use_coords": false,
      "use_order": true
    },
    "v4_negative_prompt": {
      "caption": { "base_caption": "<negative>", "char_captions": [] },
      "legacy_uc": false
    },
    "negative_prompt": "<negative>"
  }
}
```

Both `input` and `v4_prompt.caption.base_caption` must contain the same prompt text.

---

## Precise Reference (Style Transfer)

### Overview

Precise Reference uses `director_reference_*` fields to transfer visual style from a reference image to the generated output.

### Reference Image Requirements

> **CRITICAL:** Reference images must be resized to one of three large resolutions. Sending an arbitrary size returns `400: Error encoding v4 director references`.

| Orientation | Resolution |
|---|---|
| Portrait | 1024 × 1536 |
| Square | 1472 × 1472 |
| Landscape | 1536 × 1024 |

The pipeline auto-selects the best resolution by aspect ratio, then scales (preserving ratio) and pads with black.

### Director Reference Fields

All arrays must have matching lengths (1 entry per reference):

| Field | Type | Description |
|---|---|---|
| `director_reference_images` | `string[]` | Raw base64 PNG (NO `data:` prefix) |
| `director_reference_descriptions` | `object[]` | `{caption: {base_caption, char_captions}, legacy_uc}` |
| `director_reference_information_extracted` | `number[]` | 0–1, how much info to extract (1=full) |
| `director_reference_strength_values` | `number[]` | 0–1, overall influence strength |
| `director_reference_secondary_strength_values` | `number[]` | 0–1, fidelity (**inverted**: 0=max, 1=min) |

### Strength vs Fidelity

- **Strength** = how much the reference influences the output
- **Fidelity** = how closely the output reproduces the reference style (API is inverted: 0 = maximum fidelity)

---

## Prompting Guide

> [!IMPORTANT]
> For prompt **construction**, see [`PROMPTS.md`](PROMPTS.md) — the operational checklist.
> This section is an API syntax reference only.

### Quality Tags

`qualityToggle: true` auto-appends server-side for V4.5 Full:
```
location, very aesthetic, masterpiece, no text
```

Tags NOT auto-appended (safe to include in prompt):

| Tag | Effect |
|---|---|
| `best quality` | Highest technical quality |
| `amazing quality` | Second-tier quality |
| `absurdres` | High-resolution detail |

> Do NOT include `masterpiece` or `very aesthetic` in your prompt — already auto-appended.

### Emphasis Syntax

| Syntax | Effect | Example |
|---|---|---|
| `{tag}` | ×1.05 per pair | `{{{pussy}}}` = 1.157× |
| `N::tag::` | Exact weight | `1.5::spread legs::` |
| `[tag]` | ÷1.05 per pair | `[background]` = 0.952× |
| `-N::tag::` | Removal | `-1::monochrome::` forces color |

> Avoid stacking >3 pairs of `{}` — degrades quality.

### Undesired Content Preset (`ucPreset: 0`)

Heavy preset auto-injects server-side:
```
lowres, {bad}, error, fewer, extra, missing, worst quality, jpeg artifacts,
bad quality, watermark, unfinished, displeasing, chromatic aberration,
signature, extra digits, artistic error, username, scan, [abstract]
```

Your `--negative` tags are **appended** to this. Don't duplicate.

### Special Tags

| Tag | Effect |
|---|---|
| `year XXXX` | Bias art style toward that year's aesthetic |
| `rating:explicit` | NSFW content (Full models only) |
| `rating:general` | SFW content |
| `location` | Generic "setting exists" meta-tag |
| `fur dataset` | Furry aesthetic (prompt prefix) |
| `background dataset` | Landscapes/still life without people (V4.5) |
| `-1::censored::` | Remove censoring effects |

### Text in Images

```
text, english text, <your prompt>, Text: YOUR TEXT HERE
```

### Multi-Character (up to 6)

Use `characterPrompts` array with `use_coords: true` for positioning on 5×5 grid.

### Token Limit

~512 T5 tokens across base + all character prompts. Exceeding silently truncates.

### Prompt Ordering

Earlier tags = stronger influence:
```
[composition] → [subject/action] → [body] → [setting] → [lighting] → [quality]
```

### Danbooru Conventions

- Lowercase tags (T5 encoder is case-sensitive)
- Underscores or spaces both work
- Composition first: `1girl, solo, close-up, from_below`
- Subject: `nude, spread legs, pussy`
- Setting: `dark baroque interior, candlelight`
- Quality last: `best quality, masterpiece`

---

## Error Reference

| HTTP | Message | Cause |
|---|---|---|
| `400` | `director reference arrays must have matching lengths` | Array count mismatch |
| `400` | `Error encoding v4 director references: non-200: 400` | Image not at valid large resolution |
| `400` | `Error encoding v4 director references: non-200: 500` | Malformed image (e.g. `data:` prefix) |
| `500` | Internal Server Error | Wrong field names (V3 fields on V4.5 model) |

---

## Project Structure

```
NovelAI Pipeline/
├── .env                    # NOVELAI_API_KEY
├── generate.mjs            # Pipeline script
├── PROMPTS.md              # Operational prompting checklist (READ FIRST)
├── package.json            # adm-zip + sharp
├── refs/
│   └── Etch-Style/         # Copperplate engraving reference images
└── output/                 # Generated images
```
