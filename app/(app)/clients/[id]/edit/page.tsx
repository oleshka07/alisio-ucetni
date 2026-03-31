import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import ClientForm from "@/components/ClientForm";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      companyProfile: true,
      employeeProfile: true,
      taxProfile: true,
      insuranceProfile: true,
    },
  });

  if (!client) notFound();

  // Strip prisma metadata fields, keep only data fields
  const strip = (obj: Record<string, unknown> | null) => {
    if (!obj) return {};
    const { id: _id, clientId: _cid, ...rest } = obj as Record<string, unknown>;
    return rest as Record<string, string | boolean>;
  };

  const initialData = {
    basic: { name: client.name, type: client.type, role: client.role, color: client.color },
    company: strip(client.companyProfile as Record<string, unknown> | null),
    employee: strip(client.employeeProfile as Record<string, unknown> | null),
    tax: strip(client.taxProfile as Record<string, unknown> | null),
    insurance: strip(client.insuranceProfile as Record<string, unknown> | null),
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <Link href={`/clients/${id}`} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 w-fit">
        <ArrowLeft className="w-3.5 h-3.5" /> Zpět na profil
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-foreground">Upravit: {client.name}</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Změny se uloží po kliknutí na tlačítko</p>
      </div>
      <ClientForm mode="edit" clientId={id} initialData={initialData} />
    </div>
  );
}
