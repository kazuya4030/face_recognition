# Task Tracker — AI Startup Studio Design Project

Last updated: 2026-07-13 (session complete — all deliverables written, ready for commit)

Legend: Status = Not Started / In Progress / Blocked / Done

| # | Task | Priority | Status | Progress | Dependencies | Findings (summary) | Next Action |
|---|------|----------|--------|----------|---------------|---------------------|-------------|
| 1 | Set up research/ folder + TaskTracker.md | P0 | Done | 100% | none | Folder created at repo root `research/` (no literal `/project` mount in this env; repo root = project root) | Keep tracker updated each phase |
| 2 | Part1: Identify 30-50+ Startup Studios / Venture Studios / Company Builders / Holdcos globally | P0 | Done | 100% | none | 5 parallel agents researched 45+ orgs across 5 categories; raw output in `research/raw/batch_A..E`. Batch D flagged "Redpoint eleven" as unverifiable (substituted); Batch E flagged Japan AI-native studio category as thin (mostly incumbents adding AI verticals) | Feed into CompanyDatabase.md synthesis |
| 3 | Part2: Deep-dive each company (overview, history, founders, funding, # companies launched, exits, success rate, failures, profit structure, moat, hiring, org chart, investment criteria, AI usage) | P0 | Done | 100% | Task 2 | All 5 batches captured full field set per org with inline citations; synthesis agent dispatched to compile into CompanyDatabase.md | Wait for synthesis agent, then review |
| 4 | Part3: Comparative analysis — common success factors, common failure patterns, what's obsolete in AI era | P0 | Done | 100% | Task 3 | `CompetitiveAnalysis.md` complete — 8 sections incl. disclosure-discipline finding, capital-discipline longevity pattern, failure-mode analysis, AI-branding-vs-reality gap, founder archetypes, funding-instrument convergence, and surprising findings (X's kill-incentive culture, Japan's AI-native-studio gap, Permanent Equity's fee structure, SpaceX/Cursor acquisition) | — |
| 5 | Part4: 2030+ outlook — how AI (Agents, Claude Code, OpenAI, Gemini, Cursor, Figma AI, MCP) reshapes studios | P0 | Done | 100% | Task 4 | Written directly into `MarketResearch.md` Part 4 — key thesis: leverage commoditizes, judgment/data/trust become the moat | — |
| 6 | Part5: "100 companies/year" org design — how much AI-only, what stays human | P0 | Done | 100% | Task 4 | Written into `StartupStudioPlaybook.md` Part 5 — steady-state ~15-25 humans, judgment bandwidth (not build capacity) is binding constraint | — |
| 7 | Part6: AI Startup Studio Operating System design (CEO AI, CTO AI, Research AI, Recruiting AI, Sales AI, Marketing AI, Finance AI, Legal AI, PM AI, QA AI, Growth AI, Fundraising AI, etc.) w/ roles, inputs, outputs, KPIs | P0 | Done | 100% | Task 5 | `AIOrganization.md` complete — 13 AI functions + human core table + autonomy-level (L1-L4) framework + evaluation cadence | — |
| 8 | Part7: Japan market entry strategy — Phase1-4 | P0 | Done | 100% | Task 3,4 | Written into `StartupStudioPlaybook.md` Part 7 — Phase1 (prove w/ global-sellable products) → Phase2 (JP LP base+JV) → Phase3 (global Fund II) → Phase4 (conglomerate optionality). Should cross-check against Batch E Japan market context numbers once reviewed | Verify against raw batch E data during QA pass |
| 9 | Part8: First 90 days roadmap, week by week | P0 | Done | 100% | Task 6,7 | `Roadmap.md` complete — week-by-week Phase 0 plan + Phase 0-4 long-horizon table | — |
| 10 | Part9: Moat ideas — min. 20 defensibility mechanisms | P0 | Done | 100% | Task 3,6 | `MoatIdeas.md` complete — 24 ideas across Data/Learning, Infra, Trust/Relationship, Structural, Product, Speed, Meta-moat categories + prioritization | — |
| 11 | Part10: Founder's-eye full redesign — no legacy constraints, aim for #1 globally | P0 | Done | 100% | Task 2-9 | Written into `StartupStudioPlaybook.md` Part 10 — core bet: studio (origination) + permanent-capital holdco (retention) hybrid, nobody in database does both today | — |
| 12 | Write ExecutiveSummary.md | P0 | Done | 100% | All parts | Condensed thesis + 5 key findings + open questions for founder | — |
| 13 | Write MarketResearch.md | P0 | Done | 100% | Task 2,3 | Part 1 (landscape synthesis across 5 categories) + Part 4 (2030+ outlook) both complete | — |
| 14 | Write CompanyDatabase.md | P0 | Done | 100% | Task 2,3 | Synthesis agent compiled 5 raw batches into 193KB polished DB, 45 orgs, Coverage Note documents substitutions/gaps | — |
| 15 | Write CompetitiveAnalysis.md | P0 | Done | 100% | Task 3 | — | — |
| 16 | Write StartupStudioPlaybook.md | P0 | Done | 100% | Task 5-9 | Parts 5, 7, 10 all written | — |
| 17 | Write AIOrganization.md | P0 | Done | 100% | Task 6 | — | — |
| 18 | Write MoatIdeas.md | P0 | Done | 100% | Task 9 | — | — |
| 19 | Write Roadmap.md | P0 | Done | 100% | Task 7,8 | — | — |
| 20 | Write References.md | P1 | Done | 100% | All research | 384 unique deduplicated source URLs extracted from all 5 raw batches, organized by category | — |
| 21 | Commit & push to branch `claude/ai-startup-studio-design-gpxout` | P0 | In Progress | 50% | All above | Interim commit (2b8d3d0) already pushed with AI org/moat/roadmap/playbook + raw research; final commit with CompanyDatabase/CompetitiveAnalysis/MarketResearch/ExecutiveSummary/References pending | Commit + push final state |

## Research Batches (Part 1/2 dispatch plan)

- **Batch A — Classic Venture Studios**: Idealab, Betaworks, Atomic, Pioneer Square Labs, Rocket Internet, eFounders/Hexa, Science Inc., Expa, Human Ventures
- **Batch B — AI-native Studios/Accelerators/Funds**: Antler, Entrepreneur First, South Park Commons, HF0, AI Grant, OpenAI Startup Fund, Y Combinator, Techstars, 500 Global
- **Batch C — Holding Companies / Conglomerates (compounder model)**: Constellation Software, Danaher, Roper Technologies, Berkshire Hathaway, Thermo Fisher, Permanent Equity, Tiny, Alphabet "Other Bets"/X (moonshot factory), Prosus/Naspers
- **Batch D — Europe/Global Studios & Newer AI Builders**: Founders Factory, Redpoint eleven, a16z Speedrun, Neo, Build (formerly?), Suncorp/Corporate VC skip, Story Ventures? — finalize during research; also Waymark/other AI-era builders
- **Batch E — Japan Studios/Holdcos**: DeNA, CyberAgent (Startup Studio/CA Startups), Sun* Inc, XTech Ventures/Studio, Relic Inc, Quantum Inc, SmartHR/Coral Capital ecosystem, BEENEXT, Skyland Ventures / Delight Ventures, Nissin/Recruit-style internal incubation

## Open Questions For User (to surface at the end)
(none yet — will accumulate during work)
