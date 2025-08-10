<template>
  <!-- Container for the StrudelMirror editor -->
  <div ref="editorRoot" class="strudel-editor" @click="focusEditor"></div>
</template>

<script setup>
/**
 * StrudelEditor Component
 *
 * This component wraps the StrudelMirror editor from @strudel/codemirror
 * It provides:
 * - Syntax highlighting for Strudel patterns
 * - Code evaluation and transpilation
 * - Integration with Strudel's REPL system
 * - Real-time pattern visualization
 * - Error handling and reporting
 *
 * StrudelMirror is built on top of CodeMirror 6 and provides
 * specialized features for live coding with Strudel patterns.
 */

import { ref, reactive, onMounted, onBeforeUnmount, watch } from "vue";
import { StrudelMirror } from "@strudel/codemirror";
import { evalScope } from "@strudel/core";
import { transpiler } from "@strudel/transpiler";
import {
  getAudioContext,
  webaudioOutput,
  initAudioOnFirstClick,
  registerSynthSounds,
} from "@strudel/webaudio";
import { registerSoundfonts } from "@strudel/soundfonts";
import { activateTheme, themes } from "@strudel/codemirror";

// Props for parent-child communication
const props = defineProps({
  // v-model support for code content
  code: {
    type: String,
    default: "",
  },
});

// Events emitted to parent component
const emit = defineEmits([
  "update:code", // v-model update
  "error", // Error occurred
  "success", // Successful evaluation
  "draw", // Drawing/visualization update
]);

// Component refs
const editorRoot = ref(null);

// Component state
const editor = ref(null);
const isInitialized = ref(false);

// StrudelMirror editor settings - expose for modification
const editorConfig = reactive({
  fontSize: 10,
  fontFamily: "monospace",
  theme: "dracula",
  isBracketMatchingEnabled: false,
  isBracketClosingEnabled: true,
  isLineNumbersDisplayed: true,
  isActiveLineHighlighted: false,
  isAutoCompletionEnabled: false,
  isPatternHighlightingEnabled: true,
  isFlashEnabled: true,
  isTooltipEnabled: false,
  isLineWrappingEnabled: false,
  isTabIndentationEnabled: false,
  isMultiCursorEnabled: false,
});

/**
 * Initialize the StrudelMirror editor with all necessary configuration
 */
async function initializeEditor() {
  try {
    // Ensure we have a DOM element to mount to
    if (!editorRoot.value) {
      throw new Error("Editor root element not found");
    }

    // Initialize audio on first click (browser requirement)
    initAudioOnFirstClick();

    /**
     * StrudelMirror Configuration
     *
     * StrudelMirror is the main editor component that combines:
     * - CodeMirror 6 for text editing
     * - Strudel's transpiler for pattern compilation
     * - Web Audio output for sound generation
     * - Real-time visualization callbacks
     */
    editor.value = new StrudelMirror({
      // Audio output configuration
      defaultOutput: webaudioOutput, // Use Web Audio API for sound

      // Time source for synchronization
      getTime: () => getAudioContext().currentTime,

      // Transpiler for converting patterns to executable code
      transpiler,

      // DOM element to mount the editor
      root: editorRoot.value,

      // Initial code content
      initialCode: props.code,

      // Time window for visualization (2 seconds before and after current time)

      /**
       * Drawing callback - called for each frame of visualization
       * @param {Array} haps - Array of musical events (happenings)
       * @param {number} time - Current time in seconds
       */
      onDraw: (haps, time) => {
        // Emit drawing data to parent component for visualization
        emit("draw", haps, time);
      },

      /**
       * Code change callback - called when user edits code
       * @param {string} code - Current code content
       */
      onCode: (code) => {
        // Emit code changes for v-model support
        emit("update:code", code);
      },

      /**
       * Error callback - called when pattern compilation/evaluation fails
       * @param {Error} error - The error that occurred
       */
      onError: (error) => {
        // Emit error to parent component
        emit("error", error);
      },

      /**
       * Prebake function - runs before editor is fully ready
       * This is where we load all the Strudel modules and sound libraries
       * that will be available in the pattern code
       */
      prebake: async () => {
        try {
          /**
           * Load Strudel Modules
           *
           * evalScope loads modules into the global scope where patterns run.
           * This makes functions like note(), s(), stack(), etc. available.
           *
           * Key modules:
           * - @strudel/core: Basic pattern functions and combinators
           * - @strudel/mini: Mini notation shortcuts and syntax sugar
           * - @strudel/tonal: Music theory functions (scales, chords, etc.)
           * - @strudel/webaudio: Web Audio synthesis and effects
           */
          const loadModules = evalScope(
            import("@strudel/core"),
            import("@strudel/mini"),
            import("@strudel/tonal"),
            import("@strudel/webaudio")
          );

          /**
           * Load Sound Libraries
           *
           * These provide the actual sounds that patterns can use:
           * - registerSynthSounds(): Built-in synthesizers (sine, sawtooth, etc.)
           * - registerSoundfonts(): General MIDI instrument samples
           */
          await Promise.all([
            loadModules,
            registerSynthSounds(),
            registerSoundfonts(),
          ]);

          // Notify parent that initialization completed successfully
          emit("success", "Editor initialized successfully");
        } catch (error) {
          emit(
            "error",
            new Error(`Failed to initialize editor: ${error.message}`)
          );
          throw error;
        }
      },
    });

    // Apply initial editor configuration using StrudelMirror's updateSettings method
    editor.value.updateSettings(editorConfig);

    isInitialized.value = true;
  } catch (error) {
    emit("error", new Error(`Editor initialization failed: ${error.message}`));
    throw error;
  }
}

