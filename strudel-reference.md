# Strudel Language Reference

A concise syntax and API reference for the Strudel live-coding music language (strudel.cc),
compiled for use in generating idiomatic Strudel output from MIDI data.

---

## Core Concepts

- Strudel is a JavaScript port of TidalCycles. Patterns are expressed in a mini-notation DSL inside template literal strings or quoted strings.
- Time is measured in **cycles**. Default speed is 0.5 cycles/second (controlled via `setcps` or `setcpm`).
- Everything is chainable via `.method()` syntax.
- The REPL evaluates on `Ctrl+Enter`, stops on `Ctrl+.`.

---

## Tempo Control

```js
setcpm(120 / 4)   // 120 BPM in 4/4: cycles per minute = BPM / beats-per-bar
setcps(0.5)       // cycles per second directly
```

---

## Multiple Patterns (REPL)

```js
$: note("c3 e3 g3").s("piano")        // active pattern block
_$: note("c2").s("bass")              // muted (prefixed with _)
```

Each `$:` block runs independently and simultaneously.

---

## Primary Sound Functions

| Function | Purpose | Example |
|----------|---------|---------|
| `note("...")` | Pitch by note name or MIDI number | `note("c4 e4 g4")` |
| `n("...")` | Generic index: scale degree or sample index | `n("0 2 4").scale("C:major")` |
| `s("...")` / `sound("...")` | Sound/sample selector | `s("piano")`, `s("bd")` |
| `freq("...")` | Frequency in Hz | `freq("440 550 660")` |

**Critical distinction:**
- `note("60")` → MIDI note 60 (C4), absolute pitch
- `n("0")` → index 0, meaning depends on context (scale degree with `.scale()`, or sample index with `.s()`)
- `note` and `n` are **not** synonyms; `s` and `sound` **are** synonyms

---

## Note Syntax

### Note Names
```
c  d  e  f  g  a  b       (natural notes)
c# d# f# g# a#            (sharps)
db eb gb ab bb             (flats)
```

### Octave
```
c3  e4  g#5  bb2          (letter + optional accidental + octave number)
```
Default octave when omitted is 3.

### MIDI Numbers (with `note()`)
```js
note("60 62 64 65 67")    // C4 D4 E4 F4 G4
note("60.5")              // microtonal: half semitone above C4
```

### Chords (simultaneous notes with comma inside brackets)
```js
note("[c3,e3,g3]")                        // C major chord
note("[c4,eb4,g4] [f3,a3,c4]")           // two chords in sequence
note("<[c3,e3,g3] [c4,e3,g3] [c4,e4,g3]>") // inversions cycling per cycle
```

---

## Mini-Notation Symbol Reference

### `~` — Rest / Silence
```
note("c4 ~ e4 ~")     // quarter rest between notes
```

### `*N` — Multiply / Speed Up (repeat N times in one step)
```
s("hh*4")             // hihat 4 times per cycle
s("bd sd")*2          // whole pattern twice as fast
```

### `/N` — Divide / Slow Down (spread over N cycles)
```
s("[bd sd]/2")        // plays over 2 cycles
note("c4 e4 g4")/3    // melody unfolds over 3 cycles
```

### `[ ]` — Sub-sequence / Grouping (nest into one step)
```
s("bd [sd sd] hh")    // two snares squeezed into one step
note("c4 [e4 g4] b4") // e4 and g4 share one step's time
```

### `< >` — Alternation (one value per successive cycle)
```
s("bd <sd cp rim>")   // cycle: sd on cycle 1, cp on 2, rim on 3...
note("<c4 e4 g4>")    // one note per cycle, rotating
```

### `{ }` — Polymetric sequences (independent pulse overlay)
```
s("{bd sd, hh hh hh}")        // bd/sd pattern over hh triplet pulse
```

### `,` — Stack / Parallel (simultaneous patterns)
```
s("bd*4, hh*8, ~ sd")         // all three play at the same time
note("[c3,e3,g3]")             // comma inside [] = chord
```

### `!N` — Replicate (repeat event N times)
```
note("c4!3 e4")       // c4 c4 c4 e4
note("c4!2 d4 e4!2")  // c4 c4 d4 e4 e4
```

### `@N` — Elongate (event lasts N times as long)
```
note("c4@2 e4")       // c4 lasts twice as long as e4
note("a4@3 b4")       // a4 takes 3/4 of the pattern time
```

