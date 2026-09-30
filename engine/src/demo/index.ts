// The demo clients (PROMPT-04): simulated BLOC states for BLOC Coach demos.
// Server build only (../server.ts); BLOC's bundle never carries it.
export { buildDemoState } from './sim.ts';
export type { DemoPersona, DemoCycle, DemoExercise, DemoGoal, DemoBuildOptions } from './sim.ts';
export { DEMO_PERSONAS, MAYA, TOM, GRACE, PRIYA, CASEY } from './personas.ts';
export { rng } from './rng.ts';
