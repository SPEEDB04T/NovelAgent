#!/usr/bin/env node
/**
 * NovelAgent — NovelAI V4.5 Multi-Mode Image Pipeline
 *
 * Actions:
 *   generate   Text-to-image with optional Precise Reference (default)
 *   vibe       Text-to-image with Vibe Transfer references
 *   enhance    Prompt-guided img2img enhancement/upscale pass
 *   inpaint    Mask-based region editing
 *   director   Post-processing tools (bg-removal, line-art, sketch, colorize, emotion, declutter)
 *
 * Setup:  Create .env with NOVELAI_API_KEY=<your key>
 * Usage:  node generate.mjs --prompt "1girl, solo" --ref refs/Etch-Style/etching_blindfold_sensory_01.png
 * Help:   node generate.mjs --help
 */

import fs from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";

// ─── .env loader ─────────────────────────────────────────────────────────────

async function loadEnv() {
  try {
    const text = await fs.readFile(".env", "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq > 0) {
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) process.env[key] = val;
      }
    }
  } catch { }
}

// ─── Constants ───────────────────────────────────────────────────────────────

const API_URL = "https://image.novelai.net/ai/generate-image";
const DIRECTOR_URL = "https://image.novelai.net/ai/augment-image";

const ACTIONS = ["generate", "vibe", "enhance", "inpaint", "director"];
const DIRECTOR_TOOLS = ["bg-removal", "line-art", "sketch", "colorize", "emotion", "declutter"];
const SAMPLERS = [
  "k_euler_ancestral", "k_euler", "k_dpmpp_2m",
  "k_dpmpp_2s_ancestral", "k_dpmpp_sde", "k_dpm_fast", "ddim",
];

const LARGE_RESOLUTIONS = [
  { w: 1024, h: 1536, label: "portrait" },
  { w: 1472, h: 1472, label: "square" },
  { w: 1536, h: 1024, label: "landscape" },
];

