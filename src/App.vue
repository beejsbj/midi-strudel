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

import {
  ref,
  reactive,
  computed,
  onMounted,
  onBeforeUnmount,
  watch,
} from "vue";
import { StrudelMirror } from "@strudel/codemirror";
import { evalScope } from "@strudel/core";
import { transpiler } from "@strudel/transpiler";
import { useStore } from "@nanostores/vue";

import {
  getAudioContext,
  webaudioOutput,
  initAudioOnFirstClick,
  registerSynthSounds,
  samples,
  soundMap,
} from "@strudel/webaudio";
import { registerSoundfonts } from "@strudel/soundfonts";
import { themes } from "@strudel/codemirror";

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
const editorRoot = ref(null);

// Reactive state
const currentCode = ref(examplePatterns.basic.code);
const status = ref("stopped");
const currentCps = ref(0.6); // Default tempo

// StrudelMirror editor settings
const editorConfig = reactive({
  fontSize: 18,
  fontFamily: "monospace",
  theme: "strudelTheme",
  isBracketMatchingEnabled: true,
  isBracketClosingEnabled: true,
  isLineNumbersDisplayed: true,
  isActiveLineHighlighted: true,
  isAutoCompletionEnabled: true,
  isPatternHighlightingEnabled: true,
  isFlashEnabled: true,
  isTooltipEnabled: true,
  isLineWrappingEnabled: true,
  isTabIndentationEnabled: true,
  isMultiCursorEnabled: true,
});

// Strudel-specific settings (for UI controls)
const strudelSettings = reactive({
  slidersEnabled: true,
});

// Non-reactive state
let editor = null;

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
 * Initialize the StrudelMirror editor with all necessary configuration
 */
async function initializeEditor() {
  try {
    if (!editorRoot.value) {
      throw new Error("Editor root element not found");
    }
    initAudioOnFirstClick();
    editor = new StrudelMirror({
      defaultOutput: webaudioOutput,
      getTime: () => getAudioContext().currentTime,
      transpiler,
      root: editorRoot.value,
      initialCode: currentCode.value,
      onCode: (code) => {
        currentCode.value = code;
      },
      onError: (error) => {
        handleError(error);
      },
      prebake: async () => {
        try {
          const loadModules = evalScope(
            import("@strudel/core"),
            import("@strudel/mini"),
            import("@strudel/tonal"),
            import("@strudel/webaudio")
          );
          const ds =
            "https://raw.githubusercontent.com/felixroos/dough-samples/main/";

          await Promise.all([
            loadModules,
            samples(`${ds}/tidal-drum-machines.json`),
            samples(`${ds}/piano.json`),
            samples(`${ds}/Dirt-Samples.json`),
            samples(`${ds}/EmuSP12.json`),
            samples(`${ds}/vcsl.json`),
            samples(`${ds}/mridangam.json`),
            registerSynthSounds(),
            registerSoundfonts(),
          ]);
        } catch (error) {
          handleError(
            new Error(`Failed to initialize editor: ${error.message}`)
          );
          throw error;
        }
      },
    });
    editor.updateSettings(editorConfig);
  } catch (error) {
    handleError(new Error(`Editor initialization failed: ${error.message}`));
    throw error;
  }
}

/**
 * Handle play button click - uses evaluate()
 */
async function handlePlay() {
  if (!editor) {
    return;
  }
  try {
    status.value = "loading";
    //  editor.appendCode(".punchcard()");
    await editor.evaluate();
    status.value = "playing";
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
    if (editor) {
      editor.stop();
    }
    status.value = "stopped";
  } catch (error) {
    handleError(error);
  }
}

/**
 * Handle toggle button click - uses toggle()
 */
