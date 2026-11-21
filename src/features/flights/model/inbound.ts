import type { Flight, Stand } from "../../../shared/types";
/**
 * Continuous inbound schedule for APRON 07. Arrival slots repeat every three
 * minutes from 08:06 onward, independent of shift boundaries: an incoming
 * shift inherits the slots in its watch, while whatever it leaves unclaimed is
 * picked up by the handover plan.
 */
export const INBOUND_FIRST_ARRIVAL = 360;
export const INBOUND_INTERVAL = 180;
interface InboundTemplate {
  id: string;
  airline: string;
  from: string;
  destination: string;
  aircraft: string;
  size: "narrow" | "wide";
  passengers: number;
  color: string;
  standId: string;
}
const pool: InboundTemplate[] = [
  {
    id: "MU5121",
    airline: "东方航空",
    from: "西安 · XIY",
    destination: "上海 · SHA",
    aircraft: "A321",
    size: "narrow",
    passengers: 168,
    color: "#e46e49",
    standId: "A01",
  },
  {
    id: "CZ3852",
    airline: "南方航空",
    from: "深圳 · SZX",
    destination: "北京 · PEK",
    aircraft: "A330",
    size: "wide",
    passengers: 262,
    color: "#397c9b",
    standId: "A03",
  },
  {
    id: "CA1877",
    airline: "中国国航",
    from: "成都 · CTU",
    destination: "厦门 · XMN",
    aircraft: "B737",
    size: "narrow",
    passengers: 159,
    color: "#c75448",
    standId: "A02",
  },
  {
    id: "HU7318",
    airline: "海南航空",
    from: "三亚 · SYX",
    destination: "杭州 · HGH",
    aircraft: "B738",
    size: "narrow",
    passengers: 152,
    color: "#b78a40",
    standId: "B01",
  },
  {
    id: "MF8234",
    airline: "厦门航空",
    from: "福州 · FOC",
    destination: "上海 · SHA",
    aircraft: "B787",
    size: "wide",
    passengers: 236,
    color: "#4683a6",
    standId: "B03",
  },
  {
    id: "3U8891",
    airline: "四川航空",
    from: "重庆 · CKG",
    destination: "深圳 · SZX",
    aircraft: "A320",
    size: "narrow",
    passengers: 154,
    color: "#b85d58",
    standId: "B02",
  },
  {
    id: "FM9126",
    airline: "上海航空",
    from: "青岛 · TAO",
    destination: "上海 · SHA",
    aircraft: "B738",
    size: "narrow",
    passengers: 161,
    color: "#8d5c9b",
    standId: "A02",
  },
  {
    id: "HO1288",
    airline: "吉祥航空",
    from: "昆明 · KMG",
    destination: "南京 · NKG",
    aircraft: "A321",
    size: "narrow",
    passengers: 170,
    color: "#5a8a5c",
    standId: "B01",
  },
];
export function inboundArrival(index: number): number {
  return INBOUND_FIRST_ARRIVAL + index * INBOUND_INTERVAL;
}
export function inboundIndexOfArrival(arrival: number): number {
  return Math.round((arrival - INBOUND_FIRST_ARRIVAL) / INBOUND_INTERVAL);
}
export function inboundTemplate(index: number): InboundTemplate {
  return pool[((index % pool.length) + pool.length) % pool.length];
}
function inboundId(index: number): string {
  const template = inboundTemplate(index),
    cycle = Math.floor(index / pool.length);
  return cycle > 0 ? `${template.id}-${cycle + 1}` : template.id;
}
export function preferredStandForArrival(arrival: number): string | undefined {
  const index = inboundIndexOfArrival(arrival);
  if (index < 0) return undefined;
  return inboundTemplate(index).standId;
}
/** All world-schedule arrivals in the half-open interval (after, until]. */
export function inboundFlightsBetween(
  after: number,
  until: number,
  takenIds: ReadonlySet<string> = new Set(),
): Flight[] {
  if (until < INBOUND_FIRST_ARRIVAL) return [];
  const first = Math.max(
      0,
      Math.floor((after - INBOUND_FIRST_ARRIVAL) / INBOUND_INTERVAL) + 1,
    ),
    last = Math.floor((until - INBOUND_FIRST_ARRIVAL) / INBOUND_INTERVAL),
    result: Flight[] = [];
  for (let index = first; index <= last; index++) {
    const id = inboundId(index);
    if (takenIds.has(id)) continue;
    const template = inboundTemplate(index);
    result.push({
      id,
      airline: template.airline,
      from: template.from,
      destination: template.destination,
      aircraft: template.aircraft,
      size: template.size,
      arrival: inboundArrival(index),
      deadline:
        inboundArrival(index) + (template.size === "wide" ? 390 : 330),
      passengers: template.passengers,
      status: "scheduled",
      color: template.color,
      newInbound: true,
      delayLedger: [],
      delayCarried: 0,
    });
  }
  return result;
}
export function preferredStandForFlight(
  flight: Flight,
  stands: Stand[],
): string | undefined {
  if (flight.plannedStandId && stands.some((s) => s.id === flight.plannedStandId))
    return flight.plannedStandId;
  return preferredStandForArrival(flight.arrival);
}
