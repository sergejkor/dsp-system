function zone(name, bbox, options = {}) {
  return {
    name,
    bbox,
    reliability: options.reliability ?? 0.8,
    reflectionRisk: options.reflectionRisk ?? 0.2,
    tags: Array.isArray(options.tags) ? options.tags : [],
  };
}

function mirrorBbox([x, y, w, h]) {
  return [Number((1 - x - w).toFixed(4)), y, w, h];
}

function mirrorZone(definition) {
  return {
    ...definition,
    bbox: mirrorBbox(definition.bbox),
  };
}

function angledFrontLeftProfile(options = {}) {
  return [
    zone('front_bumper_left', [0.08, 0.64, 0.22, 0.18], { reliability: 0.88, reflectionRisk: 0.18 }),
    zone('left_headlight', [0.18, 0.45, 0.14, 0.12], { reliability: 0.86 }),
    zone('hood_left', [0.24, 0.28, 0.24, 0.18], { reliability: 0.72, reflectionRisk: 0.55, tags: ['glossy_upper'] }),
    zone('left_front_door_edge', [0.40, 0.36, 0.18, 0.28], { reliability: 0.8 }),
    zone('left_mirror_window', [0.42, 0.18, 0.16, 0.16], { reliability: 0.58, reflectionRisk: 0.72, tags: ['glass'] }),
    zone('left_rocker_front', [0.27, 0.76, 0.34, 0.08], { reliability: 0.84 }),
  ];
}

function sideProfile(side = 'left', options = {}) {
  const zones = [
    zone(`${side}_front_fender`, [0.06, 0.43, 0.12, 0.2], { reliability: 0.86 }),
    zone(`${side}_front_door`, [0.18, 0.36, 0.17, 0.3], { reliability: 0.84 }),
    zone(options.midDoorName || `${side}_mid_body`, [0.36, 0.36, 0.24, 0.31], { reliability: 0.85 }),
    zone(`${side}_rear_quarter`, [0.62, 0.4, 0.17, 0.24], { reliability: 0.82 }),
    zone(`${side}_rocker_panel`, [0.17, 0.68, 0.53, 0.09], { reliability: 0.88 }),
    zone(`${side}_upper_glass`, [0.2, 0.18, 0.5, 0.14], { reliability: 0.54, reflectionRisk: 0.82, tags: ['glass', 'glossy_upper'] }),
  ];
  return side === 'right' ? zones.map((entry) => mirrorZone(entry)) : zones;
}

function angledRearLeftProfile() {
  return [
    zone('rear_bumper_left', [0.12, 0.66, 0.23, 0.17], { reliability: 0.88 }),
    zone('rear_corner_left', [0.22, 0.42, 0.16, 0.2], { reliability: 0.83 }),
    zone('left_rear_quarter', [0.38, 0.36, 0.2, 0.26], { reliability: 0.8 }),
    zone('rear_door_left', [0.53, 0.35, 0.15, 0.29], { reliability: 0.76 }),
    zone('left_lower_sill', [0.32, 0.76, 0.39, 0.08], { reliability: 0.84 }),
    zone('rear_window_left', [0.46, 0.17, 0.18, 0.14], { reliability: 0.52, reflectionRisk: 0.8, tags: ['glass'] }),
  ];
}

function rearProfile(options = {}) {
  return [
    zone('rear_left_door', [0.16, 0.34, 0.19, 0.31], { reliability: 0.78 }),
    zone('rear_center', [0.36, 0.34, 0.28, 0.32], { reliability: 0.82 }),
    zone('rear_right_door', [0.65, 0.34, 0.19, 0.31], { reliability: 0.78 }),
    zone('rear_bumper', [0.18, 0.69, 0.64, 0.15], { reliability: 0.9 }),
    zone('rear_upper_window', [0.28, 0.16, 0.44, 0.13], { reliability: 0.5, reflectionRisk: 0.78, tags: ['glass', 'glossy_upper'] }),
    zone(options.centerLowerName || 'license_plate_zone', [0.39, 0.54, 0.22, 0.1], { reliability: 0.68, reflectionRisk: 0.35 }),
  ];
}

