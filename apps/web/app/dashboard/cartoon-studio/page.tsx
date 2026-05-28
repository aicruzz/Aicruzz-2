import { PageContainer, PageHeader } from '@/components/layout/PageShell';
import { Badge } from '@/components/ui';
import { CartoonStudio } from '@/components/cartoon/studio/CartoonStudio';

export const metadata = {
  title: 'Cartoon Studio · AiCruzz',
  description: 'Cinematic cartoon storytelling, talking characters and reusable assets.',
};

export default function CartoonStudioPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Cartoon Studio"
        description="Animated ads, human cartoons, custom characters & classic animation — with talking-character narration."
        badge={<Badge tone="brand">Flagship</Badge>}
      />
      <CartoonStudio />
    </PageContainer>
  );
}
