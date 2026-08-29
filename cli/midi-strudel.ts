#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { convertMidi, type ConversionOverrides } from '../services/convertMidi';

type OutputFormat = 'code' | 'json' | 'url';

export interface CliOptions {
  input: string;
  format: OutputFormat;
  overrides: ConversionOverrides;
}

const HELP = `Usage: midi-strudel [options] <file.mid|file.midi>

Convert a MIDI file to Strudel without interactive prompts.

Output:
  --format <code|json|url>       stdout format (default: code)

Conversion:
  --bpm <number>                 output playback tempo
  --notation <absolute|relative>
  --cycle-unit <bar|beat>
  --format-per-line <measure|note>
  --items-per-line <integer>
  --sound <name>                 fallback Strudel sound
  --auto-mapping / --no-auto-mapping
  --velocity / --no-velocity
  --timing <absoluteDuration|relativeDivision>
  --quantize / --no-quantize
  --quantization-threshold <ms>
  --quantization-strength <0-100>
  --duration-precision <integer>

Other:
  -h, --help
`;

const fail = (message: string): never => {
  throw new Error(message);
};

const takeValue = (args: string[], index: number, flag: string): string =>
  args[index + 1] ?? fail(`${flag} requires a value`);

const numberValue = (value: string, flag: string, minimum = 0): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum) fail(`${flag} must be a number >= ${minimum}`);
  return parsed;
};

const integerValue = (value: string, flag: string, minimum = 1): number => {
  const parsed = numberValue(value, flag, minimum);
  if (!Number.isInteger(parsed)) fail(`${flag} must be an integer`);
  return parsed;
};

const choice = <T extends string>(value: string, flag: string, choices: readonly T[]): T => {
  if (!choices.includes(value as T)) fail(`${flag} must be one of: ${choices.join(', ')}`);
  return value as T;
};

export const parseArgs = (args: string[]): CliOptions | null => {
  let input: string | undefined;
  let format: OutputFormat = 'code';
  const overrides: ConversionOverrides = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '-h' || arg === '--help') return null;
    if (!arg.startsWith('-')) {
      if (input) fail('exactly one MIDI input file is supported');
      input = arg;
      continue;
    }

    const value = () => takeValue(args, index++, arg);
    switch (arg) {
      case '--format': format = choice(value(), arg, ['code', 'json', 'url']); break;
      case '--bpm': overrides.bpm = numberValue(value(), arg, 1); break;
      case '--notation': overrides.notationType = choice(value(), arg, ['absolute', 'relative']); break;
      case '--cycle-unit': overrides.cycleUnit = choice(value(), arg, ['bar', 'beat']); break;
      case '--format-per-line': overrides.formatPerLineBy = choice(value(), arg, ['measure', 'note']); break;
      case '--items-per-line': overrides.measuresPerLine = integerValue(value(), arg); break;
      case '--sound': overrides.globalSound = value(); break;
      case '--auto-mapping': overrides.useAutoMapping = true; break;
      case '--no-auto-mapping': overrides.useAutoMapping = false; break;
      case '--velocity': overrides.includeVelocity = true; break;
      case '--no-velocity': overrides.includeVelocity = false; break;
      case '--timing': overrides.timingStyle = choice(value(), arg, ['absoluteDuration', 'relativeDivision']); break;
      case '--quantize': overrides.isQuantized = true; break;
      case '--no-quantize': overrides.isQuantized = false; break;
      case '--quantization-threshold': overrides.quantizationThreshold = numberValue(value(), arg); break;
      case '--quantization-strength': {
        const strength = numberValue(value(), arg);
        if (strength > 100) fail(`${arg} must be <= 100`);
        overrides.quantizationStrength = strength;
        break;
      }
      case '--duration-precision': overrides.durationPrecision = integerValue(value(), arg); break;
      default: fail(`unknown option: ${arg}`);
    }
  }

  if (!input) fail('a .mid or .midi input file is required');
  if (!['.mid', '.midi'].includes(extname(input).toLowerCase())) {
    fail('input must have a .mid or .midi extension');
  }
  return { input, format, overrides };
};

export const runCli = async (args: string[]): Promise<void> => {
  const options = parseArgs(args);
  if (!options) {
    process.stdout.write(HELP);
    return;
  }

  const bytes = await readFile(options.input);
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const conversion = convertMidi(arrayBuffer, basename(options.input), options.overrides);

  if (options.format === 'code') {
    process.stdout.write(conversion.code.endsWith('\n') ? conversion.code : `${conversion.code}\n`);
  } else if (options.format === 'url') {
    process.stdout.write(`${conversion.link}\n`);
  } else {
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      input: basename(options.input),
      source: {
        bpm: conversion.config.sourceBpm,
        timeSignature: conversion.config.sourceTimeSignature,
        trackCount: conversion.tracks.length,
      },
      config: conversion.config,
      tracks: conversion.tracks.map((track) => ({
        id: track.id,
        name: track.name,
        noteCount: track.notes.length,
        isDrum: track.isDrum,
        hidden: Boolean(track.hidden),
      })),
      code: conversion.code,
      url: conversion.link,
    }, null, 2)}\n`);
  }
};

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) {
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`midi-strudel: ${message}\n`);
    process.exitCode = 1;
  });
}
