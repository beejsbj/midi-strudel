import type { ExampleMidi } from '../../hooks/useProjectState';

export const EXAMPLE_MIDIS: readonly ExampleMidi[] = [
  {
    id: 'ruthlessness',
    url: '/examples/ruthlessness-epic-the-musical.mid',
    fileName: 'Ruthlessness (Epic The Musical).mid',
    label: 'Ruthlessness',
    detail: 'A smaller example that loads quickly and shows the shape of the app fast.',
    sourceUrl: 'https://onlinesequencer.net/3897560',
  },
  {
    id: 'warrior-of-the-mind',
    url: '/examples/warrior-of-the-mind-epic-the-musical.mid',
    fileName: 'Warrior of the Mind (Epic The Musical).mid',
    label: 'Warrior of the Mind',
    detail: 'A much denser example MIDI. It is great for stress-testing, but the conversion does not work as cleanly because the arrangement is so much more complex.',
    sourceUrl: 'https://onlinesequencer.net/4782267',
  },
] as const;

export const RUTHLESSNESS_EXAMPLE_SNIPPET = `$EXAMPLE_MELODY: \`<
E6@0.0833 D6@0.0833 C6@0.0833 D6@0.0833
C6@0.0833 B5@0.0833 C6@0.0833 B5@0.0833
A5@0.0833 B5@0.0833 A5@0.0833 G5@0.0833
>\`
  .as("note")
  .sound("triangle").cps(135 / 60 / 4)
  ._pianoroll()`;
