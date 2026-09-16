# Recap: write-up

Engineering take-home: a simplified Fireflies.ai clone. Setup, architecture and the API are in the
[README](../README.md). The full implementation plan, with every deviation recorded per task, is in
[docs/plans/](plans/).

## What was built

- **Record** a meeting from the browser microphone (`MediaRecorder` at 32 kbps, Opus/WebM or MP4
  on Safari, warning at 55 min, auto-stop at 60 min, a confirmation before closing the tab or
  following a link with unsaved audio, download of the local recording). Mic-free paths: **Try a sample** (a bundled 105-second, three-person standup
  generated from [sample-script.md](sample-script.md)) and **Upload audio file**. Both go through
  the same production pipeline.
- **Transcribe** with real speech-to-text: `openai/whisper-1` through Vercel AI Gateway, or Groq
  `whisper-large-v3-turbo`, chosen by `STT_PROVIDER`. The transcript keeps segment timestamps,
  language and measured duration.
- **Summarize** with `anthropic/claude-haiku-4.5` through AI Gateway (`google/gemini-2.5-flash` as
  the gateway fallback): title, overview, key takeaways, decisions, and action items with owner and
  due date. Structured output is validated against a shared zod schema, with one repair retry.
- **UI:** a meeting list (status, duration, overview snippet, action-item count), and a meeting page
  with a live status stepper, summary, timestamped transcript, a failure banner with Retry or
  Delete and re-upload, and delete with inline confirmation.
- **Backend:** a Hono API on one Vercel Function, one Postgres table (Neon, drizzle), a private
  Vercel Blob store, and a synchronous, idempotent, resumable processing endpoint.
- **Quality:** TypeScript strict on both sides, Biome, 40+ Vitest files (client and server
  projects), ~99% statement coverage on the server project, and GitHub Actions CI.

## Key decisions and trade-offs

**Synchronous pipeline with a lease instead of a queue.** One `POST /process` runs all missing steps
inside a single function invocation (up to 300 s), which is expected to cover a 60-minute
recording. A queue, cron or workflow engine would add infrastructure, a second deploy target and
more failure modes for no gain at this scale. What makes it safe:

- An atomic lease: one conditional `UPDATE … RETURNING` binds the caller's clock. neon-http has no
  interactive transactions, so the lease can't be a read-then-write. Every later write of the run
  is conditional on still holding that lease, so a run that outlives it can't overwrite the run
  that took over.
- The row is saved after every step.
- `stalled` is derived from an expired lease (or a started run without one), so a killed run
  shows up in the UI and Retry takes it over.

The cost: the browser has to trigger processing (it does so automatically on the meeting page), and
a single recording can't take longer than one function run.

**Resume by artefacts, not by status.** `nextStep()` looks at what is saved (`transcript_text`,
`summary`), so Retry after a summary failure never pays for speech-to-text again. Every status
write clears the previous error, and `attempts` only grows. Taking over a stalled run counts as a
failed attempt, so a recording that always times out ends in `give_up` instead of an endless paid
retry loop.

**Single table.** The meeting, transcript, summary, error state and lease all live in one
`meetings` row with `jsonb` for segments and summary. There are no joins, one read serves the
meeting page, and the list query selects only the columns it needs. The trade-off is no querying
inside summaries or action items, which the MVP doesn't need.

**Upload first, then create.** The browser uploads straight to a private Blob store with a
short-lived client token, then creates the meeting row with the uploaded pathname. Audio never
passes through a function, so no function time or request body goes to moving bytes. The plan
assumed the 4.5 MB function body limit, and direct upload stays the right shape even if that limit
is higher now. The trade-off is orphan blobs: an upload whose create fails or never happens stays
in the store. This is accepted and bounded (25 MiB per file, store quota). The create request
follows the same rules as the upload token (a `recordings/` path, an allowed type, ≤ 25 MiB).

**Provider switch instead of an automatic provider chain.** Gateway speech-to-text is a per-team
beta, so the provider is picked once by env (`STT_PROVIDER`) on day 0 instead of failing over at
runtime. A chain would double-bill on partial failures, mix providers inside one dataset and make
failures harder to read. Both providers sit behind one `SttProvider` interface and map every
provider error to a generic, retryable `SttError`. For the LLM, fallback does happen, but inside
AI Gateway (`providerOptions.gateway.models`), which needs no extra code. The step log records
the model that actually answered.

