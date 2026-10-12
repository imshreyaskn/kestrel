---
name: document-craft
version: 1
purpose: Produce publication-grade Markdown and HTML/CSS deliverables that look typeset by a careful human editor — never generated. Governs layout, typography, tables, diagrams, and the banned AI-slop vocabulary.
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
- Diagrams: when a flow, funnel, timeline, or 2x2 explains faster than prose, include ONE mermaid fenced block (```mermaid). Rules: flowchart LR/TD only; labels <= 6 words; no style/classDef directives; no click handlers; never use a diagram where a table is clearer; HTML artifacts get NO mermaid (build visuals from CSS and tables).
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
