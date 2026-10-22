# MTG Arena — local reverse engineering (build 0.1.14517.1329972, 2026-10-06)

Method: Arena is a Unity **Mono** build, so `MTGA_Data/Managed/*.dll` are plain .NET assemblies.
Read with System.Reflection.Metadata (metadata only; no Arena code loaded or run). This is the
REA skill's "managed PE/CLI assembly" route done by hand (REA MCP was not installed).
Observation = type/member/constant names. Values held in Unity scene/prefab assets (gutters,
card scales, bounds) were NOT read — unknown.

## Battlefield = typed regions per player
- `BattlefieldRegionType { Land, Artifact, Creature, Planeswalker, Battles }`.
- `BattlefieldCardHolder` has `LocalCreatureRegion, LocalLandRegion, LocalArtifactRegion,
  LocalPlaneswalkerRegion` and the four `Opponent…Region` mirrors → permanents are auto-sorted by
  card type into fixed regions; no free placement.
- `BattlefieldRegionDefinition { Owner, Type, LayoutVariants, SharedSubRegions }` and
  `LayoutVariant { Bounds, UsesPaging, LeftPagingArrow, RightPagingArrow, TreatSubRegionsAsPages,
  RowCount }` → a region picks between layout variants as it fills, and when it still overflows it
  **pages** (`RegionPagingButton` with a count) rather than shrinking cards forever.
- `SubRegion { RowCount, CardScale, HorizontalGutter, VerticalGutter, StackWidth, StackLimit,
  StackCountLimit, StackCountDisplay, Alignment }` → per-region card scale and multi-row.

## Duplicate stacking
- `BattlefieldStack { StackParent, StackedCards, CardCount, AttachmentCount, ExileCount,
  IsAttackStack, IsBlockStack, Age }` with `CanStack`, `CompareAge`, `CompareAvailableActions`.
  Identical permanents collapse into one pile with a count (`CdcStackCounterView`); auras/equipment
  and cards exiled-with show as counts on the parent; piles split by available actions (a tapped
  and an untapped copy do not share a pile); sorted by age.
- `BlockerStacking { CanStack, CannotStack }`, `DeclaredAttackOffset`, `TapRotation` on the holder:
  attackers slide forward; tapped = rotated.

## Fixed chrome around the board
`BattleFieldStaticElementsLayout` (plus `_HandHeld` variant) places, for local and opponent each:
avatar, mana pool, counter pool, hand, graveyard, exile, library, frame, HP, turn frame, command
zone, rank, username, timeout display, match timer, win pips; plus one shared `_stackContainer`
and `_promptButtonsAnchorPoint`. Zones are piles beside the avatar, not panels.

## Hand
`CardLayout_Hand { Radius, FitAngle, MaxDeltaAngle, OverlapRotation, MinimumCardsForFocus,
MaxFocusDistance, FocusProximityWeight }` → arc fan; hovering spreads neighbours apart (focus).
`OpponentHandCardHolder` shows opponent card backs.

## Phone build exists
`MobileBattlefieldScaler { idealAspectRatio, safeAreaOffsetX/Z, expectedScaleMappings }`,
`HandCardHolder_Handheld`, `StackCardHolder_Handheld`, `HandheldTooltip`, `HandheldPopupState`,
`LowTimeWarning_Handheld` → same scene, scaled per aspect ratio, landscape, safe-area aware.

## Multiplayer is in the client (not shipped as a mode)
- `QuadrantOffsetCalculator { QUADARANT_UP_OFFSET = -38.1452, QUADRANT_RIGHT_OFFSET = -64.3885 }`
  and `AvatarLayout_Quadrant` → each player keeps a full duel-sized board, placed in a quadrant of
  world space, offset by relative seat (`RelativePlayerIdCalculator { _localPlayerId, _playerCount }`).
- `PlayerFocusController_Quadrant { VIEW_ALL_POSITION, NavigationKeys, _focusPlayerId, _focusMode }`,
  `FocusMode { Single, All }`, `NavigationDirection { Clockwise, CounterClockwise }`,
  `GetNextPlayerId / GetPrevPlayerId`, `SetPlayerVisibility`.
  → The camera shows **one opponent at full size** (Single) or pulls back to **all boards**
  (All), and the player steps clockwise / counter-clockwise through opponents with keys.
  Opponents are never shrunk to fit three-up; they are visited.
- `PlayerCountValidator`, `ControllerIsFocusPlayer`, `MultiplayerNumericAidStateParser`.
- Web research: 4-player Commander on Arena is "being worked on", unreleased (dynasage, 2026-09).

## Takeaways for our board
1. Sort permanents into typed rows (creatures front, lands back, other in between); never free placement.
2. Collapse identical permanents into a counted pile; split piles by tapped / actionable state.
3. When a row overflows, page it (with a count) before cards shrink below readable.
4. In multiplayer, keep opponent boards readable by **focusing one at a time** with an overview,
   stepping in turn order — not by tiling three tiny boards.
5. Zones are count piles beside the player plate; one shared stack.
