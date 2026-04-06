import { useEffect, useRef } from 'react';

import { networkMap } from './networkMap';
import { networkTheme } from './networkTheme';

const EDGE_KEY_SEPARATOR = '::';
const MAX_DPR = 2;
const LOOP_IDLE_OPACITY = 0.015;
const AMBIENT_TRAIL_POINTS = 8;
const ROUTE_TRAIL_POINTS = 10;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function gaussian(value, mean, spread) {
  const normalized = (value - mean) / spread;
  return Math.exp(-(normalized * normalized));
}

function createEdgeId(a, b) {
  return a < b ? `${a}${EDGE_KEY_SEPARATOR}${b}` : `${b}${EDGE_KEY_SEPARATOR}${a}`;
}

function lowerMiddleWeight(x, y) {
  const primary = gaussian(x, 0.58, 0.22) * gaussian(y, 0.74, 0.14);
  const secondary = gaussian(x, 0.36, 0.2) * gaussian(y, 0.7, 0.12);
  return 0.38 + primary * 1.25 + secondary * 0.65;
}

function createEnergyBuffers(length) {
  return {
    ambient: new Float32Array(length),
    active: new Float32Array(length),
    sync: new Float32Array(length),
  };
}

function buildGraph() {
  const nodeIndexById = new Map();
  const nodes = networkMap.nodes.map((node, index) => {
    nodeIndexById.set(node.id, index);
    return { ...node, index };
  });

  const edgeIndexById = new Map();
  const edges = networkMap.edges.map(([fromId, toId], index) => {
    const a = nodeIndexById.get(fromId);
    const b = nodeIndexById.get(toId);
    const midpointX = (nodes[a].x + nodes[b].x) * 0.5;
    const midpointY = (nodes[a].y + nodes[b].y) * 0.5;
    const id = createEdgeId(a, b);

    edgeIndexById.set(id, index);

    return {
      index,
      id,
      a,
      b,
      midpointX,
      midpointY,
      weight: lowerMiddleWeight(midpointX, midpointY),
    };
  });

  const routes = networkMap.preferredRoutes.map((route) => {
    const routeIndices = route.map((nodeId) => nodeIndexById.get(nodeId));
    const averageX = routeIndices.reduce((sum, index) => sum + nodes[index].x, 0) / routeIndices.length;
    const averageY = routeIndices.reduce((sum, index) => sum + nodes[index].y, 0) / routeIndices.length;

    return {
      nodes: routeIndices,
      weight: lowerMiddleWeight(averageX, averageY) * 1.25,
    };
  });

  return { nodes, edges, routes, edgeIndexById };
}

const graph = buildGraph();

function pickWeightedIndex(weights) {
  const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);

  if (total <= 0) {
    return Math.floor(Math.random() * weights.length);
  }

  let threshold = Math.random() * total;

  for (let index = 0; index < weights.length; index += 1) {
    threshold -= Math.max(0, weights[index]);
    if (threshold <= 0) {
      return index;
    }
  }

  return weights.length - 1;
}

function getParticleColor(kind, palette) {
  if (kind === 'ambient') return palette.pulseBlue;
  if (kind === 'active') return palette.pulseOrange;
  return palette.pulseWhite;
}

function getParticleChannel(kind) {
  if (kind === 'ambient') return 'ambient';
  if (kind === 'active') return 'active';
  return 'sync';
}

function getNodeRadius(type, scale) {
  if (type === 'hub') return 3.8 * scale;
  if (type === 'server') return 3.1 * scale;
  return 2.5 * scale;
}

function createGeometry(width, height) {
  const scale = clamp(Math.min(width, height) / 900, 0.82, 1.28);

  const nodes = graph.nodes.map((node) => ({
    ...node,
    px: node.x * width,
    py: node.y * height,
    radius: getNodeRadius(node.type, scale),
  }));

  const edges = graph.edges.map((edge) => {
    const from = nodes[edge.a];
    const to = nodes[edge.b];
    return {
      ...edge,
      ax: from.px,
      ay: from.py,
      bx: to.px,
      by: to.py,
      length: Math.max(Math.hypot(to.px - from.px, to.py - from.py), 1),
    };
  });

  return { width, height, scale, nodes, edges };
}

