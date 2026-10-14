export interface ParsedTransaction {
  date: string; // YYYY-MM-DD
  amount: number; // + прихід, − видаток
  currency: string;
  counterpartyName: string | null;
  counterpartyAccount: string | null; // 123456789/0800 або IBAN
  variableSymbol: string | null;
  constantSymbol: string | null;
  specificSymbol: string | null;
  message: string;
  externalId: string | null;
}

export interface ParsedStatement {
  iban: string | null;
  accountNumber: string | null;
  currency: string;
  openingBalance: number | null;
  closingBalance: number | null;
  periodFrom: string | null;
  periodTo: string | null;
  transactions: ParsedTransaction[];
  /** Banka a název účtu z výpisu — podle nich se výpis přiřadí firmě, když účet ještě není v systému */
  bank?: string;
  accountName?: string | null;
}
