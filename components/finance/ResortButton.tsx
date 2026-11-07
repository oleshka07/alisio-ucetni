"use client";

import { toast } from "sonner";
import { Wand2 } from "lucide-react";
import ActionButton from "@/components/finance/ActionButton";

type Report = { checked: number; statements: number; transactions: number; recognized: number; companyDocs: number; linked: number; notes: string[] };

/** „Rozřadit znovu“ — výpisy do výpisů, AI znovu přečte nerozpoznané, přiřadí k platbám a firmám. */
export default function ResortButton() {
  return (
    <ActionButton
      url="/api/documents/resort"
      className="text-sm px-3 py-1.5"
      title="Výpisy přesune do výpisů, nerozpoznané doklady nechá znovu přečíst AI, přiřadí k firmám a platbám. Běží i samo každé ráno."
      onDone={(d) => {
        const r = d as Report;
        const parts = [
          r.statements && `výpisů: ${r.statements} (plateb ${r.transactions})`,
          r.recognized && `znovu rozpoznáno: ${r.recognized}`,
          r.companyDocs && `do dokumentů firmy: ${r.companyDocs}`,
          r.linked && `přiřazeno k platbě: ${r.linked}`,
        ].filter(Boolean);
        toast.success(parts.length ? `Rozřazeno — ${parts.join(" · ")}` : `Zkontrolováno ${r.checked} dokladů, nic nového`);
        for (const n of r.notes.slice(0, 5)) toast.error(n, { duration: 10000 });
      }}
    >
      <Wand2 className="w-4 h-4" /> Rozřadit znovu
    </ActionButton>
  );
}
