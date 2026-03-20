import type { ExampleMidi } from '../../hooks/useProjectState';

const EXAMPLES_SOURCE_BASE_URL =
  'https://github.com/beejsbj/midi-strudel/blob/main/public/examples';

export const EXAMPLE_MIDIS: readonly ExampleMidi[] = [
  {
    id: 'lantern-loop',
    url: '/examples/lantern-loop.mid',
    fileName: 'Lantern Loop.mid',
    label: 'Lantern Loop',
    detail: 'A short original melody with a counterline. It loads quickly and shows the converter fast.',
    sourceUrl: `${EXAMPLES_SOURCE_BASE_URL}/lantern-loop.mid`,
  },
  {
    id: 'glass-garden',
    url: '/examples/glass-garden.mid',
    fileName: 'Glass Garden.mid',
    label: 'Glass Garden',
    detail: 'A denser original arrangement with chords, bass, and drums for a more realistic stress test.',
    sourceUrl: `${EXAMPLES_SOURCE_BASE_URL}/glass-garden.mid`,
  },
] as const;

export const LANTERN_LOOP_EXAMPLE_SNIPPET = `$LANTERN_LEAD: \`<
C5@0.125 E5@0.125 G5@0.125 A5@0.125
G5@0.125 E5@0.125 D5@0.125 C5@0.125
>\`
  .as("note")
  .sound("triangle").cps(118 / 60 / 4)
  ._pianoroll()`;