/**
 * Evaluate the current code in the editor
 * This compiles and starts playing the pattern
 */
async function evaluate() {
  if (!editor.value || !isInitialized.value) {
    throw new Error("Editor not initialized");
  }

  try {
    // Call StrudelMirror's evaluate method
    // This will:
    // 1. Get the current code from the editor
    // 2. Transpile it using the Strudel transpiler
    // 3. Evaluate it in the pattern context
    // 4. Start audio playback
    // 5. Begin visualization updates

    // Debug: Test font size setting
    // editor.value.setFontSize(12);
    // console.log("editor", editor.value);
    await editor.value.evaluate();

    emit("success", "Pattern evaluation successful");
  } catch (error) {
    // If evaluation fails, emit the error to parent
    emit("error", new Error(`Evaluation failed: ${error.message}`));
    throw error;
  }
}

/**
 * Stop the current pattern playback
 */
function stop() {
  if (!editor.value) return;

  try {
    // Stop the pattern and clear any scheduled events
    editor.value.stop();
    emit("success", "Pattern stopped");
  } catch (error) {
    emit("error", new Error(`Failed to stop pattern: ${error.message}`));
    throw error;
  }
}

/**
 * Get the current code from the editor
 */
function getCode() {
  return editor.value ? editor.value.getCode() : "";
}

/**
 * Set the code in the editor
 */
function setCode(code) {
  if (editor.value) {
    editor.value.setCode(code);
  }
}

/**
 * Focus the editor (for better UX)
 */
function focusEditor() {
  if (editor.value && editor.value.focus) {
    editor.value.focus();
  }
}

