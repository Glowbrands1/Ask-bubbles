# This-app-only: a reply does not name the operating company beside this brand (OWN_BRAND_PARENT_ENABLED)

QA's live tester (7 Nov 2026), with OWN_BRAND_ONLY live here: "cite animals in the workplace policy" answered "This applies company-wide across all brands (Buff City Soap, and JB & Associates), …". OWN_BRAND_ONLY drops the other brands the manual covers; the company that operates them all was not one of its names. With OWN_BRAND_PARENT_ENABLED (default off), that company's name (`PARENT_COMPANY_NAMES`, `config/company/knowledge.ts`) is dropped as well, and "across all brands (A, B)" reads "at <this brand>". The manual's title ("JBA Policy Manual"), its "JB & Associates Office" label and bare "JBA" are never touched.

Not ported: in the sibling app that company is its own. Its replies may name it, and Pau chose there (option A, #602) to keep the JB & Associates office sentences. The sibling app's behaviour stays as it is.