function frontProfile(options = {}) {
  return [
    zone('front_left_bumper', [0.12, 0.63, 0.18, 0.18], { reliability: 0.88 }),
    zone('front_center_bumper', [0.31, 0.61, 0.38, 0.2], { reliability: 0.91 }),
    zone('front_right_bumper', [0.7, 0.63, 0.18, 0.18], { reliability: 0.88 }),
    zone('hood_center', [0.28, 0.28, 0.44, 0.2], { reliability: 0.74, reflectionRisk: 0.56, tags: ['glossy_upper'] }),
    zone('front_left_headlight', [0.18, 0.46, 0.14, 0.11], { reliability: 0.82 }),
    zone('front_right_headlight', [0.68, 0.46, 0.14, 0.11], { reliability: 0.82 }),
    zone(options.windshieldName || 'windshield', [0.29, 0.11, 0.42, 0.12], { reliability: 0.48, reflectionRisk: 0.82, tags: ['glass'] }),
  ];
}

function createVanProfile(options = {}) {
  return {
    front_left: angledFrontLeftProfile(options),
    left_side: sideProfile('left', { midDoorName: options.leftMidDoorName || 'sliding_door' }),
    rear_left: angledRearLeftProfile(options),
    rear: rearProfile(options),
    rear_right: angledRearLeftProfile(options).map((entry) => mirrorZone(entry)),
    right_side: sideProfile('right', { midDoorName: options.rightMidDoorName || 'cargo_door' }),
    front_right: angledFrontLeftProfile(options).map((entry) => mirrorZone(entry)),
    front: frontProfile(options),
  };
}

