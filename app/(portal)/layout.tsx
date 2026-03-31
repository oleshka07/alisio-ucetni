import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import PortalSidebar from "@/components/PortalSidebar";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session || session.role !== "client" || !session.clientId) {
    redirect("/login");
  }

  const client = await prisma.client.findUnique({
    where: { id: session.clientId },
    select: { name: true, isActive: true },
  });

  if (!client || !client.isActive) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <PortalSidebar clientName={client.name} />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-5xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
