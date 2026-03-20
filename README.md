# midi-strudel

browser-based midi-to-strudel converter for turning `.mid` files into readable, tweakable strudel-ish code.

live app: [midi-strudel.vercel.app](https://midi-strudel.vercel.app)

## why this exists

i wanted to inspect melodies in strudel's code-shaped notation instead of a piano roll.

that curiosity turned into a small tool that reads midi, splits out melody and harmony-ish material, and gives me something i can study, tweak, and send into the strudel repl without starting from scratch.

along the way it also became a useful excuse to play with gemini, claude, and gpt as ai dev tools and see what kind of workflow they were actually good for.

## what strudel is

strudel is a browser-based live coding environment for music. instead of a piano roll, you describe repeating patterns and cycles in code.

- main site: [strudel.cc](https://strudel.cc/)
- getting started: [strudel docs](https://strudel.cc/learn/getting-started/)

## what this project does

this project takes a midi file, parses the tracks, and turns them into strudel-ish code you can read, tweak, and send into the repl.

the notation idea here came out of me trying to figure out how to represent melody, harmony, overlap, rests, and timing in a way that felt usable for this converter.

so this app is not trying to be a perfect or official representation of strudel syntax theory. it is more like: i had a notation idea, kept iterating on it, and built a tool around that idea so i could feed midi in and get something musical and readable back out.

very briefly, some of the notation ideas in here work like this:

- `C4@0.5` means play `C4` for half a cycle
- `~` means rest
- `{C4, E4, G4}` is being used for overlapping or stacked material
- relative mode turns notes into scale degrees like `0 2 4` instead of raw note names

if you want the deeper background:

- [strudel-notation-history.md](strudel-notation-history.md) is the history file where i worked through the notation ideas
- [strudel-notation-project-prompt.md](strudel-notation-project-prompt.md) is the extracted project prompt/spec that came out of that process

## what you can do with it

- drop in a `.mid` or `.midi` file
- detect tempo, time signature, drum tracks, and a likely key
- convert tracks into melody and harmony strudel output
- switch between absolute note names and relative scale degrees
- adjust playback, quantization, formatting, visuals, and per-track mapping
- preview the result in the embedded strudel player
- open the generated code in strudel and keep messing with it there
- try the bundled original example MIDIs if you want a quick demo input

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

## license

this repository is released under the [MIT License](LICENSE).

the code, docs, and bundled example MIDI files are included under that license. if you load third-party MIDI files into the app, their copyright and licensing stay with their respective owners.
