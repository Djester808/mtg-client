import { Injectable } from '@angular/core';

/** One line of a pretty-printed reading, with the path it renders and whether it is the difference. */
export interface JsonLine {
  text: string;
  /** The path this line is at, e.g. `effects.0.amount`. Empty for a closing brace. */
  path: string;
  /** True on the single line the server named as the first difference. */
  highlighted: boolean;
}

/**
 * Paths as compared rather than as written.
 *
 * The server names the difference in whatever spelling its walker produced —
 * `Effects[0].Amount`, `$.effects[0].amount`, `effects/0/amount` — and none of those is worth
 * a round trip to standardise. Both sides are flattened to lower-case dot segments with array
 * indices as plain segments, so all three spellings above become `effects.0.amount` and the
 * highlight lands whichever one arrives.
 */
function normalizePath(path: string | null | undefined): string {
  return (path ?? '')
    .replace(/^\$/, '')
    .replace(/\[(\d+)\]/g, '.$1')
    .replace(/\//g, '.')
    .split('.')
    .filter((s) => s.length > 0)
    .join('.')
    .toLowerCase();
}

/**
 * Renders a model's reading for the dispute queue.
 *
 * Pretty-printing is `JSON.stringify(v, null, 2)`'s job everywhere else in this app, and it is
 * not used here for one reason: the point of this screen is *where* the readings differ, and a
 * blob of text cannot say which of its lines is `Effects[0].Amount`. So the JSON is walked and
 * emitted line by line with each line's path attached, which is what makes the highlight — and
 * the spec for the highlight — possible at all.
 *
 * Pure and stateless: the page memoizes on the reading identity, this just renders.
 */
@Injectable({ providedIn: 'root' })
export class CardDisputeDiffService {
  /**
   * The reading as lines, with the first-difference line flagged.
   *
   * Unparseable JSON is shown verbatim on one line rather than swallowed — a reading the
   * pipeline wrote that this page cannot read is a fact worth seeing, and an empty panel would
   * read as "the models agreed".
   */
  lines(definitionJson: string, firstDifference: string | null | undefined): JsonLine[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(definitionJson) as unknown;
    } catch {
      return [{ text: definitionJson, path: '', highlighted: false }];
    }

    const out: JsonLine[] = [];
    this.emit(parsed, '', '', 0, false, out, normalizePath(firstDifference));
    return out;
  }

  /** Whether the named path actually exists in this reading — false when nothing got highlighted. */
  hasDifference(lines: readonly JsonLine[]): boolean {
    return lines.some((l) => l.highlighted);
  }

  private emit(
    value: unknown,
    path: string,
    label: string,
    depth: number,
    comma: boolean,
    out: JsonLine[],
    target: string,
  ): void {
    const pad = '  '.repeat(depth);
    const key = label ? `${label}: ` : '';
    const tail = comma ? ',' : '';
    const hit = target !== '' && normalizePath(path) === target;

    if (Array.isArray(value)) {
      if (value.length === 0) {
        out.push({ text: `${pad}${key}[]${tail}`, path, highlighted: hit });
        return;
      }
      out.push({ text: `${pad}${key}[`, path, highlighted: hit });
      value.forEach((item, i) =>
        this.emit(item, `${path}[${i}]`, '', depth + 1, i < value.length - 1, out, target),
      );
      out.push({ text: `${pad}]${tail}`, path: '', highlighted: false });
      return;
    }

    if (value !== null && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0) {
        out.push({ text: `${pad}${key}{}${tail}`, path, highlighted: hit });
        return;
      }
      out.push({ text: `${pad}${key}{`, path, highlighted: hit });
      entries.forEach(([k, v], i) =>
        this.emit(
          v,
          path ? `${path}.${k}` : k,
          JSON.stringify(k),
          depth + 1,
          i < entries.length - 1,
          out,
          target,
        ),
      );
      out.push({ text: `${pad}}${tail}`, path: '', highlighted: false });
      return;
    }

    out.push({ text: `${pad}${key}${JSON.stringify(value)}${tail}`, path, highlighted: hit });
  }
}
