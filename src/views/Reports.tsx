import { useState } from 'react';
import { Tabs } from '../ui';
import { Brief, Performance, SecurityPicture } from './Dashboards';
import { ConductReport, SafetyReport } from './Safety';

type T = 'security' | 'performance' | 'brief' | 'conduct' | 'safety';

/** One "Reports" page with tabs, reusing the existing report views. */
export function Reports() {
  const [tab, setTab] = useState<T>('security');
  return (
    <section className="card reports">
      <div className="wl-head">
        <h2>Reports</h2>
      </div>
      <Tabs<T>
        tabs={[
          { id: 'security', label: 'Security picture' },
          { id: 'performance', label: 'Unit performance' },
          { id: 'brief', label: 'Morning brief' },
          { id: 'conduct', label: 'Conduct' },
          { id: 'safety', label: 'Officer safety' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="reports-body">{tab === 'security' ? <SecurityPicture /> : tab === 'performance' ? <Performance /> : tab === 'conduct' ? <ConductReport /> : tab === 'safety' ? <SafetyReport /> : <Brief />}</div>
    </section>
  );
}
