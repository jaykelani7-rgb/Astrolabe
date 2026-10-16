# Local AI quality follow-up — 16 October 2026

This update improves source selection and limits unsupported elaboration. Local AI remains experimental: reference integrity and answer coverage do not establish factual accuracy or a complete explanation.

## Changes

- The source index now includes nested variable/function declarations, with separate top-level and runtime metadata. The default Zustand snapshot has 182 symbols: the original 102 top-level declarations plus 80 nested declarations. Function overload signatures are retained in the source index but are not preferred as runtime implementations.
- Retrieval prioritizes a named implementation and its short enclosing body before lexical references. It can include bounded same-file implementation aliases. Explicit module names distinguish helpers such as React versus traditional `createImpl`; an explicit middleware implementation takes priority over its barrel export.
- Questions asking about connections retain cross-file evidence. Exact selections still supply only their selected range. Current-file and snapshot boundaries remain strict. Wrong-file search results are rejected before ranking can hide them. Walkthrough scope still uses its server-resolved authored source targets.
- The existing limits remain eight evidence chunks and 10,000 source characters. Long implementations use bounded indexed windows. The system does not execute the studied repository or claim to build a runtime call graph.
- Local generation uses one short block, up to 70 words, with an 800-character schema bound. Callback definitions, function calls, assignment direction and external-library uncertainty are made explicit in the prompt. Shorter answers reduce unsupported extra claims but may omit useful detail.
- Live evaluation records retrieved paths/ranges/hashes and hashes of the implementation files, captures those hashes before generation, writes a separate timestamped report, and disables prepared matching and answer cache.

## Development evidence

The initial integration produced eight answers and eight evidence gaps across the 16 development questions, with no provider failures and no invalid references. It selected middleware/type references before vanilla `setState`, missed nested implementations and confused React entry points.

A first definition-focused run recovered all 12 supported questions and returned four gaps. It still added incorrect callback/initialization claims. One-block runs kept the same response coverage with more cautious wording, but some answers became too brief to explain the requested mechanism. A two-block trial restored detail and also restored misleading elaboration. Both behaviors are recorded; the conservative format is retained.

The frozen final run returned **12 live answers, four evidence gaps, zero unavailable responses and zero invalid references** across 16 development questions. Median latency was **4,257.08 ms**, p95 **5,315.50 ms**, across all outcomes. The initial baseline median was 8,283.70 ms. Retrieval, prompt length, answer format and model warm state differ; this is an observed local result, not a controlled performance benchmark.

The implementation source review still flags **Q01 for correction**: its wording can imply notification on every call and omits the identity guard. **Q03, Q07, Q08 and Q10 remain incomplete** about callbacks, listener argument order, assignment direction or merge precedence. Correct references and a returned answer do not close those issues. These findings are recorded separately from the untouched raw report; no independent human approval or accuracy percentage is claimed.

Final checks: **132/132 service tests** across seven files, **13/13 browser journeys** (25.9 seconds), **16/16 production API groups**, and TypeScript/production build passed. A fresh production HTTP question about the identity guard returned the exact condition with citations confined to the selected 66–81 range. An unreachable loopback provider returned unavailable while the known prepared question remained usable. The eight held-out questions were excluded throughout. These are development measurements after tuning, not an independent accuracy evaluation.

## Model comparison

Compared the already installed Qwen2.5-Coder-7B-Instruct Q4_K_M and Qwen3.5-9B 4-bit models on the same four development questions, with the same two-block candidate policy. No additional weights were downloaded. Only one model was kept loaded at a time.

The 9B model still described an invented React callback/fallback relationship and said API properties attach to the hook's return value rather than the hook function. The 7B trial also used misleading wording about how the bound hook is created. A larger model did not resolve these failures in this small comparison; the lighter 7B model is retained with the shorter format. This is not a general benchmark of either model.

The active model is `qwen2.5-coder-7b-instruct`, alias `astrolabe-coder`, GGUF Q4_K_M, 4,683,074,048 bytes on disk. LM Studio reported one parallel prediction and an actual 32,768-token context despite an 8,192-token request. The source sent by Astrolabe remains bounded independently of that runtime setting. The 9B comparison model was unloaded afterward.

## What still needs review

1. Check every substantive answer against its cited source; classify unsupported wording separately from omitted details. A valid reference can support only part of an answer.
2. Require sufficient mechanism detail for selector callbacks, attaching API methods to hook functions, merge precedence and equality-based notification. A true purpose summary may still fail to answer “how”.
3. Review paraphrases and questions outside the prepared sample. New retrieval tests include explicit middleware and alternate entry-point questions, but tests of retrieved source do not establish generated-answer correctness.
4. Keep held-out evaluation and independent human claim review separate from implementation tuning. Do not convert these development results into an accuracy or onboarding-improvement percentage.
5. Keep the authored prepared demo path and evidence navigation available. Proceed with teach-back and goal-based contribution UI using the existing backend contracts while content review continues.

Raw baseline, candidate, model-comparison, final and regression records are preserved under `/Users/shashwat/Documents/Codex/2026-10-16/astrolabe-audit/ai-quality-followup/`. The earlier project audit remains the historical starting point for this work.

Implementation source review details: `source-review.json` beside the raw reports. The application is left running on `http://127.0.0.1:3000` with the 7B local provider. No commit or push was made.
