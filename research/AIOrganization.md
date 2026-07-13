# AI Startup Studio Operating System — Organization Design

> Part of the AI Startup Studio design project. See `TaskTracker.md` for status and `ExecutiveSummary.md` for the top-level thesis. This document defines the full "AI org chart" — every AI role needed to run a studio that can go from idea → funded, revenue-generating company with minimal human headcount, plus the human layer that remains irreducible.

---

## 0. Design Principles Before the Org Chart

Before listing agents, four principles that shape every role definition below (justified in `CompetitiveAnalysis.md`):

1. **Agents are organized by decision-loop, not by department.** A traditional org chart mirrors human specialization (legal is separate from finance because humans can't hold both contexts). LLM agents don't have that constraint — cost is now dominated by *judgment latency and error rate*, not headcount. So the org below is organized around **13 core loops**, each owned by one "AI function," with humans sitting at the small number of loops where the cost of a wrong autonomous decision is catastrophic or where the loop requires a real-world relationship (a regulator, an investor's trust, a candidate's life decision).
2. **Every AI role has a machine-checkable KPI, not a vibe.** If an output can't be scored automatically (even a proxy score), it is not a role for an autonomous agent yet — it's a human-in-the-loop role with an AI copilot.
3. **Portfolio-level, not company-level, is where the studio's AI actually compounds.** Each portfolio company will run its own thin stack (mostly the same models, prompted differently). The studio's unique IP is the **cross-portfolio learning loop**: every company's outcome data (what marketing message converted, what pricing worked, what legal clause got redlined) feeds back into shared studio-level agents. This is why the design below has a distinct "Studio HQ" layer and "Portco" layer.
4. **Autonomy is a dial per role, not a binary.** Each role below is tagged with an autonomy level (L1–L4, defined next) that is expected to shift up over time as trust is earned — this is a maturity model, not a fixed spec.

**Autonomy levels used throughout:**
- **L1 — Drafts only:** Agent produces output; a human must approve before anything leaves the building (sent, filed, spent, published).
- **L2 — Acts within a budget/policy envelope:** Agent executes autonomously inside pre-approved limits (e.g., spend under $2k, standard contract templates, replies to known FAQ); anything outside the envelope escalates to L1.
- **L3 — Acts and reports:** Agent executes autonomously and a human reviews a digest after the fact (daily/weekly), not before.
- **L4 — Fully autonomous with exception-based human review:** Agent operates continuously; a human is looped in only when the agent's own confidence score drops below threshold or an anomaly detector fires.

Target state for a mature studio (Year 3+): most L1 roles below have migrated to L2/L3. The studio's core competitive bet is that it climbs this ladder faster than competitors because of principle #3 (the shared learning loop).

---

## 1. The Org Chart (13 AI Functions + Human Layer)

```
                         ┌─────────────────────────┐
                         │   HUMAN CORE (5-12 ppl)   │
                         │ Founder/CIO · GP Partners  │
                         │ Chief-of-Staff · Legal Cnsl│
                         │ Head of Talent · Board      │
                         └────────────┬─────────────┘
                                      │ governs / approves gates
                         ┌────────────▼─────────────┐
                         │      STUDIO HQ AI LAYER     │
                         │  (shared across all portcos) │
                         └────────────┬─────────────┘
        ┌───────────┬───────────┬────┼────┬───────────┬───────────┐
        │           │           │    │    │           │           │
   Research AI   CEO AI      CTO AI  │  Fundraising  Legal AI   Finance AI
   (idea/market) (venture    (tech   │  AI (capital  (entity,   (studio +
                 GM per co)  arch)   │  formation)   contracts, portco
                                     │               compliance) books)
                                     │
        ┌───────────┬───────────┬───┴───────┬───────────┬───────────┐
        │           │           │           │           │           │
   Recruiting AI  Sales AI   Marketing AI  PM AI       QA AI      Growth AI
   (people ops    (portco    (portco       (portco     (portco    (portco
   for portcos)   revenue)   demand gen)   delivery)   testing)   PLG loop)
```

Below, each function is defined with: **Mission, Sits at (HQ vs Portco), Responsibilities, Inputs, Outputs, KPIs, Autonomy level (today → target), Human checkpoint.**

---

## 2. Function Definitions

### 2.1 Research AI — "What should exist?"
- **Mission:** Continuously generate, score, and rank startup ideas; be the studio's opportunity-sensing organ.
- **Sits at:** HQ (feeds every new venture)
- **Responsibilities:** Scrape/monitor patent filings, App Store/Product Hunt/GitHub trending, job-posting demand signals (what roles companies are struggling to fill = unmet software need), regulatory changes that open markets (e.g., new API mandates), Reddit/forum pain-point mining, YC/competitor batch analysis, "arbitrage windows" where a foundation model capability just crossed a viability threshold (e.g., voice latency dropped below human-perceptible lag → new voice-agent categories become buildable).
- **Inputs:** Web/patent/job-market data feeds, foundation model capability changelogs (OpenAI/Anthropic/Google release notes), portfolio company win/loss data, prior idea-scorecard outcomes (feedback loop).
- **Outputs:** Weekly ranked "Opportunity Brief" (10-20 ideas) with: TAM estimate, technical feasibility score (can current models actually do this?), competitive density, time-to-first-revenue estimate, and a one-page "why now."
- **KPIs:** % of shipped ideas that reach $10k MRR within 90 days; ratio of ideas sourced vs. ideas selected (signal quality); false-positive rate (ideas greenlit that failed fast) trending down.
- **Autonomy:** L3 today (auto-generates and ranks; human/CEO-AI picks) → target L3 stays (idea *selection* should keep a human/portfolio-committee gate indefinitely — this is the highest-leverage human decision in the whole studio).
- **Human checkpoint:** Weekly portfolio committee (1-2 humans + Founder) reviews the Opportunity Brief and approves which ideas get resourced. This is deliberately NOT automated — see `MoatIdeas.md` #3 (taste as moat).

### 2.2 CEO AI (per-venture "Venture GM Agent")
- **Mission:** Act as the operating brain of each individual portfolio company from day 0 — the thing that would otherwise be a solo non-technical founder or an EIR.
- **Sits at:** Portco (one instantiated per company, inherits playbooks from HQ)
- **Responsibilities:** Turns the Research AI's opportunity brief into a business plan; sets weekly OKRs; allocates budget across Marketing/Sales/Growth AI; runs the board-update cadence; makes the "kill or continue" recommendation at each gate (30/60/90 day) based on real traction data; coordinates all other portco-level AIs like a chief-of-staff would.
- **Inputs:** Opportunity brief, real-time metrics dashboard (revenue, CAC, churn, burn), sub-agent status reports, studio-level playbook library.
- **Outputs:** Weekly investor-style update memo, resource allocation decisions, kill/continue recommendation with confidence score.
- **KPIs:** Portfolio company survival-to-Series-A rate; capital efficiency ($ spent per $1 ARR); accuracy of its own kill/continue predictions vs. actual 12-month outcome (calibration score).
- **Autonomy:** L2 → target L3 (small companies run almost entirely CEO-AI-driven with a human "venture partner" reviewing weekly, not daily).
- **Human checkpoint:** A human Venture Partner (1 human covers 6-10 portcos) approves capital allocation above a threshold (e.g., >$5k/week) and signs the kill/continue call. Hiring a *human* co-founder/operator into a promising portco (post-traction) is itself a CEO-AI-flagged, human-executed action.

### 2.3 CTO AI — Technical architecture & build
- **Mission:** Own technical decisions and be the primary "engineer" — using coding agents (Claude Code-class tools) to actually build the product.
- **Sits at:** Portco, with an HQ "Platform Team" instance maintaining shared infrastructure (auth, billing, deploy pipeline, design system) reused across all portcos.
- **Responsibilities:** Architecture decisions, picks the tech stack from a studio-approved shortlist (to maximize shared tooling/agent proficiency), drives autonomous coding agents to build MVP → v1 → scale, manages CI/CD, owns security posture at the code level, decides build-vs-buy for infra.
- **Inputs:** Product spec from PM AI, shared component/infra library, codebase, incident/error logs.
- **Outputs:** Shipped code, architecture decision records, uptime/performance reports, security scan results.
- **KPIs:** Time from spec to shipped MVP (target: days, not months); defect escape rate; infra cost per active user; % of code reused from shared studio library (higher = more compounding).
- **Autonomy:** L2 (writes/ships within CI gates and automated test suites) → target L3 for well-trodden CRUD/SaaS patterns, staying L2 for anything touching payments, auth, or data deletion.
- **Human checkpoint:** A human engineering lead reviews architecture decisions for any portco handling regulated data (health, finance, biometric — directly relevant given this repo's own domain) and signs off before production deploy of anything touching PII.

### 2.4 Fundraising AI — Capital formation
- **Mission:** Manage the studio's own LP fundraising *and* each portco's follow-on round process.
- **Sits at:** HQ (studio fund) + Portco (round-specific instance)
- **Responsibilities:** Build and maintain data room, draft the narrative/deck from real traction data, identify and rank the right investors for each check size/stage (using a database of investor thesis fit, not spray-and-pray), draft outreach, schedule, track process status, draft term sheet redlines against studio-standard positions.
- **Inputs:** Portco metrics, cap table, market comps, investor database (thesis, check size, portfolio conflicts, historical response patterns).
- **Outputs:** Investor-ready data room, ranked target investor list with personalized rationale per investor, drafted outreach sequences, negotiation briefing memos.
- **KPIs:** Investor meeting-to-term-sheet conversion rate; time-to-close; effective valuation vs. comp-set benchmark; LP re-up rate for the studio fund itself.
- **Autonomy:** L1 for anything investor-facing (every email/deck a human approves before send — this is relationship capital, not a commodity task) → target stays L1/L2 indefinitely. Fundraising is the second place (after idea selection) where the studio should NOT chase full autonomy, because investor trust is a slow-compounding asset that a bad autonomous email can damage disproportionately.
- **Human checkpoint:** Founder/GP personally sends or explicitly approves all investor communication; AI prepares everything up to the "send" button.

### 2.5 Legal AI — Entity formation, contracts, compliance
- **Mission:** Remove legal-formation friction to near-zero so a new company can be incorporated, IP-assigned, and contract-ready in hours, not weeks.
- **Sits at:** HQ (shared engine) instantiated per portco
- **Responsibilities:** Auto-incorporate (Delaware C-corp / Japan KK as applicable), generate founder/IP assignment agreements, cap table setup, standard vendor/customer contract generation from clause library, contract redline suggestions, regulatory-change monitoring per portco's sector (especially relevant for AI-specific regs: EU AI Act, Japan's AI governance guidelines, biometric data laws given this studio may spin out companies like the current repo's face-recognition domain).
- **Inputs:** Jurisdiction, company type, deal terms, existing clause library, regulatory feed.
- **Outputs:** Signed-ready incorporation docs, contracts, compliance checklists, regulatory alerts.
- **KPIs:** Time from "go" decision to fully incorporated + IP-assigned company (target: <24h); contract turnaround time; zero material compliance breaches.
- **Autonomy:** L2 (standard template contracts within policy execute automatically) → target L3 for boilerplate, staying L1 for: fundraising legal docs, litigation, any novel regulatory question, and anything in a regulated vertical (biometrics, health, finance).
- **Human checkpoint:** Outside/fractional general counsel reviews all non-boilerplate agreements and any regulatory filing before submission. A human signs incorporation docs where legally required.

### 2.6 Finance AI — Studio & portfolio financial operations
- **Mission:** Real-time books, treasury, and capital-allocation intelligence across the whole portfolio.
- **Sits at:** HQ (consolidated) + Portco (bookkeeping instance)
- **Responsibilities:** Bookkeeping, burn-rate tracking, automated invoicing/AR/AP, treasury management (idle cash sweep), cap table math, portfolio-level cash flow forecasting, flags portcos approaching runway cliffs, computes true unit economics (not vanity metrics) per portco.
- **Inputs:** Bank/payment processor feeds, payroll data, portco revenue events, studio fund capital calls/distributions schedule.
- **Outputs:** Real-time dashboard, monthly close, runway alerts, unit-economics scorecards, LP reporting packages.
- **KPIs:** Days to close the books (target: 1 day, not 30); forecast accuracy (predicted vs actual runway-out date); number of runway surprises caught with >60 days lead time.
- **Autonomy:** L2/L3 for bookkeeping and reporting → target L3-L4 (routine finance ops become essentially invisible/autonomous). Capital deployment decisions above threshold stay L1.
- **Human checkpoint:** CFO-in-residence (1 human across the whole portfolio, at scale) reviews monthly consolidated close and any capital call/distribution.

### 2.7 Recruiting AI — People for portfolio companies
- **Mission:** Source, screen, and (for junior/well-specified roles) make offer recommendations for both studio HQ and every portco's hiring needs — and separately, source the *founders/operators* the studio backs.
- **Sits at:** HQ (shared talent pipeline) + Portco (role-specific instance)
- **Responsibilities:** Two distinct pipelines — (a) **Founder/operator sourcing**: identify domain experts, ex-operators, and technical talent who could run a venture the Research AI has identified, run structured interviews, reference checks; (b) **Portco hiring**: JD generation, sourcing, resume screening, structured interview question generation, skills-assessment scoring, reference checks.
- **Inputs:** Role/venture requirements, candidate pools (LinkedIn/GitHub/AngelList-equivalent APIs, referral network), interview transcripts, past hire performance data (feedback loop to improve screening).
- **Outputs:** Ranked shortlists with structured scorecards, drafted offer terms, onboarding plans.
- **KPIs:** Time-to-hire; quality-of-hire (90-day and 1-year performance correlation with screening score); founder-market-fit accuracy (does the operator the studio placed actually fit the venture, measured by 6-month traction).
- **Autonomy:** L2 for junior/standard roles (screens and ranks, human picks from top 3) → target stays L1/L2 for founder/operator placement specifically (this is a life-altering decision for a human candidate and a trust-critical decision for the studio — never fully automate the final call), can reach L3 for high-volume junior portco roles (support, SDR) at scale.
- **Human checkpoint:** Head of Talent (human) conducts final interview and makes the offer call for every founder/operator placement and every senior portco hire.

### 2.8 Sales AI — Portfolio company revenue generation
- **Mission:** Run outbound/inbound sales motion for each portco from first dollar to repeatable revenue engine.
- **Sits at:** Portco
- **Responsibilities:** Lead scoring/qualification, personalized outbound sequencing, demo scheduling, proposal/quote generation, objection-handling playbooks, CRM hygiene, close-loop win/loss analysis fed back to Research AI and Marketing AI.
- **Inputs:** ICP definition (from CEO AI/Marketing AI), lead lists, product usage data, pricing rules, past deal outcomes.
- **Outputs:** Qualified pipeline, sent proposals, signed contracts (routed through Legal AI), win/loss reports.
- **KPIs:** Pipeline-to-close conversion rate; sales cycle length; CAC; forecast accuracy.
- **Autonomy:** L2 (autonomous outbound and qualification within brand/compliance guardrails) → target L3 for self-serve/PLG motions, staying L1/L2 for enterprise deals above a contract-value threshold where a human relationship still closes better.
- **Human checkpoint:** Human "closer" (often the CEO-AI's human venture partner or an early portco hire) takes over above a deal-size threshold and for any negotiated (non-list-price) enterprise deal.

### 2.9 Marketing AI — Demand generation & brand
- **Mission:** Build audience, content, and brand for each portco (and the studio itself) from zero.
- **Sits at:** HQ (studio brand + shared content engine) + Portco
- **Responsibilities:** Positioning/messaging, content calendar and generation (blog, social, video scripts), SEO/GEO (generative-engine-optimization for AI answer engines — increasingly as important as classic SEO), paid acquisition campaign management and bid optimization, community management, launch orchestration (Product Hunt/HN-style launches).
- **Inputs:** ICP/positioning brief, brand guidelines, competitor content, channel performance data.
- **Outputs:** Published content, ad campaigns, launch plans, weekly channel performance report.
- **KPIs:** CAC by channel, organic traffic growth, content-to-signup conversion, brand share-of-voice in AI answer engines (new metric category), launch-day signup volume.
- **Autonomy:** L2/L3 for content production and paid campaign optimization within budget envelope → target L3-L4 for always-on channels, L1 for anything brand-risk-sensitive (crisis response, controversial topics).
- **Human checkpoint:** Human marketing lead approves brand voice guardrails quarterly and reviews anything flagged as reputationally sensitive by the anomaly detector.

### 2.10 PM AI — Product management & delivery
- **Mission:** Translate market signal + user feedback into a prioritized, buildable spec, and keep CTO AI's build queue honest against user value.
- **Sits at:** Portco
- **Responsibilities:** User feedback synthesis (support tickets, usage analytics, interviews), roadmap prioritization (RICE-style scoring), spec writing for CTO AI, feature flag/rollout planning, post-launch impact measurement.
- **Inputs:** Usage analytics, support/feedback data, business goals from CEO AI, technical constraints from CTO AI.
- **Outputs:** Prioritized roadmap, written specs, post-launch impact reports.
- **KPIs:** % of shipped features that move the target metric (vs. shipped-but-ignored); spec-to-ship cycle time; feature adoption rate.
- **Autonomy:** L2 (prioritizes and specs within OKR envelope set by CEO AI) → target L3.
- **Human checkpoint:** None required routinely; CEO AI (itself supervised by human venture partner) is the escalation path for roadmap disputes between PM AI and CTO AI.

### 2.11 QA AI — Quality, testing, and trust
- **Mission:** Be the last line of defense before anything reaches a real user — correctness, security, and (critically, given this studio's own domain expertise) privacy/bias testing for AI-driven products.
- **Sits at:** Portco, with an HQ security/red-team function shared across all
- **Responsibilities:** Automated test generation and execution, regression testing, security scanning (SAST/DAST/dependency audit), adversarial/red-team testing specifically for AI features (prompt injection, jailbreak, bias/fairness testing for any model-driven product — e.g., a face-recognition or biometric product would get mandatory fairness-across-demographics testing here), load testing.
- **Inputs:** Codebase, spec/acceptance criteria, historical defect data, threat intelligence feed.
- **Outputs:** Test suites, pass/fail gates blocking CI/CD, security/bias audit reports.
- **KPIs:** Defect escape rate to production, mean-time-to-detect security issues, % of releases blocked pre-production by an automated gate (healthy number, not zero).
- **Autonomy:** L2/L3 (blocks releases autonomously on failed gates) → target L4 for standard regression, staying L1 for any fairness/bias audit result on a regulated or ethically sensitive product category — a human ethics/compliance reviewer must sign off before shipping a biometric or other high-stakes AI feature.
- **Human checkpoint:** Human technical reviewer signs off before any release touching biometric data, health data, financial transactions, or minors — non-negotiable given the studio's likely AI-heavy, sometimes-regulated portfolio.

### 2.12 Growth AI — Retention, expansion, and PLG loops
- **Mission:** Own the metrics after first purchase — activation, retention, expansion, virality.
- **Sits at:** Portco
- **Responsibilities:** Onboarding flow optimization, lifecycle email/in-app messaging, churn prediction and intervention, pricing/packaging experiments, referral/virality loop design, A/B test design and statistical analysis.
- **Inputs:** Product usage events, churn/retention data, pricing experiment history.
- **Outputs:** Experiment results, optimized onboarding/lifecycle flows, churn-risk-scored account lists with intervention actions.
- **KPIs:** Activation rate, net revenue retention, churn rate, viral coefficient, experiment velocity (tests shipped per month).
- **Autonomy:** L2/L3 (ships experiments within a pre-approved testing framework) → target L4 for statistically well-understood levers (email timing, onboarding sequencing), L2 for pricing changes (revenue-sensitive).
- **Human checkpoint:** Pricing changes above a % threshold reviewed by CEO AI's human venture partner.

### 2.13 Studio-Level Meta-Function: "Chief of Staff AI" / Portfolio Intelligence AI
- **Mission:** The one function with no portco analog — it watches *all 12 functions across all portfolio companies simultaneously* and is the mechanism by which the studio compounds (principle #3 above).
- **Sits at:** HQ only
- **Responsibilities:** Cross-portco pattern detection ("the same onboarding email subject line is winning in 3 unrelated portcos — push it to the shared template library"), playbook versioning and distribution, anomaly detection that triggers human escalation across any function, resource-contention arbitration (which portco gets the marketing budget this week), studio-level board reporting.
- **Inputs:** Every other AI function's outputs and KPIs, portfolio-wide dashboards.
- **Outputs:** Weekly Studio Ops Digest to humans, updated shared playbooks, escalation flags.
- **KPIs:** Rate of playbook reuse across portcos (this is the studio's core compounding metric — see `CompetitiveAnalysis.md` and `MoatIdeas.md`), mean time from a winning pattern's first detection to portfolio-wide rollout.
- **Autonomy:** L3 (acts — updates shared libraries — and reports) → target L3 stays, since this function's whole value is *surfacing* insight for humans to weight, not making final strategic calls.
- **Human checkpoint:** Founder/COO reviews the Weekly Studio Ops Digest; this is the single most important recurring human touchpoint in the whole system because it's where the human strategic layer stays current on 20-100 companies without reading 20-100 individual reports.

---

## 3. The Human Core — What Cannot Be Automated (and Why)

Full reasoning in `CompetitiveAnalysis.md` §4 and `MoatIdeas.md`, summarized here as the counterpart to the AI org above. A mature studio at 50-100 concurrent portcos still needs roughly **5-12 humans in these irreducible roles**:

| Human Role | Why it resists automation | Approx. ratio at scale |
|---|---|---|
| Founder / Chief Investment Officer | Ultimate taste/conviction calls on which ideas get resourced; bears reputational and fiduciary responsibility that cannot be delegated to software | 1 |
| GP / Portfolio Committee members | Pattern-matched judgment on ambiguous kill/continue calls; LP-facing credibility | 2-3 |
| Venture Partners (human oversight of CEO AI) | Relationship capital with each portco's key hires/customers/investors; the "adult in the room" for a 22-year-old technical founder or a fully autonomous agent stack | 1 per 6-10 portcos |
| Head of Talent | Final interview/offer for founder-level placements — a human life decision, and the studio's reputation with its talent network is a trust asset | 1 |
| Fractional General Counsel | Sign-off on novel legal/regulatory questions and litigation; malpractice liability requires a licensed human | 1 (fractional/outside) |
| CFO-in-residence | Fiduciary sign-off on capital calls/distributions to LPs; audit requirements | 1 (at scale) |
| Chief of Staff to Founder | Runs the human side of the Weekly Studio Ops Digest loop, keeps humans synced | 1 |
| Board / LP relations | Trust-building with capital sources — LPs are underwriting a person's judgment as much as a system | Founder + 1-2 |

**First-principle behind this table:** every irreducible human role above shares one property — it is a node where an external party (an LP, a regulator, a candidate, a court) needs to trust a *specific accountable human*, not a system. AI can prepare, draft, analyze, and recommend for all of these; it cannot *be* the counterparty. This is the organizing principle for the whole autonomy-dial design above, and it is the studio's answer to "how far can AI-only go" (see `Roadmap.md` Part 5 analysis for the 100-companies/year quantitative version of this table).

---

## 4. Evaluation Cadence (how the whole system is graded)

- **Daily:** Automated dashboards (Finance AI, QA AI gates, Sales AI pipeline) — no human review required unless an anomaly fires.
- **Weekly:** Studio Ops Digest (Chief of Staff AI → Founder/COO); per-portco CEO AI update reviewed by that portco's Venture Partner.
- **Monthly:** Finance close reviewed by CFO-in-residence; portfolio committee re-scores every active portco against kill/continue criteria.
- **Quarterly:** Full playbook audit — which shared templates/playbooks are actually driving the reuse-rate KPI from §2.13; retire what isn't working; this is the formal mechanism for the studio's own learning loop to compound.
- **Gate reviews (30/60/90 day per portco):** The one process that is *identical in spirit* to a traditional venture studio (see `StartupStudioPlaybook.md`) but compressed in time because the AI org above collapses what used to take a human team weeks into days.

---

*Next: see `StartupStudioPlaybook.md` for how this org design plugs into the end-to-end venture creation process, and `MoatIdeas.md` for why the specific shape of this org (not just "we use AI") is defensible.*