### `?` — Probability (50% chance to play)
```
s("bd? sd hh?")       // bd and hh each have 50% chance
s("hh?0.2")           // 20% chance (custom probability)
```

### `(b,s,o)` — Euclidean Rhythm (b beats over s steps, optional offset o)
```
s("bd(3,8)")          // classic "pop clave": 3 beats over 8 steps
s("bd(3,8,2)")        // same, offset by 2
s("hh(7,16)")         // dense euclidean hihat pattern
```

### `:N` — Sample Selector (pick Nth sample from a set)
```
s("casio:0 casio:3 casio:7")   // different casio samples
s("hh:2")                       // third hihat variation
```

### `|` — Random Choice (pick one randomly each time)
```
s("bd|sd|hh")          // randomly picks one each cycle event
```

---

## Pattern Transformation Functions

### Time
```js
.slow(2)              // spread pattern over 2 cycles
.fast(2)              // cram pattern into half the time
```

### Reversal & Rotation
```js
.rev()                // reverse the pattern
.palindrome()         // alternates forward/backward each cycle
.iter(4)              // rotate starting subdivision each cycle
.iterBack(4)          // rotate backwards
```

### Conditional
```js
.every(4, rev())      // apply rev() every 4th cycle
.every(3, fast(2))    // double speed every 3rd cycle
.sometimes(rev)       // apply ~50% of the time
.rarely(fast(2))      // apply ~25% of the time
.often(x => x.add(7)) // apply ~75% of the time
```

### Spatial / Stereo
```js
.jux(rev)             // apply rev() to right channel only
.pan(0.5)             // stereo position 0 (left) to 1 (right)
```

### Stacking / Combining
```js
stack(
  note("c3 e3").s("bass"),
  s("bd*4"),
  note("g4 a4").s("piano")
)
// or chained:
note("c4").stack(s("bd"))
```

### Sequencing
```js
cat("c4", "e4", "g4")            // each takes one full cycle (= slowcat)
seq("c4", "e4", "g4")            // all crammed into one cycle (= fastcat/sequence)
```

### Inside/Outside
```js
"0 1 2 3".inside(4, rev)         // equivalent to .slow(4).rev().fast(4)
"0 1 2 3".outside(4, rev)        // equivalent to .fast(4).rev().slow(4)
```

---

## Arithmetic on Patterns

```js
note("c3 e3 g3".add("<0 5 7 0>"))   // transpose by interval each cycle
n("0 2 4".add(7))                    // shift scale degrees up by 7
n("0 1 2 3").mul(2)                  // multiply values
note("c4").add(12)                   // up one octave (12 semitones)
```

---

## Continuous Signals (for modulation)

```js
sine          // 0..1 sine wave (one cycle = one Strudel cycle)
cosine        // 0..1 cosine
tri           // 0..1 triangle
saw           // 0..1 sawtooth
square        // 0..1 square
rand          // 0..1 random
perlin        // 0..1 perlin noise

// bipolar variants (-1..1):
sine2  cosine2  tri2  saw2  square2  rand2

// Range scaling:
sine.range(200, 800)         // scale 0..1 to 200..800
sine.rangex(200, 4000)       // exponential scale (better for frequencies)
sine.slow(4)                 // slow signal to 4 cycles per period
sine.segment(16)             // discretize into 16 steps per cycle
```

**Usage example:**
```js
note("c3 e3 g3")
  .s("sawtooth")
  .lpf(sine.range(300, 2000).slow(8))
  .pan(rand)
```

---

## Scale / Tonal Functions

### `scale(rootNote:scaleType)`
```js
n("0 1 2 3 4 5 6 7").scale("C:major")
n("0 2 4 -1 -3").scale("D:minor")
n("0 1 2 3").scale("F#4:dorian")   // octave in root note
```
Scale types come from Tonal.js. Common: `major`, `minor`, `dorian`, `mixolydian`, `aeolian`, `lydian`, `phrygian`, `chromatic`, `pentatonic`, `bebop major`, `whole tone`, etc.

### `scaleTranspose(steps)`
```js
n("0 2 4").scale("C:major").scaleTranspose("<0 2 4>")  // diatonic transposition
```

### `transpose(semitones)`
```js
note("c3 e3 g3").transpose(5)      // up a perfect fourth
note("c3 e3 g3").transpose("<0 2 4 7>")  // pattern of transpositions
```

---

## Chord Voicings

