'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlertTriangle, ArrowDown, ArrowUp, CalendarRange, Copy, GripVertical, Inbox, MoreHorizontal, Paperclip, Pencil, Trash2 } from 'lucide-react';
import { forwardRef, type CSSProperties, type HTMLAttributes } from 'react';
import { IconButton } from '@/components/ui/Button';
import { Menu, MenuItem, MenuSeparator, SubMenu } from '@/components/ui/Menu';
import { useToast } from '@/components/ui/Toast';
import type { ScheduleWarning } from '@/features/itinerary/conflicts';
import { formatMoney } from '@/features/budget/budget';
import { useTrip } from '@/features/trips/client/TripContext';
import type { Activity, Day } from '@/features/trips/types';
import { formatDuration, journeyMinutes, zoneLabel } from '@/lib/dates';
import { activityColor, activityIcon, BOOKING, SLOTS } from './meta';
import { usePlannerUI } from './planner-state';

export function timeLabel(activity: Activity): string {
  if (activity.kind === 'transport' && activity.transport?.departTime) return activity.transport.departTime;
  if (activity.startTime) return activity.startTime;
  return activity.timeSlot === 'anytime' ? '' : SLOTS[activity.timeSlot];
}

function subtitle(activity: Activity, date: string | null): string | null {
  if (activity.kind === 'transport' && activity.transport) {
    const t = activity.transport;
    const parts = [`${t.from.name} → ${t.to.name}`];
    if (t.departTime && t.arriveTime) {
      const minutes = journeyMinutes({ departDate: date, ...t });
      const zones = t.departTimezone && t.arriveTimezone && zoneLabel(t.departTimezone, date) !== zoneLabel(t.arriveTimezone, date) ? ` (${zoneLabel(t.arriveTimezone, date)})` : '';
      parts.push(`arrive ${t.arriveTime}${t.arriveDayOffset ? ` +${t.arriveDayOffset}d` : ''}${zones}${minutes ? ` · ${formatDuration(minutes)}` : ''}`);
    }
    if (t.operator || t.serviceNumber) parts.push([t.operator, t.serviceNumber].filter(Boolean).join(' '));
    return parts.join(' · ');
  }
  const parts = [activity.place && activity.place.name !== activity.title ? activity.place.name : null, formatDuration(activity.durationMinutes)].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

type CardProps = {
  activity: Activity;
  day: Day | null;
  days: Day[];
  index: number;
  count: number;
  warnings: ScheduleWarning[];
  attachments: number;
  selected: boolean;
  dragging?: boolean;
  overlay?: boolean;
  handleProps?: HTMLAttributes<HTMLButtonElement>;
  style?: CSSProperties;
};

export const ActivityCardView = forwardRef<HTMLLIElement, CardProps>(function ActivityCardView({ activity, day, days, index, count, warnings, attachments, selected, dragging, overlay, handleProps, style }, ref) {
  const { run, canEdit, view } = useTrip();
  const ui = usePlannerUI();
  const toast = useToast();
  const Icon = activityIcon(activity);
  const booking = BOOKING[activity.bookingStatus];
  const located = typeof activity.place?.lat === 'number';
  const sub = subtitle(activity, day?.date ?? null);
  const worst = warnings.find((warning) => warning.level === 'conflict') ?? warnings[0];

  const open = () => {
    ui.select({ type: 'activity', id: activity.id });
    ui.openEditor({ type: 'activity', id: activity.id });
  };
  const moveTo = (dayId: string | null) => run({ type: 'activity.move', activityId: activity.id, dayId, index: 999 }, { label: `Move ${activity.title}` });
  const remove = () => {
    if (!run({ type: 'activity.remove', activityId: activity.id }, { label: `Delete ${activity.title}` })) return;
    toast({ message: `Deleted “${activity.title}”.`, action: { label: 'Undo', onClick: () => undoLast() } });
  };
  const { sync } = useTrip();
  const undoLast = () => sync.undo();
  const duplicate = () => {
    const copy = { ...activity, id: crypto.randomUUID(), title: `${activity.title} (copy)`, bookingReference: null, bookingStatus: activity.bookingStatus === 'booked' ? 'planned' as const : activity.bookingStatus };
    const { sortOrder: _sortOrder, ...fields } = copy;
    void _sortOrder;
    run({ type: 'activity.add', activity: fields, index: index + 1 }, { label: `Duplicate ${activity.title}` });
  };

  return (
    <li ref={ref} style={style} data-activity-id={activity.id}
      className={`activity${selected ? ' is-selected' : ''}${dragging ? ' is-dragging' : ''}${overlay ? ' is-overlay' : ''}${activity.bookingStatus === 'cancelled' ? ' is-cancelled' : ''}${activity.kind === 'note' ? ' is-note' : ''}`}>
      {canEdit ? (
        <button type="button" className="activity-handle" aria-label={`Drag to reorder ${activity.title}. Press space to pick up, arrow keys to move.`} {...handleProps}>
          <GripVertical size={16} aria-hidden />
        </button>
      ) : <span className="activity-handle-spacer" />}
      <span className="activity-time tabular">{timeLabel(activity)}</span>
      <span className="activity-icon" style={{ color: activityColor(activity), background: `color-mix(in srgb, ${activityColor(activity)} 13%, white)` }} aria-hidden>
        <Icon size={16} />
      </span>
      <button type="button" className="activity-body" onClick={open} onMouseEnter={() => located && ui.select({ type: 'activity', id: activity.id })}>
        <span className="activity-title">{activity.title}</span>
        {sub ? <span className="activity-sub">{sub}</span> : null}
        <span className="activity-meta">
          {booking.badge ? <span className={`badge ${booking.badge}`}>{booking.label}</span> : null}
          {activity.cost ? <span className="activity-cost tabular">{formatMoney(activity.cost, activity.currency)}</span> : null}
          {attachments ? <span className="activity-attach" title={`${attachments} attached ${attachments === 1 ? 'file' : 'files'}`}><Paperclip size={12} aria-hidden />{attachments}</span> : null}
          {worst ? <span className={`activity-warning is-${worst.level}`} title={worst.message}><AlertTriangle size={12} aria-hidden /><span className="visually-hidden">{worst.message}</span>{worst.level === 'conflict' ? 'Conflict' : 'Check'}</span> : null}
          {activity.kind === 'place' && activity.place && !located ? <span className="activity-unlocated" title="Not on the map — add a location">No location</span> : null}
        </span>
      </button>
      {canEdit && !overlay ? (
        <Menu label={`Options for ${activity.title}`} trigger={<IconButton size="sm" label={`Options for ${activity.title}`} className="activity-more"><MoreHorizontal size={16} /></IconButton>}>
          <MenuItem icon={<Pencil size={16} />} onSelect={open}>Edit</MenuItem>
          <SubMenu label="Move to day" icon={<CalendarRange size={16} />}>
            {days.map((target) => (
              <MenuItem key={target.id} disabled={target.id === activity.dayId} onSelect={() => moveTo(target.id)}>
                Day {target.number}{target.date ? ` · ${target.date.slice(5)}` : ''}{target.destinationId ? ` · ${view.destinations.find((destination) => destination.id === target.destinationId)?.name ?? ''}` : ''}
              </MenuItem>
            ))}
          </SubMenu>
          {activity.dayId ? <MenuItem icon={<Inbox size={16} />} onSelect={() => moveTo(null)}>Move to Ideas</MenuItem> : null}
          <MenuItem icon={<ArrowUp size={16} />} disabled={index === 0} onSelect={() => run({ type: 'activity.move', activityId: activity.id, dayId: activity.dayId, index: index - 1 }, { label: `Move ${activity.title} up` })}>Move up</MenuItem>
          <MenuItem icon={<ArrowDown size={16} />} disabled={index >= count - 1} onSelect={() => run({ type: 'activity.move', activityId: activity.id, dayId: activity.dayId, index: index + 1 }, { label: `Move ${activity.title} down` })}>Move down</MenuItem>
          <MenuItem icon={<Copy size={16} />} onSelect={duplicate}>Duplicate</MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Trash2 size={16} />} danger onSelect={remove}>Delete</MenuItem>
        </Menu>
      ) : null}
    </li>
  );
});

export function SortableActivityCard(props: Omit<CardProps, 'handleProps' | 'style' | 'dragging'>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.activity.id, data: { type: 'activity' } });
  return (
    <ActivityCardView ref={setNodeRef} {...props} dragging={isDragging}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      handleProps={{ ...attributes, ...listeners }} />
  );
}
