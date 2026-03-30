import React, { Suspense, useState } from 'react';
import { ExternalLink, Loader2, Play } from 'lucide-react';
import { DropZone } from '../DropZone';
import { LazyCodeViewer } from '../codeViewer/LazyCodeViewer';
import { StrudelConfig } from '../../types';
import { EXAMPLE_MIDIS, RUTHLESSNESS_EXAMPLE_SNIPPET } from './examples';

interface Props {
  activeExampleId: string | null;
  config: StrudelConfig;
  isProcessing: boolean;
  onExampleLoad: (exampleId: string) => void;
  onFileLoaded: (file: File) => void;
}

const QUICK_START_STEPS = [
  {
    step: '1',
    title: 'get a .mid or .midi file',
    body: 'exported from a DAW, downloaded from MuseScore, ripped from a game - anything goes.',
  },
  {
    step: '2',
    title: 'drop it in - or try an example',
    body: 'drag into the upload box on the right, or load one of the examples to see what the output looks like first.',
  },
  {
    step: '3',
    title: 'see the code shape',
    body: 'you get strudel-ish code - notes as cycles, tracks as patterns. adjust the settings, then send it to the Strudel REPL.',
  },
] as const;

const EXAMPLE_CARD_META = {
  ruthlessness: {
    tag: 'full song / featured example',
    title: 'Ruthlessness',
    artist: 'Epic: The Musical',
    description:
      'the full Ruthlessness midi. more to scroll through, but still one of the cleaner conversions and a better sense of the actual output.',
    featured: true,
    tagTone: 'muted',
  },
  'warrior-of-the-mind': {
    tag: 'dense arrangement / messier output',
    title: 'Warrior of the Mind',
    artist: 'Epic: The Musical',
    description:
      "much denser - more tracks, more going on. the conversion gets messier, but that's the point. good stress test.",
    featured: false,
    tagTone: 'warm',
  },
} as const;

