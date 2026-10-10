import { isOpen } from '../platform/engine';
import { useStore } from '../store';
import { Card, CaseTable, Stat, useNow } from '../ui';

/** SGBV and intelligence reports. Never shown to patrol units, chairmen, administrators or the public. */
export function Restricted() {
  const at = useNow(10_000);
  const incidents = useStore((s) => s.incidents);
  const rows = incidents.filter((i) => i.sensitiveOnly);
  const open = rows.filter(isOpen);
  const unseals = useStore((s) => s.audit).filter((e) => e.action === 'IDENTITY UNSEALED');
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Restricted cases desk</h1>
          <p>Domestic and sexual violence, and confidential information. Survivor-centred, need-to-know, every view logged.</p>
        </div>
      </div>
      <div className="stats">
        <Stat k="Open" v={open.length} />
        <Stat k="Waiting to be taken" v={open.filter((i) => i.status === 'triage').length} alert={open.some((i) => i.status === 'triage')} />
        <Stat k="SGBV (7 days)" v={rows.filter((i) => i.subcategory === 'gbv').length} />
        <Stat k="Intelligence tips (7 days)" v={rows.filter((i) => i.subcategory === 'tip').length} />
        <Stat k="Identity unseals (all time)" v={unseals.length} s="each reviewed by the coordinator" />
      </div>
      <Card title="Open" pad={false}>
        <CaseTable rows={open} at={at} empty="No open restricted cases" />
      </Card>
      <Card title="Closed" pad={false}>
        <CaseTable rows={rows.filter((i) => !isOpen(i)).slice(0, 40)} at={at} />
      </Card>
    </>
  );
}
