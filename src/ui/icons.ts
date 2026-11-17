import {
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  Flame,
  Gauge,
  Image as ImageIcon,
  Info,
  Link,
  Lock,
  Mail,
  MessagesSquare,
  Minus,
  Music,
  Pause,
  PenLine,
  Pin,
  Play,
  Plus,
  Quote,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Smile,
  Star,
  Trash2,
  Undo2,
  Redo2,
  X
} from "lucide";

const ICONS = {
  alert: CircleAlert,
  "arrow-up": ArrowUp,
  "arrow-up-right": ArrowUpRight,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  clock: Clock,
  copy: Copy,
  "external-link": ExternalLink,
  eye: Eye,
  flame: Flame,
  gauge: Gauge,
  image: ImageIcon,
  info: Info,
  link: Link,
  lock: Lock,
  mail: Mail,
  "messages-square": MessagesSquare,
  minus: Minus,
  music: Music,
  pause: Pause,
  "pen-line": PenLine,
  pin: Pin,
  play: Play,
  plus: Plus,
  quote: Quote,
  "redo-2": Redo2,
  "refresh-cw": RefreshCw,
  "rotate-ccw": RotateCcw,
  "rotate-cw": RotateCw,
  smile: Smile,
  star: Star,
  "trash-2": Trash2,
  "undo-2": Undo2,
  x: X
} as const;

export type IconName = keyof typeof ICONS;

/**
 * ASCII theme labels. They live next to the icon names so both renderers read
 * from one registry instead of maintaining separate selector maps.
 */
export const ASCII_LABELS: Record<IconName, string> = {
  alert: "[!]",
  "arrow-up": "^",
  "arrow-up-right": "[^]",
  check: "[OK]",
  "chevron-down": "v",
  "chevron-left": "[<]",
  "chevron-right": "[>]",
  clock: "[LATER]",
  copy: "[C]",
  "external-link": "[^]",
  eye: "[T]",
  flame: "[HOT]",
  gauge: "[+/-]",
  image: "[IMG]",
  info: "[i]",
  link: "[URL]",
  lock: "[LOCK]",
  mail: "[M]",
  "messages-square": "[THREAD]",
  minus: "[-]",
  music: "[~]",
  pause: "[||]",
  "pen-line": "[E]",
  pin: "[P]",
  play: "[>]",
  plus: "[+]",
  quote: "[Q]",
  "redo-2": "[REDO]",
  "refresh-cw": "[R]",
  "rotate-ccw": "[L]",
  "rotate-cw": "[R]",
  smile: "[EMO]",
  star: "[*]",
  "trash-2": "[DEL]",
  "undo-2": "[UNDO]",
  x: "[X]"
};

const SVG_NS = "http://www.w3.org/2000/svg";

export interface IconOptions {
  size?: number;
  className?: string;
}

export function createIcon(name: IconName, options: IconOptions = {}): SVGSVGElement {
  const { size = 18, className = "cc98-icon" } = options;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add(className);
  for (const [tag, attributes] of ICONS[name]) {
    const child = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attributes)) {
      child.setAttribute(key, String(value));
    }
    svg.append(child);
  }
  return svg;
}

export function setIcon(
  control: Element,
  name: IconName,
  options: IconOptions & { label?: string } = {}
): SVGSVGElement {
  const icon = createIcon(name, options);
  control.replaceChildren(icon);
  control.setAttribute("data-icon", name);
  control.setAttribute("data-cc98-ascii-glyph", ASCII_LABELS[name]);
  if (options.label) {
    control.setAttribute("aria-label", options.label);
    control.setAttribute("title", options.label);
  }
  return icon;
}

export function prependIcon(
  container: Element,
  name: IconName,
  options: IconOptions = {}
): SVGSVGElement {
  const icon = createIcon(name, options);
  container.prepend(icon);
  return icon;
}

export function replaceWithTextIcon(
  control: Element,
  name: IconName,
  fallback: string,
  options: IconOptions = {}
): void {
  if (typeof document === "undefined" || !(control instanceof Element)) {
    control.textContent = fallback;
    return;
  }
  setIcon(control, name, options);
}

export const ICON_NAMES = Object.keys(ICONS) as IconName[];

export function installLegacyIcons(): void {
  const api = Object.freeze({
    create: createIcon,
    set: setIcon,
    prepend: prependIcon,
    ascii: ASCII_LABELS,
    names: ICON_NAMES
  });
  (globalThis as unknown as { CC98RebornIcons?: typeof api }).CC98RebornIcons = api;
}