function chooseAmbientRoute() {
  const edgeIndex = pickWeightedIndex(graph.edges.map((edge) => edge.weight));
  const edge = graph.edges[edgeIndex];
  return Math.random() > 0.5 ? [edge.a, edge.b] : [edge.b, edge.a];
}

function choosePreferredRoute(kind) {
  const routeIndex = pickWeightedIndex(graph.routes.map((route) => route.weight));
  const route = graph.routes[routeIndex].nodes;

  if (kind === 'sync' || route.length <= 3) {
    return Math.random() > 0.5 ? [...route] : [...route].reverse();
  }

  const minimumLength = kind === 'active' ? 4 : 3;
  const maximumLength = kind === 'active' ? 6 : 4;
  const sliceLength = clamp(
    minimumLength + Math.floor(Math.random() * (maximumLength - minimumLength + 1)),
    minimumLength,
    route.length,
  );
  const maxStart = Math.max(0, route.length - sliceLength);
  const startIndex = maxStart > 0 ? Math.floor(Math.random() * (maxStart + 1)) : 0;
  const sliced = route.slice(startIndex, startIndex + sliceLength);

  return Math.random() > 0.35 ? sliced : [...sliced].reverse();
}

function createParticle(runtime, kind, palette) {
  const route = kind === 'ambient' ? chooseAmbientRoute() : choosePreferredRoute(kind);
  const startNode = runtime.geometry.nodes[route[0]];
  const scale = runtime.geometry.scale;
  const speedBase = kind === 'ambient' ? 100 : kind === 'active' ? 164 : 208;

  return {
    id: (runtime.particleCounter += 1),
    kind,
    route,
    segmentIndex: 0,
    progress: 0,
    speed: speedBase * scale * palette.speedMultiplier * (0.94 + Math.random() * 0.28),
    radius: (kind === 'ambient' ? 1.9 : kind === 'active' ? 2.4 : 2.75) * scale * (0.92 + Math.random() * 0.18),
    headX: startNode.px,
    headY: startNode.py,
    trail: [],
    trailFade: kind === 'ambient' ? 3.25 : kind === 'active' ? 3.7 : 4.5,
    trailSpacing: (kind === 'ambient' ? 8 : 10) * scale,
  };
}

function decayBuffer(buffer, dt, damping) {
  const decayFactor = Math.exp(-dt * damping);
  for (let index = 0; index < buffer.length; index += 1) {
    const nextValue = buffer[index] * decayFactor;
    buffer[index] = nextValue < 0.002 ? 0 : nextValue;
  }
}

function decayEnergies(runtime, dt) {
  decayBuffer(runtime.nodeEnergy.ambient, dt, 4.5);
  decayBuffer(runtime.nodeEnergy.active, dt, 5.7);
  decayBuffer(runtime.nodeEnergy.sync, dt, 7.2);
}

function setNodeEnergy(runtime, nodeIndex, kind, value) {
  const channel = getParticleChannel(kind);
  runtime.nodeEnergy[channel][nodeIndex] = Math.max(runtime.nodeEnergy[channel][nodeIndex], value);
}

function updateTrail(particle, dt, maxPoints) {
  for (let index = particle.trail.length - 1; index >= 0; index -= 1) {
    particle.trail[index].alpha = Math.max(0, particle.trail[index].alpha - dt * particle.trailFade);
    if (particle.trail[index].alpha <= 0.02) {
      particle.trail.splice(index, 1);
    }
  }

  while (particle.trail.length > maxPoints) {
    particle.trail.pop();
  }
}

function pushTrailPoint(particle, x, y) {
  const lastPoint = particle.trail[0];

  if (!lastPoint || Math.hypot(lastPoint.x - x, lastPoint.y - y) >= particle.trailSpacing) {
    particle.trail.unshift({ x, y, alpha: 1 });
  } else {
    lastPoint.x = x;
    lastPoint.y = y;
    lastPoint.alpha = 1;
  }
}

