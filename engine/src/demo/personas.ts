// ═══════════════════════════════════════════════════════════════════════
// The demo clients (PROMPT-04). Every name, number and word is fictional.
//
// Weeks are counted from the Monday of today's week: `startOffsetWeeks: -4`
// started four Mondays ago, so that client is always in week 5 of that cycle.
// Bodyweight in lbs, lifts in kg, waist and hip in inches, as BLOC stores them.
//
// Where each one stands (what a coach sees):
//   Maya   coach's cycle, week 5 of 8, fat loss on track; last cycle reviewed
//   Tom    his own cycle, week 4 of 6, building; weight flat for 2 weeks,
//          bench stalled, few weigh-ins, phone not opened for 3 days: off track
//   Grace  Auckland, week 1 of a maintenance cycle after a reviewed cut
//   Priya  final week of a 6-week cut with weekly A/B microcycles; the scale
//          flat for 3 weeks but the waist still falling (recomposition)
//   Casey  deload week of a cut; eating at maintenance (~500 kcal over the
//          goal) for 3 weeks, weight flat, off track on calories
// ═══════════════════════════════════════════════════════════════════════
import type { DemoExercise, DemoPersona } from './sim.ts';

const ex = (name: string, reps: string, setsStart: number, setsEnd: number, startWeight: number,
  o: Partial<DemoExercise> = {}): DemoExercise => ({ name, reps, setsStart, setsEnd, startWeight, ...o });

export const MAYA: DemoPersona = {
  key: 'maya', tz: 'Europe/London',
  profile: { gender: 'female', heightCm: 165, birthday: '1992-03-14' },
  weekdays: [0, 1, 3, 5], historyWeeks: 14,
  startLbs: 158.4, lbsPerWeek: [0, -1.1, -0.9, -0.8, -0.8, -0.7, -0.6, -0.7, -0.5, 0.3, -0.9, -0.8, -0.7, -0.7, -0.6],
  startWaist: 31, startHip: 40.5, waistPerWeek: [0, -0.25, -0.25, 0, -0.25, 0, -0.25, 0, -0.25, 0, -0.25, 0, -0.25, 0, -0.25],
  steps: { base: 10000, spread: 2600 }, weighInRate: 0.93, foodLogRate: 0.92, kcalBias: [20],
  skipRate: 0.04, missRate: 0.07,
  cycles: [
    {
      key: 'c1', name: 'Summer Cut', goal: 'Down to 150 lbs', goalType: 'loss', targetBw: 150,
      startOffsetWeeks: -13, weeks: 8, weeksPerMeso: 1, useMicrocycles: false, published: true, deloadWeeks: [5],
      sessions: [
        { label: 'Upper A', exercises: [ex('Flat Press', '8', 3, 4, 32.5), ex('Lat Pulldown', '10', 3, 4, 37.5), ex('Machine Row', '12', 2, 3, 30), ex('Lateral Raise', '15', 2, 3, 5, { trackingMode: 'perSide' })] },
        { label: 'Lower A', exercises: [ex('Leg Press', '10', 3, 4, 90, { isHeavyLeg: true }), ex('RDL', '10', 3, 4, 45), ex('Hamstring Curl', '12', 2, 3, 27.5), ex('Calf Raises', '15', 2, 3, 40)] },
        { label: 'Upper B', exercises: [ex('Incline Press', '10', 3, 4, 27.5), ex('T-Bar Row', '10', 3, 4, 32.5), ex('Cable Curls', '12', 2, 3, 10), ex('Push Downs', '12', 2, 3, 15)] },
        { label: 'Lower B', exercises: [ex('Split Squat', '10', 3, 4, 10, { trackingMode: 'perSide' }), ex('Leg Extension', '12', 3, 4, 32.5), ex('Walking Lunge', '12', 2, 3, 8, { trackingMode: 'perSide' })] },
      ],
      goals: [
        { fromWeek: 1, toWeek: 4, kcal: 1700, protein: 130, carbs: 165, fats: 55, steps: 9000 },
        { fromWeek: 5, toWeek: 8, kcal: 1600, protein: 130, carbs: 150, fats: 52, steps: 10000 },
      ],
      review: {
        complianceScore: 9, direction: 'loss',
        headline: 'Steady from start to finish',
        narrative: 'You lost weight every week bar the deload, at close to the pace we planned, and training kept moving up while it did.\n\nFood logging was the backbone of this cycle: you logged almost every day, protein sat on target, and the one heavier week was the deload, as expected.',
        highlights: ['Lost weight in 7 of 8 weeks', 'Protein on target nearly every day', 'Leg press up 15 kg across the cycle'],
        improvements: ['Steps dipped on Sundays most weeks'],
        stickingPoints: 'None worth naming: the only flat week was the planned deload.',
        bodyfatNote: 'Waist down 1 inch alongside the scale, so the loss looks like fat, not water.',
      },
    },
    {
      key: 'c2', name: 'Autumn Cut', goal: 'Down to 145 lbs', goalType: 'loss', targetBw: 145,
      startOffsetWeeks: -4, weeks: 8, weeksPerMeso: 1, useMicrocycles: false, published: true, deloadWeeks: [7],
      sessions: [
        { label: 'Upper A', exercises: [ex('Flat Press', '8', 3, 4, 37.5), ex('Lat Pulldown', '10', 3, 4, 42.5), ex('Machine Row', '12', 2, 3, 35), ex('Lateral Raise', '15', 2, 3, 6, { trackingMode: 'perSide' })] },
        { label: 'Lower A', exercises: [ex('Leg Press', '10', 3, 4, 105, { isHeavyLeg: true }), ex('RDL', '10', 3, 4, 52.5), ex('Hamstring Curl', '12', 2, 3, 32.5), ex('Calf Raises', '15', 2, 3, 45)] },
        { label: 'Upper B', exercises: [ex('Incline Press', '10', 3, 4, 32.5), ex('T-Bar Row', '10', 3, 4, 37.5), ex('Cable Curls', '12', 2, 3, 12.5), ex('Push Downs', '12', 2, 3, 17.5)] },
        { label: 'Lower B', exercises: [ex('Split Squat', '10', 3, 4, 12, { trackingMode: 'perSide' }), ex('Leg Extension', '12', 3, 4, 37.5), ex('Walking Lunge', '12', 2, 3, 10, { trackingMode: 'perSide' })] },
      ],
      goals: [
        { fromWeek: 1, toWeek: 4, kcal: 1600, protein: 130, carbs: 150, fats: 52, steps: 10000 },
        { fromWeek: 5, toWeek: 8, kcal: 1550, protein: 135, carbs: 140, fats: 50, steps: 11000 },
      ],
    },
  ],
};

