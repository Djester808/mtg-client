import { PrintingDto } from '../models/game.models';
import { SelectMenuOption } from '../components/select-menu/select-menu.component';

/**
 * One place that turns a printing into a picker option.
 *
 * There were four of these — the search panel, the collection grid, the grouped-card
 * picker and the single-owned-printing label — each formatting the label slightly
 * differently, so the same card read as "LEA #1", "LEA", or "LEA #1 ×2" depending on
 * which control you were looking at.
 */
export interface PrintingOptionOpts {
  /** Override the option's value; defaults to the printing's scryfallId. */
  value?: string;
  /** Appended to the label, e.g. a copy count for grouped rows. */
  suffix?: string;
}

export function printingOption(p: PrintingDto, opts: PrintingOptionOpts = {}): SelectMenuOption {
  const code = p.setCode.toUpperCase();
  const num = p.collectorNumber ? ` #${p.collectorNumber}` : '';
  return {
    value: opts.value ?? p.scryfallId,
    label: `${code}${num}${opts.suffix ?? ''}`,
    title: p.setName ?? code,
    iconCode: p.setCode,
  };
}

export function printingOptions(printings: readonly PrintingDto[]): SelectMenuOption[] {
  return printings.map((p) => printingOption(p));
}

/**
 * The same option when the printing list has not loaded yet — all that is known is the
 * set code carried on the row itself, so the collector number is omitted rather than
 * invented.
 */
export function setCodeOption(
  value: string,
  setCode: string | null | undefined,
  suffix = '',
): SelectMenuOption {
  const code = (setCode ?? '').toUpperCase();
  return {
    value,
    label: `${code || '···'}${suffix}`,
    title: code,
    iconCode: setCode ?? null,
  };
}