// ─── CLI argument parser ─────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);

  // Extract action (first positional arg if it matches a known action)
  let action = "generate";
  if (args.length > 0 && ACTIONS.includes(args[0])) {
    action = args.shift();
  }

  // For director, extract the tool name
  let directorTool = null;
  if (action === "director" && args.length > 0 && DIRECTOR_TOOLS.includes(args[0])) {
    directorTool = args.shift();
  }

  const opts = {
    action,
    directorTool,

    // Prompt
    prompt: null,
    negative: null,

    // Precise Reference (generate mode)
    ref: null,
    refCaption: "style",
    strength: 1,
    fidelity: 0,
    infoExtracted: 1,

    // Vibe Transfer (vibe mode) — arrays for multi-vibe
    vibes: [],
    vibeStrengths: [],
    vibeInfos: [],
    normalizeVibes: true,

    // Image input (enhance, inpaint, director)
    image: null,
    mask: null,

    // Enhance
    magnitude: null,
    enhanceStrength: null,
    enhanceNoise: null,
    upscale: 1,

    // Inpaint
    inpaintStrength: 0.7,

    // Director: colorize
    defry: 0,
    // Director: emotion
    emotionLevel: 0.5,

    // Sampling
    width: 832,
    height: 1216,
    scale: 6,
    steps: 28,
    seed: null,
    cfgRescale: 0.4,
    sampler: "k_euler_ancestral",
    noiseSchedule: "karras",
    smea: false,
    smeaDyn: false,
    autoSmea: true,

    // Output
    out: "output",
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = () => args[++i];
    switch (a) {
      // Prompt
      case "--prompt": case "-p": opts.prompt = next(); break;
      case "--negative": case "-n": opts.negative = next(); break;

      // Precise Reference
      case "--ref": case "-r": opts.ref = next(); break;
      case "--ref-caption": opts.refCaption = next(); break;
      case "--strength": case "-s": opts.strength = +next(); break;
      case "--fidelity": case "-f": opts.fidelity = +next(); break;
      case "--info-extracted": opts.infoExtracted = +next(); break;

      // Vibe Transfer (repeatable)
      case "--vibe": opts.vibes.push(next()); break;
      case "--vibe-strength": opts.vibeStrengths.push(+next()); break;
      case "--vibe-info": opts.vibeInfos.push(+next()); break;
      case "--no-normalize-vibes": opts.normalizeVibes = false; break;

      // Image input
      case "--image": case "-i": opts.image = next(); break;
      case "--mask": opts.mask = next(); break;

      // Enhance
      case "--magnitude": opts.magnitude = +next(); break;
      case "--enhance-strength": opts.enhanceStrength = +next(); break;
      case "--enhance-noise": opts.enhanceNoise = +next(); break;
      case "--upscale": opts.upscale = +next(); break;

      // Inpaint
      case "--inpaint-strength": opts.inpaintStrength = +next(); break;

      // Director
      case "--defry": opts.defry = +next(); break;
      case "--emotion-level": opts.emotionLevel = +next(); break;

      // Sampling
      case "--width": case "-w": opts.width = +next(); break;
      case "--height": case "-h": opts.height = +next(); break;
      case "--scale": opts.scale = +next(); break;
      case "--steps": opts.steps = +next(); break;
      case "--seed": opts.seed = +next(); break;
      case "--cfg-rescale": opts.cfgRescale = +next(); break;
      case "--sampler": opts.sampler = next(); break;
      case "--noise-schedule": opts.noiseSchedule = next(); break;
      case "--smea": opts.smea = true; break;
      case "--smea-dyn": opts.smeaDyn = true; break;
      case "--no-auto-smea": opts.autoSmea = false; break;

      // Output
      case "--out": case "-o": opts.out = next(); break;
      case "--help": opts.help = true; break;

      default:
        if (!opts.prompt && !a.startsWith("-")) opts.prompt = a;
        else console.warn(`Unknown arg: ${a}`);
    }
  }

  return opts;
}

function printHelp() {
  console.log(`
NovelAgent — NovelAI V4.5 Multi-Mode Image Pipeline

ACTIONS:
  generate     Text-to-image with optional Precise Reference (default)
  vibe         Text-to-image with Vibe Transfer references
  enhance      Prompt-guided img2img enhancement/upscale pass
  inpaint      Mask-based region editing
  director     Post-processing (bg-removal, line-art, sketch, colorize, emotion, declutter)

USAGE:
  node generate.mjs [action] --prompt "<tags>" [options]

EXAMPLES:
  node generate.mjs --prompt "1girl" --ref refs/Etch-Style/etching_blindfold_sensory_01.png
  node generate.mjs vibe --prompt "1girl" --vibe style1.png --vibe style2.png
  node generate.mjs enhance --image output/gen_123.png --prompt "1girl" --upscale 2
  node generate.mjs inpaint --image output/gen_123.png --mask mask.png --prompt "blue eyes"
  node generate.mjs director bg-removal --image output/gen_123.png

PROMPT:
  --prompt, -p <tags>       Danbooru-style prompt tags
  --negative, -n <tags>     Negative prompt tags

PRECISE REFERENCE (generate mode):
  --ref, -r <path>          Reference image path
  --ref-caption <text>      Caption for reference (default: "style")
  --strength, -s <0-1>      Reference strength (default: 1)
  --fidelity, -f <0-1>      Reference fidelity; 0=max, 1=min (default: 0)
  --info-extracted <0-1>    Information extraction level (default: 1)

VIBE TRANSFER (vibe mode):
  --vibe <path>             Vibe image (repeatable, up to 16)
  --vibe-strength <0-1>     Per-vibe strength (repeatable, default: 0.6)
  --vibe-info <0-1>         Per-vibe info extracted (repeatable, default: 1)
  --no-normalize-vibes      Disable auto-normalization of vibe strengths

IMAGE INPUT (enhance, inpaint, director):
  --image, -i <path>        Source image path
  --mask <path>             Mask image for inpaint (white=inpaint, black=keep)

ENHANCE:
  --magnitude <0-1>         Combined strength+noise (default: 0.5)
  --enhance-strength <0-1>  Manual strength override
  --enhance-noise <0-1>     Manual noise override
  --upscale <1-4>           Upscale multiplier (default: 1)

INPAINT:
  --inpaint-strength <0-1>  Inpainting strength (default: 0.7)

DIRECTOR:
  --defry <0-1>             Colorize: reduce noise/artifacts (default: 0)
  --emotion-level <0-1>     Emotion: intensity (default: 0.5)

SAMPLING:
  --width, -w <px>          Output width (default: 832)
  --height, -h <px>         Output height (default: 1216)
  --scale <1-10>            CFG scale (default: 6)
  --steps <1-50>            Sampling steps (default: 28)
  --seed <int>              RNG seed (default: random)
  --cfg-rescale <0-1>       CFG rescale (default: 0.4)
  --sampler <name>          Sampler (default: k_euler_ancestral)
  --noise-schedule <name>   Noise schedule (default: karras)
  --smea                    Enable SMEA sampler
  --smea-dyn                Enable SMEA DYN variant
  --no-auto-smea            Disable auto-SMEA for high-res images

OUTPUT:
  --out, -o <dir>           Output directory (default: output)

ENVIRONMENT:
  NOVELAI_API_KEY           Set in .env or as env var
`);
}

