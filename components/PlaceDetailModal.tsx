'use client';

import { Clock3, ExternalLink, MapPin, Pencil, Sparkles, X } from 'lucide-react';
import { useEffect } from 'react';

export type PlaceDetail = {
  title: string;
  category: string;
  imageUrl: string;
  imageAlt: string;
  description: string;
  location?: string;
  time?: string;
  status?: string;
  cost?: string;
  highlights?: string[];
  facts?: { label: string; value: string }[];
  sourceUrl?: string;
  sourceLabel?: string;
};

export function PlaceDetailModal({ detail, onClose, onEdit }: { detail: PlaceDetail; onClose: () => void; onEdit?: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', closeOnEscape);
    document.body.classList.add('modal-open');
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.body.classList.remove('modal-open');
    };
  }, [onClose]);

  return <div className="place-modal-backdrop" onMouseDown={onClose}>
    <article className="place-modal" role="dialog" aria-modal="true" aria-labelledby="place-modal-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="place-modal-hero">
        {/* eslint-disable-next-line @next/next/no-img-element -- official and editorial remote images are runtime content */}
        <img src={detail.imageUrl} alt={detail.imageAlt}/>
        <div className="place-modal-shade"/>
        <button className="place-modal-close" type="button" onClick={onClose} aria-label="Close details"><X size={20}/></button>
        <div className="place-modal-heading"><span>{detail.category}</span><h2 id="place-modal-title">{detail.title}</h2>{detail.location&&<p><MapPin size={15}/>{detail.location}</p>}</div>
      </div>
      <div className="place-modal-body">
        {(detail.time||detail.status||detail.cost)&&<div className="place-modal-facts">
          {detail.time&&<div><Clock3 size={17}/><span>When<strong>{detail.time}</strong></span></div>}
          {detail.status&&<div><Sparkles size={17}/><span>Status<strong>{detail.status}</strong></span></div>}
          {detail.cost&&<div><span className="fact-symbol">$</span><span>Estimated<strong>{detail.cost}</strong></span></div>}
        </div>}
        <p className="place-modal-description">{detail.description}</p>
        {detail.highlights?.length?<section><h3>Good to know</h3><ul>{detail.highlights.map((highlight)=><li key={highlight}>{highlight}</li>)}</ul></section>:null}
        {detail.facts?.length?<dl>{detail.facts.map((fact)=><div key={`${fact.label}-${fact.value}`}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>:null}
        <footer>
          {detail.sourceUrl&&<a href={detail.sourceUrl} target="_blank" rel="noreferrer">{detail.sourceLabel??'Official visitor information'} <ExternalLink size={15}/></a>}
          {onEdit&&<button className="primary-button" type="button" onClick={onEdit}><Pencil size={15}/> Edit plan</button>}
        </footer>
      </div>
    </article>
  </div>;
}
