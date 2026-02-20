#!/usr/bin/env node
/**
 * NovelAI Pipeline — V4.5 Precise Reference Generator
 *
 * Generates images using NovelAI's nai-diffusion-4-5-full model with
 * style transfer via Precise Reference (director_reference_* fields).
 *
 * Setup:  Create .env with NOVELAI_API_KEY=<your key>
 * Usage:  node generate.mjs --prompt "1girl, solo, nude" --ref refs/etch_baroque.png
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

// ─── CLI argument parser ─────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    prompt: null,
    negative: null,
    ref: null,
    refCaption: "style",
    strength: 1,
    fidelity: 0,       // API: 0 = max fidelity, 1 = min fidelity
    infoExtracted: 1,
    width: 832,
    height: 1216,
    scale: 6,
    steps: 28,
    seed: null,
    cfgRescale: 0.4,
    sampler: "k_euler_ancestral",
    noiseSchedule: "karras",
    out: "output",
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = () => args[++i];
    switch (a) {
      case "--prompt": case "-p": opts.prompt = next(); break;
      case "--negative": case "-n": opts.negative = next(); break;
      case "--ref": case "-r": opts.ref = next(); break;
      case "--ref-caption": opts.refCaption = next(); break;
      case "--strength": case "-s": opts.strength = +next(); break;
      case "--fidelity": case "-f": opts.fidelity = +next(); break;
      case "--info-extracted": opts.infoExtracted = +next(); break;
      case "--width": case "-w": opts.width = +next(); break;
      case "--height": case "-h": opts.height = +next(); break;
      case "--scale": opts.scale = +next(); break;
      case "--steps": opts.steps = +next(); break;
      case "--seed": opts.seed = +next(); break;
      case "--cfg-rescale": opts.cfgRescale = +next(); break;
      case "--sampler": opts.sampler = next(); break;
      case "--noise-schedule": opts.noiseSchedule = next(); break;
      case "--out": case "-o": opts.out = next(); break;
      case "--help": opts.help = true; break;
      default:
        if (!opts.prompt) opts.prompt = a;
        else console.warn(`Unknown arg: ${a}`);
    }
  }
  return opts;
}

function printHelp() {
  console.log(`
NovelAI Pipeline — V4.5 Precise Reference Generator

USAGE:
  node generate.mjs --prompt "<tags>" [--ref <image>] [options]

REQUIRED:
  --prompt, -p <tags>       Danbooru-style prompt tags

REFERENCE (Precise Reference / Style Transfer):
  --ref, -r <path>          Reference image path (resized to large res automatically)
  --ref-caption <text>      Caption for reference (default: "style")
  --strength, -s <0-1>      Reference strength (default: 1)
  --fidelity, -f <0-1>      Reference fidelity; 0=max, 1=min (default: 0)
  --info-extracted <0-1>    Information extraction level (default: 1)

GENERATION:
  --negative, -n <tags>     Negative prompt tags (appended to ucPreset)
  --width, -w <px>          Output width (default: 832)
  --height, -h <px>         Output height (default: 1216)
  --scale <1-10>            CFG scale (default: 6)
  --steps <1-50>            Sampling steps (default: 28)
  --seed <int>              RNG seed (default: random)
  --cfg-rescale <0-1>       CFG rescale (default: 0.4)
  --sampler <name>          Sampler (default: k_euler_ancestral)
  --noise-schedule <name>   Noise schedule (default: karras)

OUTPUT:
  --out, -o <dir>           Output directory (default: output)

ENVIRONMENT:
  NOVELAI_API_KEY           Set in .env or as env var
`);
}

// ─── Image preprocessing ─────────────────────────────────────────────────────

/**
 * NovelAI V4.5 requires reference images at one of three large resolutions.
 * Selects the closest match based on aspect ratio, then scales + pads with black.
 */
const LARGE_RESOLUTIONS = [
  { w: 1024, h: 1536, label: "portrait" },
  { w: 1472, h: 1472, label: "square" },
  { w: 1536, h: 1024, label: "landscape" },
];