**Rate limits from database counts.** No `rate_limits` table, no Redis: `POST /meetings` counts
rows created in the last hour per IP hash (10) and globally (30). That is two indexed count
queries per create. Deletes are soft (content wiped, row kept), so deleting never frees quota. The
trade-offs: an approximate `Retry-After` (always the full hour), and count-then-insert is not
atomic, so a burst of parallel creates can overshoot the limit by the requests in flight. The Blob
token endpoint is deliberately not limited, because the Blob client discards error bodies. A
Vercel Firewall rule is the next step if abuse shows up.

**Smaller decisions.**

- One shared zod contract (`shared/schemas.ts`): the server validates with it and the client
  parses every response with it.
- The server takes its dependencies through `createApp(deps)`, so everything except the thin SDK
  adapters is tested against in-memory fakes.
- `api/index.ts` exports the Hono app itself. `hono/vercel`'s `handle(app)` is treated as a legacy
  `(req, res)` handler by `@vercel/node`.
- Server imports use relative `.js` specifiers. The Vercel builder transpiles each file without
  bundling, which a local `vercel build` confirmed.
- Only the app's own error types keep their message in the database. Provider payloads go to logs
  only.
- No auth: one public demo workspace, with a privacy notice in the README.

## Failure modes handled

| Failure | What happens | How to reproduce |
|---|---|---|
| Microphone permission denied | Recorder card explains the block and offers **Try a sample** / **Upload audio file** | Block the mic in site settings, click **Start recording** |
| No recordable format or insecure context | Recorder shows "unsupported" with the mic-free options | Run `pnpm exec vite --host` next to `pnpm exec tsx watch server/dev.ts`, then open `http://<LAN-IP>:5173` |
| No mic, mic busy, recorder throws | "Unavailable" state with **Try again** | Unplug the mic, or hold it in another app |
| Leaving mid-recording or with an unsaved recording | Closing the tab: the browser asks. An in-app link (header, meeting list): the app asks, also while the recording is saving, and staying keeps the recording. Only the save's own move to the new meeting skips the prompt; a save that finishes after the user left doesn't pull them back | Start recording, then close the tab or click a meeting in the list |
| Recording started while a file or sample is pending | A sample still downloading is dropped, and a failed file or sample save loses its **Retry**, so neither can navigate away from the new recording | Click **Try a sample**, then **Start recording** right away |
| Save fails, then the recording is discarded | Discard also drops the failed save, so its **Retry** can't upload the discarded audio | Stop the API, record, save, click **Discard** |
| Recording over 25 MiB | Refused before upload with a size message; the recording can still be downloaded | `useSubmitRecording.test.tsx` |
| Wrong file type, empty file or file over 25 MiB | Rejected in the browser before upload. The upload token policy, the create schema and the pipeline size guard reject it on the server too | **Upload audio file** with a `.txt`, an empty file or a large WAV |
| Too many creates (429) | Inline message; no meeting is created (the uploaded blob stays as an orphan). Deleted meetings still count | Create 11 meetings within an hour from one client (the 31st from all clients is refused too) |
| Second process request (409) | Swallowed; the page keeps polling | After **Save**, one of the two `POST …/process` requests in DevTools → Network returns 409. Or `curl -X POST <url>/api/meetings/<id>/process` while it runs |
| Automatic start fails (e.g. a 5xx before the lease) | The meeting stays `uploaded`; the page shows the error with **Retry** | Stop the API right after the meeting page opens, or `mockRejectedValueOnce` in `MeetingPage.test.tsx` |
| Function killed mid-run (stale lease) | After 310 s the meeting is `stalled` (also between its two steps) and shows "Processing was interrupted" with Retry. Takeover counts as an attempt | Locally: stop `pnpm dev` while a meeting is transcribing, start it again, wait 310 s |
| Too many attempts (422 `give_up`) | Banner offers only **Delete and re-upload** | Fail the same meeting 5 times: the automatic run plus 4 Retries (e.g. with the bogus models below) |
| Summary failure, then Retry | `failed` at the summarize step. Retry resumes at summarize, no new speech-to-text call | Set both `LLM_MODEL=bogus/model` and `LLM_FALLBACK_MODELS=bogus/model` (an empty value means the default fallback, not none), run the sample, restore the env, restart the API, click Retry; the logs show only a summarize step |
| Malformed LLM output | One repair retry at temperature 0; a second failure is a retryable `failed` at the summarize step | `server/services/summarize.test.ts` |
| LLM answer over the list or title limits | Trimmed to 10 takeaways, 10 decisions, 20 action items and a 120-character title; no retry | `server/services/summarize.test.ts` |
| Provider error (5xx, HTML body, bad key) | Stored message is generic ("Speech-to-text provider failed" / "Summary generation failed"); the raw error and cause go to logs only | `server/services/stt/gateway.test.ts`, or an invalid `AI_GATEWAY_API_KEY` |
| Short or silent transcript | Fewer than 5 words → "Empty recording" placeholder, `done`, no LLM call (log line has `placeholder: true`) | `ffmpeg -f lavfi -i anullsrc=r=16000:cl=mono -t 1 silent.wav`, then upload it |
| Transcript over 100k characters | Prompt truncated, `transcript_truncated` saved | `server/services/prompts.test.ts` |
| Audio blob missing | `failed` at the transcribe step, "Audio not found", not retryable → Delete and re-upload; the API refuses a retry with 422 `not_retryable` | Create a meeting for a path that was never uploaded: `curl -X POST <url>/api/meetings -H 'content-type: application/json' -d '{"audioPathname":"recordings/missing.webm","contentType":"audio/webm","sizeBytes":1,"source":"upload"}'`, then open it |
| Create for a path the upload token wouldn't allow | 400 `validation` | Same `curl` with `"audioPathname":"recordings/../x.webm"` |
| Meeting deleted mid-run | The run ends with 404 at its next save; the blob is deleted best-effort | Delete the meeting while it is processing |
| Unknown meeting or route (404) | "Meeting not found" / "Page not found"; unknown API paths return the 404 envelope | Open `/m/does-not-exist` or `/api/nope` |
| Network error or 5xx while polling | Last data stays on screen with an alert and **Try again**; polling continues | Stop the API while a meeting page is open |
| Malformed JSON body or invalid input | 400 `bad_request` / `validation` envelope | `curl -X POST localhost:3001/api/meetings -H 'content-type: application/json' -d '{'` |
| Missing `DATABASE_URL` or invalid env | `/api/health` stays up (the database client is created on first use); other routes return a logged 500. An invalid env stops the API at startup with a readable message | Run the API without `.env.local`, or with `STT_PROVIDER=groq` and no `GROQ_API_KEY` |
| Sample file missing from the deploy | The SPA fallback HTML is detected and shown as an error, not uploaded | Remove `public/samples/standup.webm`, click **Try a sample** |

