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