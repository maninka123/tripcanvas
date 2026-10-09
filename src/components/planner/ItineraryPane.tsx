'use client';

import {
  closestCorners, DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDroppable, useSensor, useSensors, type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { AlertTriangle, BedDouble, ChevronDown, Inbox, LogOut, MoreHorizontal, Pencil, Plus, StickyNote, Trash2, TrainFront } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button, IconButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Field';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/Menu';
import { budgetSummary, formatMoney } from '@/features/budget/budget';
import { scheduleWarnings, type ScheduleWarning } from '@/features/itinerary/conflicts';
import { useTrip } from '@/features/trips/client/TripContext';
import { activitiesForDay, checkOutsByDay, orderedDestinations, stayNights } from '@/features/trips/selectors';
import type { Activity, Day, Destination } from '@/features/trips/types';
import { formatDayLabel } from '@/lib/dates';
import { ActivityCardView, SortableActivityCard } from './ActivityCard';
import { DestinationTimeline } from './DestinationTimeline';
import { usePlannerUI } from './planner-state';

const IDEAS = 'ideas';

export function ItineraryPane() {
  const { view: aggregate, run, canEdit } = useTrip();
  const ui = usePlannerUI();
  const warnings = useMemo(() => scheduleWarnings(aggregate), [aggregate]);
  const budget = useMemo(() => budgetSummary(aggregate), [aggregate]);
  const nights = useMemo(() => stayNights(aggregate), [aggregate]);
  const checkOuts = useMemo(() => checkOutsByDay(aggregate), [aggregate]);
  const destinations = orderedDestinations(aggregate);

  // ---- drag and drop across days and Ideas ----
  const containers = useMemo(() => {
    const result: Record<string, string[]> = { [IDEAS]: aggregate.activities.filter((activity) => activity.dayId === null).sort((a, b) => a.sortOrder - b.sortOrder).map((activity) => activity.id) };
    for (const day of aggregate.days) result[day.id] = activitiesForDay(aggregate, day.id).map((activity) => activity.id);
    return result;
  }, [aggregate]);
  const [preview, setPreview] = useState<Record<string, string[]> | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const lists = preview ?? containers;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const findContainer = (id: string, source = lists) => (id in source ? id : Object.keys(source).find((key) => source[key].includes(id)));

  const onDragStart = ({ active }: DragStartEvent) => { setActiveId(String(active.id)); setPreview(containers); };
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over || !preview) return;
    const from = findContainer(String(active.id), preview);
    const to = findContainer(String(over.id), preview);
    if (!from || !to || from === to) return;
    setPreview((current) => {
      if (!current) return current;
      const source = current[from].filter((id) => id !== active.id);
      const target = [...current[to]];
      const overIndex = target.indexOf(String(over.id));
      target.splice(overIndex >= 0 ? overIndex : target.length, 0, String(active.id));
      return { ...current, [from]: source, [to]: target };
    });
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const id = String(active.id);
    const current = preview ?? containers;
    setActiveId(null);
    setPreview(null);
    if (!over) return;
    const container = findContainer(id, current);
    if (!container) return;
    let list = current[container];
    const overIndex = list.indexOf(String(over.id));
    const fromIndex = list.indexOf(id);
    if (overIndex >= 0 && overIndex !== fromIndex) list = arrayMove(list, fromIndex, overIndex);
    const index = list.indexOf(id);
    const activity = aggregate.activities.find((item) => item.id === id);
    if (!activity) return;
    const targetDayId = container === IDEAS ? null : container;
    const originalIndex = containers[activity.dayId ?? IDEAS].indexOf(id);
    if (targetDayId === activity.dayId && index === originalIndex) return;
    const day = aggregate.days.find((item) => item.id === targetDayId);
    run({ type: 'activity.move', activityId: id, dayId: targetDayId, index }, { label: `Move ${activity.title}${day ? ` to day ${day.number}` : ' to Ideas'}` });
  };

  const warningsByItem = useMemo(() => {
    const map = new Map<string, ScheduleWarning[]>();
    for (const warning of warnings) for (const id of warning.itemIds) map.set(id, [...(map.get(id) ?? []), warning]);
    return map;
  }, [warnings]);
  const attachmentsByItem = useMemo(() => {
    const map = new Map<string, number>();
    for (const attachment of aggregate.attachments) if (attachment.activityId) map.set(attachment.activityId, (map.get(attachment.activityId) ?? 0) + 1);
    return map;
  }, [aggregate.attachments]);

  // A deep link such as ?day=8 opens with that day in view.
  useEffect(() => {
    if (!ui.dayNumber) return;
    const day = aggregate.days.find((item) => item.number === ui.dayNumber);
    if (day) document.getElementById(`day-${day.id}`)?.scrollIntoView({ block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on first render
  }, []);

  // Scroll a card into view when it is selected from the map.
  useEffect(() => {
    if (!ui.scrollRequest) return;
    document.querySelector(`[data-activity-id="${CSS.escape(ui.scrollRequest.id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [ui.scrollRequest]);

  const activeActivity = activeId ? aggregate.activities.find((activity) => activity.id === activeId) ?? null : null;
  const byId = new Map(aggregate.activities.map((activity) => [activity.id, activity]));
  const cardProps = (activity: Activity, day: Day | null, index: number, count: number) => ({
    activity, day, days: aggregate.days, index, count,
    warnings: warningsByItem.get(activity.id) ?? [], attachments: attachmentsByItem.get(activity.id) ?? 0,
    selected: ui.selection?.type === 'activity' && ui.selection.id === activity.id,
  });

  return (
    <section className="itinerary-pane" aria-label="Itinerary">
      <DestinationTimeline />
      <WarningsSummary warnings={warnings} />
      {aggregate.destinations.length === 0 && aggregate.activities.length === 0 ? (
        <div className="card itinerary-empty">
          <EmptyState icon={<Plus size={24} />} title="Add your first destination" headingLevel={3}>
            <p>Use <strong>Add your first destination</strong> above. Days are split between destinations, and you can change how many days each one gets.</p>
          </EmptyState>
        </div>
      ) : null}
      <DayStrip />
      <DndContext id="itinerary-dnd" sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { setActiveId(null); setPreview(null); }}
        accessibility={{ screenReaderInstructions: { draggable: 'To move a plan, press space or enter to pick it up, use the arrow keys to move it, and press space or enter again to drop it. Press escape to cancel. You can also use the plan’s options menu to move it to another day.' } }}>
        <IdeasSection ids={lists[IDEAS] ?? []} byId={byId} cardProps={cardProps} destinations={destinations} />
        <ol className="day-list" aria-label="Days">
          {aggregate.days.map((day) => (
            <DaySection key={day.id} day={day} ids={lists[day.id] ?? []} byId={byId} cardProps={cardProps}
              destination={destinations.find((destination) => destination.id === day.destinationId) ?? null}
              stays={nights.get(day.id) ?? []} checkOuts={checkOuts.get(day.id) ?? []}
              total={budget.byDay.get(day.id) ?? 0} currency={aggregate.trip.currency}
              dayWarnings={warnings.filter((warning) => warning.dayId === day.id && warning.itemIds.length === 0)} canEdit={canEdit} />
          ))}
        </ol>
        <DragOverlay dropAnimation={null}>
          {activeActivity ? <ul className="activity-list"><ActivityCardView {...cardProps(activeActivity, null, 0, 1)} overlay /></ul> : null}
        </DragOverlay>
      </DndContext>
      {canEdit && aggregate.days.length ? (
        <div className="itinerary-footer">
          <Button variant="ghost" icon={<Plus size={16} />} onClick={() => run({ type: 'trip.setDates', dateMode: aggregate.trip.dateMode, startDate: aggregate.trip.startDate, dayCount: aggregate.days.length + 1 }, { label: 'Add a day' })}>Add a day at the end</Button>
        </div>
      ) : null}
    </section>
  );
}

function WarningsSummary({ warnings }: { warnings: ScheduleWarning[] }) {
  const [open, setOpen] = useState(false);
  const ui = usePlannerUI();
  const conflicts = warnings.filter((warning) => warning.level === 'conflict');
  const others = warnings.filter((warning) => warning.level !== 'conflict');
  if (!warnings.length) return null;
  return (
    <div className={`warnings${conflicts.length ? ' has-conflicts' : ''}`}>
      <button type="button" className="warnings-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <AlertTriangle size={16} aria-hidden />
        <span className="spacer">
          {conflicts.length ? <strong>{conflicts.length} {conflicts.length === 1 ? 'conflict' : 'conflicts'}</strong> : null}
          {conflicts.length && others.length ? ' · ' : ''}
          {others.length ? `${others.length} ${others.length === 1 ? 'thing' : 'things'} to check` : ''}
        </span>
        <ChevronDown size={16} aria-hidden style={{ transform: open ? 'rotate(180deg)' : undefined }} />
      </button>
      {open ? (
        <ul className="warnings-list">
          {[...conflicts, ...others].map((warning) => (
            <li key={warning.id} className={`is-${warning.level}`}>
              <span className="badge">{warning.level === 'conflict' ? 'Conflict' : warning.level === 'warning' ? 'Check' : 'Tip'}</span>
              <button type="button" className="link-button" onClick={() => {
                const id = warning.itemIds[0];
                if (id && warning.kind !== 'missing-transport' && warning.kind !== 'stay-overlap' && warning.kind !== 'empty-destination') ui.select({ type: 'activity', id }, { scroll: true });
                else if (warning.dayId) document.getElementById(`day-${warning.dayId}`)?.scrollIntoView({ behavior: 'smooth' });
              }}>{warning.message}</button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function DayStrip() {
  const { view: aggregate } = useTrip();
  const ui = usePlannerUI();
  if (aggregate.days.length < 2) return null;
  const destinations = new Map(aggregate.destinations.map((destination) => [destination.id, destination]));
  return (
    <nav className="day-strip" aria-label="Jump to day">
      {aggregate.days.map((day) => {
        const destination = day.destinationId ? destinations.get(day.destinationId) : null;
        return (
          <button key={day.id} type="button" className="day-pill" aria-current={ui.dayNumber === day.number ? 'true' : undefined}
            style={{ '--dest': destination?.color ?? 'var(--line-strong)' } as React.CSSProperties}
            onClick={() => { ui.setDayNumber(day.number); document.getElementById(`day-${day.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
            <strong>{day.number}</strong>
            <span>{day.date ? formatDayLabel(day.date).split(' ').slice(0, 2).join(' ') : destination?.name.slice(0, 8) ?? 'Day'}</span>
          </button>
        );
      })}
    </nav>
  );
}

