// Direct DOM manipulation approach for Strudel editor note coloring

// Note to hue mapping based on chromatic circle (360/12 = 30 degrees per semitone)
const NOTE_COLORS = {
  'C': 0,   // Red
  'C#': 30, 'Db': 30,  // Red-Orange
  'D': 60,  // Orange
  'D#': 90, 'Eb': 90,  // Yellow-Orange
  'E': 120, // Yellow
  'F': 150, // Yellow-Green
  'F#': 180, 'Gb': 180, // Green
  'G': 210, // Blue-Green
  'G#': 240, 'Ab': 240, // Blue
  'A': 270, // Blue-Purple
  'A#': 300, 'Bb': 300, // Purple
  'B': 330, // Red-Purple
};

// Generate and inject CSS styles
function injectNoteStyles() {
  // Remove existing styles
  const existingStyle = document.getElementById('strudel-note-styles');
  if (existingStyle) {
    existingStyle.remove();
  }

  let styles = '';
  
  // Note styles with chromatic coloring - override Strudel's default outline styles
  Object.entries(NOTE_COLORS).forEach(([note, hue]) => {
    const className = note.replace('#', 'sharp').toLowerCase();
    styles += `
      .cm-content .strudel-note-${className},
      .cm-line .strudel-note-${className},
      span.strudel-note-${className} {
        color: hsl(${hue}, 70%, 60%) !important;
        font-weight: 600 !important;
        outline: none !important;
        border: none !important;
        background: transparent !important;
      }
    `;
  });
  
  // Duration markers in gray
  styles += `
    .strudel-duration {
      color: hsl(0, 0%, 50%) !important;
      font-weight: normal !important;
    }
    .strudel-rest {
      color: hsl(0, 0%, 40%) !important;
      font-weight: normal !important;
    }
  `;
  
  const styleSheet = document.createElement('style');
  styleSheet.id = 'strudel-note-styles';
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}

// Wait for Strudel editor to be ready and start highlighting
export function initializeNoteHighlighting(container: HTMLElement) {
  injectNoteStyles();

  let highlightInterval: number | null = null;
  let observer: MutationObserver | null = null;

  // Function to highlight notes in the editor
  function highlightNotes() {
    const cmContent = container.querySelector('.cm-content');
    if (!cmContent) return;

    // Remove existing highlights
    cmContent.querySelectorAll('[class*="strudel-note-"], [class*="strudel-duration"], [class*="strudel-rest"]').forEach(span => {
      const parent = span.parentNode;
      if (parent && span.textContent) {
        parent.replaceChild(document.createTextNode(span.textContent), span);
      }
    });

    // Normalize text nodes
    cmContent.normalize();

    // Process each line
    const lines = cmContent.querySelectorAll('.cm-line');
    lines.forEach(line => {
      processLineForHighlighting(line);
    });
  }

  // Process a single line for note highlighting
  function processLineForHighlighting(line: Element) {
    const walker = document.createTreeWalker(
      line,
      NodeFilter.SHOW_TEXT,
      null
    );

    const textNodes: Text[] = [];
    let node = walker.nextNode() as Text;
    while (node) {
      textNodes.push(node);
      node = walker.nextNode() as Text;
    }

    // Process text nodes in reverse order to maintain positions
    textNodes.reverse().forEach(textNode => {
      const text = textNode.textContent || '';
      const matches: Array<{start: number, end: number, type: string, note?: string}> = [];

      // Find notes (C, C#, Db, etc. optionally followed by numbers)
      const noteRegex = /\b([A-G][#b]?)(\d*)/g;
      let match;
      while ((match = noteRegex.exec(text)) !== null) {
        const noteName = match[1];
        if (NOTE_COLORS[noteName]) {
          matches.push({
            start: match.index,
            end: match.index + match[0].length,
            type: 'note',
            note: noteName
          });
        }
      }

      // Find durations (@0.083, @1, etc.)
      const durationRegex = /@[\d.]+/g;
      while ((match = durationRegex.exec(text)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          type: 'duration'
        });
      }

      // Find rests (~)
      const restRegex = /~/g;
      while ((match = restRegex.exec(text)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          type: 'rest'
        });
      }

      // Apply highlights in reverse order
      matches.sort((a, b) => b.start - a.start);
      matches.forEach(({ start, end, type, note }) => {
        wrapTextWithSpan(textNode, start, end, type, note);
      });
    });
  }

  // Wrap text range with colored span
  function wrapTextWithSpan(textNode: Text, start: number, end: number, type: string, note?: string) {
    try {
      const text = textNode.textContent || '';
      const beforeText = text.substring(0, start);
      const highlightText = text.substring(start, end);
      const afterText = text.substring(end);

      const span = document.createElement('span');
      
      if (type === 'note' && note) {
        span.className = `strudel-note-${note.replace('#', 'sharp').toLowerCase()}`;
      } else if (type === 'duration') {
        span.className = 'strudel-duration';
      } else if (type === 'rest') {
        span.className = 'strudel-rest';
      }
      
      span.textContent = highlightText;

      const parent = textNode.parentNode;
      if (parent) {
        const fragment = document.createDocumentFragment();
        
        if (beforeText) {
          fragment.appendChild(document.createTextNode(beforeText));
        }
        fragment.appendChild(span);
        if (afterText) {
          fragment.appendChild(document.createTextNode(afterText));
        }
        
        parent.replaceChild(fragment, textNode);
      }
    } catch (error) {
      console.warn('Error wrapping text with span:', error);
    }
  }

  // Start highlighting when editor is ready
  function startHighlighting() {
    if (highlightInterval) {
      clearInterval(highlightInterval);
    }
    
    // Initial highlight
    highlightNotes();
    
    // Set up periodic highlighting
    highlightInterval = window.setInterval(highlightNotes, 500);
  }

  // Watch for when the CodeMirror editor appears
  observer = new MutationObserver((mutations) => {
    const hasEditor = container.querySelector('.cm-content');
    if (hasEditor) {
      startHighlighting();
      // Stop observing once we find the editor
      if (observer) {
        observer.disconnect();
        observer = null;
      }
    }
  });

  observer.observe(container, {
    childList: true,
    subtree: true
  });

  // Also check immediately in case editor is already there
  if (container.querySelector('.cm-content')) {
    startHighlighting();
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  // Cleanup function
  return () => {
    if (highlightInterval) {
      clearInterval(highlightInterval);
    }
    if (observer) {
      observer.disconnect();
    }
  };
}