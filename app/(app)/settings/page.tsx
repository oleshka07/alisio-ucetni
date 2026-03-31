export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Nastavení</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Konfigurace systému</p>
      </div>
      <div className="bg-card border border-border rounded-xl p-8 text-center">
        <p className="text-muted-foreground text-sm">Nastavení se připravuje</p>
      </div>
    </div>
  );
}
