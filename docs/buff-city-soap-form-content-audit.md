# Buff City Soap form content audit (Ask Bubbles)

**Status: audit only. Nothing in this document has been implemented.** No template was edited or republished, no database row was written, no Woven record was changed, nothing was merged or deployed, and Ask Sunny is untouched. Every replacement below is a *proposal* awaiting Buff City Soap approval.

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
81 classified findings across the template tables and the cross-cutting table: **6 class A, 58 class B, 17 class C**.

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
