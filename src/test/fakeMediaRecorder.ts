// Mimics the MediaRecorder surface useRecorder relies on: stop() flushes one
// dataavailable chunk, then fires stop, like browsers do.
export class FakeMediaRecorder extends EventTarget {
  static isTypeSupported = (type: string): boolean =>
    type === "audio/webm;codecs=opus";
  static latest: FakeMediaRecorder | undefined;

  state: "inactive" | "recording" = "inactive";

  constructor(
    public stream: MediaStream,
    public options: { mimeType: string; audioBitsPerSecond: number },
  ) {
    super();
    FakeMediaRecorder.latest = this;
  }

  start(_timeslice?: number) {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.dispatchEvent(
      Object.assign(new Event("dataavailable"), {
        data: new Blob(["x"], { type: this.options.mimeType }),
      }),
    );
    this.dispatchEvent(new Event("stop"));
  }
}
