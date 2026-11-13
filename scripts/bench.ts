import { ephemeris } from "../lib/astro";

const site = { lat: -89.61, lon: 187.326, elevationKm: 1.536 };
const t0 = Date.now();
let x = ephemeris(new Date(Date.UTC(2026, 10, 11)), site);
for (let i = 0; i < 720; i++) {
  x = ephemeris(new Date(Date.UTC(2026, 10, 11) + i * 3600000), site);
}
console.log("720 ephemeris ms", Date.now() - t0, x.sun.elevation, x.earth.elevation);
