// Full class names so Tailwind's scanner generates them.
const TOPIC_BACKGROUNDS = [
  "bg-topic-1",
  "bg-topic-2",
  "bg-topic-3",
  "bg-topic-4",
  "bg-topic-5",
  "bg-topic-6",
] as const;

export function topicBackground(index: number): string {
  return (
    TOPIC_BACKGROUNDS[index % TOPIC_BACKGROUNDS.length] ?? TOPIC_BACKGROUNDS[0]
  );
}