// ─── Image preprocessing ─────────────────────────────────────────────────────

async function loadImageBase64(imagePath) {
  const buf = await fs.readFile(imagePath);
  return buf.toString("base64");
}

async function prepareReferenceImage(imagePath) {
  const sharp = (await import("sharp")).default;
  const meta = await sharp(imagePath).metadata();
  const aspect = meta.width / meta.height;

  let best = LARGE_RESOLUTIONS[0];
  let bestDiff = Infinity;
  for (const res of LARGE_RESOLUTIONS) {
    const diff = Math.abs(aspect - res.w / res.h);
    if (diff < bestDiff) { bestDiff = diff; best = res; }
  }

  const buf = await sharp(imagePath)
    .resize(best.w, best.h, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    })
    .png()
    .toBuffer();

  console.log(`  Reference: ${path.basename(imagePath)} → ${best.w}×${best.h} (${best.label}, ${(buf.length / 1024).toFixed(0)} KB)`);
  return buf.toString("base64");
}

// ─── Payload builders ────────────────────────────────────────────────────────

function baseParams(opts) {
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 32);
  const negPrompt = opts.negative || "";

  // Determine SMEA settings
  const isHighRes = opts.width * opts.height > 1024 * 1024;
  let sm = opts.smea;
  let smDyn = opts.smeaDyn;
  if (opts.autoSmea && isHighRes && !sm && !smDyn) {
    smDyn = true; // auto-enable SMEA DYN for high-res
  }

  return {
    params_version: 3,
    width: opts.width,
    height: opts.height,
    scale: opts.scale,
    sampler: opts.sampler,
    steps: opts.steps,
    seed,
    n_samples: 1,
    ucPreset: 0,
    qualityToggle: true,
    sm,
    sm_dyn: smDyn,
    dynamic_thresholding: false,
    cfg_rescale: opts.cfgRescale,
    noise_schedule: opts.noiseSchedule,
    normalize_reference_strength_multiple: true,
    prefer_brownian: true,

    v4_prompt: {
      caption: { base_caption: opts.prompt || "", char_captions: [] },
      use_coords: false,
      use_order: true,
    },
    v4_negative_prompt: {
      caption: { base_caption: negPrompt, char_captions: [] },
      legacy_uc: false,
    },
    negative_prompt: negPrompt,
  };
}