function updateParticles(runtime, dt) {
  const remainingParticles = [];

  for (const particle of runtime.particles) {
    let remainingDistance = particle.speed * dt;
    let isAlive = true;

    while (remainingDistance > 0 && isAlive) {
      if (particle.segmentIndex >= particle.route.length - 1) {
        isAlive = false;
        break;
      }

      const fromIndex = particle.route[particle.segmentIndex];
      const toIndex = particle.route[particle.segmentIndex + 1];
      const edgeIndex = graph.edgeIndexById.get(createEdgeId(fromIndex, toIndex));
      const edge = edgeIndex === undefined ? null : runtime.geometry.edges[edgeIndex];

      if (!edge) {
        isAlive = false;
        break;
      }

      const distanceToSegmentEnd = (1 - particle.progress) * edge.length;
      const travelled = Math.min(remainingDistance, distanceToSegmentEnd);

      particle.progress += travelled / edge.length;
      remainingDistance -= travelled;
      particle.headX = lerp(edge.ax, edge.bx, particle.progress);
      particle.headY = lerp(edge.ay, edge.by, particle.progress);
      pushTrailPoint(particle, particle.headX, particle.headY);

      if (particle.progress >= 0.999) {
        const impactBoost = particle.kind === 'ambient' ? 0.42 : particle.kind === 'active' ? 0.82 : 1;
        setNodeEnergy(runtime, toIndex, particle.kind, impactBoost);
        particle.segmentIndex += 1;
        particle.progress = 0;
        particle.headX = runtime.geometry.nodes[toIndex].px;
        particle.headY = runtime.geometry.nodes[toIndex].py;
        pushTrailPoint(particle, particle.headX, particle.headY);
      }
    }

    updateTrail(particle, dt, particle.kind === 'ambient' ? AMBIENT_TRAIL_POINTS : ROUTE_TRAIL_POINTS);

    if (particle.segmentIndex < particle.route.length - 1 || particle.trail.length > 0) {
      remainingParticles.push(particle);
    }
  }

  runtime.particles = remainingParticles;
}

function drawBaseEdges(context, runtime, palette) {
  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = palette.line;
  context.lineWidth = runtime.geometry.scale * 1.1;
  context.beginPath();

  for (const edge of runtime.geometry.edges) {
    context.moveTo(edge.ax, edge.ay);
    context.lineTo(edge.bx, edge.by);
  }

  context.stroke();
  context.restore();
}

