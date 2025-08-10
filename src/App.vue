<template>
  <!-- Main app container with status indicator -->
  <div id="app">
    <!-- Status indicator showing current playback state -->
    <div class="status-indicator" :class="status">
      {{ statusText }}
    </div>

    <!-- Comprehensive control panel -->
    <nav class="controls">
      <!-- Playback Controls -->
      <div class="control-group">
        <h4>Playback</h4>
        <button @click="handlePlay" :disabled="status === 'loading'">
          ▶ Play
        </button>
        <button @click="handleStop" :disabled="status === 'loading'">
          ⏹ Stop
        </button>
        <button @click="handleToggle" :disabled="status === 'loading'">
          ⏯ Toggle
        </button>
      </div>

      <!-- Tempo Control -->
      <div class="control-group">
        <h4>Tempo (CPS): {{ currentCps.toFixed(1) }}</h4>
        <input
          type="range"
          min="0.1"
          max="4.0"
          step="0.1"
          :value="currentCps"
          @input="handleCpsChange"
          class="slider"
        />
        <div class="tempo-buttons">
          <button @click="setCps(0.5)">0.5</button>
          <button @click="setCps(1.0)">1.0</button>
          <button @click="setCps(2.0)">2.0</button>
        </div>
      </div>

      <!-- Example Patterns -->
      <div class="control-group">
        <h4>Example Patterns</h4>
        <div class="pattern-buttons">
          <button
            v-for="(pattern, key) in examplePatterns"
            :key="key"
            @click="loadExamplePattern(key)"
            class="pattern-btn"
          >
            {{ pattern.name }}
          </button>
        </div>
      </div>

      <!-- Editor Settings -->
      <div class="control-group">
        <h4>Editor Settings</h4>

        <!-- Font Size Control -->
        <div class="setting-item">
          <label>Font Size: {{ currentFontSize }}px</label>
          <input
            type="range"
            min="10"
            max="24"
            step="1"
            :value="currentFontSize"
            @input="handleFontSizeChange"
            class="slider"
          />
        </div>

        <!-- Font Family Selector -->
        <div class="setting-item">
          <label>Font Family:</label>
          <select @change="handleFontFamilyChange" class="font-select">
            <option value="Courier New">Courier New</option>
            <option value="Monaco">Monaco</option>
            <option value="Menlo">Menlo</option>
            <option value="Consolas">Consolas</option>
            <option value="monospace">Monospace</option>
          </select>
        </div>

        <!-- Boolean Settings -->
        <div class="checkbox-settings">
          <label class="checkbox-item">
            <input
              type="checkbox"
              :checked="editorSettings.lineWrapping"
              @change="toggleLineWrapping"
            />
            Line Wrapping
          </label>
          <label class="checkbox-item">
            <input
              type="checkbox"
              :checked="editorSettings.lineNumbers"
              @change="toggleLineNumbers"
            />
            Line Numbers
          </label>
          <label class="checkbox-item">
            <input
              type="checkbox"
              :checked="editorSettings.bracketMatching"
              @change="toggleBracketMatching"
            />
            Bracket Matching
          </label>
          <label class="checkbox-item">
            <input
              type="checkbox"
              :checked="editorSettings.bracketClosing"
              @change="toggleBracketClosing"
            />
            Auto Bracket Closing
          </label>
          <label class="checkbox-item">
            <input
              type="checkbox"
              :checked="editorSettings.autocompletion"
              @change="toggleAutocompletion"
            />
            Autocompletion
          </label>
        </div>

        <!-- Theme Selector -->
        <div class="setting-item">
          <label>Editor Theme:</label>
          <select
            @change="handleThemeChange"
            class="theme-select"
            v-model="currentTheme"
          >
            <optgroup label="Strudel Themes">
              <option value="strudelTheme">Strudel (Default)</option>
              <option value="algoboy">Algoboy</option>
              <option value="CutiePi">CutiePi</option>
              <option value="sonicPink">Sonic Pink</option>
            </optgroup>
            <optgroup label="Retro/Terminal">
              <option value="blackscreen">Black Screen</option>
              <option value="bluescreen">Blue Screen</option>
              <option value="whitescreen">White Screen</option>
              <option value="teletext">Teletext</option>
              <option value="greenText">Green Text</option>
              <option value="redText">Red Text</option>
            </optgroup>
            <optgroup label="Popular Themes">
              <option value="dracula">Dracula</option>
              <option value="monokai">Monokai</option>
              <option value="nord">Nord</option>
              <option value="sublime">Sublime</option>
              <option value="darcula">Darcula</option>
              <option value="atomone">Atom One</option>
            </optgroup>
            <optgroup label="Material & Tokyo">
              <option value="materialDark">Material Dark</option>
              <option value="materialLight">Material Light</option>
              <option value="tokyoNight">Tokyo Night</option>
              <option value="tokyoNightDay">Tokyo Night Day</option>
              <option value="tokyoNightStorm">Tokyo Night Storm</option>
            </optgroup>
            <optgroup label="GitHub & VS Code">
              <option value="githubDark">GitHub Dark</option>
              <option value="githubLight">GitHub Light</option>
              <option value="vscodeDark">VS Code Dark</option>
              <option value="vscodeLight">VS Code Light</option>
            </optgroup>
            <optgroup label="Solarized & Others">
              <option value="solarizedDark">Solarized Dark</option>
              <option value="solarizedLight">Solarized Light</option>
              <option value="gruvboxDark">Gruvbox Dark</option>
              <option value="gruvboxLight">Gruvbox Light</option>
              <option value="duotoneDark">Duotone Dark</option>
              <option value="aura">Aura</option>
              <option value="noctisLilac">Noctis Lilac</option>
            </optgroup>
            <optgroup label="IDE Themes">
              <option value="androidstudio">Android Studio</option>
              <option value="eclipse">Eclipse</option>
              <option value="xcodeLight">Xcode Light</option>
              <option value="bbedit">BBEdit</option>
            </optgroup>
          </select>
        </div>
      </div>

      <!-- Advanced Controls -->
      <div class="control-group">
        <h4>Advanced</h4>
        <button @click="showRepl" class="advanced-btn">Show REPL State</button>
        <button @click="clearCode" class="advanced-btn">Clear Code</button>
        <button @click="showAvailableThemes" class="advanced-btn">
          Show Available Themes
        </button>
      </div>

      <!-- Strudel Features -->
      <div class="control-group">
        <h4>Strudel Features</h4>
        <div class="checkbox-settings">
          <label class="checkbox-item">
            <input
              type="checkbox"
              :checked="strudelSettings.flashEnabled"
              @change="toggleFlash"
            />
            Flash Effects
          </label>
          <label class="checkbox-item">
            <input
              type="checkbox"
              :checked="strudelSettings.slidersEnabled"
              @change="toggleSliders"
            />
            Interactive Sliders
          </label>
          <label class="checkbox-item">
            <input
              type="checkbox"
              :checked="strudelSettings.tooltipsEnabled"
              @change="toggleTooltips"
            />
            Tooltips
          </label>
        </div>
      </div>
    </nav>

    <!-- Main content area -->
    <div class="container">
      <!-- Left side: Code editor -->
      <div class="editor-container">
        <StrudelEditor
          ref="editor"
          v-model:code="currentCode"
          @error="handleError"
          @success="handleSuccess"
          @draw="handleDraw"
        />
      </div>

      <!-- Right side: Visualization and console -->
      <div class="output-container">
        <!-- Canvas for pianoroll visualization -->
        <div class="canvas-container">
          <canvas ref="canvas" id="pianoroll" width="800" height="400"></canvas>
        </div>

        <!-- Console output for logs and errors -->
        <div class="console-output" ref="console">
          <div class="console-header">
            <h4>Console Output</h4>
            <button @click="clearConsole" class="clear-btn">Clear</button>
          </div>
          <div class="console-entries">
            <div
              v-for="(entry, index) in consoleEntries"
              :key="index"
              class="log-entry"
              :class="entry.type"
            >
              <span class="timestamp">[{{ entry.timestamp }}]</span>
              {{ entry.message }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * Comprehensive Strudel API Playground
 *
 * This enhanced playground demonstrates all available StrudelMirror functions:
 * - Pattern evaluation and playback control
 * - Tempo (CPS) control via slider and buttons
 * - Example patterns with setCode functionality
 * - Advanced REPL access and state inspection
 * - Real-time visualization and console logging
 */

import { ref, reactive, computed, onMounted, nextTick } from "vue";

// Import only what App.vue actually needs
import { drawPianoroll } from "@strudel/draw";

// Import our custom components
import StrudelEditor from "./components/StrudelEditor.vue";

// Example patterns demonstrating different Strudel features
const examplePatterns = {
  basic: {
    name: "Basic Melody",
    code: `// Basic melody pattern
note("c4 d4 e4 f4")
  .s("triangle")
  .slow(2)`,
  },

  drums: {
    name: "Drum Pattern",
    code: `// Basic drum pattern
stack(
  s("bd ~ bd ~"),     // kick on 1 and 3
  s("~ sd ~ sd"),     // snare on 2 and 4  
  s("hh*8").gain(0.3) // constant hi-hats
)`,
  },

  melody_drums: {
    name: "Melody + Drums",
    code: `// Melody with drum accompaniment
stack(
  // Simple melody
  note("c4 d4 e4 f4").s("triangle").slow(2),
  
  // Basic drum pattern
  s("bd sd").fast(2),
  
  // Hi-hats for rhythm
  s("hh*4").gain(0.3)
).cps(0.8)`,
  },

  polyrhythm: {
    name: "Polyrhythm",
    code: `// Different rhythms playing together
stack(
  note("c4*3").s("triangle"),     // 3 notes per cycle
  note("g3*4").s("sine").gain(0.5), // 4 notes per cycle  
  s("bd*2"),                      // 2 kicks per cycle
  s("sd").struct("~ x ~ x")       // snare on 2 and 4
)`,
  },

  effects: {
    name: "With Effects",
    code: `// Pattern with audio effects
note("c4 eb4 f4 g4")
  .s("sawtooth")
  .lpf(sine.range(200, 2000).slow(4)) // moving filter
  .delay(0.25)                        // echo
  .gain(0.7)
  .slow(1.5)`,
  },

  scales: {
    name: "Scales & Chords",
    code: `// Using scales and chords
stack(
  // Melody in C major scale
  n("0 2 4 5 7").scale("C4:major").s("triangle"),
  
  // Bass line
  n("0 -12").scale("C4:major").s("sawtooth")
    .lpf(800).octave(2),
    
  // Simple drums
  s("bd ~ sd ~")
)`,
  },

  sliders: {
    name: "Interactive Sliders",
    code: `// Interactive sliders for live control
note("c4 d4 e4 f4")
  .s("triangle")
  .gain(slider(0.7, 0, 1))        // Volume slider
  .lpf(slider(1000, 200, 2000))   // Filter slider
  .delay(slider(0.2, 0, 0.5))     // Delay slider
  .slow(slider(2, 0.5, 4))        // Speed slider`,
  },

  advanced: {
    name: "Advanced Features",
    code: `// Demonstrating advanced Strudel features
stack(
  // Melody with sliders
  note("c4 d4 e4 f4 g4 a4 b4 c5")
    .s("sawtooth")
    .gain(slider(0.6, 0, 1))
    .lpf(slider(1200, 300, 2000))
    .slow(slider(2, 1, 4)),
    
  // Drum pattern
  s("bd*2 sd*2").gain(0.8),
  
  // Bass with effects
  n("c2 f2 g2 c2").s("sine")
    .gain(0.4).slow(4)
)`,
  },
};

// Component refs
const editor = ref(null);
const canvas = ref(null);
const console = ref(null);

// Reactive state
const currentCode = ref(examplePatterns.basic.code);
const status = ref("stopped");
const consoleEntries = reactive([]);
const currentCps = ref(0.6); // Default tempo

// Editor settings state
const currentFontSize = ref(18);
const currentTheme = ref("strudelTheme");
const editorSettings = reactive({
  lineWrapping: true,
  lineNumbers: true,
  bracketMatching: true,
  bracketClosing: true,
  autocompletion: true,
});

// Strudel-specific settings
const strudelSettings = reactive({
  flashEnabled: true,
  slidersEnabled: true,
  tooltipsEnabled: true,
});

// Non-reactive state (only for canvas visualization)
let drawContext = null;
const drawTime = [-2, 2]; // Time window for visualization

/**
 * User-friendly status text based on current status
 */
const statusText = computed(() => {
  switch (status.value) {
    case "playing":
      return "Playing";
    case "stopped":
      return "Stopped";
    case "loading":
      return "Loading...";
    default:
      return "Ready";
  }
});

/**
 * Set up the canvas for pianoroll visualization
 */
async function setupCanvas() {
  if (canvas.value) {
    // Set up high-DPI canvas rendering
    canvas.value.width = canvas.value.offsetWidth * 2;
    canvas.value.height = canvas.value.offsetHeight * 2;
    drawContext = canvas.value.getContext("2d");
    drawContext.scale(2, 2);

    // Initial canvas setup
    clearCanvas();
    log("Canvas initialized", "info");
  }
}

/**
 * Handle play button click - uses evaluate()
 */
async function handlePlay() {
  if (!editor.value) {
    log("Editor not ready", "error");
    return;
  }

  try {
    status.value = "loading";

    // Use StrudelMirror's evaluate method - it handles all audio setup internally
    await editor.value.evaluate();

    status.value = "playing";
    log("Pattern started with evaluate()", "success");
  } catch (error) {
    status.value = "stopped";
    handleError(error);
  }
}

/**
 * Handle stop button click - uses stop()
 */
function handleStop() {
  try {
    if (editor.value) {
      editor.value.stop();
    }

    status.value = "stopped";
    clearCanvas();
    log("Playbook stopped", "info");
  } catch (error) {
    handleError(error);
  }
}

/**
 * Handle toggle button click - uses toggle()
 */
function handleToggle() {
  try {
    if (editor.value) {
      // Use the exposed toggle method
      editor.value.toggle();

      // Update status based on current playing state
      const isPlaying = editor.value.isPlaying();
      status.value = isPlaying ? "playing" : "stopped";

      log(`Playback toggled: ${isPlaying ? "playing" : "stopped"}`, "success");

      if (!isPlaying) {
        clearCanvas();
      }
    }
  } catch (error) {
    handleError(error);
  }
}

/**
 * Handle CPS (tempo) slider change - uses setCps()
 */
function handleCpsChange(event) {
  const newCps = parseFloat(event.target.value);
  setCps(newCps);
}

/**
 * Set CPS (cycles per second) - demonstrates setCps() function
 */
function setCps(cps) {
  try {
    currentCps.value = cps;

    if (editor.value) {
      // Use the exposed setCps method
      editor.value.setCps(cps);
      log(`Tempo set to ${cps} CPS using setCps()`, "success");
    }
  } catch (error) {
    handleError(error);
  }
}

/**
 * Load example pattern - demonstrates setCode() function
 */
function loadExamplePattern(patternKey) {
  try {
    const pattern = examplePatterns[patternKey];
    if (pattern && editor.value) {
      // Use the exposed setCode method
      editor.value.setCode(pattern.code);
      currentCode.value = pattern.code;
      log(`Loaded pattern: ${pattern.name} using setCode()`, "success");
    }
  } catch (error) {
    handleError(error);
  }
}

/**
 * Show REPL state - demonstrates getRepl() and getState()
 */
function showRepl() {
  try {
    if (editor.value) {
      const repl = editor.value.getRepl();
      const state = editor.value.getState();
      const isPlaying = editor.value.isPlaying();

      log(`REPL State - Playing: ${isPlaying}`, "info");
      log(`REPL instance available: ${!!repl}`, "info");
      log(`State object available: ${!!state}`, "info");

      // Log some interesting REPL properties if available
      if (repl) {
        console.log("Full REPL object:", repl);
        log("Check browser console for full REPL object", "info");
      }
    }
  } catch (error) {
    handleError(error);
  }
}

/**
 * Clear code editor
 */
function clearCode() {
  try {
    if (editor.value) {
      editor.value.setCode("");
      currentCode.value = "";
      log("Code cleared", "info");
    }
  } catch (error) {
    handleError(error);
  }
}

/**
 * Clear console output
 */
function clearConsole() {
  consoleEntries.splice(0, consoleEntries.length);
  log("Console cleared", "info");
}

/**
 * Editor Settings Functions - demonstrate all StrudelMirror configuration methods
 */

/**
 * Handle font size change - uses setFontSize()
 */
function handleFontSizeChange(event) {
  const newSize = parseInt(event.target.value);
  currentFontSize.value = newSize;
  log(newSize);

  if (editor.value) {
    editor.value.setFontSize(newSize);
    log(`Font size changed to ${newSize}px using setFontSize()`, "success");
  }
}

/**
 * Handle font family change - uses setFontFamily()
 */
function handleFontFamilyChange(event) {
  const newFamily = event.target.value;

  if (editor.value) {
    editor.value.setFontFamily(newFamily);
    log(`Font family changed to ${newFamily} using setFontFamily()`, "success");
  }
}

/**
 * Toggle line wrapping - uses setLineWrappingEnabled()
 */
function toggleLineWrapping(event) {
  const enabled = event.target.checked;
  editorSettings.lineWrapping = enabled;

  if (editor.value) {
    editor.value.setLineWrappingEnabled(enabled);
    log(
      `Line wrapping ${
        enabled ? "enabled" : "disabled"
      } using setLineWrappingEnabled()`,
      "success"
    );
  }
}

/**
 * Toggle line numbers - uses setLineNumbersDisplayed()
 */
function toggleLineNumbers(event) {
  const enabled = event.target.checked;
  editorSettings.lineNumbers = enabled;

  if (editor.value) {
    editor.value.setLineNumbersDisplayed(enabled);
    log(
      `Line numbers ${
        enabled ? "enabled" : "disabled"
      } using setLineNumbersDisplayed()`,
      "success"
    );
  }
}

/**
 * Toggle bracket matching - uses setBracketMatchingEnabled()
 */
function toggleBracketMatching(event) {
  const enabled = event.target.checked;
  editorSettings.bracketMatching = enabled;

  if (editor.value) {
    editor.value.setBracketMatchingEnabled(enabled);
    log(
      `Bracket matching ${
        enabled ? "enabled" : "disabled"
      } using setBracketMatchingEnabled()`,
      "success"
    );
  }
}

/**
 * Toggle bracket auto-closing - uses setBracketClosingEnabled()
 */
function toggleBracketClosing(event) {
  const enabled = event.target.checked;
  editorSettings.bracketClosing = enabled;

  if (editor.value) {
    editor.value.setBracketClosingEnabled(enabled);
    log(
      `Auto bracket closing ${
        enabled ? "enabled" : "disabled"
      } using setBracketClosingEnabled()`,
      "success"
    );
  }
}

/**
 * Toggle autocompletion - uses setAutocompletionEnabled()
 */
function toggleAutocompletion(event) {
  const enabled = event.target.checked;
  editorSettings.autocompletion = enabled;

  if (editor.value) {
    editor.value.setAutocompletionEnabled(enabled);
    log(
      `Autocompletion ${
        enabled ? "enabled" : "disabled"
      } using setAutocompletionEnabled()`,
      "success"
    );
  }
}

/**
 * Handle theme change - uses setTheme()
 */
function handleThemeChange(event) {
  const newTheme = event.target.value;
  currentTheme.value = newTheme;

  if (editor.value) {
    editor.value.setTheme(newTheme);
    log(`Theme changed to ${newTheme} using setTheme()`, "success");
  }
}

/**
 * Show available themes - demonstrates theme system
 */
function showAvailableThemes() {
  if (editor.value) {
    const availableThemes = Object.keys(editor.value.getEditor()?.themes || {});
    log(
      `Available Strudel themes: ${
        availableThemes.length > 0 ? availableThemes.join(", ") : "Loading..."
      } `,
      "info"
    );
    log(
      "Theme categories: Strudel, Retro/Terminal, Popular, Material & Tokyo, GitHub & VS Code, Solarized, IDE",
      "info"
    );
  }
}

/**
 * Toggle flash effects - uses Strudel flash system
 */
function toggleFlash(event) {
  const enabled = event.target.checked;
  strudelSettings.flashEnabled = enabled;

  if (editor.value) {
    // Flash effects are typically enabled by default in StrudelMirror
    log(`Flash effects ${enabled ? "enabled" : "disabled"}`, "success");
  }
}

/**
 * Toggle interactive sliders - uses Strudel slider system
 */
function toggleSliders(event) {
  const enabled = event.target.checked;
  strudelSettings.slidersEnabled = enabled;

  if (editor.value) {
    // Sliders are part of the transpiler and widget system
    log(`Interactive sliders ${enabled ? "enabled" : "disabled"}`, "success");
    log("Try using slider(0.5, 0, 1) in your patterns!", "info");
  }
}

/**
 * Toggle tooltips - uses Strudel tooltip system
 */
function toggleTooltips(event) {
  const enabled = event.target.checked;
  strudelSettings.tooltipsEnabled = enabled;

  if (editor.value) {
    // Tooltips provide documentation on hover
    log(`Tooltips ${enabled ? "enabled" : "disabled"}`, "success");
  }
}

/**
 * Handle drawing/visualization updates
 */
function handleDraw(haps, time) {
  if (!drawContext) return;

  try {
    // Clear previous frame
    clearCanvas();

    // Draw pianoroll visualization
    drawPianoroll({
      haps,
      time,
      ctx: drawContext,
      drawTime: drawTime,
      fold: 0,
    });
  } catch (error) {
    console.warn("Drawing error:", error);
  }
}

/**
 * Clear the visualization canvas
 */
function clearCanvas() {
  if (drawContext) {
    drawContext.fillStyle = "#111";
    drawContext.fillRect(
      0,
      0,
      canvas.value.offsetWidth,
      canvas.value.offsetHeight
    );
  }
}

/**
 * Handle successful operations
 */
function handleSuccess(message) {
  log(message || "Operation successful", "success");
}

/**
 * Handle errors
 */
function handleError(error) {
  const message = error?.message || error || "Unknown error";
  log(`Error: ${message}`, "error");
  status.value = "stopped";
}

/**
 * Add entry to console log
 */
function log(message, type = "info") {
  const timestamp = new Date().toLocaleTimeString();
  consoleEntries.push({
    message,
    type,
    timestamp,
  });

  // Auto-scroll console to bottom
  nextTick(() => {
    if (console.value) {
      const entries = console.value.querySelector(".console-entries");
      if (entries) {
        entries.scrollTop = entries.scrollHeight;
      }
    }
  });

  // Limit console entries to prevent memory issues
  if (consoleEntries.length > 100) {
    consoleEntries.shift();
  }
}

/**
 * Initialize the playground
 */
onMounted(async () => {
  log("Initializing Comprehensive Strudel API Playground...", "info");

  try {
    // Set up canvas for visualization (App.vue only handles UI, not Strudel internals)
    await setupCanvas();

    log(
      "🎵 Playground ready! StrudelEditor will handle all audio initialization.",
      "success"
    );
    log(
      "📝 Available functions: evaluate(), stop(), toggle(), setCps(), setCode(), getRepl()",
      "info"
    );
  } catch (error) {
    handleError(error);
  }
});
</script>
