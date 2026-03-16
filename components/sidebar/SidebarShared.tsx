import React from 'react';
import type { ChangeEvent } from 'react';
import { ChevronDown } from 'lucide-react';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  'aria-label'?: string;
  disabled?: boolean;
}

interface SidebarSectionProps {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  children: React.ReactNode;
}

interface SwitchRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  'aria-label'?: string;
  disabled?: boolean;
}

interface SegmentedOption {
  value: string;
  label: string;
}

interface SegmentedControlProps {
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  'aria-label'?: string;
  columns?: number;
}

interface MultiSegmentedControlProps {
  options: SegmentedOption[];
  values: string[];
  onChange: (values: string[]) => void;
  'aria-label'?: string;
}

export interface ComboboxOption {
  value: string;
  label: string;
  hint?: string;
  keywords?: string[];
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  'aria-label'?: string;
  compact?: boolean;
}

export const sidebarSectionClass =
  'border-b border-[rgba(245,158,11,0.10)] py-2.5 last:border-b-0';
export const controlCardClass =
  'rounded-md border border-[rgba(245,158,11,0.10)] bg-[linear-gradient(180deg,rgba(13,13,13,0.9),rgba(8,8,8,0.98))] px-3 py-2.5';
export const fieldLabelClass =
  'mb-1.5 block font-display text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-300';
export const fieldHintClass = 'mt-1 text-[10px] leading-4 text-zinc-500';
export const valuePillClass =
  'rounded-sm border border-[rgba(245,158,11,0.12)] bg-black/55 px-2 py-1 font-display text-[9px] font-medium uppercase tracking-[0.14em] text-zinc-500';
export const inputClass =
  'w-full rounded-md border border-[rgba(245,158,11,0.12)] bg-black/55 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-gold-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold-500 disabled:cursor-not-allowed disabled:opacity-50';
export const compactInputClass =
  'rounded-sm border border-[rgba(245,158,11,0.12)] bg-black/55 px-2 py-1.5 text-sm text-zinc-100 outline-none transition focus:border-gold-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold-500 disabled:cursor-not-allowed disabled:opacity-50';
export const compactSelectClass =
  'rounded-sm border border-[rgba(245,158,11,0.12)] bg-black/55 px-2 py-1.5 font-display text-[10px] font-medium tracking-[0.08em] text-zinc-200 outline-none transition focus:border-gold-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold-500 disabled:cursor-not-allowed disabled:opacity-50';
export const sliderClass =
  'w-full cursor-pointer appearance-none rounded-sm accent-gold-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold-500';

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  'aria-label': ariaLabel,
  disabled = false,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    aria-disabled={disabled}
    disabled={disabled}
    className={`inline-flex appearance-none items-center rounded-full bg-transparent p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold-500 ${
      disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
    }`}
    onClick={(event) => {
      if (disabled) return;
      event.stopPropagation();
      onChange(!checked);
    }}
    onKeyDown={(event) => {
      if (disabled) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        onChange(!checked);
      }
    }}
  >
    <span
      className={`flex h-5 w-9 items-center rounded-full border px-[2px] transition-colors ${
        checked
          ? 'justify-end border-[rgba(245,158,11,0.40)] bg-[rgba(245,158,11,0.18)]'
          : 'justify-start border-[rgba(245,158,11,0.18)] bg-black/65'
      }`}
    >
      <span className="block h-3.5 w-3.5 rounded-full bg-zinc-100" />
    </span>
  </button>
);

export const HelpText: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className={fieldHintClass}>{children}</p>
);

export const SidebarSection: React.FC<SidebarSectionProps> = ({
  icon,
  title,
  action,
  isCollapsed = false,
  onToggleCollapse,
  children,
}) => (
  <section className={sidebarSectionClass}>
    <div className="mb-2 flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={onToggleCollapse}
        className={`flex min-w-0 flex-1 items-center gap-2 text-left font-display text-xs font-semibold uppercase tracking-[0.2em] text-gold-500 ${
          onToggleCollapse ? 'transition-colors hover:text-gold-300' : 'cursor-default'
        }`}
      >
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{title}</span>
      </button>
      <div className="flex shrink-0 items-center gap-2">
        {action}
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={isCollapsed ? `Expand ${title}` : `Collapse ${title}`}
            className="rounded-sm border border-[rgba(245,158,11,0.12)] bg-black/45 p-1 text-zinc-500 transition-colors hover:border-gold-500/35 hover:text-gold-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold-500"
          >
            <ChevronDown size={14} className={`transition-transform ${isCollapsed ? '-rotate-90' : 'rotate-0'}`} />
          </button>
        )}
      </div>
    </div>

    {!isCollapsed && <div className="space-y-2.5">{children}</div>}
  </section>
);

