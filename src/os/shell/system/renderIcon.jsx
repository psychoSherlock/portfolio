// Render an icon given as a React element, a component, an image URL or a short string.
import { createElement, isValidElement } from "react";

export function renderIcon(icon, { alt = "" } = {}) {
  if (!icon) return null;
  if (isValidElement(icon)) return icon;
  if (typeof icon === "function" || (typeof icon === "object" && icon.$$typeof)) return createElement(icon);
  if (typeof icon === "string")
    return /[/.:]/.test(icon) ? (
      <img src={icon} alt={alt} draggable={false} decoding="async" />
    ) : (
      <span>{icon}</span>
    );
  return null;
}
