export enum ManaColor {
  Colorless = 'C',
  White     = 'W',
  Blue      = 'U',
  Black     = 'B',
  Red       = 'R',
  Green     = 'G',
}

export enum CardType {
  Creature     = 'Creature',
  Instant      = 'Instant',
  Sorcery      = 'Sorcery',
  Enchantment  = 'Enchantment',
  Artifact     = 'Artifact',
  Land         = 'Land',
  Planeswalker = 'Planeswalker',
}

export enum Phase {
  Beginning      = 'Beginning',
  PreCombatMain  = 'PreCombatMain',
  Combat         = 'Combat',
  PostCombatMain = 'PostCombatMain',
  Ending         = 'Ending',
}

export enum Step {
  Untap              = 'Untap',
  Upkeep             = 'Upkeep',
  Draw               = 'Draw',
  Main               = 'Main',
  BeginningOfCombat  = 'BeginningOfCombat',
  DeclareAttackers   = 'DeclareAttackers',
  DeclareBlockers    = 'DeclareBlockers',
  FirstStrikeDamage  = 'FirstStrikeDamage',
  CombatDamage       = 'CombatDamage',
  EndOfCombat        = 'EndOfCombat',
  End                = 'End',
  Cleanup            = 'Cleanup',
}

export enum GameResult {
  InProgress  = 'InProgress',
  Player1Wins = 'Player1Wins',
  Player2Wins = 'Player2Wins',
  Draw        = 'Draw',
}

export enum StackObjectType {
  Spell            = 'Spell',
  ActivatedAbility = 'ActivatedAbility',
  TriggeredAbility = 'TriggeredAbility',
}

export enum ZoneName {
  Library    = 'Library',
  Hand       = 'Hand',
  Battlefield= 'Battlefield',
  Graveyard  = 'Graveyard',
  Exile      = 'Exile',
  Stack      = 'Stack',
}

export enum CounterType {
  PlusOnePlusOne   = 'PlusOnePlusOne',
  MinusOneMinusOne = 'MinusOneMinusOne',
  Loyalty          = 'Loyalty',
  Charge           = 'Charge',
  Poison           = 'Poison',
}