async function prepareReferenceImage(imagePath) {
  const sharp = (await import("sharp")).default;
  const meta = await sharp(imagePath).metadata();
  const aspect = meta.width / meta.height;

  // Pick closest resolution by aspect ratio
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

// ─── Payload builder ─────────────────────────────────────────────────────────

function buildPayload(opts, refBase64) {
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 32);
  const negPrompt = opts.negative || "";

  const params = {
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
    autoSmea: false,
    dynamic_thresholding: false,
    legacy: false,
    cfg_rescale: opts.cfgRescale,
    noise_schedule: opts.noiseSchedule,
    skip_cfg_above_sigma: null,
    use_coords: false,
    legacy_uc: false,
    normalize_reference_strength_multiple: true,
    prefer_brownian: true,

    // V4.5 prompt objects
    v4_prompt: {
      caption: { base_caption: opts.prompt, char_captions: [] },
      use_coords: false,
      use_order: true,
    },
    v4_negative_prompt: {
      caption: { base_caption: negPrompt, char_captions: [] },
      legacy_uc: false,
    },
    negative_prompt: negPrompt,
  };

  // Precise Reference fields (only if --ref provided)
  if (refBase64) {
    params.director_reference_images = [refBase64];
    params.director_reference_descriptions = [
      {
        caption: { base_caption: opts.refCaption, char_captions: [] },
        legacy_uc: false,
      },
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

// ─── API call ────────────────────────────────────────────────────────────────

const API_URL = "https://image.novelai.net/ai/generate-image";

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

function extractPng(zipBuffer) {
  const zip = new AdmZip(zipBuffer);
  for (const entry of zip.getEntries()) {
    if (entry.entryName.endsWith(".png")) {
      return entry.getData();
    }
  }
  throw new Error("No PNG found in API response ZIP");
}
// ─── Prompt validation (soft warnings) ───────────────────────────────────────

function validatePrompt(opts) {
  const p = opts.prompt;
  const warns = [];

  // Explicit content without anti-censorship tag
  if (p.includes("rating:explicit") && !p.includes("-1::censored::")) {
    warns.push("rating:explicit without -1::censored:: — censoring artifacts likely (see PROMPTS.md)");
  }

  // No emphasis syntax used
  if (!p.includes("{") && !p.includes("::")) {
    warns.push("No emphasis syntax ({tag} or N::tag::) — key elements won't be prioritized (see PROMPTS.md)");
  }

  // Redundant quality tags (auto-appended by qualityToggle)
  const redundant = ["masterpiece", "very aesthetic"].filter((t) => p.includes(t));
  if (redundant.length) {
    warns.push(`Redundant tag(s): ${redundant.join(", ")} — already auto-appended by qualityToggle`);
  }

  // Missing year tag with reference image
  if (opts.ref && !(/year\s+\d{4}/).test(p)) {
    warns.push("No 'year XXXX' tag — consider adding for period-specific style reinforcement");
  }

  // rating:explicit not first
  if (p.includes("rating:explicit") && !p.trimStart().startsWith("rating:explicit")) {
    warns.push("rating:explicit should be the FIRST tag for strongest influence (see PROMPTS.md)");
  }

  // Prompt too sparse
  if (p.length < 500) {
    warns.push(`Prompt is only ${p.length} chars — target 500-1100 for proper anatomy (see PROMPTS.md)`);
  }

  // Spatial consistency: from behind + front-view tags
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

  if (!opts.prompt) {
    console.error("Error: --prompt is required. Use --help for usage.");
    process.exit(1);
  }

  // Prompt compliance warnings (see PROMPTS.md)
  validatePrompt(opts);

  const apiKey = process.env.NOVELAI_API_KEY;
  if (!apiKey) {
    console.error("Error: NOVELAI_API_KEY not set. Add to .env or set as env var.");
    process.exit(1);
  }

  // Prepare reference image if provided
  let refBase64 = null;
  if (opts.ref) {
    console.log("Preparing reference image...");
    refBase64 = await prepareReferenceImage(opts.ref);
  }

  // Build and send payload
  const payload = buildPayload(opts, refBase64);
  console.log(`Generating: ${opts.width}×${opts.height}, seed=${payload.parameters.seed}, scale=${opts.scale}, steps=${opts.steps}`);
  if (opts.ref) {
    console.log(`  Ref: strength=${opts.strength}, fidelity=${opts.fidelity}, info=${opts.infoExtracted}`);
  }

  const zipBuffer = await callNovelAI(apiKey, payload);
  const pngData = extractPng(zipBuffer);

  // Save output
  await fs.mkdir(opts.out, { recursive: true });
  const timestamp = Date.now();
  const outPath = path.join(opts.out, `gen_${timestamp}.png`);
  await fs.writeFile(outPath, pngData);
  console.log(`Saved: ${outPath} (${(pngData.length / 1024).toFixed(0)} KB)`);
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
});
