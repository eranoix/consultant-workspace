/**
 * The invented month. Everyone and everything here is fictional: the
 * consultant, her practice, the partner firm, the clients and their people.
 * Domains are example.com subdomains.
 */

export const PEOPLE = {
  maya: { name: 'Maya Okafor', email: 'maya@lumen.example.com' },
  theo: { name: 'Theo Brandt', email: 'theo@lumen.example.com' },
  priya: { name: 'Priya Raman', email: 'priya@harborvale.example.com' },
  daniel: { name: 'Daniel Cho', email: 'daniel@harborvale.example.com' },
  lena: { name: 'Lena Fischer', email: 'lena@brightwater.example.com' },
  marco: { name: 'Marco Bianchi', email: 'marco@brightwater.example.com' },
  omar: { name: 'Omar Haddad', email: 'omar@kestrelhealth.example.com' },
  grace: { name: 'Grace Liu', email: 'grace@orchardpine.example.com' },
  sam: { name: 'Sam Rivera', email: 'sam@northlight.example.com' },
  samPersonal: { name: 'Sam Rivera', email: 'sam.rivera@mailbox.example.com' },
} as const;

export const CLIENTS = [
  {
    key: 'brightwater',
    name: 'Brightwater Logistics',
    aliases: ['Brightwater', 'BWL'],
    domains: ['brightwater.example.com'],
    side: 'partner',
    engagement: 'Warehouse picking redesign',
    color: '#0284c7',
  },
  {
    key: 'kestrel',
    name: 'Kestrel Health',
    aliases: ['Kestrel'],
    domains: ['kestrelhealth.example.com'],
    side: 'partner',
    engagement: 'Patient intake audit',
    color: '#7c3aed',
  },
  {
    key: 'orchard',
    name: 'Orchard & Pine Foods',
    aliases: ['Orchard & Pine', 'Orchard and Pine'],
    domains: ['orchardpine.example.com'],
    side: 'direct',
    engagement: 'Operations playbook',
    color: '#16a34a',
  },
  {
    key: 'northlight',
    name: 'Northlight Studio',
    aliases: ['Northlight'],
    domains: ['northlight.example.com'],
    side: 'direct',
    engagement: 'Hiring process design',
    color: '#d97706',
  },
] as const;

export type Plan = {
  /** approve / no action per task, in order; missing = leave pending. */
  decisions?: ('a' | 'n')[];
  /** complete the review ("Done") after deciding. */
  done?: boolean;
};

export interface MeetingSeed {
  day: number; // offset from today (negative = past)
  hour: number;
  title: string;
  to: string[];
  body: string;
  plan: Plan;
}

export interface EmailSeed {
  day: number;
  hour: number;
  thread: string;
  from: { name: string; email: string };
  to: string[];
  subject: string;
  body: string;
  plan: Plan;
  /** Maya's reply, hours later (goes to the Sent folder). */
  reply?: { afterHours: number; body: string };
}

const P = PEOPLE;