### Named chords with `chord` + `voicing`
```js
chord("<C Am F G>*2").voicing()
chord("<C^7 A7b13 Dm7 G7>*2").dict('ireal').voicing()
```

### Chord symbols (from Tonal.js)
```
C   Cm  C7  Cmaj7  C^7  Cm7  Cadd9  Csus4  C6  Cdim  Caug  ...
```

### Anchor (voice leading reference note)
```js
chord("<C Am F G>").anchor("c5").voicing()       // top note near C5
chord("<C Am F G>").anchor("g4").mode("above").voicing()
```

### `mode` options for voicing
- `below` (default): top note ≤ anchor
- `above`: bottom note ≥ anchor
- `duck`: like below, but filters top note if it matches anchor

### `rootNotes(octave)`
```js
chord("<C Am F G>").rootNotes(2)   // root notes of each chord in octave 2
```

---

## Sound / Instrument Selection

### Built-in synth waveforms
```js
.s("sine")        // sine wave
.s("sawtooth")    // sawtooth wave
.s("square")      // square wave
.s("triangle")    // triangle wave
.s("white")       // white noise
.s("pink")        // pink noise
.s("brown")       // brown noise
```

### Sample banks
```js
s("bd sd hh cp")                          // default samples
s("bd*2").bank("RolandTR808")             // drum machine bank
s("RolandTR808_bd RolandTR808_sd")        // explicit full names
```

Common banks: `RolandTR808`, `RolandTR909`

Common drum sample abbreviations: `bd` (bass drum), `sd` (snare), `hh` (hihat), `oh` (open hihat), `cp` (clap), `rim`, `tom`, `cy` (cymbal)

### GM Soundfonts
```js
.s("gm_acoustic_grand_piano")
.s("gm_electric_guitar_clean")
.s("gm_violin")
.s("gm_flute")
// prefix: gm_ + GM instrument name with underscores
```

### Loading external samples
```js
samples('https://raw.githubusercontent.com/tidalcycles/Dirt-Samples/master/strudel.json')
samples({ bd: 'bd/BT0AADA.wav' }, 'github:tidalcycles/Dirt-Samples/master/')
```

---

## Audio Effects

### Volume & Dynamics
```js
.gain(0.8)          // amplitude 0..1 (or beyond)
.velocity(0.5)      // expression 0..1 (multiplied with gain)
```

### Filters
```js
.lpf(800)           // low-pass filter cutoff in Hz (0..20000)
.lpq(5)             // low-pass resonance / Q (0..50)
.hpf(200)           // high-pass filter cutoff
.hpq(3)             // high-pass resonance
.bpf(1000)          // band-pass filter center frequency
.bpq(2)             // band-pass resonance
// aliases:
.cutoff(800)        // same as lpf
.resonance(5)       // same as lpq
.hcutoff(200)       // same as hpf
.hresonance(3)      // same as hpq
```

### Filter Envelopes
```js
.lpenv(4)           // low-pass envelope depth (semitones)
.lpattack(0.1)      // lpa shorthand
.lpdecay(0.3)       // lpd shorthand
.lpsustain(0.5)     // lps shorthand
.lprelease(0.8)     // lpr shorthand
// same pattern for hpenv/bpenv with hp*/bp* prefixes
```

### Amplitude Envelope (ADSR)
```js
.attack(0.01)       // time to peak (seconds)
.decay(0.1)         // time to sustain level
.sustain(0.5)       // sustain level 0..1
.release(0.3)       // fade out time
// shorthands:
.ad(0.01, 0.2)      // attack + decay
.ar(0.01, 0.3)      // attack + release
```

### Reverb
```js
.room(0.5)          // reverb amount 0..1 (also: .reverb())
.size(4)            // room size (changes reverb IR, use sparingly)
```

### Delay
```js
.delay(0.5)         // delay send level 0..1
.delaytime(0.125)   // delay time in seconds (or as fraction of cycle)
.delayfeedback(0.6) // feedback amount 0..0.99 (>=1 will blow up)
// shorthand in mini-notation: .delay(".5:.125")  (level:time)
```

### Distortion & Bit Crush
```js
.distort(0.5)       // waveshaper distortion
.crush(4)           // bit depth reduction (e.g. 4 = 4-bit sound)
```

### FM Synthesis
```js
.s("sawtooth").fm(5)         // modulation index (brightness)
.fmattack(0.01)
.fmdecay(0.3)
.fmenv(4)                    // FM envelope depth
```

