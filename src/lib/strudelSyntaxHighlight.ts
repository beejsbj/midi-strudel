import { EditorView } from "@codemirror/view";
import { Extension } from "@codemirror/state";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";

// Chromatic circle color mapping: 360° / 12 semitones = 30° per semitone
const NOTE_COLORS = {
  c: "hsl(0, 70%, 60%)",    // C = 0°
  d: "hsl(30, 70%, 60%)",   // D = 30°
  e: "hsl(60, 70%, 60%)",   // E = 60°
  f: "hsl(90, 70%, 60%)",   // F = 90°
  g: "hsl(120, 70%, 60%)",  // G = 120°
  a: "hsl(150, 70%, 60%)",  // A = 150°
  b: "hsl(180, 70%, 60%)",  // B = 180°
  // Also handle flats and sharps
  "c#": "hsl(15, 70%, 60%)",   // C# = 15°
  db: "hsl(15, 70%, 60%)",     // Db = 15°
  "d#": "hsl(45, 70%, 60%)",   // D# = 45°
  eb: "hsl(45, 70%, 60%)",     // Eb = 45°
  "f#": "hsl(105, 70%, 60%)",  // F# = 105°
  gb: "hsl(105, 70%, 60%)",    // Gb = 105°
  "g#": "hsl(135, 70%, 60%)",  // G# = 135°
  ab: "hsl(135, 70%, 60%)",    // Ab = 135°
  "a#": "hsl(165, 70%, 60%)",  // A# = 165°
  bb: "hsl(165, 70%, 60%)",    // Bb = 165°
};

// Create CSS styles for note highlighting
const createNoteStyles = () => {
  const styles = Object.entries(NOTE_COLORS)
    .map(([note, color]) => 
      `.cm-note-${note.replace('#', 'sharp')} { color: ${color} !important; font-weight: 600; }`
    )
    .join('\n');
  
  return `
    ${styles}
    .cm-duration { color: hsl(var(--muted-foreground)) !important; opacity: 0.7; }
    .cm-rest { color: hsl(var(--muted-foreground)) !important; opacity: 0.5; }
  `;
};

// Custom highlight style for Strudel syntax
const strudelHighlightStyle = HighlightStyle.define([
  // Default syntax highlighting
  { tag: tags.keyword, color: "hsl(var(--primary))" },
  { tag: tags.string, color: "hsl(var(--accent))" },
  { tag: tags.number, color: "hsl(var(--secondary))" },
  { tag: tags.operator, color: "hsl(var(--muted-foreground))" },
  { tag: tags.punctuation, color: "hsl(var(--muted-foreground))" },
  { tag: tags.comment, color: "hsl(var(--muted-foreground))", fontStyle: "italic" },
]);

// Create the extension that adds custom note coloring
export function createNoteHighlightExtension(): Extension {
  // Inject CSS styles
  const styleElement = document.createElement('style');
  styleElement.textContent = createNoteStyles();
  document.head.appendChild(styleElement);

  return [
    syntaxHighlighting(strudelHighlightStyle),
    EditorView.theme({
      "&": {
        fontSize: "14px",
        fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace",
      },
      ".cm-content": {
        padding: "16px",
        backgroundColor: "hsl(var(--background))",
        color: "hsl(var(--foreground))",
        caretColor: "hsl(var(--primary))",
      },
      ".cm-focused": {
        outline: "none",
      },
      ".cm-editor": {
        borderRadius: "8px",
        border: "1px solid hsl(var(--border))",
        backgroundColor: "hsl(var(--background))",
      },
      ".cm-scroller": {
        fontFamily: "inherit",
      },
      ".cm-line": {
        padding: "0 2px",
      },
      ".cm-activeLine": {
        backgroundColor: "hsl(var(--accent) / 0.1)",
      },
      ".cm-selectionBackground": {
        backgroundColor: "hsl(var(--primary) / 0.2) !important",
      },
      ".cm-cursor": {
        borderLeftColor: "hsl(var(--primary))",
      },
    }),
    // Custom decoration extension for notes and durations
    EditorView.updateListener.of((update) => {
      if (update.docChanged || update.viewportChanged) {
        addNoteDecorations(update.view);
      }
    }),
  ];
}

// Function to add decorations for notes and durations
function addNoteDecorations(view: EditorView) {
  const doc = view.state.doc;
  
  // Remove previous note/duration classes
  const elements = view.dom.querySelectorAll('[class*="cm-note-"], .cm-duration, .cm-rest');
  elements.forEach(el => {
    el.className = el.className.replace(/\bcm-(?:note-\w+|duration|rest)\b/g, '');
  });
  
  // Parse the document for notes and durations
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;
    
    // Match notes (including sharps/flats and octave numbers) and durations
    const noteRegex = /\b([a-g][#b]?\d*)\b/gi;
    const durationRegex = /@[\d.]+/g;
    const restRegex = /\b~\b/g;
    
    let match;
    
    // Highlight notes
    while ((match = noteRegex.exec(text)) !== null) {
      const noteStart = line.from + match.index;
      const noteEnd = noteStart + match[0].length;
      const noteName = match[1].toLowerCase().replace(/\d+$/, ''); // Remove octave numbers
      
      if (NOTE_COLORS[noteName as keyof typeof NOTE_COLORS]) {
        highlightRange(view, noteStart, noteEnd, `cm-note-${noteName.replace('#', 'sharp')}`);
      }
    }
    
    // Highlight durations
    while ((match = durationRegex.exec(text)) !== null) {
      const durationStart = line.from + match.index;
      const durationEnd = durationStart + match[0].length;
      highlightRange(view, durationStart, durationEnd, 'cm-duration');
    }
    
    // Highlight rests
    while ((match = restRegex.exec(text)) !== null) {
      const restStart = line.from + match.index;
      const restEnd = restStart + match[0].length;
      highlightRange(view, restStart, restEnd, 'cm-rest');
    }
  }
}

// Helper function to highlight a range with a CSS class
function highlightRange(view: EditorView, from: number, to: number, className: string) {
  try {
    const fromCoords = view.coordsAtPos(from);
    const toCoords = view.coordsAtPos(to);
    
    if (!fromCoords || !toCoords) return;
    
    // Find the text node that contains this range
    const walker = document.createTreeWalker(
      view.contentDOM,
      NodeFilter.SHOW_TEXT,
      null
    );
    
    let textNode;
    let currentPos = 0;
    
    while ((textNode = walker.nextNode())) {
      const nodeLength = textNode.textContent?.length || 0;
      const nodeStart = currentPos;
      const nodeEnd = currentPos + nodeLength;
      
      if (from >= nodeStart && from < nodeEnd) {
        // Found the text node containing our range
        const parent = textNode.parentElement;
        if (parent && !parent.classList.contains(className)) {
          parent.classList.add(className);
        }
        break;
      }
      
      currentPos = nodeEnd;
    }
  } catch (error) {
    // Silently ignore positioning errors
    console.debug('Note highlighting error:', error);
  }
}