export const MEETINGS: MeetingSeed[] = [
  {
    day: -24,
    hour: 10,
    title: 'Brightwater kickoff: picking redesign',
    to: [P.priya.email, P.lena.email, P.marco.email],
    body: `Attendees: Maya Okafor, Priya Raman, Lena Fischer, Marco Bianchi
Discussed: Current picking error rate at the Dayton warehouse is 2.1 percent
Discussed: Night shift uses a different pick list format than day shift
Decision: Start with a zone picking pilot on aisles 1 and 2
Action: Maya to map the current picking flow by next week
Action: Marco to export three months of mispick data
Action: Maya to draft the pilot success criteria by Friday`,
    plan: { decisions: ['a', 'n', 'a'], done: true },
  },
  {
    day: -22,
    hour: 14,
    title: 'Northlight hiring process: discovery',
    to: [P.sam.email],
    body: `Attendees: Maya Okafor, Sam Rivera
Discussed: Northlight hires four designers a year and every loop looks different
Discussed: Candidates wait an average of 19 days for a decision
Decision: Target a two-week loop from first call to offer
Action: Maya to send a proposal for the hiring process work by Thursday
Action: Sam to share the last five job descriptions`,
    plan: { decisions: ['a', 'n'], done: true },
  },
  {
    day: -20,
    hour: 11,
    title: 'Kestrel intake audit: weekly with Harbor & Vale',
    to: [P.priya.email, P.daniel.email],
    body: `Attendees: Maya Okafor, Priya Raman, Daniel Cho
Discussed: Kestrel front desk handles 140 intakes a day with two forms
Discussed: Duplicate data entry between the paper form and the scheduling system
Decision: Audit scope covers both clinics, not only the main site
Action: Maya to schedule shadowing sessions at both Kestrel clinics
Action: Daniel to update the statement of work
Action: Maya to prepare the audit interview guide by Monday`,
    plan: { decisions: ['a', 'n', 'a'], done: true },
  },
  {
    day: -17,
    hour: 9,
    title: 'Orchard & Pine: operations playbook scoping',
    to: [P.grace.email],
    body: `Attendees: Maya Okafor, Grace Liu
Discussed: Orchard & Pine is opening a second kitchen in the spring
Discussed: Recipes, prep lists and supplier orders live in personal spreadsheets
Decision: The playbook starts with receiving, prep and closing checklists
Action: Maya to draft the receiving checklist
Action: Grace to list the ten suppliers by order volume
Action: Maya to book a site visit for the morning prep shift`,
    plan: { decisions: ['a', 'n', 'a'], done: true },
  },
  {
    day: -15,
    hour: 15,
    title: 'Brightwater pilot design review',
    to: [P.priya.email, P.lena.email],
    body: `Attendees: Maya Okafor, Priya Raman, Lena Fischer
Discussed: Draft zone map for aisles 1 and 2
Discussed: Handheld scanners arrive two days before the pilot
Decision: Pilot runs for three weeks on day shift only
Decision: Mispick rate and lines per hour are the two pilot metrics
Action: Maya to write the pilot training one-pager by Wednesday
Action: Lena to brief the day shift supervisors
Action: Maya to set up the pilot metrics sheet`,
    plan: { decisions: ['a', 'n', 'a'], done: true },
  },
  {
    day: -13,
    hour: 13,
    title: 'Harbor & Vale monthly partner sync',
    to: [P.priya.email, P.daniel.email],
    body: `Attendees: Maya Okafor, Priya Raman, Daniel Cho
Discussed: Utilisation for the month and the hours forecast for next month
Discussed: Harbor & Vale wants weekly timesheets by Monday noon from now on
Decision: Maya logs time daily and sends the week every Friday
Action: Maya to send last month's timesheet by tomorrow
Action: Priya to share the new timesheet template`,
    plan: { decisions: ['a', 'n'], done: true },
  },
  {
    day: -10,
    hour: 10,
    title: 'Northlight: interview loop workshop',
    to: [P.sam.email],
    body: `Attendees: Maya Okafor, Sam Rivera
Discussed: Current loop has six interviews and no shared scorecard
Discussed: Portfolio review happens after the culture interview, which wastes time
Decision: Portfolio review moves to the first stage
Action: Maya to design the interview scorecard by Friday
Action: Maya to write interviewer briefing notes
Action: Sam to pick two pilot roles`,
    plan: { decisions: ['a', 'a', 'n'], done: true },
  },
  {
    day: -8,
    hour: 11,
    title: 'Kestrel clinic shadowing debrief',
    to: [P.priya.email, P.omar.email],
    body: `Attendees: Maya Okafor, Priya Raman, Omar Haddad
Discussed: Insurance details are typed three times during a single intake
Discussed: The north clinic already uses a tablet form for returning patients
Decision: Recommend the tablet form for all new patients
Action: Maya to write up the shadowing findings by Thursday
Action: Omar to confirm the tablet vendor contract terms
Action: Maya to estimate front desk time saved per intake`,
    plan: { decisions: ['a', 'n', 'a'], done: true },
  },
  {
    day: -6,
    hour: 9,
    title: 'Orchard & Pine: site visit notes',
    to: [P.grace.email],
    body: `Attendees: Maya Okafor, Grace Liu
Discussed: Receiving happens at the back door with no checklist and no scale
Discussed: Prep lists are written on a whiteboard and photographed
Decision: Pilot a laminated receiving checklist next week
Action: Maya to print and laminate the receiving checklist by Monday
Action: Maya to draft the prep list template
Action: Grace to order a receiving scale`,
    plan: { decisions: ['a', 'a'], done: false },
  },
  {
    day: -4,
    hour: 14,
    title: 'Brightwater pilot week 1 check-in',
    to: [P.priya.email, P.lena.email, P.marco.email],
    body: `Attendees: Maya Okafor, Priya Raman, Lena Fischer, Marco Bianchi
Discussed: Mispick rate on aisles 1 and 2 dropped from 2.1 to 1.4 percent
Discussed: Lines per hour dipped on day two while pickers learned the zones
Decision: Keep the pilot at two aisles for one more week
Action: Maya to prepare the week 1 pilot report by Friday
Action: Marco to fix the label printer on aisle 2
Action: Maya to interview three pickers about the new zones`,
    plan: {},
  },
  {
    day: -3,
    hour: 16,
    title: 'Lumen Advisory: quarterly planning',
    to: [P.theo.email],
    body: `Attendees: Maya Okafor, Theo Brandt
Discussed: Own practice was 31 percent of billed hours last quarter
Discussed: Two direct clients asked for follow-on work
Decision: Aim for 40 percent own practice hours next quarter
Action: Maya to update the services page with the hiring process offer
Action: Theo to set up the new invoice template
Action: Maya to write a case study for Orchard & Pine by end of month`,
    plan: { decisions: ['a'] },
  },
  {
    day: -2,
    hour: 10,
    title: 'Kestrel recommendations workshop',
    to: [P.priya.email, P.daniel.email, P.omar.email],
    body: `Attendees: Maya Okafor, Priya Raman, Daniel Cho, Omar Haddad
Discussed: Draft recommendations for the new patient intake flow
Discussed: Staff concern about tablets being shared between patients
Decision: Add a cleaning step and a second tablet per clinic
Action: Maya to revise the recommendations deck by Thursday
Action: Daniel to price the second tablet into the proposal
Action: Maya to draft the staff FAQ for the tablet rollout`,
    plan: {},
  },
  {
    day: -1,
    hour: 15,
    title: 'Northlight scorecard review',
    to: [P.sam.email],
    body: `Attendees: Maya Okafor, Sam Rivera
Discussed: First draft of the designer scorecard
Discussed: Hiring managers want fewer criteria with clearer anchors
Decision: Five criteria, each with three anchored levels
Action: Maya to cut the scorecard to five criteria by tomorrow
Action: Maya to run a calibration session with the two hiring managers`,
    plan: {},
  },
  {
    day: -1,
    hour: 11,
    title: 'Harbor & Vale: resourcing for next quarter',
    to: [P.daniel.email],
    body: `Attendees: Maya Okafor, Daniel Cho
Discussed: Harbor & Vale has a new retail client starting next quarter
Discussed: Maya's availability for partner work is three days a week
Decision: No new partner engagement until the Brightwater pilot ends
Action: Maya to send Daniel her availability for next quarter`,
    plan: {},
  },
  {
    day: 0,
    hour: 9,
    title: 'Brightwater pilot: daily stand-up',
    to: [P.lena.email],
    body: `Attendees: Maya Okafor, Lena Fischer
Discussed: Aisle 2 label printer is fixed
Discussed: Night shift asked to join the pilot early
Decision: Night shift waits for the week 2 results
Action: Maya to update the pilot metrics sheet with yesterday's numbers today`,
    plan: {},
  },
  {
    day: -9,
    hour: 16,
    title: 'Orchard & Pine: supplier review call',
    to: [P.grace.email],
    body: `Attendees: Maya Okafor, Grace Liu
Discussed: Two suppliers deliver outside the receiving window
Discussed: Invoices do not match delivery notes about once a week
Decision: Receiving window is 7 to 10 in the morning, no exceptions
Action: Maya to write the supplier delivery policy
Action: Grace to email suppliers about the receiving window`,
    plan: { decisions: ['a', 'n'], done: true },
  },
];

