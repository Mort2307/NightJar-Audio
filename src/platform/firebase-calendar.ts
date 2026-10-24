import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

export type PersonalCalendarEvent = {
  id: string;
  title: string;
  date: string; // all-day civil date: YYYY-MM-DD, never UTC midnight
  note: string;
};

export type UpcomingNightjarRelease = {
  id:string;title:string;creatorName:string;creatorUserId:string;
  scheduledAt:string;category:string;teaser:string;isFollowing:boolean;
};

export type PersonalCalendarSnapshot = {
  events: PersonalCalendarEvent[];
  timeZone: string; // auto or valid IANA zone
  limited: boolean;
};

const functions = getFunctions(firebaseApp, 'europe-west2');
const getCall = httpsCallable<void, PersonalCalendarSnapshot>(functions, 'getMyCalendar');
const upcomingCall=httpsCallable<void,{upcoming:UpcomingNightjarRelease[]}>(functions,'listUpcomingReleaseCalendar');
const saveCall = httpsCallable<{ id?: string; title: string; date: string; note: string }, { event: PersonalCalendarEvent }>(functions, 'saveMyCalendarEvent');
const deleteCall = httpsCallable<{ id: string }, { deleted: boolean }>(functions, 'deleteMyCalendarEvent');
const timeZoneCall = httpsCallable<{ timeZone: string }, { timeZone: string }>(functions, 'saveMyCalendarTimeZone');

export const nightjarCalendar = {
  async upcoming(){return (await upcomingCall()).data.upcoming;},
  async get() {
    return (await getCall()).data;
  },
  async save(event: Omit<PersonalCalendarEvent, 'id'> & { id?: string }) {
    return (await saveCall(event)).data.event;
  },
  async remove(id: string) {
    return (await deleteCall({ id })).data.deleted;
  },
  async setTimeZone(timeZone: string) {
    return (await timeZoneCall({ timeZone })).data.timeZone;
  },
};
