# PharmacyDeck Chat & Follow-Up Prompts — Plan

**Goal:** One chat as the main interface. Everything lives in search: compound lookup, compare, regulatory, studies, editorial. Follow-up prompts and prompt engineering drive what users can do next and keep them in the flow.

---

## 1. Vision

- **Single entry point:** One input (search/chat). No separate “search” vs “chat” — the user types a compound name, a question, or a comparison; the assistant resolves, answers, and suggests next steps.
- **Schema-aware:** The assistant and tools know the data model (compound, card, regulatory, FDA, editorial, studies). Answers and follow-ups are grounded in what we actually have.
- **Follow-ups are first-class:** After every response, the user sees 2–5 suggested follow-up prompts (chips or buttons) so they know what they can do next without guessing.

---

## 2. Schema Summary (What We Have)

| Domain | Tables / concepts | What the user can ask |
|--------|-------------------|------------------------|
| **Identity** | `compound` (rxcui, canonical_name) | “What is semaglutide?”, “Find tirzepatide” |
| **Card** | `compound_card` (mechanism, uses, safety, PK/PD, clinical_profile, deck_stats, tags) | “How does it work?”, “Indications?”, “Half-life?”, “Deck stats” |
| **Regulatory** | `compound_regulatory`, `compound_fda_label_section` | “FDA status?”, “Boxed warning?”, “Label link?” |
| **Evidence** | `compound_study`, `compound_study_finding` | “Studies?”, “Evidence?”, “Guidelines?” |
| **Editorial** | `compound_editorial_reference` | “Pharmacy Times / editorial coverage?” |
| **Chemistry** | `compound_pubchem` (formula, MW, SMILES, InChI) | “Molecular formula?”, “SMILES?” |
| **Compare** | Same schema for 2+ compounds | “Compare semaglutide and tirzepatide”, “Which has better weight loss?” |
| **Deck** | Session deck (cards from this chat) | “Add to deck”, “Show my deck” (already in UI) |

The chat API today has one tool: **generateCompound(query)**. It returns the full compound payload (card + regulatory + studies + editorial when present). The LLM can answer from that; follow-ups should steer the user to the next logical action.

---

## 3. Prompt Engineering

### 3.1 System prompt (high level)

- **Who:** PharmacyDeck, pharmaceutical intelligence assistant.
- **What you can do:** Look up compounds by name, compare two or more, summarize mechanism/indications/safety/PK/PD/regulatory/evidence. Each compound fetched is added to the “deck” panel.
- **Schema awareness:** Describe in 2–3 sentences that we have compound identity (RxCUI, name), a rich card (mechanism, uses, safety, PK/PD, clinical profile, deck stats), FDA/regulatory info, studies, and editorial when available. The model should not invent data we don’t have; if we don’t have a field, say so briefly.
- **Tools:** `generateCompound(query)` — call for each compound the user mentions or asks to compare. One call per compound.
- **Tone:** Brief, professional, clinically neutral. After answering, always suggest 2–4 concrete follow-up questions or actions (see below).

### 3.2 Tool descriptions

- **generateCompound:**  
  “Fetch or generate full compound intelligence for a drug name: identity (RxCUI), card (mechanism, indications, safety, PK/PD, clinical profile, deck stats), FDA/regulatory when available, and studies/editorial when present. Call once per compound. Adds the compound to the user’s deck.”

Making the description schema-aware helps the model know what it can answer from the tool result and what to suggest as follow-ups.

### 3.3 Follow-up instructions in the system prompt

Add explicit instructions, e.g.:

- “After every response, suggest 2–4 short follow-up prompts the user can ask next. Base them on: (1) the compound(s) just discussed, (2) what data we have (e.g. if we have studies, suggest ‘What does the evidence show?’; if we have FDA info, suggest ‘FDA label or boxed warning?’).”
- “Examples of good follow-ups: ‘Compare with X’, ‘What about drug interactions?’, ‘See FDA label’, ‘Half-life and dosing?’, ‘Add to deck’ (if not already), ‘What studies support this?’.”
- “Format follow-ups as a short list or as clear one-line suggestions so the front end can show them as tappable chips.”

Later, follow-ups can be structured (e.g. API returns `suggestedPrompts: string[]`) so the UI always shows them as chips.

---

## 4. Follow-Up Strategy

### 4.1 Types of follow-ups

| Type | When | Examples |
|------|------|----------|
| **Empty state** | No conversation yet | “Try: semaglutide”, “Compare metformin and SGLT2 inhibitors”, “What is tirzepatide?” |
| **After one compound** | User just asked about X | “Compare with tirzepatide”, “See FDA label”, “What about half-life?”, “Drug interactions?”, “Add to deck” |
| **After compare** | User compared A vs B | “Which has better weight loss?”, “Add both to deck”, “Mechanism of each?” |
| **Schema-driven** | We have regulatory/studies/editorial | “What does the evidence show?”, “Boxed warning?”, “Editorial coverage?” |

### 4.2 Where follow-ups come from (options)

