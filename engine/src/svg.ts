/**
 * SVG serialization (SPEC-ENGINE §1, §7).
 *
 * Rounding happens here and nowhere else. Geometry upstream stays in full
 * precision - rounding mid-pipeline compounds error and, worse, makes the
 * output depend on the order operations were composed in. One rounding site at
 * the boundary is what makes byte-identity survive different CPUs.
 */

/** Decimal places for every coordinate the engine emits. */
const PRECISION = 2;

/**
 * Formats a number for SVG output.
 *
 * `-0` is normalized to `0`: the two are numerically equal but serialize
 * differently, and a single "-0" in a path is enough to fail a byte-identity
 * assertion for a user whose tree happens to sit on an axis.
 */
export function num(value: number): string {
  if (!Number.isFinite(value)) {
    throw new SvgValueError(`refusing to serialize a non-finite number: ${String(value)}`);
  }
  const rounded = Number(value.toFixed(PRECISION));
  const normalized = Object.is(rounded, -0) ? 0 : rounded;
  return String(normalized);
}

export class SvgValueError extends Error {
  override readonly name = "SvgValueError";
}

/** Escapes text for use in element content or a quoted attribute value. */
export function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export type AttrValue = string | number | boolean | undefined | null;

/**
 * Serializes attributes in the order given. Insertion order is the emission
 * order - no sorting, no object-key surprises - because the golden suite
 * compares bytes, not parsed trees.
 */
function attrs(attributes: Record<string, AttrValue>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === null || value === false) continue;
    const serialized = typeof value === "number" ? num(value) : value === true ? key : String(value);
    parts.push(` ${key}="${escapeText(serialized)}"`);
  }
  return parts.join("");
}

export function el(
  tag: string,
  attributes: Record<string, AttrValue>,
  children?: string | string[],
): string {
  const body = Array.isArray(children) ? children.join("") : (children ?? "");
  if (body === "") return `<${tag}${attrs(attributes)}/>`;
  return `<${tag}${attrs(attributes)}>${body}</${tag}>`;
}

export function circle(cx: number, cy: number, r: number, attributes: Record<string, AttrValue> = {}): string {
  return el("circle", { cx, cy, r, ...attributes });
}

export function rect(
  x: number,
  y: number,
  width: number,
  height: number,
  attributes: Record<string, AttrValue> = {},
): string {
  return el("rect", { x, y, width, height, ...attributes });
}

export function path(d: string, attributes: Record<string, AttrValue> = {}): string {
  return el("path", { d, ...attributes });
}

export function group(attributes: Record<string, AttrValue>, children: string | string[]): string {
  return el("g", attributes, children);
}

export function text(
  x: number,
  y: number,
  content: string,
  attributes: Record<string, AttrValue> = {},
): string {
  return el("text", { x, y, ...attributes }, escapeText(content));
}

// ---------------------------------------------------------------------------
// Path building
// ---------------------------------------------------------------------------

/** Accumulates path commands with consistent rounding and spacing. */
export class PathBuilder {
  private readonly parts: string[] = [];

  moveTo(x: number, y: number): this {
    this.parts.push(`M${num(x)} ${num(y)}`);
    return this;
  }

  lineTo(x: number, y: number): this {
    this.parts.push(`L${num(x)} ${num(y)}`);
    return this;
  }

  quadraticTo(cx: number, cy: number, x: number, y: number): this {
    this.parts.push(`Q${num(cx)} ${num(cy)} ${num(x)} ${num(y)}`);
    return this;
  }

  cubicTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): this {
    this.parts.push(
      `C${num(c1x)} ${num(c1y)} ${num(c2x)} ${num(c2y)} ${num(x)} ${num(y)}`,
    );
    return this;
  }

  close(): this {
    this.parts.push("Z");
    return this;
  }

  get isEmpty(): boolean {
    return this.parts.length === 0;
  }

  toString(): string {
    return this.parts.join("");
  }
}

// ---------------------------------------------------------------------------
// Document assembly
// ---------------------------------------------------------------------------

export interface SvgDocumentOptions {
  width: number;
  height: number;
  /** Becomes <title>: the spoken one-line biography. */
  title: string;
  /** Becomes <desc>: the longer reading. */
  desc: string;
  locale: string;
  style?: string | undefined;
  defs?: string | undefined;
}

/**
 * Wraps body content in a complete SVG document.
 *
 * `<title>` and `<desc>` come first because assistive technology announces the
 * first title it finds; a screen-reader user gets the tree's biography rather
 * than "image".
 */
export function svgDocument(options: SvgDocumentOptions, body: string): string {
  const { width, height, title, desc, locale, style, defs } = options;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(width)}" height="${num(height)}"`,
    ` viewBox="0 0 ${num(width)} ${num(height)}" role="img" lang="${escapeText(locale)}">`,
    `<title>${escapeText(title)}</title>`,
    `<desc>${escapeText(desc)}</desc>`,
  ];
  if (defs !== undefined && defs !== "") parts.push(`<defs>${defs}</defs>`);
  if (style !== undefined && style !== "") parts.push(`<style>${style}</style>`);
  parts.push(body, "</svg>");
  return parts.join("");
}

/** Byte length of a serialized document, for the size budgets. */
export function byteLength(svg: string): number {
  let bytes = 0;
  for (const char of svg) {
    const code = char.codePointAt(0)!;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}
