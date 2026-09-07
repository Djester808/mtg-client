import { Injectable } from '@angular/core';
import { CardReading } from '../../services/card-implementation-api.service';

/** One line of a pretty-printed reading, with the path it renders and whether it is the difference. */
export interface JsonLine {
  text: string;
  /** The path this line is at, e.g. `effects.0.amount`. Empty for a closing brace. */
  path: string;
  /** True on the line the two readings first part company at. */
  highlighted: boolean;
}

/** One model's reading, rendered. */
export interface RenderedReading {
  model: string;
  lines: JsonLine[];
}

/** Both readings rendered against each other, with the disagreement located. */
export interface DisputeRendering {
  readings: RenderedReading[];
  /** Index into every reading's lines of the first line they differ at; -1 when none was found. */
  lineIndex: number;
  /**
   * The path that line sits at, for the header — `abilities.0.do.kind`. Empty when the line has
   * no path of its own (a closing brace) or when there is no difference to name.
   */
  path: string;
}

/**
 * Renders the readings for the dispute queue and finds where they part company.
 *
 * Pretty-printing is `JSON.stringify(v, null, 2)`'s job everywhere else in this app, and it is
 * not used here for one reason: the point of this screen is *where* the readings differ, and a
 * blob of text cannot say which of its lines that is. So the JSON is walked and emitted line by
 * line with each line's path attached, which is what makes the highlight — and the spec for the
 * highlight — possible at all.
 *
 * **The difference is found here, not on the server.** The first version of this file took the
 * DTO's `firstDifference` for a path (`Effects[0].Amount`) and looked it up in each reading;
 * `CardImplementationService.FirstDifference` has never sent one. It walks the two JSON strings
 * to the first differing *character* and returns 60 characters of each side around it, joined by
 * ` | ` — so the lookup matched nothing on all 105 disputed cards in the pilot corpus, every
 * panel showed "the named path is not in this reading", and not one line was ever highlighted.
 * Both readings are already here in full, so the comparison belongs here: the same walker emits
 * both, which makes the two line lists comparable position by position, and the first index whose
 * text differs is the line. The server's excerpt is not used at all — see the note on
 * `DisputedCard.firstDifference`.
 *
 * Pure and stateless: the page renders once per queue load, this just renders.
 */
@Injectable({ providedIn: 'root' })
export class CardDisputeDiffService {
  /**
   * Both readings as lines, with the first differing line flagged in each.
   *
   * Unparseable JSON is shown verbatim on one line rather than swallowed — a reading the
   * pipeline wrote that this page cannot read is a fact worth seeing, and an empty panel would
   * read as "the models agreed".
   */
  render(readings: readonly CardReading[]): DisputeRendering {
    const rendered: RenderedReading[] = (readings ?? []).map((r) => ({
      model: r.model,
      lines: this.lines(r.definitionJson),
    }));

    const lineIndex = this.firstDifference(rendered);
    if (lineIndex >= 0) {
      for (const reading of rendered) {
        if (lineIndex < reading.lines.length) reading.lines[lineIndex].highlighted = true;
      }
    }

    const path = rendered.map((r) => r.lines[lineIndex]?.path).find((p) => !!p) ?? '';
    return { readings: rendered, lineIndex, path };
  }

  /** One reading as lines. Nothing is highlighted — `render` decides that by comparison. */
  lines(definitionJson: string): JsonLine[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(definitionJson) as unknown;
    } catch {
      return [{ text: definitionJson, path: '', highlighted: false }];
    }

    const out: JsonLine[] = [];
    this.emit(parsed, '', '', 0, false, out);
    return out;
  }

  /**
   * The first line the readings disagree on, or -1.
   *
   * A card with one reading left has nothing to compare and gets no highlight rather than a
   * highlight on line 0 — the queue does show single-reading cards, because the pipeline writes
   * a `Disputed` status with one candidate when the other model's output would not lint.
   * Readings of different lengths differ at the index the shorter one runs out.
   */
  private firstDifference(readings: readonly RenderedReading[]): number {
    if (readings.length < 2) return -1;
    const [a, b] = [readings[0].lines, readings[1].lines];
    const shared = Math.min(a.length, b.length);
    for (let i = 0; i < shared; i++) {
      if (a[i].text !== b[i].text) return i;
    }
    return a.length === b.length ? -1 : shared;
  }

  private emit(
    value: unknown,
    path: string,
    label: string,
    depth: number,
    comma: boolean,
    out: JsonLine[],
  ): void {
    const pad = '  '.repeat(depth);
    const key = label ? `${label}: ` : '';
    const tail = comma ? ',' : '';

    if (Array.isArray(value)) {
      if (value.length === 0) {
        out.push({ text: `${pad}${key}[]${tail}`, path, highlighted: false });
        return;
      }
      out.push({ text: `${pad}${key}[`, path, highlighted: false });
      value.forEach((item, i) =>
        this.emit(item, `${path}[${i}]`, '', depth + 1, i < value.length - 1, out),
      );
      out.push({ text: `${pad}]${tail}`, path: '', highlighted: false });
      return;
    }

    if (value !== null && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0) {
        out.push({ text: `${pad}${key}{}${tail}`, path, highlighted: false });
        return;
      }
      out.push({ text: `${pad}${key}{`, path, highlighted: false });
      entries.forEach(([k, v], i) =>
        this.emit(
          v,
          path ? `${path}.${k}` : k,
          JSON.stringify(k),
          depth + 1,
          i < entries.length - 1,
          out,
        ),
      );
      out.push({ text: `${pad}}${tail}`, path: '', highlighted: false });
      return;
    }

    out.push({ text: `${pad}${key}${JSON.stringify(value)}${tail}`, path, highlighted: false });
  }
}
