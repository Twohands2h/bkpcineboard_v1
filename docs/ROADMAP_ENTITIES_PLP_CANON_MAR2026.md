# CineBoard — Entities + Inspector + PLP Roadmap (Canon) — Mar 2026

> **Status:** Canon frozen (Mar 2026)  
> **Purpose:** Preserve decisions + implementation roadmap for Entities/Inspector/PLP to avoid drift during long branches.

---

## North Star

CineBoard is an **AI Film Memory System**.  
These changes must preserve: **memory > organization**, **film-first**, **no inference**, **human-in-the-loop**.

### Non-negotiable Guardrails
- **No inference / no semantic dedup** in PLP (reflection only).
- **Snapshot shape / emitNodesChange / parentId / childOrder are untouchable** in these milestones.
- PLP must not become a DAM. Export is **intentional download** with context.
- Reference Nodes must not duplicate canon; UI should prefer **live canonical entity data**.

---

## Canon Decisions (Frozen)

### A) PLP + Entities Inclusion
1. **Entities are included in PLP ONLY via incoming edges**: `EntityRef → Prompt` (incoming to prompt).  
   - Not included just because an entity exists in canvas.
2. Multiple entities may feed the same prompt: **many `EntityRef → Prompt`** supported.
3. **Export is always one ZIP**, with selectable formats:
   - **Single Pack (default):** one `00_prompt.txt`
   - **Per-Prompt folders (advanced):** `prompts/<prompt>/prompt.txt` inside same ZIP
4. **00_prompt.txt is mechanical, not composed**:
   - Prompt body remains the prompt body.
   - Append blocks for: Media refs (incoming) + Entity packs (incoming).
5. To avoid wall-of-text without inference:
   - First occurrence of an Entity block in `00_prompt.txt`: full block
   - Later occurrences: `→ Entity: <name> (see first occurrence above)`
6. **PLP educational nudge (not inference):**
   - If entity_ref nodes exist in canvas but are not linked to any prompt:
     - show: `X entities in canvas not linked to any prompt — link to include in pack`
   - This is a simple count: `total_entity_refs - linked_entity_refs`.

### B) Edge Grammar
- **Incoming to Prompt = INPUT/INCLUDE** (green dotted line).
- **Outgoing from Prompt = OUTPUT/DERIVED** (excluded from pack).
- Other edges remain neutral.

### C) EntityRef Node (Canvas) — Recognizability
- Chosen direction: **10B badge-first** (not preview-first).
- Must include:
  - **Type icon glyph** (fixed, not emoji): Character / Cinematography / Environment / Prop
  - **Type color border/stripe**
  - **Readable name** (not tiny)
- Preview images are provided via **Peek**, not embedded in the node.

### D) Peek Ghost Preview (EntityRef only)
- Peek applies **only to EntityRef nodes**.
- Shows **images only** (no prompts/notes), lightweight overlay.
- Trigger:
  - hover **dwell 700ms** (reactive but not noisy)
  - optional long-press fallback
- Must NOT appear during: drag/pan/multi-select/text edit.
- Must disappear instantly on mouse leave (no trailing animation).
- Cooldown ~2s per node to avoid flicker.

### E) Entity Edit Guardrails
- No confirm on Save (avoid confirm fatigue).
- Confirm required on destructive actions:
  - **Delete media from entity** (confirm)
  - Delete entity (confirm)
- **Dirty state protection:**
  - If user closes Edit overlay with unsaved changes (backdrop / ESC / X):
    - prompt: `Discard changes?` (Discard / Continue editing)
  - If no changes: close silently.

### F) Usage Count + Where Used
- Drawer shows `Used in N`.
- Click opens list “Where used”.
- Click item navigates via **normal route to Shot page** (no teleport jump).
- Take info may be shown as read-only text.

---

## Roadmap Milestones (Branch-First)

> Each milestone should be its own branch, merged to main only after manual test pass + backup branch + annotated tag.

### Milestone 1 — Safety & Consistency (Low/Med)
- Replace browser confirm with CineBoard confirm system for entity delete.
- Dirty state + discard-confirm on Edit Entity close (no undo).
- Ensure Edit + Download actions are sticky (top), Delete stays non-sticky.

**Manual tests**
- Close edit with dirty changes -> confirm appears.
- Close edit with no changes -> closes immediately.
- Delete media -> confirm.
- Delete entity -> confirm.
- Save -> no confirm, shows saved feedback.

### Milestone 2 — Canvas Readability (Med/High)
- Implement EntityRef node 10B+:
  - glyph per type + type color border + readable name
- Implement Peek per canon (dwell 700ms, entity_ref only).

**Manual tests**
- Canvas readability: multiple entities are distinguishable at a glance.
- Peek triggers only on dwell; not during pan/drag.
- Peek disappears instantly on leave.

### Milestone 3 — Cross-memory Navigation (Medium)
- Usage count + “where used” list in drawer.
- Route navigation to Shot on click.

**Manual tests**
- Count matches DB.
- Click navigates to Shot page (normal navigation).
- No strip/session restore regressions.

