import React, { Suspense } from 'react';
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

export function EmptyStateScreen({
  activeExampleId,
  config,
  isProcessing,
  onExampleLoad,
  onFileLoaded,
}: Props) {
  return (
    <div className="flex-1 overflow-y-auto bg-noir-900 p-6 md:p-10">
    <div className="mx-auto grid min-h-full max-w-6xl gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <section className="relative overflow-hidden rounded-[8px] border border-[rgba(245,158,11,0.18)] bg-[linear-gradient(180deg,rgba(24,24,24,0.96),rgba(10,10,10,0.99))] p-7 shadow-[0_24px_80px_rgba(0,0,0,0.28)] md:p-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.1),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(251,191,36,0.04),transparent_28%)]" />
        <div className="relative space-y-8">
          <div className="space-y-4">
            <p className="font-display text-[11px] font-medium uppercase tracking-[0.28em] text-gold-500/75">
              midi-strudel
            </p>
            <h1 className="max-w-2xl font-display text-4xl font-semibold tracking-tight text-zinc-100 md:text-5xl">
              i got too obsessed with Epic: The Musical and wanted to see the melodies as strudel code.
            </h1>
            <div className="max-w-2xl space-y-4 text-[15px] leading-7 text-zinc-400">
              <p>
                that was honestly the whole spark for this. i was on a high from Epic, discovered{' '}
                <a
                  href="https://strudel.cc/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-gold-400 underline decoration-gold-500/40 underline-offset-4 transition-colors hover:text-gold-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-500"
                >
                  strudel
                </a>
                , and really wanted to look at those melodies in this code-shaped notation instead of just a piano roll.
              </p>
              <p>
                then vibe coding made it very easy to keep poking at it. it stopped being a one-off experiment and slowly became a fun little toy for turning midi into strudel-ish code.
              </p>
              <p>
                along the way it also became a useful excuse to play with gemini, claude, and gpt as ai dev tools and see what kind of workflow they were actually good for.
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-[6px] border border-[rgba(245,158,11,0.16)] bg-black/25 p-4">
              <p className="mb-2 font-display text-[11px] font-medium uppercase tracking-[0.22em] text-gold-500/70">
                what strudel is
              </p>
              <p className="text-sm leading-6 text-zinc-300">
                strudel is a browser-based live coding environment for music. instead of a piano roll, you describe repeating patterns and cycles in code.
              </p>
              <div className="mt-3 flex flex-wrap gap-3 text-[12px] text-zinc-400">
                <a
                  href="https://strudel.cc/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 transition-colors hover:text-gold-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-500"
                >
                  strudel.cc
                  <ExternalLink size={12} />
                </a>
                <a
                  href="https://strudel.cc/learn/getting-started/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 transition-colors hover:text-gold-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-500"
                >
                  docs / getting started
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>
            <div className="rounded-[6px] border border-[rgba(245,158,11,0.16)] bg-black/25 p-4">
              <p className="mb-2 font-display text-[11px] font-medium uppercase tracking-[0.22em] text-gold-500/70">
                what this project does
              </p>
              <p className="text-sm leading-6 text-zinc-300">
                it takes a midi file, parses the tracks, and gives you strudel-ish code you can read, tweak, and send into the repl without starting from scratch.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <div className="rounded-[8px] border border-[rgba(245,158,11,0.16)] bg-black/30 p-5 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
          <p className="mb-3 font-display text-[11px] font-medium uppercase tracking-[0.22em] text-gold-500/70">
            quick start
          </p>
          <div className="space-y-2 text-sm leading-6 text-zinc-300">
            <p>1. drop a `.mid` or `.midi` file into the upload box.</p>
            <p>2. or hit one of the examples if you want to hear the vibe first.</p>
            <p>3. once it loads, tweak the settings and open the result in strudel.</p>
          </div>
        </div>

        <div className="relative rounded-[8px] border border-[rgba(245,158,11,0.16)] bg-zinc-950/75 p-5 shadow-[0_18px_50px_rgba(0,0,0,0.24)]">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="font-display text-[11px] font-medium uppercase tracking-[0.24em] text-gold-500/75">
                upload your own midi
              </p>
              <p className="mt-1 text-sm text-zinc-400">
                drop a file in here and it opens straight into the editor.
              </p>
            </div>
          </div>

          <div className="relative">
            <DropZone onFileLoaded={onFileLoaded} />
            {isProcessing && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-noir-900/82 backdrop-blur-sm">
                <p className="animate-pulse font-display text-sm font-medium uppercase tracking-[0.18em] text-gold-500">
                  Parsing MIDI Data...
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[8px] border border-[rgba(245,158,11,0.16)] bg-[linear-gradient(180deg,rgba(22,22,22,0.96),rgba(12,12,12,0.98))] p-5">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-500/40 to-transparent" />
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="font-display text-[11px] font-medium uppercase tracking-[0.24em] text-gold-500/75">
                example
              </p>
              <p className="text-sm leading-6 text-zinc-400">
                this is one loop from the first Ruthlessness track, shown as a real little strudel player instead of a fake code block.
              </p>
            </div>

            <div className="h-[360px] overflow-hidden rounded-[6px] border border-[rgba(245,158,11,0.18)] bg-noir-900/70">
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center bg-noir-900 text-zinc-400">
                    <div className="flex items-center gap-2 font-display text-sm font-medium uppercase tracking-[0.14em]">
                      <Loader2 size={16} className="animate-spin text-gold-500" />
                      <span>Loading example player...</span>
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

            <div className="flex flex-col gap-2">
              {EXAMPLE_MIDIS.map((example) => {
                const isActive = activeExampleId === example.id;
                const isDisabled = isProcessing;
                const isRuthlessness = example.id === 'ruthlessness';
                const primaryLabel =
                  isRuthlessness
                    ? 'see full Ruthlessness example'
                    : 'or check out Warrior of the Mind';

                const baseButtonClasses =
                  'inline-flex items-center justify-between gap-3 rounded-[6px] border px-4 py-3 text-left transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400';
                const enabledClasses =
                  'border-[rgba(245,158,11,0.16)] bg-black/30 text-zinc-100 hover:border-[rgba(245,158,11,0.28)] hover:bg-zinc-900';
                const disabledClasses =
                  'cursor-not-allowed border-[rgba(245,158,11,0.10)] bg-gold-500/5 text-gold-300/60';
                const highlightClasses =
                  isRuthlessness && !isDisabled
                    ? 'ring-2 ring-gold-500/70 ring-offset-2 ring-offset-black/40 shadow-[0_0_35px_rgba(245,158,11,0.4)]'
                    : isRuthlessness
                    ? 'ring-2 ring-gold-500/40 ring-offset-2 ring-offset-black/40 shadow-[0_0_28px_rgba(245,158,11,0.25)]'
                    : '';

                return (
                  <button
                    key={example.id}
                    type="button"
                    onClick={() => onExampleLoad(example.id)}
                    disabled={isDisabled}
                    className={`${baseButtonClasses} ${isDisabled ? disabledClasses : enabledClasses} ${highlightClasses}`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-100">{primaryLabel}</p>
                      <p className="mt-0.5 text-[12px] leading-5 text-zinc-500">{example.detail}</p>
                    </div>
                    <span className="shrink-0 rounded-full border border-[rgba(245,158,11,0.18)] bg-zinc-900/80 p-2 text-gold-400">
                      {isProcessing && isActive ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Play size={14} fill="currentColor" />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-3 text-[11px] text-zinc-500">
              {EXAMPLE_MIDIS.map((example) => (
                <a
                  key={example.id}
                  href={example.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 transition-colors hover:text-gold-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-500"
                >
                  {example.label} source
                  <ExternalLink size={12} />
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
    </div>
  );
}
