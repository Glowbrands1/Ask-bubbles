# Buff City Soap form content audit (Ask Bubbles)

**Status: audit and plan only (revision 2). Nothing in this document has been implemented.** No template was edited or republished, no database row was written, no Woven record was changed, nothing was merged or deployed, and Ask Sunny is untouched. Every replacement below is a *proposal* awaiting Buff City Soap approval.

> ### Revision 2 (source-of-truth pass) — what changed and what was corrected
> - **Approved basis:** the Buff City Soap knowledge base in Ask Bubbles is the primary source of truth. Sections 11–17 below add the source inventory, the evidence-backed replacement matrix for **every finding**, the AI-grounding review and the phased plan. Sections 1–10 are the first-pass audit and are kept for history; where they disagree with sections 11–17, **sections 11–17 win**.
> - **Count correction.** The first pass said "81 findings (6 A / 58 B / 17 C)". That figure came from a pattern count that missed some rows. The tables contain **82 uniquely numbered findings** (first-pass classes: **6 A / 59 B / 17 C**). The matrix in section 14 covers all 82.
> - **Corrections to first-pass rows after reading the manuals:**
>   - **RE-2 (MyGlow):** the JBA Policy Manual names "Buff City Soap – MyGlow" as the personnel platform → *preserve* (verified), with a flagged conflict about Woven.
>   - **RE-5 (14/30-day notice, minimum wage, bonus):** supported by the manual's "Pay on Separation of Employment" (pp.35–36) → *preserve*, not a Buff decision.
>   - **RE-4 (key):** the "key returned" question is supported (manual "Return of Property", p.36); only the **$25 deduction** has no Buff source.
>   - **PS-1 (uniform):** the manual has a Buff-specific dress code (pp.16–17) usable as an acknowledgement; the Sun Tan City product-use condition still has no Buff equivalent.
>   - **SD-8 / AS-1 (SD, ASD):** the manual pairs "Assistant Salon Directors/Assistant Makery Managers" (p.42) and lists MM/SD/GM/TSD/DM together (p.34) → *candidate* equivalents with medium confidence, still approval-gated.
>   - **KPIs:** Buff's documented store KPIs exist (Domo deck) but nothing maps them to PPTA/LPSVA/UPTA/Club Close.
> - **The Performance Management Framework** was adopted *verbatim* on 8 Oct 2026 by an explicit owner decision (app name removed; source-company names, role titles and rules left as-is and flagged for later decision — `scripts/knowledge/framework-debrand.mjs`). It is now treated as **legacy methodology, not Buff policy**.

- Scope: all 18 templates in the Ask Bubbles production library, as published on 2026-10-19 (11 at version 2, 7 at version 1), plus the code, AI instructions and knowledge-base documents that read or write them.
- Method: read-only. The stored documents of the 11 version-2 templates were verified byte-identical to the shipped templates (fingerprint comparison, see `docs/store-terminology-and-form-content-review.md`), so the shipped templates were read as the published text. The 7 version-1 templates and the inactive example were read from the database. Knowledge-base evidence comes from read-only queries on `knowledge_documents` / `knowledge_chunks`; Woven evidence from `woven_position_map` and the employee directory view.

## 1. Executive summary

1. **How many of the 18 contain legacy content?** 14 of 18 carry something that does not fit Buff City Soap; 4 are clean.
   - 13 have content-level legacy text: Coaching (mild), SDIT EPP, TSD EPP, ASD-SDIT EPP, FTTC EPP, DMIT EPP – TSD review, DMIT EPP – DMIT review, Resignation/Exit, Demotion, Prescreen/Phone Interview, Tanning Consultant Interview, Management Interview Round 1 and Round 2.
   - 1 has only a letterhead question: Position Transfer ("GlowBrands" rather than "Buff City Soap").
   - Clean: Corrective Action (`dpoa`), Policy Review, Follow-Up Coaching, Team Member Check-In (Example, inactive).
