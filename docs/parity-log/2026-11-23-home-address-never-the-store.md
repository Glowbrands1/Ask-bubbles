# An address given as the employee's never picks the card's store (QA, 23 Nov 2026, u22 live run)

**Fix (Ask Bubbles):** T2 "address: 123 Test St, Lees Summit, MO. 00000" got "Filed at **Lee's Summit, MO**, as you
said.": the store readers read the city in the employee's address as the store. `typedAddressSpans` /
`withoutAddressLines` (`src/lib/forms/exit-details.ts`) find every address the exit form's own Permanent Address reader
reads, and blank it before a store is read: in `locationFor` (`src/lib/forms/proposal.ts`, the card's store from the
manager's words; the regular chat path too), in the loop's place readers (`agent-loop/places.ts`) and in `store_said`.
A store the model passes that the manager named only inside such an address is dropped (`agent-loop/tools.ts`). A store
named anywhere else stands. Cases: `nov23-agent-loop-home-address-never-the-store-cases.ts` (all three fail on main) and
`exit-details-address-spans.test.ts`.

**Ask Sunny: same gap, port pending.** Sunny's main (daa2b3c) has the same Permanent Address reader and no address guard
in its salon readers (`salon-mention.ts` `readSalonMentions`). The port goes to the Sunny coder through QA; this session
has read access only to Ask Sunny.