export const TOM: DemoPersona = {
  key: 'tom', tz: 'Europe/London',
  profile: { gender: 'male', heightCm: 182, birthday: '1997-07-02' },
  weekdays: [0, 2, 4], historyWeeks: 11,
  startLbs: 171.2, lbsPerWeek: [0, 0.6, 0.5, 0.7, 0.4, 0.5, 0.6, 0.3, 0.3, 0, -0.1, 0],
  startWaist: 33, startHip: 38.5, waistPerWeek: [0, 0.25, 0, 0, 0.25, 0, 0, 0, 0.25, 0, 0],
  steps: { base: 7000, spread: 3500 }, weighInRate: 0.5, foodLogRate: 0.55, kcalBias: [0, 0, 0, 0, 0, 0, 0, 0, -250],
  skipRate: 0.15, missRate: 0.1, quietDays: 3,
  stalls: [{ cycle: 'c2', exercise: 'Flat Press', fromWeek: 2 }],
  cycles: [
    {
      key: 'c1', name: 'Size Block 1', goal: 'Up to 178 lbs', goalType: 'gain', targetBw: 178,
      startOffsetWeeks: -10, weeks: 6, weeksPerMeso: 1, useMicrocycles: false, deloadWeeks: [4],
      sessions: [
        { label: 'Push', exercises: [ex('Flat Press', '8', 3, 5, 70), ex('Incline Press', '10', 3, 4, 55), ex('Lateral Raise', '15', 3, 4, 10, { trackingMode: 'perSide' }), ex('Skull Crushers', '12', 3, 4, 25)] },
        { label: 'Pull', exercises: [ex('Lat Pulldown', '10', 3, 5, 65), ex('T-Bar Row', '8', 3, 5, 60), ex('Low Row', '12', 3, 4, 55), ex('Cable Curls', '12', 3, 4, 20)] },
        { label: 'Legs', exercises: [ex('Leg Press', '10', 3, 5, 180, { isHeavyLeg: true }), ex('RDL', '8', 3, 4, 90), ex('Leg Extension', '12', 3, 4, 60), ex('Calf Raises', '15', 3, 4, 80)] },
      ],
      goals: [{ fromWeek: 1, toWeek: 6, kcal: 3000, protein: 170, carbs: 380, fats: 85, steps: 8000 }],
      review: {
        complianceScore: 7, direction: 'gain',
        headline: 'A solid first block, with some gaps',
        narrative: 'Weight went up at a sensible rate and every main lift finished higher than it started.\n\nThe gaps were in the logging: a few missed sessions, and food and weigh-ins on about half the days, which makes the trend harder to read.',
        highlights: ['Bench up 12.5 kg', 'A lean, steady rate of gain'],
        improvements: ['Weigh in at least 4 days a week', 'Log food on training days at the least'],
        stickingPoints: 'Missed sessions around week 5.',
        bodyfatNote: 'Waist up a quarter inch for 3 lbs gained: mostly lean.',
      },
    },
    {
      key: 'c2', name: 'Size Block 2', goal: 'Up to 182 lbs', goalType: 'gain', targetBw: 182,
      startOffsetWeeks: -3, weeks: 6, weeksPerMeso: 1, useMicrocycles: false, deloadWeeks: [5],
      sessions: [
        { label: 'Push', exercises: [ex('Flat Press', '8', 3, 5, 80), ex('Incline Press', '10', 3, 4, 62.5), ex('Lateral Raise', '15', 3, 4, 12, { trackingMode: 'perSide' }), ex('Skull Crushers', '12', 3, 4, 30)] },
        { label: 'Pull', exercises: [ex('Lat Pulldown', '10', 3, 5, 72.5), ex('T-Bar Row', '8', 3, 5, 67.5), ex('Low Row', '12', 3, 4, 62.5), ex('Cable Curls', '12', 3, 4, 22.5)] },
        { label: 'Legs', exercises: [ex('Leg Press', '10', 3, 5, 200, { isHeavyLeg: true }), ex('RDL', '8', 3, 4, 100), ex('Leg Extension', '12', 3, 4, 67.5), ex('Calf Raises', '15', 3, 4, 90)] },
      ],
      goals: [{ fromWeek: 1, toWeek: 6, kcal: 3100, protein: 175, carbs: 395, fats: 88, steps: 8000 }],
    },
  ],
};

