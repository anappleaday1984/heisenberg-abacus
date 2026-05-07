import { ChatInterface } from "@/components/ChatInterface";
import { EntranceGate } from "@/components/EntranceGate";

export default function Home() {
  return (
    <EntranceGate>
      <main className="h-screen flex">
        <ChatInterface />
      </main>
    </EntranceGate>
  );
}