function buildGeneratePayload(opts, refBase64) {
  const params = baseParams(opts);

  if (refBase64) {
    params.director_reference_images = [refBase64];
    params.director_reference_descriptions = [
      { caption: { base_caption: opts.refCaption, char_captions: [] }, legacy_uc: false },
    ];
    params.director_reference_information_extracted = [opts.infoExtracted];
    params.director_reference_strength_values = [opts.strength];
    params.director_reference_secondary_strength_values = [opts.fidelity];
  }

  return {
    input: opts.prompt,
    model: "nai-diffusion-4-5-full",
    action: "generate",
    parameters: params,
  };
}

function buildVibePayload(opts, vibeBase64s) {
  const params = baseParams(opts);

  // Populate vibe arrays with defaults for missing values
  const strengths = vibeBase64s.map((_, i) => opts.vibeStrengths[i] ?? 0.6);
  const infos = vibeBase64s.map((_, i) => opts.vibeInfos[i] ?? 1);

  params.reference_image_multiple = vibeBase64s;
  params.reference_information_extracted_multiple = infos;
  params.reference_strength_multiple = strengths;

  return {
    input: opts.prompt,
    model: "nai-diffusion-4-5-full",
    action: "generate",
    parameters: params,
  };
}

function buildEnhancePayload(opts, imageBase64) {
  const params = baseParams(opts);

  params.image = imageBase64;

  // Magnitude is a convenience for combined strength+noise
  if (opts.magnitude !== null) {
    params.strength = opts.magnitude;
    params.noise = Math.min(opts.magnitude * 0.3, 0.3);
  }
  if (opts.enhanceStrength !== null) params.strength = opts.enhanceStrength;
  if (opts.enhanceNoise !== null) params.noise = opts.enhanceNoise;

  // Defaults if nothing specified
  if (params.strength === undefined) params.strength = 0.5;
  if (params.noise === undefined) params.noise = 0.1;

  params.extra_noise_seed = params.seed;

  // Upscale dimensions
  if (opts.upscale > 1) {
    params.width = opts.width * opts.upscale;
    params.height = opts.height * opts.upscale;
  }

  return {
    input: opts.prompt,
    model: "nai-diffusion-4-5-full",
    action: "img2img",
    parameters: params,
  };
}

function buildInpaintPayload(opts, imageBase64, maskBase64) {
  const params = baseParams(opts);

  params.image = imageBase64;
  params.mask = maskBase64;
  params.strength = opts.inpaintStrength;
  params.extra_noise_seed = params.seed;

  return {
    input: opts.prompt,
    model: "nai-diffusion-4-5-full",
    action: "infill",
    parameters: params,
  };
}

// ─── API calls ───────────────────────────────────────────────────────────────

