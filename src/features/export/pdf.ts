import { budgetSummary, formatMoney } from '@/features/budget/budget';
import { activitiesForDay, orderedDestinations, stayNights, tripEnd } from '@/features/trips/selectors';
import type { TripAggregate } from '@/features/trips/types';
import { formatDateRange, formatDayLabel, formatDuration } from '@/lib/dates';

// Printable PDF itinerary, generated in the browser (jsPDF is loaded on
// demand). The built-in PDF fonts cover Latin text only, so other scripts
// are transliterated to "?" — the in-app view remains the full record.

type Rgb = [number, number, number];
const INK: Rgb = [27, 37, 32];
const GREEN: Rgb = [31, 77, 58];
const MUTED: Rgb = [95, 108, 101];
const TERRACOTTA: Rgb = [181, 85, 45];

const clean = (value: string) => value
  .replace(/[–—]/g, '-').replace(/→/g, '->').replace(/[·•]/g, '|').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e\n]/g, '?');

export async function exportTripPdf(aggregate: TripAggregate): Promise<void> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const margin = 16;
  const width = 210 - margin * 2;
  const { trip } = aggregate;
  const end = tripEnd(aggregate);
  const budget = budgetSummary(aggregate);
  const nights = stayNights(aggregate);
  const destinations = orderedDestinations(aggregate);
  const money = (value: number | null) => clean(formatMoney(value, trip.currency));

  doc.setFillColor(...GREEN);
  doc.rect(0, 0, 210, 52, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('times', 'bold');
  doc.setFontSize(28);
  doc.text(clean(trip.name), margin, 26, { maxWidth: width });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(clean(`${trip.dateMode === 'fixed' ? formatDateRange(trip.startDate, end) : 'Flexible dates'}  |  ${aggregate.days.length} days  |  ${trip.travellers} ${trip.travellers === 1 ? 'traveller' : 'travellers'}`), margin, 38);
  doc.setFontSize(9);
  doc.text(clean(destinations.map((destination) => destination.name).join('  ->  ') || 'No destinations yet'), margin, 46, { maxWidth: width });

  let y = 64;
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  const tiles: [string, string][] = [['Planned', money(budget.planned)], ['Confirmed', money(budget.confirmed)], ['Budget', budget.budget === null ? 'Not set' : money(budget.budget)]];
  tiles.forEach(([label, value], index) => {
    const x = margin + index * (width / 3);
    doc.setTextColor(...MUTED); doc.setFontSize(8); doc.text(label.toUpperCase(), x, y);
    doc.setTextColor(...INK); doc.setFontSize(14); doc.text(value, x, y + 7);
  });
  y += 18;

  for (const day of aggregate.days) {
    const destination = destinations.find((item) => item.id === day.destinationId);
    const rows = activitiesForDay(aggregate, day.id).filter((activity) => activity.bookingStatus !== 'cancelled').map((activity) => {
      const time = activity.kind === 'transport' ? activity.transport?.departTime ?? '' : activity.startTime ?? (activity.timeSlot === 'anytime' ? '' : activity.timeSlot);
      const what = activity.kind === 'transport' && activity.transport
        ? `${activity.title}\n${activity.transport.from.name} -> ${activity.transport.to.name}${activity.transport.arriveTime ? `, arrive ${activity.transport.arriveTime}` : ''}${activity.transport.serviceNumber ? ` (${activity.transport.serviceNumber})` : ''}`
        : `${activity.title}${activity.place && activity.place.name !== activity.title ? `\n${activity.place.address ?? activity.place.name}` : ''}`;
      const details = [activity.durationMinutes ? formatDuration(activity.durationMinutes) : '', activity.bookingStatus === 'booked' ? `Booked${activity.bookingReference ? ` ${activity.bookingReference}` : ''}` : activity.bookingStatus === 'planned' ? 'To book' : ''].filter(Boolean).join('\n');
      return [clean(time), clean(what), clean(details), activity.cost ? clean(formatMoney(activity.cost, activity.currency)) : ''];
    });
    const stay = nights.get(day.id)?.[0];
    if (stay) rows.push(['Night', clean(`${stay.stay.name}${stay.stay.place?.address ? `\n${stay.stay.place.address}` : ''}`), clean(`Night ${stay.night} of ${stay.nights}${stay.stay.bookingReference ? `\nRef ${stay.stay.bookingReference}` : ''}`), '']);
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFillColor(...(destination ? GREEN : MUTED));
    doc.roundedRect(margin, y, width, 10, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(clean(`Day ${day.number}${day.date ? ` | ${formatDayLabel(day.date)}` : ''}${destination ? ` | ${destination.name}` : ''}${day.title ? ` - ${day.title}` : ''}`), margin + 4, y + 6.6, { maxWidth: width - 8 });
    y += 12;
    if (!rows.length) {
      doc.setTextColor(...MUTED); doc.setFont('helvetica', 'italic'); doc.setFontSize(9);
      doc.text('Nothing planned yet.', margin + 2, y + 4);
      y += 10;
      continue;
    }
    autoTable(doc, {
      startY: y, margin: { left: margin, right: margin }, body: rows, theme: 'plain',
      styles: { font: 'helvetica', fontSize: 8.5, textColor: INK, cellPadding: 1.8, overflow: 'linebreak' },
      columnStyles: { 0: { cellWidth: 18, textColor: TERRACOTTA, fontStyle: 'bold' }, 1: { cellWidth: 104 }, 2: { cellWidth: 36, textColor: MUTED }, 3: { cellWidth: 20, halign: 'right' } },
      alternateRowStyles: { fillColor: [246, 243, 236] },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  if (trip.notes.trim()) {
    doc.addPage();
    doc.setTextColor(...INK); doc.setFont('times', 'bold'); doc.setFontSize(16); doc.text('Trip notes', margin, 22);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text(doc.splitTextToSize(clean(trip.notes), width), margin, 32);
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text(clean(`${trip.name} | TripCanvas`), margin, 290);
    doc.text(`${page} / ${pages}`, 210 - margin, 290, { align: 'right' });
  }
  const safe = trip.name.replace(/[\\/:*?"<>|]/g, '').trim() || 'trip';
  doc.save(`${safe} - itinerary.pdf`);
}
