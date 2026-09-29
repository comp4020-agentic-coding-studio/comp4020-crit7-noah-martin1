// Reference data: terms, funding bands and the seed catalogue. Figures are
// indicative sample data for the prototype, not ANU's published fees.

export type TermKey = `${number}-S${1 | 2}`;

export interface Term {
  key: TermKey;
  label: string;
  short: string;
  start: string;
  end: string;
  census: string;
}

export const TERMS: Record<string, Term> = {
  "2023-S2": { key: "2023-S2", label: "Semester 2 2023", short: "S2 2023", start: "2023-07-24", end: "2023-11-10", census: "2023-08-31" },
  "2024-S1": { key: "2024-S1", label: "Semester 1 2024", short: "S1 2024", start: "2024-02-19", end: "2024-06-14", census: "2024-03-31" },
  "2024-S2": { key: "2024-S2", label: "Semester 2 2024", short: "S2 2024", start: "2024-07-22", end: "2024-11-08", census: "2024-08-31" },
  "2025-S1": { key: "2025-S1", label: "Semester 1 2025", short: "S1 2025", start: "2025-02-17", end: "2025-06-13", census: "2025-03-31" },
  "2025-S2": { key: "2025-S2", label: "Semester 2 2025", short: "S2 2025", start: "2025-07-21", end: "2025-11-07", census: "2025-08-31" },
  "2026-S1": { key: "2026-S1", label: "Semester 1 2026", short: "S1 2026", start: "2026-02-23", end: "2026-06-12", census: "2026-03-31" },
  "2026-S2": { key: "2026-S2", label: "Semester 2 2026", short: "S2 2026", start: "2026-07-20", end: "2026-11-13", census: "2026-08-31" },
  "2027-S1": { key: "2027-S1", label: "Semester 1 2027", short: "S1 2027", start: "2027-02-22", end: "2027-06-11", census: "2027-03-31" },
  "2027-S2": { key: "2027-S2", label: "Semester 2 2027", short: "S2 2027", start: "2027-07-19", end: "2027-11-12", census: "2027-08-31" },
};

export const TERM_ORDER = Object.keys(TERMS);
export const CURRENT_TERM = "2026-S2";
export const PLANNING_TERM = "2027-S1";
export const ENROLABLE_TERMS = ["2027-S1", "2027-S2"];

export const MAX_FIRST_YEAR_UNITS = 60;
export const MIN_ADVANCED_UNITS = 36;
export const STANDARD_LOAD = 24;
export const SSAF_CENTS = 18_700;

export interface Band {
  band: number;
  label: string;
  areas: string;
  eftslCents: number;
}

// Student contribution for a full-time year (one EFTSL = 48 units).
export const BANDS: Record<number, Band> = {
  1: { band: 1, label: "Band 1", areas: "Mathematics, statistics, languages, education", eftslCents: 475_500 },
  2: { band: 2, label: "Band 2", areas: "Computing, engineering, science, health", eftslCents: 931_500 },
  3: { band: 3, label: "Band 3", areas: "Medicine, dentistry, veterinary science", eftslCents: 1_324_500 },
  4: { band: 4, label: "Band 4", areas: "Law, economics, commerce, humanities", eftslCents: 1_795_000 },
};

export function coursePriceCents(band: number, units: number): number {
  return Math.round(((BANDS[band]?.eftslCents ?? 0) * units) / 48);
}

export const GRADES = [
  { grade: "HD", label: "High Distinction", min: 80, points: 7 },
  { grade: "D", label: "Distinction", min: 70, points: 6 },
  { grade: "CR", label: "Credit", min: 60, points: 5 },
  { grade: "P", label: "Pass", min: 50, points: 4 },
  { grade: "N", label: "Fail", min: 0, points: 0 },
] as const;

export function gradeFor(mark: number) {
  return GRADES.find((g) => mark >= g.min) ?? GRADES[GRADES.length - 1];
}

type SeedCourse = [code: string, title: string, units: number, band: number, s1: boolean, s2: boolean, prereqs: string, convener: string, description: string];

