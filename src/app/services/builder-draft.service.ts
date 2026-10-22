import { Injectable, inject } from '@angular/core';
import { AiBuildPlan, CommanderSuggestion } from '../models/ai-builder.models';
import { OwnerDraftsService } from './owner-drafts.service';
export interface BuilderDraft {
  version: 1;
  brief: string;
  colors: string[];
  bracket: number;
  ownedOnly: boolean;
  step: 'brief' | 'commanders' | 'plan';
  suggestions: CommanderSuggestion[];
  picked: CommanderSuggestion | null;
  plan: AiBuildPlan | null;
  saveAttemptDeckId: string | null;
  stageLabel: string;
  stageStep: number;
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function commander(value: unknown): value is CommanderSuggestion {
  return (
    record(value) &&
    typeof value['oracleId'] === 'string' &&
    typeof value['name'] === 'string' &&
    Array.isArray(value['colorIdentity'])
  );
}
function plan(value: unknown): value is AiBuildPlan {
  if (
    !record(value) ||
    typeof value['commanderOracleId'] !== 'string' ||
    typeof value['commanderName'] !== 'string' ||
    !Array.isArray(value['cards']) ||
    value['cards'].length > 500 ||
    !record(value['assessment'])
  )
    return false;
  const assessment = value['assessment'];
  return (
    typeof assessment['verdict'] === 'string' &&
    Array.isArray(assessment['findings']) &&
    record(assessment['facts']) &&
    Array.isArray(assessment['facts']['colorSources']) &&
    value['cards'].every(
      (c) =>
        record(c) &&
        typeof c['name'] === 'string' &&
        typeof c['oracleId'] === 'string' &&
        typeof c['board'] === 'string' &&
        Number.isInteger(c['quantity']) &&
        Number(c['quantity']) > 0 &&
        Number(c['quantity']) <= 999,
    )
  );
}
export function validBuilderDraft(value: unknown): value is BuilderDraft {
  if (!record(value)) return false;
  return (
    value['version'] === 1 &&
    typeof value['brief'] === 'string' &&
    value['brief'].length <= 600 &&
    Array.isArray(value['colors']) &&
    value['colors'].every((c) => typeof c === 'string' && ['W', 'U', 'B', 'R', 'G'].includes(c)) &&
    Number.isInteger(value['bracket']) &&
    Number(value['bracket']) >= 1 &&
    Number(value['bracket']) <= 5 &&
    typeof value['ownedOnly'] === 'boolean' &&
    ['brief', 'commanders', 'plan'].includes(String(value['step'])) &&
    Array.isArray(value['suggestions']) &&
    value['suggestions'].length <= 30 &&
    value['suggestions'].every(commander) &&
    (value['picked'] === null || commander(value['picked'])) &&
    (value['plan'] === null || plan(value['plan'])) &&
    (value['saveAttemptDeckId'] === null || typeof value['saveAttemptDeckId'] === 'string') &&
    typeof value['stageLabel'] === 'string' &&
    typeof value['stageStep'] === 'number'
  );
}
@Injectable({ providedIn: 'root' })
export class BuilderDraftService {
  readonly drafts = inject(OwnerDraftsService);
  load(): BuilderDraft | null {
    return this.drafts.read('builder', 'current', validBuilderDraft);
  }
  save(value: BuilderDraft): void {
    this.drafts.write('builder', 'current', value);
  }
  clear(): void {
    this.drafts.remove('builder', 'current');
  }
}