export function EmptyStateScreen({
  activeExampleId,
  config,
  isProcessing,
  onExampleLoad,
  onFileLoaded,
}: Props) {
  const [isMidiExplainerOpen, setIsMidiExplainerOpen] = useState(false);

  return (
    <div className="flex-1 overflow-y-auto bg-[#171710] text-[#ddd9c8]">
      <div className="mx-auto w-full max-w-[1240px] border-x border-[rgba(200,146,42,0.18)]">
        <header className="flex items-center justify-between border-b border-[rgba(200,146,42,0.18)] px-5 py-4 md:px-8">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#c8922a]">
            midi-strudel
          </span>
          <nav className="flex items-center gap-5 md:gap-6">
            <a
              href="https://strudel.cc"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono text-[11px] text-[#565450] no-underline transition-colors hover:text-[#c8922a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c8922a]"
            >
              strudel.cc
              <ExternalLink size={12} />
            </a>
            <a
              href="https://strudel.cc/learn/getting-started/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono text-[11px] text-[#565450] no-underline transition-colors hover:text-[#c8922a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c8922a]"
            >
              docs
              <ExternalLink size={12} />
            </a>
          </nav>
        </header>

        <div className="grid border-b-2 border-[rgba(200,146,42,0.18)] lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="border-b border-[rgba(200,146,42,0.18)] px-5 py-8 md:px-9 md:py-12 lg:border-b-0 lg:border-r">
          <div className="w-full max-w-[760px]">
            <div className="mb-11">
              <span className="mb-3 block font-mono text-[10px] uppercase tracking-[0.18em] text-[#c8922a]">
                a small tool i built
              </span>
              <h1 className="mb-3 max-w-[14ch] font-display text-[26px] font-bold leading-[1.1] tracking-[-0.015em] text-[#ddd9c8] md:text-[40px]">
                drop a MIDI file,
                <br />
                get strudel code.
              </h1>
              <p className="max-w-[400px] text-[13px] leading-[1.75] text-[#9a9484]">
                paste it into the strudel REPL and start live-coding from something real - instead of starting from scratch.
              </p>
            </div>

            <span className="mb-[18px] block font-mono text-[10px] uppercase tracking-[0.18em] text-[#c8922a]">
              how it works
            </span>

            <div>
              {QUICK_START_STEPS.map((item, index) => (
                <div
                  key={item.step}
                  className={`grid grid-cols-[40px_1fr] gap-x-3 border-t border-[rgba(200,146,42,0.18)] py-5 ${index === QUICK_START_STEPS.length - 1 ? 'border-b' : ''}`}
                >
                  <div className="pt-0.5 font-display text-[32px] font-bold leading-none text-[#7a5c1a]/55">
                    {item.step}
                  </div>
                  <div>
                    <div className="mb-1 font-display text-base font-bold leading-[1.25] text-[#ddd9c8]">
                      {item.title}
                    </div>
                    {index === 2 ? (
                      <div className="text-[12px] leading-[1.7] text-[#9a9484]">
                        you get strudel-ish code - notes as cycles, tracks as patterns. adjust the settings, then send it to the{' '}
                        <a
                          href="https://strudel.cc"
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#c8922a] underline decoration-[rgba(200,146,42,0.4)] underline-offset-4 transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c8922a]"
                        >
                          Strudel REPL
                        </a>
                        .
                      </div>
                    ) : (
                      <div className="text-[12px] leading-[1.7] text-[#9a9484]">{item.body}</div>
                    )}
                    {index === 0 && (
                      <div className="mt-[9px]">
                        <button
                          type="button"
                          aria-expanded={isMidiExplainerOpen}
                          onClick={() => setIsMidiExplainerOpen((value) => !value)}
                          className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#c8922a] opacity-75 transition-opacity hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c8922a]"
                        >
                          {isMidiExplainerOpen ? 'v' : '>'} what's a MIDI file?
                        </button>
                        {isMidiExplainerOpen && (
                          <div className="mt-2 rounded-[3px] border border-[rgba(200,146,42,0.18)] bg-[#0b0b07] px-[13px] py-[11px] text-[12px] leading-[1.7] text-[#9a9484]">
                            MIDI doesn't contain audio - it's closer to sheet music in binary form. it stores which notes play, when, and how long. if you've used GarageBand, Ableton, FL Studio, or MuseScore, you've already worked with them.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-[4px] border border-[rgba(200,146,42,0.18)] bg-[#131310] p-4">
              <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-[#c8922a]">
                and this is kind of what you get
              </span>
              <p className="mt-2 text-[12px] leading-[1.7] text-[#9a9484]">
                small preview only. for the fuller version, load the Ruthlessness example on the right.
              </p>
              <div className="mt-4 h-[240px] overflow-hidden rounded-[4px] border border-[rgba(200,146,42,0.18)] bg-[#0b0b07] md:h-[280px]">
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center bg-[#0b0b07] text-[#9a9484]">
                      <div className="flex items-center gap-2 font-display text-sm font-medium uppercase tracking-[0.14em]">
                        <Loader2 size={16} className="animate-spin text-[#c8922a]" />
                        <span>Loading preview...</span>
                      </div>
                    </div>
                  }
                >
                  <LazyCodeViewer
                    code={RUTHLESSNESS_EXAMPLE_SNIPPET}
                    durationTagStyle={config.durationTagStyle}
                    isNoteColoringEnabled={config.isNoteColoringEnabled}
                    isProgressiveFillEnabled={config.isProgressiveFillEnabled}
                    isPatternTextColoringEnabled={config.isPatternTextColoringEnabled}
                    showCopyButton={false}
                    showOpenExternalButton={false}
                    playerLabel="Ruthlessness / first track"
                  />
                </Suspense>
              </div>
            </div>

          </div>
        </section>

        <section className="bg-[#0f0f0a] px-5 py-7 md:px-7 md:py-9">
          <div className="mb-6 flex items-start gap-3 rounded-r-[3px] border-l-2 border-[#7a5c1a] bg-[rgba(200,146,42,0.08)] px-[15px] py-[13px]">
            <div className="pt-px font-mono text-[11px] text-[#9a9484]">note</div>
            <div className="font-mono text-[11px] leading-[1.7] tracking-[0.01em] text-[#9a9484]">
              <strong className="font-bold text-[#ddd9c8]">no AI involved</strong> - this is purely algorithmic. the conversion isn't always clean, especially with dense arrangements. treat the output as a rough starting point, not a finished translation.
            </div>
          </div>

          <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-[#c8922a]">
            upload your midi
          </span>

          <div className="relative mb-8 mt-[14px]">
            <DropZone onFileLoaded={onFileLoaded} />
            {isProcessing && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-[#0f0f0a]/82 backdrop-blur-sm">
                <p className="animate-pulse font-display text-sm font-medium uppercase tracking-[0.18em] text-[#c8922a]">
                  Parsing MIDI Data...
                </p>
              </div>
            )}
          </div>

          <hr className="mb-6 border-0 border-t border-[rgba(200,146,42,0.18)]" />

          <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-[#c8922a]">
            or try an example
          </span>
          <p className="mb-[14px] mt-[10px] text-[12px] leading-[1.65] text-[#9a9484]">
            two real MIDI files - different shapes, different densities.
          </p>

          <div className="space-y-[10px]">
            {EXAMPLE_MIDIS.map((example) => {
              const meta = EXAMPLE_CARD_META[example.id as keyof typeof EXAMPLE_CARD_META];
              const isActive = activeExampleId === example.id;
              const isDisabled = isProcessing;

              return (
                <article
                  key={example.id}
                  className={`rounded-[4px] border bg-[#131310] px-[15px] pb-3 pt-[14px] transition-colors ${
                    meta.featured
                      ? 'border-[#c8922a]'
                      : 'border-[rgba(200,146,42,0.18)] hover:border-[rgba(200,146,42,0.5)] hover:bg-[rgba(200,146,42,0.03)]'
                  } ${isActive ? 'ring-1 ring-[#c8922a]' : ''}`}
                >
                  <span className={`mb-[6px] block font-mono text-[9px] uppercase tracking-[0.11em] ${meta.tagTone === 'warm' ? 'text-[#7a5c1a]' : 'text-[#565450]'}`}>
                    {meta.tag}
                  </span>
                  <div className="mb-px font-display text-[14px] font-bold leading-[1.3] text-[#ddd9c8]">
                    {meta.title}
                  </div>
                  <div className="mb-2 font-mono text-[10px] tracking-[0.05em] text-[#565450]">
                    {meta.artist}
                  </div>
                  <div className="mb-[11px] text-[12px] leading-[1.6] text-[#9a9484]">
                    {meta.description}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <a
                      href={example.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.04em] text-[#565450] no-underline transition-colors hover:text-[#c8922a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c8922a]"
                    >
                      midi source
                      <ExternalLink size={10} />
                    </a>
                    <button
                      type="button"
                      onClick={() => onExampleLoad(example.id)}
                      disabled={isDisabled}
                      className={`inline-flex items-center gap-1.5 rounded-[3px] px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.05em] transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c8922a] ${
                        isDisabled
                          ? 'cursor-not-allowed bg-[rgba(200,146,42,0.25)] text-[#0f0f0a]/60'
                          : 'bg-[#c8922a] text-[#0f0f0a] hover:opacity-80'
                      }`}
                    >
                      {isActive && isProcessing ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          loading...
                        </>
                      ) : (
                        <>
                          <Play size={12} fill="currentColor" />
                          load example
                        </>
                      )}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>

        <section className="bg-[#111109] px-5 py-9 md:px-9 md:py-12">
          <div className="w-full max-w-[1080px]">
            <span className="mb-9 block font-mono text-[10px] uppercase tracking-[0.18em] text-[#c8922a] opacity-70">
              the backstory
            </span>

            <div className="overflow-hidden rounded-[4px] border border-[rgba(200,146,42,0.18)] bg-[rgba(200,146,42,0.18)]">
              <div className="grid gap-px bg-[rgba(200,146,42,0.18)] md:grid-cols-2">
                <div className="bg-[#111109] px-[26px] py-7">
                  <h3 className="mb-[14px] font-mono text-[10px] uppercase tracking-[0.16em] text-[#c8922a]/85">
                    why this exists
                  </h3>
                  <p className="mb-[12px] text-[13px] leading-[1.78] text-[#9a9484]">
                    i got way too into Epic: The Musical and wanted to see those melodies as strudel code instead of a piano roll. that was the whole spark.
                  </p>
                  <p className="mb-[12px] text-[13px] leading-[1.78] text-[#9a9484]">
                    then vibe coding made it easy to keep poking at it. it stopped being a one-off experiment and slowly became a fun little tool for studying melodies and hearing them back in a different form.
                  </p>
                  <p className="text-[13px] leading-[1.78] text-[#9a9484]">
                    along the way it became a useful excuse to play with gemini, claude, and gpt as actual dev tools and see what kind of workflow they were good for.
                  </p>
                </div>

                <div className="bg-[#111109] px-[26px] py-7">
                  <h3 className="mb-[14px] font-mono text-[10px] uppercase tracking-[0.16em] text-[#c8922a]/85">
                    what strudel is
                  </h3>
                  <p className="mb-[12px] text-[13px] leading-[1.78] text-[#9a9484]">
                    <a
                      href="https://strudel.cc"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#c8922a] underline decoration-[rgba(200,146,42,0.4)] underline-offset-4 transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c8922a]"
                    >
                      strudel
                    </a>{' '}
                    is a browser-based live coding environment for music. instead of a piano roll, you describe repeating patterns and cycles in code.
                  </p>
                  <p className="mb-[14px] text-[13px] leading-[1.78] text-[#9a9484]">
                    a melody becomes a string of note names and durations. a chord is a bracket group. a rest is a{' '}
                    <span className="inline-flex rounded-[3px] border border-[rgba(200,146,42,0.18)] bg-[rgba(200,146,42,0.08)] px-1.5 py-0.5 font-mono text-[11px] text-[#c8922a]">
                      ~
                    </span>
                    . everything is a pattern you can transform, reverse, stack, or slow down, in code, in real time.
                  </p>
                  <a
                    href="https://strudel.cc/learn/getting-started/"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[13px] font-medium text-[#c8922a] underline decoration-[rgba(200,146,42,0.4)] underline-offset-4 transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c8922a]"
                  >
                    docs / getting started
                    <ExternalLink size={12} />
                  </a>
                </div>

                <div className="bg-[#111109] px-[26px] py-7 md:col-span-2">
                  <h3 className="mb-[14px] font-mono text-[10px] uppercase tracking-[0.16em] text-[#c8922a]/85">
                    what this tool does
                  </h3>
                  <p className="max-w-[920px] text-[13px] leading-[1.82] text-[#9a9484]">
                    it takes midi note timing, track data, and overlap information, then turns that into strudel-ish code you can read, tweak, and send into the REPL without starting from scratch. it is not trying to be a literal one-to-one export - the goal is to preserve the musical shape in a form that still feels readable once you open it.
                  </p>
                </div>

                <div className="grid gap-px bg-[rgba(200,146,42,0.18)] md:col-span-2 lg:grid-cols-3">
                  <div className="bg-[#111109] px-[26px] py-7">
                    <h3 className="mb-[14px] font-mono text-[10px] uppercase tracking-[0.16em] text-[#8b8679]">
                      durations
                    </h3>
                    <p className="mb-[15px] text-[13px] leading-[1.78] text-[#9a9484]">
                      every note is just a start time and end time. from that, the converter calculates how long it lasts and emits a duration tag.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-[3px] border border-[rgba(200,146,42,0.18)] bg-[rgba(200,146,42,0.08)] px-2 py-1 font-mono text-[12px] text-[#c8922a]">
                        C4@0.25
                      </span>
                      <span className="rounded-[3px] border border-[rgba(200,146,42,0.18)] bg-[rgba(200,146,42,0.08)] px-2 py-1 font-mono text-[12px] text-[#c8922a]">
                        E4@0.5
                      </span>
                      <span className="rounded-[3px] border border-[rgba(200,146,42,0.18)] bg-[rgba(200,146,42,0.08)] px-2 py-1 font-mono text-[12px] text-[#c8922a]">
                        ~@0.75
                      </span>
                      <span className="rounded-[3px] border border-[rgba(200,146,42,0.18)] bg-[rgba(200,146,42,0.08)] px-2 py-1 font-mono text-[12px] text-[#c8922a]">
                        G4@1
                      </span>
                    </div>
                  </div>

                  <div className="bg-[#111109] px-[26px] py-7">
                    <h3 className="mb-[14px] font-mono text-[10px] uppercase tracking-[0.16em] text-[#8b8679]">
                      chords &amp; overlaps
                    </h3>
                    <p className="mb-[15px] text-[13px] leading-[1.78] text-[#9a9484]">
                      notes starting at the same time collapse into a clean chord token. staggered overlaps need padded bracket lanes so each voice adds up to the same window.
                    </p>
                    <span className="inline-flex rounded-[3px] border border-[rgba(200,146,42,0.18)] bg-[rgba(200,146,42,0.08)] px-2 py-1 font-mono text-[12px] text-[#c8922a]">
                      {'{C#3, E3, G#3}@0.25'}
                    </span>
                  </div>

                  <div className="bg-[#111109] px-[26px] py-7">
                    <h3 className="mb-[14px] font-mono text-[10px] uppercase tracking-[0.16em] text-[#8b8679]">
                      measure boundaries
                    </h3>
                    <p className="mb-[15px] text-[13px] leading-[1.78] text-[#9a9484]">
                      overlap groups that spill past a bar boundary aren&apos;t chopped. the block stretches to keep the notation musically coherent instead of splitting mid-chord.
                    </p>
                    <span className="inline-flex rounded-[3px] border border-[rgba(200,146,42,0.18)] bg-[rgba(200,146,42,0.08)] px-2 py-1 font-mono text-[12px] text-[#c8922a]">
                      {'{C4@1 ~@0.5, ~@0.5 E4@1}@1.5'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
