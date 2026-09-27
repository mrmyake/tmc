import { AdminPanel } from "./_components/AdminPanel";

export const dynamic = "force-dynamic";

/**
 * Staff-tablet-route. De layout eist een ingelogde admin of trainer; er is
 * geen PIN-scherm en geen cookie meer (fix/checkin-cookie-gate). Het
 * paneel zelf is ongewijzigd: zoeken, inchecken, walk-in, undo.
 */
export default function CheckinPage() {
  return <AdminPanel />;
}
