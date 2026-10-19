# Framework segment classification — for Buff HR and Operations review

**Status: engineering classification only. NOTHING here is business-approved.** It is produced by `src/lib/knowledge/legacy-segments.ts` in **shadow mode**: it changes no prompt, no AI output and no knowledge-base record. The Framework is unchanged and still adopted verbatim.

Source: the 88 chunks of the Performance Management Framework (read-only snapshot, 2026-10-19, `src/test/fixtures/framework-chunks.json`). Full per-segment labels: `src/test/fixtures/framework-segment-labels.json`.

## How to review
For each row below, mark **Keep as methodology**, **Legacy Sun Tan City (not Buff policy)**, or **Needs rewrite by Buff**. `ambiguous` rows mix method with a possibly-legacy term, or use the word “salon”, which may be wording only. Rows not listed were labelled `methodology` (teaches how to coach, document and escalate, no legacy fact asserted).

## Totals

| Label | Segments |
|---|---|
| methodology | 1454 |
| legacy_specific | 72 |
| ambiguous | 41 |

| Concept | Segments |
|---|---|
| stc_org | 16 |
| stc_role_codes | 3 |
| stc_sales_metrics | 45 |
| stc_services | 8 |
| stc_terminology | 20 |
| stc_titles | 5 |
| stc_tools | 32 |

## Segments needing a decision