### Clip (sample length)
```js
.clip(0.5)          // truncate sample playback to 0.5 cycles
```

### Orbit (mixing bus)
```js
.orbit(1)           // assign to orbit/bus 1 (for shared delay/reverb)
.orbit(2)           // separate orbit with different effects
```

---

## MIDI Output

```js
note("c3 e3 g3").midi()                    // send to first MIDI device, channel 1
note("c3 e3 g3").midi('IAC Driver')        // specific device
note("c3 e3 g3").midi('IAC Driver', 2)     // device + channel

// Pitch bend (-1..1 range maps to full MIDI bend range)
note("c a f e").midibend(sine.slow(4).range(-0.4, 0.4)).midi()

// Aftertouch (0..1)
note("c a f e").miditouch(sine.slow(4).range(0, 1)).midi()

// CC messages
$: note("c a f e").midi()
$: ccv(sine.segment(16).slow(4)).ccn(74).midi()   // CC#74 (filter cutoff)
```

---

## Pattern Structuring Idioms

### Full beat in one expression
```js
setcpm(120 / 4)
stack(
  s("bd*4").gain(0.9),
  s("~ cp ~ cp").room(0.2),
  s("hh*16").gain(0.4).pan(sine.range(-0.5, 0.5)),
  note("c2 c2 eb2 c2").s("sawtooth").cutoff(800)
).swing(0.05)
```

### Scale-based melody
```js
n("0 2 4 [3 1] -1 0 2 4").scale("C4:minor").s("piano")
  .slow(2)
  .room(0.3)
```

### Alternating chord voicings
```js
chord("<C^7 A7 Dm7 G7>*2")
  .dict('ireal')
  .anchor("c5")
  .voicing()
  .s("piano")
  .room(0.4)
```

### Drum pattern with euclidean rhythms
```js
stack(
  s("bd(3,8)").gain(1.0),
  s("sd(2,8,4)").room(0.1),
  s("hh(7,16)").gain(0.4)
).bank("RolandTR909")
```

---

## The `@` Duration Modifier in Mini-Notation

Inside angle-bracket sequences `<...>`, each space-separated token is one cycle by default.
`@N` makes that token last N times as long as a unit token.

```
<c4 e4@2 g4>   // c4 lasts 1 unit, e4 lasts 2 units, g4 lasts 1 unit
               // cycle budget: 4 units total; c4=1/4, e4=2/4, g4=1/4
```

This is the basis for the custom duration notation used in this project:
- `note@0.5` = half cycle, `note@0.25` = quarter cycle, etc.
- `~@0.75` = three-quarter cycle of silence

---

## Coding Syntax Notes

- `//` is a line comment
- Patterns support template literals: `` note(`c4 e4 g4`) `` or quoted strings `note("c4 e4 g4")`
- Chain any number of effects: `note(...).s(...).gain(...).room(...).pan(...)`
- Pattern strings inside method args also accept mini-notation: `.gain("0.4 0.8 1 0.4")`
- Signals (`sine`, `rand`, etc.) work anywhere a number is expected

---

## Common Gotchas

1. `note("60")` = MIDI 60 = C4; `n("60")` = scale index 60 (very high)
2. `s("piano")` selects the piano sample; you still need `note()` or `n()` for pitch
3. `.delay()` values ≥ 1 in `.delayfeedback()` will create runaway feedback
4. `.size()` recalculates the reverb IR — avoid modulating it rapidly
5. Scale root without octave defaults to octave 3: `"C:major"` starts at C3
6. `<...>` alternates one value **per cycle**; `[...]` subdivides **within one step**
7. Comma inside `[c,e,g]` = chord (simultaneous); space inside `[c e g]` = sequence

---

## Sources

- [Mini Notation](https://strudel.cc/learn/mini-notation/)
- [Notes](https://strudel.cc/learn/notes/)
- [Tonal Functions](https://strudel.cc/learn/tonal/)
- [Audio Effects](https://strudel.cc/learn/effects/)
- [Chord Voicings](https://strudel.cc/understand/voicings/)
- [Signals](https://strudel.cc/learn/signals/)
- [Time Modifiers](https://strudel.cc/learn/time-modifiers/)
- [Sounds](https://strudel.cc/learn/sounds/)
- [MIDI, OSC & MQTT](https://strudel.cc/learn/input-output/)
- [Coding Syntax](https://strudel.cc/learn/code/)
- [Creating Patterns](https://strudel.cc/learn/factories/)
