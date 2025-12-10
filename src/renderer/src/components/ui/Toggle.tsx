import type { JSX } from 'react';

type ToggleProps = {
  checked?: boolean;
  title?: string;
  onChange?: (checked: boolean) => void;
  className?: string;
  disabled?: boolean;
};

const Toggle = (props: ToggleProps): JSX.Element => (
  <label
    className={`inline-flex items-center ${props.disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${props.className}`}
    title={props.title}
  >
    <input
      type="checkbox"
      checked={props.checked}
      onChange={(e) => props.onChange?.(e.target.checked)}
      disabled={props.disabled}
      className="sr-only peer"
    />
    <div
      className={`peer after:top-[2px] after:absolute relative bg-emerald-200 after:bg-seasalt dark:bg-emerald-700 dark:peer-checked:bg-amber-600 peer-checked:bg-amber-600 after:border after:border-emerald-300 dark:border-emerald-600 peer-checked:after:border-seasalt rounded-full after:rounded-full peer-focus:outline-none dark:peer-focus:ring-amber-800 w-11 after:w-5 h-6 after:h-5 after:content-[''] after:transition-all rtl:peer-checked:after:-translate-x-full peer-checked:after:translate-x-full after:start-[2px] ${props.disabled ? 'pointer-events-none' : ''}`}
    ></div>
  </label>
);

export default Toggle;
