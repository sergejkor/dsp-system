import sharp from 'sharp';

export function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

export function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

export function toGray(image) {
  if (!image?.data || !image.width || !image.height) {
    throw new Error('Invalid image payload');
  }
  if (image.channels === 1) return image.data;
  const gray = new Float32Array(image.width * image.height);
  const channels = image.channels;
  for (let i = 0, p = 0; i < gray.length; i += 1, p += channels) {
    const r = image.data[p] ?? 0;
    const g = image.data[p + 1] ?? r;
    const b = image.data[p + 2] ?? g;
    gray[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }
  return gray;
}

export async function loadImageData(buffer, options = {}) {
  const { width, height, fit = 'contain', background = { r: 0, g: 0, b: 0, alpha: 1 } } = options;
  let pipeline = sharp(buffer, { failOn: 'none' }).rotate();
  if (width || height) {
    pipeline = pipeline.resize(width || null, height || null, {
      fit,
      background,
      withoutEnlargement: false,
    });
  }
  const { data, info } = await pipeline
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    data: new Uint8ClampedArray(data),
    width: info.width,
    height: info.height,
    channels: info.channels,
  };
}

export function getPixel(gray, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return 0;
  return gray[y * width + x] || 0;
}

export function variance(values) {
  if (!values?.length) return 0;
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    sum += value;
    sumSq += value * value;
  }
  const mean = sum / values.length;
  return Math.max(0, sumSq / values.length - mean * mean);
}

export function mean(values) {
  if (!values?.length) return 0;
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) sum += values[i];
  return sum / values.length;
}

export function stdDev(values) {
  return Math.sqrt(variance(values));
}

export function computeLaplacianVariance(gray, width, height) {
  const values = new Float32Array(Math.max(0, (width - 2) * (height - 2)));
  let index = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const center = getPixel(gray, width, height, x, y) * 4;
      const lap =
        center
        - getPixel(gray, width, height, x - 1, y)
        - getPixel(gray, width, height, x + 1, y)
        - getPixel(gray, width, height, x, y - 1)
        - getPixel(gray, width, height, x, y + 1);
      values[index] = lap;
      index += 1;
    }
  }
  return variance(values);
}

export function computeSobel(gray, width, height) {
  const magnitude = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const gx =
        -getPixel(gray, width, height, x - 1, y - 1)
        + getPixel(gray, width, height, x + 1, y - 1)
        - 2 * getPixel(gray, width, height, x - 1, y)
        + 2 * getPixel(gray, width, height, x + 1, y)
        - getPixel(gray, width, height, x - 1, y + 1)
        + getPixel(gray, width, height, x + 1, y + 1);
      const gy =
        -getPixel(gray, width, height, x - 1, y - 1)
        - 2 * getPixel(gray, width, height, x, y - 1)
        - getPixel(gray, width, height, x + 1, y - 1)
        + getPixel(gray, width, height, x - 1, y + 1)
        + 2 * getPixel(gray, width, height, x, y + 1)
        + getPixel(gray, width, height, x + 1, y + 1);
      magnitude[y * width + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return magnitude;
}

export function normalizeFloatMap(values) {
  if (!values?.length) return new Float32Array();
  let max = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] > max) max = values[i];
  }
  if (!max) return new Float32Array(values.length);
  const out = new Float32Array(values.length);
  for (let i = 0; i < values.length; i += 1) {
    out[i] = values[i] / max;
  }
  return out;
}

export function cropGray(gray, width, height, bbox) {
  const x = Math.max(0, Math.min(width - 1, Math.round(bbox.x)));
  const y = Math.max(0, Math.min(height - 1, Math.round(bbox.y)));
  const w = Math.max(1, Math.min(width - x, Math.round(bbox.w)));
  const h = Math.max(1, Math.min(height - y, Math.round(bbox.h)));
  const out = new Float32Array(w * h);
  for (let row = 0; row < h; row += 1) {
    const srcOffset = (y + row) * width + x;
    const dstOffset = row * w;
    for (let col = 0; col < w; col += 1) {
      out[dstOffset + col] = gray[srcOffset + col];
    }
  }
  return { data: out, width: w, height: h };
}

export function computeSsim(a, b) {
  const len = Math.min(a.length, b.length);
  if (!len) return 0;
  let meanA = 0;
  let meanB = 0;
  for (let i = 0; i < len; i += 1) {
    meanA += a[i];
    meanB += b[i];
  }
  meanA /= len;
  meanB /= len;
  let varianceA = 0;
  let varianceB = 0;
  let covariance = 0;
  for (let i = 0; i < len; i += 1) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    varianceA += da * da;
    varianceB += db * db;
    covariance += da * db;
  }
  varianceA /= len;
  varianceB /= len;
  covariance /= len;
  const c1 = 0.01 ** 2;
  const c2 = 0.03 ** 2;
  const numerator = (2 * meanA * meanB + c1) * (2 * covariance + c2);
  const denominator = (meanA * meanA + meanB * meanB + c1) * (varianceA + varianceB + c2);
  return denominator ? clamp(numerator / denominator, -1, 1) : 0;
}

