'use client';

import type { Segment } from '@/lib/types';

export function DestinationRibbon({ segments, activeId, onSelect }: { segments: Segment[]; activeId: string; onSelect: (id: string) => void }) {
  return (
    <div className="destination-ribbon" aria-label="Trip destinations">
      {segments.map((segment) => {
        const duration = segment.endDay - segment.startDay + 1;
        const dayLabel = duration === 1 ? `Day ${segment.startDay}` : `Days ${segment.startDay}–${segment.endDay}`;
        return (
          <button key={segment.id} type="button" aria-pressed={activeId === segment.id} className={activeId === segment.id ? 'ribbon-segment is-active' : 'ribbon-segment'} style={{ '--segment-color': segment.color, flexGrow: Math.max(duration, 1.25) } as React.CSSProperties} onClick={() => onSelect(segment.id)}>
            <span>{dayLabel}</span><strong>{segment.city}</strong><small>{segment.country}</small><i />
          </button>
        );
      })}
    </div>
  );
}
