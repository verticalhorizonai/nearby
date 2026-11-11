// The on/off switch for an appointment (F1.2 step 3; REQ-01-03; REQ-08-09: a 44 px touch target around the track).
import { cn } from '@/components/ui/cn';

interface AppointmentToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}

export function AppointmentToggle({ checked, onChange, label, disabled = false }: AppointmentToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="group flex h-11 min-w-[52px] items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
    >
      <span
        aria-hidden="true"
        className={cn(
          'relative inline-flex h-[26px] w-[44px] items-center rounded-full transition-colors duration-150',
          checked ? 'bg-primary group-hover:bg-primary-hover' : 'bg-outline-border',
        )}
      >
        <span
          className={cn(
            'absolute left-[3px] h-5 w-5 rounded-full bg-card shadow transition-transform duration-150',
            checked ? 'translate-x-[18px]' : 'translate-x-0',
          )}
        />
      </span>
    </button>
  );
}