const segmentedWrapperClass =
  'rounded-md border border-[rgba(245,158,11,0.10)] bg-black/40 p-0.5';
const segmentedButtonBaseClass =
  'rounded-sm px-2.5 py-1.5 font-display text-[10px] font-medium uppercase tracking-[0.18em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold-500';

export const SegmentedControl: React.FC<SegmentedControlProps> = ({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
  columns = options.length,
}) => (
  <div
    role="group"
    aria-label={ariaLabel}
    className={`${segmentedWrapperClass} grid gap-0.5`}
    style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
  >
    {options.map((option) => {
      const isActive = value === option.value;

      return (
        <button
          key={option.value}
          type="button"
          aria-pressed={isActive}
          onClick={() => onChange(option.value)}
        className={`appearance-none ${segmentedButtonBaseClass} ${
            isActive
              ? 'border border-gold-500/35 bg-gold-500/14 text-gold-100'
              : 'border border-transparent bg-transparent text-zinc-500 hover:text-zinc-200'
          }`}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);

export const MultiSegmentedControl: React.FC<MultiSegmentedControlProps> = ({
  options,
  values,
  onChange,
  'aria-label': ariaLabel,
}) => (
  <div role="group" aria-label={ariaLabel} className={`${segmentedWrapperClass} flex flex-wrap gap-0.5`}>
    {options.map((option) => {
      const isActive = values.includes(option.value);

      return (
        <button
          key={option.value}
          type="button"
          aria-pressed={isActive}
          onClick={() =>
            onChange(
              isActive ? values.filter((currentValue) => currentValue !== option.value) : [...values, option.value],
            )
          }
          className={`appearance-none ${segmentedButtonBaseClass} ${
            isActive
              ? 'border border-gold-500/35 bg-gold-500/14 text-gold-100'
              : 'border border-transparent bg-transparent text-zinc-500 hover:text-zinc-200'
          }`}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);

export const SwitchRow: React.FC<SwitchRowProps> = ({
  label,
  description,
  checked,
  onChange,
  'aria-label': ariaLabel,
  disabled = false,
}) => (
  <div
    role="button"
    tabIndex={disabled ? -1 : 0}
    aria-pressed={checked}
    aria-label={ariaLabel ?? label}
    aria-disabled={disabled}
    onClick={() => {
      if (!disabled) onChange(!checked);
    }}
    onKeyDown={(event) => {
      if (disabled) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onChange(!checked);
      }
    }}
    className={`flex w-full appearance-none items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold-500 ${
      disabled
        ? 'cursor-not-allowed border-[rgba(245,158,11,0.08)] bg-black/10 opacity-60'
        : checked
        ? 'border-[rgba(245,158,11,0.24)] bg-[rgba(245,158,11,0.07)] hover:border-[rgba(245,158,11,0.30)]'
        : 'border-[rgba(245,158,11,0.12)] bg-black/18 hover:border-[rgba(245,158,11,0.20)]'
    }`}
  >
    <div className="min-w-0">
      <p className="text-xs font-medium text-zinc-200">{label}</p>
      {description && <p className="mt-0.5 text-[10px] leading-4 text-zinc-500">{description}</p>}
    </div>
    <ToggleSwitch
      checked={checked}
      onChange={onChange}
      aria-label={ariaLabel ?? label}
      disabled={disabled}
    />
  </div>
);

export const Combobox: React.FC<ComboboxProps> = ({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
  compact = false,
}) => (
  <div className="relative">
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={ariaLabel}
      className={`w-full appearance-none text-left ${
        compact ? compactSelectClass : inputClass
      } pr-8`}
    >
      {options.map((option) => (
        <option key={`${option.value}-${option.label}`} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
    <ChevronDown
      size={compact ? 12 : 14}
      className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500"
    />
  </div>
);

export function getBoundedNumberInputValue(
  event: ChangeEvent<HTMLInputElement>,
  currentValue: number,
  min: number,
  max: number,
): number {
  const nextValue = event.currentTarget.valueAsNumber;
  if (!Number.isFinite(nextValue)) {
    return currentValue;
  }

  return Math.min(max, Math.max(min, Math.round(nextValue)));
}
