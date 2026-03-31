import ClientForm from "@/components/ClientForm";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NewClientPage() {
  return (
    <div className="space-y-5 max-w-3xl">
      <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 w-fit">
        <ArrowLeft className="w-3.5 h-3.5" /> Zpět
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-foreground">Nový klient</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Vyplňte informace o novém klientovi nebo entitě</p>
      </div>
      <ClientForm mode="new" />
    </div>
  );
}
