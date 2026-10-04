"use client";

import {
  forwardRef,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { useFieldContext } from "./FieldContext";

/**
 * Control nối sẵn với <Field>: nhãn (aria-labelledby), mô tả/lỗi (aria-describedby),
 * invalid và required lấy từ FieldContext. Dùng ngoài <Field> vẫn chạy như phần tử thuần.
 */
function useControlAria(props: {
  "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling";
  "aria-describedby"?: string;
  "aria-labelledby"?: string;
  required?: boolean;
}) {
  const field = useFieldContext();

  return {
    "aria-labelledby": props["aria-labelledby"] ?? field?.labelId,
    "aria-describedby": props["aria-describedby"] ?? field?.describedBy,
    "aria-invalid": props["aria-invalid"] ?? (field?.invalid || undefined),
    required: props.required ?? (field?.required || undefined),
  };
}

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input(props, ref) {
  return <input ref={ref} {...props} {...useControlAria(props)} />;
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea(props, ref) {
  return <textarea ref={ref} {...props} {...useControlAria(props)} />;
});

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  options: SelectOption[];
  /** Dòng đầu không chọn được (vd. "Chọn môn"). Có giá trị rỗng, tự bỏ qua khi `required` đã chọn. */
  placeholder?: string;
}

/** <select> gốc của trình duyệt — giữ bàn phím/trợ năng/di động; chỉ thống nhất kiểu dáng và ARIA. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ options, placeholder, ...props }, ref) {
    return (
      <select ref={ref} {...props} {...useControlAria(props)}>
        {placeholder !== undefined && (
          <option value="" disabled={props.required}>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>
    );
  },
);