### Milestone 4 — PLP Entities (High)
- Edge grammar UI for EntityRef→Prompt (green dotted).
- PLP nudge “X entities not linked”.
- PLP export mode toggle: Single Pack vs Per-Prompt folders.
- Prompt pack formatting:
  - prompt body + appended refs + appended entity blocks
  - “see above” for repeated entity blocks
- Include entity packs text-first (Cinematography) and media when present.

**Manual tests**
- Link entity→prompt -> entity included in prompt pack.
- Unlinked entity_ref -> PLP shows nudge count.
- Export ZIP:
  - Single Pack includes correct 00_prompt.txt
  - Per-Prompt folders generated correctly
- No inference/dedup beyond “see above” formatting rule.
- Cinematography entity without images still exports correctly.

---

## Notes / Watchouts
- Monitor if users try to drag entities into columns. If frequent, improve link discoverability (highlight target prompt on edge drag, micro hints), but keep canon: entities do not “live inside” columns.
- Keep PLP reflection pure; additions must remain mechanical and explicit.

Regola canonica: incoming edge EntityRef → Prompt
Le Entities entrano nel Prompt Pack esclusivamente tramite edge in ingresso al nodo Prompt:
EntityRef → Prompt   (label: 'ref' o no-label)   ✅ PLP-relevant
Prompt → EntityRef                                 ❌ non contato
column ↔ entity_ref  (label: 'struct')             ❌ non contato
Non esiste inferenza, deduzione semantica, o bucket categorization. Se un EntityRef non ha un edge incoming verso un Prompt, non compare nel Prompt Pack. È una regola meccanica e intenzionale: il filmmaker decide esplicitamente quali entities entrano nel contesto del prompt.
Questa regola è congelata. Modifiche richiedono revisione esplicita del canon.

UX: Link feedback + PLP nudge (mechanical, not inference)
B1 — Toast "Entity added to Prompt Pack"

Trigger: creazione edge valido entity_ref → prompt (fromType === entity_ref, toType === prompt) in TakeCanvas.handleConnectionMouseUp, nel branch !isDupe.
Implementazione: stato interno entityLinkToast + timer ref in TakeCanvas. Nessuna prop aggiuntiva esposta verso il parent.
Coalescing: ogni nuovo edge PLP-relevant resetta il timer. Il toast rimane visibile 1.8s dall'ultimo evento. Se l'utente crea 5 edge consecutivi, il toast non spamma — rimane acceso e si azzera 1.8s dopo l'ultimo.
UI: pill centrata in basso nel canvas, bg-zinc-800 border-zinc-600, testo "Entity added to Prompt Pack". Non invasivo, pointer-events-none.
Non triggerare per: edge structurali (column), edge prompt → entity_ref (direzione opposta), qualsiasi edge non entity_ref.

B2 — Nudge in PLP

Condizione meccanica: entityRefNodes.length > 0 AND countLinkedToPrompt === 0
Logica: in ProductionLaunchPanel, useMemo che scansiona gli edges: conta gli EntityRef che compaiono come edge.from dove edge.to è un nodo prompt. Se linkedEntityIds.size === 0 → hasUnlinkedEntities = true.
UI: una riga discreta text-[10px] text-zinc-600 italic nel pannello Prompts: "Some entities aren't linked to any prompt, so they won't be included."
Non mostra: elenco delle entities non linkate, suggerimenti su quale collegare, inferenza sull'importanza.
Scompare automaticamente appena almeno un EntityRef è collegato a un Prompt (perché il PLP riceve i nuovi edges via getSnapshot() all'apertura — o al prossimo open).


File toccati (Milestone B)
FileModificasrc/components/canvas/TakeCanvas.tsx+entityLinkToast state + showEntityLinkToast (coalescing) + trigger in handleConnectionMouseUp + toast pill JSXsrc/components/production/production-launch-panel.tsx+entityRefNodes + hasUnlinkedEntities useMemo + nudge JSXdocs/ROADMAP_ENTITIES_PLP_CANON_MAR2026.mdQuesto file

Invarianti rispettate

Snapshot shape: ✗ non toccata
Persist pipeline (emitNodesChange): ✗ non toccata
FV/Output/ShotHeader: ✗ non toccati
TakeCanvas core (3-layer sacred): ✅ solo aggiunta UI overlay + stato interno
No dedup/inference in PLP: ✅ solo reflection meccanica

## UX — Entity → Prompt linking feedback (Mechanical, not inference)

### Link feedback (toast)
When the user creates a PLP-relevant edge `EntityRef → Prompt`:
- Show a lightweight, temporary toast: **“Entity added to Prompt Pack”**
- Coalesce repeated links (no spam); UI-only (no DB persistence).

### PLP nudge (education)
If the current take contains `entity_ref` nodes but **none** are linked to any Prompt via incoming edges:
- Show a subtle message in PLP: “Some entities aren’t linked to any prompt, so they won’t be included.”
- This is purely mechanical (count-based), not semantic inference.

**Canon unchanged:** Entities are included in PLP **only** via incoming edges `EntityRef → Prompt`.