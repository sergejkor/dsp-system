import { EventEmitter } from 'node:events';

const vehicleInspectionEvents = new EventEmitter();
vehicleInspectionEvents.setMaxListeners(50);

export default vehicleInspectionEvents;
