// Nightjar PWA icons derive from the *approved* in-app Nightjar logo, never a generic W.
// Browser canvas is used because images may be PNG, JPG or WebP; backend only stores
// validated PNG dimensions and does not expose original image bytes to other users.
import { nightjarMedia } from './firebase-media';

const drawApprovedLogo = async (logo: HTMLImageElement, size: number, maskable: boolean) => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot prepare Nightjar app icons.');
  context.fillStyle = '#0c0b0d';
  context.fillRect(0, 0, size, size);
  // Maskable safe zone: the central 80% of the square must contain all content.
  // 73% also leaves breathing room for the phone's rounded icon crop.
  const usable = size * (maskable ? .73 : .88);
  const scale = Math.min(usable / logo.naturalWidth, usable / logo.naturalHeight);
  const width = Math.max(1, Math.round(logo.naturalWidth * scale));
  const height = Math.max(1, Math.round(logo.naturalHeight * scale));
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(logo, (size - width) / 2, (size - height) / 2, width, height);
  return canvas.toDataURL('image/png');
};

export async function syncApprovedNightjarIcons() {
  // Same-origin approved-logo endpoint prevents copying arbitrary unmoderated assets
  // into the installed app icon.
  const logo = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        reject(new Error('Approved Nightjar logo has no usable dimensions.'));
      } else resolve(image);
    };
    image.onerror = () => reject(new Error('Could not load the approved Nightjar logo. Approve it in Image Moderation first.'));
    image.src = '/brand-logo?nightjar-install=' + Date.now();
  });
  const [icon192DataUrl, icon512DataUrl, maskable512DataUrl] = await Promise.all([
    drawApprovedLogo(logo, 192, false),
    drawApprovedLogo(logo, 512, false),
    drawApprovedLogo(logo, 512, true),
  ]);
  return nightjarMedia.syncBrandIcons({ icon192DataUrl, icon512DataUrl, maskable512DataUrl });
}
