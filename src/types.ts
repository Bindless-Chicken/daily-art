export type Challenge = {
  date: string;
  number: number;
  title: string;
  answer: Artwork;
  options: Array<Artwork>;
};

export type ChallengeIndex = {
  generatedAt: string;
  challenges: Challenge[];
};

export type Origin = {
  name: string;
  url: URL;
};

export type Artwork = {
  id: string;
  name: string;
  timespan: string;
  artist: string;
  material: string;
  dimensions: string;
  exhibitScript: string;
  tags: string[];
  imageUrl: string;
  origin: Origin;
};
