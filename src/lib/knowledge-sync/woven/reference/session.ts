import { WovenTeamError, safePath } from "../http";
import { attr, byId, elementsByTag, hasClass, parseHtmlDocument, textOf } from "../html";
import { hasVerifiedChooser, type CompanySelector, type CompanyVerifier } from "../session";
import {
  ACTIVE_COMPANY_CLASS,
  ACTIVE_COMPANY_TAG,
  CHOOSER_ENTRY_ATTRS,
  CHOOSER_ENTRY_CLASS,
  CONTINUE_LOGIN_FIELDS,
  CONTINUE_LOGIN_FORM_ID,
  CONTINUE_LOGIN_REQUIRED,
  LOGIN_FIELDS,
  LOGIN_SUBMIT_PATH,
} from "./contract";

/**
 * ============================================================================
 * REFERENCE PLATFORM — TEST ONLY. Company selection BY NAME.
 * ============================================================================
 *
 * The reference platform (the implementation Ask Bubbles was ported from)
 * chose its Woven company by NAME and checked it in the account menu. Ask
 * Bubbles never does either: production chooses only by the pinned Buff City
 * Soap Company ID (`../bcs/company-guard.ts`) and proves it on `/Company`.
 *
 * Kept only so the shared engine's reference tests keep running against their
 * fixtures. Nothing outside `reference/` may import this folder;
 * `../bcs/tenant-isolation.test.ts` fails the build of the test suite if
 * production code does.
 */

function normalizeCompany(value: string): string {
  return value.replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim().toLowerCase();
}

type Element = ReturnType<typeof elementsByTag>[number];

function ancestors(el: Element): Element[] {
  const out: Element[] = [];
  for (let node = el.parentNode ?? null; node; node = node.parentNode ?? null) {
    if ((node as Element).tagName) out.push(node as Element);
  }
  return out;
}

/** Stops at the chooser without answering it. Kept for callers that must never select. */
export const unverifiedCompanySelector: CompanySelector = {
  async select() {
    throw new WovenTeamError(
      "company_selection_unverified",
      "Woven accepted the sign-in and asked which account to open, and Ask Bubbles does not yet know how to answer that step.",
      { path: LOGIN_SUBMIT_PATH },
    );
  },
};

/** The chooser entries whose own text is exactly the company name (deepest element per entry). */
function companyEntries(doc: ReturnType<typeof parseHtmlDocument>, company: string): Element[] {
  const want = normalizeCompany(company);
  const exact = [...walkAll(doc)].filter((el) => normalizeCompany(textOf(el)) === want);
  /* Keep the deepest: drop any element that has a matching descendant. */
  return exact.filter((el) => !exact.some((other) => other !== el && ancestors(other).includes(el)));
}

/** Every element in the page body, in document order. */
function* walkAll(root: ReturnType<typeof parseHtmlDocument>): Generator<Element> {
  const body = elementsByTag(root, "body")[0];
  if (body) yield* walkBody(body);
}

function* walkBody(root: Element): Generator<Element> {
  for (const child of root.childNodes ?? []) {
    if ((child as Element).tagName) {
      yield child as Element;
      yield* walkBody(child as Element);
    }
  }
}

const SAFE_NAME = /^[A-Za-z_$][\w$.]{0,63}$/;

/** What an entry's markup offers, and the evidence for the report when it offers nothing usable. */
export type ChooserAction =
  | { kind: "link"; href: string }
  | { kind: "form"; action: string; method: "GET" | "POST"; fields: Record<string, string> }
  | { kind: "unsupported"; evidence: string };

