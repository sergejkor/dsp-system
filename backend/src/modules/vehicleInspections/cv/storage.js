import fs from 'node:fs/promises';
import path from 'node:path';
import { createDebugOverlayPng } from './utils.js';

const DEBUG_ROOT = path.resolve(process.cwd(), 'data', 'vehicle-inspection-debug');

export class DebugArtifactStorage {
  async saveCandidateOverlay(inspectionId, shotType, image, candidates) {
    try {
      await fs.mkdir(DEBUG_ROOT, { recursive: true });
      const fileName = `inspection-${inspectionId}-${shotType}-candidates.png`;
      const filePath = path.join(DEBUG_ROOT, fileName);
      const png = await createDebugOverlayPng(
        image,
        (candidates || []).map((candidate) => ({
          x: candidate.bbox.x,
          y: candidate.bbox.y,
          w: candidate.bbox.w,
          h: candidate.bbox.h,
        })),
      );
      await fs.writeFile(filePath, png);
      return filePath;
    } catch (error) {
      console.error('Failed to save inspection debug overlay', error);
      return null;
    }
  }
}

export default new DebugArtifactStorage();
