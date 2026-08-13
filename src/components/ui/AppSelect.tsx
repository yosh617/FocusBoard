import { useEffect, useRef, useState, type KeyboardEvent } from "react";

export type AppSelectOption = {
  value: string;
  label: string;
};

export type AppSelectProps = {
  id: string;
  label: string;
  value: string;
  options: AppSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function AppSelect({ id, label, value, options, onChange, disabled = false }: AppSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const listboxId = `${id}-listbox`;
  const selectedOption = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(selectedIndex);
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("focusin", handleFocusIn);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("focusin", handleFocusIn);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const closeAndFocus = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const selectOption = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    closeAndFocus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || options.length === 0) return;
    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        closeAndFocus();
      }
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) selectOption(activeIndex);
      else setOpen(true);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      if (!open) {
        setActiveIndex(selectedIndex);
        setOpen(true);
        return;
      }
      setActiveIndex((index) => (index + direction + options.length) % options.length);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      if (!open) return;
      event.preventDefault();
      setActiveIndex(event.key === "Home" ? 0 : options.length - 1);
    }
  };

  return (
    <div className="app-ui-field app-select" ref={rootRef}>
      <label htmlFor={id}>{label}</label>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        className="app-select__trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open && options[activeIndex] ? `${listboxId}-option-${activeIndex}` : undefined}
        disabled={disabled}
        onClick={() => setOpen((isOpen) => !isOpen)}
        onKeyDown={handleKeyDown}
      >
        <span>{selectedOption?.label ?? value}</span>
        <svg className="app-select__chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && options.length > 0 && (
        <div className="app-select__menu" id={listboxId} role="listbox" aria-label={label}>
          {options.map((option, index) => (
            <button
              key={option.value}
              id={`${listboxId}-option-${index}`}
              type="button"
              role="option"
              aria-selected={option.value === value}
              tabIndex={-1}
              className={index === activeIndex ? "is-active" : ""}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectOption(index)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
