# CINEBOARD_AMENDMENTS_R4.md

## AD-001 — Inspector Overlay Panel (aka “Drawer”)
**Status:** APPROVED (post-freeze)  
**Date:** 2026-02-28  
**Motivation:** introdurre una surface di lettura contestuale per nodi/refs senza violare il canone “NO sidebar fisse”.

### Context
- Bibbia v2.2.1 e wireframe Shot Workspace eliminano le sidebar fisse (“NESSUNA sidebar fissa”).
- CineBoard necessita di un pannello di lettura per metadata/provenance e per supportare Entities come memoria riproducibile.
- “Entity Library” è già canonica e globale: vive in Project Plancia (area centrale adattiva) e come overlay da Tool Rail nel Take.

### Decision
Introdurre un **Inspector Overlay Panel**:
- Overlay fluttuante/collassabile che appare sopra il canvas.
- Attivazione **solo intenzionale**:
  - handle icon sul bordo destro del canvas
  - shortcut `I`
- Selezionare un nodo **non** apre automaticamente l’inspector.
- Se aperto, l’inspector segue la selezione corrente (read-first).

**Nota terminologica:** internamente può essere chiamato “Drawer”, ma canonicamente è un **overlay panel**, non una sidebar di layout.

### Scope (v1)
- Read-first node inspection per Image/Video/Prompt.
- Mostra (quando disponibili):
  - human filename + copy
  - FF/LF, dimensions/AR
  - provenance: media.generated_with (dropdown manuale, default Unknown)
  - prompt.tool_origin (manuale)
  - source identifier path/URL visibile/copiabile SOLO qui
- Rating: resta canvas-first (stelline sul nodo). In inspector solo display.

### Non-goals (anti-deriva)
- NON introdurre sidebar fissa.
- NON duplicare Entity Library dentro l’inspector.
- Nessuna inferenza/auto-tagging.
- Nessun cambiamento a snapshot shape, emitNodesChange, parentId/childOrder.
- Nessun URL/tool origin nei PLP text outputs.

### Consequences / Follow-ups
- Spec canon di dettaglio: `docs/CINEBOARD_DRAWER_INSPECTOR_ENTITIES_CANON.md`
- Index: aggiornare `docs/CINEBOARD_CANON_INDEX.md` (AD-PENDING → APPROVED + keywords)