export function chooserAction(html: string, company: string): ChooserAction | { kind: "missing" } | { kind: "ambiguous"; count: number } {
  const doc = parseHtmlDocument(html);
  const entries = companyEntries(doc, company);
  if (entries.length === 0) return { kind: "missing" };
  if (entries.length > 1) return { kind: "ambiguous", count: entries.length };
  const entry = entries[0]!;
  const chain = [entry, ...ancestors(entry)];

  /* A plain link: the entry itself, or the link around it. */
  const link = chain.find((el) => el.tagName === "a");
  const href = link ? (attr(link, "href") ?? "").trim() : "";
  if (link && href && !href.startsWith("#") && !/^javascript:/i.test(href)) {
    return { kind: "link", href };
  }

  /* A form submit: the entry is (or is inside) a submit control of a form. */
  const control = chain.find(
    (el) => el.tagName === "button" || (el.tagName === "input" && ["submit", "image"].includes((attr(el, "type") ?? "").toLowerCase())),
  );
  const form = chain.find((el) => el.tagName === "form");
  const controlType = control ? (attr(control, "type") ?? "submit").toLowerCase() : "";
  if (control && form && controlType !== "button") {
    const fields: Record<string, string> = {};
    for (const input of elementsByTag(form, "input")) {
      const name = attr(input, "name");
      const type = (attr(input, "type") ?? "text").toLowerCase();
      if (!name || ["submit", "image", "button", "checkbox", "radio", "file", "password"].includes(type)) continue;
      fields[name] = attr(input, "value") ?? "";
    }
    const name = attr(control, "name");
    if (name) fields[name] = attr(control, "value") ?? "";
    const method = (attr(form, "method") ?? "get").toUpperCase() === "POST" ? "POST" : "GET";
    return { kind: "form", action: (attr(form, "action") ?? "").trim(), method, fields };
  }

  /* Nothing a browser would do without running the page's script. Report what is there. */
  const notes: string[] = [];
  for (const el of chain.slice(0, 5)) {
    for (const a of el.attrs ?? []) {
      if (/^on[a-z]+$/i.test(a.name)) {
        const fn = /^\s*(?:return\s+)?([A-Za-z_$][\w$.]*)\s*\(/.exec(a.value)?.[1];
        notes.push(`${el.tagName}[${a.name}${fn && SAFE_NAME.test(fn) ? `=${fn}(…)` : ""}]`);
      } else if (a.name.startsWith("data-")) {
        notes.push(`${el.tagName}[${a.name}]`);
      }
    }
  }
  return { kind: "unsupported", evidence: notes.length > 0 ? [...new Set(notes)].join(", ") : `${entry.tagName} with no link, form or handler` };
}

/**
 * The default selector: follows the configured company's chooser entry when it
 * is a same-origin link or a form submit; otherwise reports exactly what it saw.
 */
export const markupCompanySelector: CompanySelector = {
  async select(page, company, client) {
    const action = chooserAction(page.text, company);
    const base = new URL(page.path, "https://placeholder.invalid");
    switch (action.kind) {
      case "missing":
        throw new WovenTeamError("company_not_listed", `Woven accepted the sign-in, but ${company} is not one of the accounts it offers this login.`, {
          path: safePath(page.path),
        });
      case "ambiguous":
        throw new WovenTeamError(
          "company_selection_unverified",
          `Woven's account chooser lists ${company} ${action.count} times, so Ask Bubbles did not pick one.`,
          { path: safePath(page.path) },
        );
      case "unsupported":
        throw new WovenTeamError(
          "company_selection_unverified",
          `Woven accepted the sign-in and showed the account chooser, but the ${company} entry is selected by the page's script (${action.evidence}), not a link or form. The request that script sends is needed.`,
          { path: safePath(page.path) },
        );
      case "link": {
        const target = new URL(action.href, base);
        return client.request("GET", target.pathname + target.search, null);
      }
      case "form": {
        const target = new URL(action.action || page.path, base);
        const path = target.pathname + target.search;
        if (action.method === "GET") {
          const query = new URLSearchParams(action.fields).toString();
          return client.request("GET", `${target.pathname}?${query}`, null);
        }
        return client.request("POST", path, { kind: "form", value: action.fields });
      }
    }
  },
};


/**
 * VERIFIED marker: the authenticated account dropdown, `a.dropdown-toggle`,
 * shows the ACTIVE company's name. Only that element is read, so a company
 * merely listed elsewhere on the page (a switcher, a footer) does not count.
 */
export const dropdownCompanyVerifier: CompanyVerifier = {
  activeCompany(page, expected) {
    const want = normalizeCompany(expected);
    const toggles = elementsByTag(parseHtmlDocument(page.text), ACTIVE_COMPANY_TAG).filter((el) => hasClass(el, ACTIVE_COMPANY_CLASS));
    return toggles.some((el) => normalizeCompany(textOf(el)).includes(want)) ? expected : null;
  },
};


/**
 * THE VERIFIED CHOOSER SUBMISSION — what `SelectCompany(id, name, status, true)`
 * does, done without running the page's script:
 *
 *   1. find the one `a.select-company` whose visible text is the company,
 *   2. read its `data-company-id` (and `data-company-name`),
 *   3. take `#continue-login-form` with every field as Woven rendered it,
 *   4. set `CompanyID` and `CompanyName`, and submit it as the form says.
 *
 * Every mismatch with the verified structure stops with
 * `account_chooser_changed` before anything is sent. Messages carry field
 * NAMES only.
 */
export function nameContinueLoginSubmission(
  html: string,
  pagePath: string,
  company: string,
): { path: string; fields: Record<string, string> } {
  const doc = parseHtmlDocument(html);
  const changed = (why: string) =>
    new WovenTeamError("account_chooser_changed", `Woven's account chooser ${why}, so Ask Bubbles did not submit it.`, {
      path: safePath(pagePath),
    });

  const entries = elementsByTag(doc, "a").filter((a) => hasClass(a, CHOOSER_ENTRY_CLASS));
  const want = normalizeCompany(company);
  const matches = entries.filter((a) => normalizeCompany(textOf(a)) === want);
  if (matches.length === 0) {
    throw new WovenTeamError("company_not_listed", `Woven accepted the sign-in, but ${company} is not one of the accounts it offers this login.`, {
      path: safePath(pagePath),
    });
  }
  if (matches.length > 1) throw changed(`lists ${company} ${matches.length} times`);
  const entry = matches[0]!;
  const companyId = (attr(entry, CHOOSER_ENTRY_ATTRS.companyId) ?? "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,199}$/.test(companyId)) throw changed(`entry for ${company} has no usable ${CHOOSER_ENTRY_ATTRS.companyId}`);
  const companyName = attr(entry, CHOOSER_ENTRY_ATTRS.companyName) ?? "";

  const form = byId(doc, CONTINUE_LOGIN_FORM_ID);
  if (!form || form.tagName !== "form") throw changed(`has no #${CONTINUE_LOGIN_FORM_ID}`);
  if ((attr(form, "method") ?? "get").toLowerCase() !== "post") throw changed("form is not a POST");
  const enctype = (attr(form, "enctype") ?? "application/x-www-form-urlencoded").toLowerCase();
  if (enctype !== "application/x-www-form-urlencoded") throw changed("form is not a plain form post");
  const target = new URL(attr(form, "action") || pagePath, new URL(pagePath, "https://placeholder.invalid"));
  if (target.pathname.toLowerCase() !== LOGIN_SUBMIT_PATH.toLowerCase()) throw changed("form posts somewhere other than /Login/Authenticate");

  const fields: Record<string, string> = {};
  for (const input of elementsByTag(form, "input")) {
    const name = attr(input, "name");
    const type = (attr(input, "type") ?? "text").toLowerCase();
    if (!name || ["file", "submit", "button", "image", "reset"].includes(type)) continue;
    if ((type === "checkbox" || type === "radio") && attr(input, "checked") === null) continue;
    fields[name] = attr(input, "value") ?? "";
  }
  const missing = CONTINUE_LOGIN_REQUIRED.filter((name) => !(name in fields));
  if (missing.length > 0) throw changed(`form is missing ${missing.join(", ")}`);
  if (!fields[LOGIN_FIELDS.antiForgery]) throw changed("form has no anti-forgery token");

  fields[CONTINUE_LOGIN_FIELDS.companyId] = companyId;
  fields[CONTINUE_LOGIN_FIELDS.companyName] = companyName;
  return { path: target.pathname + target.search, fields };
}

/** The verified selector; for any other chooser shape, the markup selector reports what it saw. */
export const wovenCompanySelector: CompanySelector = {
  async select(page, company, client) {
    if (!hasVerifiedChooser(page.text)) return markupCompanySelector.select(page, company, client);
    const submission = nameContinueLoginSubmission(page.text, page.path, company);
    return client.request("POST", submission.path, { kind: "form", value: submission.fields });
  },
};

