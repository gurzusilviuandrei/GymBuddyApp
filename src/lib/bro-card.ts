import logoUrl from "@/assets/gymbuddy-logo.png";
import { saveFile } from "./native-files";

export type BroCardStats = {
  date: string;
  durationMinutes: number;
  volumeKg: number;
  weeklyWorkouts: number;
};

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load the GymBuddy logo"));
    image.src = src;
  });
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
  context.stroke();
}

export async function createBroCardBlob(stats: BroCardStats): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image creation is not supported on this device");

  const charcoal = "#121212";
  const surface = "#1d1d1d";
  const neon = "#39ff14";
  const white = "#ffffff";
  const muted = "#a3a3a3";

  context.fillStyle = charcoal;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#2f2f2f";
  context.lineWidth = 2;
  for (let y = 0; y < canvas.height; y += 80) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(canvas.width, y);
    context.stroke();
  }

  const logo = await loadImage(logoUrl);
  context.drawImage(logo, 210, 145, 365, 385, 390, 125, 300, 316);

  context.textAlign = "center";
  context.fillStyle = neon;
  context.font = "600 34px 'Space Grotesk', sans-serif";
  context.fillText("WORKOUT COMPLETE", 540, 525);
  context.fillStyle = white;
  context.font = "700 100px 'Space Grotesk', sans-serif";
  context.fillText("BRO CARD", 540, 650);
  context.fillStyle = muted;
  context.font = "500 34px 'Space Grotesk', sans-serif";
  context.fillText(stats.date, 540, 715);

  const cards = [
    ["ACTIVE TIME", `${stats.durationMinutes} MIN`],
    ["KG SHIFTED", Math.round(stats.volumeKg).toLocaleString("en-US")],
    ["THIS WEEK", `${stats.weeklyWorkouts} WORKOUT${stats.weeklyWorkouts === 1 ? "" : "S"}`],
  ] as const;

  cards.forEach(([label, value], index) => {
    const y = 805 + index * 260;
    context.fillStyle = surface;
    context.strokeStyle = index === 1 ? neon : "#363636";
    context.lineWidth = index === 1 ? 5 : 2;
    roundedRect(context, 120, y, 840, 205, 28);
    context.fillStyle = muted;
    context.font = "600 28px 'Space Grotesk', sans-serif";
    context.fillText(label, 540, y + 65);
    context.fillStyle = index === 1 ? neon : white;
    context.font = "700 68px 'Space Grotesk', sans-serif";
    context.fillText(value, 540, y + 145);
  });

  context.fillStyle = white;
  context.font = "700 44px 'Space Grotesk', sans-serif";
  context.fillText("GymBuddy", 540, 1690);
  context.fillStyle = neon;
  context.font = "500 30px 'Space Grotesk', sans-serif";
  context.fillText("ONE SET AT A TIME.", 540, 1750);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not create your Bro Card"))), "image/png", 1);
  });
}

export function downloadBroCard(blob: Blob) {
  return saveFile(blob, `gymbuddy-bro-card-${new Date().toISOString().slice(0, 10)}.png`, "My GymBuddy Bro Card");
}