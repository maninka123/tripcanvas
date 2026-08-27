'use client';

import { useMemo, useState } from 'react';
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, horizontalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { RotateCcw, X } from 'lucide-react';
import type { Segment, TripDay } from '@/lib/types';
import { dayTotal } from '@/lib/travel-calculations';
import { useCurrency } from '@/lib/currency';
import { TripMap } from './TripMap';

function BuilderNode({ day, position, onSkip }: { day: TripDay; position: number; onSkip: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: day.id });
  const { format } = useCurrency();
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`builder-node ${isDragging ? 'is-dragging' : ''}`} {...attributes} {...listeners}>
      <button type="button" className="builder-node-skip" onClick={(e) => { e.stopPropagation(); onSkip(day.id); }} aria-label={`Skip ${day.title}`}><X size={12}/></button>
      <small>Scenario day {position}</small>
      <strong>{day.title}</strong>
      <span>Originally day {day.number}</span>
      <em>{format(dayTotal(day))}</em>
    </div>
  );
}

export function TripBuilder({ days, segments }: { days: TripDay[]; segments: Segment[] }) {
  const [order, setOrder] = useState(() => days.map((day) => day.id));
  const { format } = useCurrency();
  const dayById = useMemo(() => new globalThis.Map(days.map((day) => [day.id, day])), [days]);
  const included = order.map((id) => dayById.get(id)).filter((day): day is TripDay => !!day);
  const skipped = days.filter((day) => !order.includes(day.id));

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setOrder((current) => {
      const from = current.indexOf(String(active.id));
      const to = current.indexOf(String(over.id));
      return from < 0 || to < 0 ? current : arrayMove(current, from, to);
    });
  };
  const skipDay = (id: string) => setOrder((current) => current.filter((item) => item !== id));
  const restoreDay = (id: string) => setOrder((current) => [...current, id]);
  const resetAll = () => setOrder(days.map((day) => day.id));

  const orderedSegments = useMemo(() => {
    const result: Segment[] = [];
    for (const day of included) {
      const segment = segments.find((item) => item.id === day.segmentId);
      if (segment && result[result.length - 1]?.id !== segment.id) result.push(segment);
    }
    return result;
  }, [included, segments]);

  const scenarioCost = included.reduce((sum, day) => sum + dayTotal(day), 0);
  const originalCost = days.reduce((sum, day) => sum + dayTotal(day), 0);

  return (
    <div className="trip-builder">
      <div className="view-title">
        <div><p className="eyebrow">TRIP BUILDER</p><h2>Try a different version</h2><p>Drag days to reorder, skip the ones you&apos;d cut, and watch the cost and route change. Nothing here touches your real itinerary.</p></div>
        <button type="button" className="quiet-button" onClick={resetAll}><RotateCcw size={14}/> Reset</button>
      </div>
      <div className="builder-summary">
        <div><span>This scenario</span><strong>{included.length} of {days.length} days</strong></div>
        <div><span>Scenario cost</span><strong>{format(scenarioCost)}</strong></div>
        <div><span>Full trip</span><strong>{days.length} days · {format(originalCost)}</strong></div>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={order} strategy={horizontalListSortingStrategy}>
          <div className="builder-flow">
            {included.map((day, index) => (
              <div className="builder-flow-item" key={day.id}>
                <BuilderNode day={day} position={index + 1} onSkip={skipDay}/>
                {index < included.length - 1 && <span className="builder-arrow">→</span>}
              </div>
            ))}
            {included.length === 0 && <p className="builder-empty">Every day is skipped — restore one below to start building a scenario.</p>}
          </div>
        </SortableContext>
      </DndContext>
      {skipped.length > 0 && (
        <div className="builder-skipped">
          <p className="eyebrow">SKIPPED — CLICK TO RESTORE</p>
          <div className="builder-skipped-list">
            {skipped.map((day) => <button type="button" key={day.id} onClick={() => restoreDay(day.id)}>+ {day.title} <small>Day {day.number}</small></button>)}
          </div>
        </div>
      )}
      <div className="builder-map-wrap">
        <p className="eyebrow">HOW THIS VERSION CONNECTS</p>
        {orderedSegments.length > 1 ? <TripMap segments={orderedSegments} activeId="" onSelect={() => {}} compact/> : <p className="builder-map-empty">Include at least two different destinations to see a route here.</p>}
      </div>
    </div>
  );
}
