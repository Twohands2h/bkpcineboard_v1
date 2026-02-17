# 🧊 CINEBOARD — DEVELOPMENT PROTOCOL v1.0

## Scope

Questo protocollo regola il metodo di sviluppo di CineBoard tra:
- ChatGPT (Guardian)
- Claude (Implementer)
- Consultant (Reviewer)

È vincolante.

---

## 1. PRINCIPIO BASE

- Si lavora solo su HEAD del repository.
- Mai ricostruire file da versioni "originali".
- Solo diff chirurgici.
- Nessun refactor implicito.
- Nessuna modifica fuori scope dichiarato.

Se una modifica parte da file originale → STOP.

---

## 2. TOUCH DECLARATION (OBBLIGATORIA)

Prima di ogni implementazione:

🎯 Task:
📂 File che verranno toccati:
🚫 File che NON devono essere toccati:
🧪 Regression suite prevista:

Se nel diff compare un file non dichiarato → STOP.

---

## 3. INVARIANTI BLOCCANTI (NON MODIFICABILI)

Non possono essere modificati senza approvazione esplicita:

- storage_path precompute pattern
- React 18 batching pattern (endBatch deferito)
- persistSnapshot logic
- Upload Lock system
- take_counter monotonic system
- Shot Output singleton logic
- Viewport Persist contract
- Selection matching solo per nodeId

Qualsiasi modifica che impatta questi sistemi richiede revisione esplicita.

---

## 4. CHANGE ISOLATION RULE

- 1 fix = 1 commit
- 1 area per volta
- Nessun patch multi-feature
- Nessuna riscrittura file completa

---

## 5. PRE-FLIGHT CHECK (OBBLIGATORIO)

Prima di commit:

git status  
git --no-pager diff  

Se appaiono file non previsti → STOP.

---

## 6. SMOKE TEST MINIMO (OBBLIGATORIO)

Dopo ogni modifica Workspace:

- FV header funziona
- Output header funziona
- Duplica Take non duplica decisioni
- Viewport persist funziona
- Upload multi-file non rompe
- Refresh coerente

---

## 7. RUOLI

### ChatGPT (Guardian)
- Valida architettura
- Blocca derive
- Non ricostruisce file

### Claude (Implementer)
- Lavora solo su HEAD
- Produce diff piccoli
- Non usa file “originali”

### Consultant
- Stress test
- Non implementa

---

## 8. CAMBIO CHAT = HANDOFF OBBLIGATORIO

In caso di nuova chat:

- Incollare Freeze attuale
- Incollare Invarianti
- Incollare questo Protocollo
- Dichiarare esplicitamente:
  "Usare HEAD del repo. No file originali."
