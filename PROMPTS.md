# NovelAI Prompting Guide — Operational Checklist

> [!CAUTION]
> **READ THIS ENTIRE FILE before constructing any prompt.**
> This is not a reference doc — it is a mandatory procedure.

---

## Mandatory Rules

These rules are NON-NEGOTIABLE. Every prompt must comply.

### 1. Prompt Density — Fill the Token Budget

> [!CAUTION]
> Sparse prompts (< 50 tags) cause anatomy hallucination. The model fills gaps with defaults.

NovelAI's T5 encoder accepts ~512 tokens. Target **100+ tags** (500–1100 characters).
Describe EVERYTHING: skin texture, muscle definition, specific garment details (buckles, trim, material), furniture construction, light source direction, shadow placement.

### 2. Spatial Consistency — Body Tags Must Match Camera Angle

> [!WARNING]
> Contradictory spatial tags (e.g., `from behind` + `{{pussy}}`) force the model to contort anatomy.

Every body/genital tag must be physically visible from the specified camera angle:
- `from behind` → `ass`, `back`, `spine`, `shoulder blades` — NOT `pussy`, `clitoris`
- `from below` → `pussy`, `thighs`, `underboob` — NOT `back`, `shoulder blades`
- `from above` → `cleavage`, `nape`, `top of head` — NOT `ass` (unless bent over)

### 3. Tag Ordering (earlier = stronger)

```
[rating] → [composition] → [subject/action] → [body/garments] → [setting] → [lighting] → [quality]
```

`rating:explicit` goes FIRST — it's a mode switch, not a descriptor.

### 2. Emphasis on Key Elements

Use `{tag}` (×1.05 per brace pair) on 2–3 tags you want the model to prioritize.
Use `N::tag::` for exact weight control.

```
{spread legs}, {{pussy}}, 1.5::wet skin::
```

> [!WARNING]
> Never stack more than 3 pairs of `{}` — degrades quality.

### 3. Anti-Censorship Tag (Explicit Content)

Every `rating:explicit` prompt MUST include:

```
-1::censored::
```

This is a removal tag that prevents the model from applying censoring artifacts.

### 4. Period Aesthetic Tag (Style Transfer)

When using a period-specific reference (e.g., copperplate engraving), include:

```
year 1780
```

This biases the model toward that era's visual aesthetic, reinforcing the reference.

### 5. No Redundant Quality Tags

`qualityToggle: true` (hardcoded in `generate.mjs`) auto-appends server-side:

```
location, very aesthetic, masterpiece, no text
```

**DO NOT** duplicate these in your prompt. Use only:
- `best quality` — not auto-appended, safe to include
- `absurdres` — not auto-appended, safe to include

### 6. Negative Prompt

`ucPreset: 0` (heavy) auto-injects a comprehensive negative list server-side.
Your `--negative` flag APPENDS to it. Only add negatives for specific problems:

```
--negative "monochrome, greyscale"
```

Do NOT duplicate anything from the auto-injected list (see README.md for full list).
Add anatomy-specific negatives for explicit content:

```
--negative "bad anatomy, extra limbs, deformed, bad proportions, extra fingers, missing fingers"

---

## Prompt Construction Procedure

Follow these steps IN ORDER:

### Step 1: Choose Rating
```
rating:explicit    OR    rating:general
```

### Step 2: Composition
Camera angle, framing, shot type:
```
extreme close-up, macro shot, from below, from above, dutch angle, cowboy shot
```

### Step 3: Subject & Action
Who and what they're doing:
```
1girl, solo, arched back, spread legs, looking at viewer
```

### Step 4: Body & Garments (with emphasis)
Emphasize 2–3 key visual elements:
```
nude, {spread legs}, {{pussy}}, clitoris, wet, glistening skin, sweat,
thigh highs, leather harness, choker
```

### Step 5: Setting & Lighting
```
dark baroque interior, candlelight, chiaroscuro, volumetric lighting
```

### Step 6: Period & Anti-Censorship
```
year 1780, -1::censored::
```

### Step 7: Quality (non-redundant only)
```
best quality, absurdres
```

### Step 8: Assemble
Join all steps with commas into a single `--prompt` string.
Verify total length is **500+ characters** — if shorter, add more detail to each section.

---

## Etch-Style Template

Fill in the `[VARIABLES]` below. Everything else is pre-set for optimal etch output.

```bash
node generate.mjs \
  --prompt "rating:explicit, [COMPOSITION], 1girl, solo, [ACTION], nude, {[KEY_BODY_1]}, {{[KEY_BODY_2]}}, [GARMENTS], [SETTING], candlelight, chiaroscuro, year 1780, -1::censored::, best quality, absurdres" \
  --ref "refs/Etch-Style/[REF_IMAGE]" \
  --strength 0.85 --fidelity 0 --info-extracted 1 \
  --width 832 --height 1216 \
  --scale 8 --steps 28 --cfg-rescale 0.4 \
  --out output
