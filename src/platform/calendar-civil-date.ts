/** The same civil-date constraints as saveMyCalendarEvent on the server.
 * No UTC-midnight conversion or shifting a user's all-day personal date.
 */
export const validPersonalCalendarDate=(key:string):boolean=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(key))return false;
  const [year,month,day]=key.split('-').map(Number);
  if(year<2000||year>2100||month<1||month>12||day<1||day>31)return false;
  const value=new Date(Date.UTC(year,month-1,day));
  return !Number.isNaN(value.getTime())&&value.toISOString().slice(0,10)===key;
};

/**
 * Switching days to browse starts a new form. Editing a date is different:
 * the existing event identity stays selected until an explicit save.
 */
export const personalCalendarSavedSelection=(key:string):{year:number;month:number}|null=>{
  if(!validPersonalCalendarDate(key))return null;
  const [year,month]=key.split('-').map(Number);
  return {year,month:month-1};
};
