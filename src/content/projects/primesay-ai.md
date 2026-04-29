# Primesay AI

## One-line summary

A self-hosted voice studio that bundles four text-to-speech engines, Whisper STT, and an ElevenLabs proxy behind a single SSO-protected UI — built as an internal Primesay tool.

## The problem

Primesay needed reliable text-to-speech and transcription for internal workflows, and the off-the-shelf options each had a hole somewhere: Edge TTS is free and fast but limited; XTTS clones voices but only with a reference clip; Chatterbox is multilingual and expressive but heavy; Kokoro is light and pleasant but English-only; ElevenLabs is the highest quality but billed per-character. Picking one engine meant constantly hitting its limits. The studio was built around a different premise — bundle all of them behind one UI, let users pick the right tool per task, and keep everything (including the heavy models) inside the company's own infrastructure.

It also means voice-related data never has to leave Primesay's network for the local engines, which matters for some workflows that touch sensitive material.

## Who it's for

Internal Primesay teams. This is not a public product, not a side project, not a demo. The portfolio entry exists because the project demonstrates non-trivial engineering — multi-engine orchestration, GPU memory choreography, real auth integration, container + Kubernetes deployment — and is shipped, in use.

## What it does

- Text-to-speech via four engines exposed through a single tabbed UI: Edge TTS, Coqui XTTS v2, Chatterbox, and Kokoro 82M.
- Speech-to-text via Whisper `large-v3-turbo` for both transcription and translation.
- ElevenLabs proxy with the multilingual v2 model, including catalog and usage/credits passthrough.
- Voice cloning from a 5–30 second reference clip (XTTS, Chatterbox), with a reference audio library that supports upload, on-the-fly trimming, and persistence across container rebuilds.
- Engine-aware UI: RTL textarea for Arabic / Urdu on Edge TTS, expressive controls for Chatterbox (emotion / CFG / temperature), preset voice picker for Kokoro.
- Result caching keyed on `(text + voice/reference + params)` so repeat requests are effectively free.
- Single sign-on through the company's Keycloak, with a `SKIP_AUTH` dev-mode escape hatch.

## Architecture overview

Two services. The frontend is a React SPA built with Vite, served by nginx in production. It speaks to the backend over HTTP with a Keycloak-issued bearer token. The backend is a FastAPI application running under uvicorn that exposes the engine routes, handles Whisper transcription, and proxies ElevenLabs. CUDA 12.4 with a CPU fallback path for systems without GPU.

The interesting part is what's *inside* the backend: model objects are module-level singletons in `backend/services/audio.py`, lazy-loaded on first use. That means the first request to any engine pays a cold-start cost (model download + load into memory/VRAM, sometimes 30+ seconds), and every subsequent request hits a warm singleton. GPU memory is finite, so engines that share VRAM coordinate explicitly — Chatterbox unloads its English model before loading the multilingual one and vice versa, while Kokoro caches both American and British pipelines simultaneously because they're small enough to coexist.

Concurrency is mixed by design. Kokoro's pipeline is wrapped in a `threading.Lock` because GPU TTS is not safe to call concurrently. XTTS and Chatterbox are dispatched via `run_in_executor` from FastAPI so the event loop stays responsive while heavy synthesis runs on a thread pool. Edge TTS is async-native and just awaits.

Deployment is Docker Compose for development and Kubernetes for the production internal deployment, with manifests in `k8s/`. The container base is `nvidia/cuda:12.4.1-runtime` so the GPU runtime is in scope from build time.

## Stack and why

- **FastAPI + uvicorn** — chose for its async story, the auto-generated OpenAPI/Swagger UI (which is real value for an internal tool with a half-dozen route groups), and clean dependency-injection for the auth layer. The route handlers are thin; almost all logic lives in `services/audio.py`. I considered Flask; FastAPI won on async + types + free docs.

