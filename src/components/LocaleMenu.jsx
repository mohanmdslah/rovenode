import { useEffect, useRef, useState } from "react";
import { CaretDown, Check } from "@phosphor-icons/react";
import cnFlag from "flag-icons/flags/4x3/cn.svg";
import jpFlag from "flag-icons/flags/4x3/jp.svg";
import krFlag from "flag-icons/flags/4x3/kr.svg";
import usFlag from "flag-icons/flags/4x3/us.svg";
import vnFlag from "flag-icons/flags/4x3/vn.svg";
import { useLocale } from "../i18n.jsx";
import { getNextLocaleIndex, localeOptions } from "../lib/locale-menu.js";

const flags = { cn: cnFlag, jp: jpFlag, kr: krFlag, us: usFlag, vn: vnFlag };

export function LocaleMenu() {
  const { locale, setLocale } = useLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const optionRefs = useRef([]);
  const activeIndex = localeOptions.findIndex(({ id }) => id === locale);
  const activeLocale = localeOptions[activeIndex];

  useEffect(() => {
    if (!open) return undefined;

    const closeOnOutsidePress = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", closeOnOutsidePress);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const showMenu = () => {
    setOpen(true);
    window.setTimeout(() => optionRefs.current[activeIndex]?.focus(), 0);
  };

  const selectLocale = (id) => {
    setLocale(id);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleOptionKeyDown = (event, index) => {
    const nextIndex = getNextLocaleIndex(index, event.key);
    if (nextIndex === index) return;
    event.preventDefault();
    optionRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="locale-menu" ref={rootRef}>
      <button
        className="locale-trigger"
        type="button"
        ref={triggerRef}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="locale-options"
        aria-label={`Language: ${activeLocale.label}`}
        onClick={() => open ? setOpen(false) : showMenu()}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            showMenu();
          }
        }}
      >
        <img src={flags[activeLocale.flag]} alt="" width="24" height="18" />
        <span>{activeLocale.shortLabel}</span>
        <CaretDown className={open ? "is-open" : ""} size={15} weight="bold" aria-hidden="true" />
      </button>

      {open && (
        <div className="locale-options" id="locale-options" role="listbox" aria-label="Language">
          {localeOptions.map((option, index) => (
            <button
              type="button"
              role="option"
              aria-selected={locale === option.id}
              tabIndex={index === activeIndex ? 0 : -1}
              key={option.id}
              ref={(node) => { optionRefs.current[index] = node; }}
              onClick={() => selectLocale(option.id)}
              onKeyDown={(event) => handleOptionKeyDown(event, index)}
            >
              <img src={flags[option.flag]} alt="" width="28" height="21" />
              <span><strong>{option.label}</strong><small>{option.id}</small></span>
              {locale === option.id && <Check size={17} weight="bold" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
