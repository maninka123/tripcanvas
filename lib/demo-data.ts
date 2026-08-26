import type { Booking, SavedPlace, Segment, Trip, TripDay } from './types';

export const demoTrips: Trip[] = [
  { id:'japan', name:'Japan in Spring', dates:'12–26 May 2027', startDate:'2027-05-12', endDate:'2027-05-26', duration:15, route:'Tokyo → Koyasan → Kyoto → Osaka → Onomichi → Hiroshima', countries:['Japan'], status:'Planning', budget:7000, planned:6340, paid:3820, progress:78, travellers:['Pasindu'], cover:'japan' },
  { id:'alpine', name:'The Alpine Arc', dates:'5–25 Sep 2027', startDate:'2027-09-05', endDate:'2027-09-25', duration:21, route:'Milan → Lucerne → Paris', countries:['Italy','Switzerland','France'], status:'Idea', budget:9200, planned:3180, paid:1200, progress:35, travellers:['Pasindu','Maya'], cover:'alps' },
  { id:'great-ocean', name:'Great Ocean Road', dates:'14–17 Nov 2026', startDate:'2026-11-14', endDate:'2026-11-17', duration:4, route:'Melbourne → Lorne → Port Campbell', countries:['Australia'], status:'Booked', budget:1800, planned:1620, paid:1410, progress:90, travellers:['Pasindu','Alex','Sam'], cover:'coast' },
];

export const japanSegments: Segment[] = [
  { id:'tokyo', city:'Tokyo', country:'Japan', startDay:1, endDay:4, color:'#c85f49', latitude:35.6762, longitude:139.6503 },
  { id:'koyasan', city:'Koyasan', country:'Japan', startDay:5, endDay:5, color:'#a17c53', latitude:34.2125, longitude:135.586 },
  { id:'kyoto', city:'Kyoto', country:'Japan', startDay:6, endDay:7, color:'#617c55', latitude:35.0116, longitude:135.7681 },
  { id:'osaka', city:'Osaka', country:'Japan', startDay:8, endDay:9, color:'#3f777c', latitude:34.6937, longitude:135.5023 },
  { id:'onomichi', city:'Onomichi', country:'Japan', startDay:10, endDay:11, color:'#5d7094', latitude:34.4089, longitude:133.2049 },
  { id:'hiroshima', city:'Hiroshima', country:'Japan', startDay:12, endDay:15, color:'#805c87', latitude:34.3853, longitude:132.4553 },
];

