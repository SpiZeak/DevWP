interface FormInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  helpText?: React.ReactNode;
  type?: string;
}

const FormInput: React.FC<FormInputProps> = ({
  label,
  value,
  onChange,
  placeholder,
  helpText,
  type = 'text',
}) => {
  const inputId = `input-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className="mb-5">
      <label htmlFor={inputId} className="block mb-1 text-sm">
        {label}
      </label>
      <input
        id={inputId}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-gunmetal-400 p-2 border border-gunmetal-500 focus:border-pumpkin rounded focus:outline-none focus:ring-1 focus:ring-pumpkin w-full text-seasalt transition-colors"
        placeholder={placeholder}
      />
      {helpText && helpText}
    </div>
  );
};

export default FormInput;
