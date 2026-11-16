import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getMarsOS } from '../api/MarsOS';
import { useUI, type RightTab } from '../state/uiStore';
import { AITab } from './tabs/AITab';
import { EnvironmentTab } from './tabs/EnvironmentTab';
import { HistoryTab } from './tabs/HistoryTab';
import { InspectTab } from './tabs/InspectTab';
import { NodesTab } from './tabs/NodesTab';
import { PhotosTab } from './tabs/PhotosTab';
import { RoutesTab } from './tabs/RoutesTab';
import { ExplorersTab } from './tabs/ExplorersTab';
import { LandingTab } from './tabs/LandingTab';
import { MissionTab } from './tabs/MissionTab';

const TABS: RightTab[] = ['inspect', 'explorers', 'landing', 'mission', 'routes', 'photos', 'environment', 'ai', 'history', 'nodes'];

export function RightPanel() {
  const { t } = useTranslation();
  const tab = useUI((s) => s.rightTab);
  const open = useUI((s) => s.panelsOpen);
  const set = useUI((s) => s.set);
  const os = getMarsOS();
  const [pending, setPending] = useState(os.proposals.list('pending').length);
  useEffect(() => os.on('proposals:changed', () => setPending(os.proposals.list('pending').length)), [os]);

  return (
    <aside className={`panel right ${open.right ? '' : 'collapsed'}`}>
      <button className="collapse" onClick={() => set({ panelsOpen: { ...open, right: !open.right } })} aria-label="toggle">{open.right ? '›' : '‹'}</button>
      {open.right && (
        <>
          <div className="tabs" role="tablist">
            {TABS.map((k) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => set({ rightTab: k })}>
                {t(`tabs.${k}`)}
                {k === 'ai' && pending > 0 && <span className="count">{pending}</span>}
              </button>
            ))}
          </div>
          <div className="panel-scroll">
            {tab === 'inspect' && <InspectTab />}
            {tab === 'routes' && <RoutesTab />}
            {tab === 'nodes' && <NodesTab />}
            {tab === 'ai' && <AITab />}
            {tab === 'history' && <HistoryTab />}
            {tab === 'environment' && <EnvironmentTab />}
            {tab === 'photos' && <PhotosTab />}
            {tab === 'explorers' && <ExplorersTab />}
            {tab === 'landing' && <LandingTab />}
            {tab === 'mission' && <MissionTab />}
          </div>
        </>
      )}
    </aside>
  );
}