// Expose methods to parent component
defineExpose({
  // Core playback controls
  evaluate,
  start: () => editor.value?.start(),
  stop,
  toggle: () => editor.value?.toggle(),

  // Code management
  getCode,
  setCode,

  // Pattern and tempo controls
  setCps: (cps) => {
    if (editor.value?.repl?.setCps) {
      editor.value.repl.setCps(cps);
      emit("success", `Tempo set to ${cps} CPS`);
    }
  },

  setPattern: (pattern, keepTime = true) => {
    if (editor.value?.repl?.setPattern) {
      editor.value.repl.setPattern(pattern, keepTime);
      emit("success", "Pattern set directly");
    }
  },

  // REPL access for advanced usage
  getRepl: () => editor.value?.repl,

  // Editor state and info
  getState: () => editor.value?.repl?.state,
  isPlaying: () => editor.value?.repl?.scheduler?.started || false,

  // Editor focus and interaction
  focusEditor,

  // Direct access to editor instance for advanced operations
  getEditor: () => editor.value,

  // Editor configuration methods
  setLineWrappingEnabled: (enabled) => {
    if (editor.value?.setLineWrappingEnabled) {
      editor.value.setLineWrappingEnabled(enabled);
      emit("success", `Line wrapping ${enabled ? "enabled" : "disabled"}`);
    }
  },

  setLineNumbersDisplayed: (enabled) => {
    if (editor.value?.setLineNumbersDisplayed) {
      editor.value.setLineNumbersDisplayed(enabled);
      emit("success", `Line numbers ${enabled ? "enabled" : "disabled"}`);
    }
  },

  setFontSize: (size) => {
    try {
      if (editor.value) {
        // Use StrudelMirror's built-in setFontSize method
        editor.value.setFontSize(size);
        editorConfig.fontSize = size;
        emit(
          "success",
          `Font size set to ${size}px using StrudelMirror.setFontSize()`
        );
      }
    } catch (error) {
      emit("error", new Error(`Failed to set font size: ${error.message}`));
    }
  },

  setFontFamily: (family) => {
    try {
      if (editor.value) {
        // Use StrudelMirror's built-in setFontFamily method
        editor.value.setFontFamily(family);
        editorConfig.fontFamily = family;
        emit(
          "success",
          `Font family set to ${family} using StrudelMirror.setFontFamily()`
        );
      }
    } catch (error) {
      emit("error", new Error(`Failed to set font family: ${error.message}`));
    }
  },

  setBracketMatchingEnabled: (enabled) => {
    try {
      if (editor.value) {
        // Use StrudelMirror's built-in setBracketMatchingEnabled method
        editor.value.setBracketMatchingEnabled(enabled);
        editorConfig.isBracketMatchingEnabled = enabled;
        emit(
          "success",
          `Bracket matching ${
            enabled ? "enabled" : "disabled"
          } using StrudelMirror.setBracketMatchingEnabled()`
        );
      }
    } catch (error) {
      emit(
        "error",
        new Error(`Failed to set bracket matching: ${error.message}`)
      );
    }
  },

  setBracketClosingEnabled: (enabled) => {
    try {
      if (editor.value) {
        // Use StrudelMirror's built-in setBracketClosingEnabled method
        editor.value.setBracketClosingEnabled(enabled);
        editorConfig.isBracketClosingEnabled = enabled;
        emit(
          "success",
          `Auto bracket closing ${
            enabled ? "enabled" : "disabled"
          } using StrudelMirror.setBracketClosingEnabled()`
        );
      }
    } catch (error) {
      emit(
        "error",
        new Error(`Failed to set bracket closing: ${error.message}`)
      );
    }
  },

  setAutocompletionEnabled: (enabled) => {
    try {
      if (editor.value) {
        // Use StrudelMirror's built-in setAutocompletionEnabled method
        editor.value.setAutocompletionEnabled(enabled);
        editorConfig.isAutoCompletionEnabled = enabled;
        emit(
          "success",
          `Autocompletion ${
            enabled ? "enabled" : "disabled"
          } using StrudelMirror.setAutocompletionEnabled()`
        );
      }
    } catch (error) {
      emit(
        "error",
        new Error(`Failed to set autocompletion: ${error.message}`)
      );
    }
  },

  setTheme: (theme) => {
    try {
      if (themes[theme]) {
        // Use StrudelMirror's built-in setTheme method
        editor.value.setTheme(theme);
        editorConfig.theme = theme;
        emit(
          "success",
          `Theme changed to ${theme} using StrudelMirror.setTheme()`
        );
      } else {
        emit(
          "error",
          new Error(
            `Theme '${theme}' not found. Available themes: ${Object.keys(
              themes
            ).join(", ")}`
          )
        );
      }
    } catch (error) {
      emit("error", new Error(`Failed to set theme: ${error.message}`));
    }
  },

  setLineWrappingEnabled: (enabled) => {
    try {
      if (editor.value) {
        // Use StrudelMirror's built-in setLineWrappingEnabled method
        editor.value.setLineWrappingEnabled(enabled);
        editorConfig.isLineWrappingEnabled = enabled;
        emit(
          "success",
          `Line wrapping ${
            enabled ? "enabled" : "disabled"
          } using StrudelMirror.setLineWrappingEnabled()`
        );
      }
    } catch (error) {
      emit("error", new Error(`Failed to set line wrapping: ${error.message}`));
    }
  },

  setLineNumbersDisplayed: (enabled) => {
    try {
      if (editor.value) {
        // Use StrudelMirror's built-in setLineNumbersDisplayed method
        editor.value.setLineNumbersDisplayed(enabled);
        editorConfig.isLineNumbersDisplayed = enabled;
        emit(
          "success",
          `Line numbers ${
            enabled ? "enabled" : "disabled"
          } using StrudelMirror.setLineNumbersDisplayed()`
        );
      }
    } catch (error) {
      emit("error", new Error(`Failed to set line numbers: ${error.message}`));
    }
  },

  // Expose the editor configuration for external modification
  getEditorConfig: () => editorConfig,
  updateEditorConfig: (newConfig) => {
    try {
      if (editor.value) {
        Object.assign(editorConfig, newConfig);
        editor.value.updateSettings(editorConfig);
        emit("success", "Editor configuration updated");
      }
    } catch (error) {
      emit(
        "error",
        new Error(`Failed to update editor config: ${error.message}`)
      );
    }
  },
});

/**
 * Watch for external code changes and sync with editor
 */
watch(
  () => props.code,
  (newCode) => {
    if (editor.value && editor.value.getCode() !== newCode) {
      editor.value.setCode(newCode);
    }
  },
  { immediate: false }
);

/**
 * Initialize the StrudelMirror editor when component mounts
 */
onMounted(async () => {
  await initializeEditor();
});

/**
 * Clean up editor when component unmounts
 */
onBeforeUnmount(() => {
  if (editor.value) {
    editor.value.destroy();
  }
});
</script>

<style scoped>
/**
 * Styles for the StrudelEditor component
 */
.strudel-editor {
  /* Fill the available space */
  width: 100%;
  height: 100%;

  /* Ensure the editor is interactive */
  position: relative;
  cursor: text;
}

/**
 * StrudelMirror will inject its own styles, but we can customize
 * the container and provide fallbacks
 */
</style>
