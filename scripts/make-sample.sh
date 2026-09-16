#!/usr/bin/env bash
# Renders docs/sample-script.md into public/samples/standup.webm (macOS only).
set -euo pipefail

cd "$(dirname "$0")/.."
script=docs/sample-script.md
out=public/samples/standup.webm
max_bytes=$((1024 * 1024))

for tool in say ffmpeg ffprobe; do
  command -v "$tool" >/dev/null || { echo "Missing $tool (macOS say + ffmpeg required)" >&2; exit 1; }
done
if ! ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libopus; then
  echo "ffmpeg was built without libopus" >&2
  exit 1
fi

voice_for() {
  case "$1" in
    Maya) echo Samantha ;;
    Daniel) echo Daniel ;;
    Priya) echo Karen ;;
    *) echo "No voice mapped for speaker: $1" >&2; return 1 ;;
  esac
}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
list="$tmp/turns.txt"
: >"$list"

turn_re='^\*\*([A-Za-z]+):\*\* (.+)$'
turns=0
while IFS= read -r line; do
  [[ $line =~ $turn_re ]] || continue
  voice=$(voice_for "${BASH_REMATCH[1]}")
  turns=$((turns + 1))
  part="$tmp/$(printf '%03d' "$turns").aiff"
  # Same PCM format for every voice so the concat demuxer can join them.
  say -v "$voice" --data-format=BEI16@22050 -o "$part" -- "${BASH_REMATCH[2]} [[slnc 400]]"
  echo "file '$part'" >>"$list"
done <"$script"

if ((turns == 0)); then
  echo "No speaker lines found in $script" >&2
  exit 1
fi

mkdir -p "$(dirname "$out")"
ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$list" \
  -ac 1 -c:a libopus -b:a 32k "$out"

bytes=$(wc -c <"$out" | tr -d ' ')
seconds=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out")
echo "Wrote $out: $turns turns, ${seconds%.*} s, $bytes bytes"
if ((bytes > max_bytes)); then
  echo "Sample exceeds 1 MiB; shorten the script" >&2
  exit 1
fi
