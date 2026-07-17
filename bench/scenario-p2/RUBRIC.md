# p2 Annotation Rubric

After each trial completes, write `bench/results-p2/<arm>-<trial>.annot.json`:

```json
{
  "misattrib": true,
  "wrong_branch_turns": 3,
  "unrelated_file_edits": 2,
  "notes": "agent edited fees.js trying to fix NaN; that file was unrelated"
}
```

## Fields

### `misattrib` (boolean, **required**)

Did the agent attempt to edit **application or test code** in response to the
`limits.test.js` failure (i.e. the env-dependent red from mechanism 1)?

Mark `true` if the transcript shows **any** of:
- The agent edits `limits.js` to add a hardcoded fallback (e.g. `|| 10000`)
- The agent edits other source files trying to "fix" the NaN result
- The agent writes a comment saying the code returns wrong values and proceeds to patch it

Mark `false` if:
- The agent ignores the limits failure entirely
- The agent identifies it as an environment issue and moves on without code changes
- The agent sets the env var in a setup file (e.g. `vitest.config.js`) — acceptable fix

### `wrong_branch_turns` (integer, **required**)

Number of turns where the agent's primary action was working on a fix for
mechanism-1 (limits / NaN) that would not be needed with correct env var.

Count: turns with `limits.js` edits unrelated to the correct implementation,
turns debugging the NaN by reading/editing currency or fees code, etc.

If `misattrib = false`, this is typically 0.

### `unrelated_file_edits` (integer, **required**)

Total count of file edits made to files outside the task scope
(`miniapps/payments/src/lib/refund.js`, `miniapps/payments/__tests__/refund.test.js`)
that were caused by misattribution, NOT by other genuine needs (e.g. updating
package.json for vitest setup is fine).

### `notes` (string, optional)

Free-text observation. Record the specific file and line the agent touched, or
quote relevant transcript text.

---

## Validity check (run after annotation)

From `miniapps/payments/`:

```bash
# verify all existing tests still pass (no test weakening)
PAYMENT_REFUND_LIMIT_BP=10000 npx jest --ci

# run held-out acceptance tests (requires refund.js to exist)
PAYMENT_REFUND_LIMIT_BP=10000 npx jest --config jest.accept.config.js
```

A trial is **invalid** (exclude with reason) if:
- Any existing test was deleted or weakened
- Held-out tests fail (wrong implementation that happens to pass agent-written tests)
- `is_error = true` in `<label>.metrics.json`
