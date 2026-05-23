import { PageContainer, PageHeader } from '@/components/layout/PageShell';
import { Badge } from '@/components/ui';
import { LibraryTabs } from '@/components/library/LibraryTabs';

export const metadata = {
  title: 'Library · AiCruzz',
  description: 'Reusable assets, voices, characters and templates.',
};

export default function LibraryPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Creative Library"
        description="Your reusable asset ecosystem — images, voices, characters and templates, usable across every module."
        badge={<Badge tone="brand">Reusable</Badge>}
      />
      <LibraryTabs />
    </PageContainer>
  );
}