| # | Section | Label | Concepts | Text | Buff decision |
|---|---|---|---|---|---|
| 1 | ASK BUBBLES PERFORMANCE MANAGEMENT FRAMEWORK | legacy_specific | stc_org | Permanent Knowledge-Base Guide for Sun Tan City Leadership | |
| 2 | ASK BUBBLES PERFORMANCE MANAGEMENT FRAMEWORK | ambiguous | stc_org | This framework teaches Ask Bubbles how to think when helping Sun Tan City leaders coach, develop, document, and hold employees accountable. | |
| 3 | ASK BUBBLES PERFORMANCE MANAGEMENT FRAMEWORK | ambiguous | stc_org, stc_titles, stc_terminology | Ask Bubbles should use this framework to help Salon Directors, Assistant Salon Directors, District Managers, and training leaders create behavior-focused documentation that is direct, respectful, accountable, and aligned with Sun Tan City operations. | |
| 4 | ASK BUBBLES PERFORMANCE MANAGEMENT FRAMEWORK | ambiguous | stc_terminology | Use [Employee], [Manager], [Salon], [Date], and [Metric] placeholders when creating reusable knowledge-base content. | |
| 5 | ASK BUBBLES PERFORMANCE MANAGEMENT FRAMEWORK | ambiguous | stc_org | Leadership escalation rule: Ask Bubbles may help draft coaching, EPP, DPOA, follow-up notes, and conversation guides, but any termination, demotion, suspension, sensitive employee matter, or final disciplinary decision must be reviewed by the appropriate Sun Tan City leadership process. | |
| 6 | ASK BUBBLES PERFORMANCE MANAGEMENT FRAMEWORK | legacy_specific | stc_org | Core Sun Tan City terms used in this framework: | |
| 7 | ASK BUBBLES PERFORMANCE MANAGEMENT FRAMEWORK | legacy_specific | stc_sales_metrics | - ASTC: Acknowledge, Support, Temperature Check, Complete the Engagement or Plant the Seed. | |
| 8 | ASK BUBBLES PERFORMANCE MANAGEMENT FRAMEWORK | legacy_specific | stc_tools | - Routine Mat: The skincare routine mat used to educate clients and recommend a complete skincare routine. | |
| 9 | 1.1 Purpose of coaching | ambiguous | stc_org | Coaching exists to improve employee behavior, strengthen client engagement, and protect the Sun Tan City experience. | |
| 10 | 1.1 Purpose of coaching | legacy_specific | stc_org | A strong Sun Tan City leader coaches because: | |
| 11 | 1.1 Purpose of coaching | ambiguous | stc_terminology | Why does it matter to the client, salon, team, and employee? | |
| 12 | 1.2 Purpose of accountability | ambiguous | stc_terminology | Accountability exists to protect the client experience, the salon culture, company standards, and fairness across the team. | |
| 13 | 1.2 Purpose of accountability | legacy_specific | stc_org | A strong Sun Tan City leader holds employees accountable when: | |
| 14 | 1.4 Difference between performance issues and behavior issues | legacy_specific | stc_sales_metrics, stc_tools | Examples include low Spa %, low Club Close %, low PPTA, weak OTC results, poor client engagement, inconsistent ASTC, failure to use the Routine Mat, weak tours or re-tours, or failure to make relevant recommendations. | |
| 15 | 1.4 Difference between performance issues and behavior issues | legacy_specific | stc_sales_metrics | For example, an employee with low Club Close % may be a performance issue if they need more practice overcoming objections. | |
| 16 | 1.4 Difference between performance issues and behavior issues | ambiguous | stc_sales_metrics | It becomes a behavior/accountability issue if the employee refuses to use ASTC, will not role-play, ignores coaching, or continues the same behavior after repeated follow-up. | |
| 17 | 1.5 Manager responsibilities | legacy_specific | stc_org | A Sun Tan City manager is responsible for creating clarity, not confusion. | |
| 18 | 1.5 Manager responsibilities | ambiguous | stc_tools | - review Daily Stats, Bonus Viewer, Comp Report, productivity tracking, shift summaries, and coaching history; | |
| 19 | 1.5 Manager responsibilities | ambiguous | stc_sales_metrics | A manager should not simply say, "Get your Spa % up," "Sell more clubs," or "Do better." Those statements do not teach behavior. | |
| 20 | 1.6 Employee responsibilities | legacy_specific | stc_sales_metrics, stc_tools | - use required tools such as BHOW, ASTC, Routine Mat, and client engagement questions; | |
| 21 | 2.1 Observation | ambiguous | stc_terminology | - while reviewing reports, live interactions, video where applicable, shift summaries, or salon operations. | |
| 22 | 2.2 Coaching | legacy_specific | stc_sales_metrics, stc_tools | - when the employee misses MSB, CES, ASTC, BHOW, Routine Mat, relevant recommendations, tours, re-tours, closing, or planting the seed; | |
| 23 | 2.3 Role Play | ambiguous | stc_sales_metrics, stc_tools | - after coaching on memberships, Spa, Routine Mat, ASTC, BHOW, tours, re-tours, product recommendations, or difficult client situations; | |
| 24 | 2.5 Employee Performance Plan (EPP) | ambiguous | stc_terminology | - when a management employee needs structured development in leadership, accountability, productivity, bench, training, or salon execution; | |
| 25 | 2.8 Further Leadership Review | ambiguous | stc_terminology | - escalation protects the employee, the manager, the salon, and the company; | |
| 26 | 3.1 How coaching forms should be completed | ambiguous | stc_terminology | - Why it matters: client experience, revenue, culture, salon standards, or employee success. | |
| 27 | 3.1 How coaching forms should be completed | legacy_specific | stc_services | "During client interactions observed today, [Employee] did not recommend Spa Wellness or connect Spa to the client’s tanning or wellness goal. | |
| 28 | 3.3 How observations should be documented | legacy_specific | stc_sales_metrics | - "did not use ASTC after client hesitation" | |
| 29 | 3.4 How expectations should be communicated | legacy_specific | stc_sales_metrics | "For every eligible client today, I need you to use at least one open-ended question, make a relevant recommendation based on their answer, use ASTC if they hesitate, and either complete the engagement or plant the seed. | |
| 30 | Example A – Spa recommendation coaching | ambiguous | stc_services | "We reviewed that Spa should be recommended consistently and tied to the client’s reason for tanning, wellness goals, or desired results. [Employee] practiced asking a wellness-based question, presenting a Spa benefit, and planting the seed when the client was not ready." | |
| 31 | Example B – Club Close coaching | legacy_specific | stc_sales_metrics | "We reviewed ASTC: acknowledge the client’s concern, support with benefits and value, temperature check, and complete the engagement or plant the seed. [Employee] practiced with hesitation scenarios around price, automatic payment, and commitment." | |
| 32 | Example B – Club Close coaching | ambiguous | stc_sales_metrics | "Manager will listen for ASTC on the next two membership presentations and document progress." | |
| 33 | Example C – Routine Mat/PPTA coaching | legacy_specific | stc_tools | "[Employee] did not use the Routine Mat or recommend a complete routine after asking client questions." | |
| 34 | Example C – Routine Mat/PPTA coaching | legacy_specific | stc_tools | "We reviewed using the Routine Mat as a guide for a complete skincare routine rather than a product list. [Employee] practiced connecting the client’s stated need to a product category and explaining what it is and what it does." | |
| 35 | Example C – Routine Mat/PPTA coaching | ambiguous | stc_tools | "Manager will observe the next two product conversations and verify Routine Mat use." | |
| 36 | 4.5 How to gain employee commitment | legacy_specific | stc_sales_metrics, stc_tools | A better commitment is: "On my next client, I will ask one results-based question, make a relevant recommendation using the Routine Mat, and use ASTC if they hesitate." | |
| 37 | Diamond A – Spa and Routine Mat consistency | legacy_specific | stc_tools | "Recommend Spa Wellness and use the Routine Mat to educate clients on a complete routine." | |
| 38 | Diamond A – Spa and Routine Mat consistency | legacy_specific | stc_tools | Use the Routine Mat to show the full routine. | |
| 39 | Diamond A – Spa and Routine Mat consistency | legacy_specific | stc_sales_metrics, stc_tools | "Spa and Routine Mat behaviors improve client education, client results, Spa %, PPTA, OTC, and overall revenue. | |
| 40 | Diamond A – Spa and Routine Mat consistency | legacy_specific | stc_services | "Every eligible client interaction, especially new clients, re-tours, current members, clients using sunless or spa, and clients who mention results or skincare needs." | |
| 41 | Diamond B – Club Close and BHOW | legacy_specific | stc_sales_metrics | "Present memberships top-down using BHOW and confidently handle hesitations with ASTC." | |
| 42 | Diamond B – Club Close and BHOW | legacy_specific | stc_sales_metrics | "Ask discovery questions, re-tour when appropriate, present the best membership option first, use BHOW to show value, explain savings and benefits, then use ASTC if the client hesitates. | |
| 43 | Diamond C – Retention conversation for cancel/freeze/downgrade requests | legacy_specific | stc_services | "Anytime a client requests to cancel, freeze, downgrade, stop tanning, or says they are unsure about continuing." | |
| 44 | Diamond D – Manager correcting behavior in the moment | legacy_specific | stc_sales_metrics, stc_tools | "Every shift, especially when MSB, CES, ASTC, BHOW, Routine Mat, Spa, eyewear, tours, re-tours, or closing behaviors are missed." | |
| 45 | 5.1 When an EPP should be created | legacy_specific | stc_role_codes | - ASD, SDIT, SD, TSD, or DMIT needs documented leadership development; | |
| 46 | 5.1 When an EPP should be created | ambiguous | stc_terminology | - salon results are affected by weak execution, training, bench, or leadership routines. | |
| 47 | 5.2 Common EPP categories | legacy_specific | stc_sales_metrics, stc_tools | Used when a consultant is not consistently executing MSB, CES, ASTC, Routine Mat, BHOW, recommendations, closing, tours, re-tours, or productivity expectations. | |
| 48 | 5.2 Common EPP categories | legacy_specific | stc_role_codes | ASD/SDIT development EPP: | |
| 49 | 5.2 Common EPP categories | legacy_specific | stc_titles, stc_terminology | Used when a Salon Director is not meeting leadership, revenue, bench, training, development, salon operations, or accountability expectations. | |
| 50 | 5.2 Common EPP categories | legacy_specific | stc_role_codes | TSD/DMIT development EPP: | |
| 51 | 5.3 How EPPs should be structured | ambiguous | stc_tools, stc_terminology | Use Daily Stats, Bonus Viewer, productivity reports, coaching history, shift observations, and salon goals to explain the pattern. | |
| 52 | 5.4 Goal setting rules | legacy_specific | stc_sales_metrics | "Improve Club Close %." | |
| 53 | 5.4 Goal setting rules | legacy_specific | stc_sales_metrics | "During every membership opportunity, [Employee] will present the best-fit membership top-down using BHOW, use ASTC for hesitations, and complete the engagement or plant the seed. | |
| 54 | 5.4 Goal setting rules | legacy_specific | stc_services | "During each observed shift, [Employee] will ask at least one open-ended tanning or results-based question before making a recommendation, then make a relevant recommendation using the client’s answer." | |
| 55 | 5.6 Follow-up process | ambiguous | stc_tools | [Summarize trends from Daily Stats, Bonus Viewer, coaching observations, and shift results. | |
| 56 | Template B – ASD/SDIT Leadership Readiness EPP | legacy_specific | stc_sales_metrics, stc_tools | - Ability to use BHOW, ASTC, Routine Mat, tours, re-tours, and recommendations independently. | |
| 57 | Template B – ASD/SDIT Leadership Readiness EPP | legacy_specific | stc_sales_metrics | - [Employee] will complete role-play on tours, re-tours, BHOW, ASTC, CES, MSB, non-tan to tan talk transitions, results-based questions, open-ended questions, full skincare routine, and complete client engagement. | |
| 58 | Template C – SD Performance EPP | legacy_specific | stc_titles, stc_terminology | Employee Performance Plan – Salon Director Performance | |
| 59 | Template C – SD Performance EPP | ambiguous | stc_titles, stc_terminology | This EPP is being created because [Salon Director] must improve leadership execution in [revenue/productivity/bench/training/development/operations/accountability]. | |
| 60 | Template C – SD Performance EPP | ambiguous | stc_terminology | - [SD] will maintain required bench, training, and salon execution expectations. | |
| 61 | Template D – Positive Development EPP | ambiguous | stc_terminology | - Positive influence on the salon. | |
| 62 | 6.1 When accountability should escalate | ambiguous | stc_terminology | - employee’s behavior undermines salon culture or standards. | |
| 63 | SECTION 7 – COMMON PERFORMANCE ISSUES | ambiguous | stc_org | This section teaches Ask Bubbles how to translate common Sun Tan City issues into coaching, follow-up, and escalation recommendations. | |
| 64 | SECTION 7 – COMMON PERFORMANCE ISSUES | ambiguous | stc_sales_metrics | - document if Spa was recommended and whether ASTC or planting the seed occurred. | |
| 65 | SECTION 7 – COMMON PERFORMANCE ISSUES | ambiguous | stc_sales_metrics | - document if Spa was recommended and whether ASTC or planting the seed occurred. | |
| 66 | 7.2 Low Club Close % | legacy_specific | stc_sales_metrics | - use ASTC for hesitations; | |
| 67 | 7.2 Low Club Close % | legacy_specific | stc_sales_metrics | Today I need you to present the best-fit membership using BHOW, then use ASTC if they hesitate. | |
| 68 | 7.2 Low Club Close % | legacy_specific | stc_sales_metrics | - track whether BHOW and ASTC were used; | |
| 69 | 7.2 Low Club Close % | legacy_specific | stc_sales_metrics | - EPP if Club Close remains low because required behaviors are not used; | |
| 70 | 7.3 Low PPTA | legacy_specific | stc_tools | - Routine Mat is not used; | |
| 71 | 7.3 Low PPTA | legacy_specific | stc_tools | - use Routine Mat as a full-routine guide; | |
| 72 | 7.3 Low PPTA | legacy_specific | stc_sales_metrics | "Your PPTA opportunity is connected to the way you are educating clients. | |
| 73 | 7.3 Low PPTA | legacy_specific | stc_tools | I need you to use the Routine Mat during product conversations, ask what the client wants from their results, and recommend a complete routine based on what they tell you. | |
| 74 | 7.3 Low PPTA | legacy_specific | stc_tools | - check whether Routine Mat was used; | |
| 75 | 7.4 Low OTC | legacy_specific | stc_sales_metrics | - low PPTA behaviors; | |
| 76 | 7.4 Low OTC | legacy_specific | stc_tools | - employees not using Routine Mat; | |
| 77 | 7.4 Low OTC | legacy_specific | stc_services | - not tying products to tanning results; | |
| 78 | 7.4 Low OTC | ambiguous | stc_sales_metrics | - manager not coaching OTC opportunities daily. | |
| 79 | 7.4 Low OTC | legacy_specific | stc_sales_metrics | - connect OTC to client results; | |
| 80 | 7.4 Low OTC | legacy_specific | stc_tools | - use Routine Mat and full-routine recommendation; | |
| 81 | 7.4 Low OTC | legacy_specific | stc_sales_metrics | - use ASTC for price hesitations; | |
| 82 | 7.4 Low OTC | legacy_specific | stc_sales_metrics | "OTC improves when we educate clients on how to get the results they came in for. | |
| 83 | 7.4 Low OTC | legacy_specific | stc_tools | Today I need you to use the Routine Mat, explain what each recommendation does, and ask for the sale. | |
| 84 | 7.4 Low OTC | legacy_specific | stc_sales_metrics | If the client hesitates on price, use ASTC and plant the seed." | |
| 85 | 7.4 Low OTC | legacy_specific | stc_sales_metrics | - review OTC opportunities from Daily Stats; | |
| 86 | 7.5 Poor client engagement | legacy_specific | stc_services | I observed that the conversation stayed friendly but did not transition into tanning questions or recommendations. | |
| 87 | 7.5 Poor client engagement | legacy_specific | stc_services | I need you to ask one open-ended tanning question, connect the answer to a recommendation, and complete the engagement. | |
| 88 | 7.6 Failure to use ASTC | legacy_specific | stc_sales_metrics | I need you to use ASTC every time a client hesitates. | |
| 89 | 7.6 Failure to use ASTC | legacy_specific | stc_sales_metrics | - manager listens for each ASTC step; | |
| 90 | 7.6 Failure to use ASTC | ambiguous | stc_sales_metrics | - document whether ASTC was used live. | |
| 91 | 7.6 Failure to use ASTC | legacy_specific | stc_sales_metrics | - refusal to use ASTC: DPOA or leadership review depending on history. | |
| 92 | 7.7 Failure to use Routine Mat | legacy_specific | stc_tools | - employee sees Routine Mat as extra work; | |
| 93 | 7.7 Failure to use Routine Mat | legacy_specific | stc_tools | - manager has not demonstrated Routine Mat use. | |
| 94 | 7.7 Failure to use Routine Mat | legacy_specific | stc_tools | - use Routine Mat as a guide, not a script; | |
| 95 | 7.7 Failure to use Routine Mat | legacy_specific | stc_tools | "The Routine Mat helps us educate clients instead of guessing. | |
| 96 | 7.7 Failure to use Routine Mat | ambiguous | stc_tools | - observe Routine Mat use; | |
| 97 | 7.7 Failure to use Routine Mat | ambiguous | stc_sales_metrics | - review PPTA/OTC trends after behavior coaching. | |
| 98 | 7.8 Attendance issues | ambiguous | stc_terminology | - availability does not match salon needs. | |
| 99 | Improved | ambiguous | stc_tools | "Follow-up from coaching on Routine Mat use: [Employee] used the Routine Mat during two observed product conversations, asked results-based questions, and connected recommendations to the client’s stated needs. | |
| 100 | Improved | ambiguous | stc_sales_metrics | "Follow-up from coaching on ASTC: [Employee] acknowledged the client’s concern and supported with benefits, but did not complete the temperature check or ask for the sale. | |
| 101 | SECTION 9 – OUTPUT GENERATION TEMPLATES | legacy_specific | stc_org | These templates are designed to create Sun Tan City-style documentation that is direct, respectful, and behavior-focused. | |
| 102 | SECTION 9 – OUTPUT GENERATION TEMPLATES | ambiguous | stc_terminology | [Salon Tours / Selling Memberships / Open-ended Questions / Upgrading Options / Closing the Sale / Making Recommendations / Overcoming Objections / Lotion Basics / Client Engagement / Other] | |
| 103 | 9.9 Template: Create follow-up documentation | ambiguous | stc_terminology | [Client/salon/team/revenue/standard] | |
| 104 | 10.1 Sun Tan City leadership tone | ambiguous | stc_org | Sun Tan City leadership communication should be: | |
| 105 | 10.1 Sun Tan City leadership tone | ambiguous | stc_titles, stc_terminology | Ask Bubbles should write like a strong Salon Director or District Manager: calm, confident, specific, and fair. | |
| 106 | 10.3 What to avoid | legacy_specific | stc_org | Replace with Sun Tan City operational language: | |
| 107 | 10.3 What to avoid | legacy_specific | stc_sales_metrics | - "I need to see you use ASTC when a client hesitates." | |
| 108 | 10.3 What to avoid | legacy_specific | stc_tools | - "I need you to use the Routine Mat to connect recommendations to the client’s goals." | |
| 109 | 10.4 Behavior-focused language rules | legacy_specific | stc_sales_metrics | "[Employee] did not make a recommendation during three observed client interactions and did not use ASTC after client hesitation." | |
| 110 | 10.5 Praise and correction | ambiguous | stc_org | Sun Tan City leaders should praise specific behavior publicly when appropriate and correct poor results privately. | |
| 111 | 10.5 Praise and correction | legacy_specific | stc_sales_metrics | "Great job using ASTC after that client hesitated. | |
| 112 | 10.7 Final operating rule for Ask Bubbles | legacy_specific | stc_org | Keep the tone direct, respectful, and Sun Tan City-specific. | |
| 113 | 10.7 Final operating rule for Ask Bubbles | ambiguous | stc_org | The purpose of this framework is to help Ask Bubbles act like a strong Sun Tan City leader: clear expectations, active coaching, real role-play, documented follow-up, fair accountability, and no emotional decisions. | |
