# Skills & Artifacts Audit — Ship 30 for 30 Skill (§4.2), Artifact Generation & Viewer (§4.3), Mermaid & Output Quality

**Target:** github.com/imshreyaskn/kestrel @ `0881858`
**Contract source:** `Forward_Deployed_Engineer_Take_Home_Assignment_12_Oct_2026.docx` §4.2, §4.3 + Security expectation (read in full)
**External research:** ship30for30.com ultimate guide (fetched, principle-by-principle comparison), mermaid security advisories 2021-2026, nh3/bleach status.
**Interpretation note:** "clean sleek and non ai looking with gradients emojies and all other stuff" is read as: artifacts must *avoid* the AI-slop tells (gradients, emoji, glassmorphism, glow, generic hero layouts) — consistent with the repo's own anti-slop doctrine (design research §15).
**Companion reports:** harness (`kestrel-harness-audit.md`, IDs A/B/D/E/F/G), backend (`backend-architecture-audit.md`, BA*), design (`design-implementation-audit.md`).

---

## 0. Verdict

| Area | Contract compliance | Quality vs "top-notch" bar |
|---|---|---|
| **§4.2 Ship 30 for 30 skill** | ✅ **fully met** — the strongest compliance area in the repo | B+ — faithful principle encoding, but no headline craft, no exemplar skeleton, and a model-tier realism problem |
| **§4.3 Artifact generation + viewer** | ✅ met (one letter-of-contract wrinkle: AR2) | C+ — security is A-grade; **generation quality direction is absent**, the markdown renderer has real parser gaps, and the margin plate shows raw markdown |
| **Security expectation** | ✅✅ **exceeded** — sanitizer + CSP + sandbox + written explanation of permits/blocks/why | A |
| **Mermaid awareness** (new requirement) | ❌ **zero support anywhere in the stack** — agent doesn't know it exists, no renderer exists | n/a — full implementation plan in §4 |
| **Anti-slop output quality** (new requirement) | ❌ nothing in any prompt forbids gradients/emoji/glassmorphism; the sanitizer permits all of it | the repo *owns* a complete anti-slop doctrine (design §15) and **none of it reaches the generator** |

The pattern across this audit: the *contract* is satisfied and the *security story* is genuinely excellent, but the **quality ceiling of generated artifacts is set entirely by model defaults**, because the prompts give zero design direction. The fix is architectural in the good sense: the runtime-skill system already exists (loader, versioning, frontmatter) and is used by exactly one skill — adding a second skill (`document-craft`) is the intended extension mechanism, and §5 of this report contains its full text ready to drop in.

---

## 1. §4.2 audit — Ship 30 for 30 content skill

### 1.1 Contract matrix (assignment bullet → implementation)

| Assignment requirement | Implementation | Verdict |
|---|---|---|
| "Dedicated skill or tool … not an unstructured one-off prompt" | `runtime-skills/ship-30-for-30/SKILL.md` + `SkillLoader` (versioned frontmatter, graceful degradation to a one-line fallback, unit-tested) injected into essay-mode system prompt | ✅ a real skill system, not a prompt blob |
| "Read the linked source, identify the relevant writing principles, encode them" | See fidelity check §1.2 | ✅ verified against the actual guide |
| "Approximately 1,250 words" | Prompt target + **hard validator gate** 1,150-1,350 (`ESSAY_MIN/MAX_WORDS`) with typed error, one repair, honest 422 | ✅✅ enforced, not requested |
| "Strong hook and clear narrative progression" | SKILL.md: four named hook types; "problem/tension → evidence-backed insight → explanation/examples → actionable implications → useful takeaway"; quality pass checks hook↔evidence match | ✅ |
| "Skimmable formatting: headings, bullets, selective bold" | SKILL.md draft requirements: meaningful headings, short-to-medium paragraphs, bullets for steps/comparisons, "selective bold emphasis only for important ideas" | ✅ |
| "A specific, useful takeaway" | "One concrete takeaway or next action" in outline + draft + quality-pass item 6 | ✅ |
| "Claims grounded in the transcript knowledge base" | SKILL.md grounding rules 1-7 (exact-substring quotes only, no invented studies/metrics/attributions, evidence-ID discipline, inference vs source-claim separation) + pipeline enforcement (citation pruning, ID validation) | ✅✅ strongest section of the skill |

