'use client';

import { useState } from 'react';
import { ImageIcon, Mic, UserRound, Layers } from 'lucide-react';
import { Tabs, TabPanel, ErrorBoundary, type TabItem } from '@/components/ui';
import { Reveal } from '@/components/ui/motion';
import { AssetLibrary } from './AssetLibrary';
import { VoiceLibrary } from './VoiceLibrary';
import { CharacterLibrary } from './CharacterLibrary';
import { TemplateLibrary } from './TemplateLibrary';

type Tab = 'assets' | 'voices' | 'characters' | 'templates';

const TABS: TabItem[] = [
  { key: 'assets', label: 'Assets', icon: <ImageIcon className="h-4 w-4" /> },
  { key: 'voices', label: 'Voices', icon: <Mic className="h-4 w-4" /> },
  { key: 'characters', label: 'Characters', icon: <UserRound className="h-4 w-4" /> },
  { key: 'templates', label: 'Templates', icon: <Layers className="h-4 w-4" /> },
];

export function LibraryTabs() {
  const [tab, setTab] = useState<Tab>('assets');

  return (
    <div className="space-y-6">
      <Tabs items={TABS} value={tab} onChange={(k) => setTab(k as Tab)} />
      <Reveal key={tab}>
        <ErrorBoundary>
          <TabPanel tabKey="assets" active={tab === 'assets'}>
            <AssetLibrary />
          </TabPanel>
          <TabPanel tabKey="voices" active={tab === 'voices'}>
            <VoiceLibrary />
          </TabPanel>
          <TabPanel tabKey="characters" active={tab === 'characters'}>
            <CharacterLibrary />
          </TabPanel>
          <TabPanel tabKey="templates" active={tab === 'templates'}>
            <TemplateLibrary />
          </TabPanel>
        </ErrorBoundary>
      </Reveal>
    </div>
  );
}