2. **Most problematic.** (a) Tanning Consultant Interview (form name, role, "Sun Tan City Core Values", five STC values), (b) FTTC EPP (the role *is* a tanning job title), (c) Management Interview Round 1 (tanning-bed role play, "cleaning beds"), (d) Prescreen (asks about UV/Sunless/Spa use "as part of your Sun Tan City uniform"), (e) Resignation/Exit (Sunlync/"verify tanning has been removed"), (f) the EPP family's tanning KPIs (PPTA, LPSVA, UPTA, Club Close, Average Club Dollar, Bonus Viewer, SVC). **One finding sits above all templates:** the pinned *Performance Management Framework* document in the knowledge base, which governs how Ask Bubbles drafts coaching, corrective action and EPP content, is itself Sun Tan City text ("Sun Tan City leader", Spa %, Club Close %, Routine Mat, sunless/spa, Salon Directors).
3. **Safe corrections (class A).** Only wording backed by Buff documents: "client(s)" → "guest(s)" in form labels and prompts (Buff documents use "guest" in 57 documents; "client" appears only in the two STC-origin documents), and the Core Values *text* for the hiring forms, which exists verbatim in the knowledge base ("Buff City Soap – Purpose & Core Values": Safety, Resilience, Joy, Belonging; note the form's question 8 says "five" and Round 1 already says "4"). Everything else needs a decision.
4. **Decisions requiring Buff City Soap approval (class B).** Job-title mapping (TC/FTTC, SD, ASD, SDIT, TSD); which sales/productivity metrics replace the tanning KPIs; the guest-engagement standard to replace "Client Engagement Strategies"; the uniform/product-use question; the tanning-bed and lotions/memberships interview scenarios; exit-form system steps (Sunlync, MyGlow, security system); the $25 key deduction and other payroll/bonus rules; GlowBrands vs Buff City Soap letterhead on the Demotion and Transfer forms; the benefits wording; whether Buff uses CareerPlug; and replacement of the framework document.
5. **Recommended plan after approval:** see section 8. Short version: one approval workshop → a small class-A PR → hiring forms → exit form → EPP role/KPI redesign with the framework document replaced first. Each step ships as new seed revisions through the existing additive, idempotent sync, so version history and the 23 filed forms are never touched.

### Findings count
82 numbered findings across the template tables and the cross-cutting table (first-pass classes: **6 A, 59 B, 17 C**). See section 14 for the revised dispositions (6 safe, 28 need approval, 29 on hold, 19 preserve).

### Classification used
- **A — Safe terminology correction:** supported by approved Buff City Soap documents already in the knowledge base.
- **B — Business decision required:** job titles, KPIs, policy requirements, role responsibilities, system steps or process changes.
- **C — Preserve:** generic, historically required, or appropriate as is.

Priority: **High** = visible on the form/PDF and describes a tanning business or system, or would be wrong for a Buff store; **Medium** = visible but partly generic or ambiguous; **Low** = cosmetic or unverified.

## 2. Verified Buff City Soap terminology (evidence)

| Term / fact | Evidence |
|---|---|
| **Makery** (store); "store" also used | KB: *Makery Reference Manual (MRM)*, *Purpose & Core Values* ("in the Makery every day"), *7G Service* ("the Makery"); the brand guidelines prefer "Soap Makery" (`src/config/company/brand.ts` note, `docs/woven.md` open question). The user-facing noun was deliberately kept "store" for now. |
| **Guest** (not client/customer) | KB: "guest" in 343 chunks / 57 documents vs "client" in 62 chunks / 2 documents (the *JBA Policy Manual* and the STC-origin Framework). MRM: "delivers an outstanding guest experience". |
| **Maker** (frontline associate) | KB: MRM "Key Roles in the Makery — Maker: A frontline retail associate responsible for delivering exceptional guest service while assisting with product creation"; *Role-Based Training: New Maker Activity Book*; Revel POS Training ("Soap Maker Reports"). |
| **General Manager / Makery Manager** | MRM: "Operator, General Manager/Makery Manager"; "Makery Manager: Oversees daily operations…". Woven position **General Manager** (4 employees in the directory). |
| **Assistant General Manager** | Woven position (6 employees). Not defined in the KB documents searched. |
| **District Manager; DMIT; MIT** | MRM: "District Manager: Responsible for multiple locations…"; "Manager-in-Training or MIT"; "District Manager-in-Training Program, or DMIT". Woven position **District Manager** (2). So **DMIT and DM are genuine Buff terms.** |
| **Operator / Owner / Franchisee** | MRM; Woven positions **Operator** (3), **Owner** (1). |
| **Team Member** (full/part time) | Woven positions **Team Member Full Time** (7) and **Team Member Part Time** (45). |
| **Core Values** | KB: *Buff City Soap – Purpose & Core Values*: Safety, Resilience, Joy, Belonging. |
| **Guest-engagement standard** | KB: *7G Service* (Greet the Guest, Go Away, Go Back, Give a Basket, Guide the Guest, Get the Sale, Give a Sample). |
| **Systems** | KB: *Revel POS Training* (Management Console, Employees tab), *Buff Rewards* and *Secret Soap Society* (loyalty/membership), *Domo Reporting Overview Deck* (KPIs). Woven is the HR/directory system. |
| **Not found for Buff** | SDIT, TSD, ASD, FTTC, TC, SD, "Salon Director", PPTA, LPSVA, UPTA, Club Close, Bonus Viewer, SVC, Sunlync, Routine Mat — they appear only in the STC-origin Framework / JBA documents (SDIT occurs only in the Framework). "CareerPlug" appears in no Buff document. "MyGlow" appears only in the JBA Policy Manual (3 chunks). |

The Woven positions above are the *actual job titles* of Buff City Soap employees. None of the form roles (SD, ASD, SDIT, TSD, FTTC, TC) is a Woven position, so no form role can be assumed equal to a Woven position without approval.

## 3. Template-by-template findings

Template keys, permissions and every stored field key (`salon_productivity`, `salon_ppta`, `salon_key_returned`, …) are internal identifiers and are **not** proposed for change. Only labels, descriptions, instructions and printed text are.

### 3.1 Coaching Form — `coaching` — published v1 — legacy: **mild**

| ID | Exact wording | Why a concern | Recommended | Source | Approval | Class | Priority |
|---|---|---|---|---|---|---|---|
| CO-1 | Topic options: "Engaging Conversation", "Engaging Questions", "Relevant Recommendations", "Overcoming Objections", "Product Basics", "Completing the Engagement", "Sales Strategies/Upselling" | This is Sun Tan City's client-engagement sales sequence (the Framework lists "client engagement", "relevant recommendations", "tours"). Buff's documented model is *7G Service* | Offer Buff's 7G steps as topics, or keep generic. **Do not auto-map.** | KB *7G Service*; *Framework KB text* | Yes | B | Medium |
| CO-2 | "Store Tours" | Buff documents "store tour" in the *New Maker Activity Book* | Keep | KB *Role-Based Training: New Maker Activity Book* | No | C | Low |
| CO-3 | "New Client Documents" | "Client documents" is an STC contract/membership concept; the Buff equivalent is unknown | Ask Buff what paperwork a guest signs (waiver/rewards?) | — | Yes | B | Low |
| CO-4 | "Cleaning Tasks", "Type of Coaching: Underperformance / Training Plan of Action / Retraining" | Generic | Keep | — | No | C | Low |
| CO-5 | Acknowledgement: "…discussed this training and plan for improvement." | Generic | Keep | — | No | C | Low |

### 3.2 Corrective Action Form — `dpoa` — v1 — legacy: **none**
Types of warning/offense (Tardiness, Absenteeism, Standards of Conduct, Dress Code, Violation of Company Policies) and the closing sentence are generic and policy-driven. The form quotes the approved JBA manual at draft time (see section 5 on that manual). **C — preserve**, no findings.

### 3.3 Policy Review — `policy-review` — v1 — legacy: **none**
Generic ("TPOA" = Training Plan of Action). **C — preserve.**

### 3.4 SDIT EPP — `sdit-epp` — v2 — legacy: **heavy**

| ID | Exact wording | Why | Recommended | Source | Approval | Class | Priority |
|---|---|---|---|---|---|---|---|
| SD-1 | Name/short name/title "SDIT EPP", "Employee Performance Plan - SDIT"; `{{roleAbbr}}` = "SDIT"; reviewer `{{role}}` = "Training Store Director"; description "…for a Store Director in training" | SDIT/Training Salon Director are STC roles; no Buff equivalent documented. Buff has *MIT (Manager-in-Training)* but the mapping is a business call | Candidate: "Makery Manager in Training (MIT)" reviewed by "District Manager"/"General Manager". **Not to be assumed.** | MRM (MIT program) | Yes | B | High |
| SD-2 | "Personally, provide excellent client service." | "client" is STC wording | "…excellent guest service." | KB (guest in 57 docs) | No (terminology) | A | Medium |
| SD-3 | "Uphold the Buff City Soap Experience." | Was "Sun Tan City Experience"; "the Experience" is an STC brand standard, no Buff document defines it | Confirm the intended Buff standard (guest experience? values?) | — | Yes | B | Medium |
| SD-4 | "Determine focuses based on the Bonus Viewer." | Bonus Viewer is an STC report; found only in the Framework | Replace with the Buff report managers use (Revel/Domo?) — unknown | *Domo Reporting Overview Deck* (candidate) | Yes | B | High |
| SD-5 | "Follow through with Client Engagement Strategies with every client." | STC sales process | "…7G Service with every guest" (candidate) | KB *7G Service* | Yes | B | Medium |
| SD-6 | Productivity table PPTA / LPSVA / UPTA; "Store's current productivity"; "{{roleAbbr}}'s personal productivity"; field keys `salon_ppta/lpsva/upta` | Tanning sales KPIs (per-tan/visit metrics). Buff's KPI set is not defined here | Buff-approved KPI list from the Domo reporting deck; keep field keys or add new ones with approval | *Domo Reporting Overview Deck* | Yes | B | High |
| SD-7 | Acknowledgement: "…discussed this training document and I will participate in the plan for improvement." (user-flagged) | "training document" is the STC form's wording; the document is a performance plan | "…discussed this performance plan…" | — | Yes (HR wording) | B | Low |
| SD-8 | "Make fact based decisions when the Store Director is not present." | "Store Director" is a renamed STC title | Use the approved Buff manager title | Woven/MRM | Yes | B | Medium |
| SD-9 | Option "Promote a positive atmosphere and create "buy-in"", "Follow-up", Re-evaluation | Generic | Keep | — | No | C | Low |

### 3.5 TSD EPP (Management Performance Plan) — `tsd-epp` — v2 — legacy: **heavy**

| ID | Exact wording | Why | Recommended | Source | Approval | Class | Priority |
|---|---|---|---|---|---|---|---|
| TS-1 | Name "TSD EPP", `{{roleAbbr}}` = "TSD", description "…for a Training Store Director" | TSD = Training Salon Director (STC) | Candidate: "General Manager/Makery Manager" plan reviewed by District Manager | MRM; Woven | Yes | B | High |
| TS-2 | "What do you feel is the most important skill for a Store Director to possess?" | Renamed STC title | Approved Buff manager title | Woven/MRM | Yes | B | Medium |
| TS-3 | Manager productivity: PPTA, LPSVA, UPTA, **Club Close, Average Club Dollar** | Tanning/club-membership KPIs | Buff KPI list | *Domo Reporting Overview Deck* | Yes | B | High |
| TS-4 | "Store Standards of Cleanliness and Safety — Aware of all items on the SVC and able to describe to DM" | "SVC" is an STC checklist (not defined in any Buff document); Buff has cleaning checklists | Replace "SVC" with the Buff store-visit/cleaning checklist (e.g. *Closing Cleaning Checklist*) — confirm | KB *Closing Cleaning Checklist* (candidate) | Yes | B | Medium |
| TS-5 | "Coach team to provide, and personally provide, excellent client service." | client wording | "guest service" | KB | No | A | Medium |
| TS-6 | "Uphold the Buff City Soap Experience." | see SD-3 | confirm | — | Yes | B | Medium |
| TS-7 | Plan-of-action rows: Bench, Management Bench, Personal/Store Primary Productivity, Store Secondary Productivity ("KPI report to control expenses"), Coaching and Development, District Outreach | Generic management competencies; "Primary/Secondary productivity" assumes STC KPI structure | Keep structure; define "primary/secondary" with Buff KPIs | — | Yes | B | Medium |
| TS-8 | "This training document" acknowledgement | see SD-7 | | | Yes | B | Low |

### 3.6 ASD-SDIT Performance EPP — `asd-sdit-epp` — v2 — legacy: **heavy**

| ID | Exact wording | Why | Recommended | Source | Approval | Class | Priority |
|---|---|---|---|---|---|---|---|
| AS-1 | Name "ASD-SDIT Performance EPP", title "Performance EPP - ASD/SDIT", `{{roleAbbr}}` = "ASD", reviewer "Training Store Director", "ASD to SDIT development track" | ASD/SDIT are STC roles. Woven has **Assistant General Manager** | Candidate: AGM → General Manager development track. **Not assumed.** | Woven position map; MRM | Yes | B | High |
| AS-2 | "{{roleAbbr}}'s current productivity", "Store's current productivity" | Unnamed metrics (generic) but depends on KPI decision | Keep wording; align with KPI decision | — | No | C | Low |
| AS-3 | Acknowledgement "training document" | see SD-7 | | | Yes | B | Low |

### 3.7 FTTC Performance EPP — `fttc-epp` — v2 — legacy: **heavy** (user-reported)

| ID | Exact wording | Why | Recommended | Source | Approval | Class | Priority |
|---|---|---|---|---|---|---|---|
| FT-1 | Name "FTTC Performance EPP", short name "FTTC", title "Performance EPP - FTTC", description "Performance plan for a full-time Tanning Consultant." | FTTC = Full-Time Tanning Consultant. No tanning role exists at Buff | Woven title "Team Member Full Time" and/or MRM "Maker". **Do not assume Tanning Consultant = Maker/Team Member** — Buff must pick | Woven map (Team Member Full Time = 7 employees); MRM | Yes | B | High |
| FT-2 | "In what areas is the TC currently succeeding?" / "…currently need improvement?" (`{{roleAbbr}}` = "TC") | Abbreviation is STC | Use the approved role label | — | Yes | B | High |
| FT-3 | "TC's current productivity"; "TC Thoughts" | same | same | — | Yes | B | High |
| FT-4 | "{{role}} and {{roleAbbr}} will meet and re-evaluate the week of" → prints "Store Director and TC will meet…" | Reviewer title is the renamed STC "Salon Director"; subject is "TC" | "General Manager and <approved role>…" (candidate) | Woven; MRM | Yes | B | High |
| FT-5 | Variant label "FTTC review", variant reviewer "Store Director" | same | same | — | Yes | B | Medium |
| FT-6 | "…discussed this training document…" | see SD-7 | | | Yes | B | Low |

### 3.8 DMIT EPP — TSD Review — `dmit-epp-tsd` — v2 — legacy: **moderate**
### 3.9 DMIT EPP — DMIT Review — `dmit-epp-dmit` — v2 — legacy: **moderate**
(The two templates share one document and differ only in default variant.)

| ID | Exact wording | Why | Recommended | Source | Approval | Class | Priority |
|---|---|---|---|---|---|---|---|
| DM-1 | "To be reviewed with District Manager", "…responsibilities for a District Manager with Buff City Soap", DMIT variant "District Manager in Training" | **Verified Buff terms** (MRM: District Manager, DMIT) | Preserve | MRM; Woven | No | C | — |
| DM-2 | "The District Manager is responsible for overseeing several stores… loss prevention…" | Generic, matches MRM's DM definition in spirit | Keep; optionally align with MRM text | MRM | Optional | C | Low |
| DM-3 | TSD variant: label "TSD Review", `{{roleAbbr}}` "TSD", template name/short name "DMIT EPP — TSD Review", "DMIT / TSD" | TSD is an STC role | Decide whether the TSD reading is still needed at Buff; if not, retire (deactivate, never delete) | — | Yes | B | Medium |
| DM-4 | "…discussed this training document…" | see SD-7 | | | Yes | B | Low |
| DM-5 | "Store Goals: What are your store's current top three goals?" | Store wording done; generic | Keep | — | No | C | — |

### 3.10 Follow-Up Coaching Form — `follow-up-coaching` — v1 — legacy: **none**
Generic fields (Progress Level, Specific Evidence, Next Step: Continue / Role-play / EPP / Corrective Action / Leadership Review). Its *source* (Framework §9.2) is the STC document (see section 5). **C — preserve.**

### 3.11 Resignation/Exit Form — `resignation-exit` — v2 — legacy: **moderate**

| ID | Exact wording | Why | Recommended | Source | Approval | Class | Priority |
|---|---|---|---|---|---|---|---|
| RE-1 | "Place comment on employee's **Sunlync** account stating they are no longer employed, verify **tanning** has been removed." | Sunlync is Sun Tan City's tanning software; found in no Buff document | Replace with the real Buff system step (candidate to confirm: deactivate in Revel Management Console → Employees; Woven offboarding). **Do not assume.** | KB *Revel POS Training* (Management Console, Employees tab) | Yes | B | High |
| RE-2 | "…remove employee from **MyGlow**." | MyGlow appears only in the JBA Policy Manual (3 chunks) — a parent-company system; unclear if Buff uses it | Confirm | KB JBA manual | Yes | B | Medium |
| RE-3 | "Notify home office of employee's final date… HR, Payroll, and **Security System** purposes." | "Home office" / "Security System" are STC terms; Buff documents reference the **Support Center** (23 chunks) | Candidate: "Support Center"; confirm | KB *2026 Contact List – Buff City Soap Support Center* | Yes | B | Medium |
| RE-4 | "Store key was not returned. Employee will be payroll deducted **$25**…" | Dollar amount and the deduction rule are STC/JBA policy; the JBA manual is the only source ("payroll deduct", 5 chunks) | Confirm the Buff key policy and amount | KB JBA manual | Yes | B | Medium |
| RE-5 | "Immediate Voluntary Resignation / Did not fulfill required **14 day / 30 day** notice", "forfeit bonus", "dropped to minimum wage" | Notice periods and bonus/wage consequences are policy | Confirm they apply at Buff | KB JBA manual | Yes | B | Medium |
| RE-6 | "…upload Exit Form to employee's personal file…" | Generic | Keep | — | No | C | Low |
| RE-7 | "District Manager/Witness Signature (when required)" | Buff DM verified | Keep | MRM | No | C | — |

### 3.12 Demotion Form — `demotion` — v1 — legacy: **moderate**

| ID | Exact wording | Why | Recommended | Source | Approval | Class | Priority |
|---|---|---|---|---|---|---|---|
| DE-1 | Letterhead "**GlowBrands**" (all other forms print "Buff City Soap") | Parent company, not the store brand | Decide: Buff City Soap letterhead or keep GlowBrands as the issuing entity | — | Yes | B | Medium |
| DE-2 | Example text: "…from a FT (Job Title)… to a PT **Tanning Consultant** at $x.xx /hr…" | Tanning role in sample wording | Replace example with the approved Buff part-time role | Woven map | Yes | B | High |
| DE-3 | "…will not be eligible for benefits or the **monthly manager bonus**" and the PTO/insurance/90-day acknowledgement | Benefits and bonus rules are parent-company policy | Confirm applicability | — | Yes | B | Medium |
| DE-4 | "…they may be required to transfer locations to maintain morale and business functions." | Policy statement | Confirm | — | Yes | B | Low |

### 3.13 Position Transfer Form — `position-transfer` — v1 — legacy: **letterhead only**

| ID | Exact wording | Why | Recommended | Source | Approval | Class | Priority |
|---|---|---|---|---|---|---|---|
| PT-1 | Letterhead "GlowBrands" | see DE-1 | decide | — | Yes | B | Medium |
| PT-2 | Benefits acknowledgement (PTO/insurance/90 days) | see DE-3 | confirm | — | Yes | B | Medium |
| PT-3 | Description "…another store or position…" | Corrected in this release | Keep | — | No | C | — |

### 3.14 Prescreen / Phone Interview — `prescreen-phone-interview` — v2 — legacy: **heavy**

| ID | Exact wording | Why | Recommended | Source | Approval | Class | Priority |
|---|---|---|---|---|---|---|---|
| PS-1 | "Are you willing to use our services as part of your **Sun Tan City uniform**? (Must agree to **UV, Sunless and Spa** usage to proceed with employment)" | Names the old company and tanning services as an employment condition; meaningless at a soap store (and a hiring condition we must not invent) | Remove, or replace with a Buff-approved uniform/PPE acknowledgement | KB *Personal Protective Equipment Program*, *PPE List Guide* (candidates, not requirements) | **Yes (HR/legal)** | B | High |
| PS-2 | Description "…uniform agreement…" | tied to PS-1 | Update with PS-1 | — | Yes | B | Medium |
| PS-3 | "Attach this completed form to the online application email and file in your 'Applications' folder." | Process unknown at Buff (applicant tracking: CareerPlug appears in no Buff document) | Confirm process | — | Yes | B | Low |
| PS-4 | "…apply at a neighboring store if you do not have open positions" | Generic | Keep | — | No | C | — |

### 3.15 Tanning Consultant Interview — `tanning-consultant-interview` — v2 — legacy: **heavy**

| ID | Exact wording | Why | Recommended | Source | Approval | Class | Priority |
|---|---|---|---|---|---|---|---|
| TI-1 | Name "Tanning Consultant Interview Form", short name "TC Interview", title, description "The in-store interview for a Tanning Consultant" | Role does not exist at Buff | Rename for the approved frontline role (candidate "Maker Interview Form"; Woven "Team Member") | MRM (Maker); Woven | Yes | B | High |
| TI-2 | Heading "**Sun Tan City Core Values**" with five values: Nothing's Impossible, Work Hard Have Fun, We Speak Up, Own the Outcome, Win Together | Another company's values printed under the old company name | Buff values from the knowledge base: Safety, Resilience, Joy, Belonging | KB *Buff City Soap – Purpose & Core Values* | Yes (wording of question 8 and value count change) | B | High |
| TI-3 | Q8: "Our company has **five** core values…" | Buff documents four | "…four core values…" (after TI-2) | same | Yes | B | High |
| TI-4 | Q6: "…recommending products and services to **clients**…" | client wording; "services" is tanning | "…recommending products to guests…" | KB | Partial | A | Medium |
| TI-5 | Q4/Q5: "excellent customer service", "helping several customers" | Buff uses "guest" | "guest" | KB | No | A | Low |
| TI-6 | Q12: "…overseeing daily store operations" (asked of an associate role) | Management duty in an associate interview | Confirm intended essential functions | — | Yes | B | Low |
| TI-7 | "Update In Careerplug" | CareerPlug in no Buff document | Confirm applicant system | — | Yes | B | Low |
| TI-8 | Closing: "Reviewed pay structure and bonus potential" | Generic | Keep | — | No | C | — |

### 3.16 First Round Management Interview — `management-interview-round-1` — v2 — legacy: **heavy**

| ID | Exact wording | Why | Recommended | Source | Approval | Class | Priority |
|---|---|---|---|---|---|---|---|
| M1-1 | Role play: "…upset because the **tanning bed** they reserved is unavailable due to a mechanical issue… demanding a refund…" | A tanning scenario in a soap store | Replace with a Buff scenario of the business's choosing (e.g. an equipment/product-availability complaint) | KB *Adverse Event – Guest – In-Store* (candidate source of real scenarios) | Yes | B | High |
| M1-2 | "This role involves hands-on work like **cleaning beds** and doing laundry." | Tanning-bed cleaning | Buff hands-on duties (cleaning the Makery/equipment, production) | MRM (Maker role); *Cleaning Procedures for Soap Making Process* | Yes | B | High |
| M1-3 | "Core Values Speech… each of the **4** Core Values" | Matches Buff's four values (KB) — but the TC form lists five | Keep; align the TC form to four | KB Core Values | No | C | — |
| M1-4 | Sections on pay structure/bonuses, dress code, "sales targets in your last position" | Generic | Keep | — | No | C | — |
| M1-5 | "Update In Careerplug" | see TI-7 | confirm | — | Yes | B | Low |
| M1-6 | "…client service focus", "turned an unhappy client…" | client wording | "guest" | KB | No | A | Low |
| M1-7 | "Equipment maintenance & safety" checklist item | Generic (applies to soap equipment) | Keep | KB Hazard docs | No | C | — |

### 3.17 Second Round Management Interview — `management-interview-round-2` — v2 — legacy: **moderate**

| ID | Exact wording | Why | Recommended | Source | Approval | Class | Priority |
|---|---|---|---|---|---|---|---|
| M2-1 | Scenario 2: "…**lotions and memberships** sales are at their lowest in six months…" | Lotions are a real Buff product (Body Lotion docs); "memberships" is STC (Buff has Buff Rewards and the Secret Soap Society) | Reword with Buff products/programs after approval | KB *Secret Soap Society FAQ*; *Buff Rewards* docs | Yes | B | Medium |
| M2-2 | "…training plan for a new Assistant Store Director or **Tanning Consultant**?" | STC roles | "…new Assistant General Manager or Maker?" (candidate) | Woven; MRM | Yes | B | High |
| M2-3 | "If you were given direction as a **Store Director** to reduce expenses…" | Renamed STC title | Approved manager title | Woven; MRM | Yes | B | Medium |
| M2-4 | "How do you identify and develop future leaders within your store team?", compliance/performance questions | Generic | Keep | — | No | C | — |
| M2-5 | "Update In Careerplug" | see TI-7 | confirm | — | Yes | B | Low |

### 3.18 Team Member Check-In (Example) — `example-check-in` — v1, **inactive** — legacy: **none**
Already Buff-worded ("Guest Experience", "Product Knowledge", "Store Operations", "Team Member"). Marked "EXAMPLE FORM — not an approved Buff City Soap form". **C — preserve.**

## 4. Cross-cutting findings

| ID | Finding | Class | Priority |
|---|---|---|---|
| X-1 | "client" appears across forms/prompts where Buff says "guest" | A | Medium |
| X-2 | "Training document"/"discussed this training document" in 6 acknowledgements (SDIT, TSD, ASD-SDIT, FTTC and both DMIT templates) — user-flagged | B | Low |
| X-3 | Role vocabulary SDIT/TSD/ASD/FTTC/TC/SD is STC; Woven titles are General Manager, Assistant General Manager, District Manager, Operator, Owner, Team Member FT/PT | B | High |
| X-4 | Tanning KPI set (PPTA, LPSVA, UPTA, Club Close, Average Club Dollar) and Bonus Viewer/SVC | B | High |
| X-5 | "Buff City Soap Experience" in the EPP expectations (renamed from "Sun Tan City Experience") | B | Medium |
| X-6 | "GlowBrands" letterhead on two forms vs Buff elsewhere | B | Medium |
| X-7 | CareerPlug references on four hiring forms; no Buff source | B | Low |
| X-8 | Template/PDF filenames and Form Monitoring labels use names like "TC Interview", "FTTC", "SDIT EPP" | B (follows the role decision) | Medium |

## 5. Source documents that are themselves STC-origin (do not edit; replace by decision)

| Document | What it contains | Why it matters | Action |
|---|---|---|---|
| **ASK BUBBLES PERFORMANCE MANAGEMENT FRAMEWORK KB TEXT** (upload) | "Sun Tan City leader/operations" (11 chunks), "salon" (17), tanning (6), Spa %, Club Close %, PPTA, Routine Mat, "Salon Directors, Assistant Salon Directors, District Managers" | Pinned reasoning document: the AI drafts coaching/corrective/EPP content from it and, when absent, refuses | **B / High.** Needs a Buff-approved replacement uploaded by a knowledge manager. Historical record: do not rewrite in place. |
| **2025 JBA Policy Manual** (Woven) | Sun Tan City (13), Salon (6), Tanning (10), MyGlow (3); client tanning policy chapters | Official policy source quoted by Corrective Action/Policy Review. Already excluded in part by `knowledge.ts` heading rules | **C** — third-party source; Buff-specific policy source must come from Buff (decision) |

## 6. Downstream dependencies (what changes if replacements are approved)

| Area | Where | Effect |
|---|---|---|
| **Templates and variants** | `src/lib/forms/library.ts`, `hiring-library.ts`, `exit-library.ts`, `employment-change-library.ts`; `{{role}}`/`{{roleAbbr}}` variants | New seed revisions (additive; old versions archived). Field keys unchanged. |
| **PDF generation** | `pdf-render.ts` prints template name, variant label, role and abbreviations in headers/footers; filename from template name | Follows the template text; no renderer change unless layout/length shifts. |
| **Parity tests** | `template-parity.test.ts`, `approved-template-changes.json`, `ask-sunny-published-templates.json` (Ask Sunny stays untouched) | Business-approved content changes need a new authorized category in the parity test and approved-change entries. |
| **AI-generated drafts** | `form-proposal.ts`, `inline-draft.ts`, `plan-summary.ts`, `epp-intake.ts`, `corrective-action-intake.ts`, `exit-draft.ts`, `exit-intake.ts`, `ca-policy.ts`, `form-answers.ts`, `mock-provider.ts` | Intake questions (e.g. the five TSD productivity metrics), role routing ("an SDIT" → `sdit-epp`), examples and drafting rules reference STC roles, KPIs, Sunlync/MyGlow. Prompts and tests change with the role/KPI decisions. |
| **Employee/job-title matching** | `src/config/company/job-titles.ts` (typed titles), `template-intent.ts` (44 role/form phrases), `proposal.ts`, `employee-reference.ts`, `employee-performance-gate.ts` | Add Buff titles (General Manager, Assistant General Manager, Team Member, Maker, MIT, DMIT) alongside, not instead of, the existing patterns so typed legacy titles still resolve. |
| **Woven integration** | `woven_position_map`, directory, access plan | **No change needed**: roles/permissions map from Woven positions, not from these form labels. Woven records must not be modified. Form job titles come from Woven/typed text. |
| **Form Monitoring / previews** | template `name`, `short_name`, variant labels | Visible names change when templates are renamed; template keys (`fttc-epp`, `tanning-consultant-interview`) and permissions (`create_epp`, `create_hiring_form`) stay. |
| **Knowledge base** | Framework document, JBA manual rules in `knowledge.ts`/`brand-sections.ts`, `scripts/knowledge/framework-debrand.mjs` | Replace/approve the Framework text; keep the debrand flag list. |
| **Chooser/routing keys** | `chooser.ts`, `inline-draft.ts` allow-lists by key | Unchanged if keys are kept. |

## 7. Proposed replacement glossary (all pending approval)

| Legacy / current wording | Proposed Buff wording | Support | Status |
|---|---|---|---|
| client(s) | guest(s) | 57 KB documents; MRM | **Verified (A)** |
| Sun Tan City Core Values (five) | Buff City Soap Core Values: Safety, Resilience, Joy, Belonging | KB *Purpose & Core Values* | **Verified text; wording/count change needs approval** |
| Client Engagement Strategies | 7G Service (Greet, Go Away, Go Back, Give a Basket, Guide, Get the Sale, Give a Sample) | KB *7G Service* | Candidate — approval |
| Tanning Consultant (TC), FTTC | Maker / "Team Member Full Time" (Woven) | MRM; Woven | **Not assumed — Buff to choose** |
| Store/Salon Director (SD) | General Manager / Makery Manager | MRM; Woven | Candidate — approval |
| Assistant Salon/Store Director (ASD) | Assistant General Manager | Woven | Candidate — approval |
| SDIT / TSD | Makery Manager in Training (MIT) or retire | MRM (MIT) | Unknown — approval |
| District Manager, DMIT | unchanged | MRM; Woven | **Verified (C)** |
| Training Store Director (reviewer) | District Manager or General Manager | — | Unknown — approval |
| PPTA / LPSVA / UPTA / Club Close / Average Club Dollar | Buff KPI set (Domo reporting) | KB *Domo Reporting Overview Deck* | Unknown — approval |
| Bonus Viewer | Buff report used for focus-setting | — | Unknown |
| SVC | Buff store checklist (e.g. closing cleaning checklist) | KB checklist | Candidate — approval |
| Sunlync / "verify tanning has been removed" | Buff offboarding system step (Revel Management Console? Woven?) | KB *Revel POS Training* | Unknown — approval |
| home office / Security System | Support Center | KB Contact List | Candidate — approval |
| memberships | Buff Rewards / Secret Soap Society (as applicable) | KB | Candidate — approval |
| "UV, Sunless and Spa" uniform condition | removed or Buff PPE/uniform acknowledgement | KB PPE docs | Unknown — HR/legal |
| GlowBrands letterhead | Buff City Soap or keep | — | Unknown |
| "training document" | "performance plan" | — | Wording — HR approval |
| store | Makery? | brand guidelines | Open question (already decided to keep "store" for now) |

## 8. Recommended implementation plan (after approval)

1. **Approval workshop** with Buff HR/operations: role mapping (X-3), KPI set (X-4), Experience/engagement standards, hiring conditions, exit-form system steps, key deduction/notice/bonus rules, letterhead, CareerPlug.
2. **PR 1 — class A only:** "client → guest", plus any wording already approved; new seed revisions; parity-test category for approved content changes.
3. **PR 2 — hiring forms** (Prescreen, TC interview → approved role name, Round 1, Round 2): core values, scenarios, uniform question.
4. **PR 3 — Resignation/Exit** and **Demotion/Transfer** (system steps, letterhead, example role).
5. **Framework document replacement** (knowledge upload by a knowledge manager) *before* PR 4.
6. **PR 4 — EPP family:** role labels, variants, KPI tables, intake questions, AI examples, job-title patterns (additive).
7. Each PR ships through the existing additive, idempotent sync: new versions, old ones archived, filed forms pinned. After deploy, an authorized admin opens Forms → Form Templates (or POSTs); verify read-only as done for the Store release.

## 9. Open questions for Buff City Soap
1. Which Buff titles correspond to TC/FTTC, SD, ASD, SDIT, TSD (or should these plans be redesigned around Maker / Makery Manager / MIT)?
2. Which KPIs should the performance plans track?
3. Should "Buff City Soap Experience" be reworded to a defined Buff standard?
4. Is a uniform or product-use acknowledgement required at hire? What exactly?
5. What are the real offboarding system steps (Revel? Woven? Support Center)?
6. Do the $25 key deduction, 14/30-day notice, bonus forfeiture and minimum-wage rules apply at Buff?
7. Issuing entity on the Demotion/Transfer letterhead (GlowBrands or Buff City Soap)?
8. Is CareerPlug used? What is the application-filing process?
9. Should the TSD variant of the DMIT plan be retired?

## 10. What this audit did not do
No template, version, form, Woven record, knowledge document or code was changed. The 18 templates, their version history and the 23 filed forms are exactly as they were. Ask Sunny, and the two concurrent Woven/store-recognition branches, were not touched.

## 11. Source-of-truth inventory

The knowledge base holds **128 documents**: 1 upload (the Performance Management Framework) and 127 from Woven (126 file-library documents plus the JBA Policy Manual handbook). 126 are indexed; 2 failed to index (*April 2026 Master Calendar*, *Buff Rewards Revel Tech Guide*). No document is marked superseded.

| Tier | Documents | Trust for form content | Notes |
|---|---|---|---|
| **1 — Official Buff City Soap (franchisor-issued)** | *Makery Reference Manual (MRM)* (© 2026); *Buff City Soap – Purpose & Core Values*; *7G Service*; *Role-Based Training: New Maker Activity Book*; *Revel Employee Management*; *Revel POS Training* (© 2021); *Revel Opening/Closing Procedures*; *Opening and Closing Checklists*, *Opening/Closing/Weekly Cleaning Checklist*; *Domo Reporting Overview Deck* (Oct 2025); *Retail Theater Best Practices*; *Visual Merchandising 101*; *Buff Rewards* and *Secret Soap Society* guides; *2026 Contact List – Buff City Soap Support Center*; *Personal Protective Equipment Program*, *PPE List Guide*, *Hazardous Communication Training Manual*, *OSHA and Workplace Safety*, *Voluntary Respiratory Policy*; *Adverse Event – Guest – In-Store*; *BCS Franchisee Social Media Policy*; *Non-Disclosure Agreement*; *Buff City Soap Photo Release* | **High** for Buff terminology, roles, values, guest-service model, systems and operations | Written for franchisees ("Makery"). They define roles and processes but **contain no HR discipline, attendance, notice, payroll-deduction or bonus policy**. |
| **2 — Company-issued, multi-brand policy** | *2025 JBA Policy Manual – Edited 5-2025* (Woven handbook) | **High for company-wide and Buff-labelled sections; not for other brands'** | Covers Sun Tan City, Buff City Soap and Crunch. Ask Bubbles already filters it to company-wide + Buff blocks (`POLICY_MANUAL_BRAND_SCOPE`). It is the **only** employment-policy source (separation pay, notice, return of property, standards of conduct, dress code, PTO, benefits, bonus). Retained text still uses "client" and brand-neutral position codes. |
| **3 — Legacy, Sun Tan City origin** | *ASK BUBBLES PERFORMANCE MANAGEMENT FRAMEWORK KB TEXT* (upload, tagged `performance-management-framework`, 88 chunks); the Sun Tan City / Crunch chapters and bullets inside the JBA manual | **Methodology only; not Buff policy** | Framework mentions Sun Tan City (11 chunks), "salon" (17), tanning (6), Spa %/Club Close %/PPTA, Bonus Viewer, Routine Mat, "Salon Directors, Assistant Salon Directors". Adopted verbatim on 8 Oct 2026 (owner decision); never reviewed for Buff content. |
| **4 — Woven structured data** | `woven_position_map`, employee directory (read-only) | **High** for current job titles | General Manager (4), Assistant General Manager (6), District Manager (2), Operator (3), Owner (1), Team Member Full Time (7), Team Member Part Time (45), plus non-store functions. |
| **5 — Not relevant to form content** | Recipe books, production SOPs, logistics/SFS guides, POS scan sheets, product guides, calendars, etc. | n/a | Not used for this work. |

### 11.1 Contradictions and outdated material found

| # | Issue | Evidence | Handling |
|---|---|---|---|
| 1 | **Which personnel system is Buff's?** The JBA manual says Buff City Soap = **MyGlow** and Woven only for Crunch; Ask Bubbles reads Buff employees from **Woven** (Midwest Soap Makers) | JBA manual pp.36, 38, 48 | Needs Buff to confirm; does not block terminology work; exit-form MyGlow step is kept. |
| 2 | **Three role vocabularies:** JBA position codes (MM/SD/GM/TSD/DM; AMM/ASD/AGM), MRM ("General Manager/Makery Manager"), Woven titles (General Manager, Assistant General Manager) | JBA p.34, p.42; MRM; Woven map | No automatic mapping; only the manual's explicit pairings are proposed, with approval. |
| 3 | **Core values: five vs four.** TC interview prints five Sun Tan City values and says "five"; Round 1 says "4 Core Values"; the KB lists four Buff values | forms; KB *Purpose & Core Values* | Align to four (approval). |
| 4 | **"Client" vs "guest".** Buff documents say guest (57 documents); the JBA manual and Framework say client | KB counts | Change form/prompt wording; leave verbatim policy quotes alone. |
| 5 | **Dated sources:** *Revel POS Training* is © 2021; *Domo Reporting Overview Deck* is Oct 2025; the JBA manual is edited May 2025; two documents failed to index | KB metadata | Prefer MRM (2026) where they overlap; re-check dated items before relying on them. |
| 6 | **Duplicate-looking Buff documents** (several opening/closing checklists, two laundry cheat sheets) | titles | Not form-relevant; no action. |
| 7 | **Framework vs Buff reality:** the Framework's role list (SD, ASD, SDIT, TSD, DMIT) and sales metrics describe Sun Tan City | KB Framework | Legacy; see section 13. |

## 12. Verified Buff City Soap terms used for proposals (with sections)

| Term | Document and section |
|---|---|
| Makery; Maker (frontline associate); Makery Manager = "General Manager/Makery Manager"; Operator; Franchisee | MRM, "Key Roles in the Makery"; "Initial Training" |
| District Manager ("Responsible for multiple locations… guest experience… developing store managers") | MRM |
| Manager-in-Training (MIT) and District Manager-in-Training (DMIT) programs | MRM, "Role-Specific Training Programs" |
| Assistant Makery Manager ("Assistant Salon Directors/Assistant Makery Managers") | JBA manual, PTO "Eligibility" p.42 |
| Position codes MM/SD/GM/TSD/DM and AMM/ASD/AGM | JBA manual, "Employee Classifications" p.34 |
| Core Values: Safety, Resilience, Joy, Belonging | *Purpose & Core Values* |
| Guest-service model: Greet the Guest, Go Away, Go Back, Give a Basket, Guide the Guest, Get the Sale, Give a Sample | *7G Service* |
| Store KPIs: Net Sales, Comp Sales %, Items per Transaction (IPT), Average Order Value (AOV), Discount Rates %, Product Mix % of Net Sales | *Domo Reporting Overview Deck* (Daily/Weekly FZ Operations Sales KPI dashboards) |
| Offboarding in Revel: deactivate (not delete) an employee in the Management Console → Employees → Active | *Revel Employee Management*; *Revel POS Training* pp.36–39 |
| Separation rules: 2-week notice (FT/PT), 30-day (management), hourly reduced to minimum wage and loses bonus potential, no bonus on involuntary termination, ineligible for rehire without notice | JBA manual, "Pay on Separation of Employment" pp.35–36; "What to Expect When Terminated" p.35 |
| Return of company property incl. keys: by 5 pm the next business day | JBA manual, "Return of Property" p.36 |
| Personnel platform: Buff City Soap – MyGlow | JBA manual, "Employee Records" p.36 |
| Buff dress code (plain black/white/gray top under the branded apron; branded tops) | JBA manual, dress code, "Buff City Soap:" pp.16–17 |
| Standards of Conduct: demotion/transfer as disciplinary outcomes | JBA manual p.13 |
| Support Center contact list | *2026 Contact List – Buff City Soap Support Center* |
| Buff loyalty/membership: Buff Rewards, Secret Soap Society | respective FAQs |

**No verified Buff City Soap equivalent found** for: Tanning Consultant / FTTC / TC, SDIT, TSD, "Store Director" as a Buff title, PPTA, LPSVA, UPTA, Club Close, Average Club Dollar, Bonus Viewer, SVC, Sunlync, "Buff City Soap Experience" as a defined standard, a product-use hiring requirement, the $25 key deduction, CareerPlug, a "monthly manager bonus".

## 13. AI knowledge grounding review

**Question:** does Ask Bubbles use legacy Sun Tan City content when drafting Buff City Soap HR forms? **Yes**, through one path, by design.

| # | Finding | Evidence |
|---|---|---|
| G1 | The Performance Management Framework is a **pinned role document** (resolved by tag `performance-management-framework`). For governed drafts (coaching, corrective action, policy review, follow-up, EPPs) up to 16 of its chunks across 12 heading groups are placed in the prompt as "the approved progression; reason from this". If it is absent the draft is **blocked** (fail-closed). | `PINNED_KNOWLEDGE_ROLES`, `maxMandatoryChunks: 16` (`src/config/company/knowledge.ts`); `document-roles.ts`; draft route; tests "a governed draft is blocked when the framework is unavailable" |
| G2 | The pinned document is Sun Tan City text: role titles (Salon Directors, ASD, SDIT, TSD), metrics (Spa %, Club Close %, PPTA, OTC), tools (Bonus Viewer, Comp Report), "Sun Tan City leader". Drafts therefore reason from STC concepts and can echo them. | KB: 88 chunks; term counts in section 11; `framework-debrand.mjs` `FLAGGED_TERMS` |
| G3 | Policy quotations on forms come from the **JBA manual only**, already **brand-scoped**: other brands' sections, blocks and bullets are dropped from retrieval, handbook coverage and every policy citation. | `POLICY_MANUAL_BRAND_SCOPE`, `brand-sections.ts` |
| G4 | The Buff operations documents (MRM, 7G Service, Core Values, Revel, Domo) are in general Q&A retrieval but I found **no retrieval of them in the form-drafting path**, so drafts have no Buff vocabulary to draw on. | draft route imports; `official-policy-manual.ts` |
| G5 | The Framework's 88 chunks are also ordinary retrievable chunks in general Q&A (not only when pinned), so an unrelated question can surface STC text unlabelled. | `server-ask.ts` retrieval |
| G6 | Verbatim policy text keeps "client" and brand-neutral codes (e.g. late-opening "restitution to affected clients"). Correct to keep. | JBA p.16 |

### Recommended safe approach (no document is removed or altered now)
1. **Label, don't delete.** When approved: add a provenance tag (e.g. `legacy-sun-tan-city`) to the Framework from the Knowledge Base screen (a metadata edit; content untouched) and show citations from it as "legacy methodology — not Buff policy".
2. **Code-level output guard (no data change).** Reuse the existing `FLAGGED_TERMS` list as a runtime check on every governed draft: Sun Tan City, salon, tanning, Spa/sunless/UV, PPTA/LPSVA/UPTA/Club Close, Bonus Viewer, Routine Mat, and the role codes SDIT/TSD/FTTC/TC. A hit is stripped or the field is withheld with a manager-visible note, exactly like `policy-claim-guard.ts`. Log hits (structured, redacted) to measure the problem.
3. **Prompt framing.** Keep the Framework as *methodology only* ("behaviour-focused documentation, observe → expectation → follow-up") and state in the prompt that its role titles, metrics and tools are not Buff's; supply only Buff-verified vocabulary (guest, Maker/Makery Manager per approval, Core Values, 7G Service).
4. **A small Buff grounding set for drafting vocabulary**, curated by a knowledge manager: pin only vetted Buff terminology documents (e.g. *Purpose & Core Values*, *7G Service*) for form drafting, so drafts use Buff words rather than STC ones.
5. **Replace by versioning, not deletion.** When Buff supplies its own framework, upload it as a **new version of the tagged document** (the KB keeps `version`, `previous_versions`, `superseded_by`) — never as a second tagged document (two tagged documents is an `ambiguous` failure by design).
6. **Retrieval hygiene.** Exclude the legacy-tagged document from general Q&A retrieval except for performance-management questions.
7. **Regression tests:** for each governed template, mocked drafts must contain none of the flagged terms; the pinned-role and fail-closed behaviour must be unchanged; the JBA brand-scope tests must pass untouched.

## 14. Evidence-backed replacement matrix (all 82 findings)

Disposition: **SAFE** = supported by Buff documents, low risk, can proceed once you approve this plan · **APPROVAL** = a Buff-supported proposal exists but changes meaning/policy/process · **HOLD** = no verified Buff equivalent (or a pure business decision) · **PRESERVE** = keep as is. Confidence is how directly the cited document supports the proposed wording.
Existing wording is quoted from the first-pass tables above.

| ID | Existing wording | Proposed Buff City Soap wording | Supporting KB document / section | Confidence | Disposition | Impact (templates / PDFs / AI drafting / related) |
|---|---|---|---|---|---|---|
| CO-1 | Topic options: "Engaging Conversation", "Engaging Questions", "Relevant Recommendations", "Overcoming Objections", "Product Basics", "Completing the Engagement", "Sales Strategies/Upselling" | Offer Buff's 7G steps as topics (Greet the Guest, Go Away, Go Back, Give a Basket, Guide the Guest, Get the Sale, Give a Sample) or keep generic topics. Option keys kept. | KB: *7G Service* (all steps) | Medium | **APPROVAL** | Template + PDF checkboxes; AI topic selection and coaching drafts; topic matching in `template-intent.ts` |
| CO-2 | "Store Tours" | Keep "Store Tours". | KB: *Role-Based Training: New Maker Activity Book* ("store tour") | Medium | **PRESERVE** | None |
| CO-3 | "New Client Documents" | No verified Buff City Soap equivalent found. (Buff guest paperwork found: *Buff Parties – Guest Waiver*, *Photo Release* — not equivalent). | — | None | **HOLD** | None until decided |
| CO-4 | "Cleaning Tasks", "Type of Coaching: Underperformance / Training Plan of Action / Retraining" | Keep. | Generic | High | **PRESERVE** | None |
| CO-5 | Acknowledgement: "…discussed this training and plan for improvement." | Keep. | Generic | High | **PRESERVE** | None |
| SD-1 | Name/short name/title "SDIT EPP", "Employee Performance Plan - SDIT"; `{{roleAbbr}}` = "SDIT"; reviewer `{{role}}` = "Training Store Director"; description "…for a Store Director in training" | SDIT / Training Store Director: No verified Buff City Soap equivalent found. Only candidate: the Makery Manager Training Program ("Manager-in-Training or MIT"). Not mapped. | KB: *Makery Reference Manual (MRM)*, "Role-Specific Training Programs" (Makery Manager Training Program / MIT; DMIT) | Low | **HOLD** | Template + PDF; AI drafting prompts/intake/examples; job-title patterns |
| SD-2 | "Personally, provide excellent client service." | "Personally, provide excellent guest service." | KB: *Makery Reference Manual (MRM)*, "Key Roles in the Makery" (Maker: "delivering exceptional guest service"); 57 documents use "guest" | High | **SAFE** | Template + PDF + AI drafting (prompts, intake, tests) |
| SD-3 | "Uphold the Buff City Soap Experience." | "Deliver an outstanding guest experience." (MRM's own phrase) — or Buff's chosen standard. "The Buff City Soap Experience": No verified Buff City Soap equivalent found. | KB: *MRM*, District Manager definition ("delivers an outstanding guest experience") | Medium | **APPROVAL** | Template + PDF + AI drafting (prompts, intake, tests) |
| SD-4 | "Determine focuses based on the Bonus Viewer." | Bonus Viewer: No verified Buff City Soap equivalent found. (Domo dashboards exist, but no document names a focus-setting report for managers). | — | None | **HOLD** | Template + PDF + AI drafting (prompts, intake, tests) |
| SD-5 | "Follow through with Client Engagement Strategies with every client." | "Follow through with 7G Service with every guest." (candidate) | KB: *7G Service* | Medium | **APPROVAL** | Template + PDF + AI drafting (prompts, intake, tests) |
| SD-6 | Productivity table PPTA / LPSVA / UPTA; "Store's current productivity"; "{{roleAbbr}}'s personal productivity"; field keys `salon_ppta/lpsva/upta` | PPTA / LPSVA / UPTA: No verified Buff City Soap equivalent found. Documented store KPIs available to choose from: Net Sales, Comp Sales %, Items per Transaction (IPT), Average Order Value (AOV), Discount Rates %, Product Mix % of Net Sales. Not mapped. | KB: *Domo Reporting Overview Deck*, "Daily/Weekly FZ Operations Sales KPI Dashboard" | Low (mapping) / Medium (KPI list) | **HOLD** | Template fields (keys `salon_ppta/lpsva/upta` kept or new keys), PDF; AI intake asks these metrics; plan-summary |
| SD-7 | Acknowledgement: "…discussed this training document and I will participate in the plan for improvement." (user-flagged) | "…discussed this performance plan…" (wording only). | — | n/a | **APPROVAL** | Template + PDF only |
| SD-8 | "Make fact based decisions when the Store Director is not present." | "Makery Manager" (or "General Manager"). Basis: manual lists MM/SD/GM/TSD/DM in one tier; MRM "General Manager/Makery Manager"; Woven "General Manager". | KB: *2025 JBA Policy Manual*, "Employee Classifications" p.34; KB: *Makery Reference Manual (MRM)*, "Key Roles in the Makery" | Medium | **APPROVAL** | Template + PDF; AI drafting prompts/intake/examples; job-title patterns |
| SD-9 | Option "Promote a positive atmosphere and create "buy-in"", "Follow-up", Re-evaluation | Keep. | Generic | High | **PRESERVE** | None |
| TS-1 | Name "TSD EPP", `{{roleAbbr}}` = "TSD", description "…for a Training Store Director" | TSD / Training Store Director: No verified Buff City Soap equivalent found. ("TSD" appears in the manual only in a list of position codes, p.34). | KB: *2025 JBA Policy Manual*, "Employee Classifications" p.34 | None | **HOLD** | Template + PDF; AI drafting prompts/intake/examples; job-title patterns |
| TS-2 | "What do you feel is the most important skill for a Store Director to possess?" | "…skill for a Makery Manager (General Manager) to possess?" | KB: *2025 JBA Policy Manual*, "Employee Classifications" p.34; KB: *Makery Reference Manual (MRM)*, "Key Roles in the Makery" | Medium | **APPROVAL** | Template + PDF; AI drafting prompts/intake/examples; job-title patterns |
| TS-3 | Manager productivity: PPTA, LPSVA, UPTA, **Club Close, Average Club Dollar** | Club Close / Average Club Dollar / PPTA / LPSVA / UPTA: No verified Buff City Soap equivalent found. Candidate documented KPIs: see SD-6. | KB: *Domo Reporting Overview Deck*, "Daily/Weekly FZ Operations Sales KPI Dashboard" | Low | **HOLD** | Template + PDF + AI drafting (prompts, intake, tests) |
| TS-4 | "Store Standards of Cleanliness and Safety — Aware of all items on the SVC and able to describe to DM" | "SVC": No verified Buff City Soap equivalent found. Documented Buff checklists: *Opening and Closing Checklists*, *Closing Cleaning Checklist*, *Weekly Cleaning Checklist*. e.g. "Aware of all items on the Closing Cleaning Checklist…" (candidate). | KB: *Closing Cleaning Checklist*; *Opening and Closing Checklists* | Medium | **APPROVAL** | Template + PDF + AI drafting (prompts, intake, tests) |
| TS-5 | "Coach team to provide, and personally provide, excellent client service." | "Coach team to provide, and personally provide, excellent guest service." | KB: *Makery Reference Manual (MRM)*, "Key Roles in the Makery"; guest in 57 documents | High | **SAFE** | Template + PDF + AI drafting (prompts, intake, tests) |
| TS-6 | "Uphold the Buff City Soap Experience." | Same as SD-3. | KB: *MRM* | Medium | **APPROVAL** | Template + PDF + AI drafting (prompts, intake, tests) |
| TS-7 | Plan-of-action rows: Bench, Management Bench, Personal/Store Primary Productivity, Store Secondary Productivity ("KPI report to control expenses"), Coaching and Development, District Outreach | Keep structure; define "primary/secondary productivity" with the KPIs Buff selects. | KB: *Domo Reporting Overview Deck*, "Daily/Weekly FZ Operations Sales KPI Dashboard" | Low | **APPROVAL** | Template + PDF + AI drafting (prompts, intake, tests) |
| TS-8 | "This training document" acknowledgement | Same as SD-7. | — | n/a | **APPROVAL** | Template + PDF only |
| AS-1 | Name "ASD-SDIT Performance EPP", title "Performance EPP - ASD/SDIT", `{{roleAbbr}}` = "ASD", reviewer "Training Store Director", "ASD to SDIT development track" | ASD → "Assistant Makery Manager (AMM)": the manual pairs "Assistant Salon Directors/Assistant Makery Managers" and lists AMM/ASD/AGM together; Woven title is "Assistant General Manager" (relationship to AMM unconfirmed). SDIT half: No verified Buff City Soap equivalent found. | KB: *2025 JBA Policy Manual*, PTO "Eligibility" p.42; KB: *2025 JBA Policy Manual*, "Employee Classifications" p.34; Woven position map | Medium (ASD↔AMM) / None (SDIT) | **APPROVAL** | Template + PDF; AI drafting prompts/intake/examples; job-title patterns |
| AS-2 | "{{roleAbbr}}'s current productivity", "Store's current productivity" | Keep. | Generic | High | **PRESERVE** | None |
| AS-3 | Acknowledgement "training document" | Same as SD-7. | — | n/a | **APPROVAL** | Template + PDF only |
| FT-1 | Name "FTTC Performance EPP", short name "FTTC", title "Performance EPP - FTTC", description "Performance plan for a full-time Tanning Consultant." | Tanning Consultant / FTTC / TC: No verified Buff City Soap equivalent found. MRM describes the **Maker** (frontline associate) and Woven has **Team Member Full/Part Time**, but no document says either replaces Tanning Consultant. Not mapped. | KB: *Makery Reference Manual (MRM)*, "Key Roles in the Makery"; Woven position map | None (mapping) | **HOLD** | Template + PDF; AI drafting prompts/intake/examples; job-title patterns |
| FT-2 | "In what areas is the TC currently succeeding?" / "…currently need improvement?" (`{{roleAbbr}}` = "TC") | Tanning Consultant / FTTC / TC: No verified Buff City Soap equivalent found. MRM describes the **Maker** (frontline associate) and Woven has **Team Member Full/Part Time**, but no document says either replaces Tanning Consultant. Not mapped. | KB: *Makery Reference Manual (MRM)*, "Key Roles in the Makery"; Woven position map | None (mapping) | **HOLD** | Template + PDF; AI drafting prompts/intake/examples; job-title patterns |
| FT-3 | "TC's current productivity"; "TC Thoughts" | Tanning Consultant / FTTC / TC: No verified Buff City Soap equivalent found. MRM describes the **Maker** (frontline associate) and Woven has **Team Member Full/Part Time**, but no document says either replaces Tanning Consultant. Not mapped. | KB: *Makery Reference Manual (MRM)*, "Key Roles in the Makery"; Woven position map | None (mapping) | **HOLD** | Template + PDF; AI drafting prompts/intake/examples; job-title patterns |
| FT-4 | "{{role}} and {{roleAbbr}} will meet and re-evaluate the week of" → prints "Store Director and TC will meet…" | Reviewer: "Makery Manager"/"General Manager" (as SD-8). Subject role label: held (see FT-1). | KB: *2025 JBA Policy Manual*, "Employee Classifications" p.34; KB: *Makery Reference Manual (MRM)*, "Key Roles in the Makery" | Medium (reviewer) / None (subject) | **HOLD** | Template + PDF; AI drafting prompts/intake/examples; job-title patterns |
| FT-5 | Variant label "FTTC review", variant reviewer "Store Director" | Held with FT-1; reviewer per SD-8. | — | None | **HOLD** | Template + PDF; AI drafting prompts/intake/examples; job-title patterns |
| FT-6 | "…discussed this training document…" | Same as SD-7. | — | n/a | **APPROVAL** | Template + PDF only |
| DM-1 | "To be reviewed with District Manager", "…responsibilities for a District Manager with Buff City Soap", DMIT variant "District Manager in Training" | Keep. DM and DMIT are documented Buff terms. | KB: *MRM* ("District Manager", "District Manager-in-Training Program, or DMIT"); Woven "District Manager" | High | **PRESERVE** | None |
| DM-2 | "The District Manager is responsible for overseeing several stores… loss prevention…" | Keep (matches MRM's District Manager definition: "Responsible for multiple locations…"; optionally align wording). | KB: *MRM*, District Manager | High | **PRESERVE** | None |
| DM-3 | TSD variant: label "TSD Review", `{{roleAbbr}}` "TSD", template name/short name "DMIT EPP — TSD Review", "DMIT / TSD" | TSD variant: No verified Buff City Soap equivalent found. Retire only if Buff confirms; templates are deactivated, never deleted. | KB: *2025 JBA Policy Manual*, "Employee Classifications" p.34 | None | **HOLD** | Template active flag, Form Monitoring, template-intent routing |
| DM-4 | "…discussed this training document…" | Same as SD-7. | — | n/a | **APPROVAL** | Template + PDF only |
| DM-5 | "Store Goals: What are your store's current top three goals?" | Keep. | Generic | High | **PRESERVE** | None |
| RE-1 | "Place comment on employee's **Sunlync** account stating they are no longer employed, verify **tanning** has been removed." | Replace the Sunlync step with the documented Buff offboarding action — e.g. "Deactivate the employee in the Revel Management Console (Employees → Active)" — **only if the business confirms it belongs on this checklist**. "Verify tanning has been removed": No verified Buff City Soap equivalent found. | KB: *Revel Employee Management*, "Editing Employee Info and Deactivating Employees" (also *Revel POS Training*, Management Console, pp.36–39) | Medium | **APPROVAL** | Template + PDF; exit draft prompt (`exit-draft.ts` mentions Sunlync); exit-intake |
| RE-2 | "…remove employee from **MyGlow**." | Keep "MyGlow" — the manual names it as Buff City Soap's personnel platform. **Conflict to resolve:** the same manual lists Woven only for Crunch, while Ask Bubbles reads Buff employees from Woven. | KB: *2025 JBA Policy Manual*, "Employee Records" p.36 ("Buff City Soap – MyGlow"); also pp.38, 48 | High (MyGlow) / flagged conflict | **PRESERVE** | None (exit draft prompt already lists MyGlow) |
| RE-3 | "Notify home office of employee's final date… HR, Payroll, and **Security System** purposes." | "Notify the Corporate Office / Support Center…" (candidate). "Security System": No verified Buff City Soap equivalent found. | KB: *2025 JBA Policy Manual* p.36 ("Corporate Office"); *2026 Contact List – Buff City Soap Support Center* | Low | **APPROVAL** | Template text (new seed revision); PDF prints it; Form Monitoring label if renamed |
| RE-4 | "Store key was not returned. Employee will be payroll deducted **$25**…" | Keep the "key returned" question (manual: keys returned by 5 pm next business day). The **$25 key deduction**: No verified Buff City Soap equivalent found. ($25 appears in the manual only for a late opening, p.16). | KB: *2025 JBA Policy Manual*, "Return of Property" p.36 | High (question) / None ($25) | **HOLD** | Template statement text; exit-library constant `SALON_KEY_DEDUCTION_STATEMENT`; PDF |
| RE-5 | "Immediate Voluntary Resignation / Did not fulfill required **14 day / 30 day** notice", "forfeit bonus", "dropped to minimum wage" | Keep: two-week notice (FT/PT), thirty-day (management), hourly reduced to minimum wage and loses bonus potential, no bonus on involuntary termination, ineligible for rehire without notice. | KB: *2025 JBA Policy Manual*, "Pay on Separation of Employment" pp.35–36 and "What to Expect When Terminated" p.35 | High | **PRESERVE** | None |
| RE-6 | "…upload Exit Form to employee's personal file…" | Keep. | KB: JBA, "Employee Records" p.36 | Medium | **PRESERVE** | None |
| RE-7 | "District Manager/Witness Signature (when required)" | Keep. | KB: MRM (District Manager) | High | **PRESERVE** | None |
| DE-1 | Letterhead "**GlowBrands**" (all other forms print "Buff City Soap") | No verified Buff City Soap equivalent found. (a decision on the issuing entity, not answerable from documents). | — | None | **HOLD** | Template letterhead; PDF |
| DE-2 | Example text: "…from a FT (Job Title)… to a PT **Tanning Consultant** at $x.xx /hr…" | Example sentence: "…to a PT Team Member…" using a placeholder or the Woven position **Team Member Part Time** (confirm). | Woven position map (Team Member Part Time, 45 employees) | Medium | **APPROVAL** | Template example text + PDF; AI demotion examples |
| DE-3 | "…will not be eligible for benefits or the **monthly manager bonus**" and the PTO/insurance/90-day acknowledgement | Benefits/PTO/insurance wording can be aligned with the manual (PTO eligibility p.42, insurance after 60 consecutive full-time days p.45). "Monthly manager bonus": No verified Buff City Soap equivalent found. (manual defers to brand bonus policies, pp.38–40). | KB: *2025 JBA Policy Manual*, PTO p.42, Insurance p.45, Bonus Policy pp.39–40 | Medium (PTO/insurance) / None (monthly manager bonus) | **HOLD** | Template + PDF only |
| DE-4 | "…they may be required to transfer locations to maintain morale and business functions." | No verified Buff City Soap equivalent found. (manual lists transfer/demotion as disciplinary outcomes, p.13, but not this sentence). | KB: JBA, "Standards of Conduct" p.13 | Low | **HOLD** | Template + PDF only |
| PT-1 | Letterhead "GlowBrands" | Same as DE-1. | — | None | **HOLD** | Template letterhead; PDF |
| PT-2 | Benefits acknowledgement (PTO/insurance/90 days) | Same as DE-3. | KB: JBA p.42, p.45 | Medium | **APPROVAL** | Template + PDF only |
| PT-3 | Description "…another store or position…" | Keep. | Done in the Store release | High | **PRESERVE** | None |
| PS-1 | "Are you willing to use our services as part of your **Sun Tan City uniform**? (Must agree to **UV, Sunless and Spa** usage to proceed with employment)" | Remove the "use our services… UV, Sunless and Spa" condition: No verified Buff City Soap equivalent found. Optional Buff-supported replacement: a dress-code acknowledgement (any plain black, white or gray top under the branded apron). Not a product-use rule. | KB: *2025 JBA Policy Manual*, dress code, "Buff City Soap:" block pp.16–17 | Medium (dress code) / None (product use) | **APPROVAL** | Template + PDF + AI drafting (prompts, intake, tests) |
| PS-2 | Description "…uniform agreement…" | Update the description with PS-1. | — | n/a | **APPROVAL** | Template + PDF only |
| PS-3 | "Attach this completed form to the online application email and file in your 'Applications' folder." | No verified Buff City Soap equivalent found. (CareerPlug and the application-filing process appear in no Buff document). | — | None | **HOLD** | Template + PDF only |
| PS-4 | "…apply at a neighboring store if you do not have open positions" | Keep. | Generic | High | **PRESERVE** | None |
| TI-1 | Name "Tanning Consultant Interview Form", short name "TC Interview", title, description "The in-store interview for a Tanning Consultant" | Role/form name: No verified Buff City Soap equivalent found. (candidate only: "Maker"). | KB: *Makery Reference Manual (MRM)*, "Key Roles in the Makery" | None (mapping) | **HOLD** | Template text (new seed revision); PDF prints it; Form Monitoring label if renamed; template key and `create_hiring_form` permission unchanged |
| TI-2 | Heading "**Sun Tan City Core Values**" with five values: Nothing's Impossible, Work Hard Have Fun, We Speak Up, Own the Outcome, Win Together | Replace with Buff's values: **Safety**, **Resilience**, **Joy**, **Belonging**, using the source wording (e.g. "We believe safety must be at the forefront of our decision-making. We work safely, we make safely."). Confirm exact value texts against the PDF. | KB: *Buff City Soap – Purpose & Core Values* | High (values exist) / Medium (exact text) | **APPROVAL** | Template + PDF only |
| TI-3 | Q8: "Our company has **five** core values…" | "Our company has four core values…" | KB: *Buff City Soap – Purpose & Core Values* | High | **APPROVAL** | Template + PDF only |
| TI-4 | Q6: "…recommending products and services to **clients**…" | "…recommending products and services to guests…" (client → guest only; Buff also offers Buff Parties, a service). | KB: *7G Service*; KB: *Makery Reference Manual (MRM)*, "Key Roles in the Makery" | High | **SAFE** | Template + PDF only |
| TI-5 | Q4/Q5: "excellent customer service", "helping several customers" | Optional: "guest" for "customer" (both words are used in Buff documents, so this is cosmetic). | KB: guest 57 documents; customer 18 | Medium | **SAFE** | Template + PDF only |
| TI-6 | Q12: "…overseeing daily store operations" (asked of an associate role) | Confirm the essential-functions wording for an associate role; MRM's Maker description: guest service, preparing products, clean workspace. Do not invent physical requirements. | KB: *Makery Reference Manual (MRM)*, "Key Roles in the Makery" | Low | **APPROVAL** | Template + PDF only |
| TI-7 | "Update In Careerplug" | No verified Buff City Soap equivalent found. | — | None | **HOLD** | Template + PDF only |
| TI-8 | Closing: "Reviewed pay structure and bonus potential" | Keep. | Generic | High | **PRESERVE** | None |
| M1-1 | Role play: "…upset because the **tanning bed** they reserved is unavailable due to a mechanical issue… demanding a refund…" | No verified Buff City Soap equivalent found. A Buff scenario must be chosen by the business; *Adverse Event – Guest – In-Store* is a source of real incident procedures, not a ready scenario. | KB: *Adverse Event – Guest – In-Store* | None | **HOLD** | Template + PDF only |
| M1-2 | "This role involves hands-on work like **cleaning beds** and doing laundry." | "This role involves hands-on work like cleaning the Makery and equipment. How do you lead by example in these tasks?" (candidate; MRM Maker/Manager roles include "maintaining a clean and organized space"). | KB: *Makery Reference Manual (MRM)*, "Key Roles in the Makery"; KB: *Cleaning Procedures for Soap Making Process* | Medium | **APPROVAL** | Template + PDF only |
| M1-3 | "Core Values Speech… each of the **4** Core Values" | Keep (four Core Values matches Buff's four). | KB: *Buff City Soap – Purpose & Core Values* | High | **PRESERVE** | None |
| M1-4 | Sections on pay structure/bonuses, dress code, "sales targets in your last position" | Keep. | Generic | High | **PRESERVE** | None |
| M1-5 | "Update In Careerplug" | Same as TI-7. | — | None | **HOLD** | Template + PDF only |
| M1-6 | "…client service focus", "turned an unhappy client…" | "…client service focus" → "guest service focus"; "unhappy client" → "unhappy guest". | KB: *Makery Reference Manual (MRM)*, "Key Roles in the Makery"; KB: *7G Service* | High | **SAFE** | Template + PDF only |
| M1-7 | "Equipment maintenance & safety" checklist item | Keep. | Generic | High | **PRESERVE** | None |
| M2-1 | Scenario 2: "…**lotions and memberships** sales are at their lowest in six months…" | Keep "lotions" (a Buff product line). Replace "memberships" with the Buff program the business means — *Buff Rewards* or *Secret Soap Society* — after confirmation. | KB: *Secret Soap Society FAQ*; *Buff Rewards – Talk Track and FAQ*; *Body Lotion – Tips and Tricks* | Medium | **APPROVAL** | Template + PDF only |
| M2-2 | "…training plan for a new Assistant Store Director or **Tanning Consultant**?" | "…a new Assistant Makery Manager or <frontline role>?" ASD half supported (AS-1); Tanning Consultant half: No verified Buff City Soap equivalent found. | KB: *2025 JBA Policy Manual*, PTO "Eligibility" p.42 | Medium / None | **HOLD** | Template + PDF only |
| M2-3 | "If you were given direction as a **Store Director** to reduce expenses…" | "…direction as a Makery Manager (General Manager) to reduce expenses…" | KB: *2025 JBA Policy Manual*, "Employee Classifications" p.34; KB: *Makery Reference Manual (MRM)*, "Key Roles in the Makery" | Medium | **APPROVAL** | Template + PDF only |
| M2-4 | "How do you identify and develop future leaders within your store team?", compliance/performance questions | Keep. | Generic | High | **PRESERVE** | None |
| M2-5 | "Update In Careerplug" | Same as TI-7. | — | None | **HOLD** | Template + PDF only |
| X-1 | "client" appears across forms/prompts where Buff says "guest" | "client(s)" → "guest(s)" in form labels, prompts and examples (not in verbatim policy quotations). | KB: guest in 57 documents / 343 chunks; client only in the JBA manual and the legacy Framework | High | **SAFE** | Templates + PDFs; AI prompts/examples; tests (`approved-template-changes.json`) |
| X-2 | "Training document"/"discussed this training document" in 6 acknowledgements (SDIT, TSD, ASD-SDIT, FTTC and both DMIT templates) — user-flagged | "…discussed this performance plan…" (HR wording). | — | n/a | **APPROVAL** | Template + PDF only |
| X-3 | Role vocabulary SDIT/TSD/ASD/FTTC/TC/SD is STC; Woven titles are General Manager, Assistant General Manager, District Manager, Operator, Owner, Team Member FT/PT | Supported pairs only: SD↔Makery Manager/General Manager; ASD↔Assistant Makery Manager; DM and DMIT as is. **No verified equivalent for TC/FTTC, TSD, SDIT.** | KB: *2025 JBA Policy Manual*, "Employee Classifications" p.34; KB: *2025 JBA Policy Manual*, PTO "Eligibility" p.42; KB: *Makery Reference Manual (MRM)*, "Key Roles in the Makery"; Woven position map | Medium / None | **HOLD** | `job-titles.ts`, `template-intent.ts`, `proposal.ts` (additive titles) |
| X-4 | Tanning KPI set (PPTA, LPSVA, UPTA, Club Close, Average Club Dollar) and Bonus Viewer/SVC | Selected Buff store KPIs only after the business chooses (candidates: Net Sales, Comp Sales %, IPT, AOV, Product Mix %). No verified Buff City Soap equivalent found. for PPTA/LPSVA/UPTA/Club Close/Average Club Dollar. | KB: *Domo Reporting Overview Deck*, "Daily/Weekly FZ Operations Sales KPI Dashboard" | Low | **HOLD** | Templates, intake (`epp-intake.ts`), plan-summary, tests |
| X-5 | "Buff City Soap Experience" in the EPP expectations (renamed from "Sun Tan City Experience") | Same as SD-3. | KB: *MRM* | Medium | **APPROVAL** | Template + PDF + AI drafting (prompts, intake, tests) |
| X-6 | "GlowBrands" letterhead on two forms vs Buff elsewhere | Same as DE-1. | — | None | **HOLD** | Templates; PDF |
| X-7 | CareerPlug references on four hiring forms; no Buff source | Same as TI-7. | — | None | **HOLD** | Template + PDF only |
| X-8 | Template/PDF filenames and Form Monitoring labels use names like "TC Interview", "FTTC", "SDIT EPP" | Follows the role decisions (names print in headers, footers, filenames and Form Monitoring). Keys/permissions unchanged. | — | n/a | **HOLD** | Template names/short names; Form Monitoring; PDF filenames |

## 15. Changes by readiness

- **Can safely proceed (6):** SD-2, TS-5, TI-4, TI-5, M1-6, X-1 — all "client/customer → guest" (supported by 57 Buff documents; verbatim policy quotations excluded).
- **Requires explicit business approval (28):** CO-1, SD-3, SD-5, SD-7, SD-8, TS-2, TS-4, TS-6, TS-7, TS-8, AS-1, AS-3, FT-6, DM-4, RE-1, RE-3, DE-2, PT-2, PS-1, PS-2, TI-2, TI-3, TI-6, M1-2, M2-1, M2-3, X-2, X-5.
  Themes: role titles with documented pairings (SD→Makery Manager/General Manager, ASD→Assistant Makery Manager); Buff Core Values and "four" (TI-2, TI-3); 7G Service wording; "guest experience" standard; Revel offboarding step; Support Center; dress-code acknowledgement; Buff scenarios/duties (M1-2, M2-1, M2-3); "performance plan" acknowledgement wording; frontline duties wording.
- **Unsupported — remain on hold (29):** CO-3, SD-1, SD-4, SD-6, TS-1, TS-3, FT-1, FT-2, FT-3, FT-4, FT-5, DM-3, RE-4, DE-1, DE-3, DE-4, PT-1, PS-3, TI-1, TI-7, M1-1, M1-5, M2-2, M2-5, X-3, X-4, X-6, X-7, X-8.
  Themes: Tanning Consultant/FTTC/TC, SDIT, TSD; PPTA/LPSVA/UPTA/Club Close/Average Club Dollar/Bonus Viewer; tanning-bed scenario; $25 key deduction; monthly manager bonus; GlowBrands vs Buff letterhead; CareerPlug; "new client documents".
- **Preserve (19):** CO-2, CO-4, CO-5, SD-9, AS-2, DM-1, DM-2, DM-5, RE-2, RE-5, RE-6, RE-7, PT-3, PS-4, TI-8, M1-3, M1-4, M1-7, M2-4 (includes verified MyGlow, separation/notice rules, District Manager/DMIT).

## 16. Phased implementation plan (after approval)

Every phase ships as **new seed revisions** through the existing additive, idempotent sync (old versions archived, filed forms stay pinned, admin-authored versions and drafts protected, Preview blocked), and ends with the same read-only production verification used for the Store release (stored version 2 equals the shipped template; version-1 fingerprints and the 23 filed forms unchanged). Template keys, permissions and stored field keys never change. Ask Sunny's fixtures stay untouched; the parity test gets an explicit, allow-listed category for each approved wording change.

| Phase | Scope | Regression tests added/run |
|---|---|---|
| **0 — Approvals** | You approve the SAFE set, decide the APPROVAL items, and rule on which HOLD items Buff will answer | — |
| **1 — Guest terminology (SAFE)** | SD-2, TS-5, TI-4, TI-5, M1-6, X-1; matching AI prompts/examples; templates touched: SDIT, TSD, TC interview, Round 1 (plus any others containing "client") | Parity allow-list of exact (from → to) pairs; PDF text check for "client/customer" in changed templates (excluding quoted policy); AI prompt/intake snapshot tests; upgrade-path seeding test (old → new version, idempotent, admin edits held back) |
| **2 — Hiring forms** | Core Values (TI-2/TI-3), dress-code acknowledgement or removal of the product-use question (PS-1/PS-2), duties/scenarios approved by Buff (M1-2, M2-1, M2-3, TI-6); new scenario for M1-1 only when Buff supplies it | Template/PDF tests per form; "no Sun Tan City wording" regression over hiring templates; quick-reply/routing tests |
| **3 — Exit, Demotion, Transfer** | Revel deactivation step and Support Center wording (RE-1/RE-3) once confirmed; keep MyGlow, notice and bonus rules; example role and benefits wording (DE-2, DE-3, PT-2); letterhead decision (DE-1/PT-1) | Exit draft/intake tests (`exit-draft.ts`, `exit-intake.ts`), PDF checks, deduction-statement test once $25 is resolved |
| **4 — Role titles (additive)** | Approved titles only (SD/ASD pairings and any Buff answers on TC/TSD/SDIT); add Buff titles **alongside** legacy typed titles in `job-titles.ts`, `template-intent.ts`, `proposal.ts`; leave Woven mapping untouched | Job-title tests incl. legacy phrases and real Woven names; permission/role tests unchanged; Form Monitoring label checks |
| **5 — Performance plans** | After HOLD items are answered: role labels, variants, KPI table, intake questions, AI examples (EPP family, DMIT TSD variant) | Full EPP conversation/draft suites; PDF fidelity; plan-summary tests |
| **K — Grounding (parallel, code only until Buff supplies a framework)** | Legacy tag and citation label (when approved), output guard with flagged terms, prompt framing, Buff vocabulary set; later the Buff framework as a new document version | Guard tests per governed template; fail-closed and ambiguity tests unchanged; JBA brand-scope tests unchanged |

## 17. Questions Buff City Soap must answer to unlock the HOLD items
1. Which Buff role replaces Tanning Consultant / FTTC (Maker? Team Member Full Time?) or should those plans be dropped?
2. Are SDIT and TSD needed at Buff, or is the MIT program the equivalent?
3. Which store KPIs should plans track (candidates: Net Sales, Comp Sales %, IPT, AOV, Product Mix %)?
4. What report replaces "Bonus Viewer" and what checklist replaces "SVC"?
5. Is a $25 key deduction a Buff rule, and what is the "monthly manager bonus"?
6. Which entity appears on the Demotion/Transfer letterhead?
7. Is CareerPlug used, and what is the application-filing process?
8. What scenario should replace the tanning-bed role play?
9. What guest paperwork replaces "New Client Documents" (if any)?
10. Is MyGlow or Woven the current personnel system for Buff employees?