function createRivianProfile() {
  return {
    front_left: [
      zone('front_bumper_left', [0.1, 0.67, 0.21, 0.16], { reliability: 0.88 }),
      zone('front_fascia_left', [0.19, 0.46, 0.16, 0.12], { reliability: 0.8 }),
      zone('hood_left', [0.26, 0.29, 0.22, 0.17], { reliability: 0.72, reflectionRisk: 0.58, tags: ['glossy_upper'] }),
      zone('driver_door_edge', [0.41, 0.37, 0.2, 0.27], { reliability: 0.82 }),
      zone('driver_window', [0.45, 0.19, 0.18, 0.14], { reliability: 0.54, reflectionRisk: 0.78, tags: ['glass'] }),
      zone('left_step_panel', [0.28, 0.76, 0.36, 0.07], { reliability: 0.84 }),
    ],
    left_side: [
      zone('front_wheel_arch', [0.06, 0.46, 0.12, 0.18], { reliability: 0.82 }),
      zone('driver_door', [0.19, 0.37, 0.17, 0.28], { reliability: 0.84 }),
      zone('cargo_side_panel', [0.37, 0.34, 0.27, 0.32], { reliability: 0.86 }),
      zone('rear_side_panel', [0.65, 0.39, 0.16, 0.23], { reliability: 0.8 }),
      zone('left_step_panel', [0.18, 0.69, 0.56, 0.09], { reliability: 0.88 }),
      zone('upper_glass_band', [0.2, 0.18, 0.52, 0.12], { reliability: 0.5, reflectionRisk: 0.84, tags: ['glass', 'glossy_upper'] }),
    ],
    rear_left: [
      zone('rear_bumper_left', [0.13, 0.68, 0.22, 0.16], { reliability: 0.88 }),
      zone('rear_corner_left', [0.24, 0.45, 0.16, 0.18], { reliability: 0.82 }),
      zone('left_cargo_rear_panel', [0.41, 0.37, 0.2, 0.28], { reliability: 0.82 }),
      zone('rear_door_left', [0.58, 0.36, 0.14, 0.29], { reliability: 0.76 }),
      zone('left_lower_sill', [0.35, 0.77, 0.38, 0.07], { reliability: 0.84 }),
      zone('rear_left_window_band', [0.48, 0.19, 0.16, 0.12], { reliability: 0.48, reflectionRisk: 0.82, tags: ['glass'] }),
    ],
    rear: [
      zone('rear_left_panel', [0.14, 0.36, 0.2, 0.3], { reliability: 0.8 }),
      zone('rear_center_portal', [0.35, 0.34, 0.3, 0.32], { reliability: 0.84 }),
      zone('rear_right_panel', [0.66, 0.36, 0.2, 0.3], { reliability: 0.8 }),
      zone('rear_bumper', [0.17, 0.7, 0.66, 0.14], { reliability: 0.9 }),
      zone('rear_window_band', [0.28, 0.17, 0.44, 0.11], { reliability: 0.48, reflectionRisk: 0.84, tags: ['glass', 'glossy_upper'] }),
      zone('rear_center_lower', [0.39, 0.55, 0.22, 0.1], { reliability: 0.7 }),
    ],
    rear_right: [
      zone('rear_bumper_right', [0.65, 0.68, 0.22, 0.16], { reliability: 0.88 }),
      zone('rear_corner_right', [0.6, 0.45, 0.16, 0.18], { reliability: 0.82 }),
      zone('right_cargo_rear_panel', [0.39, 0.37, 0.2, 0.28], { reliability: 0.82 }),
      zone('rear_door_right', [0.28, 0.36, 0.14, 0.29], { reliability: 0.76 }),
      zone('right_lower_sill', [0.27, 0.77, 0.38, 0.07], { reliability: 0.84 }),
      zone('rear_right_window_band', [0.36, 0.19, 0.16, 0.12], { reliability: 0.48, reflectionRisk: 0.82, tags: ['glass'] }),
    ],
    right_side: [
      zone('front_wheel_arch', [0.82, 0.46, 0.12, 0.18], { reliability: 0.82 }),
      zone('passenger_door', [0.64, 0.37, 0.17, 0.28], { reliability: 0.84 }),
      zone('cargo_side_panel', [0.36, 0.34, 0.27, 0.32], { reliability: 0.86 }),
      zone('rear_side_panel', [0.19, 0.39, 0.16, 0.23], { reliability: 0.8 }),
      zone('right_step_panel', [0.26, 0.69, 0.56, 0.09], { reliability: 0.88 }),
      zone('upper_glass_band', [0.28, 0.18, 0.52, 0.12], { reliability: 0.5, reflectionRisk: 0.84, tags: ['glass', 'glossy_upper'] }),
    ],
    front_right: [
      zone('front_bumper_right', [0.69, 0.67, 0.21, 0.16], { reliability: 0.88 }),
      zone('front_fascia_right', [0.65, 0.46, 0.16, 0.12], { reliability: 0.8 }),
      zone('hood_right', [0.52, 0.29, 0.22, 0.17], { reliability: 0.72, reflectionRisk: 0.58, tags: ['glossy_upper'] }),
      zone('passenger_door_edge', [0.39, 0.37, 0.2, 0.27], { reliability: 0.82 }),
      zone('passenger_window', [0.37, 0.19, 0.18, 0.14], { reliability: 0.54, reflectionRisk: 0.78, tags: ['glass'] }),
      zone('right_step_panel', [0.36, 0.76, 0.36, 0.07], { reliability: 0.84 }),
    ],
    front: [
      zone('front_left_bumper', [0.12, 0.64, 0.18, 0.17], { reliability: 0.88 }),
      zone('front_center_bumper', [0.3, 0.62, 0.4, 0.18], { reliability: 0.91 }),
      zone('front_right_bumper', [0.7, 0.64, 0.18, 0.17], { reliability: 0.88 }),
      zone('hood_center', [0.28, 0.28, 0.44, 0.18], { reliability: 0.72, reflectionRisk: 0.6, tags: ['glossy_upper'] }),
      zone('light_bar', [0.24, 0.42, 0.52, 0.08], { reliability: 0.68, reflectionRisk: 0.34 }),
      zone('windshield', [0.31, 0.12, 0.38, 0.11], { reliability: 0.46, reflectionRisk: 0.84, tags: ['glass'] }),
    ],
  };
}

export {
  createVanProfile,
  createRivianProfile,
};
