import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export default function Home() {
  return (
    <main className="p-10 space-y-6">
      <h1 className="text-2xl font-semibold">shadcn/ui demo</h1>
      <div className="flex items-center gap-3">
        <Input placeholder="Type here…" className="w-64" />
        <Button>Primary Button</Button>
        <Badge>Badge</Badge>
      </div>
    </main>
  );
}
