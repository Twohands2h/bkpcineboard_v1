# WORKSPACE FREEZE V2

Data: 17 Feb 2026

## Stato Congelato

### Viewport
- Persist per take
- Restore solo su readyTakeId change
- No flash
- Double click fit-to-content toggle
- Undo safe

### Output
- Shot-level singleton
- Verde solo nel take owner
- Header coerente
- No take-level leakage

### Final Visual
- Shot-level
- Stable
- No duplicate propagation

### Clipboard
- Copy/paste nodes + edges
- Column + childOrder remap
- Strip editorial markers
- Paste in-place + 20px nudge
- 1 undo step

### Layering
- zIndex bump su drag commit
- Stable stacking after deselect

## Invarianti Core

- Snapshot untouched
- Upload untouched
- Undo atomic
- No editor markers inside node data after duplicate
- DB is source of truth