type CardPropsFactory = (activity: Activity, day: Day | null, index: number, count: number) => Parameters<typeof SortableActivityCard>[0];

function IdeasSection({ ids, byId, cardProps, destinations }: { ids: string[]; byId: Map<string, Activity>; cardProps: CardPropsFactory; destinations: Destination[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: IDEAS });
  const ui = usePlannerUI();
  const { canEdit } = useTrip();
  const [open, setOpen] = useState(true);
  const ideas = ids.map((id) => byId.get(id)).filter((activity): activity is Activity => !!activity);
  const grouped = destinations.filter((destination) => ideas.some((idea) => idea.destinationId === destination.id));
  return (
    <section className={`ideas${isOver ? ' is-over' : ''}`} aria-labelledby="ideas-title">
      <div className="ideas-head">
        <button type="button" className="ideas-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Inbox size={16} aria-hidden /><h2 id="ideas-title">Ideas</h2><span className="badge">{ideas.length}</span>
          <ChevronDown size={16} aria-hidden style={{ transform: open ? undefined : 'rotate(-90deg)' }} />
        </button>
        <span className="spacer" />
        {canEdit ? <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => ui.openAdd({ dayId: null, mode: 'place' })}>Save an idea</Button> : null}
      </div>
      {open ? (
        <SortableContext id={IDEAS} items={ids} strategy={verticalListSortingStrategy}>
          <ul ref={setNodeRef} className="activity-list ideas-list">
            {ideas.length === 0 ? <li className="drop-hint">Places you might visit. Drag them into a day when you decide.</li> : null}
            {ideas.map((activity, index) => (
              <SortableActivityCard key={activity.id} {...cardProps(activity, null, index, ideas.length)} />
            ))}
          </ul>
          {grouped.length > 1 ? <p className="tiny subtle" style={{ padding: '0 var(--space-3)' }}>Ideas are tagged with their destination: {grouped.map((destination) => destination.name).join(', ')}.</p> : null}
        </SortableContext>
      ) : null}
    </section>
  );
}

