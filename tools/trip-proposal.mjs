// The app's proposal for one trip, as readable Dutch text: the ranking, the recommended route day by day and 3 stays per stop.
// Used by the persona round on trips (dates, party, highlights).
//
//   node tools/trip-proposal.mjs --highlights                 list the highlights to choose from (id, category, name)
//   node tools/trip-proposal.mjs swipes.json trip.json        the proposal; add --route b to see another route in detail
// swipes.json: {cardId: -1|1|2} or {swipes, prefs: {airco, ev, budget}}
// trip.json: {nights, months: "2027-07 2027-08" | start/end: "YYYY-MM-DD", party: [{name, born?}], highlights: ["hl-..."]}
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from '../logic.js';
import { loadData, swipesOf, extrasOf } from './simulate.mjs';

const ROOT = new URL('../', import.meta.url);
const highlightsOf = data => L.sanitizeHighlights(JSON.parse(fs.readFileSync(new URL(data.dest.highlights, ROOT), 'utf8')));
const euro = n => (n > 0 ? '€'.repeat(Math.round(n)) : '');
const fmt = m => `${Math.floor(m / 60)} u ${String(m % 60).padStart(2, '0')}`;

// the trip as the app stores it (party as {p0..}, highlights as a string)
// tolerant about the input: party or people, names as strings or {name, born}
export function tripOf(t) {
  const people = (t.party || t.people || t.travelers || []).map(p => (typeof p === 'string' ? { name: p } : { ...p, born: p.born ?? p.birthYear }));
  const out = { dest: 'corsica', nights: t.start && t.end ? L.nightsBetween(t.start, t.end) : t.nights, party: L.writePeople(people) };
  if (t.start && t.end) { out.start = t.start; out.end = t.end; } else if (t.months) out.months = t.months;
  if (Array.isArray(t.highlights) && t.highlights.length) out.highlights = t.highlights.join(' ');
  return out;
}

