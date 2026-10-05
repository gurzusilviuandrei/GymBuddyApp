// Saving and sharing generated files (Bro Cards, data exports). Phones get the
// native share sheet, which also offers "save to device"; browsers download.
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { isNativeApp } from "./platform";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(blob);
  });
}

function isCancel(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (error instanceof DOMException && error.name === "AbortError") || /cancel/i.test(message);
}

async function shareNative(blob: Blob, filename: string, title: string) {
  const { uri } = await Filesystem.writeFile({
    path: filename,
    data: await blobToBase64(blob),
    directory: Directory.Cache,
  });
  try {
    await Share.share({ title, files: [uri] });
  } catch (error) {
    if (!isCancel(error)) throw error;
  }
}

/** Opens the share sheet with the file (Instagram, WhatsApp, …). */
export async function shareFile(blob: Blob, filename: string, title: string) {
  if (isNativeApp) return shareNative(blob, filename, title);
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    try {
      await navigator.share({ files: [file], title });
    } catch (error) {
      if (!isCancel(error)) throw error;
    }
  }
}

/** Keeps a copy of the file: share sheet on phones, a download in browsers. */
export async function saveFile(blob: Blob, filename: string, title: string) {
  if (isNativeApp) return shareNative(blob, filename, title);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
