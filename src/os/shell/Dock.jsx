// stub — replaced by the dock agent
import { dockApps } from "../apps";
import { wm } from "../windowStore";
export default function Dock() {
  return (
    <div data-dock-root style={{ position: "absolute", bottom: 6, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 6, padding: 6, background: "var(--glass)", borderRadius: 18, zIndex: 40 }}>
      {dockApps().map((a) => (
        <img key={a.id} data-dock-app={a.id} src={a.icon} alt={a.name} title={a.name} width={48} height={48} onClick={() => wm.toggleApp(a.id)} />
      ))}
    </div>
  );
}
