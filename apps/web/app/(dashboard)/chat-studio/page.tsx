import { PageHeader } from "@/components/layout/PageShell";
import { Badge } from "@/components/ui";
import { ChatStudio } from "@/components/chat/studio/ChatStudio";

export const metadata = {
  title: "AI Chat · AiCruzz",
  description:
    "Streaming multi-model AI chat with image, video, document & code generation.",
};

export default function ChatStudioPage() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="AI Chat"
        description="Multi-model streaming chat — auto-routed, with built-in creation tools."
        // badge={<Badge tone="brand">OpenAI · Anthropic</Badge>}
      />
      <ChatStudio />
    </div>
  );
}
