# Multi-Model Consensus Protocol

## Purpose
Enable Claude, GPT, and Gemini to collaboratively iterate on a plan until all three reach consensus.

## File Structure
- docs/PLAN.md - The implementation plan
- docs/consensus/claude.md - Claude's review
- docs/consensus/gpt.md - GPT's review
- docs/consensus/gemini.md - Gemini's review
- docs/consensus/STATUS.md - Tracks consensus

## Review Format

Every review file (claude.md, gpt.md, gemini.md) must use this exact format:

---
model: [Claude/GPT/Gemini]
iteration: [number]
verdict: [ALIGNED/BLOCKING/CONCERNS]
---

## Response to Other Models
[Address specific points from other reviewers. Say "N/A - first review" if first iteration]

## New Concerns

### Blocking Issues (must be fixed)
- [List any issues that MUST be fixed before you can approve, or "None"]

### Suggestions (should consider)
- [List improvements that would make the plan better, or "None"]

## What Works Well
- [List strengths of the current plan]

## My Verdict
[Write either:]
- "ALIGNED - I approve this plan"
- "BLOCKING - I need these changes: [list them]"
- "CONCERNS - I'd prefer these changes but won't block: [list them]"

---

## STATUS.md Format

# Consensus Status

| Model  | Verdict  |
|--------|----------|
| Claude | PENDING  |
| GPT    | PENDING  |
| Gemini | PENDING  |

## Consensus Reached: NO

## Current Blocking Issues
[List all blocking issues from all models, or "None"]

---

## Workflow

1. Plan author updates PLAN.md
2. All three models review and write to their respective files
3. Plan author reads all reviews and updates PLAN.md
4. Repeat until all three models say "ALIGNED"
