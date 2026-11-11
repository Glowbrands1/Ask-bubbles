## 11 Nov 2026: REQUEST_FOR_LABEL_ENABLED — Ask Bubbles only (B-C2)

**Not needed in Ask Sunny: it already reads this request.**

Pau's wording from QA's name matrix: "Corrective action for the primary salon manager: on Monday 10/05/2026 corin
bellweather was working a shift at the front desk and was rude to a guest". In this app it was answered as a policy
question: no card on the roster, and no "who is this for" off it. `leadingFormRequest` (`forms/template-intent.ts`) only
took "for <name>", and "the" is not a name. With REQUEST_FOR_LABEL_ENABLED, a short "for …" that ends at a colon labels
the request.

Ask Sunny has the same `leadingFormRequest` branch, but its replay cases `nov4-name-pau-2-{on,off}-{code,models}` all
hold on its production flags: the card is for the person on the roster, and off the roster the reply asks who it is for
(checked 11 Nov 2026). Its request is read by its grounded readers (INTENT_EXTRACTION / GROUNDED_ENTITIES, on there and
off here), so the label reading is not needed there.
