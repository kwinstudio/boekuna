export type Kind = 'expense' | 'income' | 'transfer';
export type SplitMode = 'equal' | 'amounts' | 'shares';

/** Een deel van een bedrag: member-id + bedrag in centen. */
export type Part = { m: string; a: number };

export type Member = {
  id: string;
  name: string;
  iban?: string | null;
  payLink?: string | null;
  claimed?: boolean;
  deleted?: boolean;
  updatedAt: string;
};

export type Repeat = 'weekly' | 'monthly';

export type Comment = {
  id: string;
  entryId: string;
  memberId: string | null;
  body?: string | null;
  emoji?: string | null;
  at: string;
  deleted?: boolean;
};

export type ListSettings = { directDebts?: boolean; defaultSplit?: string | null };

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
  updatedBy?: string | null;
  deleted?: boolean;
  deletedAt?: string | null;
  origCurrency?: string | null;
  origAmount?: number | null;
  rate?: number | null;
  photos?: string[];
  repeat?: Repeat | null;
  repeatNext?: string | null;
  repeatParent?: string | null;
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
  splitKeys?: SplitKey[];
  settings?: ListSettings;
};

export type ListState = {
  list: ListInfo;
  members: Member[];
  entries: Entry[];
  activity: Activity[];
  trash?: Entry[];
  comments?: Comment[];
};

export type Op =
  | { uid: string; op: 'member'; data: Member; summary?: string }
  | { uid: string; op: 'entry'; data: Entry; summary?: string }
  | { uid: string; op: 'delete_batch'; batchId: string; data: { updatedAt: string }; summary?: string }
  | {
      uid: string;
      op: 'list';
      data: { name?: string; archived?: boolean; currency?: string; splitKeys?: SplitKey[]; updatedAt: string };
      summary?: string;
    }
  | { uid: string; op: 'comment'; data: Comment & { updatedAt: string }; summary?: string }
  | { uid: string; op: 'merge'; data: { from: string; into: string; updatedAt: string }; summary?: string }
  | { uid: string; op: 'settings'; data: { settings: ListSettings; updatedAt: string }; summary?: string };

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
  /** Oude, lokale verdeelsleutels (worden bij openen naar de gedeelde lijst gekopieerd). */
  splitKeys?: SplitKey[];
  /** Lokale voorkeuren voor slimme standaarden. */
  lastPayer?: string | null;
  invitedAt?: number | null;
};

export type SplitKey = { id: string; name: string; weights: Record<string, number> };