## Integration evidence

`pnpm smoke:ai` with real credentials (transcribes and summarizes the bundled sample):

```json
<paste the output here>
```

## Production smoke checklist

Recorded against `<LIVE_URL>` on `<date>`, deployment from commit `<sha>`.

| # | Check | Result |
|---|---|---|
| 1 | `curl -i <LIVE_URL>/api/health` returns JSON with the expected `sttProvider` (not `index.html`, not the 404 envelope) | |
| 2 | Deep link `/m/<id>` loads (SPA rewrite) | |
| 3 | **Try a sample** reaches `done` with timestamps, decisions and action items | |
| 4 | 20 s mic recording in Chrome (`audio/webm`) | |
| 5 | 20 s mic recording in Safari (`audio/mp4`) | |
| 6 | MP3 upload | |
| 7 | Reload mid-processing resumes polling | |
| 8 | After **Save**, one of the two `POST …/process` requests returns 409 and the page keeps polling | |
| 9 | Bogus `LLM_MODEL` and `LLM_FALLBACK_MODELS` → `failed` at the summarize step → restore → Retry resumes without re-transcribing (no STT call in the function logs) | |
| 10 | 1-second silent file → `done` with the placeholder summary | |
| 11 | 11th create within an hour → 429 shown inline | |
| 12 | Phone-width layout | |
| 13 | Clicking a meeting link while recording asks before leaving | |
| 14 | Private blob URL is not publicly readable | |
| 15 | Function logs show step durations and no secrets | |
| 16 | Function settings show `maxDuration` 300 | |

## Time spent

Implementation ran in a supervised ralphex loop: one plan task per iteration, each ending in a
`pnpm verify`-green commit. Durations are commit to commit, in local time (BST, 2026-09-16). The
loop started at 20:04 after the pre-flight commit (20:03).