export const EMAILS: EmailSeed[] = [
  {
    day: -21,
    hour: 8,
    thread: 'bw-data',
    from: P.marco,
    to: [P.maya.email],
    subject: 'Brightwater mispick export',
    body: `Hi Maya,
Attached is the mispick export for the last three months.
Could you check whether the aisle codes match the map you drew by Wednesday?
Thanks,
Marco`,
    plan: { decisions: ['a'], done: true },
    reply: { afterHours: 5, body: 'Thanks Marco, the codes match. I will send the flow map tomorrow.' },
  },
  {
    day: -19,
    hour: 12,
    thread: 'nl-proposal',
    from: P.sam,
    to: [P.maya.email],
    subject: 'Re: Hiring process proposal',
    body: `Hi Maya,
The proposal looks good and we would like to start next week.
Please send the contract and the first invoice.
Best,
Sam`,
    plan: { decisions: ['a'], done: true },
    reply: { afterHours: 2, body: 'Great news, Sam. Contract and invoice are attached.' },
  },
  {
    day: -16,
    hour: 9,
    thread: 'hv-timesheet',
    from: P.priya,
    to: [P.maya.email],
    subject: 'Timesheet template and deadlines',
    body: `Hi Maya,
Here is the new timesheet template we discussed.
From next week, please submit your hours by Monday noon.
Can you also add the Kestrel shadowing hours to last week?
Priya`,
    plan: { decisions: ['n', 'a'], done: true },
    reply: { afterHours: 3, body: 'Done, the Kestrel hours are in. Thanks for the template.' },
  },
  {
    day: -14,
    hour: 17,
    thread: 'op-suppliers',
    from: P.grace,
    to: [P.maya.email],
    subject: 'Supplier list for the playbook',
    body: `Hi Maya,
Here are our ten suppliers by volume, with contact names.
Could you flag the ones that should get the new receiving window first?
Grace`,
    plan: { decisions: ['a'], done: true },
    reply: { afterHours: 20, body: 'Flagged four of them, see the sheet.' },
  },
  {
    day: -12,
    hour: 10,
    thread: 'kh-schedule',
    from: P.omar,
    to: [P.maya.email, P.priya.email],
    subject: 'Kestrel shadowing schedule',
    body: `Hello Maya,
Both clinics can host you next Tuesday and Wednesday from 7:30.
Please confirm which clinic you want to see first.
Regards,
Omar`,
    plan: { decisions: ['n'], done: true },
    reply: { afterHours: 1, body: 'North clinic on Tuesday, main site on Wednesday. Thank you.' },
  },
  {
    day: -11,
    hour: 8,
    thread: 'newsletter',
    from: { name: 'Operations Weekly', email: 'digest@opsweekly.example.com' },
    to: [P.maya.email],
    subject: 'Operations Weekly: five warehouse metrics that matter',
    body: `This week: lines per hour, dock to stock time, and why mispick rate is a lagging indicator.
Also in this issue: a case study on zone picking in cold storage.`,
    plan: {},
  },
  {
    day: -7,
    hour: 14,
    thread: 'nl-roles',
    from: P.samPersonal,
    to: [P.maya.email],
    subject: 'Pilot roles for the new loop',
    body: `Hi Maya, writing from my personal address while traveling.
We picked the senior product designer and the design ops roles for the pilot.
Could you prepare the interview kits for both roles by next Friday?
Sam`,
    plan: { decisions: ['a'], done: true },
    reply: { afterHours: 6, body: 'Perfect, I will have both kits ready.' },
  },
  {
    day: -5,
    hour: 11,
    thread: 'bw-scanners',
    from: P.lena,
    to: [P.maya.email, P.priya.email],
    subject: 'Scanner battery issue on aisle 1',
    body: `Hi Maya,
Two of the pilot scanners die before the end of the shift.
Can you add battery swaps to the pilot training one-pager?
Also, please note the issue in the week 1 report.
Lena`,
    plan: { decisions: ['a', 'n'] },
  },
  {
    day: -4,
    hour: 9,
    thread: 'hv-invoice',
    from: { name: 'Harbor & Vale Billing', email: 'billing@harborvale.example.com' },
    to: [P.maya.email],
    subject: 'Subcontractor invoice received',
    body: `Your invoice for last month was received and is scheduled for payment on the 30th.
No action is needed.`,
    plan: {},
  },
  {
    day: -3,
    hour: 10,
    thread: 'op-checklist',
    from: P.grace,
    to: [P.maya.email],
    subject: 'Receiving checklist feedback',
    body: `Hi Maya,
The kitchen team used the laminated checklist all week and it works.
Could you add a line for checking the cold chain temperature?
Please also send a version in Spanish for the morning crew by Friday.
Grace`,
    plan: {},
  },
  {
    day: -2,
    hour: 16,
    thread: 'kh-urgent',
    from: P.omar,
    to: [P.maya.email, P.priya.email],
    subject: 'Urgent: board meeting moved to Thursday',
    body: `Hello Maya,
Our board meeting moved to this Thursday, so we need the recommendations earlier.
Can you send the revised deck by Wednesday noon?
Regards,
Omar`,
    plan: {},
  },
  {
    day: -2,
    hour: 9,
    thread: 'nl-calibration',
    from: P.sam,
    to: [P.maya.email],
    subject: 'Calibration session time',
    body: `Hi Maya,
Both hiring managers are free on Thursday afternoon.
Please send an invite for a 60 minute calibration session.
Sam`,
    plan: {},
  },
  {
    day: -1,
    hour: 13,
    thread: 'hv-retail',
    from: P.daniel,
    to: [P.maya.email],
    subject: 'Retail client intro deck',
    body: `Hi Maya,
Sharing the intro deck for the retail client, no rush.
Could you review the operations section before next week's partner sync?
Daniel`,
    plan: {},
  },
  {
    day: 0,
    hour: 8,
    thread: 'bw-night',
    from: P.marco,
    to: [P.maya.email, P.lena.email],
    subject: 'Night shift pilot request',
    body: `Hi Maya,
The night shift lead asked again to join the pilot.
Can you write a short note explaining why we wait for the week 2 results?
Marco`,
    plan: {},
  },
];

