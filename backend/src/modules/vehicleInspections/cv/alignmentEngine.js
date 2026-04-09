import sharp from 'sharp';
import { getCvConfig } from './cvConfig.js';
import { clamp, mean, toGray } from './utils.js';

async function transformImage(image, transform, targetWidth, targetHeight) {
  const out = new Uint8ClampedArray(targetWidth * targetHeight * image.channels);
  const scale = transform.scale || 1;
  const dx = transform.dx || 0;
  const dy = transform.dy || 0;

  for (let y = 0; y < targetHeight; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.round((x - dx) / scale);
      const sourceY = Math.round((y - dy) / scale);
      if (sourceX < 0 || sourceY < 0 || sourceX >= image.width || sourceY >= image.height) {
        continue;
      }
      const srcOffset = (sourceY * image.width + sourceX) * image.channels;
      const dstOffset = (y * targetWidth + x) * image.channels;
      for (let c = 0; c < image.channels; c += 1) {
        out[dstOffset + c] = image.data[srcOffset + c];
      }
    }
  }

  return {
    data: out,
    width: targetWidth,
    height: targetHeight,
    channels: image.channels,
  };
}

function scoreAlignment(referenceGray, currentGray, width, height, dx, dy) {
  const samples = [];
  const startX = Math.max(0, dx);
  const startY = Math.max(0, dy);
  const endX = Math.min(width, width + dx);
  const endY = Math.min(height, height + dy);
  for (let y = startY; y < endY; y += 4) {
    const currentY = y - dy;
    for (let x = startX; x < endX; x += 4) {
      const currentX = x - dx;
      const ref = referenceGray[y * width + x];
      const cur = currentGray[currentY * width + currentX];
      samples.push(1 - Math.abs(ref - cur));
    }
  }
  return mean(samples);
}

export class AlignmentEngine {
  async align(referenceImage, currentImage, vehicleType, shotType) {
    const config = getCvConfig(vehicleType);
    const referenceGray = toGray(referenceImage);
    const currentGray = toGray(currentImage);
    const width = referenceImage.width;
    const height = referenceImage.height;
    const maxOffsetX = Math.max(6, Math.round(width * config.alignmentSearchRatio));
    const maxOffsetY = Math.max(6, Math.round(height * config.alignmentSearchRatio));
    const stepX = Math.max(2, Math.round(maxOffsetX / config.alignmentStepDivisor));
    const stepY = Math.max(2, Math.round(maxOffsetY / config.alignmentStepDivisor));

    let best = {
      score: -Infinity,
      dx: 0,
      dy: 0,
      scale: 1,
      methodUsed: 'resize_fallback',
    };

    for (const scale of config.alignmentScaleCandidates) {
      const scaledWidth = Math.max(1, Math.round(currentImage.width * scale));
      const scaledHeight = Math.max(1, Math.round(currentImage.height * scale));
      const scaledGrayImage = await sharp(Buffer.from(currentImage.data), {
        raw: {
          width: currentImage.width,
          height: currentImage.height,
          channels: currentImage.channels,
        },
      })
        .resize(scaledWidth, scaledHeight, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const scaledGray = new Float32Array(scaledGrayImage.info.width * scaledGrayImage.info.height);
      for (let i = 0; i < scaledGray.length; i += 1) {
        scaledGray[i] = (scaledGrayImage.data[i] || 0) / 255;
      }
      const normalizedGray = new Float32Array(width * height);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const sx = clamp((x / width) * scaledGrayImage.info.width, 0, scaledGrayImage.info.width - 1);
          const sy = clamp((y / height) * scaledGrayImage.info.height, 0, scaledGrayImage.info.height - 1);
          normalizedGray[y * width + x] = scaledGray[Math.floor(sy) * scaledGrayImage.info.width + Math.floor(sx)];
        }
      }
      for (let dy = -maxOffsetY; dy <= maxOffsetY; dy += stepY) {
        for (let dx = -maxOffsetX; dx <= maxOffsetX; dx += stepX) {
          const score = scoreAlignment(referenceGray, normalizedGray, width, height, dx, dy);
          if (score > best.score) {
            best = {
              score,
              dx,
              dy,
              scale,
              methodUsed: 'grid_scale_translation',
            };
          }
        }
      }
    }

    const alignedCurrentImage = await transformImage(currentImage, best, width, height);
    const alignedCurrentGray = toGray(alignedCurrentImage);
    const alignmentScore = clamp(best.score, 0, 1);

    return {
      success: alignmentScore >= config.alignmentMinScore,
      alignedCurrentImage,
      alignedCurrentGray,
      transformMatrix: [
        [best.scale, 0, best.dx],
        [0, best.scale, best.dy],
      ],
      numKeypointsRef: 0,
      numKeypointsCur: 0,
      numGoodMatches: Math.max(0, Math.round(alignmentScore * 100)),
      alignmentScore,
      methodUsed: best.methodUsed,
      debugVisualizationPath: null,
      shotType,
    };
  }
}

export default new AlignmentEngine();
