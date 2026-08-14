export enum ManaColor {
  Colorless = 'C',
  White = 'W',
  Blue = 'U',
  Black = 'B',
  Red = 'R',
  Green = 'G',
}

// Keep in sync with the server's CardTypeDto — values arrive as these strings.
export enum CardType {
  Creature = 'Creature',
  Instant = 'Instant',
  Sorcery = 'Sorcery',
  Enchantment = 'Enchantment',
  Artifact = 'Artifact',
  Land = 'Land',
  Planeswalker = 'Planeswalker',
  Battle = 'Battle',
  Tribal = 'Tribal',
  Token = 'Token',
  Other = 'Other',
}
