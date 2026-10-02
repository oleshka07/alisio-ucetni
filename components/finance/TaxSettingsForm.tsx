"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export type TaxSettingsValue = {
  taxCalendar: boolean;
  taxEntity: "legal" | "osvc";
  dic: string;
  vatPayer: boolean;
  vatPeriod: "monthly" | "quarterly";
  euSupplies: boolean;
  hasEmployees: boolean;
  hasWithholding: boolean;
  incomeTaxFiling: "standard" | "electronic" | "advisor";
  incomeTaxAdvances: "none" | "half" | "quarter";
  flatTax: boolean;
  roadTaxVehicles: boolean;
  ownsRealEstate: boolean;
  propertyTaxSplit: boolean;
};

const sel = "w-full text-sm border border-border rounded-md px-2 py-1.5 bg-background";

/** Daňový profil firmy — z něj se generují termíny. Uložení hned přegeneruje kalendář. */
export default function TaxSettingsForm({ clientId, value }: { clientId: string; value: TaxSettingsValue }) {
  const router = useRouter();
  const [v, setV] = useState(value);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof TaxSettingsValue>(k: K, val: TaxSettingsValue[K]) => setV({ ...v, [k]: val });
  const check = (k: keyof TaxSettingsValue, label: string, hint?: string) => (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-0.5 w-4 h-4 accent-primary" checked={!!v[k]} onChange={(e) => set(k, e.target.checked as never)} />
      <span>{label}{hint && <span className="block text-xs text-muted-foreground">{hint}</span>}</span>
    </label>
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/tax-settings`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Chyba ${res.status}`);
      toast.success(`Uloženo · nových termínů ${data.created}${data.removed ? ` · odebráno ${data.removed}` : ""}${data.matched ? ` · zaplaceno podle výpisu ${data.matched}` : ""}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    } finally {
      setBusy(false);
    }
  }

  const osvc = v.taxEntity === "osvc";
  return (
    <form onSubmit={save} className="space-y-3">
      {check("taxCalendar", "Hlídat daňové termíny této firmy")}
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs text-muted-foreground space-y-1">
          <span className="block">Typ subjektu</span>
          <select className={sel} value={v.taxEntity} onChange={(e) => set("taxEntity", e.target.value as TaxSettingsValue["taxEntity"])}>
            <option value="legal">Právnická osoba (s.r.o., a.s.)</option>
            <option value="osvc">OSVČ</option>
          </select>
        </label>
        <label className="block text-xs text-muted-foreground space-y-1">
          <span className="block">DIČ (VS plateb na FÚ)</span>
          <input className={sel} value={v.dic} onChange={(e) => set("dic", e.target.value)} placeholder="CZ12345678" />
        </label>
      </div>

      <fieldset className="border border-border rounded-lg p-3 space-y-2">
        <legend className="text-xs font-medium px-1">DPH</legend>
        {check("vatPayer", "Plátce DPH")}
        {v.vatPayer && (
          <select className={sel} value={v.vatPeriod} onChange={(e) => set("vatPeriod", e.target.value as TaxSettingsValue["vatPeriod"])}>
            <option value="monthly">Měsíční plátce</option>
            <option value="quarterly">Čtvrtletní plátce</option>
          </select>
        )}
        {check("euSupplies", "Dodává zboží / služby do EU", "Souhrnné hlášení")}
      </fieldset>

      <fieldset className="border border-border rounded-lg p-3 space-y-2">
        <legend className="text-xs font-medium px-1">Daň z příjmů</legend>
        {osvc && check("flatTax", "Paušální daň", "Místo přiznání, přehledů a záloh jedna měsíční platba")}
        {!(osvc && v.flatTax) && (
          <>
            <label className="block text-xs text-muted-foreground space-y-1">
              <span className="block">Podání přiznání</span>
              <select className={sel} value={v.incomeTaxFiling} onChange={(e) => set("incomeTaxFiling", e.target.value as TaxSettingsValue["incomeTaxFiling"])}>
                <option value="standard">Standardně (do 1. 4.)</option>
                <option value="electronic">Elektronicky (do 1. 5.)</option>
                <option value="advisor">Daňový poradce / audit (do 1. 7.)</option>
              </select>
            </label>
            <label className="block text-xs text-muted-foreground space-y-1">
              <span className="block">Zálohy (podle poslední daňové povinnosti)</span>
              <select className={sel} value={v.incomeTaxAdvances} onChange={(e) => set("incomeTaxAdvances", e.target.value as TaxSettingsValue["incomeTaxAdvances"])}>
                <option value="none">Žádné (daň do 30 000 Kč)</option>
                <option value="half">Pololetní (30 000 – 150 000 Kč)</option>
                <option value="quarter">Čtvrtletní (nad 150 000 Kč)</option>
              </select>
            </label>
          </>
        )}
      </fieldset>

      <fieldset className="border border-border rounded-lg p-3 space-y-2">
        <legend className="text-xs font-medium px-1">Ostatní</legend>
        {check("hasEmployees", "Má zaměstnance", "Odvody do 20., JMHZ, vyúčtování")}
        {check("hasWithholding", "Platí srážkovou daň", "DPP, dividendy, platby do zahraničí")}
        {check("roadTaxVehicles", "Vozidla podléhající silniční dani", "N2/N3, přívěsy O3/O4")}
        {check("ownsRealEstate", "Vlastní nemovitosti")}
        {v.ownsRealEstate && check("propertyTaxSplit", "Daň z nemovitostí nad 5 000 Kč ve 2 splátkách")}
      </fieldset>

      <button disabled={busy} className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground disabled:opacity-50">
        {busy && <Loader2 className="w-4 h-4 animate-spin" />} Uložit a přepočítat termíny
      </button>
    </form>
  );
}