export const japanDays: TripDay[] = [
  { id:'day-5', number:5, date:'Monday, 16 May', title:'Tokyo → Koyasan', segmentId:'koyasan', events:[
    { id:'e-1', dayId:'day-5', title:'Tokyo Station → Shin-Osaka', category:'Transport', subcategory:'High-speed train', time:'07:30', timePrecision:'exact', origin:'Tokyo Station', destination:'Shin-Osaka', transportMode:'high_speed_train', provider:'JR Central', serviceNumber:'Nozomi 209', duration:'3h 05m', estimatedCost:194, currency:'AUD', bookingStatus:'Need to Book', paymentStatus:'Not Paid', description:'Green Car · Seat preference: window', links:[{ title:'Book with SmartEX', url:'https://smart-ex.jp/en/', type:'Ticket', description:'Official booking site for this train' }], sortOrder:0 },
    { id:'e-2', dayId:'day-5', title:'Namba → Gokurakubashi', category:'Transport', subcategory:'Train', time:'12:00', timePrecision:'approximate', origin:'Namba', destination:'Gokurakubashi', transportMode:'train', provider:'Nankai Railway', duration:'1h 35m', estimatedCost:22, currency:'AUD', bookingStatus:'Not Required', paymentStatus:'Not Paid', sortOrder:1 },
    { id:'e-3', dayId:'day-5', title:'Eko-in Temple Stay', category:'Accommodation', subcategory:'Temple stay', time:'14:30', timePrecision:'exact', location:'Eko-in, Koyasan', latitude:34.2142, longitude:135.5901, description:'Traditional room with dinner and breakfast included.', details:['Dinner included','Breakfast included','Morning Buddhist service','Meditation'], estimatedCost:210, currency:'AUD', bookingStatus:'Booked', paymentStatus:'Paid', links:[{ title:'Eko-in official information', url:'https://www.ekoin.jp/en/', type:'Official Website', description:'Property details, access and guest information' }], sortOrder:2 },
    { id:'e-4', dayId:'day-5', title:'Okunoin Night Tour', category:'Attraction', subcategory:'Guided tour', time:'18:45', timePrecision:'exact', location:'Okunoin Cemetery', latitude:34.2163, longitude:135.6031, duration:'1h 20m', estimatedCost:60, currency:'AUD', bookingStatus:'Need to Book', paymentStatus:'Not Paid', links:[{ title:'Reserve night tour', url:'https://www.koyasan.or.jp/english/', type:'Booking', description:'Tour availability and reservation details' }], sortOrder:3 },
  ]},
  { id:'day-6', number:6, date:'Tuesday, 17 May', title:'First light in Kyoto', segmentId:'kyoto', events:[
    { id:'e-5', dayId:'day-6', title:'Koyasan → Kyoto', category:'Transport', subcategory:'Train', time:'08:15', timePrecision:'exact', origin:'Koyasan', destination:'Kyoto', transportMode:'train', duration:'2h 48m', estimatedCost:36, currency:'AUD', bookingStatus:'Not Required', paymentStatus:'Not Paid', sortOrder:0 },
    { id:'e-6', dayId:'day-6', title:'Cross Hotel Kyoto', category:'Accommodation', subcategory:'Hotel', time:'14:00', timePrecision:'exact', location:'Kawaramachi, Kyoto', latitude:35.0087, longitude:135.7694, description:'Standard king room · 2 nights', estimatedCost:310, currency:'AUD', bookingStatus:'Need to Book', paymentStatus:'Not Paid', sortOrder:1 },
    { id:'e-7', dayId:'day-6', title:'Gion evening walk', category:'Activity', subcategory:'Walking', time:'17:00', timePrecision:'approximate', location:'Gion, Kyoto', latitude:35.0037, longitude:135.7788, duration:'1h 30m', estimatedCost:0, currency:'AUD', bookingStatus:'Not Required', paymentStatus:'Not Paid', sortOrder:2 },
    { id:'e-8', dayId:'day-6', title:'Dinner at Gion Kappa', category:'Food', subcategory:'Restaurant', time:'19:30', timePrecision:'exact', location:'Gion, Kyoto', estimatedCost:58, currency:'AUD', bookingStatus:'Reserved', paymentStatus:'Not Paid', sortOrder:3 },
  ]},
  { id:'day-7', number:7, date:'Wednesday, 18 May', title:'Shrines, lanes & markets', segmentId:'kyoto', events:[
    { id:'e-9', dayId:'day-7', title:'Fushimi Inari at sunrise', category:'Attraction', subcategory:'Shrine', time:'06:45', timePrecision:'exact', location:'Fushimi Inari Taisha', latitude:34.9671, longitude:135.7727, estimatedCost:0, currency:'AUD', bookingStatus:'Not Required', paymentStatus:'Not Paid', sortOrder:0 },
    { id:'e-10', dayId:'day-7', title:'Kiyomizu-dera', category:'Attraction', subcategory:'Temple', time:'10:30', timePrecision:'approximate', location:'Higashiyama, Kyoto', latitude:34.9949, longitude:135.785, estimatedCost:6, currency:'AUD', bookingStatus:'Not Required', paymentStatus:'Not Paid', sortOrder:1 },
    { id:'e-11', dayId:'day-7', title:'Nishiki Market lunch', category:'Food', subcategory:'Market', time:'13:30', timePrecision:'approximate', location:'Nishiki Market', latitude:35.005, longitude:135.7649, estimatedCost:32, currency:'AUD', bookingStatus:'Not Required', paymentStatus:'Not Paid', sortOrder:2 },
  ]},
];

export const japanBookings: Booking[] = [
  { id:'b1', title:'International flight', category:'Flight', provider:'Qantas', reference:'QF8S2A', status:'Paid', paymentStatus:'Paid', cost:1550, currency:'AUD' },
  { id:'b2', title:'Tokyo hotel', category:'Accommodation', provider:'Hotel Groove', reference:'HG-27712', status:'Booked', paymentStatus:'Deposit paid', cancellationDeadline:'Free cancellation until 4 May', cost:760, currency:'AUD' },
  { id:'b3', title:'Eko-in Temple Stay', category:'Accommodation', provider:'Eko-in', reference:'EK-4568', status:'Paid', paymentStatus:'Paid', cost:210, currency:'AUD' },
  { id:'b4', title:'Kyoto hotel', category:'Accommodation', status:'Need to Book', paymentStatus:'Not paid', deadline:'Due 4 Sep', cost:310, currency:'AUD' },
  { id:'b5', title:'Tokyo → Shin-Osaka', category:'High-speed train', provider:'SmartEX', status:'Need to Book', paymentStatus:'Not paid', deadline:'Booking opens in 8 days', cost:194, currency:'AUD' },
  { id:'b6', title:'Okunoin Night Tour', category:'Attraction', status:'Need to Book', paymentStatus:'Not paid', cost:60, currency:'AUD' },
  { id:'b7', title:'Shimanami Kaido bicycle', category:'Rental', status:'Shortlisted', paymentStatus:'Not paid', cost:42, currency:'AUD' },
];

export const savedPlaces: SavedPlace[] = [
  { id:'s1', title:'teamLab Borderless', category:'Attraction', city:'Tokyo', note:'Best on a weekday morning' },
  { id:'s2', title:'Arashiyama', category:'Place', city:'Kyoto', note:'Could fit early on Day 7' },
  { id:'s3', title:'Nara day trip', category:'Idea', city:'Nara', note:'Keep as optional slow-day alternative' },
  { id:'s4', title:'Himeji Castle', category:'Attraction', city:'Himeji', note:'Possible stop between Osaka and Onomichi' },
];
