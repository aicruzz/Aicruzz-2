import { PageContainer, PageHeader } from '@/components/layout/PageShell';
import { Badge } from '@/components/ui';
import { VideoChanger } from '@/components/video/changer/VideoChanger';

export const metadata = {
  title: 'Video Changer · AiCruzz',
  description:
    'Swap a person’s face into an uploaded video while preserving identity, expression and lip sync.',
};

export default function VideoChangerPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Video Changer"
        description="Insert a face into an uploaded video — identity, expression and lip sync preserved, with optional narration."
        badge={<Badge tone="brand">Studio</Badge>}
      />
      <VideoChanger />
    </PageContainer>
  );
}
