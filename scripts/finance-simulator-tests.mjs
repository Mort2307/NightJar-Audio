const clamp=(value,min=0,max=Number.POSITIVE_INFINITY)=>Math.min(max,Math.max(min,Number.isFinite(value)?value:0));

const calculate=(input)=>{
  const subscribers=Math.max(0,Math.round(input.paidSubscribers));
  const price=clamp(input.subscriptionPrice);
  const vat=clamp(input.vatRate,0,100);
  const base=subscribers*price;
  const billings=input.priceIncludesVat?base:base*(1+vat/100);
  const refunds=Math.max(0,billings*clamp(input.refundPercent,0,100)/100);
  const retained=Math.max(0,billings-refunds);
  const vatCollected=vat<=0?0:input.priceIncludesVat
    ? retained*(vat/(100+vat))
    : (retained/(1+vat/100))*(vat/100);
  const processorFees=Math.max(0,billings*clamp(input.processorPercent,0,100)/100+subscribers*clamp(input.processorFixed));
  const net=Math.max(0,retained-vatCollected-processorFees);
  const contributorPot=net*input.contributorPercent/100;
  const appPot=net*input.appPercent/100;
  const operatorPot=net*input.operatorPercent/100;
  const roleResults=Object.values(input.roles).map((role)=>{
    const allocated=contributorPot*role.allocationPercent/100;
    const people=Math.max(0,Math.round(role.eligiblePeople));
    const uncapped=people>0?allocated/people:0;
    const perPerson=people>0?Math.min(uncapped,Math.max(0,role.monthlyCap)):0;
    const paid=people*perPerson;
    return {allocated,people,perPerson,paid,unused:Math.max(0,allocated-paid)};
  });
  const contributorPaid=roleResults.reduce((sum,role)=>sum+role.paid,0);
  const unused=Math.max(0,contributorPot-contributorPaid);
  return {billings,vatCollected,processorFees,refunds,net,contributorPot,appPot,operatorPot,roleResults,contributorPaid,unused};
};

const base={
  paidSubscribers:10000,subscriptionPrice:6.99,vatRate:20,priceIncludesVat:true,
  refundPercent:1,processorPercent:2.9,processorFixed:.30,
  contributorPercent:50,appPercent:20,operatorPercent:30,
  roles:{
    creator:{allocationPercent:70,eligiblePeople:5,monthlyCap:3000},
    writer:{allocationPercent:12,eligiblePeople:5,monthlyCap:750},
    editor:{allocationPercent:10,eligiblePeople:5,monthlyCap:750},
    artist:{allocationPercent:8,eligiblePeople:5,monthlyCap:500},
  },
};

const failures=[];
const assert=(condition,message)=>{if(!condition)failures.push(message);};
const approx=(a,b,tolerance=.01)=>Math.abs(a-b)<=tolerance;

// Zero subscribers / zero price must never produce negative money.
for(const scenario of [
  {...base,paidSubscribers:0},
  {...base,subscriptionPrice:0},
]){
  const result=calculate(scenario);
  assert(result.billings===0,'Zero-revenue scenario must have £0 billings.');
  assert(result.net===0,'Zero-revenue scenario must have £0 distributable net.');
  assert(result.contributorPaid===0,'Zero-revenue scenario must have £0 professional payouts.');
}

// Main 50/20/30 allocation reconciles exactly against post-fee net.
{
  const result=calculate(base);
  assert(approx(result.contributorPot+result.appPot+result.operatorPot,result.net),'50/20/30 pots must reconcile to distributable net.');
  assert(result.contributorPaid<=result.contributorPot+.01,'Professional payouts may not exceed contributor pot.');
  assert(result.unused>=0,'Unused contributor capacity may never be negative.');
}

// Inclusive/exclusive VAT should both isolate a VAT component without negative net.
for(const priceIncludesVat of [true,false]){
  const result=calculate({...base,priceIncludesVat});
  assert(result.vatCollected>0,'VAT scenario should calculate VAT.');
  assert(result.net>=0,'VAT scenario may not create negative distributable net.');
}

// Zero eligible people must leave the role allocation uncommitted rather than divide by zero.
{
  const scenario=structuredClone(base);
  scenario.roles.writer.eligiblePeople=0;
  const result=calculate(scenario);
  const writer=result.roleResults[1];
  assert(writer.perPerson===0,'Zero eligible people must pay £0 per person.');
  assert(approx(writer.unused,writer.allocated),'Zero eligible people must leave the entire role allocation unused.');
}

// Caps must bind safely.
{
  const scenario=structuredClone(base);
  scenario.roles.creator.monthlyCap=100;
  const result=calculate(scenario);
  const creator=result.roleResults[0];
  assert(creator.perPerson<=100,'Monthly role cap must bind per-person payout.');
  assert(creator.unused>0,'Cap-limited scenario should expose unused capacity.');
}

// Very large scale remains finite.
{
  const result=calculate({...base,paidSubscribers:1_000_000});
  for(const [key,value] of Object.entries(result)){
    if(typeof value==='number') assert(Number.isFinite(value),'Million-subscriber result must remain finite: '+key);
  }
}

if(failures.length){
  console.error('FINANCE SIMULATOR TEST FAILURES');
  failures.forEach((failure)=>console.error('-',failure));
  process.exit(1);
}
console.log('Nightjar Finance Lab invariant tests passed.');
