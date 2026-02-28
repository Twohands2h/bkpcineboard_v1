# CINEBOARD_CANON_INDEX.md
Version: v2.3 (Feb 2026)  
Purpose: indice unico per rintracciare decisioni canoniche, documenti e milestone recoverable.

---

## 1) Retrieval Protocol (obbligatorio)
Prima di introdurre nuove UI surface o cambiare flussi core:
1) Cerca keyword nel repo (`drawer`, `inspector`, `entity library`, `plancia`, `wireframe`, `overlay`, `sidebar`).
2) Se la decisione non è già canonica: creare un Amendment (AD-0XX) + aggiornare questo Index.
3) Nessuna implementazione senza aggiornare questo Index.

---

## 2) Canon Documents Map

### Frozen
- `CINEBOARD_BIBBIA_v2_2_1_FINAL.md` — Bibbia (FROZEN)
- `CINEBOARD_WIREFRAME_SHOT_WORKSPACE.md` — Wireframe Shot Workspace (FROZEN)

### Canon Bridge (post-freeze)
- `docs/CINEBOARD_DRAWER_INSPECTOR_ENTITIES_CANON.md` — Inspector Overlay + Entities v3 + Provenance (ACTIVE)

### Amendments (post-freeze)
- (TBD) `CINEBOARD_AMENDMENTS_R4.md` — Decision Docs AD-0XX (ACTIVE)

---

## 3) Evidence-backed Canon (from Bibbia/Wireframe)

### CD-001 — Entity Library è globale (Project-level memory)
**Evidence:** Bibbia Step 6 (Entity → Entity Library in Plancia, area centrale adattiva) + Wireframe Shot Workspace Tool Rail ([👤] Entity Lib → overlay).  
**Keywords:** entity library, plancia, tool rail, overlay

### CD-002 — Nessuna sidebar fissa
**Evidence:** Bibbia: sidebar fisse eliminate; Wireframe: “NESSUNA sidebar fissa”.  
**Keywords:** sidebar, overlay, layout

---

## 4) Active UX Proposals / Pending Amendments

### AD-PENDING — Inspector Overlay Panel (“Drawer”)
Status: PENDING (needs Amendment; Bibbia è congelata)  
Evidence/Spec: `docs/CINEBOARD_DRAWER_INSPECTOR_ENTITIES_CANON.md`  
Keywords: inspector, overlay, drawer, provenance, entity pack

---

## 5) Workflow “a prova di bomba” (branch-first)
- Mai lavorare su main.
- Prima: branch dedicato (registrare nome).
- Dopo test OK: commit/push/merge main.
- Dopo merge stabile: backup branch `backup/main-<milestone>-<SHA>` + tag `v2.3-<milestone>` + push entrambi.
- STOP se: snapshot shape / emitNodesChange / parentId+childOrder / normalizer distruttivi.

---

## 6) Recoverable Milestones (main + tag + backup)

- v2.3-human-filenames — main cb48d43 — backup/main-human-filenames-cb48d43 — tag v2.3-human-filenames
- v2.3-plp-step2-ux-naming — main d9277e4 — backup/main-plp-step2-ux-naming-d9277e4 — tag v2.3-plp-step2-ux-naming
- v2.3-plp-columns-refine — main 1a2f7b7 — backup/main-plp-columns-refine-1a2f7b7 — tag v2.3-plp-columns-refine
- v2.3-export-assets-zip — main fd610f7 — backup/main-export-assets-zip-fd610f7 — tag v2.3-export-assets-zip
- v2.3-step3-max-quality-video — main 93c2d41 — backup/main-step3-max-quality-video-93c2d41 — tag v2.3-step3-max-quality-video
- v2.3-video-hover-preview — main 185284d — backup/main-video-hover-preview-185284d — tag v2.3-video-hover-preview
- v2.3-take-pad2 — main e0bf23f — backup/main-take-pad2-e0bf23f — tag v2.3-take-pad2
- v2.3-image-frame-role — main 1cb8e77 — backup/main-image-frame-role-1cb8e77 — tag v2.3-image-frame-role
- v2.3-fflf-neutral-plp — main 77725cb — backup/main-fflf-neutral-plp-77725cb — tag v2.3-fflf-neutral-plp
- v2.3-take-reset-numbering — main 74c2c63 — backup/main-take-reset-numbering-74c2c63 — tag v2.3-take-reset-numbering
- v2.3-take-label-pad2-reload — main a800d026d68e468066727ff4ee16e7baf79bbdce — backup/main-take-label-pad2-reload-a800d026d68e468066727ff4ee16e7baf79bbdce — tag v2.3-take-label-pad2-reload