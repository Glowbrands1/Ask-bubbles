import { caPolicyTargetSection } from "./ca-policy-retrieval";

/**
 * The manager's words, then the JBA section they mean, for the agent loop's manual search (port from the sibling app's
 * `expandPolicyQuery`, over this app's own cue table, `CA_POLICY_SYNONYMS`): hybrid search ORs the extra words. A
 * section already named is not repeated.
 */
export function expandPolicyQuery(text: string): string {
  const section = caPolicyTargetSection(text);
  if (!section || text.toLowerCase().includes(section.toLowerCase())) return text;
  return `${text}\n${section}`;
}
