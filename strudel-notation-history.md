# Strudel Notation

## Bracket Notation Fundamentals?

### What is this?

its just a personal custom framework to use with Strudel's mininotation of representing sequential complex musical timing, especially when notes overlap or have intricate rhythmic relationships. It allows you to specify exactly when notes start, how long they last, and how they relate to each other in time.

(not exactly what strudel is built for but i wanted to think it out with Claude's help)



### Basic Building Blocks

#### Single Notes

```
C4        // Whole bar duration (default)
C4@0.5    // Half bar duration
C4@0.25   // Quarter bar duration
C4@2      // Two bars duration
```

#### Rests (Silence)

```
~         // Whole bar of silence (default)
~@0.5     // Half bar of silence
~@0.25    // Quarter bar of silence
~@2       // Two bars of silence
```

#### Sequential Notes

```
C4 D4 E4              // Three notes, each lasting a whole bar
C4@0.5 D4@0.25 E4@0.25    // Half bar C, then quarter bar D and E
C4@0.25 ~@0.5 E4@0.25     // C4 for quarter bar, rest, then E4
```

## Bracket Notation for Overlapping Notes

When notes overlap or have complex timing relationships, we use brackets `{...}` to group them together.

### Simple Chord (All Notes Start Together)

```
{C4, E4, G4}          // C major chord, all notes for whole bar
{C4@0.5, E4@0.5, G4@0.5}@0.5   // Same chord, but only half bar
```

### Bracket Anatomy: The Padding System

Inside brackets, each note must be "padded" with rests so all entries span the same total time.

**The Rule**: Every comma-separated entry must add up to the bracket's total duration.

#### Example: Offset Chord

```
Musical timing: C4 (0-0.5), E4 (0-0.5), G4 (0.25-0.75)

Bracket notation:
{C4@0.5 ~@0.25, E4@0.5 ~@0.25, ~@0.25 G4@0.5}@0.75
```

**Breaking it down:**

- `C4@0.5 ~@0.25` = C4 for 0.5, then rest for 0.25 = **0.75 total**
- `E4@0.5 ~@0.25` = E4 for 0.5, then rest for 0.25 = **0.75 total**
- `~@0.25 G4@0.5` = Rest for 0.25, then G4 for 0.5 = **0.75 total**
- `@0.75` = The whole bracket lasts 0.75 bars

### Mixed Sequential and Overlapping

```
C4@0.5 {D4@0.25 ~@0.25, ~@0.25 E4@0.25}@0.5 F4@0.5

Breakdown:
- C4@0.5: C4 for half bar
- Bracket: D4 and E4 overlapping in next half bar
- F4@0.5: F4 for final half bar
```

## Practical Pattern Examples

### Twinkle Twinkle Little Star

```
0@0.5 0@0.5 4@0.5 4@0.5 5@0.5 5@0.5 4@1 3@0.5 3@0.5 2@0.5 2@0.5 1@0.5 1@0.5 0@1

Translation:
C-C-G-G-A-A-G(long)-F-F-E-E-D-D-C(long)
Each short note is half a bar, long notes are whole bar
```
Inside brackets, each note must be "padded" with rests so all entries span the same total time.
_Every comma-separated entry must add up to the bracket's total duration._

### Polyphonic

All notes in a single string:

```ts
`C4@0.5 {C4@1 ~@0.5, ~@0.5 E4@1, ~@1 G4@0.25 ~@0.25}@1.5 {A4, G#3, B2}@1 F4@0.5 {C5, E5, G5}@1`.as(
  "note"
);
```

### Melody+Harmony (Default)

Melody and harmony separation of a single array/track. Only a single note played at a time in a melody string. Overlapping/chords are separated into separate strings:

```ts
$PIANO_MELODY: `<
C4@0.5 ~@1.5 F4@0.5
>`.as("note");

$PIANO_HARMONY: `<
~@0.5 {C4@1 ~@0.5, ~@0.5 E4@1, ~@1 G4@0.25 ~@0.25}@1.5 {A4, G#3, B2}@1 ~@0.5 {C5, E5, G5}@1
>`.as("note");

///.... etc

//$FLUTE_MELODY:...
//etc
```

### monophonic

Max simultaneous notes is 3 in our example so ⇒ three streams

```ts
$PIANO_1: `<
C4@0.5 C4@1 G4@0.25 ~@0.25 A4 F4@0.5 C5
>`.as("note")
$PIANO_2: `<
~ E4 G#3 ~@0.5 E5
>`.as("note")
$PIANO_3: `<
~@2 B2 ~@0.5 G5
>`.as("note")
`
```

## Formatting

### notes per line (max 12, default 8)

2 per line

```ts
//2 per line
`<
C4@0.5
{C4@1 ~@0.5, ~@0.5 E4@1, ~@1 G4@0.25 ~@0.25}@1.5
{A4, G#3, B2}@1
F4@0.5 G6
E6
{C5, E5, G5}@1
>`
  .as("note")
  .sound(
    "sine"
  ) //4 per line //{...} take their own line
`<
C4 E4@0.5 G4 C5@2
E3@0.25 G#3
>`
  .as("note")
  .sound("sine");
```

### measures per line (max 4, default 1)

_This option only exists because we have BPM and time signature._

Measures are counted by adding up note durations until they equal one full measure based on the time signature and the cycle configuration.

**Important**: If a note starts in one measure and ends in another (crosses measure boundaries), those measures will be placed on the same line to maintain musical coherence.

#### Examples with 4/4 Time Signature - @1 = Bar (Default)

With @1 = bar configuration, one measure = @1 (one full bar = 4 beats).

**2 Measures Per Line:**

```ts
// Measure 1: C4@0.5 + complex bracket@1.5 = @2 (2 measures)
// Measure 2: chord@1 + F4@0.5 + chord@1 = @2.5 (2.5 measures, crosses boundary)
`<
C4@0.5 {C4@1 ~@0.5, ~@0.5 E4@1, ~@1 G4@0.25 ~@0.25}@1.5 {A4, G#3, B2}@1 F4@0.5 {C5, E5, G5}@1
>`
  .as("note")
  .sound("sine");
```

**1 Measure Per Line(Default):**

```ts
// Each line aims for one measure, but boundary-crossing keeps related content together
`<
C4@0.5 {C4@1 ~@0.5, ~@0.5 E4@1, ~@1 G4@0.25 ~@0.25}@1.5
{A4, G#3, B2}@1
F4@0.5 {C5, E5, G5}@1
>`
  .as("note")
  .sound("sine");
```

#### Examples with 4/4 Time Signature - @1 = Beat (Alternative)

With @1 = beat configuration, one measure = @4 (four beats).

**2 Measures Per Line:**

```ts
// Converting to beat-based notation (@1 = beat, so multiply by 4)
// Measure 1: C4@2 + complex bracket@6 = @8 (2 measures)
// Measure 2: chord@4 + F4@2 + chord@4 = @10 (2.5 measures, crosses boundary)
`<
C4@2 {C4@4 ~@2, ~@2 E4@4, ~@4 G4@1 ~@1}@6 {A4, G#3, B2}@4 F4@2 {C5, E5, G5}@4
>`
  .as("note")
  .sound("sine");
```

**1 Measure Per Line(Default):**

```ts
// Each line aims for @4 (one measure), but boundary-crossing keeps related content together
`<
C4@2 {C4@4 ~@2, ~@2 E4@4, ~@4 G4@1 ~@1}@6
{A4, G#3, B2}@4
F4@2 {C5, E5, G5}@4
>`
  .as("note")
  .sound("sine");
```

### variable formatting

basically like measure.

## Velocity (default disabled)

can be boolean toggles to include this or not.

With the `.as()` syntax, velocity can be stacked using colon notation, allowing you to specify note and velocity values in corresponding positions:

```ts
// Stacked note:velocity syntax
`<
C4:0.8 E4@0.5:0.5 G4:1.0 C5@2:0.3
>`
  .as("note:velocity")
  .sound(
    "sine"
  ) // For relative notation
`<
0:0.8 2@0.5:0.5 4:1.0 7@2:0.3
>`
  .as("n:velocity")
  .scale("C4:chromatic")
  .sound(
    "sine"
  ) // Complex example with chords
`<
~@2 {E6@0.0833:0.39, B4@0.0833:0.39, E4@0.0833:0.39, E2@0.0833:0.39}@0.0833 D6@0.0833:0.39 C6@0.0833:0.39
>`
  .as("note:velocity")
  .sound("sine");
```

You can even stack more properties like clip:

```ts
`<
C4:0.8:2 E1@2:0.2:0.1 B5@0.25:0.5:1.2
>`.as("note:velocity:clip");
```

## Subdivision based syntax (instead of duration)

lets limit this to only work with “melody+harmony” split of melody + harmomic lines.

### Overview

Instead of specifying exact durations with `@x`, subdivision syntax uses brackets `[...]` to automatically divide cycles into equal parts, drastically reducing the need for duration annotations.

### Basic Principles

```ts
// Every space-separated element inside <...> is one cycle
`<...>`.as("note");
// That's why we don't need @1 since C4 D5 C5 would each be @1
// so <[..] [..] [..]>, each [...] is 1 cycle = @1

// Use [] for subdivisions within a cycle
// Use _ underscore for sustain of the previous note
```

### Subdivision Examples

```ts
<
[C4]           //  C4 plays for full duration of its bracket (@1)
[C4]@2           // C4 plays for full duration of its bracket (@2)
[C4 ~]         //  C4 ends at @0.5, rest for @0.5
[C4 _]         //  C4 sustained through full duration (@1)
[C4 D5]@2        //  2 notes in a 2cycle long bracket, so each plays for a cycle's length (@1 each)
[C4 D5 D4]     //  3 notes, each plays for 1/3 cycle (@0.333 each)
[C4 D5 F4 G4]  //  4 notes, quarter notes (@0.25 each)
[C4 [E4 G5]]   // subsubdivision; C4 is half note (@0.5), E4 and G5 are quarter notes (@0.25 each)
>
```

to really simplify this. we collect stuff that adds up to a whole measure (unless the last one)

### Measure Accumulation Strategy

To represent fractional durations that don't align with cycle boundaries, we accumulate notes until the total duration equals a whole number of cycles.
so we need to “accumulate notes” until they […]@x is a whole number
For example, to represent `C4@0.5` (half a cycle), we combine it with the following group that's `@1.5`:

```ts
// Original duration-based notation:
// C4@0.5 {C4@1 ~@0.5, ~@0.5 E4@1, ~@1 G4@0.25 ~@0.25}@1.5

// Becomes subdivision-based:
[C4 {[C4 _ ~], [~ E4 _], [~ ~ [G4 ~]]} _ _]@2
```

**Breaking down the main bracket `[...]@2`:**

- `C4` - takes 1/4 of @2 = @0.5 ✓
- `{[C4 _ ~], [~ E4 _], [~ ~ [G4 ~]]}` - complex overlapping section takes 3/4 of @2 = @1.5 ✓
- `_` - sustain (1/4 of @2)
- `_` - sustain (1/4 of @2)

### Complete Example Transformation

**Original duration-based notation:**

```ts
C4@0.5 {C4@1 ~@0.5, ~@0.5 E4@1, ~@1 G4@0.25 ~@0.25}@1.5 {A4, G#3, B2}@1 F4@0.5 {C5, E5, G5}@1
```

**Subdivision-based equivalent:**

```ts
$: `<
[C4 {[C4 _ ~], [~ E4 _], [~ ~ [G4 ~]]} _ _]@2
[{A4, G#3, B2}]
[F4 {C5, E5, G5} _]@1.5
>`.as("note")...
```

since we are limiting to melody/harmony split.
this is how this mode will actually look

```ts
// Melody line (single notes only)
$PIANO_MELODY: `<
[C4 ~ ~ ~]@2
[~]
[F4 ~]@1.5
>`.as("note")...

// Harmony line (chords and overlapping notes)
$PIANO_HARMONY: `<
[~ {[C4 _ ~], [~ E4 _], [~ ~ [G4 ~]]} _ _]@2
[{A4, G#3, B2}]
[~ {C5, E5, G5} _]@1.5
>`.as("note")...
```

### Dramatic Simplification Example

**Before (duration-based):**

```ts
E6@0.0833 D6@0.0833 C6@0.0833 D6@0.0833 C6@0.0833 B5@0.0833 C6@0.0833 B5@0.0833 A5@0.0833 B5@0.0833 A5@0.0833 G5@0.0833
// 12 notes, each 1/12 = 0.0833
```

**After (subdivision-based):**

```ts
$MELODY: `< [E6 D6 C6 D6 C6 B5 C6 B5 A5 B5 A5 G5] >`.as("note")... // 12 equal subdivisions automatically calculated
```

This approach drastically reduces the total number of `@x` duration annotations needed, making complex rhythmic patterns much more readable and maintainable.

———
# Prompt
## Implement a UI to demonstrate this service/class in action.

Black and white, high contrast piano like ui and classy gold for accents.

It will be stateful. Changing settings changes the resulting notation.

There will be a sidebar/header (toggle able)
And text editor showing the results.
If sidebar, editor will be on right of it. (side bar is thin)
If header, then editor below it ofc.

Metadata(initially set by tracks stuff or defaults) and config(init with defaults) are configurable after initial init of track.

These settings, sliders, toggles, dropdowns wtv will be in the sidebar/header
Help text explaining the options.

The page header will have an upload midi file button(infact whole page can be dragged into. You can create a seperste utility to convert midi file into json using tone.js/midi and converting the resulting json to match the interact this service accepts.

The header will have an open in strudel.cc

And you can convert the resulting notation into base 64

``
