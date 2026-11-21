export type ServiceKind = "baggage" | "fuel" | "clean";
export type FlightStatus =
  "scheduled" | "incoming" | "parked" | "departing" | "departed";
export type ServiceStatus = "pending" | "travel" | "working" | "done";
export interface Point {
  x: number;
  y: number;
}
export interface DelayLedgerEntry {
  shiftId: string;
  shiftNumber: number;
  seconds: number;
  at: number;
}
export interface Flight {
  id: string;
  airline: string;
  from: string;
  destination: string;
  aircraft: string;
  size: "narrow" | "wide";
  arrival: number;
  deadline: number;
  passengers: number;
  status: FlightStatus;
  standId?: string;
  departureAt?: number;
  color: string;
  /** Advisory stand chosen while the next shift plan was approved. */
  plannedStandId?: string;
  /** True for flights injected as part of a handover inbound plan. */
  newInbound?: boolean;
  /** Accrued delay (seconds) inherited at the most recent handover. */
  delayCarried?: number;
  /** Per-shift record of delay accrued up to each handover boundary. */
  delayLedger?: DelayLedgerEntry[];
  /** Shift that approved pushback for this aircraft. */
  departureShiftId?: string;
  departureShiftNumber?: number;
}
export interface Stand extends Point {
  id: string;
  size: "narrow" | "wide";
  terminal: string;
}
export interface ServiceHandoverRef {
  recordId: string;
  fromShiftId: string;
  fromShiftNumber: number;
  at: number;
  status: ServiceStatus;
  progress: number;
}
export interface Service {
  id: string;
  flightId: string;
  kind: ServiceKind;
  status: ServiceStatus;
  progress: number;
  duration: number;
  vehicleId?: string;
  /** Present when this task crossed a shift boundary. */
  handover?: ServiceHandoverRef;
}
export interface Vehicle {
  id: string;
  kind: ServiceKind;
  status: "idle" | "travel" | "working" | "returning";
  position: Point;
  origin: Point;
  target: Point;
  progress: number;
  tripDuration: number;
  serviceId?: string;
}
export interface Event {
  id: number;
  time: number;
  text: string;
  tone: "info" | "success" | "warning";
}
export interface HandoverTaskLine {
  taskId: string;
  flightId: string;
  kind: ServiceKind;
  status: ServiceStatus;
  progress: number;
  remainingSeconds: number;
  vehicleId?: string;
  occupiedStandId?: string;
}
export interface HandoverRisk {
  id: string;
  severity: "danger" | "warning" | "info";
  title: string;
  detail: string;
  flightId?: string;
  taskId?: string;
}
export interface HandoverSettlement {
  earnedScore: number;
  delayPenalty: number;
  finalScore: number;
  /** Total delay accrued on the outgoing shift's watch (all flights). */
  accruedDelaySeconds: number;
  /** Delay already on the clock that the next shift inherits, not re-penalised. */
  carriedDelaySeconds: number;
  departedFlights: number;
  inheritedFlights: number;
  unfinishedTasks: number;
  activeVehicles: number;
  occupiedStands: number;
}
export interface HandoverOption {
  key: "now" | "planned";
  label: string;
  at: number;
  /** Already settled plus forecast points if the shift is kept open. */
  settleableScore: number;
  /** New arrivals that would land on this shift's watch. */
  newInboundCount: number;
  inheritedFlights: number;
  unfinishedTasks: number;
  riskLevel: "低" | "中" | "高";
  note: string;
}
export interface HandoverComparison {
  now: HandoverOption;
  planned: HandoverOption;
  plannedEnd: number;
  newPlanCount: number;
  verdict: string;
}
export interface HandoverPlanLine {
  flightId: string;
  source: "inherited" | "new";
  baseArrival: number;
  arrival: number;
  requestedStandId?: string;
  assignedStandId?: string;
  deferred: boolean;
  severity: "ok" | "warning" | "danger";
  note: string;
}
export interface PlanAdjustment {
  deferSeconds: number;
  /** Explicit stand, or omitted to let the handover allocate one. */
  standId?: string;
}
export interface ShiftArchive {
  shiftId: string;
  number: number;
  startedAt: number;
  endsAt: number;
  time: number;
  score: number;
  conflicts: number;
  flights: Flight[];
  stands: Stand[];
  services: Service[];
  vehicles: Vehicle[];
  events: Event[];
}
export interface HandoverRecord {
  id: string;
  fromShiftId: string;
  fromShiftNumber: number;
  toShiftId: string;
  toShiftNumber: number;
  at: number;
  confirmed: true;
  taskLines: HandoverTaskLine[];
  inheritedFlightIds: string[];
  inheritedServiceIds: string[];
  inheritedVehicleIds: string[];
  occupiedStandIds: string[];
  planFlightIds: string[];
  plan: HandoverPlanLine[];
  newFlights: Flight[];
  risks: HandoverRisk[];
  settlement: HandoverSettlement;
  comparison: HandoverComparison;
  fromArchive: ShiftArchive;
}
export interface Shift {
  version: 1;
  shiftId: string;
  number: number;
  startedAt: number;
  endsAt: number;
  time: number;
  paused: boolean;
  speed: 1 | 2 | 4;
  score: number;
  conflicts: number;
  flights: Flight[];
  stands: Stand[];
  services: Service[];
  vehicles: Vehicle[];
  events: Event[];
  selectedFlightId: string;
  selectedStandId?: string;
  selectedVehicleId?: string;
  nextEventId: number;
  /** True once this shift has been handed over; commands become no-ops. */
  archived: boolean;
  /** Outgoing handover record for an archived shift. */
  handover?: HandoverRecord;
  /** Handover records visible from this shift (latest last). */
  handoverLog: HandoverRecord[];
}
export type CommandResult = (state: Shift) => Shift;
