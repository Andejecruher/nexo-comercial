'use client';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { forwardRef } from 'react';
import PhoneInput, { parsePhoneNumber, type Country, type Value } from 'react-phone-number-input';
import flags from 'react-phone-number-input/flags';
import 'react-phone-number-input/style.css';

export type PhoneInputWithCountryProps = {
  value?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  name?: string;
  id?: string;
  defaultCountry?: Country;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  placeholder?: string;
};

function coerceE164(value: string | undefined, defaultCountry: Country): Value | undefined {
  if (!value?.trim()) return undefined;
  const parsed = parsePhoneNumber(value.trim(), defaultCountry);
  return parsed?.number;
}

const PhoneTextInput = forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  function PhoneTextInput({ className, ...props }, ref) {
    return (
      <Input
        ref={ref}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        className={cn(
          'h-9 min-w-0 flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:border-transparent focus-visible:ring-0',
          className,
        )}
        {...props}
      />
    );
  },
);

export function PhoneInputWithCountry({
  value,
  onChange,
  onBlur,
  name,
  id,
  defaultCountry = 'MX',
  disabled,
  invalid,
  className,
  placeholder,
}: PhoneInputWithCountryProps) {
  return (
    <PhoneInput
      international={false}
      defaultCountry={defaultCountry}
      flags={flags}
      value={coerceE164(value, defaultCountry)}
      onChange={(next) => onChange(next ?? '')}
      onBlur={onBlur}
      name={name}
      id={id}
      disabled={disabled}
      placeholder={placeholder}
      inputComponent={PhoneTextInput}
      numberInputProps={{
        'aria-invalid': invalid || undefined,
      }}
      className={cn(
        'flex h-9 w-full min-w-0 items-stretch overflow-hidden rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow]',
        'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
        'dark:bg-input/30',
        invalid &&
          'border-destructive ring-destructive/20 focus-within:border-destructive focus-within:ring-destructive/20 dark:ring-destructive/40',
        '[&_.PhoneInputCountry]:relative [&_.PhoneInputCountry]:flex [&_.PhoneInputCountry]:items-center [&_.PhoneInputCountry]:gap-1 [&_.PhoneInputCountry]:self-stretch [&_.PhoneInputCountry]:bg-transparent [&_.PhoneInputCountry]:px-2.5 [&_.PhoneInputCountry]:pr-1',
        '[&_.PhoneInputCountrySelect]:absolute [&_.PhoneInputCountrySelect]:inset-0 [&_.PhoneInputCountrySelect]:z-10 [&_.PhoneInputCountrySelect]:h-full [&_.PhoneInputCountrySelect]:w-full [&_.PhoneInputCountrySelect]:cursor-pointer [&_.PhoneInputCountrySelect]:opacity-0',
        '[&_.PhoneInputCountryIcon]:h-4 [&_.PhoneInputCountryIcon]:w-5.5 [&_.PhoneInputCountryIcon--border]:shadow-none',
        '[&_.PhoneInputCountrySelectArrow]:ml-0.5 [&_.PhoneInputCountrySelectArrow]:border-t-muted-foreground',
        '[&_.PhoneInputInput]:min-w-0',
        className,
      )}
    />
  );
}
