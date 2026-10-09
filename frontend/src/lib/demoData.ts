/**
 * Editorial Research Studio Demo & Baseline Data
 * Derived from the prototype and the Lenny Podcast archive corpus.
 * Every passage is verbatim from transcripts; notes are cited in the margin.
 */

import { Citation, ArtifactData, SessionData, GrowthBriefData } from '../types';

export const CSP_HEADER = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; font-src data:; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; media-src 'none'; form-action 'none'; base-uri 'none'">`;

export const CITATION_LIBRARY: Record<string, Omit<Citation, 'id' | 'refIndex'>> = {
  vohra: {
    speaker: 'Rahul Vohra',
    affiliation: 'Superhuman',
    episodeTitle: 'How Superhuman Built an Engine for Growth',
    episodeUrl: 'https://www.lennyspodcast.com/guests/rahul-vohra/',
    provenanceStamp: 'Chunk 142 · rank №1 · semantic 0.61',
    quote:
      'We took the users who said they’d be very disappointed and asked what benefit they got, in their own words. Once we understood what delighted them, we could chart a path so every new user experienced that same delight — as quickly as possible.',
  },
  winters: {
    speaker: 'Casey Winters',
    affiliation: 'Growth advisor',
    episodeTitle: 'Retention: The Core of Growth',
    episodeUrl: 'https://www.lennyspodcast.com/guests/casey-winters/',
    provenanceStamp: 'Chunk 17 · rank №4 · semantic 0.52',
    quote:
      'If your retention curve doesn’t flatten, you don’t have a growth problem — you have a leaking bucket. The best growth teams spend their first months flattening the curve before they pour anything in.',
  },
  mazal: {
    speaker: 'Jorge Mazal & Jackson Gates',
    affiliation: 'Duolingo',
    episodeTitle: 'How Duolingo Reignited User Growth',
    episodeUrl: 'https://www.lennyspodcast.com/guests/jorge-mazal/',
    provenanceStamp: 'Chunk 61 · rank №3 · semantic 0.57',
    quote:
      'The streak became the anchor of the habit loop. We focused on making the first lesson fast and personally calibrated, because the sooner a learner succeeds on day one, the more likely the habit forms at all.',
  },
  verna: {
    speaker: 'Elena Verna',
    affiliation: 'Growth advisor',
    episodeTitle: 'How B2B Companies Grow with a Product-Led Motion',
    episodeUrl: 'https://www.lennyspodcast.com/guests/elena-verna/',
    provenanceStamp: 'Chunk 88 · rank №2 · semantic 0.59',
    quote:
      'In product-led growth, the product is the top of the funnel. Users who reach value expand themselves — seat by seat, feature by feature. Sales doesn’t chase leads; it follows usage.',
  },
  bush: {
    speaker: 'Wes Bush',
    affiliation: 'PLG author',
    episodeTitle: 'A Deep Dive on Product-Led Growth',
    episodeUrl: 'https://www.lennyspodcast.com/guests/wes-bush/',
    provenanceStamp: 'Chunk 203 · rank №1 · semantic 0.63',
    quote:
      'Your pricing page should sell the outcome, not the feature list. Self-serve buyers scan for one thing: which plan matches my problem. Make that decision take ten seconds.',
  },
  campbell: {
    speaker: 'Patrick Campbell',
    affiliation: 'ProfitWell',
    episodeTitle: 'How to Price and Package Your Product',
    episodeUrl: 'https://www.lennyspodcast.com/guests/patrick-campbell/',
    provenanceStamp: 'Chunk 44 · rank №2 · semantic 0.55',
    quote:
      'Test one pricing change at a time and watch activation alongside revenue. The cheapest conversion win is almost always clarity — not discounts.',
  },
};