function handleToggle() {
  try {
    if (editor) {
      editor.toggle();
      const isPlaying = editor.repl?.scheduler?.started || false;
      status.value = isPlaying ? "playing" : "stopped";
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
    if (editor?.repl?.setCps) {
      editor.repl.setCps(cps);
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
    if (pattern && editor) {
      editor.setCode(pattern.code);
      currentCode.value = pattern.code;
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
    if (editor) {
      const repl = editor.repl;
      const state = editor.repl?.state;
      const isPlaying = editor.repl?.scheduler?.started || false;
      console.log("REPL State - Playing:", isPlaying);
      console.log("REPL instance:", repl);
      console.log("State object:", state);
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
    if (editor) {
      editor.setCode("");
      currentCode.value = "";
    }
  } catch (error) {
    handleError(error);
  }
}

/**
 * Editor Settings Functions
 */
function handleFontSizeChange(event) {
  const newSize = parseInt(event.target.value);
  editorConfig.fontSize = newSize;
  if (editor) {
    editor.setFontSize(newSize);
  }
}

function handleFontFamilyChange(event) {
  const newFamily = event.target.value;
  editorConfig.fontFamily = newFamily;
  if (editor) {
    editor.setFontFamily(newFamily);
  }
}

function toggleLineWrapping(event) {
  const enabled = event.target.checked;
  editorConfig.isLineWrappingEnabled = enabled;
  if (editor) {
    editor.setLineWrappingEnabled(enabled);
  }
}

function toggleLineNumbers(event) {
  const enabled = event.target.checked;
  editorConfig.isLineNumbersDisplayed = enabled;
  if (editor) {
    editor.setLineNumbersDisplayed(enabled);
  }
}

function toggleBracketMatching(event) {
  const enabled = event.target.checked;
  editorConfig.isBracketMatchingEnabled = enabled;
  if (editor) {
    editor.setBracketMatchingEnabled(enabled);
  }
}

function toggleBracketClosing(event) {
  const enabled = event.target.checked;
  editorConfig.isBracketClosingEnabled = enabled;
  if (editor) {
    editor.setBracketClosingEnabled(enabled);
  }
}

function toggleAutocompletion(event) {
  const enabled = event.target.checked;
  editorConfig.isAutoCompletionEnabled = enabled;
  if (editor) {
    editor.setAutocompletionEnabled(enabled);
  }
}

function handleThemeChange(event) {
  const newTheme = event.target.value;
  editorConfig.theme = newTheme;
  if (editor) {
    editor.setTheme(newTheme);
  }
}

function showAvailableThemes() {
  if (editor) {
    const availableThemes = Object.keys(themes || {});
    console.log("Available themes:", availableThemes);
  }
}

function toggleFlash(event) {
  const enabled = event.target.checked;
  editorConfig.isFlashEnabled = enabled;
  if (editor) {
    editor.updateSettings({ isFlashEnabled: enabled });
  }
}

function toggleSliders(event) {
  const enabled = event.target.checked;
  strudelSettings.slidersEnabled = enabled;
}

function toggleTooltips(event) {
  const enabled = event.target.checked;
  editorConfig.isTooltipEnabled = enabled;
  if (editor) {
    editor.updateSettings({ isTooltipEnabled: enabled });
  }
}

/**
 * Handle errors
 */
function handleError(error) {
  const message = error?.message || error || "Unknown error";
  console.error(`Error: ${message}`);
  status.value = "stopped";
}

/**
 * Initialize the playground
 */
onMounted(async () => {
  await initializeEditor();
  console.log(editor);
});

/**
 * Clean up editor when component unmounts
 */
onBeforeUnmount(() => {
  if (editor) {
    editor.destroy();
  }
});

watch(
  () => currentCode.value,
  (newCode) => {
    if (editor && editor.getCode() !== newCode) {
      editor.setCode(newCode);
    }
  },
  { immediate: false }
);

//this is how we get access to all the loaded samples
const sounds = useStore(soundMap);
console.log(sounds);
</script>

<template>
  <!-- Main app container with status indicator -->
  <div id="app">
    <!-- Status indicator showing current playback state -->
    <div class="status-indicator" :class="status">
      {{ statusText }}
    </div>

    <!-- Main content area -->
    <div class="container">
      <!-- Left side: Code editor -->
      <div class="editor-container">
        <div ref="editorRoot" class="strudel-editor"></div>
      </div>

      <!-- Right side: Controls -->
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
            <label>Font Size: {{ editorConfig.fontSize }}px</label>
            <input
              type="range"
              min="10"
              max="24"
              step="1"
              :value="editorConfig.fontSize"
              @input="handleFontSizeChange"
              class="slider"
            />
          </div>

          <!-- Font Family Selector -->
          <div class="setting-item">
            <label>Font Family:</label>
            <select
              @change="handleFontFamilyChange"
              v-model="editorConfig.fontFamily"
              class="font-select"
            >
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
                :checked="editorConfig.isLineWrappingEnabled"
                @change="toggleLineWrapping"
              />
              Line Wrapping
            </label>
            <label class="checkbox-item">
              <input
                type="checkbox"
                :checked="editorConfig.isLineNumbersDisplayed"
                @change="toggleLineNumbers"
              />
              Line Numbers
            </label>
            <label class="checkbox-item">
              <input
                type="checkbox"
                :checked="editorConfig.isBracketMatchingEnabled"
                @change="toggleBracketMatching"
              />
              Bracket Matching
            </label>
            <label class="checkbox-item">
              <input
                type="checkbox"
                :checked="editorConfig.isBracketClosingEnabled"
                @change="toggleBracketClosing"
              />
              Auto Bracket Closing
            </label>
            <label class="checkbox-item">
              <input
                type="checkbox"
                :checked="editorConfig.isAutoCompletionEnabled"
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
              v-model="editorConfig.theme"
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
          <button @click="showRepl" class="advanced-btn">
            Show REPL State
          </button>
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
                :checked="editorConfig.isFlashEnabled"
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
                :checked="editorConfig.isTooltipEnabled"
                @change="toggleTooltips"
              />
              Tooltips
            </label>
          </div>
        </div>

        <div class="sample-list">
          <details>
            <summary>
              <h4>Avaliable Samples</h4>
            </summary>
            <ul class="">
              <li v-for="(sound, value) in sounds">
                <span>{{ value }}</span>
              </li>
            </ul>
          </details>
        </div>
      </nav>
    </div>
  </div>
</template>
