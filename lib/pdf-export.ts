import type { Booking, Segment, Trip, TripDay } from './types';
import { categoryTotals, dayTotal } from './travel-calculations';

type PdfInput={trip:Trip;days:TripDay[];segments:Segment[];bookings:Booking[];format:(value:number)=>string};
type PdfDoc=import('jspdf').jsPDF;

const ink:[number,number,number]=[30,58,49];const green:[number,number,number]=[38,83,71];const coral:[number,number,number]=[194,96,75];const cream:[number,number,number]=[246,245,239];const muted:[number,number,number]=[108,125,117];
const clean=(value:string)=>value.replace(/[–—]/g,'-').replace(/→/g,'->').replace(/·/g,'|').replace(/[^ -~]/g,'');
const safeFilename=(value:string)=>value.replace(/[\\/:*?"<>|]/g,'').replace(/\s+/g,' ').trim();

function drawRouteMap(doc:PdfDoc,segments:Segment[],x:number,y:number,w:number,h:number){
  doc.setFillColor(...cream);doc.roundedRect(x,y,w,h,5,5,'F');
  doc.setDrawColor(222,226,219);doc.setLineWidth(.2);
  for(let i=1;i<5;i++){doc.line(x+(w*i/5),y+8,x+(w*i/5),y+h-8);doc.line(x+8,y+(h*i/5),x+w-8,y+(h*i/5))}
  if(!segments.length)return;
  const valid=segments.filter((segment)=>Number.isFinite(segment.latitude)&&Number.isFinite(segment.longitude));
  const minLon=Math.min(...valid.map((s)=>s.longitude));const maxLon=Math.max(...valid.map((s)=>s.longitude));const minLat=Math.min(...valid.map((s)=>s.latitude));const maxLat=Math.max(...valid.map((s)=>s.latitude));
  const points=valid.map((segment,index)=>({segment,index,px:x+13+((segment.longitude-minLon)/(maxLon-minLon||1))*(w-26),py:y+13+(1-(segment.latitude-minLat)/(maxLat-minLat||1))*(h-26)}));
  doc.setDrawColor(...green);doc.setLineWidth(1.2);doc.setLineDashPattern([2,1],0);for(let i=1;i<points.length;i++)doc.line(points[i-1].px,points[i-1].py,points[i].px,points[i].py);doc.setLineDashPattern([],0);
  points.forEach(({segment,index,px,py})=>{doc.setFillColor(index===points.length-1?194:38,index===points.length-1?96:83,index===points.length-1?75:71);doc.circle(px,py,4,'F');doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(8);doc.text(String(index+1),px,py+1,{align:'center'});doc.setTextColor(...ink);doc.setFontSize(8);doc.text(clean(segment.city),px,py+(index%2===0?-6:8),{align:'center'})});
}

export async function exportTripPdf({trip,days,segments,bookings,format}:PdfInput){
  const [{jsPDF},{autoTable}]=await Promise.all([import('jspdf'),import('jspdf-autotable')]);
  const doc=new jsPDF({unit:'mm',format:'a4',compress:true});const pageW=210;const pageH=297;const margin=17;const updated=new Date();const updatedText=updated.toLocaleDateString('en-AU',{day:'numeric',month:'long',year:'numeric'});
  const sectionTitle=(title:string,y:number)=>{doc.setTextColor(...ink);doc.setFont('times','bold');doc.setFontSize(17);doc.text(clean(title),margin,y);doc.setDrawColor(...coral);doc.setLineWidth(.7);doc.line(margin,y+3,margin+18,y+3)};
  const addPage=()=>{doc.addPage();doc.setFillColor(...cream);doc.rect(0,0,pageW,pageH,'F');};
  doc.setFillColor(...green);doc.rect(0,0,pageW,68,'F');doc.setTextColor(238,170,97);doc.setFont('helvetica','bold');doc.setFontSize(10);doc.text(clean(`${trip.status.toUpperCase()}  |  UPDATED ${updatedText.toUpperCase()}`),margin,18);doc.setTextColor(255,255,255);doc.setFont('times','bold');doc.setFontSize(34);doc.text(clean(trip.name),margin,36);doc.setFont('helvetica','normal');doc.setFontSize(11);doc.text(clean(`${trip.dates}  |  ${trip.duration} days  |  ${trip.travellers.join(', ')}`),margin,49);doc.setFontSize(9);doc.setTextColor(188,210,202);doc.text(clean(trip.route),margin,59,{maxWidth:175});
  doc.setFillColor(...cream);doc.rect(0,68,pageW,pageH-68,'F');sectionTitle('Journey map',84);drawRouteMap(doc,segments,margin,92,176,62);
  const totals=categoryTotals(days);const cards=[['BUDGET',format(trip.budget)],['PLANNED',format(trip.planned)],['REMAINING',format(trip.budget-trip.planned)],['PAID',format(trip.paid)]];cards.forEach(([label,value],index)=>{const x=margin+index*44;doc.setFillColor(255,255,255);doc.roundedRect(x,163,40,22,3,3,'F');doc.setTextColor(...muted);doc.setFont('helvetica','bold');doc.setFontSize(7);doc.text(label,x+4,171);doc.setTextColor(...ink);doc.setFontSize(12);doc.text(clean(value),x+4,180)});
  sectionTitle('Plan at a glance',199);doc.setTextColor(...muted);doc.setFont('helvetica','normal');doc.setFontSize(9);doc.text(clean(`${segments.length} destinations  |  ${days.reduce((sum,day)=>sum+day.events.length,0)} planned items  |  ${bookings.length} bookings`),margin,210);
  if(Object.keys(totals).length){autoTable(doc,{startY:218,margin:{left:margin,right:margin,bottom:18},head:[['Category','Planned amount']],body:Object.entries(totals).map(([category,amount])=>[clean(category),clean(format(amount))]),theme:'plain',styles:{font:'helvetica',fontSize:8.5,textColor:ink,cellPadding:2},headStyles:{fillColor:green,textColor:[255,255,255],fontStyle:'bold'},alternateRowStyles:{fillColor:[238,241,235]},columnStyles:{1:{halign:'right'}},pageBreak:'avoid'})}

  addPage();sectionTitle('Day-by-day itinerary',24);let cursor=35;
  for(const day of days){
    const needed=day.events.length?28+day.events.length*8:28;if(cursor+needed>273){addPage();sectionTitle('Day-by-day itinerary',24);cursor=35}
    doc.setFillColor(...green);doc.roundedRect(margin,cursor,176,13,3,3,'F');doc.setTextColor(255,255,255);doc.setFont('times','bold');doc.setFontSize(12);doc.text(clean(`Day ${day.number} | ${day.date}${day.title?` - ${day.title}`:''}`),margin+5,cursor+8.5);cursor+=16;
    if(!day.events.length){doc.setTextColor(...muted);doc.setFont('helvetica','italic');doc.setFontSize(9);doc.text('Nothing planned yet.',margin+3,cursor+6);cursor+=14;continue}
    autoTable(doc,{startY:cursor,margin:{left:margin,right:margin},head:[['Time','Plan','Type','Cost']],body:day.events.map((event)=>[clean(event.time??'Flexible'),clean(`${event.title}${event.location?` - ${event.location}`:event.origin&&event.destination?` (${event.origin} -> ${event.destination})`:''}`),clean(event.subcategory??event.category),event.estimatedCost?clean(format(event.estimatedCost)):'Free']),theme:'striped',styles:{font:'helvetica',fontSize:8.5,textColor:ink,cellPadding:2.2,overflow:'linebreak'},headStyles:{fillColor:[226,233,228],textColor:ink,fontStyle:'bold'},alternateRowStyles:{fillColor:[248,248,245]},columnStyles:{0:{cellWidth:19},1:{cellWidth:92},2:{cellWidth:38},3:{cellWidth:27,halign:'right'}}});cursor=(doc as PdfDoc&{lastAutoTable:{finalY:number}}).lastAutoTable.finalY+4;doc.setTextColor(...ink);doc.setFont('helvetica','bold');doc.setFontSize(8.5);doc.text(clean(`Day total: ${format(dayTotal(day))}`),193,cursor,{align:'right'});cursor+=9;
  }
  if(bookings.length){addPage();sectionTitle('Bookings and confirmations',24);autoTable(doc,{startY:34,margin:{left:margin,right:margin},head:[['Booking','Provider','Status','Payment','Cost']],body:bookings.map((booking)=>[clean(booking.title),clean(booking.provider??'-'),clean(booking.status),clean(booking.paymentStatus),clean(format(booking.cost))]),theme:'striped',styles:{font:'helvetica',fontSize:9,textColor:ink,cellPadding:3},headStyles:{fillColor:green,textColor:[255,255,255],fontStyle:'bold'},alternateRowStyles:{fillColor:[238,241,235]},columnStyles:{0:{cellWidth:55},1:{cellWidth:35},2:{cellWidth:31},3:{cellWidth:31},4:{cellWidth:24,halign:'right'}}})}
  const totalPages=doc.getNumberOfPages();for(let page=1;page<=totalPages;page++){doc.setPage(page);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(...muted);doc.text(clean(trip.name),margin,pageH-9);doc.text(`${page} / ${totalPages}`,pageW-margin,pageH-9,{align:'right'})}
  const iso=updated.toISOString().slice(0,10);doc.save(`${safeFilename(trip.name)} - Updated ${iso}.pdf`);
}
