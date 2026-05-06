import { AuthGate } from "@/components/AuthGate";
import { ChatInterface } from "@/components/ChatInterface";

export default function Home() {
  return (
    <main className="h-screen flex">
      <AuthGate>
        <ChatInterface />
      </AuthGate>
    </main>
  );
}