export const PLATE_HTML_CONTENT = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Activation experiment — first-project templates</title>
<style>
:root{--paper:#FBF9F3;--ink:#26292B;--muted:#6E7170;--accent:#B65E45;--soft:#F4E4DB;--line:#E7E0D2}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.62 Georgia,"Times New Roman",serif;padding:44px 36px 56px}
.doc{max-width:540px;margin:0 auto}
.kicker{font:600 10px/1 ui-monospace,Menlo,monospace;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);margin:0 0 14px}
h1{font-size:27px;line-height:1.18;margin:0 0 8px;font-weight:600;letter-spacing:-.01em}
.meta{font:italic 400 13.5px/1.5 Georgia,serif;color:var(--muted);margin:0 0 22px}
h2{font:600 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.14em;text-transform:uppercase;margin:26px 0 10px}
p{margin:0 0 12px}
.row{display:grid;grid-template-columns:128px 1fr;gap:12px;padding:9px 0;border-bottom:1px dashed var(--line)}
dt{font:600 10px/1.5 ui-monospace,Menlo,monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
dd{margin:0;font-size:14px}
.rule{background:var(--soft);border-left:2px solid var(--accent);border-radius:0 8px 8px 0;padding:12px 16px;font-size:14px}
.foot{font:italic 400 12px/1.5 Georgia,serif;color:var(--muted);margin-top:26px}
@media (max-width:520px){.row{grid-template-columns:1fr;gap:3px}body{padding:30px 22px 40px}}
</style></head><body>
<div class="doc">
<p class="kicker">Experiment brief · Flowstate</p>
<h1>First-project templates</h1>
<p class="meta">From Growth Brief · grounded in 4 transcript passages · owner: growth</p>
<h2>Hypothesis</h2>
<p>New workspaces that start from a guided template complete a first project within 7 days more often than those given a blank canvas.</p>
<h2>The change</h2>
<p>Replace the post-signup setup checklist with a template gallery step. All other setup is deferred until the first project exists.</p>
<h2>Audience &amp; split</h2>
<p>New self-serve workspaces, 50 / 50 split, running for two weeks of signups.</p>
<h2>Metrics</h2>
<dl>
<div class="row"><dt>Primary</dt><dd>% of new workspaces completing a first project within 7 days — baseline ≈ 23% (user-supplied)</dd></div>
<div class="row"><dt>Guardrails</dt><dd>Week-4 retention by cohort · support contacts per signup</dd></div>
<div class="row"><dt>Watch</dt><dd>Time-to-first-project distribution · template pick rate</dd></div>
</dl>
<h2>Decision rule</h2>
<div class="rule">Ship if the primary metric improves by ≥ 5 points absolute with no guardrail regression. Iterate between 0 and 5. Revert if week-4 retention drops at all.</div>
<p class="foot">Cast by Kestrel · examined in a sandboxed frame — scripts, forms and network are blocked.</p>
</div></body></html>`;

export const PLATE_MD_CONTENT = `# Activation without retention damage

A research memo assembled from four episodes of Lenny's Podcast.
Every claim below maps to a cited transcript passage.

## What the experts converge on

1. **Speed toward the "aha."** Profile your most delighted users, find
   the moment delight happens, and rebuild onboarding so everyone gets
   there sooner. Activation is time-to-that-behavior. [1]
2. **Flatten the curve first.** If retention doesn't flatten, acquisition
   is filling a leaking bucket. Fix the curve before the funnel. [2]
3. **Make the first win the user's win.** A first lesson, a first
   project, a first streak — the outcome belongs to the user. [3]
4. **In PLG, value reached is expansion begun.** Users who reach value
   expand themselves; sales follows usage. [4]

## Where the evidence is thin

No guest shares a controlled experiment pitting an activation change
directly against retention. Treat the pattern as expert consensus,
not causal proof — and guard retention in whatever you test.

## Sources

- Superhuman — *How Superhuman Built an Engine for Growth* (Rahul Vohra)
- *Retention: The Core of Growth* (Casey Winters)
- Duolingo — *How Duolingo Reignited User Growth* (Jorge Mazal)
- *How B2B Companies Grow with a Product-Led Motion* (Elena Verna)`;

export const INITIAL_ARTIFACTS: Record<string, ArtifactData> = {
  a1: {
    id: 'a1',
    file: 'activation-one-pager.html',
    kind: 'html',
    title: 'Activation experiment — first-project templates',
    src: PLATE_HTML_CONTENT,
    mdHtml: PLATE_HTML_CONTENT,
    version: 1,
    impression: 'first impression · v1',
  },
  a2: {
    id: 'a2',
    file: 'activation-research-memo.md',
    kind: 'markdown',
    title: 'Research memo — activation vs. retention',
    src: PLATE_MD_CONTENT,
    mdHtml: PLATE_MD_CONTENT,
    version: 1,
    impression: 'first impression · v1',
  },
};

export const INITIAL_GROWTH_BRIEF: GrowthBriefData = {
  id: 'brief-1',
  sessionId: 'pricing',
  title: 'Improve week-one activation without harming retention',
  sub: 'A structured deliverable drafted from the dossier’s research — sections are editable, so click any paragraph and revise it.',
  version: 1,
  impressionsCount: 1,
  sections: [
    {
      num: 'I.',
      title: 'Problem',
      badge: 'User context',
      badgeType: 'user',
      content:
        'Flowstate is a seed-stage B2B task manager with self-serve sign-up — roughly 400 trials a month. Sign-ups are steady, but only about 23% of new workspaces complete a first project within seven days, and week-4 retention tracks that first project almost perfectly. Goal: raise week-one activation without degrading retention or support load.',
    },
    {
      num: 'II.',
      title: 'Research & evidence',
      badge: 'Transcript evidence',
      badgeType: 'evidence',
      evidenceItems: [
        {
          text: 'Speed toward the delighted users’ “aha” — activation is time-to-that-behavior, not steps completed',
          refIndex: 1,
        },
        {
          text: 'Flatten the retention curve before pouring acquisition into the funnel',
          refIndex: 2,
        },
        {
          text: 'First-run success must be the user’s own outcome, not a product checklist',
          refIndex: 3,
        },
        {
          text: 'In product-led growth, reached-value users expand themselves — define activation as value, not seat invitations',
          refIndex: 4,
        },
      ],
    },
    {
      num: 'III.',
      title: 'Recommendation',
      badge: 'Assistant synthesis',
      badgeType: 'synthesis',
      content:
        'Rebuild first-run around a single outcome — a real first project completed in the first session — by replacing the setup checklist with a guided template gallery, and instrument time-to-first-project as the activation metric. Watch the retention curve by cohort; any loss of flattening is a stop signal.',
      assumptions:
        'Assumes templates meaningfully cut blank-page time, and that the signup-to-first-project drop is exploration friction rather than weak intent. The archive offers expert pattern, not causal proof for this product — see the experiment below.',
    },
    {
      num: 'IV.',
      title: 'Experiment',
      experiment: {
        hypothesis:
          'New workspaces that start from a guided template complete a first project within 7 days more often than those given a blank canvas.',
        change:
          'Replace the post-signup checklist with a template gallery step; defer all other setup until the first project exists.',
        audience: 'New self-serve workspaces, 50 / 50 split, two weeks of signups.',
        primaryMetric:
          '% of new workspaces completing a first project within 7 days — baseline ≈ 23% (user-supplied).',
        guardrails: 'Week-4 retention by cohort · support contacts per signup.',
        decisionRule:
          'Ship at ≥ +5 points absolute with no guardrail regression; iterate between 0 and 5; revert if retention drops.',
      },
    },
    {
      num: 'V.',
      title: 'Next deliverable',
    },
  ],
};

export const INITIAL_SESSIONS: Record<string, SessionData> = {
  pricing: {
    id: 'pricing',
    num: '01',
    title: 'Pricing page teardown — Flowstate',
    meta: 'query · 2 notes',
    kind: 'pricing',
    entries: [
      {
        id: 'q-pricing',
        kind: 'query',
        queryText: 'What makes a pricing page convert for a self-serve B2B product?',
        queryMeta: {
          time: 'Yesterday · 4:12 PM',
          modeLabel: 'Query',
          hasContext: false,
        },
        createdAt: '2026-10-08T16:12:00Z',
      },
      {
        id: 'a-pricing',
        kind: 'answer',
        answerData: {
          lead: 'Two ideas recur across the pricing conversations: match plans to the buyer’s problem rather than your feature list, and optimize for decision speed. A self-serve visitor is scanning for “which one is mine” — clarity beats cleverness, and both beat discounts.',
          sections: [
            {
              rn: 'I',
              h: 'Match plans to buyer jobs',
              bodyHtml:
                'Wes Bush’s framing is that a pricing page should sell the outcome. Self-serve buyers arrive with a job to do; the page’s only job is to mirror their problem back in plain language and attach a plan to it{{bush}}. Feature matrices force the buyer to translate — and translation is where self-serve conversion goes to die.',
              citedRefIndices: [1],
            },
            {
              rn: 'II',
              h: 'Clarity over discounting',
              bodyHtml:
                'Patrick Campbell’s caution on sequencing: test one pricing change at a time, and watch activation alongside revenue — the cheapest conversion win is almost always clarity, not a lower number{{campbell}}.',
              citedRefIndices: [2],
            },
          ],
          stamp: 'Set in qwen2.5:1.5b · local — 2 citations verified',
        },
        citations: [
          {
            id: 'sn-pricing-1',
            refIndex: 1,
            ...CITATION_LIBRARY.bush,
          },
          {
            id: 'sn-pricing-2',
            refIndex: 2,
            ...CITATION_LIBRARY.campbell,
          },
        ],
        createdAt: '2026-10-08T16:12:05Z',
      },
    ],
    artifacts: [],
    briefCount: 0,
    noteSeq: 2,
    plateSeq: 0,
    createdAt: '2026-10-08T16:12:00Z',
    updatedAt: '2026-10-08T16:12:05Z',
  },
  empty1: {
    id: 'empty1',
    num: '02',
    title: 'Onboarding email sequence ideas',
    meta: 'blank dossier',
    kind: 'empty',
    entries: [
      {
        id: 'blank-1',
        kind: 'blank',
        createdAt: '2026-10-09T09:00:00Z',
      },
    ],
    artifacts: [],
    briefCount: 0,
    noteSeq: 0,
    plateSeq: 0,
    createdAt: '2026-10-09T09:00:00Z',
    updatedAt: '2026-10-09T09:00:00Z',
  },
  empty2: {
    id: 'empty2',
    num: '03',
    title: 'Duolingo growth loops — notes',
    meta: 'blank dossier',
    kind: 'empty',
    entries: [
      {
        id: 'blank-2',
        kind: 'blank',
        createdAt: '2026-10-09T10:00:00Z',
      },
    ],
    artifacts: [],
    briefCount: 0,
    noteSeq: 0,
    plateSeq: 0,
    createdAt: '2026-10-09T10:00:00Z',
    updatedAt: '2026-10-09T10:00:00Z',
  },
};