export interface NoteSeed {
  folder: string;
  subject: string;
  day: number;
  body: string;
}

/** Notes that arrive through the mail folder sync (note the mixed separators). */
export const MAIL_NOTES: NoteSeed[] = [
  {
    folder: 'Notes',
    subject: 'Questions to ask in every discovery call',
    day: -25,
    body: `What does a good week look like for your team?
Where does work wait the longest?
Who decides, and who needs to know?
- What have you already tried?
- What would make this engagement a failure?`,
  },
  {
    folder: 'Notes/Clients',
    subject: 'Client onboarding checklist',
    day: -20,
    body: `- Signed statement of work
- Kickoff meeting booked
- Shared folder created
- Client added to the board with its side and color`,
  },
  {
    folder: 'Notes.Clients/Brightwater',
    subject: 'Dayton warehouse layout',
    day: -18,
    body: `Aisles 1 and 2 are fast movers, aisles 3 to 6 are bulk.
Dock doors 4 and 5 are used for returns only.
The pick list printer sits next to aisle 2.`,
  },
  {
    folder: 'notes/clients/kestrel',
    subject: 'Intake form fields observed',
    day: -11,
    body: `Name, date of birth, insurance provider, member number, referring physician.
Insurance details are typed into the scheduling system, the billing system and the paper form.
The north clinic tablet form pre-fills returning patients.`,
  },
  {
    folder: 'Notes/Ideas',
    subject: 'Workshop format: one hour process mapping',
    day: -9,
    body: `Ten minutes of silent sticky notes, twenty minutes of clustering, thirty minutes on the three biggest waits.
Works with up to eight people. Needs a wall, not a table.`,
  },
  {
    folder: 'Notes/Ideas',
    subject: 'Case study outline',
    day: -3,
    body: `Situation, what we changed, the numbers before and after, a quote from the client.
Keep it under 600 words.`,
  },
];
