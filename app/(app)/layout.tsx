import { prisma } from "@/lib/prisma";
import Sidebar from "@/components/Sidebar";
import AiAssistant from "@/components/AiAssistant";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const clients = await prisma.client.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar clients={clients} />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-7xl mx-auto">{children}</div>
      </main>
      <AiAssistant />
    </div>
  );
}