function drawNodes(context, runtime, palette) {
  context.save();

  for (const node of runtime.geometry.nodes) {
    const ambient = runtime.nodeEnergy.ambient[node.index];
    const active = runtime.nodeEnergy.active[node.index];
    const sync = runtime.nodeEnergy.sync[node.index];

    if (ambient > 0.01) {
      context.globalAlpha = ambient * 0.72 * palette.nodeGlow;
      context.fillStyle = palette.pulseBlue;
      context.shadowColor = palette.pulseBlue;
      context.shadowBlur = 20 * runtime.geometry.scale * palette.glowIntensity * ambient;
      context.beginPath();
      context.arc(node.px, node.py, node.radius + ambient * 5.5 * runtime.geometry.scale, 0, Math.PI * 2);
      context.fill();
    }

    if (active > 0.01) {
      context.globalAlpha = active * 0.9 * palette.nodeGlow;
      context.fillStyle = palette.pulseOrange;
      context.shadowColor = palette.pulseOrange;
      context.shadowBlur = 24 * runtime.geometry.scale * palette.glowIntensity * active;
      context.beginPath();
      context.arc(node.px, node.py, node.radius + active * 6.2 * runtime.geometry.scale, 0, Math.PI * 2);
      context.fill();
    }

    if (sync > 0.01) {
      context.globalAlpha = sync * palette.nodeGlow;
      context.fillStyle = palette.pulseWhite;
      context.shadowColor = palette.pulseWhite;
      context.shadowBlur = 28 * runtime.geometry.scale * palette.glowIntensity * sync;
      context.beginPath();
      context.arc(node.px, node.py, node.radius + sync * 6.8 * runtime.geometry.scale, 0, Math.PI * 2);
      context.fill();
    }

    context.globalAlpha = 0.75;
    context.shadowBlur = 0;
    context.fillStyle =
      node.type === 'hub'
        ? 'rgba(203,224,255,0.82)'
        : node.type === 'server'
          ? 'rgba(193,214,248,0.65)'
          : 'rgba(180,204,236,0.44)';
    context.beginPath();
    context.arc(node.px, node.py, node.radius, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();
}

function drawParticle(context, runtime, palette, particle) {
  const color = getParticleColor(particle.kind, palette);

  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = color;
  context.fillStyle = color;
  context.shadowColor = color;
  context.shadowBlur =
    (particle.kind === 'ambient' ? 14 : particle.kind === 'active' ? 18 : 22) *
    runtime.geometry.scale *
    palette.glowIntensity;

  if (particle.trail.length > 1) {
    for (let index = 0; index < particle.trail.length - 1; index += 1) {
      const current = particle.trail[index];
      const next = particle.trail[index + 1];
      const alpha = clamp(current.alpha * (particle.kind === 'ambient' ? 0.34 : 0.5), 0, 1);

      context.globalAlpha = alpha;
      context.lineWidth =
        runtime.geometry.scale *
        (particle.kind === 'ambient' ? 1.3 : particle.kind === 'active' ? 1.7 : 2.05) *
        (1 - index / Math.max(1, particle.trail.length));
      context.beginPath();
      context.moveTo(current.x, current.y);
      context.lineTo(next.x, next.y);
      context.stroke();
    }
  }

  context.globalAlpha = particle.kind === 'ambient' ? 0.92 : 1;
  context.beginPath();
  context.arc(particle.headX, particle.headY, particle.radius, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawParticles(context, runtime, palette) {
  context.save();
  context.globalCompositeOperation = 'lighter';

  for (const particle of runtime.particles) {
    drawParticle(context, runtime, palette, particle);
  }

  context.restore();
}

function shouldSpawnAmbient(runtime) {
  return runtime.particles.length < 54;
}

function shouldSpawnRoute(runtime, variant) {
  return runtime.particles.length < (variant === 'light' ? 38 : 48);
}

function updateSpawn(runtime, palette, variant, dt) {
  if (!runtime.loading) return;

  runtime.ambientSpawnBudget += dt * (1.4 + Math.random() * 0.4) * palette.particleDensity;
  runtime.routeSpawnBudget += dt * (0.55 + Math.random() * 0.25) * palette.particleDensity;
  runtime.syncSpawnBudget += dt * 0.075 * palette.particleDensity;

  while (runtime.ambientSpawnBudget >= 1 && shouldSpawnAmbient(runtime)) {
    runtime.ambientSpawnBudget -= 1;
    runtime.particles.push(createParticle(runtime, 'ambient', palette));
  }

  while (runtime.routeSpawnBudget >= 1 && shouldSpawnRoute(runtime, variant)) {
    runtime.routeSpawnBudget -= 1;
    runtime.particles.push(createParticle(runtime, Math.random() > 0.28 ? 'active' : 'ambient', palette));
  }

  if (runtime.syncSpawnBudget >= 1 && runtime.particles.length < 52) {
    runtime.syncSpawnBudget -= 1;
    runtime.particles.push(createParticle(runtime, 'sync', palette));
  }
}

function renderFrame(context, runtime, palette) {
  context.clearRect(0, 0, runtime.geometry.width, runtime.geometry.height);
  drawBaseEdges(context, runtime, palette);
  drawNodes(context, runtime, palette);
  drawParticles(context, runtime, palette);
}

function resizeCanvas(canvas, runtime) {
  const parent = canvas.parentElement;
  const bounds = parent?.getBoundingClientRect();
  const width = Math.max(1, Math.round(bounds?.width ?? window.innerWidth));
  const height = Math.max(1, Math.round(bounds?.height ?? window.innerHeight));
  const dpr = clamp(window.devicePixelRatio || 1, 1, MAX_DPR);

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const context = canvas.getContext('2d');
  if (!context) return null;

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  runtime.geometry = createGeometry(width, height);
  return context;
}

export function useNetworkAnimation({ isLoading, variant }) {
  const canvasRef = useRef(null);
  const controllerRef = useRef(null);

  useEffect(() => {
    controllerRef.current?.setLoading(isLoading);
  }, [isLoading]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let animationFrameId = 0;
    let isDisposed = false;
    let resizeObserver = null;
    let drawingContext = canvas.getContext('2d');

    if (!drawingContext) return undefined;

    const palette = networkTheme[variant];
    const runtime = {
      geometry: createGeometry(1, 1),
      particles: [],
      nodeEnergy: createEnergyBuffers(graph.nodes.length),
      loading: isLoading,
      graceUntil: isLoading ? null : 0,
      visualOpacity: isLoading ? 1 : 0,
      ambientSpawnBudget: 0,
      routeSpawnBudget: 0,
      syncSpawnBudget: 0,
      particleCounter: 0,
    };

    const ensureContext = () => {
      drawingContext = resizeCanvas(canvas, runtime) ?? drawingContext;
      canvas.style.opacity = runtime.visualOpacity.toFixed(3);
    };

    const step = (now) => {
      if (isDisposed) return;

      const previousTimestamp = step.previous ?? now;
      step.previous = now;
      const dt = clamp((now - previousTimestamp) / 1000, 0.001, 0.033);

      updateSpawn(runtime, palette, variant, dt);
      decayEnergies(runtime, dt);
      updateParticles(runtime, dt);

      const keepCanvasVisible =
        runtime.loading ||
        runtime.particles.length > 0 ||
        (runtime.graceUntil !== null && now < runtime.graceUntil);
      const targetOpacity = keepCanvasVisible ? 1 : 0;

      runtime.visualOpacity += (targetOpacity - runtime.visualOpacity) * clamp(dt * 4.8, 0.12, 0.32);
      canvas.style.opacity = runtime.visualOpacity.toFixed(3);

      if (drawingContext && runtime.visualOpacity > LOOP_IDLE_OPACITY) {
        renderFrame(drawingContext, runtime, palette);
      } else if (drawingContext) {
        drawingContext.clearRect(0, 0, runtime.geometry.width, runtime.geometry.height);
      }

      if (runtime.loading || runtime.particles.length > 0 || runtime.visualOpacity > LOOP_IDLE_OPACITY) {
        animationFrameId = window.requestAnimationFrame(step);
      } else {
        animationFrameId = 0;
      }
    };

    const restartLoop = () => {
      if (animationFrameId === 0 && !isDisposed) {
        animationFrameId = window.requestAnimationFrame(step);
      }
    };

    controllerRef.current = {
      setLoading(nextLoading) {
        runtime.loading = nextLoading;
        runtime.graceUntil = nextLoading ? null : performance.now() + palette.animationGraceMs;

        if (nextLoading) {
          runtime.visualOpacity = Math.max(runtime.visualOpacity, 0.24);
        }

        restartLoop();
      },
      restartLoop,
    };

    ensureContext();
    restartLoop();

    const handleResize = () => {
      ensureContext();
      controllerRef.current?.restartLoop();
    };

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(handleResize);
      const parent = canvas.parentElement;
      if (parent) {
        resizeObserver.observe(parent);
      }
    } else {
      window.addEventListener('resize', handleResize);
    }

    return () => {
      isDisposed = true;
      controllerRef.current = null;
      if (animationFrameId) window.cancelAnimationFrame(animationFrameId);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [isLoading, variant]);

  return canvasRef;
}
