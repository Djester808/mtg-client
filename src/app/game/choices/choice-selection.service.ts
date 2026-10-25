import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ChoiceDto } from '../../models/game.models';

/** Local presentation metadata; never sent to the rules server. */
export type ChoiceSubmissionControl = 'option' | 'confirm' | 'skip';
export interface ChoiceSubmission {
  readonly control: ChoiceSubmissionControl | null;
  readonly picks: readonly string[];
}

/** Selection state for one pending choice. Scoped to its owning board or dialog. */
@Injectable()
export class ChoiceSelectionService {
  private choiceId: string | null = null;
  private readonly selected = new BehaviorSubject<string[]>([]);
  readonly picks$ = this.selected.asObservable();
  get picks(): string[] {
    return this.selected.value;
  }

  reset(): void {
    this.selected.next([]);
  }

  bind(choice: ChoiceDto): void {
    if (this.choiceId !== choice.id) {
      this.choiceId = choice.id;
      this.reset();
    } else {
      const retained = this.offeredPicks(choice);
      if (retained.length !== this.picks.length) this.selected.next(retained);
    }
  }

  select(choice: ChoiceDto, optionId: string): string[] | null {
    this.bind(choice);
    if (!choice.options?.some((option) => option.id === optionId)) return null;
    if (choice.maxPicks === 1 && !this.requiresConfirmation(choice)) return [optionId];
    if (choice.isDivision) {
      if (this.picks.length < choice.totalToDivide) this.selected.next([...this.picks, optionId]);
    } else if (this.picks.includes(optionId)) {
      this.selected.next(this.picks.filter((id) => id !== optionId));
    } else if (this.picks.length < choice.maxPicks) {
      this.selected.next([...this.picks, optionId]);
      const completeSearch = choice.kind === 'search' && !choice.isOrdering;
      if (completeSearch && this.picks.length === choice.maxPicks) return [...this.picks];
    }
    return null;
  }

  placeOnTop(choice: ChoiceDto, optionId: string): string[] | null {
    this.bind(choice);
    if (
      choice.kind !== 'library-top-order' ||
      !choice.isOrdering ||
      choice.isDivision ||
      choice.minPicks !== choice.options?.length ||
      choice.maxPicks !== choice.options.length ||
      !choice.options.some((option) => option.id === optionId)
    )
      return null;
    this.selected.next([optionId, ...this.picks.filter((id) => id !== optionId)]);
    return this.picks.length === choice.maxPicks ? [...this.picks] : null;
  }

  remainingPicks(choice: ChoiceDto): number {
    return Math.max(0, choice.maxPicks - this.picks.length);
  }

  requiresConfirmation(choice: ChoiceDto): boolean {
    return (
      choice.maxPicks > 1 ||
      (choice.kind === 'search' &&
        (choice.maxPicks !== 1 || choice.isOrdering || choice.isDivision))
    );
  }

  move(choice: ChoiceDto, optionId: string, direction: -1 | 1): void {
    this.bind(choice);
    if (!choice.isOrdering || choice.isDivision) return;
    const index = this.picks.indexOf(optionId);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= this.picks.length) return;
    const reordered = [...this.picks];
    [reordered[index], reordered[destination]] = [reordered[destination], reordered[index]];
    this.selected.next(reordered);
  }

  order(optionId: string): number {
    return this.picks.indexOf(optionId) + 1;
  }
  assigned(optionId: string): number {
    return this.picks.filter((id) => id === optionId).length;
  }
  remaining(choice: ChoiceDto): number {
    return Math.max(0, choice.totalToDivide - this.picks.length);
  }
  private offeredPicks(choice: ChoiceDto): string[] {
    const offered = new Set(choice.options?.map((option) => option.id) ?? []);
    return this.picks.filter((id) => offered.has(id));
  }
  canSubmit(choice: ChoiceDto): boolean {
    if (this.offeredPicks(choice).length !== this.picks.length) return false;
    return choice.isDivision
      ? this.picks.length === choice.totalToDivide
      : this.picks.length >= choice.minPicks && this.picks.length <= choice.maxPicks;
  }
}
