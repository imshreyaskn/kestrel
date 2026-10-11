/**
 * Editorial Research Studio — DESIGN TOUR fixtures only.
 *
 * Everything in this module is used exclusively by the UI States Tray
 * ("design tour") to preview key visual states. Tour data is never sent to
 * the backend, never persisted, and is clearly marked in the rail and
 * viewer as "design tour · not persisted". All real user interactions hit
 * PostgreSQL through the typed API client.
 */

import { ArtifactData, GrowthBriefData, SessionData } from '../types';

export const CSP_HEADER = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; font-src data:; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; media-src 'none'; form-action 'none'; base-uri 'none'">`;

export const CITATION_LIBRARY: Record<string, Omit<import('../types').Citation, 'id' | 'refIndex'>> = {
  vohra: {
    speaker: 'Rahul Vohra',
    affiliation: 'Superhuman',
    episodeTitle: 'How Superhuman Built an Engine for Growth',
    episodeUrl: 'https://www.lennyspodcast.com/guests/rahul-vohra/',
    provenanceStamp: 'design tour fixture · not a live retrieval',
    quote:
      'We took the users who said they’d be very disappointed and asked what benefit they got, in their own words. Once we understood what delighted them, we could chart a path so every new user experienced that same delight — as quickly as possible.',
  },
  winters: {
    speaker: 'Casey Winters',
    affiliation: 'Growth advisor',
    episodeTitle: 'Retention: The Core of Growth',
    episodeUrl: 'https://www.lennyspodcast.com/guests/casey-winters/',
    provenanceStamp: 'design tour fixture · not a live retrieval',
    quote:
      'If your retention curve doesn’t flatten, you don’t have a growth problem — you have a leaking bucket. The best growth teams spend their first months flattening the curve before they pour anything in.',
  },
  mazal: {
    speaker: 'Jorge Mazal & Jackson Gates',
    affiliation: 'Duolingo',
    episodeTitle: 'How Duolingo Reignited User Growth',
    episodeUrl: 'https://www.lennyspodcast.com/guests/jorge-mazal/',
    provenanceStamp: 'design tour fixture · not a live retrieval',
    quote:
      'The streak became the anchor of the habit loop. We focused on making the first lesson fast and personally calibrated, because the sooner a learner succeeds on day one, the more likely the habit forms at all.',
  },
  verna: {
    speaker: 'Elena Verna',
    affiliation: 'Growth advisor',
    episodeTitle: 'How B2B Companies Grow with a Product-Led Motion',
    episodeUrl: 'https://www.lennyspodcast.com/guests/elena-verna/',
    provenanceStamp: 'design tour fixture · not a live retrieval',
    quote:
      'In product-led growth, the product is the top of the funnel. Users who reach value expand themselves — seat by seat, feature by feature. Sales doesn’t chase leads; it follows usage.',
  },
  bush: {
    speaker: 'Wes Bush',
    affiliation: 'PLG author',
    episodeTitle: 'A Deep Dive on Product-Led Growth',
    episodeUrl: 'https://www.lennyspodcast.com/guests/wes-bush/',
    provenanceStamp: 'design tour fixture · not a live retrieval',
    quote:
      'Your pricing page should sell the outcome, not the feature list. Self-serve buyers scan for one thing: which plan matches my problem. Make that decision take ten seconds.',
  },
  campbell: {
    speaker: 'Patrick Campbell',
    affiliation: 'ProfitWell',
    episodeTitle: 'How to Price and Package Your Product',
    episodeUrl: 'https://www.lennyspodcast.com/guests/patrick-campbell/',
    provenanceStamp: 'design tour fixture · not a live retrieval',
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
.rule{background:var(--soft);border-left:2px solid var(--accent);border-radius:0;padding:12px 16px;font-size:14px}
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
<h2>Audience & split</h2>
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

export const TOUR_ARTIFACTS: Record<string, ArtifactData> = {
  a1: {
    id: 'a1',
    file: 'activation-one-pager.html',
    kind: 'html',
    title: 'Activation experiment — first-project templates',
    src: PLATE_HTML_CONTENT,
    mdHtml: PLATE_HTML_CONTENT,
    version: 1,
    impression: 'design tour plate · not persisted',
  },
  a2: {
    id: 'a2',
    file: 'activation-research-memo.md',
    kind: 'markdown',
    title: 'Research memo — activation vs. retention',
    src: PLATE_MD_CONTENT,
    mdHtml: PLATE_MD_CONTENT,
    version: 1,
    impression: 'design tour plate · not persisted',
  },
};

export const TOUR_BRIEF: GrowthBriefData = {
  id: 'tour-brief',
  sessionId: 'pricing',
  title: 'Improve week-one activation without harming retention',
  version: 1,
  status: 'draft',
  productContext: null,
  problem:
    'Flowstate is a seed-stage B2B task manager with self-serve sign-up — roughly 400 trials a month. Sign-ups are steady, but only about 23% of new workspaces complete a first project within seven days, and week-4 retention tracks that first project almost perfectly. Goal: raise week-one activation without degrading retention or support load.',
  researchSummary:
    'Speed toward the delighted users’ “aha” — activation is time-to-that-behavior, not steps completed. Flatten the retention curve before pouring acquisition into the funnel. First-run success must be the user’s own outcome, not a product checklist. In product-led growth, reached-value users expand themselves — define activation as value, not seat invitations.',
  recommendation:
    'Rebuild first-run around a single outcome — a real first project completed in the first session — by replacing the setup checklist with a guided template gallery, and instrument time-to-first-project as the activation metric. Watch the retention curve by cohort; any loss of flattening is a stop signal.',
  assumptions:
    'Assumes templates meaningfully cut blank-page time, and that the signup-to-first-project drop is exploration friction rather than weak intent. The archive offers expert pattern, not causal proof for this product — see the experiment below.',
  experiment: {
    hypothesis:
      'New workspaces that start from a guided template complete a first project within 7 days more often than those given a blank canvas.',
    change:
      'Replace the post-signup checklist with a template gallery step; defer all other setup until the first project exists.',
    segment: 'New self-serve workspaces, 50 / 50 split, two weeks of signups.',
    success_metric:
      '% of new workspaces completing a first project within 7 days — baseline ≈ 23% (user-supplied).',
    guardrail_metric: 'Week-4 retention by cohort · support contacts per signup.',
    decision_rule:
      'Ship at ≥ +5 points absolute with no guardrail regression; iterate between 0 and 5; revert if retention drops.',
  },
  risks:
    'The archive offers expert pattern, not causal proof for this specific product.\nIf the signup drop is weak intent rather than exploration friction, templates will not move activation.\nSupport load may shift from setup questions to template-choice questions.',
  nextDeliverable:
    'A Ship 30-style essay arguing that activation improves when you narrow the first run — or a one-pager experiment plate cast from this brief.',
  isDemo: true,
};

// ---------------------------------------------------------------------------
// Design-tour sessions (rail group: "Design tour")
// ---------------------------------------------------------------------------
const TOUR_META = 'design tour · not persisted';
const nowIso = () => new Date().toISOString();

function tourAnswer(
  idBase: string,
  lead: string,
  sections: Array<{ h: string; paragraphs: string[] }>,
  citations: import('../types').Citation[],
  stamp: string
): import('../types').ManuscriptEntry {
  return {
    id: `ans-${idBase}`,
    kind: 'answer',
    answerData: {
      lead,
      sections: sections.map((s, idx) => ({
        rn: ['I', 'II', 'III', 'IV'][idx] ?? '§',
        h: s.h,
        paragraphs: s.paragraphs,
      })),
      stamp,
    },
    citations,
    createdAt: nowIso(),
  };
}

export const TOUR_SESSIONS: Record<string, SessionData> = {
  'live-act': {
    id: 'live-act',
    num: 'T1',
    title: 'Improving activation without hurting retention',
    meta: TOUR_META,
    kind: 'demo',
    isDemo: true,
    entries: [
      {
        id: 'q-act',
        kind: 'query',
        queryText:
          'How can an early-stage SaaS improve activation without hurting retention?',
        queryMeta: {
          time: 'Today · 2:15 PM',
          modeLabel: 'Query',
          hasContext: true,
        },
        createdAt: nowIso(),
      },
      tourAnswer(
        'act',
        'The pattern across the interviews is consistent: activation gains that hold up come from narrowing the first run — carrying a new user to one personally meaningful outcome, faster — not from adding steps, tours, or pressure. Retention follows the value, not the funnel.',
        [
          {
            h: 'Find the moment worth speeding toward',
            paragraphs: [
              'Rahul Vohra describes how Superhuman used its product-market-fit survey as a map rather than a score: profile the users who would be “very disappointed” without the product, find what they were actually doing when delight happened, then rebuild onboarding so every new user reaches that same moment sooner. The activation metric that falls out is time-to-that-behavior — not steps completed. [E1]',
            ],
          },
          {
            h: 'Read the retention curve before touching the funnel',
            paragraphs: [
              'Casey Winters is blunt about sequencing: retention is the core of growth, and a curve that never flattens means acquisition is filling a leaking bucket. Before shipping onboarding changes, find which cohorts flatten, where the drop concentrates, and whether the users you are activating are the ones who stay. [E2]',
            ],
          },
          {
            h: 'Make the first outcome the user’s own',
            paragraphs: [
              'Duolingo’s turnaround focused on the habit itself — a first lesson that is fast and calibrated to the learner, wrapped in a streak the learner owns. The lesson transfers: define activation as the user’s first real success — a project created, a first aha — not a checklist the product imposes. [E3]',
            ],
          },
          {
            h: 'In self-serve B2B, activation is the expansion engine',
            paragraphs: [
              'Elena Verna’s framing for product-led growth: the product is the funnel. Users who reach value expand their own accounts, and sales follows usage signals instead of cold outreach. That only compounds when “activated” means reached-value — not “invited five teammates.” [E4]',
            ],
          },
        ],
        [
          { id: 'sn-live-act-E1', refIndex: 1, ...CITATION_LIBRARY.vohra },
          { id: 'sn-live-act-E2', refIndex: 2, ...CITATION_LIBRARY.winters },
          { id: 'sn-live-act-E3', refIndex: 3, ...CITATION_LIBRARY.mazal },
          { id: 'sn-live-act-E4', refIndex: 4, ...CITATION_LIBRARY.verna },
        ],
        'design tour fixture — compose a real query to bind live citations'
      ),
    ],
    artifacts: [],
    briefCount: 0,
    noteSeq: 4,
    plateSeq: 0,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },

  pricing: {
    id: 'pricing',
    num: 'T2',
    title: 'Pricing page teardown — Flowstate',
    meta: TOUR_META,
    kind: 'demo',
    isDemo: true,
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
      tourAnswer(
        'pricing',
        'Two ideas recur across the pricing conversations: match plans to the buyer’s problem rather than your feature list, and optimize for decision speed. A self-serve visitor is scanning for “which one is mine” — clarity beats cleverness, and both beat discounts.',
        [
          {
            h: 'Match plans to buyer jobs',
            paragraphs: [
              'Wes Bush’s framing is that a pricing page should sell the outcome. Self-serve buyers arrive with a job to do; the page’s only job is to mirror their problem back in plain language and attach a plan to it [E1]. Feature matrices force the buyer to translate — and translation is where self-serve conversion goes to die.',
            ],
          },
          {
            h: 'Clarity over discounting',
            paragraphs: [
              'Patrick Campbell’s caution on sequencing: test one pricing change at a time, and watch activation alongside revenue — the cheapest conversion win is almost always clarity, not a lower number [E2].',
            ],
          },
        ],
        [
          { id: 'sn-pricing-E1', refIndex: 1, ...CITATION_LIBRARY.bush },
          { id: 'sn-pricing-E2', refIndex: 2, ...CITATION_LIBRARY.campbell },
        ],
        'design tour fixture — compose a real query to bind live citations'
      ),
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
    num: 'T3',
    title: 'Onboarding email sequence ideas',
    meta: TOUR_META,
    kind: 'demo',
    isDemo: true,
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
};