export const GRACE: DemoPersona = {
  key: 'grace', tz: 'Pacific/Auckland',
  profile: { gender: 'female', heightCm: 160, birthday: '1985-11-23' },
  weekdays: [0, 2, 4], historyWeeks: 10,
  startLbs: 149.6, lbsPerWeek: [0, -1.0, -0.9, -0.9, -0.6, -0.8, -0.7, -0.6, -0.5, 0.2, 0],
  startWaist: 32.5, startHip: 41, waistPerWeek: [0, -0.25, -0.25, 0, -0.25, -0.25, 0, -0.25, 0, 0],
  steps: { base: 9000, spread: 2400 }, weighInRate: 0.9, foodLogRate: 0.85, kcalBias: [30],
  skipRate: 0.05, missRate: 0.06,
  cycles: [
    {
      key: 'c1', name: 'Winter Cut', goal: 'Down to 142 lbs', goalType: 'loss', targetBw: 142,
      startOffsetWeeks: -9, weeks: 8, weeksPerMeso: 1, useMicrocycles: false, published: true, deloadWeeks: [5],
      sessions: [
        { label: 'Full Body A', exercises: [ex('Leg Press', '10', 3, 4, 80, { isHeavyLeg: true }), ex('Flat Press', '10', 3, 4, 27.5), ex('Lat Pulldown', '10', 3, 4, 35), ex('Calf Raises', '15', 2, 3, 35)] },
        { label: 'Full Body B', exercises: [ex('RDL', '10', 3, 4, 40), ex('Incline Press', '10', 3, 4, 22.5), ex('Machine Row', '12', 3, 4, 27.5), ex('Lateral Raise', '15', 2, 3, 4, { trackingMode: 'perSide' })] },
        { label: 'Full Body C', exercises: [ex('Split Squat', '10', 3, 4, 8, { trackingMode: 'perSide' }), ex('T-Bar Row', '10', 3, 4, 30), ex('Hamstring Curl', '12', 2, 3, 25), ex('Rope Curls', '12', 2, 3, 10)] },
      ],
      goals: [
        { fromWeek: 1, toWeek: 5, kcal: 1550, protein: 120, carbs: 145, fats: 52, steps: 9000 },
        { fromWeek: 6, toWeek: 8, kcal: 1500, protein: 120, carbs: 135, fats: 50, steps: 10000 },
      ],
      review: {
        complianceScore: 8, direction: 'loss',
        headline: 'Target reached a week early',
        narrative: 'You reached the target weight by week 7 and held it through the last week, with training steady throughout.\n\nThe next step is to hold this weight for a while and let the lifts climb at maintenance.',
        highlights: ['Target reached in week 7', 'Waist down 1¼ inches', 'Every session logged bar two'],
        improvements: ['Weekend food logging was patchy'],
        stickingPoints: 'A slow fortnight in weeks 4 and 5, which the deload settled.',
        bodyfatNote: 'Waist and scale moved together throughout.',
      },
    },
    {
      key: 'c2', name: 'Hold and Build', goal: 'Hold 142 lbs', goalType: 'maintenance', targetBw: 142,
      startOffsetWeeks: 0, weeks: 6, weeksPerMeso: 1, useMicrocycles: false, published: true,
      sessions: [
        { label: 'Full Body A', exercises: [ex('Leg Press', '10', 3, 4, 95, { isHeavyLeg: true }), ex('Flat Press', '10', 3, 4, 32.5), ex('Lat Pulldown', '10', 3, 4, 40), ex('Calf Raises', '15', 2, 3, 40)] },
        { label: 'Full Body B', exercises: [ex('RDL', '10', 3, 4, 47.5), ex('Incline Press', '10', 3, 4, 27.5), ex('Machine Row', '12', 3, 4, 32.5), ex('Lateral Raise', '15', 2, 3, 5, { trackingMode: 'perSide' })] },
        { label: 'Full Body C', exercises: [ex('Split Squat', '10', 3, 4, 10, { trackingMode: 'perSide' }), ex('T-Bar Row', '10', 3, 4, 35), ex('Hamstring Curl', '12', 2, 3, 30), ex('Rope Curls', '12', 2, 3, 12.5)] },
      ],
      goals: [{ fromWeek: 1, toWeek: 6, kcal: 1850, protein: 120, carbs: 205, fats: 60, steps: 9000 }],
    },
  ],
};

