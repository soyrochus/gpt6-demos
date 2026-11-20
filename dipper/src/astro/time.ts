import { DateTime, IANAZone } from "luxon";
import lookup from "@photostructure/tz-lookup";
import type { Observer } from "./sky";
export const supportedStart = Date.UTC(1900, 0, 1),
  supportedEnd = Date.UTC(2101, 0, 1) - 1;
export const validInstant = (ms: number) =>
  Number.isFinite(ms) && ms >= supportedStart && ms <= supportedEnd;
export function location(
  label: string,
  latitudeDeg: number,
  longitudeDeg: number,
  elevationM = 0,
  zone?: string,
  manual = false,
): Observer {
  if (!(
    Math.abs(latitudeDeg) <= 90 &&
    Math.abs(longitudeDeg) <= 180 &&
    Number.isFinite(elevationM)
  ))
    throw Error(
      "Enter latitude within ±90°, longitude within ±180°, and a finite elevation.",
    );
  let timeZoneId = zone;
  if (!timeZoneId) {
    try {
      timeZoneId = lookup(latitudeDeg, longitudeDeg);
    } catch {
      throw Error("Choose an IANA time zone or UTC for these coordinates.");
    }
  }
  if (!IANAZone.isValidZone(timeZoneId))
    throw Error("Choose a valid IANA time zone, such as Europe/Madrid or UTC.");
  return {
    label,
    latitudeDeg,
    longitudeDeg,
    elevationM,
    timeZoneId,
    elevationSource: manual ? "manual" : "assumed",
  };
}
export const presets = [
  location("Valencia", 39.4699, -0.3763),
  location("Cape Town", -33.9249, 18.4241),
  location("Reykjavík", 64.1466, -21.9426),
  location("Sydney", -33.8688, 151.2093),
  location("Equator", 0, 0, 0, "UTC"),
];
export const localDate = (ms: number, zone: string) =>
  DateTime.fromMillis(ms, { zone });
export function civilInstants(input: string, zone: string) {
  const d = DateTime.fromISO(input, { zone });
  if (!d.isValid || d.toFormat("yyyy-MM-dd'T'HH:mm") !== input)
    throw Error(
      "This local time does not exist. Choose a time outside the daylight-saving gap.",
    );
  const choices = d.getPossibleOffsets().sort((a, b) => +a - +b);
  if (choices.some((c) => !validInstant(+c)))
    throw Error("Select a date between 1900 and 2100.");
  return choices;
}
export const stepDay = (ms: number, zone: string, days: number) =>
  localDate(ms, zone).plus({ days }).toMillis();
export interface Clock {
  anchorUtcMs: number;
  anchorRealMs: number;
  rate: number;
  paused: boolean;
}
export const clockAt = (c: Clock, realMs: number) =>
  c.anchorUtcMs + (c.paused ? 0 : (realMs - c.anchorRealMs) * c.rate);
