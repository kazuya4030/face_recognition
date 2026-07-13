# Market Research — Global Landscape & 2030+ Outlook

> Part 1 (landscape survey) and Part 4 (2030+ outlook) of the design brief. Part 1's detailed company-by-company data lives in `CompanyDatabase.md`; this file holds the landscape-level synthesis. Part 4 (2030+ AI outlook) is original analysis below.

## Part 1 — Landscape Survey (summary; full profiles in CompanyDatabase.md)

*[Populated from parallel primary-source research across 5 batches — classic venture studios, AI-native studios/accelerators, holding-company/compounder models, Europe & newest AI-native studios, and Japan-specific studios. Full company-by-company detail with citations is in `CompanyDatabase.md`; this section synthesizes the landscape shape.]*

**STATUS NOTE (to be replaced once research agents complete):** This section will summarize ~45 organizations across 5 categories:
- Classic venture studios / company builders (Idealab, Betaworks, Atomic, Pioneer Square Labs, Rocket Internet, eFounders/Hexa, Science Inc., Expa, Human Ventures)
- AI-native studios, talent funds, and accelerators (Antler, Entrepreneur First, South Park Commons, HF0, AI Grant, OpenAI Startup Fund, Y Combinator, Techstars, 500 Global)
- Compounder holding companies / conglomerates studied as a capital-allocation model (Constellation Software, Danaher, Roper Technologies, Berkshire Hathaway, Thermo Fisher, Permanent Equity, Tiny, Alphabet's X/Other Bets, Prosus/Naspers)
- Europe & newest AI-native company builders (Founders Factory, a16z Speedrun, Neo, High Alpha, and additional 2023-2025 AI-native studios identified during research)
- Japan-specific studios and holding companies (DeNA, CyberAgent, Sun* Inc, XTech, Relic, Quantum, Coral Capital, BEENEXT, Skyland/Delight Ventures, plus Japan market context)

*(This placeholder will be replaced with the full synthesized findings once the underlying research batches are compiled into `CompanyDatabase.md`, and this note removed.)*

---

## Part 4 — 2030+ Outlook: How AI Reshapes the Startup Studio

### 4.1 The core structural shift: from "studio provides leverage" to "studio provides judgment"

Every venture studio's historical value proposition was **operational leverage** — shared legal, shared recruiting, shared engineering-as-a-service, shared design — because assembling a competent team from scratch was the bottleneck for a first-time or non-technical founder. By 2030, coding agents (the Claude Code / Cursor / Devin-class tooling, already maturing rapidly through 2024-2026), MCP-standardized tool integration, and multimodal design agents (Figma AI and successors) will have made **individual operational leverage nearly free** — a single competent operator with good agentic tooling can already, in 2026, do what took a 5-8 person studio pod in 2015. This trajectory continues, not plateaus, through 2030.

**Implication:** studios that still sell "we'll staff your company for you" will be increasingly undifferentiated — any funded founder can buy that from the API layer directly. The studios that survive and compound will be the ones whose value is **judgment and data**, not staffing: which ideas to pursue (Research AI's opportunity-scoring, but ultimately human taste per `MoatIdeas.md` #24), when to kill (calibrated decision-making, `AIOrganization.md` §4), and what's been learned across hundreds of prior attempts (the cross-portfolio learning loop, `AIOrganization.md` §2.13). This is the single most important reframe for the whole design in this brief, and it's why `AIOrganization.md`'s org chart is built around decision-loops rather than staffing functions.

### 4.2 What specifically changes, mechanism by mechanism

- **MCP (Model Context Protocol) and similar tool-standardization layers** turn "integrate with our stack" from a bespoke engineering project into a configuration step. By 2030, a new portco's entire toolchain (CRM, payments, analytics, deploy) plausibly self-assembles from a manifest, not custom integration code — pushing CTO AI's marginal cost per new company toward zero for anything using standard building blocks, and concentrating human/AI effort on the genuinely novel 10-20% of any product.
- **Multi-agent orchestration (the trajectory Claude Code, OpenAI's agentic tooling, and Gemini's agent stack are all converging on)** means the "team" behind a portco is increasingly a supervised swarm of specialized agents rather than a single chat-based assistant — directly enabling the per-function AI org design in `AIOrganization.md` to become literal infrastructure (an actual orchestrated multi-agent system) rather than a metaphor for "we use AI a lot."
- **Design tools with agentic capability (Figma AI and successors)** compress the design/prototype loop from days to minutes, meaning the studio's PM AI and CTO AI functions increasingly operate on directly-generated, testable UI rather than static specs — shrinking the spec-to-ship cycle time KPI in `AIOrganization.md` §2.10 further.
- **Foundation model providers (OpenAI, Anthropic, Google) increasingly compete on agentic reliability and long-horizon task completion, not just raw capability** — meaning the studio's real technical bet by 2028-2030 is less "which model is smartest" and more "which orchestration/eval/guardrail layer lets us trust an agent with a longer leash" — this is exactly moat #7 (owned evaluation harnesses) in `MoatIdeas.md`, and it becomes more valuable, not less, as models converge in raw capability.
- **The cost of testing an idea keeps falling toward zero, while the cost of judging whether an idea is worth testing does not fall at the same rate** — because judgment quality is bottlenecked on real-world outcome data and human taste, not on compute. This is why Part 5.4 of `StartupStudioPlaybook.md` argues the binding constraint at scale is judgment bandwidth, not build capacity — and this becomes *more* true, not less, by 2030.

### 4.3 What becomes obsolete (direct answer to the brief's "AI時代に不要になったものは何か")

- **Generalist "shared services" studio staff** (a studio's own in-house designers/engineers/marketers serving all portcos as a shared pool) — replaced by AI functions per `AIOrganization.md`; the studios in `CompanyDatabase.md` that were essentially staffing agencies with equity kickers lose their reason to exist first.
- **Pure accelerator "curriculum + demo day" value** (generic startup advice, pitch coaching) — freely available and often better from AI coaching tools; only the network/capital/selectivity-signal parts of an accelerator's value survive (this is a real risk for some organizations in `CompanyDatabase.md` Batch B if they don't evolve).
- **Studios whose only edge was "we can build faster than a solo founder"** — by 2028-2030 a well-resourced solo founder with agentic tooling can build as fast as a funded studio pod could in 2020; speed-of-build stops being a studio-level moat (consistent with `MoatIdeas.md`'s explicit exclusion of "we use AI" as a moat).
- **Multi-week/multi-month legal and financial back-office formation timelines** — Legal AI/Finance AI (`AIOrganization.md` §2.5-2.6) compress this to hours; studios and law firms whose business model depends on formation friction face margin compression.
- **Idea-stage information asymmetry as an investor edge** — when Research AI-class tooling is commoditized (it will be, within a few years of any single studio building it well), simply "seeing good ideas first" stops being sufficient; the moat has to move to selection judgment and execution data, exactly as argued throughout this brief.

### 4.4 What becomes MORE valuable, not less (the counter-intuitive finding)

- **Real-world outcome data specific to one's own portfolio** — becomes strictly more valuable as the tooling to *generate* ideas and MVPs commoditizes, because differentiation shifts entirely to "whose data lets them pick and refine better," which only accrues through actually running the flywheel over years (`MoatIdeas.md` #1-#3).
- **Trust relationships with LPs, regulators, and talent** — become relatively MORE valuable precisely because they are the one category of asset AI capability improvements cannot commoditize (per the human-core rationale in `AIOrganization.md` §3); as everything else gets cheaper, the scarcity price of trust-based assets rises in relative terms.
- **Taste / calibrated judgment** — the scarcest resource in a world where execution is cheap is knowing what's worth executing; this is the throughline connecting Part 4, `StartupStudioPlaybook.md` Part 5.4, and `MoatIdeas.md` #24, and it is the central strategic bet of the redesigned model in `StartupStudioPlaybook.md` Part 10.
- **Regulatory and domain-specific compliance expertise in sensitive verticals** (biometric/health/financial AI) — as AI capability broadens what's technically buildable, the binding constraint in these verticals shifts further toward "can you legally and safely ship this," making the QA AI/Legal AI human-checkpoint design in `AIOrganization.md` §2.5/§2.11 more valuable over time, not a temporary hurdle to engineer around.

### 4.5 A concrete 2030 scenario (illustrative, not a forecast to bet the fund on)

By 2030, expect the highest-performing "AI Startup Studios" to look less like today's studios and more like a **small human investment committee sitting atop a continuously-running multi-agent factory**, where:
- New venture ideas are proposed, scored, and (for selected ones) built to a testable prototype within 24-72 hours of Research AI flagging an opportunity.
- The studio's real product, sold implicitly to LPs, is a demonstrated track record of *calibration* — the gap between predicted and actual outcomes shrinking every quarter (`AIOrganization.md` §4).
- Success is measured less by "how many unicorns" (a lagging, survivorship-biased, and increasingly noisy metric as company formation gets cheap and numerous) and more by **portfolio-level capital efficiency and realized DPI** — a shift already visible in sophisticated LP behavior today and likely to be the dominant framing by 2030.
- The winning studios will be the ones that resisted the temptation to fully automate idea selection and kill decisions even when technically possible — because the studios that did so lost the LP/talent trust moat that only survives when a human is visibly and accountably making the calls that matter (this is the load-bearing assumption behind the entire human-core design in `AIOrganization.md` §3, and the brief's answer to "how far can AI-only go" — see `StartupStudioPlaybook.md` Part 5 for the quantitative version).

---

*Continue to `CompanyDatabase.md` for full company-level evidence, `CompetitiveAnalysis.md` for the cross-company pattern extraction, and `StartupStudioPlaybook.md` for how these forces shape the concrete Japan-first strategy and target org design.*