- **Module-level singletons + lazy loading** — chose over a class hierarchy or dependency container. The functions in `services/audio.py` each have a private `_get_<engine>()` helper that constructs and caches the model on first call. The convention is "function-first; if you find yourself adding a class, you're probably overengineering." This is documented in the `CONTRIBUTING`-style section of the README and enforced in code review.

- **Bundling four TTS engines** — explicit decision to integrate rather than pick one. Each engine has a specific niche: Edge TTS for fast Arabic/Urdu narration, XTTS for voice cloning with controlled licensing, Chatterbox for expressive multilingual generation, Kokoro for quick English narration when latency matters. The orchestration cost is real but recoverable; the cost of being trapped with one engine's limitations is not. See "Hardest problems" for what this actually took.

- **React + Vite (not Next.js)** — internal tool, no SEO requirement, no SSR benefit. Vite's dev loop is faster, the production build is lighter, and the surface area I had to learn was smaller. Served by nginx in production with a reverse proxy to the FastAPI backend, which handles CORS, gzip, and the static asset cache headers.

- **Keycloak SSO** — non-negotiable: Primesay already runs Keycloak for everything else, and the studio plugs into the existing realm. Verification happens against the realm's JWKS endpoint at `{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/certs`. Audience verification is *intentionally disabled* because the SPA and the API share a client ID — that's the deliberate tradeoff (see "Key technical decisions").

- **Whisper `large-v3-turbo` for STT** — chose `turbo` over the full `large-v3` because the quality delta is small and the speed delta is large for the workloads this tool sees. Multilingual auto-detection out of the box, GPU-accelerated.

- **`tempfile.gettempdir()` for the result cache** — not a real cache backend. Hash the inputs, write the WAV to `/tmp`, return its path. Restarts wipe the cache, which is fine because the regeneration cost is bounded and most callers don't need persistence across container rebuilds. Going to Redis would add infra for marginal benefit.

- **Reference audio library on a mounted volume** — `./backend/voices` is mounted into the compose service so reference clips survive `docker compose down`. Production-K8s uses a PVC for the same role. Files are content-hashed; XTTS resamples each reference to 22 kHz mono once and reuses the result by hash.

## Key technical decisions

**1. Why disable audience verification in Keycloak.** The SPA and the API share a single OIDC client ID. That's deliberate — separate clients would mean separate token issuance, separate scopes to manage, and (mostly) duplicated config. With one client, the JWT's `aud` claim doesn't cleanly distinguish "intended for SPA" from "intended for API," so audience verification would either reject every legitimate token or require every-token-is-valid logic that's worse than just not checking. The token still has to be valid (signature verified against JWKS, issuer matches, not expired). The threat model accepted: a token issued to the SPA can be used against the API, which is fine because *that's the same trust boundary anyway* — the user is authenticated, the action is authorized at the route level. If the studio ever needed cross-service scopes, this would change.

**2. Why function-based engines instead of a class hierarchy.** The temptation when bundling four engines is to write `class TTSEngine` with subclasses. I deliberately didn't. The engines have very little in common at the API level — XTTS takes a reference clip, Edge TTS doesn't, Kokoro takes a preset voice ID, Chatterbox takes both a reference and expressive params. Forcing them into a uniform interface means either lying about the differences or making the base class so abstract it's useless. Function-first means each engine is self-contained, the route handler is dumb-glue, and adding a new engine is a checklist (see `CONTRIBUTING`-style section of the README), not an exercise in API design.