function DaySection({ day, ids, byId, cardProps, destination, stays, checkOuts, total, currency, dayWarnings, canEdit }: {
  day: Day; ids: string[]; byId: Map<string, Activity>; cardProps: CardPropsFactory; destination: Destination | null;
  stays: ReturnType<typeof stayNights> extends Map<string, infer V> ? V : never; checkOuts: { id: string; name: string; checkOutTime: string | null }[];
  total: number; currency: string; dayWarnings: ScheduleWarning[]; canEdit: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: day.id });
  const { run } = useTrip();
  const ui = usePlannerUI();
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(day.title);
  const activities = ids.map((id) => byId.get(id)).filter((activity): activity is Activity => !!activity);
  const selected = ui.dayNumber === day.number;

  const saveTitle = () => {
    setEditingTitle(false);
    if (title.trim() !== day.title) run({ type: 'day.update', dayId: day.id, patch: { title: title.trim() } }, { label: `Rename day ${day.number}` });
  };

  return (
    <li id={`day-${day.id}`} className={`day${selected ? ' is-selected' : ''}${isOver ? ' is-over' : ''}`} style={{ '--dest': destination?.color ?? 'var(--line-strong)' } as React.CSSProperties} aria-labelledby={`day-title-${day.id}`}>
      <span id={`day-${day.number}`} className="day-anchor" />
      <header className="day-head" onClick={(event) => { if ((event.target as HTMLElement).closest('button, input, a')) return; ui.setDayNumber(day.number); }}>
        <button type="button" className="day-badge" onClick={() => ui.setDayNumber(day.number)} aria-label={`Show day ${day.number} on the map`}>
          <span>Day</span><strong>{day.number}</strong>
        </button>
        <div className="day-heading">
          <h3 id={`day-title-${day.id}`} className="day-title">
            <span className="day-date">{day.date ? formatDayLabel(day.date) : `Day ${day.number}`}</span>
            <span className="day-dest">{destination ? destination.name : 'No destination'}</span>
          </h3>
          {editingTitle ? (
            <input className="input input-inline day-subtitle-input" value={title} autoFocus maxLength={160} aria-label={`Title for day ${day.number}`} placeholder="Give this day a title"
              onChange={(event) => setTitle(event.target.value)} onBlur={saveTitle} onKeyDown={(event) => { if (event.key === 'Enter') saveTitle(); if (event.key === 'Escape') { setTitle(day.title); setEditingTitle(false); } }} />
          ) : day.title ? <p className="day-subtitle">{day.title}</p> : null}
        </div>
        {total > 0 ? <span className="day-total tabular" title="Planned spend this day">{formatMoney(total, currency, { compact: true })}</span> : null}
        {canEdit ? (
          <Menu label={`Day ${day.number} options`} trigger={<IconButton size="sm" label={`Day ${day.number} options`}><MoreHorizontal size={16} /></IconButton>}>
            <MenuItem icon={<Pencil size={16} />} onSelect={() => { setTitle(day.title); setEditingTitle(true); }}>{day.title ? 'Rename day' : 'Add a title'}</MenuItem>
            <MenuItem icon={<StickyNote size={16} />} onSelect={() => ui.openAdd({ dayId: day.id, mode: 'note' })}>Add a note</MenuItem>
            <MenuItem icon={<TrainFront size={16} />} onSelect={() => ui.openAdd({ dayId: day.id, mode: 'transport' })}>Add transport</MenuItem>
            <MenuItem icon={<BedDouble size={16} />} onSelect={() => ui.openAdd({ dayId: day.id, mode: 'stay' })}>Add accommodation</MenuItem>
            <MenuSeparator />
            <MenuItem icon={<Trash2 size={16} />} danger onSelect={() => run({ type: 'day.remove', dayId: day.id }, { label: `Remove day ${day.number}` })}>Remove this day</MenuItem>
          </Menu>
        ) : null}
      </header>
      {dayWarnings.map((warning) => <p key={warning.id} className="day-note"><AlertTriangle size={14} aria-hidden />{warning.message}</p>)}
      {checkOuts.map((stay) => (
        <button key={`out-${stay.id}`} type="button" className="stay-row is-checkout" onClick={() => ui.openEditor({ type: 'stay', id: stay.id })}>
          <LogOut size={15} aria-hidden /> Check out of <strong>{stay.name}</strong>{stay.checkOutTime ? ` by ${stay.checkOutTime}` : ''}
        </button>
      ))}
      <SortableContext id={day.id} items={ids} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className="activity-list">
          {activities.length === 0 ? <li className="drop-hint">{canEdit ? 'Nothing planned yet — add a place or drag an idea here.' : 'Nothing planned.'}</li> : null}
          {activities.map((activity, index) => <SortableActivityCard key={activity.id} {...cardProps(activity, day, index, activities.length)} />)}
        </ul>
      </SortableContext>
      {stays.map(({ stay, night, nights, isCheckIn }) => (
        <button key={stay.id} type="button" className="stay-row" onClick={() => ui.openEditor({ type: 'stay', id: stay.id })}>
          <BedDouble size={15} aria-hidden />
          <span className="spacer truncate">{isCheckIn ? 'Check in · ' : ''}<strong>{stay.name}</strong></span>
          <span className="tiny subtle">Night {night} of {nights}</span>
          {stay.bookingStatus === 'booked' ? <span className="badge badge-success">Booked</span> : stay.bookingStatus === 'planned' ? <span className="badge badge-warning">To book</span> : null}
        </button>
      ))}
      {canEdit ? (
        <div className="day-add">
          <Button size="sm" variant="ghost" icon={<Plus size={15} />} onClick={() => ui.openAdd({ dayId: day.id, mode: 'place' })}>Add place</Button>
          {!stays.length && day.number < 9999 ? <Button size="sm" variant="ghost" icon={<BedDouble size={15} />} onClick={() => ui.openAdd({ dayId: day.id, mode: 'stay' })}>Add stay</Button> : null}
        </div>
      ) : null}
    </li>
  );
}
