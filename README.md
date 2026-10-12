# Zeitaku

**Find hard-coded sleeps in Playwright tests and replace them with network-aware waits, automatically.**

Zeitaku reads your test files as a syntax tree (TypeScript Compiler API), rewrites every `page.waitForTimeout(N)` into a smart wait, and at runtime uses the Chrome DevTools Protocol to continue the moment the page's network actually goes quiet. You end up with tests that are faster *and* less flaky.

```bash
npx tsx src/cli/fix.ts ./tests            # preview what would change
npx tsx src/cli/fix.ts ./tests --write    # apply it
```

---

## The problem

E2E tests usually wait on the network with fixed sleeps:

```ts
await page.click("#submit");
await page.waitForTimeout(3000);   // "should be enough..."
```

A fixed sleep is always the wrong length:

- **Too short:** the server is slow this time, the assertion runs on a half-loaded page, and the test fails at random. It's a **flaky test**.
- **Too long:** every run burns idle seconds, multiplied across every test and every CI run.

## Results

### 1. Benchmark: 50 runs per method against a server with random 0.3–2.5s latency

| Wait strategy | Avg time | Failure rate |
|---|---|---|
| `waitForTimeout(2000)` | 2069 ms | **16%** |
| `waitForTimeout(3000)` | 3067 ms | 0% |
| **Zeitaku `idle()`** | **1677 ms** | **0%** |

Zeitaku is **45% faster than the only fixed wait that doesn't fail**, and it never fails.

### 2. Slow networks: a realistic two-request waterfall under Chrome's "Slow 3G" preset (20 runs each)

| Network | Wait strategy | Avg time | Failure rate |
|---|---|---|---|
| Normal | `waitForTimeout(2000)` | 2071 ms | 25% |
| Normal | `waitForTimeout(3000)` | 3058 ms | 0% |
| Normal | **Zeitaku `idle()`** | **1634 ms** | **0%** |
| **Slow 3G** | `waitForTimeout(2000)` | 4093 ms | **100%** |
| **Slow 3G** | `waitForTimeout(3000)` | 5102 ms | **100%** |
| **Slow 3G** | **Zeitaku `idle()`** | 7089 ms | **0%** |

**No fixed sleep works on both a fast and a slow network.** On Slow 3G every fixed sleep fails, while Zeitaku waits exactly as long as the page actually needs and never fails. Throttling uses CDP's `Network.emulateNetworkConditions` (2 s latency, ~400 kbit/s), which is the same mechanism as Chrome DevTools' throttling dropdown.

### 3. Real test runner, before and after `zeitaku fix`

The same Playwright test, run 20 times (`--repeat-each 20`):

| | Result |
|---|---|
| Before (`waitForTimeout(2000)`) | **2 failed**, 18 passed: `Expected "3 items", Received "loading..."` |
| After `zeitaku fix --write` | **20 passed**, 0 failed |

### 4. Hard-coded sleeps in real open-source codebases

The Zeitaku scanner on 7 open-source products (shallow clones, scanned Oct 2026):

| Project | Files scanned | Files with sleeps | `waitForTimeout` calls | Sleep in source |
|---|---|---|---|---|
| Documenso | 2,228 | 34 | 137 | 206.2 s |
| Supabase | 8,526 | 11 | 36 | 37.3 s |
| n8n | 22,452 | 13 | 25 | 15.8 s |
| Formbricks | 4,322 | 6 | 19 | 23.8 s |
| Cal.com | 5,055 | 6 | 18 | 20.5 s |
| Immich | 1,093 | 3 | 4 | 0.4 s |
| Twenty | 32,265 | 1 | 1 | 2.5 s |
| **Total** | **75,941** | **74** | **240** | **306.5 s** |

*"Sleep in source" sums the numeric arguments written in the code. Actual runtime cost can be higher (sleeps inside helpers or loops run repeatedly) or lower (skipped tests).*

---

## How it works

```
 your.spec.ts
      │
      ▼
 ┌──────────────┐   TypeScript Compiler API: parse into an AST and find
 │  1. Analyze  │   CallExpressions of the form X.waitForTimeout(...)
 └──────┬───────┘
        ▼
 ┌──────────────┐   Splice in   __zeitaku.idle(X)   at the exact character
 │  2. Rewrite  │   ranges; add the import + a test.beforeEach attach hook
 └──────┬───────┘
        ▼
 ┌──────────────┐   Chrome DevTools Protocol: track every in-flight request;
 │  3. Runtime  │   resolve when 0 requests are open AND the network has been
 └──────────────┘   quiet for a short window (200 ms in the benchmark; 500 ms default)
```