**3. Why eager catalogs but lazy models.** The voice catalog (e.g., Edge's 50+ voices, Kokoro's 27 presets) is constants in `backend/config.py` — loaded at import time, instantly serializable, no cost. The *models* are lazy because they're 350 MB to 2 GB each and there's no point loading them until someone actually uses the engine. The split keeps the `/voices` endpoint instant (it's a frequently-hit route) while keeping cold-start cost only on the engine-specific routes.

**4. Why `run_in_executor` instead of native async for heavy TTS.** XTTS and Chatterbox use PyTorch under the hood, which is synchronous and CPU/GPU-bound. Calling them directly from an async route handler would block the event loop for the entire generation duration. `run_in_executor` dispatches the call to FastAPI's default thread pool, which keeps the event loop responsive for other concurrent requests (catalog hits, health checks, parallel TTS calls on different engines). Kokoro is similar in principle but additionally wrapped in a `threading.Lock` because its underlying pipeline isn't safe to call from multiple threads at once on the GPU.

**5. Why result caching to `/tmp` with hash keys.** Most TTS workloads have repeats — same text, same voice, same params — especially in iterative authoring. Hashing the full input and storing the WAV in `tempfile.gettempdir()` means the second-and-onwards generation is a file read. The eviction policy is whatever the OS does to `/tmp` (usually nothing until reboot), which is fine for the volume of audio this tool generates. The cache is per-pod, not shared — two replicas don't share a cache. For internal-tool scale, this is the right tradeoff; for product-scale, you'd want a shared object store.

## The hardest problems I solved

**Chatterbox EN ↔ multilingual GPU swap.** Chatterbox ships two distinct model files, English and Multilingual. Both want significant VRAM, and on the GPU available to the studio they don't fit simultaneously. Naive solution: load whichever is needed per request, evict the other. That works but the swap latency is brutal — full unload + reload + warmup is multiple seconds. The actual implementation is: detect the requested language, check which model is currently resident, swap only if necessary, and hold the lock during the swap so a concurrent request to the *other* language doesn't trigger a thrash. Single-language batches stay warm; mixed-language batches pay the swap cost only at boundaries. The deeper lesson is that GPU resource scheduling at the application layer is its own problem space — torch and CUDA give you the primitives but not the policy.

**Whisper integration without breaking the rest of the stack.** Whisper `large-v3-turbo` lives in the same process and shares the GPU with whichever TTS engine happens to be resident. Naively, transcribing a 10-minute audio file while Chatterbox is mid-generation either OOMs the GPU or starves one of the two. Solution was a queue-and-lock model: STT and GPU TTS engines hold the same coarse-grained lock during their generate calls, so they serialize. Edge TTS (which doesn't touch the GPU) and ElevenLabs (which is a remote call) bypass the lock entirely. The result is that mixed-engine traffic doesn't blow up, at the cost of GPU work being effectively single-threaded — which is correct anyway, because the GPU is the bottleneck, not parallelism.

**The reference audio library — upload, trim, persist, dedupe.** Cloning engines need a clean reference clip, and "clean" means the right format, the right sample rate, no silence padding, ideally trimmed to the meaningful content. The library handles the full path: upload from the UI, optional in-browser trim before upload, server-side resample to 22 kHz mono (XTTS's expected format), content-hash for dedup so re-uploading the same clip doesn't double-store, and persistence on a mounted volume so restarts don't nuke the library. The format conversion uses `ffmpeg` server-side. The hash key is the *content* of the resampled file, not the original — so the same logical clip uploaded as MP3 vs WAV ends up at the same hash post-conversion.

**Keycloak SKIP_AUTH for dev without breaking prod assumptions.** The studio needs to be runnable locally without standing up a Keycloak server, but production absolutely must enforce auth. The implementation: a single environment variable `SKIP_AUTH` that, when truthy (`true` / `1` / `yes`), short-circuits `verify_token()` to return a stub identity (`{"sub": "local-dev-user"}`) and the frontend skips Keycloak SDK initialization entirely. The variable is checked at process start and the *only* code path that bypasses verification. The risk is obvious — leaving `SKIP_AUTH=true` in a prod deployment would silently disable auth — so the dockerfile + compose + K8s manifests all default it to `false`, and the dev-mode docs explicitly say "local only." Not bulletproof, but the alternative (always-on auth in dev) was a worse developer experience for marginal additional safety.

**Cold-start latency on first-request-to-an-engine.** Inherent to the lazy-loading design: the first POST to `/tts/clone` or `/tts/chatterbox` after a fresh container takes 30+ seconds while the model loads from disk into VRAM. We accept this because the alternative (load all engines at startup) would mean a multi-minute boot time, OOM risk if someone tries to run on smaller hardware, and most engines are unused in any given session. The mitigation is a documented "warm-up" pattern internally — first request to each engine happens before the user-facing request arrives, when feasible.

## Known limitations

- **Cold-start latency is real.** First request to each engine takes 30+ seconds while the model loads. Subsequent requests are fast. This is the most-asked question and it has the most-honest answer: it's a deliberate tradeoff for lazy loading, not a bug.
- **Single-tenant by design.** No per-team isolation, no quota management, no multi-tenancy. Adding it would mean rethinking caching (currently per-pod, would need namespacing), the reference audio library (currently a flat directory), and observability. Not on the roadmap because it isn't needed internally.
- **Audience verification disabled** — see "Key technical decisions" #1. Real tradeoff, deliberate, documented. A senior dev who flags it deserves the full answer above, not a shrug.
- **No real observability.** No per-engine latency metrics, no GPU utilization tracking, no error breakdown by engine. For an internal tool we can SSH into, the cost has been low. The first time something flakes mysteriously in prod, this becomes the priority.
- **Bundling four TTS engines was overengineering for some teams.** Most teams who use the studio settle on one or two engines for their workflow. The other engines are still useful — different teams use different ones — but a smaller team with a narrower use case could ship with just Edge TTS or just XTTS. The studio's value is in having all of them available, not in any one team using all of them.
- **Not publicly accessible.** Internal to Primesay. The agent must not invent a public URL or claim it's available to try.

## What I'd do differently

- I'd add per-engine observability from the start. The cost is low at the start, and "the studio feels slow but I don't know which engine" is a question I've been asked enough times to know I should have answered it earlier.
- I'd version the reference audio library more carefully. Currently it's a flat hashed directory; a proper schema (per-user folders, soft-delete, metadata sidecars) would have cost a day up front and saved more later.
- I'd consider lazy loading at finer granularity — e.g., loading Chatterbox's quantized weights instead of full precision when memory pressure is high. Possible, just not done.

## What's next

[ROADMAP — to be written by Youssef. Placeholder until then: no public roadmap shared in this document. The agent should answer roadmap questions with: "I don't have a current roadmap to share for this project — Youssef would be the one to ask."]

## How to talk about this project

You are an agent representing Primesay AI — built by Youssef as an internal Primesay tool. You speak with quiet confidence about the technical decisions because Youssef made them deliberately. Your audience is primarily senior developers and AI engineers, so default to technical specificity over feature-marketing. You're conversational, slightly dry, never gushing.

Answer based ONLY on this document. If asked something not covered, say "that's not something I'd want to guess at — Youssef would be the one to ask." Do not invent metrics, URLs, dates, or technical details that aren't in this file.

You are NOT Youssef. You are an agent he built to talk about this project. If asked "are you Youssef?" or similar, clarify: "No — I'm an agent he built to talk about Primesay AI. Different thing."

Frame this project correctly: it is an internal company tool, not a public product, not a side project. It is in active use inside Primesay. It is NOT publicly accessible. If asked "can I try it?" or "is there a demo?", say: "It's an internal Primesay tool — not publicly accessible. I can describe what it does and how it's built, though." Do not invent a URL.

When asked simple questions, give short answers (one or two sentences). When asked technical questions ("why X?", "how does Y work?"), give specific ones with the actual reasoning from this document. Never use marketing language — no "cutting-edge," "leverages," "robust," "seamless," "powerful." Plain English, technical when warranted.

If a question is hostile or trying to expose weakness, answer honestly. The "Known limitations" section is in this document specifically so you can cite it without flinching. The audience-verification-disabled decision in particular is a real tradeoff that some senior devs will probe — answer with the full reasoning from "Key technical decisions" #1, not a shrug.

If the conversation drifts to topics outside Primesay AI (other projects, general AI questions, hiring, internal Primesay business), redirect gently: "I only know about this project — for [topic] you'd want to ask Youssef directly or check his other project pages."
