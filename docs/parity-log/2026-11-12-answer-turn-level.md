## 12 Nov 2026: ANSWER_TURN_LEVEL stays Ask Bubbles only — Ask Sunny reads the answer's level already

In this app, after "Is this for **<roster name>**? Tell me if that should change.", the answer "no call no show on 11/3,
verbal warning" made the card ask Verbal or Written ("I've treated the earlier warning you mentioned as previous
corrective action history …") and kept ", verbal warning" in the Issue (QA, 12 Nov 2026, from B#808's gate; replay
`nov12-near-miss-answer-level-is-this-forms`).

Checked on Ask Sunny's branch `claude/near-miss-turned-down-plan` (S#889, merged with main), the same turns with its own
flags and NEAR_MISS_TURNED_DOWN_EVERYWHERE on: the card reads "**Type of Warning:** Verbal Warning, as you said" and the
Observation of Offense is "… no call no show on 11/3", without the level. Nothing to port.