export const PRIYA: DemoPersona = {
  key: 'priya', tz: 'Europe/London',
  profile: { gender: 'female', heightCm: 168, birthday: '1999-05-08' },
  weekdays: [0, 1, 3, 4], historyWeeks: 6,
  startLbs: 146.8, lbsPerWeek: [0, -1.2, -1.0, -0.8, 0.1, -0.1, 0.1],
  startWaist: 29.5, startHip: 39, waistPerWeek: [0, -0.25, -0.25, 0, -0.25, -0.25, -0.25],
  steps: { base: 11000, spread: 2800 }, weighInRate: 0.95, foodLogRate: 0.9, kcalBias: [10],
  skipRate: 0.03, missRate: 0.05,
  cycles: [
    {
      key: 'c1', name: 'Six-Week Cut', goal: 'Down to 140 lbs', goalType: 'loss', targetBw: 140,
      startOffsetWeeks: -5, weeks: 6, weeksPerMeso: 1, useMicrocycles: true, published: true,
      sessions: [
        { label: 'Upper',
          exercises: [ex('Flat Press', '8', 3, 4, 30), ex('Lat Pulldown', '10', 3, 4, 37.5), ex('Lateral Raise', '15', 2, 3, 5, { trackingMode: 'perSide' }), ex('Push Downs', '12', 2, 3, 15)],
          exercisesB: [ex('Incline Press', '10', 3, 4, 25), ex('T-Bar Row', '10', 3, 4, 30), ex('Rope Curls', '12', 2, 3, 10), ex('Rope Extensions', '12', 2, 3, 12.5)] },
        { label: 'Lower',
          exercises: [ex('Leg Press', '10', 3, 4, 90, { isHeavyLeg: true }), ex('Hamstring Curl', '12', 3, 4, 27.5), ex('Calf Raises', '15', 2, 3, 40)],
          exercisesB: [ex('RDL', '10', 3, 4, 45), ex('Split Squat', '10', 3, 4, 10, { trackingMode: 'perSide' }), ex('Leg Extension', '12', 2, 3, 30)] },
      ],
      goals: [
        { fromWeek: 1, toWeek: 3, kcal: 1600, protein: 125, carbs: 155, fats: 52, steps: 11000 },
        { fromWeek: 4, toWeek: 6, kcal: 1550, protein: 130, carbs: 145, fats: 50, steps: 12000 },
      ],
    },
  ],
};