### 1.2 Fidelity to the actual guide (fetched ship30for30.com ultimate guide)

The guide's core frameworks — the **4A paths** (Actionable / Analytical / Aspirational / Anthropological), outline-first ("a skeleton to fill in… easier than a 100% blank page"), **specific audience as a binary filter** ("creating something for everyone means creating something for no one"), headline craft, skimmability formatting, and rate-of-revelation pacing — are all genuinely encoded in SKILL.md, including the `writing_path` enum in the output schema mirroring the 4A paths ([guide](https://www.ship30for30.com/post/how-to-start-writing-online-the-ship-30-for-30-ultimate-guide)). Spec §8.4's "summarize its principles, don't copy verbatim" is honored. **Fidelity verdict: high — this is a real encoding of the source, not a vibe-based approximation.**

### 1.3 Gaps (findings SK1-SK5)

**SK1 · S3 · patch — no headline/hook craft, no structural exemplar.** The guide devotes a whole framework to headlines; SKILL.md says "strong specific hook" and lists four hook *types* but gives no patterns and no skeleton. Small/mid models produce far better structure from a shape to fill than from adjectives. Add to SKILL.md:

```markdown
## Headline patterns (choose one, adapt, never use verbatim)
- "How to {outcome} without {sacrifice}" — tension-forward, actionable path.
- "{N} {lessons|mistakes|signals} from {specific source/situation}" — analytical path.
- "The {surprising mechanism} behind {familiar outcome}" — anthropological path.
- "I/We used to {problem state}. {Change} changed it." — aspirational path, only when the
  evidence supports the arc; never fabricate a personal story.
Banned: "In today's fast-paced world", "Unlock your potential", listicle numbers with no
specific noun, colons followed by a vague promise.

## Skeleton (fill, then vary)
1. Hook (2-4 sentences): concrete scene, tension, or sharp claim the evidence can carry.
2. Promise + audience (1-2 sentences): what the reader gets, who it's for.
3. Sections II-V: one idea each — claim → evidence [E#] → mechanism → implication.
4. Turn: the non-obvious insight (the "rate of revelation" payoff) — must arrive by 60%.
5. Takeaway: one concrete next action, testable this week.
6. Close: one line. No recap of the headings.
```

**SK2 · S3 · docs+UX — model-tier realism.** The essay contract (strict JSON, 1,150-1,350 words, distributed citations, ~2k output tokens) is paired by default with **qwen2.5:1.5b**, which the repo's own transcript 001 shows struggling to emit JSON without a prose preamble. Combined with harness findings B1 (no num_ctx/max output set → truncation) and E2 (no length override), the default local path likely produces `ESSAY_LENGTH_OUT_OF_RANGE`/`MODEL_OUTPUT_INVALID` loops. Fixes: harness B1/E2/D3 first; then document a model-tier matrix in README + SKILL.md frontmatter metadata (`min_model_tier: mid`), and have the UI show a one-line hint when essay mode is selected on the local 1.5b model ("essays need a larger model — switch provider or expect drafts to fail the length contract"). Honest capability labeling is on-brand for this repo.

**SK3 · S4 — the skill system serves one skill.** Artifact modes get a single line of instruction while a full loader sits idle (→ §5 `document-craft`). Also: "turns grounded answers into essays" works *via conversation context* (prior answers are in history) — acceptable, but SKILL.md should say so explicitly ("when the conversation already contains a grounded answer, rebuild it as an essay — do not re-argue from scratch; reuse its citations where the evidence set still contains them").

**SK4 · S4 — `writing_path` unvalidated and invisible.** The schema field accepts any string (harness F17); the UI never surfaces it. Validate against the 4A enum in `validator.py` (one `Literal`), show it as a stamp on the essay entry ("Path: Analytical") — cheap credibility signal that proves the skill is real to an evaluator.

