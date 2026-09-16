import { describe, expect, it, vi } from "vitest";
import { createAudioAnalyser } from "./audioAnalyser";

function fakeAudioContext() {
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  const source = node();
  const analyser = {
    ...node(),
    fftSize: 2048,
    smoothingTimeConstant: 0,
    getFloatTimeDomainData: vi.fn(),
  };
  const mute = { ...node(), gain: { value: 1 } };
  const context = {
    destination: { kind: "destination" },
    createMediaStreamSource: vi.fn(() => source),
    createAnalyser: vi.fn(() => analyser),
    createGain: vi.fn(() => mute),
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
  const Ctor = vi.fn(function AudioContext() {
    return context;
  });
  vi.stubGlobal("AudioContext", Ctor);
  return { Ctor, context, source, analyser, mute };
}

const stream = {} as MediaStream;

describe("createAudioAnalyser", () => {
  it("is null without Web Audio", () => {
    expect(createAudioAnalyser(stream)).toBeNull();
  });

  it("analyses the stream with a small, smoothed FFT", () => {
    const audio = fakeAudioContext();

    const handle = createAudioAnalyser(stream);

    expect(audio.context.createMediaStreamSource).toHaveBeenCalledWith(stream);
    expect(audio.source.connect).toHaveBeenCalledWith(audio.analyser);
    expect(handle?.analyser).toBe(audio.analyser);
    expect(audio.analyser.fftSize).toBe(256);
    expect(audio.analyser.smoothingTimeConstant).toBe(0.8);
  });

  it("keeps the graph running without playing the mic back", () => {
    const audio = fakeAudioContext();

    createAudioAnalyser(stream);

    expect(audio.analyser.connect).toHaveBeenCalledWith(audio.mute);
    expect(audio.mute.gain.value).toBe(0);
    expect(audio.mute.connect).toHaveBeenCalledWith(audio.context.destination);
    expect(audio.context.resume).toHaveBeenCalled();
  });

  it("disconnects and closes the context on dispose", () => {
    const audio = fakeAudioContext();
    const handle = createAudioAnalyser(stream);

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