export const CASEY: DemoPersona = {
  key: 'casey', tz: 'Europe/London',
  profile: { gender: 'male', heightCm: 178, birthday: '1993-01-19' },
  weekdays: [0, 1, 3, 4], historyWeeks: 15,
  startLbs: 204.5, lbsPerWeek: [0, -1.4, -1.2, -1.0, -1.1, -0.9, -0.8, -0.6, -0.9, 0.3, 0.2, -1.3, -1.1, 0.2, -0.1, 0.1],
  startWaist: 37.5, startHip: 41.5, waistPerWeek: [0, -0.25, -0.25, 0, -0.25, 0, -0.25, 0, -0.25, 0, 0, -0.25, -0.25, 0, 0, 0],
  steps: { base: 8500, spread: 3000 }, weighInRate: 0.85, foodLogRate: 0.85,
  kcalBias: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 480, 520, 500],
  skipRate: 0.06, missRate: 0.08,
  cycles: [
    {
      key: 'c1', name: 'Spring Cut', goal: 'Down to 195 lbs', goalType: 'loss', targetBw: 195,
      startOffsetWeeks: -14, weeks: 8, weeksPerMeso: 1, useMicrocycles: false, published: true, deloadWeeks: [5],
      sessions: [
        { label: 'Upper A', exercises: [ex('Flat Press', '8', 3, 4, 70), ex('Lat Pulldown', '10', 3, 4, 60), ex('Machine Row', '10', 3, 4, 55), ex('Lateral Raise', '15', 2, 3, 10, { trackingMode: 'perSide' })] },
        { label: 'Lower A', exercises: [ex('Leg Press', '10', 3, 4, 170, { isHeavyLeg: true }), ex('RDL', '8', 3, 4, 90), ex('Hamstring Curl', '12', 2, 3, 45), ex('Calf Raises', '15', 2, 3, 70)] },
        { label: 'Upper B', exercises: [ex('Incline Press', '10', 3, 4, 55), ex('T-Bar Row', '8', 3, 4, 60), ex('Cable Curls', '12', 2, 3, 17.5), ex('Skull Crushers', '12', 2, 3, 25)] },
        { label: 'Lower B', exercises: [ex('Split Squat', '10', 3, 4, 16, { trackingMode: 'perSide' }), ex('Leg Extension', '12', 3, 4, 55), ex('Walking Lunge', '12', 2, 3, 14, { trackingMode: 'perSide' })] },
      ],
      goals: [
        { fromWeek: 1, toWeek: 4, kcal: 2200, protein: 190, carbs: 210, fats: 65, steps: 9000 },
        { fromWeek: 5, toWeek: 8, kcal: 2100, protein: 190, carbs: 195, fats: 62, steps: 10000 },
      ],
      review: {
        complianceScore: 8, direction: 'loss',
        headline: 'Big early drop, then a steady grind',
        narrative: 'Most of the loss came in the first three weeks, then it settled into a slower, steady pace.\n\nTraining held up well in a deficit, and the lifts finished above where they started.',
        highlights: ['8 lbs down', 'Flat press up 10 kg in a deficit'],
        improvements: ['Weekend calories ran over most weeks'],
        stickingPoints: 'Weekends.',
        bodyfatNote: 'Waist down 1¼ inches: the loss is mostly fat.',
      },
    },
    {
      key: 'c2', name: 'Summer Cut 2', goal: 'Down to 190 lbs', goalType: 'loss', targetBw: 190,
      startOffsetWeeks: -5, weeks: 8, weeksPerMeso: 1, useMicrocycles: false, published: true, deloadWeeks: [6],
      sessions: [
        { label: 'Upper A', exercises: [ex('Flat Press', '8', 3, 4, 80), ex('Lat Pulldown', '10', 3, 4, 67.5), ex('Machine Row', '10', 3, 4, 62.5), ex('Lateral Raise', '15', 2, 3, 12, { trackingMode: 'perSide' })] },
        { label: 'Lower A', exercises: [ex('Leg Press', '10', 3, 4, 190, { isHeavyLeg: true }), ex('RDL', '8', 3, 4, 100), ex('Hamstring Curl', '12', 2, 3, 50), ex('Calf Raises', '15', 2, 3, 80)] },
        { label: 'Upper B', exercises: [ex('Incline Press', '10', 3, 4, 62.5), ex('T-Bar Row', '8', 3, 4, 67.5), ex('Cable Curls', '12', 2, 3, 20), ex('Skull Crushers', '12', 2, 3, 30)] },
        { label: 'Lower B', exercises: [ex('Split Squat', '10', 3, 4, 18, { trackingMode: 'perSide' }), ex('Leg Extension', '12', 3, 4, 62.5), ex('Walking Lunge', '12', 2, 3, 16, { trackingMode: 'perSide' })] },
      ],
      goals: [
        { fromWeek: 1, toWeek: 4, kcal: 2100, protein: 190, carbs: 195, fats: 62, steps: 10000 },
        { fromWeek: 5, toWeek: 8, kcal: 2000, protein: 190, carbs: 180, fats: 60, steps: 10000 },
      ],
    },
  ],
};