| Task | Planned | Actual (commits) |
|---|---|---|
| 1. Toolchain, Hono dev loop, Vercel layout, test harness | 1.0 h | 6 min (→ 20:09) |
| 2. Shared contract, status machine, drizzle schema, repo with lease | 0.75 h | 8 min (→ 20:17) |
| 3. Deps contract, meetings API, error envelope, abuse limits | 0.75 h | 7 min (→ 20:25) |
| 4. Blob upload token route, storage adapter, client upload | 0.5 h | 7 min (→ 20:32) |
| 5. STT providers, summarizer with repair retry, smoke script | 0.75 h | 12 min (→ 20:44) |
| 6. Pipeline orchestrator, process endpoint | 0.75 h | 6 min (→ 20:49) |
| 7. Client foundation, API client, meeting list | 0.5 h | 10 min (→ 20:59) |
| 8. Recorder hook and card, submit flow | 1.0 h | 9 min (→ 21:08) |
| 9. Meeting hooks, stepper, summary and transcript panels | 0.75 h | 10 min (→ 21:18) |
| 10. Meeting page, failed banner, delete, mic-free entry points | 0.75 h | 10 min (→ 21:28) |
| 11. Sample asset, local Vercel build, acceptance audit | 0.75 h | 17 min (→ 21:45) |
| 12. README and write-up | 0.5 h | 8 min (→ 21:53) |
| **Implementation loop total** | **8.75 h** | **~2 h** |

Human-supervised time, including work that leaves no commit (fill in before submitting):

| Activity | Hours |
|---|---|
| Brief analysis, design panel and plan (before the first commit) | `<fill in>` |
| Human pre-flight (Vercel link, Neon, Blob, AI Gateway access) | `<fill in>` |
| Supervising the loop and reviewing each task's diff | `<fill in>` |
| ralphex review phase and fixes | `<fill in>` |
| Deploy, production smoke, seeding | `<fill in>` |
| **Total** | `<fill in>` |

## AI tooling used

- **Claude Code** (Claude Opus): discovery, the design panel that picked this architecture, and
  the implementation plan (`docs/plans/`). An adversarial review then checked the plan's
  assumptions against the installed packages and caught, for example, that `transcribe()` has no
  `mediaType` option, `@hono/zod-validator` does not throw on failure, and `dotenv/config` does not
  read `.env.local`.
- **ralphex**: runs Claude Code through the plan one task at a time, following TDD. Each iteration
  runs `pnpm verify`, a cleanup pass, and a commit, and records every deviation back into the plan.
  Per-task memos kept decisions and gotchas for review (untracked). ralphex then runs its own code
  review phases against `main`.
- **Vercel AI Gateway**: used by the app itself, for speech-to-text (beta) and LLM summaries with
  fallback models.
- **Documentation lookups**: Vercel and library docs (the sources are listed in the plan), plus
  the installed `.d.ts` files. Several packages are on majors newer than common training data
  (AI SDK v7, TypeScript 7, Vite 8, Vitest 5, react-router v8, zod v4).

## What I would do next

1. **Speaker diarization**: a diarizing STT provider (e.g. AssemblyAI or Deepgram) behind the
   existing `SttProvider` interface, with speaker labels in segments and owners matched to
   speakers.
2. **Background processing**: move the pipeline to a durable workflow or queue (Vercel Workflow or
   Queues) so recordings over one function run and chunked audio over 25 MiB become possible, and
   the browser no longer has to trigger processing.
3. **Auth and workspaces**: per-user meetings, sharing links, and access checks on blobs, with
   audio playback through signed reads.
4. **Abuse and cost controls**: a Vercel Firewall rate-limit rule on `/api/*`, cleanup of orphan
   blobs (uploaded but never created), and per-workspace spend caps.
5. **Streaming UX**: stream the summary as it is generated, and live captions while recording.
6. **Robustness gaps from the audit**: a fetch timeout in the API client, retryable handling for
   a connection that drops mid-body, an atomic check-and-insert for the rate limit, a purge of
   soft-deleted rows, and `drizzleRepo` tests in CI against a Neon branch.
7. **Product**: title editing, search across transcripts and action items, export to
   Markdown/Slack, and playback with click-to-seek from the transcript.
