import type { Parcel } from "@/modules/progression/parcels";
import { projectParcels } from "./HexMosaic";

export type PassportData = {
  pseudonym: string;
  levelTitle: string;
  level: number;
  xp: number;
  placesVisited: number;
  destinationsDiscovered: number;
  destinationsTotal: number;
  parcels: number;
  badges: number;
  mosaics: Array<{ name: string; parcels: Parcel[] }>;
  style: "classique" | "carnet-nuit";
  demo: boolean;
};

/**
 * Récapitulatif visuel exportable. Il ne contient ni domicile, ni position
 * précise, ni voyage futur : seulement des compteurs et des mosaïques normalisées.
 * Généré uniquement à la demande de l'utilisateur.
 */
export async function renderPassportImage(data: PassportData): Promise<Blob> {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible");
  const night = data.style === "carnet-nuit";
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, night ? "#0a1224" : "#f4efe6");
  bg.addColorStop(1, night ? "#17233f" : "#ebe3d5");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const ink = night ? "#edf1f8" : "#182033";
  const muted = night ? "#b4bed0" : "#4a5366";
  const accent = night ? "#ff7b63" : "#c8462f";
  const green = night ? "#5fd3a6" : "#2e7d5b";

  await document.fonts?.ready;
  ctx.fillStyle = accent;
  ctx.font = "800 30px 'Manrope Variable', sans-serif";
  ctx.fillText("PASSEPORT D'EXPLORATION · HORIZON", 80, 120);
  ctx.fillStyle = ink;
  ctx.font = "600 96px 'Fraunces Variable', serif";
  ctx.fillText(data.pseudonym.slice(0, 18), 80, 240);
  ctx.fillStyle = muted;
  ctx.font = "600 40px 'Manrope Variable', sans-serif";
  ctx.fillText(`Niveau ${data.level} · ${data.levelTitle} · ${data.xp} XP`, 80, 310);

  const stats: Array<[string, string]> = [
    [String(data.placesVisited), "lieux visités"],
    [`${data.destinationsDiscovered}/${data.destinationsTotal}`, "destinations"],
    [String(data.parcels), "parcelles"],
    [String(data.badges), "badges"],
  ];
  stats.forEach(([value, label], i) => {
    const x = 80 + i * 235;
    ctx.fillStyle = night ? "#111b33" : "#fffcf7";
    ctx.beginPath();
    ctx.roundRect(x, 370, 210, 170, 28);
    ctx.fill();
    ctx.fillStyle = ink;
    ctx.font = "600 64px 'Fraunces Variable', serif";
    ctx.fillText(value, x + 26, 460);
    ctx.fillStyle = muted;
    ctx.font = "600 26px 'Manrope Variable', sans-serif";
    ctx.fillText(label, x + 26, 505);
  });

  const mosaics = data.mosaics.filter((m) => m.parcels.length > 0).slice(0, 4);
  mosaics.forEach((m, i) => {
    const size = 400;
    const x = 80 + (i % 2) * 480;
    const y = 600 + Math.floor(i / 2) * 330;
    ctx.fillStyle = night ? "#111b33" : "#fffcf7";
    ctx.beginPath();
    ctx.roundRect(x, y, 440, 300, 28);
    ctx.fill();
    for (const shape of projectParcels(m.parcels, size * 0.55)) {
      ctx.beginPath();
      shape.points.split(" ").forEach((pt, j) => {
        const [px, py] = pt.split(",").map(Number);
        const tx = x + 24 + (px ?? 0);
        const ty = y + 24 + (py ?? 0);
        if (j === 0) ctx.moveTo(tx, ty);
        else ctx.lineTo(tx, ty);
      });
      ctx.closePath();
      ctx.fillStyle = shape.state === "simulated" ? muted : green;
      ctx.fill();
    }
    ctx.fillStyle = ink;
    ctx.font = "600 36px 'Fraunces Variable', serif";
    ctx.fillText(m.name, x + 270, y + 80);
    ctx.fillStyle = muted;
    ctx.font = "600 24px 'Manrope Variable', sans-serif";
    ctx.fillText(`${m.parcels.length} parcelle(s)`, x + 270, y + 120);
  });
  if (mosaics.length === 0) {
    ctx.fillStyle = muted;
    ctx.font = "600 34px 'Manrope Variable', sans-serif";
    ctx.fillText("Aucune parcelle révélée pour l'instant.", 80, 700);
  }

  ctx.fillStyle = muted;
  ctx.font = "600 24px 'Manrope Variable', sans-serif";
  ctx.fillText("Découvre des lieux. Vis des expériences. Révèle ton monde.", 80, H - 90);
  if (data.demo) {
    ctx.fillStyle = accent;
    ctx.font = "800 26px 'Manrope Variable', sans-serif";
    ctx.fillText("DONNÉES DE DÉMONSTRATION", 80, H - 50);
  }
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Export impossible"))), "image/png"));
}
