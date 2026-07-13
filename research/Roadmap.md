# Roadmap — First 90 Days & Long-Horizon Phasing

> Part 8 (primary) and the execution layer of Part 7 (phase framing) of the design brief. This is the actionable companion to `StartupStudioPlaybook.md` (which holds the Japan Phase 1-4 strategic rationale) and `AIOrganization.md` (which this roadmap builds out in sequence).

## 0. Long-Horizon Phase Overview (context for the 90-day plan)

| Phase | Timeframe | Theme | Exit criteria to next phase |
|---|---|---|---|
| **Phase 0 — Proof** | Months 0-3 (this roadmap) | Build the AI-org skeleton, ship 1-2 real portcos solo, prove the "studio-in-a-box" infra works | 1 portco at >$5-10k MRR or clear signed pilot revenue; core AI stack (CTO/PM/QA/Legal/Finance AI loops) operational end-to-end at least once |
| **Phase 1 — Repeatability** | Months 3-9 | Run 4-6 portcos in parallel, hire the first 2-3 human core roles, raise a small proof-of-concept fund or use founder capital + revenue | ≥2 portcos independently reach viable traction; documented, reusable playbook library (moat #5, #6 in `MoatIdeas.md`) |
| **Phase 2 — Institutionalize** | Months 9-18 | Raise Fund I (or structured SPV) from Japan + select global LPs; formalize human core (Venture Partners, Head of Talent, fractional GC/CFO); target 10-15 concurrent portcos | Fund I closed; portfolio committee cadence running; first real exit or priced follow-on round from an outside investor validating the model |
| **Phase 3 — Scale** | Months 18-36 | 30-50 concurrent portcos, Chief of Staff AI cross-portfolio learning loop fully live, cross-portco data/talent moats compounding | Reuse-rate KPI (`AIOrganization.md` §2.13) trending up quarter over quarter; Fund II raise with better terms than Fund I (LP trust moat validated) |
| **Phase 4 — Conglomerate** | Year 3+ | 100+ companies/year cadence (`StartupStudioPlaybook.md` Part 5 org design), international (Japan → US/SEA/global), possible permanent-capital vehicle (Constellation Software/Berkshire-style holdco layer for the winners instead of always selling/diluting) | Realized DPI to LPs; durable brand as category leader; optionality to convert top-decile portcos into a permanent-capital holding structure rather than forcing an exit |

This Roadmap.md details **Phase 0 (Months 0-3 / the "first 90 days")** week by week, since that's the concrete, immediately actionable part. Phases 1-4 are elaborated strategically in `StartupStudioPlaybook.md`.

---

## 1. First 90 Days — Week-by-Week

**Operating assumption:** the founder starts as a solo operator (possibly with 1 technical co-founder or a very small founding team) with AI agents (Claude Code-class coding agent, LLM-based research/ops agents) doing the work of what used to be a 10-15 person studio staff. Capital assumption: founder capital / friends-and-family scale (sub-$500k) — this is deliberately NOT gated on having raised a fund first, because Phase 0's job is to *prove the model cheaply* before asking anyone for a large check (this directly follows from the LP-trust moat logic in `MoatIdeas.md` #9 — nothing de-risks a fundraise like showing, not telling).

### Weeks 1-2 — Foundation & Infrastructure
- Incorporate the studio holding entity (Japan GK or KK for the parent, Delaware C-corp shell ready to stamp out for portcos — see `StartupStudioPlaybook.md` Japan section for the specific structure rationale).
- Stand up "Studio-in-a-box" v0: shared auth, billing (Stripe), analytics, deploy pipeline, a design system, and a Claude Code / coding-agent workflow with repo templates — this is `MoatIdeas.md` #5, start it in week 1 because it compounds from day one.
- Set up the core AI agent stack described in `AIOrganization.md`: at minimum, working instances of Research AI, CTO AI (coding agent + review gates), Legal AI (entity/contract templates), Finance AI (bookkeeping automation). These don't need to be perfect — L1 (draft-only) is fine to start.
- Start the failure-mode and outcome-data logging habit immediately (`MoatIdeas.md` #1, #2) — even with zero portcos yet, log every idea considered and why it was rejected. This data is worthless if backfilled later.
- Draft the studio's investment thesis / "opportunity graph" hypothesis (which verticals, which arbitrage windows — see `MarketResearch.md` Part 4) to focus Research AI's scanning.

### Weeks 3-4 — First Opportunity Brief & Idea Selection
- Run Research AI for 2 full weekly cycles; generate real Opportunity Briefs (`AIOrganization.md` §2.1).
- Apply the portfolio-committee gate (even if the "committee" is just the founder + one trusted advisor at this stage) to select **2 ideas** to actually build — not more; Phase 0's job is depth of proof, not breadth.
- Bias selection toward: (a) a vertical where the founder/team has real domain edge or unfair data access, (b) a clear arbitrage window (a capability that just became viable), (c) fast time-to-first-revenue (B2B SaaS/API product favored over anything requiring long sales cycles or hardware).
- Given the parent repo's evident domain expertise (face recognition / computer vision / biometric AI), seriously weight at least one Phase-0 idea toward a vision-AI or biometric-adjacent B2B product where that expertise is a genuine, non-obvious edge — this is exactly the kind of "unfair advantage" Research AI should be tuned to detect for this specific studio.

### Weeks 5-8 — Build & Ship (parallel, 2 portcos)
- Week 5: CTO AI (coding agent) builds MVP #1 and MVP #2 in parallel using the shared starter-stack. Target: working, deployed product by end of week 6 for both.
- Week 6: PM AI + QA AI loops activate — real user testing begins (friends/network/cold outreach for 10-20 pilot users per portco).
- Week 7: Legal AI stamps out proper incorporation + IP assignment for whichever of the 2 ideas shows early signal (don't wait for perfect certainty — incorporate early, it's now <24h per `MoatIdeas.md` #14).
- Week 8: Marketing AI + Sales AI loops activate for the stronger of the two; first real revenue attempt (even $1 of paid revenue matters more than 1,000 free signups at this stage — it's the signal that validates the whole AI-org loop end-to-end, not just the product).
- **Explicit 30-day gate at end of week 8** (per `AIOrganization.md` §4 gate-review cadence): apply real kill/continue criteria to both ideas. Expect to kill at least one — this is healthy, not a failure (`MoatIdeas.md` #15 kill-discipline moat starts being built here, in the founder's own behavior, before there's anyone else to enforce it on).

### Weeks 9-12 — Double Down & Systematize
- Redirect resources fully into the surviving portco(s); if both died, immediately cycle Research AI for a fresh Opportunity Brief and restart the build loop with the lessons now logged in the failure-mode database (moat #2 — this is the muscle memory you're building).
- Formalize what worked in weeks 1-8 into the first version of the shared playbook library (`AIOrganization.md` §2.13) — this is the artifact that lets Phase 1 add portco #3, #4, #5 without starting from scratch.
- Begin the Fundraising AI groundwork (`AIOrganization.md` §2.4): build the data room template, start mapping the investor landscape (Japan seed funds + relevant global AI-focused funds), but do NOT start outreach yet — wait until there's a real traction number to lead with.
- Start scoping the first human hire (most likely: a technical operator/co-founder for the surviving portco, or a Venture Partner candidate if the founder is stretched too thin across 2+ ideas) — apply the Recruiting AI + human-final-interview process from `AIOrganization.md` §2.7 even for hire #1, to establish the discipline early.

### Week 13 (Day ~90) — Phase 0 Exit Review
- Formal review against Phase 0 exit criteria (table above): is there a portco with real revenue/pilot traction? Is the AI-org loop demonstrably faster than a human-only studio would have been at this stage (log actual cycle times — idea to MVP, MVP to first revenue)?
- Decide: proceed to Phase 1 (add 3-4 more concurrent portcos, begin building the human core) or extend Phase 0 by another 4-6 weeks if the signal is inconclusive rather than negative.
- Update `TaskTracker.md` and this Roadmap with actual outcomes vs. the hypotheses made here — this file should become a living record, not a one-time plan.

---

## 2. Risk Checkpoints Through the 90 Days

- **Week 4:** If Research AI's Opportunity Briefs are low-quality (generic, not-actually-buildable, or duplicating obviously crowded markets), stop and manually tune the scanning sources/prompts before wasting build cycles on a bad idea — this is cheaper to fix at week 4 than week 8.
- **Week 8:** The 30-day gate is the single highest-leverage discipline moment in the whole 90 days — resist the founder-psychology pull to keep a beloved-but-dead idea alive. Log the decision and reasoning regardless of outcome (feeds moat #2).
- **Week 12:** If neither original idea survived and the restart cycle also stalls, treat this as signal about the AI-org tooling itself (is CTO AI's agent stack actually production-capable yet, or is the studio spending too much time debugging agent output?) rather than only about idea quality — these are different failure modes requiring different fixes.

---

*See `StartupStudioPlaybook.md` for the Phase 1-4 strategic rationale (especially the Japan-specific Phase 1-4 breakdown) and for the "100 companies/year" target-state org design this roadmap is building toward.*
