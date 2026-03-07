<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# midi-strudel

A web tool for converting MIDI files into [Strudel](https://strudel.cc/) live-coding notation. Strudel is a browser-based live-coding environment that uses a cycle-based pattern language to make and perform music.

> **Early-stage / experimental.** Complex MIDI files may not convert perfectly. Treat the output as a starting point, not a finished score.

---

## Why this exists

Strudel thinks in repeating cycles and patterns. Most musicians think in linear piano rolls and MIDI files. These two worlds don't map cleanly onto each other — especially when you have polyphony, overlapping notes, and real-world timing imprecision.

This tool does the translation work: it reads a MIDI file, analyzes its structure, and outputs clean Strudel code you can drop straight into the Strudel REPL and start playing with.

---

## Key Features

- **Voice splitting** — Separates each track into a melody line (one note at a time) and a harmony line (chords and overlapping notes), matching Strudel's `melody+harmony` pattern style.
- **Musical key detection** — Uses the Krumhansl-Schmuckler algorithm to automatically detect the key and mode of your MIDI, with a confidence score. You can accept the detected key or set it manually.
- **Quantization** — Optional grid-snapping to clean up timing imprecision from live recordings. Configurable threshold and correction strength.
- **Multiple notation styles** — Output absolute pitch names (`note("c4 e4 g4")`) or scale-degree numbers (`n("0 2 4").scale("C4:major")`).
- **Drum track support** — Drum tracks are detected automatically and mapped using General MIDI note numbers. Unmapped drum notes are dropped rather than producing silence.
- **Cycle-based durations** — Durations are expressed as fractions of a cycle (`@0.25` = quarter note at default settings). The cycle unit can be set to a bar or a beat.
- **Per-track sound assignment** — Each track gets a `.sound()` call. You can set sounds manually in the sidebar, or let the tool auto-map based on the MIDI instrument family.

---

## How to Use

1. **Drop a MIDI file** onto the upload area (or click to browse).
2. **Configure settings** in the sidebar — BPM, key, notation style, quantization, and per-track sound assignments.
3. **Copy the generated code** from the editor on the right.
4. Click **"Open in Strudel"** to launch the Strudel REPL with your code pre-loaded, or paste it manually at [strudel.cc](https://strudel.cc/).

Settings are live — changing anything in the sidebar immediately updates the output.

---

## Local Development

**Prerequisites:** Node.js

```bash
npm install
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

---

## Understanding the Output

The generated code follows Strudel's mini-notation. A simple example:

```javascript
$PIANO_MELODY: `<
C4@0.5 E4@0.5 G4@0.5 C5@1
>`.as("note")
  .sound("triangle");
```

A few things to know:

- **`<...>`** wraps a sequence of cycles. Each item inside is one event in the timeline.
- **`@0.5`** sets the duration — `@0.5` is half a cycle (a half note at default 4/4 bar = cycle settings), `@0.25` is a quarter note, and so on.
- **`~`** is a rest.
- **`{C4, E4, G4}`** groups simultaneous notes (a chord). Inside brackets, each voice is padded with rests so they all span the same total duration.
- **`$TRACK_MELODY` / `$TRACK_HARMONY`** — each MIDI track becomes two Strudel patterns: one for single-note melody, one for chords and overlapping notes.
- **`.as("note")`** tells Strudel to interpret the values as note names. For relative/scale mode, this becomes `.as("n").scale("C4:major")`.

---

## Known Limitations

- **Complex polyphony** — The voice-splitting algorithm is straightforward: the first non-overlapping note becomes melody, everything else goes to harmony. Dense arrangements may need manual cleanup.
- **Drum mapping** — Only General MIDI standard drum notes are mapped. Non-standard drum notes are silently dropped.
- **Quantization is optional and imprecise** — Aggressive quantization can distort timing in ways that feel unmusical. Start conservative (high threshold, moderate strength).
- **Tempo changes** — MIDI files with multiple tempo changes may not convert accurately. The tool uses a single BPM value for the entire file.
- **MIDI format support** — Works best with standard Type 0 and Type 1 MIDI files.