**SK5 · S4 — skill version parsed, never used.** `RuntimeSkill.version` loads but nothing logs or stamps it. Log `skill=ship-30-for-30@v1` at draft time and store in message metadata — one line, makes skill regressions traceable (spec §11.1 wants exactly this class of provenance).

---

## 2. §4.3 audit — Artifact generation & in-app viewer

### 2.1 Contract matrix

| Assignment requirement | Implementation | Verdict |
|---|---|---|
| Generate Markdown documents **or** complete HTML/CSS **based on the current conversation** | `artifact_markdown` / `artifact_html` modes; `conversation_context` + `product_context` passed to gateway; typed schema with `source_evidence_ids` validated against the run's evidence map | ✅ |
| Viewer **beside the chat**, "similar to Claude Artifacts" | Margin plate (`PlateAside`) inside the manuscript column + full viewer (`PlateViewerModal`) with Preview/Source toggle — the same duality Claude ships | ✅ (one wrinkle: AR2) |
| "renders the result **instead of displaying only raw code**" | Modal: markdown → `MarkdownViewer`, HTML → sandboxed iframe ✅. **Margin mini-plate for markdown artifacts renders raw markdown text as prose** (`api.ts:247` maps `mdHtml = a.content`; `PlateAside` wraps it in a serif `<body>`) — `##` headings and `|` tables displayed literally in the beside-chat view | ⚠️ AR2 |
| Security: treat HTML as untrusted; isolation/sanitization; evaluator understands permits/blocks/why | See §2.2 | ✅✅ |

### 2.2 Security posture — A-grade, keep exactly as is

