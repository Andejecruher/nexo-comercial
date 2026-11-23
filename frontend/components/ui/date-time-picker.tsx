'use client';

import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  formatDateTimeValue,
  maskDateTimeInput,
  mergeDateAndTime,
  parseDateTimeInput,
  type DateTimePickerMode,
} from '@/lib/date-time-picker';
import { cn } from '@/lib/utils';
import { CalendarClock } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { es } from 'date-fns/locale';

const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, '0'));

export type DateTimePickerProps = {
  id?: string;
  mode?: DateTimePickerMode;
  value?: Date;
  onChange: (value: Date | undefined) => void;
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
  popoverContainer?: HTMLElement | null;
  'aria-describedby'?: string;
};

export function DateTimePicker({
  id,
  mode = 'datetime',
  value,
  onChange,
  disabled = false,
  invalid = false,
  placeholder,
  popoverContainer,
  'aria-describedby': describedBy,
}: DateTimePickerProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => (value ? formatDateTimeValue(value, mode) : ''));
  const [month, setMonth] = useState(() => value ?? new Date());
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    setText(value ? formatDateTimeValue(value, mode) : '');
    if (value) setMonth(value);
  }, [mode, value]);

  const parsed = useMemo(() => parseDateTimeInput(text, mode), [mode, text]);
  const showError = touched && text.length > 0 && parsed === undefined;
  const describedIds =
    [describedBy, showError ? errorId : undefined].filter(Boolean).join(' ') || undefined;

  const startMonth = useMemo(() => {
    const year = new Date().getFullYear();
    return new Date(year - 10, 0, 1);
  }, []);
  const endMonth = useMemo(() => {
    const year = new Date().getFullYear();
    return new Date(year + 10, 11, 1);
  }, []);

  function commitText(nextText: string) {
    const masked = maskDateTimeInput(nextText, mode);
    setText(masked);
    if (masked.length === 0) {
      onChange(undefined);
      return;
    }
    const next = parseDateTimeInput(masked, mode);
    if (next) {
      onChange(next);
      setMonth(next);
    }
  }

  function handleDaySelect(day: Date | undefined) {
    if (!day) return;
    const hours = value?.getHours() ?? 9;
    const minutes = value?.getMinutes() ?? 0;
    const next =
      mode === 'date' ? mergeDateAndTime(day, 0, 0) : mergeDateAndTime(day, hours, minutes);
    onChange(next);
    setText(formatDateTimeValue(next, mode));
    setMonth(next);
    if (mode === 'date') setOpen(false);
  }

  function handleTimeChange(part: 'hours' | 'minutes', raw: string) {
    const base = value ?? parsed ?? new Date();
    const hours = part === 'hours' ? Number(raw) : base.getHours();
    const minutes = part === 'minutes' ? Number(raw) : base.getMinutes();
    const next = mergeDateAndTime(base, hours, minutes);
    onChange(next);
    setText(formatDateTimeValue(next, mode));
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Input
          id={inputId}
          value={text}
          disabled={disabled}
          placeholder={placeholder ?? (mode === 'datetime' ? 'DD/MM/AAAA HH:mm' : 'DD/MM/AAAA')}
          inputMode="numeric"
          autoComplete="off"
          aria-invalid={invalid || showError || undefined}
          aria-describedby={describedIds}
          className="pr-10"
          onChange={(event) => commitText(event.target.value)}
          onBlur={() => setTouched(true)}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              className={cn(
                'text-muted-foreground hover:text-foreground absolute top-1/2 right-1.5 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md',
                'focus-visible:ring-ring focus-visible:ring-[3px] outline-none',
              )}
              aria-label="Abrir calendario"
            >
              <CalendarClock className="size-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-3" container={popoverContainer}>
            <Calendar
              mode="single"
              locale={es}
              month={month}
              onMonthChange={setMonth}
              selected={value}
              onSelect={handleDaySelect}
              captionLayout="dropdown"
              startMonth={startMonth}
              endMonth={endMonth}
            />
            {mode === 'datetime' ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="space-y-1 text-xs font-medium text-muted-foreground">
                  Hora
                  <select
                    aria-label="Hora"
                    disabled={disabled}
                    className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm text-foreground"
                    value={String(value?.getHours() ?? 9).padStart(2, '0')}
                    onChange={(event) => handleTimeChange('hours', event.target.value)}
                  >
                    {HOURS.map((hour) => (
                      <option key={hour} value={hour}>
                        {hour}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs font-medium text-muted-foreground">
                  Minutos
                  <select
                    aria-label="Minutos"
                    disabled={disabled}
                    className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm text-foreground"
                    value={String(value?.getMinutes() ?? 0).padStart(2, '0')}
                    onChange={(event) => handleTimeChange('minutes', event.target.value)}
                  >
                    {MINUTES.map((minute) => (
                      <option key={minute} value={minute}>
                        {minute}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
          </PopoverContent>
        </Popover>
      </div>
      {showError ? (
        <p id={errorId} className="text-destructive text-sm">
          Usá el formato {mode === 'datetime' ? 'DD/MM/AAAA HH:mm' : 'DD/MM/AAAA'}.
        </p>
      ) : null}
    </div>
  );
}