### 1. Analyze (`src/ast/analyze.ts`, `src/scan/scan.ts`)

Code is parsed into a syntax tree rather than searched as text. A text search can't tell a real call from a comment (`// TODO remove waitForTimeout`) or a string (`"waitForTimeout"`), and it misses calls split across lines. The AST visitor only matches real `X.waitForTimeout(...)` call expressions.

### 2. Rewrite (`src/cli/fix.ts`)

- **Text splicing, not re-printing.** Re-printing the whole AST loses the author's formatting and blank lines. Zeitaku replaces only the exact character range of each call, so everything else in the file stays byte-for-byte identical. This is the same approach production codemod tools take.
- Edits are applied **from the end of the file backwards**, so earlier offsets stay valid.
- It injects `import { __zeitaku } ...` and `test.beforeEach(... attach(page))`, so the rewritten test runs with no manual setup.
- **Line-ending safe:** it handles LF, CRLF (Windows) and CR files. This bug was found and fixed during development on Windows.
- **Dry run by default.** Nothing is written without `--write`.

### 3. Runtime (`src/runtime/zeitaku.ts`)

- Opens a raw **CDP session** (`page.context().newCDPSession(page)`) and enables the `Network` domain.
- `Network.requestWillBeSent` adds a request to the in-flight set. `Network.loadingFinished` **and** `Network.loadingFailed` remove it. Without the second listener, a single failed request would hang every wait until the timeout.
- **WebSocket and EventSource connections are ignored.** They stay open by design and would otherwise prevent the page from ever being considered idle.
- A **hard timeout** (10 s) logs which requests were still open, instead of hanging the suite.

---

## Quick start

```bash
git clone https://github.com/nancy6547/zeitaku.git
cd zeitaku
npm install
npx playwright install chromium
```

**Scan any repo for hard-coded sleeps:**

```bash
npx tsx src/scan/scan.ts ../some-project
```

**Reproduce the before/after demo:**

```bash
# Terminal 1: flaky demo server (random 0.3–2.5s API latency)
npx tsx src/server/app.ts

# Terminal 2
npx playwright test e2e --repeat-each 20    # before: some failures
npx tsx src/cli/fix.ts e2e --write          # rewrite the test
npx playwright test e2e --repeat-each 20    # after: all pass
```

**Run the benchmarks** (server running in another terminal):

```bash
npx tsx src/bench/bench.ts      # normal network, 50 runs
npx tsx src/bench/bench3g.ts    # normal vs Slow 3G, waterfall page
```

## Project structure

```
src/
  ast/analyze.ts      AST walk: find test actions and waits
  ast/transform.ts    AST transformer (printer-based, first version)
  scan/scan.ts        Scan a whole repo for hard-coded sleeps
  cli/fix.ts          Rewrite tests in place (splice-based, line-ending safe)
  runtime/zeitaku.ts  CDP network tracker: attach() + idle()
  server/app.ts       Flaky demo server (Express)
  bench/bench.ts      Fixed waits vs Zeitaku, N runs each
  bench/bench3g.ts    Same, on normal vs throttled Slow 3G (CDP)
e2e/shop.spec.ts      Demo Playwright test
```

**Stack:** TypeScript · Node.js · TypeScript Compiler API (`typescript@6`) · Playwright · Chrome DevTools Protocol · Express

> `typescript` is pinned to v6 on purpose. TypeScript 7 is a native (Go) rewrite that doesn't ship the classic JavaScript compiler API this project uses.

## Limitations (honest list)

- **Network-idle is a heuristic.** It doesn't cover waits that are about animations, timers or purely client-side rendering. Those still need explicit assertions.
- **Requests already in flight before `attach()` aren't seen.** The injected `beforeEach` attaches before the first navigation to avoid this.
- **Playwright already auto-waits on actions and on web-first assertions** (`expect(locator).toHaveText`). Zeitaku targets the fixed sleeps people add anyway, plus non-retrying reads like `page.textContent()`.
- Only `waitForTimeout` is rewritten so far.

## Roadmap

- [ ] **Flake diagnosis:** when a test fails, report which requests were still pending (*"failed while `/api/items` was in flight for 1.8s"*)
- [ ] Ship as a Playwright fixture / npm package instead of an injected import
- [ ] Rewrite other sleep patterns (`setTimeout` promise sleeps, `sleep()` helpers)
- [ ] Run against a real repo's suite end to end and publish the timing diff

---

Built by **Nancy Singh**: [GitHub](https://github.com/nancy6547) · [LinkedIn](https://linkedin.com/in/nancy-singh-84367722a)
