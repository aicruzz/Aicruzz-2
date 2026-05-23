import { PageContainer, PageHeader } from '@/components/layout/PageShell';
import { Badge } from '@/components/ui';
import { VideoStudio } from '@/components/video/studio/VideoStudio';

export const metadata = {
  title: 'Video Studio · AiCruzz',
  description: 'Professional text-to-video & image-to-video generation.',
};

export default function VideoStudioPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Video Studio"
        description="Runway / Pika auto-routed generation with live pipeline tracking, templates and history."
        badge={<Badge tone="brand">Studio</Badge>}
      />
      <VideoStudio />
    </PageContainer>
  );
}
