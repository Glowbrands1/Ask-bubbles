# Six hidden forms unhidden under Buff City Soap's names (Pau, 23 Nov 2026)

**Bubbles-only: company content.** No mechanism changed, so there is nothing to port. Ask Sunny keeps its own
names, titles and metrics for these templates. Pau approved the renames, and QA chose the final wording (23 Nov).
Every term below comes from a Buff City Soap source: the Woven career ladder and the knowledge base's performance
management framework, Domo Reporting Overview, and Buff Rewards talk track.

**Unhidden, keys unchanged, published by bumping each seed's revision:**

| Key | Was | Now |
|---|---|---|
| fttc-epp | FTTC Performance EPP | Team Member Performance EPP |
| asd-sdit-epp | ASD-SDIT Performance EPP | Assistant General Manager Development EPP |
| tsd-epp | TSD EPP | General Manager Performance EPP |
| tanning-consultant-interview | Tanning Consultant Interview Form (retired) | Team Member Interview Form |
| management-interview-round-1 | First Round Management Interview Form | (name unchanged) |
| management-interview-round-2 | Second Round Management Interview Form | (name unchanged) |

**What changed inside them:**

- **General Manager plan, metrics.** The sibling company's metrics (PPTA, LPSVA, UPTA, Club Close, Average Club Dollar) are now Buff City Soap's Domo KPIs, each with a Goal / Result: Net Sales, Comp Sales %, IPT, AOV, Discount Rate % and Product Mix %.
  - The first five reuse the stored keys, one for one, so saved plans still load.
  - Product Mix % has a new key in each table: `manager_product_mix` and `salon_product_mix`.
- **General Manager plan, SVC.** "SVC" is now "the store reports (Domo)".
- **Round 1 role play:** the product the guest came in for is out of stock.
- **Round 2 scenario:** add-on product sales and Buff Rewards sign-ups.
- **Chooser:** the two management interviews are no longer withheld from it.
- **Old chat path:** the sibling company's titles (TSD, ASD, FTTC) were removed from `template-intent.ts` and `job-titles.ts`. The SDIT and DMIT entries stay, because those forms stay hidden.

**Still hidden, unchanged:** sdit-epp, dmit-epp-tsd and dmit-epp-dmit.

**Ask Sunny:** Not needed. The change is company content only: names, titles, wording and the hidden list. The
template keys, `layout_family`, the permissions, the seeder and `repository.ts` are shared with Ask Sunny and were
not touched.