export function bboxToNormalized(bbox, width, height) {
  return {
    x: round(bbox.x / width, 6),
    y: round(bbox.y / height, 6),
    w: round(bbox.w / width, 6),
    h: round(bbox.h / height, 6),
  };
}

export function computeIoU(a, b) {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  const intersectionW = Math.max(0, right - left);
  const intersectionH = Math.max(0, bottom - top);
  const intersection = intersectionW * intersectionH;
  if (!intersection) return 0;
  const union = a.w * a.h + b.w * b.h - intersection;
  return union ? intersection / union : 0;
}

export function centerDistance(a, b) {
  const ax = a.x + a.w / 2;
  const ay = a.y + a.h / 2;
  const bx = b.x + b.w / 2;
  const by = b.y + b.h / 2;
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

export function expandBbox(bbox, margin, width, height) {
  const x = Math.max(0, bbox.x - margin);
  const y = Math.max(0, bbox.y - margin);
  const right = Math.min(width, bbox.x + bbox.w + margin);
  const bottom = Math.min(height, bbox.y + bbox.h + margin);
  return { x, y, w: right - x, h: bottom - y };
}

export function connectedComponents(mask, width, height) {
  const visited = new Uint8Array(mask.length);
  const components = [];
  const queueX = [];
  const queueY = [];
  const neighbors = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0],           [1, 0],
    [-1, 1],  [0, 1],  [1, 1],
  ];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const startIndex = y * width + x;
      if (!mask[startIndex] || visited[startIndex]) continue;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let area = 0;
      queueX.length = 0;
      queueY.length = 0;
      queueX.push(x);
      queueY.push(y);
      visited[startIndex] = 1;

      for (let head = 0; head < queueX.length; head += 1) {
        const currentX = queueX[head];
        const currentY = queueY[head];
        area += 1;
        if (currentX < minX) minX = currentX;
        if (currentX > maxX) maxX = currentX;
        if (currentY < minY) minY = currentY;
        if (currentY > maxY) maxY = currentY;
        for (const [dx, dy] of neighbors) {
          const nx = currentX + dx;
          const ny = currentY + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const nextIndex = ny * width + nx;
          if (!mask[nextIndex] || visited[nextIndex]) continue;
          visited[nextIndex] = 1;
          queueX.push(nx);
          queueY.push(ny);
        }
      }

      components.push({
        x: minX,
        y: minY,
        w: maxX - minX + 1,
        h: maxY - minY + 1,
        area,
      });
    }
  }

  return components;
}

export function mergeBoxes(boxes, distance) {
  const merged = [];
  const pending = [...boxes];
  while (pending.length) {
    const current = pending.shift();
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = pending.length - 1; i >= 0; i -= 1) {
        const candidate = pending[i];
        const overlap =
          candidate.x <= current.x + current.w + distance
          && candidate.x + candidate.w >= current.x - distance
          && candidate.y <= current.y + current.h + distance
          && candidate.y + candidate.h >= current.y - distance;
        if (!overlap) continue;
        const next = {
          x: Math.min(current.x, candidate.x),
          y: Math.min(current.y, candidate.y),
          w: Math.max(current.x + current.w, candidate.x + candidate.w) - Math.min(current.x, candidate.x),
          h: Math.max(current.y + current.h, candidate.y + candidate.h) - Math.min(current.y, candidate.y),
          area: (current.area || current.w * current.h) + (candidate.area || candidate.w * candidate.h),
        };
        current.x = next.x;
        current.y = next.y;
        current.w = next.w;
        current.h = next.h;
        current.area = next.area;
        pending.splice(i, 1);
        changed = true;
      }
    }
    merged.push(current);
  }
  return merged;
}

export async function createDebugOverlayPng(baseImage, boxes = [], options = {}) {
  const svg = [
    `<svg width="${baseImage.width}" height="${baseImage.height}" xmlns="http://www.w3.org/2000/svg">`,
    `<rect x="0" y="0" width="${baseImage.width}" height="${baseImage.height}" fill="transparent"/>`,
    ...boxes.map((box) => (
      `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="none" stroke="${box.stroke || '#ff5a36'}" stroke-width="${box.strokeWidth || 4}"/>`
    )),
    ...(options.labels || []).map((label) => (
      `<text x="${label.x}" y="${label.y}" font-size="18" fill="${label.fill || '#ffffff'}">${label.text}</text>`
    )),
    '</svg>',
  ].join('');

  return sharp(Buffer.from(baseImage.data), {
    raw: {
      width: baseImage.width,
      height: baseImage.height,
      channels: baseImage.channels,
    },
  })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}
