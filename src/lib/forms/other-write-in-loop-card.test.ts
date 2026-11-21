import { afterEach, describe, expect, it, vi } from "vitest";

import { guardOtherWriteIn } from "./other-write-in";

/*
 * Ported from the sibling app (HOTFIX, QA 17–18 Nov 2026; the tester's invented person is Remy Calder here): a loop
 * coaching card's topic is the Other topic, and "Coaching for <name> on greeting guests at the door" is the topic after the
 * name. The draft route passes the name and topic only for agent-loop cards; without them the guard reads as before.
 */
const KEYS = new Set(["other_topic"]);
const NOTES = "Coaching for Remy Calder on greeting guests at the door";
const draft = (otherTopic = "") => ({ values: { other_topic: otherTopic }, checked: { coaching_topics: ["other"] } });

describe("guardOtherWriteIn, a loop card's topic", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("the card's own topic comes first", () => {
    vi.stubEnv("OTHER_WRITE_IN_GUARD_ENABLED", "true");
    expect(guardOtherWriteIn(draft(), NOTES, KEYS, "Remy Calder", "Greeting guests").values.other_topic).toBe("Greeting guests");
  });

  it("with the person's name, the topic after it; a written topic that is the whole request is trimmed to it", () => {
    vi.stubEnv("OTHER_WRITE_IN_GUARD_ENABLED", "true");
    expect(guardOtherWriteIn(draft(), NOTES, KEYS, "Remy Calder", null).values.other_topic).toBe("Greeting guests at the door");
    expect(guardOtherWriteIn(draft(NOTES), NOTES, KEYS, "Remy Calder", null).values.other_topic).toBe("Greeting guests at the door");
  });

  it("without the name or topic (every non-loop draft), as before", () => {
    vi.stubEnv("OTHER_WRITE_IN_GUARD_ENABLED", "true");
    expect(guardOtherWriteIn(draft(NOTES), NOTES, KEYS).values.other_topic).toBe(NOTES);
  });
});
