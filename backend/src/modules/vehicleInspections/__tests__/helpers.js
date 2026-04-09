import sharp from 'sharp';

function fillRect(data, width, height, rect, color) {
  const x1 = Math.max(0, Math.round(rect.x));
  const y1 = Math.max(0, Math.round(rect.y));
  const x2 = Math.min(width, Math.round(rect.x + rect.w));
  const y2 = Math.min(height, Math.round(rect.y + rect.h));
  for (let y = y1; y < y2; y += 1) {
    for (let x = x1; x < x2; x += 1) {
      const offset = (y * width + x) * 3;
      data[offset] = color[0];
      data[offset + 1] = color[1];
      data[offset + 2] = color[2];
    }
  }
}

export async function createSyntheticVehicleBuffer(options = {}) {
  const width = options.width || 960;
  const height = options.height || 640;
  const data = new Uint8ClampedArray(width * height * 3);

  fillRect(data, width, height, { x: 0, y: 0, w: width, h: height }, [24, 32, 38]);
  fillRect(data, width, height, { x: 0, y: height * 0.74, w: width, h: height * 0.26 }, [50, 54, 58]);

  const shiftX = options.shiftX || 0;
  const shiftY = options.shiftY || 0;
  const vehicle = {
    x: Math.round(width * 0.1 + shiftX),
    y: Math.round(height * 0.2 + shiftY),
    w: Math.round(width * 0.74),
    h: Math.round(height * 0.54),
  };

  fillRect(data, width, height, vehicle, [202, 206, 210]);
  fillRect(data, width, height, {
    x: vehicle.x + vehicle.w * 0.12,
    y: vehicle.y + vehicle.h * 0.12,
    w: vehicle.w * 0.56,
    h: vehicle.h * 0.16,
  }, [98, 118, 130]);
  fillRect(data, width, height, {
    x: vehicle.x + vehicle.w * 0.04,
    y: vehicle.y + vehicle.h * 0.5,
    w: vehicle.w * 0.16,
    h: vehicle.h * 0.1,
  }, [120, 120, 124]);
  fillRect(data, width, height, {
    x: vehicle.x + vehicle.w * 0.78,
    y: vehicle.y + vehicle.h * 0.5,
    w: vehicle.w * 0.16,
    h: vehicle.h * 0.1,
  }, [120, 120, 124]);
  fillRect(data, width, height, {
    x: vehicle.x + vehicle.w * 0.16,
    y: vehicle.y + vehicle.h * 0.72,
    w: vehicle.w * 0.56,
    h: vehicle.h * 0.06,
  }, [80, 84, 88]);

  if (options.addScratch) {
    fillRect(data, width, height, {
      x: vehicle.x + vehicle.w * 0.3,
      y: vehicle.y + vehicle.h * 0.42,
      w: vehicle.w * 0.14,
      h: vehicle.h * 0.03,
    }, [28, 28, 28]);
    fillRect(data, width, height, {
      x: vehicle.x + vehicle.w * 0.45,
      y: vehicle.y + vehicle.h * 0.44,
      w: vehicle.w * 0.05,
      h: vehicle.h * 0.02,
    }, [220, 220, 220]);
  }

  let pipeline = sharp(Buffer.from(data), {
    raw: {
      width,
      height,
      channels: 3,
    },
  });

  if (options.blurSigma) pipeline = pipeline.blur(options.blurSigma);
  if (options.brightness) pipeline = pipeline.modulate({ brightness: options.brightness });
  return pipeline.jpeg().toBuffer();
}
