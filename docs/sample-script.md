# Sample recording: weekly standup

Source for `public/samples/standup.webm`, the recording behind **Try a sample**. `pnpm sample:make`
renders every `**Speaker:** line` below with macOS `say` (one voice per speaker, mapped in
`scripts/make-sample.sh`) and encodes the result as Opus/WebM. Read aloud it runs about two minutes.
To record it by hand instead, read it through the app and save the file via **Download recording**.

Cast: Maya (team lead, voice Samantha), Daniel (backend, voice Daniel), Priya (frontend, voice Karen).

Expected summary, for checking a real run:

- Decisions: keep the 25 MB upload cap with no chunking for this release; move the stakeholder demo
  from Thursday to next Monday.
- Action items: Daniel writes the retry tests (due Friday, September 18); Priya rewrites the
  onboarding copy on the home page; Maya sends the updated demo invite to the stakeholders.

## Script

**Maya:** Good morning, everyone. This is our weekly standup for the Recap project. Let's keep it short. Daniel, do you want to start?

**Daniel:** Sure. Last week I finished the upload flow. Recordings now go straight to blob storage, and the server only receives the file path. The open question is the size limit. Whisper rejects anything over twenty-five megabytes, so we either cap uploads or split the audio into chunks.

**Maya:** Chunking sounds like a week of work. Let's decide now. We keep the twenty-five megabyte cap and skip chunking for this release. Is everyone okay with that?

**Priya:** Fine by me. An hour of audio at our bitrate is about fourteen megabytes anyway.

**Daniel:** Agreed. Then my next step is the retry path. If the summary fails, a retry should reuse the transcript instead of paying for speech to text again. I'll write the tests for that and have them done by Friday, September eighteenth.

**Maya:** Great, thanks. Priya, you're up.

**Priya:** I tested the recorder in Safari and in Chrome. Both work, but the home page is confusing for people without a microphone. I'll rewrite the onboarding copy so the sample and the upload button are easier to find.

**Maya:** Good catch. One more thing, the stakeholder demo. Thursday is too tight with the retry work still open, so we've decided to move the demo to next Monday.

**Daniel:** That works much better for me.

**Priya:** Same here.

**Maya:** Then I'll send the updated demo invite to the stakeholders today. To recap. Daniel owns the retry tests, due Friday. Priya owns the onboarding copy. And I'll handle the invite. Is anything blocking anyone?

**Daniel:** Nothing from me.

**Priya:** No blockers.

**Maya:** Perfect. Thanks, everyone. See you tomorrow.