export function proposal(raw, tripIn, data, { route = null } = {}) {
  const trip = tripOf(tripIn), hls = highlightsOf(data);
  const swipes = swipesOf(raw), { overrides, prefs: own } = extrasOf(raw);
  delete own.kids; // the party decides
  const prefs = L.tripPrefs([own], trip);
  const profile = L.profileFrom(swipes, [...data.deck.acc, ...data.deck.act], L.effectiveOverrides(overrides, prefs));
  const ctx = { acc: data.catalog.acc, act: data.catalog.act, places: data.places.places, stays: data.places.stays, regionTags: data.places.regionTags, regionVeto: data.places.regionVeto, labels: data.labels, prefs,
    trip: true, nights: L.tripNights(trip), highlights: L.highlightIds(trip).map(id => hls.find(h => h.id === id)).filter(Boolean), vocab: { acc: Object.keys(data.tags.accommodation), act: Object.keys(data.tags.activity) } };
  const routes = [...data.routes, ...L.generateRoutes(data.routes, data.places.places, L.sanitizePlaces(data.places).stays)]; // templates plus the generated ones, as in the app
  const ranked = L.rankRoutes(routes, profile, ctx);
  const plan = (route && ranked.find(p => p.route.id === route.toLowerCase())) || ranked[0];
  const actById = id => data.catalog.act.find(a => a.id === id);
  const picks = (plan.placed || []).map(p => ({ ...p, item: actById(p.hl.acts[0]) }));
  const { days, unplaced } = L.dayPlan(plan, { picks, calm: L.burdenWeight(profile, prefs) >= 0.3, start: trip.start && trip.end ? trip.start : '' });
  const stay = k => (data.places.stays[k] || {}).short || k;
  const lines = [];
  const party = L.readPeople(trip.party).map(p => { const a = L.ageOn(p.born, L.tripStart(trip)); return a !== null && a < 18 ? `${p.name} (${a})` : p.name; });
  lines.push(`Reis: ${trip.nights} nachten${trip.months ? ' in ' + trip.months : trip.start ? ` van ${trip.start} tot ${trip.end}` : ''} · gezelschap: ${party.join(', ')}`);
  lines.push(`Gekozen highlights: ${ctx.highlights.map(h => h.name).join(', ') || 'geen'}`);
  lines.push('');
  const TAG = { all: 'ALLE HIGHLIGHTS', less: 'MINDER RIJDEN' };
  lines.push('Voorstellen in de app (de eerste is aanbevolen):');
  for (const p of ranked.slice(0, 3)) lines.push(`- ${p.tag ? TAG[p.tag] + ': ' : ''}route ${p.route.id.toUpperCase()} ${p.route.title} · ${p.stops.map(s => `${stay(s.stay)} ${s.nights}`).join(', ')} · ${fmt(p.route.legs.reduce((a, l) => a + l.min, 0))} rijden · ${(p.placed || []).filter(x => x.stop >= 0).length}/${(p.placed || []).length} highlights · ${p.matchPct == null ? 'minder passend' : p.matchPct + '%'}`);
  lines.push('');
  lines.push(`=== ${plan === ranked[0] ? 'Aanbevolen' : 'Gekozen'} route ${plan.route.id.toUpperCase()}: ${plan.route.title} ===`);
  lines.push(plan.route.lead);
  lines.push(`Stops: ${plan.stops.map(s => `${stay(s.stay)} ${s.nights} nachten`).join(', ')} · rijden totaal ca. ${fmt(plan.route.legs.reduce((a, l) => a + l.min, 0))}`);
  for (const h of unplaced) { const other = L.routesWith(ranked, h.id).slice(0, 2).map(id => ranked.find(p => p.route.id === id).route.title); lines.push(`Past niet in deze route: ${h.name || h.id}${other.length ? ` (wel in: ${other.join(' / ')})` : ''}`); }
  lines.push('');
  lines.push('Dag voor dag:');
  for (const d of days) {
    const head = `Dag ${d.n}${d.date ? ' (' + d.date + ')' : ''} · ${stay(d.stay)}: `;
    if (d.kind === 'travel') lines.push(head + `${d.n === 1 ? 'aankomst' : 'verhuisdag'}${d.leg ? `, ${d.leg.from} naar ${d.leg.to} (${fmt(d.leg.min)})` : ''}${d.act ? ', daarna ' + d.act.item.name : ''}`);
    else if (d.kind === 'highlight') lines.push(head + `HIGHLIGHT ${d.hl.name}${d.min > 15 ? ` (ca. ${fmt(d.min)} rijden)` : ''}${d.item && L.tooYoung(d.item, prefs.youngest ?? null) ? ' [let op: niet voor de jongste]' : ''}`);
    else if (d.kind === 'activity') lines.push(head + `${d.act.item.name} (${d.act.item.durationH ?? '?'} u, ${d.act.driveMin} min rijden)${d.alt ? ' — of: ' + d.alt.item.name : ''}`);
    else if (d.kind === 'rest') lines.push(head + `rustige dag${d.act ? ': ' + d.act.item.name : ''}`);
    else if (d.kind === 'free') lines.push(head + 'vrije dag');
    else lines.push(head + `terug naar de ferry${d.leg ? `, ${d.leg.from} naar ${d.leg.to} (${fmt(d.leg.min)})` : ''}`);
  }
  lines.push('');
  lines.push('Verblijven per stop (top 3):');
  for (const s of plan.stops) {
    lines.push(`- ${stay(s.stay)}:`);
    for (const a of s.acc) {
      const tw = L.tagWeights(a.item);
      const flags = [tw.airco >= 0.5 ? 'airco' : prefs.airco ? 'airco onbekend' : '', a.fit === 'rooms' ? `max ${a.item.sleeps} p. per kamer: meer kamers nodig` : a.fit === 'unknown' ? 'aantal personen onbekend' : '', a.tier === 3 ? 'boven budget' : ''].filter(Boolean);
      lines.push(`    ${a.item.name} ${euro(a.item.priceLevel)} — ${a.item.desc || ''}${flags.length ? ' {' + flags.join('; ') + '}' : ''}`);
    }
  }
  return { text: lines.join('\n'), route: plan.route.id, days: days.length, unplaced: unplaced.map(h => h.id) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), data = loadData();
  if (args.includes('--highlights')) {
    for (const h of highlightsOf(data)) console.log(`${h.id}\t${h.cat}\t${h.name} — ${h.desc}`);
  } else {
    const [sw, tr] = args.filter(a => !a.startsWith('--'));
    const ri = args.indexOf('--route');
    const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, '')); // files written by PowerShell start with a BOM
    const out = proposal(readJson(sw), readJson(tr), data, { route: ri >= 0 ? args[ri + 1] : null });
    console.log(out.text);
  }
}
