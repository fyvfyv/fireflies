import { describe, expect, it, vi } from "vitest";
import { createAudioAnalyser } from "./audioAnalyser";

function fakeAudioContext() {
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  const source = node();
  const analyser = { ...node(), fftSize: 2048, smoothingTimeConstant: 0 };
  const mute = { ...node(), gain: { value: 1 } };
  const context = {
    destination: {},
    createMediaStreamSource: vi.fn(() => source),
    createAnalyser: () => analyser,
    createGain: () => mute,
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
  vi.stubGlobal(
    "AudioContext",
    vi.fn(function AudioContext() {
      return context;
    }),
  );
  return { context, source, analyser, mute };
}

const stream = {} as MediaStream;

describe("createAudioAnalyser", () => {
  it("is null without Web Audio", () => {
    expect(createAudioAnalyser(stream)).toBeNull();
  });

  it("is null when the AudioContext can't be created", () => {
    vi.stubGlobal(
      "AudioContext",
      vi.fn(function AudioContext() {
        throw new DOMException("x", "NotSupportedError");
      }),
    );
    expect(createAudioAnalyser(stream)).toBeNull();
  });

  it("taps the stream through a muted graph that keeps running", () => {
    const audio = fakeAudioContext();

    const handle = createAudioAnalyser(stream);

    expect(handle?.analyser).toBe(audio.analyser);
    expect(audio.analyser).toMatchObject({
      fftSize: 256,
      smoothingTimeConstant: 0.8,
    });
    expect(audio.context.createMediaStreamSource).toHaveBeenCalledWith(stream);
    expect(audio.source.connect).toHaveBeenCalledWith(audio.analyser);
    expect(audio.analyser.connect).toHaveBeenCalledWith(audio.mute);
    expect(audio.mute.gain.value).toBe(0);
    expect(audio.mute.connect).toHaveBeenCalledWith(audio.context.destination);
    expect(audio.context.resume).toHaveBeenCalled();

    handle?.dispose();

    expect(audio.source.disconnect).toHaveBeenCalled();
    expect(audio.mute.disconnect).toHaveBeenCalled();
    expect(audio.context.close).toHaveBeenCalled();
  });

  it("closes the context and gives up when the stream can't be analysed", () => {
    const audio = fakeAudioContext();
    audio.context.createMediaStreamSource.mockImplementation(() => {
      throw new DOMException("x", "NotSupportedError");
    });

    expect(createAudioAnalyser(stream)).toBeNull();
    expect(audio.context.close).toHaveBeenCalled();
  });
});
