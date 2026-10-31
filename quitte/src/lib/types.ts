export type Kind = 'expense' | 'income' | 'transfer';
export type SplitMode = 'equal' | 'amounts' | 'shares';

/** Een deel van een bedrag: member-id + bedrag in centen. */
export type Part = { m: string; a: number };

export type Member = {
  id: string;
  name: string;
  iban?: string | null;
  deleted?: boolean;
  updatedAt: string;
};

export type Entry = {
  id: string;
  kind: Kind;
  title: string;
  amount: number;
  category?: string | null;
  date: string; // YYYY-MM-DD
  payers: Part[];
  shares: Part[];
  splitMode: SplitMode;
  weights?: Record<string, number> | null;
  batchId?: string | null;
  note?: string | null;
  createdBy?: string | null;
  createdAt?: string;
  updatedAt: string;
  deleted?: boolean;
};

export type Activity = { id: number | string; actor: string; summary: string; at: string };

export type ListInfo = {
  id: string;
  name: string;
  currency: string;
  archived: boolean;
  rev: number;
  updatedAt: string;
  createdAt?: string;
};

export type ListState = {
  list: ListInfo;
  members: Member[];
  entries: Entry[];
  activity: Activity[];
};

export type Op =
  | { uid: string; op: 'member'; data: Member; summary?: string }
  | { uid: string; op: 'entry'; data: Entry; summary?: string }
  | { uid: string; op: 'delete_batch'; batchId: string; data: { updatedAt: string }; summary?: string }
  | {
      uid: string;
      op: 'list';
      data: { name?: string; archived?: boolean; currency?: string; updatedAt: string };
      summary?: string;
    };

export type LocalList = {
  id: string;
  token: string;
  me: string | null;
  /** Laatste bevestigde serverstaat (of de lokale beginstaat als hij nog niet is aangemaakt). */
  base: ListState;
  /** Nog niet verstuurde bewerkingen (offline wachtrij). */
  pending: Op[];
  /** Lijst bestaat nog niet op de server. */
  needsCreate: boolean;
  lastSyncAt?: number;
  syncError?: string | null;
  joinedAt: number;
  /** Vaste verdeelsleutels (alleen op dit toestel). */
  splitKeys?: SplitKey[];
};

export type SplitKey = { id: string; name: string; weights: Record<string, number> };
