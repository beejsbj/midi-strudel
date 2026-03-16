# Strudel Notation Project Prompt

## Overview

This specification defines a `StrudelNotation` class/service that converts arrays of musical notes(tracks, patterns, midi files) into Strudel's bracket notation format. The service supports various output styles and configurations for different musical use cases.

## Core Interface

### Input Note Interface

```ts
interface Note {
  note: 'c4' | 'D4'... //C4 or D2 or G#7
  noteOn: number //pressTime
  noteOff: number //releaseTime
  velocity?: number // 0-1
  //... wtv else depending on source
}
```

### Notes Metadata (tracks, patterns, melodies, midi files)

```ts
interface Track {
  note: Note[];

  //metadata
  key?: string; // default: 'C4'
  mode?: string; // default: 'chromatic'
  bpm?: number; // default: 120
  timesig?: string; // default: '4/4'
  sound?: "sine" | "triangle" | "sawtooth" | "gm_piano" | string; // default: 'sine' (instrument, synth, sample etc.). More will be added later
}
```

> _Note: These properties are configurable after initial initialization._

if not key/mode is provided we will manually analyze and calculate it (with a confidence score).
user can choose between default and calculated

```ts
interface StrudelConfig {
// Output style
outputStyle: 'polyphonic' | 'melody+harmony' | 'monophonic';

keyModeSource: 'default' | 'calculated' //default is either what was initiated

// Notation type
notationType: 'absolute' | 'relative'; // note() vs n().scale()

// Duration system
cycleUnit: 'bar' | 'beat'; // @1 = whole bar vs @1 = one beat

// Formatting
formatPerLineBy: 'note' | 'measure'
notesPerLine: number; // max 12, default 8
measuresPerLine: number; // max 4, default 1

// Optional Velocity
includeVelocity: boolean; // default false

//duration based vs subdivision based
//relative forces quantization to true
timingStyle: 'absoluteDuration' | 'relativeDivision' //default: duration

// Precision for duration calculations.
durationPrecision: number; // decimal places, default 4 }


isQuantized: boolean

  // Threshold in milliseconds (0-200ms)
  // Only notes that are MORE than this amount off-beat will be corrected
  // Lower values = more aggressive correction
  // Higher values = only fix obvious timing mistakes
  // Common range: 20-50ms
  quantizationThreshold: number;

  // Correction strength as percentage (0-100%)
  // How much to move notes toward the nearest grid point
  // 0% = no correction, 100% = snap exactly to grid
  // 50% = move halfway between original position and grid
  // Common range: 50-70%
  quantizationStrength: number;
```

i want you to create a class/service

this is called `StrudelNotation`. have it documented and explained with examples.
at minimum it takes in an array of notes

it can take that array of notes and convert it into various styles.

## Duration System

### Timing Calculations

Strudel uses CPS (Cycles Per Second). We use BPM and time signature:

```ts
function calculateCPS(bpm, timeSignature = DEFAULT_TIME_SIGNATURE) {
  return bpm / 60 / timeSignature.numerator;
}
```

**Example with defaults:**

- BPM = 120, time signature = 4/4
- CPS = 120/60/4 = 0.5
- @1 = One cycle = 2 seconds long
- @x = noteDuration / cycleLength

### Duration Notation

#### Cycle = Bar (Default)

```
@4 = 4 whole bars
@2 = 2 whole bars
@1 = 1 cycle is 1 whole bar (4 beats) - default, can be omitted
@0.75 = 3 beats (dotted half note)
@0.5 = 2 beats (half note)
@0.25 = 1 beat (quarter note)
@0.125 = Half beat (eighth note)
@0.0625 = Quarter beat (sixteenth note)
```

> Note: Writing `C4@1` is same as writing `C4`

##### Duration Calculation Examples

With defaults (BPM = 120, time signature = 4/4, CPS = 0.5):

- 1 cycle = 2 seconds = 2000 ms

```
@x = noteDuration/cycleLength

A note duration of 2000ms = note@1
A note duration of 500ms = note@0.25    // 500 ÷ 2000 = 0.25
A note duration of 646ms = note@0.323   // 646 ÷ 2000 = 0.323
A note duration of 1380ms = note@0.69   // 1380 ÷ 2000 = 0.69
```

> round to 4 decimal places

#### Cycle = Beat (Configurable Alternative)

```
@4     = 1 bar, 4 beats, whole note
@2     = half bar, 2 beats, half note
@1     = 1 cycle = 1 beat, quarter note
@0.75  = 3/4 beat (dotted eighth note)
@0.5   = 1/2 beat (eighth note)
@0.25  = 1/4 beat (sixteenth note)
@0.125 = 1/8 beat (thirty-second note)
@0.0625= 1/16 beat (sixty-fourth note)
```

##### Beat-Based Duration Examples

With same defaults but @1 = 0.5s:

```
A note duration of 2000ms = note@4      // 2000 ÷ 500 = 4 (1 bar, 4 beats, whole note)
A note duration of 500ms = note@1       // 500 ÷ 500 = 1 (1 beat, quarter note)
A note duration of 646ms = note@1.292   // 646 ÷ 500 = 1.292 (≈ 1.3 beats)
A note duration of 1380ms = note@2.76   // 1380 ÷ 500 = 2.76 (≈ 2.8 beats)
```

## Output Styles

### Absolute vs Relative Notation

#### Absolute (Raw Note Names)

```ts
// Raw, absolute note names
`<
C4 E4@0.5 G4 C5@2 E3@0.25
>`
  .as("note")
  .sound("sine");
```

#### Relative (Scale-Based)

```ts
// Scale based relative notes
`<
0 2@0.5 4 7@2 -8@0.25
>`
  .as("n")
  .scale("C4:chromatic")
  .sound("sine");
```

**Syntax Summary:**

```
`<...>`.as("note").sound("...") for absolute notation
`<...>`.as("n").scale(...) for relative notation
~ represents rest
```

## ## Stream Types

### Example Note Timeline

```
C4 0s - 0.5s
C4 0.5 - 1.5
E4 1 - 2
G4 1.5 - 1.75
A4 2 - 3
G#3 2- 3
B2 2 - 3
F4 3 - 3.5
C5 3.5 - 4.5
E5 3.5 - 4.5
G5 3.5 - 4.5
```

When notes overlap or have complex timing relationships, we use brackets `{...}` to group them together.