/** The clients on the app: each has a BLOC state. */
export const DEMO_PERSONAS: DemoPersona[] = [MAYA, TOM, GRACE, PRIYA, CASEY];

/**
 * Eileen is NOT on the app: trained in person, Tuesdays and Fridays at 07:00.
 * Her simulated state is never uploaded. Coach's side turns its sessions into
 * the coach's `session_log` publications and her Tuesday weigh-ins into
 * `measurement` publications, which is all a client not on the app has.
 */
export const EILEEN: DemoPersona = {
  key: 'eileen', tz: 'Europe/London',
  profile: { gender: 'female', heightCm: 163, birthday: '1967-06-30' },
  weekdays: [1, 4], historyWeeks: 7,
  startLbs: 162.4, lbsPerWeek: [0, -0.3, -0.2, -0.3, 0, -0.2, -0.1, 0],
  startWaist: 34, startHip: 42, waistPerWeek: [0, 0, -0.25, 0, 0, -0.25, 0, 0],
  steps: { base: 7000, spread: 2000 }, weighInRate: 1, foodLogRate: 0, kcalBias: [0],
  skipRate: 0, missRate: 0.08,
  cycles: [
    {
      key: 'c1', name: 'Strength and Balance', goal: 'Stronger legs, steadier on the stairs', goalType: 'maintenance', targetBw: 160,
      startOffsetWeeks: -6, weeks: 10, weeksPerMeso: 1, useMicrocycles: false, published: true, deloadWeeks: [6],
      sessions: [
        { label: 'Session A', exercises: [ex('Leg Press', '12', 2, 3, 50, { isHeavyLeg: true }), ex('Lat Pulldown', '12', 2, 3, 25), ex('Split Squat', '10', 2, 3, 4, { trackingMode: 'perSide' }), ex('Calf Raises', '15', 2, 3, 20)] },
        { label: 'Session B', exercises: [ex('Leg Extension', '12', 2, 3, 20), ex('Machine Row', '12', 2, 3, 20), ex('Hamstring Curl', '12', 2, 3, 15), ex('Lateral Raise', '15', 2, 3, 2, { trackingMode: 'perSide' })] },
      ],
      goals: [],
    },
  ],
};
