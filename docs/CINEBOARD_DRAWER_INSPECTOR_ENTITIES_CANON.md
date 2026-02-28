# CINEBOARD v2.3 — Inspector Overlay + Entities + Provenance (Canon)

**Scope:** consolidare in un unico documento le regole canoniche su:
- Project Plancia (Entity Library)
- Shot/Take (Entity Lib overlay, Entity Ref nodes)
- Inspector (overlay, non sidebar)
- Provenance (generated_with / tool_origin)
- Entity Edit (overlay manuale)
- Roadmap: PLP include Entities (intelligente)

---

## 1) Fondamenti (non negoziabili)

### 1.1 No sidebar fisse
CineBoard elimina le sidebar fisse: tool rail ≠ sidebar.  
Ogni pannello informativo deve essere overlay attivabile (es. Decision Notes).  
**Conseguenza:** nessun “drawer destro” come parte del layout. (Bibbia + wireframe)

### 1.2 Entity = memoria trasversale (Project-level)
Le Entity sono memoria trasversale, non struttura narrativa.  
Entrano nel Take solo come **Entity Reference Node** (read-only, trascinabile).

---

## 2) Project Plancia — Entity Library (canonico)

### 2.1 Dove vive la Entity Library
In Project Plancia, la voce menu **Entity** sostituisce l’area centrale con **Entity Library**.
- Nessun popup
- Nessuna route separata
- Area centrale adattiva

### 2.2 Due vie canoniche di creazione Entity
1) Cristallizzazione da nodi nel Take (bottom-up)  
2) Creazione diretta da Entity Library in Plancia (top-down)

---

## 3) Shot/Take — Entity Lib overlay + Entity Ref

### 3.1 Entry point
Nel Take workspace, Tool Rail ALTO contiene: **[👤] Entity Lib → apre Overlay Entity Library**.

### 3.2 Uso dichiarativo nel Take
L’uso di un’Entity nel Take avviene tramite **Entity Ref Node**.
- dichiarazione esplicita “questa entity è usata qui”
- zero inferenza (no auto-match)

---

## 4) Inspector (sostituisce l’idea “Drawer destro”)

### 4.1 Definizione
**Inspector Overlay Panel** = overlay fluttuante/collassabile per leggere dettagli del nodo selezionato senza sporcare il canvas.

### 4.2 Regola UX (intenzione)
- apertura solo intenzionale (shortcut/handle)
- selezionare un nodo NON deve auto-aprire l’inspector
- se aperto, segue la selezione corrente

### 4.3 Rating
Il rating (stelline) resta un controllo canvas-first sui nodi.
L’inspector lo mostra (display), ma non diventa il gesto primario per “stellare”.

---

## 5) Provenance (memoria necessaria)

### 5.1 Media provenance (Image/Video)
Campo: `generated_with` (manuale, dropdown) + opzionale `model/version`.
Default: Unknown
Opzione: Real Footage / Imported + Custom

**Regola:** provenance e path/URL sono consultabili solo in Inspector/Entity, non nei PLP text outputs.

### 5.2 Prompt provenance
Campo: `tool_origin` (dove il prompt è stato scritto/usato) + opzionale model/version.

---

## 6) Entity Edit (v3) — overlay manuale (non canvas)

### 6.1 Regola
Entity non ha un workspace canvas in v3.
Si edita tramite una **plancia overlay** “Edit Entity” con:
- upload immagini/video (manuale)
- prompt editor con dropdown “nel nostro stile” + proprietà necessarie
- notes
- provenance (generated_with / tool_origin)

### 6.2 Scopo
Rendere l’Entity un “pack riproducibile” (rifare personaggio/mood/props), senza creare un secondo mondo creativo parallelo.

---

## 7) Export: Entity Pack + PLP include Entities (roadmap)

### 7.1 Entity Pack
Entity Library / Entity Edit devono supportare export pack (MD/ZIP) con:
- prompts
- notes
- media assets (originali quando disponibili)
- provenance
- human filenames

### 7.2 PLP Include Entities (intelligente)
Il PLP deve poter includere nel ZIP le Entity necessarie per rifare la scena, ma solo se:
- sono **referenziate** (Entity Ref Nodes) nel take/shot/scene corrente
- nessuna inferenza automatica

Output: cartella `entities/` nel pack con uno o più Entity Packs.

---

## 8) Cosa NON fare (anti-deriva)
- NO drawer laterale destro fisso (violazione Bibbia)
- NO duplicazione della Entity Library dentro l’inspector
- NO auto-tagging / auto-linking entities
- NO URL/tool origin nei PLP text outputs
- NO normalizer distruttivi / cambi snapshot/persist senza Amendment formale

## 9) Decisioni e proposte attive
### AD-PENDING — Inspector Overlay Panel (“Drawer”)
Status: PENDING (needs Amendment)
Evidence/Spec: docs/CINEBOARD_DRAWER_INSPECTOR_ENTITIES_CANON.md
Keywords: inspector, overlay, drawer, provenance, entity pack