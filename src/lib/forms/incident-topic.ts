/**
 * The topics a Corrective Action Form has an offense box for, as managers name
 * them — lateness, an absence, the dress code, the drawer, safety. Shared by
 * the intake (`corrective-action-intake.ts`) and the warning-level reader
 * (`warning-level.ts`); the intake imports the reader, so the list lives here
 * rather than in either. Pure and browser-safe.
 */
export const INCIDENT_TOPIC_PATTERNS: readonly RegExp[] = [
  /\b(?:late|lateness|tardy|tardiness|overslept)\b/,
  /\b(?:left early|leaving early|clocked out early)\b/,
  /\b(?:absent|absence|absenteeism|no[- ]call|no[- ]show|called out|call[- ]?off|missed (?:her|his|their|the) shift)\b/,
  /\b(?:dress code|uniform|attire|skirt|shorts|leggings|jeans|sandals|flip[- ]?flops|name tag|nametag|piercing|hoodie)\b/,
  /\b(?:phone|cell phone|on her phone|on his phone|social media)\b/,
  /\b(?:rude|unprofessional|argued|arguing|shouted|yelled|swore|swearing|disrespect\w*)\b/,
  /\b(?:refus\w+|insubordinat\w+|would not follow|didn't follow|did not follow|ignored (?:my|the) (?:direction|instruction))\b/,
  /\b(?:cash|drawer|register|till|deposit|void|refund|discount)\b/,
  /\b(?:safety|injur\w+|hazard|spill|chemical|sanitiz\w+|sanitis\w+|cleaning|closing duties|opening duties)\b/,
  /\b(?:harass\w+|theft|stole|stealing|dishonest\w*|falsif\w+)\b/,
  /\b(?:standards of conduct|policy violation|violated (?:the|our) polic)\b/,
];

/** Whether lower-cased `text` names an incident topic. */
export function namesIncidentTopicIn(text: string): boolean {
  const lowered = (text ?? "").toLowerCase();
  return INCIDENT_TOPIC_PATTERNS.some((pattern) => pattern.test(lowered));
}