`nh3` (Rust/ammonia) allowlist sanitization — the current recommended replacement for deprecated bleach, ~20× faster and actively maintained ([nh3](https://github.com/messense/nh3), [PyPI](https://pypi.org/project/nh3/)) — with tag/attribute allowlists, URL-scheme restriction, forced `rel="noopener noreferrer"`; CSS layer stripping `@import`, external `url()`, `expression()`, `behavior:`; server-side `preview_content` derivation at save time; `sandbox=""` iframes (no scripts, no same-origin, no forms, no popups) + injected CSP meta (`default-src 'none'; script-src 'none'; connect-src 'none'…`); README §4 and the Limitations section explain **what is blocked and why** ("deliberately prevents interactive JavaScript… to ensure strict zero-XSS safety in v1") — which is precisely the assignment's "evaluator should be able to understand what the viewer permits, blocks, and why." Spec §9.1's demanded payload tests exist in `tests/unit/security/`. **No changes recommended except AR4's prompt-honesty fix.**

### 2.3 Quality findings (AR1-AR7)

**AR1 · S2 (against the owner's quality bar) · structural (prompt-layer) — generation has no design direction; AI-slop passes straight through.** The complete instruction set for HTML artifacts is:

```text
WORKFLOW MODE: Standalone HTML Artifact
Generate a clean, standalone HTML document with embedded inline styles.
Do NOT include scripts, external stylesheets, or external images.
```

"Clean" is the entire aesthetic contract. Meanwhile the sanitizer permits `style` attributes and `<style>` blocks (by design), and the CSS filter blocks only *external* references — so `linear-gradient`, emoji, glassmorphism `backdrop-filter`, glow shadows, purple-blue palettes, centered-hero + three-card grids, and Inter all render perfectly. Default LLM HTML output is exactly that slop. The irony: this repo **owns** a complete anti-slop doctrine (design research §15, written for its own UI) and none of it reaches the generator. Fix = the `document-craft` skill (§5) injected into both artifact modes via the existing loader — the skill architecture finally earning its plural.

**AR2 · S3 · patch — margin plate shows raw markdown for MD artifacts.** Fix: render markdown minis through the already-safe `MarkdownViewer` (React elements, no `dangerouslySetInnerHTML`) in a scaled container instead of an iframe; keep the iframe path for HTML artifacts only:

```tsx
// PlateAside.tsx
{artifact.kind === 'markdown' ? (
  <div className="plate-mini plate-mini-md" aria-hidden="true">
    <div className="plate-mini-scale"><MarkdownViewer content={artifact.src} className="pv-doc mini" /></div>
  </div>
) : (
  <div className="plate-mini" aria-hidden="true"><iframe sandbox="" tabIndex={-1} title={...} srcDoc={safeSrcDoc} /></div>
)}
```
```css
.plate-mini-md { overflow: hidden; }
.plate-mini-scale { width: 200%; transform: scale(0.5); transform-origin: 0 0; pointer-events: none; }
```
(Also delete the misleading `mdHtml = content` mapping in `api.ts:247`.)

**AR3 · S3 · patch — `MarkdownViewer` parser gaps cap markdown quality.** The hand-rolled parser (correctly zero-dependency and escape-safe per §9.2) is missing, in order of damage: **tables** (growth briefs and essays constantly want them — currently rendered as literal pipe-text paragraphs), horizontal rules (`---` becomes a paragraph), headings h4-h6, nested lists, task lists, and images (`![alt](url)` renders as a stray `!` plus link). For "highest quality md files" the renderer is the bottleneck, not the model. Minimum viable upgrade: GFM tables + `---` → `<hr>` + h4-h6; images stay unrendered *by policy* (external images are blocked by CSP anyway; render `alt` text as a small-caps figure placeholder so the omission looks authored, not broken). If scope allows, swap to `marked` + `nh3`-in-TS equivalent or `markdown-it` with HTML disabled — but extending the current parser keeps the zero-dependency discipline and is ~80 lines for tables/hr/h4-6.

**AR4 · S3 · patch — inline SVG is silently stripped from HTML artifacts.** `ALLOWED_TAGS` contains no `svg` — nh3 removes it wholesale. The README documents the intent ("Visual deliverables rely entirely on responsive HTML and scoped inline CSS"), but **the model is never told**, so any SVG chart/diagram it generates vanishes, leaving a visibly broken artifact. Two options: (a) prompt-side (recommended now): the document-craft skill states "no SVG, no canvas — build visuals from CSS and tables" (and mermaid fences for markdown, §4); (b) sanitizer-side (later, needs its own security review): allow a narrow SVG subset via nh3 tag/attr allowlists — SVG carries real attack surface (`foreignObject`, animation elements, href tricks), and the CSP already blocks external refs, but don't open this without payload tests. Option (a) now, (b) never without a dedicated ADR.

**AR5 · S4 — empty artifact content validates.** `content: str = ""` default passes → blank plate persisted as complete (harness E3 extends to artifacts: require non-empty `content` and `title`, route through the typed repair).

**AR6 · S4 — brief→artifact linkage is schema-only.** `artifacts.growth_brief_id` + `ArtifactService.create_artifact(growth_brief_id=…)` exist; the pipeline never passes it, so "cast a one-pager **from our brief**" works only through conversation context. Either wire it (when the session has a current brief and mode is artifact, link it) or document the gap; the column currently implies a feature that doesn't exist.

**AR7 · S4 — viewer polish gaps** (carried from design audit): no focus trap in `PlateViewerModal` (the Fold has one — extract `useFocusTrap` and share), no FLIP origin from the margin plate (§8.8), preview/source radio has no sliding treatment. Security stamp ✓ present (`impression`).

---

## 3. Growth-brief-as-artifact note (adjacent)

The Growth Brief modal is the assignment's "highly formatted content" showcase and is structurally sound (typed five-section contract, evidence/synthesis/context badges, optimistic versioning). Its quality issues live in the backend audit (BA5 race, BA10a untyped PATCH `data`). One skill-layer addition worth making: the brief's `experiment` block should render as a small **decision table** in the Fold (hypothesis/change/segment/metric/guardrail/rule as labeled rows — it already does via `.frow` grid ✓). No finding; recorded as verified.

---

## 4. Mermaid — requirement analysis, security design, implementation plan (MM1-MM2)

**Current state: zero.** `grep -ri mermaid` across frontend+backend → no renderer, no fence handling (`MarkdownViewer` captures fences but *discards the info string* — every language renders identically as `<pre>`), no prompt awareness. A model told to use mermaid today would emit fences the viewer shows as code text.

### 4.1 Threat model (researched — this dictates the architecture)

Diagram renderers are a recurring XSS vector, and mermaid specifically has fresh CVEs: an HTML-injection vulnerability disclosed May 2026 ([CVE-2026-41149](https://www.sentinelone.com/vulnerability-database/cve-2026-41149/)); stored-XSS advisories from exactly the naive pattern — `securityLevel: "loose"` + injecting rendered SVG via `innerHTML` ([GHSA-wvh5-6vjm-23qh](https://github.com/advisories/GHSA-wvh5-6vjm-23qh), [CVE-2026-40322 in SiYuan](https://codeant.ai/vulnerability-database/cve-2026-40322)); GitLab's historical stored XSS via mermaid + CSP bypass ([H1 #1212822](https://hackerone.com/reports/1212822)); and Snyk's 2026 research on exploiting diagram renderers generally ([Snyk Labs](https://labs.snyk.io/resources/exploiting-diagram-renderers/)). Kestrel's input is **model-generated text derived from untrusted transcripts** — exactly the input class these CVEs exploit.

### 4.2 The architecture that fits this repo's doctrine

Rule the repo already lives by: *generated markup never touches the parent origin.* Therefore:

1. **Render inside an opaque-origin iframe**: `sandbox="allow-scripts"` **without** `allow-same-origin`, `srcdoc` containing a self-hosted, version-pinned mermaid bundle (no CDN — the product's own CSP philosophy forbids third-party origins; vite lazy-chunk keeps it out of the main bundle), `securityLevel: 'strict'`, theme variables matched to the dossier palette. The rendered SVG **stays inside that iframe** — nothing is postMessaged into the parent DOM except a pixel height. Even a mermaid 0-day in label sanitization lands in an opaque origin with no script access to the app.
2. **Never** `innerHTML` mermaid output into the parent (the GHSA pattern), and never `securityLevel: 'loose'`.
3. Fallback rendering: on syntax error the iframe shows a styled "diagram source" `<pre>` + error stamp — the fence content is never lost.
4. **In HTML artifacts mermaid stays banned** (their iframe is `sandbox=""`, `script-src 'none'` — no renderer can run, by design). The document-craft skill directs HTML visuals to CSS/tables, and markdown visuals to mermaid fences. Downloaded `.md` files keep raw fences, which GitHub renders natively — a free win.
5. If a future need arises to export the SVG into the parent (PDF export etc.), the sanctioned path is DOMPurify with an SVG profile on the iframe output — an ADR-worthy decision, not a default.

### 4.3 Implementation steps (frontend, ~1 day)

```tsx
// 1) MarkdownViewer.tsx — capture the fence info string (currently discarded):
if (trimmed.startsWith('```')) {
  const lang = trimmed.slice(3).trim().toLowerCase();
  ...collect fenceLines...
  if (lang === 'mermaid') { blocks.push(<MermaidFrame key={blockKey++} code={fenceLines.join('\n')} />); continue; }
  blocks.push(<pre key={blockKey++} ...><code>{fenceLines.join('\n')}</code></pre>);
}

// 2) MermaidFrame.tsx — opaque-origin renderer
import { useEffect, useRef, useState } from 'react';

const buildSrcDoc = async (code: string): Promise<string> => {
  const mermaidUrl = new URL('./mermaid-worker.ts', import.meta.url).href; // vite-built, self-hosted, pinned
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${location.origin}; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; font-src 'none'; base-uri 'none';">
<style>body{margin:0;background:transparent;font-family:Newsreader,Georgia,serif}
.err{padding:8px;color:#8B2D1F;font:12px ui-monospace,monospace}pre{white-space:pre-wrap}</style>
</head><body>
<script type="module">
  const code = ${JSON.stringify(code)};
  try {
    const { default: mermaid } = await import(${JSON.stringify(mermaidUrl)});
    mermaid.initialize({
      securityLevel: 'strict', startOnLoad: false,
      theme: 'base',
      themeVariables: { fontFamily: 'Newsreader, Georgia, serif', fontSize: '14px',
        primaryColor: '#F2F0E9', primaryBorderColor: '#4A1F3D', primaryTextColor: '#161614',
        lineColor: '#A07B8E', secondaryColor: '#E8DEE3', tertiaryColor: '#FAF8F2' },
    });
    const { svg } = await mermaid.render('d1', code);
    document.body.innerHTML = svg;                    // safe: opaque origin, stays in iframe
    parent.postMessage({ t: 'mm-height', h: document.body.scrollHeight }, location.origin);
  } catch (e) {
    const d = document.createElement('div'); d.className = 'err';
    d.textContent = 'Diagram could not be rendered — source preserved below.';
    const p = document.createElement('pre'); p.textContent = code;
    document.body.replaceChildren(d, p);
    parent.postMessage({ t: 'mm-height', h: document.body.scrollHeight }, location.origin);
  }
</script></body></html>`;
};

export const MermaidFrame: React.FC<{ code: string }> = ({ code }) => {
  const ref = useRef<HTMLIFrameElement>(null);
  const [srcDoc, setSrcDoc] = useState<string>('');
  const [h, setH] = useState(120);
  useEffect(() => { buildSrcDoc(code).then(setSrcDoc); }, [code]);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== ref.current?.contentWindow) return;
      if (e.data?.t === 'mm-height') setH(Math.min(e.data.h + 8, 900));
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);
  return <iframe ref={ref} sandbox="allow-scripts" srcDoc={srcDoc} title="Rendered diagram"
                 style={{ width: '100%', height: h, border: '1px solid var(--border)',
                          borderRadius: 4, background: 'var(--surface)' }} />;
};
```

Notes: `sandbox="allow-scripts"` without `allow-same-origin` ⇒ opaque origin (this is the load-bearing choice); the message handler validates both `origin` and `source`; mermaid enters as a **pinned** devDependency built into a worker chunk (`npm i -E mermaid@<latest-patched>`; track its advisories — the CVE cadence above is why isolation, not version-chasing alone, is the strategy); reduced-motion users are unaffected (static SVG). Add the payload tests the repo already loves: fence containing `click d1 href "javascript:…"`, HTML labels `<img onerror>`, `%%{init: {"securityLevel":"loose"}}%%` directives (strict-level init overrides must be rejected — verify mermaid honors `initialize()` over in-band config; if it doesn't, strip `%%{init` lines in `buildSrcDoc` before render).

### 4.4 Prompt-side mermaid awareness (goes into document-craft §5 + essay skill)

```text
DIAGRAMS (markdown outputs only): when a flow, funnel, timeline, or 2x2 would explain faster
than prose, include ONE mermaid fenced block (```mermaid). Rules: flowchart LR/TD only;
labels ≤ 6 words, quoted if they contain punctuation; no style/classDef directives, no click
handlers (the renderer strips them); never use a diagram where a table is clearer; HTML
artifacts get NO mermaid — build visuals from CSS and tables there.
```

---

## 5. The fix that raises the whole quality ceiling: `runtime-skills/document-craft/SKILL.md`

Ready to drop in (uses the existing loader — zero new machinery). Injected into `artifact_markdown`, `artifact_html`, and (prohibitions only) essay mode:

```markdown
---
name: document-craft
version: 1
purpose: Produce publication-grade Markdown and HTML/CSS deliverables that look typeset by a
  careful human editor — never generated. Governs layout, typography, tables, diagrams, and
  the banned AI-slop vocabulary.
---

# Document Craft (the Kestrel press sheet)

You are typesetting for a research dossier: bone paper, plum ink, letterpress restraint.
Every deliverable must look like it was set by a meticulous editor at a small press.

## Hard bans (these are the "AI look" — any one of them fails the deliverable)
- No emoji anywhere, including headings, tables, and bullets.
- No gradients, no glassmorphism/blur, no glow or neon shadows, no drop-shadow stacking.
- No purple-blue palettes, no indigo/violet accent defaults; no rainbow category colors.
- No centered hero + three equal feature cards; no full-width banner headers.
- No Inter/Roboto/system-sans as the display face; no all-caps body emphasis.
- No exclamation-mark enthusiasm, no "In today's fast-paced world", no "Let's dive in",
  no "Unlock", no "Supercharge", no recap-of-the-recap conclusions.
- No walls of bullets: bullets carry ≤ 12 words each; prose carries the argument.
- No bold emphasis on more than ~5% of words; bold marks terms, not sentences.

## Markdown rules
- Exactly one H1 (the title). H2 for sections, H3 sparingly inside them; never skip levels.
- Open with a 1-2 sentence standfirst (italic) stating what this document decides or shows.
- Use GFM tables for comparisons, metrics, experiment plans; align numeric columns right.
- Use `---` between major parts; blockquotes only for quoted transcript evidence, with [E#].
- Lists: parallel grammatical form across items; numbered only for sequences.
- Diagrams: follow the DIAGRAMS rules (one mermaid flowchart max, only when structure is the
  point). Never diagram what a table states better.
- No raw HTML inside markdown deliverables.

## HTML/CSS rules (complete standalone documents)
- <style> in <head> with :root tokens; body max-width 72ch prose column, generous margins.
- Palette: warm bone backgrounds (#FCFAF5-#F2F0E9 range), near-black plum ink (#241728-#161614),
  ONE muted accent (deep plum #4A1F3D or oxblood #8B2D1F) used < 5% of surface area.
- Type: serif display stack (Georgia/'Times New Roman' fallbacks — no external fonts, the
  viewer blocks them), humanist body, monospace only for data/labels; explicit size scale
  (e.g. 13/15/17/22/30px), line-height 1.5-1.65 for body.
- Structure like print: hairline rules (1px) instead of card boxes; small-caps letterspaced
  kickers above sections; tables with 2px top rule, 1px row rules, tabular-nums; figure
  captions in small italic; a footer colophon line ("Set in the Kestrel dossier style").
- Visuals: CSS-only (borders, rules, tinted cells, simple bar charts from divs). No SVG,
  no canvas, no scripts, no external images — the viewer strips or blocks them (security
  policy: sandboxed, script-free rendering).
- Responsive to 360px; @media print block that hides chrome. Test every color pair ≥ 4.5:1.

## Before returning, check
1. Zero emoji, zero gradients, zero glass/glow. 2. One H1; heading levels unbroken.
3. Every substantive claim grounded [E#] or explicitly framed as analysis.
4. Tables aligned; numbers right-aligned; units stated. 5. Accent color < 5% of the page.
6. Would a print editor accept this as camera-ready? If not, revise once, then return.
```

**Wiring (prompts.py, ~6 lines per mode):**

```python
elif mode == "artifact_markdown":
    craft = default_skill_loader.load_skill("document-craft")
    craft_text = craft.instructions if craft else "Produce clean, publication-grade markdown."
    mode_instructions = f"WORKFLOW MODE: Standalone Markdown Artifact\n{craft_text}"
# same injection for artifact_html; for essay mode append only the "Hard bans" + Markdown rules
# sections (split the skill text on the "## HTML/CSS rules" header to keep the essay prompt lean)
```

**Optional bounded enforcement (uses the harness report's typed-repair machinery, D2):**

```python
# validator.py — artifact branches only
_EMOJI_RE = re.compile("[\U0001F300-\U0001FAFF\u2600-\u27BF\uFE0F]")
if _EMOJI_RE.search(content):
    raise AgentOutputError("ARTIFACT_STYLE", "emoji characters are banned in deliverables")
# gradient/backdrop-filter detection: record count in message metadata (observability first,
# repair only if the data shows the prompt charter under-enforces on the target models)
```

Emoji lint is safe to repair on (no false-positive prose risk worth worrying about at this stage); gradient lint starts as telemetry to avoid over-enforcement duct tape — measure, then decide. This keeps enforcement honest: the *charter* does the work, the lint catches the one unambiguous violation class.

---

## 6. Prioritized findings

| ID | Sev | Status | Finding | Fix |
|----|-----|--------|---------|-----|
| AR1 | S2 | C1 | No design direction in artifact prompts; sanitizer permits all slop (gradients/emoji/glass) — model defaults determine quality; repo's own anti-slop doctrine never reaches the generator | document-craft skill (§5) + injection + optional emoji lint |
| MM1 | S3 | C1 | Zero mermaid support/awareness (new requirement); fence info-strings discarded | §4 plan: opaque-origin renderer iframe + prompt rules (~1 day) |
| AR3 | S3 | C1 | MarkdownViewer missing tables/hr/h4-h6/nested lists/images — caps MD quality regardless of model output | extend parser (~80 lines) or adopt marked+sanitize |
| AR2 | S3 | C1 | Margin mini-plate renders raw markdown as text (`api.ts:247` + `PlateAside`) — violates "renders the result … not raw code" in the beside-chat view | MarkdownViewer-scaled mini (§2.3 snippet) |
| SK1 | S3 | C1 | Essay skill lacks headline patterns + structural skeleton (guide's Framework #3 under-encoded) | SKILL.md additions (§1.3) |
| SK2 | S3 | C1 | Essay contract vs default 1.5b model = likely 422 loops; no tier guidance | model-tier matrix in README/skill metadata + UI hint; harness B1/E2 first |
| AR4 | S3 | C1 | Inline SVG silently stripped from HTML artifacts; prompt never tells the model | document-craft "no SVG, CSS-only visuals" rule; ADR before ever allowlisting SVG |
| SK3 | S4 | C1 | Skill system serves exactly one skill; "turn grounded answers into essays" implicit not stated | document-craft + one SKILL.md line |
| SK4 | S4 | C1 | `writing_path` unvalidated, never surfaced | Literal validation + essay-entry stamp |
| SK5 | S4 | C1 | Skill version loaded, never logged/stamped | one metadata field |
| AR5 | S4 | C1 | Empty artifact content/title validates | non-empty checks via typed repair (=harness E3) |
| AR6 | S4 | C1 | `growth_brief_id` linkage exists in schema+service, never wired | wire or document |
| AR7 | S4 | C1 | Plate viewer: no focus trap, no FLIP origin | share `useFocusTrap`; design-audit P3 |
| MM2 | — | C2 | Mermaid threat model: 2026 CVEs + stored-XSS advisories all trace to loose level + innerHTML-into-parent | architecture in §4.2 forbids both by construction |

**Confirmed vs suspected:** all C1 (code-proven) except MM2's CVE facts (C2, external advisories). No runtime probes needed for anything in this report; the mermaid init-override question (in-band `%%{init}%%` vs `initialize()`) is the one implementation detail to verify while building §4.3 — the strip-`%%{init` fallback is already specified.

## 7. Checks not completable statically
1. **Visual quality of actual generations** (does gemini-3.5-flash-lite obey the charter? does the 1.5b model produce parseable essay JSON at all?) — needs live runs per model; 5 prompts × 2 providers settles it.
2. **Mermaid bundle behavior under `securityLevel: 'strict'`** with adversarial fences — the payload-test list in §4.3 must be run once implemented.
3. **MarkdownViewer table rendering at 360-1120px** — needs the browser pass from the design audit §6.

## 8. Sequencing (folds into the existing waves)
- **With harness Wave 1 (prompt layer):** AR1 document-craft skill + injection; SK1 essay additions; AR4 rule; mermaid prompt-rules text (prompt-only parts — zero renderer dependency).
- **With harness Wave 2:** AR5/SK4/SK5/AR6 small patches; AR2 mini-plate fix.
- **New frontend wave (parallel, ~1.5 days):** AR3 parser upgrade + MM1 mermaid renderer + payload tests.
- **With Wave 3 (structured outputs):** AR1's optional lint rides the typed-repair machinery; re-measure gradient telemetry and decide on enforcement.