1. **LLM-generated (in message):** System prompt asks the model to end each reply with a “Suggested follow-ups:” section. Front end parses or displays that. Easiest to start.
2. **Structured API:** Chat API returns `suggestedPrompts: string[]` (and optionally `compoundSlugs: string[]` for context). UI renders chips that send the string as the next user message. Requires the API to either (a) ask the LLM to output structured follow-ups, or (b) compute them server-side from last tool results + schema.
3. **Hybrid:** LLM suggests in text; a small server-side step maps last tool results to a few fixed follow-ups (e.g. “Compare with …” with the other compound’s name) and merges with LLM suggestions.

Starting with (1) is enough to validate; then add (2) or (3) for consistent chip UX.

### 4.3 UX for follow-ups

- Show 2–5 chips below the assistant message (or in a “Suggested” row).
- Clicking a chip sends that text as the next user message and keeps conversation context.
- Optional: “Compare with [compound]” chip that pre-fills “Compare [current] and [compound]”.

---

## 5. Phased Implementation Plan

### Phase 1 — Prompt and schema (no UI change)

- [ ] **1.1** Write a schema-aware system prompt (who we are, what we have, one tool, tone).
- [ ] **1.2** Add explicit “suggest 2–4 follow-up prompts after every response” and “format them as a short list” to the system prompt.
- [ ] **1.3** Improve tool description for `generateCompound` to mention card/regulatory/studies/editorial.
- [ ] **1.4** Test in the current chat UI: confirm the model suggests sensible follow-ups in plain text.

**Deliverable:** Chat responses that are schema-aware and end with clear suggested next questions in text.

### Phase 2 — Follow-up chips in the UI

- [ ] **2.1** Decide source of follow-ups: LLM-only (parse from message) vs API returning `suggestedPrompts`.
- [ ] **2.2** If API: extend chat response (stream or final payload) with `suggestedPrompts: string[]` (e.g. from LLM structured output or a post-step).
- [ ] **2.3** In the chat client, render follow-ups as chips below the assistant message; on click, send the chip text as the next user message.
- [ ] **2.4** Empty state: show 3–5 default suggestion chips (“Try: semaglutide”, “Compare …”, etc.) when there are no messages.

**Deliverable:** Users see tappable follow-up chips after each reply and on empty state.

### Phase 3 — Context-aware and schema-driven follow-ups

- [ ] **3.1** Pass last tool results (compound names/slugs, presence of regulatory/studies/editorial) into the system prompt or a “context” block so the model’s follow-ups are contextual (e.g. “See FDA label” only if we have `fda_label_url`).
- [ ] **3.2** Optional: server-side rules that add 1–2 follow-ups from schema (e.g. “Compare with [other compound]”, “See FDA label”) and merge with LLM suggestions.
- [ ] **3.3** Refine prompts and chip copy based on real usage.

**Deliverable:** Follow-ups that reflect what we actually have for that compound and what the user just did.

### Phase 4 — More tools (optional)

- [ ] **4.1** If needed, add tools like `getRegulatory(compoundSlug)` or `getStudies(compoundSlug)` for deep dives without re-fetching the full compound. Only if the single `generateCompound` payload is not enough for good answers.
- [ ] **4.2** Document each tool and its schema in the system prompt; keep follow-up instructions aligned with new capabilities.

---

## 6. Success Criteria

- User lands on chat, sees one search input and optional empty-state suggestions.
- User asks “semaglutide” or “compare semaglutide and tirzepatide” → gets an answer grounded in our schema and sees 2–4 follow-up chips.
- Follow-ups feel relevant (compare, FDA, studies, dosing, add to deck) and don’t suggest actions we don’t support.
- Prompt and follow-ups are easy to iterate (single system prompt + optional structured `suggestedPrompts`).

---

## 7. Files to Touch (Reference)

| Area | Files |
|------|--------|
| System prompt & tools | `apps/web/app/api/chat/route.ts` |
| Chat UI (messages + chips) | `apps/web/app/chat/HybridChat.tsx` or new home chat component |
| Empty state suggestions | Same chat component |
| Schema reference | `packages/database/src/types.ts`, `apps/web/lib/data.ts` (presentation types) |

Start with **Phase 1** (prompt + schema wording + follow-up instructions in system prompt); then add chips in Phase 2 and context-aware logic in Phase 3.

---

## Implemented (summary)

- **UI:** Home is the single search/chat; HybridChat full-height with Chat/Deck tabs; nav simplified to Search, Compare, My Deck, Cyberdeck; `/chat` redirects to `/`.
- **Phase 1:** Schema-aware system prompt and follow-up instructions in `apps/web/lib/chat-prompts.ts`; tool description updated in `/api/chat`.
- **Phase 2:** Empty-state suggestion chips; assistant messages parsed for "Suggested follow-ups:" and rendered as tappable chips (click sends that prompt).
- **Phase 3:** Request body accepts `context: { lastCompoundNames, hasRegulatory, hasStudies }`; `buildSystemPromptWithContext()` injects context into the system prompt; client sends context via a ref getter so each request gets the latest.
- **Phase 4:** Context injection serves as the structured follow-up nudge (no separate tools added); free path includes "Suggested follow-ups:" in the response for chip parsing.
