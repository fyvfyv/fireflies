# Recap: write-up

A simplified Fireflies.ai clone, built as an engineering take-home. Setup and the API are in the
[README](../README.md). The live app is https://fireflies-five.vercel.app.

## What I built

- **Record:** records from the browser microphone with MediaRecorder at 32 kbps, capped at 60
  minutes. Without a microphone, you can upload a file or run a bundled 2-minute sample. All three
  go through the same pipeline.
- **Transcribe:** real speech-to-text with OpenAI `whisper-1` through the Vercel AI Gateway, or
  Groq Whisper as a fallback. Segment timestamps are kept.
- **Summarize:** `claude-haiku-4.5` through the AI Gateway writes the title, overview, keywords,
  topic notes, decisions and action items with owners and due dates. Every note carries a
  timestamp, and the output is validated against a shared zod schema.
- **UI:** a Fireflies-style meeting page with timestamped notes, copy as rich text, a searchable
  transcript that follows playback, and a player whose scrubber shows the meeting's topics. The
  home page has a recorder with a live waveform and a meeting list.
- **Backend:** a Hono API on one Vercel Function, one Postgres table (Neon), and a private Vercel
  Blob store.

## How I built it

1. **Plan.** Claude Code researched the platform (AI Gateway speech-to-text, Blob, Neon). A panel
   of agents proposed three architectures, and judges picked one. An adversarial review then
   checked the plan against the installed packages before any code was written.
2. **MVP.** ralphex ran the plan task by task with TDD. Every task ended with lint, typecheck and
   tests passing, followed by automated code review.
3. **Redesign.** A design spec split the work into four units with separate files: backend, design
   system, meeting page and home page. Each unit was built in its own git worktree, reviewed and
   fixed by separate agents, and then merged. A critique of real screenshots drove one more polish
   pass.
4. **Cleanup.** A final pass removed AI-generated noise, simplified the code and cut redundant
   tests from 1115 to 650 while keeping the important behaviors covered.

## Key decisions

- **Synchronous, resumable pipeline, no queue.** One request runs the missing steps and saves after
  each one. An atomic lease (a single conditional `UPDATE`) stops two runs at once. A killed run
  shows as stalled, and Retry takes it over. Retry resumes from the saved state, so a failed
  summary never re-pays for speech-to-text. The trade-off is that one recording must fit in one
  300 s function run.
- **Upload first, then create.** The browser uploads straight to private Blob storage, so audio
  never passes through a function.
- **Timestamps you can trust.** The model sees `[Ns] text` lines and cites them. The server snaps
  every cited moment to a real segment. Playback uses one-hour signed URLs for the private blob.
- **One table.** A meeting row holds the transcript, summary, error state and lease. One read
  serves the meeting page.
- **Speech-to-text provider chosen by env, not a runtime chain.** AI Gateway speech-to-text is a
  per-team beta, so Groq sits behind the same interface. The LLM falls back to another model inside
  the gateway.
- **Rate limits from database counts:** 10 creates per hour per client and 30 in total. No extra
  table or Redis.
- **Testable by design.** The server takes its dependencies through `createApp(deps)`, so
  everything except thin SDK adapters is tested against in-memory fakes.

## Failure handling

- **Microphone denied or unsupported:** the recorder explains why and offers the sample or an
  upload instead.
- **Leaving with an unsaved recording:** the browser or the app asks first.
- **Wrong type, empty or oversized files:** rejected in the browser and again on the server.
- **Double process requests:** the loser gets a 409, and the page keeps polling.
- **Function killed mid-run:** the meeting shows as interrupted, and Retry takes over. After 5
  failed attempts, it offers "Delete and re-upload".
- **Summary or provider errors:** one repair retry for malformed model output. Stored messages are
  generic, and provider details go to logs only.
- **Silent or very short recordings:** marked done with an "Empty recording" placeholder, without
  an LLM call.
- **Network errors while polling:** the last data stays on screen, with "Try again".

## Verification

- **Automated:** `pnpm verify` runs Biome, both typechecks and 650 Vitest tests. CI runs the same
  checks.
- **Real services:** the local API was run against the production Neon database, Blob store and AI
  Gateway. The sample reached done with timestamped topic notes. Signed audio URLs served byte
  ranges. Older summaries were upgraded to topic notes.
- **Browser:** both pages were checked at desktop and phone widths, in light and dark themes, and
  in the processing, recording, search and playback states.
- **Smoke run:** `pnpm smoke:ai` on the bundled sample, trimmed:

```json
{
  "sttProvider": "gateway:openai/whisper-1",
  "transcribeMs": 6410,
  "summarizeMs": 8987,
  "model": "anthropic/claude-haiku-4.5",
  "transcript": { "language": "en", "durationSeconds": 105.6, "segments": 17 },
  "title": "ReCAP project weekly stand-up",
  "notes": [
    "8.5s Upload flow completion and size limit decision (4 points)",
    "41s Retry logic and transcript reuse (2 points)",
    "59s Safari and Chrome recorder testing (3 points)",
    "71s Demo rescheduling (3 points)"
  ],
  "actionItems": [
    { "task": "Write and complete tests for the retry logic", "owner": "Daniel", "due": "Friday, September 18th", "startSecond": 51 },
    { "task": "Rewrite the onboarding copy to improve homepage clarity", "owner": "Priya", "due": null, "startSecond": 66 },
    { "task": "Send updated demo invite to stakeholders", "owner": null, "due": "today", "startSecond": 85 }
  ]
}
```

## Time spent

Agent time is wall-clock time while agents ran. It includes waiting, and it is not effort.
Hands-on time is my own active work: answering design questions, reviewing, setting up Vercel
and testing.

| Phase | Agent time | Hands-on |
|---|---|---|
| Research, architecture and plan | 2.5 h | 0.75 h |
| MVP implementation and review | 3.3 h | 0.25 h |
| Vercel, Neon, Blob and AI Gateway setup, and first deploy | — | 1.0 h |
| Redesign | 6.2 h | 0.5 h |
| Cleanup and docs | 2.0 h | 0.5 h |
| **Total** | **~14 h** | **~3 h** |

## AI tooling

- **Claude Code:** research, the architecture panel, planning, the redesign and the cleanup,
  orchestrating parallel agents with review steps.
- **ralphex:** runs Claude Code through a plan one task at a time, with TDD and code review.
- **Vercel AI Gateway:** used by the app itself for speech-to-text and summaries.

## Next steps

1. **Speaker diarization:** a diarizing speech-to-text provider behind the existing interface,
   with owners matched to speakers.
2. **Background processing:** a durable workflow or queue, for recordings longer than one function
   run and for chunked audio.
3. **Accounts and workspaces:** per-user meetings, sharing, and access checks before signing audio
   URLs.
4. **Abuse and cost controls:** a firewall rate limit and cleanup of orphaned uploads.
5. **Product:** title editing, search across meetings, server-side action items, and "Ask about
   this meeting" with cited timestamps.
