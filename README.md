# MIDI to Bracket Notation Converter

A web application that converts MIDI files to bracket notation for use with [Strudel](https://strudel.tidalcycles.org/), a live coding environment for music. This tool analyzes MIDI files and generates optimized bracket notation patterns that can be played directly in Strudel.

**Lovable Project URL**: https://lovable.dev/projects/9d4bf2c2-dd87-4d54-80ac-a1d7377d6a7b

## What is Bracket Notation?

Bracket notation is a time-based musical notation system used by Strudel. It represents musical events (notes, chords, rests) with precise timing information:

### Basic Syntax

- **Single notes**: `C4` (plays for 1 cycle), `D4@0.5` (plays for half a cycle)
- **Chords**: `[C4, E4, G4]@1` (multiple notes playing simultaneously)
- **Rests**: `~@0.5` (silence for half a cycle)
- **Complex overlaps**: `{C4@2, ~@0.5 E4@1.5}@2` (C4 plays for 2 cycles, E4 starts after 0.5 cycles)

### Scale Degree Mode

When a key signature is detected or available:
- **Scale degrees**: `0 1 2` (in C major: C D E)
- **Chords**: `[0, 2, 4]` (C major triad)
- **Octave shifts**: `0 7 14` (C4, C5, C6) or `0 -7 -14` (C4, C3, C2)

## Features

### Core Functionality

- **MIDI File Processing**: Upload any MIDI file and extract musical data
- **Intelligent Key Detection**: Automatically detects the key signature from note content
- **Multi-track Support**: Process individual tracks or combine them
- **Timing Conversion**: Converts MIDI timing to Strudel's cycle-based system

### Notation Modes

#### 1. Raw Notes Mode
Outputs actual note names (C4, D#3, etc.):
```
note(`C4 D4 E4@0.25 ~@0.5 [C4, E4, G4]@1`).sound("piano")
```

#### 2. Scale Degrees Mode
Outputs scale degrees (0-6) when a key is detected:
```
n(`0 1 2@0.25 ~@0.5 [0, 2, 4]@1`).scale("C major").sound("piano")
```

### Output Modes

#### 1. Single Stream
Combines all notes into one polyphonic pattern. Best for simple pieces.

#### 2. Multi Stream
Separates notes into multiple monophonic streams to avoid voice collisions:
```javascript
T0_PIANO: note(`<C4 E4 G4>`).sound("gm_piano")
T1_BASS: note(`<C2@2 G2@2>`).sound("gm_acoustic_bass")
T2_DRUMS: s(`<bd sd bd sd>`).bank("RolandTR909")
```

Features:
- **Instrument Detection**: Maps MIDI instruments to appropriate Strudel samples
- **Drum Handling**: Special handling for percussion tracks with drum banks
- **Voice Separation**: Prevents note overlaps within each stream

#### 3. Patternize
Detects repeating musical patterns and generates optimized code:
```javascript
// Define patterns
const P1 = `0 2 4 5`
const P2 = `[0, 4] ~ 2 ~`

// Use patterns with transformations
T0_PIANO: n(`<${P1} ${P1}|+7 ${P2}>`).scale("C major").sound("gm_piano")
```

Features:
- **Pattern Detection**: Finds repeating sequences with configurable parameters
- **Multi-track Patterns**: Detects patterns across multiple tracks
- **Smart Transformations**: Applies octave shifts and other modifications

### Sidebar Controls

#### MIDI Details
- Displays tempo, time signature, and key signature
- Shows confidence level for detected keys

#### Notation Mode Toggle
- **Raw Notes**: Use actual note names (C4, D4, etc.)
- **Scale Degrees**: Use scale degrees (0-6) with detected key
- Only available when a key signature is detected

#### Velocity Control
- **Include Velocity**: Adds velocity patterns from MIDI data
- Creates matching velocity patterns: `.velocity(\`0.8 0.7 0.9\`)`

#### Output Mode Selection
- **Single Stream**: One polyphonic pattern
- **Multi Stream**: Multiple monophonic patterns
- **Patternize**: Pattern detection and optimization

#### Multi Stream Options
- **Use Instrument Samples**: Maps each track to its detected instrument
- Includes GM soundfont instruments and drum banks

#### Pattern Detection Parameters (Patternize mode)
- **Min Pattern Length**: Minimum notes required (1-10)
- **Min Repetitions**: How many times pattern must repeat (2-10)
- **Similarity Threshold**: How similar repetitions must be (50-100%)
- Shows pattern analysis statistics

#### Timing Mode
- **Auto (Bar-based)**: Uses MIDI tempo and time signature
  - Shows CPS calculation formula
  - 1 cycle = 1 bar at detected tempo
- **Manual**: Direct control over cycles per second
  - Adjustable CPS value (0.1-10)
  - Default: 0.5 (1 cycle = 2 seconds)

#### Line Length
- Controls notes/bars per line in output (1-20)
- Improves readability of generated notation

#### Track Selection
- Enable/disable individual MIDI tracks
- Shows track name, instrument, and note count
- Identifies percussion tracks

### Timing System

#### Cycles and Beats
- 1 cycle = 1 bar (measure) in the MIDI file
- Durations are in cycles: `@1` = 1 bar, `@0.25` = 1 beat in 4/4
- CPS (Cycles Per Second) = BPM / 60 / beats_per_bar

#### Examples
- At 120 BPM in 4/4: CPS = 0.5 (1 bar = 2 seconds)
- At 140 BPM in 3/4: CPS = 0.778 (1 bar = 1.29 seconds)

### Advanced Features

#### Instrument Mapping
Automatically maps MIDI instruments to Strudel samples:
- Piano → gm_piano, gm_epiano1
- Bass → gm_acoustic_bass, gm_electric_bass_finger
- Drums → bd, sd, hh (with appropriate drum banks)
- 100+ GM instruments supported

#### Drum Track Handling
- Detects percussion channels (typically channel 10)
- Maps MIDI drum notes to Strudel drum tokens
- Assigns appropriate drum banks (TR909, TR808, etc.)

#### Pattern Analysis
- Shows pattern coverage percentage
- Average similarity between repetitions
- Total patterns and repetitions found

## Usage

1. **Upload MIDI**: Drag & drop or click to upload a MIDI file
2. **Configure Settings**: Adjust sidebar controls as needed
3. **Copy/Download**: Use the generated Strudel code
4. **Play**: Test directly in the embedded player or paste into Strudel

## Local Development

```bash
# Clone repository
git clone <repository-url>
cd midi-to-bracket

# Install dependencies (using npm as specified in WARP.md)
npm install

# Start development server
npm run dev
# Opens at http://localhost:8080

# Build for production
npm run build
```

## Technical Details

### Technologies
- **Frontend**: React, TypeScript, Vite
- **UI**: shadcn-ui, Tailwind CSS
- **Audio**: Tone.js, @strudel/* libraries
- **MIDI Processing**: @tonejs/midi
- **State Management**: React hooks, TanStack Query

### Architecture
- `src/lib/midiProcessor.ts` - MIDI file parsing and timing conversion
- `src/lib/bracketNotation.ts` - Core bracket notation generation
- `src/lib/patternDetection.ts` - Musical pattern analysis
- `src/lib/multiStream.ts` - Voice separation algorithms
- `src/components/StrudelPlayer.tsx` - Embedded Strudel player

See [WARP.md](./WARP.md) for detailed development guidance.

## Deployment

Deploy via [Lovable](https://lovable.dev/projects/9d4bf2c2-dd87-4d54-80ac-a1d7377d6a7b) → Share → Publish

Custom domains supported via Project → Settings → Domains
