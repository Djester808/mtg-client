export interface TableSeat {
  userId: string;
  name: string;
  ready: boolean;
  deckId: string | null;
}

export interface GameTable {
  id: string;
  hostUserId: string;
  isHost: boolean;
  capacity: number;
  format: string;
  startingLife: number;
  allowHonourSystem: boolean;
  seats: TableSeat[];
  revision: number;
  starting: boolean;
  cancelled: boolean;
  gameId: string | null;
}

export interface TableDeck {
  id: string;
  name: string;
  format: string | null;
  cardCount: number;
}

export interface CreateTable {
  deckId: string;
  capacity: number;
  format: string;
  startingLife: number;
  allowHonourSystem: boolean;
  invitees: string[];
}
