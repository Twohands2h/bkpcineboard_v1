
# CINEBOARD R3.6 - CERTIFIED FREEZE

**Data:** 2026-02-06
**Versione:** v2.2.1-R3.6-certified

## ✅ SCOPE COMPLETATO

R3.6 certifica il **Branching** come concetto core:
- Take multipli creabili
- Take identificabili (naming automatico)
- Take switchabili
- Canvas isolato per take

## 🎯 FEATURES VALIDATE

1. **Entry Point Stable**
   - `/projects` route funzionante
   - Fix: `getProjects` → `listProjects`

2. **Take Identity**
   - Adapter pattern: DB schema → Component interface
   - Display naming: "Take 1", "Take 2", etc.
   - Basato su array position (display-layer puro)

3. **Take Creation**
   - Button "+ New Take" funzionale
   - Server Action: `createTakeAction`
   - Insert DB confermato
   - Pattern A: Full page refresh

4. **Canvas System**
   - Rendering stabile
   - Switch take → canvas remount
   - `key={takeId}` pattern funzionante

## 🟡 KNOWN LIMITATIONS (R3.7)

1. **UI Auto-Refresh**
   - New Take richiede refresh manuale
   - Causa: Pattern A + state locale `ShotWorkspace Non blocker: take creato in DB correttamente

2. **Snapshot Save/Restore**
   - Save bloccato da RLS policy `take_snapshots`
   - Non bug applicativo: configurazione DB
   - R3.7: implementazione RLS policies complete

## 📋 DECISION LOG

- **Opzione B (Adapter Pattern)**: Scelto vs migration DB
- **Pattern A (Full Refresh)**: Scelto vs optimistic update
- **RLS Policy**: Defer a R3.7 (non blocker branching)

## 🚀 NEXT: R3.7

Scope R3.7:
- Auto-refresh UI dopo New Take
- RLS policies complete
- Snapshot save/restore funzionale
- Take management avanzato

---

**R3.6 = Branching validated**
**R3.7 = Take management complete**
