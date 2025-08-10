# Strudel API Playground

A minimal Vue 3 playground for experimenting with the [Strudel.cc](https://strudel.cc) live coding environment. This playground provides an easy way to explore Strudel's powerful pattern-based music programming language with real-time audio synthesis and visualization.

## Features

- **Live Code Editor**: Syntax-highlighted editor powered by StrudelMirror (CodeMirror 6)
- **Real-time Audio**: Web Audio API integration with built-in synthesizers and samples
- **Visual Feedback**: Piano roll visualization showing your patterns in real-time
- **Simple Interface**: Minimal dark theme inspired by the official examples
- **Extensive Comments**: Well-documented code to help you understand how everything works

## Quick Start

1. **Install dependencies**:

   ```bash
   bun install
   ```

2. **Start the development server**:

   ```bash
   bun dev
   ```

3. **Open your browser** to `http://localhost:3000`

4. **Click the Play button** to run the example pattern

5. **Start experimenting!** Modify the code and press Play again to hear your changes

## Understanding Strudel

Strudel is a pattern-based live coding language for music. Here are some basic concepts:

### Basic Patterns

```javascript
// Play a simple note
note("c4");

// Play a sequence of notes
note("c4 d4 e4 f4");

// Play with rhythm patterns
note("c4 d4").fast(2); // twice as fast
note("c4 d4").slow(2); // twice as slow
```

### Sounds and Synthesis

```javascript
// Different synthesizer sounds
note("c4").s("triangle"); // triangle wave
note("c4").s("sawtooth"); // sawtooth wave
note("c4").s("sine"); // sine wave

// Drum samples
s("bd sd"); // bass drum, snare drum
s("hh*4"); // hi-hat 4 times per cycle
```

### Layering and Combining

```javascript
// Stack multiple patterns together
stack(
  note("c4 e4 g4").s("triangle"), // melody
  s("bd sd").fast(2), // drums
  s("hh*8").gain(0.3) // hi-hats
);
```

### Effects and Modulation

```javascript
// Add effects
note("c4 d4 e4")
  .s("triangle")
  .lpf(1000) // low-pass filter
  .delay(0.5) // delay effect
  .gain(0.7) // volume control
  .pan(0.2); // stereo panning
```

## Available Functions

The playground loads several Strudel modules, giving you access to:

### Core Functions

- `note()`: Create melodic patterns
- `s()`: Trigger samples/sounds
- `stack()`: Layer multiple patterns
- `fast()` / `slow()`: Change timing
- `cps()`: Set cycles per second (tempo)

### Mini Notation

- `*` - repeat: `s("bd*4")` plays bass drum 4 times
- `~` - rest: `s("bd ~ sd ~")` adds silence
- `[]` - subdivision: `s("bd [sd hh]")` subdivides beats
- `<>` - alternate: `s("bd <sd hh>")` alternates each cycle

### Effects

- `.gain()` - volume control
- `.pan()` - stereo positioning
- `.lpf()` / `.hpf()` - filters
- `.delay()` - delay effect
- `.reverb()` - reverb effect

### Music Theory (via @strudel/tonal)

- `.scale()` - apply musical scales
- `.chord()` - generate chords
- `.transpose()` - shift pitch

## Project Structure

```
src/
├── main.js                 # Vue app entry point
├── App.vue                 # Main application component
├── style.css               # Global styles (dark theme)
└── components/
    └── StrudelEditor.vue   # CodeMirror integration component
```

### Key Components

#### `App.vue`

- Main application layout and state management
- Audio initialization and playback controls
- Console logging and error handling
- Canvas setup for visualization

#### `StrudelEditor.vue`

- Wraps StrudelMirror for code editing
- Handles pattern compilation and evaluation
- Manages Strudel module loading
- Provides syntax highlighting and live coding features

## How It Works

1. **Initialization**: The app loads Strudel modules and initializes Web Audio
2. **Code Editing**: StrudelMirror provides syntax highlighting and editing
3. **Transpilation**: Code is converted from Strudel syntax to JavaScript
4. **Evaluation**: Patterns are evaluated and scheduled for playback
5. **Audio Output**: Web Audio API renders the patterns as sound
6. **Visualization**: Piano roll shows note events in real-time

## Examples to Try

### Simple Melody

```javascript
note("c4 d4 e4 f4 g4 f4 e4 d4").s("triangle").slow(2);
```

### Drum Pattern

```javascript
stack(
  s("bd bd ~ bd"), // kick pattern
  s("~ sd ~ sd"), // snare on 2 and 4
  s("hh*8").gain(0.4) // constant hi-hats
);
```

### Chord Progression

```javascript
note("<c4 am4 f4 g4>/2").s("sawtooth").chord("major").lpf(800).slow(4);
```

### Polyrhythm

```javascript
stack(
  note("c4*3").s("triangle"), // 3 notes per cycle
  note("g3*4").s("sine"), // 4 notes per cycle
  s("bd*2") // 2 kicks per cycle
);
```

## Tips for Live Coding

1. **Start Simple**: Begin with basic patterns and build complexity gradually
2. **Use Comments**: Document interesting patterns with `//` comments
3. **Experiment**: Try changing numbers, note names, and function calls
4. **Layer Gradually**: Start with one pattern, then add layers with `stack()`
5. **Check Console**: Error messages appear in the console panel
6. **Save Good Patterns**: Copy interesting patterns to keep them

## Troubleshooting

### No Sound

- Make sure your browser allows audio
- Click the Play button to start audio context
- Check if your system volume is up

### Pattern Errors

- Look at the console panel for error messages
- Check for syntax errors (missing quotes, brackets, etc.)
- Try simplifying the pattern to isolate issues

### Performance

- Complex patterns may cause audio glitches
- Try reducing pattern complexity or using `.slow()`
- Check browser dev tools for performance issues

## Development

This playground is built with:

- **Vue 3** - Component framework
- **Vite** - Build tool and dev server
- **Strudel** - Live coding music language
- **CodeMirror 6** - Code editor (via StrudelMirror)
- **Web Audio API** - Real-time audio synthesis

To modify or extend the playground:

1. Edit components in `src/`
2. Add new Strudel modules in the `prebake` function
3. Customize styling in `src/style.css`
4. Add new example patterns in `App.vue`

## Resources

- [Strudel Documentation](https://strudel.cc/learn/)
- [Strudel Tutorial](https://strudel.cc/learn/getting-started)
- [Pattern Reference](https://strudel.cc/learn/patterns)
- [Mini Notation Guide](https://strudel.cc/learn/mini-notation)

## License

This playground is provided as an educational example. Please check individual Strudel package licenses for usage terms.

---

**Have fun live coding with Strudel! 🎵**
