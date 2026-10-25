import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { combineLatest, map } from 'rxjs';
import { AppState, GameActions, UIActions } from '../../store';
import {
  selectCastDraft,
  selectLocalPlayer,
  selectLocalPermanents,
  selectHasPriority,
  selectChoice,
  selectPlayers,
  selectBattlefield,
  selectStack,
  selectPendingTargets,
} from '../../store/selectors';
import { CardCastingService } from '../../game/card-casting.service';
import { PlayLegalityService } from '../../game/play-legality.service';
import { CastDraft } from '../../store/ui/ui.reducer';
import { ManaCostComponent } from '../mana-cost/mana-cost.component';

@Component({
  selector: 'app-cast-prompt',
  standalone: true,
  imports: [CommonModule, ManaCostComponent],
  templateUrl: './cast-prompt.component.html',
  styleUrls: ['./cast-prompt.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CastPromptComponent {
  vm$ = combineLatest([
    this.store.select(selectCastDraft),
    this.store.select(selectLocalPlayer),
    this.store.select(selectLocalPermanents),
    this.store.select(selectHasPriority),
    this.store.select(selectChoice),
    this.store.select(selectPlayers),
    this.store.select(selectBattlefield),
    this.store.select(selectStack),
    this.store.select(selectPendingTargets),
  ]).pipe(
    map(([draft, me, permanents, priority, choice, players, field, stack, pending]) => {
      if (!draft) return null;
      const cost = this.casting.cost(draft);
      const ready = !!priority && !choice;
      const names = new Map<string, string>([
        ...players.map((p) => [p.playerId, p.name] as [string, string]),
        ...field.map((p) => [p.permanentId, p.sourceCard.name] as [string, string]),
        ...stack.map((p) => [p.stackObjectId, p.sourceCard?.name ?? 'Spell'] as [string, string]),
      ]);
      return {
        draft,
        cost,
        ready,
        affordable: this.legality.canAfford(cost, me?.manaPool),
        targetCount: this.casting.targets(draft),
        targets: (draft.stage === 'targets' ? pending : draft.targets).map(
          (id) => names.get(id) ?? id,
        ),
        players,
        spells: stack.map((spell) => ({ id: spell.stackObjectId, name: spell.sourceCardName })),
        pool: Object.entries(me?.manaPool.amounts ?? {}).filter(([, n]) => n > 0),
        sources: permanents.flatMap((p) =>
          this.legality
            .usableAbilities(p)
            .filter((a) => a.isManaAbility && !a.announcesVariable)
            .map((a) => ({
              id: p.permanentId,
              ability: a.id,
              label: p.sourceCard.name + ' — ' + a.text,
            })),
        ),
      };
    }),
  );
  constructor(
    private store: Store<AppState>,
    public casting: CardCastingService,
    private legality: PlayLegalityService,
  ) {}
  setX(value: string): void {
    this.store.dispatch(UIActions.setCastX({ value: Number(value) }));
  }
  mana(id: string, ability: string): void {
    this.store.dispatch(
      GameActions.activateAbility({ permanentId: id, abilityId: ability, targetIds: [] }),
    );
  }
  target(id: string): void {
    this.store.dispatch(UIActions.addTarget({ targetId: id }));
  }
  next(draft: CastDraft): void {
    this.casting.continue(draft);
  }
  back(): void {
    this.store.dispatch(UIActions.setCastStage({ stage: 'payment' }));
  }
  submit(): void {
    this.store.dispatch(UIActions.submitCast());
  }
  cancel(): void {
    this.store.dispatch(UIActions.cancelCast());
  }
}