export const SEED_COURSES: SeedCourse[] = [
  ["COMP1100", "Programming as Problem Solving", 6, 2, true, true, "", "Dr Priya Raman", "Functional programming in Haskell as a way of thinking about problems: types, recursion and abstraction."],
  ["COMP1110", "Structured Programming", 6, 2, true, true, "COMP1100", "Dr Tom Hartley", "Object-oriented design in Java: data structures, testing and the discipline of larger programs."],
  ["COMP1600", "Foundations of Computing", 6, 2, true, true, "", "Prof. Mei Lin", "Logic, proof, automata and the mathematical tools that underpin computer science."],
  ["COMP1710", "Web Development and Design", 6, 2, true, true, "", "Dr Sam Okafor", "HTML, CSS and JavaScript with a design sensibility — building for real people on real devices."],
  ["COMP1720", "Art and Interaction in New Media", 6, 2, true, false, "", "Dr Hana Ito", "Creative coding, generative art and interactive installations."],
  ["COMP1730", "Programming for Scientists", 6, 2, true, true, "", "Dr Ruth Adeyemi", "Python for scientific problem solving: data, simulation and visualisation."],
  ["MATH1005", "Discrete Mathematical Models", 6, 1, true, true, "", "Dr Oliver Grant", "Sets, graphs, combinatorics and recurrence relations for computing."],
  ["MATH1013", "Mathematics and Applications 1", 6, 1, true, true, "", "Dr Lucia Ferraro", "Calculus and linear algebra with applications across science."],
  ["MATH1014", "Mathematics and Applications 2", 6, 1, true, true, "MATH1013", "Dr Lucia Ferraro", "Multivariable calculus, differential equations and further linear algebra."],
  ["STAT1008", "Quantitative Research Methods", 6, 1, true, true, "", "Dr Ben Walsh", "Statistical thinking and data analysis for research."],
  ["ECON1101", "Microeconomics 1", 6, 4, true, true, "", "Dr Nadia Petrov", "How individuals and firms make decisions, and how markets allocate resources."],
  ["ECON1102", "Macroeconomics 1", 6, 4, true, true, "", "Dr Nadia Petrov", "Output, inflation, unemployment and the policy that shapes them."],
  ["ENGN1211", "Discovering Engineering", 6, 2, true, false, "", "Dr Karl Svensson", "Design thinking and systems engineering through hands-on team projects."],
  ["COMP2100", "Software Design Methodologies", 6, 2, true, true, "COMP1110", "Dr Tom Hartley", "Design patterns, software architecture and building maintainable systems."],
  ["COMP2120", "Software Engineering", 6, 2, true, false, "COMP2100", "Dr Emma Clarke", "Requirements, process, quality and working in software teams."],
  ["COMP2300", "Computer Organisation and Program Execution", 6, 2, true, true, "COMP1100", "Dr Jun Park", "How programs really run: assembly, memory and the hardware beneath."],
  ["COMP2310", "Systems, Networks and Concurrency", 6, 2, true, true, "COMP2300", "Dr Jun Park", "Concurrency, operating system services and network programming."],
  ["COMP2400", "Relational Databases", 6, 2, true, true, "COMP1100", "Dr Aisha Karim", "Relational modelling, SQL, normalisation and transactions."],
  ["COMP2550", "Advanced Computing R&D Methods", 6, 2, true, false, "COMP1110", "Prof. Mei Lin", "Research methods for computing: reading, framing and evaluating research."],
  ["COMP2560", "Studies in Advanced Computing R&D", 6, 2, true, true, "COMP2550", "Prof. Mei Lin", "A supervised research project that puts R&D methods into practice."],
  ["COMP2610", "Information Theory", 6, 2, true, true, "MATH1014", "Dr Ivan Novak", "Entropy, coding and inference — the mathematics of information."],
  ["COMP2620", "Logic", 6, 2, true, true, "COMP1600", "Dr Grace Liu", "Formal logic, proof systems and automated reasoning."],
  ["COMP2700", "Cyber Security Foundations", 6, 2, false, true, "COMP1110", "Dr Marcus Bell", "Threats, cryptography and building systems that resist attack."],
  ["COMP3120", "Managing Software Development", 6, 2, true, false, "COMP2120", "Dr Emma Clarke", "Leading software projects: estimation, risk and delivery."],
  ["COMP3300", "Operating Systems Implementation", 6, 2, true, false, "COMP2310", "Dr Jun Park", "Build the internals of an operating system kernel."],
  ["COMP3310", "Computer Networks", 6, 2, true, false, "COMP2310", "Dr Marcus Bell", "Protocols, the internet stack and network performance."],
  ["COMP3425", "Data Mining", 6, 2, true, false, "COMP2400", "Dr Aisha Karim", "Finding patterns in large data: clustering, association and classification."],
  ["COMP3430", "Data Wrangling", 6, 2, false, true, "COMP2400", "Dr Aisha Karim", "Cleaning, linking and preparing messy real-world data."],
  ["COMP3600", "Algorithms", 6, 2, false, true, "COMP2100, MATH1005", "Dr Ivan Novak", "Design and analysis of efficient algorithms and data structures."],
  ["COMP3620", "Artificial Intelligence", 6, 2, false, true, "COMP2100", "Dr Grace Liu", "Search, planning, knowledge representation and reasoning under uncertainty."],
  ["COMP3670", "Introduction to Machine Learning", 6, 2, false, true, "MATH1014", "Dr Sophie Tran", "Supervised and unsupervised learning from first principles."],
  ["COMP3900", "Human-Computer Interaction", 6, 2, false, true, "COMP1110", "Dr Hana Ito", "Designing and evaluating interactive systems with people at the centre."],
  ["COMP4020", "Agentic Coding Studio", 6, 2, false, true, "COMP2120", "Studio team", "A studio course on directing, grounding and correcting coding agents to ship real software."],
  ["COMP4550", "Computing Research Project", 12, 2, true, true, "COMP2560", "Research convenor", "A semester-long honours research project under academic supervision."],
  ["COMP4560", "Advanced Computing Project", 12, 2, true, true, "COMP2560", "Research convenor", "An advanced project with an industry or research partner."],
  ["COMP4600", "Advanced Algorithms", 6, 2, true, false, "COMP3600", "Dr Ivan Novak", "Randomised, approximation and online algorithms."],
  ["COMP4610", "Computer Graphics", 6, 2, false, true, "COMP2100", "Dr Hana Ito", "Rendering, geometry and the graphics pipeline."],
  ["COMP4620", "Advanced Topics in Artificial Intelligence", 6, 2, true, false, "COMP3620", "Dr Grace Liu", "Current research directions in AI, seminar style."],
  ["COMP4650", "Document Analysis", 6, 2, false, true, "COMP2100", "Dr Sophie Tran", "Information retrieval and natural language processing."],
  ["COMP4670", "Statistical Machine Learning", 6, 2, true, false, "COMP3670", "Dr Sophie Tran", "Probabilistic models, kernels and Bayesian learning."],
  ["COMP4680", "Advanced Topics in Machine Learning", 6, 2, true, false, "COMP3670", "Dr Sophie Tran", "Deep learning, generative models and learning theory."],
  ["COMP4691", "Optimisation", 6, 2, true, false, "MATH1014", "Dr Oliver Grant", "Linear, integer and convex optimisation for real decisions."],
  ["COMP4880", "Computational Methods for Network Science", 6, 2, false, true, "COMP2100", "Dr Ivan Novak", "Graphs, networks and the algorithms that analyse them."],
];

