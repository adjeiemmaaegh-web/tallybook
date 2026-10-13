# Tallybook Tiny NLU v2 Stage 1

This directory contains the isolated Stage 1 Tiny NLU v2 artifact and benchmark outputs. It is not routed through production `assistant.ts`.

The implementation is dependency-free TypeScript. It uses hashed lexical features, independent semantic factors, bounded typo/abbreviation/phonetic candidates, a deterministic compositional mapper, open-set rejection, and a safety pre-check. Live customer/product/supplier resolution remains outside the model.

Production financial execution was not changed. The model cannot write ledger records, bypass previews, bypass confirmation, or call business services.
