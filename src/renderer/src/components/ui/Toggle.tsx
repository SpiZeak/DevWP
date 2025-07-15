import { JSX } from 'react'

type ToggleProps = {
  checked?: boolean
  title?: string
  onChange?: (checked: boolean) => void
  className?: string
  disabled?: boolean
}

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
      className={`peer after:top-[2px] after:absolute relative bg-success-200 after:bg-seasalt dark:bg-success-700 dark:peer-checked:bg-info-600 peer-checked:bg-info-600 after:border after:border-success-300 dark:border-success-600 peer-checked:after:border-white rounded-full after:rounded-full peer-focus:outline-none dark:peer-focus:ring-info-800 w-11 after:w-5 h-6 after:h-5 after:content-[''] after:transition-all rtl:peer-checked:after:-translate-x-full peer-checked:after:translate-x-full after:start-[2px] ${props.disabled ? 'pointer-events-none' : ''}`}
    ></div>
  </label>
)

export default Toggle