export const SEED_REQUIREMENTS = [
  { key: "core", title: "Computing foundations", description: "The compulsory spine of the degree: programming, systems and software design.", units: 42, codes: "COMP1100,COMP1110,COMP1600,COMP2100,COMP2120,COMP2300,COMP2310", minLevel: 1000 },
  { key: "maths", title: "Mathematics", description: "18 units of mathematics or statistics that computing builds on.", units: 18, codes: "MATH1005,MATH1013,MATH1014,STAT1008", minLevel: 1000 },
  { key: "rnd", title: "Advanced computing R&D", description: "The research-methods pathway unique to the Advanced Computing degree.", units: 12, codes: "COMP2550,COMP2560", minLevel: 1000 },
  { key: "major", title: "Intelligent Systems major", description: "48 units that make up your major in AI, machine learning and data.", units: 48, codes: "COMP2610,COMP3425,COMP3430,COMP3600,COMP3620,COMP3670,COMP4620,COMP4650,COMP4670,COMP4680,COMP4691", minLevel: 1000 },
  { key: "honours", title: "Honours: advanced study", description: "24 units of 4000-level work, including your research project.", units: 24, codes: "COMP4020,COMP4550,COMP4560,COMP4600,COMP4610,COMP4880", minLevel: 4000 },
  { key: "electives", title: "Electives", description: "48 units of your choice — from computing or anywhere across ANU.", units: 48, codes: "", minLevel: 1000 },
];

// [term, code, mark]; null mark = enrolled this term
export const SEED_HISTORY: [string, string, number | null][] = [
  ["2023-S2", "COMP1100", 82], ["2023-S2", "MATH1013", 71], ["2023-S2", "COMP1710", 88], ["2023-S2", "ECON1101", 64],
  ["2024-S1", "COMP1110", 78], ["2024-S1", "MATH1014", 68], ["2024-S1", "COMP1600", 74], ["2024-S1", "COMP1720", 91],
  ["2024-S2", "COMP2100", 76], ["2024-S2", "COMP2300", 69], ["2024-S2", "MATH1005", 81],
  ["2025-S1", "COMP2120", 72], ["2025-S1", "COMP2310", 66], ["2025-S1", "COMP2400", 85], ["2025-S1", "COMP2550", 80],
  ["2025-S2", "COMP2620", 58], ["2025-S2", "COMP3600", 71], ["2025-S2", "COMP3620", 84],
  ["2026-S1", "COMP2610", 63], ["2026-S1", "COMP3425", 77], ["2026-S1", "COMP3120", 79], ["2026-S1", "COMP3310", 70],
  ["2026-S2", "COMP4020", null], ["2026-S2", "COMP3670", null], ["2026-S2", "COMP4650", null], ["2026-S2", "COMP3900", null],
];
