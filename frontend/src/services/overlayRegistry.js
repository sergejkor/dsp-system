export const SHOT_SEQUENCE = [
  {
    id: 'front_left',
    label: 'Front left',
    shortLabel: 'Front-L',
    instructions: 'Stand one vehicle length away and align the left front corner inside the guide.',
    captureTip: 'Keep the headlight, bumper corner, and side panel inside the outline.',
  },
  {
    id: 'left_side',
    label: 'Left side',
    shortLabel: 'Left',
    instructions: 'Fit the full driver side from bumper to bumper.',
    captureTip: 'Make sure both wheels and the roofline stay inside the overlay.',
  },
  {
    id: 'rear_left',
    label: 'Rear left',
    shortLabel: 'Rear-L',
    instructions: 'Capture the rear-left corner with the tail lamp and side panel visible.',
    captureTip: 'Center the rear corner and avoid cutting off the roof or bumper.',
  },
  {
    id: 'rear',
    label: 'Rear',
    shortLabel: 'Rear',
    instructions: 'Take a straight-on rear photo with the full back visible.',
    captureTip: 'Keep both tail lamps and the rear bumper inside the frame.',
  },
  {
    id: 'rear_right',
    label: 'Rear right',
    shortLabel: 'Rear-R',
    instructions: 'Capture the rear-right corner with the passenger-side rear panel visible.',
    captureTip: 'Match the rear wheel arch and tail light to the guide.',
  },
  {
    id: 'right_side',
    label: 'Right side',
    shortLabel: 'Right',
    instructions: 'Fit the full passenger side from bumper to bumper.',
    captureTip: 'Step back until the entire profile sits inside the outline.',
  },
  {
    id: 'front_right',
    label: 'Front right',
    shortLabel: 'Front-R',
    instructions: 'Capture the right front corner with bumper, wheel arch, and headlight visible.',
    captureTip: 'Keep the front wheel and grille edge aligned to the overlay.',
  },
  {
    id: 'front',
    label: 'Front',
    shortLabel: 'Front',
    instructions: 'Take a straight-on front photo with the whole nose centered.',
    captureTip: 'Keep both headlights and the full bumper visible.',
  },
];

export const REQUIRED_SHOT_IDS = SHOT_SEQUENCE.map((shot) => shot.id);

export const overlayRegistry = {
  sprinter_high_roof_long: {
    label: 'Mercedes Sprinter',
    basePath: '/overlays/sprinter/',
    shots: SHOT_SEQUENCE.map((shot) => ({
      ...shot,
      overlayPath: `/overlays/sprinter/${shot.id}.svg`,
    })),
  },
  peugeot_boxer: {
    label: 'Peugeot Boxer',
    basePath: '/overlays/boxer/',
    shots: SHOT_SEQUENCE.map((shot) => ({
      ...shot,
      overlayPath: `/overlays/boxer/${shot.id}.svg`,
    })),
  },
  rivian_edv: {
    label: 'Rivian EDV',
    basePath: '/overlays/rivian/',
    shots: SHOT_SEQUENCE.map((shot) => ({
      ...shot,
      overlayPath: `/overlays/rivian/${shot.id}.svg`,
    })),
  },
};

export function getOverlaySet(vehicleType) {
  const overlaySet = overlayRegistry[vehicleType];
  if (!overlaySet) {
    throw new Error(`Unsupported inspection vehicle type: ${vehicleType}`);
  }
  return overlaySet;
}

export function getShotDefinition(shotId) {
  return SHOT_SEQUENCE.find((shot) => shot.id === shotId) || null;
}