async function callNovelAI(apiKey, payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NovelAI API ${res.status}: ${text.slice(0, 500)}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

async function callDirector(apiKey, tool, imageBase64, opts) {
  const body = {
    image: imageBase64,
    width: opts.width,
    height: opts.height,
    req_type: tool,
  };

  // Tool-specific fields
  if (tool === "colorize") {
    body.defry = opts.defry;
    if (opts.prompt) body.prompt = opts.prompt;
  }
  if (tool === "emotion") {
    body.prompt = opts.prompt || "neutral";
    body.defry = opts.emotionLevel;
  }

  const res = await fetch(DIRECTOR_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NovelAI Director API ${res.status}: ${text.slice(0, 500)}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

function extractPng(zipBuffer) {
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();
  const png = entries.find((e) => e.entryName.endsWith(".png"));
  if (!png) throw new Error("No PNG found in API response.");
  return png.getData();
}

// ─── Prompt validation (soft warnings) ───────────────────────────────────────

function validatePrompt(opts) {
  if (!opts.prompt) return;
  const p = opts.prompt;
  const warns = [];

  if (p.includes("rating:explicit") && !p.includes("-1::censored::")) {
    warns.push("rating:explicit without -1::censored:: — censoring artifacts likely (see PROMPTS.md)");
  }

  if (!p.includes("{") && !p.includes("::")) {
    warns.push("No emphasis syntax ({tag} or N::tag::) — key elements won't be prioritized (see PROMPTS.md)");
  }

  const redundant = ["masterpiece", "very aesthetic"].filter((t) => p.includes(t));
  if (redundant.length) {
    warns.push(`Redundant tag(s): ${redundant.join(", ")} — already auto-appended by qualityToggle`);
  }

  if (opts.ref && !(/year\s+\d{4}/).test(p)) {
    warns.push("No 'year XXXX' tag — consider adding for period-specific style reinforcement");
  }

  if (p.includes("rating:explicit") && !p.trimStart().startsWith("rating:explicit")) {
    warns.push("rating:explicit should be the FIRST tag for strongest influence (see PROMPTS.md)");
  }

  if (p.length < 500) {
    warns.push(`Prompt is only ${p.length} chars — target 500-1100 for proper anatomy (see PROMPTS.md)`);
  }

  if (p.includes("from behind") || p.includes("from_behind")) {
    const frontTags = ["pussy", "clitoris", "navel", "nipples"].filter((t) => p.includes(t));
    if (frontTags.length) {
      warns.push(`Spatial conflict: 'from behind' with front-view tags [${frontTags.join(", ")}] — will distort anatomy`);
    }
  }

  if (warns.length) {
    console.warn(`\n⚠️  Prompt warnings (${warns.length}):`);
    for (const w of warns) console.warn(`   • ${w}`);
    console.warn("");
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  await loadEnv();
  const opts = parseArgs();

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  const apiKey = process.env.NOVELAI_API_KEY;
  if (!apiKey) {
    console.error("Error: NOVELAI_API_KEY not set. Add to .env or set as env var.");
    process.exit(1);
  }

  console.log(`\nAction: ${opts.action}${opts.directorTool ? ` (${opts.directorTool})` : ""}`);

  // ── Director Tools ──
  if (opts.action === "director") {
    if (!opts.directorTool) {
      console.error(`Error: specify a director tool: ${DIRECTOR_TOOLS.join(", ")}`);
      process.exit(1);
    }
    if (!opts.image) {
      console.error("Error: --image is required for director tools.");
      process.exit(1);
    }

    console.log(`Processing: ${opts.image} with ${opts.directorTool}...`);
    const imageBase64 = await loadImageBase64(opts.image);
    const result = await callDirector(apiKey, opts.directorTool, imageBase64, opts);

    await fs.mkdir(opts.out, { recursive: true });
    const outPath = path.join(opts.out, `${opts.directorTool}_${Date.now()}.png`);

    // Director returns PNG directly (not zipped)
    try {
      const pngData = extractPng(result);
      await fs.writeFile(outPath, pngData);
    } catch {
      await fs.writeFile(outPath, result);
    }

    console.log(`Saved: ${outPath}`);
    return;
  }

  // ── Actions that require a prompt ──
  if (!opts.prompt && opts.action !== "enhance") {
    console.error("Error: --prompt is required. Use --help for usage.");
    process.exit(1);
  }

  validatePrompt(opts);

  // ── Vibe Transfer ──
  if (opts.action === "vibe") {
    if (opts.vibes.length === 0) {
      console.error("Error: at least one --vibe is required for vibe mode.");
      process.exit(1);
    }

    console.log(`Preparing ${opts.vibes.length} vibe reference(s)...`);
    const vibeBase64s = [];
    for (const v of opts.vibes) {
      vibeBase64s.push(await prepareReferenceImage(v));
    }

    const payload = buildVibePayload(opts, vibeBase64s);
    console.log(`Generating: ${opts.width}×${opts.height}, seed=${payload.parameters.seed}, scale=${opts.scale}, steps=${opts.steps}`);
    console.log(`  Vibes: ${opts.vibes.length}, strengths=[${payload.parameters.reference_strength_multiple.join(", ")}]`);

    const zipBuffer = await callNovelAI(apiKey, payload);
    const pngData = extractPng(zipBuffer);

    await fs.mkdir(opts.out, { recursive: true });
    const outPath = path.join(opts.out, `vibe_${Date.now()}.png`);
    await fs.writeFile(outPath, pngData);
    console.log(`Saved: ${outPath} (${(pngData.length / 1024).toFixed(0)} KB)`);
    return;
  }

  // ── Enhance (img2img) ──
  if (opts.action === "enhance") {
    if (!opts.image) {
      console.error("Error: --image is required for enhance mode.");
      process.exit(1);
    }

    console.log(`Enhancing: ${opts.image}...`);
    const imageBase64 = await loadImageBase64(opts.image);

    const payload = buildEnhancePayload(opts, imageBase64);
    const p = payload.parameters;
    console.log(`  ${opts.width * opts.upscale}×${opts.height * opts.upscale}, strength=${p.strength}, noise=${p.noise}, seed=${p.seed}`);

    const zipBuffer = await callNovelAI(apiKey, payload);
    const pngData = extractPng(zipBuffer);

    await fs.mkdir(opts.out, { recursive: true });
    const outPath = path.join(opts.out, `enhanced_${Date.now()}.png`);
    await fs.writeFile(outPath, pngData);
    console.log(`Saved: ${outPath} (${(pngData.length / 1024).toFixed(0)} KB)`);
    return;
  }

  // ── Inpaint ──
  if (opts.action === "inpaint") {
    if (!opts.image || !opts.mask) {
      console.error("Error: --image and --mask are required for inpaint mode.");
      process.exit(1);
    }

    console.log(`Inpainting: ${opts.image} with mask ${opts.mask}...`);
    const imageBase64 = await loadImageBase64(opts.image);
    const maskBase64 = await loadImageBase64(opts.mask);

    const payload = buildInpaintPayload(opts, imageBase64, maskBase64);
    console.log(`  ${opts.width}×${opts.height}, strength=${opts.inpaintStrength}, seed=${payload.parameters.seed}`);

    const zipBuffer = await callNovelAI(apiKey, payload);
    const pngData = extractPng(zipBuffer);

    await fs.mkdir(opts.out, { recursive: true });
    const outPath = path.join(opts.out, `inpaint_${Date.now()}.png`);
    await fs.writeFile(outPath, pngData);
    console.log(`Saved: ${outPath} (${(pngData.length / 1024).toFixed(0)} KB)`);
    return;
  }

  // ── Generate (default) ──
  let refBase64 = null;
  if (opts.ref) {
    console.log("Preparing reference image...");
    refBase64 = await prepareReferenceImage(opts.ref);
  }

  const payload = buildGeneratePayload(opts, refBase64);
  console.log(`Generating: ${opts.width}×${opts.height}, seed=${payload.parameters.seed}, scale=${opts.scale}, steps=${opts.steps}`);
  if (opts.ref) {
    console.log(`  Ref: strength=${opts.strength}, fidelity=${opts.fidelity}, info=${opts.infoExtracted}`);
  }
  if (payload.parameters.sm || payload.parameters.sm_dyn) {
    console.log(`  SMEA: ${payload.parameters.sm_dyn ? "DYN" : "standard"}`);
  }

  const zipBuffer = await callNovelAI(apiKey, payload);
  const pngData = extractPng(zipBuffer);

  await fs.mkdir(opts.out, { recursive: true });
  const outPath = path.join(opts.out, `gen_${Date.now()}.png`);
  await fs.writeFile(outPath, pngData);
  console.log(`Saved: ${outPath} (${(pngData.length / 1024).toFixed(0)} KB)`);
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
});
