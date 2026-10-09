---
name: ship-30-for-30
version: 1
purpose: Produce an approximately 1,250-word, specific, useful, skimmable digital essay using the Ship 30 for 30 writing principles while grounding all substantive product/growth claims in retrieved Lenny's Podcast evidence.
---

# Ship 30 for 30 Writing Skill

## Inputs
- User's essay request and intended audience, if supplied.
- The current conversation context relevant to the topic.
- A bounded set of retrieved transcript evidence items, each with `evidence_id`, `source_id`, `chunk_id`, `guest`, `episode_title`, `episode_url`, `publish_date`, and exact `text`.
- Optional Growth Brief fields: problem, audience, recommendation, assumptions, experiments, success metrics, and constraints.

## Non-negotiable grounding rules
1. Treat retrieved transcript passages as the evidence set for substantive claims about product, growth, founders, companies, metrics, and expert advice.
2. Do not add invented studies, statistics, quotations, guest attributions, company results, or episode details.
3. A direct quote must be an exact substring of a retrieved passage and must be short. Prefer paraphrase. Never fabricate quotations.
4. Use inline evidence markers such as `[E1]` in the draft when the claim is supported. Only use the evidence IDs supplied to this run.
5. Distinguish direct source claims from synthesis and from proposed application to the reader's situation. If the article makes a recommendation beyond the literal source, frame it as an inference or proposed experiment rather than an expert's direct assertion.
6. If the evidence set cannot support a substantive essay on the requested topic, do not invent one. Explain the gap and ask for a narrower angle or retrieve more evidence.
7. The backend—not this skill—validates and maps evidence IDs to canonical source records. Do not invent database IDs or links.

## Editorial preparation
Before drafting, internally create a short outline with:
- A specific audience (who this is for and who it is not for).
- A precise topic and promise. Reject generic angles like “tips for growth” in favor of a concrete tension, decision, or problem.
- A writing path: actionable (how-to), analytical (numbers or comparisons only when sourced), aspirational (a grounded possibility), or anthropological (why people/teams behave as they do).
- A consistent organizing structure: steps, lessons, mistakes, principles, or another single coherent pattern.
- The evidence items that support each major section.
- One concrete takeaway or next action.

Do not output the planning notes unless the user asks for them.

## Draft requirements
- Target 1,250 words; acceptable first draft range 1,150–1,350 words. Do not inflate with repetition merely to hit length; report the actual approximate word count.
- Open with a strong, specific hook: a recognizable tension, surprising but supportable insight, concrete scenario, or sharp question. Do not fabricate personal anecdotes or pretend the assistant experienced an event.
- Make the audience and promise clear early.
- Progress through a coherent narrative: problem/tension → evidence-backed insight → explanation/examples → actionable implications → useful takeaway.
- Use meaningful headings and short-to-medium paragraphs. Use bullets where they make steps or comparisons easier to scan. Use selective bold emphasis only for important ideas.
- Vary sentence and paragraph length. Avoid monotony, one-sentence-per-paragraph throughout, and blocks of dense prose.
- Prefer specific examples, explicit mechanisms, and concrete language over clichés and abstractions.
- Apply the “rate of revelation” idea: do not spend half the essay repeating conventional advice before getting to the useful insight. Introduce genuinely useful new information at a deliberate pace.
- Include a specific, practical takeaway that a product/growth practitioner can try, adapt, or validate.
- Do not claim an experiment will definitely work. State conditions, limitations, and what to measure when useful.
- End with a clean conclusion, not a generic “in today's fast-paced world” paragraph or an AI-style recap of every heading.

## Quality pass before returning
1. Check that the hook matches what the evidence can support.
2. Remove generic claims, repetition, empty transitions, fake certainty, and unsupported metrics.
3. Confirm the section order is consistent with the selected writing structure.
4. Verify that source markers exist only for supplied evidence IDs and appear near the claims they support.
5. Verify that user-provided context is not falsely attributed to podcast guests.
6. Confirm the practical takeaway is concrete.
7. Estimate word count and return it as metadata if the response contract supports it.
8. Return content in the required structured format; do not append invented citations or sources.

## Evaluation cases to support
- Enough evidence: produce a specific essay with citations distributed across major claims.
- Insufficient evidence: abstain rather than making up expert claims.
- Conflicting evidence: explain the tension without forcing false consensus.
- User context included: personalize application without presenting it as transcript fact.
- Short request: preserve the intended topic and audience; still aim near the requested length unless the user explicitly asks for a shorter piece.
