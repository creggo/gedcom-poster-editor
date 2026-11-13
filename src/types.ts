export type Ev = { date: string | null; place: string | null } | null;
export interface Person {
  id: string; given: string; surname: string; suffix: string; sex: string | null;
  living: boolean; sort: string; birth: Ev; death: Ev; children: string[]; spouses: string[]; photo?: string; files?: string[];
}
export interface Tree { people: Record<string, Person>; parents: Record<string, [string | null, string | null]>; }
export interface Options { root: string; gens: number; siblings: boolean; relatives: boolean; title: string; hideLiving: boolean; card: CardStyle; design: Design;
  theme: Theme; border: Border; age: Age; curve: number;
  /** Heritage tree texture, in percent: how many leaves and twigs, how big the leaves are, how thick the wood is. */
  leaves: number; twigs: number; leafSize: number; wood: number;
  /** How much the roots wind and twist, in percent (100 = standard). */
  wind: number;
  /** Size of every person's picture and text, in percent. */
  nodeScale: number;
  /** Size of the whole tree inside the canvas, in percent (above 100 the tree grows toward the frame). */
  treeScale: number;
  /** Heritage tree: space between generations, in percent of the original spacing (100 = the wide original, 50 = half as far apart). */
  genGap: number;
  /** Heritage tree arrangement: 0 = even rings, any other number = an organic scatter generated from that seed. */
  organic: number;
  /** The sheet (mm) the poster will be printed on. The drawing's canvas is stretched to the same shape, so the background, frame and ageing fill it edge to edge. */
  fit?: { w: number; h: number };
  /** Heritage tree: draw the twigs and leaves on screen? Off keeps the page light; export, print and orders always draw everything. */
  detail?: boolean; }
export type CardStyle = 'full' | 'compact' | 'mini' | 'leaf';
// classic: generations as columns, father's line left, mother's right. classic-up / tree: generations as rows, ancestors rising from the root at the bottom.
export type Design = 'classic' | 'classic-up' | 'tree';

export type Border = 'none' | 'thin' | 'double' | 'ornate';
/** The colours a person can change. Everything else (bark shades, leaf variety, ring tints) is derived from these. */
export interface Theme { name: string; bgTop: string; bgBottom: string; trunk: string; twig: string; leaf1: string; leaf2: string; ink: string; accent: string; frame: string; }
/** The "old paper" look. amount 0 = off. Each effect can be switched on its own. */
export interface Age { amount: number; paper: boolean; stains: boolean; creases: boolean; vignette: boolean; grain: boolean; sepia: boolean; photos: boolean; }