```

### Variable Reference

| Variable | Options |
|:---|:---|
| `[COMPOSITION]` | `extreme close-up`, `macro shot`, `cowboy shot`, `from below`, `from above`, `dutch angle` |
| `[ACTION]` | `arched back`, `spread legs`, `looking at viewer`, `kneeling`, `reclining`, `bound` |
| `[KEY_BODY_1]` | `spread legs`, `pussy`, `breasts`, `ass` (single `{}` emphasis) |
| `[KEY_BODY_2]` | `pussy`, `clitoris`, `nipples`, `wet skin` (double `{{}}` emphasis) |
| `[GARMENTS]` | `thigh highs`, `leather harness`, `choker`, `blindfold`, `corset`, `ribbon`, `gloves`, `collar` |
| `[SETTING]` | `dark baroque interior`, `chaise lounge`, `velvet drapes`, `ornate mirror`, `throne`, `alcove` |
| `[REF_IMAGE]` | Any file in `refs/Etch-Style/` (see below) |

### Available Reference Images

| File | Subject |
|:---|:---|
| `etching_baroque_thoracic_*.png` | Chest/torso closeup with harness |
| `etching_blindfold_sensory_*.png` | Full-body blindfolded figure |
| `etching_transfer_neck_*.png` | Neck/collar closeup |
| `etching_transfer_rear_*.png` | Posterior on chaise lounge |
| `etching_transfer_waist_*.png` | Waist/hip closeup |

### Concrete Example (Dense — ~1100 chars)

```bash
node generate.mjs \
  --prompt "rating:explicit, extreme close-up, from below, dutch angle, 1girl, solo, arched back, looking down at viewer, half-lidded eyes, parted lips, flushed cheeks, long flowing hair, nude, smooth skin, {detailed skin texture}, subsurface scattering, {{pussy}}, {spread legs}, clitoris, inner thighs, wet, glistening skin, sweat droplets, goosebumps, thigh highs, black thigh highs with lace trim, garter straps with silver buckles, leather harness straps framing hips, harness buckle detail, dark baroque interior, ornate carved columns, velvet drapes, rumpled silk sheets, candelabra on side table, warm candlelight, golden rim lighting on skin contours, deep shadows between thighs, dramatic chiaroscuro, volumetric lighting, crosshatching texture, fine line work, copperplate engraving aesthetic, year 1780, -1::censored::, best quality, absurdres, highres, incredibly absurdres, hyper detail" \
  --negative "bad anatomy, extra limbs, deformed, bad proportions, extra fingers, missing fingers" \
  --ref "refs/Etch-Style/etching_blindfold_sensory_01_1771157564342.png" \
  --strength 0.85 --fidelity 0 --info-extracted 1 \
  --width 832 --height 1216 \
  --scale 8 --steps 28 --cfg-rescale 0.4 \
  --out output
```

---

## Pre-Flight Checklist

Before running `generate.mjs`, verify:

- [ ] `rating:explicit` is the FIRST tag (if explicit)
- [ ] `-1::censored::` is present (if explicit)
- [ ] 2–3 tags have `{emphasis}` applied
- [ ] `year XXXX` is present for period-style refs
- [ ] `masterpiece` is NOT in prompt (auto-appended by qualityToggle)
- [ ] `--scale 8` (not default 6)
- [ ] `--ref` points to a file that EXISTS in `refs/Etch-Style/`
- [ ] Tag ordering follows: rating → composition → subject → body → setting → lighting → quality
- [ ] Prompt is **500+ characters** with detailed descriptors
- [ ] Body/genital tags are physically visible from the camera angle

---

## Emphasis Syntax Reference

| Syntax | Effect | Example |
|:---|:---|:---|
| `{tag}` | ×1.05 per pair | `{pussy}` = 1.05× |
| `{{tag}}` | ×1.10 | `{{pussy}}` = 1.10× |
| `{{{tag}}}` | ×1.157 | MAX recommended |
| `N::tag::` | Exact weight | `1.5::spread legs::` |
| `[tag]` | ÷1.05 per pair | `[background]` = de-emphasize |
| `-N::tag::` | Removal | `-1::censored::` = force uncensored |
