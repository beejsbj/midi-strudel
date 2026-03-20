# midi-strudel

i got too obsessed with Epic: The Musical and wanted to see the melodies as strudel code.

that was honestly the whole spark for this. i was on a high from Epic, discovered [strudel](https://strudel.cc/), and really wanted to look at those melodies in this code-shaped notation instead of just a piano roll.

then vibe coding made it very easy to keep poking at it. it stopped being a one-off experiment and slowly became a fun little tool for turning midi into strudel-ish code so i could study melodies, inspect patterns, and hear them back in a different way.

along the way it also became a useful excuse to play with gemini, claude, and gpt as ai dev tools and see what kind of workflow they were actually good for.

## what strudel is

strudel is a browser-based live coding environment for music. instead of a piano roll, you describe repeating patterns and cycles in code.

- main site: [strudel.cc](https://strudel.cc/)
- getting started: [strudel docs](https://strudel.cc/learn/getting-started/)

## what this project is doing

this project takes a midi file, parses the tracks, and turns them into strudel-ish code you can read, tweak, and send into the repl without starting from scratch.

the notation idea here came out of me trying to figure out how to represent melody, harmony, overlap, rests, and timing in a way that felt usable for this converter.

so this app is not trying to be a perfect or official representation of strudel syntax theory. it is more like: i had a notation idea, kept iterating on it, and built a tool around that idea so i could feed midi in and get something musical and readable back out.

very briefly, some of the notation ideas in here work like this:

- `C4@0.5` means play `C4` for half a cycle
- `~` means rest
- `{C4, E4, G4}` is being used for overlapping / stacked material
- relative mode turns notes into scale degrees like `0 2 4` instead of raw note names

if you want the deeper background:

- [strudel-notation-history.md](strudel-notation-history.md) is the history file where i worked through the notation ideas
- [strudel-notation-project-prompt.md](strudel-notation-project-prompt.md) is the extracted project prompt/spec that came out of that process

## what you can do with it

- drop in a `.mid` or `.midi` file
- detect tempo, time signature, drum tracks, and a likely key
- convert tracks into melody / harmony strudel output
- switch between absolute note names and relative scale degrees
- adjust playback, quantization, formatting, visuals, and per-track mapping
- preview the result in the embedded strudel player
- open the generated code in strudel and keep messing with it there

## local development

```bash
npm install
npm run dev
```

the dev server runs on [http://localhost:3000](http://localhost:3000).

if you want to run the checks:

```bash
npm test
npm run build
npm run typecheck
npm run lint
```
