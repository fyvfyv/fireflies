// Full class names so Tailwind's scanner generates them.
const TOPIC_BACKGROUNDS = [
  "bg-topic-1",
  "bg-topic-2",
  "bg-topic-3",
  "bg-topic-4",
  "bg-topic-5",
  "bg-topic-6",
] as const;

/**
 * Topic color for the note section at `index`, shared by the section swatch
 * and its span on the topic tape so the two read as one thing.
 */
export function topicBackground(index: number): string {
  const slot = ((index % 6) + 6) % 6;
  return TOPIC_BACKGROUNDS[slot] ?? TOPIC_BACKGROUNDS[0];
}
